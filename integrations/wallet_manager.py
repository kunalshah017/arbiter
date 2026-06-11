import os
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

class WalletManager:
    """
    Secure Production Version.
    Keeps secrets isolated and completely removes public property getters
    to eliminate the risk of accidental logging or token leakage.
    """
    
    def __init__(self):
        # Keep variables tightly bound inside the instance
        private_key = os.getenv("ARBITER_PRIVATE_KEY")
        password = os.getenv("ARBITER_WALLET_PASSWORD")
        
        if not private_key or not password:
            logger.critical(" CRITICAL: Cryptographic credentials missing from environment.")
            raise ValueError("Credentials must be configured.")
            
        self.__private_key: str = private_key
        self.__password: str = password

    def get_bnb_provider(self):
        """Initializes the provider internally so the key never leaves this class."""
        try:
            from bnb_agent_sdk import EVMWalletProvider 
            return EVMWalletProvider(private_key=self.__private_key)
        except ImportError:
            logger.error("BNB Agent SDK not found.")
            return None

    def secure_inject_twak_env(self, target_env: dict) -> dict:
        """
        Mutates an environment dictionary in-place to inject secrets
        only at the exact moment a subprocess execution requires them.
        """
        target_env["TWAK_PRIVATE_KEY"] = self.__private_key
        target_env["TWAK_WALLET_PASSWORD"] = self.__password
        return target_env