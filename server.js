const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const archiver = require('archiver');
const { exec, execFile, execSync } = require('child_process');
const { TAXONOMY, inferCategoryAndSub } = require('./execution/category_helper.js');
const {
  printSessionStatus,
  getSessionStatus,
  APP_RUNTIME_DIR,
  ensureSessionDirectories
} = require('./execution/session_config.js');
const {
  generateDealId,
  loadHistory,
  saveHistory,
  markPublishedEntryRemovedByMessageId,
  getTodayPublishedIds,
  countAutomaticPostsSince,
  selectBestUnpublished,
  getFreshness
} = require('./execution/automation_state.js');
const {
  buildWhatsappComparison,
  compareProductPrices,
  formatPrice,
  parsePrice
} = require('./execution/price_comparison.js');
const {
  searchMarketplaces
} = require('./execution/marketplace_search.js');
const {
  STATUSES: PUBLICATION_QUEUE_STATUSES,
  loadQueue: loadPublicationQueue,
  saveQueue: savePublicationQueue,
  enqueueOffer,
  setAffiliateLink,
  releaseExpiredClaims,
  claimAffiliateJobs,
  assertClaimOwner,
  recordAffiliateFailure,
  updateItemStatus,
  summarizeQueue,
  removeDiscardedItems,
  removeItems,
  validateQueueItems
} = require('./execution/publication_queue.js');
const {
  FAILURE_CODES,
  isValidWorkerToken,
  loadWorkers,
  saveWorkers,
  updateWorker,
  listWorkerStatus
} = require('./execution/local_affiliate_worker.js');
const {
  createBatchRecord,
  buildLinksText,
  buildOffersCsv,
  loadBatches,
  saveBatches,
  isSafeBatchId
} = require('./execution/publication_batches.js');

// puppeteer-core 25+ is ESM-only. Keep the rest of this server in CommonJS and
// load Puppeteer lazily only when the price-comparison endpoint needs it.
async function loadPuppeteer() {
  const { default: puppeteer } = await import('puppeteer-core');
  return puppeteer;
}

// Tratadores de erros globais para evitar que falhas do Puppeteer/WhatsApp Web crashem o servidor Express
process.on('uncaughtException', (err) => {
  console.error('💥 [Erro Não Capturado]:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [Rejeição Não Tratada]:', reason);
});

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "font-src 'self' https://fonts.gstatic.com",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com"
    ].join('; '),
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });
  next();
});

// Middleware para JSON com limite aumentado para aceitar imagens em Base64 do Canvas
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (path.extname(filePath) === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

const mlDealsReportPath = path.join(__dirname, 'mercado_livre_deals_report.json');
const amazonDealsReportPath = path.join(__dirname, 'amazon_deals_report.json');
const shopeeDealsReportPath = path.join(__dirname, 'shopee_deals_report.json');
const couponsPath = path.join(__dirname, 'coupons.json');
ensureSessionDirectories();
const historyPath = path.join(APP_RUNTIME_DIR, 'published_history.json');
const legacyHistoryPath = path.join(__dirname, '.tmp', 'published_history.json');
const couponConfirmationsPath = path.join(
  APP_RUNTIME_DIR,
  'coupon_confirmations.json'
);
const marketplaceSearchCachePath = path.join(
  APP_RUNTIME_DIR,
  'marketplace_search_cache.json'
);
const publicationQueuePath = path.join(
  APP_RUNTIME_DIR,
  'publication_queue.json'
);
const publicationQueueAssetsPath = path.join(
  APP_RUNTIME_DIR,
  'publication_queue_assets'
);
const localAffiliateWorkersPath = path.join(
  APP_RUNTIME_DIR,
  'local_affiliate_workers.json'
);
const publicationBatchesPath = path.join(
  APP_RUNTIME_DIR,
  'publication_batches.json'
);
const publicationBatchFilesPath = path.join(
  APP_RUNTIME_DIR,
  'publication_batches'
);
const publicationQueueEnabled =
  readEnv().PUBLICATION_QUEUE_ENABLED !== 'false';
const localAffiliateWorkerEnabled =
  readEnv().LOCAL_AFFILIATE_WORKER_ENABLED === 'true';
let queueValidationJob = {
  state: 'idle',
  phase: null,
  processed: 0,
  total: 0,
  result: null,
  error: null
};
const catalogRefreshInProgress = new Map();
const GROUP_NAME =
  readEnv().WHATSAPP_GROUP_ID ||
  readEnv().WHATSAPP_GROUP_NAME ||
  'Alerta de Descontos';

// Liveness do processo + estado informativo das integracoes.
// A rota sempre responde 200 enquanto o painel estiver vivo para evitar
// restart loops antes do primeiro QR code.
app.get('/api/health', (req, res) => {
  const persistedSessions = getSessionStatus();
  const whatsappStatus = whatsappEnabled && whatsapp
    ? whatsapp.getConnectionStatus()
    : { status: 'disabled', ready: false };

  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    whatsapp: whatsappStatus,
    sessions: {
      whatsapp: persistedSessions.whatsapp.available,
      mercadoLivre: persistedSessions.mercadoLivre.available
    }
  });
});

app.get('/api/data-status', (req, res) => {
  const readGeneratedAt = filePath => {
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')).generatedAt || null;
    } catch {
      return null;
    }
  };
  const staleAfterMinutes =
    Number(process.env.DEALS_STALE_AFTER_MINUTES) || 90;
  const history = loadHistory(historyPath, legacyHistoryPath);
  const todayPublishedIds = getTodayPublishedIds(history);
  const targetPerHour = Math.min(
    20,
    Math.max(15, Number(process.env.WPP_POSTS_PER_HOUR) || 15)
  );
  const { deals } = loadAvailableDeals();
  const uniqueCatalog = new Map(
    deals.map(deal => [generateDealId(deal), deal])
  );
  const availableToday = [...uniqueCatalog.keys()]
    .filter(dealId => !todayPublishedIds.has(dealId))
    .length;

  res.json({
    mercadoLivre: getFreshness(
      readGeneratedAt(mlDealsReportPath),
      staleAfterMinutes
    ),
    amazon: getFreshness(
      readGeneratedAt(amazonDealsReportPath),
      staleAfterMinutes
    ),
    shopee: getFreshness(
      readGeneratedAt(shopeeDealsReportPath),
      Number(readEnv().SHOPEE_STALE_AFTER_MINUTES) || 1560
    ),
    publishing: {
      enabled: process.env.AUTO_RUN_ENABLED === 'true',
      targetPerHour,
      sentLastHour: countAutomaticPostsSince(
        history,
        new Date(Date.now() - 60 * 60 * 1000)
      ),
      uniqueSentToday: todayPublishedIds.size,
      catalogSize: uniqueCatalog.size,
      availableToday,
      requiredUniquePerDay: targetPerHour * 24,
      estimatedCoverageHours: Number(
        (availableToday / targetPerHour).toFixed(1)
      )
    }
  });
});

// Função para ler variáveis do arquivo .env dinamicamente
function readEnv() {
  const envVars = { ...process.env };
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          const parts = line.split('=');
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim();
            envVars[key] = val;
          }
        }
      });
    } catch (e) {
      console.error('Erro ao ler .env:', e.message);
    }
  }
  return envVars;
}

// Informa o estado dos perfis antes de iniciar integracoes externas.
printSessionStatus();

// Conecta ao WhatsApp Web uma unica vez de forma global no servidor.
const whatsappEnabled = process.env.WHATSAPP_ENABLED !== 'false';
let whatsapp = null;
if (whatsappEnabled) {
  console.log('[Painel Web] Inicializando conexao persistente com o WhatsApp Web...');
  whatsapp = require('./execution/whatsapp_client.js');
} else {
  console.log('[Painel Web] WhatsApp Web desativado por WHATSAPP_ENABLED=false.');
}

// Inferência de Categoria e Subcategoria via Helper unificado
function inferCategory(title) {
  const info = inferCategoryAndSub(title);
  return `${info.icon} ${info.category} > ${info.subcategory}`;
}

function getPlatformTag(platform) {
  if (platform === 'amazon') return '🟡 *AMAZON*';
  if (platform === 'shopee') return '🟠 *SHOPEE*';
  return '🛍️ *MERCADO LIVRE*';
}

// GET /api/deals - Retorna a lista de promoções do Mercado Livre e cupons do dia
app.get('/api/deals', (req, res) => {
  let deals = [];
  let generatedAt = null;

  if (fs.existsSync(mlDealsReportPath)) {
    try {
      const rawData = fs.readFileSync(mlDealsReportPath, 'utf-8');
      const parsedData = JSON.parse(rawData);
      deals = parsedData.deals || [];
      generatedAt = parsedData.generatedAt || null;
    } catch (err) {
      console.error('Erro ao ler ofertas do Mercado Livre:', err);
    }
  }

  let coupons = [];
  if (fs.existsSync(couponsPath)) {
    try {
      const rawCoupons = fs.readFileSync(couponsPath, 'utf-8');
      coupons = JSON.parse(rawCoupons);
    } catch (err) {
      console.error('Erro ao ler cupons:', err);
    }
  }

  res.json({
    deals,
    coupons,
    generatedAt,
    freshness: getFreshness(
      generatedAt,
      Number(process.env.DEALS_STALE_AFTER_MINUTES) || 90
    )
  });
});

// Confirmação manual: o usuário testou o cupom no checkout.
app.post('/api/coupons/:code/confirm', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code || !fs.existsSync(couponsPath)) {
    return res.status(404).json({ error: 'Cupom nao encontrado.' });
  }

  try {
    const coupons = JSON.parse(fs.readFileSync(couponsPath, 'utf-8'));
    const coupon = coupons.find(item => item.code === code);
    if (!coupon) {
      return res.status(404).json({ error: 'Cupom nao encontrado.' });
    }
    coupon.verificationStatus = 'manually_confirmed';
    coupon.lastConfirmedAt = new Date().toISOString();
    fs.writeFileSync(couponsPath, JSON.stringify(coupons, null, 2), 'utf-8');
    let confirmations = {};
    if (fs.existsSync(couponConfirmationsPath)) {
      try {
        confirmations = JSON.parse(
          fs.readFileSync(couponConfirmationsPath, 'utf-8')
        );
      } catch {
        confirmations = {};
      }
    }
    confirmations[code] = coupon.lastConfirmedAt;
    fs.writeFileSync(
      couponConfirmationsPath,
      JSON.stringify(confirmations, null, 2),
      'utf-8'
    );
    res.json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ error: `Falha ao confirmar cupom: ${err.message}` });
  }
});

// GET /api/categories - Retorna a taxonomia de categorias e subcategorias
app.get('/api/categories', (req, res) => {
  res.json(TAXONOMY);
});

// GET /api/amazon-deals - Retorna as ofertas da Amazon
app.get('/api/amazon-deals', (req, res) => {
  let deals = [];
  let generatedAt = null;

  if (fs.existsSync(amazonDealsReportPath)) {
    try {
      const rawData = fs.readFileSync(amazonDealsReportPath, 'utf-8');
      const parsedData = JSON.parse(rawData);
      deals = parsedData.deals || [];
      generatedAt = parsedData.generatedAt || null;
    } catch (err) {
      console.error('Erro ao ler ofertas da Amazon:', err);
    }
  }

  res.json({
    deals,
    generatedAt,
    freshness: getFreshness(
      generatedAt,
      Number(process.env.DEALS_STALE_AFTER_MINUTES) || 90
    )
  });
});

function queueItemForResponse(item) {
  return {
    ...item,
    storyUrl: item.storyFile
      ? `/api/publication-queue/assets/${encodeURIComponent(item.storyFile)}`
      : null
  };
}

function requirePublicationQueue(req, res, next) {
  if (!publicationQueueEnabled) {
    return res.status(404).json({
      enabled: false,
      error: 'Fila de publicacao desativada.'
    });
  }
  next();
}

function requireLocalAffiliateWorker(req, res, next) {
  if (!localAffiliateWorkerEnabled) {
    return res.status(404).json({
      enabled: false,
      error: 'Worker local de afiliados desativado.'
    });
  }
  const expectedToken = readEnv().LOCAL_AFFILIATE_WORKER_TOKEN;
  if (!expectedToken) {
    return res.status(503).json({
      error: 'Token do worker local nao configurado no servidor.'
    });
  }
  if (!isValidWorkerToken(req.get('authorization'), expectedToken)) {
    return res.status(401).json({ error: 'Token do worker invalido.' });
  }
  next();
}

app.use('/api/local-affiliate-worker', (req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// GET /api/shopee-deals - Retorna o ultimo feed importado da Shopee
app.get('/api/shopee-deals', (req, res) => {
  let deals = [];
  let generatedAt = null;

  if (fs.existsSync(shopeeDealsReportPath)) {
    try {
      const parsedData = JSON.parse(
        fs.readFileSync(shopeeDealsReportPath, 'utf-8')
      );
      deals = parsedData.deals || [];
      generatedAt = parsedData.generatedAt || null;
    } catch (err) {
      console.error('Erro ao ler ofertas da Shopee:', err);
    }
  }

  res.json({
    deals,
    generatedAt,
    freshness: getFreshness(
      generatedAt,
      Number(readEnv().SHOPEE_STALE_AFTER_MINUTES) || 1560
    )
  });
});

function applyAffiliateLinkToQueue(
  queue,
  item,
  affiliateLink,
  observedPrice
) {
  let deals = loadAvailableDeals().deals;
  if (item.platform === 'shopee' && fs.existsSync(shopeeDealsReportPath)) {
    deals = JSON.parse(
      fs.readFileSync(shopeeDealsReportPath, 'utf-8')
    ).deals || [];
  }
  const currentDeal = deals.find(deal =>
    generateDealId({ ...deal, platform: item.platform }) === item.dealId
  );
  let reviewReason = null;
  let latestPrice = null;
  const verifiedPrice =
    parsePrice(observedPrice) ||
    parsePrice(currentDeal?.currentPrice);
  const storyPrice = parsePrice(item.currentPrice);
  if (
    verifiedPrice &&
    storyPrice &&
    Math.abs(verifiedPrice - storyPrice) >= 0.01
  ) {
    latestPrice = formatPrice(verifiedPrice);
    reviewReason =
      `O preco mudou de ${item.currentPrice} para ${latestPrice}. ` +
      'Gere um novo Story antes de publicar.';
  }
  return setAffiliateLink(
    queue,
    item.id,
    affiliateLink,
    { reviewReason, latestPrice }
  );
}

function loadQueueValidationCatalog(queue) {
  const reports = {
    mercado_livre: mlDealsReportPath,
    shopee: shopeeDealsReportPath
  };
  const activeStatuses = new Set([
    PUBLICATION_QUEUE_STATUSES.AWAITING_AFFILIATE,
    PUBLICATION_QUEUE_STATUSES.READY,
    PUBLICATION_QUEUE_STATUSES.NEEDS_REVIEW
  ]);
  const platforms = new Set(
    queue.items
      .filter(item => activeStatuses.has(item.status))
      .map(item => item.platform)
  );
  const catalog = new Map();
  for (const platform of platforms) {
    const reportPath = reports[platform];
    if (!reportPath || !fs.existsSync(reportPath)) {
      throw new Error(`Catalogo ${platform} indisponivel.`);
    }
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    if (!Array.isArray(report.catalog)) {
      throw new Error(
        `Atualize o catalogo ${platform} antes de validar a fila.`
      );
    }
    for (const deal of report.catalog) {
      catalog.set(
        generateDealId({ ...deal, platform }),
        { ...deal, platform }
      );
    }
  }
  return catalog;
}

function getQueueValidationPlatforms(queue) {
  const activeStatuses = new Set([
    PUBLICATION_QUEUE_STATUSES.AWAITING_AFFILIATE,
    PUBLICATION_QUEUE_STATUSES.READY,
    PUBLICATION_QUEUE_STATUSES.NEEDS_REVIEW
  ]);
  return [...new Set(
    queue.items
      .filter(item => activeStatuses.has(item.status))
      .map(item => item.platform)
      .filter(platform => platform === 'mercado_livre' || platform === 'shopee')
  )];
}

function generateStoryBuffer(deal, coupons) {
  const runId = crypto.randomUUID();
  const storiesDir = path.join(
    APP_RUNTIME_DIR,
    `queue-validation-${runId}`
  );
  const selectionPath = path.join(
    APP_RUNTIME_DIR,
    `queue-validation-${runId}.json`
  );
  const confirmedCoupon = coupons.find(
    coupon => coupon.verificationStatus === 'manually_confirmed'
  ) || null;
  fs.mkdirSync(storiesDir, { recursive: true });
  fs.writeFileSync(selectionPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    deals: [deal],
    selectedCoupon: confirmedCoupon
  }, null, 2), 'utf-8');

  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [
        path.join(__dirname, 'execution', 'generate_stories.js'),
        selectionPath
      ],
      {
        cwd: __dirname,
        env: { ...process.env, STORIES_OUTPUT_DIR: storiesDir },
        timeout: 120000,
        windowsHide: true
      },
      error => {
        try {
          if (error) throw error;
          const generated = fs.readdirSync(storiesDir)
            .find(file => file.endsWith('.jpg'));
          if (!generated) {
            throw new Error('Nenhum arquivo de Story foi gerado.');
          }
          resolve(fs.readFileSync(path.join(storiesDir, generated)));
        } catch (generationError) {
          reject(generationError);
        } finally {
          try { fs.unlinkSync(selectionPath); } catch {}
          fs.rmSync(storiesDir, { recursive: true, force: true });
        }
      }
    );
  });
}

async function runPublicationQueueValidation(jobId) {
  if (queueValidationJob.id !== jobId) return;
  try {
    const queue = loadPublicationQueue(publicationQueuePath);
    const platforms = getQueueValidationPlatforms(queue);
    queueValidationJob.platforms = platforms;
    await Promise.all(platforms.map(refreshCatalog));
    queueValidationJob.phase = 'validating';
    const catalog = loadQueueValidationCatalog(queue);
    const coupons = loadAvailableDeals().coupons;
    const preview = validateQueueItems(
      loadPublicationQueue(publicationQueuePath),
      catalog
    );
    queueValidationJob.total = preview.updated.length;
    queueValidationJob.phase = preview.updated.length > 0
      ? 'updating_stories'
      : 'validating';
    const storiesByDealId = new Map();

    for (const { item, current } of preview.updated) {
      storiesByDealId.set(
        item.dealId,
        await generateStoryBuffer(current, coupons)
      );
      queueValidationJob.processed += 1;
    }

    const result = validateQueueItems(
      loadPublicationQueue(publicationQueuePath),
      catalog
    );
    fs.mkdirSync(publicationQueueAssetsPath, { recursive: true });
    for (const { item, current } of result.updated) {
      let story = storiesByDealId.get(item.dealId);
      if (!story) story = await generateStoryBuffer(current, coupons);
      if (!item.storyFile) item.storyFile = `${item.id}.jpg`;
      fs.writeFileSync(
        path.join(publicationQueueAssetsPath, item.storyFile),
        story
      );
    }
    savePublicationQueue(publicationQueuePath, result.queue);
    removePublicationQueueAssets(result.removed);
    queueValidationJob = {
      ...queueValidationJob,
      state: 'completed',
      phase: 'completed',
      completedAt: new Date().toISOString(),
      result: {
        removed: result.removed.length,
        updated: result.updated.length,
        unchanged: result.unchanged,
        summary: summarizeQueue(result.queue)
      }
    };
  } catch (error) {
    console.error(`Erro ao validar fila: ${error.message}`);
    queueValidationJob = {
      ...queueValidationJob,
      state: 'failed',
      phase: 'failed',
      completedAt: new Date().toISOString(),
      error: error.message
    };
  }
}

function getAffiliateProcessingSummary(queue) {
  const result = {
    awaiting: 0,
    processing: 0,
    ready: 0,
    errors: 0
  };
  for (const item of queue.items) {
    if (item.status === PUBLICATION_QUEUE_STATUSES.AWAITING_AFFILIATE) {
      result.awaiting += 1;
    }
    if (item.affiliateProcessing?.state === 'claimed') {
      result.processing += 1;
    }
    if (item.status === PUBLICATION_QUEUE_STATUSES.READY) result.ready += 1;
    if (item.affiliateProcessing?.state === 'error') result.errors += 1;
  }
  return result;
}

function timingSafeTextEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ''));
  const right = Buffer.from(String(rightValue || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function batchForResponse(batch) {
  return {
    id: batch.id,
    name: batch.name,
    createdAt: batch.createdAt,
    itemCount: batch.items.length,
    downloadUrl:
      `/api/publication-batches/${encodeURIComponent(batch.id)}/download` +
      `?token=${encodeURIComponent(batch.downloadToken)}`,
    items: batch.items.map(item => ({
      ...item,
      storyUrl:
        `/api/publication-queue/assets/${encodeURIComponent(item.storyFile)}`
    }))
  };
}

function createBatchZip(batch) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(publicationBatchFilesPath, { recursive: true });
    const zipPath = path.join(publicationBatchFilesPath, `${batch.id}.zip`);
    const temporaryPath = `${zipPath}.${process.pid}.tmp`;
    const output = fs.createWriteStream(temporaryPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    const fail = error => {
      output.destroy();
      fs.rmSync(temporaryPath, { force: true });
      reject(error);
    };
    output.on('close', () => {
      try {
        fs.renameSync(temporaryPath, zipPath);
        resolve(zipPath);
      } catch (error) {
        fail(error);
      }
    });
    output.on('error', fail);
    archive.on('error', fail);
    archive.pipe(output);
    for (const item of batch.items) {
      const storyPath = path.join(publicationQueueAssetsPath, item.storyFile);
      archive.file(storyPath, {
        name: `${batch.folderName}/${item.imageFile}`
      });
    }
    archive.append(buildLinksText(batch), {
      name: `${batch.folderName}/links.txt`
    });
    archive.append(buildOffersCsv(batch), {
      name: `${batch.folderName}/ofertas.csv`
    });
    const portableManifest = {
      ...batch,
      downloadToken: undefined
    };
    archive.append(JSON.stringify(portableManifest, null, 2), {
      name: `${batch.folderName}/manifest.json`
    });
    archive.finalize();
  });
}

// Fila assistida: organiza o Story e aceita link manual ou do worker local.
app.get('/api/publication-queue', (req, res) => {
  if (!publicationQueueEnabled) {
    return res.json({
      enabled: false,
      items: [],
      summary: summarizeQueue({ items: [] })
    });
  }
  const queue = loadPublicationQueue(publicationQueuePath);
  res.json({
    enabled: true,
    items: queue.items.map(queueItemForResponse),
    summary: summarizeQueue(queue)
  });
});

app.post(
  '/api/publication-queue',
  requirePublicationQueue,
  (req, res) => {
    try {
      const deal = req.body?.deal || {};
      const platform = String(req.body?.platform || '').toLowerCase();
      const normalizedPlatform = ['ml', 'mercado livre', 'mercado_livre']
        .includes(platform)
        ? 'mercado_livre'
        : platform;
      const queue = loadPublicationQueue(publicationQueuePath);
      const result = enqueueOffer(queue, {
        dealId: generateDealId({
          ...deal,
          platform: normalizedPlatform
        }),
        platform: normalizedPlatform,
        title: deal.title,
        originalPrice: deal.originalPrice,
        currentPrice: deal.currentPrice,
        discount: deal.discount,
        image: deal.image,
        productLink: deal.link
      });

      if (result.created) {
        const { coupons } = loadAvailableDeals();
        const storyImagePath = generateStory(
          { ...deal, platform: normalizedPlatform },
          coupons
        );
        fs.mkdirSync(publicationQueueAssetsPath, { recursive: true });
        result.item.storyFile = `${result.item.id}.jpg`;
        fs.copyFileSync(
          storyImagePath,
          path.join(publicationQueueAssetsPath, result.item.storyFile),
        );
        savePublicationQueue(publicationQueuePath, result.queue);
      }

      res.status(result.created ? 201 : 200).json({
        success: true,
        created: result.created,
        item: queueItemForResponse(result.item)
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.get(
  '/api/publication-queue/assets/:fileName',
  requirePublicationQueue,
  (req, res) => {
    const fileName = path.basename(String(req.params.fileName || ''));
    const queue = loadPublicationQueue(publicationQueuePath);
    const ownsAsset = queue.items.some(item => item.storyFile === fileName);
    if (!fileName || !ownsAsset) {
      return res.status(404).send('Story nao encontrado.');
    }
    res.sendFile(
      path.join(publicationQueueAssetsPath, fileName),
      { dotfiles: 'allow' }
    );
  }
);

app.patch(
  '/api/publication-queue/:itemId/affiliate',
  requirePublicationQueue,
  (req, res) => {
    try {
      const queue = loadPublicationQueue(publicationQueuePath);
      const item = queue.items.find(entry => entry.id === req.params.itemId);
      if (!item) {
        return res.status(404).json({ error: 'Item da fila nao encontrado.' });
      }

      const result = applyAffiliateLinkToQueue(
        queue,
        item,
        req.body?.affiliateLink,
        req.body?.observedPrice
      );
      savePublicationQueue(publicationQueuePath, result.queue);
      res.json({
        success: true,
        ready: result.item.status === PUBLICATION_QUEUE_STATUSES.READY,
        item: queueItemForResponse(result.item)
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.patch(
  '/api/publication-queue/:itemId/status',
  requirePublicationQueue,
  (req, res) => {
    try {
      const queue = loadPublicationQueue(publicationQueuePath);
      const result = updateItemStatus(
        queue,
        req.params.itemId,
        req.body?.status
      );
      savePublicationQueue(publicationQueuePath, result.queue);
      res.json({
        success: true,
        item: queueItemForResponse(result.item)
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.post(
  '/api/publication-queue/validate',
  requirePublicationQueue,
  (req, res) => {
    if (queueValidationJob.state !== 'running') {
      queueValidationJob = {
        id: crypto.randomUUID(),
        state: 'running',
        phase: 'updating_catalogs',
        startedAt: new Date().toISOString(),
        completedAt: null,
        platforms: [],
        processed: 0,
        total: 0,
        result: null,
        error: null
      };
      setImmediate(() =>
        runPublicationQueueValidation(queueValidationJob.id)
      );
    }
    res.status(202).json(queueValidationJob);
  }
);

app.get(
  '/api/publication-queue/validation',
  requirePublicationQueue,
  (req, res) => res.json(queueValidationJob)
);

app.get('/api/local-affiliate-worker/status', (req, res) => {
  if (!localAffiliateWorkerEnabled) {
    return res.json({
      enabled: false,
      workers: [],
      queue: getAffiliateProcessingSummary({ items: [] })
    });
  }
  const queue = releaseExpiredClaims(
    loadPublicationQueue(publicationQueuePath)
  );
  savePublicationQueue(publicationQueuePath, queue);
  const workers = listWorkerStatus(loadWorkers(localAffiliateWorkersPath));
  res.json({
    enabled: true,
    workers,
    queue: getAffiliateProcessingSummary(queue),
    authRequired: workers.some(worker =>
      worker.status === 'auth_required' && worker.online
    )
  });
});

app.post(
  '/api/local-affiliate-worker/heartbeat',
  requireLocalAffiliateWorker,
  (req, res) => {
    try {
      const workers = loadWorkers(localAffiliateWorkersPath);
      const worker = updateWorker(workers, req.body);
      saveWorkers(localAffiliateWorkersPath, workers);
      res.json({ success: true, worker });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.post(
  '/api/local-affiliate-worker/claim',
  requireLocalAffiliateWorker,
  (req, res) => {
    try {
      const env = readEnv();
      const leaseMs = Math.max(
        60000,
        Number(env.LOCAL_AFFILIATE_CLAIM_MINUTES || 5) * 60000
      );
      const maxAttempts = Math.min(
        10,
        Math.max(1, Number(env.LOCAL_AFFILIATE_MAX_ATTEMPTS) || 3)
      );
      const queue = loadPublicationQueue(publicationQueuePath);
      const result = claimAffiliateJobs(queue, {
        deviceId: req.body?.deviceId,
        limit: req.body?.limit,
        leaseMs,
        maxAttempts,
        excludeItemIds: req.body?.excludeItemIds,
        retryFailed: req.body?.retryFailed === true
      });
      savePublicationQueue(publicationQueuePath, result.queue);

      const workers = loadWorkers(localAffiliateWorkersPath);
      const existing = workers.workers.find(worker =>
        worker.deviceId === req.body?.deviceId
      );
      updateWorker(workers, {
        ...existing,
        ...req.body,
        status: result.jobs.length ? 'processing' : 'idle',
        currentItemId: result.jobs[0]?.id || null
      });
      saveWorkers(localAffiliateWorkersPath, workers);

      res.json({
        success: true,
        jobs: result.jobs.map(item => ({
          id: item.id,
          platform: item.platform,
          title: item.title,
          productLink: item.productLink,
          claimExpiresAt: item.affiliateProcessing.claimExpiresAt,
          attempts: item.affiliateProcessing.attempts
        }))
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.post(
  '/api/local-affiliate-worker/jobs/:itemId/complete',
  requireLocalAffiliateWorker,
  (req, res) => {
    try {
      const deviceId = String(req.body?.deviceId || '').trim();
      const queue = loadPublicationQueue(publicationQueuePath);
      const item = queue.items.find(entry => entry.id === req.params.itemId);
      if (!item) {
        return res.status(404).json({ error: 'Item da fila nao encontrado.' });
      }
      assertClaimOwner(item, deviceId, new Date());
      const result = applyAffiliateLinkToQueue(
        queue,
        item,
        req.body?.affiliateLink,
        req.body?.observedPrice
      );
      savePublicationQueue(publicationQueuePath, result.queue);

      const workers = loadWorkers(localAffiliateWorkersPath);
      const current = workers.workers.find(worker =>
        worker.deviceId === deviceId
      );
      updateWorker(workers, {
        ...current,
        deviceId,
        status: 'idle',
        currentItemId: null,
        processedCount: (current?.processedCount || 0) + 1
      });
      saveWorkers(localAffiliateWorkersPath, workers);
      res.json({
        success: true,
        ready: result.item.status === PUBLICATION_QUEUE_STATUSES.READY,
        item: queueItemForResponse(result.item)
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.post(
  '/api/local-affiliate-worker/jobs/:itemId/fail',
  requireLocalAffiliateWorker,
  (req, res) => {
    try {
      const code = String(req.body?.code || 'UNKNOWN_ERROR');
      if (!FAILURE_CODES.has(code)) {
        throw new Error('Codigo de falha invalido.');
      }
      const deviceId = String(req.body?.deviceId || '').trim();
      const queue = loadPublicationQueue(publicationQueuePath);
      const result = recordAffiliateFailure(
        queue,
        req.params.itemId,
        {
          deviceId,
          code,
          message: req.body?.message,
          maxAttempts: Math.min(
            10,
            Math.max(
              1,
              Number(readEnv().LOCAL_AFFILIATE_MAX_ATTEMPTS) || 3
            )
          )
        }
      );
      savePublicationQueue(publicationQueuePath, result.queue);

      const workers = loadWorkers(localAffiliateWorkersPath);
      const current = workers.workers.find(worker =>
        worker.deviceId === deviceId
      );
      updateWorker(workers, {
        ...current,
        deviceId,
        status: code === 'AUTH_REQUIRED' ? 'auth_required' : 'error',
        currentItemId: null,
        lastError: req.body?.message || code
      });
      saveWorkers(localAffiliateWorkersPath, workers);
      res.json({
        success: true,
        item: queueItemForResponse(result.item)
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.get('/api/publication-batches', requirePublicationQueue, (req, res) => {
  const batches = loadBatches(publicationBatchesPath);
  res.json({
    enabled: true,
    batches: batches.batches.map(batchForResponse)
  });
});

app.post(
  '/api/publication-batches',
  requirePublicationQueue,
  async (req, res) => {
    try {
      const queue = loadPublicationQueue(publicationQueuePath);
      const batch = createBatchRecord(queue, req.body);
      await createBatchZip(batch);
      const batches = loadBatches(publicationBatchesPath);
      batches.batches.unshift(batch);
      saveBatches(publicationBatchesPath, batches);
      res.status(201).json({
        success: true,
        batch: batchForResponse(batch)
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

function removePublicationQueueAssets(items) {
  for (const item of items) {
      const fileName = path.basename(String(item.storyFile || ''));
      if (!fileName || fileName !== item.storyFile) continue;
      try {
        fs.unlinkSync(path.join(publicationQueueAssetsPath, fileName));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Erro ao remover Story descartado: ${error.message}`);
        }
      }
    }
}

app.delete(
  '/api/publication-queue',
  requirePublicationQueue,
  (req, res) => {
    try {
      const result = removeItems(
        loadPublicationQueue(publicationQueuePath),
        req.body?.itemIds
      );
      savePublicationQueue(publicationQueuePath, result.queue);
      removePublicationQueueAssets(result.removed);
      res.json({
        success: true,
        removedCount: result.removed.length,
        summary: summarizeQueue(result.queue)
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

app.delete(
  '/api/publication-queue/discarded',
  requirePublicationQueue,
  (req, res) => {
    const result = removeDiscardedItems(
      loadPublicationQueue(publicationQueuePath)
    );
    savePublicationQueue(publicationQueuePath, result.queue);
    removePublicationQueueAssets(result.removed);
    res.json({
      success: true,
      removedCount: result.removed.length,
      summary: summarizeQueue(result.queue)
    });
  }
);

app.get(
  '/api/publication-batches/:batchId/download',
  requirePublicationQueue,
  (req, res, next) => {
    const batchId = String(req.params.batchId || '');
    if (!isSafeBatchId(batchId)) {
      return res.status(400).json({ error: 'Identificador de lote invalido.' });
    }
    const batches = loadBatches(publicationBatchesPath);
    const batch = batches.batches.find(item => item.id === batchId);
    if (
      !batch ||
      !timingSafeTextEqual(req.query.token, batch.downloadToken)
    ) {
      return res.status(404).json({ error: 'Pacote nao encontrado.' });
    }
    const zipPath = path.join(publicationBatchFilesPath, `${batch.id}.zip`);
    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({ error: 'Arquivo ZIP nao encontrado.' });
    }
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${batch.folderName}.zip"`
    );
    res.type('application/zip');
    res.setHeader('Content-Length', fs.statSync(zipPath).size);
    fs.createReadStream(zipPath).on('error', next).pipe(res);
  }
);

// POST /api/scrape - Dispara scraping do Mercado Livre + Cupons (concorrente)
app.post('/api/scrape', async (req, res) => {
  console.log('Disparando scraper de ofertas do Mercado Livre e Cupons...');
  try {
    await refreshCatalog('mercado_livre');
    console.log('Scraping do ML e Cupons concluído!');
    const rawData = fs.readFileSync(mlDealsReportPath, 'utf-8');
    const parsedData = JSON.parse(rawData);

    let coupons = [];
    if (fs.existsSync(couponsPath)) {
      coupons = JSON.parse(fs.readFileSync(couponsPath, 'utf-8'));
    }

    res.json({
      success: true,
      data: {
        deals: parsedData.deals || [],
        coupons,
        generatedAt: parsedData.generatedAt || null,
        freshness: getFreshness(
          parsedData.generatedAt,
          Number(process.env.DEALS_STALE_AFTER_MINUTES) || 90
        )
      }
    });
  } catch (error) {
    console.error(`Erro no scraping do ML: ${error.message}`);
    res.status(500).json({
      error: `Falha ao atualizar ofertas do ML: ${error.message}`
    });
  }
});

// POST /api/scrape-amazon - Dispara o scraper de ofertas da Amazon
app.post('/api/scrape-amazon', (req, res) => {
  console.log('Disparando scraper de ofertas da Amazon...');
  exec('node execution/amazon_deals.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Erro no scraping da Amazon: ${error.message}`);
      return res.status(500).json({ error: `Falha ao atualizar ofertas da Amazon: ${error.message}` });
    }
    
    console.log('Scraping da Amazon concluído!');
    try {
      const rawData = fs.readFileSync(amazonDealsReportPath, 'utf-8');
      const parsedData = JSON.parse(rawData);
      res.json({
        success: true,
        data: {
          deals: parsedData.deals || [],
          generatedAt: parsedData.generatedAt || null,
          freshness: getFreshness(
            parsedData.generatedAt,
            Number(process.env.DEALS_STALE_AFTER_MINUTES) || 90
          )
        }
      });
    } catch (e) {
      res.status(500).json({ error: 'Scraping da Amazon concluído, mas erro ao ler resultados.' });
    }
  });
});

// POST /api/refresh-shopee - Verifica o ETag e importa somente se mudou
app.post('/api/refresh-shopee', async (req, res) => {
  try {
    await refreshCatalog('shopee');
    const parsedData = JSON.parse(
      fs.readFileSync(shopeeDealsReportPath, 'utf-8')
    );
    res.json({
      success: true,
      data: {
        deals: parsedData.deals || [],
        generatedAt: parsedData.generatedAt || null,
        freshness: getFreshness(
          parsedData.generatedAt,
          Number(readEnv().SHOPEE_STALE_AFTER_MINUTES) || 1560
        )
      }
    });
  } catch (error) {
    console.error(`Erro ao atualizar ofertas da Shopee: ${error.message}`);
    res.status(500).json({
      error: `Falha ao atualizar ofertas da Shopee: ${error.message}`
    });
  }
});

// GET /api/proxy-image - Proxy para baixar imagens de domínios externos e evitar problemas de CORS no Canvas
app.get('/api/proxy-image', (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('URL da imagem é necessária.');
  }

  const allowedHosts = [
    'mlstatic.com',
    'media-amazon.com',
    'ssl-images-amazon.com',
    'cf.shopee.com.br'
  ];
  const parseAllowedUrl = value => {
    try {
      const parsed = new URL(value);
      const allowed = parsed.protocol === 'https:' &&
        allowedHosts.some(host =>
          parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
        );
      return allowed ? parsed : null;
    } catch {
      return null;
    }
  };

  function downloadImage(url, responseStream, redirectCount = 0) {
    if (redirectCount > 5) {
      return responseStream.status(500).send('Excesso de redirecionamentos no proxy de imagem.');
    }

    const parsedUrl = parseAllowedUrl(url);
    if (!parsedUrl) {
      return responseStream.status(400).send('Domínio de imagem não permitido.');
    }

    const request = https.get(parsedUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, imageRes => {
      if (
        imageRes.statusCode >= 300 &&
        imageRes.statusCode < 400 &&
        imageRes.headers.location
      ) {
        imageRes.resume();
        const redirectUrl = new URL(imageRes.headers.location, parsedUrl).href;
        return downloadImage(redirectUrl, responseStream, redirectCount + 1);
      }

      const contentType = imageRes.headers['content-type'] || '';
      if (imageRes.statusCode !== 200 || !contentType.startsWith('image/')) {
        imageRes.resume();
        return responseStream
          .status(imageRes.statusCode || 502)
          .send('A origem não retornou uma imagem válida.');
      }

      const maxBytes = 8 * 1024 * 1024;
      const contentLength = Number(imageRes.headers['content-length']) || 0;
      if (contentLength > maxBytes) {
        imageRes.resume();
        return responseStream.status(413).send('Imagem muito grande.');
      }

      let receivedBytes = 0;
      responseStream.setHeader('Content-Type', contentType);
      responseStream.setHeader('Cache-Control', 'public, max-age=86400');
      imageRes.on('data', chunk => {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          imageRes.destroy();
          responseStream.destroy();
          return;
        }
        responseStream.write(chunk);
      });
      imageRes.on('end', () => responseStream.end());
      imageRes.on('error', () => responseStream.destroy());
    });
    request.setTimeout(15000, () => request.destroy(new Error('Timeout da imagem')));
    request.on('error', err => {
      if (!responseStream.headersSent) {
        console.error('Erro no proxy de imagem:', err.message);
        responseStream.status(500).send('Erro ao baixar imagem via proxy.');
      } else {
        responseStream.destroy();
      }
    });
  }

  downloadImage(imageUrl, res);
});

// Localiza o executável do navegador para o Puppeteer Core
function findBrowserPath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.USERPROFILE || 'C:\\Users\\danie', 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Limpa o título da busca para mandar ao Buscapé/Zoom de forma ultra inteligente
function cleanSearchQuery(title) {
  if (!title) return '';
  
  const brandList = [
    'lg', 'samsung', 'apple', 'iphone', 'jbl', 'xiaomi', 'asus', 'motorola', 'acer', 'dell',
    'growth', 'soldiers', 'max titanium', 'mondial', 'britania', 'britânia', 'oster', 'philco',
    'arno', 'philips', 'aoc', 'tcl', 'playstation', 'xbox', 'nintendo', 'logitech', 'redragon'
  ];

  const typeList = [
    'tv', 'smart tv', 'televisao', 'televisão', 'creatina', 'whey', 'fone', 'headphone',
    'smartphone', 'celular', 'geladeira', 'refrigerador', 'fritadeira', 'airfryer',
    'liquidificador', 'teclado', 'mouse', 'monitor', 'notebook', 'laptop', 'tablet'
  ];

  const lowerTitle = title.toLowerCase();
  
  let foundBrand = '';
  for (const brand of brandList) {
    if (lowerTitle.includes(brand)) {
      foundBrand = brand;
      break;
    }
  }

  let foundType = '';
  for (const type of typeList) {
    if (lowerTitle.includes(type)) {
      foundType = type;
      break;
    }
  }

  // Pega especificações de tamanho/capacidade (ex: 50", 500g, 128gb, etc.)
  const unitRegex = /\b(\d+(?:\.\d+)?\s*(?:(?:"|in|inch|polegadas|pol|g|kg|gb|tb|ml|l|hz|w|v|mah|k)))\b/gi;
  const specMatches = lowerTitle.match(unitRegex) || [];

  // Pega palavras alfanuméricas com letras e números (códigos de modelo como qned73, 510bt, etc.)
  const modelRegex = /\b([a-z]+\d+|\d+[a-z]+[a-z0-9]*)\b/gi;
  const modelMatches = lowerTitle.match(modelRegex) || [];

  let keywords = [];
  if (foundType) keywords.push(foundType);
  if (foundBrand && foundBrand !== foundType) keywords.push(foundBrand);
  
  modelMatches.forEach(m => {
    if (!keywords.includes(m) && m.length > 2) keywords.push(m);
  });

  specMatches.forEach(s => {
    const cleanSpec = s.replace(/\s+/g, '').replace(/["']/g, ''); // tira aspas para facilitar busca
    if (!keywords.includes(cleanSpec)) keywords.push(cleanSpec);
  });

  if (keywords.length < 2) {
    let clean = lowerTitle
      .replace(/[^\w\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const stopWords = ['com', 'para', 'com', 'frete', 'gratis', 'grátis', 'original', 'pote', 'promocao', 'promoção', 'oficial'];
    let words = clean.split(' ').filter(w => w.length > 2 && !stopWords.includes(w));
    return words.slice(0, 4).join(' ');
  }

  return keywords.join(' ');
}

// Comparador principal: valida similaridade, reutiliza cache persistente e
// deixa claro que o resultado é uma estimativa automática.
app.get('/api/compare-price', async (req, res) => {
  if (process.env.MARKETPLACE_SEARCH_ENABLED === 'false') {
    return res.status(503).json({ error: 'Comparação de preços desativada.' });
  }
  const query = String(req.query.q || '').trim();
  if (query.length < 2 || query.length > 300) {
    return res.status(400).json({
      error: 'Informe um produto com 2 a 300 caracteres.'
    });
  }
  const comparison = await compareProductPrices({
    title: query,
    currentPrice: req.query.price,
    sourceUrl: String(req.query.sourceUrl || ''),
    cachePath: marketplaceSearchCachePath,
    cacheMinutes:
      Number(process.env.MARKETPLACE_SEARCH_CACHE_MINUTES) || 30,
    maxPerMarketplace: Math.min(
      8,
      Math.max(
        1,
        Number(process.env.MARKETPLACE_SEARCH_RESULTS_PER_SITE) || 4
      )
    )
  });
  res.json(comparison);
});

// Pesquisa manual e isolada em marketplaces. Esta rota apenas devolve links:
// nao seleciona ofertas, nao cria Stories e nao chama o WhatsApp.
app.get('/api/marketplace-search', async (req, res) => {
  if (process.env.MARKETPLACE_SEARCH_ENABLED === 'false') {
    return res.status(503).json({ error: 'Pesquisa geral desativada.' });
  }
  const query = String(req.query.q || '').trim();
  if (query.length < 2 || query.length > 120) {
    return res.status(400).json({
      error: 'Informe um produto com 2 a 120 caracteres.'
    });
  }
  const maxPerMarketplace = Math.min(
    8,
    Math.max(
      1,
      Number(process.env.MARKETPLACE_SEARCH_RESULTS_PER_SITE) || 4
    )
  );
  const result = await searchMarketplaces({
    query,
    cachePath: marketplaceSearchCachePath,
    cacheMinutes:
      Number(process.env.MARKETPLACE_SEARCH_CACHE_MINUTES) || 30,
    maxPerMarketplace
  });
  res.status(result.success ? 200 : 502).json(result);
});

// Mantido temporariamente para diagnóstico enquanto o comparador novo é
// validado em produção. O painel e o publicador não chamam esta rota.
app.get('/api/compare-price-legacy', async (req, res) => {
  const query = req.query.q;
  const currentPrice = parseFloat(req.query.price) || 0;
  
  if (!query) {
    return res.status(400).json({ error: 'Parâmetro q é obrigatório' });
  }

  const cleanQuery = cleanSearchQuery(query);
  console.log(`🔍 [Comparador] Buscando por: "${cleanQuery}" (Título original: "${query}", Preço Promoção: R$ ${currentPrice})`);

  const execPath = findBrowserPath();
  if (!execPath) {
    console.warn(`   ⚠️ [Comparador] Navegador Chrome/Chromium não encontrado no sistema.`);
    return res.json({ success: false, error: 'Executável do Chrome não localizado no servidor' });
  }

  let browser;
  try {
    const puppeteer = await loadPuppeteer();
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: execPath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // Função auxiliar para raspar um site específico (Buscape, Zoom ou Bondfaro) de forma ultra resiliente e paralela
    async function scrapeSite(browser, url, targetPrice) {
      let page;
      try {
        page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36");
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Espera por qualquer strong ou tag contendo R$ por até 6 segundos (indica que os preços foram hidratados na tela)
        await page.waitForFunction(() => {
          return Array.from(document.querySelectorAll('strong, span, p')).some(el => el.textContent.includes('R$'));
        }, { timeout: 6000 });
        
        const result = await page.evaluate((limitPrice) => {
          // Seleciona apenas os containers de cards de produtos do resultado de busca (evitando menus, rodapés e anúncios laterais)
          const cards = Array.from(document.querySelectorAll('[class*="ProductCard"], [class*="HitCard"], [class*="ProductCardArea"]'));
          
          // Limite dinâmico para ignorar fretes/acessórios: 60% do preço do produto atual ou R$ 15,00 se não fornecido
          const cutoff = limitPrice > 0 ? (limitPrice * 0.6) : 15;
          
          let parsedPrices = [];
          if (cards.length > 0) {
            cards.forEach(card => {
              // Busca todos os sub-elementos do card e descarta parcelamentos e preços riscados
              const elements = Array.from(card.querySelectorAll('*'));
              const cardPrices = elements
                .filter(el => {
                  const style = window.getComputedStyle(el);
                  const isRiscado = style.textDecoration.includes('line-through') || el.tagName === 'DEL' || el.tagName === 'S' || el.closest('del') || el.closest('s');
                  const hasX = el.textContent.toLowerCase().includes('x');
                  return el.textContent.includes('R$') && !isRiscado && !hasX;
                })
                .map(el => el.textContent.trim())
                .map(text => {
                  const match = text.match(/R\$\s*([0-9.,]+)/i);
                  if (!match) return null;
                  const clean = match[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                  return parseFloat(clean);
                })
                .filter(val => val !== null && !isNaN(val) && val >= cutoff);

              if (cardPrices.length > 0) {
                // Adiciona o menor preço válido encontrado dentro deste card específico
                parsedPrices.push(Math.min(...cardPrices));
              }
            });
          } else {
            // Fallback resiliente genérico na página completa
            const allElements = Array.from(document.querySelectorAll('strong, span, p, div, a'));
            const fallbackPrices = allElements
              .filter(el => {
                const style = window.getComputedStyle(el);
                const isRiscado = style.textDecoration.includes('line-through') || el.tagName === 'DEL' || el.tagName === 'S' || el.closest('del') || el.closest('s');
                const hasX = el.textContent.toLowerCase().includes('x');
                // Evita pegar blocos de texto muito grandes que contenham R$ de forma acidental
                return el.textContent.includes('R$') && !isRiscado && !hasX && el.textContent.length < 50;
              })
              .map(el => el.textContent.trim())
              .map(text => {
                const match = text.match(/R\$\s*([0-9.,]+)/i);
                if (!match) return null;
                const clean = match[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                return parseFloat(clean);
              })
              .filter(val => val !== null && !isNaN(val) && val >= cutoff);

            parsedPrices = fallbackPrices;
          }
            
          if (parsedPrices.length === 0) return null;
          
          const minPrice = Math.min(...parsedPrices);
          return {
            minPrice,
            priceText: `R$ ${minPrice.toFixed(2).replace('.', ',')}`
          };
        }, targetPrice);
        
        await page.close();
        return result;
      } catch (e) {
        console.warn(`      ⚠️ Falha ao raspar a URL: ${url} - ${e.message}`);
        if (page) {
          try { await page.close(); } catch (errClose) {}
        }
        return null;
      }
    }

    // URLs dos 3 buscadores
    const buscapeUrl = `https://www.buscape.com.br/search?q=${encodeURIComponent(cleanQuery)}`;
    const zoomUrl = `https://www.zoom.com.br/search?q=${encodeURIComponent(cleanQuery)}`;
    const bondfaroUrl = `https://www.bondfaro.com.br/search?q=${encodeURIComponent(cleanQuery)}`;

    console.log(`   🔎 Buscando em paralelo no Buscapé, Zoom e Bondfaro...`);
    
    const [buscapeRes, zoomRes, bondfaroRes] = await Promise.all([
      scrapeSite(browser, buscapeUrl, currentPrice),
      scrapeSite(browser, zoomUrl, currentPrice),
      scrapeSite(browser, bondfaroUrl, currentPrice)
    ]);

    await browser.close();
    
    const responseData = {
      success: false,
      query: cleanQuery,
      buscape: buscapeRes ? { price: buscapeRes.minPrice, priceText: buscapeRes.priceText, url: buscapeUrl } : null,
      zoom: zoomRes ? { price: zoomRes.minPrice, priceText: zoomRes.priceText, url: zoomUrl } : null,
      bondfaro: bondfaroRes ? { price: bondfaroRes.minPrice, priceText: bondfaroRes.priceText, url: bondfaroUrl } : null
    };

    if (buscapeRes || zoomRes || bondfaroRes) {
      responseData.success = true;
      
      const validPrices = [
        buscapeRes ? buscapeRes.minPrice : null,
        zoomRes ? zoomRes.minPrice : null,
        bondfaroRes ? bondfaroRes.minPrice : null
      ].filter(p => p !== null);
      
      const minPrice = Math.min(...validPrices);
      responseData.minPrice = minPrice;
      responseData.priceText = `R$ ${minPrice.toFixed(2).replace('.', ',')}`;
      // URL principal de redirecionamento (Buscapé se disponível, senão Zoom, senão Bondfaro)
      responseData.url = buscapeRes ? buscapeUrl : (zoomRes ? zoomUrl : bondfaroUrl);
      
      console.log(`   ✅ [Comparador] Melhor preço de mercado encontrado: ${responseData.priceText}`);
      res.json(responseData);
    } else {
      console.log(`   ⚠️ [Comparador] Nenhum preço válido encontrado nos 3 buscadores.`);
      res.json({
        success: false,
        error: 'Nenhum preço encontrado nos resultados do Buscapé, Zoom ou Bondfaro'
      });
    }
  } catch (err) {
    if (browser) await browser.close();
    console.error(`   ❌ [Comparador] Erro no fluxo de comparação:`, err.message);
    res.json({
      success: false,
      error: `Busca falhou: ${err.message}`
    });
  }
});

// POST /api/generate - Gera os Stories no template compartilhado e envia ao WhatsApp.
app.post('/api/generate', async (req, res) => {
  const { selectedDeals } = req.body;
  
  if (!Array.isArray(selectedDeals) || selectedDeals.length === 0) {
    return res.status(400).json({ error: 'Nenhuma oferta selecionada para envio.' });
  }

  const whatsappStatus = whatsappEnabled && whatsapp
    ? whatsapp.getConnectionStatus()
    : { status: 'disabled', ready: false };
  if (!whatsappStatus.ready) {
    return res.status(503).json({
      success: false,
      error:
        `WhatsApp indisponível (${whatsappStatus.status}). ` +
        'Reconecte a sessão antes de enviar.'
    });
  }

  console.log(`\n📤 [Painel Web] Gerando e enviando ${selectedDeals.length} ofertas para o WhatsApp...`);

  const results = [];
  const { coupons } = loadAvailableDeals();

  try {
    for (let i = 0; i < selectedDeals.length; i++) {
      const deal = selectedDeals[i];
      console.log(`📦 Processando envio [${i + 1}/${selectedDeals.length}]: ${deal.title.substring(0, 40)}...`);

      let storyImagePath;
      try {
        storyImagePath = generateStory(deal, coupons);
      } catch (err) {
        console.error(`   ❌ Falha ao gerar Story: ${err.message}`);
        results.push({
          dealId: generateDealId(deal),
          title: deal.title,
          success: false,
          error: err.message
        });
        continue;
      }

      // Prepara mensagem de legenda formatada
      const platformTag = getPlatformTag(deal.platform);
      const category = inferCategory(deal.title);
      
      let comparison = deal.comparison || null;
      if (
        !comparison &&
        process.env.MARKETPLACE_SEARCH_ENABLED !== 'false'
      ) {
        try {
          comparison = await compareProductPrices({
            title: deal.title,
            currentPrice: deal.currentPrice,
            sourceUrl: deal.link,
            cachePath: marketplaceSearchCachePath,
            cacheMinutes:
              Number(process.env.MARKETPLACE_SEARCH_CACHE_MINUTES) || 30,
            maxPerMarketplace: Math.min(
              8,
              Math.max(
                1,
                Number(process.env.MARKETPLACE_SEARCH_RESULTS_PER_SITE) || 4
              )
            )
          });
        } catch (comparisonError) {
          console.warn(
            `   ⚠️ Comparação indisponível para "${deal.title}":`,
            comparisonError.message
          );
        }
      }
      const comparisonText = buildWhatsappComparison(
        comparison,
        deal.currentPrice
      );
      
      const wppMessage = `🔥 *OFERTA ENCONTRADA!* \n\n*${deal.title}*\n\n🔥 *${deal.discount}% OFF*\nDe: ~~${deal.originalPrice}~~\nPor: *${deal.currentPrice}*${comparisonText}\n\n👉 *Compre pelo link:* ${deal.link}\n\n📌 _Categoria: ${category}_\nPlataforma: ${platformTag}`;

      // Envia via WhatsApp Web
      let msgId = null;
      let sentSuccess = false;
      let sendError = null;
      try {
        msgId = await whatsapp.sendOffer(GROUP_NAME, wppMessage, storyImagePath);
        console.log(`   ✅ Oferta postada com sucesso! MsgID: ${msgId}`);
        sentSuccess = true;
      } catch (wppErr) {
        sendError = wppErr.message;
        console.error(`   ❌ Erro ao enviar para o WhatsApp: ${sendError}`);
      }

      // Registra no histórico de publicados
      const dealId = generateDealId(deal);
      if (sentSuccess && msgId) {
        try {
          const history = loadHistory(historyPath, legacyHistoryPath);
          if (!history.publishedIds.includes(dealId)) {
            history.publishedIds.push(dealId);
          }
          history.entries.push({
            dealId,
            title: deal.title.substring(0, 80),
            discount: deal.discount,
            price: deal.currentPrice,
            affiliateLink: deal.link,
            publishedAt: new Date().toISOString(),
            msgId: msgId,
            source: 'manual',
            comparison: comparison?.success ? {
              minPrice: comparison.minPrice,
              minPriceText: comparison.minPriceText,
              medianPrice: comparison.medianPrice,
              medianPriceText: comparison.medianPriceText,
              priceText: comparison.priceText,
              score: comparison.score,
              label: comparison.label,
              confidence: comparison.confidence,
              sourcesCount: comparison.sourcesCount,
              checkedAt: comparison.checkedAt
            } : null
          });
          saveHistory(historyPath, history);
        } catch (histErr) {
          console.error('   ❌ Falha ao gravar histórico local:', histErr.message);
        }
      }

      results.push({
        dealId,
        title: deal.title,
        success: sentSuccess,
        msgId,
        error: sendError
      });

      // Aguarda intervalo curto entre envios para estabilidade
      if (i < selectedDeals.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const sentCount = results.filter(item => item.success).length;
    const failedCount = results.length - sentCount;
    res.status(sentCount === 0 ? 502 : failedCount > 0 ? 207 : 200).json({
      success: failedCount === 0,
      partial: sentCount > 0 && failedCount > 0,
      sentCount,
      failedCount,
      message: `${sentCount} de ${selectedDeals.length} oferta(s) enviada(s).`,
      results
    });
  } catch (err) {
    console.error('   ❌ Erro no fluxo síncrono do painel:', err.message);
    res.status(500).json({ error: `Falha no envio das ofertas: ${err.message}` });
  }
});

// POST /api/delete-deal - Solicita a exclusão de uma mensagem enviada pelo bot para todos no grupo
app.post('/api/delete-deal', async (req, res) => {
  const { msgId } = req.body;
  if (!msgId) {
    return res.status(400).json({ error: 'msgId é obrigatório' });
  }

  console.log(`\n🗑️ [API Excluir] Solicitada exclusão da mensagem: ${msgId}`);

  try {
    if (!whatsapp || !whatsapp.client) {
      return res.status(500).json({ error: 'Conexão com o WhatsApp não ativa no servidor.' });
    }

    // Busca a mensagem no cache do WhatsApp
    const message = await whatsapp.client.getMessageById(msgId);
    
    if (message) {
      if (message.fromMe) {
        console.log(`   Mensagem localizada. Executando exclusão para todos no grupo...`);
        await message.delete(true);
        console.log(`   ✅ [API Excluir] Mensagem ${msgId} excluída para todos.`);
        
        // Remove do histórico de publicados local
        try {
          if (fs.existsSync(historyPath)) {
            const history = loadHistory(historyPath, legacyHistoryPath);
            
            const removal = markPublishedEntryRemovedByMessageId(
              history,
              msgId,
              { removalReason: 'manual' }
            );
            if (removal.updatedEntry) {
              saveHistory(historyPath, removal.history);
              console.log(
                `   ✅ [API Excluir] ${removal.updatedEntry.dealId} ` +
                'mantido como publicado hoje.'
              );
            }
          }
        } catch (histErr) {
          console.error('   ⚠️ [API Excluir] Falha ao atualizar histórico local:', histErr.message);
        }

        res.json({ success: true });
      } else {
        console.warn(`   ⚠️ [API Excluir] Recusado: A mensagem não foi enviada pelo bot.`);
        res.json({ success: false, error: 'A mensagem não foi enviada pelo bot' });
      }
    } else {
      console.warn(`   ⚠️ [API Excluir] Mensagem ${msgId} não localizada no cache do WhatsApp.`);
      res.json({ success: false, error: 'Mensagem não encontrada no cache do WhatsApp' });
    }
  } catch (err) {
    console.error(`   ❌ [API Excluir] Erro no processamento de exclusão:`, err.message);
    res.status(500).json({ error: `Exclusão falhou: ${err.message}` });
  }
});

// GET /api/publish-history - Retorna o histórico de publicações
app.get('/api/publish-history', (req, res) => {
  try {
    res.json(loadHistory(historyPath, legacyHistoryPath));
  } catch (err) {
    res.json({ publishedIds: [], entries: [] });
  }
});

// =======================================================================
// 🤖 CICLO AUTOMÁTICO DE POSTAGENS (Pronto no código para ativação fácil)
// =======================================================================
let dealsRefreshInProgress = false;
let automaticPublishInProgress = false;

function runExecutionScript(scriptName) {
  return new Promise((resolve, reject) => {
    exec(
      `node execution/${scriptName}`,
      { cwd: __dirname, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

function refreshCatalog(platform) {
  const scripts = {
    mercado_livre: 'mercado_livre_deals.js',
    amazon: 'amazon_deals.js',
    shopee: 'shopee_refresh.js'
  };
  if (!scripts[platform]) {
    return Promise.reject(new Error(`Catalogo ${platform} desconhecido.`));
  }
  if (catalogRefreshInProgress.has(platform)) {
    return catalogRefreshInProgress.get(platform);
  }
  const refresh = runExecutionScript(scripts[platform])
    .finally(() => catalogRefreshInProgress.delete(platform));
  catalogRefreshInProgress.set(platform, refresh);
  return refresh;
}

async function refreshDealsData() {
  const env = readEnv();
  if (env.DEALS_REFRESH_ENABLED === 'false' || dealsRefreshInProgress) return;

  dealsRefreshInProgress = true;
  console.log(`\n🔄 [${new Date().toLocaleTimeString('pt-BR')}] Atualizando bases de ofertas...`);
  try {
    const results = await Promise.allSettled([
      refreshCatalog('mercado_livre'),
      refreshCatalog('amazon'),
      refreshCatalog('shopee')
    ]);
    const failed = results.filter(result => result.status === 'rejected');
    if (failed.length > 0) {
      failed.forEach(result => {
        console.error(`⚠️ Falha em uma fonte de ofertas: ${result.reason.message}`);
      });
    } else {
      console.log('✅ Mercado Livre e Amazon atualizados sem publicar mensagens.');
    }
  } finally {
    dealsRefreshInProgress = false;
  }
}

function loadAvailableDeals() {
  const deals = [];
  let coupons = [];

  if (fs.existsSync(mlDealsReportPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(mlDealsReportPath, 'utf-8'));
      deals.push(...(data.deals || []).map(deal => ({
        ...deal,
        platform: 'mercado_livre'
      })));
      coupons = data.coupons || [];
    } catch (err) {
      console.error(`Erro ao carregar ofertas do Mercado Livre: ${err.message}`);
    }
  }
  if (fs.existsSync(amazonDealsReportPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(amazonDealsReportPath, 'utf-8'));
      deals.push(...(data.deals || []).map(deal => ({
        ...deal,
        platform: 'amazon'
      })));
    } catch (err) {
      console.error(`Erro ao carregar ofertas da Amazon: ${err.message}`);
    }
  }

  if (fs.existsSync(couponsPath)) {
    try {
      coupons = JSON.parse(fs.readFileSync(couponsPath, 'utf-8'));
    } catch (err) {
      console.error(`Erro ao carregar cupons: ${err.message}`);
    }
  }

  return { deals, coupons };
}

function generateStory(deal, coupons) {
  const storiesDir = path.join(APP_RUNTIME_DIR, 'automatic_stories');
  const selectionPath = path.join(
    APP_RUNTIME_DIR,
    `automatic_story_${process.pid}.json`
  );
  const confirmedCoupon = coupons.find(
    coupon => coupon.verificationStatus === 'manually_confirmed'
  ) || null;

  fs.writeFileSync(selectionPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    deals: [deal],
    selectedCoupon: confirmedCoupon
  }, null, 2), 'utf-8');

  try {
    if (fs.existsSync(storiesDir)) {
      fs.readdirSync(storiesDir)
        .filter(file => file.endsWith('.jpg'))
        .forEach(file => {
          try { fs.unlinkSync(path.join(storiesDir, file)); } catch {}
        });
    }
    execSync(`node execution/generate_stories.js "${selectionPath}"`, {
      cwd: __dirname,
      env: {
        ...process.env,
        STORIES_OUTPUT_DIR: storiesDir
      },
      stdio: 'ignore',
      timeout: 120000
    });
    const generated = fs.readdirSync(storiesDir)
      .filter(file => file.endsWith('.jpg'));
    if (generated.length === 0) {
      throw new Error('Nenhum arquivo de Story foi gerado.');
    }
    return path.join(storiesDir, generated[0]);
  } finally {
    try { fs.unlinkSync(selectionPath); } catch {}
  }
}

async function publishNextAutomaticOffer() {
  const env = readEnv();
  if (env.AUTO_RUN_ENABLED !== 'true' || automaticPublishInProgress) return;

  const targetPerHour = Math.min(
    20,
    Math.max(15, Number(env.WPP_POSTS_PER_HOUR) || 15)
  );
  const whatsappStatus = whatsapp?.getConnectionStatus?.();
  if (!whatsapp || !whatsappStatus?.ready) {
    console.warn('⏸️ Publicação automática aguardando WhatsApp ficar pronto.');
    return;
  }

  automaticPublishInProgress = true;
  try {
    const history = loadHistory(historyPath, legacyHistoryPath);
    const postsLastHour = countAutomaticPostsSince(
      history,
      new Date(Date.now() - 60 * 60 * 1000)
    );
    if (postsLastHour >= targetPerHour) return;

    const { deals, coupons } = loadAvailableDeals();
    const [deal] = selectBestUnpublished(deals, history, 1);
    if (!deal) {
      console.warn('⏸️ Nenhuma oferta inédita disponível para hoje.');
      return;
    }

    const storyImagePath = generateStory(deal, coupons);
    const platformTag = getPlatformTag(deal.platform);
    const category = inferCategory(deal.title);
    const wppMessage = `🔥 *OFERTA ENCONTRADA!*\n\n*${deal.title}*\n\n🔥 *${deal.discount}% OFF*\nDe: ~~${deal.originalPrice}~~\nPor: *${deal.currentPrice}*\n\n👉 *Compre pelo link:* ${deal.link}\n\n📌 _Categoria: ${category}_\nPlataforma: ${platformTag}`;
    const msgId = await whatsapp.sendOffer(
      GROUP_NAME,
      wppMessage,
      storyImagePath
    );

    if (!history.publishedIds.includes(deal.dealId)) {
      history.publishedIds.push(deal.dealId);
    }
    history.entries.push({
      dealId: deal.dealId,
      title: deal.title.substring(0, 80),
      discount: deal.discount,
      price: deal.currentPrice,
      affiliateLink: deal.link,
      publishedAt: new Date().toISOString(),
      msgId,
      source: 'auto',
      dealType: deal.dealType || 'Ofertas de Campanha',
      timeLeft: deal.timeLeft || '',
      comparison: null
    });
    saveHistory(historyPath, history);
    console.log(
      `✅ Oferta automática enviada (${postsLastHour + 1}/${targetPerHour} na última hora): ` +
      deal.title.substring(0, 60)
    );
  } catch (err) {
    console.error(`Erro ao publicar oferta automática: ${err.message}`);
  } finally {
    automaticPublishInProgress = false;
  }
}

// Inicia servidor Express e escuta na porta
app.listen(PORT, HOST, () => {
  console.log(`=================================================`);
  console.log(` Dashboard rodando em http://${HOST}:${PORT}`);
  console.log(`=================================================`);

  // Atualização de dados e publicação são ciclos independentes.
  setTimeout(() => {
    const env = readEnv();
    const refreshMinutes = Math.max(
      15,
      Number(env.DEALS_REFRESH_INTERVAL_MINUTES) || 30
    );
    refreshDealsData().catch(err => {
      console.error(`Falha na atualização inicial: ${err.message}`);
    });
    setInterval(() => {
      refreshDealsData().catch(err => {
        console.error(`Falha na atualização agendada: ${err.message}`);
      });
    }, refreshMinutes * 60 * 1000);

    const postsPerHour = Math.min(
      20,
      Math.max(15, Number(env.WPP_POSTS_PER_HOUR) || 15)
    );
    const publishIntervalMs = Math.floor(60 * 60 * 1000 / postsPerHour);
    setTimeout(() => {
      publishNextAutomaticOffer().catch(err => {
        console.error(`Falha na publicação inicial: ${err.message}`);
      });
    }, 30000);
    setInterval(() => {
      publishNextAutomaticOffer().catch(err => {
        console.error(`Falha na publicação agendada: ${err.message}`);
      });
    }, publishIntervalMs);

    console.log(
      `[Automação] Atualização a cada ${refreshMinutes} min; ` +
      `publicação configurada para ${postsPerHour} ofertas/hora ` +
      `(AUTO_RUN_ENABLED=${env.AUTO_RUN_ENABLED === 'true'}).`
    );
  }, 15000);
});
