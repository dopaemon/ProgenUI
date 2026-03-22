import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .auth import create_token, hash_password, verify_password
from .bridge import bridge_client
from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .deps import get_current_admin
from .models import Admin, Client, Inbound
from .schemas import (
    BridgeRuntimeStatus,
    ClientCreate,
    ClientRead,
    ClientUpdate,
    DashboardSummary,
    InboundCreate,
    InboundRead,
    InboundUpdate,
    LoginRequest,
    RefreshRequest,
    TokenPair,
    TrafficPoint,
)
from .services import build_dashboard_summary, build_traffic_history, ensure_default_admin, persist_stats_snapshot


class DashboardConnectionManager:
    def __init__(self) -> None:
        self.connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def broadcast(self, payload: dict) -> None:
        closed_connections: list[WebSocket] = []
        for connection in self.connections:
            try:
                await connection.send_json(payload)
            except RuntimeError:
                closed_connections.append(connection)
        for connection in closed_connections:
            self.disconnect(connection)


dashboard_connection_manager = DashboardConnectionManager()


def build_dashboard_event(database_session: Session) -> dict:
    return {
        "type": "dashboard",
        "summary": build_dashboard_summary(database_session),
        "traffic": build_traffic_history(database_session),
    }


async def poll_bridge_stats_forever() -> None:
    while True:
        try:
            database_session = SessionLocal()
            try:
                client_identifiers = list(database_session.query(Client.uuid).scalars())
                query_parameters = [("uuid", client_identifier) for client_identifier in client_identifiers]
                bridge_stats = await bridge_client.get("/stats/clients", query_parameters=query_parameters)
                persist_stats_snapshot(database_session, bridge_stats)
                await dashboard_connection_manager.broadcast(build_dashboard_event(database_session))
            finally:
                database_session.close()
        except Exception:
            pass
        await asyncio.sleep(settings.poll_interval_seconds)


@asynccontextmanager
async def lifespan(_: FastAPI):
    os.makedirs("./data", exist_ok=True)
    Base.metadata.create_all(bind=engine)
    database_session = SessionLocal()
    try:
        ensure_default_admin(database_session, settings.admin_username, hash_password(settings.admin_password))
    finally:
        database_session.close()
    background_task = asyncio.create_task(poll_bridge_stats_forever())
    yield
    background_task.cancel()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=TokenPair)
def login(payload: LoginRequest, database_session: Session = Depends(get_db)) -> TokenPair:
    admin = database_session.query(Admin).filter(Admin.username == payload.username).first()
    if not admin or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenPair(
        access_token=create_token(admin.username, settings.jwt_access_minutes, "access"),
        refresh_token=create_token(admin.username, settings.jwt_refresh_minutes, "refresh"),
    )


@app.post("/api/auth/refresh", response_model=TokenPair)
def refresh_token(payload: RefreshRequest, database_session: Session = Depends(get_db)) -> TokenPair:
    from .auth import decode_token

    try:
        token_payload = decode_token(payload.refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from exc
    if token_payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    admin = database_session.query(Admin).filter(Admin.username == token_payload.get("sub")).first()
    if not admin:
        raise HTTPException(status_code=401, detail="Admin not found")
    return TokenPair(
        access_token=create_token(admin.username, settings.jwt_access_minutes, "access"),
        refresh_token=create_token(admin.username, settings.jwt_refresh_minutes, "refresh"),
    )


@app.post("/api/auth/logout")
def logout(_: Admin = Depends(get_current_admin)) -> dict:
    return {"status": "ok"}


@app.get("/api/dashboard/summary", response_model=DashboardSummary)
def get_dashboard_summary(
    _: Admin = Depends(get_current_admin),
    database_session: Session = Depends(get_db),
) -> DashboardSummary:
    return DashboardSummary(**build_dashboard_summary(database_session))


@app.get("/api/traffic/history", response_model=list[TrafficPoint])
def get_traffic_history(
    _: Admin = Depends(get_current_admin),
    database_session: Session = Depends(get_db),
) -> list[TrafficPoint]:
    return [TrafficPoint(**point) for point in build_traffic_history(database_session)]


@app.get("/api/system/health", response_model=BridgeRuntimeStatus)
async def get_system_health(_: Admin = Depends(get_current_admin)) -> BridgeRuntimeStatus:
    bridge_runtime_status = await bridge_client.get("/runtime/status")
    return BridgeRuntimeStatus(**bridge_runtime_status)


@app.get("/api/inbounds", response_model=list[InboundRead])
def list_inbounds(
    _: Admin = Depends(get_current_admin),
    database_session: Session = Depends(get_db),
) -> list[Inbound]:
    return database_session.query(Inbound).order_by(Inbound.id.desc()).all()


@app.post("/api/inbounds", response_model=InboundRead)
async def create_inbound(
    payload: InboundCreate,
    _: Admin = Depends(get_current_admin),
    database_session: Session = Depends(get_db),
) -> Inbound:
    inbound = Inbound(**payload.model_dump())
    database_session.add(inbound)
    database_session.commit()
    database_session.refresh(inbound)
    await bridge_client.post("/inbounds/apply", {"inbound": payload.model_dump()})
    return inbound


@app.put("/api/inbounds/{inbound_id}", response_model=InboundRead)
async def update_inbound(
    inbound_id: int,
    payload: InboundUpdate,
    _: Admin = Depends(get_current_admin),
    database_session: Session = Depends(get_db),
) -> Inbound:
    inbound = database_session.query(Inbound).filter(Inbound.id == inbound_id).first()
    if not inbound:
        raise HTTPException(status_code=404, detail="Inbound not found")
    for field_name, field_value in payload.model_dump(exclude_unset=True).items():
        setattr(inbound, field_name, field_value)
    database_session.commit()
    database_session.refresh(inbound)
    await bridge_client.post("/inbounds/apply", {"inbound": InboundRead.model_validate(inbound).model_dump(mode="json")})
    return inbound


@app.delete("/api/inbounds/{inbound_id}")
def delete_inbound(
    inbound_id: int,
    _: Admin = Depends(get_current_admin),
    database_session: Session = Depends(get_db),
) -> dict:
    inbound = database_session.query(Inbound).filter(Inbound.id == inbound_id).first()
    if not inbound:
        raise HTTPException(status_code=404, detail="Inbound not found")
    database_session.delete(inbound)
    database_session.commit()
    return {"status": "deleted"}


@app.get("/api/clients", response_model=list[ClientRead])
def list_clients(
    _: Admin = Depends(get_current_admin),
    database_session: Session = Depends(get_db),
) -> list[Client]:
    return database_session.query(Client).order_by(Client.id.desc()).all()


@app.post("/api/clients", response_model=ClientRead)
async def create_client(
    payload: ClientCreate,
    _: Admin = Depends(get_current_admin),
    database_session: Session = Depends(get_db),
) -> Client:
    client = Client(**payload.model_dump())
    database_session.add(client)
    database_session.commit()
    database_session.refresh(client)
    await bridge_client.post("/clients/add", {"client": ClientRead.model_validate(client).model_dump(mode="json")})
    return client


@app.put("/api/clients/{client_id}", response_model=ClientRead)
async def update_client(
    client_id: int,
    payload: ClientUpdate,
    _: Admin = Depends(get_current_admin),
    database_session: Session = Depends(get_db),
) -> Client:
    client = database_session.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    for field_name, field_value in payload.model_dump(exclude_unset=True).items():
        setattr(client, field_name, field_value)
    database_session.commit()
    database_session.refresh(client)
    await bridge_client.post("/clients/update", {"client": ClientRead.model_validate(client).model_dump(mode="json")})
    return client


@app.delete("/api/clients/{client_id}")
async def delete_client(
    client_id: int,
    _: Admin = Depends(get_current_admin),
    database_session: Session = Depends(get_db),
) -> dict:
    client = database_session.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client_identifier = client.uuid
    database_session.delete(client)
    database_session.commit()
    await bridge_client.post("/clients/remove", {"uuid": client_identifier})
    return {"status": "deleted"}


@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket) -> None:
    await dashboard_connection_manager.connect(websocket)
    database_session = SessionLocal()
    try:
        await websocket.send_json(build_dashboard_event(database_session))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        dashboard_connection_manager.disconnect(websocket)
    finally:
        database_session.close()
