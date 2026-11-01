# Orb — a self-learning launch classifier (paper trading only)

For every token launch, the agent estimates three probabilities: the price hits **+60% first**,
it hits **−30% first**, or **neither happens within 60 minutes**. It turns those into an expected
return *after* fees, price impact, and priority fees/tips. It trades on paper only when that
edge clears a threshold, then learns from the real outcome of **every** launch that passed
its risk checks, including the ones it skipped.

It holds no keys and sends no transactions.

```
snapshot ─► GUARD (hard risk rules) ─► model P(TP/SL/timeout) ─► EV − costs ─► trade | skip
                                                                                   │
outcome after 60 min ─► paper P&L (if traded) ─► model.learn() ◄───────────────────┘
```

| Module | Role |
|---|---|
| `orb/features.py` | Launch snapshot fields (organic buy share, connected wallets, sells, concentration, bundles, buyers, liquidity) |
| `orb/guard.py` | Rejects launches with concentrated holders, creator/bundle supply, or thin liquidity |
| `orb/model.py` | Online 3-class logistic regression with running standardization and decaying learning rate |
| `orb/costs.py` | Round-trip cost: swap fee ×2, constant-product impact ×2, fixed priority fee + tip ×2 |
| `orb/agent.py` | The loop, journal, persistence, and the **skill gate** |
| `orb/replay.py` | Feeds recorded real launches (JSONL) through the agent |
| `orb/sim.py` | Synthetic market used only to test the learning loop |

## Safety rails built into the loop
- **Skill gate:** the agent trades only while its recent log loss beats a "just know the base
  rates" baseline. On pure noise it makes **zero** trades (enforced by a test).
- **Warmup:** no trades until 300 resolved launches. After a restart from saved state, the
  model must prove its skill again before it may trade.
- **Learning from skips** prevents a feedback loop where the model only sees outcomes of its own picks.
- **`realized_return`** records the actual exit. Rugs gap far below −30%, and assuming −30%
  makes results look better than they were.

## Usage
```bash
python -m unittest -v                         # 27 tests
python run_sim.py --signal 2                  # synthetic market with learnable signal
python run_sim.py --signal 0                  # pure noise → should place 0 trades
python run_replay.py launches.jsonl --state orb.json --journal decisions.jsonl
```
Python 3.10+, standard library only.

## Collecting real launches (`collector/`, `run_collector.py`)

The collector streams pump.fun launches over one websocket and turns each tracked launch into one
JSONL line in the format `run_replay.py` reads. It holds no keys and sends no transactions.

```
create ─► observe 120 s (trades, buyers, sells, holders) ─► snapshot + GUARD
        ─► follow the price up to 60 min ─► take_profit | stop_loss | timeout ─► <out>
anything unusable (guard reject, connection gap, non-SOL quote, no price) ─► <out>.skipped, with the reason
```

```bash
pip install websockets
python run_collector.py --out data/launches.jsonl                         # PumpDev keyless: 5 tokens at once
PUMPDEV_API_KEY=... python run_collector.py --max-live 25 --out data/launches.jsonl
PUMPPORTAL_API_KEY=... python run_collector.py --feed pumpportal --max-live 50 \
    --max-trade-messages 200000 --out data/launches.jsonl
SOLANA_RPC_URL=... python run_collector.py --trace-funding --out data/launches.jsonl
python run_replay.py data/launches.jsonl --state orb.json
```

**Cost.** Launch events are free on both feeds; every buy/sell message on a tracked token is metered:
PumpPortal charges 0.01 SOL per 10,000 messages (needs an API key and a funded linked wallet); PumpDev
gives 10k/month keyless, 50k with a free key, and 1.5M on its $49/month plan (prices as published on
2026-11-01). The live smoke tests used about 35–155 messages per tracked token with a 3-minute horizon
(12 tokens, so a rough figure). A 60-minute horizon costs more per token. `--max-trade-messages`
stops new tracking at a budget; tokens already being tracked are allowed to finish.

**How labels are made.** The entry price is the curve price at decision time. The first trade at
≥ +60% labels `take_profit`, recorded as +0.60 (overshoot is not counted). The first trade at ≤ −30%
labels `stop_loss` with the *actual* return, so a rug to −90% is recorded as −90%. Neither within
the horizon labels `timeout`, with the return at the horizon. Trades that arrive while the snapshot
is being finished are used for labeling only, never for features.

**Known limits:**
- Neither feed sends a slot number or timestamp, so "same bundle" means *first buy within 1 s of the
  create message arriving*. It's a proxy based on arrival time.
- Holder shares are rebuilt from the trades seen. Token transfers between wallets are invisible to
  the collector.
- Without `--trace-funding`, `connected_wallet_share` falls back to the bundle proxy. Records say
  which method was used (`connected_method`); don't mix the two in one training run.
- Launches are tracked only when a slot is free, so busy hours are under-sampled.
- Any disconnect drops the tokens in flight rather than guessing their labels.
- PumpDev's curve reserves arrive in raw units and PumpPortal's in plain SOL/token units. The parser
  detects which one from the value's size; this is tested on real captured messages from both feeds.
  PumpPortal *trade* messages and PumpSwap (post-migration) prices are not yet confirmed against
  live data.
- `nonstandard_curve: true` marks launches whose curve held under 30 SOL. A few were seen live and
  the cause isn't known yet.

## What the numbers do and don't mean
Simulator results (5,000–8,000 synthetic launches) show the loop works: it learns when there
is signal and stays out when there isn't. **They say nothing about real-market profitability**,
because the simulator's outcome rule is invented. The real test is to collect weeks of real
launches into the replay format, run `run_replay.py`, and check that P&L stays positive
after costs on data the model hasn't seen yet.

The defaults (1% swap fee per leg, $0.15 per tx) are placeholders. Set them to your venue's actual fees.
