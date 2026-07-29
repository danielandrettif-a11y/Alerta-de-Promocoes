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
      const earlyLink = await selectAffiliateLabelIfNeeded(timeoutMs);
      if (earlyLink === false) {
        return {
          success: false,
          code: 'AFFILIATE_LABEL_NOT_FOUND',
          message:
            'Nenhuma etiqueta de afiliado foi encontrada. Crie uma etiqueta ' +
            'no Mercado Livre e tente novamente.'
        };
      }
      if (typeof earlyLink === 'string') {
        return { success: true, affiliateLink: earlyLink };
      }
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
      isUsableLabelOption,
      findShareButton,
      findAffiliateDialog,
      findLabelControl,
      findLabelOption,
      findAffiliateLink,
      selectAffiliateLabelIfNeeded,
      generateAffiliateLink
    };
  }
})();
