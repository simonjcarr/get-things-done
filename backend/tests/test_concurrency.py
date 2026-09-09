"""Run against a disposable PostgreSQL database via TEST_DATABASE_URL."""

import os, concurrent.futures, pytest
from store import Store, create_project, approvals, jobs
from engine import Engine
from policy import IDENTITY
from cryptography.fernet import Fernet
from sqlalchemy import select


@pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="PostgreSQL integration database not supplied",
)
def test_concurrent_approval_creates_one_outbox_entry(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.invalid")
    monkeypatch.setenv("SMTP_FROM", "bob@example.com")
    monkeypatch.setenv("BOB_ENCRYPTION_KEY", Fernet.generate_key().decode())
    db = Store(os.environ["TEST_DATABASE_URL"])
    e = Engine(db)
    p = create_project(db, "A concurrent approval test objective")
    with db.tx() as c:
        d = e.draft(
            c,
            p["id"],
            {
                "to": "test@example.com",
                "cc": "",
                "subject": "Test",
                "body": IDENTITY,
                "rationale": "Test",
                "outcome": "Test",
            },
        )
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        ids = list(pool.map(lambda _: e.approval(p["id"], d["id"], 1), range(8)))
    assert len(set(ids)) == 1
    with db.tx() as c:
        assert (
            len(c.execute(select(jobs).where(jobs.c.key == "send:" + ids[0])).all())
            == 1
        )
