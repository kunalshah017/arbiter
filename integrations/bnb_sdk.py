"""BNB Agent SDK integration for ERC-8004 registration."""
import os
import structlog

from integrations.wallet_manager import WalletManager

logger = structlog.get_logger()


async def register_agent_identity(wallet_manager: WalletManager | None = None):
    """Register agent on-chain via ERC-8004. Idempotent.

    Uses WalletManager for secure credential isolation.
    """
    try:
        from bnbagent import ERC8004Agent, AgentEndpoint

        if wallet_manager is None:
            wallet_manager = WalletManager()

        wallet = wallet_manager.get_bnb_provider()
        if not wallet:
            logger.error("bnb_sdk.wallet_provider_failed",
                         msg="EVMWalletProvider could not be loaded")
            return None

        network = os.getenv("NETWORK", "bsc-mainnet")
        sdk = ERC8004Agent(network=network, wallet_provider=wallet)

        agent_uri = sdk.generate_agent_uri(
            name="arbiter-trading-agent",
            description="Backtest-validated autonomous crypto trader on BSC. "
                        "Validates every trade against a Rust engine before execution.",
            endpoints=[
                AgentEndpoint(
                    name="trading", endpoint="https://arbiter.agent", version="0.1.0"),
            ],
        )

        result = sdk.register_agent(agent_uri=agent_uri)
        logger.info("bnb_sdk.registered", agent_id=result.get(
            "agentId"), tx=result.get("transactionHash"))
        return result

    except ImportError:
        logger.warning("bnb_sdk.not_installed",
                       msg="bnbagent package not available")
        return None
    except Exception as e:
        logger.error("bnb_sdk.registration_failed", error=str(e))
        return None
