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
const QUEUE_SCREENSHOT_PATH = path.join(OUTPUT_DIR, 'queue.png');
const WORKER_TOKEN = 'smoke-worker-token';

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
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const runtimeDirectory = path.join(OUTPUT_DIR, 'data', 'runtime');
  const assetDirectory = path.join(
    runtimeDirectory,
    'publication_queue_assets'
  );
  fs.mkdirSync(assetDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(assetDirectory, 'smoke-ready.jpg'),
    Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=',
      'base64'
    )
  );
  fs.writeFileSync(
    path.join(runtimeDirectory, 'publication_queue.json'),
    JSON.stringify({
      version: 1,
      items: [{
        id: 'smoke-ready',
        dealId: 'smoke-deal',
        platform: 'mercado_livre',
        title: 'Produto pronto do smoke test',
        originalPrice: 'R$ 199,90',
        currentPrice: 'R$ 99,90',
        discount: 50,
        productLink: 'https://produto.mercadolivre.com.br/MLB-1',
        affiliateLink: 'https://meli.la/SMOKE123',
        storyFile: 'smoke-ready.jpg',
        status: 'ready',
        affiliateProcessing: { state: 'completed', attempts: 0 }
      }]
    }, null, 2)
  );

  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      APP_DATA_DIR: path.join(OUTPUT_DIR, 'data'),
      WHATSAPP_ENABLED: 'false',
      AUTO_RUN_ENABLED: 'false',
      DEALS_REFRESH_ENABLED: 'false',
      PUBLICATION_QUEUE_ENABLED: 'true',
      LOCAL_AFFILIATE_WORKER_ENABLED: 'true',
      LOCAL_AFFILIATE_WORKER_TOKEN: WORKER_TOKEN
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let browser;
  try {
    await waitForServer(server);

    const indexResponse = await expectResponse('/', 200);
    for (const header of [
      'content-security-policy',
      'permissions-policy',
      'referrer-policy',
      'x-content-type-options',
      'x-frame-options'
    ]) {
      if (!indexResponse.headers.has(header)) {
        throw new Error(`Cabecalho de seguranca ausente: ${header}`);
      }
    }
    if (indexResponse.headers.has('x-powered-by')) {
      throw new Error('O servidor expos o cabecalho X-Powered-By');
    }
    const indexHtml = await indexResponse.text();
    if (!indexHtml.includes('Alerta de Descontos')) {
      throw new Error('HTML principal nao contem o titulo esperado');
    }

    await expectResponse('/style.css', 200);
    await expectResponse('/app.js', 200);
    await expectResponse('/manifest.webmanifest', 200);
    await expectResponse('/sw.js', 200);
    await expectResponse('/icon.svg', 200);

    const health = await (await expectResponse('/api/health', 200)).json();
    const deals = await (await expectResponse('/api/deals', 200)).json();
    const amazon = await (await expectResponse('/api/amazon-deals', 200)).json();
    const shopee = await (await expectResponse('/api/shopee-deals', 200)).json();
    const categories = await (await expectResponse('/api/categories', 200)).json();
    const history = await (await expectResponse('/api/publish-history', 200)).json();
    const dataStatus = await (await expectResponse('/api/data-status', 200)).json();
    const publicationQueue = await (
      await expectResponse('/api/publication-queue', 200)
    ).json();
    const workerStatus = await (
      await expectResponse('/api/local-affiliate-worker/status', 200)
    ).json();
    const initialBatches = await (
      await expectResponse('/api/publication-batches', 200)
    ).json();

    if (!Array.isArray(deals.deals) || !Array.isArray(deals.coupons)) {
      throw new Error('/api/deals retornou formato invalido');
    }
    if (health.status !== 'ok' || health.whatsapp.status !== 'disabled') {
      throw new Error('/api/health retornou formato ou estado invalido');
    }
    if (!Array.isArray(amazon.deals)) {
      throw new Error('/api/amazon-deals retornou formato invalido');
    }
    if (!Array.isArray(shopee.deals)) {
      throw new Error('/api/shopee-deals retornou formato invalido');
    }
    if (!categories || typeof categories !== 'object') {
      throw new Error('/api/categories retornou formato invalido');
    }
    if (!Array.isArray(history.publishedIds) || !Array.isArray(history.entries)) {
      throw new Error('/api/publish-history retornou formato invalido');
    }
    if (
      typeof dataStatus.publishing?.targetPerHour !== 'number' ||
      typeof dataStatus.publishing?.availableToday !== 'number'
    ) {
      throw new Error('/api/data-status retornou formato invalido');
    }
    if (
      publicationQueue.enabled !== true ||
      !Array.isArray(publicationQueue.items) ||
      typeof publicationQueue.summary?.total !== 'number'
    ) {
      throw new Error('/api/publication-queue retornou formato invalido');
    }
    if (
      workerStatus.enabled !== true ||
      !Array.isArray(workerStatus.workers) ||
      !Array.isArray(initialBatches.batches)
    ) {
      throw new Error('Worker local ou lotes retornaram formato invalido');
    }

    const revalidated = await (
      await expectResponse(
        '/api/publication-queue/smoke-ready/affiliate',
        200,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            affiliateLink: 'https://meli.la/SMOKE123',
            observedPrice: 99.9
          })
        }
      )
    ).json();
    if (
      revalidated.item?.status !== 'ready' ||
      revalidated.item?.reviewReason
    ) {
      throw new Error('Item fora do recorte atual foi bloqueado indevidamente');
    }

    const changedPrice = await (
      await expectResponse(
        '/api/publication-queue/smoke-ready/affiliate',
        200,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            affiliateLink: 'https://meli.la/SMOKE123',
            observedPrice: 89.9
          })
        }
      )
    ).json();
    if (
      changedPrice.item?.status !== 'needs_review' ||
      changedPrice.item?.latestPrice !== 'R$ 89,90'
    ) {
      throw new Error('Mudanca de preco observada nao solicitou revisao');
    }
    await expectResponse(
      '/api/publication-queue/smoke-ready/affiliate',
      200,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          affiliateLink: 'https://meli.la/SMOKE123',
          observedPrice: 99.9
        })
      }
    );

    await expectResponse('/api/local-affiliate-worker/heartbeat', 401, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'smoke-device' })
    });
    await expectResponse('/api/local-affiliate-worker/heartbeat', 200, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WORKER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deviceId: 'smoke-device',
        deviceName: 'Smoke test',
        extensionVersion: '1.0.0',
        status: 'idle'
      })
    });
    const claimed = await (
      await expectResponse('/api/local-affiliate-worker/claim', 200, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WORKER_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ deviceId: 'smoke-device', limit: 1 })
      })
    ).json();
    if (!Array.isArray(claimed.jobs)) {
      throw new Error('/claim retornou formato invalido');
    }
    const createdBatch = await (
      await expectResponse('/api/publication-batches', 201, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Smoke lote',
          itemIds: ['smoke-ready']
        })
      })
    ).json();
    const zipResponse = await expectResponse(
      createdBatch.batch.downloadUrl,
      200
    );
    const zipBytes = Buffer.from(await zipResponse.arrayBuffer());
    if (
      zipBytes.subarray(0, 2).toString() !== 'PK' ||
      !zipResponse.headers.get('content-disposition')?.includes('.zip')
    ) {
      throw new Error('Download do lote nao retornou um ZIP valido');
    }
    await expectResponse(
      '/api/publication-batches/not-safe/download?token=x',
      400
    );

    await expectResponse('/api/proxy-image', 400);
    await expectResponse(
      '/api/proxy-image?url=https%3A%2F%2F127.0.0.1%2Fsecret',
      400
    );
    await expectResponse('/api/compare-price', 400);
    await expectResponse('/api/marketplace-search', 400);
    await expectResponse('/api/generate', 400, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedDeals: [] })
    });
    await expectResponse('/api/generate', 503, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedDeals: [{ title: 'Oferta de teste' }]
      })
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
        !responseUrl.endsWith('/favicon.ico') &&
        !responseUrl.includes('/api/proxy-image?')
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
      '#btn-tab-home',
      '#btn-tab-products',
      '#btn-tab-ml',
      '#btn-tab-amazon',
      '#btn-tab-shopee',
      '#btn-tab-coupons',
      '#btn-tab-queue',
      '#btn-tab-search',
      '#panel-home',
      '#panel-products',
      '#panel-ml',
      '#panel-amazon',
      '#panel-shopee',
      '#panel-coupons',
      '#panel-queue',
      '#panel-search',
      '#marketplace-search-form',
      '#ipt-marketplace-search',
      '#marketplace-search-results',
      '#grid-ml',
      '#grid-amazon',
      '#grid-shopee',
      '#grid-coupons',
      '#grid-queue',
      '#queue-status-filter',
      '#queue-platform-filter',
      '#queue-sort-filter',
      '#queue-sync-status',
      '#btn-clear-discarded'
    ];
    for (const selector of requiredSelectors) {
      await page.waitForSelector(selector, { timeout: 5000 });
    }
    const landingState = await page.evaluate(() => ({
      activePanel: document.querySelector('.tab-panel.active')?.id,
      destinations: document.querySelectorAll('[data-home-target]').length
    }));
    if (
      landingState.activePanel !== 'panel-home' ||
      landingState.destinations < 4
    ) {
      throw new Error(`Tela inicial invalida: ${JSON.stringify(landingState)}`);
    }

    const initialDealSelector = deals.deals.length
      ? '#grid-ml .deal-card'
      : '#grid-ml .empty-state';
    await page.waitForSelector(initialDealSelector, { timeout: 5000 });
    if (await page.evaluate(() => amazonDealsLoaded)) {
      throw new Error('Amazon foi carregada antes de abrir sua aba');
    }
    if (await page.evaluate(() => shopeeDealsLoaded)) {
      throw new Error('Shopee foi carregada antes de abrir sua aba');
    }
    if (deals.deals.length) {
      const historySyncPreservedCards = await page.evaluate(async () => {
        const firstCard = document.querySelector('#grid-ml .deal-card');
        await syncPublicationHistory();
        return firstCard === document.querySelector('#grid-ml .deal-card');
      });
      if (!historySyncPreservedCards) {
        throw new Error('Historico inalterado reconstruiu todos os cards');
      }
    }

    await page.click('#btn-tab-products');
    await page.$eval('#btn-tab-shopee', button => button.click());
    await page.waitForFunction(() => shopeeDealsLoaded, { timeout: 5000 });
    await page.waitForSelector(
      shopee.deals.length
        ? '#grid-shopee .deal-card'
        : '#grid-shopee .empty-state',
      { timeout: 5000 }
    );
    if (shopee.deals.length) {
      const scoreLabels = await page.$eval('#grid-shopee .deal-card', card => ({
        marketplace: card.querySelector('.card-rating small')?.textContent,
        opportunity: card.querySelector('.promotion-score-main small')?.textContent,
        starCount: card.querySelectorAll('.promotion-star').length,
        tooltip: card.querySelector('.promotion-score-rating')?.title
      }));
      if (
        scoreLabels.marketplace !== 'Avaliação Shopee' ||
        scoreLabels.opportunity !== 'Potencial da oferta' ||
        scoreLabels.starCount !== 5 ||
        !scoreLabels.tooltip.includes('Força da oferta:')
      ) {
        throw new Error(`Notas indistintas: ${JSON.stringify(scoreLabels)}`);
      }
      await page.$eval('#grid-shopee .deal-chk', checkbox =>
        checkbox.click()
      );
      const selection = await page.evaluate(() => ({
        count: document.querySelector('#txt-queue-count-shopee').textContent,
        disabled: document.querySelector('#btn-queue-shopee').disabled
      }));
      if (selection.count !== '1' || selection.disabled) {
        throw new Error(
          `Selecao Shopee invalida: ${JSON.stringify(selection)}`
        );
      }
    }

    for (const tab of [
      '#btn-tab-coupons',
      '#btn-tab-queue',
      '#btn-tab-search',
      '#btn-tab-home',
      '#btn-tab-products',
      '#btn-tab-ml'
    ]) {
      await page.click(tab);
    }

    const productProgress = await page.evaluate(async () => {
      const originalFetch = window.fetch;
      const originalDeals = allMLDeals;
      const originalReady = whatsappReady;
      const fakeDeals = [
        {
          title: 'Produto de teste A',
          originalPrice: 'R$ 199,90',
          currentPrice: 'R$ 99,90',
          discount: 50,
          link: 'https://produto.mercadolivre.com.br/MLB-1001',
          image: ''
        },
        {
          title: 'Produto de teste B',
          originalPrice: 'R$ 299,90',
          currentPrice: 'R$ 149,90',
          discount: 50,
          link: 'https://produto.mercadolivre.com.br/MLB-1002',
          image: ''
        }
      ];

      try {
        allMLDeals = fakeDeals;
        whatsappReady = true;
        selectedMLIndices.clear();
        selectedMLIndices.add(0);
        selectedMLIndices.add(1);
        window.fetch = async (url, options) => {
          if (url !== '/api/generate') {
            return originalFetch.call(window, url, options);
          }
          const deal = JSON.parse(options.body).selectedDeals[0];
          return new Response(JSON.stringify({
            results: [{
              dealId: generateClientDealId(deal, 'ml'),
              title: deal.title,
              success: true,
              msgId: `smoke-${deal.title.at(-1)}`
            }]
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        };

        await postSelectedDeals('ml');
        return Array.from(document.querySelectorAll('.product-progress'))
          .map(row => ({
            className: row.className,
            status: row.querySelector('.product-progress-heading span')
              .textContent,
            value: row.querySelector('[role="progressbar"]')
              .getAttribute('aria-valuenow')
          }));
      } finally {
        window.fetch = originalFetch;
        allMLDeals = originalDeals;
        whatsappReady = originalReady;
        selectedMLIndices.clear();
        document.querySelector('#progress-modal').classList.add('hidden');
        renderMLDeals(allMLDeals);
      }
    });
    if (
      productProgress.length !== 2 ||
      productProgress.some(item =>
        !item.className.includes('is-success') ||
        item.status !== 'Enviado' ||
        item.value !== '100'
      )
    ) {
      throw new Error('Progresso individual dos produtos nao foi concluido');
    }

    const sharedFileName = await page.evaluate(async () => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async data => {
          window.__smokeSharedFileName = data.files[0].name;
        }
      });
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: () => true
      });
      await shareQueueStory({
        id: 'smoke',
        title: 'Story de teste',
        storyUrl: '/style.css'
      });
      return window.__smokeSharedFileName;
    });
    if (sharedFileName !== 'story-smoke.jpg') {
      throw new Error('Story nao foi enviado ao compartilhamento nativo');
    }

    await page.type('#ipt-filter-name-ml', 'produto-que-nao-existe-smoke-test');
    await page.$eval('#ipt-filter-name-ml', input => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // A pesquisa geral fica visualmente separada do filtro local. O smoke não
    // dispara consultas externas para permanecer determinístico.
    const generalPlaceholder = await page.$eval(
      '#ipt-marketplace-search',
      input => input.placeholder
    );
    const localPlaceholder = await page.$eval(
      '#ipt-filter-name-ml',
      input => input.placeholder
    );
    if (
      !generalPlaceholder.includes('Ex.:') ||
      !localPlaceholder.includes('ofertas já carregadas')
    ) {
      throw new Error('As duas modalidades de pesquisa não estão claras');
    }

    await page.click('#btn-tab-queue');
    await page.waitForSelector('#grid-queue .queue-card', { timeout: 5000 });
    const queueFilters = await page.evaluate(() => {
      const toolbar = document.querySelector('.queue-toolbar');
      return {
        fieldCount: document.querySelectorAll('.queue-filter-field').length,
        defaultStatus: document.querySelector('#queue-status-filter').value,
        defaultSort: document.querySelector('#queue-sort-filter').value,
        fits: toolbar.scrollWidth <= toolbar.clientWidth
      };
    });
    if (
      queueFilters.fieldCount !== 3 ||
      queueFilters.defaultStatus !== 'active' ||
      queueFilters.defaultSort !== 'priority' ||
      !queueFilters.fits
    ) {
      throw new Error(`Filtros da fila invalidos: ${JSON.stringify(queueFilters)}`);
    }
    await page.screenshot({ path: QUEUE_SCREENSHOT_PATH, fullPage: true });
    await page.click('#btn-tab-products');
    await page.$eval('#btn-tab-ml', button => button.click());

    await page.setViewport({ width: 390, height: 844 });
    await page.$eval('#btn-toggle-filters-ml', button => button.click());
    await page.evaluate(() => {
      const grid = document.querySelector('#grid-ml');
      grid.innerHTML = '';
      showDealSkeletons(grid);
      selectedMLIndices.add(0);
      updateMLSelectionUI();
    });
    const mobileState = await page.evaluate(() => {
      const minHeight = selectors => Math.min(...selectors.map(selector =>
        document.querySelector(selector).getBoundingClientRect().height
      ));
      return {
        navPosition: getComputedStyle(document.querySelector('.navigation-tabs')).position,
        filtersOpen: document.querySelector('#filters-ml').classList.contains('is-open'),
        filtersExpanded: document.querySelector('#btn-toggle-filters-ml')
          .getAttribute('aria-expanded'),
        mobileBarVisible: !document.querySelector('#mobile-selection-bar')
          .classList.contains('hidden'),
        mobileQueueVisible: !document.querySelector('#btn-mobile-queue').hidden,
        mobileSendDisabled: document.querySelector('#btn-mobile-send').disabled,
        navTargetHeight: minHeight([
          '#btn-tab-home',
          '#btn-tab-products',
          '#btn-tab-coupons',
          '#btn-tab-queue',
          '#btn-tab-search'
        ]),
        sourceTargetHeight: minHeight([
          '#btn-tab-ml',
          '#btn-tab-shopee'
        ]),
        filterTargetHeight: minHeight([
          '#ipt-filter-name-ml',
          '#sel-filter-category-ml',
          '#sel-filter-discount-ml'
        ])
      };
    });
    if (
      mobileState.navPosition !== 'fixed' ||
      !mobileState.filtersOpen ||
      mobileState.filtersExpanded !== 'true' ||
      !mobileState.mobileBarVisible ||
      !mobileState.mobileQueueVisible ||
      !mobileState.mobileSendDisabled ||
      mobileState.navTargetHeight < 44 ||
      mobileState.sourceTargetHeight < 44 ||
      mobileState.filterTargetHeight < 44
    ) {
      throw new Error(`Modo mobile invalido: ${JSON.stringify(mobileState)}`);
    }
    const mobileQueue = await page.evaluate(() => {
      document.querySelector('#grid-queue').innerHTML = `
        <article class="queue-card">
          <div class="queue-story-column">
            <img class="queue-story-preview" src="/icon.svg" alt="">
          </div>
          <div class="queue-content">
            <div class="queue-card-heading">
              <span class="queue-status">Aguardando link afiliado</span>
              <span class="queue-discount">56% OFF</span>
            </div>
            <h3>Produto com um título longo para validar o layout móvel da fila</h3>
            <div class="queue-price"><span>De R$ 899</span><strong>Por R$ 386,23</strong></div>
            <a class="queue-product-link">1. Abrir produto no Mercado Livre</a>
            <div class="queue-affiliate-form">
              <label>Link gerado manualmente no Mercado Livre</label>
              <div class="queue-affiliate-row">
                <input class="queue-affiliate-input" placeholder="https://meli.la/...">
                <button>Validar link</button>
              </div>
            </div>
          </div>
        </article>`;
      document.querySelector('#btn-tab-queue').click();
      const card = document.querySelector('.queue-card');
      const content = document.querySelector('.queue-content');
      const preview = document.querySelector('.queue-story-column');
      const button = document.querySelector('.queue-affiliate-row button');
      return {
        columns: getComputedStyle(card).gridTemplateColumns.split(' ').length,
        cardWidth: card.getBoundingClientRect().width,
        contentFits: content.scrollWidth <= content.clientWidth,
        previewHeight: preview.getBoundingClientRect().height,
        buttonHeight: button.getBoundingClientRect().height,
        toolbarFits:
          document.querySelector('.queue-toolbar').scrollWidth <=
          document.querySelector('.queue-toolbar').clientWidth,
        filterColumns: getComputedStyle(
          document.querySelector('.queue-filters')
        ).gridTemplateColumns.split(' ').length
      };
    });
    if (
      mobileQueue.columns !== 1 ||
      mobileQueue.cardWidth > 390 ||
      !mobileQueue.contentFits ||
      mobileQueue.previewHeight !== 190 ||
      mobileQueue.buttonHeight < 44 ||
      !mobileQueue.toolbarFits ||
      mobileQueue.filterColumns !== 1
    ) {
      throw new Error(`Fila mobile invalida: ${JSON.stringify(mobileQueue)}`);
    }
    await page.click('#btn-tab-home');
    const mobileWidth = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth
    }));
    if (mobileWidth.document > mobileWidth.viewport) {
      throw new Error(
        `Interface excede a tela movel: ${mobileWidth.document}px ` +
        `para viewport de ${mobileWidth.viewport}px`
      );
    }

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

    if (pageErrors.length > 0) {
      throw new Error(`Erros no navegador: ${pageErrors.join(' | ')}`);
    }

    console.log(`[smoke] API e interface OK`);
    console.log(`[smoke] Mercado Livre: ${deals.deals.length} ofertas`);
    console.log(`[smoke] Amazon: ${amazon.deals.length} ofertas`);
    console.log(`[smoke] Shopee: ${shopee.deals.length} ofertas`);
    console.log(`[smoke] Cupons: ${deals.coupons.length}`);
    console.log(`[smoke] Screenshot: ${SCREENSHOT_PATH}`);
    console.log(`[smoke] Fila: ${QUEUE_SCREENSHOT_PATH}`);
  } finally {
    if (browser) await browser.close();
    if (!server.killed) server.kill();
  }
}

run().catch(error => {
  console.error(`[smoke] FALHA: ${error.stack || error.message}`);
  process.exitCode = 1;
});
