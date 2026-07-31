const { formatPrice, parsePrice } = require('./price_comparison.js');

const CATEGORY_TERMS = {
  tecnologia: ['celular', 'smartphone', 'tv', 'monitor', 'notebook', 'camera'],
  casa: ['casa', 'cozinha', 'panela', 'moveis', 'ferramenta', 'construcao'],
  beleza: ['beleza', 'perfume', 'shampoo', 'cabelo', 'skincare', 'hidratante'],
  esporte: ['esporte', 'fitness', 'treino', 'academia', 'bike', 'tenis'],
  moda: ['moda', 'roupa', 'calcado', 'tenis', 'bolsa', 'fashion']
};

function normalizedText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseCouponRules(coupon) {
  const rules = normalizedText(coupon?.rules);
  const percent = Number(rules.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:off|de desconto|de economia)/i)?.[1]?.replace(',', '.')) || 0;
  const fixed = parsePrice(
    rules.match(/r\$\s*([\d.,]+)\s*(?:off|de desconto)/i)?.[1]
  ) || 0;
  const minimum = parsePrice(
    rules.match(/(?:a partir de|acima de|minim[ao]s? de|compras? (?:minimas? )?de)\s*r\$\s*([\d.,]+)/i)?.[1]
  ) || 0;
  const maximum = parsePrice(
    rules.match(/(?:maximo|limitado|limite|desconto maximo)[^\d]{0,20}r\$\s*([\d.,]+)/i)?.[1]
  ) || 0;
  return { percent, fixed, minimum, maximum };
}

function couponMatchesProduct(coupon, deal) {
  const rules = normalizedText(coupon?.rules);
  const title = normalizedText(deal?.title);
  const price = parsePrice(deal?.currentPrice);
  const parsed = parseCouponRules(coupon);
  if (!price || price < parsed.minimum) return false;

  for (const [category, terms] of Object.entries(CATEGORY_TERMS)) {
    if (
      rules.includes(category) &&
      !terms.some(term => title.includes(term))
    ) return false;
  }
  return parsed.percent > 0 || parsed.fixed > 0;
}

function estimateCoupon(coupon, deal) {
  if (!couponMatchesProduct(coupon, deal)) return null;
  const price = parsePrice(deal.currentPrice);
  const rules = parseCouponRules(coupon);
  let savings = rules.fixed || price * rules.percent / 100;
  if (rules.maximum > 0) savings = Math.min(savings, rules.maximum);
  savings = Math.min(price, Math.max(0, savings));
  return {
    code: String(coupon.code || '').trim().toUpperCase(),
    rules: String(coupon.rules || ''),
    estimatedSavings: Number(savings.toFixed(2)),
    estimatedPrice: Number((price - savings).toFixed(2))
  };
}

function findCouponCandidates(deal, coupons, limit = 5) {
  return (Array.isArray(coupons) ? coupons : [])
    .map(coupon => estimateCoupon(coupon, deal))
    .filter(candidate => candidate?.code)
    .sort((left, right) => right.estimatedSavings - left.estimatedSavings)
    .slice(0, limit);
}

function normalizeVerifiedCoupon(item, rawCoupon, coupons, now = new Date()) {
  if (item?.platform !== 'mercado_livre' || !rawCoupon) return null;
  const code = String(rawCoupon.code || '').trim().toUpperCase();
  const candidate = findCouponCandidates(item, coupons)
    .find(entry => entry.code === code);
  const priceWithoutCoupon =
    parsePrice(rawCoupon.priceWithoutCoupon) ||
    parsePrice(item.latestPrice) ||
    parsePrice(item.currentPrice);
  const priceWithCoupon = parsePrice(rawCoupon.priceWithCoupon);
  if (
    !candidate ||
    !priceWithoutCoupon ||
    !priceWithCoupon ||
    priceWithCoupon >= priceWithoutCoupon ||
    priceWithCoupon < priceWithoutCoupon * 0.1
  ) return null;
  return {
    code,
    rules: candidate.rules,
    priceWithoutCoupon: formatPrice(priceWithoutCoupon),
    priceWithCoupon: formatPrice(priceWithCoupon),
    savings: formatPrice(priceWithoutCoupon - priceWithCoupon),
    verifiedAt: now.toISOString(),
    verificationSource: 'mercado_livre_product_page'
  };
}

module.exports = {
  parseCouponRules,
  couponMatchesProduct,
  estimateCoupon,
  findCouponCandidates,
  normalizeVerifiedCoupon
};
