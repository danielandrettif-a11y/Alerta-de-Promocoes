const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to perform HTTP GET request
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Handle redirection
        const redirectUrl = new URL(res.headers.location, url).toString();
        return resolve(fetchHtml(redirectUrl));
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch: ${res.statusCode} - ${res.statusMessage}`));
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#224;/g, 'à')
    .replace(/&#225;/g, 'á')
    .replace(/&#226;/g, 'â')
    .replace(/&#227;/g, 'ã')
    .replace(/&#231;/g, 'ç')
    .replace(/&#233;/g, 'é')
    .replace(/&#234;/g, 'ê')
    .replace(/&#237;/g, 'í')
    .replace(/&#243;/g, 'ó')
    .replace(/&#244;/g, 'ô')
    .replace(/&#245;/g, 'õ')
    .replace(/&#250;/g, 'ú')
    .replace(/&#193;/g, 'Á')
    .replace(/&#201;/g, 'É')
    .replace(/&#205;/g, 'Í')
    .replace(/&#211;/g, 'Ó')
    .replace(/&#218;/g, 'Ú')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function scrapeLiveCoupons() {
  console.log("Buscando cupons ativos na Cuponomia...");
  const scraped = [];
  try {
    const html = await fetchHtml('https://www.cuponomia.com.br/desconto/mercado-livre');
    const liSplits = html.split('<li');
    
    liSplits.forEach(li => {
      if (li.includes('item-code') && !li.includes('expired-item')) {
        // Código do cupom
        const codeMatch = li.match(/class="[^"]*js-itemCode[^"]*"[^>]*>([^<]+)/i);
        if (!codeMatch) return;
        const code = codeMatch[1].trim().toUpperCase();
        
        // Título/Regra
        const titleMatch = li.match(/class="[^"]*js-itemTitle[^"]*"[^>]*>([\s\S]*?)<\/h3>/i) || 
                           li.match(/class="[^"]*js-itemTitle[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        let rules = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : 'Desconto Especial';
        
        // Limite e termos adicionais
        let maxLimit = 'N/A';
        const descMatch = li.match(/class="item-desc"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
          const descText = descMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
          rules += ` - ${descText}`;
          
          const limitMatch = descText.match(/(?:máximo|limite|limitação) de (R\$\s*\d+)/i);
          if (limitMatch) {
            maxLimit = limitMatch[1];
          }
        }
        
        if (code && code.length >= 4) {
          scraped.push({
            code,
            rules: decodeHtmlEntities(rules).substring(0, 150),
            maxLimit
          });
        }
      }
    });
    console.log(`Sucesso: Puxamos ${scraped.length} cupons ativos da Cuponomia.`);
  } catch (err) {
    console.error("Falha ao puxar cupons na Cuponomia:", err.message);
  }
  return scraped;
}

async function main() {
  // Simple .env parser to read config
  const envVars = { ...process.env };
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      line = line.strip ? line.strip() : line.trim();
      if (line && !line.startsWith('#')) {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim();
          envVars[key] = val;
        }
      }
    });
  }

  // Configurations
  const minDiscount = parseInt(envVars['MIN_DISCOUNT'] || '30', 10);
  const maxProducts = parseInt(envVars['MAX_PRODUCTS'] || '10', 10);
  const outputPath = envVars['OUTPUT_PATH'] || 'mercado_livre_deals_report.md';

  console.log("Mercado Livre Daily Deals & Coupons Automation");
  console.log("-----------------------------------------------");
  console.log(`Config: Min Discount: ${minDiscount}%, Max Products to Output: ${maxProducts}`);
  console.log("Fetching live deals page...");

  try {
    const products = [];
    let page = 1;
    const maxPages = 8;

  while (page <= maxPages) {
    console.log(`Fetching live deals page ${page}...`);
    const url = page === 1 
      ? 'https://www.mercadolivre.com.br/ofertas' 
      : `https://www.mercadolivre.com.br/ofertas?page=${page}`;

    try {
      const html = await fetchHtml(url);
      const cards = html.split('class="andes-card poly-card');

      if (cards.length <= 1) {
        console.log(`No more products found on page ${page}. Ending pagination.`);
        break;
      }

      let pageProductsCount = 0;
      for (let i = 1; i < cards.length; i++) {
        const card = cards[i];

        const titleLinkMatch = card.match(/<h3 class="poly-component__title-wrapper"[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!titleLinkMatch) continue;
        const link = titleLinkMatch[1].split('#')[0]; // Clean query anchors
        const title = titleLinkMatch[2].replace(/<[^>]*>/g, '').trim();

        const imgMatch = card.match(/<img class="poly-component__picture"[^>]*src="([^"]+)"/i);
        const image = imgMatch ? imgMatch[1] : '';

        const ratingMatch = card.match(/Classificação\s+([0-9.]+)\s+de\s+5\s+estrelas\.\s*([^<]*)/i);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
        const salesInfo = ratingMatch ? ratingMatch[2].trim() : 'N/A';

        const discountMatch = card.match(/([0-9]+)%\s*OFF/i);
        const discount = discountMatch ? parseInt(discountMatch[1], 10) : 0;

        const pricePart = card.split('poly-component__price')[1] || '';
        let originalPrice = 'N/A';
        let currentPrice = 'N/A';

        if (pricePart) {
          const currentSplit = pricePart.split('poly-price__current');
          const prevPart = currentSplit[0];
          const currPart = currentSplit[1] || '';

          if (prevPart.includes('andes-money-amount--previous')) {
            const origFractionMatch = prevPart.match(/class="andes-money-amount__fraction"[^>]*>([^<]+)/);
            const origCentsMatch = prevPart.match(/class="andes-money-amount__cents"[^>]*>([^<]+)/);
            if (origFractionMatch) {
              originalPrice = `R$ ${origFractionMatch[1].trim()}`;
              if (origCentsMatch) {
                originalPrice += `,${origCentsMatch[1].trim()}`;
              }
            }
          }

          const currFractionMatch = currPart.match(/class="andes-money-amount__fraction"[^>]*>([^<]+)/);
          const currCentsMatch = currPart.match(/class="andes-money-amount__cents"[^>]*>([^<]+)/);
          if (currFractionMatch) {
            currentPrice = `R$ ${currFractionMatch[1].trim()}`;
            if (currCentsMatch) {
              currentPrice += `,${currCentsMatch[1].trim()}`;
            }
          } else {
            const fallbackFractionMatch = pricePart.match(/class="andes-money-amount__fraction"[^>]*>([^<]+)/);
            if (fallbackFractionMatch) {
              currentPrice = `R$ ${fallbackFractionMatch[1].trim()}`;
            }
          }
        }

        const isFull = card.includes('alt="Full"') || card.includes('aria-label="Full"') || card.toLowerCase().includes('svg-icon-full') || card.toLowerCase().includes('poly-component__icon');
        const isFreeShipping = card.toLowerCase().includes('frete grátis') || card.toLowerCase().includes('frete gratis');

        let dealType = 'Ofertas de Campanha';
        if (card.toLowerCase().includes('relâmpago') || card.toLowerCase().includes('relampago')) {
          dealType = 'Oferta Relâmpago';
        } else if (card.toLowerCase().includes('oferta do dia')) {
          dealType = 'Oferta do Dia';
        }

        let timeLeft = '';
        if (card.toLowerCase().includes('acaba hoje')) {
          timeLeft = 'Acaba hoje';
        } else {
          const timeLeftMatch = card.match(/Acaba em\s*([^<]+)/i);
          if (timeLeftMatch) {
            timeLeft = `Acaba em ${timeLeftMatch[1].trim()}`;
          }
        }

        products.push({
          title,
          link,
          image,
          rating,
          salesInfo,
          discount,
          originalPrice,
          currentPrice,
          isFull,
          isFreeShipping,
          dealType,
          timeLeft
        });
        pageProductsCount++;
      }

      console.log(`Page ${page}: parsed ${pageProductsCount} products.`);
      if (pageProductsCount === 0) {
        break;
      }

      page++;
      await new Promise(r => setTimeout(r, 1000));

    } catch (fetchErr) {
      console.error(`Error fetching page ${page}:`, fetchErr.message);
      break;
    }
  }

    console.log(`Found ${products.length} products total.`);

    // Filter and Sort: Best rated first (4.5+), then highest discount, with at least minDiscount
    const filteredProducts = products.filter(p => p.discount >= minDiscount);
    
    // Sort logic: Rating descending, then discount descending
    const sortedProducts = filteredProducts.sort((a, b) => {
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      return b.discount - a.discount;
    });

    const topDeals = sortedProducts.slice(0, maxProducts);

    // Active Coupons Database (Retrieved dynamically from coupons.json)
    const couponsPath = path.join(__dirname, '..', 'coupons.json');
    let coupons = [];

    // Busca os cupons ativos em tempo real da internet
    console.log("Buscando cupons reais da web...");
    const liveCoupons = await scrapeLiveCoupons();
    
    // Mantém apenas os cupons raspados ativos (sem cupons manuais)
    coupons = liveCoupons || [];

    if (coupons.length === 0) {
      coupons = [
        { code: 'QUEROOFF', rules: '10% OFF em seus pedidos com cupom Mercado Livre - Para compras acima de R$79', maxLimit: 'R$ 60' },
        { code: 'MEUSMIMOS', rules: 'Ganhe 15% OFF com cupom Mercado Livre - Para compras acima de R$79', maxLimit: 'R$ 60' }
      ];
    }
    
    try {
      fs.writeFileSync(couponsPath, JSON.stringify(coupons, null, 2), 'utf-8');
      console.log(`Base de cupons atualizada: total de ${coupons.length} cupons ativos.`);
    } catch (e) {
      console.error('Erro ao gravar coupons.json no scraper:', e);
    }


    // Build markdown report
    const nowStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' ' + 
                   new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    let reportMarkdown = `# 🛍️ Mercado Livre: Melhores Ofertas e Cupons do Dia

Relatório gerado em: **${nowStr}** (Horário de Brasília)

---

## 🎟️ Cupons de Desconto Ativos hoje

Use esses códigos no checkout do carrinho de compras para obter descontos adicionais:

| Código do Cupom | Regra / Condição de Uso | Limite Máximo de Desconto |
| :--- | :--- | :--- |
${coupons.map(c => `| **${c.code}** | ${c.rules} | ${c.maxLimit} |`).join('\n')}

> [!TIP]
> Lembre-se de que os cupons do Mercado Livre têm limites de ativação por dia e mudam rapidamente. Teste-os diretamente no pagamento antes de concluir a compra!

---

## 🏆 Melhores Produtos Ranqueados com Desconto (mínimo ${minDiscount}% OFF)

Ordenados por **Avaliação (Estrelas)** e depois por **Percentual de Desconto**.

| Rank | Produto | Avaliação | Desconto | Preço Atual | Preço Original | Vendas / Info | Link |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- | :--- |
`;

    topDeals.forEach((p, idx) => {
      const ratingStars = p.rating ? `⭐ **${p.rating}**` : 'N/A';
      const cleanTitle = p.title.replace(/[|]/g, '-'); // prevent markdown table break
      reportMarkdown += `| ${idx + 1} | ${cleanTitle} | ${ratingStars} | **${p.discount}% OFF** | **${p.currentPrice}** | ${p.originalPrice} | ${p.salesInfo} | [Ver Oferta](${p.link}) |\n`;
    });

    if (topDeals.length === 0) {
      reportMarkdown += `| - | Nenhum produto encontrado com desconto mínimo de ${minDiscount}% e avaliação relevante. | - | - | - | - | - | - |\n`;
    }

    const absoluteOutputPath = path.isAbsolute(outputPath) ? outputPath : path.join(__dirname, '..', outputPath);
    fs.writeFileSync(absoluteOutputPath, reportMarkdown, 'utf-8');

    // Salva o JSON estruturado para consumo por outros scripts (ex: gerador de stories)
    const jsonOutputPath = absoluteOutputPath.replace(/\.md$/, '.json');
    const jsonData = {
      generatedAt: nowStr,
      coupons: coupons,
      deals: topDeals
    };
    fs.writeFileSync(jsonOutputPath, JSON.stringify(jsonData, null, 2), 'utf-8');

    console.log(`Success! Report written to ${outputPath} and JSON written to ${path.basename(jsonOutputPath)}`);
  } catch (err) {
    console.error(`Error executing automation: ${err.message}`);
    process.exit(1);
  }
}

main();
