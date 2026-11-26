/*
 * Universe Graph Storage Interface.
 *
 * The renderer keeps its existing synchronous Stage-1 contract. The only
 * persistence calls it can see are the methods below; physical storage lives
 * in the Electron main process and is backed by SQLite.
 *
 * Existing Stage-1 localStorage is read once as a migration source, then the
 * value is copied to SQLite. No renderer module needs to know this happened.
 *
 * Without the desktop bridge (index.html opened in a browser tab) the same API
 * is served from localStorage + IndexedDB — see "Browser mode" below.
 */
(function () {
  'use strict';
  const bridge = window.universeDesktop?.storage || null;
  // 0.30.3: a player's browser (the game link) keeps the Master's world only in memory; settings stay in the browser
  const player = !bridge && !!window.UG_ONLINE_PLAYER;
  const memItems = new Map();
  const settingsStore = window.localStorage;
  const legacy = player ? { getItem: k => (memItems.has(String(k)) ? memItems.get(String(k)) : null), setItem: (k, v) => { memItems.set(String(k), String(v)); }, removeItem: k => { memItems.delete(String(k)); } } : window.localStorage;
  const backend = bridge ? 'sqlite' : 'legacy-local';
  if (!bridge) console.warn('[Universe Graph] Desktop Storage bridge unavailable; using localStorage compatibility fallback.');

  const migrated = new Set();
  // true when the last read of a key FAILED (storage error), as opposed to the
  // key simply not existing. The renderer must not replace a world it could not read.
  let lastReadFailed = false;
  const MIGRATION_MARKER = 'universe-graph-storage-legacy-migrated-v1';
  let legacyMigrationDisabled = bridge ? bridge.getSetting(MIGRATION_MARKER) === '1' : false;
  function ensureMigrated(key) {
    const k = String(key);
    if (!bridge) return legacy.getItem(k);
    let current = null;
    lastReadFailed = false;
    try {
      const result = bridge.getItemResult ? bridge.getItemResult(k) : { ok: true, value: bridge.getItem(k) };
      if (!result?.ok) { lastReadFailed = true; return null; }
      current = result.value ?? null;
    } catch {
      lastReadFailed = true;
      return null;
    }
    if (current !== null || legacyMigrationDisabled) return current;
    if (!migrated.has(k)) {
      const legacyValue = legacy.getItem(k);
      if (legacyValue !== null) {
        try {
          if (bridge.setItem(k, legacyValue) === false) return null;
        } catch {
          return null;
        }
        migrated.add(k);
        return legacyValue;
      }
      migrated.add(k);
    }
    return null;
  }


  // ---------------------------------------------------------------------------
  // Browser mode (index.html opened in a tab, no desktop bridge), 0.16.
  // The world document stays in localStorage: its writes are synchronous, so an
  // edit made right before the tab is closed is not lost. Images and a rolling
  // history of the world (last VERSIONS_KEEP copies) live in IndexedDB, which has
  // a far larger quota. Both are loaded into memory before the app starts
  // (UniverseGraphStorage.ready), so the rest of the app keeps its synchronous API.
  const WORLD_KEY = 'universe-graph-v5', VERSIONS_KEEP = 20;
  const memMedia = new Map(); let versions = []; let idb = null; let versionTimer = 0;
  const channel = (!bridge && !player && typeof BroadcastChannel === 'function') ? new BroadcastChannel('universe-graph') : null;
  const reportError = message => { try { window.dispatchEvent(new CustomEvent('ug-storage-error', { detail: message })); } catch {} };
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const store = (name, mode = 'readonly') => idb.transaction(name, mode).objectStore(name);
  async function openIdb() {
    const open = indexedDB.open('universe-graph', 1);
    open.onupgradeneeded = () => { const db = open.result; db.createObjectStore('media', { keyPath: 'id' }); db.createObjectStore('versions', { keyPath: 'id', autoIncrement: true }); };
    idb = await req(open);
    for (const m of await req(store('media').getAll())) memMedia.set(m.id, m);
    versions = (await req(store('versions').getAll())).sort((a, b) => a.id - b.id);
  }
  const ready = bridge || player ? Promise.resolve() : (typeof indexedDB === 'undefined' ? Promise.resolve() : openIdb().catch(error => { idb = null; console.warn('[Universe Graph] IndexedDB unavailable; images and history are disabled in this tab.', error); }));
  function idbWrite(name, op, value) {
    if (!idb) return Promise.resolve(false);
    return req(op === 'delete' ? store(name, 'readwrite').delete(value) : store(name, 'readwrite').put(value)).then(() => true).catch(error => { reportError(`Не удалось записать в хранилище браузера: ${error?.name || error}`); return false; });
  }
  // The same world without camera state and timestamps — a new history entry is
  // made only when this changes.
  const semantic = text => { try { const d = JSON.parse(text); for (const ws of d.workspaces || []) { delete ws.view; delete ws.updatedAt; } if (d.metadata) delete d.metadata.updatedAt; return JSON.stringify(d); } catch { return null; } };
  function scheduleVersion(text, delay = 3000) {
    if (!idb) return Promise.resolve(); clearTimeout(versionTimer);
    return new Promise(done => { versionTimer = setTimeout(async () => { try {
      const sem = semantic(text); if (sem === null) return;
      const last = versions.at(-1); if (last && semantic(last.value) === sem) return;
      const entry = { value: text, createdAt: new Date().toISOString() };
      try { entry.id = await req(store('versions', 'readwrite').add(entry)); versions.push(entry); } catch (error) { reportError(`История версий не записана: ${error?.name || error}`); return; }
      while (versions.length > VERSIONS_KEEP) { const old = versions.shift(); idbWrite('versions', 'delete', old.id); }
    } finally { done(); } }, delay); });
  }
  if (channel) channel.onmessage = async ({ data }) => {
    // Another tab added or removed an image: refresh our in-memory copy.
    if (data?.type !== 'media' || !idb) return;
    if (data.op === 'delete') memMedia.delete(data.id);
    else { const m = await req(store('media').get(data.id)).catch(() => null); if (m) memMedia.set(m.id, m); }
    window.dispatchEvent(new CustomEvent('ug-media-changed', { detail: data.id }));
  };
  function browserMediaPut(p = {}) {
    if (!idb && !player) throw new Error('Хранилище изображений браузера недоступно (IndexedDB отключён). Картинки работают в настольной версии.');
    const id = String(p.id || ''), mime = String(p.mime || '').toLowerCase(), data = String(p.data || '');
    if (!id || !data) throw new Error('Media id and data are required');
    if (!/^image\/(png|jpe?g|webp|gif|avif|bmp|svg\+xml|x-icon)$/.test(mime)) throw new Error('Unsupported image MIME type');
    const size = Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0); if (size > 8 * 1024 * 1024) throw new Error('Image exceeds 8 MB processed limit');
    const rec = { id, mime, data, size, filename: String(p.filename || ''), width: Number(p.width) || 0, height: Number(p.height) || 0, metadata: p.metadata || {}, workspaceId: p.workspaceId || null, entityId: p.entityId || null };
    memMedia.set(id, rec); idbWrite('media', 'put', rec).then(ok => ok && channel?.postMessage({ type: 'media', op: 'put', id }));
    return { ok: true, media: { id, filename: rec.filename, mime, width: rec.width, height: rec.height, size } };
  }
  window.UniverseGraphStorage = Object.freeze({
    backend,
    ready,
    // true when images can be stored (desktop database, or IndexedDB in a browser tab)
    get mediaAvailable() { return !!bridge || !!idb || player; },
    getItem(key) { return ensureMigrated(String(key)); },
    get lastReadFailed() { return lastReadFailed; },
    // Returns true only when the write is durable (the bridge confirms the SQLite commit).
    setItem(key, value) { if (bridge) return bridge.setItem(String(key), String(value)) === true; try { legacy.setItem(String(key), String(value)); if (String(key) === WORLD_KEY) scheduleVersion(String(value)); return true; } catch { return false; } },
    removeItem(key) { if (bridge) bridge.removeItem(String(key)); else legacy.removeItem(String(key)); },
    getSetting(key) { return bridge ? bridge.getSetting(String(key)) : settingsStore.getItem(String(key)); },
    setSetting(key, value) { return bridge ? bridge.setSetting(String(key), String(value)) : settingsStore.setItem(String(key), String(value)); },
    deleteSetting(key) { if (bridge) bridge.deleteSetting(String(key)); else settingsStore.removeItem(String(key)); },
    listVersions(key, limit) { return bridge ? bridge.listVersions(key, limit) : versions.slice(-(Number(limit) || 20)).reverse().map(v => ({ id: v.id, createdAt: v.createdAt })); },
    restoreVersion(id) { if (bridge) return bridge.restoreVersion(id); const v = versions.find(x => x.id === Number(id)); if (!v) return false; legacy.setItem(WORLD_KEY, v.value); return true; },
    // Newest retained copy of the world (browser mode); the desktop database recovers on its own.
    // Browser mode: store the current world in the history right now (before reset/import).
    snapshotNow() { if (bridge) return Promise.resolve(); const t = legacy.getItem(WORLD_KEY); return t ? scheduleVersion(t, 0) : Promise.resolve(); },
    latestVersionText() { return bridge ? null : (versions.at(-1)?.value ?? null); },
    backup(destination, reason) { if (!bridge) throw new Error('Desktop SQLite Storage недоступно в режиме совместимости'); return bridge.backup(destination, reason); },
    backupToFile(destination) { if (!bridge) throw new Error('Desktop SQLite Storage недоступно в режиме совместимости'); return bridge.backupToFile(destination); },
    restoreBackup(source) { if (!bridge) throw new Error('Desktop SQLite Storage недоступно в режиме совместимости'); return bridge.restoreBackup(source); },
    listBackups(limit) { return bridge ? bridge.listBackups(limit) : []; },
    verifyBackup(source) { if (!bridge) throw new Error('Desktop SQLite Storage недоступно в режиме совместимости'); return bridge.verifyBackup(source); },
    health() { return bridge ? bridge.health() : { ok:true, backend:'legacy-local', documentPresent:legacy.getItem('universe-graph-v5')!==null }; },
    schemaInfo() { return bridge ? bridge.schemaInfo() : { version:0, backend:'legacy-local' }; },
    listWorkspaces() { return bridge ? bridge.listWorkspaces() : []; },
    getProject(id) { return bridge ? bridge.getProject(id) : null; },
    mediaPut(payload) { const result=bridge ? bridge.mediaPut(payload) : browserMediaPut(payload);if(result?.ok&&typeof udNetMarkMediaChanged==='function')udNetMarkMediaChanged(payload.id);return result; },
    mediaGet(id) { return bridge ? bridge.mediaGet(id) : (memMedia.get(String(id || '')) || null); },
    mediaInfo(ids) { return bridge?.mediaInfo ? bridge.mediaInfo(ids) : null; },
    mediaList(ids) { return bridge ? bridge.mediaList(ids) : (Array.isArray(ids) ? ids : []).map(i => memMedia.get(String(i))).filter(Boolean); },
    mediaDelete(id) { if (bridge) {const had=bridge.mediaDelete(id);if(had&&typeof udNetMarkMediaChanged==='function')udNetMarkMediaChanged(id);return had} const k = String(id || ''); const had = memMedia.delete(k); if (had) idbWrite('media', 'delete', k).then(ok => ok && channel?.postMessage({ type: 'media', op: 'delete', id: k })); return had; },
    mediaHealth() { if (bridge) return bridge.mediaHealth(); let bytes = 0; for (const m of memMedia.values()) bytes += m.size || 0; return { count: memMedia.size, bytes }; },
  });
})();

