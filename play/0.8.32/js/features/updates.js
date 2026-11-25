'use strict';

let udUpdateLocked = false;
function udPrepareForUpdate() {
  document.querySelector('.udUpdates[open]')?.close();
  if (!appBooted || persistenceLocked) return 'Сохранение недоступно. Обновление отложено.';
  if (onpActive() || viewAsPlayer()) return 'Вернитесь к своему миру в режиме Мастера.';
  if (state.boardDrag || state.selectionBox || linkDrag || mapDrag || secDrag || articleDrag) return 'Завершите перетаскивание и повторите установку.';
  if (articleIsOpen() || $('#modalBack')?.classList.contains('open') ||
      udDescriptionDraft || boardUI.open || udSetState) {
    return 'Закончите редактирование и закройте открытые панели перед установкой.';
  }
  udUpdateLocked = true;
  document.body.inert = true;
  if (!persist()) {
    udCancelUpdatePreparation();
    return 'Мир не сохранился. Установка отложена.';
  }
  return true;
}

function udCancelUpdatePreparation() {
  if (!udUpdateLocked) return;
  udUpdateLocked = false;
  document.body.inert = false;
}

function udInitUpdates() {
  const api = window.universeDesktop?.updates;
  if (!api) return;
  const menu = $('#udMenu');
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'udMenuItem';
  item.textContent = 'Обновления';
  menu.append(item);

  const panel = document.createElement('dialog');
  panel.className = 'udUpdates';
  panel.setAttribute('aria-labelledby', 'udUpdatesTitle');
  panel.innerHTML = `
    <h2 id="udUpdatesTitle">Обновления</h2>
    <p data-version></p>
    <p data-status role="status"></p>
    <p data-checked></p>
    <progress max="100" hidden aria-label="Загрузка обновления"></progress>
    <p data-notes></p>
    <label><input type="checkbox" data-auto-check> Проверять автоматически</label>
    <label><input type="checkbox" data-auto-download> Скачивать в фоне</label>
    <div class="udUpdateActions">
      <button type="button" data-action="check">Проверить сейчас</button>
      <button type="button" data-action="download">Скачать</button>
      <button type="button" data-action="cancel">Отменить загрузку</button>
      <button type="button" data-action="install">Сохранить и перезапустить</button>
      <button type="button" data-action="arm">При завершении работы</button>
      <button type="button" data-action="dismiss">Прочитано</button>
      <button type="button" data-action="close">Закрыть</button>
    </div>`;
  document.body.append(panel);
  const el = selector => panel.querySelector(selector);
  const button = name => el(`[data-action="${name}"]`);
  let latest, announced = false;
  const descriptions = {
    idle: 'Проверка ещё не выполнена.', checking: 'Ищем обновление…',
    current: 'Установлена актуальная версия.', available: 'Доступно обновление.',
    downloading: 'Скачиваем обновление…', ready: 'Обновление скачано и проверено.',
    installing: 'Подготовка к установке…', error: 'Не удалось получить обновление.'
  };
  function render(info) {
    if (!info) return;
    latest = info;
    if (!announced && info.installedNotes) {
      announced = true;
      toast(`Установлена версия ${info.version}. Что нового — в меню «Файл → Обновления».`, 'ok');
    }
    const { phase, progress, available, armed, checkedAt, message, installedNotes, previousAttempt, notes, preferences, version } = info;
    item.textContent = phase === 'ready' ? 'Обновление готово •' : installedNotes ? 'Обновления •' : 'Обновления';
    el('[data-version]').textContent = available ? `Версия ${version} → ${available}` : `Версия ${version}`;
    el('[data-status]').textContent = message || (armed ? 'Установим при завершении работы.' : descriptions[phase] || '');
    el('[data-checked]').textContent = checkedAt ? `Последняя проверка: ${new Date(checkedAt).toLocaleString('ru-RU')}` : '';
    el('[data-notes]').textContent = installedNotes ? `Что нового в версии ${version}\n${installedNotes}` : [previousAttempt, notes].filter(Boolean).join('\n');
    el('progress').hidden = phase !== 'downloading';
    el('progress').value = progress;
    el('[data-auto-check]').checked = preferences.autoCheck;
    el('[data-auto-download]').checked = preferences.autoDownload;
    for (const input of panel.querySelectorAll('input')) input.disabled = phase === 'disabled';
    button('check').hidden = armed || ['disabled', 'checking', 'downloading', 'installing'].includes(phase);
    button('download').hidden = !available || !['available', 'error'].includes(phase);
    button('cancel').hidden = phase !== 'downloading';
    button('install').hidden = button('arm').hidden = phase !== 'ready';
    button('arm').textContent = armed ? 'Отменить установку при выходе' : 'При завершении работы';
    button('dismiss').hidden = !installedNotes;
  }
  const send = (action, value) => api.action(action, value).then(render).catch(() => {
    el('[data-status]').textContent = 'Не удалось получить состояние обновления.';
  });
  item.onclick = () => { if (!panel.open) panel.showModal(); void send('status'); };
  panel.onclick = event => {
    const action = event.target.closest('button')?.dataset.action;
    if (action === 'close') panel.close();
    else if (action === 'arm') {
      void send(action, !latest?.armed);
    } else if (action === 'install') {
      panel.close();
      void send(action).then(() => { if (!udUpdateLocked && latest?.phase === 'ready' && !panel.open) panel.showModal(); });
    } else if (action) void send(action);
  };
  panel.onchange = () => void send('preferences', {
    autoCheck: el('[data-auto-check]').checked,
    autoDownload: el('[data-auto-download]').checked
  });
  api.onStatus(info => {
    const wasReady = latest?.phase === 'ready';
    render(info);
    if (!wasReady && info.phase === 'ready') toast('Обновление скачано. Откройте «Файл → Обновления».', 'ok');
  });
  void send('status');
}
