.PHONY: run test lint format typecheck check migrate eval backup clean

run:
	uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

test:
	pytest tests/ -v --cov=src

lint:
	ruff check src/ tests/ migrations/ scripts/ eval/

format:
	ruff format src/ tests/

typecheck:
	mypy src/

check: lint format test

migrate:
	alembic upgrade head

eval:
	python eval/run_eval.py

backup:
	COMPOSE_ARGS="" scripts/backup_db.sh

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +
