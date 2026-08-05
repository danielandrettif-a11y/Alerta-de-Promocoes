(() => {
  const LINK_PATTERN = /https:\/\/s\.shopee\.com\.br\/[A-Za-z0-9_-]+/;
  const CONVERTER_PATH = '/offer/custom_link';
  let actionGeneration = 0;

  function normalizedText(value) {
    return String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  }

  function visible(element) {
    if (!element || element.getClientRects().length === 0) return false;
    const style = typeof getComputedStyle === 'function'
      ? getComputedStyle(element)
      : null;
    return !style || (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
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
    }) || fields.find(field => field.tagName === 'TEXTAREA');
  }

  function findGenerateButton(root = document, { enabledOnly = false } = {}) {
    return [...root.querySelectorAll('button')].find(button =>
      visible(button) && (!enabledOnly || !button.disabled) &&
      normalizedText(button.textContent).includes('obter link')
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

  function findCustomLinkControl(root = document) {
    const matches = [...root.querySelectorAll(
      'a, button, [role="menuitem"], li'
    )].filter(element =>
      String(element.href || element.getAttribute?.('href') || '')
        .includes(CONVERTER_PATH) ||
      normalizedText(element.textContent).trim() === 'link personalizado'
    );
    return matches.find(visible) || matches[0];
  }

  function findOfferControl(root = document) {
    const exactText = element => [
      element.querySelector?.('.menu-text')?.textContent,
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title')
    ].some(value => normalizedText(value).trim() === 'oferta');
    const selectors = [
      '#aff-sider .ant-menu-submenu-title',
      '#aff-sider [role="menuitem"]',
      '[class*="aff-sider"] [class*="submenu-title"]',
      'aside [class*="submenu-title"]',
      'nav [class*="submenu-title"]'
    ];
    for (const selector of selectors) {
      const match = [...root.querySelectorAll(selector)].find(exactText);
      if (match) return match;
    }
    const textNode = [...root.querySelectorAll('.menu-text, [class*="menu-text"]')]
      .find(element => normalizedText(element.textContent).trim() === 'oferta');
    if (textNode) {
      return textNode.closest(
        '.ant-menu-submenu-title, [role="menuitem"], li, button, a'
      ) || textNode.parentElement;
    }
    return [...root.querySelectorAll('a, button, [role="menuitem"], li')]
      .find(exactText);
  }

  function describeControl(element) {
    if (!element) return { present: false, visible: false };
    const isVisible = visible(element);
    const rect = isVisible ? element.getBoundingClientRect() : null;
    return {
      present: true,
      visible: isVisible,
      tag: String(element.tagName || '').toLowerCase(),
      className: String(element.className || '').slice(0, 160),
      href: String(element.href || element.getAttribute?.('href') || '')
        .slice(0, 200),
      ariaLabel: String(element.getAttribute?.('aria-label') || '').slice(0, 100),
      title: String(element.getAttribute?.('title') || '').slice(0, 100),
      clickPoint: rect ? {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
      } : null
    };
  }

  function collectDiagnostic(
    root = document,
    href = typeof location === 'undefined' ? '' : location.href
  ) {
    let pathname = '';
    let safeUrl = '';
    try {
      const parsed = new URL(href);
      pathname = parsed.pathname.replace(/\/$/, '') || '/';
      safeUrl = `${parsed.origin}${parsed.pathname}`;
    } catch {}
    const offer = findOfferControl(root);
    const customLink = findCustomLinkControl(root);
    return {
      url: safeUrl.slice(0, 300),
      pathname,
      readyState: root.readyState || '',
      viewport: typeof window === 'undefined' ? null : {
        width: window.innerWidth,
        height: window.innerHeight
      },
      frameCount: root.querySelectorAll?.('iframe').length || 0,
      inputCount: root.querySelectorAll?.('input, textarea').length || 0,
      buttonCount: root.querySelectorAll?.('button').length || 0,
      hasProductInput: Boolean(findProductInput(root)),
      hasGenerateButton: Boolean(findGenerateButton(root)),
      controls: {
        offer: describeControl(offer),
        customLink: describeControl(customLink)
      }
    };
  }

  function findPageIssue(
    root = document,
    href = typeof location === 'undefined' ? '' : location.href
  ) {
    const text = normalizedText(
      root.body?.innerText || root.body?.textContent || ''
    );
    if (/login|captcha|verification|challenge/i.test(href) ||
        text.includes('faca login') || text.includes('iniciar sessao')) {
      return {
        code: 'AUTH_REQUIRED',
        message: 'A Shopee solicitou autenticação.'
      };
    }
    if (text.includes('informacoes de pagamento e fiscais')) {
      return {
        code: 'SHOPEE_ACCOUNT_ACTION_REQUIRED',
        message: 'Complete as Informações de Pagamento e Fiscais na Shopee ' +
          'e clique em Continuar processamento.'
      };
    }
    return null;
  }

  function getShopeePageState(
    root = document,
    href = typeof location === 'undefined' ? '' : location.href
  ) {
    const diagnostic = collectDiagnostic(root, href);
    const issue = findPageIssue(root, href);
    if (issue) return { state: 'ACTION_REQUIRED', ...issue, diagnostic };
    if (diagnostic.hasProductInput && diagnostic.hasGenerateButton) {
      return { state: 'READY', diagnostic };
    }
    if (diagnostic.pathname === CONVERTER_PATH) {
      return { state: 'CONVERTER_LOADING', diagnostic };
    }
    const pageText = normalizedText(
      root.body?.innerText || root.body?.textContent || ''
    );
    if (diagnostic.pathname === '/dashboard' ||
        pageText.includes('pagina inicial / painel de controle')) {
      return { state: 'DASHBOARD', diagnostic };
    }
    return { state: 'PORTAL_LOADING', diagnostic };
  }

  function activateControl(kind, root = document) {
    const element = kind === 'offer'
      ? findOfferControl(root)
      : findCustomLinkControl(root);
    const control = describeControl(element);
    if (!element) {
      return {
        success: false,
        code: kind === 'offer'
          ? 'SHOPEE_MENU_NOT_FOUND'
          : 'SHOPEE_CONVERTER_NOT_REACHED',
        message: `A Shopee não exibiu ${kind === 'offer'
          ? 'o menu Oferta'
          : 'o acesso a Link personalizado'}.`,
        diagnostic: collectDiagnostic(root)
      };
    }
    const collapsedMenuToggle = kind === 'offer'
      ? root.querySelector?.('#aff-sider .sider-links.collapsed > div')
      : null;
    if (collapsedMenuToggle) {
      collapsedMenuToggle.click();
      setTimeout(() => findOfferControl(root)?.click(), 0);
    } else {
      setTimeout(() => element.click(), 0);
    }
    return {
      success: true,
      control,
      diagnostic: collectDiagnostic(root)
    };
  }

  function setFieldValue(field, value) {
    const prototype = field.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) throw new Error('A Shopee não permitiu preencher o campo.');
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function waitFor(find, timeoutMs, isCancelled = () => false) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (isCancelled()) {
          clearInterval(timer);
          reject(Object.assign(new Error('Processamento cancelado.'), {
            code: 'CANCELLED'
          }));
          return;
        }
        const value = find();
        if (value) {
          clearInterval(timer);
          resolve(value);
        } else if (Date.now() - started >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('timeout'));
        }
      }, 200);
    });
  }

  function findGenerationError(root = document) {
    const elements = root.querySelectorAll(
      '[role="alert"], .ant-message-error, .ant-form-item-explain-error'
    );
    return [...elements].map(element => element.textContent?.trim())
      .find(Boolean) || null;
  }

  async function generateShopeeAffiliateLink(productLink, timeoutMs = 60000) {
    const generation = ++actionGeneration;
    const cancelled = () => generation !== actionGeneration;
    const issue = findPageIssue(document, location.href);
    if (issue) return { success: false, ...issue, diagnostic: collectDiagnostic() };
    const started = Date.now();
    const remaining = () => Math.max(1, timeoutMs - (Date.now() - started));
    try {
      const input = await waitFor(
        () => findProductInput(document), remaining(), cancelled
      );
      const previousLink = findAffiliateLink(document);
      setFieldValue(input, productLink);
      if (input.value !== productLink) {
        return {
          success: false,
          code: 'SHOPEE_INPUT_NOT_FOUND',
          message: 'A Shopee não manteve o link no campo do produto.',
          diagnostic: collectDiagnostic()
        };
      }
      const button = await waitFor(
        () => findGenerateButton(document, { enabledOnly: true }),
        remaining(),
        cancelled
      );
      button.click();
      const result = await waitFor(() => {
        const error = findGenerationError(document);
        if (error) return { error };
        const currentLink = findAffiliateLink(document);
        if (currentLink && currentLink !== previousLink) {
          return { affiliateLink: currentLink };
        }
        return null;
      }, remaining(), cancelled);
      if (result.error) {
        return {
          success: false,
          code: 'SHOPEE_GENERATION_REJECTED',
          message: `A Shopee recusou o produto: ${result.error}`,
          diagnostic: collectDiagnostic()
        };
      }
      return {
        success: true,
        affiliateLink: result.affiliateLink,
        observedPrice: null,
        diagnostic: collectDiagnostic()
      };
    } catch (error) {
      if (error.code === 'CANCELLED') {
        return { success: false, code: 'CANCELLED', message: error.message };
      }
      const state = getShopeePageState();
      if (state.code) return { success: false, ...state };
      return {
        success: false,
        code: state.diagnostic?.hasProductInput
          ? 'SHOPEE_RESULT_TIMEOUT'
          : 'SHOPEE_INPUT_NOT_FOUND',
        message: state.diagnostic?.hasProductInput
          ? 'A Shopee não gerou o link afiliado no tempo esperado.'
          : 'A Shopee não exibiu o campo do produto.',
        diagnostic: state.diagnostic
      };
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage &&
      !globalThis.__shopeeAffiliateContentInstalled) {
    globalThis.__shopeeAffiliateContentInstalled = true;
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'GET_SHOPEE_PAGE_STATE') {
        sendResponse(getShopeePageState());
        return;
      }
      if (message.type === 'ACTIVATE_SHOPEE_CONTROL') {
        sendResponse(activateControl(message.kind));
        return;
      }
      if (message.type === 'CANCEL_SHOPEE_ACTION') {
        actionGeneration += 1;
        sendResponse({ success: true });
        return;
      }
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
      CONVERTER_PATH,
      normalizedText,
      visible,
      findProductInput,
      findGenerateButton,
      findAffiliateLink,
      findCustomLinkControl,
      findOfferControl,
      collectDiagnostic,
      findPageIssue,
      getShopeePageState,
      activateControl
    };
  }
})();
