"""Application-owned state. Project records are scoped; approvals are immutable snapshots."""

import os, json, uuid, time
from contextlib import contextmanager
from sqlalchemy import (
    create_engine,
    MetaData,
    Table,
    Column,
    String,
    Text,
    Integer,
    Float,
    JSON,
    select,
    update,
    event,
)

meta = MetaData()
projects = Table(
    "projects",
    meta,
    Column("id", String, primary_key=True),
    Column("owner", String, nullable=False),
    Column("version", Integer, nullable=False, default=1),
    Column("data", JSON, nullable=False),
)
audit = Table(
    "audit_events",
    meta,
    Column("id", String, primary_key=True),
    Column("project_id", String, index=True),
    Column("kind", String, nullable=False),
    Column("data", JSON, nullable=False),
    Column("at", Float, nullable=False),
)
drafts = Table(
    "drafts",
    meta,
    Column("id", String, primary_key=True),
    Column("project_id", String, index=True),
    Column("version", Integer, nullable=False),
    Column("state", String, nullable=False),
    Column("data", JSON, nullable=False),
)
approvals = Table(
    "approvals",
    meta,
    Column("id", String, primary_key=True),
    Column("draft_version", String, unique=True, nullable=False),
    Column("project_id", String, index=True),
    Column("draft_id", String, nullable=False),
    Column("canonical", Text, nullable=False),
    Column("hash", String, nullable=False),
    Column("approved_by", String, nullable=False),
    Column("at", Float, nullable=False),
)
jobs = Table(
    "jobs",
    meta,
    Column("id", String, primary_key=True),
    Column("key", String, unique=True, nullable=False),
    Column("project_id", String, index=True),
    Column("kind", String, nullable=False),
    Column("data", JSON, nullable=False),
    Column("state", String, nullable=False),
    Column("due", Float, nullable=False),
    Column("lease", Float, nullable=False, default=0),
    Column("attempts", Integer, nullable=False, default=0),
    Column("error", String),
)
messages = Table(
    "messages",
    meta,
    Column("id", String, primary_key=True),
    Column("message_id", String, unique=True, nullable=False),
    Column("project_id", String, index=True),
    Column("direction", String, nullable=False),
    Column("sender", String, nullable=False),
    Column("subject", Text, nullable=False),
    Column("body", Text, nullable=False),
    Column("raw_encrypted", Text),
    Column("refs", JSON, nullable=False),
    Column("state", String, nullable=False),
    Column("at", Float, nullable=False),
)
settings = Table(
    "settings",
    meta,
    Column("key", String, primary_key=True),
    Column("value", Text, nullable=False),
)
usage = Table(
    "model_calls",
    meta,
    Column("id", String, primary_key=True),
    Column("project_id", String, index=True),
    Column("role", String),
    Column("provider", String),
    Column("model", String),
    Column("input_tokens", Integer),
    Column("output_tokens", Integer),
    Column("cached_tokens", Integer),
    Column("cost", Float),
    Column("pricing", JSON),
    Column("at", Float),
)


class Store:
    def __init__(self, url=None):
        self.engine = create_engine(
            url or os.getenv("DATABASE_URL", "sqlite:////tmp/bob.db"),
            pool_pre_ping=True,
        )
        if self.engine.dialect.name == "sqlite":

            @event.listens_for(self.engine, "connect")
            def pragmas(dbapi, record):
                dbapi.execute("PRAGMA busy_timeout=30000")

        meta.create_all(self.engine)
        # Audit and approval data may never be edited by application mistakes.
        with self.engine.begin() as c:
            if self.engine.dialect.name == "sqlite":
                for name in ("audit_events", "approvals"):
                    for op in ("UPDATE", "DELETE"):
                        c.exec_driver_sql(
                            f"CREATE TRIGGER IF NOT EXISTS immutable_{name}_{op} BEFORE {op} ON {name} BEGIN SELECT RAISE(ABORT,'immutable record'); END"
                        )
            else:
                c.exec_driver_sql(
                    "CREATE OR REPLACE FUNCTION bob_immutable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'immutable record'; END; $$ LANGUAGE plpgsql"
                )
                for name in ("audit_events", "approvals"):
                    c.exec_driver_sql(
                        f"DROP TRIGGER IF EXISTS immutable_{name} ON {name}"
                    )
                    c.exec_driver_sql(
                        f"CREATE TRIGGER immutable_{name} BEFORE UPDATE OR DELETE ON {name} FOR EACH ROW EXECUTE FUNCTION bob_immutable()"
                    )

    @contextmanager
    def tx(self):
        with self.engine.begin() as c:
            yield c

    def project(self, c, pid, owner="simon", lock=False):
        q = select(projects).where(projects.c.id == pid, projects.c.owner == owner)
        row = c.execute(q.with_for_update() if lock else q).mappings().first()
        if not row:
            raise LookupError("Project not found")
        return dict(row["data"]), row["version"]

    def save(self, c, p, version):
        r = c.execute(
            update(projects)
            .where(projects.c.id == p["id"], projects.c.version == version)
            .values(data=p, version=version + 1)
        )
        if r.rowcount != 1:
            raise ValueError("Project changed; retry with fresh state")

    def log(self, c, pid, kind, data):
        c.execute(
            audit.insert().values(
                id=uid(), project_id=pid, kind=kind, data=data, at=time.time()
            )
        )

    def enqueue(self, c, kind, pid, data=None, key=None, due=None):
        key = key or uid()
        if c.execute(select(jobs.c.id).where(jobs.c.key == key)).first():
            return
        c.execute(
            jobs.insert().values(
                id=uid(),
                key=key,
                kind=kind,
                project_id=pid,
                data=data or {},
                state="ready",
                due=due or time.time(),
                lease=0,
                attempts=0,
            )
        )

    def list_projects(self):
        with self.tx() as c:
            result = []
            for row in c.execute(
                select(projects).where(projects.c.owner == "simon")
            ).mappings():
                p = dict(row["data"])
                p["drafts"] = [
                    dict(d["data"], status=d["state"], version=d["version"])
                    for d in c.execute(
                        select(drafts).where(drafts.c.project_id == p["id"])
                    ).mappings()
                ]
                p["modelCalls"] = [
                    dict(r)
                    for r in c.execute(
                        select(usage).where(usage.c.project_id == p["id"])
                    ).mappings()
                ]
                p["emails"] = [
                    dict(r)
                    for r in c.execute(
                        select(
                            messages.c.id,
                            messages.c.sender,
                            messages.c.subject,
                            messages.c.body,
                            messages.c.direction,
                            messages.c.state,
                            messages.c.at,
                        )
                        .where(messages.c.project_id == p["id"])
                        .order_by(messages.c.at.desc())
                    ).mappings()
                ]
                result.append(p)
            return result


def uid():
    return str(uuid.uuid4())


def now():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def add_event(p, title, detail, kind="project"):
    p["events"].insert(
        0, {"id": uid(), "title": title, "detail": detail, "kind": kind, "at": now()}
    )


def create_project(db, objective):
    p = {
        "id": uid(),
        "title": objective[:72],
        "objective": objective,
        "category": "New objective",
        "status": "Researching",
        "strategy": "Investigate context and decision makers, establish the evidence needed, then critic-review a plan.",
        "understanding": "Facts and responsible organisations have not yet been verified.",
        "success": "To be established from the objective and evidence.",
        "next": "Research the objective and identify the highest-value next step.",
        "progress": 0,
        "cost": 0,
        "createdAt": now(),
        "actions": [],
        "events": [],
        "drafts": [],
        "research": [],
        "stakeholders": [],
        "planVersions": [],
    }
    add_event(p, "Project created", "Objective recorded. Investigation queued.")
    with db.tx() as c:
        c.execute(
            projects.insert().values(id=p["id"], owner="simon", version=1, data=p)
        )
        db.log(c, p["id"], "PROJECT_CREATED", {"objective": objective})
        db.enqueue(c, "REASSESS_PROJECT", p["id"], key="initial:" + p["id"])
    return p
