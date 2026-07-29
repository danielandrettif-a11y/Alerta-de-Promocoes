# Pesquisa geral em marketplaces

## Objetivo

Permitir uma pesquisa manual por produto em grandes marketplaces sem misturar
os resultados com as ofertas coletadas e sem criar qualquer ação no WhatsApp.

## Fluxos separados

1. A barra **Pesquisa geral** chama `GET /api/marketplace-search?q=...`.
2. O backend consulta Mercado Livre, Amazon, Magalu e Casas Bahia.
3. A resposta contém apenas título, preço informativo, imagem, marketplace e
   link direto.
4. Esses resultados não entram nos arrays de ofertas, na seleção, no histórico
   diário, na geração de Stories ou no cliente do WhatsApp.
5. As barras dentro das abas Mercado Livre e Amazon continuam sendo filtros
   locais das ofertas já carregadas.
6. O botão **Comparar Preços** de cada oferta reutiliza esta mesma busca apenas
   quando clicado, valida produtos equivalentes e calcula mediana e nota.

## Execução

- Implementação determinística: `execution/marketplace_search.js`.
- Cache persistente: `APP_RUNTIME_DIR/marketplace_search_cache.json`.
- A busca abre um único navegador e uma página por marketplace.
- Links são aceitos somente quando usam HTTPS e pertencem ao domínio esperado.
- Resultados precisam ter correspondência mínima com os termos pesquisados.
- A comparação pesquisa pelos termos centrais do produto (até cinco), preserva
  modelo/capacidade e ignora cor e expressões comerciais.
- Falha em um marketplace não invalida os resultados dos demais.
- A comparação usa no máximo um resultado validado por marketplace para que
  uma loja com muitos anúncios não distorça a mediana.
- A nota exige pelo menos dois marketplaces equivalentes.

## Variáveis

- `MARKETPLACE_SEARCH_ENABLED`: habilita a rota; padrão `true`.
- `MARKETPLACE_SEARCH_CACHE_MINUTES`: validade compartilhada do cache; padrão 30.
- `MARKETPLACE_SEARCH_RESULTS_PER_SITE`: de 1 a 8; padrão 4.

## Validação

- `npm test`
- `npm run test:smoke`
- Testar uma consulta real e confirmar que os cards não possuem seleção ou
  botões de WhatsApp.
