# Windows MT5 execution bridge

The official `MetaTrader5` Python package only works on Windows next to a running terminal, so
MT5 access lives in this small service. Flow: app → backend → **bridge** → MT5 terminal → broker.

**Status:** the bridge has only been run against a simulated `MetaTrader5` module. Its first run
against a real terminal is the test described here; expect to report small mismatches.

**Use a demo account first.** For residents of India, real-money forex/CFD trading through an
overseas broker is blocked by the platform (see `BROKERS.md`).

## Requirements
* Windows 10/11 or Windows Server (a VPS is fine), always on while trading.
* MetaTrader 5 terminal installed and logged in to your (demo) account.
* 64-bit Python 3.10–3.12 from python.org ("py launcher" ticked). Check on PyPI which Python
  versions the current `MetaTrader5` wheel supports before choosing.
* A private network path from the backend to this machine: Tailscale or WireGuard recommended.

## Install
1. Copy the `mt5-bridge` folder to the Windows machine, e.g. `C:\atp\mt5-bridge`.
2. In MT5: Tools → Options → Expert Advisors → tick **Allow algorithmic trading**. Leave the
   terminal running and logged in.
3. PowerShell:
   ```powershell
   cd C:\atp\mt5-bridge
   copy .env.example .env
   notepad .env        # set BRIDGE_SECRET (24+ random chars) and BRIDGE_HOST (your private IP)
   powershell -ExecutionPolicy Bypass -File .\run_bridge.ps1
   ```
   Generate a secret: `python -c "import secrets;print(secrets.token_urlsafe(36))"`.
   Leave `BRIDGE_MT5_LOGIN/PASSWORD` empty to use the account already logged in (recommended:
   the password then never leaves the terminal).
4. Windows Firewall: allow inbound TCP 8787 **only** on the private interface. Never forward this
   port from the internet; requests are authenticated but not encrypted.

## Connect the backend
In the app: Broker Connections → MT5 bridge → label, bridge URL (`http://<private-ip>:8787`),
shared secret → Save → **Test connection**.

Expected: status `ok`, account type `demo`, trade allowed. Typical failures:

| Message | Cause |
|---|---|
| `MT5 bridge unreachable` | Wrong URL, firewall, VPN down |
| `bridge error 401` | Secret mismatch, or clocks differ by more than 30 s |
| `MT5 terminal not available` | Terminal closed, or 32/64-bit mismatch |
| `terminal is not connected to the broker` | No internet / wrong server in the terminal |
| `unknown symbol … (check the symbol mapping)` | Broker uses suffixed names; set `symbol_map` |
| `trade_allowed: false` | Algorithmic trading disabled in the terminal or by the broker |

Then: sync contract specs (`sync-specs`), import history (Backtesting, or
`POST /api/v1/data/import/mt5`), and run research on real forex/gold data.

## Verifying order handling on the demo account (manual, once)
Do this deliberately, on demo, before trusting the adapter:
1. Place one minimum-size order through the platform; confirm it appears in the terminal with the
   platform's id in the Comment column and the right stop-loss / take-profit.
2. Repeat the same request (same client id): no second position may appear.
3. Restart the bridge and repeat again: still no second position.
4. Modify the stop from the platform; close the position from the platform.
5. Close the terminal and confirm the platform reports the broker as disconnected and halts.

## Running permanently
Use Task Scheduler ("At log on", run `run_bridge.ps1`, restart on failure) or NSSM to run it as a
service. MT5 needs an interactive desktop session, so on a VPS keep the user logged in.

## API surface
`GET /health`, `/account`, `/positions`, `/orders`, `/history/orders`, `/history/deals`,
`/quote/{symbol}`, `/symbols/{symbol}`, `/candles/{symbol}`; `POST /orders`,
`GET /orders/by-client-id/{id}`, `PATCH|DELETE /orders/{ticket}`, `PATCH /positions/{ticket}`,
`POST /positions/{ticket}/close`. Swap values are returned raw with the broker's `swap_mode`
rather than converted, because their unit depends on that mode.
