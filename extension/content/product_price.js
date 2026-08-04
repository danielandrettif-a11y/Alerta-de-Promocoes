(() => {
  function parsePriceText(value) {
    let normalized = String(value || '').replace(/[^\d,.-]/g, '').trim();
    if (!normalized) return null;
    const comma = normalized.lastIndexOf(',');
    const dot = normalized.lastIndexOf('.');
    const decimalIndex = Math.max(comma, dot);
    if (decimalIndex >= 0 && normalized.length - decimalIndex - 1 === 2) {
      normalized = `${normalized.slice(0, decimalIndex).replace(/[.,]/g, '')}.` +
        normalized.slice(decimalIndex + 1);
    } else {
      normalized = normalized.replace(/[.,]/g, '');
    }
    const price = Number(normalized);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function jsonLdPrice(root = document) {
    for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent);
        const pending = Array.isArray(parsed) ? [...parsed] : [parsed];
        while (pending.length) {
          const entry = pending.shift();
          if (!entry || typeof entry !== 'object') continue;
          if (Array.isArray(entry['@graph'])) pending.push(...entry['@graph']);
          const offers = Array.isArray(entry.offers) ? entry.offers : [entry.offers];
          for (const offer of offers) {
            const price = parsePriceText(
              offer?.price || offer?.lowPrice || offer?.priceSpecification?.price
            );
            if (price) return price;
          }
        }
      } catch {}
    }
    return null;
  }

  function readPrice(root = document, hostname = location.hostname) {
    const selectors = hostname.includes('amazon.com.br')
      ? [
        '#corePrice_feature_div .priceToPay .a-offscreen',
        '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
        '#apex_desktop .a-price:not(.a-text-price) .a-offscreen',
        '[data-a-color="price"] .a-offscreen',
        'meta[itemprop="price"]'
      ]
      : [
        '[data-testid="pdp-product-price"]',
        '[class*="product-price"]',
        '[class*="pqTWkA"]',
        'meta[itemprop="price"]'
      ];
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      if (!element) continue;
      const price = parsePriceText(
        element.getAttribute?.('content') || element.textContent
      );
      if (price) return price;
    }
    return jsonLdPrice(root);
  }

  function productIdentity(url = location.href) {
    const asin = String(url).match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1];
    if (asin) return asin.toUpperCase();
    return String(url).match(/-i\.(\d+)\.(\d+)/)?.[2] || null;
  }

  function readProduct(root = document, url = location.href) {
    const observedPrice = readPrice(root, new URL(url).hostname);
    return {
      success: Boolean(observedPrice),
      observedPrice,
      productId: productIdentity(url),
      url,
      message: observedPrice
        ? null
        : 'A pagina abriu, mas o preco atual nao foi identificado.'
    };
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage &&
      !globalThis.__marketplaceProductPriceInstalled) {
    globalThis.__marketplaceProductPriceInstalled = true;
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type !== 'READ_PRODUCT_PRICE') return;
      sendResponse(readProduct());
    });
  }

  if (typeof module !== 'undefined') {
    module.exports = { parsePriceText, productIdentity, readPrice, readProduct };
  }
})();
