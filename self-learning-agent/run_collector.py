"""Collect real pump.fun launches into labeled JSONL for run_replay.py.

    python run_collector.py --out data/launches.jsonl                      # PumpDev, keyless (5 live tokens)
    PUMPDEV_API_KEY=... python run_collector.py --max-live 25 --out ...    # PumpDev free key
    PUMPPORTAL_API_KEY=... python run_collector.py --feed pumpportal --max-live 50 \\
        --max-trade-messages 200000 --out ...                              # ~0.2 SOL at 0.01 SOL/10k
    SOLANA_RPC_URL=... python run_collector.py --trace-funding ...         # link wallets by funder

API keys and RPC URLs are read from the environment only, so they stay out of
shell history and process listings. Read-only: nothing here signs or sends a
transaction.
"""
import argparse
import asyncio
import os
import sys

from collector.collector import FEEDS, Collector, CollectorConfig
from collector.prices import SolPrice
from collector.tracker import TrackerConfig


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True, help="labeled JSONL (appended to); skips go to <out>.skipped")
    ap.add_argument("--feed", choices=sorted(FEEDS), default="pumpdev")
    ap.add_argument("--max-live", type=int, default=5, help="tokens tracked at once (keep within your plan)")
    ap.add_argument("--sample-rate", type=float, default=1.0)
    ap.add_argument("--max-trade-messages", type=int, help="stop taking new launches after this many trade msgs")
    ap.add_argument("--hours", type=float, help="stop taking new launches after this many hours")
    ap.add_argument("--observe-s", type=float, default=120.0, help="seconds after launch to take the snapshot")
    ap.add_argument("--horizon-min", type=float, default=60.0)
    ap.add_argument("--take-profit", type=float, default=0.60)
    ap.add_argument("--stop-loss", type=float, default=-0.30)
    ap.add_argument("--bundle-window-s", type=float, default=1.0)
    ap.add_argument("--no-guard-prefilter", action="store_true",
                    help="label guard-rejected launches too (costs more trade messages)")
    ap.add_argument("--trace-funding", action="store_true", help="needs SOLANA_RPC_URL")
    ap.add_argument("--sol-usd", type=float, help="fixed SOL/USD instead of fetching from CoinGecko")
    args = ap.parse_args()

    if args.feed == "pumpportal":
        key = os.environ.get("PUMPPORTAL_API_KEY")
        if not key:
            sys.exit("PumpPortal trade streams need PUMPPORTAL_API_KEY (and a funded linked wallet).")
    else:
        key = os.environ.get("PUMPDEV_API_KEY")

    tracer = None
    if args.trace_funding:
        rpc = os.environ.get("SOLANA_RPC_URL")
        if not rpc:
            sys.exit("--trace-funding needs SOLANA_RPC_URL")
        from collector.funding import FundingTracer
        tracer = FundingTracer(rpc)

    import websockets  # pip install websockets

    cfg = CollectorConfig(
        feed=args.feed, api_key=key, max_live=args.max_live, sample_rate=args.sample_rate,
        max_trade_messages=args.max_trade_messages,
        run_for_s=args.hours * 3600 if args.hours else None,
        prefilter_guard=not args.no_guard_prefilter,
        tracker=TrackerConfig(observe_s=args.observe_s, horizon_s=args.horizon_min * 60,
                              take_profit=args.take_profit, stop_loss=args.stop_loss,
                              bundle_window_s=args.bundle_window_s))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    col = Collector(cfg, args.out, SolPrice(fixed=args.sol_usd), tracer=tracer,
                    connect=lambda url: websockets.connect(url, open_timeout=20, ping_interval=20))
    try:
        asyncio.run(col.run())
    except KeyboardInterrupt:
        col.print_stats()


if __name__ == "__main__":
    main()
