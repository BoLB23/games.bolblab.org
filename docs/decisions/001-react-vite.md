# ADR 001: React with Vite for the catalog

## Context

The catalog needs routes, loading/error states, client-side authentication state, and incremental growth without server-side rendering.

## Decision

Use React, React Router, TanStack Query, TypeScript, and Vite.

## Consequences

The catalog has familiar component and query patterns with fast local development. Browser rendering remains entirely client-side.

## Alternatives considered

Vanilla DOM code would be less suitable for the catalog's growing UI state. Next.js adds SSR and framework surface that are not needed.
