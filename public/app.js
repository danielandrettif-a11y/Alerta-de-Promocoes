// State management
let allMLDeals = [];
let allAmazonDeals = [];
let allCoupons = [];
const selectedMLIndices = new Set();
const selectedAmazonIndices = new Set();
let lastUpdateML = '';
let lastUpdateAmazon = '';
let freshnessML = null;
let freshnessAmazon = null;

// DOM elements - Tabs
const elTabML = document.getElementById('btn-tab-ml');
const elTabAmazon = document.getElementById('btn-tab-amazon');
const elTabCoupons = document.getElementById('btn-tab-coupons');

const elPanelML = document.getElementById('panel-ml');
const elPanelAmazon = document.getElementById('panel-amazon');
const elPanelCoupons = document.getElementById('panel-coupons');

// DOM elements - Grids
const elGridML = document.getElementById('grid-ml');
const elGridAmazon = document.getElementById('grid-amazon');
const elGridCoupons = document.getElementById('grid-coupons');

// DOM elements - ML Actions
const elBtnUpdateML = document.getElementById('btn-update-ml');
const elBtnGenerateML = document.getElementById('btn-generate-ml');
const elChkSelectAllML = document.getElementById('chk-select-all-ml');
const elBtnClearSelectionML = document.getElementById('btn-clear-selection-ml');
const elTxtSelectedCountML = document.getElementById('txt-selected-count-ml');

// DOM elements - Amazon Actions
const elBtnUpdateAmazon = document.getElementById('btn-update-amazon');
const elBtnGenerateAmazon = document.getElementById('btn-generate-amazon');
const elChkSelectAllAmazon = document.getElementById('chk-select-all-amazon');
const elBtnClearSelectionAmazon = document.getElementById('btn-clear-selection-amazon');
const elTxtSelectedCountAmazon = document.getElementById('txt-selected-count-amazon');

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

let globalTaxonomy = {};

// General
const elTxtLastUpdate = document.getElementById('txt-last-update');
const elTxtAutomationStatus = document.getElementById('txt-automation-status');
const elLoadingOverlay = document.getElementById('loading-overlay');
const elLoadingText = document.getElementById('loading-text');

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

function updateLastUpdateUI(platform) {
  const currentUpdateStr = platform === 'amazon' ? lastUpdateAmazon : lastUpdateML;
  const freshness = platform === 'amazon' ? freshnessAmazon : freshnessML;
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
    freshnessML = status.mercadoLivre || freshnessML;
    freshnessAmazon = status.amazon || freshnessAmazon;
    lastUpdateML = status.mercadoLivre?.generatedAt || lastUpdateML;
    lastUpdateAmazon = status.amazon?.generatedAt || lastUpdateAmazon;

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
    const platform = elTabAmazon.classList.contains('active') ? 'amazon' : 'ml';
    updateLastUpdateUI(platform);
  } catch (err) {
    console.error('Erro ao consultar estado das atualizações:', err);
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
    
    // Configurar listeners em cascata
    elFilterCategoryML.addEventListener('change', () => {
      handleCategoryChange(elFilterCategoryML, elFilterSubcategoryML);
      applyMLFilters();
    });
    elFilterCategoryAmazon.addEventListener('change', () => {
      handleCategoryChange(elFilterCategoryAmazon, elFilterSubcategoryAmazon);
      applyAmazonFilters();
    });
    
    elFilterSubcategoryML.addEventListener('change', applyMLFilters);
    elFilterSubcategoryAmazon.addEventListener('change', applyAmazonFilters);
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
  try {
    const historyRes = await fetch('/api/publish-history');
    const historyData = await historyRes.json();
    const publishedEntries = historyData.entries || [];

    const response = await fetch('/api/deals');
    const data = await response.json();
    
    allMLDeals = (data.deals || []).map(deal => {
      const dealId = generateClientDealId(deal, 'mercado_livre');
      const pub = publishedEntries.find(e => e.dealId === dealId);
      return {
        ...deal,
        publishedMsgId: pub ? pub.msgId : null
      };
    });
    allCoupons = data.coupons || [];
    freshnessML = data.freshness || null;
    
    renderMLDeals(allMLDeals);
    renderCoupons(allCoupons);
    
    if (data.generatedAt) {
      lastUpdateML = data.generatedAt;
      if (elTabML.classList.contains('active') || elTabCoupons.classList.contains('active')) {
        updateLastUpdateUI('ml');
      }
    }
  } catch (err) {
    console.error('Erro ao buscar ofertas do Mercado Livre:', err);
  }
}

async function fetchAmazonDeals() {
  try {
    const historyRes = await fetch('/api/publish-history');
    const historyData = await historyRes.json();
    const publishedEntries = historyData.entries || [];

    const response = await fetch('/api/amazon-deals');
    const data = await response.json();
    
    allAmazonDeals = (data.deals || []).map(deal => {
      const dealId = generateClientDealId(deal, 'amazon');
      const pub = publishedEntries.find(e => e.dealId === dealId);
      return {
        ...deal,
        publishedMsgId: pub ? pub.msgId : null
      };
    });
    freshnessAmazon = data.freshness || null;
    renderAmazonDeals(allAmazonDeals);
    
    if (data.generatedAt) {
      lastUpdateAmazon = data.generatedAt;
      if (elTabAmazon.classList.contains('active')) {
        updateLastUpdateUI('amazon');
      }
    }
  } catch (err) {
    console.error('Erro ao buscar ofertas da Amazon:', err);
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

      allMLDeals = (data.data.deals || []).map(deal => {
        const dealId = generateClientDealId(deal, 'mercado_livre');
        const pub = publishedEntries.find(e => e.dealId === dealId);
        return {
          ...deal,
          publishedMsgId: pub ? pub.msgId : null
        };
      });
      allCoupons = data.data.coupons || [];
      freshnessML = data.data.freshness || null;
      selectedMLIndices.clear();
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

      allAmazonDeals = (data.data.deals || []).map(deal => {
        const dealId = generateClientDealId(deal, 'amazon');
        const pub = publishedEntries.find(e => e.dealId === dealId);
        return {
          ...deal,
          publishedMsgId: pub ? pub.msgId : null
        };
      });
      freshnessAmazon = data.data.freshness || null;
      selectedAmazonIndices.clear();
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
// Canvas Story Rendering (Local Frontend)
// ==========================================
function drawStoryOnCanvas(deal, platform) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    // 1. Desenha o fundo (Gradiente dinâmico baseado no tipo de oferta)
    let gradient = ctx.createLinearGradient(0, 0, 0, 1920);
    const isLightning = deal.dealType === 'Oferta Relâmpago';
    
    if (isLightning) {
      // Gradiente escuro futurista com tons de roxo/fogo para Ofertas Relâmpago
      gradient.addColorStop(0, '#0f0c20');
      gradient.addColorStop(0.5, '#190a2a');
      gradient.addColorStop(1, '#05020a');
    } else {
      // Gradiente azul escuro premium para Ofertas do Dia / Campanha
      gradient.addColorStop(0, '#0a192f');
      gradient.addColorStop(0.5, '#0d2b45');
      gradient.addColorStop(1, '#020c1b');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1920);

    // Efeito Glow central
    ctx.beginPath();
    ctx.arc(540, 960, 480, 0, Math.PI * 2);
    ctx.fillStyle = isLightning ? 'rgba(255, 0, 128, 0.07)' : 'rgba(0, 242, 254, 0.06)';
    ctx.fill();

    // 2. Carrega imagem do produto através do Proxy para desviar do CORS
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `/api/proxy-image?url=${encodeURIComponent(deal.image)}`;
    
    img.onload = () => {
      // Desenha card de fundo branco arredondado para destacar o produto
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      const rx = 120, ry = 520, rw = 840, rh = 840, radius = 40;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(rx, ry, rw, rh, radius);
      } else {
        ctx.rect(rx, ry, rw, rh);
      }
      ctx.fill();

      // Desenha imagem proporcional
      const padding = 60;
      const targetW = rw - (padding * 2);
      const targetH = rh - (padding * 2);
      const imgRatio = img.width / img.height;
      const targetRatio = targetW / targetH;
      let drawW, drawH;
      
      if (imgRatio > targetRatio) {
        drawW = targetW;
        drawH = targetW / imgRatio;
      } else {
        drawH = targetH;
        drawW = targetH * imgRatio;
      }
      
      const drawX = rx + padding + (targetW - drawW) / 2;
      const drawY = ry + padding + (targetH - drawH) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // 3. Tag da Plataforma no topo
      const platColor = platform === 'amazon' ? '#ff9900' : '#ffe600';
      const platTextColor = platform === 'amazon' ? '#ffffff' : '#333333';
      const platText = platform === 'amazon' ? '🟡 AMAZON' : '🛍️ MERCADO LIVRE';
      
      ctx.fillStyle = platColor;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(390, 120, 300, 70, 20);
      } else {
        ctx.rect(390, 120, 300, 70);
      }
      ctx.fill();
      
      ctx.fillStyle = platTextColor;
      ctx.font = 'bold 36px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(platText, 540, 155);

      // 4. Tipo de Oferta em Destaque
      const dealTypeText = isLightning ? '⚡ OFERTA RELÂMPAGO' : '🔥 OFERTA DO DIA';
      const dealTypeColor = isLightning ? '#ff6633' : '#00f2fe';
      ctx.fillStyle = dealTypeColor;
      ctx.font = 'bold 46px Montserrat, sans-serif';
      ctx.fillText(dealTypeText, 540, 245);

      // 5. Título do Produto (com quebra inteligente de linha)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px Outfit, sans-serif';
      ctx.textAlign = 'center';
      
      const words = deal.title.split(' ');
      let line = '';
      let y = 330;
      const maxWidth = 920;
      const lineHeight = 55;
      let linesDrawn = 0;

      for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, 540, y);
          line = words[n] + ' ';
          y += lineHeight;
          linesDrawn++;
          if (linesDrawn >= 2) break;
        } else {
          line = testLine;
        }
      }
      if (linesDrawn < 2) {
        ctx.fillText(line, 540, y);
      }

      // 6. Preços e Desconto
      // Selo de Desconto redondo
      ctx.fillStyle = '#ff0055';
      ctx.beginPath();
      ctx.arc(880, 1340, 85, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px Montserrat, sans-serif';
      ctx.fillText(`${deal.discount}%`, 880, 1325);
      ctx.font = 'bold 24px Montserrat, sans-serif';
      ctx.fillText('OFF', 880, 1360);

      // Preço Original riscado
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.font = '36px Outfit, sans-serif';
      ctx.fillText(`De: ${deal.originalPrice}`, 540, 1430);
      
      const origTextWidth = ctx.measureText(`De: ${deal.originalPrice}`).width;
      ctx.strokeStyle = 'rgba(255, 0, 85, 0.7)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(540 - (origTextWidth / 2), 1418);
      ctx.lineTo(540 + (origTextWidth / 2), 1418);
      ctx.stroke();

      // Preço Promocional em Destaque Verde Neon
      ctx.fillStyle = '#00ff66';
      ctx.font = '900 86px Montserrat, sans-serif';
      ctx.fillText(deal.currentPrice, 540, 1530);

      // Categoria e Subcategoria
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'italic 30px Outfit, sans-serif';
      const catInfo = getProductCategoryAndSub(deal.title);
      ctx.fillText(`Categoria: ${catInfo.icon} ${catInfo.category} > ${catInfo.subcategory}`, 540, 1640);

      // Chamada de Link
      ctx.fillStyle = platColor;
      ctx.font = 'bold 36px Outfit, sans-serif';
      ctx.fillText('👉 Link direto enviado no Grupo!', 540, 1730);

      // Retorna a URL base64 da imagem pronta
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };

    img.onerror = () => reject(new Error('Erro ao carregar imagem via proxy de CORS. O link pode estar inacessível.'));
  });
}

// ==========================================
// Post Flow to WhatsApp
// ==========================================
async function postSelectedDeals(platform) {
  const indices = Array.from(platform === 'ml' ? selectedMLIndices : selectedAmazonIndices);
  const deals = platform === 'ml' ? allMLDeals : allAmazonDeals;
  const targetDeals = deals.filter((_, idx) => indices.includes(idx));

  if (targetDeals.length === 0) return;

  const modal = document.getElementById('progress-modal');
  const logEl = document.getElementById('progress-log');
  const spinner = modal.querySelector('.progress-spinner');
  
  modal.classList.remove('hidden');
  spinner.style.display = 'block';
  logEl.innerHTML = '';

  const addLog = (msg, type = 'info') => {
    const d = document.createElement('div');
    d.className = `progress-line progress-${type}`;
    d.textContent = msg;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  };

  addLog(`Preparando envio de ${targetDeals.length} ofertas para o WhatsApp...`);
  
  const payloadDeals = [];

  for (let i = 0; i < targetDeals.length; i++) {
    const deal = targetDeals[i];
    addLog(`[${i+1}/${targetDeals.length}] Renderizando Story via Canvas para: ${deal.title.substring(0, 30)}...`);

    try {
      const base64Image = await drawStoryOnCanvas(deal, platform);
      payloadDeals.push({
        title: deal.title,
        originalPrice: deal.originalPrice,
        currentPrice: deal.currentPrice,
        discount: deal.discount,
        link: deal.link,
        category: (() => { const res = getProductCategoryAndSub(deal.title); return `${res.icon} ${res.category} > ${res.subcategory}`; })(),
        platform: platform,
        imageBuffer: base64Image
      });
      addLog(`✓ Story renderizado com sucesso!`, 'success');
    } catch (canvasErr) {
      addLog(`❌ Falha ao renderizar Story: ${canvasErr.message}. Enviando apenas texto.`, 'warning');
      payloadDeals.push({
        title: deal.title,
        originalPrice: deal.originalPrice,
        currentPrice: deal.currentPrice,
        discount: deal.discount,
        link: deal.link,
        category: (() => { const res = getProductCategoryAndSub(deal.title); return `${res.icon} ${res.category} > ${res.subcategory}`; })(),
        platform: platform,
        imageBuffer: null
      });
    }
  }

  addLog(`Iniciando envio para o servidor Express...`);

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedDeals: payloadDeals })
    });
    const result = await response.json();
    
    if (result.success && result.results) {
      addLog(`🚀 Ofertas postadas no WhatsApp com sucesso!`, 'success');
      
      // Atualiza o estado local das ofertas com o respectivo msgId retornado
      result.results.forEach(resItem => {
        if (resItem.success && resItem.msgId) {
          const dealList = platform === 'ml' ? allMLDeals : allAmazonDeals;
          const found = dealList.find(d =>
            generateClientDealId(d, platform) === resItem.dealId
          );
          if (found) {
            found.publishedMsgId = resItem.msgId;
          }
        }
      });

      // Redesenha a UI
      if (platform === 'ml') {
        renderMLDeals(allMLDeals);
      } else {
        renderAmazonDeals(allAmazonDeals);
      }
    } else if (result.success) {
      addLog(`🚀 Envio disparado no servidor!`, 'success');
    } else {
      addLog(`❌ Falha no servidor: ${result.error}`, 'error');
    }
  } catch (err) {
    addLog(`❌ Falha de rede ao disparar envios: ${err.message}`, 'error');
  }

  spinner.style.display = 'none';
  
  // Limpa seleções pós envio
  if (platform === 'ml') {
    selectedMLIndices.clear();
    updateMLSelectionUI();
  } else {
    selectedAmazonIndices.clear();
    updateAmazonSelectionUI();
  }
}

// ==========================================
// Rendering Methods (Cards & UI)
// ==========================================
function renderMLDeals(deals) {
  elGridML.innerHTML = '';
  
  if (deals.length === 0) {
    elGridML.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma oferta do Mercado Livre carregada. Clique em "Atualizar Mercado Livre".</p>
      </div>
    `;
    return;
  }
  
  deals.forEach((deal, index) => {
    const isSelected = selectedMLIndices.has(index);
    const isPublished = !!deal.publishedMsgId;
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
        <div class="card-checkbox published-tick" title="Já publicado no WhatsApp">
          ✅
        </div>
      `;
    }

    let deleteBtnHtml = '';
    if (isPublished) {
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
        <img class="card-image" src="${deal.image}" alt="${displayTitle}" loading="lazy">
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
        <div class="price-comparison-area" data-title="${displayTitle}">
          <button type="button" class="btn-compare-buscape" data-title="${displayTitle}">
            🔍 Comparar Preços
          </button>
          <div class="comparison-results hidden"></div>
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
  
  applyMLFilters();
}

function renderAmazonDeals(deals) {
  elGridAmazon.innerHTML = '';
  
  if (deals.length === 0) {
    elGridAmazon.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma oferta da Amazon carregada. Clique em "Atualizar Amazon".</p>
      </div>
    `;
    return;
  }
  
  deals.forEach((deal, index) => {
    const isSelected = selectedAmazonIndices.has(index);
    const isPublished = !!deal.publishedMsgId;
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
        <div class="card-checkbox published-tick" title="Já publicado no WhatsApp">
          ✅
        </div>
      `;
    }

    let deleteBtnHtml = '';
    if (isPublished) {
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
        <img class="card-image" src="${deal.image}" alt="${displayTitle}" loading="lazy">
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
        <div class="price-comparison-area" data-title="${displayTitle}">
          <button type="button" class="btn-compare-buscape" data-title="${displayTitle}">
            🔍 Comparar Preços
          </button>
          <div class="comparison-results hidden"></div>
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
  
  applyAmazonFilters();
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
          <img src="${d.image}" alt="">
          <div class="mini-details">
            <span class="mini-title">${d.title}</span>
            <span class="mini-price">${d.currentPrice} (${d.discount}% OFF)</span>
          </div>
        `;
        mini.addEventListener('click', () => {
          // Troca para a aba do Mercado Livre e rola até o produto
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
  const searchTerm = elFilterNameML.value.toLowerCase().trim();
  const selectedCategory = elFilterCategoryML.value;
  const selectedSubcategory = elFilterSubcategoryML.value;
  const selectedDiscount = elFilterDiscountML.value;
  
  const cards = elGridML.querySelectorAll('.deal-card');
  
  cards.forEach(card => {
    const idx = parseInt(card.dataset.index, 10);
    const deal = allMLDeals[idx];
    if (!deal) return;
    
    const matchesSearch = deal.title.toLowerCase().includes(searchTerm);
    const catInfo = getProductCategoryAndSub(deal.title);
    const matchesCategory = !selectedCategory || catInfo.category === selectedCategory;
    const matchesSubcategory = !selectedSubcategory || catInfo.subcategory === selectedSubcategory;
    const matchesDiscount = !selectedDiscount || deal.discount >= parseInt(selectedDiscount, 10);
    
    if (matchesSearch && matchesCategory && matchesSubcategory && matchesDiscount) {
      card.classList.remove('hidden-filter');
    } else {
      card.classList.add('hidden-filter');
    }
  });

  updateMLSelectionUI();
}

function applyAmazonFilters() {
  const searchTerm = elFilterNameAmazon.value.toLowerCase().trim();
  const selectedCategory = elFilterCategoryAmazon.value;
  const selectedSubcategory = elFilterSubcategoryAmazon.value;
  const selectedDiscount = elFilterDiscountAmazon.value;
  
  const cards = elGridAmazon.querySelectorAll('.deal-card');
  
  cards.forEach(card => {
    const idx = parseInt(card.dataset.index, 10);
    const deal = allAmazonDeals[idx];
    if (!deal) return;
    
    const matchesSearch = deal.title.toLowerCase().includes(searchTerm);
    const catInfo = getProductCategoryAndSub(deal.title);
    const matchesCategory = !selectedCategory || catInfo.category === selectedCategory;
    const matchesSubcategory = !selectedSubcategory || catInfo.subcategory === selectedSubcategory;
    const matchesDiscount = !selectedDiscount || deal.discount >= parseInt(selectedDiscount, 10);
    
    if (matchesSearch && matchesCategory && matchesSubcategory && matchesDiscount) {
      card.classList.remove('hidden-filter');
    } else {
      card.classList.add('hidden-filter');
    }
  });

  updateAmazonSelectionUI();
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
  elBtnGenerateML.disabled = count === 0;
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
  elBtnGenerateAmazon.disabled = count === 0;
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
}

// ==========================================
// Tabs Management
// ==========================================
function switchTab(activeBtn, activePanel) {
  [elTabML, elTabAmazon, elTabCoupons].forEach(btn => btn.classList.remove('active'));
  [elPanelML, elPanelAmazon, elPanelCoupons].forEach(panel => panel.classList.remove('active'));
  
  activeBtn.classList.add('active');
  activePanel.classList.add('active');
  
  const platform = activeBtn === elTabAmazon ? 'amazon' : 'ml';
  updateLastUpdateUI(platform);
}

// ==========================================
// Initialization & Listeners
// ==========================================
function init() {
  // Tab Switchers
  elTabML.addEventListener('click', () => switchTab(elTabML, elPanelML));
  elTabAmazon.addEventListener('click', () => switchTab(elTabAmazon, elPanelAmazon));
  elTabCoupons.addEventListener('click', () => switchTab(elTabCoupons, elPanelCoupons));

  // Scrapers
  elBtnUpdateML.addEventListener('click', triggerMLScraper);
  elBtnUpdateAmazon.addEventListener('click', triggerAmazonScraper);

  // Generate / Post Triggers
  elBtnGenerateML.addEventListener('click', () => postSelectedDeals('ml'));
  elBtnGenerateAmazon.addEventListener('click', () => postSelectedDeals('amazon'));

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

  // Initial loads
  fetchCategories().then(() => {
    fetchMLDeals();
    fetchAmazonDeals();
    fetchDataStatus();
  });
  setInterval(fetchDataStatus, 60000);
}

// Listener de clique para o comparador de preços
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-compare-buscape');
  if (btn) {
    e.stopPropagation();
    e.preventDefault();
    
    const title = btn.dataset.title;
    const card = btn.closest('.deal-card');
    const resultsDiv = btn.nextElementSibling;
    const platform = card.classList.contains('amazon-theme') ? 'amazon' : 'ml';
    const index = parseInt(card.dataset.index, 10);
    
    btn.disabled = true;
    btn.innerHTML = '<span class="comp-spinner"></span> Consultando...';
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = '<div class="comparison-loading">Buscando menor preço em 3 buscadores...</div>';
    
    try {
      const deal = platform === 'ml' ? allMLDeals[index] : allAmazonDeals[index];
      const cleanCurrentPriceStr = deal.currentPrice.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      const currentPriceVal = parseFloat(cleanCurrentPriceStr) || 0;
      
      const response = await fetch(`/api/compare-price?q=${encodeURIComponent(title)}&price=${currentPriceVal}`);
      const data = await response.json();
      
      if (data.success) {
        // Salva os dados de comparação no estado local da oferta
        deal.comparison = {
          minPrice: data.minPrice,
          priceText: data.priceText,
          url: data.url,
          sourcesCount: data.sourcesCount,
          checkedAt: data.checkedAt
        };
        
        // Calcula a economia
        const diff = data.minPrice - currentPriceVal;
        const tolerance = currentPriceVal * 0.02; // tolerância de 2%
        
        let statusHtml = '';
        if (diff > tolerance) {
          statusHtml = `<span class="comparison-badge badge-real">Economia: R$ ${diff.toFixed(2).replace('.', ',')}! 📉</span>`;
        } else if (diff < -tolerance) {
          statusHtml = `<span class="comparison-badge badge-alert">⚠️ Preço Acima do Mercado</span>`;
        } else {
          statusHtml = `<span class="comparison-badge badge-eq">Preço Equivalente ⚖️</span>`;
        }
        
        let buscapeHtml = data.buscape 
          ? `<div class="provider-col">
              <span class="provider-name">Buscapé 🔎</span>
              <span class="provider-price">${data.buscape.priceText}</span>
              <a href="${data.buscape.url}" target="_blank" rel="noopener noreferrer" class="provider-link">Ir 🔗</a>
             </div>`
          : `<div class="provider-col disabled">
              <span class="provider-name">Buscapé 🔎</span>
              <span class="provider-price">N/A</span>
             </div>`;
             
        let zoomHtml = data.zoom 
          ? `<div class="provider-col">
              <span class="provider-name">Zoom ⚡</span>
              <span class="provider-price">${data.zoom.priceText}</span>
              <a href="${data.zoom.url}" target="_blank" rel="noopener noreferrer" class="provider-link">Ir 🔗</a>
             </div>`
          : `<div class="provider-col disabled">
              <span class="provider-name">Zoom ⚡</span>
              <span class="provider-price">N/A</span>
             </div>`;

        let bondfaroHtml = data.bondfaro 
          ? `<div class="provider-col">
              <span class="provider-name">Bondfaro 🏷️</span>
              <span class="provider-price">${data.bondfaro.priceText}</span>
              <a href="${data.bondfaro.url}" target="_blank" rel="noopener noreferrer" class="provider-link">Ir 🔗</a>
             </div>`
          : `<div class="provider-col disabled">
              <span class="provider-name">Bondfaro 🏷️</span>
              <span class="provider-price">N/A</span>
             </div>`;

        resultsDiv.innerHTML = `
          <div class="comparison-details">
            <div class="comparison-providers">
              ${buscapeHtml}
              ${zoomHtml}
              ${bondfaroHtml}
            </div>
            <div class="comparison-summary">
              <p class="comp-price-row">Menor preço semelhante encontrado: <strong>${data.priceText}</strong></p>
              <p class="comparison-note">
                Estimativa com ${data.sourcesCount || 1} comparador(es). Confirme modelo, frete e vendedor.
              </p>
              ${statusHtml}
            </div>
          </div>
        `;
        btn.style.display = 'none'; // esconde o botão após sucesso
      } else {
        resultsDiv.innerHTML = `
          <div class="comparison-error">
            <span>⚠️ Preço não encontrado.</span>
            <div class="manual-links-row">
              <a href="https://www.buscape.com.br/search?q=${encodeURIComponent(title)}" target="_blank" rel="noopener noreferrer" class="comparison-link">Buscapé 🔗</a>
              <a href="https://www.zoom.com.br/search?q=${encodeURIComponent(title)}" target="_blank" rel="noopener noreferrer" class="comparison-link">Zoom 🔗</a>
              <a href="https://www.bondfaro.com.br/search?q=${encodeURIComponent(title)}" target="_blank" rel="noopener noreferrer" class="comparison-link">Bondfaro 🔗</a>
            </div>
          </div>
        `;
        btn.textContent = 'Comparar Preços';
        btn.disabled = false;
      }
    } catch (err) {
      resultsDiv.innerHTML = `<div class="comparison-error">Erro de rede ao consultar.</div>`;
      btn.textContent = 'Comparar Preços';
      btn.disabled = false;
    }
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
            deal.publishedMsgId = null;
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

init();
