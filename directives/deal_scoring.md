# Directive: Deal Opportunity Score

## Goal

Rank offers from Mercado Livre, Amazon and Shopee using comparable evidence,
without inventing commission, sales or coupon prices.

## Inputs

- Demand: sales count/velocity, rating and likes.
- Offer: confirmed marketplace comparison and real discount.
- Return: product/feed commission or a maintained marketplace/category rule.
- Trust: product/shop rating, shipping and official-feed evidence.
- Presentation fit, catalog freshness and strategic recurrence.

## Output

Each deal receives `promotionScore.value` (0-100), `stars` (0-5),
`confidence`, `components`, `blockers` and `calculatedAt`. Missing optional
signals lower confidence and pull the score toward neutral instead of receiving
an assumed value.

The dashboard defaults to the opportunity score and allows explicit sorting by
demand, commission percentage/value, discount, sales and rating. The component
breakdown must remain collapsed by default.

## History

Store one snapshot per marketplace catalog timestamp in
`${APP_RUNTIME_DIR}/deal_metrics_history.json`. Keep at most 120 days and 50,000
entries. Use only older snapshots to calculate sales velocity.

## Boundaries

- `affiliate_commissions.json` may contain marketplace/category fallbacks, but
  starts empty and must have an `updatedAt` timestamp when populated.
- The score assists manual review. It does not publish, select Instagram posts
  or route WhatsApp groups automatically.
