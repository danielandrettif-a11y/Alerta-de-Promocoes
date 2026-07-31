# Directive: Worker local de links afiliados

## Objetivo

Gerar links `https://meli.la/...` e `https://s.shopee.com.br/...` com a
extensão Chromium instalada no computador do usuário. A extensão usa apenas
as sessões já abertas; cookies, senhas e segundo fator nunca são enviados ao
servidor.

## Configuração

- Ative com `LOCAL_AFFILIATE_WORKER_ENABLED=true`.
- Defina um segredo longo em `LOCAL_AFFILIATE_WORKER_TOKEN`.
- Use o mesmo servidor e token nas opções da extensão.
- Mantenha `APP_RUNTIME_DIR` no volume persistente.

## Fluxo

1. O painel adiciona ofertas à fila e gera os Stories existentes.
2. A extensão envia heartbeat e reserva até o tamanho de lote escolhido.
3. A extensão abre uma janela de trabalho separada, sem foco e atrás da janela
   principal. Ela permanece renderizada para os marketplaces não reduzirem a
   velocidade nem ignorarem cliques, e é reutilizada durante todo o lote.
4. Para Mercado Livre, uma aba nessa janela abre o produto, usa o controle
   `Compartilhar`, extrai o link `meli.la`, lê o preço exibido e procura um
   cupom candidato confirmado na própria página.
5. Para Shopee, outra aba abre `Oferta > Link personalizado`, preenche o produto
   e extrai o link `s.shopee.com.br`.
6. O servidor valida o link e compara o preço observado com o Story.
7. O item fica `ready` ou `needs_review`.
8. Quando houver cupom comprovado para o produto, o servidor recria o Story
   com o preço normal, o preço com cupom e o código.
9. Itens prontos podem formar um lote e um ZIP persistente.

## Segurança e falhas

- Todos os endpoints do worker exigem Bearer Token.
- Reservas pertencem ao `deviceId`, expiram e voltam à fila.
- Dois dispositivos não recebem o mesmo item.
- `AUTH_REQUIRED` não consome tentativa: o lote pausa e o usuário conclui
  login, CAPTCHA ou segundo fator manualmente. Nesse caso, a janela de trabalho
  é restaurada e trazida para frente.
- Outros erros respeitam `LOCAL_AFFILIATE_MAX_ATTEMPTS`.
- O worker não contorna bloqueios nem usa endpoints internos dos marketplaces.
- Se a página não expuser um preço confiável, o link continua válido sem gerar
  um falso alerta de indisponibilidade.
- A escrita da fila e do registro de workers é atômica.
- O preenchimento manual continua disponível.

## Arquivos persistentes

- `${APP_RUNTIME_DIR}/publication_queue.json`
- `${APP_RUNTIME_DIR}/local_affiliate_workers.json`
- `${APP_RUNTIME_DIR}/publication_batches.json`
- `${APP_RUNTIME_DIR}/publication_batch_files/`

Os pacotes ZIP usam a dependência `archiver`.

## Operação

Consulte `extension/README.md` para instalação. Se um marketplace mudar o DOM,
ajuste seu arquivo em `extension/content/` e valide um produto antes de retomar
lotes grandes.
