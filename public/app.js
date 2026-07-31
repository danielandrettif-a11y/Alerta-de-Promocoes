// State management
let allMLDeals = [];
let allAmazonDeals = [];
let allShopeeDeals = [];
let allCoupons = [];
const selectedMLIndices = new Set();
const selectedAmazonIndices = new Set();
let lastUpdateML = '';
let lastUpdateAmazon = '';
let lastUpdateShopee = '';
let freshnessML = null;
let freshnessAmazon = null;
let freshnessShopee = null;
let publicationQueueEnabled = false;
let publicationQueueItems = [];
let publicationQueueSummary = {};
let publicationBatches = [];
const selectedReadyBatchIds = new Set();
let publicationHistorySignature = '';
let amazonDealsLoaded = false;
let shopeeDealsLoaded = false;
let whatsappReady = false;
let activeDealPlatform = 'ml';
let lastFocusedElement = null;
const tabScrollPositions = new Map();
const DEALS_PAGE_SIZE = 20;
let visibleMLLimit = DEALS_PAGE_SIZE;
let visibleAmazonLimit = DEALS_PAGE_SIZE;
let visibleShopeeLimit = DEALS_PAGE_SIZE;
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
const elTabCoupons = document.getElementById('btn-tab-coupons');
const elTabQueue = document.getElementById('btn-tab-queue');
const elTabSearch = document.getElementById('btn-tab-search');

const elPanelHome = document.getElementById('panel-home');
const elPanelProducts = document.getElementById('panel-products');
const elPanelML = document.getElementById('panel-ml');
const elPanelAmazon = document.getElementById('panel-amazon');
const elPanelShopee = document.getElementById('panel-shopee');
const elPanelCoupons = document.getElementById('panel-coupons');
const elPanelQueue = document.getElementById('panel-queue');
const elPanelSearch = document.getElementById('panel-search');

// DOM elements - Grids
const elGridML = document.getElementById('grid-ml');
const elGridAmazon = document.getElementById('grid-amazon');
const elGridShopee = document.getElementById('grid-shopee');
const elGridCoupons = document.getElementById('grid-coupons');
const elGridQueue = document.getElementById('grid-queue');
const elPaginationML = document.getElementById('pagination-ml');
const elPaginationAmazon = document.getElementById('pagination-amazon');
const elPaginationShopee = document.getElementById('pagination-shopee');
const elPaginationCountML = document.getElementById('pagination-count-ml');
const elPaginationCountAmazon = document.getElementById('pagination-count-amazon');
const elPaginationCountShopee = document.getElementById('pagination-count-shopee');
const elBtnLoadMoreML = document.getElementById('btn-load-more-ml');
const elBtnLoadMoreAmazon = document.getElementById('btn-load-more-amazon');
const elBtnLoadMoreShopee = document.getElementById('btn-load-more-shopee');

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

// DOM elements - Shopee Actions
const elBtnUpdateShopee = document.getElementById('btn-update-shopee');

// DOM elements - Filters ML
const elFilterNameML = document.getElementById('ipt-filter-name-ml');
const elFilterCategoryML = document.getElementById('sel-filter-category-ml');
const elFilterSubcategoryML = document.getElementById('sel-filter-subcategory-ml');
const elFilterDiscountML = document.getElementById('sel-filter-discount-ml');

// DOM elements - Filters Amazon
const elFilterNameAmazon = document.getElementById('ipt-filter-name-amazon');
const elFilterCategoryAmazon = document.getElementById('sel-filter-category-amazon');
const elFilterSubcategoryAmazon = document.getElementById('sel-filter-subcategory-amazon');
const elFilterDiscountAmazon = document.getElementById('sel-filter-discount-amazon');

// DOM elements - Filters Shopee
const elFilterNameShopee = document.getElementById('ipt-filter-name-shopee');
const elFilterCategoryShopee = document.getElementById('sel-filter-category-shopee');
const elFilterSubcategoryShopee = document.getElementById('sel-filter-subcategory-shopee');
const elFilterDiscountShopee = document.getElementById('sel-filter-discount-shopee');

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
const elQueueFeedback = document.getElementById('queue-feedback');
const elBtnRefreshQueue = document.getElementById('btn-refresh-queue');
const elBtnClearDiscarded = document.getElementById('btn-clear-discarded');
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
  const rawPlatform = String(platform || deal.platform || 'unknown').toLowerCase();
  const normalizedPlatform = ['ml', 'mercado livre', 'mercado_livre'].includes(rawPlatform)
    ? 'mercado_livre'
    : ['amz', 'amazon'].includes(rawPlatform)
      ? 'amazon'
      : rawPlatform;
  let normalizedLink = String(deal.link || '').split(/[?#]/)[0].replace(/\/+$/, '');
  try {
    const parsed = new URL(deal.link);
    normalizedLink = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {}
  const itemId = normalizedLink.match(/\b(MLB\d+|B0[A-Z0-9]+)\b/i)?.[1];
  const identity = itemId || normalizedLink || String(deal.title || '').trim().toLowerCase();
  const value = `${normalizedPlatform}:${identity}`;
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return `deal_${Math.abs(hash)}`;
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
      : lastUpdateML;
  const freshness = platform === 'amazon'
    ? freshnessAmazon
    : platform === 'shopee'
      ? freshnessShopee
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
    lastUpdateML = status.mercadoLivre?.generatedAt || lastUpdateML;
    lastUpdateAmazon = status.amazon?.generatedAt || lastUpdateAmazon;
    lastUpdateShopee = status.shopee?.generatedAt || lastUpdateShopee;
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
function getProductCategoryAndSub(title) {
  if (!title) return { category: 'Ofertas Gerais', subcategory: 'Outros', icon: '🛍️' };
  const cleanTitle = title.toLowerCase();
  
  for (const [catName, catData] of Object.entries(globalTaxonomy)) {
    for (const [subName, keywords] of Object.entries(catData.subcategories)) {
      for (const keyword of keywords) {
        if (cleanTitle.includes(keyword)) {
          // Trata exceções do helper
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
    
    elFilterSubcategoryML.addEventListener('change', applyMLFilters);
    elFilterSubcategoryAmazon.addEventListener('change', applyAmazonFilters);
    elFilterSubcategoryShopee.addEventListener('change', applyShopeeFilters);
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

function handleCategoryChange(categorySelectEl, subcategorySelectEl) {
  if (!categorySelectEl || !subcategorySelectEl) return;
  
  const selectedCat = categorySelectEl.value;
  subcategorySelectEl.innerHTML = '<option value="">Todas as Subcategorias</option>';
  
  if (!selectedCat || !globalTaxonomy[selectedCat]) {
    subcategorySelectEl.disabled = true;
    subcategorySelectEl.value = '';
    return;
  }
  
  const subcategories = Object.keys(globalTaxonomy[selectedCat].subcategories);
  subcategories.forEach(sub => {
    const opt = document.createElement('option');
    opt.value = sub;
    opt.textContent = sub;
    subcategorySelectEl.appendChild(opt);
  });
  
  subcategorySelectEl.disabled = false;
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
    shopeeDealsLoaded = true;
    freshnessShopee = data.freshness || null;
    visibleShopeeLimit = DEALS_PAGE_SIZE;
    renderShopeeDeals(allShopeeDeals);

    if (data.generatedAt) {
      lastUpdateShopee = data.generatedAt;
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
  
  lastFocusedElement = document.activeElement;
  title.textContent = 'Postando Stories no WhatsApp...';
  modal.classList.remove('hidden');
  modal.querySelector('.progress-modal-content').focus();
  spinner.style.display = 'block';
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

function getQueueStatusMeta(status) {
  const metadata = {
    processing: {
      label: 'Processando',
      className: 'is-processing'
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
}

function queueItemMatchesFilter(item) {
  const filter = elQueueStatusFilter.value;
  if (filter === 'all') return true;
  if (filter === 'active') {
    return [
      'awaiting_affiliate',
      'ready',
      'needs_review'
    ].includes(item.status);
  }
  return item.status === filter;
}

function renderPublicationQueue() {
  updateQueueSummary();
  const visibleItems = publicationQueueItems.filter(queueItemMatchesFilter);
  elGridQueue.replaceChildren();

  if (visibleItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<p>Nenhuma oferta corresponde a este filtro.</p>';
    elGridQueue.appendChild(empty);
    return;
  }

  for (const item of visibleItems) {
    const processingState = item.affiliateProcessing?.state;
    const status = getQueueStatusMeta(
      processingState === 'claimed' ? 'processing' : item.status
    );
    const card = document.createElement('article');
    card.className = `queue-card ${status.className}`;
    card.dataset.itemId = item.id;

    const marketplace = item.platform === 'shopee'
      ? { name: 'Shopee', affiliateHost: 's.shopee.com.br' }
      : { name: 'Mercado Livre', affiliateHost: 'meli.la' };
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

    const batchSelector = item.status === 'ready'
      ? `
        <label class="queue-batch-selector">
          <input type="checkbox" data-batch-select="${escapeQueueHtml(item.id)}"
            ${selectedReadyBatchIds.has(item.id) ? 'checked' : ''}>
          Incluir no lote
        </label>
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

    card.innerHTML = `
      <div class="queue-story-column">
        ${batchSelector}
        <img
          class="queue-story-preview"
          src="${escapeQueueHtml(item.storyUrl || '')}"
          alt="Story preparado para ${escapeQueueHtml(item.title)}"
          loading="lazy"
          decoding="async"
          fetchpriority="low"
        >
      </div>
      <div class="queue-content">
        <div class="queue-card-heading">
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
        ${affiliateForm}
        ${readyActions}
        ${completedDetails}
        <div class="queue-secondary-actions">${secondaryAction}</div>
      </div>
    `;
    const batchCheckbox = card.querySelector('[data-batch-select]');
    batchCheckbox?.addEventListener('change', () => {
      if (batchCheckbox.checked) selectedReadyBatchIds.add(item.id);
      else selectedReadyBatchIds.delete(item.id);
      updateBatchSelection();
    });
    elGridQueue.appendChild(card);
  }
  updateBatchSelection();
}

async function fetchPublicationQueue(options = {}) {
  try {
    const wasEnabled = publicationQueueEnabled;
    const response = await fetch('/api/publication-queue');
    const data = await response.json();
    publicationQueueEnabled = data.enabled === true;
    elTabQueue.hidden = !publicationQueueEnabled;
    elBtnQueueML.hidden = !publicationQueueEnabled;
    elBtnMobileQueue.hidden =
      !publicationQueueEnabled || activeDealPlatform !== 'ml';

    if (!publicationQueueEnabled) {
      publicationQueueItems = [];
      publicationQueueSummary = {};
      return;
    }

    publicationQueueItems = data.items || [];
    publicationQueueSummary = data.summary || {};
    if (elPanelQueue.classList.contains('active') || options.render) {
      renderPublicationQueue();
    } else {
      updateQueueSummary();
    }
    if (wasEnabled !== publicationQueueEnabled && allMLDeals.length) {
      renderMLDeals(allMLDeals);
    }
    if (options.feedback) {
      setQueueFeedback(options.feedback, options.type || 'success');
    }
  } catch (err) {
    console.error('Erro ao carregar fila de publicação:', err);
    setQueueFeedback('Não foi possível carregar a fila.', 'error');
  }
}

async function enqueueDealsForPublication(deals, platform = 'mercado_livre') {
  if (!publicationQueueEnabled || deals.length === 0) return;
  const modal = document.getElementById('progress-modal');
  const title = document.getElementById('progress-title');
  const logEl = document.getElementById('progress-log');
  const spinner = modal.querySelector('.progress-spinner');
  title.textContent = 'Preparando fila de publicação...';
  modal.classList.remove('hidden');
  spinner.style.display = 'block';
  logEl.replaceChildren();

  const addLog = (message, type = 'info') => {
    const line = document.createElement('div');
    line.className = `progress-line progress-${type}`;
    line.textContent = message;
    logEl.appendChild(line);
  };

  let created = 0;
  let reused = 0;
  let failed = 0;
  for (let index = 0; index < deals.length; index++) {
    const deal = deals[index];
    addLog(
      `[${index + 1}/${deals.length}] Gerando Story: ` +
      `${deal.title.substring(0, 45)}...`
    );
    try {
      const response = await fetch('/api/publication-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          deal
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao adicionar.');
      if (data.created) {
        created += 1;
        addLog('Story adicionado à fila.', 'success');
      } else {
        reused += 1;
        addLog('A oferta já estava na fila.', 'warning');
      }
    } catch (err) {
      failed += 1;
      addLog(`Falha: ${err.message}`, 'error');
    }
  }

  spinner.style.display = 'none';
  selectedMLIndices.clear();
  updateMLSelectionUI();
  await fetchPublicationQueue({
    render: true,
    feedback:
      `${created} adicionada(s), ${reused} já existente(s), ` +
      `${failed} com falha.`,
    type: failed ? 'error' : 'success'
  });
  switchTab(elTabQueue, elPanelQueue);
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
  const response = await fetch(item.storyUrl);
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
  return [
    '🔥 OFERTA ENCONTRADA!',
    '',
    item.title,
    '',
    `❌ De: ${item.originalPrice}`,
    `✅ Por: ${item.currentPrice}`,
    `💸 ${Number(item.discount) || 0}% OFF`,
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
  for (const itemId of selectedReadyBatchIds) {
    if (!readyIds.has(itemId)) selectedReadyBatchIds.delete(itemId);
  }
  const count = selectedReadyBatchIds.size;
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
  if (selectedReadyBatchIds.size === 0) return;
  const name = prompt('Nome do lote:', `Lote ${new Date().toLocaleDateString('pt-BR')}`);
  if (name === null) return;
  elBtnPrepareBatch.disabled = true;
  try {
    const response = await fetch('/api/publication-batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        itemIds: [...selectedReadyBatchIds]
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao preparar lote.');
    selectedReadyBatchIds.clear();
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
        elFilterDiscountShopee
      ]
      : [
        elFilterNameML,
        elFilterCategoryML,
        elFilterSubcategoryML,
        elFilterDiscountML
      ];
  const searchTerm = filters[0].value.toLowerCase().trim();
  const selectedCategory = filters[1].value;
  const selectedSubcategory = filters[2].value;
  const selectedDiscount = filters[3].value;

  return deals
    .map((deal, index) => ({ deal, index }))
    .filter(({ deal }) => {
      const category = getProductCategoryAndSub(deal.title);
      return (
        deal.title.toLowerCase().includes(searchTerm) &&
        (!selectedCategory || category.category === selectedCategory) &&
        (!selectedSubcategory || category.subcategory === selectedSubcategory) &&
        (!selectedDiscount || deal.discount >= Number(selectedDiscount))
      );
    });
}

function updateDealPagination(platform, visibleCount, totalCount) {
  const elements = platform === 'amazon'
    ? [elPaginationAmazon, elPaginationCountAmazon, elBtnLoadMoreAmazon]
    : platform === 'shopee'
      ? [elPaginationShopee, elPaginationCountShopee, elBtnLoadMoreShopee]
      : [elPaginationML, elPaginationCountML, elBtnLoadMoreML];
  const [pagination, count, button] = elements;

  pagination.hidden = totalCount === 0;
  count.textContent =
    `Mostrando ${Math.min(visibleCount, totalCount)} de ${totalCount} ofertas`;
  button.hidden = visibleCount >= totalCount;
}

function renderMLDeals(deals) {
  elGridML.innerHTML = '';
  
  if (deals.length === 0) {
    elPaginationML.hidden = true;
    elGridML.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma oferta do Mercado Livre carregada. Clique em "Atualizar Mercado Livre".</p>
      </div>
    `;
    return;
  }

  const filteredEntries = getFilteredDealEntries(deals, 'ml');
  if (filteredEntries.length === 0) {
    elPaginationML.hidden = true;
    elGridML.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma oferta corresponde aos filtros selecionados.</p>
      </div>
    `;
    updateMLSelectionUI();
    return;
  }

  const visibleEntries = filteredEntries.slice(0, visibleMLLimit);
  visibleEntries.forEach(({ deal, index }) => {
    const isSelected = selectedMLIndices.has(index);
    const isPublished = !!deal.publishedMsgId;
    const wasRemoved = !!deal.removedFromWhatsAppAt;
    const card = document.createElement('article');
    card.className = `deal-card ${isSelected ? 'selected' : ''} ${isPublished ? 'published-card' : ''}`;
    card.dataset.index = index;
    
    const displayTitle = deal.title;
    const ratingText = deal.rating ? `⭐ ${deal.rating.toFixed(1)}` : 'Sem avaliação';

    // Cupons compatíveis
    const compatibleCoupons = allCoupons.filter(coupon => {
      if (coupon.verificationStatus !== 'manually_confirmed') return false;
      const comp = findCompatibleDealsForCoupon(coupon, [deal]);
      return comp.length > 0;
    });
    
    let couponBadgeHtml = '';
    if (compatibleCoupons.length > 0) {
      const bestCoupon = compatibleCoupons[0];
      couponBadgeHtml = `
        <div class="deal-coupon-badge" title="${bestCoupon.rules}">
          <span class="coupon-icon">🎟️</span> Cupom: <strong>${bestCoupon.code}</strong>
        </div>
      `;
    }

    let checkboxHtml = '';
    if (!isPublished) {
      checkboxHtml = `
        <div class="card-checkbox">
          <label class="checkbox-container">
            <input type="checkbox" class="deal-chk" data-index="${index}" ${isSelected ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
        </div>
      `;
    } else {
      checkboxHtml = `
        <div class="card-checkbox published-tick" title="Já publicado hoje">
          ✅
        </div>
      `;
    }

    let deleteBtnHtml = '';
    if (wasRemoved) {
      deleteBtnHtml = `
        <div class="card-published-area">
          <span class="published-badge removed-by-reaction">
            Encerrado por reação ${deal.removalReaction || '✅'}
          </span>
        </div>
      `;
    } else if (isPublished) {
      deleteBtnHtml = `
        <div class="card-published-area">
          <span class="published-badge">WhatsApp Ativo ✅</span>
          <button type="button" class="btn-delete-wpp" data-msg-id="${deal.publishedMsgId}" data-platform="ml" data-index="${index}">
            🗑️ Excluir do WhatsApp
          </button>
        </div>
      `;
    }
    
    card.innerHTML = `
      ${checkboxHtml}
      <div class="card-image-box">
        <img class="card-image" src="${getDealImageUrl(deal.image)}" alt="${displayTitle}" loading="lazy" decoding="async">
        <span class="card-discount-badge">${deal.discount}% OFF</span>
      </div>
      <div class="card-details">
        <a href="${deal.link}" target="_blank" rel="noopener noreferrer" class="card-link-product">Ver Produto no ML 🔗</a>
        <div class="card-meta">
          <span class="card-rating">${ratingText}</span>
          <span class="card-sales">${deal.salesInfo || ''}</span>
        </div>
        <h3 class="card-title" title="${displayTitle}">${displayTitle}</h3>
        <div class="card-price-box">
          <span class="card-orig-price">De: ${deal.originalPrice}</span>
          <span class="card-promo-price">Por: ${deal.currentPrice}</span>
        </div>
        ${couponBadgeHtml}
        <button
          type="button"
          class="btn-add-queue-card"
          data-index="${index}"
          ${publicationQueueEnabled ? '' : 'hidden'}
        >
          Preparar para Instagram
        </button>
        <div class="price-comparison-area">
          <button type="button" class="btn-compare-buscape">
            ${deal.comparison ? '↻ Atualizar Comparação' : '🔍 Comparar Preços'}
          </button>
          <div class="comparison-results ${deal.comparison ? '' : 'hidden'}">
            ${deal.comparison ? renderPriceComparison(deal.comparison, displayTitle) : ''}
          </div>
        </div>
        ${deleteBtnHtml}
      </div>
    `;
    
    card.addEventListener('click', (e) => {
      if (isPublished) return;
      if (e.target.closest('.checkbox-container') || e.target.closest('a') || e.target.closest('button')) return;
      toggleMLSelectIndex(index);
    });
    
    if (!isPublished) {
      card.querySelector('.deal-chk').addEventListener('change', () => {
        toggleMLSelectIndex(index);
      });
    }
    
    elGridML.appendChild(card);
  });

  updateDealPagination('ml', visibleEntries.length, filteredEntries.length);
  updateMLSelectionUI();
}

function renderAmazonDeals(deals) {
  elGridAmazon.innerHTML = '';
  
  if (deals.length === 0) {
    elPaginationAmazon.hidden = true;
    elGridAmazon.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma oferta da Amazon carregada. Clique em "Atualizar Amazon".</p>
      </div>
    `;
    return;
  }

  const filteredEntries = getFilteredDealEntries(deals, 'amazon');
  if (filteredEntries.length === 0) {
    elPaginationAmazon.hidden = true;
    elGridAmazon.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma oferta corresponde aos filtros selecionados.</p>
      </div>
    `;
    updateAmazonSelectionUI();
    return;
  }

  const visibleEntries = filteredEntries.slice(0, visibleAmazonLimit);
  visibleEntries.forEach(({ deal, index }) => {
    const isSelected = selectedAmazonIndices.has(index);
    const isPublished = !!deal.publishedMsgId;
    const wasRemoved = !!deal.removedFromWhatsAppAt;
    const card = document.createElement('article');
    card.className = `deal-card amazon-theme ${isSelected ? 'selected' : ''} ${isPublished ? 'published-card' : ''}`;
    card.dataset.index = index;
    
    const displayTitle = deal.title;
    const ratingText = deal.rating ? `⭐ ${deal.rating.toFixed(1)}` : 'Sem avaliação';
    
    let checkboxHtml = '';
    if (!isPublished) {
      checkboxHtml = `
        <div class="card-checkbox">
          <label class="checkbox-container">
            <input type="checkbox" class="deal-chk" data-index="${index}" ${isSelected ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
        </div>
      `;
    } else {
      checkboxHtml = `
        <div class="card-checkbox published-tick" title="Já publicado hoje">
          ✅
        </div>
      `;
    }

    let deleteBtnHtml = '';
    if (wasRemoved) {
      deleteBtnHtml = `
        <div class="card-published-area">
          <span class="published-badge removed-by-reaction">
            Encerrado por reação ${deal.removalReaction || '✅'}
          </span>
        </div>
      `;
    } else if (isPublished) {
      deleteBtnHtml = `
        <div class="card-published-area">
          <span class="published-badge">WhatsApp Ativo ✅</span>
          <button type="button" class="btn-delete-wpp" data-msg-id="${deal.publishedMsgId}" data-platform="amazon" data-index="${index}">
            🗑️ Excluir do WhatsApp
          </button>
        </div>
      `;
    }

    card.innerHTML = `
      ${checkboxHtml}
      <div class="card-image-box">
        <img class="card-image" src="${getDealImageUrl(deal.image)}" alt="${displayTitle}" loading="lazy" decoding="async">
        <span class="card-discount-badge">${deal.discount}% OFF</span>
      </div>
      <div class="card-details">
        <a href="${deal.link}" target="_blank" rel="noopener noreferrer" class="card-link-product">Ver Produto na Amazon 🔗</a>
        <div class="card-meta">
          <span class="card-rating">${ratingText}</span>
          <span class="card-sales">${deal.salesInfo || ''}</span>
        </div>
        <h3 class="card-title" title="${displayTitle}">${displayTitle}</h3>
        <div class="card-price-box">
          <span class="card-orig-price">De: ${deal.originalPrice}</span>
          <span class="card-promo-price">Por: ${deal.currentPrice}</span>
        </div>
        <div class="price-comparison-area">
          <button type="button" class="btn-compare-buscape">
            ${deal.comparison ? '↻ Atualizar Comparação' : '🔍 Comparar Preços'}
          </button>
          <div class="comparison-results ${deal.comparison ? '' : 'hidden'}">
            ${deal.comparison ? renderPriceComparison(deal.comparison, displayTitle) : ''}
          </div>
        </div>
        ${deleteBtnHtml}
      </div>
    `;
    
    card.addEventListener('click', (e) => {
      if (isPublished) return;
      if (e.target.closest('.checkbox-container') || e.target.closest('a') || e.target.closest('button')) return;
      toggleAmazonSelectIndex(index);
    });
    
    if (!isPublished) {
      card.querySelector('.deal-chk').addEventListener('change', () => {
        toggleAmazonSelectIndex(index);
      });
    }
    
    elGridAmazon.appendChild(card);
  });

  updateDealPagination(
    'amazon',
    visibleEntries.length,
    filteredEntries.length
  );
  updateAmazonSelectionUI();
}

function renderShopeeDeals(deals) {
  elGridShopee.innerHTML = '';
  if (deals.length === 0) {
    elPaginationShopee.hidden = true;
    elGridShopee.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma oferta da Shopee carregada.</p>
      </div>
    `;
    return;
  }

  const filteredEntries = getFilteredDealEntries(deals, 'shopee');
  if (filteredEntries.length === 0) {
    elPaginationShopee.hidden = true;
    elGridShopee.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma oferta corresponde aos filtros selecionados.</p>
      </div>
    `;
    return;
  }

  const visibleEntries = filteredEntries.slice(0, visibleShopeeLimit);
  for (const { deal, index } of visibleEntries) {
    const title = escapeQueueHtml(deal.title);
    const rating = Number(deal.rating);
    const card = document.createElement('article');
    card.className = 'deal-card shopee-theme';
    card.dataset.index = index;
    card.dataset.platform = 'shopee';
    card.innerHTML = `
      <div class="card-image-box">
        <img class="card-image" src="${getDealImageUrl(deal.image)}"
          alt="${title}" loading="lazy" decoding="async">
        <span class="card-discount-badge">${Number(deal.discount) || 0}% OFF</span>
      </div>
      <div class="card-details">
        <a href="${escapeQueueHtml(deal.link)}" target="_blank"
          rel="noopener noreferrer" class="card-link-product">
          Ver produto na Shopee 🔗
        </a>
        <div class="card-meta">
          <span class="card-rating">
            ${rating ? `⭐ ${rating.toFixed(1)}` : 'Sem avaliação'}
          </span>
          <span class="card-sales">${escapeQueueHtml(deal.salesInfo || '')}</span>
        </div>
        <h3 class="card-title" title="${title}">${title}</h3>
        <div class="card-price-box">
          <span class="card-orig-price">De: ${escapeQueueHtml(deal.originalPrice)}</span>
          <span class="card-promo-price">Por: ${escapeQueueHtml(deal.currentPrice)}</span>
        </div>
        <div class="price-comparison-area">
          <button type="button" class="btn-compare-buscape">
            ${deal.comparison ? '↻ Atualizar comparação' : '🔍 Comparar preços'}
          </button>
          <div class="comparison-results ${deal.comparison ? '' : 'hidden'}">
            ${deal.comparison ? renderPriceComparison(deal.comparison, deal.title) : ''}
          </div>
        </div>
        <button
          type="button"
          class="btn-add-queue-card"
          data-index="${index}"
          data-platform="shopee"
          ${publicationQueueEnabled ? '' : 'hidden'}
        >
          Preparar para Instagram
        </button>
      </div>
    `;
    elGridShopee.appendChild(card);
  }

  updateDealPagination(
    'shopee',
    visibleEntries.length,
    filteredEntries.length
  );
}

function renderCoupons(coupons) {
  elGridCoupons.innerHTML = '';
  
  if (coupons.length === 0) {
    elGridCoupons.innerHTML = `
      <div class="empty-state">
        <p>Nenhum cupom ativo no momento.</p>
      </div>
    `;
    return;
  }
  
  coupons.forEach((coupon) => {
    const compatibleDeals = findCompatibleDealsForCoupon(coupon, allMLDeals);
    const compCount = compatibleDeals.length;
    const isConfirmed = coupon.verificationStatus === 'manually_confirmed';
    const checkedAt = parseBackendDate(coupon.lastCheckedAt);
    const confirmedAt = parseBackendDate(coupon.lastConfirmedAt);
    const verificationLabel = isConfirmed
      ? `Confirmado manualmente${confirmedAt ? ` em ${confirmedAt.toLocaleString('pt-BR')}` : ''}`
      : 'Não verificado no checkout';

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
        <button class="btn-confirm-coupon" data-code="${coupon.code}">
          ${isConfirmed ? 'Confirmado ✓' : 'Confirmar após testar'}
        </button>
      </div>
    `;
    
    const gridContainer = item.querySelector('.compatible-products-grid');
    const listContainer = item.querySelector('.compatible-products-list');
    const toggleBtn = item.querySelector('.btn-toggle-products');
    const arrowIcon = item.querySelector('.arrow-icon');
    const miniFilterInput = item.querySelector('.ipt-mini-filter');
    
    const updateFilteredGrid = (searchTerm = '') => {
      if (!gridContainer) return;
      gridContainer.innerHTML = '';
      
      const filteredDeals = compatibleDeals.filter(d => 
        d.title.toLowerCase().includes(searchTerm.toLowerCase())
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
        mini.addEventListener('click', () => {
          // Troca para a aba do Mercado Livre e rola até o produto
          elFilterNameML.value = d.title;
          applyMLFilters();
          elTabProducts.click();
          elTabML.click();
          setTimeout(() => {
            const card = Array.from(elGridML.querySelectorAll('.deal-card')).find(c => {
              const idx = parseInt(c.dataset.index, 10);
              return allMLDeals[idx] && allMLDeals[idx].title === d.title;
            });
            if (card) {
              card.scrollIntoView({ behavior: 'smooth', block: 'center' });
              card.style.borderColor = '#ffe600';
              card.style.boxShadow = '0 0 15px rgba(255, 230, 0, 0.4)';
              setTimeout(() => {
                card.style.borderColor = '';
                card.style.boxShadow = '';
              }, 2000);
            }
          }, 200);
        });
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

    const confirmBtn = item.querySelector('.btn-confirm-coupon');
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Salvando...';
      try {
        const response = await fetch(
          `/api/coupons/${encodeURIComponent(coupon.code)}/confirm`,
          { method: 'POST' }
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Falha na confirmação');
        }
        Object.assign(coupon, result.coupon);
        renderCoupons(coupons);
        renderMLDeals(allMLDeals);
      } catch (err) {
        alert(`Não foi possível confirmar o cupom: ${err.message}`);
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirmar após testar';
      }
    });

    elGridCoupons.appendChild(item);
  });
}

function findCompatibleDealsForCoupon(coupon, deals) {
  if (!coupon || !coupon.rules || !deals) return [];
  const rulesText = coupon.rules.toLowerCase();
  
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
// Filters Logic
// ==========================================
function applyMLFilters() {
  visibleMLLimit = DEALS_PAGE_SIZE;
  renderMLDeals(allMLDeals);
}

function applyAmazonFilters() {
  visibleAmazonLimit = DEALS_PAGE_SIZE;
  renderAmazonDeals(allAmazonDeals);
}

function applyShopeeFilters() {
  visibleShopeeLimit = DEALS_PAGE_SIZE;
  renderShopeeDeals(allShopeeDeals);
}

// ==========================================
// Selection Management
// ==========================================
function toggleMLSelectIndex(index) {
  if (selectedMLIndices.has(index)) {
    selectedMLIndices.delete(index);
  } else {
    selectedMLIndices.add(index);
  }
  updateMLSelectionUI();
}

function toggleAmazonSelectIndex(index) {
  if (selectedAmazonIndices.has(index)) {
    selectedAmazonIndices.delete(index);
  } else {
    selectedAmazonIndices.add(index);
  }
  updateAmazonSelectionUI();
}

function updateMobileSelectionBar() {
  const onDealTab = elTabProducts.classList.contains('active');
  const count = activeDealPlatform === 'amazon'
    ? selectedAmazonIndices.size
    : activeDealPlatform === 'shopee'
      ? 0
      : selectedMLIndices.size;

  elMobileSelectionCount.textContent = count;
  elMobileSelectionBar.classList.toggle(
    'hidden',
    !onDealTab || activeDealPlatform === 'shopee' || count === 0
  );
  elBtnMobileQueue.hidden =
    !publicationQueueEnabled || activeDealPlatform !== 'ml';
  elBtnMobileQueue.disabled = count === 0;
  elBtnMobileSend.disabled = !whatsappReady || count === 0;
  elBtnMobileSend.textContent = whatsappReady
    ? 'Enviar ao WhatsApp'
    : 'WhatsApp desconectado';
}

function updateMLSelectionUI() {
  const cards = elGridML.querySelectorAll('.deal-card');
  cards.forEach(card => {
    const idx = parseInt(card.dataset.index, 10);
    const chk = card.querySelector('.deal-chk');
    if (selectedMLIndices.has(idx)) {
      card.classList.add('selected');
      if (chk) chk.checked = true;
    } else {
      card.classList.remove('selected');
      if (chk) chk.checked = false;
    }
  });

  const count = selectedMLIndices.size;
  elTxtSelectedCountML.textContent = count;
  elTxtQueueCountML.textContent = count;
  elBtnGenerateML.disabled = count === 0 || !whatsappReady;
  elBtnQueueML.disabled = count === 0;
  elBtnClearSelectionML.disabled = count === 0;

  const visibleCards = elGridML.querySelectorAll('.deal-card:not(.hidden-filter)');
  if (visibleCards.length > 0) {
    let allSelected = true;
    visibleCards.forEach(card => {
      if (!selectedMLIndices.has(parseInt(card.dataset.index, 10))) allSelected = false;
    });
    elChkSelectAllML.checked = allSelected;
  } else {
    elChkSelectAllML.checked = false;
  }
  updateMobileSelectionBar();
}

function updateAmazonSelectionUI() {
  const cards = elGridAmazon.querySelectorAll('.deal-card');
  cards.forEach(card => {
    const idx = parseInt(card.dataset.index, 10);
    const chk = card.querySelector('.deal-chk');
    if (selectedAmazonIndices.has(idx)) {
      card.classList.add('selected');
      if (chk) chk.checked = true;
    } else {
      card.classList.remove('selected');
      if (chk) chk.checked = false;
    }
  });

  const count = selectedAmazonIndices.size;
  elTxtSelectedCountAmazon.textContent = count;
  elBtnGenerateAmazon.disabled = count === 0 || !whatsappReady;
  elBtnClearSelectionAmazon.disabled = count === 0;

  const visibleCards = elGridAmazon.querySelectorAll('.deal-card:not(.hidden-filter)');
  if (visibleCards.length > 0) {
    let allSelected = true;
    visibleCards.forEach(card => {
      if (!selectedAmazonIndices.has(parseInt(card.dataset.index, 10))) allSelected = false;
    });
    elChkSelectAllAmazon.checked = allSelected;
  } else {
    elChkSelectAllAmazon.checked = false;
  }
  updateMobileSelectionBar();
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
  [elTabML, elTabAmazon, elTabShopee].forEach(btn => {
    btn.classList.toggle('active', btn === activeBtn);
    btn.setAttribute('aria-selected', String(btn === activeBtn));
  });
  [elPanelML, elPanelAmazon, elPanelShopee].forEach(panel =>
    panel.classList.toggle('active', panel === activePanel)
  );

  activeDealPlatform = activeBtn === elTabAmazon
    ? 'amazon'
    : activeBtn === elTabShopee
      ? 'shopee'
      : 'ml';
  updateLastUpdateUI(activeDealPlatform);
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

  // Generate / Post Triggers
  elBtnGenerateML.addEventListener('click', () => postSelectedDeals('ml'));
  elBtnGenerateAmazon.addEventListener('click', () => postSelectedDeals('amazon'));
  elBtnMobileSend.addEventListener('click', () =>
    postSelectedDeals(activeDealPlatform)
  );
  elBtnMobileQueue.addEventListener('click', () => {
    const deals = allMLDeals.filter((_, index) =>
      selectedMLIndices.has(index)
    );
    enqueueDealsForPublication(deals);
  });
  elBtnQueueML.addEventListener('click', () => {
    const deals = allMLDeals.filter((_, index) =>
      selectedMLIndices.has(index)
    );
    enqueueDealsForPublication(deals);
  });
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
  elQueueStatusFilter.addEventListener('change', renderPublicationQueue);

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

  // Clear Selections
  elBtnClearSelectionML.addEventListener('click', () => {
    selectedMLIndices.clear();
    updateMLSelectionUI();
  });
  elBtnClearSelectionAmazon.addEventListener('click', () => {
    selectedAmazonIndices.clear();
    updateAmazonSelectionUI();
  });

  // Filters ML listeners
  elFilterNameML.addEventListener('input', applyMLFilters);
  elFilterDiscountML.addEventListener('change', applyMLFilters);

  // Filters Amazon listeners
  elFilterNameAmazon.addEventListener('input', applyAmazonFilters);
  elFilterDiscountAmazon.addEventListener('change', applyAmazonFilters);

  // Filters Shopee listeners
  elFilterNameShopee.addEventListener('input', applyShopeeFilters);
  elFilterDiscountShopee.addEventListener('change', applyShopeeFilters);
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
    const platform = addButton.dataset.platform === 'shopee'
      ? 'shopee'
      : 'mercado_livre';
    const deals = platform === 'shopee' ? allShopeeDeals : allMLDeals;
    const deal = deals[Number(addButton.dataset.index)];
    if (deal) await enqueueDealsForPublication([deal], platform);
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
