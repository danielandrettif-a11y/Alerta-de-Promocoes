# Constituição do Projeto - Promo Automator (V.L.A.E.G. Simplificado)

Este espaço define os invariantes, schemas de dados e regras comportamentais específicas do projeto simplificado.

---

## Esquemas de Dados (Data Schemas)

### Payload de Entrada (Envio de Story & Oferta via Painel)
```json
{
  "title": "Smartphone Samsung Galaxy S24 Ultra",
  "originalPrice": "R$ 6.999,00",
  "currentPrice": "R$ 4.899,00",
  "discount": 30,
  "link": "https://www.mercadolivre.com.br/p/MLB12345",
  "image": "https://http2.mlstatic.com/D_NQ_NP_2X_987654-MLA123-F.webp",
  "category": "Celulares",
  "platform": "mercado_livre",
  "imageBuffer": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...", // Imagem em Base64 gerada pelo Canvas
  "dealType": "Oferta Relâmpago" // "Oferta Relâmpago", "Oferta do Dia", etc.
}
```

### Payload de Saída (Confirmação de Envio)
```json
{
  "success": true,
  "message": "Oferta enviada com sucesso para o WhatsApp!",
  "msgId": "true_120363410833991285@g.us_3EB0C5..."
}
```

```

### Payload do Comparador de Preços (`/api/compare-price`)
```json
{
  "success": true,
  "query": "jameson whiskey irland 750",
  "buscape": {
    "price": 69.08,
    "priceText": "R$ 69,08",
    "url": "https://www.buscape.com.br/search?q=..."
  },
  "zoom": {
    "price": 69.08,
    "priceText": "R$ 69,08",
    "url": "https://www.zoom.com.br/search?q=..."
  },
  "bondfaro": {
    "price": 69.08,
    "priceText": "R$ 69,08",
    "url": "https://www.bondfaro.com.br/search?q=..."
  },
  "minPrice": 69.08,
  "priceText": "R$ 69,08",
  "url": "https://www.buscape.com.br/search?q=..."
}
```

### Estrutura de Ofertas no Banco Local (`mercado_livre_deals_report.json` e `amazon_deals_report.json`)
```json
{
  "generatedAt": "2026-07-15T22:00:00.000Z",
  "deals": [
    {
      "title": "Jogo de Panelas 5 Peças",
      "link": "https://www.mercadolivre.com.br/...",
      "image": "https://...",
      "originalPrice": "R$ 499,00",
      "currentPrice": "R$ 299,00",
      "discount": 40,
      "isFreeShipping": true,
      "isFull": true,
      "dealType": "Oferta do Dia",
      "timeLeft": "Acaba em 5h"
    }
  ]
}
```
 
---
 
## Regras Comportamentais
 
1. **Geração via Canvas no Frontend**: Toda a renderização do design visual do Story vertical (1080x1920) ocorre diretamente no lado do cliente usando a API HTML5 Canvas. O servidor Express não roda instâncias do Puppeteer para tirar capturas de tela dos Stories, apenas recebe a imagem final em formato Base64.
2. **Uso de Links Diretos**: Não há processamento de links de afiliados (encurtadores do Mercado Livre stripe/headless e similares desativados). As mensagens no WhatsApp levam o link original de destino da promoção.
3. **Moderação por Reação (🔥)**: O bot escuta ativamente o evento de reações (`message_reaction`) no WhatsApp Web. Caso um administrador adicione a reação de foguinho (`🔥`) em qualquer mensagem enviada pelo bot, o bot deve excluir imediatamente essa mensagem para todos no grupo (`msg.delete(true)`).
4. **Comandos Interativos do WhatsApp**: O robô responde a comandos direcionados no grupo usando *@antigravity* seguidos por:
   - Uma **quantidade** de produtos (ex: `5` ou `enviar 3`). Ele busca na base unificada local os X itens com maiores descontos e os envia no formato de Story + legenda de forma sequencial.
   - Uma **categoria** de produtos (ex: `celulares`, `cozinha`). Ele localiza a oferta de maior desconto na categoria especificada e a posta no grupo.
6. **Comparador Triplo Paralelo**: A rota de consulta `/api/compare-price` executa pesquisas em tempo real no Buscapé, Zoom e Bondfaro em paralelo. O menor preço é filtrado com base em um limite de corte dinâmico de 60% do preço de promoção para evitar ruídos de acessórios, e uma margem de tolerância de 2% é usada para avaliar a equivalência com a nossa promoção.
  
---
 
## Invariantes Arquiteturais
 
1. **Camada 3 (Execução)**: 
   - `execution/whatsapp_client.js`: Gerenciador da sessão e envio direto de mensagens/mídia.
   - `execution/mercado_livre_deals.js`: Scraper de ofertas e cupons do Mercado Livre.
   - `execution/amazon_deals.js`: Novo scraper de ofertas da Amazon.
2. **Camada 2 (Servidor)**: `server.js` gerencia endpoints da API, serve os arquivos estáticos, coordena o disparo dos scripts de scraping de ofertas/cupons de forma concorrente e mantém a conexão activa com o WhatsApp.
3. **Segurança de Sessão**: A autenticação do WhatsApp Web é persistida localmente na pasta `.tmp/wpp_session`.
