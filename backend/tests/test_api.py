import asyncio
from collections.abc import Generator

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import hash_password
from app.database import Base
from app.main import (
    create_client,
    create_inbound,
    delete_inbound,
    get_system_health,
    login,
    sync_all_inbounds_to_bridge,
    update_client,
)
from app.models import Admin
from app.schemas import ClientCreate, ClientUpdate, InboundCreate, LoginRequest


class BridgeClientStub:
    def __init__(self) -> None:
        self.apply_inbound_calls: list[dict] = []
        self.remove_inbound_calls: list[int] = []
        self.remove_client_calls: list[str] = []

    async def get_runtime_status(self) -> dict:
        return {
            "xray_running": True,
            "api_port": 10085,
            "binary_path": "/usr/local/bin/xray",
            "xray_version": "Xray 26.1.13 (Xray, Penetrates Everything.) Custom",
            "binary_detected": True,
            "xray_api_reachable": True,
            "last_health_check_at": "2026-03-31T00:00:00Z",
            "runtime_mode": "managed",
            "config_path": "/etc/xray/config.json",
            "last_error": None,
            "stats_source": "xray_api",
            "last_stats_error": None,
            "last_stats_sync_at": "2026-03-31T00:00:00Z",
            "inbound_count": 2,
            "active_client_count": 3,
            "cpu_core_count": 8,
            "cpu_usage_percent": 21.5,
            "cpu_core_usage_percent": [17.2, 24.8, 12.5, 31.1, 8.4, 19.6, 26.7, 14.3],
            "load_average_1m": 0.35,
            "load_average_5m": 0.41,
            "load_average_15m": 0.52,
            "memory_total_bytes": 17179869184,
            "memory_available_bytes": 8589934592,
            "memory_used_bytes": 8589934592,
            "memory_used_percent": 50.0,
            "disk_total_bytes": 536870912000,
            "disk_free_bytes": 268435456000,
            "disk_used_bytes": 268435456000,
            "disk_used_percent": 50.0,
            "system_uptime_seconds": 86400.0,
            "zram_enabled": True,
            "zram_device_count": 1,
            "zram_total_bytes": 4294967296,
            "zram_used_bytes": 1073741824,
        }

    async def get_runtime_config(self) -> dict:
        return {"config": {"log": {"loglevel": "warning"}}}

    async def list_client_stats(self, client_uuids: list[str]) -> dict:
        return {"clients": [{"uuid": client_uuid, "uplink_bytes": 0, "downlink_bytes": 0} for client_uuid in client_uuids]}

    async def apply_inbound(self, inbound: dict) -> dict:
        self.apply_inbound_calls.append(inbound)
        return {"status": "applied", "inbound_id": inbound["id"]}

    async def remove_inbound(self, inbound_id: int) -> dict:
        self.remove_inbound_calls.append(inbound_id)
        return {"status": "removed", "inbound_id": inbound_id}

    async def remove_client(self, client_uuid: str) -> dict:
        self.remove_client_calls.append(client_uuid)
        return {"status": "removed", "uuid": client_uuid}


@pytest.fixture()
def database_session() -> Generator[Session, None, None]:
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    test_session_factory = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=test_engine)

    session = test_session_factory()
    admin = Admin(username="admin", password_hash=hash_password("admin123"))
    session.add(admin)
    session.commit()
    yield session
    session.close()


@pytest.fixture()
def admin_user(database_session: Session) -> Admin:
    return database_session.query(Admin).filter(Admin.username == "admin").first()


@pytest.fixture(autouse=True)
def override_bridge_client() -> Generator[None, None, None]:
    import app.main as main_module

    original_bridge_client = main_module.bridge_client
    main_module.bridge_client = BridgeClientStub()
    yield
    main_module.bridge_client = original_bridge_client


@pytest.fixture()
def bridge_client_stub() -> BridgeClientStub:
    import app.main as main_module

    return main_module.bridge_client


def run_async(coroutine):
    return asyncio.run(coroutine)


def test_login_returns_access_and_refresh_tokens(database_session: Session) -> None:
    response = run_async(login(LoginRequest(username="admin", password="admin123"), database_session))

    assert response.access_token
    assert response.refresh_token


def test_create_inbound_rejects_duplicate_port(database_session: Session, admin_user: Admin) -> None:
    inbound_payload = InboundCreate(
        name="primary-vless",
        protocol="vless",
        listen_port=8443,
        transport="tcp",
        security="tls",
        settings_json="{}",
        enabled=True,
    )

    first_inbound = run_async(create_inbound(inbound_payload, admin_user, database_session))

    with pytest.raises(HTTPException) as exception_info:
        run_async(
            create_inbound(
                InboundCreate(
                    name="secondary-vless",
                    protocol="vless",
                    listen_port=8443,
                    transport="tcp",
                    security="tls",
                    settings_json="{}",
                    enabled=True,
                ),
                admin_user,
                database_session,
            )
        )

    assert first_inbound.id is not None
    assert exception_info.value.status_code == 409
    assert exception_info.value.detail == "Inbound port already exists"


def test_create_client_rejects_unknown_inbound(database_session: Session, admin_user: Admin) -> None:
    with pytest.raises(HTTPException) as exception_info:
        run_async(
            create_client(
                ClientCreate(
                    inbound_id=999,
                    email="alice@example.com",
                    uuid="11111111-1111-1111-1111-111111111111",
                    traffic_limit_bytes=1024,
                    expiry_at=None,
                    enabled=True,
                ),
                admin_user,
                database_session,
            )
        )

    assert exception_info.value.status_code == 404
    assert exception_info.value.detail == "Inbound not found"


def test_delete_inbound_rejects_existing_clients(database_session: Session, admin_user: Admin) -> None:
    inbound = run_async(
        create_inbound(
            InboundCreate(
                name="vless-one",
                protocol="vless",
                listen_port=9443,
                transport="tcp",
                security="tls",
                settings_json="{}",
                enabled=True,
            ),
            admin_user,
            database_session,
        )
    )

    created_client = run_async(
        create_client(
            ClientCreate(
                inbound_id=inbound.id,
                email="bob@example.com",
                uuid="22222222-2222-2222-2222-222222222222",
                traffic_limit_bytes=2048,
                expiry_at=None,
                enabled=True,
            ),
            admin_user,
            database_session,
        )
    )

    with pytest.raises(HTTPException) as exception_info:
        run_async(delete_inbound(inbound.id, admin_user, database_session))

    assert created_client.id is not None
    assert exception_info.value.status_code == 409
    assert exception_info.value.detail == "Cannot delete inbound with existing clients"


def test_update_client_rejects_duplicate_email(database_session: Session, admin_user: Admin) -> None:
    inbound = run_async(
        create_inbound(
            InboundCreate(
                name="trojan-one",
                protocol="trojan",
                listen_port=10443,
                transport="tcp",
                security="tls",
                settings_json="{}",
                enabled=True,
            ),
            admin_user,
            database_session,
        )
    )

    first_client = run_async(
        create_client(
            ClientCreate(
                inbound_id=inbound.id,
                email="first@example.com",
                uuid="33333333-3333-3333-3333-333333333333",
                traffic_limit_bytes=100,
                expiry_at=None,
                enabled=True,
            ),
            admin_user,
            database_session,
        )
    )
    second_client = run_async(
        create_client(
            ClientCreate(
                inbound_id=inbound.id,
                email="second@example.com",
                uuid="44444444-4444-4444-4444-444444444444",
                traffic_limit_bytes=100,
                expiry_at=None,
                enabled=True,
            ),
            admin_user,
            database_session,
        )
    )

    with pytest.raises(HTTPException) as exception_info:
        run_async(
            update_client(
                second_client.id,
                ClientUpdate(email="first@example.com"),
                admin_user,
                database_session,
            )
        )

    assert first_client.id is not None
    assert second_client.id is not None
    assert exception_info.value.status_code == 409
    assert exception_info.value.detail == "Client email already exists"


def test_system_health_exposes_bridge_runtime_details(admin_user: Admin) -> None:
    response = run_async(get_system_health(admin_user))

    assert response.binary_detected is True
    assert response.xray_api_reachable is True
    assert response.runtime_mode == "managed"
    assert response.xray_version == "Xray 26.1.13 (Xray, Penetrates Everything.) Custom"
    assert response.cpu_core_count == 8
    assert len(response.cpu_core_usage_percent) == 8
    assert response.memory_used_percent == 50.0
    assert response.zram_enabled is True


def test_sync_all_inbounds_to_bridge_rehydrates_runtime(
    database_session: Session,
    admin_user: Admin,
    bridge_client_stub: BridgeClientStub,
) -> None:
    inbound = run_async(
        create_inbound(
            InboundCreate(
                name="restored-inbound",
                protocol="vless",
                listen_port=11443,
                transport="tcp",
                security="none",
                settings_json="{}",
                enabled=True,
            ),
            admin_user,
            database_session,
        )
    )

    created_client = run_async(
        create_client(
            ClientCreate(
                inbound_id=inbound.id,
                email="restore@example.com",
                uuid="55555555-5555-5555-5555-555555555555",
                traffic_limit_bytes=0,
                expiry_at=None,
                enabled=True,
            ),
            admin_user,
            database_session,
        )
    )

    bridge_client_stub.apply_inbound_calls.clear()

    run_async(sync_all_inbounds_to_bridge(database_session))

    assert created_client.id is not None
    assert bridge_client_stub.apply_inbound_calls == [
        {
            "id": inbound.id,
            "name": "restored-inbound",
            "protocol": "vless",
            "listen_port": 11443,
            "transport": "tcp",
            "security": "none",
            "settings_json": "{}",
            "enabled": True,
            "clients": [
                {
                    "id": created_client.id,
                    "inbound_id": inbound.id,
                    "email": "restore@example.com",
                    "uuid": "55555555-5555-5555-5555-555555555555",
                    "traffic_limit_bytes": 0,
                    "used_bytes": 0,
                    "expiry_at": None,
                    "enabled": True,
                }
            ],
        }
    ]
