# Directive: FutFanatics Deals & Coupons Finder

This Standard Operating Procedure (SOP) fetches top daily promotional deals and active coupons from FutFanatics Brasil.

## Goal
Automate the extraction of FutFanatics promotional deals (`https://www.futfanatics.com.br/loja/busca.php?loja=311840&categoria=495` and Outlet), format affiliate links (Awin format or direct clean product URLs), capture inline coupons (e.g. `OUTFUT15`), and prepare normalized deals for WhatsApp posts and Instagram Stories.

## Inputs
- `FUTFANATICS_MIN_DISCOUNT` (integer, optional): Minimum discount percentage. Default: `20`.
- `FUTFANATICS_MAX_PRODUCTS` (integer, optional): Maximum number of products to collect. Default: `400`.
- `FUTFANATICS_AWIN_MID` (string, optional in `.env`): Awin Advertiser ID for FutFanatics (default: `20084`).
- `FUTFANATICS_AWIN_PUBLISHER_ID` (string, optional in `.env`): Your Awin Publisher ID.

## Execution Tools
- Script: `execution/futfanatics_deals.js`
- External resources fetched:
  - `https://www.futfanatics.com.br/loja/busca.php?loja=311840&categoria=495` (Scraped via Puppeteer with bot evasion headers)
  - `https://www.futfanatics.com.br/outlet`

## Output
`futfanatics_deals_report.json` containing:
- `generatedAt`: ISO 8601 timestamp
- `deals`: Array of normalized objects:
  - `title`: Product description
  - `link`: Product URL (or Awin deep link if publisher ID is set)
  - `image`: Product image URL on CDN (`images.tcdn.com.br`)
  - `originalPrice`: Original crossed-out price ("De")
  - `currentPrice`: Promotional price ("Por")
  - `discount`: Discount percentage
  - `pixPrice`: Extra 10% OFF PIX price if available
  - `isFreeShipping`: false (standard carrier)
  - `platform`: "futfanatics"
  - `dealType`: "Oferta Outlet" or "Manto em Oferta"
  - `couponBadge`: Product page coupon text if present (or null)
  - `category`, `subcategory`, `categoryIcon`: Categorization from `category_helper.js`

## Reliability & Fallback
- Runs in headless mode.
- Sets standard browser User-Agent headers to ensure reliable page rendering on Tray platform.
- Never invents a default discount when the reference price is absent. Discards products with less than 20% discount.
- Preserves atomic write of `futfanatics_deals_report.json`.
