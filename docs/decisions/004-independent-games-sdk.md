# ADR 004: Independent games plus shared SDK

## Context

Games should retain their own builds and technology choices while using common identity/catalog contracts.

## Decision

Each game is its own browser application. A small TypeScript SDK supplies only typed API access and never imports React or Phaser.

## Consequences

Games can be integrated incrementally and deployed/verified independently. SDK compatibility becomes an explicit contract.

## Alternatives considered

Embedding games in catalog components couples their build and runtime. Per-game duplicate fetch code risks contract drift.
