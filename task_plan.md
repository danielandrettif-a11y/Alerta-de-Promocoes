# Plano de Tarefas do Projeto (task_plan.md)

Este documento registra as fases de desenvolvimento para a integração com a API do Instagram para publicação de Stories.

## Checklist de Fases

### Fase 1: Visão & Descoberta
- [ ] Obter respostas para as 5 Perguntas de Descoberta.
- [ ] Confirmar o Esquema de Dados em `GEMINI.md`.

### Fase 2: Link (Conectividade)
- [ ] Adicionar variáveis de ambiente (`INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, `IMGBB_API_KEY`) no `.env`.
- [ ] Criar script de teste de conectividade em `tools/test_instagram_link.js`.
- [ ] Executar handshake com a API da Meta e imgBB para validar as chaves.

### Fase 3: Arquitetura (Construção das Camadas)
- [ ] Criar POP técnico em `directives/instagram_publishing_sop.md`.
- [ ] Implementar script determinístico `execution/publish_story.js` para upload e publicação.
- [ ] Adicionar rota `POST /api/publish` em `server.js` conectando o backend ao script de execução.

### Fase 4: Estilo (Refinamento & UI)
- [ ] Modificar o frontend do painel (`public/index.html` e `public/app.js`) para incluir botões de publicação e feedback visual de loading/sucesso.

### Fase 5: Gatilho (Implantação & Testes Finais)
- [ ] Testar fluxo ponta a ponta com stories reais gerados.
- [ ] Adicionar notas de manutenção ao `GEMINI.md`.

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


