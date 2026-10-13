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
python -m unittest -v                         # 10 tests
python run_sim.py --signal 2                  # synthetic market with learnable signal
python run_sim.py --signal 0                  # pure noise → should place 0 trades
python run_replay.py launches.jsonl --state orb.json --journal decisions.jsonl
```
Python 3.10+, standard library only.

## What the numbers do and don't mean
Simulator results (5,000–8,000 synthetic launches) show the loop works: it learns when there
is signal and stays out when there isn't. **They say nothing about real-market profitability**,
because the simulator's outcome rule is invented. The real test is to collect weeks of real
launches into the replay format, run `run_replay.py`, and check that P&L stays positive
after costs on data the model hasn't seen yet.

The defaults (1% swap fee per leg, $0.15 per tx) are placeholders. Set them to your venue's actual fees.
