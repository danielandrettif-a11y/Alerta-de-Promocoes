# Plano de Tarefas do Projeto (task_plan.md)

Este documento registra as fases de desenvolvimento para a automação de ofertas de afiliados.

## Checklist de Fases

### Fase 1: WhatsApp Interativo (Concluído)
- [x] Criar listener de mensagens recebidas com identificação de `@antigravity`.
- [x] Implementar comando `ajuda` com menu de guias.
- [x] Implementar comando `status` de integridade.
- [x] Implementar comando `atualizar` disparando o scraping concorrente de ofertas.
- [x] Implementar comando `gerar [categoria]` com extração e geração de story integrada.

### Fase 2: Simulação Headless (Concluído)
- [x] Ajustar `get_meli_affiliate_link.js` para usar `headless: true`.
- [x] Executar testes de extração e validar persistência de login no Mercado Livre.

### Fase 3: Desativação do Instagram (Concluído)
- [x] Manter scripts da API do Instagram e imgBB inativos (dormentes).
- [x] Limpar botões de publicação no Instagram na UI do frontend (`index.html` e `app.js`).

### Fase 4: Validador de Nomes do Instagram (Concluído)
- [x] Obter respostas para as 5 Perguntas de Descoberta do Validador de Nomes.
- [x] Definir o Esquema de Dados no `GEMINI.md` para o validador de nomes.
- [x] Validar inicialização do `puppeteer-core` na máquina local.
- [x] Criar POP técnico em `directives/instagram_name_validation_sop.md`.
- [x] Criar o script determinístico `execution/test_instagram_names.js`.
- [x] Rodar a verificação de disponibilidade dos nomes candidatos.
- [x] Aplicar algoritmo de classificação/pontuação de nomes.
- [x] Gerar relatório final em Markdown estruturado para o chat e exportar os dados em `.tmp/nomes_disponiveis.json`.

### Fase 5: Simplificação Geral e Suporte a Shopee (Em Andamento)
- [x] Criar o script de scraping de ofertas da Shopee (`execution/shopee_deals.js`).
- [x] Atualizar o script de integração do WhatsApp (`execution/whatsapp_client.js`) para suportar novos comandos de quantidade/categoria e reação de foguinho.
- [x] Ajustar o backend (`server.js`) para suportar a nova aba da Shopee, salvar imagens base64 geradas e excluir após o envio.
- [x] Modificar o frontend (`index.html`, `style.css`, `app.js`) para implementar a UI de 3 abas, o Canvas de renderização dos Stories e a integração de envio.
- [x] Deletar scripts obsoletos (`execution/publish_story.js`).
- [x] Testar e validar o fluxo completo localmente.
 
### Fase 6: Substituição da Shopee pela Amazon Brasil (Concluída)
- [x] Desenvolver o scraper de ofertas diárias da Amazon (`execution/amazon_deals.js`) de forma resiliente usando seletores para o grid virtuoso.
- [x] Substituir todas as rotas e ciclos automáticos da Shopee para a Amazon no backend (`server.js`).
- [x] Adaptar a UI do dashboard (`index.html`, `style.css` e `app.js`) para suportar as ofertas e cores da Amazon.
- [x] Atualizar o bot do WhatsApp (`whatsapp_client.js`) para suportar os novos comandos integrando com a Amazon.
- [x] Corrigir erros de geração de Stories e envios de imagens no WhatsApp Web através de um proxy de imagem resiliente a redirecionamentos.
- [x] Integrar a Amazon nos scripts de agendamento automático de Stories (`auto_publish_scheduler.js` e `wpp_scheduler.js`).
- [x] Realizar testes E2E do dashboard, do bot do WhatsApp e da geração automatizada de Stories localmente.

### Fase 7: 4 Melhorias do Painel & Cupons por Loja (Concluída)
- [x] 1. Reorganizar Filtros em 2 linhas lógicas (Busca rápida + Taxonomia)
- [x] 2. Dar Função Real às Subcategorias (Contagem de itens, texto contextual e chip de filtro ativo)
- [x] 3. Ativar Amazon com Link Afiliado (`alertadesc0dd-20`), visibilidade no menu e suporte na fila
- [x] 4. Cupons por Marketplace & Integração com Story (Cupons "Clipe" Amazon, Cupons ML por loja, Vincular cupom ao Story com preço COM/SEM cupom)
- [x] 5. Teste E2E e Envio ao GitHub (`git push origin main`)

### Fase 8: Validação, Ampliação e Envio para Fila na Aba Amazon (Concluída)
- [x] 1. Adicionar o botão "Preparar na fila (`txt-queue-count-amazon`)" no HTML da aba Amazon (`index.html`) e integrar os eventos de fila no frontend (`app.js`).
- [x] 2. Reformular o scraper Puppeteer (`execution/amazon_deals.js`) para raspagem em volume por categorias com taxonomia (`category_helper.js`), badges de cupons, frete Prime e popular `amazon_deals_report.json`.
- [x] 3. Validar a recepção das ofertas da Amazon no endpoint `/api/queue` e a criação dos Stories/envio ao WhatsApp.
- [x] 4. Testes E2E e validação no Dashboard.

### Fase 9: Integração do Marketplace FutFanatics (Concluída)
- [x] 1. Respostas das 5 Perguntas de Descoberta V.L.A.E.G. coletadas.
- [x] 2. Descobertas técnicas e estrutura DOM do site registradas em `findings.md`.
- [x] 3. Plano de implementação criado em `implementation_plan.md`.
- [x] 4. Criar a diretiva `directives/futfanatics_deals.md`.
- [x] 5. Desenvolver o scraper `execution/futfanatics_deals.js` e atualizar `category_helper.js`.
- [x] 6. Adicionar a aba FutFanatics na interface (`index.html`, `style.css`, `app.js`).
- [x] 7. Criar as rotas de backend em `server.js` (`/api/futfanatics-deals` e `/api/refresh-futfanatics-deals`).
- [x] 8. Adicionar suporte à FutFanatics na extensão Chrome (`manifest.json`, `background.js`, `content/product_price.js`).
- [x] 9. Desenvolver os testes unitários (`test/futfanatics_deals.test.js`) e validar com `npm test` (88/88 pass).




