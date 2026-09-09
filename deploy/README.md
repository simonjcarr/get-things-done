# Deployment on the carrtech.dev production box

Target: `ctlnxdbn001`, beside the existing CarrTech stack. Bob is a separate Compose project (`bob`), database, volume, network and loopback port (3080). Do not alter CarrTech's database, runner, network or production configuration to deploy Bob.

Proposed hostname: `bob.carrtech.dev` (must be confirmed and added to the existing tunnel routing). Do not publish the app port directly to the internet. The production origin must match `BOB_ORIGIN` exactly for authenticated writes.

## Prepare

1. Clone the Bob repository to `/opt/bob` after the repository is created and pushed.
2. Copy `.env.production.example` to `.env.production`, mode 0600. Set a dedicated URL-safe PostgreSQL password, origin, provider/model routing and GBP pricing. Zero pricing is an unknown-cost placeholder, not free usage; configure prices before AI work.
3. Run `scripts/provision.py` in a trusted Python environment with `cryptography` installed. It interactively encrypts the one shared SMTP/IMAP account and provider keys. Keep `master.key` separate from `credentials.enc`, outside Git, and restricted to the deployment operator/container UID 10001. A host secret manager can supply the key instead. Back up the key separately; losing it makes stored raw messages unreadable.
4. Set `BOB_PASSWORD_HASH`, `BOB_KEY_FILE`, and `BOB_CREDENTIALS_FILE`. Use SMTP `starttls` or `ssl`, and IMAP `ssl` or `starttls`. Bob intentionally does not support cleartext mail transport.
5. Run `docker compose --env-file .env.production config --quiet`, then `docker compose --env-file .env.production build`.
6. Run `docker compose --env-file .env.production up -d` and check `http://127.0.0.1:3080/api/health`.
7. Connect the existing Cloudflare Tunnel to Bob through an explicitly configured shared Docker network or host loopback route. The existing CarrTech tunnel currently reaches a different app on its private Compose network; `localhost` inside that container is not the host. Confirm the actual tunnel setup before editing it.
8. Verify login, a saved project, worker heartbeat/diagnostics, a sandbox SMTP send and IMAP reply using a dedicated test account before enabling real correspondence.

## Behaviour

A separate worker handles durable jobs and IMAP polling while the browser is closed. PostgreSQL rows hold queue state, leases, retry dates and unique idempotency keys; no Redis dependency is needed in this MVP. Polling uses UIDVALIDITY/UID cursors and message deduplication. Large mail remains in the original mailbox and is logged as quarantined. The app never opens attachments or follows incoming links.

Ambiguous email creates a clarification draft in the shared inbox project, without disclosing other projects. Simon approves it before SMTP delivery. An authenticated association endpoint lets Simon resolve the project once the sender clarifies. Automatic semantic reassociation is not enabled yet.

Outgoing SMTP attempts are recorded before sending. A timeout, partial refusal or worker crash may mean delivery happened; the message stays `delivery_uncertain` and is not automatically resent. Reconcile the stable Message-ID with the mail provider before taking another action.

## Backups and recovery

Back up the dedicated PostgreSQL database with `pg_dump`, the encrypted credential bundle and separately protected encryption key. Restore into a fresh Bob database and verify decryption and audit records. Pause the worker during restore to avoid accidental retries. Never restore Bob into CarrTech's database.

## Release gates and current limitations

Automated tests cover the local vertical slice with fake provider/SMTP adapters. They do not prove real provider or mailbox connectivity. Before production use, validate the actual SMTP/IMAP service and AI model, configure nonzero pricing, exercise backups and enforce outbound egress restrictions at the host/network layer. New schema changes need versioned migration scripts; the initial release uses SQLAlchemy `create_all` and immutable audit triggers only.

Research currently uses public search excerpts with explicit unverified labels. Full webpage retrieval, maps/public data adapters, document generation, OAuth, attachment scanning, fine-grained disclosed-data authorizations and automatic semantic inbox association remain later phases. Attachments remain unopened, which is safe but not a scanning implementation. The provider boundary exposes no executable tools.

The UI's example workspace is labelled and browser-local. Personal workspace records are server-persisted. Do not confuse example activity with actual agent work.
