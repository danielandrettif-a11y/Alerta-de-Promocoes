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
  - O nome do projeto no arquivo `package.json` foi atualizado para `alerta-de-promocoes`.
  - O arquivo `package-lock.json` foi atualizado rodando `npm install` após a renomeação da pasta física.
