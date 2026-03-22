from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class InboundBase(BaseModel):
    name: str
    protocol: str
    listen_port: int = Field(ge=1, le=65535)
    transport: str = "tcp"
    security: str = "none"
    settings_json: str = "{}"
    enabled: bool = True


class InboundCreate(InboundBase):
    pass


class InboundUpdate(BaseModel):
    name: str | None = None
    protocol: str | None = None
    listen_port: int | None = Field(default=None, ge=1, le=65535)
    transport: str | None = None
    security: str | None = None
    settings_json: str | None = None
    enabled: bool | None = None


class InboundRead(InboundBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class ClientBase(BaseModel):
    inbound_id: int
    email: str
    uuid: str
    traffic_limit_bytes: int = Field(default=0, ge=0)
    expiry_at: datetime | None = None
    enabled: bool = True


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    inbound_id: int | None = None
    email: str | None = None
    uuid: str | None = None
    traffic_limit_bytes: int | None = Field(default=None, ge=0)
    expiry_at: datetime | None = None
    enabled: bool | None = None


class ClientRead(ClientBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    used_bytes: int
    created_at: datetime
    updated_at: datetime


class DashboardSummary(BaseModel):
    total_inbounds: int
    total_clients: int
    active_clients: int
    total_uplink_bytes: int
    total_downlink_bytes: int


class TrafficPoint(BaseModel):
    timestamp: datetime
    uplink_bytes: int
    downlink_bytes: int


class BridgeRuntimeStatus(BaseModel):
    xray_running: bool
    api_port: int
    binary_path: str
    config_path: str
    last_error: str | None = None
