const EXTENSION_VERSION = '1.0.5';
const DEFAULTS = {
  serverUrl: '',
  token: '',
  deviceId: '',
  deviceName: 'PC de casa',
  batchSize: 10,
  pageTimeoutMs: 45000,
  actionTimeoutMs: 30000,
  intervalMs: 2500
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
  if (tabs[0]?.id) return tabs[0];
  return chrome.tabs.create({
    url: 'https://www.mercadolivre.com.br/',
    active: false
  });
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

async function navigateTab(tabId, url, timeoutMs) {
  const currentTab = await chrome.tabs.get(tabId);
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

async function runContentAction(tabId, timeoutMs) {
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: 'GENERATE_AFFILIATE_LINK',
      timeoutMs
    });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/mercado_livre.js']
    });
    return chrome.tabs.sendMessage(tabId, {
      type: 'GENERATE_AFFILIATE_LINK',
      timeoutMs
    });
  }
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
  return runContentAction(tab.id, settings.actionTimeoutMs);
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
    const tab = await findOrCreateMercadoLivreTab();
    const batchSize = Math.min(30, Math.max(
      1,
      Number(settings.batchSize) || 10
    ));
    await persistState({ waitingCount: batchSize });
    const attemptedItemIds = [];
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
        const result = await processJob(job, settings, tab);
        if (!result?.success) {
          const code = result?.code || 'UNKNOWN_ERROR';
          const message = result?.message || 'Falha ao gerar o link.';
          await reportFailure(job, code, message);
          if (code === 'AUTH_REQUIRED') {
            stopRequested = true;
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
              affiliateLink: result.affiliateLink
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
