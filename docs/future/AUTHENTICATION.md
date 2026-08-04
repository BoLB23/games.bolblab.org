# Future authentication: standard OIDC

## Proposed implementation

Replace development selection with the Authorization Code flow handled by FastAPI: `GET /api/v1/auth/login` creates and stores state, nonce, PKCE verifier, then redirects to an OIDC provider; `GET /api/v1/auth/callback` validates state/nonce, exchanges the code server-side, maps claims, upserts `ExternalIdentity(issuer, subject)`, creates a local user on first login, and issues the platform session cookie. `POST /api/v1/auth/logout` clears local session and may initiate provider logout where supported.

Authelia is a candidate OIDC provider. Before implementing, a future session must verify Authelia's current official documentation and capabilities. Do not assume it brokers Google, Apple, or other upstream social identities. If those become mandatory, select an OIDC provider/identity broker that supports them; the game platform itself remains dependent only on standard OIDC behavior.

## Proposed data and authorization

Keep `issuer + subject` as the permanent link, never email. Map `email`, `name`/`preferred_username`, picture, and verified-email status deliberately. Map an agreed provider role/group claim to `User.is_admin`; disabled local users must be refused even after a valid provider login. Store transient state/nonce/PKCE server-side or in a signed, short-lived, HTTP-only transaction cookie.

## Security and tests

Production cookies require `Secure`, `HttpOnly`, `SameSite=Lax` (or a justified change), HTTPS, rotation policy for session secrets, callback allowlists, and no token logging. Test state replay, nonce/PKCE mismatch, callback failures, first login, account linking, claim/role mapping, disabled users, logout, and cookie behavior. No OIDC library is installed in this milestone.

## Non-goals

No password auth, public registration, social-provider integration, or direct browser token storage.
