const elements = {
  deviceName: document.getElementById('device-name'),
  version: document.getElementById('version'),
  serverStatus: document.getElementById('server-status'),
  marketplaceLabel: document.getElementById('marketplace-label'),
  authStatus: document.getElementById('auth-status'),
  waitingCount: document.getElementById('waiting-count'),
  processedCount: document.getElementById('processed-count'),
  failedCount: document.getElementById('failed-count'),
  currentItem: document.getElementById('current-item'),
  currentStage: document.getElementById('current-stage'),
  lastError: document.getElementById('last-error'),
  diagnosticCard: document.getElementById('diagnostic-card'),
  diagnostic: document.getElementById('diagnostic'),
  copyDiagnostic: document.getElementById('copy-diagnostic'),
  reload: document.getElementById('reload'),
  batchSize: document.getElementById('batch-size'),
  start: document.getElementById('start'),
  continue: document.getElementById('continue'),
  stop: document.getElementById('stop'),
  test: document.getElementById('test'),
  testShopee: document.getElementById('test-shopee'),
  openMl: document.getElementById('open-ml'),
  openShopee: document.getElementById('open-shopee'),
  options: document.getElementById('options')
};

const STAGE_LABELS = {
  idle: 'Aguardando',
  starting: 'Iniciando fila',
  stopped: 'Interrompido',
  interrupted: 'Execução interrompida pelo navegador',
  mercado_livre_processing: 'Gerando no Mercado Livre',
  shopee_opening: 'Abrindo portal Shopee',
  shopee_opening_converter: 'Abrindo Link personalizado',
  shopee_waiting_converter: 'Carregando formulário Shopee',
  shopee_ready: 'Gerador Shopee pronto',
  shopee_generating: 'Gerando link Shopee',
  shopee_link_generated: 'Link Shopee gerado',
  shopee_generation_failed: 'Falha ao gerar na Shopee',
  shopee_blocked: 'Automação Shopee bloqueada'
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
  elements.version.textContent = `v${chrome.runtime.getManifest().version}`;
  elements.deviceName.textContent = settings.deviceName || 'Dispositivo local';
  elements.batchSize.value = String(settings.batchSize || 10);
  elements.serverStatus.textContent = response.serverStatus?.enabled
    ? 'Conectado'
    : response.error || 'Desconectado';
  elements.serverStatus.className = response.serverStatus?.enabled
    ? 'ok'
    : 'error';
  elements.marketplaceLabel.textContent = state.currentItem?.platform === 'shopee'
    ? 'Shopee'
    : state.currentItem?.platform === 'mercado_livre'
      ? 'Mercado Livre'
      : 'Marketplace';
  elements.authStatus.textContent = state.authRequired
    ? 'Ação necessária'
    : state.status === 'processing'
      ? 'Processando'
      : 'Sessão local';
  elements.waitingCount.textContent =
    response.serverStatus?.queue?.awaiting ?? state.waitingCount ?? 0;
  elements.processedCount.textContent = state.processedCount || 0;
  elements.failedCount.textContent = state.failedCount || 0;
  elements.currentItem.textContent = state.currentItem?.title || 'Nenhum';
  elements.currentStage.textContent = STAGE_LABELS[state.stage] ||
    state.stage || 'Aguardando';
  elements.lastError.textContent = state.lastError || '';
  const diagnostic = state.lastDiagnostic || null;
  elements.diagnosticCard.hidden = !diagnostic;
  elements.diagnostic.textContent = diagnostic
    ? JSON.stringify(diagnostic, null, 2)
    : '';
  elements.continue.hidden = !state.authRequired;
  elements.start.hidden = state.authRequired;
  elements.start.disabled = state.status === 'processing';
}

async function runAction(button, type) {
  button.disabled = true;
  try {
    const response = await send(type);
    if (!response?.success) {
      elements.lastError.textContent = response?.error || 'Falha na operação.';
    }
    await refresh();
  } catch (error) {
    elements.lastError.textContent = error.message || 'Falha na operação.';
  } finally {
    button.disabled = false;
  }
}

elements.batchSize.addEventListener('change', () => {
  chrome.storage.local.set({ batchSize: Number(elements.batchSize.value) });
});
elements.reload.addEventListener('click', async () => {
  elements.reload.disabled = true;
  await refresh();
  elements.reload.disabled = false;
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
elements.testShopee.addEventListener('click', () =>
  runAction(elements.testShopee, 'TEST_SHOPEE')
);
elements.openMl.addEventListener('click', () =>
  runAction(elements.openMl, 'OPEN_MERCADO_LIVRE')
);
elements.openShopee.addEventListener('click', () =>
  runAction(elements.openShopee, 'OPEN_SHOPEE')
);
elements.options.addEventListener('click', () =>
  chrome.runtime.openOptionsPage()
);
elements.copyDiagnostic.addEventListener('click', async () => {
  await navigator.clipboard.writeText(elements.diagnostic.textContent || '');
  elements.copyDiagnostic.textContent = 'Copiado';
  setTimeout(() => { elements.copyDiagnostic.textContent = 'Copiar diagnóstico'; }, 1200);
});

refresh();
setInterval(refresh, 1500);
