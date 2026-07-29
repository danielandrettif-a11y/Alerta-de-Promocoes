const elements = {
  deviceName: document.getElementById('device-name'),
  serverStatus: document.getElementById('server-status'),
  authStatus: document.getElementById('auth-status'),
  waitingCount: document.getElementById('waiting-count'),
  processedCount: document.getElementById('processed-count'),
  failedCount: document.getElementById('failed-count'),
  currentItem: document.getElementById('current-item'),
  lastError: document.getElementById('last-error'),
  batchSize: document.getElementById('batch-size'),
  start: document.getElementById('start'),
  continue: document.getElementById('continue'),
  stop: document.getElementById('stop'),
  test: document.getElementById('test'),
  openMl: document.getElementById('open-ml'),
  options: document.getElementById('options')
};

function send(type) {
  return chrome.runtime.sendMessage({ type });
}

async function refresh() {
  const response = await send('GET_STATE').catch(error => ({
    error: error.message
  }));
  const state = response.state || {};
  const settings = response.settings || {};
  elements.deviceName.textContent = settings.deviceName || 'Dispositivo local';
  elements.batchSize.value = String(settings.batchSize || 10);
  elements.serverStatus.textContent = response.serverStatus?.enabled
    ? 'Conectado'
    : response.error || 'Desconectado';
  elements.serverStatus.className = response.serverStatus?.enabled
    ? 'ok'
    : 'error';
  elements.authStatus.textContent = state.authRequired
    ? 'Autenticação necessária'
    : state.status === 'processing'
      ? 'Processando'
      : 'Sessão local';
  elements.waitingCount.textContent =
    response.serverStatus?.queue?.awaiting ?? state.waitingCount ?? 0;
  elements.processedCount.textContent = state.processedCount || 0;
  elements.failedCount.textContent = state.failedCount || 0;
  elements.currentItem.textContent = state.currentItem?.title || 'Nenhum';
  elements.lastError.textContent = state.authRequired
    ? 'Conclua o login na aba aberta e depois clique em “Continuar”.'
    : state.lastError || '';
  elements.continue.hidden = !state.authRequired;
  elements.start.hidden = state.authRequired;
  elements.start.disabled = state.status === 'processing';
}

async function runAction(button, type) {
  button.disabled = true;
  const response = await send(type);
  if (!response?.success) {
    elements.lastError.textContent = response?.error || 'Falha na operação.';
  }
  await refresh();
  button.disabled = false;
}

elements.batchSize.addEventListener('change', () => {
  chrome.storage.local.set({ batchSize: Number(elements.batchSize.value) });
});
elements.start.addEventListener('click', () =>
  runAction(elements.start, 'START_PROCESSING')
);
elements.continue.addEventListener('click', () =>
  runAction(elements.continue, 'CONTINUE_PROCESSING')
);
elements.stop.addEventListener('click', () =>
  runAction(elements.stop, 'STOP_PROCESSING')
);
elements.test.addEventListener('click', () =>
  runAction(elements.test, 'TEST_CONNECTION')
);
elements.openMl.addEventListener('click', () =>
  runAction(elements.openMl, 'OPEN_MERCADO_LIVRE')
);
elements.options.addEventListener('click', () =>
  chrome.runtime.openOptionsPage()
);

refresh();
setInterval(refresh, 1500);
