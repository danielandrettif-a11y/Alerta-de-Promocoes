# Agent Instructions

> This file is mirrored across CLAUDE.md, AGENTS.md, and GEMINI.md so the same instructions load in any AI environment.

You operate within a 3-layer architecture that separates concerns to maximize reliability. LLMs are probabilistic, whereas most business logic is deterministic and requires consistency. This system fixes that mismatch.

## The 3-Layer Architecture

**Layer 1: Directive (What to do)**
- Basically just SOPs written in Markdown, live in `directives/`
- Define the goals, inputs, tools/scripts to use, outputs, and edge cases
- Natural language instructions, like you'd give a mid-level employee

**Layer 2: Orchestration (Decision making)**
- This is you. Your job: intelligent routing.
- Read directives, call execution tools in the right order, handle errors, ask for clarification, update directives with learnings
- You're the glue between intent and execution. E.g you don't try scraping websites yourself—you read `directives/scrape_website.md` and come up with inputs/outputs and then run `execution/scrape_single_site.py`

**Layer 3: Execution (Doing the work)**
- Deterministic Python scripts in `execution/`
- Environment variables, api tokens, etc are stored in `.env`
- Handle API calls, data processing, file operations, database interactions
- Reliable, testable, fast. Use scripts instead of manual work. Commented well.

**Why this works:** if you do everything yourself, errors compound. 90% accuracy per step = 59% success over 5 steps. The solution is push complexity into deterministic code. That way you just focus on decision-making.

## Operating Principles

**1. Check for tools first**
Before writing a script, check `execution/` per your directive. Only create new scripts if none exist.

**2. Self-anneal when things break**
- Read error message and stack trace
- Fix the script and test it again (unless it uses paid tokens/credits/etc—in which case you check w user first)

---

# Constituição do Projeto - Promo Automator (V.L.A.E.G.)

Este espaço define os invariantes, schemas de dados e regras comportamentais específicas do projeto.

## Esquemas de Dados (Data Schemas)

### Payload de Entrada (Publicar Story)
```json
{
  "filename": "nome_do_story_gerado.jpg"
}
```

### Payload de Saída (Confirmação de Publicação)
```json
{
  "success": true,
  "message": "Story publicado com sucesso!",
  "mediaId": "id_da_midia_instagram",
  "tempImageUrl": "url_publica_temporaria"
}
```

### Payload de Entrada (Validador de Nomes)
```json
{
  "keywords": ["promocao", "achados", "cupons"],
  "max_length": 30,
  "style": "any"
}
```

### Payload de Saída (Validador de Nomes)
```json
{
  "timestamp": "2026-07-11T00:00:00.000Z",
  "total_checked": 15,
  "available_count": 8,
  "names": [
    {
      "username": "achadinhos.promos",
      "available": true,
      "score": 92,
      "relevance": "alta",
      "checked_at": "2026-07-11T00:00:00.000Z"
    }
  ]
}
```


## Regras Comportamentais

1. **API do Instagram Dormente**: A integração automática e a publicação na Graph API do Instagram ficam dormentes por tempo indeterminado. A interface do painel web oferece apenas visualização e download dos Stories gerados para postagem manual.
2. **Extração de Afiliados Headless (VPS)**: O script `get_meli_affiliate_link.js` opera obrigatoriamente em modo headless (`headless: true`) e usa a sessão ativa em `.tmp/ml_user_data` para obter os links de afiliado encurtados de forma invisível.
3. **Comandos Interativos do WhatsApp**: O cliente WhatsApp deve escutar ativamente menções a `@antigravity` no grupo e responder de forma cortês a comandos estruturados (`ajuda`, `status`, `atualizar`, `gerar [categoria]`).
4. **Prevenção de Loops**: O robô nunca deve responder a mensagens enviadas por ele mesmo (`msg.fromMe === true`) para evitar loops infinitos de comandos no grupo.

## Invariantes Arquiteturais

1. **Camada 3 (Execução)**: O arquivo `execution/whatsapp_client.js` é o único responsável direto pelas conexões e eventos do WhatsApp Web.
2. **Camada 2 (Servidor)**: O `server.js` gerencia o ciclo automático de ofertas do WhatsApp, inicializa a escuta persistente de comandos no WhatsApp Client e expõe endpoints locais do painel.
3. **Segurança de Segredos**: Segredos e limites do WhatsApp e Mercado Livre devem ser carregados estritamente via `process.env` de forma isolada do código-fonte.
4. **WhatsApp Client**: O arquivo `execution/whatsapp_client.js` gerencia de forma isolada a conexão e o envio de mídias/mensagens para o WhatsApp via `whatsapp-web.js`, mantendo os cookies de sessão salvos localmente em `.tmp/wpp_session`.

## Esquemas de Dados do WhatsApp

### Payload de Entrada (Envio de Oferta)
```json
{
  "groupName": "Alerta de Descontos",
  "messageText": "🔥 *OFERTA IMPERDÍVEL!* \n\n*Jogo De Panelas 17 Peças Teflon Antiaderente Indução*\n\n🔥 *65% OFF*\nDe: ~~R$ 999~~\nPor: *R$ 349,14*\n\n👉 *Compre pelo link:* https://meli.la/2o2L8Hw\n\n📌 _Categoria: Casa e Cozinha_",
  "imagePath": "stories/story_1_discount_65.jpg"
}
```

## Regras Comportamentais do WhatsApp

1. **Sessão Persistente**: A autenticação do WhatsApp deve ser salva de forma persistente em `.tmp/wpp_session`. O QR Code só deve ser impresso no terminal em caso de desautenticação ou primeira inicialização.
2. **Formatação de Mensagens**: As mensagens enviadas para o grupo devem usar a sintaxe de negrito (`*`), tachado (`~~`) e itálico (`_`) do WhatsApp para garantir excelente legibilidade e apelo visual das ofertas.
3. **Imagens nos Stories do WhatsApp**: Toda oferta deve ser enviada acompanhada da imagem promocional vertical (Story) gerada para que os administradores possam baixá-la e repostá-la no Instagram.

