# Directive: Amazon Brasil Deals & Coupons Finder

This Standard Operating Procedure (SOP) fetches top daily promotional deals and clip coupons from Amazon Brasil.

## Goal
Automate the extraction of Amazon Brasil daily deals (`https://www.amazon.com.br/deals`), format affiliate links with the configured Store ID (`AMAZON_ASSOCIATE_TAG`), capture clip coupons, and prepare normalized deals for WhatsApp posts and Instagram Stories.

## Inputs
- `AMAZON_ASSOCIATE_TAG` (string, required in `.env`): Your Amazon Associates Store ID (e.g. `alertadesc0dd-20`).
- `DEALS_STALE_AFTER_MINUTES` (integer, optional): Minutes before cache is considered stale. Default: `90`.

## Execution Tools
- Script: `execution/amazon_deals.js`
- External resources fetched:
  - `https://www.amazon.com.br/deals` (Scraped via Puppeteer with bot evasion headers)

## Output
`amazon_deals_report.json` containing:
- `generatedAt`: ISO 8601 timestamp
- `deals`: Array of normalized objects:
  - `title`: Product description
  - `link`: Product URL with associate tag `?tag=alertadesc0dd-20`
  - `image`: Product image URL
  - `originalPrice`: Original crossed-out price
  - `currentPrice`: Promotional price
  - `discount`: Discount percentage
  - `isFreeShipping`: true (Prime standard)
  - `dealType`: "Oferta Relâmpago" or "Oferta do Dia"
  - `couponBadge`: Clip coupon text if present on the deal card (or null)
  - `rating`, `reviewCount`, `salesInfo`: Demand and trust signals when the
    Amazon page exposes them

## Reliability & Fallback
- Runs in headless mode (true on Linux, false on Windows local).
- In case of browser, network or bot-blocking failure, exits with an error and preserves the previous valid report.
- Never invent a default discount when the crossed-out reference price is
  absent. Discard products without a positive discount backed by a higher
  reference price.
- A collection with no verified deals fails without replacing the last valid catalog.
- A product-page coupon badge is discovery metadata, not proof of the final
  price after coupon.
