# Directive: Shopee Affiliate Product Feed

## Goal

Import the official Shopee affiliate CSV feed into a compact, ranked JSON
report that can later power a Shopee tab in the dashboard.

## Inputs

- One or more official CSV files downloaded from **Criativo > Feed de produto**.
- CLI: `node execution/shopee_feed.js <feed.csv> [more-feeds.csv]`
- `SHOPEE_MIN_DISCOUNT` (default `30`)
- `SHOPEE_MAX_DISCOUNT` (default `80`)
- `SHOPEE_MIN_ITEM_RATING` (default `4.5`)
- `SHOPEE_MIN_SHOP_RATING` (default `4.5`)
- `SHOPEE_MAX_PRODUCTS` (default `400`)
- `SHOPEE_INCLUDE_CROSS_BORDER` (default `false`)
- `SHOPEE_OUTPUT_PATH` (default `shopee_deals_report.json`)
- `SHOPEE_FEED_ENABLED` (default `true` when a URL is configured)
- `SHOPEE_OFFICIAL_FEED_URLS` (comma-separated official feed files)
- `SHOPEE_GENERAL_FEED_URLS` (comma-separated general feed files)

## Execution

- Script: `execution/shopee_feed.js`
- Parse the CSV as a stream because each file can contain 100,000 products
  and multiline descriptions.
- Use `shopId + itemId` as the stable product identity.
- Prefer rows from **Shopee Oficial BR** when a product also exists in the
  general **Shopee Brasil** feed.
- Keep only products with valid HTTPS product and image links, valid prices,
  the configured discount and ratings, and the configured cross-border rule.
- Exclude implausible discounts above the configured ceiling because the feed
  can mix prices from different variants or contain malformed list prices.
- Rank by product rating, discount, shop rating and likes.
- General-feed rows do not contain shop name/rating or cross-border status;
  keep those fields unknown instead of inventing values.
- Write the report atomically and preserve the previous valid report if an
  import fails.
- `execution/shopee_refresh.js` probes each configured URL with a one-byte
  range request during the existing refresh cycle. Download and import all
  files only when the Shopee `ETag` or fallback file metadata changes.
- Store the last successfully imported feed version in
  `${APP_RUNTIME_DIR}/shopee_feed_state.json`.

## Output

`shopee_deals_report.json` with:

- generation and source metadata;
- import/rejection statistics;
- an empty `coupons` array for report compatibility;
- up to `SHOPEE_MAX_PRODUCTS` normalized `deals`.

The normalized deals must keep the common dashboard fields: `title`, `link`,
`image`, `rating`, `salesInfo`, `discount`, `originalPrice`, `currentPrice`,
`isFreeShipping`, `dealType` and `timeLeft`.

## Affiliate boundary

- `product_link` is the product URL used by the queue and extension.
- `product_short link` (`shope.ee/an_redir`) is catalog metadata only.
- Only a confirmed `https://s.shopee.com.br/...` conversion link may be
  treated as an affiliate link.
- Feed URLs and opaque download IDs belong in `.env`, never in source control.
- Do not scrape Shopee product pages as a fallback.
- The portal promises daily updates but does not document an exact count or
  hour. Do not encode a once-per-day assumption; use the file version.

## Failure behavior

- Reject malformed rows without aborting the remaining file.
- Abort on an invalid CSV structure or missing required headers.
- Never replace a previous report with a partial report after a fatal error.
