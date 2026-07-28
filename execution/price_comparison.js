const {
  getQueryTokens,
  normalizeText,
  searchMarketplaces
} = require('./marketplace_search.js');

const IGNORED_TOKENS = new Set([
  'acompanha', 'combo', 'completo', 'frete', 'gratis', 'kit', 'modelo',
  'novo', 'nova', 'oferta', 'oficial', 'original', 'para', 'produto'
]);
const ACCESSORY_TOKENS = new Set([
  'adaptador', 'cabo', 'capa', 'carregador', 'controle', 'pelicula',
  'peca', 'refil', 'suporte'
]);
const CONDITION_TOKENS = new Set([
  'recondicionado', 'seminovo', 'usado', 'vitrine'
]);
const VARIANT_TOKENS = new Set([
  'lite', 'max', 'mini', 'plus', 'pro', 'ultra'
]);

function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '')
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPrice(value) {
  return `R$ ${Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function cleanSearchQuery(title) {
  const stopWords = new Set([
    'com', 'cor', 'frete', 'gratis', 'modelo', 'nova', 'novo', 'oficial',
    'original', 'para', 'promocao'
  ]);
  const tokens = getQueryTokens(title)
    .filter(token => !stopWords.has(token));
  const mixedIdentity = tokens.filter(token =>
    /[a-z]/i.test(token) && /\d/.test(token)
  );
  const numericIdentity = tokens.filter(token => /^\d{2,}$/.test(token));
  return [...new Set([
    ...mixedIdentity,
    ...numericIdentity,
    ...tokens.filter(token => token.length >= 4)
  ])].slice(0, 8).join(' ');
}

function getIdentityTokens(query) {
  return getQueryTokens(query).filter(token =>
    (
      (/[a-z]/i.test(token) && /\d/.test(token)) ||
      /^\d{2,}$/.test(token)
    ) &&
    token.length >= 2
  );
}

function getStrongIdentityTokens(title) {
  const normalized = normalizeText(title).replace(/\s+/g, '');
  const units = normalized.match(
    /\d+(?:[.,]\d+)?(?:a|btu|cm|gb|kg|mah|mb|mm|pol|tb|v|w)\b/g
  ) || [];
  const mixedModels = getQueryTokens(title).filter(token =>
    /[a-z]/.test(token) && /\d/.test(token)
  );
  const largeNumbers = getQueryTokens(title).filter(token =>
    /^\d{2,}$/.test(token)
  );
  return [...new Set([...units, ...mixedModels, ...largeNumbers])];
}

function getComparableTokens(title) {
  return getQueryTokens(title)
    .filter(token =>
      token.length >= 3 &&
      !IGNORED_TOKENS.has(token)
    )
    .slice(0, 10);
}

function hasUnexpectedToken(candidateTokens, offerTokens, vocabulary) {
  return candidateTokens.some(token =>
    vocabulary.has(token) && !offerTokens.includes(token)
  );
}

function matchProduct(offerTitle, candidateTitle) {
  const offerTokens = getComparableTokens(offerTitle);
  const candidateTokens = getQueryTokens(candidateTitle);
  const normalizedCandidate = normalizeText(candidateTitle).replace(/\s+/g, '');
  const missingIdentity = getStrongIdentityTokens(offerTitle)
    .filter(token => !normalizedCandidate.includes(token.replace(/\s+/g, '')));
  const accessoryConflict =
    hasUnexpectedToken(candidateTokens, offerTokens, ACCESSORY_TOKENS) ||
    hasUnexpectedToken(candidateTokens, offerTokens, CONDITION_TOKENS);
  const variantConflict =
    hasUnexpectedToken(candidateTokens, offerTokens, VARIANT_TOKENS) ||
    hasUnexpectedToken(offerTokens, candidateTokens, VARIANT_TOKENS);
  const matches = offerTokens.filter(token => candidateTokens.includes(token));
  const score = offerTokens.length
    ? Math.round((matches.length / offerTokens.length) * 100)
    : 0;
  const accepted =
    score >= 55 &&
    missingIdentity.length === 0 &&
    !accessoryConflict &&
    !variantConflict;
  const reasons = [];
  if (missingIdentity.length) {
    reasons.push(`Especificação ausente: ${missingIdentity.join(', ')}`);
  }
  if (accessoryConflict) reasons.push('Resultado parece acessório ou produto usado');
  if (variantConflict) reasons.push('Versão diferente do produto');
  if (score < 55) reasons.push('Poucos termos correspondentes');
  return { accepted, score, reasons };
}

function isPlausibleComparison(currentPrice, marketPrice) {
  const current = parsePrice(currentPrice);
  const market = parsePrice(marketPrice);
  if (!current || !market) return false;
  return market >= current * 0.45 && market <= current * 2.5;
}

function median(values) {
  const sorted = values
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isSameProductUrl(left, right) {
  if (!left || !right) return false;
  try {
    const first = new URL(left);
    const second = new URL(right);
    return first.hostname === second.hostname &&
      first.pathname.replace(/\/+$/, '') === second.pathname.replace(/\/+$/, '');
  } catch {
    return left === right;
  }
}

function assessComparison(currentPrice, marketPrice) {
  const current = parsePrice(currentPrice);
  const market = parsePrice(marketPrice);
  if (!current || !market) {
    return { code: 'unavailable', label: 'Comparação indisponível', difference: 0 };
  }
  const difference = market - current;
  const tolerance = current * 0.03;
  if (difference > tolerance) {
    return { code: 'good', label: 'Bom preço frente aos comparadores', difference };
  }
  if (difference < -tolerance) {
    return { code: 'higher', label: 'Há preço menor em outro comparador', difference };
  }
  return { code: 'similar', label: 'Preço semelhante ao mercado', difference };
}

function scoreOffer(currentPrice, marketPrice) {
  const current = parsePrice(currentPrice);
  const market = parsePrice(marketPrice);
  if (!current || !market) {
    return { score: null, label: 'Comparação inconclusiva', differencePercent: 0 };
  }
  const differencePercent = ((market - current) / market) * 100;
  if (differencePercent >= 20) return { score: 10, label: 'Promoção excelente', differencePercent };
  if (differencePercent >= 15) return { score: 9, label: 'Ótima promoção', differencePercent };
  if (differencePercent >= 10) return { score: 8, label: 'Boa promoção', differencePercent };
  if (differencePercent >= 5) return { score: 7, label: 'Boa promoção', differencePercent };
  if (differencePercent >= 2) return { score: 6, label: 'Pouca economia', differencePercent };
  if (differencePercent >= -2) return { score: 5, label: 'Preço normal', differencePercent };
  if (differencePercent >= -5) return { score: 4, label: 'Pouco acima do mercado', differencePercent };
  if (differencePercent >= -10) return { score: 3, label: 'Oferta fraca', differencePercent };
  if (differencePercent >= -20) return { score: 1, label: 'Oferta ruim', differencePercent };
  return { score: 0, label: 'Muito acima do mercado', differencePercent };
}

function buildComparisonFromResults({
  title,
  currentPrice,
  sourceUrl,
  searchResult
}) {
  const candidates = (searchResult.results || [])
    .filter(result => result.price && !isSameProductUrl(result.url, sourceUrl))
    .map(result => ({
      ...result,
      match: matchProduct(title, result.title)
    }));
  const accepted = candidates.filter(candidate => candidate.match.accepted);
  const bestByMarketplace = new Map();
  for (const candidate of accepted) {
    const previous = bestByMarketplace.get(candidate.marketplace);
    if (
      !previous ||
      candidate.match.score > previous.match.score ||
      (
        candidate.match.score === previous.match.score &&
        candidate.price < previous.price
      )
    ) {
      bestByMarketplace.set(candidate.marketplace, candidate);
    }
  }
  let matches = [...bestByMarketplace.values()];
  const initialMedian = median(matches.map(match => match.price));
  if (initialMedian) {
    const withoutOutliers = matches.filter(match =>
      match.price >= initialMedian * 0.55 &&
      match.price <= initialMedian * 1.8
    );
    if (withoutOutliers.length >= 2) matches = withoutOutliers;
  }
  matches.sort((left, right) => left.price - right.price);
  const googleUrl =
    `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(title)}`;
  const base = {
    query: searchResult.query || title,
    checkedAt: searchResult.checkedAt || new Date().toISOString(),
    cached: searchResult.cached === true,
    googleUrl,
    matches,
    rejectedCount: candidates.length - accepted.length,
    sources: searchResult.sources || []
  };
  if (matches.length < 2) {
    return {
      ...base,
      success: false,
      sourcesCount: matches.length,
      error: 'Poucos produtos equivalentes para calcular uma nota confiável.'
    };
  }
  const medianPrice = median(matches.map(match => match.price));
  const minPrice = Math.min(...matches.map(match => match.price));
  const assessment = scoreOffer(currentPrice, medianPrice);
  const current = parsePrice(currentPrice);
  return {
    ...base,
    success: true,
    minPrice,
    minPriceText: formatPrice(minPrice),
    medianPrice,
    medianPriceText: formatPrice(medianPrice),
    priceText: formatPrice(medianPrice),
    sourcesCount: matches.length,
    confidence: matches.length >= 3 ? 'alta' : 'média',
    score: assessment.score,
    label: assessment.label,
    savingsAmount: medianPrice - current,
    savingsPercent: assessment.differencePercent
  };
}

function buildWhatsappComparison(comparison, currentPrice) {
  if (!comparison?.success) {
    return '\n\n📊 *Oferta: sem nota — comparação inconclusiva*\n' +
      '_Não encontramos produtos equivalentes suficientes._';
  }
  const referencePrice = comparison.medianPrice || comparison.minPrice;
  const referenceText =
    comparison.medianPriceText || comparison.priceText || formatPrice(referencePrice);
  const assessment = scoreOffer(currentPrice, referencePrice);
  const sourcesCount = Number(comparison.sourcesCount) || 1;
  const confidence = comparison.confidence ||
    (sourcesCount >= 3 ? 'alta' : sourcesCount === 2 ? 'média' : 'baixa');
  const percent = Math.abs(assessment.differencePercent).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
  const position = assessment.differencePercent > 2
    ? `${percent}% abaixo`
    : assessment.differencePercent < -2
      ? `${percent}% acima`
      : 'praticamente igual';
  return `\n\n📊 *Oferta: ${assessment.score}/10 — ${assessment.label}*\n` +
    `💰 ${position} da mediana em outras lojas (${referenceText})\n` +
    `🔎 Confiança ${confidence} · ${sourcesCount} loja(s)\n` +
    '_Estimativa; confira modelo, frete e pagamento._';
}

async function compareProductPrices({
  title,
  currentPrice,
  sourceUrl,
  cachePath,
  cacheMinutes = 30,
  maxPerMarketplace = 4
}) {
  const numericCurrentPrice = parsePrice(currentPrice);
  const searchQuery = cleanSearchQuery(title);
  if (!searchQuery || !numericCurrentPrice) {
    return { success: false, error: 'Produto ou preço inválido para comparação.' };
  }
  const searchResult = await searchMarketplaces({
    query: searchQuery,
    cachePath,
    cacheMinutes,
    maxPerMarketplace
  });
  if (!searchResult.success) return searchResult;
  return buildComparisonFromResults({
    title,
    currentPrice: numericCurrentPrice,
    sourceUrl,
    searchResult
  });
}

module.exports = {
  parsePrice,
  formatPrice,
  cleanSearchQuery,
  getIdentityTokens,
  getStrongIdentityTokens,
  matchProduct,
  isPlausibleComparison,
  median,
  isSameProductUrl,
  assessComparison,
  scoreOffer,
  buildComparisonFromResults,
  buildWhatsappComparison,
  compareProductPrices
};
