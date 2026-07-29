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

  async function generateAffiliateLink(timeoutMs = 30000) {
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
    shareButton.click();
    try {
      const affiliateLink = await waitFor(
        () => findAffiliateLink(document),
        timeoutMs
      );
      return { success: true, affiliateLink };
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

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type !== 'GENERATE_AFFILIATE_LINK') return;
      generateAffiliateLink(message.timeoutMs).then(sendResponse);
      return true;
    });
  }

  if (typeof module !== 'undefined') {
    module.exports = {
      LINK_PATTERN,
      normalizedText,
      isShareLabel,
      findShareButton,
      findAffiliateLink,
      generateAffiliateLink
    };
  }
})();
