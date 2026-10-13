"""Run the agent against the synthetic market and print learning progress.

    python run_sim.py                     # hidden signal present
    python run_sim.py --signal 0          # pure noise: agent should not make money
    python run_sim.py --state orb.json    # persist / resume the learned model
"""
import argparse
import os

from orb.agent import OrbAgent
from orb.sim import SyntheticMarket


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--launches", type=int, default=5000)
    ap.add_argument("--signal", type=float, default=1.0)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--state", help="JSON file to load/save the agent's learned state")
    ap.add_argument("--journal", help="JSONL file to append every decision and outcome to")
    args = ap.parse_args()

    if args.state and os.path.exists(args.state):
        agent = OrbAgent.load(args.state, journal_path=args.journal)
    else:
        agent = OrbAgent(journal_path=args.journal)
    market = SyntheticMarket(seed=args.seed, signal=args.signal)

    # "Trade everything that passes GUARD" baseline, to show what the model adds.
    naive_pnl, naive_n = 0.0, 0
    for i in range(1, args.launches + 1):
        snap, (label, ret) = market.next_launch()
        d = agent.observe(snap)
        if d.action != "reject":
            naive_pnl += agent.cfg.size_usd * (ret - d.cost_fraction)
            naive_n += 1
        # In live use this would happen horizon_minutes later; the sim resolves at once.
        agent.resolve(snap.launch_id, label, realized_return=ret)
        if i % 1000 == 0 or i == args.launches:
            print(f"[{i}] {agent.report()}  naive: {naive_n} trades, ${naive_pnl:,.2f}")

    if args.state:
        agent.save(args.state)
    print("\nSYNTHETIC DATA - these numbers test the learning loop, not market profitability.")


if __name__ == "__main__":
    main()
