# ADR 002: FastAPI with synchronous SQLAlchemy

## Context

Normal routes are database backed, traffic is very small, and understandable maintenance matters more than asynchronous throughput.

## Decision

Use FastAPI with normal `def` route handlers and SQLAlchemy 2.x synchronous sessions.

## Consequences

Database transaction flow is straightforward. A later WebSocket feature may use async handlers while keeping persistence explicitly coordinated.

## Alternatives considered

Async SQLAlchemy would add complexity without a present workload benefit. Django is outside the selected stack.
