# Game client SDK: local use and release preparation

`@game-platform/game-client-sdk` is the only code dependency an independently
deployed game should take on from this repository. It exposes compiled
JavaScript and declarations from `dist/`; games must not import catalog code,
API internals, or SDK source files directly.

## Local sibling-repository workflow

With `game-lab` and a game checkout beside each other, add the SDK to the
game's `package.json` using a relative path that is valid from that game
repository. For example, when both repositories share a parent directory:

```json
{
  "dependencies": {
    "@game-platform/game-client-sdk": "file:../game-lab/packages/game-client-sdk"
  }
}
```

Install dependencies in the game repository, then build the SDK from this
repository before starting the game:

```bash
npm run build --workspace @game-platform/game-client-sdk
```

For active SDK development, keep this command running in a separate terminal:

```bash
npm run watch --workspace @game-platform/game-client-sdk
```

The `file:` dependency resolves the package's `dist/` entry points, so the
watcher refreshes its JavaScript and type declarations without copying SDK
source into the game. Restart the game dev server only if its bundler does not
notice a dependency update. Do not commit an absolute path, and do not use a
`file:` path if the sibling checkout is unavailable.

The platform session is browser-cookie based. For the local integration
environment, games should configure their SDK client with
`http://localhost:8001/api/v1` and access every local app through
`localhost`, rather than mixing it with `127.0.0.1`.

## Package verification

Before consuming an SDK change from another repository, run:

```bash
npm run build --workspace @game-platform/game-client-sdk
npm run typecheck --workspace @game-platform/game-client-sdk
npm run test --workspace @game-platform/game-client-sdk
npm pack --dry-run --workspace @game-platform/game-client-sdk
```

`prepack` builds `dist/` automatically when creating a package archive. The
dry run should list only the package metadata and built `dist/` files (plus any
files npm requires), never the catalog or API source.

## Future private-registry release

The package is intentionally `private` today and cannot be published. When a
private registry, ownership, and access policy have been selected, make a
separate, reviewed release change that:

1. selects the registry and package scope, then adds the appropriate scoped
   `publishConfig`;
2. changes `private` only as part of that approved release setup;
3. increments the version according to the SDK compatibility change;
4. runs the package verification commands above and publishes the resulting
   version through the chosen registry's authenticated CI/release workflow;
5. updates independent games from their local `file:` dependency to the exact
   released version.

Do not add registry credentials to this repository and do not publish from a
developer workstation as part of local integration work.
