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

Get your token at https://console.apify.com/account/integrations, paste it in, and restart Claude Desktop. The `score_icp_fit` tool will be available.

## Prerequisites

- Node.js 18 or newer
- An Apify account with an API token

## Example prompts

- "Score clay.com against the b2b_saas template and fetch its signals."
- "How well does stripe.com fit an ICP of mid-market fintech companies? Explain the score."
- "Score figma.com with my scoring config and include the per-signal breakdown."
- "Rate openai.com against this ICP description: enterprise AI teams hiring for go-to-market."

## Inputs

- `company_domain` (required): the primary domain of the company to score. Example: `clay.com`
- `company_name` (optional): display name of the company.
- `template` (optional): name of a prebuilt scoring config.
- `scoring_config` (optional): a JSON object of scoring weights.
- `icp_description` (optional): plain-English ICP description. Requires `llm_api_key`.
- `llm_api_key` (optional): your OpenAI or Anthropic key, used only with `icp_description`.
- `llm_provider` (optional): `openai` or `anthropic`.
- `fetch_signals` (optional): let the actor gather hiring and tech-stack signals automatically.
- `include_explanation` (optional): add a `score_explanation` string to the output.

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

## Full actor documentation

This server is a thin client and holds no scoring logic. For the complete input and output reference, pricing, and run history, see the Apify Store page:

https://apify.com/mambalabs/icp-account-lead-scoring-fit-scorer-0-100-for-clay

---

## Mamba Labs GTM Suite

This server is part of the **Mamba Labs GTM Suite**, a fleet of twelve specialized MCP servers for go-to-market signal intelligence, each backed by a dedicated Apify actor.

| Actor | Immutable Actor ID |
|---|---|
| [GTM Hiring Signal Scraper](https://console.apify.com/actors/D7O1SA2EqwHGsGr1P) | `D7O1SA2EqwHGsGr1P` |
| [GTM Tech Stack Signal Enrichment](https://console.apify.com/actors/qyd7nNyqFPelQViBx) | `qyd7nNyqFPelQViBx` |
| [GTM Signals Aggregator](https://console.apify.com/actors/xKdRfnfFNkdMpFuNs) | `xKdRfnfFNkdMpFuNs` |
| [Job Board Keyword Signal Scanner](https://console.apify.com/actors/4DvqpvhMR74NLcDDY) | `4DvqpvhMR74NLcDDY` |
| [Domain to LinkedIn URL Resolver](https://console.apify.com/actors/3HtnSaqPHOg1Qg5gx) | `3HtnSaqPHOg1Qg5gx` |
| [ICP Fit Scorer](https://console.apify.com/actors/W161DT8W4kW55dMFh) | `W161DT8W4kW55dMFh` |
| [Domain Deliverability Checker](https://console.apify.com/actors/0tVgxI7A6o9jMlxmc) | `0tVgxI7A6o9jMlxmc` |
| [Company Firmographic Enricher](https://console.apify.com/actors/YlUtLWjfPpqykmB8g) | `YlUtLWjfPpqykmB8g` |
| [Company Social Presence Mapper](https://console.apify.com/actors/4k6CCemkgBDz18m2h) | `4k6CCemkgBDz18m2h` |
| [Company Identity Resolver](https://console.apify.com/actors/lr8fTRAmZCBZmuwwh) | `lr8fTRAmZCBZmuwwh` |
| [Company Change-Event Feed](https://console.apify.com/actors/oX44rS0fkEJ3rXLWe) | `oX44rS0fkEJ3rXLWe` |
| [Funding & Press Signal Scanner](https://console.apify.com/actors/FS13X6dhQVgX3XOM6) | `FS13X6dhQVgX3XOM6` |

> Built by [Mamba Labs](https://github.com/mambalabsdev) | [npm](https://www.npmjs.com/org/mambalabsdev) | [Apify Store](https://apify.com/mambalabs)

## License

MIT

Built by Mamba Labs. https://apify.com/mambalabs
