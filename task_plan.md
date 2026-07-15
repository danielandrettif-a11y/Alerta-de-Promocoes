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

---

## Checklist: Validador de Nomes do Instagram [CONCLUÍDO]

### Fase 1: Visão & Descoberta
- [x] Obter respostas para as 5 Perguntas de Descoberta do Validador de Nomes.
- [x] Definir o Esquema de Dados no `GEMINI.md` para o validador de nomes.

### Fase 2: Link (Conectividade & Geração)
- [x] Elaborar a lista inicial de nomes candidatos focados no nicho de promoções.
- [x] Validar inicialização do `puppeteer-core` na máquina local.

### Fase 3: Arquitetura (Construção)
- [x] Criar POP técnico em `directives/instagram_name_validation_sop.md`.
- [x] Criar o script determinístico `execution/test_instagram_names.js`.

### Fase 4: Estilo (Ranking & Apresentação)
- [x] Rodar a verificação de disponibilidade dos nomes candidatos.
- [x] Aplicar algoritmo de classificação/pontuação de nomes.
- [x] Gerar relatório final em Markdown estruturado para o chat e exportar os dados em `.tmp/nomes_disponiveis.json`.


