const EXTENSION_VERSION = '1.5.1';
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
let workerState = {
  status: 'idle',
  processedCount: 0,
  failedCount: 0,
  currentItem: null,
  lastError: null,
  authRequired: false,
  waitingCount: 0
};

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
    const hostname = new URL(tab.url || '').hostname;
    return platform === 'shopee'
      ? hostname === 'affiliate.shopee.com.br'
      : hostname === 'www.mercadolivre.com.br' ||
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

async function positionSplitWindows(workerWindowId) {
  try {
    let screenWidth = 1920;
    let screenHeight = 1040;
    let screenLeft = 0;
    let screenTop = 0;

    if (chrome.system?.display?.getInfo) {
      const displays = await new Promise(resolve => {
        try {
          chrome.system.display.getInfo(info => resolve(info || []));
        } catch {
          resolve([]);
        }
      });
      if (displays && displays.length > 0) {
        const primary = displays.find(d => d.isPrimary) || displays[0];
        const area = primary.workArea || primary.bounds;
        if (area && area.width) {
          screenWidth = area.width;
          screenHeight = area.height;
          screenLeft = area.left || 0;
          screenTop = area.top || 0;
        }
      }
    }

    const halfWidth = Math.floor(screenWidth / 2);
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    const mainWindow = windows.find(w => w.id !== workerWindowId);

    if (mainWindow?.id) {
      await chrome.windows.update(mainWindow.id, {
        left: screenLeft,
        top: screenTop,
        width: halfWidth,
        height: screenHeight,
        state: 'normal'
      }).catch(() => {});
    }

    if (workerWindowId) {
      await chrome.windows.update(workerWindowId, {
        left: screenLeft + halfWidth,
        top: screenTop,
        width: halfWidth,
        height: screenHeight,
        state: 'normal',
        focused: false
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Erro ao posicionar janelas divididas:', err);
  }
}

async function getOrCreateWorkerTab(platform) {
  const url = platform === 'shopee'
    ? SHOPEE_CONVERTER_URL
    : 'https://www.mercadolivre.com.br/';
  let workerWindow = await getWorkerWindow();
  if (!workerWindow) {
    workerWindow = await chrome.windows.create({
      url,
      type: 'normal',
      focused: false,
      state: 'normal',
      width: 900,
      height: 900
    });
    await chrome.storage.session.set({
      [WORKER_WINDOW_KEY]: workerWindow.id
    });
  }
  
  await positionSplitWindows(workerWindow.id);

  const tabs = workerWindow.tabs ||
    await chrome.tabs.query({ windowId: workerWindow.id });
  const existing = tabs.find(tab => tabMatchesPlatform(tab, platform));
  const tab = existing || await chrome.tabs.create({
    windowId: workerWindow.id,
    url,
    active: false
  });
  return tab;
}

async function closeWorkerWindow() {
  const workerWindow = await getWorkerWindow();
  if (workerWindow?.id) {
    try {
      const tabs = await chrome.tabs.query({ windowId: workerWindow.id });
      // Fecha aba por aba com uma pequena pausa (150ms) para fechar a janela suavemente
      // sem acionar a caixa de diálogo "Fechar janela com X guias?" do Opera GX / Chrome
      for (const tab of tabs) {
        if (tab.id) {
          await chrome.tabs.remove(tab.id).catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }
    } catch {
      await chrome.windows.remove(workerWindow.id).catch(() => {});
    }
  }
  await chrome.storage.session.remove(WORKER_WINDOW_KEY);
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

async function navigateTab(
  tabId,
  url,
  timeoutMs,
  { reloadSamePage = true } = {}
) {
  const currentTab = await chrome.tabs.get(tabId);
  if (
    !reloadSamePage &&
    currentTab.status === 'complete' &&
    samePageUrl(currentTab.url, url)
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
      if (updatedId !== tabId || changeInfo.status !== 'complete') return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    };
    chrome.tabs.onUpdated.addListener(listener);
    const navigation = samePageUrl(currentTab.url, url)
      ? chrome.tabs.reload(tabId, { bypassCache: true })
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
  } catch {
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
  await apiRequest(
    `/api/local-affiliate-worker/jobs/${encodeURIComponent(job.id)}/fail`,
    {
      method: 'POST',
      body: JSON.stringify({
        deviceId: settings.deviceId,
        code,
        message
      })
    }
  );
}

async function processJob(job, settings, tab) {
  await persistState({
    status: 'processing',
    currentItem: { id: job.id, title: job.title },
    lastError: null
  });
  await heartbeat('processing');
  const shopee = job.platform === 'shopee';
  const loadedTab = await navigateTab(
    tab.id,
    shopee ? SHOPEE_CONVERTER_URL : job.productLink,
    settings.pageTimeoutMs,
    { reloadSamePage: !shopee }
  );
  if (/login|captcha|verification|challenge/i.test(loadedTab.url || '')) {
    return {
      success: false,
      code: 'AUTH_REQUIRED',
      message: `${shopee ? 'A Shopee' : 'O Mercado Livre'} solicitou autenticação.`
    };
  }
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(loadedTab.windowId, {
    state: 'normal',
    focused: false
  });
  await new Promise(resolve => setTimeout(resolve, 200));
  if (shopee) {
    return sendContentMessage(tab.id, {
      type: 'GENERATE_SHOPEE_AFFILIATE_LINK',
      productLink: job.productLink,
      timeoutMs: settings.actionTimeoutMs
    }, 'content/shopee.js');
  }
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

async function processQueue() {
  if (processingPromise) return processingPromise;
  processingPromise = (async () => {
    stopRequested = false;
    const settings = await loadSettings();
    await persistState({
      status: 'processing',
      processedCount: 0,
      failedCount: 0,
      currentItem: null,
      lastError: null,
      authRequired: false
    });
    await heartbeat('processing');
    const tabs = {};
    const batchSize = Math.min(40, Math.max(
      1,
      Number(settings.batchSize) || 10
    ));
    await persistState({ waitingCount: batchSize });
    const attemptedItemIds = [];
    try {
    for (let index = 0; index < batchSize && !stopRequested; index += 1) {
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
      if (!job) break;
      attemptedItemIds.push(job.id);
      try {
        const platform = job.platform === 'shopee'
          ? 'shopee'
          : 'mercado_livre';
        tabs[platform] ||= platform === 'shopee'
          ? await getOrCreateWorkerTab('shopee')
          : await getOrCreateWorkerTab('mercado_livre');
        const tab = tabs[platform];
        const result = await processJob(job, settings, tab);
        if (!result?.success) {
          const code = result?.code || 'UNKNOWN_ERROR';
          const message = result?.message || 'Falha ao gerar o link.';
          await reportFailure(job, code, message);
          if (code === 'AUTH_REQUIRED') {
            stopRequested = true;
            await chrome.windows.update(tab.windowId, {
              state: 'normal',
              focused: true
            });
            await chrome.tabs.update(tab.id, { active: true });
            await persistState({
              status: 'auth_required',
              authRequired: true,
              currentItem: null,
              lastError: message
            });
            await heartbeat('auth_required');
            break;
          }
          await persistState({
            failedCount: workerState.failedCount + 1,
            lastError: message
          });
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
              coupon: result.coupon || null
            })
          }
        );
        await persistState({
          processedCount: workerState.processedCount + 1,
          waitingCount: Math.max(0, batchSize - index - 1)
        });
      } catch (error) {
        const code = error.code || 'UNKNOWN_ERROR';
        await reportFailure(job, code, error.message).catch(() => {});
        await persistState({
          failedCount: workerState.failedCount + 1,
          lastError: error.message
        });
      }
      if (!stopRequested) {
        await new Promise(resolve =>
          setTimeout(resolve, Number(settings.intervalMs) || 2500)
        );
      }
    }
    if (!workerState.authRequired) {
      await persistState({
        status: 'idle',
        currentItem: null,
        waitingCount: 0
      });
      await heartbeat('idle');
    }
    return workerState;
    } finally {
      if (!workerState.authRequired) {
        await closeWorkerWindow();
      }
    }
  })().finally(() => {
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
      await persistState({ status: 'idle', currentItem: null });
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
      await chrome.windows.update(tab.windowId, {
        state: 'normal',
        focused: true
      });
      await chrome.tabs.update(tab.id, { active: true });
      return { success: true };
    }
    if (message.type === 'OPEN_SHOPEE') {
      const tab = await findOrCreateShopeeTab();
      await chrome.windows.update(tab.windowId, {
        state: 'normal',
        focused: true
      });
      await chrome.tabs.update(tab.id, { active: true });
      return { success: true };
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

chrome.storage.local.get('workerRuntime').then(stored => {
  if (stored.workerRuntime) workerState = stored.workerRuntime;
});

chrome.runtime.onStartup.addListener(async () => {
  const stored = await chrome.storage.local.get('workerRuntime');
  if (stored.workerRuntime) workerState = stored.workerRuntime;
  heartbeat().catch(() => {});
});
