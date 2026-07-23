/**
 * execution/get_meli_affiliate_link.js
 * ─────────────────────────────────────────────────────────────────
 * Camada 3 — Execução (Determinística)
 *
 * Acessa um link de produto do Mercado Livre com a sessão ativa
 * e extrai o link encurtado de afiliado (meli.la) gerado no modal.
 *
 * Uso:
 *   node execution/get_meli_affiliate_link.js <product_url>
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const {
  MELI_PROFILE_DIR,
  APP_RUNTIME_DIR,
  ensureSessionDirectories
} = require('./session_config.js');

function findBrowserPath() {
  const possiblePaths = [
    process.env.BROWSER_EXECUTABLE_PATH,
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.USERPROFILE || 'C:\\Users\\danie', 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];

  for (const executablePath of possiblePaths) {
    if (executablePath && fs.existsSync(executablePath)) {
      return executablePath;
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const productUrl = args[0];
  const customOutputPath = args[1]; // Caminho customizado opcional para evitar concorrência

  if (!productUrl) {
    console.error('❌ Erro: URL do produto nao especificada.');
    console.error('Uso: node execution/get_meli_affiliate_link.js <URL> [caminho_output]');
    process.exit(1);
  }

  const browserPath = findBrowserPath();
  ensureSessionDirectories();
  const userDataDir = MELI_PROFILE_DIR;

  if (fs.readdirSync(userDataDir).length === 0) {
    console.error(`Erro: perfil do Mercado Livre ausente em ${userDataDir}.`);
    console.error('Faca o login primeiro ou configure MELI_PROFILE_DIR para o volume persistente.');
    process.exit(1);
  }

  if (!browserPath) {
    console.error('Erro: Chrome/Chromium nao encontrado. Configure BROWSER_EXECUTABLE_PATH.');
    process.exit(1);
  }

  console.log(`📡 Abrindo navegador para extrair link de afiliado...`);
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true, // Modo headless ativo para simular o ambiente de VPS
    userDataDir: userDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`🔗 Navegando para o produto: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    console.log('⏳ Aguardando a barra de afiliados (#stripe)...');
    await page.waitForSelector('#stripe', { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000)); // Espera apenas 1s para o widget se assentar

    console.log('🔍 Localizando botao "Compartilhar" na barra...');
    const buttonInfo = await page.evaluate(() => {
      const stripe = document.querySelector('#stripe');
      if (!stripe) return null;
      
      const elements = Array.from(stripe.querySelectorAll('button, a, div, span'));
      const shareBtn = elements.find(el => el.textContent?.trim() === 'Compartilhar');
      
      if (!shareBtn) return null;
      
      const rect = shareBtn.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      };
    });

    if (!buttonInfo) {
      throw new Error('Botao "Compartilhar" nao encontrado no DOM da barra.');
    }

    const clickX = Math.round(buttonInfo.x + buttonInfo.width / 2);
    const clickY = Math.round(buttonInfo.y + buttonInfo.height / 2);
    
    console.log(`🖱️ Clicando no botao nas coordenadas (${clickX}, ${clickY})...`);
    await page.mouse.click(clickX, clickY);

    console.log('⏳ Aguardando geracao do link...');
    let affiliateLink = null;
    const maxAttempts = 30; // 3 segundos limite total (30 * 100ms)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      affiliateLink = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, textarea'));
        for (const input of inputs) {
          const val = input.value || '';
          if (val.includes('meli.la') || val.includes('mercadolivre.com')) {
            return val;
          }
        }
        return null;
      });
      if (affiliateLink) break;
      await new Promise(r => setTimeout(r, 100)); // Espera ativa a cada 100ms
    }

    if (!affiliateLink) {
      const debugScreen = path.join(APP_RUNTIME_DIR, 'affiliate_link_error.png');
      await page.screenshot({ path: debugScreen });
      throw new Error(`Link de afiliado nao encontrado. Print de erro salvo em ${debugScreen}`);
    }

    console.log(`\n💚 LINK DE AFILIADO ENCONTRADO: ${affiliateLink}\n`);
    
    // Escreve no caminho customizado ou no padrão
    const outputPath = customOutputPath || path.join(APP_RUNTIME_DIR, 'last_affiliate_link.txt');
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(outputPath, affiliateLink, 'utf-8');
    
  } catch (err) {
    console.error('❌ Erro durante a execucao:', err.message);
    try {
      if (typeof page !== 'undefined' && !page.isClosed()) {
        const debugScreen = path.join(APP_RUNTIME_DIR, 'affiliate_link_error.png');
        fs.mkdirSync(path.dirname(debugScreen), { recursive: true });
        await page.screenshot({ path: debugScreen });
        console.log(`Print do erro salvo em: ${debugScreen}`);
      }
    } catch (screenErr) {
      console.error('⚠️ Nao foi possivel tirar o print de erro:', screenErr.message);
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
