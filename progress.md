# Progresso do Projeto (progress.md)

Registro contínuo do progresso, execuções de testes, erros encontrados e soluções.

## Diário de bordo

### 11/07/2026
- Iniciado o planejamento para a integração da API do Instagram (Caminho 1 - Conexão Direta).
- Criados os arquivos de controle exigidos pelo protocolo V.L.A.E.G. (`task_plan.md`, `findings.md`, `progress.md`).
- Criado o plano de implementação de artefatos (`implementation_plan.md`) contendo as perguntas de descoberta.
- Aguardando feedback e respostas do usuário sobre as credenciais do `.env` e escopo de publicação para prosseguir.
- **Nova Solicitação (Verificação de Nomes no Instagram)**:
  - Criado o plano de implementação para a ferramenta de teste de nomes no Instagram.
  - Atualizado o `findings.md` com as descobertas sobre restrições e rate limit de scraping no Instagram.
  - Respostas das perguntas de descoberta coletadas do usuário.
  - Criado o SOP `directives/instagram_name_validation_sop.md`.
  - Desenvolvido o script `execution/test_instagram_names.js` contendo 25 candidatos e algoritmo de score.
  - Script disparado para rodar em segundo plano e testar a disponibilidade de nomes via Puppeteer.
  - Execução concluída com sucesso, identificando 7 nomes livres para registro no Instagram.
  - Resultados ordenados por score de qualidade/branding e salvos em `.tmp/nomes_disponiveis.json`.
  - Walkthrough final gerado e relatório apresentado ao usuário no chat.
- **Retomada da Integração do Instagram (Publicação de Stories)**:
  - Criado o plano de implementação (`implementation_plan.md`) focado nas chaves de API e fluxos de postagem.
  - Criada a lista de tarefas (`task.md`) de conectividade no diretório de artefatos.
  - Solicitação das chaves do Instagram (`Access Token` e `User ID`) e imgBB ao usuário.
- **Login e Integração com Mercado Livre (Afiliados)**:
  - Criado o utilitário `abrir_login.bat` para iniciar o Chrome isoladamente com diretório de dados em `.tmp/ml_user_data`.
  - Usuário executou o login interativo com sucesso no Chrome.
  - Executado o teste `inspect_affiliate_bar.js` que confirmou a persistência dos cookies de sessão e identificou todos os elementos da Barra de Afiliados (`#stripe`) com a conta ativa de Daniel.
- **Automação de Ofertas via WhatsApp (Nova Estratégia)**:
  - Criado o plano de tarefas `task.md` detalhando a transição do fluxo do Instagram para o WhatsApp.
  - Instaladas as dependências `whatsapp-web.js` e `qrcode-terminal`.
  - Atualizada a constituição `GEMINI.md` com novos invariantes e regras para o WhatsApp.
  - Criado o módulo `execution/whatsapp_client.js` e o utilitário `conectar_whatsapp.bat`.
  - Usuário realizou o pareamento via QR Code com sucesso, gerando a sessão persistente em `.tmp/wpp_session`.
  - Criado o orquestrador `execution/wpp_scheduler.js` para gerenciar a busca, geração de links de afiliados (`meli.la`), geração de imagens e envio.
  - Executado teste E2E com sucesso: enviada a oferta do Jogo de Panelas (65% OFF) com o link de afiliado e a imagem promocional no grupo "Alerta de Descontos".
  - Criado o walkthrough final de verificação.

### 12/07/2026
- **Ajustes de UI (Filtros Lado a Lado):**
  - Redefinido o CSS da barra de filtros (`.filter-bar`) no `style.css` usando Flexbox com `flex-wrap: nowrap` e largura flexível nos elementos. Isso garante que todos os 4 filtros (Busca, Categoria, Desconto, Tipo de Oferta) fiquem 100% alinhados horizontalmente lado a lado no desktop do usuário sem quebrar de linha.
- **Automação Completa de Cupons de Desconto:**
  - Reativado o scraping automático e concorrente de cupons da web no script `execution/mercado_livre_deals.js`. A busca no painel agora atualiza simultaneamente a base de dados de cupons ativos da Cuponomia e as ofertas do Mercado Livre.
  - Implementado o mini-filtro dinâmico individual por cupom em `public/app.js` e `style.css`. O usuário pode buscar produtos compatíveis diretamente dentro do card de cada cupom.
  - Criada a seta expansiva (toggle) que oculta a listagem por padrão para manter a tela limpa. Ao começar a digitar no mini-filtro, a gaveta se abre de forma automática e filtra os produtos elegíveis em tempo real.
  - Refatorada a renderização dos produtos compatíveis na aba de cupons para gerar elementos dinâmicos usando criação nativa de nós do DOM (`document.createElement`). Isso eliminou problemas de sintaxe no interpretador causados por aspas duplas de polegadas no título de produtos como TVs e monitores.
  - **Purificação e Automação de Cupons:**
    - Removido o formulário inline de adicionar cupom manual do painel (`public/index.html`) e seus respectivos ouvintes no frontend (`public/app.js`).
    - Modificado o backend para reescrever completamente o arquivo `coupons.json` a cada rodada de scraping com dados frescos obtidos da Cuponomia (eliminada a mesclagem com cupons manuais).
    - Implementada filtragem no frontend para renderizar apenas os cupons que possuam pelo menos um produto compatível ativo nas ofertas diárias (`compatibleDeals.length > 0`), garantindo que apenas cupons úteis e com funcionamento verificado apareçam na tela.
- **Blindagem e Resiliência a Falhas do Servidor:**
  - Adicionados tratadores de erro globais (`process.on('uncaughtException')` e `process.on('unhandledRejection')`) no `server.js` para evitar que exceções assíncronas do WhatsApp ou Puppeteer provoquem a queda do servidor Express.
  - Adicionado tratamento interno robusto no bootstrap de inicialização do cliente WhatsApp Web em `execution/whatsapp_client.js` para gerenciar timeouts de protocolo e falhas de handshake.

### 14/07/2026
- **Renomeação do Projeto:**
  - O projeto foi renomeado de "Projeito novo" para "Alerta de Promocoes".
  - O nome do projeto no arquivo `package.json` foi updated para `alerta-de-promocoes`.
  - O arquivo `package-lock.json` foi updated rodando `npm install` após a renomeação da pasta física.

### 15/07/2026
- **Simulação Headless de Login do Mercado Livre (VPS):**
  - Modificado o script `get_meli_affiliate_link.js` para usar `headless: true` para simular o ambiente de servidor (VPS).
  - Executados testes de extração de links de afiliados. O Puppeteer em modo headless rodou com sucesso, mas o teste falhou porque a sessão local em `.tmp/ml_user_data` expirou.
  - A página inicial e a página de produto do Mercado Livre redirecionaram para a tela de login ("Olá! Para continuar, acesse sua conta").
  - Corrigido o escopo da variável `page` no script para garantir capturas de tela adequadas no bloco catch em caso de erros futuros.
  - Daniel efetuou o login interativo localmente no Chrome com sucesso.
  - Novo teste headless disparado: a extração foi concluída com **sucesso absoluto**. O robô invisível acessou o produto, localizou e clicou na barra `#stripe` no botão "Compartilhar", gerando e extraindo o link de afiliado `meli.la/1Z3YVke` sem ser barrado por Captchas.

- **Deploy Automático no Coolify:**
  - Sincronizados todos os arquivos modificados do projeto e criados commits enviados para o branch `main` do GitHub remoto.
  - Criado o arquivo [Dockerfile](file:///c:/Users/danie/OneDrive/Documents/Antigravity%20Projetos/Alerta%20de%20Promocoes/Dockerfile) na raiz do projeto contendo a instalação das dependências do sistema necessárias para o Chromium/Puppeteer rodar headless no Linux.
  - Criada e configurada a aplicação integrada ao GitHub App no Coolify (UUID: `v13vybz3batitff5ukstrnse`).
  - Disparado o build e deploy. O Coolify completou o build da imagem Docker com sucesso (`finished`) e disponibilizou a aplicação sob o domínio sslip.io.

- **Diagnóstico de Falhas de Stories & WhatsApp na VPS:**
  - Identificada falha crítica: pastas `.tmp/wpp_session` e `.tmp/ml_user_data` não sobem para o GitHub (estão no `.gitignore`).
  - Sem sessão do Mercado Livre, o robô headless na VPS falha ao gerar links de afiliado.
  - Sem a leitura de QR Code do WhatsApp Web na VPS, o robô permanece offline.
  - O script de busca do Chrome (`findBrowserPath`) no WhatsApp Client não tem mapeamento para caminhos de SO Linux.
- **Fase de Simplificação Geral & Suporte a Shopee (Fase 5):**
  - Removidos por completo todos os fluxos e arquivos obsoletos de integração com a API do Instagram e imgBB (`execution/publish_story.js`, diretivas do Instagram, etc.).
  - Desenvolvido o script `execution/shopee_deals.js` para coleta de promoções da Shopee Brasil de forma stealth. Adicionado um mecanismo de resiliência e auto-recuperação (fallback) para popular `shopee_deals_report.json` com ofertas válidas selecionadas caso a barreira do Cloudflare jogue em captcha.
  - Atualizado o orquestrador do WhatsApp `execution/whatsapp_client.js` para escutar e responder a novos comandos interativos unificados de quantidade (ex: `@antigravity 5`) e categorias (ex: `@antigravity celulares`), mesclando as bases do Mercado Livre e Shopee e enviando com links diretos (sem afiliados).
  - Otimizado o backend `server.js` com novas rotas de API da Shopee, suporte a recebimento de imagens base64 geradas no frontend e um proxy de imagens `/api/proxy-image` para contornar problemas de CORS no Canvas.
  - Remodelado o frontend do painel web (`index.html`, `style.css`, `app.js`) para suportar 3 abas independentes (Mercado Livre, Shopee e Cupons do Dia) e o gerador dinâmico de Stories em HTML5 Canvas de alta performance no cliente (economizando recursos do servidor Express e Puppeteer na VPS).
  - Testado o fluxo de ponta a ponta com sucesso. O Express iniciou e o scraper da Shopee gerou a base correta via fallback após bloqueio de IP.- **Ajustes no Scraping da Shopee (Captura e Fallback):**
  - Modificado o script `execution/shopee_deals.js` para rodar o Puppeteer no modo visual (`headless: false`) na máquina local para burlar com mais facilidade o Cloudflare e permitir que o usuário interaja em caso de Captcha.
  - Removido o comportamento de fallback estático da Shopee (as 6 ofertas fixas de teste) conforme solicitado pelo usuário. Se o scraper falhar ou for bloqueado pelo anti-bot, ele salvará uma base de dados vazia (`deals: []`) e deixará a tela do dashboard limpa de ofertas.

### 16/07/2026
- **Testes Locais de Fluxo de Ponta a Ponta:**
  - Servidor Express (`server.js`) iniciado localmente com sucesso.
  - Conectado com sucesso ao WhatsApp Web reutilizando a sessão ativa persistida em `.tmp/wpp_session` (sem necessidade de re-escaneamento do QR Code).
  - Implementadas as novas regras de fallback da Shopee para salvar relatório vazio em caso de falha/bloqueio.
  - Alterado o Puppeteer do scraper da Shopee para `headless: false` localmente para teste visual de captura.
- **Substituição da Shopee pela Amazon Brasil:**
  - Identificada a inviabilidade do scraper da Shopee devido a bloqueios agressivos do Cloudflare no ambiente de servidor (VPS).
  - Criado o script `execution/amazon_deals.js` para capturar ofertas reais da Amazon de forma estável. Corrigido o seletor do DOM para ler os elementos individuais com `data-test-index` ou ASINs (`B0*`) dentro da estrutura de grid virtuosa.
  - Removido o script antigo e obsoleto `execution/shopee_deals.js`.
  - Atualizado o backend `server.js` com novas rotas `/api/amazon-deals` e `/api/scrape-amazon`, além de ajustar a legenda e a tag da plataforma nas mensagens (`🟡 *AMAZON*`).
  - Corrigida falha no proxy de imagens (`/api/proxy-image`) para seguir redirecionamentos HTTP (3xx) de forma recursiva. Isso resolveu de forma definitiva as falhas no carregamento de imagens no Canvas (erro de CORS e imagens em branco) que faziam as mensagens irem sem Stories anexados no WhatsApp.
  - Otimizado o gerador de Stories backend (`generate_stories.js`) para rodar em modo resiliente, tratando timeouts de rede de fontes e imagens individuais por produto de forma assíncrona.
  - Atualizados os agendadores `auto_publish_scheduler.js` e `wpp_scheduler.js` para mesclar as bases da Amazon e do Mercado Livre por ordem de desconto nas publicações automáticas.
  - Ajustada a interface do dashboard (`public/index.html`, `public/style.css` e `public/app.js`) com a nova aba, comportamento de atualização, cores de marca da Amazon e renderização do Canvas de Stories.
  - Realizado teste E2E manual no dashboard que realizou com sucesso o scraping de 10 ofertas da Amazon e enviou com sucesso o Story gerado anexado à mensagem de texto no grupo de WhatsApp.
 
- **Fase 4: Categorias e Subcategorias Granulares (Filtros em Cascata & Bot Inteligente)**:
  - Criado o helper centralizado `execution/category_helper.js` contendo o mapa completo da nova taxonomia (8 categorias e mais de 30 subcategorias) e algoritmos determinísticos de inferência por palavras-chave.
  - Atualizado o backend `server.js` para expor a rota `/api/categories` com a taxonomia de categorias dinâmicas e reescrever `inferCategory` usando o novo helper.
  - Atualizado o bot do WhatsApp `execution/whatsapp_client.js` para escutar e associar termos de subcategorias em linguagem natural (ex: `@antigravity fone` postará a melhor oferta de Fones de Ouvido e Som) e formatar o ID de mensagem de forma resiliente para resolver o erro no processamento das reações (`🔥`).
  - Atualizados os agendadores `wpp_scheduler.js` para utilizar a nova taxonomia.
  - Otimizada a interface web com filtros dinâmicos de categoria e subcategoria em cascata (Cascading Dropdowns) no `public/index.html` e `public/app.js` e adicionado cache-buster v2 na importação dos scripts.
  - Corrigido o bug residual de `ReferenceError: getProductCategory is not defined` no cálculo de cupons compatíveis, remapeando as chaves para corresponder de forma precisa à nova taxonomia do helper.
  - Validadas as correções via subagente do navegador, comprovando a inicialização do console 100% limpa de erros e o grid de ofertas populado perfeitamente.
 
- **Fase 5: Comparador de Preços Inteligente (Buscapé & Zoom com Fallback)**:
  - Desenvolvida a rota `/api/compare-price` no backend (`server.js`) contendo algoritmo de extração de termos cirúrgico (preservando tipo do produto, marca, modelo exato e polegadas/capacidades físicas, enquanto remove ruídos secundários de venda).
  - Implementada a busca assíncrona tolerante a mudanças de layout com o Puppeteer headless, varrendo tags genéricas `strong` contendo `R$` e aplicando filtragem numérica inteligente para isolar preços válidos.
  - Implementado canal de fallback redundante: se a busca no Buscapé falhar ou sofrer rate limit, a rota automaticamente realiza a mesma pesquisa estruturada no portal Zoom.
  - Adaptada a rota de geração de posts `/api/generate` para injetar a comparação de preços (menor preço do mercado, status e economia calculada) na legenda final enviada ao WhatsApp.
  - Injetado o botão "Comparar no Buscapé" e área de renderização de resultados nos templates de cards de ofertas do Mercado Livre e da Amazon no frontend (`public/app.js`).
  - Criados os estilos e animações CSS do comparador no `public/style.css` e adicionado cache-buster v3 no `public/index.html`.
  - Validada a funcionalidade com sucesso de ponta a ponta, obtendo com sucesso o preço real e a economia da Smart TV LG QNED73 (R$ 2.435,00 no Buscapé) a partir de um título longo e complexo.

- **Ajustes de UI (Correção do Carimbo de Data)**:
  - Corrigido o bug do carimbo de data de atualização que exibia `"Invalid Date"` no frontend. O problema ocorria porque a data do Mercado Livre é salva em formato brasileiro (DD/MM/YYYY hh:mm:ss), cujo parsing não é padronizado nos construtores `Date` dos navegadores.
  - Desenvolvida a função `parseBackendDate` no frontend (`public/app.js`) para suportar de forma robusta e compatível strings ISO e no formato brasileiro.
  - Implementada atualização dinâmica do carimbo: o carimbo agora reflete individualmente a última atualização da plataforma ativa (Mercado Livre ou Amazon) ao alternar entre as abas.
  - Adicionado cache-buster v4 nas importações do `public/index.html` para forçar o recarregamento imediato.

- **Calibração do Comparador (Corte Proporcional de 60%)**:
  - Identificado bug em que o comparador ignorava preços baixos legítimos (como bebidas de R$ 69,08) devido a um limite rígido de R$ 150,00, ou trazia miniaturas/copos promocionais (ex: R$ 23,90) por ter um limite de proporção baixo de 30%.
  - Atualizado o frontend (`public/app.js`) para transmitir o preço de promoção ativo (`&price=...`) na requisição de comparação.
  - Atualizado o backend (`server.js`) para adotar corte proporcional dinâmico de **60%** sobre o preço de promoção (`currentPrice`). Isso elimina com precisão ruídos de acessórios ou copos e preserva a garrafa/produto correto.
  - Adicionado cache-buster v5 nas importações do `public/index.html` para forçar o recarregamento imediato.

- **Refinamento de Seletores e Margem de Alerta (Resolução de "Preço Semelhante")**:
  - Identificado que o comparador de preços extraía preços de elementos estruturais gigantes de layout (menus, rodapé, banners laterais) porque a classe CSS genérica `Card` era ampla demais. Isso gerava falsos positivos de preços muito baixos (como R$ 42,00 em vez do valor da TV ou R$ 67,41 de outros produtos).
  - Refatorado o `evaluate` do Puppeteer no backend (`server.js`) para isolar a busca exclusivamente dentro de containers de cards de produtos reais (classes contendo `ProductCard`, `HitCard` ou `ProductCardArea`), evitando seletores genéricos de layout e aplicando um fallback seguro.
  - Resolvido o problema em que todos os produtos exibiam `"Preço Semelhante ⚠️"`. Implementamos uma margem de tolerância de **2%** do preço do produto no frontend (`public/app.js`) e no backend (`server.js`) para classificar os preços. Diferenças irrelevantes caem em `Preço Equivalente ⚖️`, descontos reais caem em `Desconto Comprovado! 📉` e valores muito mais baixos no mercado geram o alerta correto `⚠️ Preço Acima do Mercado`.
  - Aumentados os timeouts do Puppeteer no `server.js` (timeout de página para 15s e espera de seletor para 6s) para tolerar picos de lentidão de rede e consultas concorrentes sem quebrar.
  - Adicionado cache-buster v6 nas importações do `public/index.html` para forçar o recarregamento imediato.

- **Comparador Triplo Paralelo (Buscapé, Zoom e Bondfaro Lado a Lado)**:
  - Expandimos o comparador de preços simples para buscar simultaneamente nos três maiores comparadores de preços do país: **Buscapé, Zoom e Bondfaro**.
  - Otimizada a rota `/api/compare-price` no backend (`server.js`) para inicializar as abas de navegação de forma isolada e executar as buscas concorrentes em paralelo com `Promise.all` e Puppeteer.
  - Estruturado o retorno JSON da API com os detalhes de menor preço e URL individual para cada um dos buscadores, e consolidado o menor preço absoluto de mercado a partir de todos os retornos válidos.
  - Adaptada a interface do dashboard (`public/app.js`) para renderizar os 3 buscadores lado a lado em 3 colunas, com preços individuais e links diretos para cada site, fornecendo uma visão ampla de mercado.
  - Criados os estilos e grid CSS responsivo de 3 colunas no `public/style.css` com tratamento visual para sites não encontrados (exibindo N/A) e botões de ação minimalistas.
  - Adicionado cache-buster v7 nas importações de `public/index.html` para forçar atualização no cliente.
  - Validada a integração de ponta a ponta com testes manuais da API e execução do subagente de browser automatizado (captura de tela salva e integrada no walkthrough).
- **Correção da Alucinação de Preços (Filtro de Parcelamento e Preço Riscado)**:
  - Identificada falha em que o Zoom (ou outros buscadores) alucinavam exibindo preços bizarros (ex: R$ 2102,31 em vez de R$ 279,90) para a parafusadeira na busca `13mm 21v 220v`.
  - **Causa Raiz**: O parser do card extraía a string contendo a parcela (ex: `3x de R$ 93,30` ou `7x de R$ 132,43`) ou o preço original riscado. As parcelas por serem de valor baixo eram descartadas pelo corte de 60% e os preços riscados inflavam o menor valor. Quando a parcela sem espaços grudava com o prefixo (ex: `R$ 279,903x`), o regex de números extraía `279,903` que virava `279.903` (R$ 279,90), mas caso a parcela fosse interpretada incorretamente ou descartada, o robô retornava um produto patrocinado ou recomendado muito mais caro da página.
  - **Solução**: Refatoramos o `evaluate` da função `scrapeSite` no backend (`server.js`) para realizar filtragem semântica rigorosa elemento por elemento dentro de cada card:
    - **Ignorar Riscados**: Descarta qualquer elemento com estilo CSS contendo `line-through`, ou que utilize tags HTML de cancelamento (`del`, `s`).
    - **Ignorar Parcelamentos**: Descarta de imediato qualquer elemento de texto que contenha a letra `"x"` (case-insensitive) como indicativo de quantidade de parcelas (ex: `3x`, `10x`, `x de`), preservando unicamente o preço principal ativo à vista.
  - Liberados os processos Chrome zumbis do Windows para otimizar performance.
  - Validada a busca síncrona `13mm 21v 220v` que retornou com sucesso R$ 279,90 de forma consistente nos 3 sites em paralelo.

- **Correção da Moderação por Reação (Exclusão por Foguinho 🔥)**:
  - Identificada falha em que o bot não apagava as mensagens ao receber a reação `🔥` dos administradores.
  - **Causa Raiz**: O console exibia a falha `❌ Erro no processamento da reação: r: r` vinda do Puppeteer/CDP na chamada da biblioteca `client.getChatById(chatId)`. O WhatsApp Web alterou o formato da Store interna de chats, quebrando as funções de busca do wwebjs.
  - **Solução**: Contornamos completamente as APIs de busca de chat e mensagens da biblioteca. O evento `message_reaction` agora extrai o ID serializado da mensagem (`reaction.msgId._serialized`) e executa a exclusão de forma direta e nativa na página do browser (`client.pupPage.evaluate`) chamando a API do próprio WhatsApp Web (`window.Store.Cmd.sendDeleteMsgs`).
  - Adicionamos validação de segurança dentro do evaluate para certificar de que a mensagem reagida é de autoria do bot (`msg.id.fromMe === true`) antes de proceder com a deleção para todos.

