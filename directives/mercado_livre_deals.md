# Directive: Mercado Livre Deals & Coupons Finder

This Standard Operating Procedure (SOP) fetches active discount coupons and highlights the best-ranked discounted products on Mercado Livre for the day.

## Goal
Automate the aggregation of daily promotions and discount coupons from Mercado Livre. Identify high-rated items (4.5+ stars) with deep discounts and organize them into an actionable report for the user.

## Inputs
- `MIN_DISCOUNT` (integer, optional): Minimum discount percentage to filter products. E.g., `30` for 30% OFF. Default: `30`.
- `MAX_PRODUCTS` (integer, optional): Maximum number of top products to display. Default: `10`.
- `OUTPUT_PATH` (string, optional): The path where the final markdown deals report should be saved. Default: `mercado_livre_deals_report.md`.

## Execution Tools
- Script: `execution/mercado_livre_deals.js`
- External resources fetched:
  - `https://www.mercadolivre.com.br/ofertas` (to scrape daily deals)
  - Web search query (to fetch current day's active coupon codes)

## Output
A formatted Markdown report containing:
- **Active Coupons Table**: A list of valid coupon codes, their requirements, and discount rates.
- **Top Discounted Products**: A table of top-rated items, showing original price, current price, rating, total items sold, discount percentage, and product links.
