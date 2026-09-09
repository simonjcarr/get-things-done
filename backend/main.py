import os, time, secrets, hashlib, json
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response, HTTPException, Depends
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import Field
from sqlalchemy import select, update, delete
from store import (
    Store,
    projects,
    drafts,
    messages,
    settings,
    jobs,
    create_project,
    add_event,
)
from engine import Engine
from policy import Strict, check_password


@asynccontextmanager
async def lifespan(app):
    from secret_config import load_secrets

    load_secrets()
    app.state.db = Store()
    app.state.engine = Engine(app.state.db)
    yield


app = FastAPI(
    title="Bob", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
)


class Objective(Strict):
    objective: str = Field(min_length=10, max_length=4000)


class Login(Strict):
    password: str = Field(min_length=1, max_length=1000)


class Command(Strict):
    action: str


class DraftDecision(Strict):
    version: int = Field(ge=1)
    to: str | None = None
    cc: str | None = None
    subject: str | None = None
    body: str | None = None


class Assignment(Strict):
    project_id: str


def origin():
    return os.getenv("BOB_ORIGIN", "http://127.0.0.1:8000").rstrip("/")


@app.middleware("http")
async def boundary(req, call_next):
    if req.method not in ("GET", "HEAD", "OPTIONS"):
        if req.headers.get("origin") != origin():
            return JSONResponse(
                {"detail": "Request origin not permitted"}, status_code=403
            )
        length = req.headers.get("content-length", "0")
        if not length.isdigit() or int(length) > 65536:
            return JSONResponse({"detail": "Request too large"}, status_code=413)
        # Check actual bytes as well as Content-Length, including chunked requests.
        if len(await req.body()) > 65536:
            return JSONResponse({"detail": "Request too large"}, status_code=413)
    response = await call_next(req)
    response.headers.update(
        {
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Cache-Control": "no-store",
        }
    )
    return response


def auth(req: Request):
    token = req.cookies.get("bob_session", "")
    if not token:
        raise HTTPException(401, "Sign in to access your private workspace")
    with req.app.state.db.tx() as c:
        row = (
            c.execute(
                select(settings).where(
                    settings.c.key
                    == "session:" + hashlib.sha256(token.encode()).hexdigest()
                )
            )
            .mappings()
            .first()
        )
    if not row or float(row["value"]) < time.time():
        raise HTTPException(401, "Session expired; sign in again")
    return "simon"


@app.exception_handler(ValueError)
async def value_error(req, exc):
    return JSONResponse({"detail": str(exc)}, status_code=409)


@app.exception_handler(LookupError)
async def missing(req, exc):
    return JSONResponse({"detail": "Record not found"}, status_code=404)


@app.get("/api/health")
def health(req: Request):
    with req.app.state.db.tx() as c:
        c.execute(select(1))
    return {"status": "ok"}


@app.post("/api/login")
def login(data: Login, req: Request, response: Response):
    db = req.app.state.db
    ip = req.client.host if req.client else "unknown"
    key = "login:" + hashlib.sha256(ip.encode()).hexdigest()
    with db.tx() as c:
        row = (
            c.execute(select(settings).where(settings.c.key == key).with_for_update())
            .mappings()
            .first()
        )
        attempt = (
            json.loads(row["value"])
            if row
            else {"count": 0, "until": time.time() + 900}
        )
        if attempt["until"] < time.time():
            attempt = {"count": 0, "until": time.time() + 900}
        if attempt["count"] >= 10:
            raise HTTPException(429, "Too many attempts; try again in 15 minutes")
        attempt["count"] += 1
        if row:
            c.execute(
                update(settings)
                .where(settings.c.key == key)
                .values(value=json.dumps(attempt))
            )
        else:
            c.execute(settings.insert().values(key=key, value=json.dumps(attempt)))
    configured = os.getenv("BOB_PASSWORD_HASH", "")
    if not configured:
        raise HTTPException(503, "Workspace password is not configured on the server")
    if not check_password(data.password, configured):
        raise HTTPException(401, "Invalid password")
    token = secrets.token_urlsafe(48)
    with db.tx() as c:
        c.execute(
            settings.insert().values(
                key="session:" + hashlib.sha256(token.encode()).hexdigest(),
                value=str(time.time() + 12 * 3600),
            )
        )
        db.log(c, None, "SIGN_IN", {"actor": "simon"})
    response.set_cookie(
        "bob_session",
        token,
        httponly=True,
        secure=origin().startswith("https://"),
        samesite="strict",
        max_age=12 * 3600,
        path="/",
    )
    return {"ok": True}


@app.post("/api/logout")
def logout(req: Request, response: Response, owner=Depends(auth)):
    key = "session:" + hashlib.sha256(req.cookies["bob_session"].encode()).hexdigest()
    with req.app.state.db.tx() as c:
        c.execute(delete(settings).where(settings.c.key == key))
    response.delete_cookie("bob_session", path="/")
    return {"ok": True}


@app.get("/api/status")
def status(req: Request, owner=Depends(auth)):
    return {
        "ai": bool(os.getenv("AI_API_KEY") and os.getenv("AI_MODEL")),
        "search": bool(os.getenv("BRAVE_SEARCH_API_KEY")),
        "smtp": bool(
            os.getenv("SMTP_HOST")
            and os.getenv("SMTP_FROM")
            and os.getenv("BOB_ENCRYPTION_KEY")
        ),
        "imap": bool(
            os.getenv("IMAP_HOST")
            and os.getenv("IMAP_USER")
            and os.getenv("BOB_ENCRYPTION_KEY")
        ),
    }


@app.get("/api/projects")
def listing(req: Request, owner=Depends(auth)):
    return {"projects": req.app.state.db.list_projects()}


@app.post("/api/projects", status_code=201)
def create(data: Objective, req: Request, owner=Depends(auth)):
    return {"project": create_project(req.app.state.db, data.objective)}


@app.post("/api/projects/{pid}/commands")
def command(pid: str, data: Command, req: Request, owner=Depends(auth)):
    req.app.state.engine.command(pid, data.action)
    return {"ok": True}


@app.post("/api/projects/{pid}/drafts/{did}/{action}")
def decision(
    pid: str,
    did: str,
    action: str,
    data: DraftDecision,
    req: Request,
    owner=Depends(auth),
):
    if action == "approve":
        return {"approval_id": req.app.state.engine.approval(pid, did, data.version)}
    if action not in ("edit", "reject", "rewrite"):
        raise HTTPException(400, "Unsupported draft action")
    changes = {
        k: v for k, v in data.model_dump().items() if k != "version" and v is not None
    }
    req.app.state.engine.edit_draft(pid, did, data.version, action, changes)
    return {"ok": True}


@app.get("/api/inbox")
def inbox(req: Request, owner=Depends(auth)):
    with req.app.state.db.tx() as c:
        rows = c.execute(
            select(
                messages.c.id,
                messages.c.sender,
                messages.c.subject,
                messages.c.body,
                messages.c.state,
                messages.c.at,
            )
            .where(messages.c.direction == "incoming", messages.c.project_id.is_(None))
            .limit(100)
        ).mappings()
        return {"messages": [dict(r) for r in rows]}


@app.post("/api/inbox/{mid}/assign")
def assign(mid: str, data: Assignment, req: Request, owner=Depends(auth)):
    db = req.app.state.db
    with db.tx() as c:
        p, v = db.project(c, data.project_id, lock=True)
        m = (
            c.execute(
                select(messages).where(
                    messages.c.id == mid,
                    messages.c.direction == "incoming",
                    messages.c.project_id.is_(None),
                )
            )
            .mappings()
            .first()
        )
        if not m:
            raise LookupError("Unassigned message not found")
        c.execute(
            update(messages)
            .where(messages.c.id == mid)
            .values(project_id=data.project_id, state="associated")
        )
        add_event(
            p,
            "Correspondence associated",
            "Simon confirmed the project association.",
            "email",
        )
        db.save(c, p, v)
        db.log(
            c, data.project_id, "MESSAGE_ASSIGNED", {"message_id": mid, "actor": owner}
        )
        db.enqueue(
            c,
            "ANALYSE_EMAIL",
            data.project_id,
            {"message_id": mid},
            key="analyse:" + mid,
        )
    return {"ok": True}


@app.get("/api/diagnostics")
def diagnostics(req: Request, owner=Depends(auth)):
    with req.app.state.db.tx() as c:
        return {
            "jobs": [
                dict(r)
                for r in c.execute(
                    select(
                        jobs.c.id,
                        jobs.c.kind,
                        jobs.c.state,
                        jobs.c.attempts,
                        jobs.c.error,
                        jobs.c.due,
                    )
                    .order_by(jobs.c.due.desc())
                    .limit(100)
                ).mappings()
            ]
        }


static = Path(os.getenv("BOB_STATIC_DIR", "/app/static"))
if static.exists():
    app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")

    @app.get("/")
    def ui():
        return FileResponse(static / "index.html")
