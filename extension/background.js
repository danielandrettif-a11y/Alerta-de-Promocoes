const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const SHOPEE_CONVERTER_URL =
  'https://affiliate.shopee.com.br/offer/custom_link';
const WORKER_WINDOW_KEY = 'affiliateWorkerWindowId';
const DEFAULTS = {
  serverUrl: '',
  token: '',
  deviceId: '',
  deviceName: 'PC de casa',
  batchSize: 10,
  pageTimeoutMs: 45000,
  actionTimeoutMs: 60000,
  intervalMs: 1000
};

let stopRequested = false;
let processingPromise = null;
let activeWorkerWindowId = null;
let runGeneration = 0;
const pendingCancellations = new Set();
let workerState = {
  status: 'idle',
  processedCount: 0,
  failedCount: 0,
  currentItem: null,
  lastError: null,
  authRequired: false,
  waitingCount: 0,
  stage: 'idle',
  stageStartedAt: null,
  lastDiagnostic: null,
  diagnosticEvents: []
};

const SHOPEE_BLOCKING_CODES = new Set([
  'SHOPEE_PORTAL_NOT_READY',
  'SHOPEE_CONVERTER_NOT_REACHED',
  'SHOPEE_MENU_NOT_FOUND',
  'SHOPEE_INPUT_NOT_FOUND',
  'SHOPEE_GENERATE_BUTTON_NOT_FOUND'
]);

const USER_ACTION_CODES = new Set([
  'AUTH_REQUIRED',
  'SHOPEE_ACCOUNT_ACTION_REQUIRED'
]);

async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const settings = { ...DEFAULTS, ...stored };
  if (!settings.deviceId) {
    settings.deviceId = crypto.randomUUID();
    await chrome.storage.local.set({ deviceId: settings.deviceId });
  }
  return settings;
}

function normalizeServerUrl(rawValue) {
  const parsed = new URL(String(rawValue || '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('O servidor deve usar HTTP ou HTTPS.');
  }
  return parsed.origin;
}

async function apiRequest(path, options = {}) {
  const settings = await loadSettings();
  if (!settings.serverUrl || !settings.token) {
    throw new Error('Configure o servidor e o token nas opções.');
  }
  const response = await fetch(
    `${normalizeServerUrl(settings.serverUrl)}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Servidor respondeu HTTP ${response.status}.`);
  }
  return data;
}

async function persistState(patch = {}) {
  workerState = { ...workerState, ...patch };
  await chrome.storage.local.set({ workerRuntime: workerState });
  return workerState;
}

async function heartbeat(status = workerState.status, extra = {}) {
  const settings = await loadSettings();
  return apiRequest('/api/local-affiliate-worker/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      deviceId: settings.deviceId,
      deviceName: settings.deviceName,
      extensionVersion: EXTENSION_VERSION,
      status,
      currentItemId: workerState.currentItem?.id || null,
      processedCount: workerState.processedCount,
      lastError: workerState.lastError,
      ...extra
    })
  });
}

async function findOrCreateMercadoLivreTab() {
  const tabs = await chrome.tabs.query({
    url: [
      'https://www.mercadolivre.com.br/*',
      'https://produto.mercadolivre.com.br/*'
    ]
  });
  if (tabs[0]?.id) return { ...tabs[0], createdByWorker: false };
  const tab = await chrome.tabs.create({
    url: 'https://www.mercadolivre.com.br/',
    active: false
  });
  return { ...tab, createdByWorker: true };
}

async function findOrCreateShopeeTab() {
  const tabs = await chrome.tabs.query({
    url: 'https://affiliate.shopee.com.br/offer/custom_link*'
  });
  if (tabs[0]?.id) return { ...tabs[0], createdByWorker: false };
  const tab = await chrome.tabs.create({
    url: SHOPEE_CONVERTER_URL,
    active: false
  });
  return { ...tab, createdByWorker: true };
}

function tabMatchesPlatform(tab, platform) {
  try {
    const hostname = new URL(tab.pendingUrl || tab.url || '').hostname;
    if (platform === 'shopee') return hostname === 'affiliate.shopee.com.br';
    if (platform === 'amazon') {
      return hostname === 'amazon.com.br' || hostname === 'www.amazon.com.br';
    }
    return hostname === 'www.mercadolivre.com.br' ||
      hostname === 'produto.mercadolivre.com.br';
  } catch {
    return false;
  }
}

async function getWorkerWindow() {
  const stored = await chrome.storage.session.get(WORKER_WINDOW_KEY);
  const windowId = stored[WORKER_WINDOW_KEY];
  if (!Number.isInteger(windowId)) return null;
  try {
    return await chrome.windows.get(windowId, { populate: true });
  } catch {
    await chrome.storage.session.remove(WORKER_WINDOW_KEY);
    return null;
  }
}

async function maximizeWindow(windowId, focused) {
  try {
    return await chrome.windows.update(windowId, {
      state: 'maximized',
      focused
    });
  } catch (error) {
    console.warn('O Opera não permitiu maximizar a janela:', error);
    return chrome.windows.update(windowId, { focused }).catch(() => null);
  }
}

async function setStage(stage, diagnostic = null) {
  const event = {
    stage,
    at: new Date().toISOString(),
    ...(diagnostic ? { diagnostic } : {})
  };
  return persistState({
    stage,
    stageStartedAt: event.at,
    lastDiagnostic: diagnostic || workerState.lastDiagnostic,
    diagnosticEvents: [...(workerState.diagnosticEvents || []), event].slice(-20)
  });
}

function cancelledError() {
  return Object.assign(new Error('Processamento cancelado.'), {
    code: 'CANCELLED'
  });
}

function assertRunning(generation) {
  if (stopRequested || generation !== runGeneration) throw cancelledError();
}

function cancelPendingOperations() {
  runGeneration += 1;
  for (const cancel of [...pendingCancellations]) cancel();
  pendingCancellations.clear();
}

function cancellableDelay(ms, generation) {
  assertRunning(generation);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCancellations.delete(cancel);
      try {
        assertRunning(generation);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, ms);
    const cancel = () => {
      clearTimeout(timer);
      pendingCancellations.delete(cancel);
      reject(cancelledError());
    };
    pendingCancellations.add(cancel);
  });
}

async function getOrCreateWorkerTab(platform, productUrl) {
  const url = platform === 'shopee'
    ? SHOPEE_CONVERTER_URL
    : productUrl || 'https://www.mercadolivre.com.br/';
  let workerWindow = await getWorkerWindow();
  const createdWindow = !workerWindow;
  if (!workerWindow) {
    workerWindow = await chrome.windows.create({
      url,
      type: 'normal',
      focused: false,
      state: 'normal'
    });
    await maximizeWindow(workerWindow.id, false);
    await chrome.storage.session.set({
      [WORKER_WINDOW_KEY]: workerWindow.id
    });
  }
  activeWorkerWindowId = workerWindow.id;

  const previousTabs = workerWindow.tabs ||
    await chrome.tabs.query({ windowId: workerWindow.id });
  const initialTab = (createdWindow || platform === 'shopee')
    ? previousTabs.find(tab => tabMatchesPlatform(tab, platform))
    : null;
  const tab = initialTab || await chrome.tabs.create({
      windowId: workerWindow.id,
      url,
      active: false
    });
  for (const previousTab of previousTabs) {
    if (!previousTab.id || previousTab.id === tab.id) continue;
    await chrome.tabs.remove(previousTab.id).catch(() => {});
  }
  return tab;
}

async function closeWorkerWindow(windowId = activeWorkerWindowId) {
  const stored = await chrome.storage.session.get(WORKER_WINDOW_KEY);
  const targetId = Number.isInteger(windowId)
    ? windowId
    : stored[WORKER_WINDOW_KEY];
  let closed = !Number.isInteger(targetId);
  try {
    for (let attempt = 0; attempt < 3 && !closed; attempt += 1) {
      const openWindow = await chrome.windows.get(targetId).catch(() => null);
      if (!openWindow) {
        closed = true;
        break;
      }
      await chrome.windows.remove(targetId).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 250));
      closed = !(await chrome.windows.get(targetId).catch(() => null));
    }
  } finally {
    activeWorkerWindowId = null;
    await chrome.storage.session.remove(WORKER_WINDOW_KEY);
  }
  if (!closed) {
    throw new Error('O navegador impediu o fechamento da janela de trabalho.');
  }
}

function tabIsShopeeConverter(tab) {
  try {
    const url = new URL(tab.pendingUrl || tab.url || '');
    return tabMatchesPlatform(tab, 'shopee') &&
      url.pathname.replace(/\/+$/, '') === '/offer/custom_link';
  } catch {
    return false;
  }
}

function samePageUrl(leftValue, rightValue) {
  try {
    const left = new URL(leftValue);
    const right = new URL(rightValue);
    left.hash = '';
    right.hash = '';
    return left.href === right.href;
  } catch {
    return false;
  }
}

function navigationReachedTarget(tab, targetUrl) {
  if (tab.pendingUrl) return false;
  if (/login|captcha|verification|challenge/i.test(tab.url || '')) return true;
  if (samePageUrl(tab.url, targetUrl)) return true;
  try {
    const current = new URL(tab.url || '');
    const target = new URL(targetUrl);
    const targetItemId = target.href.match(/MLB\d+/i)?.[0];
    return Boolean(
      targetItemId &&
      current.href.toUpperCase().includes(targetItemId.toUpperCase())
    );
  } catch {
    return false;
  }
}

async function navigateTab(
  tabId,
  url,
  timeoutMs,
  { reloadSamePage = true } = {}
) {
  const currentTab = await chrome.tabs.get(tabId);
  const samePage = samePageUrl(currentTab.url, url);
  if (
    !reloadSamePage &&
    currentTab.status === 'complete' &&
    samePage
  ) {
    return currentTab;
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(Object.assign(new Error('A página demorou para carregar.'), {
        code: 'TIMEOUT'
      }));
    }, timeoutMs);
    const listener = (updatedId, changeInfo, tab) => {
      if (
        updatedId !== tabId ||
        changeInfo.status !== 'complete' ||
        !navigationReachedTarget(tab, url)
      ) return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    };
    chrome.tabs.onUpdated.addListener(listener);
    const navigation = samePage
      ? reloadSamePage
        ? chrome.tabs.reload(tabId, { bypassCache: true })
        : Promise.resolve(currentTab)
      : chrome.tabs.update(tabId, { url, active: false });
    navigation.catch(error => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      reject(error);
    });
  });
}

async function sendContentMessage(
  tabId,
  message,
  scriptFile = 'content/mercado_livre.js'
) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!/receiving end does not exist|could not establish connection/i.test(
      error.message || ''
    )) throw error;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [scriptFile]
    });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

async function dispatchTrustedClick(tabId, clickPoint) {
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type,
        x: clickPoint.x,
        y: clickPoint.y,
        ...(type === 'mouseMoved'
          ? {}
          : { button: 'left', clickCount: 1 })
      });
    }
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
  }
}

async function getShopeePageState(tabId) {
  return sendContentMessage(tabId, {
    type: 'GET_SHOPEE_PAGE_STATE'
  }, 'content/shopee.js');
}

async function waitForShopeeState(tabId, predicate, deadline, generation) {
  let lastState = null;
  while (Date.now() < deadline) {
    assertRunning(generation);
    try {
      lastState = await getShopeePageState(tabId);
      if (lastState?.code || predicate(lastState)) return lastState;
    } catch (error) {
      if (error.code === 'CANCELLED') throw error;
    }
    await cancellableDelay(250, generation);
  }
  return lastState;
}

async function activateShopeeControl(tabId, kind, deadline, generation) {
  assertRunning(generation);
  const result = await sendContentMessage(tabId, {
    type: 'ACTIVATE_SHOPEE_CONTROL',
    kind
  }, 'content/shopee.js');
  if (!result?.success) return result;
  const predicate = kind === 'offer'
    ? state => state?.diagnostic?.controls?.customLink?.visible ||
        state?.state === 'READY'
    : state => state?.state === 'READY';
  let state = await waitForShopeeState(
    tabId,
    predicate,
    Math.min(deadline, Date.now() + 3000),
    generation
  );
  return state;
}

async function ensureShopeeConverter(tab, settings, generation) {
  const deadline = Date.now() + Number(settings.pageTimeoutMs || 45000);
  await setStage('shopee_opening');
  const current = await chrome.tabs.get(tab.id);
  if (!tabIsShopeeConverter(current)) {
    await chrome.tabs.update(tab.id, { url: SHOPEE_CONVERTER_URL, active: false });
  }
  let state = await waitForShopeeState(
    tab.id,
    value => value?.state !== 'PORTAL_LOADING',
    Math.min(deadline, Date.now() + 10000),
    generation
  );
  if (state?.code) return { success: false, ...state };
  if (state?.state === 'READY') {
    await setStage('shopee_ready', state.diagnostic);
    return { success: true, state };
  }
  if (state?.state === 'CONVERTER_LOADING') {
    await setStage('shopee_waiting_converter', state.diagnostic);
    state = await waitForShopeeState(
      tab.id,
      value => value?.state === 'READY',
      deadline,
      generation
    );
    if (state?.code) return { success: false, ...state };
    if (state?.state === 'READY') {
      await setStage('shopee_ready', state.diagnostic);
      return { success: true, state };
    }
    return {
      success: false,
      code: 'SHOPEE_PORTAL_NOT_READY',
      message: 'A página Link personalizado abriu, mas o formulário não carregou.',
      diagnostic: state?.diagnostic || null
    };
  }

  await setStage('shopee_opening_converter', state?.diagnostic);
  if (state?.diagnostic?.controls?.customLink?.present) {
    state = await activateShopeeControl(
      tab.id, 'custom_link', deadline, generation
    );
    if (state?.code) return { success: false, ...state };
    if (state?.state === 'READY') {
      await setStage('shopee_ready', state.diagnostic);
      return { success: true, state };
    }
    if (state?.state === 'CONVERTER_LOADING') {
      await setStage('shopee_waiting_converter', state.diagnostic);
      state = await waitForShopeeState(
        tab.id,
        value => value?.state === 'READY',
        deadline,
        generation
      );
      if (state?.code) return { success: false, ...state };
      if (state?.state === 'READY') {
        await setStage('shopee_ready', state.diagnostic);
        return { success: true, state };
      }
      return {
        success: false,
        code: 'SHOPEE_PORTAL_NOT_READY',
        message: 'Link personalizado abriu, mas o formulário não carregou.',
        diagnostic: state?.diagnostic || null
      };
    }
  }

  state = await getShopeePageState(tab.id).catch(() => state);
  if (!state?.diagnostic?.controls?.offer?.present) {
    return {
      success: false,
      code: state?.state === 'PORTAL_LOADING'
        ? 'SHOPEE_PORTAL_NOT_READY'
        : 'SHOPEE_MENU_NOT_FOUND',
      message: state?.state === 'PORTAL_LOADING'
        ? 'O portal da Shopee não terminou de carregar.'
        : 'A Shopee abriu o portal, mas não expôs o menu Oferta.',
      diagnostic: state?.diagnostic || null
    };
  }
  state = await activateShopeeControl(tab.id, 'offer', deadline, generation);
  if (state?.code) return { success: false, ...state };
  if (!state?.diagnostic?.controls?.customLink?.present) {
    return {
      success: false,
      code: 'SHOPEE_CONVERTER_NOT_REACHED',
      message: 'O menu Oferta abriu, mas Link personalizado não apareceu.',
      diagnostic: state?.diagnostic || null
    };
  }
  state = await activateShopeeControl(
    tab.id, 'custom_link', deadline, generation
  );
  if (state?.code) return { success: false, ...state };
  state = await waitForShopeeState(
    tab.id,
    value => value?.state === 'READY',
    deadline,
    generation
  );
  if (state?.code) return { success: false, ...state };
  if (state?.state !== 'READY') {
    return {
      success: false,
      code: 'SHOPEE_CONVERTER_NOT_REACHED',
      message: 'A Shopee não concluiu a abertura de Link personalizado.',
      diagnostic: state?.diagnostic || null
    };
  }
  await setStage('shopee_ready', state.diagnostic);
  return { success: true, state };
}

async function runContentAction(tabId, timeoutMs) {
  const located = await sendContentMessage(tabId, {
    type: 'LOCATE_AFFILIATE_SHARE',
    timeoutMs
  });
  if (!located?.success) return located;
  try {
    await dispatchTrustedClick(tabId, located.clickPoint);
  } catch (error) {
    return {
      success: false,
      code: 'UNKNOWN_ERROR',
      message:
        'Não foi possível enviar o clique nativo. Feche o DevTools desta aba ' +
        `e tente novamente: ${error.message}`
    };
  }
  return sendContentMessage(tabId, {
    type: 'EXTRACT_AFFILIATE_LINK',
    timeoutMs
  });
}

async function reportFailure(job, code, message) {
  const settings = await loadSettings();
  const sendFailure = (failureCode, failureMessage) => apiRequest(
      `/api/local-affiliate-worker/jobs/${encodeURIComponent(job.id)}/fail`,
      {
      method: 'POST',
      body: JSON.stringify({
        deviceId: settings.deviceId,
        code: failureCode,
        message: failureMessage
      })
      }
    );
  try {
    return await sendFailure(code, message);
  } catch (error) {
    if (
      code !== 'UNKNOWN_ERROR' &&
      /c[oó]digo de falha inv[aá]lido/i.test(error.message || '')
    ) {
      return sendFailure('UNKNOWN_ERROR', `[${code}] ${message}`);
    }
    throw error;
  }
}

async function processMercadoLivreJob(job, settings, tab) {
  const loadedTab = await navigateTab(
    tab.id,
    job.productLink,
    settings.pageTimeoutMs
  );
  if (/login|captcha|verification|challenge/i.test(loadedTab.url || '')) {
    return {
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'O Mercado Livre solicitou autenticação.'
    };
  }
  await chrome.tabs.update(tab.id, { active: true });
  await maximizeWindow(loadedTab.windowId, false);
  await new Promise(resolve => setTimeout(resolve, 200));
  const couponResult = await sendContentMessage(tab.id, {
    type: 'DETECT_PRODUCT_COUPON',
    candidates: job.couponCandidates || [],
    timeoutMs: Math.min(settings.actionTimeoutMs, 5000)
  });
  const affiliateResult = await runContentAction(
    tab.id,
    settings.actionTimeoutMs
  );
  if (affiliateResult?.success && couponResult?.coupon) {
    affiliateResult.coupon = couponResult.coupon;
  }
  return affiliateResult;
}

async function processShopeeJob(job, settings, tab, generation) {
  const prepared = await ensureShopeeConverter(tab, settings, generation);
  if (!prepared.success) {
    await setStage('shopee_blocked', prepared.diagnostic);
    return prepared;
  }
  assertRunning(generation);
  await setStage('shopee_generating', prepared.state?.diagnostic);
  let result;
  try {
    result = await sendContentMessage(tab.id, {
      type: 'GENERATE_SHOPEE_AFFILIATE_LINK',
      productLink: job.productLink,
      timeoutMs: settings.actionTimeoutMs
    }, 'content/shopee.js');
  } catch (error) {
    if (stopRequested || generation !== runGeneration) throw cancelledError();
    result = {
      success: false,
      code: 'SHOPEE_PORTAL_NOT_READY',
      message: `A comunicação com a página da Shopee foi interrompida: ${error.message}`,
      diagnostic: workerState.lastDiagnostic
    };
  }
  if (result?.diagnostic) {
    await setStage(
      result.success ? 'shopee_link_generated' : 'shopee_generation_failed',
      result.diagnostic
    );
  }
  return result;
}

async function processAmazonJob(job) {
  return {
    success: true,
    affiliateLink: job.productLink,
    observedPrice: null,
    productId: null
  };
}

async function processJob(job, settings, tab, generation) {
  await persistState({
    status: 'processing',
    currentItem: { id: job.id, title: job.title, platform: job.platform },
    lastError: null
  });
  await heartbeat('processing');
  if (job.platform === 'shopee') {
    return processShopeeJob(job, settings, tab, generation);
  }
  if (job.platform === 'amazon') {
    return processAmazonJob(job);
  }
  await setStage('mercado_livre_processing');
  return processMercadoLivreJob(job, settings, tab);
}

async function processQueue() {
  if (processingPromise) return processingPromise;
  processingPromise = (async () => {
    stopRequested = false;
    const generation = ++runGeneration;
    const settings = await loadSettings();
    await persistState({
      status: 'processing',
      processedCount: 0,
      failedCount: 0,
      currentItem: null,
      lastError: null,
      authRequired: false,
      stage: 'starting',
      stageStartedAt: new Date().toISOString(),
      lastDiagnostic: null,
      diagnosticEvents: []
    });
    await heartbeat('processing');
    let workerTab = null;
    const batchSize = Math.min(40, Math.max(
      1,
      Number(settings.batchSize) || 10
    ));
    await persistState({ waitingCount: batchSize });
    const attemptedItemIds = [];
    try {
    for (let index = 0; index < batchSize && !stopRequested; index += 1) {
      assertRunning(generation);
      const claimed = await apiRequest('/api/local-affiliate-worker/claim', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: settings.deviceId,
          deviceName: settings.deviceName,
          extensionVersion: EXTENSION_VERSION,
          limit: 1,
          excludeItemIds: attemptedItemIds,
          retryFailed: true
        })
      });
      const job = claimed.jobs?.[0];
      if (!job) {
        if (index === 0) {
          await persistState({
            lastError: 'Nenhuma oferta pendente de link na fila.'
          });
        }
        break;
      }
      attemptedItemIds.push(job.id);
      try {
        const platform = ['shopee', 'amazon'].includes(job.platform)
          ? job.platform
          : 'mercado_livre';
        const tab = platform === 'amazon' ? null : await getOrCreateWorkerTab(
          platform,
          job.productLink
        );
        if (tab) workerTab = tab;
        const result = await processJob(job, settings, tab, generation);
        assertRunning(generation);
        if (!result?.success) {
          const code = result?.code || 'UNKNOWN_ERROR';
          const message = result?.message || 'Falha ao gerar o link.';
          await reportFailure(job, code, message);
          if (USER_ACTION_CODES.has(code)) {
            stopRequested = true;
            await maximizeWindow(tab.windowId, true);
            await chrome.tabs.update(tab.id, { active: true });
            await persistState({
              status: 'auth_required',
              authRequired: true,
              lastError: message,
              lastDiagnostic: result?.diagnostic || workerState.lastDiagnostic
            });
            await heartbeat('auth_required');
            break;
          }
          if (code === 'CANCELLED') break;
          await persistState({
            failedCount: workerState.failedCount + 1,
            lastError: message,
            lastDiagnostic: result?.diagnostic || workerState.lastDiagnostic
          });
          if (SHOPEE_BLOCKING_CODES.has(code)) {
            stopRequested = true;
            await persistState({ status: 'error' });
            await heartbeat('error');
            break;
          }
          continue;
        }
        await apiRequest(
          `/api/local-affiliate-worker/jobs/${encodeURIComponent(job.id)}/complete`,
          {
            method: 'POST',
            body: JSON.stringify({
              deviceId: settings.deviceId,
              affiliateLink: result.affiliateLink,
              observedPrice: result.observedPrice,
              productId: result.productId || null,
              coupon: result.coupon || null
            })
          }
        );
        await persistState({
          processedCount: workerState.processedCount + 1,
          waitingCount: Math.max(0, batchSize - index - 1)
        });
      } catch (error) {
        const cancelled = stopRequested || generation !== runGeneration;
        const code = cancelled ? 'CANCELLED' : error.code || 'UNKNOWN_ERROR';
        const message = cancelled ? 'Processamento cancelado.' : error.message;
        await reportFailure(job, code, message).catch(() => {});
        if (code === 'CANCELLED') break;
        await persistState({
          failedCount: workerState.failedCount + 1,
          lastError: message
        });
      }
      if (!stopRequested) {
        await cancellableDelay(
          Number(settings.intervalMs) || 2500,
          generation
        );
      }
    }
    if (!workerState.authRequired && workerState.status !== 'error') {
      await persistState({
        status: 'idle',
        currentItem: null,
        waitingCount: 0,
        stage: 'idle'
      });
      await heartbeat('idle');
    }
    return workerState;
    } finally {
      if (!workerState.authRequired && workerState.status !== 'error' &&
          activeWorkerWindowId) {
        const workerWindowId = workerTab?.windowId;
        await closeWorkerWindow(workerWindowId);
      }
    }
  })().finally(() => {
    pendingCancellations.clear();
    processingPromise = null;
  });
  return processingPromise;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'GET_STATE') {
      const status = await apiRequest('/api/local-affiliate-worker/status')
        .catch(() => null);
      return {
        state: workerState,
        serverStatus: status,
        settings: await loadSettings()
      };
    }
    if (message.type === 'TEST_CONNECTION') {
      await heartbeat('idle');
      return { success: true };
    }
    if (message.type === 'START_PROCESSING') {
      return { success: true, state: await processQueue() };
    }
    if (message.type === 'STOP_PROCESSING') {
      stopRequested = true;
      cancelPendingOperations();
      const workerWindow = await getWorkerWindow();
      if (workerWindow?.tabs) {
        await Promise.all(workerWindow.tabs.map(tab =>
          chrome.tabs.sendMessage(tab.id, {
            type: 'CANCEL_SHOPEE_ACTION'
          }).catch(() => {})
        ));
      }
      if (workerWindow?.id) await closeWorkerWindow(workerWindow.id);
      await persistState({
        status: 'idle',
        currentItem: null,
        authRequired: false,
        waitingCount: 0,
        stage: 'stopped'
      });
      await heartbeat('idle').catch(() => {});
      return { success: true };
    }
    if (message.type === 'CONTINUE_PROCESSING') {
      await persistState({
        authRequired: false,
        lastError: null,
        status: 'idle'
      });
      return { success: true, state: await processQueue() };
    }
    if (message.type === 'OPEN_MERCADO_LIVRE') {
      const tab = await findOrCreateMercadoLivreTab();
      await maximizeWindow(tab.windowId, true);
      await chrome.tabs.update(tab.id, { active: true });
      return { success: true };
    }
    if (message.type === 'OPEN_SHOPEE') {
      const tab = await findOrCreateShopeeTab();
      await maximizeWindow(tab.windowId, true);
      await chrome.tabs.update(tab.id, { active: true });
      return { success: true };
    }
    if (message.type === 'TEST_SHOPEE') {
      if (processingPromise) {
        throw new Error('Pare o processamento antes de testar a Shopee.');
      }
      stopRequested = false;
      const generation = ++runGeneration;
      const settings = await loadSettings();
      const tab = await getOrCreateWorkerTab('shopee', SHOPEE_CONVERTER_URL);
      await persistState({
        status: 'processing',
        currentItem: { title: 'Teste do gerador Shopee', platform: 'shopee' },
        lastError: null,
        authRequired: false
      });
      const result = await ensureShopeeConverter(tab, settings, generation);
      if (result.success) {
        await persistState({
          status: 'idle',
          currentItem: null,
          stage: 'shopee_ready',
          lastError: null
        });
        await closeWorkerWindow(tab.windowId);
        return { success: true };
      }
      const needsUser = USER_ACTION_CODES.has(result.code);
      await persistState({
        status: needsUser ? 'auth_required' : 'error',
        authRequired: needsUser,
        lastError: result.message,
        lastDiagnostic: result.diagnostic || workerState.lastDiagnostic
      });
      if (!needsUser) await closeWorkerWindow(tab.windowId);
      return { success: false, error: result.message };
    }
    throw new Error('Ação desconhecida.');
  })().then(sendResponse).catch(error =>
    sendResponse({ success: false, error: error.message })
  );
  return true;
});

chrome.alarms.create('affiliate-heartbeat', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'affiliate-heartbeat') {
    heartbeat().catch(() => {});
  }
});

async function restoreWorkerRuntime() {
  const stored = await chrome.storage.local.get('workerRuntime');
  if (!stored.workerRuntime) return;
  workerState = stored.workerRuntime;
  if (workerState.status === 'processing') {
    workerState = {
      ...workerState,
      status: 'error',
      authRequired: false,
      stage: 'interrupted',
      lastError: 'A execução anterior foi interrompida pelo navegador. Inicie novamente.'
    };
    await chrome.storage.local.set({ workerRuntime: workerState });
  }
}

restoreWorkerRuntime();

chrome.runtime.onStartup.addListener(async () => {
  await restoreWorkerRuntime();
  heartbeat().catch(() => {});
});
