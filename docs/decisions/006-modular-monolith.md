# ADR 006: Modular monolith instead of microservices

## Context

The platform has one small team, a handful of users, and tightly related catalog/identity concerns.

## Decision

Ship one FastAPI application and one database with focused modules.

## Consequences

Development, migrations, testing, and deployment remain simple. A future real scaling need can drive a measured split.

## Alternatives considered

Microservices, queues, Redis, Celery, and Kubernetes add operating cost without current benefit.
