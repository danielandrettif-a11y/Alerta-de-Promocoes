// State management
let allDeals = [];
let allCoupons = [];
const selectedIndices = new Set();

// DOM elements
const elTabDeals = document.getElementById('btn-tab-deals');
const elTabCoupons = document.getElementById('btn-tab-coupons');
const elTabStories = document.getElementById('btn-tab-stories');

const elPanelDeals = document.getElementById('panel-deals');
const elPanelCoupons = document.getElementById('panel-coupons');
const elPanelStories = document.getElementById('panel-stories');

const elGridDeals = document.getElementById('grid-deals');
const elGridCoupons = document.getElementById('grid-coupons');
const elGridStories = document.getElementById('grid-stories');

const elBtnUpdateDeals = document.getElementById('btn-update-deals');
const elBtnGenerateStories = document.getElementById('btn-generate-stories');
const elChkSelectAll = document.getElementById('chk-select-all');
const elBtnClearSelection = document.getElementById('btn-clear-selection');

const elTxtLastUpdate = document.getElementById('txt-last-update');
const elTxtSelectedCount = document.getElementById('txt-selected-count');

const elLoadingOverlay = document.getElementById('loading-overlay');
const elLoadingText = document.getElementById('loading-text');

const elLightboxModal = document.getElementById('lightbox-modal');
const elImgLightboxPreview = document.getElementById('img-lightbox-preview');
const elBtnCloseLightbox = document.getElementById('btn-close-lightbox');
const elBtnDownloadStory = document.getElementById('btn-download-story');

// ==========================================
// API Interaction Helpers
// ==========================================
function showLoading(text) {
  elLoadingText.textContent = text;
  elLoadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  elLoadingOverlay.classList.add('hidden');
}

async function fetchDeals() {
  try {
    const response = await fetch('/api/deals');
    const data = await response.json();
    
    allDeals = data.deals || [];
    allCoupons = data.coupons || [];
    renderDeals(allDeals);
    renderCoupons(allCoupons);
    populateCouponSelect(allCoupons);
    
    if (data.generatedAt) {
      elTxtLastUpdate.textContent = `Última atualização: ${data.generatedAt}`;
    } else {
      elTxtLastUpdate.textContent = 'Última atualização: Sem registros';
    }
  } catch (err) {
    console.error('Erro ao buscar dados:', err);
    alert('Erro ao carregar dados do servidor.');
  }
}

function populateCouponSelect(coupons) {
  const elSel = document.getElementById('sel-active-coupon');
  if (!elSel) return;
  
  elSel.innerHTML = '<option value="">Sem cupom no story</option>';
  
  coupons.forEach(coupon => {
    const opt = document.createElement('option');
    opt.value = coupon.code;
    opt.textContent = `${coupon.code} (${coupon.rules})`;
    elSel.appendChild(opt);
  });
}

async function triggerScraper() {
  showLoading('Buscando ofertas mais recentes no Mercado Livre e atualizando cupons... Isso leva alguns segundos.');
  try {
    const response = await fetch('/api/scrape', { method: 'POST' });
    const data = await response.json();
    
    if (data.error) {
      alert(`Erro: ${data.error}`);
    } else {
      allDeals = data.data.deals || [];
      allCoupons = data.data.coupons || [];
      selectedIndices.clear();
      updateSelectionUI();
      renderDeals(allDeals);
      renderCoupons(allCoupons);
      populateCouponSelect(allCoupons);
      if (data.data.generatedAt) {
        elTxtLastUpdate.textContent = `Última atualização: ${data.data.generatedAt}`;
      }
      alert('Ofertas e cupons atualizados com sucesso!');
    }
  } catch (err) {
    console.error('Erro ao atualizar ofertas:', err);
    alert('Falha ao rodar o minerador de ofertas.');
  } finally {
    hideLoading();
  }
}

async function triggerGenerateStories() {
  const indices = Array.from(selectedIndices);
  if (indices.length === 0) return;
  
  const elSel = document.getElementById('sel-active-coupon');
  const couponCode = elSel ? elSel.value : '';
  
  showLoading(`Gerando ${indices.length} stories... Isso abrirá o Chrome no backend.`);
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedIndices: indices, couponCode: couponCode })
    });
    const data = await response.json();
    
    if (data.error) {
      alert(`Erro ao gerar stories: ${data.error}`);
    } else {
      alert(data.message);
      // Limpa seleções
      selectedIndices.clear();
      updateSelectionUI();
      // Troca para a aba de stories gerados
      switchTab(elTabStories, elPanelStories);
    }
  } catch (err) {
    console.error('Erro ao gerar stories:', err);
    alert('Erro de rede ao disparar geração de stories.');
  } finally {
    hideLoading();
  }
}

async function fetchGeneratedStories() {
  try {
    const response = await fetch('/api/stories');
    const data = await response.json();
    renderStories(data.stories || []);
  } catch (err) {
    console.error('Erro ao listar stories:', err);
  }
}

// ==========================================
// Instagram Publish Functions
// ==========================================
function showProgressModal(title) {
  const modal = document.getElementById('progress-modal');
  const titleEl = document.getElementById('progress-title');
  const logEl = document.getElementById('progress-log');
  const closeBtn = document.getElementById('btn-close-progress');
  const spinner = modal.querySelector('.progress-spinner');

  titleEl.textContent = title;
  logEl.innerHTML = '';
  closeBtn.classList.add('hidden');
  spinner.style.display = 'block';
  modal.classList.remove('hidden');
}

function addProgressLog(message, type = 'info') {
  const logEl = document.getElementById('progress-log');
  const line = document.createElement('div');
  line.className = `progress-line progress-${type}`;
  const icon = type === 'success' ? '\u2705' : type === 'error' ? '\u274c' : type === 'warning' ? '\u26a0\ufe0f' : '\u2139\ufe0f';
  line.textContent = `${icon} ${message}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function finishProgressModal(success) {
  const modal = document.getElementById('progress-modal');
  const closeBtn = document.getElementById('btn-close-progress');
  const spinner = modal.querySelector('.progress-spinner');

  spinner.style.display = 'none';
  closeBtn.classList.remove('hidden');

  if (success) {
    addProgressLog('Processo concluído com sucesso!', 'success');
  } else {
    addProgressLog('Processo finalizado com erros.', 'error');
  }
}

async function publishSingleStory(filename) {
  showProgressModal(`Publicando: ${filename}`);
  addProgressLog(`Iniciando publicação de ${filename}...`);
  addProgressLog('Fazendo upload da imagem no imgBB...');

  try {
    const response = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename })
    });
    const data = await response.json();

    if (data.success) {
      addProgressLog('Upload concluído!', 'success');
      addProgressLog('Container criado na Meta!', 'success');
      addProgressLog('Story publicado no Instagram!', 'success');
      finishProgressModal(true);
    } else {
      addProgressLog(`Erro: ${data.error}`, 'error');
      finishProgressModal(false);
    }
  } catch (err) {
    addProgressLog(`Erro de rede: ${err.message}`, 'error');
    finishProgressModal(false);
  }
}

async function publishAllStories() {
  showProgressModal('Publicando todos os stories no Instagram');
  addProgressLog('Iniciando publicação em lote...');
  addProgressLog('Isso pode levar alguns minutos dependendo do número de stories.');

  try {
    const response = await fetch('/api/publish-all-pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();

    if (data.success) {
      addProgressLog(data.message, 'success');
      finishProgressModal(true);
    } else {
      addProgressLog(`Erro: ${data.error}`, 'error');
      finishProgressModal(false);
    }
  } catch (err) {
    addProgressLog(`Erro de rede: ${err.message}`, 'error');
    finishProgressModal(false);
  }
}

async function triggerAutoRun() {
  const count = 3;

  if (!confirm(`A automação vai selecionar as TOP ${count} ofertas com maior desconto, gerar os stories e publicar no Instagram automaticamente.\n\nDeseja continuar?`)) {
    return;
  }

  showProgressModal('\ud83e\udd16 Automação Inteligente em execução');
  addProgressLog('Analisando ofertas do dia...');
  addProgressLog(`Selecionando as ${count} melhores ofertas não publicadas...`);
  addProgressLog('Gerando imagens dos stories...');
  addProgressLog('Publicando no Instagram...');
  addProgressLog('Este processo pode levar alguns minutos. Aguarde...');

  try {
    const response = await fetch('/api/auto-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count })
    });
    const data = await response.json();

    if (data.success) {
      addProgressLog(data.message, 'success');
      finishProgressModal(true);
      // Atualiza a galeria de stories
      fetchGeneratedStories();
    } else {
      addProgressLog(`Erro: ${data.error}`, 'error');
      if (data.output) addProgressLog(data.output, 'warning');
      finishProgressModal(false);
    }
  } catch (err) {
    addProgressLog(`Erro de rede: ${err.message}`, 'error');
    finishProgressModal(false);
  }
}

// ==========================================
// Rendering Methods
// ==========================================
function renderDeals(deals) {
  elGridDeals.innerHTML = '';
  
  if (deals.length === 0) {
    elGridDeals.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma oferta carregada. Clique em "Atualizar Ofertas" para pesquisar no Mercado Livre.</p>
      </div>
    `;
    return;
  }
  
  deals.forEach((deal, index) => {
    const isSelected = selectedIndices.has(index);
    const card = document.createElement('article');
    card.className = `deal-card ${isSelected ? 'selected' : ''}`;
    card.dataset.index = index;
    
    // Evita o fechamento da tabela MD ao filtrar caracteres problemáticos no título
    const displayTitle = deal.title;
    const ratingText = deal.rating ? `⭐ ${deal.rating.toFixed(1)}` : 'Sem avaliação';

    // Procura cupons compatíveis
    const compatibleCoupons = allCoupons.filter(coupon => {
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
    
    card.innerHTML = `
      <div class="card-checkbox">
        <label class="checkbox-container">
          <input type="checkbox" class="deal-chk" data-index="${index}" ${isSelected ? 'checked' : ''}>
          <span class="checkmark"></span>
        </label>
      </div>
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
      </div>
    `;
    
    // Add Click listener toggling selection on the card
    card.addEventListener('click', (e) => {
      // Ignora se o clique foi direto no checkbox ou em algum link externo (se houver)
      if (e.target.closest('.checkbox-container') || e.target.closest('a')) {
        return;
      }
      
      toggleSelectIndex(index);
    });
    
    // Checkbox custom listener
    const chk = card.querySelector('.deal-chk');
    chk.addEventListener('change', () => {
      toggleSelectIndex(index);
    });
    
    elGridDeals.appendChild(card);
  });
  
  applyFilters();
}

// ==========================================
// Lógica de Filtros e Categorias
// ==========================================
function getProductCategory(title) {
  const t = title.toLowerCase();
  
  // Eletrônicos & Tecnologia
  if (t.includes('tv') || t.includes('smart tv') || t.includes('televisao') || t.includes('televisão') || 
      t.includes('roku') || t.includes('led') || t.includes('dolby') || t.includes('hdmi') || 
      t.includes('hdr') || t.includes('qled') || t.includes('4k') || t.includes('webos') || 
      t.includes('celular') || t.includes('smartphone') || t.includes('samsung') || t.includes('galaxy') || 
      t.includes('motorola') || t.includes('moto') || t.includes('playstation') || t.includes('ps5') || 
      t.includes('tapo') || t.includes('camera') || t.includes('câmera') || t.includes('segurança') || 
      t.includes('wifi') || t.includes('icsee') || t.includes('impressora') || t.includes('elgin')) {
    return 'tecnologia';
  }
  
  // Eletrodomésticos & Utilidades
  if (t.includes('air fryer') || t.includes('fritadeira') || t.includes('barbecue') || 
      t.includes('chaleira') || t.includes('ventilador') || t.includes('britânia') || 
      t.includes('britania') || t.includes('extratora') || t.includes('eletrodoméstico') || 
      t.includes('liquidificador') || t.includes('micro-ondas')) {
    return 'eletrodomesticos';
  }
  
  // Saúde & Suplementos
  if (t.includes('creatina') || t.includes('whey') || t.includes('suplemento') || 
      t.includes('proteina') || t.includes('proteína') || t.includes('bcaa') || 
      t.includes('glutamina') || t.includes('omega') || t.includes('ômega') || 
      t.includes('dark lab') || t.includes('soldiers') || t.includes('growth') ||
      t.includes('termogenico') || t.includes('termogênico') || t.includes('dieta') || 
      t.includes('academia') || t.includes('fitness')) {
    return 'academia_dieta';
  }
  
  // Beleza & Cuidados Pessoais
  if (t.includes('creme') || t.includes('hidratante') || t.includes('cerave') || 
      t.includes('perfume') || t.includes('sabah') || t.includes('maquina') || 
      t.includes('máquina') || t.includes('acabamento') || t.includes('corte') || 
      t.includes('cabelo') || t.includes('kemei') || t.includes('sabonete') || 
      t.includes('shampoo') || t.includes('condicionador') || t.includes('desodorante') || 
      t.includes('barbear') || t.includes('beleza') || t.includes('maquiagem') || 
      t.includes('esmalte')) {
    return 'beleza_higiene';
  }
  
  // Casa & Construção
  if (t.includes('vaso') || t.includes('sanitario') || t.includes('sanitário') || 
      t.includes('tubrax') || t.includes('acoplada') || t.includes('privada') || 
      t.includes('perfurador') || t.includes('solo') || t.includes('trado') || 
      t.includes('gasolina') || t.includes('brocas') || t.includes('ferramenta') || 
      t.includes('construção') || t.includes('reforma') || t.includes('torneira')) {
    return 'casa_construcao';
  }
  
  return 'outros';
}

function findCompatibleDealsForCoupon(coupon, deals) {
  if (!coupon || !coupon.rules || !deals) return [];
  
  const rulesText = coupon.rules.toLowerCase();
  
  // 1. Extrai preço mínimo
  let minPrice = 0;
  const priceMatch = rulesText.match(/(?:r\$\s*|acima de\s+|partir de\s+|mínimas de\s+)([0-9.,]+)/i);
  if (priceMatch) {
    const numStr = priceMatch[1].replace(/\./g, '').replace(',', '.');
    minPrice = parseFloat(numStr) || 0;
  }
  
  return deals.filter(deal => {
    // Valida preço mínimo
    const cleanPriceStr = deal.currentPrice.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const price = parseFloat(cleanPriceStr) || 0;
    
    if (minPrice > 0 && price < minPrice) {
      return false;
    }
    
    // 2. Valida restrições de categorias
    const cat = getProductCategory(deal.title);
    
    const categoryTerms = {
      tecnologia: ['tecnologia', 'celular', 'smartphone', 'tv', 'smart tv', 'ps5', 'game', 'eletrônicos', 'eletronico', 'câmera', 'camera', 'samsung', 'motorola', 'impressora'],
      eletrodomesticos: ['eletrodomésticos', 'eletrodomestico', 'cozinha', 'air fryer', 'fritadeira', 'liquidificador', 'casa', 'ventilador', 'panela'],
      academia_dieta: ['suplementos', 'suplemento', 'whey', 'creatina', 'growth', 'dieta', 'academia', 'esporte', 'fitness', 'treino', 'sports', 'health'],
      beleza_higiene: ['beleza', 'cabelo', 'perfume', 'hidratante', 'creme', 'shampoo', 'higiene', 'pessoal', 'barbear', 'skincare', 'loreal', 'l\'oreal', 'garnier', 'elseve', 'maybelline', 'lola', 'darrow', 'avene', 'avène', 'isdin', 'protetor solar'],
      casa_construcao: ['casa', 'construção', 'construcao', 'ferramenta', 'torneira', 'reforma', 'decoração', 'decoracao', 'utilidades domésticas', 'utilidades domesticas']
    };
    
    let hasCategoryRestriction = false;
    let categoryMatches = false;
    
    for (const [key, terms] of Object.entries(categoryTerms)) {
      const isMentioned = terms.some(term => rulesText.includes(term));
      if (isMentioned) {
        hasCategoryRestriction = true;
        if (cat === key) {
          categoryMatches = true;
        }
      }
    }
    
    if (hasCategoryRestriction && !categoryMatches) {
      return false;
    }
    
    return true;
  });
}

function scrollToProduct(productTitle) {
  // Muda para a aba de ofertas
  elTabDeals.click();
  
  // Preenche a busca com o nome do produto para destacá-lo
  const searchInput = document.getElementById('ipt-filter-name');
  const categorySelect = document.getElementById('sel-filter-category');
  const discountSelect = document.getElementById('sel-filter-discount');
  const dealTypeSelect = document.getElementById('sel-filter-deal-type');
  
  if (searchInput) searchInput.value = productTitle;
  if (categorySelect) categorySelect.value = '';
  if (discountSelect) discountSelect.value = '';
  if (dealTypeSelect) dealTypeSelect.value = '';
  
  applyFilters();
  
  // Rola suavemente até o produto
  setTimeout(() => {
    const card = Array.from(document.querySelectorAll('.deal-card')).find(c => {
      const tEl = c.querySelector('.card-title');
      return tEl && tEl.textContent.trim() === productTitle.trim();
    });
    
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.boxShadow = '0 0 25px rgba(242, 113, 33, 0.4)';
      card.style.borderColor = 'var(--primary-color)';
      setTimeout(() => {
        card.style.boxShadow = '';
        card.style.borderColor = '';
      }, 2000);
    }
  }, 150);
}

function applyFilters() {
  const searchInput = document.getElementById('ipt-filter-name');
  const categorySelect = document.getElementById('sel-filter-category');
  const discountSelect = document.getElementById('sel-filter-discount');
  const dealTypeSelect = document.getElementById('sel-filter-deal-type');
  
  if (!searchInput || !categorySelect) return;
  
  const searchTerm = searchInput.value.toLowerCase().trim();
  const selectedCategory = categorySelect.value;
  const selectedDiscount = discountSelect ? discountSelect.value : '';
  const selectedDealType = dealTypeSelect ? dealTypeSelect.value : '';
  
  const cards = elGridDeals.querySelectorAll('.deal-card');
  let visibleCount = 0;
  
  cards.forEach(card => {
    const idx = parseInt(card.dataset.index, 10);
    const deal = allDeals[idx];
    if (!deal) return;
    
    const matchesSearch = deal.title.toLowerCase().includes(searchTerm);
    const itemCategory = getProductCategory(deal.title);
    const matchesCategory = !selectedCategory || itemCategory === selectedCategory;
    const matchesDiscount = !selectedDiscount || deal.discount >= parseInt(selectedDiscount, 10);
    const matchesDealType = !selectedDealType || deal.dealType === selectedDealType;
    
    if (matchesSearch && matchesCategory && matchesDiscount && matchesDealType) {
      card.classList.remove('hidden-filter');
      visibleCount++;
    } else {
      card.classList.add('hidden-filter');
    }
  });
  
  // Exibe estado vazio se não houver ofertas visíveis após filtragem
  let emptyState = elGridDeals.querySelector('.empty-state-filter');
  if (visibleCount === 0 && allDeals.length > 0) {
    if (!emptyState) {
      emptyState = document.createElement('div');
      emptyState.className = 'empty-state empty-state-filter';
      emptyState.innerHTML = '<p>Nenhum produto corresponde aos filtros aplicados.</p>';
      elGridDeals.appendChild(emptyState);
    }
  } else if (emptyState) {
    emptyState.remove();
  }
  
  updateSelectionUI();
}

function renderCoupons(coupons) {
  elGridCoupons.innerHTML = '';
  
  if (coupons.length === 0) {
    elGridCoupons.innerHTML = `
      <div class="empty-state">
        <p>Nenhum cupom ativo no momento. Adicione cupons manualmente acima.</p>
      </div>
    `;
    return;
  }
  
  coupons.forEach((coupon) => {
    const item = document.createElement('div');
    item.className = 'coupon-ticket';
    
    // Calcula os produtos compatíveis
    const compatibleDeals = findCompatibleDealsForCoupon(coupon, allDeals);
    const compCount = compatibleDeals.length;
    const hasComp = compCount > 0;
    
    // Se o cupom não for compatível com nenhum produto ativo, não exibimos (garante que apenas cupons funcionando ativamente apareçam)
    if (!hasComp) return;

    let compStatusHtml = `
      <div class="coupon-compatible-status status-active">
        🎯 Aplicável em <strong>${compCount}</strong> produtos
      </div>
      <div class="coupon-filter-row">
        <input type="text" class="ipt-mini-filter" placeholder="Filtrar por nome do produto..." title="Filtrar produtos para este cupom">
        <button class="btn-toggle-products" title="Mostrar/Esconder produtos compatíveis">
          <span class="arrow-icon">▼</span>
        </button>
      </div>
      <div class="compatible-products-list hidden">
        <div class="compatible-products-grid"></div>
      </div>
    `;
    
    item.innerHTML = `
      <div class="coupon-info">
        <div class="coupon-code">${coupon.code}</div>
        <div class="coupon-rule">${coupon.rules}</div>
        <div class="coupon-limit">Limite: ${coupon.maxLimit || 'N/A'}</div>
        ${compStatusHtml}
      </div>
      <button class="btn-copy" data-code="${coupon.code}">Copiar Código</button>
    `;
    
    // Se houver produtos compatíveis, gerenciamos o mini-filtro e o toggle
    if (hasComp) {
      const gridContainer = item.querySelector('.compatible-products-grid');
      const listContainer = item.querySelector('.compatible-products-list');
      const toggleBtn = item.querySelector('.btn-toggle-products');
      const arrowIcon = item.querySelector('.arrow-icon');
      const miniFilterInput = item.querySelector('.ipt-mini-filter');
      
      // Renderização dinâmica filtrada
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
          mini.title = 'Clique para ir até este produto';
          
          mini.innerHTML = `
            <img src="${d.image}" alt="">
            <div class="mini-details">
              <span class="mini-title"></span>
              <span class="mini-price"></span>
            </div>
          `;
          
          mini.querySelector('.mini-title').textContent = d.title;
          mini.querySelector('.mini-price').textContent = `${d.currentPrice} (${d.discount}% OFF)`;
          
          mini.addEventListener('click', () => {
            scrollToProduct(d.title);
          });
          
          gridContainer.appendChild(mini);
        });
      };
      
      // Inicializa grid
      updateFilteredGrid();
      
      // Escuta digitação no input do mini-filtro (filtra apenas, sem abrir a gaveta automaticamente)
      if (miniFilterInput) {
        miniFilterInput.addEventListener('input', (e) => {
          const val = e.target.value.trim();
          updateFilteredGrid(val);
        });
      }
      
      // Escuta clique no botão/seta de toggle
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          if (listContainer) {
            const isHidden = listContainer.classList.contains('hidden');
            if (isHidden) {
              listContainer.classList.remove('hidden');
              if (arrowIcon) arrowIcon.textContent = '▲';
              toggleBtn.classList.add('expanded');
            } else {
              listContainer.classList.add('hidden');
              if (arrowIcon) arrowIcon.textContent = '▼';
              toggleBtn.classList.remove('expanded');
            }
          }
        });
      }
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
}

async function addCoupon(code, rules, maxLimit) {
  showLoading('Salvando cupom...');
  try {
    const response = await fetch('/api/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, rules, maxLimit })
    });
    const data = await response.json();
    
    if (data.error) {
      alert(`Erro: ${data.error}`);
    } else {
      document.getElementById('ipt-coupon-code').value = '';
      document.getElementById('ipt-coupon-rules').value = '';
      document.getElementById('ipt-coupon-limit').value = '';
      
      allCoupons = data.coupons || [];
      renderCoupons(allCoupons);
      populateCouponSelect(allCoupons);
      alert('Cupom cadastrado com sucesso!');
    }
  } catch (err) {
    console.error('Erro ao adicionar cupom:', err);
    alert('Erro ao tentar salvar o cupom.');
  } finally {
    hideLoading();
  }
}

async function deleteCoupon(code) {
  showLoading('Removendo cupom...');
  try {
    const response = await fetch(`/api/coupons/${code}`, {
      method: 'DELETE'
    });
    const data = await response.json();
    
    if (data.error) {
      alert(`Erro: ${data.error}`);
    } else {
      allCoupons = data.coupons || [];
      renderCoupons(allCoupons);
      populateCouponSelect(allCoupons);
    }
  } catch (err) {
    console.error('Erro ao excluir cupom:', err);
    alert('Erro ao tentar remover o cupom.');
  } finally {
    hideLoading();
  }
}

function renderStories(stories) {
  elGridStories.innerHTML = '';
  
  if (stories.length === 0) {
    elGridStories.innerHTML = `
      <div class="empty-state">
        <p>Nenhum Story gerado ainda. Selecione ofertas na aba anterior e clique em "Gerar Stories".</p>
      </div>
    `;
    return;
  }
  
  stories.forEach((story) => {
    const card = document.createElement('div');
    card.className = 'story-card';
    
    card.innerHTML = `
      <div class="story-preview-box">
        <img class="story-img" src="${story.url}" alt="${story.filename}" loading="lazy">
        <div class="story-overlay">
          <button class="btn-view-large">Visualizar 🔍</button>
        </div>
      </div>
      <div class="story-footer">
        <span class="story-title" title="${story.filename}">${story.filename}</span>
        <div class="story-actions">
          <a href="${story.url}" download="${story.filename}" class="btn-download-icon">Salvar 📥</a>
          <button class="btn-publish-story-card" data-filename="${story.filename}" title="Publicar este story no Instagram">📸</button>
        </div>
      </div>
    `;
    
    // Modal zoom click
    card.querySelector('.story-preview-box').addEventListener('click', () => {
      openLightbox(story.url, story.filename);
    });

    // Publish single story from card
    card.querySelector('.btn-publish-story-card').addEventListener('click', (e) => {
      e.stopPropagation();
      publishSingleStory(story.filename);
    });
    
    elGridStories.appendChild(card);
  });
}

// ==========================================
// Selection Logic
// ==========================================
function toggleSelectIndex(index) {
  if (selectedIndices.has(index)) {
    selectedIndices.delete(index);
  } else {
    selectedIndices.add(index);
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const cards = elGridDeals.querySelectorAll('.deal-card');
  cards.forEach(card => {
    const idx = parseInt(card.dataset.index, 10);
    const chk = card.querySelector('.deal-chk');
    if (selectedIndices.has(idx)) {
      card.classList.add('selected');
      if (chk) chk.checked = true;
    } else {
      card.classList.remove('selected');
      if (chk) chk.checked = false;
    }
  });

  const count = selectedIndices.size;
  elTxtSelectedCount.textContent = count;
  
  if (count > 0) {
    elBtnGenerateStories.disabled = false;
    elBtnClearSelection.disabled = false;
  } else {
    elBtnGenerateStories.disabled = true;
    elBtnClearSelection.disabled = true;
  }

  // Se todos os visíveis estiverem selecionados, atualiza o checkbox global
  const visibleCards = elGridDeals.querySelectorAll('.deal-card:not(.hidden-filter)');
  if (visibleCards.length > 0) {
    let allVisibleSelected = true;
    visibleCards.forEach(card => {
      const idx = parseInt(card.dataset.index, 10);
      if (!selectedIndices.has(idx)) {
        allVisibleSelected = false;
      }
    });
    elChkSelectAll.checked = allVisibleSelected;
  } else {
    elChkSelectAll.checked = false;
  }
}

// ==========================================
// Lightbox Preview Actions
// ==========================================
function openLightbox(imageUrl, title) {
  elImgLightboxPreview.src = imageUrl;
  elBtnDownloadStory.href = imageUrl;
  elBtnDownloadStory.download = title;
  
  // Setup publish button in lightbox
  const publishBtn = document.getElementById('btn-publish-single');
  if (publishBtn) {
    publishBtn.dataset.filename = title;
  }
  
  elLightboxModal.classList.remove('hidden');
  elLightboxModal.setAttribute('aria-hidden', 'false');
}

function closeLightbox() {
  elLightboxModal.classList.add('hidden');
  elLightboxModal.setAttribute('aria-hidden', 'true');
  elImgLightboxPreview.src = '';
}

// ==========================================
// Tabs Management
// ==========================================
function switchTab(activeBtn, activePanel) {
  // Desativa todas
  [elTabDeals, elTabCoupons, elTabStories].forEach(btn => btn.classList.remove('active'));
  [elPanelDeals, elPanelCoupons, elPanelStories].forEach(panel => panel.classList.remove('active'));
  
  // Ativa a selecionada
  activeBtn.classList.add('active');
  activePanel.classList.add('active');
  
  // Ações adicionais baseadas na aba
  if (activeBtn === elTabStories) {
    fetchGeneratedStories();
  }
}

// ==========================================
// Event Listeners & Init
// ==========================================
function init() {
  // Tab change triggers
  elTabDeals.addEventListener('click', () => switchTab(elTabDeals, elPanelDeals));
  elTabCoupons.addEventListener('click', () => switchTab(elTabCoupons, elPanelCoupons));
  elTabStories.addEventListener('click', () => switchTab(elTabStories, elPanelStories));

  // Scraper action trigger
  elBtnUpdateDeals.addEventListener('click', triggerScraper);
  
  // Generate action trigger
  elBtnGenerateStories.addEventListener('click', triggerGenerateStories);

  // Checkbox Select All Toggle (age apenas nos cards visíveis)
  elChkSelectAll.addEventListener('change', () => {
    const visibleCards = elGridDeals.querySelectorAll('.deal-card:not(.hidden-filter)');
    if (elChkSelectAll.checked) {
      visibleCards.forEach(card => {
        const idx = parseInt(card.dataset.index, 10);
        selectedIndices.add(idx);
      });
    } else {
      visibleCards.forEach(card => {
        const idx = parseInt(card.dataset.index, 10);
        selectedIndices.delete(idx);
      });
    }
    updateSelectionUI();
  });

  // Filtros de busca (nome, categoria e desconto)
  const elFilterName = document.getElementById('ipt-filter-name');
  const elFilterCategory = document.getElementById('sel-filter-category');
  const elFilterDiscount = document.getElementById('sel-filter-discount');
  
  if (elFilterName) {
    elFilterName.addEventListener('input', applyFilters);
  }
  if (elFilterCategory) {
    elFilterCategory.addEventListener('change', applyFilters);
  }
  if (elFilterDiscount) {
    elFilterDiscount.addEventListener('change', applyFilters);
  }
  const elFilterDealType = document.getElementById('sel-filter-deal-type');
  if (elFilterDealType) {
    elFilterDealType.addEventListener('change', applyFilters);
  }

  // Clear Selection click
  elBtnClearSelection.addEventListener('click', () => {
    selectedIndices.clear();
    updateSelectionUI();
  });

  // Lightbox Close
  elBtnCloseLightbox.addEventListener('click', closeLightbox);
  elLightboxModal.addEventListener('click', (e) => {
    if (e.target === elLightboxModal) {
      closeLightbox();
    }
  });

  // Publish single from lightbox
  const elBtnPublishSingle = document.getElementById('btn-publish-single');
  if (elBtnPublishSingle) {
    elBtnPublishSingle.addEventListener('click', () => {
      const filename = elBtnPublishSingle.dataset.filename;
      if (filename) {
        closeLightbox();
        publishSingleStory(filename);
      }
    });
  }

  // Publish all stories button
  const elBtnPublishAll = document.getElementById('btn-publish-all');
  if (elBtnPublishAll) {
    elBtnPublishAll.addEventListener('click', () => {
      if (confirm('Deseja publicar TODOS os stories gerados no Instagram?')) {
        publishAllStories();
      }
    });
  }

  // Auto Run button
  const elBtnAutoRun = document.getElementById('btn-auto-run');
  if (elBtnAutoRun) {
    elBtnAutoRun.addEventListener('click', triggerAutoRun);
  }

  // Fetch initial content
  fetchDeals();
}

// Start application
init();
