/**
 * Supervisor minimo do processo web.
 *
 * O servidor usa o codigo 75 somente quando remove uma trava obsoleta do
 * perfil do Chrome. Nesse caso, um processo Node novo e necessario porque o
 * Puppeteer nao reutiliza com seguranca um Client cujo launch falhou.
 */

const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROFILE_RECOVERY_EXIT_CODE = 75;
const RESTART_DELAY_MS = 2000;

let child = null;
let stopping = false;
let restartTimer = null;

function startServer() {
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit'
  });

  child.once('exit', (code, signal) => {
    child = null;

    if (stopping) {
      process.exit(0);
      return;
    }

    if (code === PROFILE_RECOVERY_EXIT_CODE) {
      console.warn(
        '[Supervisor] Recuperacao do perfil concluida. Reiniciando o servidor em 2s.'
      );
      restartTimer = setTimeout(startServer, RESTART_DELAY_MS);
      return;
    }

    console.error(
      `[Supervisor] Servidor encerrado inesperadamente (code=${code}, signal=${signal || 'none'}).`
    );
    process.exit(Number.isInteger(code) ? code : 1);
  });
}

function stop(signal) {
  if (stopping) return;
  stopping = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (child) {
    child.kill(signal);
    const forceExit = setTimeout(() => process.exit(0), 10000);
    forceExit.unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

startServer();
