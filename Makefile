# Video Download Manager - Makefile

.PHONY: help build up down logs clean test dev install install-gateway install-web-ui install-dubber check-locks redeploy \
	lint lint-gateway lint-web-ui lint-dubber lint-downloader lint-muxer \
	typecheck typecheck-gateway typecheck-web-ui typecheck-dubber typecheck-downloader typecheck-muxer \
	install-downloader install-muxer check \
	audit audit-gateway audit-web-ui audit-dubber audit-downloader audit-muxer \
	format format-gateway format-web-ui format-dubber format-downloader format-muxer \
	format-check format-check-gateway format-check-web-ui format-check-dubber format-check-downloader format-check-muxer \
	fix fix-downloader fix-muxer

# Default target
help:
	@echo "Video Download Manager - Available Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install      - Install all dependencies (npm + Python venvs)"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development environment"
	@echo "  make build        - Build all Docker images"
	@echo "  make up           - Start all services"
	@echo "  make down         - Stop all services"
	@echo "  make redeploy     - Full redeploy (down, install, build, up)"
	@echo "  make logs         - View service logs"
	@echo "  make logs-f       - Follow service logs"
	@echo ""
	@echo "Testing:"
	@echo "  make test         - Run all tests"
	@echo "  make test-gateway - Run gateway unit tests"
	@echo "  make test-e2e     - Run E2E tests"
	@echo ""
	@echo "Linting & Type Checking:"
	@echo "  make check        - Run all linters and type checkers"
	@echo "  make lint         - Run all linters"
	@echo "  make fix          - Auto-fix lint issues (Python only)"
	@echo "  make lint-gateway - Lint gateway (ESLint)"
	@echo "  make lint-web-ui  - Lint web-ui (ESLint)"
	@echo "  make lint-dubber  - Lint dubber (ESLint)"
	@echo "  make lint-downloader - Lint downloader (ruff)"
	@echo "  make lint-muxer   - Lint muxer (ruff)"
	@echo "  make typecheck    - Run all type checkers"
	@echo "  make typecheck-gateway - Type check gateway (tsc)"
	@echo "  make typecheck-web-ui  - Type check web-ui (tsc)"
	@echo "  make typecheck-dubber  - Type check dubber (tsc)"
	@echo "  make typecheck-downloader - Type check downloader (mypy)"
	@echo "  make typecheck-muxer   - Type check muxer (mypy)"
	@echo ""
	@echo "Formatting:"
	@echo "  make format       - Format all code"
	@echo "  make format-check - Check formatting without changes"
	@echo "  make format-gateway - Format gateway (prettier)"
	@echo "  make format-web-ui  - Format web-ui (prettier)"
	@echo "  make format-dubber  - Format dubber (prettier)"
	@echo "  make format-downloader - Format downloader (ruff)"
	@echo "  make format-muxer   - Format muxer (ruff)"
	@echo ""
	@echo "Security Auditing:"
	@echo "  make audit        - Run all security audits"
	@echo "  make audit-gateway - Audit gateway (npm audit)"
	@echo "  make audit-web-ui  - Audit web-ui (npm audit)"
	@echo "  make audit-dubber  - Audit dubber (npm audit)"
	@echo "  make audit-downloader - Audit downloader (pip-audit)"
	@echo "  make audit-muxer   - Audit muxer (pip-audit)"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean        - Remove all containers and volumes"
	@echo "  make prune        - Remove unused Docker resources"
	@echo "  make shell-gw     - Open shell in gateway container"
	@echo "  make shell-redis  - Open Redis CLI"

# =============================================================================
# Setup - Install dependencies (generates package-lock.json files)
# =============================================================================

install: install-gateway install-web-ui install-dubber install-downloader install-muxer
	@echo "All dependencies installed successfully"

install-gateway:
	@echo "Installing gateway dependencies..."
	cd gateway && npm install

install-web-ui:
	@echo "Installing web-ui dependencies..."
	cd web-ui && npm install

install-dubber:
	@echo "Installing dubber dependencies..."
	cd dubber && npm install

install-downloader:
	@echo "Installing downloader dependencies..."
	cd downloader && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"

install-muxer:
	@echo "Installing muxer dependencies..."
	cd muxer && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"

# =============================================================================
# Development
# =============================================================================

dev: check-locks
	docker-compose up --build

build: check-locks
	docker-compose build

# Check that package-lock.json files exist
check-locks:
	@if [ ! -f gateway/package-lock.json ] || [ ! -f web-ui/package-lock.json ] || [ ! -f dubber/package-lock.json ]; then \
		echo "Error: Missing package-lock.json files. Run 'make install' first."; \
		exit 1; \
	fi

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs

logs-f:
	docker-compose logs -f

# Testing
test: test-gateway test-e2e

test-gateway:
	cd gateway && npm test

test-e2e:
	docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit e2e

# =============================================================================
# Linting
# =============================================================================

lint: lint-gateway lint-web-ui lint-dubber lint-downloader lint-muxer
	@echo "All linting passed"

lint-gateway:
	@echo "Linting gateway..."
	cd gateway && npm run lint

lint-web-ui:
	@echo "Linting web-ui..."
	cd web-ui && npm run lint

lint-dubber:
	@echo "Linting dubber..."
	cd dubber && npm run lint

lint-downloader:
	@echo "Linting downloader..."
	cd downloader && .venv/bin/ruff check src/

lint-muxer:
	@echo "Linting muxer..."
	cd muxer && .venv/bin/ruff check src/

# =============================================================================
# Type Checking
# =============================================================================

typecheck: typecheck-gateway typecheck-web-ui typecheck-dubber typecheck-downloader typecheck-muxer
	@echo "All type checking passed"

typecheck-gateway:
	@echo "Type checking gateway..."
	cd gateway && npx tsc --noEmit

typecheck-web-ui:
	@echo "Type checking web-ui..."
	cd web-ui && npx tsc --noEmit

typecheck-dubber:
	@echo "Type checking dubber..."
	cd dubber && npx tsc --noEmit

typecheck-downloader:
	@echo "Type checking downloader..."
	cd downloader && .venv/bin/mypy src/

typecheck-muxer:
	@echo "Type checking muxer..."
	cd muxer && .venv/bin/mypy src/

# Combined lint + typecheck
check: lint typecheck
	@echo "All checks passed"

# =============================================================================
# Auto-fix (lint + format)
# =============================================================================

fix: fix-downloader fix-muxer format
	@echo "All auto-fixes applied"

fix-downloader:
	@echo "Fixing downloader..."
	cd downloader && .venv/bin/ruff check --fix src/

fix-muxer:
	@echo "Fixing muxer..."
	cd muxer && .venv/bin/ruff check --fix src/

# =============================================================================
# Security Auditing
# =============================================================================

audit: audit-gateway audit-web-ui audit-dubber audit-downloader audit-muxer
	@echo "All security audits complete"

audit-gateway:
	@echo "Auditing gateway dependencies..."
	cd gateway && npm audit

audit-web-ui:
	@echo "Auditing web-ui dependencies..."
	cd web-ui && npm audit

audit-dubber:
	@echo "Auditing dubber dependencies..."
	cd dubber && npm audit

audit-downloader:
	@echo "Auditing downloader dependencies..."
	cd downloader && .venv/bin/pip-audit

audit-muxer:
	@echo "Auditing muxer dependencies..."
	cd muxer && .venv/bin/pip-audit

# =============================================================================
# Formatting
# =============================================================================

format: format-gateway format-web-ui format-dubber format-downloader format-muxer
	@echo "All code formatted"

format-gateway:
	@echo "Formatting gateway..."
	cd gateway && npm run format

format-web-ui:
	@echo "Formatting web-ui..."
	cd web-ui && npm run format

format-dubber:
	@echo "Formatting dubber..."
	cd dubber && npm run format

format-downloader:
	@echo "Formatting downloader..."
	cd downloader && .venv/bin/ruff format src/

format-muxer:
	@echo "Formatting muxer..."
	cd muxer && .venv/bin/ruff format src/

# Format check (CI-friendly, no changes)
format-check: format-check-gateway format-check-web-ui format-check-dubber format-check-downloader format-check-muxer
	@echo "All format checks passed"

format-check-gateway:
	@echo "Checking gateway formatting..."
	cd gateway && npm run format:check

format-check-web-ui:
	@echo "Checking web-ui formatting..."
	cd web-ui && npm run format:check

format-check-dubber:
	@echo "Checking dubber formatting..."
	cd dubber && npm run format:check

format-check-downloader:
	@echo "Checking downloader formatting..."
	cd downloader && .venv/bin/ruff format --check src/

format-check-muxer:
	@echo "Checking muxer formatting..."
	cd muxer && .venv/bin/ruff format --check src/

# Maintenance
clean:
	docker-compose down -v --remove-orphans
	docker-compose -f docker-compose.test.yml down -v --remove-orphans

prune:
	docker system prune -f
	docker volume prune -f

# Shell access
shell-gw:
	docker-compose exec gateway sh

shell-redis:
	docker-compose exec redis redis-cli -a $${REDIS_PASSWORD:-changeme}

# Full redeploy (down, install, build, up)
redeploy: down install build up
	@echo "Full redeploy complete"

# Production
prod-up:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

prod-down:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

# Database
db-migrate:
	docker-compose exec gateway npm run migrate

db-seed:
	docker-compose exec gateway npm run seed
