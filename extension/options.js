const fields = {
  serverUrl: document.getElementById('server-url'),
  token: document.getElementById('token'),
  deviceName: document.getElementById('device-name'),
  pageTimeout: document.getElementById('page-timeout'),
  save: document.getElementById('save'),
  feedback: document.getElementById('feedback')
};

async function load() {
  const settings = await chrome.storage.local.get([
    'serverUrl',
    'token',
    'deviceName',
    'pageTimeoutMs'
  ]);
  fields.serverUrl.value = settings.serverUrl || '';
  fields.token.value = settings.token || '';
  fields.deviceName.value = settings.deviceName || 'PC de casa';
  fields.pageTimeout.value = (settings.pageTimeoutMs || 45000) / 1000;
}

fields.save.addEventListener('click', async () => {
  try {
    const url = new URL(fields.serverUrl.value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Use um endereço HTTP ou HTTPS.');
    }
    if (!fields.token.value.trim()) throw new Error('Informe o token.');
    const granted = await chrome.permissions.request({
      origins: [`${url.origin}/*`]
    });
    if (!granted) {
      throw new Error('Autorize o acesso somente ao endereço do painel.');
    }
    await chrome.storage.local.set({
      serverUrl: url.origin,
      token: fields.token.value.trim(),
      deviceName: fields.deviceName.value.trim() || 'PC de casa',
      pageTimeoutMs: Number(fields.pageTimeout.value || 45) * 1000
    });
    fields.feedback.textContent = 'Configuração salva.';
    fields.feedback.className = 'ok';
  } catch (error) {
    fields.feedback.textContent = error.message;
    fields.feedback.className = 'error';
  }
});

load();
