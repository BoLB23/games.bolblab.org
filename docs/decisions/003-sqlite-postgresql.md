# ADR 003: SQLite locally, PostgreSQL when deployed

## Context

The initial private platform needs almost no operational setup but must migrate cleanly to a deployment database.

## Decision

Use SQLite in local development and portable SQLAlchemy types/schema constructs; validate PostgreSQL before deployment.

## Consequences

Local setup is small. PostgreSQL-specific features are intentionally deferred and behavior differences must be tested later.

## Alternatives considered

PostgreSQL-only local development requires more setup. Dialect-specific schema features would weaken portability.
