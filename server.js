const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

// Tratadores de erros globais para evitar que falhas do Puppeteer/WhatsApp Web crashem o servidor Express
process.on('uncaughtException', (err) => {
  console.error('💥 [Erro Não Capturado]:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [Rejeição Não Tratada]:', reason);
});

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/stories', express.static(path.join(__dirname, 'stories')));

const dealsReportPath = path.join(__dirname, 'mercado_livre_deals_report.json');
const couponsPath = path.join(__dirname, 'coupons.json');
const historyPath = path.join(__dirname, '.tmp', 'published_history.json');
const GROUP_NAME = 'Alerta de Descontos';

// Função para ler variáveis do arquivo .env dinamicamente sem precisar reiniciar o processo
function readEnv() {
  const envVars = {};
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

// Inferência simples de Categoria com base no título
function inferCategory(title) {
  const t = title.toLowerCase();
  if (t.includes('panela') || t.includes('frigideira') || t.includes('cozinha') || t.includes('prato') || t.includes('copo') || t.includes('chaleira') || t.includes('fritadeira') || t.includes('cafeteira') || t.includes('airfryer') || t.includes('forno') || t.includes('fogao') || t.includes('microondas')) {
    return 'Casa e Cozinha';
  }
  if (t.includes('creatina') || t.includes('suplemento') || t.includes('whey') || t.includes('proteina') || t.includes('caps') || t.includes('omega') || t.includes('vitamina') || t.includes('dark lab') || t.includes('soldiers') || t.includes('colageno')) {
    return 'Saúde e Esportes';
  }
  if (t.includes('fone') || t.includes('headset') || t.includes('caixa de som') || t.includes('alexa') || t.includes('smart') || t.includes('relogio') || t.includes('watch') || t.includes('jbl') || t.includes('bluetooth') || t.includes('teclado') || t.includes('mouse') || t.includes('gamer')) {
    return 'Eletrônicos e Acessórios';
  }
  if (t.includes('smartphone') || t.includes('celular') || t.includes('iphone') || t.includes('motorola') || t.includes('samsung') || t.includes('xiaomi') || t.includes('redmi')) {
    return 'Celulares';
  }
  if (t.includes('vestido') || t.includes('camisa') || t.includes('camiseta') || t.includes('calça') || t.includes('tenis') || t.includes('sapato') || t.includes('bota') || t.includes('mochila') || t.includes('moda') || t.includes('roupa') || t.includes('casaco') || t.includes('jaqueta')) {
    return 'Moda e Calçados';
  }
  if (t.includes('perfume') || t.includes('fragrancia') || t.includes('sedutor') || t.includes('shampoo') || t.includes('creme') || t.includes('maquiagem') || t.includes('cosmetico') || t.includes('hidratante')) {
    return 'Beleza e Cuidado Pessoal';
  }
  if (t.includes('ventilador') || t.includes('ar condicionado') || t.includes('aquecedor') || t.includes('climatizador') || t.includes('extratora') || t.includes('aspirador') || t.includes('lavadora') || t.includes('secadora')) {
    return 'Eletrodomésticos';
  }
  return 'Ofertas Gerais';
}

// Rotina de limpeza de mensagens expiradas no grupo do WhatsApp
async function cleanupExpiredDeals(whatsapp, history) {
  console.log('\n🧹 [Automação] Iniciando limpeza de ofertas expiradas no grupo...');
  const now = new Date();
  let changed = false;

  for (const entry of history.entries) {
    if (entry.deleted || !entry.msgId) continue;

    const publishedDate = new Date(entry.publishedAt);
    let durationMs = 48 * 60 * 60 * 1000; // Campanha: 48h padrão

    if (entry.dealType === 'Oferta Relâmpago') {
      if (entry.timeLeft && entry.timeLeft.includes('Acaba em')) {
        const hoursMatch = entry.timeLeft.match(/(\d+)h/);
        const minsMatch = entry.timeLeft.match(/(\d+)m/);
        const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 3;
        const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
        durationMs = ((hours * 60) + mins) * 60 * 1000;
      } else {
        durationMs = 6 * 60 * 60 * 1000; // Relâmpago sem contador: 6h
      }
    } else if (entry.dealType === 'Oferta do Dia') {
      durationMs = 24 * 60 * 60 * 1000; // Dia: 24h
    }

    const expireDate = new Date(publishedDate.getTime() + durationMs);

    if (now > expireDate) {
      console.log(`⏳ Oferta expirada: "${entry.title}" (Tipo: ${entry.dealType})`);
      console.log(`   Apagando mensagem ID: ${entry.msgId}...`);

      try {
        const chat = await whatsapp.client.getChatById('120363410833991285@g.us');
        const messages = await chat.fetchMessages({ limit: 80 });
        const targetMsg = messages.find(m => m.id._serialized === entry.msgId);

        if (targetMsg) {
          await targetMsg.delete(true);
          console.log('   ✅ Mensagem excluída do grupo com sucesso!');
        } else {
          try {
            const directMsg = await whatsapp.client.getMessageById(entry.msgId);
            if (directMsg) {
              await directMsg.delete(true);
              console.log('   ✅ Mensagem excluída diretamente!');
            }
          } catch (e) {
            console.log('   ⚠️ Mensagem antiga não pôde ser recuperada.');
          }
        }

        entry.deleted = true;
        entry.deletedAt = new Date().toISOString();
        changed = true;

        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.error(`   ❌ Falha ao excluir mensagem: ${err.message}`);
      }
    }
  }

  return changed;
}

// GET /api/deals - Retorna a lista de promoções (filtrando as enviadas nas últimas 24h) e cupons salvos
app.get('/api/deals', (req, res) => {
  let deals = [];
  let generatedAt = null;

  if (fs.existsSync(dealsReportPath)) {
    try {
      const rawData = fs.readFileSync(dealsReportPath, 'utf-8');
      const parsedData = JSON.parse(rawData);
      deals = parsedData.deals || [];
      generatedAt = parsedData.generatedAt || null;
    } catch (err) {
      console.error('Erro ao ler ofertas:', err);
    }
  }

  // Filtragem: Remove produtos enviados nas últimas 24 horas (se HIDE_PUBLISHED_DEALS for true)
  const env = readEnv();
  const hidePublished = env['HIDE_PUBLISHED_DEALS'] === 'true';

  if (hidePublished && fs.existsSync(historyPath)) {
    try {
      const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      const entries = history.entries || [];
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      const recentlyPublished = new Set();
      for (const entry of entries) {
        const pubTime = new Date(entry.publishedAt).getTime();
        if (now - pubTime < oneDayMs) {
          recentlyPublished.add(entry.dealId);
        }
      }

      deals = deals.filter(deal => {
        const dealId = generateDealId(deal);
        return !recentlyPublished.has(dealId);
      });
    } catch (err) {
      console.error('Erro ao processar filtragem de histórico nas ofertas:', err);
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

// GET /api/coupons - Retorna apenas a lista de cupons
app.get('/api/coupons', (req, res) => {
  if (!fs.existsSync(couponsPath)) {
    return res.json([]);
  }
  try {
    const rawData = fs.readFileSync(couponsPath, 'utf-8');
    res.json(JSON.parse(rawData));
  } catch (err) {
    res.status(500).json({ error: `Erro ao ler cupons: ${err.message}` });
  }
});

// POST /api/coupons - Adiciona ou atualiza um cupom
app.post('/api/coupons', (req, res) => {
  const { code, rules, maxLimit } = req.body;
  if (!code || !rules) {
    return res.status(400).json({ error: 'Código e Regra são obrigatórios.' });
  }

  try {
    let coupons = [];
    if (fs.existsSync(couponsPath)) {
      coupons = JSON.parse(fs.readFileSync(couponsPath, 'utf-8'));
    }

    const newCoupon = {
      code: code.trim().toUpperCase(),
      rules: rules.trim(),
      maxLimit: maxLimit ? maxLimit.trim() : 'N/A',
      manual: true
    };

    const index = coupons.findIndex(c => c.code === newCoupon.code);
    if (index !== -1) {
      coupons[index] = newCoupon;
    } else {
      coupons.push(newCoupon);
    }

    fs.writeFileSync(couponsPath, JSON.stringify(coupons, null, 2), 'utf-8');
    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ error: `Erro ao salvar cupom: ${err.message}` });
  }
});

// DELETE /api/coupons/:code - Exclui um cupom pelo código
app.delete('/api/coupons/:code', (req, res) => {
  const { code } = req.params;
  if (!code) {
    return res.status(400).json({ error: 'Código do cupom é obrigatório.' });
  }

  try {
    let coupons = [];
    if (fs.existsSync(couponsPath)) {
      coupons = JSON.parse(fs.readFileSync(couponsPath, 'utf-8'));
    }

    const filteredCoupons = coupons.filter(c => c.code !== code.toUpperCase());
    fs.writeFileSync(couponsPath, JSON.stringify(filteredCoupons, null, 2), 'utf-8');
    res.json({ success: true, coupons: filteredCoupons });
  } catch (err) {
    res.status(500).json({ error: `Erro ao deletar cupom: ${err.message}` });
  }
});

// POST /api/scrape - Dispara o script de scraping para buscar ofertas do dia
app.post('/api/scrape', (req, res) => {
  console.log('Executando scraper de ofertas do Mercado Livre...');
  
  exec('node execution/mercado_livre_deals.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Erro no scraping: ${error.message}`);
      return res.status(500).json({ error: `Falha ao atualizar ofertas: ${error.message}` });
    }
    
    console.log('Scraping concluído com sucesso!');
    // Recarrega o arquivo JSON filtrando os itens recentemente postados
    try {
      const rawData = fs.readFileSync(dealsReportPath, 'utf-8');
      const parsedData = JSON.parse(rawData);
      let deals = parsedData.deals || [];

      // Filtra itens postados nas últimas 24h
      if (fs.existsSync(historyPath)) {
        const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        const entries = history.entries || [];
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        const recentlyPublished = new Set();
        for (const entry of entries) {
          const pubTime = new Date(entry.publishedAt).getTime();
          if (now - pubTime < oneDayMs) {
            recentlyPublished.add(entry.dealId);
          }
        }
        deals = deals.filter(deal => {
          const dealId = generateDealId(deal);
          return !recentlyPublished.has(dealId);
        });
      }

      let coupons = [];
      if (fs.existsSync(couponsPath)) {
        coupons = JSON.parse(fs.readFileSync(couponsPath, 'utf-8'));
      }

      res.json({
        success: true,
        data: {
          deals,
          coupons,
          generatedAt: parsedData.generatedAt || null
        }
      });
    } catch (e) {
      res.status(500).json({ error: 'Scraping executado, mas falha ao ler o arquivo gerado.' });
    }
  });
});

// POST /api/generate - Gera stories e envia diretamente para o grupo do WhatsApp
app.post('/api/generate', (req, res) => {
  const { selectedIndices, couponCode } = req.body;
  
  if (!Array.isArray(selectedIndices) || selectedIndices.length === 0) {
    return res.status(400).json({ error: 'Nenhum produto selecionado.' });
  }

  if (!fs.existsSync(dealsReportPath)) {
    return res.status(400).json({ error: 'Arquivo de ofertas inexistente. Execute a atualização antes.' });
  }

  try {
    const rawData = fs.readFileSync(dealsReportPath, 'utf-8');
    const parsedData = JSON.parse(rawData);
    let allDeals = parsedData.deals || [];

    // Aplica o filtro de 24h para obter exatamente a mesma lista exibida no site (se HIDE_PUBLISHED_DEALS for true)
    const env = readEnv();
    const hidePublished = env['HIDE_PUBLISHED_DEALS'] === 'true';

    if (hidePublished && fs.existsSync(historyPath)) {
      try {
        const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        const entries = history.entries || [];
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        const recentlyPublished = new Set();
        for (const entry of entries) {
          const pubTime = new Date(entry.publishedAt).getTime();
          if (now - pubTime < oneDayMs) {
            recentlyPublished.add(entry.dealId);
          }
        }
        allDeals = allDeals.filter(deal => {
          const dealId = generateDealId(deal);
          return !recentlyPublished.has(dealId);
        });
      } catch (err) {
        console.error('Erro ao ler histórico de publicados no generate:', err);
      }
    }

    // Filtra as promoções usando os índices selecionados (0-based da lista filtrada)
    const filteredDeals = allDeals.filter((_, index) => selectedIndices.includes(index));

    if (filteredDeals.length === 0) {
      return res.status(400).json({ error: 'Nenhum produto válido encontrado para os índices fornecidos.' });
    }

    // Carrega o cupom selecionado, se aplicável
    let selectedCoupon = null;
    if (couponCode && fs.existsSync(couponsPath)) {
      const coupons = JSON.parse(fs.readFileSync(couponsPath, 'utf-8'));
      selectedCoupon = coupons.find(c => c.code === couponCode.toUpperCase()) || null;
    }

    // Responde ao cliente web imediatamente que a tarefa assíncrona foi iniciada
    res.json({
      success: true,
      message: `Geração e envio de ${filteredDeals.length} ofertas para o WhatsApp iniciados com sucesso!`
    });

    // Thread de execução em background para extrair link, gerar story e enviar no WhatsApp
    (async () => {
      console.log(`\n📤 [Painel Web] Iniciando envio manual de ${filteredDeals.length} ofertas selecionadas para o WhatsApp...`);
      
      const storiesDir = path.join(__dirname, 'stories');
      
      for (const deal of filteredDeals) {
        console.log(`📦 Processando seleção do painel: ${deal.title.substring(0, 50)}...`);
        const dealId = generateDealId(deal);
        
        // Caminhos temporários exclusivos para evitar colisão em execução paralela
        const localLastLinkPath = path.join(__dirname, '.tmp', `last_link_${dealId}.txt`);
        const singleSelectionPath = path.join(__dirname, '.tmp', `wpp_single_deal_${dealId}.json`);

        // Promessa 1: Gerar o link de afiliado de forma ativa e rápida
        const affiliatePromise = (async () => {
          try {
            if (fs.existsSync(localLastLinkPath)) fs.unlinkSync(localLastLinkPath);
            execSync(`node execution/get_meli_affiliate_link.js "${deal.link}" "${localLastLinkPath}"`, {
              cwd: __dirname,
              stdio: 'ignore'
            });

            if (fs.existsSync(localLastLinkPath)) {
              const link = fs.readFileSync(localLastLinkPath, 'utf-8').trim();
              try { fs.unlinkSync(localLastLinkPath); } catch (e) {}
              return link;
            }
          } catch (err) {
            console.warn(`   ⚠️ Erro ao encurtar link para ${deal.title.substring(0, 30)}: ${err.message}`);
          }
          return deal.link; // Fallback se falhar
        })();

        // Promessa 2: Gerar Story JPG
        const storyPromise = (async () => {
          try {
            const tempDeal = { ...deal, link: deal.link }; // Imagem não desenha o link de afiliado
            const tempSelectionData = {
              generatedAt: new Date().toISOString(),
              deals: [tempDeal],
              selectedCoupon: selectedCoupon
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

            try { fs.unlinkSync(singleSelectionPath); } catch (e) {}

            const generatedFiles = fs.readdirSync(storiesDir).filter(f => f.endsWith('.jpg'));
            if (generatedFiles.length > 0) {
              return path.join(storiesDir, generatedFiles[0]);
            }
          } catch (err) {
            console.error(`   ⚠️ Erro ao gerar Story para ${deal.title.substring(0, 30)}: ${err.message}`);
          }
          return null;
        })();

        // Executa as duas tarefas síncronas/assíncronas simultaneamente em paralelo!
        const [affiliateLink, storyImagePath] = await Promise.all([affiliatePromise, storyPromise]);

        if (affiliateLink) {
          console.log(`   Link de afiliado obtido: ${affiliateLink}`);
        }
        if (storyImagePath) {
          console.log(`   Story JPG gerado: ${path.basename(storyImagePath)}`);
        }

        // 3. Formata Mensagem
        const category = inferCategory(deal.title);
        const wppMessage = `🔥 *OFERTA ENCONTRADA!* \n\n*${deal.title}*\n\n🔥 *${deal.discount}% OFF*\nDe: ~~${deal.originalPrice}~~\nPor: *${deal.currentPrice}*\n\n👉 *Compre pelo link:* ${affiliateLink}\n\n📌 _Categoria: ${category}_`;

        // 4. Envia no WhatsApp usando a conexão persistente
        let msgId = null;
        if (whatsapp && whatsapp.client.info) {
          try {
            msgId = await whatsapp.sendOffer(GROUP_NAME, wppMessage, storyImagePath);
            console.log(`   ✅ Oferta enviada no grupo! MsgID: ${msgId}`);
          } catch (wppErr) {
            console.error(`   ❌ Erro ao enviar para o WhatsApp: ${wppErr.message}`);
          }
        } else {
          console.log(`   ⚠️ Conexão do WhatsApp offline ou indisponível no servidor.`);
        }

        // 5. Registra no histórico de publicados (com source: "manual")
        try {
          let history = { publishedIds: [], entries: [] };
          if (fs.existsSync(historyPath)) {
            history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
          }
          const dId = generateDealId(deal);
          history.publishedIds.push(dId);
          history.entries.push({
            dealId: dId,
            title: deal.title.substring(0, 80),
            discount: deal.discount,
            price: deal.currentPrice,
            affiliateLink: affiliateLink,
            publishedAt: new Date().toISOString(),
            msgId: msgId,
            dealType: deal.dealType || 'Ofertas de Campanha',
            timeLeft: deal.timeLeft || '',
            source: 'manual' // Identificador de postagem manual
          });
          fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
        } catch (histErr) {
          console.error('   ❌ Falha ao gravar histórico local:', histErr.message);
        }

        // Intervalo curto seguro de rede
        await new Promise(r => setTimeout(r, 1500));
      }
      console.log('🏁 Processo de envio via painel concluído.');
    })().catch(err => {
      console.error('Erro na execução assíncrona do painel:', err.message);
    });

  } catch (err) {
    res.status(500).json({ error: `Erro interno no servidor: ${err.message}` });
  }
});

// GET /api/stories - Lista todos os stories gerados (.jpg) na pasta /stories
app.get('/api/stories', (req, res) => {
  const storiesDir = path.join(__dirname, 'stories');
  if (!fs.existsSync(storiesDir)) {
    return res.json({ stories: [] });
  }

  fs.readdir(storiesDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao listar pasta de stories.' });
    }

    const stories = files
      .filter(file => file.endsWith('.jpg') || file.endsWith('.jpeg'))
      .map(file => ({
        filename: file,
        url: `/stories/${file}`,
        rank: parseInt((file.match(/story_(\d+)_/) || [])[1] || '999', 10)
      }))
      .sort((a, b) => a.rank - b.rank);

    res.json({ stories });
  });
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
// 🤖 CICLO AUTOMÁTICO DE VARREDURA E POSTAGENS (DAEMON INTEGRADO)
// =======================================================================
async function runAutomaticCycle() {
  const env = readEnv();
  const limit = parseInt(env['DAILY_WPP_POSTS_LIMIT'] || '30', 10);
  const maxPerCycle = parseInt(env['MAX_POSTS_PER_CYCLE'] || '2', 10);

  console.log(`\n⏰ [${new Date().toLocaleTimeString('pt-BR')}] Iniciando ciclo automático de ofertas...`);

  // 1. Scraping de ofertas ativas ("todas as boas" do ML)
  console.log('👉 Executando varredura no Mercado Livre...');
  try {
    execSync('node execution/mercado_livre_deals.js', { cwd: __dirname, stdio: 'inherit' });
    console.log('✅ Base de dados de ofertas atualizada pelo ciclo automático.');
  } catch (e) {
    console.warn('⚠️ Falha ao rodar o scraper automático. Tentando dados anteriores...', e.message);
  }

  if (!fs.existsSync(dealsReportPath)) {
    console.error('❌ Erro: Arquivo de ofertas não encontrado no ciclo automático.');
    return;
  }

  // 2. Carrega histórico e conta posts automáticos de hoje
  let history = { publishedIds: [], entries: [] };
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    } catch (e) {
      console.log('⚠️ Erro ao ler histórico. Iniciando novo.');
    }
  }

  // Executa a limpeza automática de mensagens expiradas
  if (whatsapp && whatsapp.client.info) {
    try {
      const historyChanged = await cleanupExpiredDeals(whatsapp, history);
      if (historyChanged) {
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
        console.log('✅ Histórico local atualizado pós-limpeza automática.');
      }
    } catch (cleanErr) {
      console.error('⚠️ Falha durante a limpeza automática:', cleanErr.message);
    }
  }

  // Contagem de automáticos de hoje
  const todayStr = new Date().toISOString().substring(0, 10);
  const autoPostsToday = (history.entries || []).filter(entry => {
    if (entry.source !== 'auto') return false;
    const pubDateStr = new Date(entry.publishedAt).toISOString().substring(0, 10);
    return pubDateStr === todayStr;
  }).length;

  console.log(`📊 Estatísticas diárias: Postagens automáticas hoje: ${autoPostsToday} / Limite Diário: ${limit}`);

  if (autoPostsToday >= limit) {
    console.log(`⚠️ Limite diário de postagens automáticas (${limit}) já atingido hoje. O ciclo foi pulado.`);
    console.log('📡 Monitorando reações de foguinho (🔥) no grupo...');
    return;
  }

  // Calcula cota para enviar nesta rodada
  const postsToSend = Math.min(maxPerCycle, limit - autoPostsToday);
  if (postsToSend <= 0) {
    console.log('⚠️ Nenhuma cota para postagem automática nesta rodada.');
    return;
  }

  // 3. Filtrar pendentes (não enviadas nas últimas 24h)
  const dealsData = JSON.parse(fs.readFileSync(dealsReportPath, 'utf-8'));
  const deals = dealsData.deals || [];
  const publishedIdsSet = new Set(history.publishedIds || []);

  const pendingDeals = deals
    .map(deal => ({ ...deal, dealId: generateDealId(deal) }))
    .filter(deal => !publishedIdsSet.has(deal.dealId));

  console.log(`👉 Filtrando melhores pendentes para automação...`);
  console.log(`   Ofertas ativas: ${deals.length} | Já enviadas: ${publishedIdsSet.size} | Pendentes: ${pendingDeals.length}`);

  if (pendingDeals.length === 0) {
    console.log('⚠️ Nenhuma oferta pendente qualificada para envio automático nesta rodada.');
    return;
  }

  // Ordena por maior desconto para pegar as MELHORES ofertas
  pendingDeals.sort((a, b) => b.discount - a.discount);
  const selectedDeals = pendingDeals.slice(0, postsToSend);

  console.log(`🚀 [Auto Run] Selecionadas ${selectedDeals.length} ofertas para publicação automática:`);
  selectedDeals.forEach((d, idx) => {
    console.log(`   ${idx + 1}. [${d.discount}% OFF] ${d.title.substring(0, 50)}...`);
  });

  // 4. Gera e envia
  const storiesDir = path.join(__dirname, 'stories');
  for (const deal of selectedDeals) {
    console.log(`📦 Processando envio automático: ${deal.title.substring(0, 50)}...`);
    const dealId = generateDealId(deal);
    
    const localLastLinkPath = path.join(__dirname, '.tmp', `last_link_${dealId}.txt`);
    const singleSelectionPath = path.join(__dirname, '.tmp', `wpp_single_deal_${dealId}.json`);

    // Geração paralela link + story
    const affiliatePromise = (async () => {
      try {
        if (fs.existsSync(localLastLinkPath)) fs.unlinkSync(localLastLinkPath);
        execSync(`node execution/get_meli_affiliate_link.js "${deal.link}" "${localLastLinkPath}"`, {
          cwd: __dirname,
          stdio: 'ignore'
        });

        if (fs.existsSync(localLastLinkPath)) {
          const link = fs.readFileSync(localLastLinkPath, 'utf-8').trim();
          try { fs.unlinkSync(localLastLinkPath); } catch (e) {}
          return link;
        }
      } catch (err) {
        console.warn(`   ⚠️ Erro ao encurtar link para ${deal.title.substring(0, 30)}: ${err.message}`);
      }
      return deal.link;
    })();

    const storyPromise = (async () => {
      try {
        const tempDeal = { ...deal, link: deal.link };
        const tempSelectionData = {
          generatedAt: new Date().toISOString(),
          deals: [tempDeal],
          selectedCoupon: dealsData.coupons && dealsData.coupons.length > 0 ? dealsData.coupons[0] : null
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

        try { fs.unlinkSync(singleSelectionPath); } catch (e) {}

        const generatedFiles = fs.readdirSync(storiesDir).filter(f => f.endsWith('.jpg'));
        if (generatedFiles.length > 0) {
          return path.join(storiesDir, generatedFiles[0]);
        }
      } catch (err) {
        console.error(`   ⚠️ Erro ao gerar Story para ${deal.title.substring(0, 30)}: ${err.message}`);
      }
      return null;
    })();

    const [affiliateLink, storyImagePath] = await Promise.all([affiliatePromise, storyPromise]);

    const category = inferCategory(deal.title);
    const wppMessage = `🔥 *OFERTA ENCONTRADA!* \n\n*${deal.title}*\n\n🔥 *${deal.discount}% OFF*\nDe: ~~${deal.originalPrice}~~\nPor: *${deal.currentPrice}*\n\n👉 *Compre pelo link:* ${affiliateLink}\n\n📌 _Categoria: ${category}_`;

    let msgId = null;
    if (whatsapp && whatsapp.client.info) {
      try {
        msgId = await whatsapp.sendOffer(GROUP_NAME, wppMessage, storyImagePath);
        console.log(`   ✅ Oferta enviada de forma automática! MsgID: ${msgId}`);
      } catch (wppErr) {
        console.error(`   ❌ Erro ao enviar oferta automática: ${wppErr.message}`);
        continue;
      }
    }

    // Registra no histórico com source: "auto"
    try {
      history.publishedIds.push(dealId);
      history.entries.push({
        dealId: dealId,
        title: deal.title.substring(0, 80),
        discount: deal.discount,
        price: deal.currentPrice,
        affiliateLink: affiliateLink,
        publishedAt: new Date().toISOString(),
        msgId: msgId,
        dealType: deal.dealType || 'Ofertas de Campanha',
        timeLeft: deal.timeLeft || '',
        source: 'auto' // Identificador de postagem automática
      });
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
    } catch (hErr) {
      console.error('   ❌ Erro ao atualizar histórico automático:', hErr.message);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`🏁 Ciclo automático finalizado. Próxima rodada em ${env['AUTO_RUN_INTERVAL_MINUTES'] || 30} minutos.`);
  console.log(`📡 Monitorando reações de foguinho (🔥) no grupo...`);
}

// Inicia servidor e depois dispara ciclos
app.listen(PORT, async () => {
  console.log(`=================================================`);
  console.log(` Dashboard rodando em http://localhost:${PORT}`);
  console.log(`=================================================`);

  // Aguarda 10s após startup do Express para dar tempo da conexão do WhatsApp assentar antes de rodar o primeiro ciclo automático
  setTimeout(async () => {
    try {
      await runAutomaticCycle();
    } catch (e) {
      console.error('💥 Erro no primeiro ciclo automático:', e.message);
    }

    // Agenda execuções periódicas
    const env = readEnv();
    const minutes = parseInt(env['AUTO_RUN_INTERVAL_MINUTES'] || '30', 10);
    const intervalMs = minutes * 60 * 1000;

    setInterval(async () => {
      try {
        await runAutomaticCycle();
      } catch (e) {
        console.error('💥 Erro na rotina recorrente automática:', e.message);
      }
    }, intervalMs);
  }, 10000);
});
