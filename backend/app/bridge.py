import json
from importlib import import_module
from typing import Any

from .config import settings


class BridgeClient:
    def __init__(self) -> None:
        self.target = settings.bridge_grpc_target
        self.timeout_seconds = 10.0
        self._channel = None

    def _get_grpc_module(self):
        try:
            return import_module("grpc")
        except ModuleNotFoundError as error:
            raise RuntimeError("grpcio is not installed; install backend dependencies before starting the API") from error

    async def _get_channel(self):
        if self._channel is None:
            grpc_module = self._get_grpc_module()
            self._channel = grpc_module.aio.insecure_channel(self.target)
        return self._channel

    @staticmethod
    def _serialize(payload: dict[str, Any]) -> bytes:
        return json.dumps(payload, separators=(",", ":")).encode("utf-8")

    @staticmethod
    def _deserialize(payload: bytes) -> dict[str, Any]:
        if not payload:
            return {}
        return json.loads(payload.decode("utf-8"))

    async def _call(self, method_name: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        channel = await self._get_channel()
        unary_unary = channel.unary_unary(
            method_name,
            request_serializer=self._serialize,
            response_deserializer=self._deserialize,
        )
        return await unary_unary(payload or {}, timeout=self.timeout_seconds)

    async def get_runtime_status(self) -> dict[str, Any]:
        return await self._call("/progenui.bridge.BridgeService/GetRuntimeStatus")

    async def get_runtime_config(self) -> dict[str, Any]:
        return await self._call("/progenui.bridge.BridgeService/GetRuntimeConfig")

    async def list_client_stats(self, client_uuids: list[str]) -> dict[str, Any]:
        return await self._call(
            "/progenui.bridge.BridgeService/ListClientStats",
            {"uuids": client_uuids},
        )

    async def apply_inbound(self, inbound: dict[str, Any]) -> dict[str, Any]:
        return await self._call(
            "/progenui.bridge.BridgeService/ApplyInbound",
            {"inbound": inbound},
        )

    async def remove_inbound(self, inbound_id: int) -> dict[str, Any]:
        return await self._call(
            "/progenui.bridge.BridgeService/RemoveInbound",
            {"inbound_id": inbound_id},
        )

    async def remove_client(self, client_uuid: str) -> dict[str, Any]:
        return await self._call(
            "/progenui.bridge.BridgeService/RemoveClient",
            {"uuid": client_uuid},
        )


bridge_client = BridgeClient()
