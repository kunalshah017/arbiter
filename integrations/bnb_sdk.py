from bnbagent import ERC8004Agent
from integrations.wallet_manager import WalletManager

class ArbiterIdentity:
    """Handles ERC-8004 Registration and On-chain Identity for Arbiter."""
    
    def __init__(self, wallet_manager: WalletManager):
        self.wallet = wallet_manager.get_bnbagent_provider()
        self.sdk = ERC8004Agent(network="bsc-testnet", wallet_provider=self.wallet)

    def register(self):
        """Generates agent metadata and registers Arbiter on the BSC Testnet."""
        agent_uri = self.sdk.generate_agent_uri(
            name="arbiter-quant-trader",
            description=(
                "Arbiter: Backtest-Validated Autonomous Crypto Trader. "
                "Validates market regimes and execution strategies against a "
                "Rust backtest engine before signing transactions via TWAK."
            )
        )
        
        print("Registering Arbiter on-chain...")
        try:
            result = self.sdk.register_agent(agent_uri=agent_uri)
            print("Arbiter Registered Successfully!")
            print(f"Agent ID: {result['agentId']}")
            print(f"Transaction Hash: {result['transactionHash']}")
            return result['agentId']
        except Exception as e:
            print(f"Registration failed: {e}")
            return None

if __name__ == "__main__":
    shared_wallet_manager = WalletManager()
    identity = ArbiterIdentity(wallet_manager=shared_wallet_manager)
    identity.register()