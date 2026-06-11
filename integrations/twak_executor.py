import os
import json
import logging
import subprocess
from integrations.wallet_manager import WalletManager

logger = logging.getLogger(__name__)

class ArbiterExecutionEngine:
    """
    The TWAK Execution Layer for Arbiter.
    Wraps the official @trustwallet/cli using Python subprocesses
    to handle self-custodial signing, portfolio tracking, and automated swaps.
    """
    
    def __init__(self, wallet_manager: WalletManager):
        self.env = os.environ.copy()
        
        # 1. Stateless Wallet Injection
        self.env["TWAK_PRIVATE_KEY"] = wallet_manager.private_key
        self.env["TWAK_WALLET_PASSWORD"] = wallet_manager.password
        
        # 2. Trust Wallet API Authentication (Required for routing)
        self.env["TWAK_ACCESS_ID"] = os.getenv("TWAK_ACCESS_ID")
        self.env["TWAK_HMAC_SECRET"] = os.getenv("TWAK_HMAC_SECRET")
        
        if not self.env.get("TWAK_ACCESS_ID") or not self.env.get("TWAK_HMAC_SECRET"):
            logger.warning("⚠️ TWAK API credentials missing from .env. CLI commands may fail.")
        
        # 3. Risk Management Parameters
        self.MAX_SLIPPAGE = 1             # 1% slippage tolerance
        self.MAX_POSITION_SIZE = 0.05     # 5% maximum portfolio spend per trade

    def get_portfolio_value(self) -> float:
        """
        Queries the current on-chain wallet balances via the TWAK CLI
        and calculates total portfolio value in equivalent USDT.
        """
        cmd = ["twak", "balance", "--json"]
        
        try:
            result = subprocess.run(cmd, env=self.env, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            
            # GAS GUARDRAIL: Ensure we have enough BNB to execute a trade
            bnb_balance = float(data.get("balances", {}).get("BNB", 0))
            if bnb_balance < 0.01:
                logger.warning(f"⚠️ Low Gas Warning: Only {bnb_balance} BNB remaining.")
            
            # Extract total portfolio valuation
            portfolio_value = float(data.get("totalUsdtValue", 0.0))
            logger.info(f"Portfolio balance successfully monitored: ${portfolio_value:,.2f} USDT")
            return portfolio_value
            
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to read TWAK portfolio. CLI Error: {e.stderr.strip()}")
            return 0.0
        except (ValueError, TypeError) as e:
            logger.error(f"Error parsing TWAK balance JSON payload: {e}")
            return 0.0

    def execute_swap(self, from_token: str, to_token: str, amount: float) -> str:
        """
        Executes an autonomous token swap on-chain using the TWAK CLI.
        Intercepts raw transaction requests to enforce strict exposure limits.
        """
        logger.info(f"Evaluating trade request: {amount} {from_token} -> {to_token}")
        
        # GUARDRAIL 1: Maximum Position Size Check (5%)
        if from_token.upper() in ["USDT", "USDC", "BUSD"]:
            current_portfolio_value = self.get_portfolio_value()
            max_allowed_spend = current_portfolio_value * self.MAX_POSITION_SIZE
            
            if amount > max_allowed_spend:
                logger.error(
                    f" RISK GUARDRAIL TRIGGERED: Requested order size ({amount} {from_token}) "
                    f"exceeds the 5% portfolio allocation maximum ({max_allowed_spend:.2f} {from_token}). "
                    f"Transaction aborted."
                )
                return None

        # SWAP EXECUTION: Formulating Command & Appending Slippage Guardrail (1%)
        cmd = [
            "twak", "swap",
            "--from", from_token,
            "--to", to_token,
            "--amount", str(amount),
            "--slippage", str(self.MAX_SLIPPAGE),
            "--json"
        ]
        
        try:
            logger.info(f"Dispatching trade to TWAK: Swap {amount} {from_token}...")
            result = subprocess.run(cmd, env=self.env, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            
            tx_hash = data.get("transactionHash")
            logger.info(f" Swap Executed Successfully! TX Hash: {tx_hash}")
            return tx_hash
            
        except subprocess.CalledProcessError as e:
            logger.error(f" Swap execution failed on-chain: {e.stderr.strip()}")
            return None

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
    manager = WalletManager()
    executor = ArbiterExecutionEngine(wallet_manager=manager)
    print("Testing local TWAK execution module integration...")
    executor.get_portfolio_value()