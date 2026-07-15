# SOP: Publicar Stories no Instagram

## Objetivo
Publicar imagens geradas (da pasta `/stories`) como Stories no perfil `@alerta.de.descontos` via Instagram Graph API.

## Ferramentas
- **Script:** `execution/publish_story.js`
- **Endpoint:** `POST /api/publish`
- **Dependências:** imgBB (hospedagem de imagem) + Instagram Graph API (publicação)

## Pré-requisitos
- `.env` com `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID` e `IMGBB_API_KEY` configurados.
- Imagens JPG geradas na pasta `/stories`.
- Conta `@alerta.de.descontos` com tipo **BUSINESS** e vinculada ao app.

## Fluxo de Execução
```
[Imagem Local] → [imgBB Upload] → [URL Pública] → [Container Instagram] → [Aguardar] → [Publicar Story]
```

1. **Upload imgBB**: converte imagem em base64 → envia para api.imgbb.com → recebe URL pública
2. **Criar Container**: POST `/{userId}/media` com `image_url` e `media_type=STORIES`
3. **Verificar Status**: GET `/{containerId}?fields=status_code` — aguarda status `FINISHED`
4. **Publicar**: POST `/{userId}/media_publish` com `creation_id`

## Uso em Linha de Comando
```bash
# Publicar todos os stories da pasta /stories
node execution/publish_story.js

# Publicar um story específico
node execution/publish_story.js story_1_discount_35.jpg
```

## Uso via Dashboard/API
```http
POST /api/publish
Content-Type: application/json

{}                              → publica todos
{"filename": "story_1.jpg"}    → publica específico
```

## Restrições e Edge Cases
- **Rate Limit**: Aguardar mínimo 5s entre cada publicação (já implementado).
- **Container timeout**: O script aguarda até 30 segundos (10 tentativas x 3s) para o processamento da mídia.
- **imgBB bloqueio local**: IP de desenvolvimento pode ser bloqueado; em produção funciona normalmente.
- **Token expira**: O token da Instagram API tem validade. Renovar em `developers.facebook.com/apps/1042988138153549`.
- **Máx. Stories/dia**: A Meta permite até 100 publicações de Story por dia por conta.

## Credenciais (.env)
| Variável | Descrição |
|---|---|
| `INSTAGRAM_ACCESS_TOKEN` | Token de acesso do Instagram (obtido via Meta Developers) |
| `INSTAGRAM_USER_ID` | ID do usuário Instagram Business (`27695778276721991`) |
| `IMGBB_API_KEY` | Chave da API do imgBB para hospedagem pública de imagens |

## Log de Manutenção
- **2026-07-11**: Script criado. Token gerado e testado com sucesso. Conta `@alerta.de.descontos` confirmada como BUSINESS.
