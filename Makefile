# Video Download Manager - Makefile

.PHONY: help build up down logs clean test dev install install-gateway install-web-ui install-dubber check-locks redeploy

# Default target
help:
	@echo "Video Download Manager - Available Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install      - Install all npm dependencies (required before first build)"
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
	@echo "Maintenance:"
	@echo "  make clean        - Remove all containers and volumes"
	@echo "  make prune        - Remove unused Docker resources"
	@echo "  make shell-gw     - Open shell in gateway container"
	@echo "  make shell-redis  - Open Redis CLI"

# =============================================================================
# Setup - Install dependencies (generates package-lock.json files)
# =============================================================================

install: install-gateway install-web-ui install-dubber
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
