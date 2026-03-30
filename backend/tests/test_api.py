from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import hash_password
from app.database import Base, get_db
from app.main import app
from app.models import Admin


class BridgeClientStub:
    async def get(self, path: str, query_parameters=None) -> dict:
        if path == "/runtime/status":
            return {
                "xray_running": True,
                "api_port": 10085,
                "binary_path": "/usr/local/bin/xray",
                "config_path": "/etc/xray/config.json",
                "last_error": None,
            }
        return {"clients": []}

    async def post(self, path: str, payload: dict) -> dict:
        return {"status": "ok", "path": path, "payload": payload}


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    test_session_factory = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=test_engine)

    def override_get_db() -> Generator[Session, None, None]:
        database_session = test_session_factory()
        try:
            yield database_session
        finally:
            database_session.close()

    app.dependency_overrides[get_db] = override_get_db

    import app.main as main_module

    original_bridge_client = main_module.bridge_client
    main_module.bridge_client = BridgeClientStub()

    database_session = test_session_factory()
    database_session.add(Admin(username="admin", password_hash=hash_password("admin123")))
    database_session.commit()
    database_session.close()

    with TestClient(app) as test_client:
        yield test_client

    main_module.bridge_client = original_bridge_client
    app.dependency_overrides.clear()


def authenticate(test_client: TestClient) -> dict[str, str]:
    response = test_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert response.status_code == 200
    access_token = response.json()["access_token"]
    return {"Authorization": f"Bearer {access_token}"}


def test_login_returns_access_and_refresh_tokens(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})

    assert response.status_code == 200
    assert "access_token" in response.json()
    assert "refresh_token" in response.json()


def test_create_inbound_rejects_duplicate_port(client: TestClient) -> None:
    authorization_headers = authenticate(client)
    inbound_payload = {
        "name": "primary-vless",
        "protocol": "vless",
        "listen_port": 8443,
        "transport": "tcp",
        "security": "tls",
        "settings_json": "{}",
        "enabled": True,
    }

    first_response = client.post("/api/inbounds", json=inbound_payload, headers=authorization_headers)
    second_response = client.post(
        "/api/inbounds",
        json={**inbound_payload, "name": "secondary-vless"},
        headers=authorization_headers,
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "Inbound port already exists"


def test_create_client_rejects_unknown_inbound(client: TestClient) -> None:
    authorization_headers = authenticate(client)
    client_payload = {
        "inbound_id": 999,
        "email": "alice@example.com",
        "uuid": "11111111-1111-1111-1111-111111111111",
        "traffic_limit_bytes": 1024,
        "expiry_at": None,
        "enabled": True,
    }

    response = client.post("/api/clients", json=client_payload, headers=authorization_headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "Inbound not found"


def test_delete_inbound_rejects_existing_clients(client: TestClient) -> None:
    authorization_headers = authenticate(client)
    inbound_payload = {
        "name": "vless-one",
        "protocol": "vless",
        "listen_port": 9443,
        "transport": "tcp",
        "security": "tls",
        "settings_json": "{}",
        "enabled": True,
    }
    inbound_response = client.post("/api/inbounds", json=inbound_payload, headers=authorization_headers)
    inbound_id = inbound_response.json()["id"]

    client_payload = {
        "inbound_id": inbound_id,
        "email": "bob@example.com",
        "uuid": "22222222-2222-2222-2222-222222222222",
        "traffic_limit_bytes": 2048,
        "expiry_at": None,
        "enabled": True,
    }
    create_client_response = client.post("/api/clients", json=client_payload, headers=authorization_headers)
    delete_inbound_response = client.delete(f"/api/inbounds/{inbound_id}", headers=authorization_headers)

    assert create_client_response.status_code == 200
    assert delete_inbound_response.status_code == 409
    assert delete_inbound_response.json()["detail"] == "Cannot delete inbound with existing clients"


def test_update_client_rejects_duplicate_email(client: TestClient) -> None:
    authorization_headers = authenticate(client)
    inbound_payload = {
        "name": "trojan-one",
        "protocol": "trojan",
        "listen_port": 10443,
        "transport": "tcp",
        "security": "tls",
        "settings_json": "{}",
        "enabled": True,
    }
    inbound_response = client.post("/api/inbounds", json=inbound_payload, headers=authorization_headers)
    inbound_id = inbound_response.json()["id"]

    first_client_response = client.post(
        "/api/clients",
        json={
            "inbound_id": inbound_id,
            "email": "first@example.com",
            "uuid": "33333333-3333-3333-3333-333333333333",
            "traffic_limit_bytes": 100,
            "expiry_at": None,
            "enabled": True,
        },
        headers=authorization_headers,
    )
    second_client_response = client.post(
        "/api/clients",
        json={
            "inbound_id": inbound_id,
            "email": "second@example.com",
            "uuid": "44444444-4444-4444-4444-444444444444",
            "traffic_limit_bytes": 100,
            "expiry_at": None,
            "enabled": True,
        },
        headers=authorization_headers,
    )

    update_response = client.put(
        f"/api/clients/{second_client_response.json()['id']}",
        json={"email": "first@example.com"},
        headers=authorization_headers,
    )

    assert first_client_response.status_code == 200
    assert second_client_response.status_code == 200
    assert update_response.status_code == 409
    assert update_response.json()["detail"] == "Client email already exists"
