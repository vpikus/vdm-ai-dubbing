# C4 Architecture Documentation

This directory contains comprehensive C4 model architecture documentation for the **Transmission-like YT-DLP Downloader with Optional Dubbing** system.

## Documentation Structure

The documentation follows the C4 model hierarchy (Context → Container → Component → Code). This directory contains **Container-level** and **Component-level** documentation.

### Container Level Documentation

Container-level documentation describes the deployable units (Docker containers) and their deployment architecture.

#### Master Container Documentation
- **[c4-container.md](./c4-container.md)** - **START HERE for deployment**: Complete container architecture with all 5 containers (Redis, Gateway, Downloader, Dubber, Muxer), Mermaid container diagram, communication protocols, data flows, and deployment configuration

#### API Documentation
- **[apis/gateway-api.yaml](./apis/gateway-api.yaml)** - OpenAPI 3.1.0 specification for Gateway REST API
  - Job management endpoints (create, list, get, control, delete)
  - Authentication endpoints (login, logout)
  - Health and metrics endpoints

#### Deployment Configuration
- **[docker-compose.example.yml](./docker-compose.example.yml)** - Example Docker Compose configuration for all services
- **[.env.example](./.env.example)** - Environment variables configuration template

### Component Level Documentation

Component-level documentation describes the logical components within the system, their responsibilities, interfaces, and relationships.

#### Master Index
- **[c4-component.md](./c4-component.md)** - **START HERE**: System overview with all components, comprehensive Mermaid diagram, data flow, state machine, technology stack, and deployment architecture

#### Individual Component Documentation

1. **[c4-component-web-ui.md](./c4-component-web-ui.md)** - Web UI Component
   - TypeScript single-page application (React 18, Ant Design, Zustand)
   - Transmission-like queue interface with dark theme
   - REST API client (Fetch) and WebSocket client (Socket.IO)
   - Real-time progress monitoring, job control, and toast notifications

2. **[c4-component-gateway.md](./c4-component-gateway.md)** - Gateway/Orchestrator Component
   - Node.js 20.x with Fastify 5.7.x and Socket.IO 4.8.x
   - REST + WebSocket API for job management
   - Job state machine orchestration
   - Event aggregation from workers via Redis Pub/Sub
   - SQLite persistence

3. **[c4-component-downloader.md](./c4-component-downloader.md)** - Download Worker Component
   - Python 3.11+ with yt-dlp
   - Single-threaded queue consumer (concurrency 1)
   - Video download from YouTube and 1000+ supported sites
   - Progress tracking with real-time events
   - Atomic file operations (temp → library)

4. **[c4-component-dubber.md](./c4-component-dubber.md)** - Dubbing Worker Component
   - Node.js 20.x with FOSWLY vot.js (Yandex VOT client)
   - Audio extraction via FFmpeg
   - Voice-over translation to target language (default: Russian)
   - Concurrent processing (concurrency 2-4)
   - Output: mono 16kHz WAV

5. **[c4-component-muxer.md](./c4-component-muxer.md)** - Muxing Worker Component
   - Python 3.11+ with FFmpeg
   - Audio mixing with ducking (sidechain compression)
   - Multi-track muxing (original + dubbed audio streams)
   - Video stream copying (no re-encoding)
   - Metadata tagging and track disposition

6. **[c4-component-queue.md](./c4-component-queue.md)** - Queue/Message Bus Component
   - Redis 7.x with BullMQ job queues
   - Three dedicated queues: q:download, q:dub, q:mux
   - Redis Pub/Sub for event distribution (events:progress, events:state, events:log, events:error)
   - Priority support, retry logic, dead letter queue

7. **[c4-component-storage.md](./c4-component-storage.md)** - Storage Component
   - SQLite 3 for relational metadata (jobs, media, events)
   - POSIX filesystem for media assets (temp + library)
   - Write-Ahead Logging (WAL) for concurrency
   - Atomic file operations and disk space monitoring

## Quick Navigation

### By Role

**DevOps/Infrastructure**:
- Start with: [c4-container.md](./c4-container.md) (deployment architecture)
- Deploy with: [docker-compose.example.yml](./docker-compose.example.yml)
- Configure: [.env.example](./.env.example)
- Queue/Redis: [c4-component-queue.md](./c4-component-queue.md)
- Storage: [c4-component-storage.md](./c4-component-storage.md)

**Frontend Developers**:
- Start with: [c4-component-web-ui.md](./c4-component-web-ui.md)
- API spec: [apis/gateway-api.yaml](./apis/gateway-api.yaml)
- Gateway integration: [c4-component-gateway.md](./c4-component-gateway.md)

**Backend Developers**:
- Start with: [c4-container.md](./c4-container.md) (container overview)
- System overview: [c4-component.md](./c4-component.md)
- Gateway: [c4-component-gateway.md](./c4-component-gateway.md)
- API spec: [apis/gateway-api.yaml](./apis/gateway-api.yaml)
- Storage: [c4-component-storage.md](./c4-component-storage.md)
- Queue: [c4-component-queue.md](./c4-component-queue.md)

**Python Developers (Workers)**:
- Container docs: [c4-container.md](./c4-container.md#3-downloader-container) and [c4-container.md](./c4-container.md#5-muxer-container)
- Download Worker: [c4-component-downloader.md](./c4-component-downloader.md)
- Muxing Worker: [c4-component-muxer.md](./c4-component-muxer.md)
- Queue integration: [c4-component-queue.md](./c4-component-queue.md)

**Node.js Developers (Workers)**:
- Container docs: [c4-container.md](./c4-container.md#2-gateway-container) and [c4-container.md](./c4-container.md#4-dubber-container)
- Gateway: [c4-component-gateway.md](./c4-component-gateway.md)
- Dubbing Worker: [c4-component-dubber.md](./c4-component-dubber.md)
- Queue integration: [c4-component-queue.md](./c4-component-queue.md)

### By Feature

**Job Submission Flow**:
1. [c4-component-web-ui.md](./c4-component-web-ui.md) - User submits job
2. [c4-component-gateway.md](./c4-component-gateway.md) - Validates and enqueues
3. [c4-component-queue.md](./c4-component-queue.md) - Job queues
4. [c4-component-storage.md](./c4-component-storage.md) - Metadata persistence

**Download Flow**:
1. [c4-component-downloader.md](./c4-component-downloader.md) - Downloads video
2. [c4-component-storage.md](./c4-component-storage.md) - Stores media files
3. [c4-component-queue.md](./c4-component-queue.md) - Progress events

**Dubbing Flow** (optional):
1. [c4-component-dubber.md](./c4-component-dubber.md) - Generates dubbed audio
2. [c4-component-muxer.md](./c4-component-muxer.md) - Mixes and attaches tracks
3. [c4-component-storage.md](./c4-component-storage.md) - Final output storage

**Real-time Updates**:
1. [c4-component-queue.md](./c4-component-queue.md) - Pub/Sub events
2. [c4-component-gateway.md](./c4-component-gateway.md) - Event aggregation
3. [c4-component-web-ui.md](./c4-component-web-ui.md) - WebSocket updates

## Component Documentation Template

Each component document follows this structure:

1. **Overview** - Name, description, type, technology
2. **Purpose** - What it does, problems solved, role in system
3. **Software Features** - List of features provided
4. **Code Elements** - References to code-level documentation (to be created during implementation)
5. **Interfaces** - APIs, protocols, operations with detailed schemas
6. **Dependencies** - Other components and external systems
7. **Component Diagram** - Mermaid flowchart diagram showing internal structure
8. **Technology Stack** - Specific technologies, libraries, frameworks
9. **Deployment Considerations** - Docker, configuration, resources, scaling

## Mermaid Diagrams

All documents include **Mermaid diagrams** using standard syntax compatible with all renderers:
- Use `flowchart TB` (top-to-bottom) for architectural diagrams
- Use `subgraph` for container/component boundaries
- Use standard node shapes: `[]` for components, `[()]` for databases, `[[]]` for queues
- Show relationships with `-->` arrows and `|"protocol"|` labels
- Color-coded with `style` directives for visual distinction

Diagrams can be rendered in:
- GitHub (native Mermaid support)
- VS Code (Mermaid extension)
- IntelliJ/PyCharm (Mermaid plugin)
- Online: https://mermaid.live/

## System Architecture Summary

### Technology Stack

| Component | Language | Framework/Library | Purpose |
|-----------|----------|-------------------|---------|
| Web UI | TypeScript | React 18, Ant Design, Zustand | User interface |
| Gateway | TypeScript/Node.js | Fastify 5.7.x, Socket.IO 4.8.x | API and orchestration |
| Download Worker | Python 3.11+ | yt-dlp, python-rq/arq | Video download |
| Dubbing Worker | TypeScript/Node.js | FOSWLY vot.js, BullMQ | Audio dubbing |
| Muxing Worker | Python 3.11+ | FFmpeg (CLI), python-rq/arq | Audio mixing |
| Queue/Message Bus | - | Redis 7.x, BullMQ | Job queues and Pub/Sub |
| Storage | - | SQLite 3, POSIX FS | Metadata and media storage |

### Job State Machine

```
QUEUED → DOWNLOADING → DOWNLOADED → [DUBBING → DUBBED →] MUXING → COMPLETE
                                     └─────────────────┘
                                     (optional, if dubbing enabled)

                   ↓ (on error)
                 FAILED

                   ↓ (user action)
                CANCELED
```

### Data Flow

1. **User → Web UI → Gateway**: Submit job via REST API
2. **Gateway → Queue**: Enqueue to `q:download`
3. **Download Worker → Queue**: Consume job, publish progress
4. **Download Worker → Storage**: Write media to filesystem
5. **Download Worker → Queue**: Enqueue to `q:dub` (if dubbing)
6. **Dubbing Worker → Queue**: Consume job, publish progress
7. **Dubbing Worker → Yandex VOT**: Translate audio
8. **Dubbing Worker → Storage**: Write dubbed audio
9. **Dubbing Worker → Queue**: Enqueue to `q:mux`
10. **Muxing Worker → Queue**: Consume job, publish progress
11. **Muxing Worker → FFmpeg**: Mix audio with ducking
12. **Muxing Worker → Storage**: Write final video
13. **Workers → Queue → Gateway → Web UI**: Real-time progress updates

### Deployment (Docker Compose)

```yaml
services:
  redis:          # Queue/Message Bus
  gateway:        # Gateway/Orchestrator + Web UI
  downloader:     # Download Worker (1 instance)
  dubber:         # Dubbing Worker (1-4 instances)
  muxer:          # Muxing Worker (1-2 instances)

volumes:
  db_data:        # SQLite database
  media_data:     # Media files
  redis_data:     # Redis persistence
```

## Deployment Quick Start

1. Copy deployment configuration:
   ```bash
   cp docker-compose.example.yml docker-compose.yml
   cp .env.example .env
   ```

2. Edit `.env` to configure:
   - `REDIS_PASSWORD` - Secure Redis password
   - `JWT_SECRET` - Strong random string for JWT tokens
   - `TARGET_LANG` - Target language for dubbing (default: ru)
   - `DUBBING_CONCURRENCY` - Number of concurrent dubbing workers
   - Other optional settings

3. Deploy with Docker Compose:
   ```bash
   docker-compose up -d
   ```

4. Access the Web UI:
   - Open http://localhost:3000 in your browser
   - Login with default credentials (see gateway configuration)

5. Monitor containers:
   ```bash
   docker-compose logs -f
   docker-compose ps
   ```

See [c4-container.md](./c4-container.md) for complete deployment documentation.

## Next Steps in C4 Documentation

1. **Context Level** (c4-context.md) - System context with users and external systems
2. **Code Level** (c4-code-*.md) - Code-level documentation during implementation

## References

- **Draft Architecture**: [Draft architecture design.md](../docs/Draft%20architecture%20design.md)
- **C4 Model Official Site**: https://c4model.com/
- **C4 Component Diagrams**: https://c4model.com/diagrams/component
- **Mermaid C4 Syntax**: https://mermaid.js.org/syntax/c4.html

## Contributing

When implementing components:

1. Create code-level documentation (c4-code-*.md) for key classes/modules
2. Update component documentation with links to code-level docs
3. Keep Mermaid diagrams in sync with implementation
4. Update technology versions and dependencies as needed
5. Document API changes in component interface sections

## License

This documentation is part of the Video Download Manager project.

---

**Generated**: 2026-01-24
**Updated**: 2026-02-01
**C4 Model Version**: Container Level + Component Level
**Status**: POC Implementation
