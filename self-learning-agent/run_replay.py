"""Run the agent over recorded launches (see orb/replay.py for the JSONL format).

    python run_replay.py launches.jsonl --state orb.json --journal decisions.jsonl
"""
import argparse
import os

from orb.agent import OrbAgent
from orb.replay import replay


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--state", help="JSON file to load/save the agent's learned state")
    ap.add_argument("--journal", help="JSONL file to append every decision and outcome to")
    args = ap.parse_args()
    if args.state and os.path.exists(args.state):
        agent = OrbAgent.load(args.state, journal_path=args.journal)
    else:
        agent = OrbAgent(journal_path=args.journal)
    print(replay(agent, args.path))
    if args.state:
        agent.save(args.state)


if __name__ == "__main__":
    main()
