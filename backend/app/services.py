from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models


def ensure_default_admin(database_session: Session, username: str, password_hash: str) -> None:
    existing_admin = database_session.query(models.Admin).filter(models.Admin.username == username).first()
    if existing_admin:
        return
    database_session.add(models.Admin(username=username, password_hash=password_hash))
    database_session.commit()


def build_dashboard_summary(database_session: Session) -> dict:
    total_inbounds = database_session.query(func.count(models.Inbound.id)).scalar() or 0
    total_clients = database_session.query(func.count(models.Client.id)).scalar() or 0
    active_clients = (
        database_session.query(func.count(models.Client.id)).filter(models.Client.enabled.is_(True)).scalar() or 0
    )
    total_uplink = database_session.query(func.coalesce(func.sum(models.TrafficSample.uplink_bytes), 0)).scalar() or 0
    total_downlink = (
        database_session.query(func.coalesce(func.sum(models.TrafficSample.downlink_bytes), 0)).scalar() or 0
    )
    return {
        "total_inbounds": total_inbounds,
        "total_clients": total_clients,
        "active_clients": active_clients,
        "total_uplink_bytes": int(total_uplink),
        "total_downlink_bytes": int(total_downlink),
    }


def build_traffic_history(database_session: Session, limit: int = 20) -> list[dict]:
    traffic_rows = (
        database_session.query(
            models.TrafficSample.sampled_at,
            func.sum(models.TrafficSample.uplink_bytes).label("uplink_bytes"),
            func.sum(models.TrafficSample.downlink_bytes).label("downlink_bytes"),
        )
        .group_by(models.TrafficSample.sampled_at)
        .order_by(models.TrafficSample.sampled_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "timestamp": row.sampled_at,
            "uplink_bytes": int(row.uplink_bytes),
            "downlink_bytes": int(row.downlink_bytes),
        }
        for row in reversed(traffic_rows)
    ]


def persist_stats_snapshot(database_session: Session, bridge_stats: dict) -> dict:
    sampled_at = datetime.now(timezone.utc)
    total_uplink_bytes = 0
    total_downlink_bytes = 0

    for client_stat in bridge_stats.get("clients", []):
        client = database_session.query(models.Client).filter(models.Client.uuid == client_stat["uuid"]).first()
        if not client:
            continue

        client_total_bytes = int(client_stat["uplink_bytes"]) + int(client_stat["downlink_bytes"])
        client.used_bytes = max(client.used_bytes, client_total_bytes)
        database_session.add(
            models.TrafficSample(
                client_id=client.id,
                uplink_bytes=int(client_stat["uplink_bytes"]),
                downlink_bytes=int(client_stat["downlink_bytes"]),
                sampled_at=sampled_at,
            )
        )
        total_uplink_bytes += int(client_stat["uplink_bytes"])
        total_downlink_bytes += int(client_stat["downlink_bytes"])

    database_session.add(
        models.TrafficSample(
            client_id=None,
            uplink_bytes=total_uplink_bytes,
            downlink_bytes=total_downlink_bytes,
            sampled_at=sampled_at,
        )
    )
    database_session.commit()
    return {
        "timestamp": sampled_at,
        "uplink_bytes": total_uplink_bytes,
        "downlink_bytes": total_downlink_bytes,
    }
