# MVP validation — 9 September 2026

- TypeScript typecheck: passed.
- Vite production build: passed.
- Full multi-stage Docker production build: passed.
- Backend tests: 22 passed, including a disposable PostgreSQL 18 concurrency test (eight approval requests produce one approval/outbox job).
- Fixture vertical slice: objective → public-search fixture → strategy → critic → revised plan → draft → exact approval → SMTP fixture → IMAP ingestion fixture → analysis → revised strategy.
- Security cases: six hostile-email examples remain inert data; unknown tool actions rejected; cross-project draft access rejected; edited versions require fresh review; approved content immutable; duplicate mail deduplicated; ambiguous email requests clarification without revealing other projects; SMTP uncertainty is not automatically retried; authentication and origin checks enforced.
- Node dependency audit: zero known vulnerabilities after removing replaced deployment dependencies and applying compatible patches.
- Python dependency audit: zero known vulnerabilities after upgrading cryptography and pytest.
- Packaged runtime smoke test: runs as UID 10001 with read-only filesystem, serves the UI (HTTP 200) and database health endpoint (HTTP 200), emits restrictive response headers.

Two deprecation warnings originate from the FastAPI/Starlette test-client compatibility layer. No tests failed.

These results do not establish real AI provider, search-provider or SMTP/IMAP connectivity. No real email has been sent. Production credentials and tunnel routing are not configured, and Bob has not been deployed to carrtech.dev. Browser interaction/visual QA has not been performed.
