import pytest
from fastapi.testclient import TestClient
from policy import password_hash
from main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + str(tmp_path / "api.db"))
    monkeypatch.setenv("BOB_PASSWORD_HASH", password_hash("test-password"))
    monkeypatch.setenv("BOB_ORIGIN", "http://testserver")
    with TestClient(app) as c:
        yield c


def test_auth_csrf_persistence(client):
    assert client.get("/api/projects").status_code == 401
    assert (
        client.post("/api/login", json={"password": "test-password"}).status_code == 403
    )
    assert (
        client.post(
            "/api/login",
            headers={"Origin": "http://testserver"},
            json={"password": "test-password"},
        ).status_code
        == 200
    )
    result = client.post(
        "/api/projects",
        headers={"Origin": "http://testserver"},
        json={"objective": "Create a safer crossing on Birch Avenue"},
    )
    assert result.status_code == 201
    assert (
        client.get("/api/projects").json()["projects"][0]["objective"]
        == "Create a safer crossing on Birch Avenue"
    )
    assert client.get("/api/projects").headers["X-Content-Type-Options"] == "nosniff"
    assert (
        client.post(
            "/api/projects",
            headers={"Origin": "https://evil.example"},
            json={"objective": "A different goal"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/logout", headers={"Origin": "http://testserver"}, json={}
        ).status_code
        == 200
    )
    assert client.get("/api/projects").status_code == 401


def test_invalid_password_and_payload(client):
    assert (
        client.post(
            "/api/login",
            headers={"Origin": "http://testserver"},
            json={"password": "bad"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/login",
            headers={"Origin": "http://testserver"},
            json={"password": "test-password", "admin": True},
        ).status_code
        == 422
    )


def test_private_errors_do_not_expose_records(client):
    client.post(
        "/api/login",
        headers={"Origin": "http://testserver"},
        json={"password": "test-password"},
    )
    assert (
        client.post(
            "/api/projects/missing/commands",
            headers={"Origin": "http://testserver"},
            json={"action": "pause"},
        ).status_code
        == 404
    )
