# Security Policy

## Supported Versions

This is an internal project for Link Consulting. Security fixes are applied only to the
`master` branch, which is what production runs: the Cloud Run service `newsletter4link` in
Google Cloud project `newsletter-link-ai-radar`. There are no parallel maintained release
lines.

Deploys are manual rather than continuous, so a fix on `master` is not live until someone runs
the deploy workflow.

| Version | Supported |
| ------- | ------------------ |
| master (production) | :white_check_mark: |
| older branches / tags | :x: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it privately instead of
opening a public issue.

Contact: julian.andrade@linkconsulting.com

Please include where possible:

- A description of the vulnerability and its potential impact
- Steps to reproduce, or a proof of concept
- Relevant logs, requests, or configuration details

What to expect:

- Acknowledgement within 2 business days
- An initial assessment and expected timeline within 7 business days
- Notification once the issue is resolved, or an explanation if the report is declined

Please do not disclose the vulnerability publicly until it has been fixed.

## Scope Notes

This project handles subscriber email addresses and relies on API keys for Anthropic, OpenAI and
Resend, plus a `CRON_SECRET` protecting scheduled endpoints. Reports involving exposed
credentials, unauthorized access to subscriber data, or a bypass of the `CRON_SECRET` check are
treated as high priority.

Two boundaries are worth naming, because they are the ones a report is most likely to be about:

- **`UNSUBSCRIBE_SECRET`** signs the HMAC tokens that let a subscriber open their own
  unsubscribe page and read an edition in a browser. That signature is the entire gate on those
  surfaces, so anything that lets one token open another subscriber's data is high priority.
- **Sign-in is Google Cloud Identity Platform with Microsoft as the only provider.** The
  dashboard and the write APIs sit behind it; the subscriber-facing pages above deliberately do
  not.
