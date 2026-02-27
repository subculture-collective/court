# Load environment values when .env exists
ifneq (,$(wildcard ./.env))
include .env
export
endif

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

NPM ?= npm
DOCKER_COMPOSE ?= docker compose

.PHONY: help install dev lint build test test-spec ci start migrate migrate-dist docker-up docker-down docker-restart clean status

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*##"; printf "\nImprov Court Make targets:\n\n"} /^[a-zA-Z0-9_.-]+:.*##/ { printf "  %-18s %s\n", $$1, $$2 } END { printf "\n" }' $(MAKEFILE_LIST)

install: ## Install Node dependencies
	$(NPM) install

dev: ## Start local dev server with watch mode
	$(NPM) run dev

lint: ## Run TypeScript type-check (no emit)
	$(NPM) run lint

build: ## Compile TypeScript to dist/
	$(NPM) run build

test: ## Run test suite
	$(NPM) test

test-spec: ## Run tests with spec reporter
	$(NPM) test -- --test-reporter=spec

ci: ## Run local CI parity checks (lint + build + test)
	$(MAKE) lint
	$(MAKE) build
	$(MAKE) test

start: ## Run compiled app from dist/
	$(NPM) run start

migrate: ## Run database migrations in source mode (tsx)
	$(NPM) run migrate

migrate-dist: ## Run database migrations in compiled mode
	$(NPM) run migrate:dist

docker-up: ## Start API + Postgres with docker compose
	$(NPM) run docker:up

docker-down: ## Stop docker compose services
	$(NPM) run docker:down

docker-restart: ## Restart docker compose stack
	$(MAKE) docker-down
	$(MAKE) docker-up

clean: ## Remove generated build artifacts
	rm -rf dist

status: ## Show concise git status
	git status --short
