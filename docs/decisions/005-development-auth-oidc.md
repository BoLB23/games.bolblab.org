# ADR 005: Development authentication now, OIDC later

## Context

The catalog must be private for local development, but no production identity provider is selected for implementation.

## Decision

Seed selectable local users and issue signed HTTP-only development cookies only when `APP_ENV=development`; retain an auth-provider boundary for later standard OIDC.

## Consequences

Development is simple and intentionally non-production-ready. Passwords and browser-stored tokens are not introduced.

## Alternatives considered

Password auth creates a credential system to retire. Premature OIDC installation would add untested provider assumptions.
