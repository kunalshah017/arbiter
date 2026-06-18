"""Decision gate: evaluates backtest results against thresholds."""
import json
import structlog
from config.settings import settings
from data.models import BacktestGateResult
from arbiter._engine import crypto_backtest

logger = structlog.get_logger()


def validate_strategy(bars_json: str, config_json: str) -> BacktestGateResult:
    """Run backtest and check if results pass the gate."""
    result_json = crypto_backtest(bars_json, config_json)
    result = json.loads(result_json)

    reasons = []
    passed = True

    if result["num_trades"] < settings.gate_min_trades:
        reasons.append(
            f"Too few trades: {result['num_trades']} < {settings.gate_min_trades}")
        passed = False

    if result["expectancy_pct"] < settings.gate_min_expectancy_pct:
        reasons.append(
            f"Low expectancy: {result['expectancy_pct']:.2f}% < {settings.gate_min_expectancy_pct}%")
        passed = False

    if result["max_drawdown_pct"] < settings.gate_max_drawdown_pct:
        reasons.append(
            f"High drawdown: {result['max_drawdown_pct']:.2f}% < {settings.gate_max_drawdown_pct}%")
        passed = False

    if result["win_rate"] < settings.gate_min_win_rate:
        reasons.append(
            f"Low win rate: {result['win_rate']:.1f}% < {settings.gate_min_win_rate}%")
        passed = False

    profit_factor = result["profit_factor"] if result["profit_factor"] is not None else 0.0
    if profit_factor < settings.gate_min_profit_factor:
        reasons.append(
            f"Low profit factor: {profit_factor:.2f} < {settings.gate_min_profit_factor}")
        passed = False

    if passed:
        logger.info(
            "gate.passed", trades=result["num_trades"], return_pct=result["total_return_pct"])
    else:
        logger.info("gate.rejected", reasons=reasons)

    return BacktestGateResult(
        passed=passed,
        total_return_pct=result["total_return_pct"],
        max_drawdown_pct=result["max_drawdown_pct"],
        win_rate=result["win_rate"],
        num_trades=result["num_trades"],
        profit_factor=result["profit_factor"],
        expectancy_pct=result["expectancy_pct"],
        rejection_reasons=reasons,
    )


def validate_strategy_detailed(bars_json: str, config_json: str) -> tuple[BacktestGateResult, dict]:
    """Run backtest and return both gate result and raw metrics."""
    result_json = crypto_backtest(bars_json, config_json)
    result = json.loads(result_json)

    reasons = []
    passed = True

    if result["num_trades"] < settings.gate_min_trades:
        reasons.append(f"Too few trades: {result['num_trades']} < {settings.gate_min_trades}")
        passed = False
    if result["expectancy_pct"] < settings.gate_min_expectancy_pct:
        reasons.append(f"Low expectancy: {result['expectancy_pct']:.2f}% < {settings.gate_min_expectancy_pct}%")
        passed = False
    if result["max_drawdown_pct"] < settings.gate_max_drawdown_pct:
        reasons.append(f"High drawdown: {result['max_drawdown_pct']:.2f}% < {settings.gate_max_drawdown_pct}%")
        passed = False
    if result["win_rate"] < settings.gate_min_win_rate:
        reasons.append(f"Low win rate: {result['win_rate']:.1f}% < {settings.gate_min_win_rate}%")
        passed = False
    pf = result.get("profit_factor") or 0
    if pf < settings.gate_min_profit_factor:
        reasons.append(f"Low profit factor: {pf:.2f} < {settings.gate_min_profit_factor}")
        passed = False

    gate_result = BacktestGateResult(
        passed=passed,
        total_return_pct=result["total_return_pct"],
        max_drawdown_pct=result["max_drawdown_pct"],
        win_rate=result["win_rate"],
        num_trades=result["num_trades"],
        profit_factor=pf,
        expectancy_pct=result["expectancy_pct"],
        rejection_reasons=reasons,
    )

    return gate_result, result
