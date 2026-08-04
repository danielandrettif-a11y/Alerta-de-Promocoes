(() => {
  const LINK_PATTERN = /https:\/\/meli\.la\/[A-Za-z0-9_-]+/;

  function normalizedText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 &&
      style.display !== 'none' && style.visibility !== 'hidden';
  }

  function isShareLabel(value) {
    return normalizedText(value).includes('compartilhar');
  }

  function findShareButton(root = document) {
    return [...root.querySelectorAll('button, a, [role="button"]')]
      .find(element =>
        isVisible(element) &&
        [
          element.textContent,
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.value
        ].some(isShareLabel)
      ) || null;
  }

  function isUsableLabelOption(value) {
    const text = normalizedText(value).trim();
    return /[a-z0-9]/.test(text) &&
      !text.includes('selecione') &&
      !text.includes('criar etiqueta') &&
      !text.includes('nova etiqueta') &&
      !text.includes('gerenciar etiqueta') &&
      !text.includes('sem etiqueta') &&
      !text.includes('nenhuma etiqueta');
  }

  function findAffiliateDialog(root = document) {
    return [...root.querySelectorAll(
      '[role="dialog"], .andes-modal, .andes-modal__content'
    )].find(element =>
      isVisible(element) &&
      normalizedText(element.textContent).includes('etiqueta em uso')
    ) || null;
  }

  function findLabelControl(dialog) {
    return dialog?.querySelector(
      'select, [role="combobox"], .andes-dropdown__trigger'
    ) || null;
  }

  function findLabelOption(root = document, excluded = new Set()) {
    const options = [...root.querySelectorAll(
      '[role="option"], .andes-list__item'
    )];
    return options.find(element =>
      !excluded.has(element) &&
      isVisible(element) &&
      !element.matches('[aria-disabled="true"], [disabled]') &&
      isUsableLabelOption(element.textContent)
    ) || null;
  }

  function detectPageProblem() {
    const text = normalizedText(document.body?.innerText);
    if (
      /login|captcha|verification|challenge/i.test(location.href) ||
      text.includes('acesse sua conta') ||
      text.includes('inicie sessao') ||
      text.includes('codigo de verificacao') ||
      text.includes('nao sou um robo') ||
      text.includes('verifique sua identidade')
    ) {
      return {
        code: 'AUTH_REQUIRED',
        message: 'O Mercado Livre solicitou autenticação.'
      };
    }
    if (
      text.includes('produto indisponivel') ||
      text.includes('anuncio finalizado')
    ) {
      return {
        code: 'PRODUCT_UNAVAILABLE',
        message: 'O produto não está mais disponível.'
      };
    }
    return null;
  }

  function findAffiliateLink(root = document) {
    const elements = root.querySelectorAll('input, textarea, a, [role="dialog"] *');
    for (const element of elements) {
      for (const value of [
        element.value,
        element.href,
        element.textContent
      ]) {
        const match = String(value || '').match(LINK_PATTERN);
        if (match) return match[0];
      }
    }
    return String(root.body?.innerText || '').match(LINK_PATTERN)?.[0] || null;
  }

  function parsePriceText(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    const text = String(value || '')
      .replace(/R\$/gi, '')
      .replace(/\s/g, '')
      .replace(/[^\d.,]/g, '');
    if (!text) return null;
    let normalized = text;
    if (text.includes(',')) {
      normalized = text.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) {
      normalized = text.replace(/\./g, '');
    }
    const price = Number.parseFloat(normalized);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function readMoneyElement(element) {
    if (!element) return null;
    const fraction = element.querySelector?.('.andes-money-amount__fraction');
    if (fraction) {
      const whole = fraction.textContent.replace(/\D/g, '');
      const cents = element
        .querySelector('.andes-money-amount__cents')
        ?.textContent.replace(/\D/g, '') || '';
      return parsePriceText(`${whole}${cents ? `,${cents}` : ''}`);
    }
    return parsePriceText(
      element.getAttribute?.('content') ||
      element.getAttribute?.('data-price') ||
      element.textContent
    );
  }

  function findCurrentPrice(root = document) {
    const selectors = [
      '.ui-pdp-price__second-line .andes-money-amount:not(.andes-money-amount--previous)',
      '.ui-pdp-price__main-container .andes-money-amount:not(.andes-money-amount--previous)',
      '[data-testid="price-part"] .andes-money-amount:not(.andes-money-amount--previous)',
      '[itemprop="price"]'
    ];
    for (const selector of selectors) {
      const price = readMoneyElement(root.querySelector(selector));
      if (price) return price;
    }
    for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const entries = JSON.parse(script.textContent);
        for (const entry of Array.isArray(entries) ? entries : [entries]) {
          const type = Array.isArray(entry?.['@type'])
            ? entry['@type']
            : [entry?.['@type']];
          if (!type.includes('Product')) continue;
          const offers = Array.isArray(entry.offers)
            ? entry.offers
            : [entry.offers];
          for (const offer of offers) {
            const price = parsePriceText(offer?.price);
            if (price) return price;
          }
        }
      } catch {}
    }
    return null;
  }

  function findProductCoupon(candidates = [], root = document) {
    const visibleText = String(root.body?.innerText || '');
    const upperText = visibleText.toUpperCase();
    const pricePatterns = [
      /R\$\s*([\d.]+(?:,\d{1,2})?)\s*(?:à vista\s*)?com\s+cupom/ig,
      /com\s+cupom[^\d]{0,30}R\$\s*([\d.]+(?:,\d{1,2})?)/ig
    ];
    const priceWithoutCoupon = findCurrentPrice(root);
    let bestCoupon = null;
    for (const candidate of candidates) {
      const code = String(candidate.code || '').trim().toUpperCase();
      const codeIndex = code.length >= 4 ? upperText.indexOf(code) : -1;
      if (codeIndex < 0) continue;
      const context = visibleText.slice(
        Math.max(0, codeIndex - 250),
        codeIndex + code.length + 250
      );
      for (const pattern of pricePatterns) {
        pattern.lastIndex = 0;
        for (const match of context.matchAll(pattern)) {
          const priceWithCoupon = parsePriceText(match[1]);
          if (
            priceWithCoupon &&
            priceWithoutCoupon &&
            priceWithCoupon < priceWithoutCoupon
          ) {
            if (!bestCoupon || priceWithCoupon < bestCoupon.priceWithCoupon) {
              bestCoupon = { code, priceWithoutCoupon, priceWithCoupon };
            }
          }
        }
      }
    }
    return bestCoupon;
  }

  async function detectProductCoupon(candidates = [], timeoutMs = 5000) {
    if (!candidates.length) return { success: true, coupon: null };
    let coupon = findProductCoupon(candidates, document);
    if (!coupon) {
      const trigger = [...document.querySelectorAll(
        'button, a, [role="button"]'
      )].find(element =>
        isVisible(element) &&
        normalizedText(element.textContent).includes('cupom')
      );
      if (trigger) {
        trigger.click();
        coupon = await waitFor(
          () => findProductCoupon(candidates, document),
          Math.min(timeoutMs, 5000)
        ).catch(() => null);
      }
    }
    return { success: true, coupon };
  }

  function waitFor(check, timeoutMs, intervalMs = 250) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const poll = () => {
        const pageProblem = detectPageProblem();
        if (pageProblem) {
          reject(Object.assign(new Error(pageProblem.message), pageProblem));
          return;
        }
        const result = check();
        if (result) {
          resolve(result);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(Object.assign(new Error('Tempo limite excedido.'), {
            code: 'TIMEOUT'
          }));
          return;
        }
        setTimeout(poll, intervalMs);
      };
      poll();
    });
  }

  async function selectAffiliateLabelIfNeeded(timeoutMs) {
    const firstResult = await waitFor(
      () => findAffiliateLink(document) || findAffiliateDialog(document),
      Math.min(timeoutMs, 10000)
    );
    if (typeof firstResult === 'string') return firstResult;

    const control = await waitFor(
      () => findLabelControl(firstResult),
      Math.min(timeoutMs, 5000)
    );
    if (
      control instanceof HTMLSelectElement &&
      control.value
    ) {
      return null;
    }
    if (
      !(control instanceof HTMLSelectElement) &&
      isUsableLabelOption(control.textContent)
    ) {
      return null;
    }

    if (control instanceof HTMLSelectElement) {
      const option = [...control.options].find(item =>
        !item.disabled &&
        item.value &&
        isUsableLabelOption(item.textContent)
      );
      if (!option) return false;
      control.value = option.value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return null;
    }

    const visibleOptionsBefore = new Set(
      [...document.querySelectorAll('[role="option"], .andes-list__item')]
        .filter(isVisible)
    );
    control.click();
    const option = await waitFor(
      () => findLabelOption(document, visibleOptionsBefore),
      Math.min(timeoutMs, 5000)
    ).catch(() => null);
    if (!option) return false;
    option.click();
    return null;
  }

  async function locateAffiliateShareButton(timeoutMs = 30000) {
    const initialProblem = detectPageProblem();
    if (initialProblem) return { success: false, ...initialProblem };
    let stripe;
    try {
      stripe = await waitFor(
        () => document.querySelector('#stripe'),
        Math.min(timeoutMs, 15000)
      );
    } catch (error) {
      return {
        success: false,
        code: error.code === 'AUTH_REQUIRED'
          ? error.code
          : 'AFFILIATE_BAR_NOT_FOUND',
        message: error.code === 'AUTH_REQUIRED'
          ? error.message
          : 'A barra de afiliados (#stripe) não apareceu.'
      };
    }

    let shareButton;
    try {
      shareButton = await waitFor(
        () => findShareButton(stripe),
        Math.min(timeoutMs, 15000)
      );
    } catch (error) {
      return {
        success: false,
        code: error.code === 'AUTH_REQUIRED'
          ? error.code
          : 'SHARE_BUTTON_NOT_FOUND',
        message: error.code === 'AUTH_REQUIRED'
          ? error.message
          : 'O botão Compartilhar não apareceu na barra de afiliados.'
      };
    }
    const rect = shareButton.getBoundingClientRect();
    return {
      success: true,
      clickPoint: {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
      }
    };
  }

  async function extractAffiliateLink(timeoutMs = 30000) {
    try {
      const earlyLink = await selectAffiliateLabelIfNeeded(timeoutMs);
      if (typeof earlyLink === 'string') {
        return {
          success: true,
          affiliateLink: earlyLink,
          observedPrice: findCurrentPrice(document)
        };
      }
      const affiliateLink = await waitFor(
        () => findAffiliateLink(document),
        timeoutMs
      );
      return {
        success: true,
        affiliateLink,
        observedPrice: findCurrentPrice(document)
      };
    } catch (error) {
      return {
        success: false,
        code: error.code === 'AUTH_REQUIRED'
          ? error.code
          : 'AFFILIATE_LINK_NOT_FOUND',
        message: error.code === 'AUTH_REQUIRED'
          ? error.message
          : 'O link meli.la não apareceu após compartilhar.'
      };
    }
  }

  async function generateAffiliateLink(timeoutMs = 30000) {
    const locationResult = await locateAffiliateShareButton(timeoutMs);
    if (!locationResult.success) return locationResult;
    const shareButton = findShareButton(document.querySelector('#stripe'));
    if (!shareButton) {
      return {
        success: false,
        code: 'SHARE_BUTTON_NOT_FOUND',
        message: 'O botão Compartilhar não foi encontrado.'
      };
    }
    shareButton.click();
    return extractAffiliateLink(timeoutMs);
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'DETECT_PRODUCT_COUPON') {
        detectProductCoupon(
          message.candidates,
          message.timeoutMs
        ).then(sendResponse);
        return true;
      }
      const actions = {
        LOCATE_AFFILIATE_SHARE: locateAffiliateShareButton,
        EXTRACT_AFFILIATE_LINK: extractAffiliateLink,
        GENERATE_AFFILIATE_LINK: generateAffiliateLink
      };
      const action = actions[message.type];
      if (!action) return;
      action(message.timeoutMs).then(sendResponse);
      return true;
    });
  }

  if (typeof module !== 'undefined') {
    module.exports = {
      LINK_PATTERN,
      normalizedText,
      isShareLabel,
      isUsableLabelOption,
      findShareButton,
      findAffiliateDialog,
      findLabelControl,
      findLabelOption,
      findAffiliateLink,
      parsePriceText,
      findCurrentPrice,
      findProductCoupon,
      detectProductCoupon,
      selectAffiliateLabelIfNeeded,
      locateAffiliateShareButton,
      extractAffiliateLink,
      generateAffiliateLink
    };
  }
})();
