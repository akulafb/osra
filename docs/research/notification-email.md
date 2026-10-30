# How should Osra send notification email?

Researched 2026-10-30 for LIN-85. Prices and limits below were read from each provider's own pages on that date and can change.

## Answer

Use **Resend** over its HTTPS API, called from a Supabase edge function that a daily `pg_cron` job triggers through `pg_net`. At the volume ADR 0023 implies (a handful of notices a day at most) the **Free plan costs $0**. Verify a sending subdomain of `osra.cc`, such as `mail.osra.cc`, so that Osra's reputation is kept apart from the root domain. Resend's own docs recommend a subdomain.

Reasons: no SMTP or request-signing code is needed (a plain `fetch`, as in Supabase's own guide), no sandbox review wait, and the free tier is far above need. The runner-up is **Amazon SES** ($0.10 per 1,000 emails): cheaper at scale, but it needs an AWS account, a sandbox exit request (up to 96 hours) and SigV4 signing. Revisit it only if volume passes the Resend Pro tier.

Nothing here needs Supabase Auth's SMTP settings. Sign-in is Google only, so Auth sends no email, and the built-in SMTP is unusable for this anyway (see below).

## Why not Supabase's built-in email

- It only delivers to project team members: "Supabase Auth will refuse to deliver messages to addresses that are not part of the project's team", is limited to "2 messages per hour", and has "No SLA guarantee". Source: <https://supabase.com/docs/guides/auth/auth-smtp>.
- That page covers Supabase Auth messages. It does not describe a general send API, so an edge function has to call a provider itself. Source for the pattern: <https://supabase.com/docs/guides/functions/examples/send-emails>.

## Options compared

| Option | Cost at low volume (read 2026-10-30) | Limits that matter | Source |
|---|---|---|---|
| Resend Free | $0/mo | 3,000 emails/mo, 100/day, 3 domains | <https://resend.com/pricing> |
| Resend Pro | $20/mo for 50,000 | no daily limit, overage $0.90 per 1,000 | <https://resend.com/pricing> |
| Postmark Free Developer | $0/mo | 100 emails/mo, "No overages allowed" | <https://postmarkapp.com/pricing> |
| Postmark Basic | $15/mo from 10,000 emails | 5 sending domains, overage $1.80 per 1,000 | <https://postmarkapp.com/pricing> |
| Amazon SES | $0.10 per 1,000 sent (pay as you go); new accounts get up to $200 credit for 6 months | Sandbox until approved: only verified recipients, 200 messages/24h, 1/second | <https://aws.amazon.com/ses/pricing/>, <https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html> |

A 90-day notice goes to one address per absent Master Admin, so even a very rough 100 Trees with an absent Master Admin per month is far inside Resend Free. The Postmark free plan (100/month) is the tightest and is the only one that could plausibly run out at launch scale.

## Deliverability setup on the Osra domain

- Gmail's rules for all senders to personal accounts (since 2024-02-01): SPF or DKIM, TLS, forward and reverse DNS, spam rate under 0.3%. Senders of 5,000+ a day also need SPF, DKIM and DMARC (policy may be `none`) and one-click unsubscribe. Osra will be far below 5,000 a day, but setting up all three costs nothing. Source: <https://support.google.com/a/answer/81126>.
- Resend: add and verify a domain before sending; it recommends sending from a subdomain; a custom Return-Path subdomain is configurable; DMARC and BIMI come after verification. Source: <https://resend.com/docs/dashboard/domains/introduction>.
- SES: verify the domain first; the console says this speeds up production access. Source: the SES production-access page above.
- The notice is one-to-one and triggered by system state, which SES's docs classify as "Transactional". No unsubscribe link is required by Gmail's rules at this volume. Whether the legal contact address of ADR 0023 should appear as reply-to is the owner's decision.

## How an edge function or scheduled job calls it

1. A `pg_cron` job runs once a day. It uses `net.http_post` (from `pg_net`) to call the edge function, with the project URL and a secret key read from Supabase Vault. Source: <https://supabase.com/docs/guides/functions/schedule-functions>. That page warns that any role able to log in to the database can read the secret key while the request waits in `net.http_request_queue`.
2. The function accepts only the secret key (`verify_jwt` off, `auth: 'secret'` in the guide), as in the scheduling guide above.
3. It finds Master Admins whose last sign-in is over 90 days old and who have not been notified, and sends one email each through `fetch('https://api.resend.com/emails', ...)` with `RESEND_API_KEY` held as an edge function secret. This is the shape of Supabase's own Resend example.
4. It records the notice in a table so a retry or a second run does not send twice. This is a design suggestion, not from a source. Without it, a failed run that retries would re-email people.

Edge function limits (read 2026-10-30): 256MB memory, 2s CPU time, wall clock 150s on Free and 400s on paid plans, 150s request idle timeout. Source: <https://supabase.com/docs/guides/functions/limits>. A daily batch of a few emails fits; if it ever grows, send in small batches per run.

If SES were chosen instead, the function would need AWS SigV4 signing or an SDK (the SES docs list direct HTTPS as "the most advanced method"), which is more code to carry in Deno. Source: <https://docs.aws.amazon.com/ses/latest/dg/send-email-api.html>.

## Could not be established

- The exact DNS records Resend asks for (SPF, DKIM, and so on). Its domains page does not list them, and the add-a-domain guide was not read. Only the dashboard shows them after a domain is added, and nothing was signed up for.
- Postmark's DNS records and Brevo's free-plan limits. The Postmark support page returned 404 and Brevo's pricing pages gave no data or returned 403, so Brevo is left out of the table.
- Whether the Resend Free 100/day and 3,000/month limits would bite an unusually large first batch. Estimate only: the notice volume above is a guess, not measured.
- Real inbox placement on Gmail and Outlook for `osra.cc`. That can only be tested after DNS is set up, which this research did not do.
- The Vault and `pg_net` queue note covers the key exposure only as the Supabase page states it; its practical risk for this project was not assessed.
- Timeouts for `pg_net` calls to edge functions: the scheduling page does not give them.

## Not done

No account was created, no DNS changed and no email sent.
