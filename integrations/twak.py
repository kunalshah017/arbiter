"""Trust Wallet Agent Kit CLI wrapper for execution."""
import asyncio
import json
import os
import structlog

from integrations.wallet_manager import WalletManager

logger = structlog.get_logger()


class TWAKExecutor:
    """Wraps TWAK CLI commands for autonomous trading.

    Uses WalletManager for secure credential injection into subprocess env.
    """

    def __init__(self, wallet_manager: WalletManager | None = None):
        self._env = os.environ.copy()
        if wallet_manager and wallet_manager.has_credentials:
            self._env = wallet_manager.secure_inject_twak_env(self._env)
        # Inject TWAK API auth if available
        for key in ("TWAK_ACCESS_ID", "TWAK_HMAC_SECRET"):
            val = os.getenv(key)
            if val:
                self._env[key] = val

    async def swap(
        self,
        amount: float,
        from_token: str,
        to_token: str,
        slippage_max: float = 0.01,
        chain: str = "bsc",
    ) -> dict | None:
        """Execute a token swap via TWAK."""
        cmd = [
            "twak", "swap",
            str(amount), from_token, to_token,
            "--chain", chain,
            "--slippage", str(slippage_max),
            "--json",
        ]
        result = await self._run_cmd(cmd)
        if result:
            logger.info("twak.swap_executed",
                        from_token=from_token, to_token=to_token,
                        amount=amount, tx=result.get("tx_hash"))
        return result

    async def get_quote(
        self,
        amount: float,
        from_token: str,
        to_token: str,
        chain: str = "bsc",
    ) -> dict | None:
        """Get swap quote without executing."""
        cmd = [
            "twak", "swap",
            str(amount), from_token, to_token,
            "--chain", chain,
            "--quote-only",
            "--json",
        ]
        return await self._run_cmd(cmd)

    async def get_portfolio(self) -> dict | None:
        """Get current portfolio balances."""
        cmd = ["twak", "wallet", "portfolio", "--json"]
        return await self._run_cmd(cmd)

    async def get_price(self, token: str) -> float | None:
        """Get current price for a token."""
        cmd = ["twak", "price", token, "--json"]
        result = await self._run_cmd(cmd)
        if result:
            return result.get("price")
        return None

    async def _run_cmd(self, cmd: list[str]) -> dict | None:
        """Run a TWAK CLI command and parse JSON output."""
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=self._env,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60.0)

            if proc.returncode != 0:
                logger.error("twak.cmd_failed", cmd=" ".join(
                    cmd), stderr=stderr.decode()[:200])
                return None

            output = stdout.decode().strip()
            if output:
                return json.loads(output)
            return {}

        except asyncio.TimeoutError:
            logger.error("twak.timeout", cmd=" ".join(cmd))
            return None
        except json.JSONDecodeError:
            logger.error("twak.invalid_json", cmd=" ".join(cmd))
            return None
        except FileNotFoundError:
            logger.error("twak.not_installed")
            return None
