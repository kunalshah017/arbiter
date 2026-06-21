"""Application settings loaded from environment variables."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Binance (free public API, no key needed)
    binance_base_url: str = "https://api.binance.com"

    # CMC MCP (for regime classification + token discovery)
    cmc_api_key: str = ""
    cmc_mcp_url: str = "https://mcp.coinmarketcap.com/mcp"

    # OpenAI
    openai_api_key: str = ""

    # BNB SDK / Wallet
    arbiter_private_key: str = ""
    arbiter_wallet_password: str = ""
    network: str = "bsc-mainnet"
    bsc_rpc_url: str = "https://bsc-dataseed.binance.org/"

    # TWAK API Auth
    twak_access_id: str = ""
    twak_hmac_secret: str = ""

    # Telegram
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Agent params
    initial_capital: float = 1000.0
    max_position_pct: float = 5.0
    max_exposure_pct: float = 60.0
    daily_drawdown_halt_pct: float = 8.0
    competition_drawdown_cap_pct: float = 25.0
    scan_interval_seconds: int = 3600
    monitor_interval_seconds: int = 300

    # Backtest gate thresholds
    gate_min_expectancy_pct: float = 0.3
    gate_max_drawdown_pct: float = -15.0
    gate_min_win_rate: float = 35.0
    gate_min_trades: int = 5
    gate_min_profit_factor: float = 1.2

    # LLM API keys (set at least one)
    nvidia_api_key: str = ""
    google_api_key: str = ""

    # Optimizer settings
    optimizer_max_iterations: int = 3
    optimizer_num_variants: int = 3
    optimizer_enabled: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
