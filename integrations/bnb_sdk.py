"""BNB Agent SDK integration for ERC-8004 registration."""
import os
import structlog

logger = structlog.get_logger()


async def register_agent_identity():
    """Register agent on-chain via ERC-8004. Idempotent."""
    try:
        from bnbagent import ERC8004Agent, AgentEndpoint, EVMWalletProvider

        wallet = EVMWalletProvider(
            password=os.getenv("WALLET_PASSWORD", ""),
            private_key=os.getenv("PRIVATE_KEY"),
        )

        sdk = ERC8004Agent(network=os.getenv(
            "NETWORK", "bsc-mainnet"), wallet_provider=wallet)

        agent_uri = sdk.generate_agent_uri(
            name="arbiter-trading-agent",
            description="Backtest-validated autonomous crypto trader on BSC.",
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
