# Implementation Plan: Video Download Manager

This document provides a phased implementation plan for the **Transmission-like YT-DLP Downloader with Optional Dubbing** system based on the C4 architecture documentation.

## Executive Summary

The system consists of 5 Docker containers (Redis, Gateway, Downloader, Dubber, Muxer) implementing a queue-based video download manager with AI voice-over translation. The implementation follows a bottom-up approach: infrastructure first, then core services, then workers, and finally the UI.

## Technology Stack Overview

| Component | Technology | Language |
|-----------|------------|----------|
| Gateway | Fastify 5.7.x, Socket.IO 4.8.x, BullMQ 5.x | Node.js 20.x / TypeScript |
| Download Worker | yt-dlp, python-rq/arq | Python 3.11+ |
| Dubbing Worker | FOSWLY vot.js, BullMQ | Node.js 20.x / TypeScript |
| Muxing Worker | FFmpeg | Python 3.11+ |
| Queue | Redis 7.x, BullMQ | - |
| Database | SQLite 3, better-sqlite3 | - |
| Web UI | React/Vue, Socket.IO Client | TypeScript |

## Implementation Phases

### Phase 1: Infrastructure Foundation

**Objective**: Set up the core infrastructure components that all services depend on.

#### 1.1 Docker Compose Setup
- [ ] Create production-ready `docker-compose.yml`
- [ ] Configure Redis container with AOF persistence
- [ ] Set up shared volumes for media storage and database
- [ ] Configure internal Docker network
- [ ] Create `.env` template with all required variables

**Deliverables**:
- `docker-compose.yml` (production)
- `.env.example` with documented variables
- Volume mount structure: `/media/tmp`, `/media/library`, `/data/db`

#### 1.2 Redis Queue Infrastructure
- [ ] Configure Redis with authentication and memory limits
- [ ] Create BullMQ queue definitions:
  - `q:download` (concurrency: 1)
  - `q:dub` (concurrency: 2-4)
  - `q:mux` (concurrency: 1-2)
- [ ] Define Pub/Sub channel schemas:
  - `events:progress`
  - `events:state`
  - `events:log`
  - `events:error`
- [ ] Implement queue monitoring (optional BullBoard)

**Deliverables**:
- Shared TypeScript/Python queue configuration module
- Event message type definitions
- Redis health check script

#### 1.3 SQLite Database Schema
- [ ] Create database migration scripts
- [ ] Implement `jobs` table with state enum and constraints
- [ ] Implement `media` table with foreign key to jobs
- [ ] Implement `job_events` table for audit log
- [ ] Configure WAL mode and connection settings
- [ ] Create seed data for development

**Deliverables**:
- `migrations/001_initial.sql`
- Database connection utilities (Node.js + Python)
- SQLite configuration (WAL, foreign keys, cache)

**Dependencies**: None (foundational)

---

### Phase 2: Gateway Service

**Objective**: Implement the central orchestration service with REST and WebSocket APIs.

#### 2.1 Project Setup
- [ ] Initialize Node.js project with TypeScript
- [ ] Configure Fastify 5.7.x server
- [ ] Set up pino logging (structured JSON)
- [ ] Configure environment variable parsing
- [ ] Create Dockerfile with multi-stage build

**Directory Structure**:
```
gateway/
├── src/
│   ├── server.ts           # Fastify entry point
│   ├── config.ts           # Environment configuration
│   ├── routes/             # REST API routes
│   ├── services/           # Business logic
│   ├── db/                 # SQLite client and queries
│   ├── queue/              # BullMQ queue manager
│   ├── websocket/          # Socket.IO server
│   └── types/              # TypeScript interfaces
├── package.json
├── tsconfig.json
└── Dockerfile
```

#### 2.2 Database Layer
- [ ] Implement SQLite connection with better-sqlite3
- [ ] Create job CRUD operations (insert, update, get, list, delete)
- [ ] Create media CRUD operations
- [ ] Create event logging operations
- [ ] Implement transaction support for state changes

#### 2.3 Queue Manager
- [ ] Implement BullMQ queue connections
- [ ] Create job enqueue functions for each queue
- [ ] Implement job control (pause, resume, cancel)
- [ ] Set up retry configuration with exponential backoff
- [ ] Implement disk space check before enqueue

#### 2.4 REST API Implementation
Based on OpenAPI spec (`apis/gateway-api.yaml`):

- [ ] `POST /api/jobs` - Create new download job
- [ ] `GET /api/jobs` - List jobs with filters and pagination
- [ ] `GET /api/jobs/:id` - Get job details with media and events
- [ ] `POST /api/jobs/:id/cancel` - Cancel active job
- [ ] `POST /api/jobs/:id/retry` - Retry failed/canceled job
- [ ] `POST /api/jobs/:id/resume` - Resume failed dubbing job
- [ ] `DELETE /api/jobs/:id` - Delete job and media files
- [ ] `GET /api/jobs/:id/logs` - Get job event logs
- [ ] `POST /api/auth/login` - Basic authentication
- [ ] `POST /api/auth/logout` - Session invalidation
- [ ] `GET /healthz` - Health check endpoint
- [ ] `GET /metrics` - Prometheus metrics

#### 2.5 WebSocket Server
- [ ] Configure Socket.IO 4.8.x server
- [ ] Implement authentication middleware
- [ ] Subscribe to Redis Pub/Sub channels (`events:*`)
- [ ] Relay events to connected WebSocket clients
- [ ] Implement client subscription management
- [ ] Handle connection/disconnection gracefully

#### 2.6 Event Aggregation
- [ ] Subscribe to all worker event channels
- [ ] Parse and validate incoming events
- [ ] Update job state in SQLite on state changes
- [ ] Log events to `job_events` table
- [ ] Broadcast to relevant WebSocket subscribers

**Deliverables**:
- Complete Gateway service with REST + WebSocket APIs
- OpenAPI validation via Fastify schemas
- Prometheus metrics integration
- Docker image

**Dependencies**: Phase 1 (Redis, SQLite)

---

### Phase 3: Download Worker

**Objective**: Implement the Python worker that downloads videos using yt-dlp.

#### 3.1 Project Setup
- [ ] Initialize Python project with pyproject.toml
- [ ] Configure virtual environment (uv or venv)
- [ ] Set up structlog for structured logging
- [ ] Create Dockerfile with FFmpeg and yt-dlp
- [ ] Configure python-rq or arq as queue client

**Directory Structure**:
```
downloader/
├── src/
│   ├── main.py             # Worker entry point
│   ├── config.py           # Environment configuration
│   ├── downloader.py       # yt-dlp wrapper
│   ├── queue_client.py     # Redis queue consumer
│   ├── events.py           # Pub/Sub publisher
│   ├── file_manager.py     # Atomic file operations
│   └── types.py            # Type definitions (dataclasses)
├── pyproject.toml
├── requirements.txt
└── Dockerfile
```

#### 3.2 Queue Consumer
- [ ] Connect to Redis using redis-py
- [ ] Consume jobs from `q:download` with concurrency 1
- [ ] Implement job acknowledgment (ack/nack)
- [ ] Handle graceful shutdown on SIGTERM
- [ ] Implement retry logic with backoff

#### 3.3 yt-dlp Integration
- [ ] Implement yt-dlp Python API wrapper
- [ ] Configure format selection (bestvideo+bestaudio, best, bestaudio)
- [ ] Set up progress hooks for real-time updates
- [ ] Configure output templates
- [ ] Handle subtitle download and embedding
- [ ] Extract video metadata (title, uploader, duration, resolution)
- [ ] Configure proxy and cookies support

#### 3.4 Progress Events
- [ ] Publish progress updates to `events:progress`
- [ ] Publish state changes to `events:state`
- [ ] Publish log entries to `events:log`
- [ ] Publish errors to `events:error`
- [ ] Format events according to schema

#### 3.5 File Operations
- [ ] Create temp directory per job
- [ ] Download video to temp directory
- [ ] Atomic move to final library path on success
- [ ] Clean up temp directory on completion/failure
- [ ] Verify file integrity after download

#### 3.6 Job Chaining
- [ ] Check if dubbing was requested
- [ ] Enqueue job to `q:dub` on successful download (if dubbing requested)
- [ ] Skip to `q:mux` if no dubbing requested (optional direct path)

**Deliverables**:
- Complete Download Worker with yt-dlp integration
- Real-time progress reporting
- Atomic file operations
- Docker image

**Dependencies**: Phase 1 (Redis), Phase 2 (Gateway for job enqueue)

---

### Phase 4: Dubbing Worker

**Objective**: Implement the Node.js worker that generates dubbed audio using FOSWLY vot.js.

#### 4.1 Project Setup
- [ ] Initialize Node.js project with TypeScript
- [ ] Install FOSWLY vot.js dependency
- [ ] Configure BullMQ as queue consumer
- [ ] Set up pino logging
- [ ] Create Dockerfile with FFmpeg

**Directory Structure**:
```
dubber/
├── src/
│   ├── main.ts             # Worker entry point
│   ├── config.ts           # Environment configuration
│   ├── dubber.ts           # vot.js wrapper
│   ├── audio-extractor.ts  # FFmpeg audio extraction
│   ├── queue-worker.ts     # BullMQ consumer
│   ├── events.ts           # Pub/Sub publisher
│   └── types.ts            # TypeScript interfaces
├── package.json
├── tsconfig.json
└── Dockerfile
```

#### 4.2 Queue Consumer
- [ ] Connect to BullMQ queue `q:dub`
- [ ] Configure concurrency (2-4, via environment)
- [ ] Implement job processing with retries
- [ ] Handle graceful shutdown

#### 4.3 Audio Extraction
- [ ] Extract audio from video file using FFmpeg
- [ ] Output format: mono 16kHz for VOT API
- [ ] Handle various input formats
- [ ] Report progress during extraction

#### 4.4 VOT API Integration
- [ ] Initialize vot.js client
- [ ] Send audio for voice-over translation
- [ ] Configure target language (default: Russian)
- [ ] Handle API rate limiting and errors
- [ ] Receive and save dubbed audio (mono 16kHz WAV)

#### 4.5 Progress Events
- [ ] Publish extraction progress
- [ ] Publish dubbing progress
- [ ] Publish completion/error events
- [ ] Update job state to DUBBED on success

#### 4.6 Job Chaining
- [ ] Save dubbed audio to temp directory
- [ ] Enqueue job to `q:mux` with paths to video and dubbed audio

**Deliverables**:
- Complete Dubbing Worker with vot.js integration
- Audio extraction via FFmpeg
- Real-time progress reporting
- Docker image

**Dependencies**: Phase 1 (Redis), Phase 3 (Download Worker outputs video)

---

### Phase 5: Muxing Worker

**Objective**: Implement the Python worker that mixes and muxes audio tracks.

#### 5.1 Project Setup
- [ ] Initialize Python project with pyproject.toml
- [ ] Configure FFmpeg bindings or CLI wrapper
- [ ] Set up structlog for logging
- [ ] Create Dockerfile with FFmpeg
- [ ] Configure python-rq or arq as queue client

**Directory Structure**:
```
muxer/
├── src/
│   ├── main.py             # Worker entry point
│   ├── config.py           # Environment configuration
│   ├── audio_mixer.py      # FFmpeg audio mixing with ducking
│   ├── muxer.py            # FFmpeg multi-track muxing
│   ├── queue_client.py     # Redis queue consumer
│   ├── events.py           # Pub/Sub publisher
│   └── types.py            # Type definitions
├── pyproject.toml
├── requirements.txt
└── Dockerfile
```

#### 5.2 Queue Consumer
- [ ] Connect to Redis queue `q:mux`
- [ ] Configure concurrency (1-2, via environment)
- [ ] Implement job processing with retries
- [ ] Handle graceful shutdown

#### 5.3 Audio Mixing
- [ ] Extract original audio from video (if not cached)
- [ ] Mix original and dubbed audio with ducking (sidechain compression)
- [ ] Apply audio normalization (LUFS target: -16)
- [ ] Output mixed audio to temp directory

#### 5.4 Multi-Track Muxing
- [ ] Copy video stream without re-encoding
- [ ] Add original audio as track a:0
- [ ] Add mixed/dubbed audio as track a:1
- [ ] Set metadata (language tags)
- [ ] Set track disposition (default audio track)
- [ ] Output to final library path atomically

#### 5.5 Progress Events
- [ ] Publish mixing progress
- [ ] Publish muxing progress
- [ ] Update job state to COMPLETE on success
- [ ] Publish error events on failure

#### 5.6 Cleanup
- [ ] Remove temp directory after successful mux
- [ ] Keep temp files for configurable period on failure
- [ ] Update media record with final video path

**Deliverables**:
- Complete Muxing Worker with FFmpeg integration
- Audio mixing with ducking
- Multi-track muxing
- Real-time progress reporting
- Docker image

**Dependencies**: Phase 1 (Redis), Phase 4 (Dubbing Worker outputs dubbed audio)

---

### Phase 6: Web UI

**Objective**: Implement the Transmission-like browser interface.

#### 6.1 Project Setup
- [ ] Initialize React or Vue project with TypeScript
- [ ] Configure Vite as build tool
- [ ] Set up Tailwind CSS or CSS-in-JS
- [ ] Configure Socket.IO client
- [ ] Set up state management (Redux, Zustand, or Pinia)

**Directory Structure**:
```
web-ui/
├── src/
│   ├── main.tsx            # Entry point
│   ├── App.tsx             # Root component
│   ├── components/         # UI components
│   │   ├── JobList.tsx
│   │   ├── JobItem.tsx
│   │   ├── AddJobDialog.tsx
│   │   ├── ProgressBar.tsx
│   │   └── LogViewer.tsx
│   ├── hooks/              # Custom hooks
│   ├── services/           # API and WebSocket clients
│   ├── store/              # State management
│   └── types/              # TypeScript interfaces
├── package.json
├── vite.config.ts
└── Dockerfile
```

#### 6.2 API Client
- [ ] Implement REST API client (fetch or axios)
- [ ] Handle authentication (JWT token storage)
- [ ] Create typed API methods for all endpoints
- [ ] Implement error handling and retry logic

#### 6.3 WebSocket Client
- [ ] Connect to Socket.IO server
- [ ] Handle authentication on connect
- [ ] Subscribe to job updates
- [ ] Process progress, state, log, error events
- [ ] Update UI state in real-time

#### 6.4 Job Queue View
- [ ] Display job list with status indicators
- [ ] Show progress bars for active jobs
- [ ] Display speed, ETA, downloaded bytes
- [ ] Implement sorting (status, priority, date)
- [ ] Implement filtering (status, search)
- [ ] Pagination or infinite scroll

#### 6.5 Job Submission
- [ ] URL input with validation
- [ ] Format selection dropdown
- [ ] Dubbing toggle and language selector
- [ ] Output container selection
- [ ] Priority setting
- [ ] Submit button with loading state

#### 6.6 Job Control
- [ ] Pause/Resume individual jobs
- [ ] Cancel jobs
- [ ] Change job priority (drag-and-drop or menu)
- [ ] Delete completed/failed jobs
- [ ] Batch operations (select multiple)

#### 6.7 Job Details
- [ ] Detailed job view (modal or drawer)
- [ ] Media metadata display
- [ ] Event log viewer with filtering
- [ ] Download link for completed videos (if served)

#### 6.8 Notifications
- [ ] Toast notifications for job completion/failure
- [ ] Browser notifications (optional)
- [ ] Sound alerts (optional)

**Deliverables**:
- Complete Web UI with Transmission-like UX
- Real-time updates via WebSocket
- Job management (CRUD, control)
- Docker image (or static files served by Gateway)

**Dependencies**: Phase 2 (Gateway REST + WebSocket APIs)

---

### Phase 7: Integration & Testing

**Objective**: Ensure all components work together reliably.

#### 7.1 Integration Tests
- [ ] End-to-end job flow: submit → download → dub → mux → complete
- [ ] Job control operations (pause, resume, cancel)
- [ ] Error handling and retry scenarios
- [ ] WebSocket event delivery
- [ ] Multi-job concurrent processing

#### 7.2 Performance Tests
- [ ] Concurrent download performance
- [ ] Queue throughput under load
- [ ] WebSocket scalability (many clients)
- [ ] Database query performance
- [ ] Memory usage under load

#### 7.3 Error Scenarios
- [ ] Network failures during download
- [ ] VOT API rate limiting/quota exceeded
- [ ] FFmpeg processing errors
- [ ] Redis connection loss and recovery
- [ ] Disk space exhaustion
- [ ] Graceful shutdown during active jobs

#### 7.4 Documentation
- [ ] API documentation (auto-generated from OpenAPI)
- [ ] Deployment guide
- [ ] Configuration reference
- [ ] Troubleshooting guide

**Deliverables**:
- Integration test suite
- Performance benchmarks
- Error handling documentation
- Deployment documentation

---

### Phase 8: Production Readiness

**Objective**: Prepare for production deployment.

#### 8.1 Security
- [ ] HTTPS configuration (TLS certificates)
- [ ] JWT secret rotation
- [ ] Rate limiting on API endpoints
- [ ] CSRF protection for state-changing operations
- [ ] Input validation and sanitization
- [ ] Secrets management (environment variables)

#### 8.2 Observability
- [ ] Prometheus metrics for all services
- [ ] Grafana dashboard setup
- [ ] Log aggregation (Loki or ELK)
- [ ] Alerting rules (queue depth, disk space, errors)
- [ ] Distributed tracing (OpenTelemetry, optional)

#### 8.3 High Availability
- [ ] Health check endpoints on all services
- [ ] Container restart policies
- [ ] Database backup strategy
- [ ] Media backup strategy
- [ ] Disaster recovery procedure

#### 8.4 CI/CD
- [ ] GitHub Actions or GitLab CI pipeline
- [ ] Automated tests on PR
- [ ] Docker image build and push
- [ ] Staging environment deployment
- [ ] Production deployment workflow

**Deliverables**:
- Production-ready Docker Compose
- Monitoring and alerting setup
- CI/CD pipeline
- Security hardening documentation

---

## Milestone Summary

| Milestone | Phases | Key Deliverables |
|-----------|--------|------------------|
| **M1: Infrastructure** | Phase 1 | Redis, SQLite, Docker Compose |
| **M2: Core API** | Phase 2 | Gateway with REST + WebSocket |
| **M3: Download** | Phase 3 | Video download with yt-dlp |
| **M4: Dubbing** | Phase 4 | Voice-over translation with vot.js |
| **M5: Muxing** | Phase 5 | Audio mixing and final output |
| **M6: UI** | Phase 6 | Web interface |
| **M7: Testing** | Phase 7 | Integration tests, documentation |
| **M8: Production** | Phase 8 | Security, observability, CI/CD |

## Critical Path

The minimum viable product (MVP) requires completion of:

1. **Phase 1** → **Phase 2** → **Phase 3** → **Phase 6** (basic download only)
2. Add **Phase 4** → **Phase 5** for dubbing support

```
Phase 1 ──► Phase 2 ──► Phase 3 ──┬──► Phase 6 (MVP: Download Only)
                                  │
                                  ├──► Phase 4 ──► Phase 5 (Full: With Dubbing)
                                  │
                                  └──► Phase 7 ──► Phase 8 (Production)
```

## Risk Factors

| Risk | Mitigation |
|------|------------|
| Yandex VOT API changes | Abstract vot.js usage, monitor for API updates |
| yt-dlp site support changes | Regular yt-dlp updates, graceful error handling |
| Redis memory exhaustion | Configure maxmemory with noeviction, job cleanup |
| Disk space exhaustion | Pre-enqueue checks, alerts, cleanup routines |
| SQLite write contention | Single writer pattern, WAL mode, consider PostgreSQL for scaling |

## Development Environment Setup

1. Clone repository
2. Copy `.env.example` to `.env`
3. Run `docker-compose up redis` (start Redis first)
4. Run database migrations
5. Start Gateway in development mode
6. Start workers (can be run locally or in Docker)
7. Start Web UI development server

## References

- [C4 Context Documentation](./c4-context.md)
- [C4 Container Documentation](./c4-container.md)
- [C4 Component Documentation](./c4-component.md)
- [Gateway API Specification](./apis/gateway-api.yaml)
- [Docker Compose Example](./docker-compose.example.yml)
- [Draft Architecture Design](../docs/Draft%20architecture%20design.md)
