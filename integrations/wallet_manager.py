import os
from dotenv import load_dotenv
from bnbagent import EVMWalletProvider

load_dotenv()

class WalletManager:
    """Centralized manager ensuring absolute alignment between Identity and Execution layers."""
    
    def __init__(self):
        self.private_key = os.getenv("ARBITER_PRIVATE_KEY")
        self.password = os.getenv("ARBITER_WALLET_PASSWORD")
        
        if not self.private_key:
            raise ValueError("CRITICAL: ARBITER_PRIVATE_KEY is missing from environment variables.")

    def get_bnbagent_provider(self):
        """Returns the in-memory provider needed for ERC-8004 Identity."""
        return EVMWalletProvider(
            password=self.password,
            private_key=self.private_key,
            persist=False  
        )
        
    def get_twak_provider(self):
        """Placeholder for Trust Wallet Agent Kit execution provider."""
        pass