"""One-time registration: ERC-8004 identity + competition."""
from integrations.twak import TWAKExecutor
from integrations.bnb_sdk import register_agent_identity
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


async def main():
    print("=" * 60)
    print("Arbiter — Agent Registration")
    print("=" * 60)

    print("\n[1/2] Registering ERC-8004 on-chain identity...")
    result = await register_agent_identity()
    if result:
        print(f"  ✓ Agent ID: {result.get('agentId')}")
        print(f"  ✓ TX: {result.get('transactionHash')}")
    else:
        print(
            "  ✗ Registration failed (may already be registered or bnbagent not installed)")

    print("\n[2/2] Checking TWAK wallet...")
    twak = TWAKExecutor()
    portfolio = await twak.get_portfolio()
    if portfolio:
        print(f"  ✓ Portfolio: {portfolio}")
    else:
        print("  ✗ TWAK not available (install: curl -fsSL https://agent-kit.trustwallet.com/install.sh | bash)")

    print("\n" + "=" * 60)
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
