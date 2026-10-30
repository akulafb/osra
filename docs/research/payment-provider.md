# Which payment provider fits a per-Tree plan?

Researched 2026-10-30 from each provider's own pricing and docs. Nothing was signed up for or called. LIN-85; the plan itself comes after launch (ADR 0021).

## Answer

- **Use a merchant of record (MoR), not a plain processor.** With no legal review (ADR 0023), the MoR carries sales tax and VAT registration, filing, remittance, disputes and customer support. A plain processor leaves the seller as merchant of record ([Stripe comparison table](https://docs.stripe.com/payments/managed-payments)).
- **Recommended: Stripe Managed Payments**, if Stripe accepts the Owner's business. Its fee is the lowest of the MoR options at a low price, it sits on the same Stripe account and API as ordinary Stripe, and a Tree id can ride on the subscription as metadata.
- **Fallback: Paddle** (5% + 50¢, flat, tax and chargebacks included) if Stripe's eligibility review declines the Owner or their country.
- **Not established:** the Owner's country, so eligibility for either is unconfirmed; the plan's price, so the fee figures below are illustrations; and whether Stripe Billing's 0.7% adds on top of Managed Payments (see Gaps).

## Fees

All figures are as published on 2026-10-30.

| Provider | Type | Published fee | Source |
|---|---|---|---|
| Stripe Managed Payments | MoR | 3.5% per Managed Payments transaction, *in addition to* Payments fees (2.9% + 30¢ domestic card, +1.5% international card, +1% currency conversion). Disputes: $15 received. | [Stripe pricing](https://stripe.com/pricing) |
| Paddle | MoR | 5% + 50¢ per Checkout transaction. No monthly fee. Orders under $10: "contact us for bespoke pricing". | [Paddle pricing](https://www.paddle.com/pricing) |
| Polar | MoR | Starter 5% + 50¢; Pro ($20/mo) 3.8% + 40¢; Growth ($100/mo) 3.6% + 35¢; +1.5% international cards; $15 per dispute whatever the outcome; payout fees passed through ($2/mo, 0.25% + $0.25 per payout). | [Polar fees](https://polar.sh/docs/merchant-of-record/fees) |
| Stripe Payments (plain processor) | Processor | 2.9% + 30¢; Billing 0.7% of Billing volume on pay-as-you-go; Tax Basic 0.5% per transaction (no-code) or $0.50 (API), only where the seller is registered; disputes $15 received. | [Stripe pricing](https://stripe.com/pricing) |

**Estimate, not a quote:** on an invented $5 monthly plan paid by a domestic card, Stripe Managed Payments costs about 6.4% + 30¢ = $0.62 (about $0.65 if Billing's 0.7% also applies). Paddle and Polar Starter cost $0.75. A plain processor is about $0.45 plus Billing and Tax fees, but then the Owner does the tax work. International cards add 1.5% at Stripe and Polar; Paddle's page lists no surcharge.

Lemon Squeezy (also an MoR) is left out: its fee page returned 404, and secondary reports say it is moving onto Stripe Managed Payments, so Stripe is the one to pick either way. Reports I did not verify at the source.

## Sales tax and VAT

- **Stripe Managed Payments:** Stripe "calculates and collects tax … then files and remits payments to the relevant tax authorities" for sales in more than 80 countries. In other countries the seller stays responsible. ([how it works](https://docs.stripe.com/payments/managed-payments/how-it-works))
- **Paddle:** "Total adherence to sales tax and VAT rules"; its FAQ says it collects the correct rate and tracks filing deadlines. ([pricing](https://www.paddle.com/pricing)) Its buyer terms call Paddle "an authorised reseller" ([buyer terms](https://www.paddle.com/legal/checkout-buyer-terms)).
- **Polar:** "We take on the liability of international sales taxes globally for you." The seller still owes income tax in their own country. ([MoR intro](https://polar.sh/docs/merchant-of-record/introduction))
- **Plain Stripe:** the seller is merchant of record; Stripe Tax is an add-on. ([comparison table](https://docs.stripe.com/payments/managed-payments)) Stripe Tax's charge applies "where you're registered to collect taxes", so registration stays the Owner's job.
- Every MoR leaves the Owner's own income tax with the Owner.

## Refunds and chargebacks

- **Stripe Managed Payments:** Stripe handles disputes, "including submitting evidence on your behalf", and covers the evidence fee when it counters; the $15 received fee still applies. Customers can ask Link support for refunds, and Stripe can refund within 60 days "in certain cases". If the seller does not answer Stripe within 48 hours, Stripe "might issue a refund without your approval". A refund returns the tax to the buyer, but in some jurisdictions the seller's balance is reduced by the original tax. Stripe requires a low dispute rate to stay eligible. ([how it works](https://docs.stripe.com/payments/managed-payments/how-it-works), [eligibility](https://docs.stripe.com/payments/managed-payments/eligibility))
- **Paddle:** the pricing page lists "Fraud protection, chargebacks, and buyer support" as included. It does not mention refunds, and I could not reach Paddle's refund-policy page (404), so refund terms are not established. Buyer terms give EU/EEA and UK consumers a 14-day withdrawal right. ([pricing](https://www.paddle.com/pricing), [buyer terms](https://www.paddle.com/legal/checkout-buyer-terms))
- **Polar:** refunds are available; "the initial transaction fees are not refunded to you"; $15 per dispute whatever the outcome; Polar "might … suspend your account" if chargebacks stay high. ([fees](https://polar.sh/docs/merchant-of-record/fees))
- **Plain Stripe:** the seller answers disputes ($15 received, $15 more to counter, refunded if won). ([pricing](https://stripe.com/pricing))

## Tying a subscription to one Tree

Osra's rule (ADR 0021, ADR 0022): one plan, bought per Tree by its Master Admin. The shape is one subscription per Tree id, paid by the Master Admin's account.

- **Stripe:** Checkout's `subscription_data.metadata` saves onto the Subscription, and webhooks return the object with its metadata. Metadata allows 50 pairs, keys 40 characters, values 500 characters. Put the Tree id there, and read the subscription's status from `invoice.paid` and the status field. ([metadata](https://docs.stripe.com/metadata), [subscription lifecycle](https://docs.stripe.com/billing/subscriptions/overview))
- **Managed Payments limits:** subscriptions must be created through Checkout or Payment Links; Connect, Elements and one-off invoices on a subscription are unsupported; there are no custom domains on its checkout; customers manage orders at Link. None of these blocks a single plan per Tree. ([overview](https://docs.stripe.com/payments/managed-payments))
- **Managed Payments category:** the product needs an eligible tax code. SaaS and "Website Information Services" codes are on the list; the plan's feature (a larger AI chat allowance) fits "AI as a Service" codes. Professional services are excluded. ([eligibility](https://docs.stripe.com/payments/managed-payments/eligibility))
- **Paddle:** `custom_data` set at checkout is saved on the transaction and, for recurring items, "stored against the created subscription, too". ([custom data](https://developer.paddle.com/api-reference/about/custom-data))
- **Polar:** I did not find its metadata docs; not established.
- **Account deletion:** with Managed Payments, a buyer's data-deletion request cancels their subscriptions and deletes the Stripe objects. A Master Admin deleting their Link account would cancel the Tree's plan. ([how it works](https://docs.stripe.com/payments/managed-payments/how-it-works)) ADR 0023 needs the Tree-handover spec to cover this.

## Merchant of record against plain processor

| | MoR | Plain processor |
|---|---|---|
| Fee at a low price | Higher: 5% + 50¢ (Paddle), 3.5% on top of Stripe's 2.9% + 30¢ | Lowest, before tax tooling and Billing |
| Sales tax and VAT | Provider registers, collects, files | Owner registers, files; tool only calculates |
| Chargebacks | Provider fights them | Owner fights them |
| Support | Provider handles transaction support | Owner |
| Legal exposure | Lower; fits ADR 0023's "no legal review" | Owner needs to know each country's rules |

## Gaps

- **Owner's country and business type:** unknown to this research. Managed Payments covers a listed set of business locations (e.g. US, CA, most of Europe, AU, HK, JP, SG) after an eligibility review; Paddle's own acceptance rules were not read.
- **Stripe Managed Payments availability:** the docs read as live, but Stripe's terms are titled "Preview" in a search result I did not verify at the source.
- **Billing fee with Managed Payments:** whether the 0.7% Billing fee adds to the 3.5% was not stated on the pages I read.
- **Paddle:** refunds, payout terms, and whether orders under $10 get different pricing.
- **Polar:** a tax-liability statement on a docs page, but no refund or chargeback terms for the seller beyond the fee page, and no metadata docs.
- **Lemon Squeezy:** fees and status; its docs page returned 404.
- **Currency, payout timing, minimum payout:** not looked at for any provider.
- **Estimates:** the $5 illustration and its percentages above. Plan price comes after launch.
