/**
 * auto_publish_scheduler.js
 * ─────────────────────────────────────────────────────────────────
 * Camada 3 — Execução (Determinística)
 *
 * Script de automação inteligente que:
 *   1. Lê mercado_livre_deals_report.json
 *   2. Filtra ofertas não publicadas (via .tmp/published_history.json)
 *   3. Seleciona as TOP N por maior desconto + menor preço
 *   4. Gera os stories (via generate_stories.js)
 *   5. Publica no Instagram (via publish_story.js)
 *   6. Registra no histórico para evitar duplicatas
 *
 * Uso:
 *   node execution/auto_publish_scheduler.js           → publica as top 3
 *   node execution/auto_publish_scheduler.js --count=5  → publica as top 5
 *   node execution/auto_publish_scheduler.js --dry-run  → simula sem publicar
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Config ───────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const DEALS_PATH = path.join(ROOT, 'mercado_livre_deals_report.json');
const HISTORY_PATH = path.join(ROOT, '.tmp', 'published_history.json');
const STORIES_DIR = path.join(ROOT, 'stories');
const COUPONS_PATH = path.join(ROOT, 'coupons.json');
const DEFAULT_COUNT = 3;

// ─── Carrega o histórico de publicações ───────────────────────────
function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) {
    return { publishedIds: [], entries: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  } catch {
    return { publishedIds: [], entries: [] };
  }
}

function saveHistory(history) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf-8');
}

// ─── Gera um ID único para cada deal baseado no título + preço ────
function generateDealId(deal) {
  const base = `${deal.title}_${deal.currentPrice}_${deal.discount}`;
  // Hash simples determinístico
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Converte para 32-bit int
  }
  return `deal_${Math.abs(hash)}`;
}

// ─── Seleciona as melhores ofertas não publicadas ─────────────────
function selectBestDeals(deals, history, count) {
  const publishedSet = new Set(history.publishedIds || []);

  // Filtra deals não publicadas
  const unpublished = deals
    .map((deal, originalIndex) => ({
      ...deal,
      originalIndex,
      dealId: generateDealId(deal)
    }))
    .filter(deal => !publishedSet.has(deal.dealId));

  console.log(`  Ofertas totais: ${deals.length}`);
  console.log(`  Já publicadas: ${publishedSet.size}`);
  console.log(`  Pendentes: ${unpublished.length}`);

  if (unpublished.length === 0) {
    console.log('  ⚠️  Todas as ofertas já foram publicadas!');
    return [];
  }

  // Ordena por: maior desconto primeiro, empate por menor preço
  unpublished.sort((a, b) => {
    if (b.discount !== a.discount) return b.discount - a.discount;
    // Extrai valor numérico do preço
    const priceA = parseFloat((a.currentPrice || '').replace(/[^\d,]/g, '').replace(',', '.')) || 999999;
    const priceB = parseFloat((b.currentPrice || '').replace(/[^\d,]/g, '').replace(',', '.')) || 999999;
    return priceA - priceB;
  });

  return unpublished.slice(0, count);
}

// ─── Executa a geração de stories para deals específicos ──────────
function generateStoriesForDeals(selectedDeals, dealsData) {
  console.log('\n── Fase 1: Gerando imagens dos stories ──');

  // Carrega cupom ativo se existir
  let selectedCoupon = null;
  if (fs.existsSync(COUPONS_PATH)) {
    try {
      const coupons = JSON.parse(fs.readFileSync(COUPONS_PATH, 'utf-8'));
      if (coupons.length > 0) {
        selectedCoupon = coupons[0]; // Usa o primeiro cupom disponível
        console.log(`  🎟️  Cupom aplicado: ${selectedCoupon.code}`);
      }
    } catch { /* ignora */ }
  }

  // Cria arquivo temporário com os deals selecionados
  const tempPath = path.join(ROOT, '.tmp', 'auto_selection.json');
  fs.mkdirSync(path.dirname(tempPath), { recursive: true });
  
  const tempData = {
    generatedAt: dealsData.generatedAt || new Date().toISOString(),
    deals: selectedDeals,
    selectedCoupon
  };
  fs.writeFileSync(tempPath, JSON.stringify(tempData, null, 2));

  // Limpa stories antigos para evitar confusão
  if (fs.existsSync(STORIES_DIR)) {
    const oldFiles = fs.readdirSync(STORIES_DIR).filter(f => f.endsWith('.jpg'));
    oldFiles.forEach(f => {
      try { fs.unlinkSync(path.join(STORIES_DIR, f)); } catch { /* ignora */ }
    });
  }

  // Executa o gerador de stories
  try {
    console.log(`  Gerando ${selectedDeals.length} stories...`);
    const output = execSync(`node execution/generate_stories.js "${tempPath}"`, {
      cwd: ROOT,
      timeout: 120000,
      encoding: 'utf-8'
    });
    console.log(`  ✅ Stories gerados com sucesso!`);
    return true;
  } catch (err) {
    console.error(`  ❌ Erro ao gerar stories: ${err.message}`);
    return false;
  } finally {
    // Limpa arquivo temporário
    try { fs.unlinkSync(tempPath); } catch { /* ignora */ }
  }
}

// ─── Publica os stories gerados ───────────────────────────────────────
function publishStories(dryRun, delaySeconds) {
  console.log('\n── Fase 2: Publicando no Instagram ──');

  if (dryRun) {
    console.log('  🏃 DRY-RUN: Simulação. Nenhum story será publicado.');
    return { success: true, output: 'dry-run' };
  }

  try {
    const cmd = `node execution/publish_story.js --delay=${delaySeconds}`;
    console.log(`  Comando: ${cmd}`);
    const timeoutMs = (delaySeconds * 15 + 120) * 1000; // delay * max_stories + margem
    const output = execSync(cmd, {
      cwd: ROOT,
      timeout: timeoutMs,
      encoding: 'utf-8'
    });
    console.log(output);
    return { success: true, output };
  } catch (err) {
    console.error(`  ❌ Erro ao publicar: ${err.message}`);
    return { success: false, output: err.message };
  }
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   🤖 Automação Inteligente de Stories        ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Argumentos
  const args = process.argv.slice(2);
  const countArg = args.find(a => a.startsWith('--count='));
  const count = countArg ? parseInt(countArg.split('=')[1], 10) : DEFAULT_COUNT;
  const delayArg = args.find(a => a.startsWith('--delay='));
  const delaySeconds = delayArg ? parseInt(delayArg.split('=')[1], 10) : 5;
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    console.log('🏃 MODO DRY-RUN: Nenhuma publicação será feita.\n');
  }

  // 1. Carrega dados
  if (!fs.existsSync(DEALS_PATH)) {
    console.error('❌ Arquivo de ofertas não encontrado. Execute o scraper primeiro:');
    console.error('   node execution/mercado_livre_deals.js');
    process.exit(1);
  }

  const dealsData = JSON.parse(fs.readFileSync(DEALS_PATH, 'utf-8'));
  const deals = dealsData.deals || [];
  const history = loadHistory();

  console.log(`📊 Configuração: Top ${count} ofertas`);

  // 2. Seleciona as melhores
  const selected = selectBestDeals(deals, history, count);

  if (selected.length === 0) {
    console.log('\n⚠️  Nenhuma oferta nova para publicar. Execute o scraper para buscar ofertas novas.');
    process.exit(0);
  }

  console.log(`\n🏆 Top ${selected.length} selecionadas:\n`);
  selected.forEach((deal, i) => {
    console.log(`  ${i + 1}. [${deal.discount}% OFF] ${deal.title.substring(0, 60)}...`);
    console.log(`     Preço: ${deal.currentPrice} (era ${deal.originalPrice})`);
    console.log(`     ID: ${deal.dealId}`);
  });

  // 3. Gera stories
  const generated = generateStoriesForDeals(selected, dealsData);
  if (!generated) {
    console.error('\n❌ Falha na geração dos stories. Abortando publicação.');
    process.exit(1);
  }

  // 4. Publica
  const publishResult = publishStories(dryRun, delaySeconds);

  // 5. Registra no histórico
  if (publishResult.success && !dryRun) {
    selected.forEach(deal => {
      history.publishedIds.push(deal.dealId);
      history.entries.push({
        dealId: deal.dealId,
        title: deal.title.substring(0, 80),
        discount: deal.discount,
        price: deal.currentPrice,
        publishedAt: new Date().toISOString()
      });
    });
    saveHistory(history);
    console.log(`\n📝 Histórico atualizado: ${history.publishedIds.length} ofertas já publicadas.`);
  }

  // Resumo
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║                RESULTADO FINAL               ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  Ofertas processadas: ${selected.length}`);
  console.log(`  Publicação: ${publishResult.success ? '✅ Sucesso' : '❌ Falha'}`);
  console.log(`  Modo: ${dryRun ? 'DRY-RUN (simulação)' : 'PRODUÇÃO'}`);
}

main().catch(err => {
  console.error('\n💥 Erro fatal:', err.message);
  process.exit(1);
});
