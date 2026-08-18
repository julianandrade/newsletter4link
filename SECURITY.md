# Security Policy

## Supported Versions

This is an internal, continuously deployed project for Link Consulting. Security fixes are applied only to the `master` branch, which reflects the current production deployment on Vercel. There are no parallel maintained release lines.

| Version | Supported |
| ------- | ------------------ |
| master (production) | :white_check_mark: |
| older branches / tags | :x: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it privately instead of opening a public issue.

Contact: julian.andrade@linkconsulting.com

Please include where possible:

- A description of the vulnerability and its potential impact
- - Steps to reproduce, or a proof of concept
  - - Relevant logs, requests, or configuration details
   
    - What to expect:
   
    - - Acknowledgement within 2 business days
      - - An initial assessment and expected timeline within 7 business days
        - - Notification once the issue is resolved, or an explanation if the report is declined
         
          - Please do not disclose the vulnerability publicly until it has been fixed.
         
          - ## Scope Notes
         
          - This project handles subscriber email addresses and relies on API keys for Anthropic, OpenAI, and Resend, plus a `CRON_SECRET` protecting scheduled endpoints. Reports involving exposed credentials, unauthorized access to subscriber data, or a bypass of the `CRON_SECRET` check are treated as high priority.
          - 
