/**
 * execution/wpp_scheduler.js
 * ─────────────────────────────────────────────────────────────────
 * Camada 3 — Execução (Serviço Contínuo Daemon)
 *
 * Script que roda continuamente em background:
 *   1. Inicializa a conexão persistente com o WhatsApp Web.
 *   2. Executa a varredura do Mercado Livre a cada 30 minutos de forma automática.
 *   3. Envia os Stories com o design neuromarketing editorial (Bege, Azul, Vermelho).
 *   4. Executa a limpeza automática de mensagens expiradas do grupo.
 *   5. Permanece ativo na memória ouvindo reações de emoji (foguinho 🔥)
 *      para exclusão instantânea de posts a qualquer momento do dia.
 *
 * Uso:
 *   node execution/wpp_scheduler.js
 *   node execution/wpp_scheduler.js --count=3   → envia até 3 ofertas por ciclo
 *   node execution/wpp_scheduler.js --dry-run   → apenas simula sem enviar
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { TAXONOMY, inferCategoryAndSub } = require('./category_helper.js');
const { APP_RUNTIME_DIR, ensureSessionDirectories } = require('./session_config.js');

const ROOT = path.join(__dirname, '..');
const ML_DEALS_PATH = path.join(ROOT, 'mercado_livre_deals_report.json');
const AMAZON_DEALS_PATH = path.join(ROOT, 'amazon_deals_report.json');
const HISTORY_PATH = path.join(ROOT, '.tmp', 'published_history.json');
const STORIES_DIR = path.join(ROOT, 'stories');
ensureSessionDirectories();
const LAST_LINK_PATH = path.join(APP_RUNTIME_DIR, 'last_affiliate_link.txt');
const GROUP_NAME = 'Alerta de Descontos';

// Inferência simples de Categoria com base no título
// Inferência de Categoria e Subcategoria via Helper unificado
function inferCategory(title) {
  const info = inferCategoryAndSub(title);
  return `${info.icon} ${info.category} > ${info.subcategory}`;
}

// ID determinístico
function generateDealId(deal) {
  const base = `${deal.title}_${deal.currentPrice}_${deal.discount}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = ((hash << 5) - hash) + base.charCodeAt(i);
    hash |= 0;
  }
  return `deal_${Math.abs(hash)}`;
}

// Rotina de limpeza de mensagens expiradas no grupo do WhatsApp
async function cleanupExpiredDeals(whatsapp, history) {
  console.log('\n🧹 Iniciando limpeza de ofertas expiradas no grupo...');
  const now = new Date();
  let changed = false;

  for (const entry of history.entries) {
    // Se já foi deletada ou não tem msgId, pula
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
      console.log(`   Postada em: ${entry.publishedAt} | Expirou em: ${expireDate.toISOString()}`);
      console.log(`   Apagando mensagem ID: ${entry.msgId}...`);

      try {
        const chat = await whatsapp.client.getChatById('120363410833991285@g.us');
        const messages = await chat.fetchMessages({ limit: 80 });
        const targetMsg = messages.find(m => m.id._serialized === entry.msgId);

        if (targetMsg) {
          await targetMsg.delete(true); // Apaga para todos!
          console.log('   ✅ Mensagem excluída do grupo com sucesso!');
        } else {
          try {
            const directMsg = await whatsapp.client.getMessageById(entry.msgId);
            if (directMsg) {
              await directMsg.delete(true);
              console.log('   ✅ Mensagem excluída diretamente com sucesso!');
            } else {
              console.log('   ⚠️ Mensagem não localizada no chat.');
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

// Inicializador principal do daemon
async function runScheduler() {
  console.log('🤖 INICIANDO SERVIÇO CONTÍNUO DO ROBÔ DE OFERTAS...');
  console.log('--------------------------------------------------');
  
  const args = process.argv.slice(2);
  const countArg = args.find(a => a.startsWith('--count='));
  const count = countArg ? parseInt(countArg.split('=')[1], 10) : 5; // Padrão: 5 ofertas por ciclo
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    console.log('🏃 MODO DRY-RUN ativo. Nenhuma mensagem será enviada ou excluída.');
  }

  // Conecta ao WhatsApp uma única vez
  let whatsapp = null;
  if (!dryRun) {
    console.log('\n[Inicialização] Conectando ao WhatsApp Web...');
    whatsapp = require('./whatsapp_client.js');
    
    await new Promise((resolve) => {
      if (whatsapp.client.info) {
        resolve();
      } else {
        whatsapp.client.once('ready', () => resolve());
      }
    });
  }

  // Função interna de ciclo recorrente
  async function runCycle() {
    console.log(`\n⏰ [${new Date().toLocaleTimeString('pt-BR')}] Iniciando ciclo de ofertas do Mercado Livre...`);

    // 1. Scraping do Mercado Livre e Amazon
    console.log('👉 Executando varredura no Mercado Livre e Amazon...');
    try {
      execSync('node execution/mercado_livre_deals.js', { cwd: ROOT, stdio: 'ignore' });
      execSync('node execution/amazon_deals.js', { cwd: ROOT, stdio: 'ignore' });
      console.log('✅ Base de dados de ofertas atualizada.');
    } catch (e) {
      console.warn('⚠️ Falha ao rodar os scrapers de ofertas. Tentando dados anteriores...', e.message);
    }

    // 2. Carrega ofertas e histórico
    let deals = [];
    let generatedAt = new Date().toISOString();
    let dealsData = { generatedAt, deals, coupons: [] };

    if (fs.existsSync(ML_DEALS_PATH)) {
      try {
        const data = JSON.parse(fs.readFileSync(ML_DEALS_PATH, 'utf-8'));
        if (data.deals) deals = deals.concat(data.deals.map(d => ({ ...d, platform: 'Mercado Livre' })));
        if (data.coupons) dealsData.coupons = data.coupons;
      } catch (e) {}
    }
    if (fs.existsSync(AMAZON_DEALS_PATH)) {
      try {
        const data = JSON.parse(fs.readFileSync(AMAZON_DEALS_PATH, 'utf-8'));
        if (data.deals) deals = deals.concat(data.deals.map(d => ({ ...d, platform: 'Amazon' })));
      } catch (e) {}
    }

    if (deals.length === 0) {
      console.error('❌ Erro: Nenhum arquivo de ofertas encontrado.');
      return;
    }

    let history = { publishedIds: [], entries: [] };
    if (fs.existsSync(HISTORY_PATH)) {
      try {
        history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
      } catch (e) {
        console.log('⚠️ Erro ao ler histórico. Criando novo.');
      }
    }

    // Executa a limpeza automática das ofertas expiradas por tempo
    if (!dryRun && whatsapp) {
      try {
        const historyChanged = await cleanupExpiredDeals(whatsapp, history);
        if (historyChanged) {
          fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf-8');
          console.log('✅ Histórico local atualizado pós-limpeza.');
        }
      } catch (cleanErr) {
        console.error('⚠️ Falha durante a limpeza automática:', cleanErr.message);
      }
    }

    const publishedIdsSet = new Set(history.publishedIds || []);

    // Filtra ofertas pendentes
    const pendingDeals = deals
      .map(deal => ({ ...deal, dealId: generateDealId(deal) }))
      .filter(deal => !publishedIdsSet.has(deal.dealId));

    console.log(`👉 Filtrando melhores pendentes...`);
    console.log(`   Ofertas ativas: ${deals.length} | Já enviadas: ${publishedIdsSet.size} | Pendentes: ${pendingDeals.length}`);

    if (pendingDeals.length === 0) {
      console.log('⚠️ Nenhuma oferta nova para enviar nesta rodada.');
      console.log('📡 Monitorando reações de foguinho (🔥) no grupo...');
      return;
    }

    // Ordena por desconto
    pendingDeals.sort((a, b) => b.discount - a.discount);
    const selectedDeals = pendingDeals.slice(0, count);

    console.log(`🏆 Selecionadas para envio (${selectedDeals.length} ofertas):`);
    selectedDeals.forEach((d, idx) => {
      console.log(`   ${idx + 1}. [${d.discount}% OFF] ${d.title.substring(0, 50)}...`);
    });

    // 3. Processa e envia em lote
    for (let i = 0; i < selectedDeals.length; i++) {
      const deal = selectedDeals[i];
      console.log(`\n📦 Processando (${i + 1}/${selectedDeals.length}): ${deal.title.substring(0, 45)}...`);

      let affiliateLink = deal.link;
      let storyImagePath = null;

      // 3a. Gera link de afiliado
      try {
        if (fs.existsSync(LAST_LINK_PATH)) fs.unlinkSync(LAST_LINK_PATH);
        execSync(`node execution/get_meli_affiliate_link.js "${deal.link}" "${LAST_LINK_PATH}"`, {
          cwd: ROOT,
          stdio: 'ignore'
        });

        if (fs.existsSync(LAST_LINK_PATH)) {
          affiliateLink = fs.readFileSync(LAST_LINK_PATH, 'utf-8').trim();
          console.log(`   Afiliado: ${affiliateLink}`);
        } else {
          console.log(`⚠️ Link encurtado não gerado. Usando original.`);
        }
      } catch (err) {
        console.warn(`⚠️ Erro ao obter afiliado: ${err.message}. Usando original.`);
      }

      // 3b. Gera Story JPG
      try {
        const singleSelectionPath = path.join(ROOT, '.tmp', 'wpp_single_deal.json');
        const testDeal = { ...deal, link: affiliateLink };
        const testData = {
          generatedAt: new Date().toISOString(),
          deals: [testDeal],
          selectedCoupon: dealsData.coupons && dealsData.coupons.length > 0 ? dealsData.coupons[0] : null
        };
        fs.writeFileSync(singleSelectionPath, JSON.stringify(testData, null, 2), 'utf-8');

        if (fs.existsSync(STORIES_DIR)) {
          fs.readdirSync(STORIES_DIR)
            .filter(f => f.endsWith('.jpg'))
            .forEach(f => {
              try { fs.unlinkSync(path.join(STORIES_DIR, f)); } catch (e) {}
            });
        }

        execSync(`node execution/generate_stories.js "${singleSelectionPath}"`, {
          cwd: ROOT,
          stdio: 'ignore'
        });

        fs.unlinkSync(singleSelectionPath);

        const generatedFiles = fs.readdirSync(STORIES_DIR).filter(f => f.endsWith('.jpg'));
        if (generatedFiles.length > 0) {
          storyImagePath = path.join(STORIES_DIR, generatedFiles[0]);
          console.log(`   Story JPG criado.`);
        }
      } catch (err) {
        console.error(`⚠️ Erro ao gerar Story: ${err.message}`);
      }

      // 3c. Formata Mensagem
      const category = inferCategory(deal.title);
      const platformTag = deal.platform === 'Amazon' ? '🟡 *AMAZON*' : '🛍️ *MERCADO LIVRE*';
      const wppMessage = `🔥 *OFERTA ENCONTRADA!* \n\n*${deal.title}*\n\n🔥 *${deal.discount}% OFF*\nDe: ~~${deal.originalPrice}~~\nPor: *${deal.currentPrice}*\n\n👉 *Compre pelo link:* ${affiliateLink}\n\n📌 _Categoria: ${category}_\nPlataforma: ${platformTag}`;

      // 3d. Envia no WhatsApp
      let msgId = null;
      if (!dryRun && whatsapp) {
        try {
          msgId = await whatsapp.sendOffer(GROUP_NAME, wppMessage, storyImagePath);
          console.log(`✅ Enviado para o WhatsApp! MsgID: ${msgId}`);
          await new Promise(r => setTimeout(r, 3000)); // Delay seguro
        } catch (err) {
          console.error(`❌ Erro no envio do WhatsApp: ${err.message}`);
          continue;
        }
      } else {
        console.log(`🏃 SIMULAÇÃO (DRY-RUN) - Mensagem:\n${wppMessage}\n`);
      }

      // 3e. Grava no histórico local
      if (!dryRun) {
        history.publishedIds.push(deal.dealId);
        history.entries.push({
          dealId: deal.dealId,
          title: deal.title.substring(0, 80),
          discount: deal.discount,
          price: deal.currentPrice,
          affiliateLink: affiliateLink,
          publishedAt: new Date().toISOString(),
          msgId: msgId,
          dealType: deal.dealType || 'Ofertas de Campanha',
          timeLeft: deal.timeLeft || ''
        });
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf-8');
      }
    }

    console.log(`🏁 Ciclo concluído com sucesso. Aguardando próxima rodada.`);
    console.log(`📡 Monitorando reações de foguinho (🔥) no grupo...`);
  }

  // Executa o ciclo inicial
  await runCycle();

  // Configura agendamento contínuo a cada 30 minutos
  const INTERVAL_MS = 30 * 60 * 1000;
  setInterval(async () => {
    try {
      await runCycle();
    } catch (e) {
      console.error('💥 Erro no ciclo recorrente do daemon:', e.message);
    }
  }, INTERVAL_MS);
}

runScheduler().catch(err => {
  console.error('\n💥 Erro fatal no serviço contínuo:', err.message);
  process.exit(1);
});
