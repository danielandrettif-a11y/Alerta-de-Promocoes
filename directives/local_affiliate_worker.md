# Directive: Worker local de links afiliados

## Objetivo

Gerar links `https://meli.la/...` com a extensão Chromium instalada no
computador do usuário. A extensão usa apenas a sessão já aberta no navegador;
cookies, senha, segundo fator e armazenamento do Mercado Livre nunca são
enviados ao servidor.

## Configuração

- Ative com `LOCAL_AFFILIATE_WORKER_ENABLED=true`.
- Defina um segredo longo em `LOCAL_AFFILIATE_WORKER_TOKEN`.
- Use o mesmo servidor e token nas opções da extensão.
- Mantenha `APP_RUNTIME_DIR` no volume persistente.

## Fluxo

1. O painel adiciona ofertas à fila e gera os Stories existentes.
2. A extensão envia heartbeat e reserva até o tamanho de lote escolhido.
3. Uma única aba local abre cada produto, encontra `#stripe`, clica no
   controle visível `Compartilhar` e extrai um link `meli.la`.
4. O servidor valida o link pela mesma regra usada no preenchimento manual.
5. O item fica `ready` ou `needs_review`.
6. Itens prontos podem formar um lote e um ZIP persistente.

## Segurança e falhas

- Todos os endpoints do worker exigem Bearer Token.
- Reservas pertencem ao `deviceId`, expiram e voltam à fila.
- Dois dispositivos não recebem o mesmo item.
- `AUTH_REQUIRED` não consome tentativa: o lote pausa e o usuário conclui
  login, CAPTCHA ou segundo fator manualmente.
- Outros erros respeitam `LOCAL_AFFILIATE_MAX_ATTEMPTS`.
- O worker não contorna bloqueios e não usa endpoints internos do Mercado
  Livre.
- A escrita da fila e do registro de workers é atômica.
- O preenchimento manual continua disponível.

## Arquivos persistentes

- `${APP_RUNTIME_DIR}/publication_queue.json`
- `${APP_RUNTIME_DIR}/local_affiliate_workers.json`
- `${APP_RUNTIME_DIR}/publication_batches.json`
- `${APP_RUNTIME_DIR}/publication_batch_files/`

Os pacotes ZIP usam a dependência `archiver`.

## Operação

Consulte `extension/README.md` para instalação. Se o DOM do Mercado Livre
mudar, ajuste somente `extension/content/mercado_livre.js` e valide
manualmente uma página de produto antes de retomar lotes grandes.
