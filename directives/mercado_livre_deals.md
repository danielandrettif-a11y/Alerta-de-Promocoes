# Directive: Mercado Livre Deals & Coupons Finder

This Standard Operating Procedure (SOP) fetches active discount coupons and highlights the best-ranked discounted products on Mercado Livre for the day.

## Goal
Automate the aggregation of daily promotions and discount coupons from Mercado Livre. Identify high-rated items (4.5+ stars) with deep discounts and organize them into an actionable report for the user.

## Inputs
- `MIN_DISCOUNT` (integer, optional): Minimum discount percentage to filter products. E.g., `30` for 30% OFF. Default: `30`.
- `MAX_PRODUCTS` (integer, optional): Maximum number of top products to display. Default: `400`.
- `ML_MAX_PAGES` (integer, optional): Maximum number of offer pages to collect. Default: `15`, capped at `30`.
- `OUTPUT_PATH` (string, optional): The path where the final markdown deals report should be saved. Default: `mercado_livre_deals_report.md`.

## Execution Tools
- Script: `execution/mercado_livre_deals.js`
- External resources fetched:
  - `https://www.mercadolivre.com.br/ofertas` (to scrape daily deals)
  - Web search query (to fetch current day's active coupon codes)

## Output
A formatted Markdown report containing:
- **Coupons Table**: Codes discovered in the external source. They are marked
  `unverified` until the user confirms one after testing it at checkout.
- **Top Discounted Products**: A table of top-rated items, showing original price, current price, rating, total items sold, discount percentage, and product links.

## Coupon reliability

- Never inject hardcoded fallback coupon codes.
- Store the time the source was checked in `lastCheckedAt`.
- Store manual checkout confirmation in
  `${APP_RUNTIME_DIR}/coupon_confirmations.json`.
- If the source is unavailable, preserve the previous list and display its
  state transparently instead of inventing replacement coupons.
