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

function normalizeCoupon(coupon, defaultPlatform = 'mercado_livre') {
  const marketplace = String(
    coupon?.marketplace || coupon?.platform || defaultPlatform
  ).toLowerCase();
  const expiresAt = coupon?.expiresAt || coupon?.validUntil || null;
  const expired = expiresAt && new Date(expiresAt).getTime() <= Date.now();
  return {
    ...coupon,
    code: String(coupon?.code || '').trim().toUpperCase(),
    marketplace,
    status: expired
      ? 'expired'
      : coupon?.status || coupon?.verificationStatus || 'discovered',
    expiresAt
  };
}

function normalizeCoupons(coupons, defaultPlatform = 'mercado_livre') {
  return (Array.isArray(coupons) ? coupons : [])
    .map(coupon => normalizeCoupon(coupon, defaultPlatform))
    .filter(coupon => coupon.code);
}

function couponMatchesProduct(coupon, deal) {
  const normalizedCoupon = normalizeCoupon(coupon);
  const dealPlatform = String(deal?.platform || 'mercado_livre').toLowerCase();
  if (normalizedCoupon.marketplace !== dealPlatform) return false;
  if (['expired', 'unavailable'].includes(normalizedCoupon.status)) return false;
  const rules = normalizedText(coupon?.rules);
  const title = normalizedText(deal?.title);
  const price = parsePrice(deal?.currentPrice);
  const parsed = parseCouponRules(coupon);
  if (!price || price < parsed.minimum) return false;
  if (
    /produtos? selecionad/.test(rules) &&
    !Array.isArray(coupon?.eligibleProductIds) &&
    !Array.isArray(coupon?.productIds)
  ) return false;

  const eligibleIds = coupon?.eligibleProductIds || coupon?.productIds;
  if (Array.isArray(eligibleIds) && eligibleIds.length > 0) {
    const productId = String(deal?.itemId || deal?.productId || deal?.dealId || '');
    if (!eligibleIds.map(String).includes(productId)) return false;
  }

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
  return normalizeCoupons(coupons)
    .map(coupon => estimateCoupon(coupon, deal))
    .filter(candidate => candidate?.code)
    .map(candidate => ({
      ...candidate,
      marketplace: String(deal?.platform || 'mercado_livre').toLowerCase(),
      status: 'eligible_estimate'
    }))
    .sort((left, right) => right.estimatedSavings - left.estimatedSavings)
    .slice(0, limit);
}

function findCouponsForVerification(deal, coupons, limit = 50) {
  const platform = String(deal?.platform || 'mercado_livre').toLowerCase();
  return normalizeCoupons(coupons)
    .filter(coupon => coupon.marketplace === platform)
    .filter(coupon => !['expired', 'unavailable'].includes(coupon.status))
    .map(coupon => {
      const estimate = estimateCoupon(coupon, deal);
      return {
        code: coupon.code,
        rules: coupon.rules || '',
        estimatedSavings: estimate?.estimatedSavings || 0,
        status: 'verification_required'
      };
    })
    .sort((left, right) => right.estimatedSavings - left.estimatedSavings)
    .slice(0, Math.min(50, Math.max(1, Number(limit) || 50)));
}

function normalizeVerifiedCoupon(item, rawCoupon, coupons, now = new Date()) {
  if (!item?.platform || !rawCoupon) return null;
  const code = String(rawCoupon.code || '').trim().toUpperCase();
  const candidate = normalizeCoupons(coupons)
    .find(entry => entry.code === code && entry.marketplace === item.platform);
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
    marketplace: item.platform,
    rules: candidate?.rules || String(rawCoupon.rules || ''),
    priceWithoutCoupon: formatPrice(priceWithoutCoupon),
    priceWithCoupon: formatPrice(priceWithCoupon),
    savings: formatPrice(priceWithoutCoupon - priceWithCoupon),
    verifiedAt: now.toISOString(),
    expiresAt: rawCoupon.expiresAt || candidate?.expiresAt || null,
    verificationStatus: 'verified_product',
    productId: item.dealId || item.itemId || null,
    verificationSource: `${item.platform}_product_page`
  };
}

function isVerifiedCoupon(coupon) {
  if (!coupon || coupon.verificationStatus !== 'verified_product') return false;
  if (!parsePrice(coupon.priceWithCoupon) || !coupon.verifiedAt) return false;
  return !coupon.expiresAt || new Date(coupon.expiresAt).getTime() > Date.now();
}

module.exports = {
  parseCouponRules,
  normalizeCoupon,
  normalizeCoupons,
  couponMatchesProduct,
  estimateCoupon,
  findCouponCandidates,
  findCouponsForVerification,
  normalizeVerifiedCoupon,
  isVerifiedCoupon
};
