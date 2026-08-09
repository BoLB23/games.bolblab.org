# Deploying `games.bolblab.org` with Google OIDC

The catalog, games, and API share one public HTTPS origin:

```text
https://games.bolblab.org
```

The API callback registered with Google and stored in the Kubernetes secret is
exactly:

```text
https://games.bolblab.org/api/v1/auth/callback
```

Do not register `games.int.bolblab.org`, an HTTP address, a trailing slash, or
any other callback. Google compares redirect URIs exactly.

## 1. DNS and TLS

This cluster uses ExternalDNS with a Cloudflare Tunnel and cert-manager. The
TLS ingress in this repository carries the matching Cloudflare Tunnel target
and the `bolblab-cf-issuer`; applying it creates the public DNS route and
requests the certificate. In Cloudflare, use end-to-end encryption
(Full/strict).

Create the TLS secret expected by the manifests before deploying OIDC:

```text
namespace: bolblab-games
secret:    games-bolblab-org-tls
hostname:  games.bolblab.org
```

`scripts/deploy --oidc` applies that ingress and waits up to five minutes for
cert-manager to create the secret. Confirm HTTPS is valid in a browser before
starting Google sign-in.

## 2. Google Cloud OAuth client

In the Google Cloud project that owns the app, complete the OAuth consent
screen, then create an OAuth client of type **Web application**. Add this as
its sole authorized redirect URI:

```text
https://games.bolblab.org/api/v1/auth/callback
```

No authorized JavaScript origin is needed for this implementation: the backend
performs the authorization-code exchange and the browser only receives the
platform's HTTP-only session cookie. Copy the generated client ID and client
secret; do not commit either one.

## 3. Create the Kubernetes secret

Run the interactive helper from a machine with the correct `kubectl` context:

```bash
scripts/create-google-oidc-secret --context <kubectl-context>
```

It prompts for the Google client ID, Google client secret, and the verified
Google address that should become the initial platform `overlord`. It generates
the OIDC transaction secret locally and applies the Kubernetes Secret without
creating a credentials file. If the development deployment's session secret is
already present, the helper retains it so sessions are not invalidated.

## 4. Build and publish matching OIDC images

The catalog’s auth mode is compiled into its static Vite bundle, so the web
image must be built with `VITE_AUTH_MODE=oidc`. Build and publish both API and
web images using one immutable tag:

```bash
TAG=<new-image-tag>
docker build -f docker/api.Dockerfile -t ghcr.io/bolb23/games.bolblab.org/api:$TAG .
docker build -f docker/web.Dockerfile --build-arg VITE_AUTH_MODE=oidc \
  -t ghcr.io/bolb23/games.bolblab.org/web:$TAG .
docker push ghcr.io/bolb23/games.bolblab.org/api:$TAG
docker push ghcr.io/bolb23/games.bolblab.org/web:$TAG
```

If the GHCR packages remain private, also configure the namespace's image-pull
secret before deployment.

## 5. Deploy and verify

```bash
scripts/deploy --context <kubectl-context> --oidc --tag "$TAG"
```

The deploy script rejects OIDC unless `games-bolblab-org-tls` exists. After the
rollout, verify `/api/v1/health`, then start a Google sign-in. A successful
login returns to `https://games.bolblab.org` and creates the first local user;
the configured verified email receives the `overlord` role.
