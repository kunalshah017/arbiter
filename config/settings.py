"""Application settings loaded from environment variables."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Binance (free public API, no key needed)
    binance_base_url: str = "https://api.binance.com"

    # CMC MCP (for regime classification + token discovery)
    cmc_api_key: str = ""
    cmc_mcp_url: str = "https://mcp.coinmarketcap.com/mcp"

    # LLM API keys (set at least one for optimizer)
    nvidia_api_key: str = ""
    google_api_key: str = ""

    # Backtest gate thresholds
    gate_min_expectancy_pct: float = 0.0
    gate_max_drawdown_pct: float = -30.0
    gate_min_win_rate: float = 30.0
    gate_min_trades: int = 2
    gate_min_profit_factor: float = 1.0

    # Optimizer settings
    optimizer_max_iterations: int = 3
    optimizer_num_variants: int = 3
    optimizer_enabled: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
