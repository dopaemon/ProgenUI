from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Client, Inbound, TrafficSample
from app.services import build_dashboard_summary, build_traffic_history, persist_stats_snapshot


def create_database_session() -> Session:
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    test_session_factory = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=test_engine)
    return test_session_factory()


def test_persist_stats_snapshot_stores_delta_traffic() -> None:
    database_session = create_database_session()
    try:
        inbound = Inbound(
            name="delta-inbound",
            protocol="vless",
            listen_port=8443,
            transport="tcp",
            security="none",
            settings_json="{}",
            enabled=True,
        )
        database_session.add(inbound)
        database_session.commit()
        database_session.refresh(inbound)

        client = Client(
            inbound_id=inbound.id,
            email="delta@example.com",
            uuid="11111111-1111-1111-1111-111111111111",
            traffic_limit_bytes=0,
            used_bytes=0,
            expiry_at=None,
            enabled=True,
        )
        database_session.add(client)
        database_session.commit()

        persist_stats_snapshot(
            database_session,
            {"clients": [{"uuid": client.uuid, "uplink_bytes": 100, "downlink_bytes": 300}]},
        )
        persist_stats_snapshot(
            database_session,
            {"clients": [{"uuid": client.uuid, "uplink_bytes": 160, "downlink_bytes": 440}]},
        )

        database_session.refresh(client)
        client_samples = database_session.query(TrafficSample).filter(TrafficSample.client_id == client.id).all()
        aggregate_samples = database_session.query(TrafficSample).filter(TrafficSample.client_id.is_(None)).all()

        assert client.used_bytes == 600
        assert [(sample.uplink_bytes, sample.downlink_bytes) for sample in client_samples] == [(100, 300), (53, 147)]
        assert [(sample.uplink_bytes, sample.downlink_bytes) for sample in aggregate_samples] == [(100, 300), (53, 147)]
    finally:
        database_session.close()


def test_dashboard_history_uses_aggregate_samples_only() -> None:
    database_session = create_database_session()
    try:
        sampled_at = datetime(2026, 3, 31, 12, 0, tzinfo=timezone.utc)
        database_session.add_all(
            [
                TrafficSample(client_id=1, uplink_bytes=100, downlink_bytes=200, sampled_at=sampled_at),
                TrafficSample(client_id=None, uplink_bytes=100, downlink_bytes=200, sampled_at=sampled_at),
            ]
        )
        database_session.commit()

        summary = build_dashboard_summary(database_session)
        history = build_traffic_history(database_session)

        assert summary["total_uplink_bytes"] == 100
        assert summary["total_downlink_bytes"] == 200
        assert len(history) == 1
        assert history[0]["uplink_bytes"] == 100
        assert history[0]["downlink_bytes"] == 200
    finally:
        database_session.close()
