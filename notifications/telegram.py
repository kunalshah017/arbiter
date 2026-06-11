"""Telegram bot for trade alerts and daily summaries."""
import httpx
import structlog
from config.settings import settings

logger = structlog.get_logger()

_BASE_URL = "https://api.telegram.org/bot{token}/sendMessage"


async def send_message(text: str, parse_mode: str = "HTML"):
    """Send a message to the configured Telegram chat."""
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return

    url = _BASE_URL.format(token=settings.telegram_bot_token)
    payload = {
        "chat_id": settings.telegram_chat_id,
        "text": text,
        "parse_mode": parse_mode,
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=10.0)
            if resp.status_code != 200:
                logger.warning("telegram.send_failed", status=resp.status_code)
    except Exception as e:
        logger.warning("telegram.error", error=str(e))


async def notify_trade_entry(symbol: str, price: float, size_usd: float, strategy: str):
    text = (
        f"🟢 <b>BUY {symbol}</b>\n"
        f"Price: ${price:.4f}\n"
        f"Size: ${size_usd:.2f}\n"
        f"Strategy: {strategy}"
    )
    await send_message(text)


async def notify_trade_exit(symbol: str, price: float, pnl_pct: float, reason: str):
    emoji = "🟢" if pnl_pct > 0 else "🔴"
    text = (
        f"{emoji} <b>SELL {symbol}</b>\n"
        f"Price: ${price:.4f}\n"
        f"P&L: {pnl_pct:+.2f}%\n"
        f"Reason: {reason}"
    )
    await send_message(text)


async def notify_daily_summary(
    total_value: float,
    daily_pnl_pct: float,
    num_trades: int,
    regime: str,
    positions: list[str],
):
    text = (
        f"📊 <b>Daily Summary</b>\n"
        f"Portfolio: ${total_value:.2f}\n"
        f"Daily P&L: {daily_pnl_pct:+.2f}%\n"
        f"Trades today: {num_trades}\n"
        f"Regime: {regime}\n"
        f"Positions: {', '.join(positions) or 'None'}"
    )
    await send_message(text)


async def notify_error(error_msg: str):
    text = f"⚠️ <b>Error</b>\n{error_msg}"
    await send_message(text)
