const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const {
  APP_RUNTIME_DIR,
  ensureSessionDirectories
} = require('./session_config.js');
const { loadJson, saveJsonAtomic } = require('./json_store.js');
const { importShopeeFeeds } = require('./shopee_feed.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const MAX_FEED_BYTES = 1024 * 1024 * 1024;

function readEnv() {
  const env = { ...process.env };
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return env;

  for (const rawLine of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    env[line.slice(0, separator).trim()] =
      line.slice(separator + 1).trim();
  }
  return env;
}

function validateFeedUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('URL de feed Shopee invalida.');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname.toLowerCase() !== 'affiliate.shopee.com.br' ||
    parsed.pathname !== '/api/v1/datafeed/download' ||
    !parsed.searchParams.get('id')
  ) {
    throw new Error('URL de feed fora do endpoint oficial da Shopee.');
  }
  return parsed.toString();
}

function parseFeedUrls(value) {
  return String(value || '')
    .split(/[\r\n,]+/)
    .map(url => url.trim())
    .filter(Boolean)
    .map(validateFeedUrl);
}

function configuredFeeds(env) {
  return [
    ...parseFeedUrls(env.SHOPEE_OFFICIAL_FEED_URLS).map((url, index) => ({
      id: `official:${index + 1}`,
      url,
      name: `Shopee Oficial ${index + 1}.csv`
    })),
    ...parseFeedUrls(env.SHOPEE_GENERAL_FEED_URLS).map((url, index) => ({
      id: `general:${index + 1}`,
      url,
      name: `Shopee Brasil ${index + 1}.csv`
    }))
  ];
}

function hasCurrentReportShape(outputPath) {
  const report = loadJson(outputPath, null);
  return (
    Array.isArray(report?.catalog) &&
    Number.isFinite(Number(report?.filters?.recurringMinDiscount)) &&
    report.selectionVersion === 2
  );
}

function validateDownloadResponse(response) {
  const finalUrl = new URL(response.url);
  if (
    finalUrl.protocol !== 'https:' ||
    !['affiliate.shopee.com.br', 'mkt-proxy.shopee.com.br']
      .includes(finalUrl.hostname.toLowerCase())
  ) {
    throw new Error('Feed Shopee redirecionou para um endereco inesperado.');
  }
}

async function probeFeed(feed, fetchImpl = fetch) {
  const response = await fetchImpl(feed.url, {
    headers: { Range: 'bytes=0-0' },
    redirect: 'follow'
  });
  if (response.status !== 206) {
    throw new Error(`Sondagem do feed Shopee respondeu HTTP ${response.status}.`);
  }
  validateDownloadResponse(response);
  await response.arrayBuffer();

  const etag = response.headers.get('etag');
  const lastModified = response.headers.get('last-modified');
  const contentRange = response.headers.get('content-range');
  const fileName = response.headers.get('content-disposition') || '';
  const version = etag || [lastModified, contentRange, fileName]
    .filter(Boolean)
    .join('|');
  if (!version) {
    throw new Error('Feed Shopee nao informou ETag nem data de alteracao.');
  }
  return { id: feed.id, version, etag, lastModified, contentRange, fileName };
}

async function downloadFeed(feed, destination, fetchImpl = fetch) {
  const response = await fetchImpl(feed.url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download do feed Shopee respondeu HTTP ${response.status}.`);
  }
  validateDownloadResponse(response);
  if (!response.body) throw new Error('Download do feed Shopee veio vazio.');

  const temporaryPath = `${destination}.part`;
  let bytes = 0;
  const limit = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      callback(
        bytes > MAX_FEED_BYTES
          ? new Error('Feed Shopee excedeu o limite de 1 GB.')
          : null,
        chunk
      );
    }
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      limit,
      fs.createWriteStream(temporaryPath, { flags: 'wx' })
    );
    if (bytes === 0) throw new Error('Feed Shopee baixado esta vazio.');
    fs.renameSync(temporaryPath, destination);
    return bytes;
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

async function refreshShopeeFeeds(options = {}) {
  const env = options.env || readEnv();
  const feeds = configuredFeeds(env);
  if (env.SHOPEE_FEED_ENABLED === 'false' || feeds.length === 0) {
    return { status: 'skipped', reason: 'not_configured' };
  }

  ensureSessionDirectories();
  const statePath = path.join(APP_RUNTIME_DIR, 'shopee_feed_state.json');
  const outputPath = path.isAbsolute(env.SHOPEE_OUTPUT_PATH || '')
    ? env.SHOPEE_OUTPUT_PATH
    : path.resolve(ROOT_DIR, env.SHOPEE_OUTPUT_PATH || 'shopee_deals_report.json');
  const probes = await Promise.all(
    feeds.map(feed => probeFeed(feed, options.fetchImpl))
  );
  const previousState = loadJson(statePath, { feeds: {} });
  const unchanged = probes.every(probe =>
    previousState.feeds?.[probe.id]?.version === probe.version
  );
  if (
    !options.force &&
    unchanged &&
    fs.existsSync(outputPath) &&
    hasCurrentReportShape(outputPath)
  ) {
    return { status: 'skipped', reason: 'unchanged', probes };
  }

  const temporaryDirectory = fs.mkdtempSync(
    path.join(APP_RUNTIME_DIR, 'shopee-feed-')
  );
  try {
    const inputPaths = [];
    for (const feed of feeds) {
      const destination = path.join(temporaryDirectory, feed.name);
      await downloadFeed(feed, destination, options.fetchImpl);
      inputPaths.push(destination);
    }
    const report = await importShopeeFeeds(inputPaths, {
      minDiscount: env.SHOPEE_MIN_DISCOUNT,
      maxDiscount: env.SHOPEE_MAX_DISCOUNT,
      minItemRating: env.SHOPEE_MIN_ITEM_RATING,
      minShopRating: env.SHOPEE_MIN_SHOP_RATING,
      maxProducts: env.SHOPEE_MAX_PRODUCTS,
      recurringMinDiscount: env.SHOPEE_RECURRING_MIN_DISCOUNT,
      maxRecurringProducts: env.SHOPEE_MAX_RECURRING_PRODUCTS,
      includeCrossBorder:
        String(env.SHOPEE_INCLUDE_CROSS_BORDER).toLowerCase() === 'true',
      outputPath
    });
    saveJsonAtomic(statePath, {
      checkedAt: new Date().toISOString(),
      feeds: Object.fromEntries(probes.map(probe => [
        probe.id,
        {
          version: probe.version,
          etag: probe.etag,
          lastModified: probe.lastModified,
          contentRange: probe.contentRange,
          fileName: probe.fileName
        }
      ]))
    });
    return { status: 'updated', report, probes };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const result = await refreshShopeeFeeds({
    force: process.argv.includes('--force')
  });
  if (result.status === 'updated') {
    console.log(
      `[Shopee] ${result.report.stats.rowsRead} lidos, ` +
      `${result.report.stats.selected} selecionados.`
    );
  } else {
    console.log(
      result.reason === 'unchanged'
        ? '[Shopee] Feed sem alteracoes.'
        : '[Shopee] Feed nao configurado.'
    );
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[Shopee] Falha na atualizacao: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  validateFeedUrl,
  configuredFeeds,
  probeFeed,
  downloadFeed,
  hasCurrentReportShape,
  refreshShopeeFeeds
};
