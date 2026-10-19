.PHONY: test api-test web-test web-typecheck web-build compose-up compose-down

test: api-test web-test web-typecheck web-build

api-test:
	cd services/api && python -m pytest

web-test:
	cd apps/web && npm test -- --run

web-typecheck:
	cd apps/web && npm run typecheck

web-build:
	cd apps/web && npm run build

compose-up:
	docker compose up --build

compose-down:
	docker compose down
