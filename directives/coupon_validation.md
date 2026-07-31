# Directive: Product Coupon Validation

## Goal

Add a coupon to a Mercado Livre Story only when the authenticated product page
shows both the candidate code and a lower price with that coupon.

## Flow

1. Parse coupon rules and discard candidates below the minimum purchase or in
   an incompatible category.
2. Send at most five candidates with the existing affiliate-link job.
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

The queue item stores `coupon.code`, `priceWithoutCoupon`, `priceWithCoupon`,
`savings`, `verifiedAt` and `verificationSource`.
