# Game client SDK: published and local use

`@bolb23/game-client-sdk` is the only code dependency an independently
deployed game should take on from this repository. It exposes compiled
JavaScript and declarations from `dist/`; games must not import catalog code,
API internals, or SDK source files directly.

## Install a released version from another repository

The SDK is published to the GitHub Packages npm registry. GitHub requires npm
registry authentication even for public packages, so create a classic personal
access token with `read:packages` and expose it as `NODE_AUTH_TOKEN` locally or
in the consumer repository's CI secret store. Never commit the token.

In the consuming repository, add this scoped registry configuration to
`.npmrc`:

```ini
@bolb23:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Install an exact released version:

```bash
npm install @bolb23/game-client-sdk@0.1.0
```

Then import it normally:

```ts
import { createGamePlatformClient } from '@bolb23/game-client-sdk';

const platform = createGamePlatformClient({
  apiBaseUrl: 'https://games.example.com/api/v1',
});
```

The client sends browser requests with `credentials: 'include'`. The game
origin must therefore be allowed by the platform's CORS configuration and use
the same cookie-compatible deployment setup as the platform.

## Local sibling-repository workflow

For active SDK changes before release, a neighboring game checkout can use:

```json
{
  "dependencies": {
    "@bolb23/game-client-sdk": "file:../game-lab/packages/game-client-sdk"
  }
}
```

Build the SDK from this repository before starting the game:

```bash
npm run build --workspace @bolb23/game-client-sdk
```

For active SDK development, keep this command running in a separate terminal:

```bash
npm run watch --workspace @bolb23/game-client-sdk
```

The `file:` dependency resolves the package's `dist/` entry points, so the
watcher refreshes its JavaScript and declarations without copying SDK source.
Do not commit an absolute path or use this dependency when the sibling checkout
is unavailable. For local browser integration, configure the API as
`http://localhost:8001/api/v1` and use `localhost` consistently instead of
mixing it with `127.0.0.1`.

## Publishing a release

The `Publish game client SDK` workflow is triggered only by a pushed tag named
`sdk-v<package-version>` (for example, `sdk-v0.1.0`). It runs the SDK checks,
verifies the package archive, and publishes exactly that workspace with the
repository `GITHUB_TOKEN`; do not publish from a workstation.

Before pushing a release tag, increment the SDK version and run:

```bash
npm run lint --workspace @bolb23/game-client-sdk
npm run typecheck --workspace @bolb23/game-client-sdk
npm run test --workspace @bolb23/game-client-sdk
npm pack --dry-run --workspace @bolb23/game-client-sdk
```

After the first successful release, open the package settings in GitHub and
change its visibility to **Public**. GitHub Packages starts newly published npm
packages as private, and making one public cannot be reversed.
