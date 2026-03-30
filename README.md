# ProgenUI

Monorepo scaffold for an X-UI-inspired control panel built with React, FastAPI, and Go.

## Services

- `frontend`: React + Vite admin UI
- `backend`: FastAPI control plane with SQLite persistence
- `bridge`: Go sidecar for Xray process/runtime integration
- `deploy/nginx.conf`: Nginx reverse proxy and static serving config

## Quick start

```bash
docker compose up --build
```

Default admin credentials:

- Username: `admin`
- Password: `admin123`

## Notes

- The bridge exposes stubbed Xray integration points and a real process supervisor shell.
- The backend is the source of truth for inbounds, clients, and traffic samples.
- The frontend is a local admin shell with dashboard, inbound management, and client management.

