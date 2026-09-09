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
