const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const configPath = require.resolve('../execution/session_config.js');
const testTempDir = path.join(__dirname, '.tmp');
fs.mkdirSync(testTempDir, { recursive: true });

function loadConfigWithEnvironment(overrides) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  delete require.cache[configPath];
  const config = require(configPath);

  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete require.cache[configPath];

  return config;
}

test('deriva os perfis a partir de APP_DATA_DIR', () => {
  const dataDir = fs.mkdtempSync(path.join(testTempDir, 'alerta-data-'));
  const config = loadConfigWithEnvironment({
    APP_DATA_DIR: dataDir,
    WHATSAPP_SESSION_DIR: undefined,
    MELI_PROFILE_DIR: undefined,
    APP_RUNTIME_DIR: undefined
  });

  assert.equal(config.APP_DATA_DIR, path.normalize(dataDir));
  assert.equal(config.WHATSAPP_SESSION_DIR, path.join(dataDir, 'wpp_session'));
  assert.equal(config.MELI_PROFILE_DIR, path.join(dataDir, 'ml_user_data'));
  assert.equal(config.APP_RUNTIME_DIR, path.join(dataDir, 'runtime'));
});

test('respeita caminhos de sessao configurados individualmente', () => {
  const baseDir = fs.mkdtempSync(path.join(testTempDir, 'alerta-paths-'));
  const whatsappDir = path.join(baseDir, 'wa');
  const meliDir = path.join(baseDir, 'meli');
  const config = loadConfigWithEnvironment({
    APP_DATA_DIR: baseDir,
    WHATSAPP_SESSION_DIR: whatsappDir,
    MELI_PROFILE_DIR: meliDir
  });

  assert.equal(config.WHATSAPP_SESSION_DIR, whatsappDir);
  assert.equal(config.MELI_PROFILE_DIR, meliDir);
});

test('considera sessao disponivel somente quando ha arquivos persistidos', () => {
  const dataDir = fs.mkdtempSync(path.join(testTempDir, 'alerta-status-'));
  const config = loadConfigWithEnvironment({
    APP_DATA_DIR: dataDir,
    WHATSAPP_SESSION_DIR: undefined,
    MELI_PROFILE_DIR: undefined
  });

  config.ensureSessionDirectories();
  assert.equal(config.getSessionStatus().whatsapp.available, false);
  assert.equal(config.getSessionStatus().mercadoLivre.available, false);

  const whatsappProfile = path.join(config.WHATSAPP_SESSION_DIR, 'session-ml-affiliates');
  fs.mkdirSync(whatsappProfile, { recursive: true });
  fs.writeFileSync(path.join(whatsappProfile, 'marker'), 'ok');
  fs.writeFileSync(path.join(config.MELI_PROFILE_DIR, 'Local State'), '{}');

  assert.equal(config.getSessionStatus().whatsapp.available, true);
  assert.equal(config.getSessionStatus().mercadoLivre.available, true);
});
