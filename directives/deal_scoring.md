# Directive: Deal Opportunity Score

## Goal

Rank offers from Mercado Livre, Amazon and Shopee using comparable evidence,
without inventing commission, sales or coupon prices.

## Inputs and weights

- Demand (35%): sales count/velocity and likes.
- Offer strength (30%): confirmed marketplace comparison and real discount.
- Affiliate return (20%): product/feed commission or a maintained
  marketplace/category rule.
- Product trust (15%): product/shop rating, shipping and official-feed
  evidence.

Each signal belongs to one component only. Missing sub-signals reduce that
component's coverage instead of receiving an assumed value.

## Output

Each deal receives `promotionScore.value` (0-100), `stars` (0-5),
`confidence`, `components`, `blockers` and `calculatedAt`. Missing optional
signals lower confidence and pull the score toward neutral instead of receiving
an assumed value.

The marketplace customer rating and the internal opportunity score must be
labelled separately in the dashboard. The internal score uses five persistent
star positions with empty, half-filled or filled states.

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
