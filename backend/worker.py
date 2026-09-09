import time, os, logging
from sqlalchemy import select, update, or_, and_
from store import Store, jobs, projects, add_event
from engine import Engine
from providers import NotConfigured
from mailbox import deliver, poll, CLARIFICATION_PROJECT

log = logging.getLogger("bob.worker")


def run_one(db, engine):
    with db.tx() as c:
        q = (
            select(jobs)
            .where(
                or_(
                    and_(jobs.c.state == "ready", jobs.c.due <= time.time()),
                    and_(jobs.c.state == "running", jobs.c.lease < time.time()),
                )
            )
            .order_by(jobs.c.due)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        job = c.execute(q).mappings().first()
        if not job:
            return False
        r = c.execute(
            update(jobs)
            .where(
                jobs.c.id == job["id"],
                jobs.c.state == job["state"],
                jobs.c.lease == job["lease"],
            )
            .values(
                state="running", lease=time.time() + 900, attempts=job["attempts"] + 1
            )
        )
        if r.rowcount != 1:
            return False
    try:
        kind = job["kind"]
        pid = job["project_id"]
        data = job["data"]
        if kind == "REASSESS_PROJECT" and pid != CLARIFICATION_PROJECT:
            engine.reassess(pid)
        elif kind == "ANALYSE_EMAIL":
            engine.analyse(pid, data["message_id"])
        elif kind == "REWRITE_DRAFT":
            engine.rewrite(pid, data["draft_id"])
        elif kind == "SEND_APPROVED_EMAIL":
            deliver(db, data["approval_id"])
        elif kind == "CHECK_MAILBOX":
            poll(db, engine)
        elif kind != "REASSESS_PROJECT":
            raise ValueError("Unknown job type")
        with db.tx() as c:
            c.execute(
                update(jobs)
                .where(jobs.c.id == job["id"])
                .values(state="done", lease=0, error=None)
            )
    except Exception as error:
        safe = (
            "Provider setup required"
            if isinstance(error, NotConfigured)
            else "Operation failed; see diagnostics and configuration"
        )
        retry = job["attempts"] < 4
        with db.tx() as c:
            c.execute(
                update(jobs)
                .where(jobs.c.id == job["id"])
                .values(
                    state="ready" if retry else "failed",
                    lease=0,
                    due=time.time() + min(3600, 60 * 2 ** job["attempts"]),
                    error=safe,
                )
            )
            db.log(
                c,
                job["project_id"],
                "JOB_FAILED",
                {
                    "job_id": job["id"],
                    "kind": job["kind"],
                    "error": safe,
                    "retry": retry,
                },
            )
            if job["project_id"]:
                p, v = db.project(c, job["project_id"], lock=True)
                if p["status"] not in ("Paused", "Closed", "Completed", "Cancelled"):
                    p["status"] = (
                        "Needs setup" if isinstance(error, NotConfigured) else "Blocked"
                    )
                    p["next"] = safe
                add_event(p, "Work paused", safe, "error")
                db.save(c, p, v)
        log.warning(
            "job_failed kind=%s job_id=%s category=%s",
            job["kind"],
            job["id"],
            type(error).__name__,
        )
    return True


def main():
    from secret_config import load_secrets

    load_secrets()
    logging.basicConfig(level=logging.INFO)
    db = Store()
    engine = Engine(db)
    while True:
        with db.tx() as c:
            db.enqueue(
                c, "CHECK_MAILBOX", None, key="mailbox:" + str(int(time.time() // 120))
            )
        if not run_one(db, engine):
            time.sleep(3)


if __name__ == "__main__":
    main()
