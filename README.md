# n8n-nodes-goodfit

[Goodfit](https://www.goodfit.io) is GTM intelligence. It helps revenue leaders define, source and grade every company
in their market, so they know which companies to target and how to allocate resources against them.

This package brings Goodfit into your n8n workflows with two nodes:

- **Goodfit**: enrich companies and contacts, manage segments, and read companies and contacts from your Goodfit dataset.
- **Goodfit Trigger**: start a workflow each time Goodfit syncs companies or contacts to a webhook.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/n8n-community-license) workflow automation
platform.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[Goodfit Trigger](#goodfit-trigger) · [Example workflows](#example-workflows) · [Limits](#limits)

## Installation

To install the package, follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
and use the package name `n8n-nodes-goodfit`.

## Credentials

You need a Goodfit API key. Your Goodfit account manager enables API access, then you create keys in Goodfit under
**Settings → API Keys → Create API Key**, with the scopes the workflow needs. See
[Getting an API key](https://docs.goodfit.io/goodfit-docs/apis/apis-introduction).

1. In n8n, create a **Goodfit API** credential.
2. Paste the key into **API Key**.
3. Leave **Base URL** as `https://api.goodfit.io` unless Goodfit gives you a different host.

When you save the credential, n8n tests the key by reading your credit balances.

Each operation needs your key to have access to the matching Goodfit API:

| Operations                                      | API access needed        |
| ----------------------------------------------- | ------------------------ |
| Company → Enrich, Get Enrichment Status         | Enrichment API           |
| Company → Enrich (with Include Company Data), Get, Get Data Points, Get Many, Search; Contact → Get Data Points, Get Many | Dataset API |
| Contact → Enrich, Get Enrichment Status         | Contact Enrichment API   |
| Segment → all operations                        | Dataset API              |
| Credit → Get Balances                           | Any key                  |

## Operations

### Company

- **Enrich**: adds a company to your Goodfit dataset by domain, or by the domain of a work email, and returns its data.
  - You can link the company to a Salesforce or HubSpot record.
  - With **Wait for Completion** on (the default), the node waits for enrichment to finish and returns the company.
  - Turn it off to get the `requestId` straight away.
  - **Skip Items Without a Domain** (on by default) returns items with an empty domain or email as `status: "Skipped"`
    with `skipReason: "NO_DOMAIN"`, without calling Goodfit.
  - **Include Input Fields** keeps the incoming item's fields in the output, such as a CRM record ID to write results
    back to. Goodfit's fields win when names clash. Contact Enrich has this option too.
- **Get**: gets one company from your dataset by its exact domain.
- **Get Many**: lists companies in your dataset. You can filter by **Added Since** or **Updated Since**, which is useful
  for incremental syncs.
- **Get Data Points**: lists the company data points in your dataset, with each one's type and the filter operators
  it supports. Use it to find the data point names for **Search**.
- **Search**: searches your dataset. Build the filters with **Define Filters → Using Fields Below**:
  - **Match**: all conditions, or any condition.
  - **Conditions**: each picks a **Data Point** from your dataset (listed by its name in the app, with intel marked),
    an **Operator** (only the ones that data point supports), and a **Value**. For "is one of" and "contains", separate
    values with commas. "Between" asks for a second value, and "within the last" asks for a unit.

  Or choose **Using JSON** and paste a Goodfit filter group, for example to nest groups:

  ```json
  {
  	"id": "root",
  	"combinator": "and",
  	"rules": [{ "id": "r1", "field": "country", "operator": "equalTo", "value": "US" }]
  }
  ```

- **Get Enrichment Status**: checks an enrichment request that was submitted earlier.

### Contact

- **Enrich**: finds a contact's work email, and optionally their mobile number. Identify the contact by LinkedIn URL,
  work email, or **First Name** + **Last Name** + **Company Domain** or **Company Name** (in Additional Fields). A
  **Job Title** helps when several people share a name.
  - You can have Goodfit sync the contact to your CRM.
  - The result includes `found`, `workEmail`, `mobilePhone`, `jobTitle`, the contact's personas and their company.
- **Get Data Points**: lists the contact data points in your dataset, with each one's type.
- **Get Many**: lists contacts in your dataset, optionally for one company (`__company_id`).
- **Get Enrichment Status**: checks a contact enrichment request that was submitted earlier.
- **Resolve Match**: picks the person or employment for an enrichment that found several, and enriches that one.

A completed contact enrichment can still have `found: false`. The `reason` field explains why, for example
`PERSON_NOT_FOUND`, `FORMER_EMPLOYEE`, `MULTIPLE_EMPLOYMENTS_FOUND` or `MULTIPLE_PEOPLE_FOUND`. When there's a choice to
make, use **Resolve Match** with the result's `requestId`:

- several people are listed in `candidates`: resolve by **Person** with the chosen one's `candidateId`;
- several employments are listed in `employments`: resolve by **Employment** with the chosen one's `companyId`.

Resolve Match keeps the original identity and options. You can also run **Enrich** again with **Selected Candidate ID** or
**Selected Company ID**.

Contact credits are charged when a contact is granted. Phone number credits are charged only when a number is found.

### Segment

A segment is a subset of the companies in your dataset that match its criteria. A dynamic segment keeps updating as your
dataset changes; a static one doesn't.

- **Create**: saves a segment from a **Name** and **Criteria**, built with the same conditions as Company → Search (or
  as JSON). Optional: **Dynamic**, **Exclude Domains**, and **Max Companies** with **Order By** and **Order Direction**.
- **Get**: gets one segment, with its criteria, status and size.
- **Get Many**: lists your segments, newest first.
- **Preview**: counts the companies some criteria (built the same way) would include, with a **Sample Size** of up to 50 of them, without
  saving anything.
- **Refresh**: recalculates a segment's companies and searches again for contacts for its personas. Each newly granted
  contact uses a contact credit.
- **Update**: changes only the **Update Fields** you choose. New criteria recalculate the segment.
- **Delete**: deletes a segment. Its contacts stay granted to your account.

Create, Refresh and Update calculate the segment in the background. With **Wait for Completion** on (the default), the
node waits until the segment's `status` is `READY` or `FAILED`, the same way enrichment waits. A segment still
calculating at the **Timeout** is returned with `timedOut: true`; check it later with **Segment → Get**.

### Credit

- **Get Balances**: returns your remaining contact and phone number credits, and your dataset usage limits.

### Waiting for enrichment

Enrichment runs in the background on Goodfit's side. When **Wait for Completion** is on, the node:

1. Checks every item's inputs, then submits them all.
2. Checks all pending requests together every **Poll Interval** seconds. A status check that fails briefly is
   retried. An item only fails after 3 failed checks in a row.
3. Stops waiting at **Timeout**. Items still running are returned with `timedOut: true` and their `requestId`, so a
   later **Get Enrichment Status** step can pick them up.
4. With **Include Company Data**, fetches each completed company from your dataset. The Dataset API allows 2
   requests/second, so this adds about half a second per company once polling finishes.

Without **Continue On Fail**, the node stops at the first bad item:

- If an item has invalid inputs, nothing is submitted at all.
- If the API rejects an item, nothing after it is submitted.

With **Continue On Fail**, a failed item (for example a personal email domain, or running out of credits) is
returned with an `error` field and the other items carry on.

Wait for Completion, Timeout and Poll Interval apply to the whole batch, so they can't be set per item with an
expression.

The node can also be used as a tool by n8n's AI Agent.

## Goodfit Trigger

The trigger receives companies and contacts from Goodfit's **Webhook** connector.

1. Add a **Goodfit Trigger** node and copy its **Production URL**.
2. In Goodfit, go to **Settings → Connectors → Webhook**. Paste the URL as the companies URL, the contacts URL, or both.
3. Optional: set a signing secret on the connector. In the trigger, set **Authentication** to **Signing Secret** and
   save the same value in a **Goodfit Webhook API** credential. The trigger then rejects any request without a valid
   `x-goodfit-hmac-sha256` signature. The secret is stored as an n8n credential, not in the workflow.
4. Activate the workflow.

Each company or contact becomes its own item, even when Goodfit batches several into one request. An empty batch doesn't start the workflow. An `event` field is
added to each item: `account` or `contact`.

## Example workflows

Ready-to-import workflows are in [`examples/`](examples). In n8n, open **Workflows → Import from File**, add your
credentials, and adjust the field names to match your CRM.

| File | What it does |
| --- | --- |
| `salesforce-enrich-new-accounts.json` | Every hour, sends new Salesforce accounts' websites to Goodfit with their account ID. Goodfit's Salesforce sync writes the data back. |
| `hubspot-enrich-new-companies.json` | Every hour, sends new HubSpot companies' domains to Goodfit with their company ID, so Goodfit's HubSpot sync updates the right record. |
| `salesforce-enrich-requested-accounts-with-status.json` | Enriches accounts with a "request enrichment" checkbox ticked, waits for Goodfit, and writes the status and skip reason back. Accounts still running at the timeout are picked up by the next run. |

More ideas:

- **Enrich new CRM companies.** Use a HubSpot or Salesforce trigger ("company created", or "Request enrichment" checkbox
  ticked), then **Goodfit → Company → Enrich** with the domain and the CRM record ID, then write the returned fields back
  to the CRM record.
- **Enrich inbound contacts.** Use a form or CRM trigger, then **Goodfit → Contact → Enrich** with the work email, and
  turn on **Enrich Phone Number** if needed. Then route the contact on `found` and `personas`.
- **Enrich companies you've discovered.** Use a Schedule trigger, then RSS or a scraper, then **Goodfit → Company →
  Enrich** with Continue On Fail on. Then use **Filter**, then Slack.
- **Nightly incremental sync.** Use a Schedule trigger, then **Goodfit → Company → Get Many** with **Updated Since** set
  to `{{ $now.minus({ days: 1 }) }}`, then your warehouse or CRM.
- **Push Goodfit syncs anywhere.** Use **Goodfit Trigger**, then any node. This works for CRMs that Goodfit doesn't
  connect to natively.

## Limits

- The Goodfit APIs are rate limited per account: 20 requests/second for enrichment, and 2 requests/second for the
  Dataset API.
- The node waits for as long as the `Retry-After` header says and retries up to 5 times.

## Running it privately

n8n Cloud only loads verified community nodes. Until this one is verified, run it on a self-hosted n8n:

```bash
npm install
npm run local   # builds, then starts n8n on http://localhost:5678 with this node loaded
```

Workflows and credentials persist in `~/.n8n-goodfit`. Re-run `npm run local` after code changes.

The package is installed the same way n8n installs community packages, so its nodes use their published names
(`n8n-nodes-goodfit.goodFit`). To load the example workflows into this instance, run:

```bash
npm run local:examples   # re-running updates the examples in place
```

Goodfit can't reach `localhost`, so to try **Goodfit Trigger** you need to expose the webhook URL, for example with a
tunnel (`cloudflared tunnel --url http://localhost:5678`), and set `WEBHOOK_URL` to the tunnel's address.

## Development

```bash
npm install
npm run dev     # n8n at http://localhost:5678 with this node loaded (needs Docker or Podman)
npm test
npm run lint
npm run build
```

### OpenAPI contract

`openapi/` holds copies of the OpenAPI documents Goodfit publishes at `https://api.goodfit.io/<api>/openapi.json`.

The contract tests in `test/contract/` run the real node through a fake n8n context. Every HTTP call is checked
against those documents: the method and path, each query parameter, and the request body. Each test's canned
response is checked against the documented response schema too. So a request the API wouldn't accept fails the
tests, and so does a fixture that doesn't match what the API returns.

```bash
npm run openapi:sync    # pull the latest published documents into openapi/
npm run openapi:check   # fail if any published document has changed (runs weekly in CI)
```

To release, merge a PR that bumps the version in `package.json` and `CHANGELOG.md`, then push a matching tag
(e.g. `0.1.1`) on `main`. GitHub Actions stages it on npm with provenance, and a maintainer approves it with 2FA
(`npm stage approve`, or on npmjs.com) to publish it.

## Resources

- [Goodfit API documentation](https://docs.goodfit.io/goodfit-docs/apis/apis-introduction):
  [Company Enrichment](https://docs.goodfit.io/goodfit-docs/apis/company-enrichment-api),
  [Contact Enrichment](https://docs.goodfit.io/goodfit-docs/apis/contact-enrichment-api),
  [Dataset](https://docs.goodfit.io/goodfit-docs/apis/dataset-api),
  [Organisation](https://docs.goodfit.io/goodfit-docs/apis/organisation-api)
- [Goodfit webhook connector](https://docs.goodfit.io/goodfit-docs/product/integrations/webhooks), for **Goodfit Trigger**
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Compatibility

Tested with n8n 2.40.6. Requires n8n 1.0 or later.

## Version history

See [CHANGELOG.md](CHANGELOG.md).
