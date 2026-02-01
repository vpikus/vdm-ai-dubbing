# Video Download Manager

A queue-based video download manager with optional AI dubbing support. Built with a microservices architecture using Docker containers.

## Features

- Download videos from YouTube and other supported sites (via yt-dlp)
- Optional AI voice-over dubbing (via Yandex VOT) - supports Russian, English, Kazakh
- Real-time progress updates via WebSocket
- Queue-based job processing with BullMQ
- Web UI for managing downloads

## Architecture

The system consists of 5 Docker containers:

| Service | Description |
|---------|-------------|
| **Redis** | Message queue and pub/sub for events |
| **Gateway** | REST API, WebSocket server, job orchestration |
| **Downloader** | yt-dlp worker for downloading videos |
| **Dubber** | VOT.js worker for AI voice-over translation |
| **Muxer** | FFmpeg worker for audio mixing and muxing |

### Job Pipeline

```
QUEUED → DOWNLOADING → DOWNLOADED → [DUBBING → DUBBED] → MUXING → COMPLETE
```

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)
- Python 3.11+ (for local development)

### Running with Docker

1. Clone the repository
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and set secure values for:
   - `REDIS_PASSWORD`
   - `JWT_SECRET`
   - `ADMIN_PASSWORD`

4. Start all services:
   ```bash
   make up
   # or
   docker-compose up -d
   ```

5. Access the Web UI at http://localhost:8080

### Default Credentials

- Username: `admin`
- Password: `admin` (change in `.env`)

## Development

### Start development environment:
```bash
make dev
```

### Run tests:
```bash
make test
```

### View logs:
```bash
make logs-f
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout

### Jobs
- `GET /api/jobs` - List all jobs
- `POST /api/jobs` - Create new job
- `GET /api/jobs/:id` - Get job details
- `POST /api/jobs/:id/cancel` - Cancel job
- `POST /api/jobs/:id/retry` - Retry failed job
- `POST /api/jobs/:id/resume` - Resume failed dubbing job
- `DELETE /api/jobs/:id` - Delete job

### Health
- `GET /healthz` - Health check
- `GET /readyz` - Readiness check
- `GET /metrics` - Prometheus metrics

## WebSocket Events

Connect to `/socket.io` for real-time updates:

- `progress` - Download/processing progress
- `state` - Job status changes
- `log` - Worker log messages
- `error` - Error events

## Configuration

See `.env.example` for all configuration options.

### Key Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_LANG` | `ru` | Default dubbing language |
| `DEFAULT_CONTAINER` | `mkv` | Output video format |
| `DUCKING_LEVEL` | `0.3` | Original audio reduction during voice-over |
| `DUBBING_CONCURRENCY` | `2` | Concurrent dubbing jobs |

## Supported Dubbing Languages

VOT.js (Yandex Voice-Over Translation) supports the following target languages:
- Russian (ru)
- English (en)
- Kazakh (kk)

## License

MIT
