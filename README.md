# ProgenUI

Monorepo scaffold for an X-UI-inspired control panel built with React, FastAPI, Go, and gRPC.

## Services

- `frontend`: React + Vite admin UI
- `backend`: FastAPI control plane with SQLite persistence and a gRPC client to the bridge
- `bridge`: Go sidecar for Xray process/runtime integration, exposing both HTTP and gRPC
- `deploy/nginx.conf`: Nginx reverse proxy and static serving config

## Quick start

```bash
docker compose up --build
```

If Docker is missing on a Debian or Ubuntu Linux host, you can inspect or install it with:

```bash
python3 scripts/docker_env.py
```

Default admin credentials:

- Username: `admin`
- Password: `admin123`

## Notes

- The bridge exposes stubbed Xray integration points and a real process supervisor shell.
- The backend is the source of truth for inbounds, clients, and traffic samples.
- The frontend is a local admin shell with dashboard, inbound management, and client management.
- Public frontend traffic still goes through FastAPI REST; only the internal backend-to-bridge hop uses gRPC.
