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

1. **Uso de Imagens Temporárias**: O sistema deve fazer upload das imagens JPG para o imgBB somente no momento da publicação do story e deve obter uma URL válida. Essas URLs são temporárias e não devem ser salvas de forma persistente.
2. **Robustez na Publicação**: O script deve realizar polling da API de mídia do Instagram a cada 3 segundos, por um limite máximo de 10 tentativas. Se expirar, deve relatar erro amigável ao usuário.
3. **Tratamento de Erros de Conectividade**: Caso as chaves de API não estejam configuradas no `.env`, o backend deve barrar a tentativa imediatamente com erro `400 Bad Request` informando quais chaves estão ausentes.
4. **Validação de Nomes Headless**: A verificação de disponibilidade de nomes de usuário deve utilizar o `puppeteer-core` de forma headless, simulando comportamento de navegação humana para evitar bloqueios temporários de IP e redirecionamentos para login.
5. **Critérios de Ranking**: O ranking de nomes de promoções deve priorizar menor extensão (comprimento), ausência de caracteres especiais consecutivos e presença de palavras de alto engajamento (como 'promo', 'achados', 'descontos').


## Invariantes Arquiteturais

1. **Camada 3 (Execução)**: O arquivo `execution/publish_story.js` é o único responsável direto pelas requisições HTTP externas do Instagram e imgBB.
2. **Camada 2 (Servidor)**: O `server.js` gerencia as requisições de API vindas do painel web e despacha as ações de forma determinística para o script de execução.
3. **Segurança de Segredos**: Nenhuma chave de API (Instagram ou imgBB) deve ser colocada diretamente no código-fonte. Devem ser sempre carregadas via `process.env`.
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

