# Phase 2 implementation plan: Authelia OIDC authentication

**Status:** planned, not implemented
**Prepared:** 2026-08-04
**Roadmap target:** [Phase 2](ROADMAP.md)
**Use this document as the starting point for the next implementation session.**

## Outcome

Replace the development-player picker with a standards-based, server-side OpenID
Connect Authorization Code flow against Authelia. The API, not browser JavaScript,
will own the OAuth client secret, authorization-code exchange, token validation, and
provider tokens. The browser will receive only a secure opaque platform-session
cookie.

Phase 2 is complete only when all of the following are true:

- `GET /api/v1/auth/login` begins an Authorization Code flow protected by state,
  nonce, PKCE S256, and (recommended) Pushed Authorization Requests (PAR).
- `GET /api/v1/auth/callback` validates the provider response and creates or finds
  a local account through the immutable `(issuer, subject)` identity link.
- The API issues and validates revocable, opaque local sessions; no OIDC token is
  returned to or persisted by browser JavaScript.
- Cookies are `Secure`, `HttpOnly`, host-only, `SameSite=Lax`, and HTTPS is
  mandatory for the production callback and application origin.
- The development picker is available only through an explicit local-development
  auth mode; production refuses to start without OIDC and secure-cookie settings.
- Automated tests cover the success path and every meaningful failure/replay path;
  an HTTPS deployment has passed the manual acceptance checklist below.

This remains a single-provider, private-catalog implementation. It does **not** add
password authentication, public sign-up, provider refresh-token storage, direct
browser tokens, Google/Apple/social brokering, or a generic multi-IdP account merge
UI. Authelia currently documents itself as an OIDC Provider, not an upstream OIDC
broker, so do not describe this phase as social login.

## Verified external constraints

These constraints were checked against Authelia's official documentation on
2026-08-04. Recheck them against the version being deployed before implementation:

- Discover endpoints from `${OIDC_ISSUER}/.well-known/openid-configuration`; do not
  hard-code `/api/oidc/*` paths. Authelia's documented discovery response supplies
  its authorization, token, UserInfo, JWKS, and PAR endpoints.
- Register an exact, case-sensitive callback URI. The provider rejects callback
  values absent from `redirect_uris`.
- Use a **confidential** client with `client_secret_basic`, `response_type=code`,
  `grant_type=authorization_code`, PKCE with `S256`, and a client-specific
  two-factor authorization policy.
- Request `openid profile email groups`. With Authelia's privacy-preserving defaults,
  profile/email/groups claims normally belong at UserInfo rather than in the ID
  token. Validate the ID token first, then call UserInfo and require the same `sub`.
- Identity linkage is only `iss` + `sub`. Email and `preferred_username` are mutable
  profile hints, never account keys.
- Authelia currently labels its OIDC Provider capability as open beta. Pin a tested
  Authelia release rather than tracking `latest`, and repeat the provider smoke tests
  after every Authelia upgrade.

Official references:

- [Authelia OIDC integration and discovery](https://www.authelia.com/integration/openid-connect/introduction/)
- [Authelia registered-client configuration](https://www.authelia.com/configuration/identity-providers/openid-connect/clients/)
- [Authelia claims and scopes](https://www.authelia.com/integration/openid-connect/openid-connect-1.0-claims/)
- [Authelia account-linking guidance](https://www.authelia.com/integration/openid-connect/frequently-asked-questions/)

## Baseline and design decisions

### What already exists

| Existing component | Current state | Phase 2 treatment |
| --- | --- | --- |
| `ExternalIdentity` | Unique `(issuer, subject)` link with a local-user FK | Retain as the durable identity anchor. Add repository/service operations around it. |
| `User` | Profile, active/admin flags, timestamps | Keep local authorization flags. Add `email_verified` and update provider-derived profile fields deliberately. |
| Signed UUID cookie | Seven-day stateless cookie; local logout only removes it in the browser | Replace with revocable opaque database sessions. |
| Development endpoints | `/auth/dev/users` and `/auth/dev/login` in development | Keep only behind `AUTH_MODE=development`; hide and do not seed development accounts in OIDC mode. |
| Browser/SDK API calls | Cookie credentials, `/auth/me`, protected routes | Keep this contract. Only the catalog login initiation changes. |
| Kubernetes deployment | HTTP, `APP_ENV=development`, insecure cookie | Treat as non-production. Do not enable OIDC until TLS and production settings are live. |

### Decisions this plan makes

1. **The API is the OIDC relying party.** The React catalog is not an OIDC public
   client. This keeps client credentials and tokens out of the browser.
2. **Use a confidential Authelia client plus PKCE S256.** PKCE remains valuable even
   for a confidential server-side client and is enforced by the provider.
3. **Use PAR when Authelia advertises it.** Register the client with
   `require_pushed_authorization_requests: true`; fail the login start safely if the
   PAR request fails. If the deployed Authelia version cannot support PAR, record an
   explicit security exception in an ADR before switching it off.
4. **Use short-lived server-side login transactions and opaque database sessions.**
   This gives single-use state, concurrent-tab support, server revocation, reliable
   local logout, and no reliance on a long-lived cookie-signing secret.
5. **Create accounts only from a missing `(issuer, sub)` link.** Do not attach an
   OIDC login to an existing user by email. The first successful OIDC login creates
   the user and its `ExternalIdentity` atomically; later logins resolve that link.
6. **Authelia groups are the source of administrative access.** `is_admin` is true
   only when the validated UserInfo `groups` array contains the configured admin
   group, and is recalculated on every successful login. Missing/invalid groups are
   fail-closed (not admin).
7. **Logout is local in this milestone.** Revoke the platform session and clear its
   cookie. Do not attempt RP-initiated provider logout without a verified Authelia
   end-session capability, return-URI registration, and product decision; a later
   login may therefore reuse the user's Authelia session.

### Inputs to confirm before code is merged

The next implementation session should obtain these concrete values first. No
application code should guess them.

| Input | Recommended value / rule | Owner or source |
| --- | --- | --- |
| Canonical catalog URL | `https://<catalog-host>`; must be public to the user's browser | Platform owner |
| Authelia issuer | `https://<auth-host>`; exact URL from Authelia's `issuer`/discovery metadata | Authelia owner |
| Callback | `https://<catalog-host>/api/v1/auth/callback`; single exact registered URI | Both configurations |
| Client ID | Stable random/meaningful identifier, e.g. `lantern-library` | Authelia owner |
| Client secret | 64 random characters; plaintext only in platform secret store, hashed in Authelia config | Secret owner |
| Admin group | A dedicated group such as `lantern-library-admins`, not a broad household/admin group | Product owner |
| Allowed population | An Authelia authorization policy that permits only the intended users/groups | Product owner |
| Session duration | Start with an 8-hour absolute local session; choose a documented shorter/longer value only for the actual device-risk profile | Product owner |
| Local workflow | Keep the picker only for `APP_ENV=development` plus `AUTH_MODE=development`; use OIDC integration testing separately | Development owner |

## Target architecture and flow

```mermaid
sequenceDiagram
  participant B as Browser
  participant C as Catalog SPA
  participant A as FastAPI API
  participant D as Platform DB
  participant O as Authelia OIDC

  B->>C: Visit protected route
  C->>A: GET /auth/me (cookie credentials)
  A-->>C: 401
  C-->>B: Top-level redirect to /auth/login?next=/requested/path
  B->>A: GET /auth/login
  A->>D: Store state digest, nonce digest, encrypted verifier, safe next path, expiry
  A->>O: POST PAR (confidential client, state, nonce, PKCE S256)
  O-->>A: request_uri
  A-->>B: 303 to authorization endpoint
  B->>O: Authenticate and consent
  O-->>B: Redirect with code + state
  B->>A: GET /auth/callback
  A->>D: Atomically consume transaction once
  A->>O: Exchange code + verifier at token endpoint
  O-->>A: ID token + access token
  A->>A: Validate signature/JWKS, issuer, audience, azp, expiry, nonce
  A->>O: UserInfo with access token
  O-->>A: Profile and groups
  A->>A: Require UserInfo sub == validated ID-token sub
  A->>D: Find/create ExternalIdentity + User; update profile/admin; create session
  A-->>B: Set opaque HttpOnly cookie; 303 to safe catalog path
```

The browser never sees the token response. Tokens exist only in the callback
request's memory long enough to validate the ID token and fetch UserInfo, then are
discarded. Do not log tokens, authorization codes, state, nonce, PKCE verifier,
`Set-Cookie`, or a full callback query string.

## Detailed implementation sequence

### 0. Preflight the provider and HTTPS environment

1. Identify the deployed Authelia version and its configuration owner. Confirm the
   OIDC Provider feature is enabled and has durable Authelia storage, a 64+ character
   OIDC HMAC secret, and a signing JWKS with an RSA `RS256` signing key.
2. From a browser network that will use the catalog and from the API pod/network,
   retrieve the discovery document. Verify HTTPS certificate trust, exact `issuer`,
   `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, and
   `pushed_authorization_request_endpoint`.
3. Make TLS mandatory for both `<catalog-host>` and `<auth-host>`. Current
   `games.int.bolblab.org` HTTP operation, `APP_ENV=development`, and
   `SESSION_COOKIE_SECURE=false` are incompatible with this phase's production
   outcome. Provision/verify the ingress TLS secret before deployment.
4. Decide whether the public catalog remains at the current same host with API under
   `/api`. The recommended callback is therefore
   `https://<catalog-host>/api/v1/auth/callback`, never an internal service DNS name
   or pod URL.
5. Create an Authelia client with the exact completed configuration below. Generate
   secrets out of band; never place plaintext secrets in Git, shell history, test
   fixtures, logs, or an `Authelia` YAML committed to this repository.

**Authelia configuration shape (values are placeholders, not deployable secrets):**

```yaml
identity_providers:
  oidc:
    # The provider-level hmac_secret and RS256 JWKS are configured separately
    # from a secret-backed file according to Authelia documentation.
    enforce_pkce: always
    require_pushed_authorization_requests: true
    clients:
      - client_id: lantern-library
        client_name: Lantern Library
        client_secret: <Authelia-hash-of-platform-client-secret>
        public: false
        authorization_policy: two_factor
        require_pushed_authorization_requests: true
        require_pkce: true
        pkce_challenge_method: S256
        redirect_uris:
          - https://<catalog-host>/api/v1/auth/callback
        scopes: [openid, profile, email, groups]
        response_types: [code]
        grant_types: [authorization_code]
        token_endpoint_auth_method: client_secret_basic
```

Also configure an Authelia authorization policy that denies users outside the
intended audience. Platform-side `is_admin` mapping is defense in depth, not an
Authelia access-control replacement.

### 1. Add explicit settings and fail-closed mode selection

Update [`apps/api/app/core/config.py`](../apps/api/app/core/config.py) and
[`.env.example`](../.env.example).

1. Add `AUTH_MODE: Literal["development", "oidc"]`, defaulting to `development`
   only when `APP_ENV=development`.
2. Add OIDC settings, parsed as URLs/secrets rather than unconstrained strings:
   `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
   `OIDC_CALLBACK_URL`, `OIDC_ADMIN_GROUP`, `OIDC_TRANSACTION_ENCRYPTION_KEYS`,
   `OIDC_TRANSACTION_TTL_SECONDS`, `OIDC_DISCOVERY_CACHE_SECONDS`, and
   `SESSION_TTL_SECONDS`.
3. Use a comma-separated key ring only for the short-lived transaction encryption
   key: the first key encrypts new records and current+previous keys may decrypt
   transactions during a planned rotation window. Generate Fernet-compatible keys
   through a documented operator command; remove an old key after twice the
   transaction TTL.
4. In `APP_ENV=production`, validation must require `AUTH_MODE=oidc`, HTTPS issuer
   and callback URLs, all OIDC credentials/keys, an HTTPS catalog origin,
   `SESSION_COOKIE_SECURE=true`, a cookie name beginning `__Host-`, and no cookie
   domain. Fail process startup for any violation.
5. In non-production OIDC mode, require the same secrets and callback registration
   but permit explicitly configured `http://localhost` only for a private local
   integration environment. Never let a production configuration fall back to the
   picker.
6. Derive/validate the callback rather than trusting the inbound `Host` header.
   `OIDC_CALLBACK_URL` must equal the registered public callback exactly; reject
   query/fragment additions and use that value at PAR/token exchange time.
7. Keep `CATALOG_ORIGIN` as the post-callback redirect origin. Validate it as a
   single origin; it must be HTTPS in production.

### 2. Replace the stateless cookie with database-backed auth records

Create new SQLAlchemy models in a focused module such as
`apps/api/app/models/auth.py`, export them from `models/__init__.py`, and create an
Alembic revision after `20260802_01`. Use portable SQLAlchemy types so Phase 3 can
validate PostgreSQL without rewriting the schema.

#### `auth_login_transactions`

Purpose: one row per started OIDC login, valid for at most 10 minutes.

| Column | Rule |
| --- | --- |
| `id` | UUID primary key |
| `state_digest` | SHA-256 hex of a high-entropy state; unique indexed; never store raw state |
| `nonce_digest` | SHA-256 hex of nonce for ID-token validation |
| `encrypted_code_verifier` | Fernet-encrypted random verifier; decrypt only immediately before the token request |
| `return_path` | Validated relative catalog path/query, maximum bounded length |
| `created_at`, `expires_at` | UTC; expiry is `created_at + transaction TTL` |
| `consumed_at` | UTC set through an atomic conditional update; a consumed/expired transaction is invalid forever |

Generate state, nonce, and verifier using `secrets`; use base64url-safe values with
the PKCE verifier within RFC 7636's permitted length. Calculate `code_challenge`
with SHA-256 and base64url encoding without padding. Clean expired/consumed
transactions with a small CLI command and opportunistically on login; do not retain
them as an audit log.

#### `user_sessions`

Purpose: platform session revocation without storing OAuth tokens.

| Column | Rule |
| --- | --- |
| `id` | UUID primary key for operator/audit reference |
| `token_digest` | SHA-256 hex of a random 256-bit-or-greater browser token; unique indexed; never store raw token |
| `user_id` | FK to `users`, indexed, cascade delete |
| `created_at`, `expires_at`, `last_seen_at` | UTC timestamps; initially an absolute configurable 8-hour lifetime |
| `revoked_at` | Null until logout/administrative revocation |

Cookie values contain only the random session token. On every protected request,
hash it, resolve an unexpired/non-revoked session and active local user, and update
`last_seen_at` at a throttled interval (for example once per 15 minutes). Delete or
revoke the session at local logout. A disabled local user must fail authentication
even with an otherwise valid session.

This intentionally removes `SESSION_SECRET` as a persistent session-signing key.
The remaining short-lived transaction encryption key has the rotation procedure
described above; a current+previous key ring prevents a rotation from breaking an
in-flight login. Existing signed development cookies become invalid when the old
session reader is removed, which is acceptable and must be stated in release notes.

#### User and identity changes

1. Add nullable `User.email_verified` (`bool | None`) so `None` means the provider
   did not supply a verification status. Do not expose it in the public user API
   unless a product view needs it.
2. Keep `ExternalIdentity(issuer, subject)` exactly as the only identity key. Its
   existing uniqueness constraint is the race-safety backstop.
3. Preserve `email_at_login`; update it on success with the claim value (if present).
   Optionally add `profile_updated_at` only if it has a clear operational use; do not
   persist raw ID-token/UserInfo JSON by default.
4. Do not migrate or delete existing `urn:game-platform:development` identities
   automatically. They cannot authenticate in OIDC mode. Change seeding so those
   records are created only for explicit development auth, and provide a read-only
   audit command/count before any later manual cleanup.

### 3. Implement the OIDC/auth service layer

Add a focused implementation such as:

```text
apps/api/app/auth/
  oidc.py              # discovery/PAR/token/UserInfo/JWKS validation boundary
  transactions.py      # state, nonce, PKCE, encryption, one-use transaction storage
  sessions.py          # opaque session create/read/revoke and cookie helpers
  service.py           # profile mapping, identity resolution, first-login transaction
  development.py       # retained only for AUTH_MODE=development
```

Retire or redefine `app/auth/provider.py`; its current UUID-only `resolve_user`
protocol is not a meaningful OIDC boundary and should not be stretched to represent
string OIDC subjects or token validation.

Add runtime dependencies in [`apps/api/pyproject.toml`](../apps/api/pyproject.toml):

- `authlib` for protocol/JWT/JWK primitives;
- `httpx` as a runtime dependency for PAR, discovery, token, UserInfo, and JWKS
  HTTP calls with explicit connect/read timeouts;
- `cryptography` for transaction-record encryption.

Pin compatible major ranges after checking the current versions and APIs. Do not
implement JWT verification by manually base64-decoding a token.

#### OIDC client responsibilities

1. Retrieve discovery metadata from the configured issuer. Require the discovered
   `issuer` to exactly equal `OIDC_ISSUER`; require HTTPS endpoints in production.
   Cache metadata/JWKS with bounded TTL and honor an unknown `kid` by refreshing the
   JWKS once, not by accepting an unverified token.
2. Require discovery to advertise PAR, authorization, token, UserInfo, and JWKS
   endpoints. If PAR is required locally but missing remotely, mark login unavailable
   (503/generic login error) and log only a safe diagnostic.
3. Use a bounded timeout, no automatic redirect to a different host, and no token
   logging on every outbound request. Provider reachability belongs in a rollout
   preflight, not in `/health`; existing sessions should keep working during a
   temporary provider outage.
4. Parse only JSON responses with expected content types/shapes. Treat provider
   errors as authentication failure, discard the transaction, and redirect the user
   to a generic catalog login error. Log a stable error code/correlation ID, not the
   provider's detail or credentials.
5. Set `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on login and
   callback responses so authorization parameters are not cached or passed onward in
   a referrer header.

#### Login initiation: `GET /api/v1/auth/login`

1. Accept optional `next`; accept only a local path beginning with one `/`, reject
   `//`, backslashes, control characters, absolute URLs, and overlong values. Default
   to `/`. Store the normalized result only in the transaction row.
2. If `AUTH_MODE=development`, either retain the picker page separately or return
   404 from this endpoint and have the dev UI use its development-only route. In
   `AUTH_MODE=oidc`, create one transaction row.
3. POST the authorization request parameters to PAR with HTTP Basic client
   authentication: `client_id`, exact `redirect_uri`, `response_type=code`, scopes
   `openid profile email groups`, `state`, `nonce`, `code_challenge`, and
   `code_challenge_method=S256`.
4. Redirect with 303 to the discovered authorization endpoint using only the
   returned `request_uri` and required client identifier. Never place a client secret
   in a redirect or browser-visible query.

#### Callback: `GET /api/v1/auth/callback`

1. If the provider returned `error`, or code/state is absent/malformed, consume a
   valid matching transaction if possible and 303 to `${CATALOG_ORIGIN}/login` with
   a generic stable error code. Do not surface `error_description`.
2. Hash the returned state; atomically transition exactly one unexpired transaction
   from unconsumed to consumed. A replay, missing state, expired transaction, or
   decrypt failure follows the same generic failure route. Consume before the token
   request so a code cannot be exchanged twice.
3. Exchange the code at the discovered token endpoint using client basic auth, exact
   callback URI, and the decrypted verifier. Require an ID token and an access token;
   reject refresh tokens rather than persisting them (ignore/discard an unsolicited
   one).
4. Validate the ID-token signature using discovery/JWKS and an allowlisted signing
   algorithm. Validate `iss`, `aud` (the client ID), `azp` when applicable, `exp`,
   `iat` with a small documented clock skew, `nonce` by digest comparison, and a
   nonempty string `sub`. Never trust an ID-token payload before signature validation.
5. Call UserInfo with the ephemeral access token. Require a successful response and
   require UserInfo `sub` to equal the validated ID-token `sub`. Normalize only the
   expected standard claims and require `groups` to be a string array if present;
   otherwise use an empty group set.
6. In a database transaction, lookup `ExternalIdentity` by the exact validated
   issuer and subject. If found, load the user. If absent, create a new active user
   and identity together. If a concurrent first login hits the unique constraint,
   roll back/re-read the identity rather than creating a second user.
7. For a resolved active user, update `display_name`, `email`, `email_verified`,
   `avatar_url`, local/identity `last_login_at`, and `is_admin` from the configured
   group. Use bounded validation/truncation and safe fallback display name; a malformed
   optional profile attribute must not corrupt the local row. Never use email to find
   a user or make an authorization decision.
8. If the resolved local user is disabled, create no session and return the generic
   access-denied login route. Disabled status wins over valid provider credentials.
9. Create one opaque local session, set the cookie, and 303 to the stored safe
   catalog path. Make first-login profile/identity/session creation transactional so
   no partially linked account is left after a failure.

#### Local session and logout

1. Replace [`apps/api/app/auth/session.py`](../apps/api/app/auth/session.py) with
   opaque session-token helpers; update
   [`apps/api/app/api/dependencies.py`](../apps/api/app/api/dependencies.py) to load
   a `UserSession` then an active `User`.
2. Set `__Host-game_platform_session` in production with `Secure`, `HttpOnly`,
   `SameSite=Lax`, `Path=/`, no `Domain`, `Max-Age`, and an explicit expiry. The
   `__Host-` prefix requires this host-only secure shape and prevents a subdomain from
   setting a competing cookie.
3. Preserve `POST /api/v1/auth/logout` as a 204 response. Revoke the current local
   session if present, then delete the cookie using the same name/path/security
   attributes. Make it idempotent. Add an Origin/Referer same-origin check for this
   cookie-authenticated state-changing endpoint.
4. The API still returns 401 from `/auth/me` for missing/revoked/expired/disabled
   sessions. Keep protected catalog and SDK APIs unchanged.

### 4. Update routes, seeding, and the catalog UX

#### API routes and seed behavior

1. In [`apps/api/app/api/routes/auth.py`](../apps/api/app/api/routes/auth.py), add
   `GET /login` and `GET /callback`; retain `/me` and `/logout`.
2. Gate `/dev/users` and `/dev/login` on **both** development app environment and
   `AUTH_MODE=development`. Return 404 otherwise. Avoid registering them at all in a
   production OIDC app if that is simpler and covered by tests.
3. Update [`apps/api/app/services/seed.py`](../apps/api/app/services/seed.py) and
   CLI callers so games always seed but development users/identities seed only in
   explicit development auth mode. Change tests that currently assume exactly two
   users accordingly.
4. Keep CORS credentialed origins narrowly allowlisted. In the deployed same-host
   topology the browser should not need CORS for catalog/API, but local development
   still does. Do not use `*` with credentials.

#### Catalog application

1. Replace the picker implementation in
   [`apps/catalog-web/src/pages.tsx`](../apps/catalog-web/src/pages.tsx): the OIDC
   login page should say "Sign in" and perform a top-level browser navigation to
   `${apiBaseUrl}/auth/login?next=<encoded current relative route>`. It must not use
   `fetch` for this navigation.
2. Preserve the development picker only when an explicit `VITE_AUTH_MODE=development`
   build/development setting is selected. The normal OIDC build must not request
   `/auth/dev/users` or expose selectable identities.
3. Remove/deprecate `getDevelopmentUsers` and `devLogin` from
   [`apps/catalog-web/src/api.ts`](../apps/catalog-web/src/api.ts) for OIDC builds;
   retain `logout` and `/auth/me` use in `auth.tsx`.
4. Keep `RequireAuth` behavior: a 401 navigates to `/login`. The login page derives
   a safe relative target from React location, while the API independently validates
   it. Do not rely on React `location.state`, which is lost across the provider
   redirect.
5. Update catalog tests, user-facing copy, README screenshots/instructions, and the
   sample game's unauthenticated message from "choose a player" to "sign in through
   the catalog". The SDK needs no API or token changes.

### 5. Configure production deployment and secret handling

1. Update [`k8s/secret.example.yaml`](../k8s/secret.example.yaml) to document names
   only (for example `OIDC_CLIENT_SECRET` and `OIDC_TRANSACTION_ENCRYPTION_KEYS`),
   with unambiguously fake placeholder values. Add these secret references to both
   the migration/seed init container and API container in
   [`k8s/deployment-api.yaml`](../k8s/deployment-api.yaml).
2. Set `APP_ENV=production`, `AUTH_MODE=oidc`, `SESSION_COOKIE_SECURE=true`, exact
   HTTPS `CATALOG_ORIGIN`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and
   `OIDC_CALLBACK_URL` in the API deployment. The public non-secret values may be
   config values; keep client and encryption secrets in Kubernetes Secrets or the
   cluster's secret manager.
3. Require the TLS ingress configuration and certificate before applying the
   production deployment. Do not retain a script path that silently deploys the OIDC
   API over HTTP. Update `scripts/deploy`/README checks so missing TLS is a hard
   failure for `AUTH_MODE=oidc`.
4. Confirm ingress preserves the callback query string and does not cache `/api` or
   redirect the callback into a static SPA route. Confirm reverse-proxy headers are
   trusted/configured only from the ingress if they are introduced; application URLs
   should still use explicit configured public URLs.
5. Ensure the API pod can reach the Authelia issuer/JWKS endpoints and trusts its
   certificate chain. Network-policy/firewall changes belong to the deployment
   owner; test from the running pod, not only a laptop.
6. Do not put Authelia forward-auth in front of this API in Phase 2. That would
   create a competing browser-session system and turn intended API 401 responses
   into proxy redirects. The platform remains the OIDC relying party and authorizes
   its own local session.
7. Enable HSTS only after confirming it is safe for the relevant subdomain policy;
   the immediate prerequisite remains a valid HTTPS redirect and certificate.
8. Do not combine PostgreSQL migration/backup work with this phase. The Phase 3
   database-validation plan follows after OIDC design agreement. SQLite remains
   acceptable for the single replica during this implementation, with tests written
   to be portable.

## Test plan

### Unit tests

Add direct tests for pure helpers and models:

- `next` normalization rejects open redirects and accepts intended local paths.
- State/nonce/verifier length, S256 challenge generation, encryption-key rotation,
  expiry calculation, and generic failure mapping.
- Session-token hashing, expiration/revocation behavior, cookie flags, and cookie
  deletion attributes.
- Claim normalization: full name/preferred username fallback, optional image/email,
  `email_verified` tri-state, groups string-array validation, bounds/truncation, and
  fail-closed admin mapping.
- User lookup always keys on exact issuer + subject; prove two users with the same
  email cannot be merged.

### API tests with a deterministic fake OIDC provider

Do not make normal CI dependent on a shared Authelia instance. Use a local fake
provider or `respx`/`httpx` transport fixtures that serve fixed discovery, PAR,
token, JWKS, and UserInfo responses signed by test keys. Cover at least:

| Scenario | Expected assertion |
| --- | --- |
| Login start | 303 to authorization endpoint; PAR used; state/nonce/verifier are not exposed in logs/cookies; transaction stored with digest/encrypted verifier. |
| Happy path | Valid code creates user + identity, creates opaque cookie, redirects to validated original path, and `/auth/me` succeeds. |
| Returning user | Same `iss`/`sub` reuses one user/identity and refreshes mapped mutable profile/admin fields. |
| First-login race | Concurrent/mocked uniqueness conflict results in one local user and one identity. |
| Account-link safety | Same email but different issuer/sub creates a separate account; never silently links. |
| State defenses | Missing, wrong, expired, consumed, and replayed state all fail and issue no session. |
| Token defenses | Token endpoint error; ID-token bad signature/unknown `kid` after refresh; wrong issuer/audience/azp; expired token; nonce mismatch; missing/non-string sub all fail. |
| UserInfo defenses | Failure, malformed groups, or subject mismatch fail and issue no session. |
| Authorization | Configured admin group grants admin; missing group revokes admin on next login; disabled user cannot get session despite valid tokens. |
| Session lifecycle | Cookie is secure/HTTP-only/Lax/host-only in production settings; revoked/expired session gives 401; logout revokes and clears; logout is idempotent. |
| Dev isolation | Dev routes/picker work only in development mode and are 404/unregistered in OIDC and production modes; production settings missing any prerequisite fail fast. |

Refactor [`apps/api/tests/conftest.py`](../apps/api/tests/conftest.py) so protected
route tests can create a local active user + opaque session directly instead of
depending on `/auth/dev/login`. Keep a small development-mode regression test.

### Browser and integration tests

1. Mocked catalog tests: unauthenticated route opens the OIDC login navigation;
   no dev users request occurs in OIDC mode; sign-out returns to the sign-in page.
2. Local HTTPS integration environment: run Authelia with a dedicated test client,
   test account, and test group. Exercise the complete browser redirect, first and
   returning login, path restoration, disabled account, group-driven admin change,
   local logout, and expired/replayed callback.
3. Smoke test the independent sample game after authenticating in the catalog: it
   must still resolve `/auth/me` via the SDK and never receive an OIDC token.
4. Run the root verification suite after implementation:

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

Record exact results and test counts in `docs/HANDOFF.md`; run the manual Kubernetes
checks below only after the automated suite is green.

## Rollout and acceptance checklist

### Staging/pre-production

- [ ] The deployed app starts with `APP_ENV=production` and `AUTH_MODE=oidc`; a
      missing OIDC setting or insecure cookie fails startup.
- [ ] Discovery metadata reports the exact configured issuer and HTTPS endpoints.
- [ ] The configured callback URI exactly matches the Authelia registered client.
- [ ] Provider has a durable signing key and the API can fetch JWKS/UserInfo.
- [ ] Browser login returns to the requested catalog route and `/auth/me` shows the
      correct local profile.
- [ ] A user in the configured group is an administrator; one outside it is not.
- [ ] A disabled local user cannot authenticate; re-enabling permits a fresh login.
- [ ] Browser developer tools show no OAuth access/ID/refresh token in localStorage,
      sessionStorage, query retained after callback, or API JSON.
- [ ] The session cookie is `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, with no
      Domain; plaintext HTTP cannot establish it.
- [ ] Local logout revokes the current platform session; another browser's session
      stays independent as designed.
- [ ] The sample game works after catalog login and gets a 401 after local logout.
- [ ] Pod logs and proxy logs are sampled to confirm secrets, codes, tokens, state,
      nonce, and session cookie values are redacted/absent.

### Production rollout

1. Back up the current SQLite PVC/database before changing code or seed behavior.
   This is a simple recovery precaution, not Phase 3 database validation.
2. Deploy the Authelia client and platform secrets first; validate discovery and
   callback reachability from the target namespace.
3. Deploy the API/catalog version with OIDC **to a staging hostname** and execute
   the acceptance checklist using non-production users.
4. Promote the production ingress/API/catalog configuration together. Existing
   signed development cookies will be rejected; plan a short sign-in interruption.
5. Keep the development picker code only for local mode, not as a production
   rollback mechanism. If a severe provider issue occurs, roll back the application
   and Authelia client/config together, then investigate; do not enable unauthenticated
   or development-user access on the production hostname.
6. Record issuer, callback, client-ID location (not secret), exact deployment
   revision, session TTL, admin group, test evidence, and rollback outcome in
   `docs/HANDOFF.md`.

## Documentation changes required with the code

- Update [`docs/future/AUTHENTICATION.md`](future/AUTHENTICATION.md) from proposal
  to the implemented flow and link this document for decisions/rationale.
- Add an ADR recording the selection of Authelia as OIDC Provider, confidential
  backend client, issuer+subject identity model, PAR/PKCE, opaque local sessions,
  admin-group policy, and local-only logout.
- Update [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) sequence/description and
  [`README.md`](../README.md) first-run/deployment instructions. Remove guidance to
  choose a development player for normal deployment.
- Mark the Phase 2 implementation checklist in
  [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) only after code and all
  verification steps pass. Update `ROADMAP.md` only when the roadmap's completion
  criteria are actually met.
- Update [`docs/HANDOFF.md`](HANDOFF.md) with commands, runtime URLs (non-secret),
  known OIDC version, test outcomes, deployment observations, and any explicit
  security exception such as unavailable PAR.

## Next-session execution order

1. Read this file, `docs/future/AUTHENTICATION.md`, `docs/ARCHITECTURE.md`, and
   `docs/HANDOFF.md`; inspect `git status` before editing.
2. Confirm the nine inputs in the decision table and capture any changed values in
   an ADR. Stop if HTTPS, issuer ownership, callback registration, or client secret
   authority is missing.
3. Verify the live Authelia discovery document and provider capabilities; adjust this
   plan only with an explicit documented reason.
4. Implement settings and database migration first; test it on a fresh SQLite DB.
5. Implement transaction/session repositories and helpers with unit tests.
6. Implement discovery/PAR/token/JWKS/UserInfo validation with a deterministic fake
   provider test suite before wiring the public routes.
7. Add route integration, identity provisioning, disabled/admin behavior, then
   replace catalog login UX and revise fixtures.
8. Update Kubernetes/secret/docs and run the automated root suite.
9. Deploy to HTTPS staging, perform the manual checklist, then update handoff and
   mark the roadmap/implementation plan complete only after production evidence.

## Completion evidence to hand to the following phase

Phase 3 should receive:

- The Alembic revision name and proof it upgrades a clean SQLite database.
- Automated test output covering the OIDC fake-provider suite and all root commands.
- The approved canonical issuer/callback/client-ID location, admin-group rule, cookie
  policy, transaction/session TTLs, and key rotation procedure (never plaintext
  secret values).
- A staging or production browser-test record demonstrating a first login, returning
  login, disabled account, admin mapping, session logout, and sample-game SDK call.
- Explicit confirmation that the only local identity key is `(issuer, subject)` and
  that no provider/browser tokens are stored.
