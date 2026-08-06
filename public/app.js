// State management
let allMLDeals = [];
let allAmazonDeals = [];
let allShopeeDeals = [];
let allFutFanaticsDeals = [];
let allCoupons = [];
const selectedMLIndices = new Set();
const selectedAmazonIndices = new Set();
const selectedShopeeIndices = new Set();
const selectedFutFanaticsIndices = new Set();
let lastUpdateML = '';
let lastUpdateAmazon = '';
let lastUpdateShopee = '';
let lastUpdateFutFanatics = '';
let freshnessML = null;
let freshnessAmazon = null;
let freshnessShopee = null;
let freshnessFutFanatics = null;
let publicationQueueEnabled = false;
let publicationQueueItems = [];
let publicationQueueSummary = {};
let publicationQueueRevision = -1;
let publicationQueueRequestSequence = 0;
let publicationQueueAbortController = null;
let publicationBatches = [];
const selectedQueueItemIds = new Set();
let publicationHistorySignature = '';
let amazonDealsLoaded = false;
let shopeeDealsLoaded = false;
let futfanaticsDealsLoaded = false;
let whatsappReady = false;
let activeDealPlatform = 'ml';
let lastFocusedElement = null;
let stopQueueGenerationRequested = false;
let activeQueueGenerationJobId = null;
const tabScrollPositions = new Map();
const DEALS_PAGE_SIZE = 20;
let visibleMLLimit = DEALS_PAGE_SIZE;
let visibleAmazonLimit = DEALS_PAGE_SIZE;
let visibleShopeeLimit = DEALS_PAGE_SIZE;
let visibleFutFanaticsLimit = DEALS_PAGE_SIZE;
const IMAGE_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">
    <rect width="640" height="480" fill="#f3f3f3"/>
    <text x="320" y="240" text-anchor="middle" dominant-baseline="middle"
      font-family="Arial,sans-serif" font-size="28" fill="#777">
      Imagem indisponível
    </text>
  </svg>
`)}`;

function getDealImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return IMAGE_PLACEHOLDER;
    return `/api/proxy-image?url=${encodeURIComponent(url.href)}`;
  } catch {
    return IMAGE_PLACEHOLDER;
  }
}

// DOM elements - Tabs
const elTabHome = document.getElementById('btn-tab-home');
const elTabProducts = document.getElementById('btn-tab-products');
const elTabML = document.getElementById('btn-tab-ml');
const elTabAmazon = document.getElementById('btn-tab-amazon');
const elTabShopee = document.getElementById('btn-tab-shopee');
const elTabFutFanatics = document.getElementById('btn-tab-futfanatics');
const elTabCoupons = document.getElementById('btn-tab-coupons');
const elTabQueue = document.getElementById('btn-tab-queue');
const elTabSearch = document.getElementById('btn-tab-search');

const elPanelHome = document.getElementById('panel-home');
const elPanelProducts = document.getElementById('panel-products');
const elPanelML = document.getElementById('panel-ml');
const elPanelAmazon = document.getElementById('panel-amazon');
const elPanelShopee = document.getElementById('panel-shopee');
const elPanelFutFanatics = document.getElementById('panel-futfanatics');
const elPanelCoupons = document.getElementById('panel-coupons');
const elPanelQueue = document.getElementById('panel-queue');
const elPanelSearch = document.getElementById('panel-search');

// DOM elements - Grids
const elGridML = document.getElementById('grid-ml');
const elGridAmazon = document.getElementById('grid-amazon');
const elGridShopee = document.getElementById('grid-shopee');
const elGridFutFanatics = document.getElementById('grid-futfanatics');
const elGridCoupons = document.getElementById('grid-coupons');
const elGridQueue = document.getElementById('grid-queue');
const elPaginationML = document.getElementById('pagination-ml');
const elPaginationAmazon = document.getElementById('pagination-amazon');
const elPaginationShopee = document.getElementById('pagination-shopee');
const elPaginationFutFanatics = document.getElementById('pagination-futfanatics');
const elPaginationCountML = document.getElementById('pagination-count-ml');
const elPaginationCountAmazon = document.getElementById('pagination-count-amazon');
const elPaginationCountShopee = document.getElementById('pagination-count-shopee');
const elPaginationCountFutFanatics = document.getElementById('pagination-count-futfanatics');
const elBtnLoadMoreML = document.getElementById('btn-load-more-ml');
const elBtnLoadMoreAmazon = document.getElementById('btn-load-more-amazon');
const elBtnLoadMoreShopee = document.getElementById('btn-load-more-shopee');
const elBtnLoadMoreFutFanatics = document.getElementById('btn-load-more-futfanatics');

// DOM elements - ML Actions
const elBtnUpdateML = document.getElementById('btn-update-ml');
const elBtnGenerateML = document.getElementById('btn-generate-ml');
const elChkSelectAllML = document.getElementById('chk-select-all-ml');
const elBtnClearSelectionML = document.getElementById('btn-clear-selection-ml');
const elTxtSelectedCountML = document.getElementById('txt-selected-count-ml');
const elBtnQueueML = document.getElementById('btn-queue-ml');
const elTxtQueueCountML = document.getElementById('txt-queue-count-ml');

// DOM elements - Amazon Actions
const elBtnUpdateAmazon = document.getElementById('btn-update-amazon');
const elBtnGenerateAmazon = document.getElementById('btn-generate-amazon');
const elChkSelectAllAmazon = document.getElementById('chk-select-all-amazon');
const elBtnClearSelectionAmazon = document.getElementById('btn-clear-selection-amazon');
const elTxtSelectedCountAmazon = document.getElementById('txt-selected-count-amazon');
const elBtnQueueAmazon = document.getElementById('btn-queue-amazon');
const elTxtQueueCountAmazon = document.getElementById('txt-queue-count-amazon');

// DOM elements - Shopee Actions
const elBtnUpdateShopee = document.getElementById('btn-update-shopee');
const elChkSelectAllShopee =
  document.getElementById('chk-select-all-shopee');
const elBtnClearSelectionShopee =
  document.getElementById('btn-clear-selection-shopee');
const elBtnQueueShopee = document.getElementById('btn-queue-shopee');
const elTxtQueueCountShopee =
  document.getElementById('txt-queue-count-shopee');
const elTxtShopeeCatalogUpdate =
  document.getElementById('txt-shopee-catalog-update');

// DOM elements - FutFanatics Actions
const elBtnUpdateFutFanatics = document.getElementById('btn-update-futfanatics');
const elBtnGenerateFutFanatics = document.getElementById('btn-generate-futfanatics');
const elChkSelectAllFutFanatics = document.getElementById('chk-select-all-futfanatics');
const elBtnClearSelectionFutFanatics = document.getElementById('btn-clear-selection-futfanatics');
const elTxtSelectedCountFutFanatics = document.getElementById('txt-selected-count-futfanatics');
const elBtnQueueFutFanatics = document.getElementById('btn-queue-futfanatics');
const elTxtQueueCountFutFanatics = document.getElementById('txt-queue-count-futfanatics');

// DOM elements - Filters ML
const elFilterNameML = document.getElementById('ipt-filter-name-ml');
const elFilterCategoryML = document.getElementById('sel-filter-category-ml');
const elFilterSubcategoryML = document.getElementById('sel-filter-subcategory-ml');
const elFilterDiscountML = document.getElementById('sel-filter-discount-ml');
const elFilterRecurringML =
  document.getElementById('sel-filter-recurring-ml');
const elSortML = document.getElementById('sel-sort-ml');

// DOM elements - Filters Amazon
const elFilterNameAmazon = document.getElementById('ipt-filter-name-amazon');
const elFilterCategoryAmazon = document.getElementById('sel-filter-category-amazon');
const elFilterSubcategoryAmazon = document.getElementById('sel-filter-subcategory-amazon');
const elFilterDiscountAmazon = document.getElementById('sel-filter-discount-amazon');
const elSortAmazon = document.getElementById('sel-sort-amazon');

// DOM elements - Filters Shopee
const elFilterNameShopee = document.getElementById('ipt-filter-name-shopee');
const elFilterCategoryShopee = document.getElementById('sel-filter-category-shopee');
const elFilterSubcategoryShopee = document.getElementById('sel-filter-subcategory-shopee');
const elFilterDiscountShopee = document.getElementById('sel-filter-discount-shopee');
const elFilterRecurringShopee =
  document.getElementById('sel-filter-recurring-shopee');
const elSortShopee = document.getElementById('sel-sort-shopee');

// DOM elements - Filters FutFanatics
const elFilterNameFutFanatics = document.getElementById('ipt-filter-name-futfanatics');
const elFilterCategoryFutFanatics = document.getElementById('sel-filter-category-futfanatics');
const elFilterSubcategoryFutFanatics = document.getElementById('sel-filter-subcategory-futfanatics');
const elFilterDiscountFutFanatics = document.getElementById('sel-filter-discount-futfanatics');
const elFilterTeamFutFanatics = document.getElementById('sel-filter-team-futfanatics');
const elSortFutFanatics = document.getElementById('sel-sort-futfanatics');

let globalTaxonomy = {};

// General
const elTxtLastUpdate = document.getElementById('txt-last-update');
const elTxtAutomationStatus = document.getElementById('txt-automation-status');
const elLoadingOverlay = document.getElementById('loading-overlay');
const elLoadingText = document.getElementById('loading-text');
const elMarketplaceSearchForm = document.getElementById('marketplace-search-form');
const elMarketplaceSearchInput = document.getElementById('ipt-marketplace-search');
const elMarketplaceSearchButton = document.getElementById('btn-marketplace-search');
const elMarketplaceSearchStatus = document.getElementById('marketplace-search-status');
const elMarketplaceSearchResults = document.getElementById('marketplace-search-results');
const elQueueTabCount = document.getElementById('queue-tab-count');
const elQueueStatusFilter = document.getElementById('queue-status-filter');
const elQueuePlatformFilter =
  document.getElementById('queue-platform-filter');
const elQueueSortFilter = document.getElementById('queue-sort-filter');
const elQueueFeedback = document.getElementById('queue-feedback');
const elQueueSyncStatus = document.getElementById('queue-sync-status');
const elBtnRefreshQueue = document.getElementById('btn-refresh-queue');
const elBtnClearDiscarded = document.getElementById('btn-clear-discarded');
const elBtnValidateQueue = document.getElementById('btn-validate-queue');
const elChkSelectVisibleQueue =
  document.getElementById('chk-select-visible-queue');
const elBtnDeleteSelectedQueue =
  document.getElementById('btn-delete-selected-queue');
const elTxtSelectedQueueCount =
  document.getElementById('txt-selected-queue-count');
const elQueueSummaryAwaiting = document.getElementById('queue-summary-awaiting');
const elQueueSummaryReady = document.getElementById('queue-summary-ready');
const elQueueSummaryReview = document.getElementById('queue-summary-review');
const elQueueSummaryPublished = document.getElementById('queue-summary-published');
const elHomeQueueCount = document.getElementById('home-queue-count');
const elTxtWhatsappStatus = document.getElementById('txt-whatsapp-status');
const elBtnToggleFiltersML = document.getElementById('btn-toggle-filters-ml');
const elBtnToggleFiltersAmazon = document.getElementById('btn-toggle-filters-amazon');
const elBtnToggleFiltersShopee = document.getElementById('btn-toggle-filters-shopee');
const elFiltersML = document.getElementById('filters-ml');
const elFiltersAmazon = document.getElementById('filters-amazon');
const elFiltersShopee = document.getElementById('filters-shopee');
const elMobileSelectionBar = document.getElementById('mobile-selection-bar');
const elMobileSelectionCount = document.getElementById('mobile-selection-count');
const elBtnMobileQueue = document.getElementById('btn-mobile-queue');
const elBtnMobileSend = document.getElementById('btn-mobile-send');
const elLocalWorkerPanel = document.getElementById('local-affiliate-worker');
const elLocalWorkerBadge = document.getElementById('local-worker-badge');
const elLocalWorkerDevice = document.getElementById('local-worker-device');
const elLocalWorkerSeen = document.getElementById('local-worker-seen');
const elLocalWorkerState = document.getElementById('local-worker-state');
const elLocalWorkerProcessing = document.getElementById('local-worker-processing');
const elLocalWorkerReady = document.getElementById('local-worker-ready');
const elLocalWorkerErrors = document.getElementById('local-worker-errors');
const elLocalWorkerAuth = document.getElementById('local-worker-auth');
const elBtnExplainLocalWorker = document.getElementById('btn-explain-local-worker');
const elBtnRefreshLocalWorker = document.getElementById('btn-refresh-local-worker');
const elBtnPrepareBatch = document.getElementById('btn-prepare-batch');
const elBtnDownloadLatestBatch = document.getElementById('btn-download-latest-batch');
const elBatchSelectionCount = document.getElementById('batch-selection-count');
const elBatchList = document.getElementById('batch-list');

function parseBackendDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes('T') || dateStr.endsWith('Z')) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [, day, month, year, hour, minute, second] = match;
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), parseInt(hour, 10), parseInt(minute, 10), parseInt(second, 10));
    return isNaN(d.getTime()) ? null : d;
  }
  const fallbackDate = new Date(dateStr);
  return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
}

function generateClientDealId(deal, platform) {
  const rawPlatform = String(platform || deal?.platform || 'unknown').toLowerCase();
  const normalizedPlatform = ['ml', 'mercado livre', 'mercado_livre'].includes(rawPlatform)
    ? 'mercado_livre'
    : ['amz', 'amazon'].includes(rawPlatform)
      ? 'amazon'
      : rawPlatform;
  const rawLink = String(deal?.link || deal?.productLink || '');
  let normalizedLink = rawLink.split(/[?#]/)[0].replace(/\/+$/, '');
  try {
    const parsed = new URL(rawLink);
    normalizedLink = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {}
  const itemId = normalizedLink.match(/\b(MLB\d+|B0[A-Z0-9]+)\b/i)?.[1];
  const identity = itemId || normalizedLink || String(deal?.title || '').trim().toLowerCase();
  const value = `${normalizedPlatform}:${identity}`;
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return `deal_${Math.abs(hash)}`;
}

function isDealInActiveQueue(deal, platform) {
  if (!publicationQueueEnabled || !publicationQueueItems || publicationQueueItems.length === 0) {
    return false;
  }
  const normPlatform = ['ml', 'mercado livre', 'mercado_livre'].includes(String(platform || deal?.platform || '').toLowerCase())
    ? 'mercado_livre'
    : ['amz', 'amazon'].includes(String(platform || deal?.platform || '').toLowerCase())
      ? 'amazon'
      : String(platform || deal?.platform || '').toLowerCase();

  const dealId = generateClientDealId(deal, normPlatform);
  const dealLink = String(deal?.link || deal?.productLink || '').toLowerCase().trim();
  const dealTitle = String(deal?.title || '').toLowerCase().trim();

  return publicationQueueItems.some(item => {
    if (!item || !['awaiting_affiliate', 'ready', 'needs_review'].includes(item.status)) {
      return false;
    }
    const itemPlatform = ['ml', 'mercado livre', 'mercado_livre'].includes(String(item.platform).toLowerCase())
      ? 'mercado_livre'
      : String(item.platform).toLowerCase();

    if (itemPlatform !== normPlatform) return false;

    if (item.dealId && item.dealId === dealId) return true;

    if (dealLink && item.productLink) {
      const itemLink = String(item.productLink).toLowerCase().trim();
      if (dealLink === itemLink) return true;
      const cleanDealLink = dealLink.split(/[?#]/)[0].replace(/\/+$/, '');
      const cleanItemLink = itemLink.split(/[?#]/)[0].replace(/\/+$/, '');
      if (cleanDealLink && cleanItemLink && cleanDealLink === cleanItemLink) return true;
    }

    if (dealTitle && item.title && dealTitle === String(item.title).toLowerCase().trim()) {
      return true;
    }

    return false;
  });
}

function findTodayPublication(entries, dealId) {
  const now = new Date();
  return entries.find(entry => {
    if (entry.dealId !== dealId || !entry.publishedAt) return false;
    const publishedAt = new Date(entry.publishedAt);
    return !isNaN(publishedAt.getTime()) &&
      publishedAt.getFullYear() === now.getFullYear() &&
      publishedAt.getMonth() === now.getMonth() &&
      publishedAt.getDate() === now.getDate();
  });
}

function addPublicationState(deal, platform, publishedEntries) {
  const dealId = generateClientDealId(deal, platform);
  const publication = findTodayPublication(publishedEntries, dealId);
  return {
    ...deal,
    platform: platform || deal.platform,
    publishedMsgId: publication?.msgId || null,
    removedFromWhatsAppAt: publication?.removedFromWhatsAppAt || null,
    removalReaction: publication?.reaction || null
  };
}

function updateLastUpdateUI(platform) {
  const currentUpdateStr = platform === 'amazon'
    ? lastUpdateAmazon
    : platform === 'shopee'
      ? lastUpdateShopee
      : platform === 'futfanatics'
        ? lastUpdateFutFanatics
        : lastUpdateML;
  const freshness = platform === 'amazon'
    ? freshnessAmazon
    : platform === 'shopee'
      ? freshnessShopee
      : platform === 'futfanatics'
        ? freshnessFutFanatics
        : freshnessML;
  if (currentUpdateStr) {
    const date = parseBackendDate(currentUpdateStr);
    if (date) {
      const ageMinutes = Math.max(
        0,
        Math.floor((Date.now() - date.getTime()) / 60000)
      );
      const staleAfter = freshness?.staleAfterMinutes || 90;
      const isStale = ageMinutes > staleAfter;
      const ageText = ageMinutes < 60
        ? `${ageMinutes} min`
        : `${Math.floor(ageMinutes / 60)}h ${ageMinutes % 60}min`;
      elTxtLastUpdate.textContent = isStale
        ? `Dados desatualizados há ${ageText} — última coleta: ${date.toLocaleString('pt-BR')}`
        : `Dados atualizados há ${ageText} — ${date.toLocaleString('pt-BR')}`;
      elTxtLastUpdate.classList.toggle('status-stale', isStale);
      elTxtLastUpdate.classList.toggle('status-fresh', !isStale);
    } else {
      elTxtLastUpdate.textContent = `Última atualização: ${currentUpdateStr}`;
    }
  } else {
    elTxtLastUpdate.textContent = 'Dados indisponíveis — nenhuma atualização registrada';
    elTxtLastUpdate.classList.add('status-stale');
    elTxtLastUpdate.classList.remove('status-fresh');
  }
}

function updateShopeeCatalogUpdate(value) {
  const date = parseBackendDate(value);
  elTxtShopeeCatalogUpdate.textContent = date
    ? `atualizado em ${date.toLocaleString('pt-BR')}`
    : 'nenhuma atualização registrada';
}

async function fetchDataStatus() {
  try {
    const response = await fetch('/api/data-status');
    const status = await response.json();
    const previousMLUpdate = lastUpdateML;
    const previousAmazonUpdate = lastUpdateAmazon;
    const previousShopeeUpdate = lastUpdateShopee;
    freshnessML = status.mercadoLivre || freshnessML;
    freshnessAmazon = status.amazon || freshnessAmazon;
    freshnessShopee = status.shopee || freshnessShopee;
    freshnessFutFanatics = status.futfanatics || freshnessFutFanatics;
    lastUpdateML = status.mercadoLivre?.generatedAt || lastUpdateML;
    lastUpdateAmazon = status.amazon?.generatedAt || lastUpdateAmazon;
    lastUpdateShopee = status.shopee?.generatedAt || lastUpdateShopee;
    lastUpdateFutFanatics = status.futfanatics?.generatedAt || lastUpdateFutFanatics;
    updateShopeeCatalogUpdate(lastUpdateShopee);
    if (previousMLUpdate && lastUpdateML !== previousMLUpdate) fetchMLDeals();
    if (previousAmazonUpdate && lastUpdateAmazon !== previousAmazonUpdate) {
      if (
        elTabProducts.classList.contains('active') &&
        activeDealPlatform === 'amazon'
      ) {
        fetchAmazonDeals();
      } else {
        amazonDealsLoaded = false;
      }
    }
    if (previousShopeeUpdate && lastUpdateShopee !== previousShopeeUpdate) {
      if (
        elTabProducts.classList.contains('active') &&
        activeDealPlatform === 'shopee'
      ) {
        fetchShopeeDeals();
      } else {
        shopeeDealsLoaded = false;
      }
    }

    const publishing = status.publishing;
    if (publishing) {
      if (publishing.enabled) {
        const capacityWarning = publishing.availableToday <
          publishing.targetPerHour
          ? ' · estoque de ofertas insuficiente'
          : '';
        elTxtAutomationStatus.textContent =
          `WhatsApp: ${publishing.sentLastHour}/${publishing.targetPerHour} na última hora · ` +
          `${publishing.uniqueSentToday} enviados hoje · ` +
          `${publishing.availableToday} inéditos disponíveis` +
          capacityWarning;
        elTxtAutomationStatus.classList.toggle(
          'status-stale',
          publishing.availableToday < publishing.targetPerHour
        );
      } else {
        elTxtAutomationStatus.textContent = 'Publicação automática desativada';
        elTxtAutomationStatus.classList.remove('status-stale');
      }
    }
    updateLastUpdateUI(activeDealPlatform);
  } catch (err) {
    console.error('Erro ao consultar estado das atualizações:', err);
  }
}

async function fetchWhatsAppStatus() {
  try {
    const response = await fetch('/api/health');
    const health = await response.json();
    const status = health.whatsapp?.status || 'offline';
    const labels = {
      ready: 'conectado',
      connecting: 'conectando',
      authenticated: 'autenticado',
      qr_required: 'QR necessário',
      reconnect_wait: 'reconectando',
      auth_failure: 'falha na autenticação',
      disconnected: 'desconectado',
      starting: 'iniciando',
      disabled: 'desativado',
      error: 'erro'
    };

    whatsappReady = health.whatsapp?.ready === true;
    const attempt = status === 'reconnect_wait' &&
      health.whatsapp?.reconnectAttempts
      ? ` (tentativa ${health.whatsapp.reconnectAttempts})`
      : '';
    elTxtWhatsappStatus.textContent =
      `WhatsApp: ${labels[status] || status}${attempt}`;
    elTxtWhatsappStatus.title = health.whatsapp?.lastError || '';
  } catch (err) {
    whatsappReady = false;
    elTxtWhatsappStatus.textContent = 'WhatsApp: indisponível';
    elTxtWhatsappStatus.title = '';
    console.error('Erro ao consultar WhatsApp:', err);
  }

  elTxtWhatsappStatus.classList.toggle('is-ready', whatsappReady);
  elTxtWhatsappStatus.classList.toggle('is-offline', !whatsappReady);
  updateMLSelectionUI();
  updateAmazonSelectionUI();
}

async function syncPublicationHistory() {
  try {
    const response = await fetch('/api/publish-history');
    const history = await response.json();
    const entries = history.entries || [];
    const signature = JSON.stringify(entries);
    if (signature === publicationHistorySignature) return;
    publicationHistorySignature = signature;
    if (allMLDeals.length) {
      allMLDeals = allMLDeals.map(deal =>
        addPublicationState(deal, 'mercado_livre', entries)
      );
      renderMLDeals(allMLDeals);
    }
    if (allAmazonDeals.length) {
      allAmazonDeals = allAmazonDeals.map(deal =>
        addPublicationState(deal, 'amazon', entries)
      );
      renderAmazonDeals(allAmazonDeals);
    }
  } catch (err) {
    console.error('Erro ao sincronizar histórico de publicações:', err);
  }
}

// ==========================================
// Loading Overlay Helpers
// ==========================================
function showLoading(text) {
  elLoadingText.textContent = text;
  elLoadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  elLoadingOverlay.classList.add('hidden');
}

function showDealSkeletons(grid) {
  if (grid.querySelector('.deal-card:not(.deal-skeleton)')) return;
  grid.innerHTML = Array.from({ length: 4 }, () => `
    <div class="deal-card deal-skeleton" aria-hidden="true">
      <div class="skeleton-image"></div>
      <div class="skeleton-lines">
        <span></span><span></span><span></span>
      </div>
    </div>
  `).join('');
}

// ==========================================
// Pesquisa geral (consulta apenas, sem WhatsApp)
// ==========================================
function createMarketplaceResultCard(result) {
  const card = document.createElement('article');
  card.className = 'marketplace-result-card';

  if (result.image) {
    const image = document.createElement('img');
    image.className = 'marketplace-result-image';
    image.src = result.image;
    image.alt = result.title || `Produto da ${result.marketplaceLabel}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    card.appendChild(image);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'marketplace-result-image is-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = 'Sem imagem';
    card.appendChild(placeholder);
  }

  const content = document.createElement('div');
  content.className = 'marketplace-result-content';

  const source = document.createElement('span');
  source.className = 'marketplace-result-source';
  source.textContent = result.marketplaceLabel;

  const title = document.createElement('h3');
  title.className = 'marketplace-result-title';
  title.textContent = result.title;

  const price = document.createElement('p');
  price.className = 'marketplace-result-price';
  price.textContent = result.priceText || 'Preço não exibido';
  if (Number(result.discount) > 0) {
    const discount = document.createElement('span');
    discount.className = 'marketplace-result-discount';
    discount.textContent = `-${Number(result.discount)}%`;
    price.appendChild(discount);
  }

  const link = document.createElement('a');
  link.className = 'marketplace-result-link';
  link.href = result.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Ver produto ↗';

  content.append(source, title, price, link);
  card.appendChild(content);
  return card;
}

function createMarketplaceSourceLink(source) {
  const link = document.createElement('a');
  link.className = 'marketplace-source-link';
  link.href = source.searchUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const label = document.createElement('strong');
  label.textContent = source.marketplaceLabel;
  const detail = document.createElement('span');
  detail.textContent = source.count
    ? `${source.count} resultado(s) exibido(s)`
    : 'Abrir busca completa no site';
  link.append(label, detail);
  return link;
}

async function runMarketplaceSearch(event) {
  event.preventDefault();
  const query = elMarketplaceSearchInput.value.trim();
  if (query.length < 2) {
    elMarketplaceSearchStatus.textContent =
      'Digite pelo menos 2 caracteres para pesquisar.';
    elMarketplaceSearchStatus.classList.add('is-error');
    elMarketplaceSearchInput.focus();
    return;
  }
  elMarketplaceSearchButton.disabled = true;
  elMarketplaceSearchButton.textContent = 'Pesquisando...';
  elMarketplaceSearchStatus.classList.remove('is-error');
  elMarketplaceSearchStatus.textContent =
    'Consultando Mercado Livre, Amazon, Magalu e Casas Bahia...';
  elMarketplaceSearchResults.replaceChildren();

  try {
    const response = await fetch(
      `/api/marketplace-search?q=${encodeURIComponent(query)}`
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Não foi possível concluir a pesquisa.');
    }

    for (const result of data.results || []) {
      elMarketplaceSearchResults.appendChild(
        createMarketplaceResultCard(result)
      );
    }
    const sourceLinks = document.createElement('div');
    sourceLinks.className = 'marketplace-source-links';
    for (const source of data.sources || []) {
      sourceLinks.appendChild(createMarketplaceSourceLink(source));
    }
    elMarketplaceSearchResults.appendChild(sourceLinks);
    const failedSources = (data.sources || [])
      .filter(source => source.error)
      .map(source => source.marketplaceLabel);
    const cacheLabel = data.cached ? ' Resultado recuperado do cache.' : '';
    const failureLabel = failedSources.length
      ? ` Sem resposta de: ${failedSources.join(', ')}.`
      : '';
    elMarketplaceSearchStatus.textContent = data.results?.length
      ? `${data.results.length} produto(s) encontrado(s).${cacheLabel}${failureLabel} Apenas consulta; nada foi enviado ao WhatsApp.`
      : `Nenhum produto compatível foi extraído.${failureLabel} Tente informar marca e modelo.`;
  } catch (error) {
    elMarketplaceSearchStatus.classList.add('is-error');
    elMarketplaceSearchStatus.textContent = error.message;
  } finally {
    elMarketplaceSearchButton.disabled = false;
    elMarketplaceSearchButton.textContent = 'Pesquisar na internet';
  }
}

// ==========================================
// Category Inference Helper
// ==========================================
// ==========================================
// Category Inference Helper (Taxonomia Dinâmica)
// ==========================================
function getProductCategoryAndSub(dealOrTitle) {
  if (dealOrTitle && typeof dealOrTitle === 'object') {
    if (dealOrTitle.category && dealOrTitle.subcategory) {
      return {
        category: dealOrTitle.category,
        subcategory: dealOrTitle.subcategory,
        icon: dealOrTitle.categoryIcon || '🛍️'
      };
    }
    dealOrTitle = dealOrTitle.title || '';
  }

  const title = String(dealOrTitle || '').trim();
  if (!title) return { category: 'Ofertas Gerais', subcategory: 'Outros', icon: '🛍️' };
  const cleanTitle = title.toLowerCase();

  for (const [catName, catData] of Object.entries(globalTaxonomy)) {
    for (const [subName, keywords] of Object.entries(catData.subcategories || {})) {
      for (const keyword of keywords) {
        if (cleanTitle.includes(keyword.toLowerCase())) {
          if (keyword === 'cola' && cleanTitle.includes('colageno')) continue;
          if (keyword === 'cabo' && cleanTitle.includes('cabernet')) continue;
          if (keyword === 'barra' && cleanTitle.includes('barra de cereal')) continue;
          if (keyword === 'game' && cleanTitle.includes('cadeira gamer')) continue;

          return {
            category: catName,
            subcategory: subName,
            icon: catData.icon
          };
        }
      }
    }
  }

  return {
    category: 'Ofertas Gerais',
    subcategory: 'Outros',
    icon: '🛍️'
  };
}

async function fetchCategories() {
  try {
    const response = await fetch('/api/categories');
    globalTaxonomy = await response.json();
    
    // Povoar os selects de categoria
    populateCategorySelect(elFilterCategoryML);
    populateCategorySelect(elFilterCategoryAmazon);
    populateCategorySelect(elFilterCategoryShopee);
    populateCategorySelect(elFilterCategoryFutFanatics);
    
    // Configurar listeners em cascata
    elFilterCategoryML.addEventListener('change', () => {
      handleCategoryChange(elFilterCategoryML, elFilterSubcategoryML);
      applyMLFilters();
    });
    elFilterCategoryAmazon.addEventListener('change', () => {
      handleCategoryChange(elFilterCategoryAmazon, elFilterSubcategoryAmazon);
      applyAmazonFilters();
    });
    elFilterCategoryShopee.addEventListener('change', () => {
      handleCategoryChange(elFilterCategoryShopee, elFilterSubcategoryShopee);
      applyShopeeFilters();
    });
    elFilterCategoryFutFanatics?.addEventListener('change', () => {
      handleCategoryChange(elFilterCategoryFutFanatics, elFilterSubcategoryFutFanatics, 'futfanatics');
      applyFutFanaticsFilters();
    });
    
    elFilterSubcategoryML.addEventListener('change', applyMLFilters);
    elFilterSubcategoryAmazon.addEventListener('change', applyAmazonFilters);
    elFilterSubcategoryShopee.addEventListener('change', applyShopeeFilters);
    elFilterSubcategoryFutFanatics?.addEventListener('change', applyFutFanaticsFilters);
  } catch (err) {
    console.error('Erro ao buscar taxonomia de categorias:', err);
  }
}

function populateCategorySelect(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = '<option value="">Todas as Categorias</option>';
  for (const catName of Object.keys(globalTaxonomy)) {
    const opt = document.createElement('option');
    opt.value = catName;
    opt.textContent = catName;
    selectEl.appendChild(opt);
  }
}

function handleCategoryChange(categorySelectEl, subcategorySelectEl, platform = 'ml') {
  if (!categorySelectEl || !subcategorySelectEl) return;
  
  const selectedCat = categorySelectEl.value;
  subcategorySelectEl.innerHTML = '<option value="">Todas as Subcategorias</option>';
  
  if (!selectedCat || !globalTaxonomy[selectedCat]) {
    subcategorySelectEl.disabled = true;
    subcategorySelectEl.value = '';
    return;
  }
  
  const deals = platform === 'amazon'
    ? allAmazonDeals
    : platform === 'shopee'
      ? allShopeeDeals
      : platform === 'futfanatics'
        ? allFutFanaticsDeals
        : allMLDeals;
  const subcategories = Object.keys(globalTaxonomy[selectedCat].subcategories);
  
  subcategories.forEach(sub => {
    const count = deals.filter(deal => {
      const catInfo = getProductCategoryAndSub(deal);
      return catInfo.category === selectedCat && catInfo.subcategory === sub;
    }).length;

    const opt = document.createElement('option');
    opt.value = sub;
    opt.textContent = `${sub} (${count})`;
    subcategorySelectEl.appendChild(opt);
  });
  
  subcategorySelectEl.disabled = false;
}

function updateActiveFilterChip(platform) {
  const containerId = platform === 'amazon'
    ? 'active-filter-chip-amazon'
    : platform === 'shopee'
      ? 'active-filter-chip-shopee'
      : platform === 'futfanatics'
        ? 'active-filter-chip-futfanatics'
        : 'active-filter-chip-ml';
  const categoryEl = platform === 'amazon'
    ? elFilterCategoryAmazon
    : platform === 'shopee'
      ? elFilterCategoryShopee
      : platform === 'futfanatics'
        ? elFilterCategoryFutFanatics
        : elFilterCategoryML;
  const subcategoryEl = platform === 'amazon'
    ? elFilterSubcategoryAmazon
    : platform === 'shopee'
      ? elFilterSubcategoryShopee
      : platform === 'futfanatics'
        ? elFilterSubcategoryFutFanatics
        : elFilterSubcategoryML;
  const container = document.getElementById(containerId);
  if (!container) return;

  const catVal = categoryEl.value;
  const subVal = subcategoryEl.value;

  if (!catVal && !subVal) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  let labelText = `🏷️ ${catVal}`;
  if (subVal) {
    labelText += ` > ${subVal}`;
  }

  container.hidden = false;
  container.innerHTML = `
    <div class="active-filter-chip">
      <span>${escapeQueueHtml(labelText)}</span>
      <button type="button" title="Remover filtro" onclick="clearCategoryFilter('${platform}')">✕</button>
    </div>
  `;
}

function clearCategoryFilter(platform) {
  if (platform === 'amazon') {
    elFilterCategoryAmazon.value = '';
    handleCategoryChange(elFilterCategoryAmazon, elFilterSubcategoryAmazon, 'amazon');
    applyAmazonFilters();
  } else if (platform === 'shopee') {
    elFilterCategoryShopee.value = '';
    handleCategoryChange(elFilterCategoryShopee, elFilterSubcategoryShopee, 'shopee');
    applyShopeeFilters();
  } else if (platform === 'futfanatics') {
    if (elFilterCategoryFutFanatics) elFilterCategoryFutFanatics.value = '';
    handleCategoryChange(elFilterCategoryFutFanatics, elFilterSubcategoryFutFanatics, 'futfanatics');
    applyFutFanaticsFilters();
  } else {
    elFilterCategoryML.value = '';
    handleCategoryChange(elFilterCategoryML, elFilterSubcategoryML, 'ml');
    applyMLFilters();
  }
}

// ==========================================
// API Handlers
// ==========================================
async function fetchMLDeals() {
  showDealSkeletons(elGridML);
  try {
    const historyRes = await fetch('/api/publish-history');
    const historyData = await historyRes.json();
    const publishedEntries = historyData.entries || [];
    publicationHistorySignature = JSON.stringify(publishedEntries);

    const response = await fetch('/api/deals');
    const data = await response.json();
    
    allMLDeals = (data.deals || []).map(deal =>
      addPublicationState(deal, 'mercado_livre', publishedEntries)
    );
    allCoupons = data.coupons || [];
    freshnessML = data.freshness || null;

    visibleMLLimit = DEALS_PAGE_SIZE;
    renderMLDeals(allMLDeals);
    renderCoupons(allCoupons);
    
    if (data.generatedAt) {
      lastUpdateML = data.generatedAt;
      if (
        (elTabProducts.classList.contains('active') &&
          activeDealPlatform === 'ml') ||
        elTabCoupons.classList.contains('active')
      ) {
        updateLastUpdateUI('ml');
      }
    }
  } catch (err) {
    console.error('Erro ao buscar ofertas do Mercado Livre:', err);
    elGridML.innerHTML = `
      <div class="empty-state">
        <p>Não foi possível carregar as ofertas. Tente novamente.</p>
      </div>
    `;
  }
}

async function fetchAmazonDeals() {
  showDealSkeletons(elGridAmazon);
  try {
    const historyRes = await fetch('/api/publish-history');
    const historyData = await historyRes.json();
    const publishedEntries = historyData.entries || [];
    publicationHistorySignature = JSON.stringify(publishedEntries);

    const response = await fetch('/api/amazon-deals');
    const data = await response.json();
    
    allAmazonDeals = (data.deals || []).map(deal =>
      addPublicationState(deal, 'amazon', publishedEntries)
    );
    amazonDealsLoaded = true;
    freshnessAmazon = data.freshness || null;
    visibleAmazonLimit = DEALS_PAGE_SIZE;
    renderAmazonDeals(allAmazonDeals);
    
    if (data.generatedAt) {
      lastUpdateAmazon = data.generatedAt;
      if (
        elTabProducts.classList.contains('active') &&
        activeDealPlatform === 'amazon'
      ) {
        updateLastUpdateUI('amazon');
      }
    }
  } catch (err) {
    console.error('Erro ao buscar ofertas da Amazon:', err);
    elGridAmazon.innerHTML = `
      <div class="empty-state">
        <p>Não foi possível carregar as ofertas. Tente novamente.</p>
      </div>
    `;
  }
}

async function fetchShopeeDeals() {
  showDealSkeletons(elGridShopee);
  try {
    const response = await fetch('/api/shopee-deals');
    const data = await response.json();

    allShopeeDeals = data.deals || [];
    selectedShopeeIndices.clear();
    shopeeDealsLoaded = true;
    freshnessShopee = data.freshness || null;
    visibleShopeeLimit = DEALS_PAGE_SIZE;
    renderShopeeDeals(allShopeeDeals);

    if (data.generatedAt) {
      lastUpdateShopee = data.generatedAt;
      updateShopeeCatalogUpdate(lastUpdateShopee);
      if (
        elTabProducts.classList.contains('active') &&
        activeDealPlatform === 'shopee'
      ) {
        updateLastUpdateUI('shopee');
      }
    }
  } catch (err) {
    console.error('Erro ao buscar ofertas da Shopee:', err);
    elGridShopee.innerHTML = `
      <div class="empty-state">
        <p>Não foi possível carregar as ofertas da Shopee.</p>
      </div>
    `;
  }
}

async function fetchFutFanaticsDeals() {
  if (elGridFutFanatics) showDealSkeletons(elGridFutFanatics);
  try {
    const historyRes = await fetch('/api/publish-history');
    const historyData = await historyRes.json();
    const publishedEntries = historyData.entries || [];
    publicationHistorySignature = JSON.stringify(publishedEntries);

    const response = await fetch('/api/futfanatics-deals');
    const data = await response.json();

    allFutFanaticsDeals = (data.deals || []).map(deal =>
      addPublicationState(deal, 'futfanatics', publishedEntries)
    );
    futfanaticsDealsLoaded = true;
    freshnessFutFanatics = data.freshness || null;
    visibleFutFanaticsLimit = DEALS_PAGE_SIZE;
    renderFutFanaticsDeals(allFutFanaticsDeals);

    if (data.generatedAt) {
      lastUpdateFutFanatics = data.generatedAt;
      if (
        elTabProducts.classList.contains('active') &&
        activeDealPlatform === 'futfanatics'
      ) {
        updateLastUpdateUI('futfanatics');
      }
    }
  } catch (err) {
    console.error('Erro ao buscar ofertas da FutFanatics:', err);
    if (elGridFutFanatics) {
      elGridFutFanatics.innerHTML = `
        <div class="empty-state">
          <p>Não foi possível carregar as ofertas da FutFanatics. Tente novamente.</p>
        </div>
      `;
    }
  }
}

async function triggerFutFanaticsScraper() {
  showLoading('Varrendo ofertas da FutFanatics... Por favor aguarde.');
  try {
    const response = await fetch('/api/refresh-futfanatics-deals', { method: 'POST' });
    const data = await response.json();
    if (data.error) {
      alert(`Erro: ${data.error}`);
    } else {
      await fetchFutFanaticsDeals();
      alert('Ofertas da FutFanatics atualizadas com sucesso!');
    }
  } catch (err) {
    console.error('Erro ao atualizar FutFanatics:', err);
    alert('Erro ao atualizar ofertas da FutFanatics.');
  } finally {
    hideLoading();
  }
}

async function triggerMLScraper() {
  showLoading('Varrendo Mercado Livre & atualizando cupons válidos do dia... Por favor aguarde.');
  try {
    const response = await fetch('/api/scrape', { method: 'POST' });
    const data = await response.json();
    
    if (data.error) {
      alert(`Erro: ${data.error}`);
    } else {
      const historyRes = await fetch('/api/publish-history');
      const historyData = await historyRes.json();
      const publishedEntries = historyData.entries || [];

      allMLDeals = (data.data.deals || []).map(deal =>
        addPublicationState(deal, 'mercado_livre', publishedEntries)
      );
      allCoupons = data.data.coupons || [];
      freshnessML = data.data.freshness || null;
      selectedMLIndices.clear();
      visibleMLLimit = DEALS_PAGE_SIZE;
      updateMLSelectionUI();
      renderMLDeals(allMLDeals);
      renderCoupons(allCoupons);
      
      if (data.data.generatedAt) {
        lastUpdateML = data.data.generatedAt;
        updateLastUpdateUI('ml');
      }
      alert('Ofertas do Mercado Livre e Cupons do dia atualizados com sucesso!');
    }
  } catch (err) {
    console.error('Erro ao rodar scraper do ML:', err);
    alert('Erro ao atualizar base de dados do Mercado Livre.');
  } finally {
    hideLoading();
  }
}

async function triggerAmazonScraper() {
  showLoading('Varrendo ofertas da Amazon... Isso pode levar de 15 a 30 segundos.');
  try {
    const response = await fetch('/api/scrape-amazon', { method: 'POST' });
    const data = await response.json();
    
    if (data.error) {
      alert(`Erro: ${data.error}`);
    } else {
      const historyRes = await fetch('/api/publish-history');
      const historyData = await historyRes.json();
      const publishedEntries = historyData.entries || [];

      allAmazonDeals = (data.data.deals || []).map(deal =>
        addPublicationState(deal, 'amazon', publishedEntries)
      );
      freshnessAmazon = data.data.freshness || null;
      selectedAmazonIndices.clear();
      visibleAmazonLimit = DEALS_PAGE_SIZE;
      updateAmazonSelectionUI();
      renderAmazonDeals(allAmazonDeals);
      
      if (data.data.generatedAt) {
        lastUpdateAmazon = data.data.generatedAt;
        updateLastUpdateUI('amazon');
      }
      alert('Ofertas da Amazon atualizadas com sucesso!');
    }
  } catch (err) {
    console.error('Erro ao rodar scraper da Amazon:', err);
    alert('Erro ao atualizar base de dados da Amazon.');
  } finally {
    hideLoading();
  }
}

// ==========================================
// Post Flow to WhatsApp
// ==========================================
async function postSelectedDeals(platform) {
  if (platform === 'shopee') return;
  const indices = Array.from(platform === 'ml' ? selectedMLIndices : selectedAmazonIndices);
  const deals = platform === 'ml' ? allMLDeals : allAmazonDeals;
  const targetDeals = deals.filter((_, idx) => indices.includes(idx));

  if (targetDeals.length === 0) return;
  if (!whatsappReady) {
    alert('O WhatsApp não está conectado. Confira o status no topo da página.');
    return;
  }

  const modal = document.getElementById('progress-modal');
  const title = document.getElementById('progress-title');
  const logEl = document.getElementById('progress-log');
  const spinner = modal.querySelector('.progress-spinner');
  const stopButton = document.getElementById('btn-stop-progress');
  const closeButton = document.getElementById('btn-close-progress');
  
  lastFocusedElement = document.activeElement;
  title.textContent = 'Postando Stories no WhatsApp...';
  modal.classList.remove('hidden');
  modal.querySelector('.progress-modal-content').focus();
  spinner.style.display = 'block';
  stopButton.hidden = true;
  closeButton.disabled = false;
  logEl.replaceChildren();

  const addLog = (msg, type = 'info') => {
    const d = document.createElement('div');
    d.className = `progress-line progress-${type}`;
    d.textContent = msg;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  };

  addLog(`Preparando envio de ${targetDeals.length} ofertas para o WhatsApp...`);
  
  const payloadDeals = targetDeals.map(deal => ({
    ...deal,
    platform,
    comparison: deal.comparison || null
  }));
  const productProgress = payloadDeals.map((deal, index) => {
    const row = document.createElement('div');
    row.className = 'product-progress is-queued';

    const heading = document.createElement('div');
    heading.className = 'product-progress-heading';
    const name = document.createElement('strong');
    name.textContent =
      `${index + 1}. ${deal.title.substring(0, 58)}` +
      (deal.title.length > 58 ? '…' : '');
    const status = document.createElement('span');
    status.textContent = 'Na fila';
    heading.append(name, status);

    const track = document.createElement('div');
    track.className = 'product-progress-track';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', `Progresso de ${deal.title}`);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', '0');
    const bar = document.createElement('span');
    track.appendChild(bar);
    row.append(heading, track);
    logEl.appendChild(row);

    return (state, text, value) => {
      row.className = `product-progress is-${state}`;
      status.textContent = text;
      track.setAttribute('aria-valuenow', String(value));
      bar.style.width = `${value}%`;
      logEl.scrollTop = logEl.scrollHeight;
    };
  });

  const itemResults = [];
  for (let i = 0; i < payloadDeals.length; i++) {
    productProgress[i]('processing', 'Gerando Story e enviando…', 65);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedDeals: [payloadDeals[i]] })
      });
      const result = await response.json();
      const item = Array.isArray(result.results)
        ? result.results[0]
        : null;
      if (!item) {
        throw new Error(
          result.error ||
          result.message ||
          `Servidor respondeu HTTP ${response.status}.`
        );
      }
      itemResults.push(item);
      productProgress[i](
        item.success && item.msgId ? 'success' : 'error',
        item.success && item.msgId ? 'Enviado' : 'Falhou',
        100
      );
    } catch (err) {
      itemResults.push({
        dealId: generateClientDealId(payloadDeals[i], platform),
        title: payloadDeals[i].title,
        success: false,
        error: err.message
      });
      productProgress[i]('error', 'Falhou', 100);
    }
  }

  try {
    const sentItems = itemResults.filter(item => item.success && item.msgId);
    const failedItems = itemResults.filter(item => !item.success);

    for (const item of failedItems) {
      addLog(
        `❌ ${item.title || 'Oferta'}: ` +
        `${item.error || 'o WhatsApp não confirmou o envio.'}`,
        'error'
      );
    }

    if (sentItems.length > 0) {
      addLog(
        `✅ ${sentItems.length} de ${targetDeals.length} oferta(s) ` +
        `enviada(s) ao WhatsApp.`,
        failedItems.length ? 'warning' : 'success'
      );

      const dealList = platform === 'ml' ? allMLDeals : allAmazonDeals;
      const selectedIndices = platform === 'ml'
        ? selectedMLIndices
        : selectedAmazonIndices;
      for (const item of sentItems) {
        const index = dealList.findIndex(deal =>
          generateClientDealId(deal, platform) === item.dealId
        );
        if (index >= 0) {
          dealList[index].publishedMsgId = item.msgId;
          selectedIndices.delete(index);
        }
      }

      if (platform === 'ml') {
        renderMLDeals(allMLDeals);
      } else {
        renderAmazonDeals(allAmazonDeals);
      }
    } else {
      addLog(
        '❌ Nenhuma oferta foi enviada. Verifique a conexão do WhatsApp.',
        'error'
      );
    }
  } finally {
    spinner.style.display = 'none';
  }

  // Ofertas que falharam permanecem selecionadas para nova tentativa.
  if (platform === 'ml') {
    updateMLSelectionUI();
  } else {
    updateAmazonSelectionUI();
  }
}

async function triggerShopeeRefresh() {
  showLoading('Verificando se o feed da Shopee mudou...');
  try {
    const response = await fetch('/api/refresh-shopee', { method: 'POST' });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Falha ao atualizar a Shopee.');
    }

    allShopeeDeals = data.data.deals || [];
    shopeeDealsLoaded = true;
    freshnessShopee = data.data.freshness || null;
    lastUpdateShopee = data.data.generatedAt || lastUpdateShopee;
    visibleShopeeLimit = DEALS_PAGE_SIZE;
    renderShopeeDeals(allShopeeDeals);
    updateLastUpdateUI('shopee');
  } catch (err) {
    console.error('Erro ao atualizar feed da Shopee:', err);
    alert(err.message);
  } finally {
    hideLoading();
  }
}

// ==========================================
// Assisted Instagram publication queue
// ==========================================
function escapeQueueHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderPriceComparison(data, title) {
  const googleUrl = data.googleUrl ||
    `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(title)}`;
  const matches = Array.isArray(data.matches) ? data.matches : [];
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const storesHtml = matches.map(match => `
    <a
      class="comparison-store-row"
      href="${escapeQueueHtml(match.url)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span>${escapeQueueHtml(match.marketplaceLabel)}</span>
      <strong>${escapeQueueHtml(match.priceText)}</strong>
      <small>${match.match?.score || 0}% compatível ↗</small>
    </a>
  `).join('');
  const linksHtml = `
    <div class="comparison-actions">
      ${sources.map(source => `
        <a href="${escapeQueueHtml(source.searchUrl)}" target="_blank"
          rel="noopener noreferrer" class="comparison-link">
          ${escapeQueueHtml(source.marketplaceLabel)} ↗
        </a>
      `).join('')}
      <a href="${escapeQueueHtml(googleUrl)}" target="_blank"
        rel="noopener noreferrer" class="comparison-link">
        Google Shopping ↗
      </a>
    </div>
  `;
  if (!data.success) {
    return `
      <div class="comparison-details comparison-inconclusive">
        <strong>Sem nota — comparação inconclusiva</strong>
        <span>${escapeQueueHtml(
          data.error || 'Não encontramos produtos equivalentes suficientes.'
        )}</span>
        ${storesHtml ? `<div class="comparison-store-list">${storesHtml}</div>` : ''}
        ${linksHtml}
      </div>
    `;
  }
  const scoreClass = data.score >= 7
    ? 'is-good'
    : data.score >= 5
      ? 'is-normal'
      : 'is-bad';
  const savings = Math.abs(Number(data.savingsPercent) || 0)
    .toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
  const position = data.savingsPercent > 2
    ? `${savings}% abaixo da mediana`
    : data.savingsPercent < -2
      ? `${savings}% acima da mediana`
      : 'Preço semelhante à mediana';
  return `
    <div class="comparison-details">
      <div class="comparison-score-summary">
        <div class="comparison-score ${scoreClass}">
          <strong>${escapeQueueHtml(data.score)}</strong><span>/10</span>
        </div>
        <div>
          <strong class="comparison-verdict">${escapeQueueHtml(data.label)}</strong>
          <span>${position}</span>
          <small>
            Mediana ${escapeQueueHtml(data.medianPriceText)} ·
            confiança ${escapeQueueHtml(data.confidence)}
          </small>
        </div>
      </div>
      <div class="comparison-store-list">${storesHtml}</div>
      <p class="comparison-note">
        ${matches.length} loja(s) equivalente(s) ·
        ${data.cached ? 'resultado em cache' : 'consulta atualizada'}
      </p>
      ${linksHtml}
    </div>
  `;
}

function setQueueFeedback(message, type = 'info') {
  elQueueFeedback.textContent = message || '';
  elQueueFeedback.classList.toggle('is-error', type === 'error');
  elQueueFeedback.classList.toggle('is-success', type === 'success');
}

function setQueueSyncStatus(message, type = 'info') {
  elQueueSyncStatus.textContent = message || '';
  elQueueSyncStatus.classList.toggle('is-error', type === 'error');
}

function getQueueOperationalStatus(item) {
  const processingState = item.affiliateProcessing?.state;
  if (processingState === 'error') return 'processing_error';
  if (processingState === 'claimed') return 'processing';
  return item.status;
}

function getQueueStatusMeta(status) {
  const metadata = {
    processing: {
      label: 'Processando',
      className: 'is-processing'
    },
    processing_error: {
      label: 'Falha no link',
      className: 'is-review'
    },
    awaiting_affiliate: {
      label: 'Aguardando link afiliado',
      className: 'is-awaiting'
    },
    ready: {
      label: 'Pronta para publicar',
      className: 'is-ready'
    },
    needs_review: {
      label: 'Precisa de revisão',
      className: 'is-review'
    },
    published: {
      label: 'Publicada',
      className: 'is-published'
    },
    discarded: {
      label: 'Descartada',
      className: 'is-discarded'
    },
    expired: {
      label: 'Expirada',
      className: 'is-review'
    }
  };
  return metadata[status] || {
    label: status,
    className: ''
  };
}

function updateQueueSummary() {
  const summary = publicationQueueSummary || {};
  elQueueSummaryAwaiting.textContent = summary.awaitingAffiliate || 0;
  elQueueSummaryReady.textContent = summary.ready || 0;
  elQueueSummaryReview.textContent = summary.needsReview || 0;
  elQueueSummaryPublished.textContent = summary.published || 0;
  const discardedCount = summary.discarded || 0;
  elBtnClearDiscarded.hidden = discardedCount === 0;
  elBtnClearDiscarded.textContent =
    `Limpar descartadas (${discardedCount})`;
  const activeCount =
    (summary.awaitingAffiliate || 0) +
    (summary.ready || 0) +
    (summary.needsReview || 0);
  elQueueTabCount.textContent = activeCount;
  elHomeQueueCount.textContent =
    `${activeCount} ${activeCount === 1 ? 'item' : 'itens'}`;
  updateQueueFilterCounts();
}

function updateQueueFilterCounts() {
  const counts = new Map();
  for (const item of publicationQueueItems) {
    const status = getQueueOperationalStatus(item);
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  const activeCount = publicationQueueItems.filter(item => [
    'awaiting_affiliate',
    'ready',
    'needs_review'
  ].includes(item.status)).length;
  for (const option of elQueueStatusFilter.querySelectorAll('option[data-label]')) {
    const count = option.value === 'all'
      ? publicationQueueItems.length
      : option.value === 'active'
        ? activeCount
        : counts.get(option.value) || 0;
    option.textContent = `${option.dataset.label} (${count})`;
  }
}

function queueItemMatchesFilter(item) {
  if (
    elQueuePlatformFilter.value !== 'all' &&
    item.platform !== elQueuePlatformFilter.value
  ) return false;
  const filter = elQueueStatusFilter.value;
  if (filter === 'all') return true;
  if (filter === 'active') {
    return [
      'awaiting_affiliate',
      'ready',
      'needs_review'
    ].includes(item.status);
  }
  return getQueueOperationalStatus(item) === filter;
}

function sortQueueItems(items) {
  const sorted = [...items];
  const dateValue = item => new Date(
    item.updatedAt || item.createdAt || 0
  ).getTime() || 0;
  const priority = {
    processing_error: 0,
    needs_review: 1,
    awaiting_affiliate: 2,
    processing: 3,
    ready: 4,
    published: 5,
    discarded: 6,
    expired: 7
  };
  if (elQueueSortFilter.value === 'newest') {
    return sorted.sort((a, b) => dateValue(b) - dateValue(a));
  }
  if (elQueueSortFilter.value === 'oldest') {
    return sorted.sort((a, b) => dateValue(a) - dateValue(b));
  }
  if (elQueueSortFilter.value === 'discount') {
    return sorted.sort((a, b) =>
      (Number(b.discount) || 0) - (Number(a.discount) || 0) ||
      dateValue(b) - dateValue(a)
    );
  }
  return sorted.sort((a, b) =>
    (priority[getQueueOperationalStatus(a)] ?? 99) -
      (priority[getQueueOperationalStatus(b)] ?? 99) ||
    dateValue(b) - dateValue(a)
  );
}

function updateQueueSelection(visibleItems = null) {
  const existingIds = new Set(publicationQueueItems.map(item => item.id));
  for (const itemId of selectedQueueItemIds) {
    if (!existingIds.has(itemId)) selectedQueueItemIds.delete(itemId);
  }
  const visible = visibleItems ||
    publicationQueueItems.filter(queueItemMatchesFilter);
  elTxtSelectedQueueCount.textContent = selectedQueueItemIds.size;
  elBtnDeleteSelectedQueue.disabled = selectedQueueItemIds.size === 0;
  elChkSelectVisibleQueue.disabled = visible.length === 0;
  elChkSelectVisibleQueue.checked =
    visible.length > 0 &&
    visible.every(item => selectedQueueItemIds.has(item.id));
  updateBatchSelection();
}

function getQueueMarketplaceBrand(platform, link = '') {
  const norm = String(platform || '').toLowerCase();
  const url = String(link || '').toLowerCase();
  if (norm === 'amazon' || norm === 'amz' || url.includes('amazon.com')) {
    return { name: 'Amazon', className: 'amazon', affiliateHost: 'amzn.to' };
  }
  if (norm === 'shopee' || norm === 'shp' || url.includes('shopee.com')) {
    return { name: 'Shopee', className: 'shopee', affiliateHost: 's.shopee.com.br' };
  }
  return { name: 'Mercado Livre', className: 'mercado_livre', affiliateHost: 'meli.la' };
}

function buildQueueCardHTML(item) {
  const status = getQueueStatusMeta(getQueueOperationalStatus(item));
  const marketplace = getQueueMarketplaceBrand(item.platform, item.productLink);
  const affiliateForm = ['awaiting_affiliate', 'needs_review']
    .includes(item.status)
    ? `
      <div class="queue-affiliate-form">
        <label for="affiliate-${escapeQueueHtml(item.id)}">
          Link gerado manualmente na ${marketplace.name}
        </label>
        <div class="queue-affiliate-row">
          <input
            id="affiliate-${escapeQueueHtml(item.id)}"
            class="queue-affiliate-input"
            type="url"
            inputmode="url"
            autocomplete="off"
            placeholder="https://${marketplace.affiliateHost}/..."
            value="${escapeQueueHtml(item.affiliateLink || '')}"
          >
          <button type="button" data-queue-action="save-link">
            Validar link
          </button>
        </div>
      </div>
    `
    : '';

  const reviewMessage = item.reviewReason
    ? `
      <div class="queue-review-message">
        <strong>Revisão necessária:</strong>
        ${escapeQueueHtml(item.reviewReason)}
        ${item.reviewUpdatedStory
          ? `<button type="button" data-queue-action="approve-review">
            Aprovar Story atualizado
          </button>`
          : ''}
      </div>
    `
    : '';

  const readyActions = item.status === 'ready'
    ? `
      <div class="queue-ready-actions">
        <button type="button" data-queue-action="copy-title">
          Copiar título
        </button>
        <button type="button" data-queue-action="copy-caption">
          Copiar legenda
        </button>
        <button type="button" data-queue-action="copy-link">
          2. Copiar link afiliado
        </button>
        <button type="button" class="is-primary" data-queue-action="share-story">
          3. Enviar Story ao Instagram
        </button>
        <button type="button" data-queue-action="published">
          4. Marcar publicada
        </button>
      </div>
    `
    : '';

  const processingMessage = item.affiliateProcessing?.lastError
    ? `
      <div class="queue-processing-message">
        <strong>${escapeQueueHtml(
          item.affiliateProcessing.lastError.code || 'Erro'
        )}:</strong>
        ${escapeQueueHtml(item.affiliateProcessing.lastError.message || '')}
      </div>
    `
    : '';

  const validationMessage = item.validation?.message
    ? `
      <div class="queue-validation-message">
        <strong>Última validação:</strong>
        ${escapeQueueHtml(item.validation.message)}
      </div>
    `
    : '';

  const hasCouponInfo = item.coupon?.verificationStatus === 'verified_product';
  const couponDetails = hasCouponInfo
    ? `
      <div class="queue-coupon">
        <span>Cupom: <strong>${escapeQueueHtml(
          item.coupon.code
        )}</strong></span>
        ${item.coupon?.priceWithCoupon ? `<span>Com cupom: <strong>${escapeQueueHtml(item.coupon.priceWithCoupon)}</strong></span>` : ''}
      </div>
    `
    : '';

  const secondaryAction = [
    'awaiting_affiliate',
    'ready',
    'needs_review'
  ].includes(item.status)
    ? `
      <button type="button" class="queue-text-action" data-queue-action="discarded">
        Descartar oferta
      </button>
    `
    : item.status === 'discarded'
      ? `
        <button type="button" class="queue-text-action" data-queue-action="restore">
          Restaurar oferta
        </button>
      `
      : '';

  const completedDetails = item.status === 'published'
    ? `
      <p class="queue-completed-at">
        Publicada em ${new Date(item.publishedAt).toLocaleString('pt-BR')}
      </p>
    `
    : '';

  const currentVariant = item.currentVariant || 'coupon';
  const displayStoryUrl = (currentVariant === 'nocoupon' && item.storyUrlNoCoupon)
    ? item.storyUrlNoCoupon
    : (item.storyUrl || '');

  return {
    status,
    marketplace,
    innerHTML: `
      <div class="card-checkbox queue-card-checkbox">
        <label class="checkbox-container"
          aria-label="Selecionar ${escapeQueueHtml(item.title)}">
          <input type="checkbox" data-queue-select="${escapeQueueHtml(item.id)}"
            ${selectedQueueItemIds.has(item.id) ? 'checked' : ''}>
          <span class="checkmark"></span>
        </label>
      </div>
      <div class="queue-story-column">
        <img
          class="queue-story-preview"
          src="${escapeQueueHtml(displayStoryUrl)}"
          alt="Story preparado para ${escapeQueueHtml(item.title)}"
          loading="lazy"
          decoding="async"
          fetchpriority="low"
          width="220"
          height="391"
        >
        ${item.storyUrlNoCoupon ? `
          <div class="queue-story-toggle">
            <button type="button" class="btn-story-variant ${currentVariant === 'coupon' ? 'active' : ''}" data-queue-action="story-variant" data-variant="coupon">
              Com Cupom
            </button>
            <button type="button" class="btn-story-variant ${currentVariant === 'nocoupon' ? 'active' : ''}" data-queue-action="story-variant" data-variant="nocoupon">
              Sem Cupom
            </button>
          </div>
        ` : ''}
      </div>
      <div class="queue-content">
        <div class="queue-card-heading">
          <span class="queue-marketplace-badge">
            ${marketplace.name}
          </span>
          <span class="queue-status ${status.className}">
            ${escapeQueueHtml(status.label)}
          </span>
          <span class="queue-discount">${Number(item.discount) || 0}% OFF</span>
        </div>
        <h3>${escapeQueueHtml(item.title)}</h3>
        <div class="queue-price">
          <span>De ${escapeQueueHtml(item.originalPrice)}</span>
          <strong>Por ${escapeQueueHtml(item.currentPrice)}</strong>
        </div>
        ${renderPromotionScore(item)}
        <p class="queue-price-source">
          ${item.priceVerification
            ? `Preco confirmado pela extensao em ${new Date(item.priceVerification.verifiedAt).toLocaleString('pt-BR')}`
            : 'Aguardando confirmacao de preco pela extensao'}
        </p>
        ${couponDetails}
        <a
          class="queue-product-link"
          href="${escapeQueueHtml(item.productLink)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          1. Abrir produto na ${marketplace.name}
        </a>
        ${reviewMessage}
        ${processingMessage}
        ${validationMessage}
        ${affiliateForm}
        ${readyActions}
        ${completedDetails}
        <div class="queue-secondary-actions">${secondaryAction}</div>
      </div>
    `
  };
}

function getQueueCardSignature(item) {
  return JSON.stringify({
    status: item.status,
    updatedAt: item.updatedAt,
    affiliateLink: item.affiliateLink,
    storyUrl: item.storyUrl,
    originalPrice: item.originalPrice,
    currentPrice: item.currentPrice,
    discount: item.discount,
    reviewReason: item.reviewReason,
    reviewUpdatedStory: item.reviewUpdatedStory,
    coupon: item.coupon,
    priceVerification: item.priceVerification,
    promotionScore: item.promotionScore,
    validation: item.validation,
    affiliateProcessing: item.affiliateProcessing
  });
}

function renderPublicationQueue() {
  updateQueueSummary();
  const visibleItems = sortQueueItems(
    publicationQueueItems.filter(queueItemMatchesFilter)
  );

  if (visibleItems.length === 0) {
    elGridQueue.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<p>Nenhuma oferta corresponde a este filtro.</p>';
    elGridQueue.appendChild(empty);
    updateQueueSelection(visibleItems);
    return;
  }

  // --- Diff incremental: reutiliza cards existentes no DOM ---
  const existingCards = new Map();
  for (const card of elGridQueue.querySelectorAll('.queue-card[data-item-id]')) {
    existingCards.set(card.dataset.itemId, card);
  }

  // Limpa empty-state se presente
  const emptyState = elGridQueue.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const newIds = new Set(visibleItems.map(i => i.id));

  // Remover cards que não existem mais nos dados
  for (const [id, card] of existingCards) {
    if (!newIds.has(id)) {
      card.remove();
      existingCards.delete(id);
    }
  }

  // Adicionar novos / atualizar existentes (preservando imagens carregadas)
  let prevNode = null;
  for (const item of visibleItems) {
    let card = existingCards.get(item.id);
    const built = buildQueueCardHTML(item);
    const renderSignature = getQueueCardSignature(item);

    if (card) {
      if (card.dataset.renderSignature !== renderSignature) {
        card.className = `queue-card ${built.status.className} platform-${item.platform} ${
          selectedQueueItemIds.has(item.id) ? 'selected' : ''
        }`;
        card.dataset.status = item.status;
        card.dataset.affiliateLink = item.affiliateLink || '';
        card.dataset.storyFile = item.storyFile || '';
        card.dataset.renderSignature = renderSignature;
        card.innerHTML = built.innerHTML;
        const queueCheckbox = card.querySelector('[data-queue-select]');
        if (queueCheckbox) {
          queueCheckbox.addEventListener('change', () => {
            if (queueCheckbox.checked) selectedQueueItemIds.add(item.id);
            else selectedQueueItemIds.delete(item.id);
            updateQueueSelection(visibleItems);
          });
        }
      } else {
        const newClass = `queue-card ${built.status.className} platform-${item.platform} ${
          selectedQueueItemIds.has(item.id) ? 'selected' : ''
        }`;
        if (card.className !== newClass) card.className = newClass;

        const statusEl = card.querySelector('.queue-status');
        if (statusEl) {
          statusEl.className = `queue-status ${built.status.className}`;
          statusEl.textContent = built.status.label;
        }

        const img = card.querySelector('.queue-story-preview');
        const newSrc = item.storyUrl || '';
        if (img && img.getAttribute('src') !== newSrc) {
          img.src = newSrc;
        }
      }
    } else {
      // Criar card novo
      card = document.createElement('article');
      card.className = `queue-card ${built.status.className} platform-${item.platform} ${
        selectedQueueItemIds.has(item.id) ? 'selected' : ''
      }`;
      card.dataset.itemId = item.id;
      card.dataset.status = item.status;
      card.dataset.affiliateLink = item.affiliateLink || '';
      card.dataset.storyFile = item.storyFile || '';
      card.dataset.renderSignature = renderSignature;
      card.innerHTML = built.innerHTML;
      const queueCheckbox = card.querySelector('[data-queue-select]');
      if (queueCheckbox) {
        queueCheckbox.addEventListener('change', () => {
          if (queueCheckbox.checked) selectedQueueItemIds.add(item.id);
          else selectedQueueItemIds.delete(item.id);
          updateQueueSelection(visibleItems);
        });
      }
    }

    // Garantir ordem correta no DOM
    const expectedNext = prevNode ? prevNode.nextSibling : elGridQueue.firstChild;
    if (card !== expectedNext) {
      elGridQueue.insertBefore(card, expectedNext);
    }
    prevNode = card;
  }

  updateQueueSelection(visibleItems);
}

async function fetchPublicationQueue(options = {}) {
  const requestId = ++publicationQueueRequestSequence;
  publicationQueueAbortController?.abort();
  const controller = new AbortController();
  publicationQueueAbortController = controller;
  if (!options.silent) setQueueSyncStatus('Sincronizando fila...');
  try {
    const response = await fetch('/api/publication-queue', {
      cache: 'no-store',
      signal: controller.signal
    });
    const data = await readApiJson(response, 'carregar a fila');
    if (!response.ok) {
      throw new Error(data.error || `Falha HTTP ${response.status}.`);
    }
    if (requestId !== publicationQueueRequestSequence) return false;
    publicationQueueEnabled = data.enabled === true;
    elTabQueue.hidden = !publicationQueueEnabled;
    elBtnQueueML.hidden = !publicationQueueEnabled;
    if (elBtnQueueAmazon) elBtnQueueAmazon.hidden = !publicationQueueEnabled;
    elBtnQueueShopee.hidden = !publicationQueueEnabled;
    elBtnMobileQueue.hidden =
      !publicationQueueEnabled ||
      !['ml', 'amazon', 'shopee'].includes(activeDealPlatform);

    if (!publicationQueueEnabled) {
      publicationQueueItems = [];
      publicationQueueSummary = {};
      publicationQueueRevision = -1;
      setQueueSyncStatus('Fila desativada.');
      return true;
    }

    if (!Array.isArray(data.items)) {
      throw new Error('O servidor retornou uma fila em formato inválido.');
    }
    const nextRevision = Number.isFinite(Number(data.revision))
      ? Number(data.revision)
      : requestId;
    const changed = nextRevision !== publicationQueueRevision;
    if (changed) {
      publicationQueueItems = data.items;
      publicationQueueSummary = data.summary || {};
      publicationQueueRevision = nextRevision;
    }
    const shouldRender =
      options.render === true ||
      (
        options.render !== false &&
        elPanelQueue.classList.contains('active')
      );
    if (shouldRender && (changed || options.render === true)) {
      renderPublicationQueue();
    } else if (changed) {
      updateQueueSummary();
    }
    const syncedAt = new Date(data.syncedAt || Date.now());
    setQueueSyncStatus(
      `Atualizada às ${syncedAt.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })}`
    );
    if (options.feedback) {
      setQueueFeedback(options.feedback, options.type || 'success');
    }
    return true;
  } catch (err) {
    if (err.name === 'AbortError') return false;
    if (requestId !== publicationQueueRequestSequence) return false;
    console.error('Erro ao carregar fila de publicação:', err);
    setQueueSyncStatus(
      `Fila desatualizada: ${err.message} Tente atualizar novamente.`,
      'error'
    );
    return false;
  } finally {
    if (publicationQueueAbortController === controller) {
      publicationQueueAbortController = null;
    }
  }
}

async function deleteSelectedQueueItems() {
  const itemIds = [...selectedQueueItemIds];
  if (
    itemIds.length === 0 ||
    !confirm(`Excluir permanentemente ${itemIds.length} oferta(s) da fila?`)
  ) return;
  elBtnDeleteSelectedQueue.disabled = true;
  try {
    const response = await fetch('/api/publication-queue', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível excluir as ofertas.');
    }
    selectedQueueItemIds.clear();
    await fetchPublicationQueue({
      render: true,
      feedback: `${data.removedCount} oferta(s) excluída(s).`,
      type: 'success'
    });
  } catch (error) {
    setQueueFeedback(error.message, 'error');
  } finally {
    updateQueueSelection();
  }
}

async function validateEntireQueue() {
  elBtnValidateQueue.disabled = true;
  elBtnValidateQueue.textContent = 'Validando...';
  setQueueFeedback('Comparando a fila com os catálogos atuais...');
  try {
    const response = await fetch('/api/publication-queue/validate', {
      method: 'POST'
    });
    const data = await readApiJson(response, 'validar a fila');
    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível validar a fila.');
    }
    let job = data;
    if (!job.id) throw new Error('O servidor não identificou a validação.');
    let pollFailures = 0;
    while (job.state === 'running') {
      const progress = job.total > 0
        ? ` (${job.processed}/${job.total} Stories)`
        : '';
      if (job.phase === 'updating_catalogs') {
        const stores = (job.platforms || [])
          .map(platform => platform === 'shopee' ? 'Shopee' : 'Mercado Livre')
          .join(' e ');
        elBtnValidateQueue.textContent = 'Atualizando catálogos...';
        setQueueFeedback(
          `Atualizando ${stores || 'catálogos'} antes da validação...`
        );
      } else if (job.phase === 'updating_stories') {
        elBtnValidateQueue.textContent = `Atualizando${progress}`;
        setQueueFeedback(`Atualizando Stories${progress}...`);
      } else {
        elBtnValidateQueue.textContent = 'Verificando ofertas...';
        setQueueFeedback('Verificando preços e promoções...');
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
      try {
        const statusResponse = await fetch(
          '/api/publication-queue/validation/' + encodeURIComponent(job.id),
          { cache: 'no-store' }
        );
        job = await readApiJson(statusResponse, 'consultar a validação');
        if (!statusResponse.ok) {
          throw new Error(job.error || 'Falha ao consultar a validação.');
        }
        pollFailures = 0;
      } catch (error) {
        pollFailures += 1;
        if (pollFailures >= 3) throw error;
        setQueueFeedback(
          `Conexão instável. Retomando a validação (${pollFailures}/3)...`
        );
      }
    }
    if (job.state === 'failed') {
      throw new Error(job.error || 'A validação da fila falhou.');
    }
    const result = job.result || {};
    const skippedStores = (result.skippedPlatforms || [])
      .map(platform => getQueueMarketplaceBrand(platform).name)
      .join(' e ');
    const skippedMessage = skippedStores
      ? ` ${skippedStores} não foi alterada porque ainda não possui validação de catálogo.`
      : '';
    const platformFailures = (result.platformResults || [])
      .filter(platform => platform.state === 'failed')
      .map(platform => getQueueMarketplaceBrand(platform.platform).name)
      .join(' e ');
    const failureMessage = platformFailures
      ? ` Não foi possível atualizar ${platformFailures}; seus itens foram preservados.`
      : '';
    const hasFailures = (result.failed || 0) > 0 || Boolean(platformFailures);
    await fetchPublicationQueue({
      render: true,
      feedback:
        `${result.updated || 0} atualizada(s), ` +
        `${result.unchanged || 0} sem alterações, ` +
        `${result.missing || 0} não localizada(s) e ` +
        `${result.failed || 0} com falha.${skippedMessage}${failureMessage}`,
      type: hasFailures ? 'error' : 'success'
    });
  } catch (error) {
    setQueueFeedback(error.message, 'error');
  } finally {
    elBtnValidateQueue.disabled = false;
    elBtnValidateQueue.textContent = '↻ Validar fila';
  }
}

async function readApiJson(response, action) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const detail = text.trim().slice(0, 120);
    throw new Error(
      response.ok
        ? 'O servidor retornou uma resposta inválida.'
        : `O servidor não conseguiu ${action} (HTTP ${response.status})` +
          `${detail ? `: ${detail}` : '.'}`
    );
  }
}

function getSelectedPublicationDeals() {
  return [
    ...Array.from(selectedMLIndices, index => ({
      deal: allMLDeals[index],
      index,
      platform: 'mercado_livre'
    })),
    ...Array.from(selectedAmazonIndices, index => ({
      deal: allAmazonDeals[index],
      index,
      platform: 'amazon'
    })),
    ...Array.from(selectedShopeeIndices, index => ({
      deal: allShopeeDeals[index],
      index,
      platform: 'shopee'
    }))
  ].filter(item => item.deal);
}

async function enqueueDealsForPublication(items = getSelectedPublicationDeals()) {
  if (!publicationQueueEnabled || items.length === 0) return;
  const modal = document.getElementById('progress-modal');
  const title = document.getElementById('progress-title');
  const logEl = document.getElementById('progress-log');
  const spinner = modal.querySelector('.progress-spinner');
  const stopButton = document.getElementById('btn-stop-progress');
  const closeButton = document.getElementById('btn-close-progress');
  lastFocusedElement = document.activeElement;
  title.textContent = 'Preparando fila de publicação...';
  modal.classList.remove('hidden');
  modal.querySelector('.progress-modal-content').focus();
  spinner.style.display = 'block';
  stopQueueGenerationRequested = false;
  stopButton.hidden = false;
  stopButton.disabled = false;
  stopButton.textContent = 'Parar geração';
  closeButton.disabled = true;
  logEl.replaceChildren();

  const addLog = (message, type = 'info') => {
    const line = document.createElement('div');
    line.className = `progress-line progress-${type}`;
    line.textContent = message;
    logEl.appendChild(line);
    requestAnimationFrame(() => {
      logEl.scrollTop = logEl.scrollHeight;
    });
  };

  const itemsByClientId = new Map(items.map(item => [
    `${item.platform}:${item.index}`,
    item
  ]));
  const seenResults = new Set();
  let created = 0;
  let reused = 0;
  let failed = 0;
  let lastCurrentPosition = 0;
  let job;

  const consumeJob = currentJob => {
    if (
      currentJob.current?.position &&
      currentJob.current.position !== lastCurrentPosition
    ) {
      lastCurrentPosition = currentJob.current.position;
      addLog(
        `[${currentJob.current.position}/${currentJob.total}] Gerando Story: ` +
        `${currentJob.current.title.substring(0, 45)}...`
      );
    }
    for (const result of currentJob.results || []) {
      if (seenResults.has(result.clientId)) continue;
      seenResults.add(result.clientId);
      const source = itemsByClientId.get(result.clientId);
      if (result.success) {
        if (result.created) {
          created += 1;
          addLog('Story adicionado à fila.', 'success');
        } else {
          reused += 1;
          addLog('Oferta já ativa na fila.', 'info');
        }
        if (source) {
          if (source.platform === 'shopee') {
            selectedShopeeIndices.delete(source.index);
          } else if (source.platform === 'amazon') {
            selectedAmazonIndices.delete(source.index);
          } else {
            selectedMLIndices.delete(source.index);
          }
        }
      } else {
        failed += 1;
        addLog(
          `Falha em ${result.title || 'oferta'}: ${result.error}`,
          'error'
        );
      }
    }
  };

  try {
    const response = await fetch('/api/publication-queue/generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(item => ({
          clientId: `${item.platform}:${item.index}`,
          platform: item.platform,
          deal: item.deal
        }))
      })
    });
    job = await readApiJson(response, 'iniciar a geração');
    if (!response.ok) {
      throw new Error(job.error || 'Não foi possível iniciar a geração.');
    }
    activeQueueGenerationJobId = job.id;

    // Limpa a seleção imediatamente e atualiza os contadores em tempo real (resposta instantânea)
    items.forEach(item => {
      if (item.platform === 'shopee') selectedShopeeIndices.delete(item.index);
      else if (item.platform === 'amazon') selectedAmazonIndices.delete(item.index);
      else selectedMLIndices.delete(item.index);
    });
    updateMLSelectionUI();
    updateAmazonSelectionUI();
    updateShopeeSelectionUI();
    fetchPublicationQueue({ render: true });

    if (stopQueueGenerationRequested) {
      await fetch(
        '/api/publication-queue/generation/' +
        encodeURIComponent(job.id),
        { method: 'DELETE' }
      );
    }

    let pollFailures = 0;
    while (job.state === 'running') {
      consumeJob(job);
      await new Promise(resolve => setTimeout(resolve, 1500));
      try {
        const statusResponse = await fetch(
          `/api/publication-queue/generation/${encodeURIComponent(job.id)}`
        );
        if (!statusResponse.ok) {
          pollFailures++;
          if (pollFailures >= 6) {
            job = await readApiJson(statusResponse, 'acompanhar a geração');
            throw new Error(job.error || `Servidor temporariamente indisponível (HTTP ${statusResponse.status})`);
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        pollFailures = 0;
        job = await statusResponse.json();
      } catch (pollErr) {
        pollFailures++;
        if (pollFailures >= 6) {
          throw pollErr;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    consumeJob(job);
    if (job.state === 'failed') {
      throw new Error(job.error || 'A geração do lote falhou.');
    }
  } catch (error) {
    addLog(`Falha: ${error.message}`, 'error');
    failed += items.length - seenResults.size;
  } finally {
    activeQueueGenerationJobId = null;
    spinner.style.display = 'none';
    stopButton.hidden = true;
    closeButton.disabled = false;
    updateMLSelectionUI();
    updateAmazonSelectionUI();
    updateShopeeSelectionUI();
  }

  await fetchPublicationQueue({
    render: true,
    feedback:
      `${created} adicionada(s), ${reused} já existente(s), ` +
      `${failed} com falha.`,
    type: failed ? 'error' : 'success'
  });
  switchTab(elTabQueue, elPanelQueue);

  if (job?.state === 'cancelled' || stopQueueGenerationRequested) {
    addLog(
      `Geração interrompida: ${seenResults.size} de ${items.length} processado(s).`,
      'warning'
    );
  } else if (failed > 0) {
    addLog(`Geração concluída com ${failed} falha(s).`, 'error');
  } else {
    addLog('Todos os Stories foram gerados.', 'success');
  }
}

async function copyQueueText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const helper = document.createElement('textarea');
  helper.value = text;
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  helper.select();
  document.execCommand('copy');
  helper.remove();
}

async function shareQueueStory(item) {
  if (!window.isSecureContext || !navigator.share) {
    throw new Error(
      'O envio direto exige HTTPS válido. Ative o certificado do site no Coolify.'
    );
  }
  const response = await fetch(item.storyUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível carregar o Story.');
  const blob = await response.blob();
  const file = new File(
    [blob],
    `story-${item.id}.jpg`,
    { type: blob.type || 'image/jpeg' }
  );
  if (!navigator.canShare || navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: item.title
      });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
      throw err;
    }
  }
  throw new Error('Este navegador não permite compartilhar imagens.');
}

async function updateQueueItemStatus(itemId, status) {
  const response = await fetch(
    `/api/publication-queue/${encodeURIComponent(itemId)}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Falha ao atualizar status.');
  await fetchPublicationQueue();
}

function buildQueueCaption(item) {
  const lines = [
    '🔥 OFERTA ENCONTRADA!',
    '',
    item.title,
    '',
    `❌ De: ${item.originalPrice}`,
    `✅ Por: ${item.currentPrice}`,
    `💸 ${Number(item.discount) || 0}% OFF`
  ];
  if (item.coupon) {
    lines.push(
      `🎟️ Com o cupom ${item.coupon.code}: ${item.coupon.priceWithCoupon}`
    );
  }
  return [
    ...lines,
    '',
    '🛒 Comprar:',
    item.affiliateLink,
    '',
    'Preço e disponibilidade podem mudar a qualquer momento.'
  ].join('\n');
}

async function fetchLocalWorkerStatus() {
  try {
    const response = await fetch('/api/local-affiliate-worker/status');
    const data = await response.json();
    elLocalWorkerPanel.hidden = data.enabled !== true;
    if (!data.enabled) return;
    const workers = data.workers || [];
    const worker = workers.find(item => item.online) || workers[0] || null;
    const queue = data.queue || {};
    const labels = {
      idle: 'Ocioso',
      processing: 'Processando',
      auth_required: 'Autenticação necessária',
      offline: 'Offline',
      error: 'Erro'
    };
    elLocalWorkerBadge.textContent = worker?.online ? 'Online' : 'Offline';
    elLocalWorkerBadge.classList.toggle('is-online', worker?.online === true);
    elLocalWorkerDevice.textContent = worker?.deviceName || 'Nenhum';
    elLocalWorkerSeen.textContent = worker?.lastSeenAt
      ? new Date(worker.lastSeenAt).toLocaleString('pt-BR')
      : '--';
    elLocalWorkerState.textContent = labels[worker?.status] || 'Offline';
    elLocalWorkerProcessing.textContent = queue.processing || 0;
    elLocalWorkerReady.textContent = queue.ready || 0;
    elLocalWorkerErrors.textContent = queue.errors || 0;
    elLocalWorkerAuth.hidden = data.authRequired !== true;
  } catch (error) {
    elLocalWorkerBadge.textContent = 'Indisponível';
    elLocalWorkerBadge.classList.remove('is-online');
  }
}

function updateBatchSelection() {
  const readyIds = new Set(
    publicationQueueItems
      .filter(item => item.status === 'ready')
      .map(item => item.id)
  );
  const count = [...selectedQueueItemIds]
    .filter(itemId => readyIds.has(itemId))
    .length;
  elBatchSelectionCount.textContent =
    `${count} ${count === 1 ? 'oferta pronta selecionada' : 'ofertas prontas selecionadas'}`;
  elBtnPrepareBatch.disabled = count === 0;
}

function renderPublicationBatches() {
  elBatchList.replaceChildren();
  elBtnDownloadLatestBatch.disabled = publicationBatches.length === 0;
  if (publicationBatches.length === 0) {
    elBatchList.innerHTML =
      '<div class="empty-state"><p>Nenhum lote preparado.</p></div>';
    return;
  }
  for (const batch of publicationBatches) {
    const section = document.createElement('article');
    section.className = 'batch-card';
    section.dataset.batchId = batch.id;
    section.innerHTML = `
      <div class="batch-card-heading">
        <div>
          <h4>${escapeQueueHtml(batch.name)}</h4>
          <span>${new Date(batch.createdAt).toLocaleString('pt-BR')} ·
            ${batch.itemCount} oferta(s)</span>
        </div>
        <a href="${escapeQueueHtml(batch.downloadUrl)}">Baixar ZIP</a>
      </div>
      <div class="batch-item-grid">
        ${(batch.items || []).map(item => `
          <div class="batch-item" data-batch-item-id="${escapeQueueHtml(item.id)}">
            <img src="${escapeQueueHtml(item.storyUrl)}"
              alt="Story de ${escapeQueueHtml(item.title)}" loading="lazy">
            <strong>${escapeQueueHtml(item.title)}</strong>
            <div>
              <button type="button" data-batch-action="copy-link">Link</button>
              <button type="button" data-batch-action="copy-title">Título</button>
              <button type="button" data-batch-action="copy-caption">Legenda</button>
              <button type="button" data-batch-action="published">Publicado</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    elBatchList.appendChild(section);
  }
}

async function fetchPublicationBatches() {
  if (!publicationQueueEnabled) return;
  try {
    const response = await fetch('/api/publication-batches');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao carregar lotes.');
    publicationBatches = data.batches || [];
    renderPublicationBatches();
  } catch (error) {
    console.error('Erro ao carregar lotes:', error);
  }
}

async function preparePublicationBatch() {
  const readyItemIds = [...selectedQueueItemIds].filter(itemId =>
    publicationQueueItems.some(item =>
      item.id === itemId && item.status === 'ready'
    )
  );
  if (readyItemIds.length === 0) return;
  const name = prompt('Nome do lote:', `Lote ${new Date().toLocaleDateString('pt-BR')}`);
  if (name === null) return;
  elBtnPrepareBatch.disabled = true;
  try {
    const response = await fetch('/api/publication-batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        itemIds: readyItemIds
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao preparar lote.');
    readyItemIds.forEach(itemId => selectedQueueItemIds.delete(itemId));
    await fetchPublicationBatches();
    renderPublicationQueue();
    setQueueFeedback('Lote e pacote ZIP preparados.', 'success');
  } catch (error) {
    setQueueFeedback(error.message, 'error');
  } finally {
    updateBatchSelection();
  }
}

// ==========================================
// Rendering Methods (Cards & UI)
// ==========================================
function renderMLDeals(deals) {
  renderDeals(deals, 'ml');
  updateActiveFilterChip('ml');
}

function renderAmazonDeals(deals) {
  renderDeals(deals, 'amazon');
  updateActiveFilterChip('amazon');
}

function renderShopeeDeals(deals) {
  renderDeals(deals, 'shopee');
  updateActiveFilterChip('shopee');
}

function renderFutFanaticsDeals(deals) {
  renderDeals(deals, 'futfanatics');
  updateActiveFilterChip('futfanatics');
}

function applyMLFilters() {
  selectedMLIndices.clear();
  visibleMLLimit = DEALS_PAGE_SIZE;
  renderMLDeals(allMLDeals);
}

function applyAmazonFilters() {
  selectedAmazonIndices.clear();
  visibleAmazonLimit = DEALS_PAGE_SIZE;
  renderAmazonDeals(allAmazonDeals);
}

function applyShopeeFilters() {
  selectedShopeeIndices.clear();
  visibleShopeeLimit = DEALS_PAGE_SIZE;
  renderShopeeDeals(allShopeeDeals);
}

function applyFutFanaticsFilters() {
  selectedFutFanaticsIndices.clear();
  visibleFutFanaticsLimit = DEALS_PAGE_SIZE;
  renderFutFanaticsDeals(allFutFanaticsDeals);
}

function getFilteredDealEntries(deals, platform) {
  const filters = platform === 'amazon'
    ? [
      elFilterNameAmazon,
      elFilterCategoryAmazon,
      elFilterSubcategoryAmazon,
      elFilterDiscountAmazon
    ]
    : platform === 'shopee'
      ? [
        elFilterNameShopee,
        elFilterCategoryShopee,
        elFilterSubcategoryShopee,
        elFilterDiscountShopee,
        elFilterRecurringShopee
      ]
      : platform === 'futfanatics'
        ? [
          elFilterNameFutFanatics,
          elFilterCategoryFutFanatics,
          elFilterSubcategoryFutFanatics,
          elFilterDiscountFutFanatics
        ]
        : [
          elFilterNameML,
          elFilterCategoryML,
          elFilterSubcategoryML,
          elFilterDiscountML,
          elFilterRecurringML
        ];

  const searchTerm = (filters[0]?.value || '').toLowerCase().trim();
  const selectedCategory = filters[1]?.value || '';
  const selectedSubcategory = filters[2]?.value || '';
  const selectedDiscount = filters[3]?.value || '';
  const recurringOnly = filters[4]?.value === 'recurring';

  const selectedTeamSub = platform === 'futfanatics' ? elFilterTeamFutFanatics?.value : null;

  const entries = deals
    .map((deal, index) => ({ deal, index }))
    .filter(({ deal }) => {
      if (isDealInActiveQueue(deal, platform)) return false;

      const catInfo = getProductCategoryAndSub(deal);

      const matchSearch = !searchTerm || deal.title.toLowerCase().includes(searchTerm);
      const matchCategory = !selectedCategory || catInfo.category === selectedCategory;
      const matchSubcategory = !selectedSubcategory || catInfo.subcategory === selectedSubcategory;
      const matchTeam = !selectedTeamSub || catInfo.subcategory === selectedTeamSub;
      const matchDiscount = !selectedDiscount || Number(deal.discount) >= Number(selectedDiscount);
      const matchRecurring = !recurringOnly || deal.recurringPurchase === true;

      return matchSearch && matchCategory && matchSubcategory && matchTeam && matchDiscount && matchRecurring;
    });
  const sortControl = platform === 'amazon'
    ? elSortAmazon
    : platform === 'shopee'
      ? elSortShopee
      : elSortML;
  const value = deal => {
    switch (sortControl?.value || 'score') {
      case 'demand':
        return deal.promotionScore?.components?.demand?.score ?? -1;
      case 'commission_rate':
        return deal.commission?.rate ?? -1;
      case 'commission_amount':
        return deal.commission?.estimatedAmount ?? -1;
      case 'discount':
        return Number(deal.discount) || 0;
      case 'sales':
        return Number(deal.salesVelocity ?? deal.salesCount) || 0;
      case 'rating':
        return Number(deal.rating) || 0;
      default:
        return deal.promotionScore?.value ?? -1;
    }
  };
  return entries.sort((left, right) =>
    value(right.deal) - value(left.deal) ||
    (Number(right.deal.discount) || 0) - (Number(left.deal.discount) || 0)
  );
}

function renderPromotionScore(deal) {
  const score = deal.promotionScore;
  if (!score) return '';
  const starValue = Math.min(5, Math.max(0, Number(score.stars) || 0));
  const stars = Array.from({ length: 5 }, (_, index) => {
    const remaining = starValue - index;
    const state = remaining >= 1
      ? 'is-full'
      : remaining >= 0.5
        ? 'is-half'
        : '';
    return `<span class="promotion-star ${state}" aria-hidden="true">★</span>`;
  }).join('');
  const components = score.components || {};
  const categories = [
    ['Chance de venda', components.demand],
    ['Força da oferta', components.offer],
    ['Retorno de afiliado', components.commission],
    ['Confiança do produto', components.trust]
  ];
  const rows = categories.map(([label, item]) => `
    <span>${label}</span>
    <strong>${item?.available
      ? `${item.score}/100 · ${item.coverage}% dos dados`
      : 'Sem dados'}</strong>
  `).join('');
  const scoreExplanation = [
    ...categories.map(([label, item]) => item?.available
      ? `${label}: ${item.score}/100 (${item.coverage}% dos dados)`
      : `${label}: sem dados`),
    `Nota final: ${starValue.toFixed(1)}/5`,
    `Cobertura total: ${score.confidence}%`
  ].join(' · ');
  const commission = deal.commission
    ? `${deal.commission.rate}% · ${Number(deal.commission.estimatedAmount || 0)
      .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por venda`
    : 'Comissão ainda não informada';
  return `
    <details class="promotion-score ${score.eligible ? '' : 'is-ineligible'}">
      <summary>
        <span class="promotion-score-main">
          <small>Potencial da oferta</small>
          <span class="promotion-score-rating"
            title="${escapeQueueHtml(scoreExplanation)}"
            aria-label="Potencial ${starValue.toFixed(1)} de 5 estrelas">
            <span class="promotion-score-stars">${stars}</span>
            <strong>${starValue.toFixed(1)}</strong>
          </span>
        </span>
        <span class="promotion-score-label">${escapeQueueHtml(score.label)}</span>
        <small class="promotion-score-confidence">Dados: ${score.confidence}%</small>
      </summary>
      <div class="promotion-score-breakdown">
        ${rows}
        <p>${escapeQueueHtml(commission)}</p>
        ${score.blockers?.length
          ? `<p class="promotion-score-warning">${escapeQueueHtml(score.blockers.join(' · '))}</p>`
          : ''}
      </div>
    </details>
  `;
}

function updateDealPagination(platform, visibleCount, totalCount) {
  const elements = platform === 'amazon'
    ? [elPaginationAmazon, elPaginationCountAmazon, elBtnLoadMoreAmazon]
    : platform === 'shopee'
      ? [elPaginationShopee, elPaginationCountShopee, elBtnLoadMoreShopee]
      : platform === 'futfanatics'
        ? [elPaginationFutFanatics, elPaginationCountFutFanatics, elBtnLoadMoreFutFanatics]
        : [elPaginationML, elPaginationCountML, elBtnLoadMoreML];
  const [pagination, count, button] = elements;

  if (pagination) pagination.hidden = totalCount === 0;
  if (count) count.textContent = `Mostrando ${Math.min(visibleCount, totalCount)} de ${totalCount} ofertas`;
  if (button) button.hidden = visibleCount >= totalCount;
}

function getDealRenderConfig(platform) {
  if (platform === 'futfanatics') {
    return {
      grid: elGridFutFanatics,
      pagination: elPaginationFutFanatics,
      selected: selectedFutFanaticsIndices,
      visibleLimit: visibleFutFanaticsLimit,
      theme: 'futfanatics-theme',
      sourceCta: 'Ver Produto na FutFanatics 🔗',
      ratingLabel: 'Avaliação FutFanatics',
      emptyMessage: 'Nenhuma oferta da FutFanatics carregada. Clique em "Atualizar FutFanatics".',
      supportsPublished: true,
      showCoupon: true,
      showRecurring: false,
      updateSelection: updateFutFanaticsSelectionUI
    };
  }
  if (platform === 'amazon') {
    return {
      grid: elGridAmazon,
      pagination: elPaginationAmazon,
      selected: selectedAmazonIndices,
      visibleLimit: visibleAmazonLimit,
      theme: 'amazon-theme',
      sourceCta: 'Ver Produto na Amazon 🔗',
      ratingLabel: 'Avaliação Amazon',
      emptyMessage: 'Nenhuma oferta da Amazon carregada. Clique em "Atualizar Amazon".',
      supportsPublished: true,
      showCoupon: false,
      showRecurring: false,
      updateSelection: updateAmazonSelectionUI
    };
  }
  if (platform === 'shopee') {
    return {
      grid: elGridShopee,
      pagination: elPaginationShopee,
      selected: selectedShopeeIndices,
      visibleLimit: visibleShopeeLimit,
      theme: 'shopee-theme',
      sourceCta: 'Ver produto na Shopee 🔗',
      ratingLabel: 'Avaliação Shopee',
      emptyMessage: 'Nenhuma oferta da Shopee carregada.',
      supportsPublished: false,
      showCoupon: false,
      showRecurring: true,
      updateSelection: updateShopeeSelectionUI
    };
  }
  return {
    grid: elGridML,
    pagination: elPaginationML,
    selected: selectedMLIndices,
    visibleLimit: visibleMLLimit,
    theme: '',
    sourceCta: 'Ver Produto no ML 🔗',
    ratingLabel: 'Avaliação Mercado Livre',
    emptyMessage: 'Nenhuma oferta do Mercado Livre carregada. Clique em "Atualizar Mercado Livre".',
    supportsPublished: true,
    showCoupon: true,
    showRecurring: true,
    updateSelection: updateMLSelectionUI
  };
}

function renderDeals(deals, platform) {
  const config = getDealRenderConfig(platform);
  const {
    grid,
    pagination,
    selected,
    visibleLimit,
    theme,
    sourceCta,
    ratingLabel,
    emptyMessage,
    supportsPublished,
    showCoupon,
    showRecurring,
    updateSelection
  } = config;
  grid.innerHTML = '';

  if (deals.length === 0) {
    pagination.hidden = true;
    grid.innerHTML = `
      <div class="empty-state">
        <p>${emptyMessage}</p>
      </div>
    `;
    return;
  }

  const filteredEntries = getFilteredDealEntries(deals, platform);
  if (filteredEntries.length === 0) {
    pagination.hidden = true;
    grid.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma oferta corresponde aos filtros selecionados.</p>
      </div>
    `;
    updateSelection();
    return;
  }

  const visibleEntries = filteredEntries.slice(0, visibleLimit);
  for (const { deal, index } of visibleEntries) {
    const isSelected = selected.has(index);
    const isPublished = supportsPublished && Boolean(deal.publishedMsgId);
    const wasRemoved = supportsPublished && Boolean(deal.removedFromWhatsAppAt);
    const title = escapeQueueHtml(deal.title);
    const link = escapeQueueHtml(deal.link);
    const rating = Number(deal.rating);
    const card = document.createElement('article');
    card.className = [
      'deal-card',
      theme,
      isSelected ? 'selected' : '',
      isPublished ? 'published-card' : ''
    ].filter(Boolean).join(' ');
    card.dataset.index = index;
    card.dataset.platform = platform;

    const checkboxHtml = isPublished
      ? `
        <div class="card-checkbox published-tick" title="Já publicado hoje">
          ✅
        </div>
      `
      : `
        <div class="card-checkbox">
          <label class="checkbox-container">
            <input type="checkbox" class="deal-chk" data-index="${index}"
              ${isSelected ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
        </div>
      `;

    let publicationHtml = '';
    if (wasRemoved) {
      publicationHtml = `
        <div class="card-published-area">
          <span class="published-badge removed-by-reaction">
            Encerrado por reação ${escapeQueueHtml(deal.removalReaction || '✅')}
          </span>
        </div>
      `;
    } else if (isPublished) {
      publicationHtml = `
        <div class="card-published-area">
          <span class="published-badge">WhatsApp Ativo ✅</span>
          <button type="button" class="btn-delete-wpp"
            data-msg-id="${escapeQueueHtml(deal.publishedMsgId)}"
            data-platform="${platform}" data-index="${index}">
            🗑️ Excluir do WhatsApp
          </button>
        </div>
      `;
    }

    const bestCoupon = showCoupon ? deal.couponCandidates?.[0] : null;
    const couponHtml = bestCoupon
      ? `
        <div class="deal-coupon-badge" title="${escapeQueueHtml(bestCoupon.rules)}">
          <span class="coupon-icon">🎟️</span>
          Candidato: <strong>${escapeQueueHtml(bestCoupon.code)}</strong>
          <small>A extensão verificará no produto</small>
        </div>
      `
      : '';
    const recurringHtml = showRecurring && deal.recurringPurchase
      ? `<span class="recurring-badge">🔁 ${escapeQueueHtml(
        deal.recurringPurchaseCategory || 'Compra recorrente'
      )}</span>`
      : '';

    card.innerHTML = `
      ${checkboxHtml}
      <div class="card-image-box">
        <img class="card-image" src="${getDealImageUrl(deal.image)}"
          alt="${title}" loading="lazy" decoding="async" width="240" height="240">
        <span class="card-discount-badge">${Number(deal.discount) || 0}% OFF</span>
      </div>
      <div class="card-details">
        <a href="${link}" target="_blank" rel="noopener noreferrer"
          class="card-link-product">${sourceCta}</a>
        <div class="card-meta">
          <span class="card-rating" title="Nota informada pelo marketplace">
            <small>${ratingLabel}</small>
            <strong>${rating ? `⭐ ${rating.toFixed(1)}` : 'Sem avaliação'}</strong>
          </span>
          <span class="card-sales">${escapeQueueHtml(deal.salesInfo || '')}</span>
        </div>
        <h3 class="card-title" title="${title}">${title}</h3>
        <div class="card-price-box">
          <span class="card-orig-price">De: ${escapeQueueHtml(deal.originalPrice)}</span>
          <span class="card-promo-price">Por: ${escapeQueueHtml(deal.currentPrice)}</span>
        </div>
        ${renderPromotionScore(deal)}
        ${recurringHtml}
        ${couponHtml}
        <button type="button" class="btn-add-queue-card"
          data-index="${index}" data-platform="${platform}"
          ${publicationQueueEnabled ? '' : 'hidden'}>
          Preparar para Instagram
        </button>
        <div class="price-comparison-area">
          <button type="button" class="btn-compare-buscape">
            ${deal.comparison ? '↻ Atualizar Comparação' : '🔍 Comparar Preços'}
          </button>
          <div class="comparison-results ${deal.comparison ? '' : 'hidden'}">
            ${deal.comparison ? renderPriceComparison(deal.comparison, deal.title) : ''}
          </div>
        </div>
        ${publicationHtml}
      </div>
    `;

    card.addEventListener('click', event => {
      if (isPublished) return;
      if (
        event.target.closest('.checkbox-container') ||
        event.target.closest('a') ||
        event.target.closest('button')
      ) return;
      toggleDealSelectIndex(platform, index);
    });
    if (!isPublished) {
      card.querySelector('.deal-chk').addEventListener('change', () =>
        toggleDealSelectIndex(platform, index)
      );
    }
    grid.appendChild(card);
  }

  updateDealPagination(platform, visibleEntries.length, filteredEntries.length);
  updateSelection();
}

function renderMLDeals(deals) {
  renderDeals(deals, 'ml');
}

function renderAmazonDeals(deals) {
  renderDeals(deals, 'amazon');
}

function renderShopeeDeals(deals) {
  renderDeals(deals, 'shopee');
}

let activeCouponMarketplace = 'all';

function renderCoupons(coupons) {
  elGridCoupons.innerHTML = '';
  
  const searchInput = document.getElementById('ipt-filter-coupons');
  const statusSelect = document.getElementById('sel-filter-coupon-status');
  const discountSelect = document.getElementById('sel-filter-coupon-discount');

  const searchText = (searchInput?.value || '').toLowerCase().trim();
  const selectedStatus = statusSelect?.value || '';
  const selectedMinDiscount = Number(discountSelect?.value || 0);

  // Filtra por busca, status e desconto
  const filteredCoupons = coupons.filter(coupon => {
    const rulesText = (coupon.rules || '').toLowerCase();
    const codeText = (coupon.code || '').toLowerCase();
    const matchesSearch = !searchText || codeText.includes(searchText) || rulesText.includes(searchText);

    const marketplace = coupon.marketplace || coupon.platform || 'mercado_livre';
    const selectedMarketplace = activeCouponMarketplace === 'ml'
      ? 'mercado_livre'
      : activeCouponMarketplace;
    const matchesMarketplace = activeCouponMarketplace === 'all' ||
      marketplace === selectedMarketplace;
    const status = coupon.status || coupon.verificationStatus || 'discovered';
    const matchesStatus = !selectedStatus || status === selectedStatus;

    // Extrai % de desconto das regras
    const percentMatch = rulesText.match(/(\d+)\s*%/);
    const percent = percentMatch ? Number(percentMatch[1]) : 0;
    const matchesDiscount = !selectedMinDiscount || percent >= selectedMinDiscount;

    return matchesMarketplace && matchesSearch && matchesStatus && matchesDiscount;
  });

  if (filteredCoupons.length === 0) {
    elGridCoupons.innerHTML = `
      <div class="empty-state">
        <p>Nenhum cupom encontrado para os filtros selecionados.</p>
      </div>
    `;
    return;
  }

  // Agrupa em Verificados e Não Verificados
  const verifiedCoupons = filteredCoupons.filter(c =>
    c.verificationStatus === 'verified_product'
  );
  const unverifiedCoupons = filteredCoupons.filter(c =>
    c.verificationStatus !== 'verified_product'
  );

  const renderCouponGroup = (title, items, isVerifiedGroup) => {
    if (items.length === 0) return;
    
    const groupHeader = document.createElement('div');
    groupHeader.className = 'coupon-group-heading';
    groupHeader.innerHTML = `<span>${title}</span> <small>(${items.length})</small>`;
    elGridCoupons.appendChild(groupHeader);

    items.forEach((coupon) => {
      // Seleciona ofertas do marketplace escolhido
      const couponMarketplace = coupon.marketplace || 'mercado_livre';
      const dealsToCompare = couponMarketplace === 'amazon'
        ? allAmazonDeals
        : couponMarketplace === 'shopee'
          ? allShopeeDeals
          : allMLDeals;
      const compatibleDeals = findCompatibleDealsForCoupon(coupon, dealsToCompare);
      const compCount = compatibleDeals.length;
      const isConfirmed = coupon.verificationStatus === 'verified_product';
      const checkedAt = parseBackendDate(coupon.lastCheckedAt);
      const confirmedAt = parseBackendDate(coupon.lastConfirmedAt);
      const verificationLabel = isConfirmed
        ? `Confirmado no produto${confirmedAt ? ` em ${confirmedAt.toLocaleString('pt-BR')}` : ''}`
        : 'Descoberto; a extensão ainda precisa confirmar no produto';

      const item = document.createElement('div');
      item.className = 'coupon-ticket';
      
      item.innerHTML = `
        <div class="coupon-info">
          <div class="coupon-code">${coupon.code}</div>
          <div class="coupon-rule">${coupon.rules}</div>
          <div class="coupon-limit">Limite: ${coupon.maxLimit || 'N/A'}</div>
          <div class="coupon-verification ${isConfirmed ? 'is-confirmed' : 'is-unverified'}">
            ${verificationLabel}
          </div>
          <div class="coupon-verification-dates">
            Consultado na fonte: ${checkedAt ? checkedAt.toLocaleString('pt-BR') : 'não informado'}<br>
            Última confirmação: ${confirmedAt ? confirmedAt.toLocaleString('pt-BR') : 'nunca'}
          </div>
          <div class="coupon-compatible-status ${compCount > 0 ? 'status-active' : 'status-inactive'}">
            🎯 Compatibilidade estimada com <strong>${compCount}</strong> ofertas
          </div>
          <div class="coupon-filter-row">
            <input type="text" class="ipt-mini-filter" placeholder="Filtrar produtos compatíveis..." title="Filtrar produtos">
            <button class="btn-toggle-products" title="Ver produtos">
              <span class="arrow-icon">▼</span>
            </button>
          </div>
          <div class="compatible-products-list hidden">
            <div class="compatible-products-grid"></div>
          </div>
        </div>
        <div class="coupon-actions">
          <button class="btn-copy" data-code="${coupon.code}">Copiar Código</button>
        </div>
      `;
      
      const gridContainer = item.querySelector('.compatible-products-grid');
      const listContainer = item.querySelector('.compatible-products-list');
      const toggleBtn = item.querySelector('.btn-toggle-products');
      const arrowIcon = item.querySelector('.arrow-icon');
      const miniFilterInput = item.querySelector('.ipt-mini-filter');
      
      const updateFilteredGrid = (miniSearchTerm = '') => {
        if (!gridContainer) return;
        gridContainer.innerHTML = '';
        
        const filteredDeals = compatibleDeals.filter(d => 
          d.title.toLowerCase().includes(miniSearchTerm.toLowerCase())
        );
        
        if (filteredDeals.length === 0) {
          gridContainer.innerHTML = '<div class="no-results-mini">Nenhum produto correspondente.</div>';
          return;
        }
        
        filteredDeals.forEach(d => {
          const mini = document.createElement('div');
          mini.className = 'compatible-product-mini';
          mini.innerHTML = `
            <img src="${d.image}" alt="" loading="lazy" decoding="async">
            <div class="mini-details">
              <span class="mini-title">${d.title}</span>
              <span class="mini-price">${d.currentPrice} (${d.discount}% OFF)</span>
            </div>
          `;
          
          gridContainer.appendChild(mini);
        });
      };

      updateFilteredGrid();

      if (miniFilterInput) {
        miniFilterInput.addEventListener('input', (e) => {
          updateFilteredGrid(e.target.value.trim());
        });
      }

      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          const isHidden = listContainer.classList.contains('hidden');
          if (isHidden) {
            listContainer.classList.remove('hidden');
            arrowIcon.textContent = '▲';
            toggleBtn.classList.add('expanded');
          } else {
            listContainer.classList.add('hidden');
            arrowIcon.textContent = '▼';
            toggleBtn.classList.remove('expanded');
          }
        });
      }

      const copyBtn = item.querySelector('.btn-copy');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(coupon.code).then(() => {
          copyBtn.textContent = 'Copiado! ✓';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.textContent = 'Copiar Código';
            copyBtn.classList.remove('copied');
          }, 2000);
        });
      });

      elGridCoupons.appendChild(item);
    });
  };

  renderCouponGroup('Cupons confirmados no produto', verifiedCoupons, true);
  renderCouponGroup('Cupons descobertos', unverifiedCoupons, false);
}

// Modal e Geração de Story com Cupom para Instagram
function openCouponStoryModal(coupon, deal) {
  const modal = document.getElementById('coupon-story-modal');
  const previewBody = document.getElementById('coupon-story-preview-body');
  if (!modal || !previewBody) return;

  if (
    coupon?.verificationStatus !== 'verified_product' ||
    !coupon?.verifiedAt ||
    !coupon?.priceWithCoupon
  ) return;

  // Cálculo de Preço estimado com cupom
  const priceWithCouponStr = coupon.priceWithCoupon;
  const savingsStr = coupon.savings || '';
  const couponData = { ...coupon };

  previewBody.innerHTML = `
    <div class="coupon-story-preview-card">
      <div class="coupon-preview-product-row">
        <img src="${deal.image}" alt="">
        <div>
          <h4>${escapeQueueHtml(deal.title)}</h4>
          <span class="coupon-code-badge">CUPOM: ${escapeQueueHtml(coupon.code)}</span>
        </div>
      </div>
      <div class="coupon-preview-prices">
        <div class="coupon-price-row">
          <span>Preço original:</span>
          <span><s>${deal.originalPrice || deal.currentPrice}</s></span>
        </div>
        <div class="coupon-price-row">
          <span>Preço sem cupom:</span>
          <span>${deal.currentPrice} (${deal.discount}% OFF)</span>
        </div>
        <div class="coupon-price-row">
          <span><strong>Preço final com cupom:</strong></span>
          <span class="coupon-price-highlight">${priceWithCouponStr}</span>
        </div>
        <div class="coupon-price-row">
          <span>Economia extra do cupom:</span>
          <strong style="color: #ffe600;">${savingsStr}</strong>
        </div>
      </div>
      <button id="btn-generate-coupon-story-action" class="btn-cta" type="button" style="margin-top: 10px;">
        📸 Gerar e Baixar Story para Instagram (.JPG)
      </button>
      <div id="coupon-story-result-area"></div>
    </div>
  `;

  document.getElementById('btn-close-coupon-modal').onclick = () => {
    modal.classList.add('hidden');
  };

  document.getElementById('btn-generate-coupon-story-action').onclick = async () => {
    const btn = document.getElementById('btn-generate-coupon-story-action');
    const resultArea = document.getElementById('coupon-story-result-area');
    btn.disabled = true;
    btn.textContent = 'Gerando Story... Aguarde.';

    try {
      const response = await fetch('/api/generate-coupon-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal, coupon: couponData })
      });

      const data = await response.json();
      if (!response.ok || !data.imageBuffer) {
        throw new Error(data.error || 'Falha ao gerar Story com cupom.');
      }

      resultArea.innerHTML = `
        <div style="margin-top: 15px; text-align: center;">
          <p style="color: #2ecc71; font-weight: 700; margin-bottom: 10px;">✓ Story gerado com sucesso!</p>
          <img src="${data.imageBuffer}" alt="Story gerado" style="max-height: 400px; border-radius: 16px; margin-bottom: 10px; border: 2px solid #ffe600;">
          <br>
          <a href="${data.imageBuffer}" download="story_cupom_${coupon.code}_${Date.now()}.jpg" class="btn-cta" style="display: inline-block; text-decoration: none; padding: 10px 20px;">
            ⬇️ Baixar Imagem do Story
          </a>
        </div>
      `;
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '📸 Gerar e Baixar Story para Instagram (.JPG)';
    }
  };

  modal.classList.remove('hidden');
}

function findCompatibleDealsForCoupon(coupon, deals) {
  if (!coupon || !coupon.rules || !deals) return [];
  const rulesText = coupon.rules.toLowerCase();
  if (
    /produtos? selecionad/.test(rulesText) &&
    !Array.isArray(coupon.eligibleProductIds) &&
    !Array.isArray(coupon.productIds)
  ) return [];
  
  let minPrice = 0;
  const priceMatch = rulesText.match(/(?:r\$\s*|acima de\s+|partir de\s+|mínimas de\s+)([0-9.,]+)/i);
  if (priceMatch) {
    const numStr = priceMatch[1].replace(/\./g, '').replace(',', '.');
    minPrice = parseFloat(numStr) || 0;
  }
  
  return deals.filter(deal => {
    const cleanPriceStr = deal.currentPrice.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const price = parseFloat(cleanPriceStr) || 0;
    if (minPrice > 0 && price < minPrice) return false;
    
    const catInfo = getProductCategoryAndSub(deal.title);
    const catName = catInfo.category;
    const categoryTerms = {
      'Eletrônicos e Tecnologia': ['tecnologia', 'celular', 'smartphone', 'tv', 'smart tv', 'eletrônicos', 'eletronico', 'câmera', 'camera', 'samsung', 'motorola', 'impressora'],
      'Games e Consoles': ['ps5', 'game', 'playstation', 'xbox', 'nintendo', 'console', 'jogo'],
      'Casa, Cozinha e Eletrodomésticos': ['eletrodomésticos', 'eletrodomestico', 'cozinha', 'air fryer', 'fritadeira', 'liquidificador', 'casa', 'ventilador', 'panela'],
      'Saúde, Fitness e Esportes': ['suplementos', 'suplemento', 'whey', 'creatina', 'growth', 'dieta', 'academia', 'esporte', 'fitness', 'treino', 'sports', 'health'],
      'Beleza e Cuidados Pessoais': ['beleza', 'cabelo', 'perfume', 'hidratante', 'creme', 'shampoo', 'higiene', 'pessoal', 'barbear', 'skincare', 'loreal', 'darrow', 'avene', 'avène', 'isdin', 'protetor solar'],
      'Ferramentas e Construção': ['construção', 'construcao', 'ferramenta', 'torneira', 'reforma', 'jardim', 'reparos']
    };
    
    let hasCategoryRestriction = false;
    let categoryMatches = false;
    
    for (const [key, terms] of Object.entries(categoryTerms)) {
      const isMentioned = terms.some(term => rulesText.includes(term));
      if (isMentioned) {
        hasCategoryRestriction = true;
        if (catName === key) categoryMatches = true;
      }
    }
    
    if (hasCategoryRestriction && !categoryMatches) return false;
    return true;
  });
}

// ==========================================
// Selection Management
// ==========================================
function getDealSelectionConfig(platform) {
  if (platform === 'amazon') {
    return {
      grid: elGridAmazon,
      selected: selectedAmazonIndices,
      selectAll: elChkSelectAllAmazon,
      clearButton: elBtnClearSelectionAmazon,
      generateButton: elBtnGenerateAmazon,
      countElement: elTxtSelectedCountAmazon
    };
  }
  if (platform === 'shopee') {
    return {
      grid: elGridShopee,
      selected: selectedShopeeIndices,
      selectAll: elChkSelectAllShopee,
      clearButton: elBtnClearSelectionShopee,
      generateButton: null,
      countElement: null
    };
  }
  return {
    grid: elGridML,
    selected: selectedMLIndices,
    selectAll: elChkSelectAllML,
    clearButton: elBtnClearSelectionML,
    generateButton: elBtnGenerateML,
    countElement: elTxtSelectedCountML
  };
}

function toggleDealSelectIndex(platform, index) {
  const { selected } = getDealSelectionConfig(platform);
  if (selected.has(index)) selected.delete(index);
  else selected.add(index);
  updateDealSelectionUI(platform);
}

function toggleMLSelectIndex(index) {
  toggleDealSelectIndex('ml', index);
}

function toggleAmazonSelectIndex(index) {
  toggleDealSelectIndex('amazon', index);
}

function toggleShopeeSelectIndex(index) {
  toggleDealSelectIndex('shopee', index);
}

function updateMobileSelectionBar() {
  const onDealTab = elTabProducts.classList.contains('active');
  const totalQueueCount = selectedMLIndices.size + selectedAmazonIndices.size + selectedShopeeIndices.size;
  const currentPlatformCount = activeDealPlatform === 'amazon'
    ? selectedAmazonIndices.size
    : activeDealPlatform === 'shopee'
      ? selectedShopeeIndices.size
      : selectedMLIndices.size;

  elMobileSelectionCount.textContent = totalQueueCount;
  elMobileSelectionBar.classList.toggle(
    'hidden',
    !onDealTab || totalQueueCount === 0
  );
  elBtnMobileQueue.hidden = !publicationQueueEnabled;
  elBtnMobileQueue.disabled = totalQueueCount === 0;
  elBtnMobileQueue.textContent = `Preparar na fila (${totalQueueCount})`;
  elBtnMobileSend.hidden = activeDealPlatform === 'shopee';
  elBtnMobileSend.disabled = !whatsappReady || currentPlatformCount === 0;
  elBtnMobileSend.textContent = whatsappReady
    ? `Enviar ao WhatsApp (${currentPlatformCount})`
    : 'WhatsApp desconectado';
}

function updateDealSelectionUI(platform) {
  try {
    const {
      grid,
      selected,
      selectAll,
      clearButton,
      generateButton,
      countElement
    } = getDealSelectionConfig(platform);
    const cards = grid ? grid.querySelectorAll('.deal-card') : [];
    cards.forEach(card => {
      const index = Number(card.dataset.index);
      const isSelected = selected.has(index);
      card.classList.toggle('selected', isSelected);
      const checkbox = card.querySelector('.deal-chk');
      if (checkbox) checkbox.checked = isSelected;
    });

    const count = selected.size;
    if (countElement) countElement.textContent = count;
    if (generateButton) {
      generateButton.disabled = count === 0 || !whatsappReady;
    }
    if (clearButton) clearButton.disabled = count === 0;
    if (selectAll && grid) {
      const visibleCards = grid.querySelectorAll(
        '.deal-card:not(.hidden-filter)'
      );
      selectAll.checked = visibleCards.length > 0 &&
        [...visibleCards].every(card => selected.has(Number(card.dataset.index)));
    }
  } catch (err) {
    console.error(`Erro ao atualizar selecao de ${platform}:`, err);
  }
  updatePublicationQueueSelectionUI();
}

function updateMLSelectionUI() {
  updateDealSelectionUI('ml');
}

function updateAmazonSelectionUI() {
  updateDealSelectionUI('amazon');
}

function updateShopeeSelectionUI() {
  updateDealSelectionUI('shopee');
}

function updatePublicationQueueSelectionUI() {
  try {
    const count = selectedMLIndices.size + selectedAmazonIndices.size + selectedShopeeIndices.size;
    if (elTxtQueueCountML) elTxtQueueCountML.textContent = count;
    if (elTxtQueueCountAmazon) elTxtQueueCountAmazon.textContent = count;
    if (elTxtQueueCountShopee) elTxtQueueCountShopee.textContent = count;
    if (elBtnQueueML) elBtnQueueML.disabled = count === 0;
    if (elBtnQueueAmazon) elBtnQueueAmazon.disabled = count === 0;
    if (elBtnQueueShopee) elBtnQueueShopee.disabled = count === 0;
    updateMobileSelectionBar();
  } catch (err) {
    console.error('Erro em updatePublicationQueueSelectionUI:', err);
  }
}

// ==========================================
// Tabs Management
// ==========================================
function switchTab(activeBtn, activePanel) {
  const currentPanel = document.querySelector('.tab-panel.active');
  if (currentPanel) tabScrollPositions.set(currentPanel.id, window.scrollY);

  [elTabHome, elTabProducts, elTabCoupons, elTabQueue, elTabSearch]
    .forEach(btn => btn.classList.remove('active'));
  [elPanelHome, elPanelProducts, elPanelCoupons, elPanelQueue, elPanelSearch]
    .forEach(panel => panel.classList.remove('active'));
  
  activeBtn.classList.add('active');
  activePanel.classList.add('active');
  [elTabHome, elTabProducts, elTabCoupons, elTabQueue, elTabSearch].forEach(btn => {
    btn.setAttribute('aria-selected', String(btn === activeBtn));
  });
  
  updateLastUpdateUI(activeDealPlatform);
  updateMobileSelectionBar();
  requestAnimationFrame(() => {
    window.scrollTo({ top: tabScrollPositions.get(activePanel.id) || 0 });
  });
}

function switchDealSource(activeBtn, activePanel) {
  [elTabML, elTabAmazon, elTabShopee, elTabFutFanatics].forEach(btn => {
    if (btn) {
      btn.classList.toggle('active', btn === activeBtn);
      btn.setAttribute('aria-selected', String(btn === activeBtn));
    }
  });
  [elPanelML, elPanelAmazon, elPanelShopee, elPanelFutFanatics].forEach(panel => {
    if (panel) panel.classList.toggle('active', panel === activePanel);
  });

  activeDealPlatform = activeBtn === elTabAmazon
    ? 'amazon'
    : activeBtn === elTabShopee
      ? 'shopee'
      : activeBtn === elTabFutFanatics
        ? 'futfanatics'
        : 'ml';
  updateLastUpdateUI(activeDealPlatform);
  updateMobileSelectionBar();
}

function renderFutFanaticsDeals(deals) {
  renderDeals(deals, 'futfanatics');
  updateActiveFilterChip('futfanatics');
}

function applyFutFanaticsFilters() {
  selectedFutFanaticsIndices.clear();
  visibleFutFanaticsLimit = DEALS_PAGE_SIZE;
  renderFutFanaticsDeals(allFutFanaticsDeals);
}

function updateFutFanaticsSelectionUI() {
  if (!elGridFutFanatics) return;
  const visibleCards = elGridFutFanatics.querySelectorAll('.deal-card:not(.hidden-filter)');
  const count = selectedFutFanaticsIndices.size;
  if (elTxtSelectedCountFutFanatics) elTxtSelectedCountFutFanatics.textContent = count;
  if (elTxtQueueCountFutFanatics) elTxtQueueCountFutFanatics.textContent = count;
  if (elBtnGenerateFutFanatics) elBtnGenerateFutFanatics.disabled = count === 0;
  if (elBtnQueueFutFanatics) elBtnQueueFutFanatics.disabled = count === 0;
  if (elBtnClearSelectionFutFanatics) elBtnClearSelectionFutFanatics.disabled = count === 0;
  if (elChkSelectAllFutFanatics) {
    elChkSelectAllFutFanatics.checked = visibleCards.length > 0 && Array.from(visibleCards).every(card => selectedFutFanaticsIndices.has(Number(card.dataset.index)));
  }
  updateMobileSelectionBar();
}

// ==========================================
// Initialization & Listeners
// ==========================================
function init() {
  elMarketplaceSearchForm.addEventListener('submit', runMarketplaceSearch);
  document.getElementById('btn-close-progress').addEventListener('click', () => {
    document.getElementById('progress-modal').classList.add('hidden');
    lastFocusedElement?.focus();
  });
  document.getElementById('btn-stop-progress').addEventListener('click', event => {
    stopQueueGenerationRequested = true;
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = 'Parando após o Story atual...';
    if (activeQueueGenerationJobId) {
      fetch(
        '/api/publication-queue/generation/' +
        encodeURIComponent(activeQueueGenerationJobId),
        { method: 'DELETE' }
      ).catch(() => {});
    }
  });

  // Tab Switchers
  elTabHome.addEventListener('click', () =>
    switchTab(elTabHome, elPanelHome)
  );
  elTabProducts.addEventListener('click', () =>
    switchTab(elTabProducts, elPanelProducts)
  );
  elTabML.addEventListener('click', () =>
    switchDealSource(elTabML, elPanelML)
  );
  elTabAmazon.addEventListener('click', () => {
    switchDealSource(elTabAmazon, elPanelAmazon);
    if (!amazonDealsLoaded) fetchAmazonDeals();
  });
  elTabShopee.addEventListener('click', () => {
    switchDealSource(elTabShopee, elPanelShopee);
    if (!shopeeDealsLoaded) fetchShopeeDeals();
  });
  if (elTabFutFanatics) {
    elTabFutFanatics.addEventListener('click', () => {
      switchDealSource(elTabFutFanatics, elPanelFutFanatics);
      if (!futfanaticsDealsLoaded) fetchFutFanaticsDeals();
    });
  }
  elTabCoupons.addEventListener('click', () => switchTab(elTabCoupons, elPanelCoupons));
  elTabQueue.addEventListener('click', () => {
    switchTab(elTabQueue, elPanelQueue);
    fetchPublicationQueue();
    fetchLocalWorkerStatus();
    fetchPublicationBatches();
  });
  elTabSearch.addEventListener('click', () =>
    switchTab(elTabSearch, elPanelSearch)
  );
  document.querySelectorAll('[data-home-target]').forEach(button => {
    button.addEventListener('click', () => {
      const tabs = {
        products: elTabProducts,
        coupons: elTabCoupons,
        queue: elTabQueue,
        search: elTabSearch
      };
      tabs[button.dataset.homeTarget]?.click();
    });
  });

  // Scrapers
  elBtnUpdateML.addEventListener('click', triggerMLScraper);
  elBtnUpdateAmazon.addEventListener('click', triggerAmazonScraper);
  elBtnUpdateShopee.addEventListener('click', triggerShopeeRefresh);
  if (elBtnUpdateFutFanatics) elBtnUpdateFutFanatics.addEventListener('click', triggerFutFanaticsScraper);
  elBtnLoadMoreML.addEventListener('click', () => {
    visibleMLLimit += DEALS_PAGE_SIZE;
    renderMLDeals(allMLDeals);
  });
  elBtnLoadMoreAmazon.addEventListener('click', () => {
    visibleAmazonLimit += DEALS_PAGE_SIZE;
    renderAmazonDeals(allAmazonDeals);
  });
  elBtnLoadMoreShopee.addEventListener('click', () => {
    visibleShopeeLimit += DEALS_PAGE_SIZE;
    renderShopeeDeals(allShopeeDeals);
  });
  if (elBtnLoadMoreFutFanatics) {
    elBtnLoadMoreFutFanatics.addEventListener('click', () => {
      visibleFutFanaticsLimit += DEALS_PAGE_SIZE;
      renderFutFanaticsDeals(allFutFanaticsDeals);
    });
  }

  // Generate / Post Triggers
  elBtnGenerateML.addEventListener('click', () => postSelectedDeals('ml'));
  elBtnGenerateAmazon.addEventListener('click', () => postSelectedDeals('amazon'));
  elBtnMobileSend.addEventListener('click', () =>
    postSelectedDeals(activeDealPlatform)
  );
  elBtnMobileQueue.addEventListener('click', () =>
    enqueueDealsForPublication()
  );
  elBtnQueueML.addEventListener('click', () =>
    enqueueDealsForPublication()
  );
  if (elBtnQueueAmazon) {
    elBtnQueueAmazon.addEventListener('click', () =>
      enqueueDealsForPublication()
    );
  }
  elBtnQueueShopee.addEventListener('click', () =>
    enqueueDealsForPublication()
  );
  elBtnRefreshQueue.addEventListener('click', async () => {
    await Promise.all([
      fetchPublicationQueue({
      feedback: 'Fila atualizada.',
      type: 'success'
      }),
      fetchLocalWorkerStatus(),
      fetchPublicationBatches()
    ]);
  });
  elBtnClearDiscarded.addEventListener('click', async () => {
    const count = publicationQueueSummary.discarded || 0;
    if (
      !count ||
      !confirm(
        `Remover permanentemente ${count} ` +
        `${count === 1 ? 'oferta descartada' : 'ofertas descartadas'}?`
      )
    ) return;
    elBtnClearDiscarded.disabled = true;
    try {
      const response = await fetch('/api/publication-queue/discarded', {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível limpar a fila.');
      }
      await fetchPublicationQueue({
        feedback:
          `${data.removedCount} ` +
          `${data.removedCount === 1 ? 'oferta removida' : 'ofertas removidas'}.`,
        type: 'success'
      });
    } catch (error) {
      setQueueFeedback(error.message, 'error');
    } finally {
      elBtnClearDiscarded.disabled = false;
    }
  });
  elBtnExplainLocalWorker.addEventListener('click', () => {
    alert(
      'Abra a extensão Alerta de Descontos no Chrome ou Edge e clique em ' +
      '“Processar fila”. A sessão e os cookies ficam somente no seu navegador.'
    );
  });
  elBtnRefreshLocalWorker.addEventListener('click', fetchLocalWorkerStatus);
  elBtnPrepareBatch.addEventListener('click', preparePublicationBatch);
  elBtnDownloadLatestBatch.addEventListener('click', () => {
    if (publicationBatches[0]?.downloadUrl) {
      window.location.assign(publicationBatches[0].downloadUrl);
    }
  });
  const applyQueueFilter = () => {
    selectedQueueItemIds.clear();
    renderPublicationQueue();
  };
  elQueueStatusFilter.addEventListener('change', applyQueueFilter);
  elQueuePlatformFilter.addEventListener('change', applyQueueFilter);
  elQueueSortFilter.addEventListener('change', renderPublicationQueue);
  elChkSelectVisibleQueue.addEventListener('change', () => {
    const visible = publicationQueueItems.filter(queueItemMatchesFilter);
    visible.forEach(item => {
      if (!elChkSelectVisibleQueue.checked) selectedQueueItemIds.delete(item.id);
      else selectedQueueItemIds.add(item.id);
    });
    renderPublicationQueue();
  });
  elBtnDeleteSelectedQueue.addEventListener(
    'click',
    deleteSelectedQueueItems
  );
  elBtnValidateQueue.addEventListener('click', validateEntireQueue);

  // Select All ML Toggle
  elChkSelectAllML.addEventListener('change', () => {
    const visible = elGridML.querySelectorAll('.deal-card:not(.hidden-filter)');
    visible.forEach(card => {
      const idx = parseInt(card.dataset.index, 10);
      if (elChkSelectAllML.checked) {
        selectedMLIndices.add(idx);
      } else {
        selectedMLIndices.delete(idx);
      }
    });
    updateMLSelectionUI();
  });

  // Select All Amazon Toggle
  elChkSelectAllAmazon.addEventListener('change', () => {
    const visible = elGridAmazon.querySelectorAll('.deal-card:not(.hidden-filter)');
    visible.forEach(card => {
      const idx = parseInt(card.dataset.index, 10);
      if (elChkSelectAllAmazon.checked) {
        selectedAmazonIndices.add(idx);
      } else {
        selectedAmazonIndices.delete(idx);
      }
    });
    updateAmazonSelectionUI();
  });
  elChkSelectAllShopee.addEventListener('change', () => {
    const visible = elGridShopee.querySelectorAll(
      '.deal-card:not(.hidden-filter)'
    );
    visible.forEach(card => {
      const index = Number(card.dataset.index);
      if (elChkSelectAllShopee.checked) selectedShopeeIndices.add(index);
      else selectedShopeeIndices.delete(index);
    });
    updateShopeeSelectionUI();
  });

  // Select All FutFanatics Toggle
  if (elChkSelectAllFutFanatics) {
    elChkSelectAllFutFanatics.addEventListener('change', () => {
      const visible = elGridFutFanatics.querySelectorAll('.deal-card:not(.hidden-filter)');
      visible.forEach(card => {
        const idx = parseInt(card.dataset.index, 10);
        if (elChkSelectAllFutFanatics.checked) {
          selectedFutFanaticsIndices.add(idx);
        } else {
          selectedFutFanaticsIndices.delete(idx);
        }
      });
      updateFutFanaticsSelectionUI();
    });
  }

  // Clear Selections
  elBtnClearSelectionML.addEventListener('click', () => {
    selectedMLIndices.clear();
    updateMLSelectionUI();
  });
  elBtnClearSelectionAmazon.addEventListener('click', () => {
    selectedAmazonIndices.clear();
    updateAmazonSelectionUI();
  });
  elBtnClearSelectionShopee.addEventListener('click', () => {
    selectedShopeeIndices.clear();
    updateShopeeSelectionUI();
  });
  if (elBtnClearSelectionFutFanatics) {
    elBtnClearSelectionFutFanatics.addEventListener('click', () => {
      selectedFutFanaticsIndices.clear();
      updateFutFanaticsSelectionUI();
    });
  }

  // Filters ML listeners
  elFilterNameML.addEventListener('input', applyMLFilters);
  elFilterDiscountML.addEventListener('change', applyMLFilters);
  elFilterRecurringML.addEventListener('change', applyMLFilters);
  elSortML?.addEventListener('change', applyMLFilters);

  // Filters Amazon listeners
  elFilterNameAmazon.addEventListener('input', applyAmazonFilters);
  elFilterDiscountAmazon.addEventListener('change', applyAmazonFilters);
  elSortAmazon?.addEventListener('change', applyAmazonFilters);

  // Filters Shopee listeners
  elFilterNameShopee.addEventListener('input', applyShopeeFilters);
  elFilterDiscountShopee.addEventListener('change', applyShopeeFilters);
  elFilterRecurringShopee.addEventListener('change', applyShopeeFilters);
  elSortShopee?.addEventListener('change', applyShopeeFilters);

  // Filters FutFanatics listeners
  if (elFilterNameFutFanatics) elFilterNameFutFanatics.addEventListener('input', applyFutFanaticsFilters);
  if (elFilterDiscountFutFanatics) elFilterDiscountFutFanatics.addEventListener('change', applyFutFanaticsFilters);
  if (elFilterTeamFutFanatics) elFilterTeamFutFanatics.addEventListener('change', applyFutFanaticsFilters);
  if (elSortFutFanatics) elSortFutFanatics.addEventListener('change', applyFutFanaticsFilters);
  if (elBtnToggleFiltersFutFanatics && elFiltersFutFanatics) {
    elBtnToggleFiltersFutFanatics.addEventListener('click', () => {
      const open = elFiltersFutFanatics.classList.toggle('is-open');
      elBtnToggleFiltersFutFanatics.setAttribute('aria-expanded', String(open));
    });
  }
  const btnCouponAll = document.getElementById('btn-coupon-tab-all');
  const btnCouponML = document.getElementById('btn-coupon-tab-ml');
  const btnCouponAmazon = document.getElementById('btn-coupon-tab-amazon');
  const btnCouponShopee = document.getElementById('btn-coupon-tab-shopee');
  const iptFilterCoupons = document.getElementById('ipt-filter-coupons');
  const selFilterCouponStatus = document.getElementById('sel-filter-coupon-status');
  const selFilterCouponDiscount = document.getElementById('sel-filter-coupon-discount');

  if (btnCouponAll && btnCouponML && btnCouponAmazon && btnCouponShopee) {
    btnCouponAll.addEventListener('click', () => {
      activeCouponMarketplace = 'all';
      [btnCouponAll, btnCouponML, btnCouponAmazon, btnCouponShopee].forEach(b => b.classList.remove('active'));
      btnCouponAll.classList.add('active');
      renderCoupons(allCoupons);
    });
    btnCouponML.addEventListener('click', () => {
      activeCouponMarketplace = 'ml';
      [btnCouponAll, btnCouponML, btnCouponAmazon, btnCouponShopee].forEach(b => b.classList.remove('active'));
      btnCouponML.classList.add('active');
      renderCoupons(allCoupons);
    });
    btnCouponAmazon.addEventListener('click', () => {
      activeCouponMarketplace = 'amazon';
      [btnCouponAll, btnCouponML, btnCouponAmazon, btnCouponShopee].forEach(b => b.classList.remove('active'));
      btnCouponAmazon.classList.add('active');
      if (!amazonDealsLoaded) fetchAmazonDeals().then(() => renderCoupons(allCoupons));
      else renderCoupons(allCoupons);
    });
    btnCouponShopee.addEventListener('click', () => {
      activeCouponMarketplace = 'shopee';
      [btnCouponAll, btnCouponML, btnCouponAmazon, btnCouponShopee]
        .forEach(button => button.classList.remove('active'));
      btnCouponShopee.classList.add('active');
      if (!shopeeDealsLoaded) fetchShopeeDeals().then(() => renderCoupons(allCoupons));
      else renderCoupons(allCoupons);
    });
  }

  if (iptFilterCoupons) iptFilterCoupons.addEventListener('input', () => renderCoupons(allCoupons));
  if (selFilterCouponStatus) selFilterCouponStatus.addEventListener('change', () => renderCoupons(allCoupons));
  if (selFilterCouponDiscount) selFilterCouponDiscount.addEventListener('change', () => renderCoupons(allCoupons));

  elBtnToggleFiltersML.addEventListener('click', () => {
    const open = elFiltersML.classList.toggle('is-open');
    elBtnToggleFiltersML.setAttribute('aria-expanded', String(open));
  });
  elBtnToggleFiltersAmazon.addEventListener('click', () => {
    const open = elFiltersAmazon.classList.toggle('is-open');
    elBtnToggleFiltersAmazon.setAttribute('aria-expanded', String(open));
  });
  elBtnToggleFiltersShopee.addEventListener('click', () => {
    const open = elFiltersShopee.classList.toggle('is-open');
    elBtnToggleFiltersShopee.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const modal = document.getElementById('progress-modal');
    if (!modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
      lastFocusedElement?.focus();
    }
  });
  document.addEventListener('error', event => {
    const image = event.target;
    if (
      image instanceof HTMLImageElement &&
      (
        image.classList.contains('card-image') ||
        image.classList.contains('marketplace-result-image')
      ) &&
      image.src !== IMAGE_PLACEHOLDER
    ) {
      image.src = IMAGE_PLACEHOLDER;
      image.classList.add('image-fallback');
    }
  }, true);

  // Initial loads
  fetchCategories().then(async () => {
    await fetchPublicationQueue();
    await Promise.all([
      fetchLocalWorkerStatus(),
      fetchPublicationBatches()
    ]);
    fetchMLDeals();
    fetchDataStatus();
    fetchWhatsAppStatus();
  });
  setInterval(fetchDataStatus, 60000);
  setInterval(fetchWhatsAppStatus, 30000);
  setInterval(syncPublicationHistory, 30000);
  setInterval(fetchLocalWorkerStatus, 30000);
  setInterval(() => {
    if (
      publicationQueueEnabled &&
      elPanelQueue.classList.contains('active')
    ) {
      if (!publicationQueueAbortController) {
        fetchPublicationQueue({
          render: !document.activeElement?.classList
            .contains('queue-affiliate-input'),
          silent: true
        });
      }
      fetchLocalWorkerStatus();
    }
  }, 3000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err =>
      console.error('Falha ao ativar modo instalável:', err)
    );
  }
}

// Listener de clique para o comparador de preços
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-compare-buscape');
  if (!btn) return;
  e.stopPropagation();
  e.preventDefault();

  const card = btn.closest('.deal-card');
  const resultsDiv = btn.nextElementSibling;
  const platform = card.dataset.platform ||
    (card.classList.contains('amazon-theme') ? 'amazon' : 'ml');
  const index = Number.parseInt(card.dataset.index, 10);
  const deal = platform === 'ml'
    ? allMLDeals[index]
    : platform === 'shopee'
      ? allShopeeDeals[index]
      : allAmazonDeals[index];

  btn.disabled = true;
  btn.innerHTML = '<span class="comp-spinner"></span> Consultando...';
  resultsDiv.classList.remove('hidden');
  resultsDiv.innerHTML =
    '<div class="comparison-loading">Comparando em 4 marketplaces...</div>';

  try {
    const cleanPrice = deal.currentPrice
      .replace('R$', '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const params = new URLSearchParams({
      q: deal.title,
      price: Number.parseFloat(cleanPrice) || 0,
      sourceUrl: deal.link || ''
    });
    const response = await fetch(`/api/compare-price?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha na comparação.');

    deal.comparison = data;
    resultsDiv.innerHTML = renderPriceComparison(data, deal.title);
    btn.textContent = '↻ Atualizar Comparação';
  } catch (err) {
    resultsDiv.innerHTML = `
      <div class="comparison-error">
        ${escapeQueueHtml(err.message || 'Erro de rede ao consultar.')}
      </div>
    `;
    btn.textContent = 'Comparar Preços';
  } finally {
    btn.disabled = false;
  }
});

// Listener de clique para exclusão de ofertas no WhatsApp
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete-wpp');
  if (btn) {
    e.stopPropagation();
    e.preventDefault();
    
    const msgId = btn.dataset.msgId;
    const platform = btn.dataset.platform;
    const index = parseInt(btn.dataset.index, 10);
    
    if (confirm('Tem certeza que deseja apagar essa mensagem do grupo do WhatsApp para todos?')) {
      btn.disabled = true;
      btn.innerHTML = '<span class="comp-spinner"></span> Apagando...';
      
      try {
        const response = await fetch('/api/delete-deal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ msgId })
        });
        const data = await response.json();
        
        if (data.success) {
          alert('Mensagem apagada com sucesso no WhatsApp!');
          // Atualiza o estado local
          const deal = platform === 'ml' ? allMLDeals[index] : allAmazonDeals[index];
          if (deal) {
            deal.removedFromWhatsAppAt = new Date().toISOString();
            deal.removalReaction = '🗑️';
          }
          // Recarrega o grid da plataforma correspondente
          if (platform === 'ml') {
            renderMLDeals(allMLDeals);
          } else {
            renderAmazonDeals(allAmazonDeals);
          }
        } else {
          alert(`Falha ao apagar: ${data.error || 'Erro desconhecido'}`);
          btn.disabled = false;
          btn.innerHTML = '🗑️ Excluir do WhatsApp';
        }
      } catch (err) {
        alert(`Erro de rede ao excluir: ${err.message}`);
        btn.disabled = false;
        btn.innerHTML = '🗑️ Excluir do WhatsApp';
      }
    }
  }
});

document.addEventListener('click', async (event) => {
  const addButton = event.target.closest('.btn-add-queue-card');
  if (addButton) {
    event.preventDefault();
    event.stopPropagation();
    const platform = addButton.dataset.platform === 'amazon'
      ? 'amazon'
      : addButton.dataset.platform === 'shopee'
        ? 'shopee'
        : 'mercado_livre';
    const deals = platform === 'amazon'
      ? allAmazonDeals
      : platform === 'shopee'
        ? allShopeeDeals
        : allMLDeals;
    const index = Number(addButton.dataset.index);
    const deal = deals[index];
    if (deal) await enqueueDealsForPublication([{ deal, index, platform }]);
    return;
  }

  const actionButton = event.target.closest('[data-queue-action]');
  if (!actionButton) return;
  const card = actionButton.closest('.queue-card');
  const item = publicationQueueItems.find(entry =>
    entry.id === card?.dataset.itemId
  );
  if (!item) return;

  event.preventDefault();
  actionButton.disabled = true;
  const action = actionButton.dataset.queueAction;
  try {
    if (action === 'save-link') {
      const input = card.querySelector('.queue-affiliate-input');
      const response = await fetch(
        `/api/publication-queue/${encodeURIComponent(item.id)}/affiliate`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ affiliateLink: input.value })
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível validar o link.');
      }
      await fetchPublicationQueue({
        feedback: data.ready
          ? 'Link validado. A oferta está pronta para publicar.'
          : data.item.reviewReason,
        type: data.ready ? 'success' : 'error'
      });
      return;
    }

    if (action === 'story-variant') {
      const variant = actionButton.dataset.variant;
      item.currentVariant = variant;
      const img = card.querySelector('.queue-story-preview');
      if (img) {
        img.src = (variant === 'nocoupon' && item.storyUrlNoCoupon)
          ? item.storyUrlNoCoupon
          : (item.storyUrl || '');
      }
      card.querySelectorAll('.btn-story-variant').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.variant === variant);
      });
      return;
    }

    if (action === 'copy-link') {
      await copyQueueText(item.affiliateLink);
      setQueueFeedback('Link afiliado copiado.', 'success');
      return;
    }

    if (action === 'copy-title') {
      await copyQueueText(item.title);
      setQueueFeedback('Título copiado.', 'success');
      return;
    }

    if (action === 'copy-caption') {
      await copyQueueText(buildQueueCaption(item));
      setQueueFeedback('Legenda copiada.', 'success');
      return;
    }

    if (action === 'share-story') {
      const shared = await shareQueueStory(item);
      setQueueFeedback(
        shared
          ? 'Escolha Instagram e depois Stories no menu de compartilhamento.'
          : 'Compartilhamento cancelado.',
        'success'
      );
      return;
    }

    if (action === 'published') {
      if (!confirm('Confirma que este Story foi publicado no Instagram?')) {
        return;
      }
      await updateQueueItemStatus(item.id, 'published');
      setQueueFeedback('Oferta marcada como publicada.', 'success');
      return;
    }

    if (action === 'approve-review') {
      await updateQueueItemStatus(item.id, 'approve_review');
      setQueueFeedback('Story atualizado aprovado.', 'success');
      return;
    }

    if (action === 'discarded') {
      if (!confirm('Descartar esta oferta da fila?')) return;
      await updateQueueItemStatus(item.id, 'discarded');
      setQueueFeedback('Oferta descartada.', 'success');
      return;
    }

    if (action === 'restore') {
      await updateQueueItemStatus(item.id, 'restore');
      setQueueFeedback('Oferta restaurada.', 'success');
    }
  } catch (err) {
    setQueueFeedback(err.message, 'error');
  } finally {
    actionButton.disabled = false;
  }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-batch-action]');
  if (!button) return;
  const batchCard = button.closest('.batch-card');
  const itemCard = button.closest('.batch-item');
  const batch = publicationBatches.find(entry =>
    entry.id === batchCard?.dataset.batchId
  );
  const item = batch?.items.find(entry =>
    entry.id === itemCard?.dataset.batchItemId
  );
  if (!item) return;

  button.disabled = true;
  try {
    const action = button.dataset.batchAction;
    if (action === 'copy-link') await copyQueueText(item.affiliateLink);
    if (action === 'copy-title') await copyQueueText(item.title);
    if (action === 'copy-caption') await copyQueueText(item.caption);
    if (action === 'published') {
      if (!confirm('Confirma que este Story foi publicado no Instagram?')) return;
      await updateQueueItemStatus(item.id, 'published');
      await fetchPublicationBatches();
    }
    setQueueFeedback(
      action === 'published' ? 'Oferta marcada como publicada.' : 'Conteúdo copiado.',
      'success'
    );
  } catch (error) {
    setQueueFeedback(error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

init();
