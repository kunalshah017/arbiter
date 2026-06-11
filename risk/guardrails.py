"""Portfolio-level guardrails and kill switches."""
import time
import structlog
from config.settings import settings

logger = structlog.get_logger()


class Guardrails:
    """Enforces portfolio-level risk limits."""

    def __init__(self):
        self._initial_value: float | None = None
        self._daily_start_value: float | None = None
        self._daily_start_ts: int = 0
        self._halted_until: int = 0

    def set_initial_value(self, value: float):
        self._initial_value = value
        self._daily_start_value = value
        self._daily_start_ts = int(time.time())

    def check_daily_reset(self, current_value: float):
        now = int(time.time())
        if now - self._daily_start_ts > 86400:
            self._daily_start_value = current_value
            self._daily_start_ts = now
            self._halted_until = 0

    def can_trade(self, current_value: float) -> tuple[bool, str]:
        """Check if trading is allowed given current portfolio value."""
        now = int(time.time())

        if now < self._halted_until:
            remaining = (self._halted_until - now) // 60
            return False, f"Trading halted for {remaining} more minutes"

        self.check_daily_reset(current_value)

        # Competition drawdown cap
        if self._initial_value and self._initial_value > 0:
            total_dd = (current_value - self._initial_value) / self._initial_value * 100
            if total_dd < -settings.competition_drawdown_cap_pct:
                return False, f"Competition DD cap hit: {total_dd:.1f}%"

        # Daily drawdown halt
        if self._daily_start_value and self._daily_start_value > 0:
            daily_dd = (current_value - self._daily_start_value) / self._daily_start_value * 100
            if daily_dd < -settings.daily_drawdown_halt_pct:
                self._halted_until = now + 86400
                logger.warning("guardrails.daily_halt", dd_pct=daily_dd)
                return False, f"Daily DD halt: {daily_dd:.1f}%"

        return True, ""

    def check_exposure(self, current_exposure_pct: float, new_position_pct: float) -> tuple[bool, str]:
        """Check if adding a new position would exceed exposure limits."""
        total = current_exposure_pct + new_position_pct
        if total > settings.max_exposure_pct:
            return False, f"Exposure limit: {total:.1f}% > {settings.max_exposure_pct}%"
        return True, ""
