"""One mailbox, many project threads. External content is inert and encrypted at rest."""

import os, time, json, re, ssl, smtplib, imaplib, hashlib
from email import policy
from email.parser import BytesParser
from email.message import EmailMessage
from email.utils import parseaddr, make_msgid
from sqlalchemy import select, update
from store import (
    messages,
    projects,
    drafts,
    approvals,
    jobs,
    settings,
    uid,
    now,
    add_event,
)
from policy import IDENTITY, seal, digest, addresses

MAX_EMAIL = 2 * 1024 * 1024
CLARIFICATION_PROJECT = "inbox-clarifications"


def clarification_project(db, c):
    row = c.execute(
        select(projects).where(projects.c.id == CLARIFICATION_PROJECT)
    ).first()
    if row:
        return CLARIFICATION_PROJECT
    p = {
        "id": CLARIFICATION_PROJECT,
        "title": "Inbox — clarification needed",
        "objective": "Clarify which matter unassigned correspondence concerns.",
        "category": "Shared inbox",
        "status": "Needs approval",
        "strategy": "Ask the sender to identify the matter without disclosing any project information.",
        "understanding": "Some messages cannot be associated confidently using thread references.",
        "success": "Correspondence is associated with the correct project.",
        "next": "Review a clarification email.",
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
    c.execute(
        projects.insert().values(
            id=CLARIFICATION_PROJECT, owner="simon", version=1, data=p
        )
    )
    return CLARIFICATION_PROJECT


def ingest(db, engine, raw):
    if len(raw) > MAX_EMAIL:
        raise ValueError("Email exceeds quarantine size limit")
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    mid = str(
        msg.get("Message-ID")
        or "<sha256." + hashlib.sha256(raw).hexdigest() + "@unidentified>"
    )[:500]
    sender = parseaddr(str(msg.get("From", "")))[1]
    refs = re.findall(
        r"<[^<>\s]{1,480}>",
        str(msg.get("References", "")) + " " + str(msg.get("In-Reply-To", "")),
    )[-50:]
    body = msg.get_body(preferencelist=("plain",))
    text = (
        body.get_content()
        if body
        else "[No plain-text body. HTML and attachments are quarantined.]"
    )
    if not isinstance(text, str):
        text = "[Binary content quarantined]"
    text = text[:50000]
    subject = str(msg.get("Subject", ""))[:500]
    encrypted = seal(raw)
    with db.tx() as c:
        if c.execute(select(messages.c.id).where(messages.c.message_id == mid)).first():
            return "duplicate"
        candidates = (
            set(
                c.execute(
                    select(messages.c.project_id).where(
                        messages.c.message_id.in_(refs),
                        messages.c.project_id.is_not(None),
                    )
                ).scalars()
            )
            if refs
            else set()
        )
        candidates.discard(CLARIFICATION_PROJECT)
        # References must resolve to exactly one project. Never use subject alone.
        pid = next(iter(candidates)) if len(candidates) == 1 else None
        rid = uid()
        c.execute(
            messages.insert().values(
                id=rid,
                message_id=mid,
                project_id=pid,
                direction="incoming",
                sender=sender,
                subject=subject,
                body=text,
                raw_encrypted=encrypted,
                refs=refs,
                state="associated" if pid else "unassigned",
                at=time.time(),
            )
        )
        if pid:
            p, v = db.project(c, pid, lock=True)
            add_event(
                p,
                "Reply received",
                subject + " — stored as untrusted correspondence.",
                "email",
            )
            db.save(c, p, v)
            db.enqueue(
                c, "ANALYSE_EMAIL", pid, {"message_id": rid}, key="analyse:" + rid
            )
        else:
            cp = clarification_project(db, c)
            p, v = db.project(c, cp, lock=True)
            add_event(
                p,
                "Unassigned email received",
                subject + " — clarification required.",
                "email",
            )
            db.save(c, p, v)
            # Automated mail and invalid senders cannot create reply loops. Every valid clarification is still approval-gated.
            auto = (
                str(msg.get("Auto-Submitted", "no")).lower() != "no"
                or bool(msg.get("List-Id"))
                or sender.lower() == os.getenv("SMTP_FROM", "").lower()
            )
            try:
                valid = bool(addresses(sender))
            except ValueError:
                valid = False
            prior = any(
                d["to"] == sender
                for d in c.execute(
                    select(drafts.c.data).where(
                        drafts.c.project_id == cp,
                        drafts.c.state.in_(["Pending", "Approved"]),
                    )
                ).scalars()
            )
            if valid and not auto and not prior:
                engine.draft(
                    c,
                    cp,
                    {
                        "to": sender,
                        "cc": "",
                        "subject": "Clarification of your message",
                        "body": "Hello,\n\nI am Bob, the AI-powered assistant of Simon Carr. Thank you for your message. Could you clarify which matter or request you are referring to, and any reference number you have? This will help me associate your reply correctly.\n\nKind regards,\n"
                        + IDENTITY,
                        "rationale": "This message cannot be confidently associated with a project. Ask the sender to clarify without revealing other projects.",
                        "outcome": "Identify the matter the sender is replying about.",
                    },
                    reply_to=mid,
                )
            db.log(
                c,
                None,
                "UNASSIGNED_EMAIL",
                {"message_id": rid, "clarification_required": True},
            )
    return "associated" if pid else "unassigned"


def deliver(db, approval_id, transport=None):
    # Record delivery attempt before SMTP. A crash/timeout after this point is never blindly retried.
    with db.tx() as c:
        a = (
            c.execute(select(approvals).where(approvals.c.id == approval_id))
            .mappings()
            .first()
        )
        if not a:
            raise ValueError("Approval not found")
        if digest(a["canonical"]) != a["hash"]:
            raise ValueError("Approval integrity check failed")
        data = json.loads(a["canonical"])
        prior = (
            c.execute(
                select(messages).where(messages.c.message_id == data["message_id"])
            )
            .mappings()
            .first()
        )
        if prior:
            return prior["state"]
        p, _ = db.project(c, a["project_id"])
        if p["status"] in ("Paused", "Closed", "Cancelled"):
            raise ValueError("Project is not active")
        msg = EmailMessage()
        msg["From"] = data["from"]
        msg["To"] = data["to"]
        msg["Subject"] = data["subject"]
        msg["Message-ID"] = data["message_id"]
        if data.get("cc"):
            msg["Cc"] = data["cc"]
        if data.get("reply_to"):
            msg["In-Reply-To"] = data["reply_to"]
            msg["References"] = data["reply_to"]
        msg.set_content(data["body"])
        raw = msg.as_bytes()
        c.execute(
            messages.insert().values(
                id=uid(),
                message_id=data["message_id"],
                project_id=a["project_id"],
                direction="outgoing",
                sender=data["from"],
                subject=data["subject"],
                body=data["body"],
                raw_encrypted=seal(raw),
                refs=[data["reply_to"]] if data.get("reply_to") else [],
                state="delivery_uncertain",
                at=time.time(),
            )
        )
        db.log(
            c,
            a["project_id"],
            "SMTP_ATTEMPT",
            {"approval_id": approval_id, "message_id": data["message_id"]},
        )
    try:
        if transport:
            transport(msg)
        else:
            mode = os.getenv("SMTP_ENCRYPTION", "starttls")
            port = int(os.getenv("SMTP_PORT", "587"))
            ctx = ssl.create_default_context()
            if mode not in ("ssl", "starttls"):
                raise ValueError("SMTP must use TLS")
            smtp = (
                smtplib.SMTP_SSL(os.environ["SMTP_HOST"], port, timeout=30, context=ctx)
                if mode == "ssl"
                else smtplib.SMTP(os.environ["SMTP_HOST"], port, timeout=30)
            )
            with smtp:
                if mode == "starttls":
                    smtp.ehlo()
                    smtp.starttls(context=ctx)
                    smtp.ehlo()
                if os.getenv("SMTP_USER"):
                    smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
                refused = smtp.send_message(
                    msg,
                    from_addr=data["from"],
                    to_addrs=addresses(data["to"]) + addresses(data.get("cc", "")),
                )
                if refused:
                    raise ValueError(
                        "One or more recipients refused; delivery needs reconciliation"
                    )
    except Exception:
        with db.tx() as c:
            p, v = db.project(c, a["project_id"], lock=True)
            add_event(
                p,
                "Email delivery needs review",
                "SMTP did not confirm complete delivery. Automatic retry is disabled.",
                "email",
            )
            db.save(c, p, v)
            db.log(
                c, a["project_id"], "DELIVERY_UNCERTAIN", {"approval_id": approval_id}
            )
        return "delivery_uncertain"
    with db.tx() as c:
        c.execute(
            update(messages)
            .where(messages.c.message_id == data["message_id"])
            .values(state="sent")
        )
        c.execute(
            update(drafts).where(drafts.c.id == a["draft_id"]).values(state="Sent")
        )
        p, v = db.project(c, a["project_id"], lock=True)
        p["status"] = "Waiting for response"
        p["next"] = "Wait seven days for a reply before reassessing."
        add_event(p, "Email sent", data["subject"], "email")
        db.save(c, p, v)
        db.log(c, a["project_id"], "EMAIL_SENT", {"approval_id": approval_id})
        db.enqueue(
            c,
            "REASSESS_PROJECT",
            a["project_id"],
            key="followup:" + approval_id,
            due=time.time() + 7 * 86400,
        )
    return "sent"


def poll(db, engine):
    if not os.getenv("IMAP_HOST"):
        return
    mode = os.getenv("IMAP_ENCRYPTION", "ssl")
    ctx = ssl.create_default_context()
    if mode not in ("ssl", "starttls"):
        raise ValueError("IMAP must use TLS")
    client = (
        imaplib.IMAP4_SSL(
            os.environ["IMAP_HOST"], int(os.getenv("IMAP_PORT", "993")), ssl_context=ctx
        )
        if mode == "ssl"
        else imaplib.IMAP4(os.environ["IMAP_HOST"], int(os.getenv("IMAP_PORT", "143")))
    )
    try:
        if mode == "starttls":
            client.starttls(ssl_context=ctx)
        client.login(os.environ["IMAP_USER"], os.environ["IMAP_PASSWORD"])
        client.select("INBOX", readonly=True)
        validity = (client.response("UIDVALIDITY")[1] or [b"unknown"])[0].decode()
        cursor_key = (
            "imap_cursor:"
            + hashlib.sha256(
                (os.environ["IMAP_HOST"] + os.environ["IMAP_USER"] + validity).encode()
            ).hexdigest()
        )
        with db.tx() as c:
            saved = c.execute(
                select(settings.c.value).where(settings.c.key == cursor_key)
            ).scalar()
            last = int(saved or "0")
        typ, data = client.uid("search", None, "UID", str(last + 1) + ":*")
        if typ != "OK":
            raise ValueError("Mailbox search failed")
        for mail_uid in [u for u in data[0].split() if int(u) > last][:100]:
            typ, info = client.uid("fetch", mail_uid, "(RFC822.SIZE)")
            size = re.search(
                rb"RFC822.SIZE (\d+)",
                b" ".join(x for x in info if isinstance(x, bytes)),
            )
            if not size:
                raise ValueError("Mailbox size check failed")
            if int(size.group(1)) > MAX_EMAIL:
                with db.tx() as c:
                    db.log(
                        c,
                        None,
                        "OVERSIZE_EMAIL_QUARANTINED",
                        {"uid": mail_uid.decode(), "bytes": int(size.group(1))},
                    )
            else:
                typ, parts = client.uid("fetch", mail_uid, "(BODY.PEEK[])")
                if typ != "OK":
                    raise ValueError("Mailbox fetch failed")
                payload = next(
                    (part[1] for part in parts if isinstance(part, tuple)), None
                )
                if payload is None:
                    raise ValueError("Mailbox payload unavailable")
                ingest(db, engine, payload)
            with db.tx() as c:
                if c.execute(
                    select(settings.c.key).where(settings.c.key == cursor_key)
                ).first():
                    c.execute(
                        update(settings)
                        .where(settings.c.key == cursor_key)
                        .values(value=mail_uid.decode())
                    )
                else:
                    c.execute(
                        settings.insert().values(
                            key=cursor_key, value=mail_uid.decode()
                        )
                    )

    finally:
        try:
            client.logout()
        except Exception:
            pass
