from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Inbound(Base):
    __tablename__ = "inbounds"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    protocol: Mapped[str] = mapped_column(String(32))
    listen_port: Mapped[int] = mapped_column(Integer, unique=True)
    transport: Mapped[str] = mapped_column(String(32), default="tcp")
    security: Mapped[str] = mapped_column(String(32), default="none")
    settings_json: Mapped[str] = mapped_column(String, default="{}")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    clients: Mapped[list["Client"]] = relationship(back_populates="inbound", cascade="all, delete-orphan")


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    inbound_id: Mapped[int] = mapped_column(ForeignKey("inbounds.id"))
    email: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    uuid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    traffic_limit_bytes: Mapped[int] = mapped_column(Integer, default=0)
    used_bytes: Mapped[int] = mapped_column(Integer, default=0)
    expiry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    inbound: Mapped[Inbound] = relationship(back_populates="clients")


class TrafficSample(Base):
    __tablename__ = "traffic_samples"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    uplink_bytes: Mapped[int] = mapped_column(Integer, default=0)
    downlink_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sampled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(String)