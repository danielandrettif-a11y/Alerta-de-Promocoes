const crypto = require('crypto');
const fs = require('fs');
const { parsePrice } = require('./price_comparison.js');
const { loadJson, saveJsonAtomic } = require('./json_store.js');

const SCORE_WEIGHTS = Object.freeze({
  demand: 35,
  offer: 30,
  commission: 20,
  trust: 15
});

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function normalizePlatform(value) {
  const platform = String(value || '').toLowerCase();
  if (['amazon', 'amz'].includes(platform)) return 'amazon';
  if (['shopee', 'shp'].includes(platform)) return 'shopee';
  return 'mercado_livre';
}

function parseSalesCount(value) {
  const text = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const match = text.match(/([\d.,]+)\s*(milhoes|milhao|mil|mi|k)?/i);
  if (!match) return null;
  let number = Number(match[1].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(number)) return null;
  const suffix = match[2] || '';
  if (['milhao', 'milhoes', 'mi'].includes(suffix)) number *= 1_000_000;
  if (['mil', 'k'].includes(suffix)) number *= 1_000;
  return Math.max(0, Math.round(number));
}

function normalizeCommissionRate(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace('%', '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const percent = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
  return percent <= 100 ? Number(percent.toFixed(2)) : null;
}

function dealKey(deal, platform = deal?.platform) {
  const identity =
    deal?.dealId || deal?.itemId || deal?.asin || deal?.link || deal?.productLink || deal?.title;
  return `${normalizePlatform(platform)}:${crypto.createHash('sha1')
    .update(String(identity || 'unknown'))
    .digest('hex')}`;
}

function percentile(value, sortedValues) {
  if (!Number.isFinite(value) || sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return 75;
  let lowerOrEqual = 0;
  for (const candidate of sortedValues) {
    if (candidate <= value) lowerOrEqual += 1;
  }
  return clamp(((lowerOrEqual - 1) / (sortedValues.length - 1)) * 100);
}

function weightedAvailable(parts) {
  const available = parts.filter(part => Number.isFinite(part.score));
  const weight = available.reduce((sum, part) => sum + part.weight, 0);
  if (!weight) return { score: null, coverage: 0 };
  return {
    score: available.reduce((sum, part) => sum + part.score * part.weight, 0) / weight,
    coverage: clamp(weight * 100)
  };
}

function scoreDiscount(value) {
  const discount = clamp(value, 0, 70);
  return discount <= 30 ? discount * 2 : 60 + (discount - 30);
}

function scoreToStars(value) {
  return Number((Math.round(clamp(value) / 10) / 2).toFixed(1));
}

function categoryRule(rules, platform, deal) {
  const marketplace = rules?.marketplaces?.[platform] || {};
  const categories = marketplace.categories || {};
  const names = [deal.category, deal.subcategory, deal.recurringPurchaseCategory]
    .filter(Boolean)
    .map(String);
  const matchedName = names.find(name => categories[name] !== undefined);
  if (matchedName) {
    return { rate: categories[matchedName], source: `category:${matchedName}` };
  }
  return { rate: marketplace.defaultRate, source: 'marketplace_default' };
}

function resolveCommission(deal, platform, rules, finalPrice) {
  const direct = [
    deal.commissionRate,
    deal.commission_rate,
    deal.commissionPercentage,
    deal.commission_percentage
  ].find(value => normalizeCommissionRate(value) !== null);
  const fallback = categoryRule(rules, platform, deal);
  const rate = normalizeCommissionRate(direct ?? fallback.rate);
  if (rate === null) return null;
  return {
    rate,
    estimatedAmount: finalPrice
      ? Number((finalPrice * rate / 100).toFixed(2))
      : null,
    source: direct !== undefined ? 'product_feed' : fallback.source,
    checkedAt: deal.commissionCheckedAt || rules?.updatedAt || null,
    confidence: direct !== undefined ? 'high' : 'medium'
  };
}

function velocityForDeal(historyEntries, key, currentSales, now) {
  if (!Number.isFinite(currentSales)) return null;
  const cutoff = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  const previous = historyEntries
    .filter(entry => entry.dealKey === key && Number.isFinite(entry.salesCount))
    .filter(entry => new Date(entry.capturedAt).getTime() >= cutoff)
    .filter(entry => new Date(entry.capturedAt).getTime() < now.getTime())
    .sort((left, right) => new Date(left.capturedAt) - new Date(right.capturedAt))[0];
  if (!previous || previous.salesCount > currentSales) return null;
  const days = Math.max(
    1 / 24,
    (now.getTime() - new Date(previous.capturedAt).getTime()) / 86_400_000
  );
  return Number(((currentSales - previous.salesCount) / days).toFixed(2));
}

function component(score, coverage, reasons = []) {
  return {
    score: Number.isFinite(score) ? Math.round(clamp(score)) : null,
    available: coverage > 0,
    coverage: Math.round(clamp(coverage)),
    reasons
  };
}

function scoreDeals(deals, options = {}) {
  const platform = normalizePlatform(options.platform);
  const now = options.now || new Date();
  const historyEntries = Array.isArray(options.history?.entries)
    ? options.history.entries
    : [];
  const prepared = (Array.isArray(deals) ? deals : []).map(deal => {
    const currentPrice = parsePrice(
      deal.verifiedPricing?.finalPrice || deal.currentPrice
    );
    const salesCount = Number.isFinite(deal.salesCount)
      ? Number(deal.salesCount)
      : parseSalesCount(deal.salesInfo);
    const key = dealKey(deal, platform);
    const salesVelocity = velocityForDeal(
      historyEntries,
      key,
      salesCount,
      now
    );
    const commission = resolveCommission(
      deal,
      platform,
      options.commissionRules || {},
      currentPrice
    );
    return { deal, key, currentPrice, salesCount, salesVelocity, commission };
  });

  const sorted = field => prepared
    .map(item => item[field])
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const salesValues = sorted('salesCount');
  const velocityValues = sorted('salesVelocity');
  const commissionRates = prepared
    .map(item => item.commission?.rate)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const commissionAmounts = prepared
    .map(item => item.commission?.estimatedAmount)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  return prepared.map(item => {
    const { deal, currentPrice, salesCount, salesVelocity, commission } = item;
    const rating = Number(deal.rating) || null;
    const shopRating = Number(deal.shopRating) || null;
    const likes = Number(deal.likes);
    const discount = deal.discountSource === 'synthetic'
      ? null
      : Number(deal.discount);
    const comparisonScore = deal.comparison?.success
      ? Number(deal.comparison.score) * 10
      : null;
    const demand = weightedAvailable([
      { score: percentile(salesCount, salesValues), weight: 0.65 },
      { score: percentile(salesVelocity, velocityValues), weight: 0.25 },
      { score: Number.isFinite(likes) && likes > 0 ? clamp(Math.log10(likes + 1) * 30) : null, weight: 0.1 }
    ]);
    const offer = weightedAvailable([
      { score: comparisonScore, weight: 0.7 },
      { score: Number.isFinite(discount) && discount >= 0 ? scoreDiscount(discount) : null, weight: 0.3 }
    ]);
    const commissionScore = weightedAvailable([
      { score: percentile(commission?.rate, commissionRates), weight: 0.5 },
      { score: percentile(commission?.estimatedAmount, commissionAmounts), weight: 0.5 }
    ]);
    const trust = weightedAvailable([
      { score: rating ? clamp((rating - 3) / 2 * 100) : null, weight: 0.55 },
      { score: shopRating ? clamp((shopRating - 3) / 2 * 100) : null, weight: 0.25 },
      { score: deal.isFull || deal.isFreeShipping ? 90 : null, weight: 0.1 },
      { score: deal.officialFeed ? 90 : null, weight: 0.1 }
    ]);
    const components = {
      demand: component(demand.score, demand.coverage, [
        salesVelocity !== null
          ? `${salesVelocity} vendas/dia estimadas`
          : salesCount !== null
            ? `${salesCount} vendas acumuladas`
            : 'Sem dados de vendas recentes'
      ]),
      offer: component(offer.score, offer.coverage, [
        comparisonScore !== null
          ? 'Comparado com outros marketplaces'
          : 'Sem comparacao externa confirmada'
      ]),
      commission: component(commissionScore.score, commissionScore.coverage, [
        commission
          ? `${commission.rate}% (${commission.estimatedAmount?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'valor indisponivel'})`
          : 'Comissao nao informada'
      ]),
      trust: component(trust.score, trust.coverage)
    };
    let availableWeight = 0;
    let weightedScore = 0;
    for (const [name, weight] of Object.entries(SCORE_WEIGHTS)) {
      if (!components[name].available) continue;
      const evidenceWeight = weight * components[name].coverage / 100;
      availableWeight += evidenceWeight;
      weightedScore += components[name].score * evidenceWeight;
    }
    const rawScore = availableWeight ? weightedScore / availableWeight : 0;
    const confidence = clamp(availableWeight);
    const adjustedScore = 50 + (rawScore - 50) * confidence / 100;
    const blockers = [];
    if (!deal.title) blockers.push('Titulo ausente');
    if (!deal.link && !deal.productLink) blockers.push('Link do produto ausente');
    if (!currentPrice) blockers.push('Preco atual invalido');
    if (!deal.image) blockers.push('Imagem ausente');
    const value = Math.round(clamp(adjustedScore));
    return {
      ...deal,
      platform,
      salesCount,
      salesVelocity,
      commission,
      promotionScore: {
        value,
        stars: scoreToStars(value),
        confidence: Math.round(confidence),
        label: value >= 90
          ? 'Potencial excepcional'
          : value >= 80
            ? 'Potencial muito alto'
            : value >= 70
              ? 'Potencial alto'
              : value >= 60
                ? 'Potencial moderado'
                : 'Potencial baixo',
        eligible: blockers.length === 0,
        blockers,
        components,
        calculatedAt: now.toISOString()
      }
    };
  });
}

function loadDealHistory(historyPath) {
  return loadJson(historyPath, { version: 1, entries: [] });
}

function recordDealSnapshots(historyPath, deals, platform, generatedAt) {
  if (!generatedAt || !Array.isArray(deals) || deals.length === 0) return false;
  const history = loadDealHistory(historyPath);
  const capturedAt = new Date(generatedAt).toISOString();
  if (history.entries.some(entry =>
    entry.platform === normalizePlatform(platform) && entry.capturedAt === capturedAt
  )) return false;
  for (const deal of deals) {
    history.entries.push({
      dealKey: dealKey(deal, platform),
      platform: normalizePlatform(platform),
      capturedAt,
      price: parsePrice(deal.currentPrice),
      salesCount: Number.isFinite(deal.salesCount)
        ? Number(deal.salesCount)
        : parseSalesCount(deal.salesInfo),
      rating: Number(deal.rating) || null,
      likes: Number(deal.likes) || null,
      discount: Number(deal.discount) || 0,
      commissionRate: normalizeCommissionRate(deal.commissionRate)
    });
  }
  const cutoff = Date.now() - 120 * 24 * 60 * 60 * 1000;
  history.entries = history.entries
    .filter(entry => new Date(entry.capturedAt).getTime() >= cutoff)
    .slice(-50_000);
  saveJsonAtomic(historyPath, history);
  return true;
}

module.exports = {
  SCORE_WEIGHTS,
  dealKey,
  loadDealHistory,
  normalizeCommissionRate,
  parseSalesCount,
  recordDealSnapshots,
  resolveCommission,
  scoreDiscount,
  scoreDeals,
  scoreToStars
};
