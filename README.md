# Bob

A persistent project agent for Simon Carr. Bob researches an objective, develops and critiques a strategy, proposes a plan and prepares correspondence. Trusted application code owns persistence, identity, approvals, scheduling and delivery. Models never receive SMTP credentials or executable tools.

## Implemented MVP

- React/TypeScript dashboard, project views, plan, research, stakeholders, timeline, costs and approval review.
- FastAPI authenticated API, PostgreSQL persistence, scoped records and immutable audit/approval tables.
- Durable database-backed worker with leases, retries, seven-day reassessment and visible failure states.
- Pluggable OpenAI-compatible, Anthropic and Google structured model adapters; Brave search adapter.
- One shared SMTP/IMAP mailbox across all projects. Approved messages use immutable canonical snapshots and hashes.
- Incoming mail is encrypted, rendered as text and routed by references. Ambiguous mail creates a sender-clarification draft requiring approval.
- Encrypted credential-bundle abstraction. No credentials in model context or project history.

## Run and test

```sh
npm ci
npm run typecheck
npm run build
docker build -f backend/Dockerfile.test -t bob-tests:local backend
docker run --rm bob-tests:local python -m pytest -q
```

For frontend development use `npm run dev`. The proxy expects the backend at 127.0.0.1:8000; set its BOB_ORIGIN to http://127.0.0.1:5173 when testing authenticated frontend requests. The example workspace runs without a backend and never sends messages.

See [Architecture](docs/ARCHITECTURE.md), [Deployment](deploy/README.md), and [Implementation status](docs/STATUS.md). The initial architecture describes the intended full system; implementation status distinguishes what exists from later phases. Production deployment and real-account integration must be verified separately from fixture-based tests.

## Local development configuration

Use the Git-ignored `.env.development` for local development. The API and worker load it via `compose.dev.yml`; Vite does not expose variables without the `VITE_` prefix. Never prefix server credentials with `VITE_`.

Start backend services with `docker compose --env-file .env.development -f compose.dev.yml up -d`, then `npm run dev -- --host 127.0.0.1`. Open http://127.0.0.1:5173 and select My workspace. `BOB_ORIGIN` must match that exact URL.

AI requires `AI_API_KEY`, `AI_MODEL`, `AI_PROVIDER`, `AI_BASE_URL` for an OpenAI-compatible endpoint, positive `AI_INPUT_PRICE` and `AI_OUTPUT_PRICE` in GBP per million tokens, and `BRAVE_SEARCH_API_KEY` for research. Optional routing overrides are `AI_MODEL_STRATEGY`, `AI_MODEL_CRITIC`, `AI_MODEL_INBOX`, and `AI_MODEL_CORRESPONDENCE`.

The one shared mailbox uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_ENCRYPTION`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, plus `IMAP_HOST`, `IMAP_PORT`, `IMAP_ENCRYPTION`, `IMAP_USER`, `IMAP_PASSWORD` for incoming replies. Encryption is `starttls` or `ssl`.

Also set `POSTGRES_PASSWORD`, `BOB_ENCRYPTION_KEY` (Fernet key), and `BOB_PASSWORD_HASH` (the app's PBKDF2 format). A generated local file can retain `BOB_DEV_LOGIN_PASSWORD` as an operator reference; only the hash is used to authenticate. Production continues to use the encrypted credential bundle described in the deployment guide.

After changing environment values, rerun `docker compose --env-file .env.development -f compose.dev.yml up -d --force-recreate api worker`. Restarting alone does not reload container environment values.
