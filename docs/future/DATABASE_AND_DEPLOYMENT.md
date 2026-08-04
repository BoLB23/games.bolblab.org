# Future database and deployment

Change `DATABASE_URL` to a PostgreSQL URL using `psycopg` (recommended modern driver), run `uv run alembic upgrade head`, and run the API suite against SQLite and PostgreSQL in CI before deployment. Continue using portable SQLAlchemy types; account for SQLite's weaker typing, concurrency, locking, and UTC handling differences. Future PostgreSQL enhancements may include appropriate indexes, generated search data, or native UUID choices only after a portability decision.

Back up PostgreSQL with scheduled logical dumps plus tested restores; include migration revision, retention, encrypted storage, and recovery drills. Start with one API replica, one PostgreSQL database, `/health` liveness and `/ready` database readiness probes. Later Docker packaging, Kubernetes manifests, ingress routing, TLS, environment-provided secrets, and least-privilege database credentials belong here—not in the current repository.

Non-goals: Docker/Kubernetes assets, a managed-service recommendation, or production database creation in this milestone.
