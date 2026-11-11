# Security

## Authentication and sessions
* Passwords: Argon2id (`argon2-cffi`); minimum 10 characters with an upper-case letter and a digit.
* Access tokens: JWT HS256, 20 minutes, bound to a server-side session row. Logout or password
  change revokes sessions immediately (the token is checked against the session on every request).
* Refresh tokens: random 48-byte values stored only as SHA-256 hashes, single use (rotated).
* Lockout: 5 failed logins lock the account for 15 minutes. Rate limits: 10/min per IP on
  login/register/password-change, 300/min on the rest (Redis when configured, else in-process).
* Roles: `viewer` (read), `trader` (act on own accounts), `admin` (users, logs, global stop).
  The first registered user is admin; set `ATP_ALLOW_REGISTRATION=false` afterwards.
* Account isolation: every account-scoped route resolves the account through `owned_account`,
  which returns 404 for other users' ids.

## Secrets
* Broker API keys and the bridge secret are encrypted with Fernet (`ATP_CREDENTIALS_KEY`) before
  storage and decrypted only in memory while an adapter exists. They are never returned by the API
  and never stored on the device.
* Broker *passwords* are never handled: MT5 logs in inside the terminal on the Windows machine.
* The mobile app stores only its refresh token, in the iOS Keychain (`expo-secure-store`).
* In `prod` the backend refuses to start with the default signing key or without a credentials key.
* `.env` files are git-ignored; `.env.example` contains no values.
* Losing `ATP_CREDENTIALS_KEY` makes stored broker credentials unrecoverable (re-enter them).
  Back it up separately from the database.

## Transport
* The backend speaks plain HTTP on 127.0.0.1; terminate TLS in a reverse proxy (Caddy, nginx).
* The MT5 bridge authenticates every request with HMAC-SHA256 over timestamp, nonce, method, path
  and body hash; ±30 s clock window; nonces are single-use. Run it on a private network
  (WireGuard / Tailscale). HMAC authenticates but does not encrypt.

## Paper / live separation
* Database: `orders`, `positions`, `trades` carry `(account_id, mode)` with a composite foreign key
  to `accounts(id, mode)`; a check constraint forbids a paper account from holding a broker
  connection or being live-enabled. Mixing modes fails at the database, not just in code.
* Code: `TradingService` refuses to start when the adapter's mode differs from the account's.
* UI: a permanent banner shows `PAPER TRADING — SIMULATED` or red `LIVE TRADING — REAL MONEY`.
  The app always selects a paper account by default.

## Order-path controls
* The risk engine is evaluated on every order in every mode and cannot be bypassed by a strategy
  or by the AI layer (which has no access to the order path at all).
* Client order ids are unique per account in the database; duplicates are refused there and at
  the bridge (journal on disk plus the MT5 order comment).
* Kill switch per account, emergency stop per user, global stop for admins. Closing positions is
  attempted and reported, never assumed.

## Audit
`system_logs` records authentication events, residency declarations, compliance attestations,
risk-setting changes, every signal rejection, order, fill, close, kill-switch use, live
arm/enable/disable and each startup (including how many live accounts were disarmed).

## Operations
* Backups: `docker compose run --rm backup` writes a `pg_dump` to `./backups`. Schedule it with
  cron and copy the files off the host; no schedule is installed for you.
* Keep the server clock synchronised (bridge signatures and candle timing depend on it).
* Not done: third-party penetration test, dependency audit pipeline, MFA, per-device session
  approval. Treat this as a single-operator system, not a multi-tenant service.
