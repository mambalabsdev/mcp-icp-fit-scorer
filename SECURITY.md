# Security Policy

## Supported versions

The latest published `1.x` release of
`@mambalabsdev/mcp-icp-fit-scorer` receives security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a vulnerability

Please do not open a public GitHub issue for security reports.

Email security reports to **labs@mambamindsetgrowth.com** with:

- a description of the issue and its impact,
- steps to reproduce, and
- any relevant logs or proof of concept.

We aim to acknowledge reports within 3 business days and to provide a remediation
timeline after triage. Coordinated disclosure is appreciated.

## Handling of credentials

This server reads an `APIFY_TOKEN` from the environment and uses it only to call
the Apify API on your behalf. The token is never logged or written to disk by this
package. Treat your `APIFY_TOKEN` as a secret and rotate it at
https://console.apify.com/account/integrations if you believe it has been exposed.
