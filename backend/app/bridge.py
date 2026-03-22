from typing import Any

import httpx

from .config import settings


class BridgeClient:
    def __init__(self) -> None:
        self.base_url = settings.bridge_base_url.rstrip("/")

    async def get(self, path: str, query_parameters: dict[str, Any] | list[tuple[str, Any]] | None = None) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            response = await http_client.get(f"{self.base_url}{path}", params=query_parameters)
            response.raise_for_status()
            return response.json()

    async def post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            response = await http_client.post(f"{self.base_url}{path}", json=payload)
            response.raise_for_status()
            return response.json()


bridge_client = BridgeClient()
