# Changelog

## 0.2.0 (2026-11-09)

Changes from n8n's verification review. Workflows built on 0.1.x need these fields setting again:

- Optional settings moved off the top level of the node form:
  - **Options**: Skip Items Without a Domain, Include Company Data, Include Input Fields, Timeout and Poll Interval.
  - **Additional Fields**: Enrich Phone Number and Sync to CRM on Contact → Enrich, and Sample Size on
    Segment → Preview.
- Contact → Enrich has an **Identify By** picker: LinkedIn URL, Work Email, Name and Company Domain, or Name and Company
  Name. The chosen identifiers are required. First Name and Last Name are no longer in Additional Fields.
- Goodfit Trigger: the setup notice is gone (the steps are in the README), and the signing-secret warning is now the
  Authentication field's description.

## 0.1.2 (2026-10-29)

- Built with `@n8n/node-cli` 0.54.5 and the current Goodfit OpenAPI documents. No changes to the nodes.

## 0.1.1 (2026-10-29)

- Released through npm Trusted Publishing with staged, 2FA-approved publishing. No changes to the nodes.

## 0.1.0 (2026-10-29)

- Goodfit node: company and contact enrichment, resolving a contact match, dataset reads, segments, credit balances.
- Goodfit Trigger: receives companies and contacts from the Goodfit webhook connector.
