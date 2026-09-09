# Implementation status

This is the initial MVP, not the complete 36-section specification.

## Working and tested locally

Project creation/persistence; explicit research failures; source excerpt storage; specialist strategy and critic passes; versioned internal plans; draft review/edit/reject/rewrite; authenticated exact-content approvals; single shared SMTP outbox; retry-safe/uncertain delivery handling; IMAP reference routing/deduplication; approval-gated sender clarification; untrusted mail analysis; reassessment jobs; per-call costs; private login, origin checks, immutable audit records; encrypted raw mail and service credential bundles.

Source is published at https://github.com/simonjcarr/get-things-done. The vertical slice has automated fake-provider tests. Real credentials have not been provisioned and real emails have not been sent.

## Remaining

Production host deployment and tunnel route; real provider/mailbox smoke tests; versioned DB migrations beyond initial schema; webpage/map/public-data tools; document generation and scanner-backed attachment release; OAuth; detailed stakeholder relationships; per-action additional disclosure authorizations; automatic semantic association after a sender clarifies; more detailed cost and relationship visualisations; budget reservation before each external model call; post-crash reconciliation of uncertain SMTP delivery.

Examples remain clearly labelled, separate from personal persistent data. Model-produced plans are proposals. No model can execute arbitrary shell, SQL, filesystem or network operations.
