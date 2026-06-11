"""Secure wallet credential manager.

Keeps private keys isolated via name-mangled attributes to prevent
accidental logging or leakage. Injects secrets only at execution time.
"""
import os
import structlog
from dotenv import load_dotenv

load_dotenv()
logger = structlog.get_logger()


class WalletManager:
    """Secure credential isolation for wallet operations."""

    def __init__(self):
        private_key = os.getenv("ARBITER_PRIVATE_KEY",
                                os.getenv("PRIVATE_KEY", ""))
        password = os.getenv("ARBITER_WALLET_PASSWORD",
                             os.getenv("WALLET_PASSWORD", ""))

        if not private_key:
            logger.warning("wallet.no_private_key",
                           msg="ARBITER_PRIVATE_KEY not set")

        self.__private_key: str = private_key
        self.__password: str = password

    def get_bnb_provider(self):
        """Create EVMWalletProvider without exposing the key externally."""
        try:
            from bnbagent import EVMWalletProvider
            return EVMWalletProvider(private_key=self.__private_key, password=self.__password)
        except ImportError:
            logger.error("wallet.bnbagent_not_installed")
            return None

    def secure_inject_twak_env(self, target_env: dict) -> dict:
        """Inject wallet secrets into a subprocess environment dict at execution time."""
        target_env["TWAK_PRIVATE_KEY"] = self.__private_key
        target_env["TWAK_WALLET_PASSWORD"] = self.__password
        return target_env

    @property
    def has_credentials(self) -> bool:
        return bool(self.__private_key)
