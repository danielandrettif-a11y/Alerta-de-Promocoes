#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SMOKE_TEST_PORT || 3199);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUTPUT_DIR = path.join(ROOT, '.tmp', 'smoke-test');
const SCREENSHOT_PATH = path.join(OUTPUT_DIR, 'dashboard.png');

function findBrowserPath() {
  const candidates = [
    process.env.BROWSER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];

  return candidates.find(candidate => candidate && fs.existsSync(candidate));
}

async function waitForServer(child, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Servidor nao iniciou em ${timeoutMs}ms`));
    }, timeoutMs);

    const onData = data => {
      const text = data.toString();
      process.stdout.write(`[server] ${text}`);
      if (text.includes('Dashboard rodando')) {
        clearTimeout(timeout);
        resolve();
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', data => process.stderr.write(`[server:err] ${data}`));
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Servidor encerrou antes do teste (codigo ${code})`));
    });
  });
}

async function expectResponse(route, expectedStatus, options) {
  const response = await fetch(`${BASE_URL}${route}`, options);
  if (response.status !== expectedStatus) {
    throw new Error(`${route}: esperado HTTP ${expectedStatus}, recebido ${response.status}`);
  }
  return response;
}

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      APP_DATA_DIR: path.join(OUTPUT_DIR, 'data'),
      WHATSAPP_ENABLED: 'false',
      AUTO_RUN_ENABLED: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let browser;
  try {
    await waitForServer(server);

    const indexResponse = await expectResponse('/', 200);
    const indexHtml = await indexResponse.text();
    if (!indexHtml.includes('Promo Automator')) {
      throw new Error('HTML principal nao contem o titulo esperado');
    }

    await expectResponse('/style.css', 200);
    await expectResponse('/app.js', 200);

    const health = await (await expectResponse('/api/health', 200)).json();
    const deals = await (await expectResponse('/api/deals', 200)).json();
    const amazon = await (await expectResponse('/api/amazon-deals', 200)).json();
    const categories = await (await expectResponse('/api/categories', 200)).json();
    const history = await (await expectResponse('/api/publish-history', 200)).json();

    if (!Array.isArray(deals.deals) || !Array.isArray(deals.coupons)) {
      throw new Error('/api/deals retornou formato invalido');
    }
    if (health.status !== 'ok' || health.whatsapp.status !== 'disabled') {
      throw new Error('/api/health retornou formato ou estado invalido');
    }
    if (!Array.isArray(amazon.deals)) {
      throw new Error('/api/amazon-deals retornou formato invalido');
    }
    if (!categories || typeof categories !== 'object') {
      throw new Error('/api/categories retornou formato invalido');
    }
    if (!Array.isArray(history.publishedIds) || !Array.isArray(history.entries)) {
      throw new Error('/api/publish-history retornou formato invalido');
    }

    await expectResponse('/api/proxy-image', 400);
    await expectResponse('/api/compare-price', 400);
    await expectResponse('/api/generate', 400, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedDeals: [] })
    });
    await expectResponse('/api/delete-deal', 400, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const browserPath = findBrowserPath();
    if (!browserPath) throw new Error('Chrome/Chromium nao encontrado para o teste visual');

    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });

    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      const text = message.text();
      if (message.type() === 'error' && !text.startsWith('Failed to load resource:')) {
        pageErrors.push(text);
      }
    });
    page.on('response', response => {
      const responseUrl = response.url();
      if (
        responseUrl.startsWith(BASE_URL) &&
        response.status() >= 400 &&
        !responseUrl.endsWith('/favicon.ico')
      ) {
        pageErrors.push(`${response.status()} em ${responseUrl}`);
      }
    });

    // O painel carrega imagens externas das ofertas, que podem manter a rede
    // ocupada indefinidamente. O teste valida o DOM e os seletores abaixo.
    await page.goto(BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    const requiredSelectors = [
      '#btn-tab-ml',
      '#btn-tab-amazon',
      '#btn-tab-coupons',
      '#panel-ml',
      '#panel-amazon',
      '#panel-coupons',
      '#grid-ml',
      '#grid-amazon',
      '#grid-coupons'
    ];
    for (const selector of requiredSelectors) {
      await page.waitForSelector(selector, { timeout: 5000 });
    }

    for (const tab of ['#btn-tab-amazon', '#btn-tab-coupons', '#btn-tab-ml']) {
      await page.click(tab);
    }

    await page.type('#ipt-filter-name-ml', 'produto-que-nao-existe-smoke-test');
    await page.$eval('#ipt-filter-name-ml', input => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

    if (pageErrors.length > 0) {
      throw new Error(`Erros no navegador: ${pageErrors.join(' | ')}`);
    }

    console.log(`[smoke] API e interface OK`);
    console.log(`[smoke] Mercado Livre: ${deals.deals.length} ofertas`);
    console.log(`[smoke] Amazon: ${amazon.deals.length} ofertas`);
    console.log(`[smoke] Cupons: ${deals.coupons.length}`);
    console.log(`[smoke] Screenshot: ${SCREENSHOT_PATH}`);
  } finally {
    if (browser) await browser.close();
    if (!server.killed) server.kill();
  }
}

run().catch(error => {
  console.error(`[smoke] FALHA: ${error.message}`);
  process.exitCode = 1;
});
