# ICP Fit Scorer MCP Server

[![Smithery](https://smithery.ai/badge/mambabuilt/mcp-icp-fit-scorer)](https://smithery.ai/servers/mambabuilt/mcp-icp-fit-scorer) [![Glama score](https://glama.ai/mcp/servers/mambalabsdev/mcp-icp-fit-scorer/badges/score.svg)](https://glama.ai/mcp/servers/mambalabsdev/mcp-icp-fit-scorer) [![MCP Registry](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.modelcontextprotocol.io%2Fv0%2Fservers%3Fsearch%3Dcom.mambabuilt%252Fmcp-icp-fit-scorer%26limit%3D1&query=%24.servers%5B0%5D._meta%5B%22io.modelcontextprotocol.registry%2Fofficial%22%5D.status&label=mcp%20registry&color=blue)](https://registry.modelcontextprotocol.io/v0/servers?search=com.mambabuilt/mcp-icp-fit-scorer&limit=1) [![npm version](https://img.shields.io/npm/v/@mambalabsdev/mcp-icp-fit-scorer)](https://www.npmjs.com/package/@mambalabsdev/mcp-icp-fit-scorer) [![npm downloads](https://img.shields.io/npm/dm/@mambalabsdev/mcp-icp-fit-scorer)](https://www.npmjs.com/package/@mambalabsdev/mcp-icp-fit-scorer) [![license](https://img.shields.io/github/license/mambalabsdev/mcp-icp-fit-scorer)](https://github.com/mambalabsdev/mcp-icp-fit-scorer/blob/main/LICENSE) [![mcpservers.org](https://img.shields.io/badge/mcpservers.org-listed-blue)](https://mcpservers.org/servers/mambalabsdev/mcp-icp-fit-scorer)

An MCP server that scores a company against your ideal customer profile. It wraps the Mamba Labs ICP Fit Scorer actor on Apify and returns a Clay-ready flat JSON row to any MCP client.

## What's Inside

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Prerequisites](#prerequisites)
- [Example prompts](#example-prompts)
- [Inputs](#inputs)
- [Output](#output)
- [Example output](#example-output)
- [Features](#features)
- [How each call runs](#how-each-call-runs)
- [Full actor documentation](#full-actor-documentation)
- [Mamba Labs GTM Suite](#mamba-labs-gtm-suite)
- [License](#license)

## What it does

Give it a company domain and a definition of your ICP, and it scores the company on weighted signals, returning a 0 to 100 score, an A to D tier, and a per-signal breakdown. Define your ICP three ways: a prebuilt template, a JSON scoring config, or a plain-English description (which uses your own LLM key). Turn on `fetch_signals` and the actor will gather hiring and tech-stack signals for you before scoring. One flat row, ready for Clay, a CRM, or an AI agent workflow. All of the scoring runs on Apify. This package is a thin client that calls the actor and hands back the result.

## Quick start

You need Node.js 18 or newer and an Apify account with an API token.

Add this to your Claude Desktop config:

```json
{
  "mcpServers": {
    "mamba-icp-scorer": {
      "command": "npx",
      "args": ["-y", "@mambalabsdev/mcp-icp-fit-scorer"],
      "env": {
        "APIFY_TOKEN": "your-apify-token"
      }
    }
  }
}
```

Get your token at https://console.apify.com/account/integrations, paste it in, and restart Claude Desktop. The `score_icp_fit` and `list_icp_templates` tools will be available.

## Prerequisites

- Node.js 18 or newer
- An Apify account with an API token

## Example prompts

- "Score clay.com against the b2b_saas template and fetch its signals."
- "How well does stripe.com fit an ICP of mid-market fintech companies? Explain the score."
- "Score figma.com with my scoring config and include the per-signal breakdown."
- "Rate openai.com against this ICP description: enterprise AI teams hiring for go-to-market."

## Inputs

Every input the tool accepts, generated from the server's own tool list.

### `score_icp_fit`

| Input | Type | Required | Description |
| --- | --- | --- | --- |
| `company_domain` | string | yes | The primary domain of the company to score. Example: clay.com |
| `company_name` | string | no | Optional display name of the company. |
| `template` | one of `full_signal`, `saas_outbound`, `b2b_services`, `fintech`, `smb_local`, `enterprise` | no | Name of a prebuilt scoring config, one of the six the actor ships: full_signal, saas_outbound, b2b_services, fintech, smb_local, enterprise. Alternative to scoring_config or icp_description. Call list_icp_templates to see them. |
| `scoring_config` | object | no | JSON object of scoring weights. Alternative to template or icp_description. |
| `icp_description` | string | no | Plain-English description of your target ICP. Requires llm_api_key. Alternative to template or scoring_config. |
| `llm_api_key` | string | no | Your OpenAI or Anthropic API key. Required only when using icp_description. |
| `llm_provider` | one of `openai`, `anthropic` | no | LLM provider to use with icp_description: openai or anthropic. |
| `fetch_signals` | boolean | no | If true, the actor fetches hiring and tech-stack signals for the company automatically before scoring. |
| `include_explanation` | boolean | no | If true, adds a score_explanation string to the output describing how the score was derived. |
| `tier_thresholds` | object | no | Optional. Minimum score for each tier as { "tier_a": number, "tier_b": number, "tier_c": number }. Scores at or above tier_a are A, tier_b are B, tier_c are C, else D. Defaults to 80 / 60 / 40. |
| `funded_within_days` | integer | no | Optional. How recent a funding round must be to count for the recently_funded signal, in days. Defaults to 540 (18 months). |
| `min_score_to_output` | integer | no | If set, rows scoring below this threshold are skipped from output (not pushed to dataset). Skipped rows are logged only. |
| `previous_score` | integer | no | Previous ICP score for this company. If provided, output includes score_change and score_trend fields. |
| `gtm_hiring_signal` | string | no | Whether the company is actively hiring for GTM/sales roles. Accepts a boolean-like string ("true"/"false"). Sent as a string for Clay compatibility and coerced to boolean at runtime. |
| `gtm_role_count` | string | no | Number of open GTM/sales roles. Scores via the gtm_role_count_strong signal when at or above min_gtm_roles (default 2). Accepts a numeric string (e.g. "8"). Sent as a string for Clay compatibility and coerced to integer at runtime. |
| `uses_hubspot` | string | no | Whether the company uses HubSpot. Accepts a boolean-like string ("true"/"false"). Sent as a string for Clay compatibility and coerced to boolean at runtime. |
| `uses_salesforce` | string | no | Whether the company uses Salesforce. Accepts a boolean-like string ("true"/"false"). Sent as a string for Clay compatibility and coerced to boolean at runtime. |
| `uses_clay` | string | no | Whether the company uses Clay. Accepts a boolean-like string ("true"/"false"). Sent as a string for Clay compatibility and coerced to boolean at runtime. |
| `crm_detected` | string | no | Whether any CRM was detected. Accepts a boolean-like string ("true"/"false") or any non-empty CRM name (e.g. "Salesforce"). Sent as a string for Clay compatibility and coerced to boolean at runtime. Auto-derived from uses_hubspot/uses_salesforce if not set. |
| `seq_tool_detected` | string | no | Whether a sales sequencing tool (Outreach, SalesLoft, Apollo, Lemlist) was detected. Accepts a boolean-like string ("true"/"false") or any non-empty tool name (e.g. "Outreach"). Sent as a string for Clay compatibility and coerced to boolean at runtime. |
| `tech_stack` | string | no | Comma-separated list of technologies. Used to auto-detect CRM/sequencing tools if booleans are not set. |
| `headcount` | string | no | Current employee headcount. Accepts a numeric string (e.g. "3000"). Sent as a string for Clay compatibility and coerced to integer at runtime. |
| `headcount_min` | integer | no | Minimum headcount for the headcount_in_range signal. |
| `headcount_max` | integer | no | Maximum headcount for the headcount_in_range signal. |
| `headcount_in_range` | boolean | no | Override: whether headcount is in your target range. |
| `employee_band` | string | no | Firmographic employee band from the Company Firmographic Enricher (Actor ID YlUtLWjfPpqykmB8g), e.g. "201-500". Scores via employee_band_match when it is in target_employee_bands. |
| `revenue_estimate` | string | no | Estimated annual revenue in dollars from the Company Firmographic Enricher (Actor ID YlUtLWjfPpqykmB8g). Scores via revenue_in_range. Accepts a numeric string (e.g. "50000000"). Coerced to integer at runtime. |
| `hq_location` | string | no | Headquarters location from the Company Firmographic Enricher (Actor ID YlUtLWjfPpqykmB8g). Carried for reference; not currently scored. |
| `founded_year` | string | no | Year the company was founded, from the Company Firmographic Enricher (Actor ID YlUtLWjfPpqykmB8g). Carried for reference; not currently scored. Accepts a numeric string (e.g. "2015"). |
| `recently_funded` | boolean | no | Override: whether the company was recently funded (within funded_within_days, default 540). |
| `last_funding_date` | string | no | ISO date of last funding round (legacy field; latest_funding_date is preferred). Used to auto-detect recently_funded if the boolean is not set. |
| `latest_funding_date` | string | no | ISO date of the latest funding round (from C1 Funding & Press Signal Scanner when it ships). Drives recently_funded against funded_within_days. |
| `latest_funding_amount` | string | no | Dollar amount of the latest funding round (from C1 when it ships). Scores via well_funded when at or above min_funding_amount (default 1000000). Accepts a numeric string (e.g. "50000000"). |
| `funding_stage` | string | no | Funding stage (e.g. seed, series_a, series_b, growth). Used to infer recently_funded. |
| `industry` | string | no | The company's industry (from the Company Firmographic Enricher, Actor ID YlUtLWjfPpqykmB8g). |
| `industry_match` | boolean | no | Override: whether the company's industry matches your target list. |
| `target_industries` | string | no | Comma-separated list of target industries for the industry_match signal. |
| `social_platforms_found` | string | no | Number of official social platforms found, from the Company Social Presence Mapper (Actor ID 4k6CCemkgBDz18m2h). Scores via social_presence when at or above min_social_platforms (default 2). Accepts a numeric string. |
| `total_followers` | string | no | Total social followers across platforms, from the Company Social Presence Mapper (Actor ID 4k6CCemkgBDz18m2h). Scores via strong_social_following when at or above min_total_followers (default 1000). Accepts a numeric string. |
| `has_linkedin` | string | no | Whether a company LinkedIn page was found, from the Company Social Presence Mapper (Actor ID 4k6CCemkgBDz18m2h) or the Domain to LinkedIn URL Resolver (Actor ID 3HtnSaqPHOg1Qg5gx). Contributes to social_presence. Accepts a boolean-like string. |
| `has_twitter` | string | no | Whether a company X/Twitter profile was found, from the Company Social Presence Mapper (Actor ID 4k6CCemkgBDz18m2h). Contributes to social_presence. Accepts a boolean-like string. |
| `job_count` | string | no | Number of open jobs found, from the Job Board Keyword Signal Scanner (Actor ID 4DvqpvhMR74NLcDDY). Scores via active_hiring_volume when at or above min_job_count (default 3). Accepts a numeric string. |
| `keyword_match_count` | string | no | Number of target-keyword matches found, from the Job Board Keyword Signal Scanner (Actor ID 4DvqpvhMR74NLcDDY). Scores via keyword_signal_match when at or above min_keyword_matches (default 1). Accepts a numeric string. |

### `list_icp_templates`

No inputs. Returns the six prebuilt template names `score_icp_fit` accepts, with the actor's note on how they differ. It answers locally: no Apify run, no token, and no charge.

Define your ICP with exactly one of `template`, `scoring_config`, or `icp_description`.

This server exposes the single-company scoring path. The actor also supports batch inputs (a dataset or CSV of companies) and a results webhook. For those, run the actor directly on Apify.

## Output

The tool returns the actor's flat JSON row for the scored company, including `icp_score` (0 to 100), `icp_tier` (A to D), the per-signal breakdown, and an optional explanation. See the Apify Store page for the full output schema.

## Example output

```json
{
  "company_domain": "ramp.com",
  "icp_score": 87,
  "icp_tier": "A",
  "lead_tag": "priority",
  "score_hiring": 25,
  "score_tech_stack": 22,
  "score_headcount": 20,
  "score_funding": 20,
  "score_industry": 0,
  "run_date": "2026-05-28"
}
```

## Features

- User-defined JSON scoring config with custom weights
- Returns icp_score (0 to 100), icp_tier (A to D), and lead_tag
- Per-signal point breakdown: hiring, tech stack, headcount, funding, industry
- Replaces 6+ manual formula columns in Clay

## How each call runs

Each call starts the actor run, polls it until it finishes, then reads the dataset. The run is allowed 300 seconds, as before. If the run is still going when this call stops waiting, the call returns the run id and a console link instead of a timeout, so the result is never lost.

## Full actor documentation

This server is a thin client and holds no scoring logic. For the complete input and output reference, pricing, and run history, see the Apify Store page:

https://apify.com/mambalabs/icp-account-lead-scoring-fit-scorer-0-100-for-clay

---

## Mamba Labs GTM Suite

This server is one of 54 Mamba Labs MCP servers, each backed by a dedicated Apify actor and published under [@mambalabsdev on npm](https://www.npmjs.com/org/mambalabsdev). The ones closest to this server:

| Actor | Immutable Actor ID |
|---|---|
| [GTM Hiring Signal Scraper](https://apify.com/mambalabs/gtm-hiring-signal-scraper) | `D7O1SA2EqwHGsGr1P` |
| [Tech Stack Signal Detector](https://apify.com/mambalabs/gtm-tech-stack-signal-scraper) | `qyd7nNyqFPelQViBx` |
| [GTM Signals Aggregator](https://apify.com/mambalabs/b2b-buying-signals-hiring-tech-stack-intent-for-clay) | `xKdRfnfFNkdMpFuNs` |
| [Job Board Keyword Signal Scanner](https://apify.com/mambalabs/job-board-keyword-signal-scanner) | `4DvqpvhMR74NLcDDY` |
| [Domain to LinkedIn URL Resolver](https://apify.com/mambalabs/domain-to-linkedin-url-resolver) | `3HtnSaqPHOg1Qg5gx` |
| [ICP Fit Scorer](https://apify.com/mambalabs/icp-account-lead-scoring-fit-scorer-0-100-for-clay) | `W161DT8W4kW55dMFh` |
| [Domain Deliverability Checker](https://apify.com/mambalabs/domain-deliverability-checker) | `0tVgxI7A6o9jMlxmc` |
| [Company Firmographic Enricher](https://apify.com/mambalabs/company-firmographic-enricher) | `YlUtLWjfPpqykmB8g` |
| [Company Social Presence Mapper](https://apify.com/mambalabs/company-social-presence-mapper) | `4k6CCemkgBDz18m2h` |
| [Company Identity Resolver](https://apify.com/mambalabs/company-identity-resolver) | `lr8fTRAmZCBZmuwwh` |
| [Company Change Event Feed](https://apify.com/mambalabs/company-change-event-feed) | `oX44rS0fkEJ3rXLWe` |
| [Funding and Press Signal Scanner](https://apify.com/mambalabs/funding-press-signal-scanner) | `FS13X6dhQVgX3XOM6` |

To get twenty one of them in one install, use [@mambalabsdev/mcp-gtm-suite](https://www.npmjs.com/package/@mambalabsdev/mcp-gtm-suite).

> Built by [Mamba Labs](https://mambabuilt.com) | [npm](https://www.npmjs.com/org/mambalabsdev) | [Apify Store](https://apify.com/mambalabs)

## License

MIT

Built by Mamba Labs. https://apify.com/mambalabs
