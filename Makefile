SHELL := /bin/bash

.PHONY: dev prod logs down test

dev:
	docker compose up -d --build

prod:
	docker compose -f docker-compose.prod.yml build
	docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
	docker compose -f docker-compose.prod.yml up -d

logs:
	docker compose logs -f

down:
	docker compose down

seed:
	docker compose exec api npm run seed