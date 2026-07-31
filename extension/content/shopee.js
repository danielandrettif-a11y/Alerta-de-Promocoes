(() => {
  const LINK_PATTERN = /https:\/\/s\.shopee\.com\.br\/[A-Za-z0-9_-]+/;

  function normalizedText(value) {
    return String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  }

  function visible(element) {
    return !!element && element.getClientRects().length > 0;
  }

  function findProductInput(root = document) {
    const fields = [...root.querySelectorAll('input, textarea')].filter(visible);
    return fields.find(field => {
      const hint = normalizedText([
        field.placeholder,
        field.getAttribute('aria-label'),
        field.closest('label, .form-item, .ant-form-item')?.textContent
      ].join(' '));
      return !hint.includes('sub_id') && !hint.includes('sub id') &&
        /(link|url|shopee)/.test(hint);
    }) || fields.find(field => field.tagName === 'INPUT');
  }

  function findGenerateButton(root = document) {
    return [...root.querySelectorAll('button')].find(button =>
      visible(button) && normalizedText(button.textContent).trim() === 'obter link'
    );
  }

  function findAffiliateLink(root = document) {
    for (const element of root.querySelectorAll('input, textarea, a')) {
      const match = String(
        element.value || element.href || element.textContent || ''
      ).match(LINK_PATTERN);
      if (match) return match[0];
    }
    return root.body?.innerText.match(LINK_PATTERN)?.[0] || null;
  }

  function setFieldValue(field, value) {
    const prototype = field.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function waitFor(find, timeoutMs) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const value = find();
        if (value) {
          clearInterval(timer);
          resolve(value);
        } else if (Date.now() - started >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('timeout'));
        }
      }, 250);
    });
  }

  async function generateShopeeAffiliateLink(productLink, timeoutMs = 60000) {
    if (/login|captcha|verification|challenge/i.test(location.href)) {
      return {
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'A Shopee solicitou autenticação.'
      };
    }
    try {
      const input = await waitFor(() => findProductInput(document), timeoutMs);
      setFieldValue(input, productLink);
      const button = await waitFor(() => findGenerateButton(document), timeoutMs);
      button.click();
      const affiliateLink = await waitFor(
        () => findAffiliateLink(document),
        timeoutMs
      );
      return { success: true, affiliateLink, observedPrice: null };
    } catch {
      return {
        success: false,
        code: 'AFFILIATE_LINK_NOT_FOUND',
        message: 'A Shopee não gerou o link afiliado no tempo esperado.'
      };
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type !== 'GENERATE_SHOPEE_AFFILIATE_LINK') return;
      generateShopeeAffiliateLink(
        message.productLink,
        message.timeoutMs
      ).then(sendResponse);
      return true;
    });
  }

  if (typeof module !== 'undefined') {
    module.exports = {
      LINK_PATTERN,
      normalizedText,
      findProductInput,
      findGenerateButton,
      findAffiliateLink
    };
  }
})();
