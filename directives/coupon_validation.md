# Directive: Product Coupon Validation

## Goal

Add a coupon to a Story for Mercado Livre, Amazon or Shopee only when the
authenticated product page shows both the benefit and a lower final price.

## Flow

1. Parse coupon rules and discard candidates below the minimum purchase or in
   an incompatible category.
2. Keep candidates isolated by marketplace and send them with the existing
   affiliate-link job.
3. The extension reads the normal product page and may open its coupon details.
4. Accept a coupon only when its code and lower price appear together.
5. Persist the product-specific proof and regenerate the Story with the regular
   price, coupon price and code.

## Safety

- Never infer a final coupon price from its percentage alone.
- Never attach a globally confirmed coupon to unrelated products.
- Never automate checkout, purchase or internal marketplace APIs.
- Coupons that are account-only, activation-only or hidden from the product
  page are skipped.
- A product price change removes its previous coupon proof.

## Persistent data

The queue item stores `coupon.code`, `marketplace`, `priceWithoutCoupon`,
`priceWithCoupon`, `savings`, `expiresAt`, `verifiedAt`, `productId`,
`verificationStatus=verified_product` and `verificationSource`.

Discovery, source confirmation and product verification are separate states.
Only `verified_product` may change the displayed price or a generated Story.
Expired coupons are removed from candidates and from product verification.
