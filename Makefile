SHELL := /bin/bash

.PHONY: dev prod logs down test

dev:
	docker compose up -d --build

prod:
	docker compose -f docker-compose.prod.yml up -d --build

logs:
	docker compose logs -f

down:
	docker compose down

seed:
	docker compose exec api npm run seed