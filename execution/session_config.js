/**
 * Centraliza os diretorios de dados persistentes usados pelas integracoes.
 *
 * Producao (Coolify):
 *   APP_DATA_DIR=/data
 *   WHATSAPP_SESSION_DIR=/data/wpp_session
 *   MELI_PROFILE_DIR=/data/ml_user_data
 *
 * O desenvolvimento local mantem compatibilidade com os caminhos em .tmp.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

function resolveFromRoot(configuredPath, fallbackPath) {
  const selectedPath = configuredPath && configuredPath.trim()
    ? configuredPath.trim()
    : fallbackPath;

  return path.isAbsolute(selectedPath)
    ? path.normalize(selectedPath)
    : path.resolve(ROOT_DIR, selectedPath);
}

const APP_DATA_DIR = resolveFromRoot(
  process.env.APP_DATA_DIR,
  path.join(ROOT_DIR, '.tmp')
);

const WHATSAPP_SESSION_DIR = resolveFromRoot(
  process.env.WHATSAPP_SESSION_DIR,
  path.join(APP_DATA_DIR, 'wpp_session')
);

const MELI_PROFILE_DIR = resolveFromRoot(
  process.env.MELI_PROFILE_DIR,
  path.join(APP_DATA_DIR, 'ml_user_data')
);

const APP_RUNTIME_DIR = resolveFromRoot(
  process.env.APP_RUNTIME_DIR,
  path.join(APP_DATA_DIR, 'runtime')
);

function ensureSessionDirectories() {
  for (const directory of [
    APP_DATA_DIR,
    WHATSAPP_SESSION_DIR,
    MELI_PROFILE_DIR,
    APP_RUNTIME_DIR
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function directoryHasFiles(directory) {
  if (!fs.existsSync(directory)) return false;

  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    let entries;

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of entries) {
      if (entry.isFile()) return true;
      if (entry.isDirectory()) pending.push(path.join(current, entry.name));
    }
  }

  return false;
}

function getSessionStatus() {
  return {
    dataDirectory: APP_DATA_DIR,
    whatsapp: {
      env: 'WHATSAPP_SESSION_DIR',
      path: WHATSAPP_SESSION_DIR,
      available: directoryHasFiles(WHATSAPP_SESSION_DIR)
    },
    mercadoLivre: {
      env: 'MELI_PROFILE_DIR',
      path: MELI_PROFILE_DIR,
      available: directoryHasFiles(MELI_PROFILE_DIR)
    }
  };
}

function printSessionStatus(logger = console) {
  ensureSessionDirectories();
  const status = getSessionStatus();

  logger.log('================ SESSOES PERSISTENTES ================');
  logger.log(`[Sessoes] Diretorio de dados: ${status.dataDirectory}`);

  for (const [label, session] of [
    ['WhatsApp Web', status.whatsapp],
    ['Mercado Livre', status.mercadoLivre]
  ]) {
    const state = session.available
      ? 'DISPONIVEL - dados persistidos encontrados'
      : 'AUSENTE - login/autenticacao necessarios';
    logger.log(`[Sessoes] ${label}: ${state}`);
    logger.log(`[Sessoes] ${label} path (${session.env}): ${session.path}`);
  }

  if (process.env.NODE_ENV === 'production' && !process.env.APP_DATA_DIR) {
    logger.warn('[Sessoes] ATENCAO: APP_DATA_DIR nao foi definido em producao.');
  }

  logger.log('[Sessoes] No Coolify, monte armazenamento persistente no diretorio de dados acima.');
  logger.log('=======================================================');

  return status;
}

module.exports = {
  ROOT_DIR,
  APP_DATA_DIR,
  WHATSAPP_SESSION_DIR,
  MELI_PROFILE_DIR,
  APP_RUNTIME_DIR,
  ensureSessionDirectories,
  directoryHasFiles,
  getSessionStatus,
  printSessionStatus
};
