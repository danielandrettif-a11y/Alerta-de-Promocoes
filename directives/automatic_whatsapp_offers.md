# Directive: Automatic WhatsApp Offers

## Goal

Keep product collection independent from WhatsApp publishing. Refresh offer
data once per hour and distribute 15 to 20 unique offers per hour, each with a
generated Story image and a text description.

## Configuration

- `DEALS_REFRESH_ENABLED=true`: enables product refresh.
- `DEALS_REFRESH_INTERVAL_MINUTES=60`: refresh cadence.
- `DEALS_STALE_AFTER_MINUTES=90`: age at which the dashboard warns that data
  is stale.
- `AUTO_RUN_ENABLED=false`: safety switch for WhatsApp publishing. Change to
  `true` only after confirming the group and persistent WhatsApp session.
- `WPP_POSTS_PER_HOUR=15`: target rate, clamped between 15 and 20.
- `MAX_PRODUCTS=400`: catalog size needed for up to 360 unique posts/day at
  15 per hour.
- `ML_MAX_PAGES=15`: Mercado Livre pagination limit, capped at 30.
- `PRICE_COMPARISON_ENABLED=true`: adds a basic market-price estimate to
  every WhatsApp description.
- `PRICE_COMPARISON_CACHE_MINUTES=360`: reuses validated comparisons for six
  hours to avoid unnecessary browser traffic.

## Execution

The server starts two independent timers:

1. `refreshDealsData()` updates Mercado Livre and Amazon data without sending
   messages.
2. `publishNextAutomaticOffer()` runs at an evenly distributed cadence,
   chooses one item not sent during the current São Paulo calendar day,
   generates its Story, sends the Story and description, then records the
   result.

Before sending, the publisher compares sufficiently similar products in
Buscapé, Zoom and Bondfaro. Model/specification tokens such as `130A`, `220V`
or `128GB` must match, and prices outside 45%–250% of the offer price are
discarded. When no trustworthy match remains, the message explicitly says the
comparison was inconclusive instead of claiming a saving.

## Persistent state

- Publication history:
  `${APP_RUNTIME_DIR}/published_history.json`
- Coupon confirmations:
  `${APP_RUNTIME_DIR}/coupon_confirmations.json`

`APP_RUNTIME_DIR` must be inside the Coolify volume mounted at `/data`.

## Capacity rule

Fifteen offers per hour can consume 360 unique products per day; twenty can
consume 480. Never repeat an item merely to reach the target. If the remaining
catalog is insufficient, stop publishing duplicates and show the shortage in
the dashboard.

## Link safety

Automatic publication uses the original product URL. Do not automate the
Mercado Livre affiliate browser in the hourly loop; account-sensitive link
generation stays outside this scheduler.
