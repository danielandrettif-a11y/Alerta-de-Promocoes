const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const urlModule = require('url');
const { exec, execSync } = require('child_process');
const { TAXONOMY, inferCategoryAndSub } = require('./execution/category_helper.js');

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

// Middleware para JSON com limite aumentado para aceitar imagens em Base64 do Canvas
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const mlDealsReportPath = path.join(__dirname, 'mercado_livre_deals_report.json');
const amazonDealsReportPath = path.join(__dirname, 'amazon_deals_report.json');
const couponsPath = path.join(__dirname, 'coupons.json');
const historyPath = path.join(__dirname, '.tmp', 'published_history.json');
const GROUP_NAME = 'Alerta de Descontos';

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

// Conecta ao WhatsApp Web uma única vez de forma global no servidor
console.log('[Painel Web] Inicializando conexão persistente com o WhatsApp Web...');
const whatsapp = require('./execution/whatsapp_client.js');

// ID determinístico para ofertas
function generateDealId(deal) {
  const base = `${deal.title}_${deal.currentPrice}_${deal.discount}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = ((hash << 5) - hash) + base.charCodeAt(i);
    hash |= 0;
  }
  return `deal_${Math.abs(hash)}`;
}

// Inferência de Categoria e Subcategoria via Helper unificado
function inferCategory(title) {
  const info = inferCategoryAndSub(title);
  return `${info.icon} ${info.category} > ${info.subcategory}`;
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
    generatedAt
  });
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
    generatedAt
  });
});

// POST /api/scrape - Dispara scraping do Mercado Livre + Cupons (concorrente)
app.post('/api/scrape', (req, res) => {
  console.log('Disparando scraper de ofertas do Mercado Livre e Cupons...');
  exec('node execution/mercado_livre_deals.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Erro no scraping do ML: ${error.message}`);
      return res.status(500).json({ error: `Falha ao atualizar ofertas do ML: ${error.message}` });
    }
    
    console.log('Scraping do ML e Cupons concluído!');
    try {
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
          generatedAt: parsedData.generatedAt || null
        }
      });
    } catch (e) {
      res.status(500).json({ error: 'Scraping concluído, mas erro ao ler os resultados.' });
    }
  });
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
          generatedAt: parsedData.generatedAt || null
        }
      });
    } catch (e) {
      res.status(500).json({ error: 'Scraping da Amazon concluído, mas erro ao ler resultados.' });
    }
  });
});

// GET /api/proxy-image - Proxy para baixar imagens de domínios externos e evitar problemas de CORS no Canvas
app.get('/api/proxy-image', (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('URL da imagem é necessária.');
  }

  function downloadImage(url, responseStream, redirectCount = 0) {
    if (redirectCount > 5) {
      return responseStream.status(500).send('Excesso de redirecionamentos no proxy de imagem.');
    }

    try {
      const parsedUrl = urlModule.parse(url);
      const clientHttp = parsedUrl.protocol === 'https:' ? https : http;

      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      };

      clientHttp.get(url, options, (imageRes) => {
        // Trata redirecionamentos (301, 302, 307, 308)
        if (imageRes.statusCode >= 300 && imageRes.statusCode < 400 && imageRes.headers.location) {
          let redirectUrl = imageRes.headers.location;
          if (!redirectUrl.startsWith('http')) {
            redirectUrl = urlModule.resolve(url, redirectUrl);
          }
          return downloadImage(redirectUrl, responseStream, redirectCount + 1);
        }

        if (imageRes.statusCode !== 200) {
          return responseStream.status(imageRes.statusCode).send(`Falha ao baixar imagem no proxy. Status: ${imageRes.statusCode}`);
        }
        
        responseStream.setHeader('Content-Type', imageRes.headers['content-type'] || 'image/jpeg');
        responseStream.setHeader('Access-Control-Allow-Origin', '*');
        imageRes.pipe(responseStream);
      }).on('error', (err) => {
        console.error('Erro no proxy de imagem:', err.message);
        responseStream.status(500).send('Erro ao baixar imagem via proxy.');
      });
    } catch (err) {
      responseStream.status(500).send('Erro de sintaxe de URL no proxy.');
    }
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

// GET /api/compare-price - Consulta o menor preço de um produto no Buscapé/Zoom/Bondfaro on-the-fly
app.get('/api/compare-price', async (req, res) => {
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

// POST /api/generate - Recebe as ofertas prontas e imagens do Canvas, envia para o WhatsApp de forma síncrona e retorna os IDs das mensagens
app.post('/api/generate', async (req, res) => {
  const { selectedDeals } = req.body; // Array de objetos contendo dados da oferta + imagem base64
  
  if (!Array.isArray(selectedDeals) || selectedDeals.length === 0) {
    return res.status(400).json({ error: 'Nenhuma oferta selecionada para envio.' });
  }

  console.log(`\n📤 [Painel Web] Iniciando envio manual de ${selectedDeals.length} ofertas via Canvas para o WhatsApp...`);
  const tempDir = path.join(__dirname, '.tmp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const results = [];

  try {
    for (let i = 0; i < selectedDeals.length; i++) {
      const deal = selectedDeals[i];
      console.log(`📦 Processando envio [${i + 1}/${selectedDeals.length}]: ${deal.title.substring(0, 40)}...`);

      let tempImagePath = null;

      // Converte Base64 do Canvas para arquivo de imagem temporário
      if (deal.imageBuffer && deal.imageBuffer.startsWith('data:image')) {
        try {
          const base64Data = deal.imageBuffer.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, 'base64');
          tempImagePath = path.join(tempDir, `canvas_story_temp_${Date.now()}_${i}.jpg`);
          fs.writeFileSync(tempImagePath, buffer);
        } catch (err) {
          console.error(`   ❌ Falha ao converter imagem do Canvas para buffer: ${err.message}`);
        }
      }

      // Prepara mensagem de legenda formatada
      const platformTag = deal.platform === 'amazon' ? '🟡 *AMAZON*' : '🛍️ *MERCADO LIVRE*';
      const category = inferCategory(deal.title);
      
      // Injeta estatísticas do comparador se houver
      let comparisonText = '';
      if (deal.comparison && deal.comparison.priceText) {
        const cleanCurrentPriceStr = deal.currentPrice.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
        const currentPriceVal = parseFloat(cleanCurrentPriceStr) || 0;
        const compPriceVal = deal.comparison.minPrice || 0;
        
        comparisonText = `\n\n📊 *Comparador de Preços (Buscapé):*\n• Menor preço no mercado: *${deal.comparison.priceText}*`;
        
        if (currentPriceVal > 0 && compPriceVal > 0) {
          const diff = compPriceVal - currentPriceVal;
          const tolerance = currentPriceVal * 0.02; // tolerância de 2%
          
          if (diff > tolerance) {
            comparisonText += `\n• Economia Real nesta oferta: *R$ ${diff.toFixed(2).replace('.', ',')}*! 📉`;
            comparisonText += `\n• Status: ✅ *Desconto Comprovado!*`;
          } else if (diff < -tolerance) {
            comparisonText += `\n• Status: ⚠️ *Alerta:* Encontrado mais barato no mercado!`;
          } else {
            comparisonText += `\n• Status: ⚖️ *Preço Equivalente ao mercado*`;
          }
        }
      }
      
      const wppMessage = `🔥 *OFERTA ENCONTRADA!* \n\n*${deal.title}*\n\n🔥 *${deal.discount}% OFF*\nDe: ~~${deal.originalPrice}~~\nPor: *${deal.currentPrice}*${comparisonText}\n\n👉 *Compre pelo link:* ${deal.link}\n\n📌 _Categoria: ${category}_\nPlataforma: ${platformTag}`;

      // Envia via WhatsApp Web
      let msgId = null;
      let sentSuccess = false;
      if (whatsapp && whatsapp.client.info) {
        try {
          msgId = await whatsapp.sendOffer(GROUP_NAME, wppMessage, tempImagePath);
          console.log(`   ✅ Oferta postada com sucesso! MsgID: ${msgId}`);
          sentSuccess = true;
        } catch (wppErr) {
          console.error(`   ❌ Erro ao enviar para o WhatsApp: ${wppErr.message}`);
        }
      } else {
        console.warn(`   ⚠️ WhatsApp desconectado ou indisponível no servidor.`);
      }

      // Remove arquivo temporário se gerado
      if (tempImagePath && fs.existsSync(tempImagePath)) {
        try {
          fs.unlinkSync(tempImagePath);
        } catch (e) {}
      }

      // Registra no histórico de publicados
      const dealId = `deal_${Math.abs(deal.title.length + deal.discount)}`;
      if (sentSuccess && msgId) {
        try {
          let history = { publishedIds: [], entries: [] };
          if (fs.existsSync(historyPath)) {
            history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
          }
          history.publishedIds.push(dealId);
          history.entries.push({
            dealId,
            title: deal.title.substring(0, 80),
            discount: deal.discount,
            price: deal.currentPrice,
            affiliateLink: deal.link,
            publishedAt: new Date().toISOString(),
            msgId: msgId,
            source: 'manual'
          });
          fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
        } catch (histErr) {
          console.error('   ❌ Falha ao gravar histórico local:', histErr.message);
        }
      }

      results.push({
        dealId,
        title: deal.title,
        success: sentSuccess,
        msgId: msgId
      });

      // Aguarda intervalo curto entre envios para estabilidade
      if (i < selectedDeals.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    res.json({
      success: true,
      message: `Processamento de ${selectedDeals.length} ofertas concluído!`,
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
            const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
            
            // Acha a entrada correspondente no histórico
            const entryIndex = history.entries.findIndex(e => e.msgId === msgId);
            if (entryIndex !== -1) {
              const entry = history.entries[entryIndex];
              
              // Remove o ID da lista de publishedIds
              history.publishedIds = history.publishedIds.filter(id => id !== entry.dealId);
              // Remove a entrada da lista de entries
              history.entries.splice(entryIndex, 1);
              
              fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
              console.log(`   ✅ [API Excluir] ID ${entry.dealId} removido do histórico de publicados.`);
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
  if (!fs.existsSync(historyPath)) {
    return res.json({ publishedIds: [], entries: [] });
  }
  try {
    const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    res.json(data);
  } catch (err) {
    res.json({ publishedIds: [], entries: [] });
  }
});

// =======================================================================
// 🤖 CICLO AUTOMÁTICO DE POSTAGENS (Pronto no código para ativação fácil)
// =======================================================================
async function runAutomaticCycle() {
  const env = readEnv();
  const autoEnabled = env['AUTO_RUN_ENABLED'] === 'true';

  if (!autoEnabled) {
    console.log(`⏰ [${new Date().toLocaleTimeString('pt-BR')}] Ciclo automático pulado (AUTO_RUN_ENABLED=false).`);
    return;
  }

  const limit = parseInt(env['DAILY_WPP_POSTS_LIMIT'] || '30', 10);
  const maxPerCycle = parseInt(env['MAX_POSTS_PER_CYCLE'] || '2', 10);

  console.log(`\n⏰ [${new Date().toLocaleTimeString('pt-BR')}] Executando ciclo automático de ofertas...`);

  // Varredura concorrente
  try {
    execSync('node execution/mercado_livre_deals.js', { cwd: __dirname, stdio: 'ignore' });
    execSync('node execution/amazon_deals.js', { cwd: __dirname, stdio: 'ignore' });
  } catch (e) {
    console.warn('⚠️ Falha ao rodar scrapers no ciclo automático. Usando dados existentes...');
  }

  // Carrega e mescla ofertas
  let history = { publishedIds: [], entries: [] };
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch (e) {}
  }

  const todayStr = new Date().toISOString().substring(0, 10);
  const autoPostsToday = (history.entries || []).filter(entry => {
    if (entry.source !== 'auto') return false;
    const pubDateStr = new Date(entry.publishedAt).toISOString().substring(0, 10);
    return pubDateStr === todayStr;
  }).length;

  if (autoPostsToday >= limit) {
    console.log(`⚠️ Limite de postagens automáticas (${limit}) atingido hoje.`);
    return;
  }

  const postsToSend = Math.min(maxPerCycle, limit - autoPostsToday);
  if (postsToSend <= 0) return;

  // Unifica e filtra ofertas
  let deals = [];
  if (fs.existsSync(mlDealsReportPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(mlDealsReportPath, 'utf-8'));
      if (data.deals) deals = deals.concat(data.deals.map(d => ({ ...d, platform: 'mercado_livre' })));
    } catch(e) {}
  }
  if (fs.existsSync(amazonDealsReportPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(amazonDealsReportPath, 'utf-8'));
      if (data.deals) deals = deals.concat(data.deals.map(d => ({ ...d, platform: 'amazon' })));
    } catch(e) {}
  }

  const publishedIdsSet = new Set(history.publishedIds || []);
  const pending = deals
    .map(d => ({ ...d, dealId: `deal_${Math.abs(d.title.length + d.discount)}` }))
    .filter(d => !publishedIdsSet.has(d.dealId))
    .sort((a, b) => b.discount - a.discount);

  const selected = pending.slice(0, postsToSend);

  for (const deal of selected) {
    const dealId = `wpp_auto_${Math.abs(deal.title.length + deal.discount)}`;
    const singleSelectionPath = path.join(__dirname, '.tmp', `wpp_single_deal_${dealId}.json`);
    const storiesDir = path.join(__dirname, 'stories');

    try {
      // Gera a imagem no backend com o Puppeteer de fallback para ciclos automáticos
      const tempSelectionData = {
        generatedAt: new Date().toISOString(),
        deals: [{ ...deal, link: deal.link }],
        selectedCoupon: null
      };
      fs.writeFileSync(singleSelectionPath, JSON.stringify(tempSelectionData, null, 2), 'utf-8');

      if (fs.existsSync(storiesDir)) {
        fs.readdirSync(storiesDir)
          .filter(f => f.endsWith('.jpg'))
          .forEach(f => {
            try { fs.unlinkSync(path.join(storiesDir, f)); } catch (e) {}
          });
      }

      execSync(`node execution/generate_stories.js "${singleSelectionPath}"`, {
        cwd: __dirname,
        stdio: 'ignore'
      });

      fs.unlinkSync(singleSelectionPath);

      const generatedFiles = fs.readdirSync(storiesDir).filter(f => f.endsWith('.jpg'));
      if (generatedFiles.length > 0) {
        const storyImagePath = path.join(storiesDir, generatedFiles[0]);
        const platformTag = deal.platform === 'amazon' ? '🟡 *AMAZON*' : '🛍️ *MERCADO LIVRE*';
        const category = inferCategory(deal.title);
        const wppMessage = `🔥 *OFERTA ENCONTRADA!* \n\n*${deal.title}*\n\n🔥 *${deal.discount}% OFF*\nDe: ~~${deal.originalPrice}~~\nPor: *${deal.currentPrice}*\n\n👉 *Compre pelo link:* ${deal.link}\n\n📌 _Categoria: ${category}_\nPlataforma: ${platformTag}`;

        const msgId = await whatsapp.sendOffer(GROUP_NAME, wppMessage, storyImagePath);
        console.log(`   ✅ Oferta automática postada: ${deal.title.substring(0, 30)}`);

        history.publishedIds.push(deal.dealId);
        history.entries.push({
          dealId: deal.dealId,
          title: deal.title.substring(0, 80),
          discount: deal.discount,
          price: deal.currentPrice,
          affiliateLink: deal.link,
          publishedAt: new Date().toISOString(),
          msgId: msgId,
          source: 'auto'
        });
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
      }
    } catch (err) {
      console.error(`Erro ao postar automático: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }
}

// Inicia servidor Express e escuta na porta
app.listen(PORT, HOST, () => {
  console.log(`=================================================`);
  console.log(` Dashboard rodando em http://${HOST}:${PORT}`);
  console.log(`=================================================`);

  // Configura ciclos automáticos periódicos (desativados por padrão via env)
  setTimeout(async () => {
    try {
      await runAutomaticCycle();
    } catch (e) {}

    const env = readEnv();
    const minutes = parseInt(env['AUTO_RUN_INTERVAL_MINUTES'] || '30', 10);
    setInterval(async () => {
      try {
        await runAutomaticCycle();
      } catch (e) {}
    }, minutes * 60 * 1000);
  }, 15000);
});
