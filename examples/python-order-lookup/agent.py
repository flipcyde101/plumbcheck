"""Look up a synthetic order using PlumbCheck's Python replay adapter."""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "adapters" / "python"))

from plumbcheck import ContractFailed, ReplayClient


def lookup_order(client, order_id):
    return client.call_tool("orders.lookup", {"orderId": order_id})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--order-id", default="ORD-1042")
    args = parser.parse_args()

    contract = ROOT / "examples" / "customer-support" / "agent-contract.json"
    try:
        with ReplayClient(contract, "Read-only order lookup") as client:
            order = lookup_order(client, args.order_id)
    except ContractFailed:
        print(f"Order lookup failed the replay contract for {args.order_id!r}.", file=sys.stderr)
        return 1

    print(f"Order {args.order_id} is {order['status']}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
