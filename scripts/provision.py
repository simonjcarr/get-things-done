"""Run locally in a trusted terminal. Never writes cleartext service credentials."""

import getpass, json, os, secrets, hashlib
from pathlib import Path
from cryptography.fernet import Fernet

path = Path(input("Private secrets directory: ").strip()).expanduser()
path.mkdir(mode=0o700, parents=True, exist_ok=True)
keyfile = path / "master.key"
bundle = path / "credentials.enc"
if keyfile.exists() or bundle.exists():
    raise SystemExit("Existing credentials found; refusing to overwrite.")
key = Fernet.generate_key()
values = {}
for name in [
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
]:
    value = (
        getpass.getpass(name + " (blank to skip): ")
        if any(s in name for s in ["PASSWORD", "API_KEY"])
        else input(name + " (blank to skip): ")
    )
    if value:
        values[name] = value
for target, data in [
    (keyfile, key),
    (bundle, Fernet(key).encrypt(json.dumps(values).encode())),
]:
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
password = getpass.getpass("Bob login password: ")
if len(password) < 14:
    raise SystemExit("Use a password of at least 14 characters.")
salt = secrets.token_hex(16)
hashed = hashlib.pbkdf2_hmac(
    "sha256", password.encode(), bytes.fromhex(salt), 600000
).hex()
print("BOB_PASSWORD_HASH=" + salt + ":" + hashed)
print(
    "Credential bundle saved. Grant the container UID 10001 read access to these two files; keep directory permissions restricted."
)
