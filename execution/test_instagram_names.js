const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// Caminhos comuns do Chrome e Edge no Windows
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

function getExecutablePath() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

// Lista de nomes para testar (focados em promoções, Mercado Livre, Shopee e Achados)
const USERNAME_CANDIDATES = [
  'radar.livre',
  'garimpo.livre',
  'achados.livres',
  'radar.achados',
  'livre.ofertas',
  'garimpando.ofertas',
  'alerta.achados.br',
  'garimpo.shopp',
  'promos.no.radar',
  'super.promos.br',
  'desconto.livre',
  'radar.cupons',
  'garimpos.express',
  'click.ofertas.br',
  'livredescontos',
  'megagarimpos',
  'achadosdolivre',
  'garimposdolivre',
  'radar.shopp',
  'achados.shopp',
  'alerta.livre',
  'achadinhos.livre',
  'radar.de.cupons',
  'ofertas.livres',
  'garimpos.shopp'
];

// Algoritmo de ranking/scoring
function calculateScore(username) {
  let score = 0;
  
  // 1. Comprimento do nome (mais curto = melhor)
  const len = username.length;
  if (len <= 12) {
    score += 30;
  } else if (len <= 18) {
    score += 20;
  } else {
    score += 10;
  }

  // 2. Caracteres Especiais
  const specCount = (username.match(/[._]/g) || []).length;
  if (specCount === 0 || specCount === 1) {
    score += 20;
  } else if (specCount === 2) {
    score += 10;
  } else {
    score += 5;
  }
  
  // Evitar consecutivos
  if (/[._]{2,}/.test(username)) {
    score -= 15;
  }

  // 3. Força do Tema
  const strongKeywords = ['livre', 'radar', 'garimpo', 'achados', 'cupons', 'achadinhos'];
  const hasStrongKeyword = strongKeywords.some(kw => username.toLowerCase().includes(kw));
  if (hasStrongKeyword) {
    score += 30;
  } else {
    score += 15;
  }

  // 4. Criatividade e Sonoridade (Bonus Manual/Regra de Ouro)
  // Palavras com ritmo sonoro rápido ganham bonus
  if (username.startsWith('radar') || username.startsWith('alerta') || username.startsWith('garimpo')) {
    score += 20;
  } else {
    score += 10;
  }

  return score;
}

async function verifyUsername(page, username) {
  const url = `https://www.instagram.com/${username}/`;
  console.log(`Verificando: @${username}...`);
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Pequeno delay para garantir que scripts do IG rodem e atualizem a URL/DOM
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const finalUrl = page.url();
    const title = await page.title();
    const content = await page.content();
    
    // 1. Se redirecionou para a página de login, o perfil existe e está ocupado
    if (finalUrl.includes('/accounts/login')) {
      return { username, available: false, reason: 'Perfil ocupado (redirecionado para login)' };
    }
    
    // 2. Se contiver termos de erro ou página indisponível, o nome está disponível
    const pageNotFoundText = [
      'não está disponível',
      "isn't available",
      'não encontrada',
      'not found',
      'não disponível'
    ];
    
    const isUnavailable = pageNotFoundText.some(text => 
      title.toLowerCase().includes(text.toLowerCase()) || 
      content.toLowerCase().includes(text.toLowerCase())
    );

    if (isUnavailable) {
      return { username, available: true, reason: 'Disponível (página de erro 404)' };
    }

    // 3. Se a URL final for do perfil e tiver bio/posts/seguir, está ocupado
    if (title.includes('@' + username) || content.includes('Follow') || content.includes('Seguir') || content.includes('posts')) {
      return { username, available: false, reason: 'Perfil ativo detectado' };
    }

    // Default caso não redirecione para login e não achou erro explícito (provável disponível)
    return { username, available: true, reason: 'Disponível (não detectado ativo)' };

  } catch (error) {
    console.error(`Erro ao verificar @${username}:`, error.message);
    return { username, available: null, reason: `Erro na requisição: ${error.message}` };
  }
}

async function main() {
  const executablePath = getExecutablePath();
  if (!executablePath) {
    console.error('ERRO: Não foi possível encontrar o executável do Google Chrome ou Microsoft Edge nos caminhos padrão.');
    process.exit(1);
  }

  console.log(`Usando navegador em: ${executablePath}`);
  
  const browser = await puppeteer.launch({
    executablePath: executablePath,
    headless: false, // Executar no modo visível para evitar redirecionamento forçado de bot
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1280,800'
    ]
  });

  const page = await browser.newPage();
  
  // Ocultar webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
  });
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Configurar idioma padrão
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
  });

  const results = [];

  for (let i = 0; i < USERNAME_CANDIDATES.length; i++) {
    const username = USERNAME_CANDIDATES[i];
    const result = await verifyUsername(page, username);
    
    if (result.available === true) {
      result.score = calculateScore(username);
    } else {
      result.score = 0;
    }
    
    results.push(result);
    
    // Delay randômico entre 2 e 4 segundos para evitar rate limit
    if (i < USERNAME_CANDIDATES.length - 1) {
      const delay = Math.floor(Math.random() * 2000) + 2000;
      console.log(`Aguardando ${delay / 1000}s para evitar rate limit...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  await browser.close();

  // Ordenar resultados (disponíveis primeiro, por score decrescente)
  results.sort((a, b) => {
    if (a.available !== b.available) {
      return a.available ? -1 : 1;
    }
    return b.score - a.score;
  });

  const outputDir = path.join(__dirname, '..', '.tmp');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'nomes_disponiveis.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    total_checked: results.length,
    available_count: results.filter(r => r.available === true).length,
    results
  }, null, 2));

  console.log(`\nVerificação concluída! Resultados salvos em: ${outputPath}`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Erro geral na execução:', err);
  process.exit(1);
});
