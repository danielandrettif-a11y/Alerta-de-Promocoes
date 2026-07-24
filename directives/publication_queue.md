# Directive: Manual Affiliate Publication Queue

## Goal

Prepare Mercado Livre offers for Instagram without automating affiliate-link
generation or Instagram's link sticker. The system may collect the offer,
render the Story and organize the work, but the account-sensitive steps remain
manual.

## Safety boundary

- Never call `execution/get_meli_affiliate_link.js` from this workflow.
- Never open an authenticated Mercado Livre browser profile.
- Never publish an Instagram Story automatically.
- Accept only affiliate links manually supplied by the user.
- Keep the existing WhatsApp publication workflow unchanged.
- Allow the entire feature to be disabled with
  `PUBLICATION_QUEUE_ENABLED=false`.

## States

- `awaiting_affiliate`: Story prepared; waiting for a manually generated link.
- `ready`: affiliate link validated and current offer data still matches.
- `needs_review`: product disappeared or its price changed after preparation.
- `published`: user confirmed the Story was published.
- `discarded`: user chose not to publish the offer.
- `expired`: offer is no longer usable.

## Persistent files

- Queue: `${APP_RUNTIME_DIR}/publication_queue.json`
- Story images: `${APP_RUNTIME_DIR}/publication_queue_assets/`

Both paths must live inside the persistent Coolify volume.

## User flow

1. Select one or more Mercado Livre offers in the dashboard.
2. Add them to the publication queue.
3. Open each product in Mercado Livre and generate the affiliate link manually.
4. Paste the `https://meli.la/...` link into the queue.
5. The server validates the link and rechecks the current catalog entry.
6. Copy the link and share the prepared image through the phone share sheet.
7. Add the Instagram link sticker manually and publish.
8. Mark the queue item as published.

## Validation rules

- Only HTTPS links on the exact `meli.la` hostname are accepted.
- Credentials, fragments and empty paths are rejected.
- An offer that is absent from the current catalog moves to `needs_review`.
- A price change moves the item to `needs_review`.
- A queue item can only be marked `published` from `ready`.
- Active duplicates for the same product reuse the existing queue item.

## Rollback

Set `PUBLICATION_QUEUE_ENABLED=false` to hide and disable the feature without
changing the existing dashboard or WhatsApp workflow. The feature is developed
on the `codex/fila-publicacao` branch from checkpoint `07cd01b`.
