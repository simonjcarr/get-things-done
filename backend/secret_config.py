"""Read an encrypted credential bundle; encryption key is separately mounted by the host."""

import os, json
from pathlib import Path
from cryptography.fernet import Fernet

ALLOWED = {
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_ENCRYPTION",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
    "IMAP_HOST",
    "IMAP_PORT",
    "IMAP_ENCRYPTION",
    "IMAP_USER",
    "IMAP_PASSWORD",
    "AI_API_KEY",
    "BRAVE_SEARCH_API_KEY",
}


def load_secrets():
    if os.getenv("BOB_ENCRYPTION_KEY_FILE"):
        os.environ["BOB_ENCRYPTION_KEY"] = (
            Path(os.environ["BOB_ENCRYPTION_KEY_FILE"]).read_text().strip()
        )
    if os.getenv("BOB_SECRETS_FILE"):
        raw = Fernet(os.environ["BOB_ENCRYPTION_KEY"].encode()).decrypt(
            Path(os.environ["BOB_SECRETS_FILE"]).read_bytes()
        )
        values = json.loads(raw)
        if not isinstance(values, dict) or any(
            k not in ALLOWED or not isinstance(v, str) for k, v in values.items()
        ):
            raise ValueError("Invalid credential bundle")
        os.environ.update(values)
