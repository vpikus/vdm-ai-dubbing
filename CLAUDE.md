# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Video Download Manager is a Transmission-like queue-based video download manager with optional AI voice-over dubbing. Built with Docker containers and microservices architecture.

## Build & Development Commands

### Primary Development (via Makefile)
```bash
make dev          # Start development environment (builds + runs all services)
make build        # Build all Docker images
make up           # Start all services (daemonized)
make down         # Stop all services
make logs-f       # Follow service logs in real-time
make clean        # Remove all containers and volumes
```

### Testing
```bash
make test         # Run all tests (gateway unit + E2E)
make test-gateway # Run gateway unit tests
make test-e2e     # Run E2E tests via docker-compose
```

### Individual Service Development
```bash
# Gateway (Node.js/Fastify)
cd gateway && npm run dev     # Dev with tsx watch
cd gateway && npm test        # Run vitest tests
cd gateway && npm run lint    # ESLint

# Web UI (React/Vite)
cd web-ui && npm run dev      # Vite dev server with HMR
cd web-ui && npm run lint     # ESLint

# Python Workers (Downloader, Muxer)
cd downloader && python -m src.main    # Run worker
cd downloader && python -m pytest      # Run tests
cd downloader && ruff check src/       # Lint
cd downloader && mypy src/             # Type check

# Dubber (Node.js)
cd dubber && npm run dev      # Dev with tsx watch
cd dubber && npm test         # Run vitest tests
```

### Debug Access
```bash
make shell-gw     # Shell into gateway container
make shell-redis  # Redis CLI
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Video Download Manager                     │
└─────────────────────────────────────────────────────────────┘

Web UI (React/Vite) :8080
    ↓ REST + WebSocket
Gateway (Fastify/Node.js) :3000
    ├─ SQLite (job state, metadata)
    └─ Redis (BullMQ queues + Pub/Sub)
         ├─ q:download (concurrency: 1)
         ├─ q:dub (concurrency: 2-4)
         └─ q:mux (concurrency: 1-2)

Workers:
  Downloader (Python/yt-dlp) → Downloads video
  Dubber (Node.js/vot.js)    → AI voice-over via Yandex VOT
  Muxer (Python/FFmpeg)      → Audio mixing + video muxing
```

### Job State Machine
```
QUEUED → DOWNLOADING → DOWNLOADED → [DUBBING → DUBBED] → MUXING → COMPLETE
                                     (optional)
         ↓ (on error)               ↓ (user action)
       FAILED                     CANCELED
```

### Key Design Patterns
- **Event-Driven**: Workers publish to Redis Pub/Sub (`events:progress`, `events:state`, `events:log`, `events:error`); Gateway relays via WebSocket
- **Queue-Based**: BullMQ with automatic retries and exponential backoff
- **Atomic Files**: Downloads write to temp dir, move to library only on success

## Key Entry Points

| Service | Entry Point | Purpose |
|---------|-------------|---------|
| Gateway | `gateway/src/server.ts` | REST API, WebSocket, orchestration |
| Web UI | `web-ui/src/main.tsx` | React SPA entry |
| Downloader | `downloader/src/main.py` | yt-dlp queue consumer |
| Dubber | `dubber/src/main.ts` | vot.js queue consumer |
| Muxer | `muxer/src/main.py` | FFmpeg queue consumer |

## API Structure (Gateway)

```
POST   /api/auth/login              - Login
POST   /api/auth/logout             - Logout
GET    /api/jobs                    - List jobs
POST   /api/jobs                    - Create job
GET    /api/jobs/:id                - Get job details
POST   /api/jobs/:id/cancel         - Cancel job
POST   /api/jobs/:id/retry          - Retry failed job
POST   /api/jobs/:id/resume         - Resume failed dubbing job
DELETE /api/jobs/:id                - Delete job
GET    /healthz                     - Health check
GET    /metrics                     - Prometheus metrics
```

## Database (SQLite)

Tables: `users`, `jobs`, `media`, `job_events`
- WAL mode enabled
- Foreign keys enforced
- Path: `/app/data/db.sqlite` (configurable via DB_PATH)

## Tech Stack

| Component | Stack |
|-----------|-------|
| Gateway | TypeScript, Fastify 5.2, Socket.IO 4.8, BullMQ 5.x, better-sqlite3 |
| Web UI | TypeScript, React 18, Vite, Ant Design, Zustand |
| Downloader | Python 3.11+, yt-dlp, redis, structlog |
| Dubber | TypeScript, vot.js, fluent-ffmpeg, BullMQ |
| Muxer | Python 3.11+, FFmpeg CLI, redis, structlog |
| Queue | Redis 7.x, BullMQ |

## Configuration

All configuration via environment variables. Copy `C4-Documentation/.env.example` to `.env` and configure:
- `REDIS_PASSWORD` - Required (change from placeholder)
- `JWT_SECRET` - Change for production
- `TARGET_LANG` - Dubbing target language (default: ru)

See `C4-Documentation/.env.example` for complete reference.

## Documentation

Comprehensive C4 architecture documentation in `C4-Documentation/`:
- `README.md` - Documentation index
- `IMPLEMENTATION-PLAN.md` - 8-phase implementation roadmap
- `c4-context.md`, `c4-container.md`, `c4-component*.md` - C4 model docs
