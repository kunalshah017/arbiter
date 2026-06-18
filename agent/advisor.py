"""Optimization Advisor Agent — reviews failed backtests and suggests improvements."""
import json
import structlog
from openai import AsyncOpenAI
from config.settings import settings

logger = structlog.get_logger()

ADVISOR_PROMPT = """You are a quantitative trading strategy advisor. A backtest just ran and the results did not meet the acceptance thresholds.

STRATEGY THAT WAS TESTED:
{strategy_json}

BACKTEST RESULTS:
- Total Return: {total_return:.2f}%
- Max Drawdown: {max_drawdown:.2f}%
- Win Rate: {win_rate:.1f}%
- Number of Trades: {num_trades}
- Profit Factor: {profit_factor:.2f}
- Expectancy: {expectancy:.2f}%

ACCEPTANCE THRESHOLDS:
- Min Expectancy: {min_expectancy}%
- Max Drawdown: {max_drawdown_threshold}%
- Min Win Rate: {min_win_rate}%
- Min Trades: {min_trades}
- Min Profit Factor: {min_profit_factor}

REJECTION REASONS:
{rejection_reasons}

{best_so_far_section}

Provide 3-5 short, specific, actionable suggestions to improve this strategy. Focus on:
1. Which indicator periods to change and in what direction
2. Which entry/exit thresholds to loosen or tighten
3. Whether SL/TP multiples should change
4. Any structural changes (add/remove conditions)

Be concrete: say "Change RSI threshold from 55 to 50" not "adjust RSI".
Keep response under 300 characters. No preamble."""

BEST_SO_FAR_TEMPLATE = """BEST RESULT SO FAR (iteration {iteration}, |expectancy| = {expectancy:.2f}%):
Strategy: {strategy_name}
Try to BEAT this result. Build on what worked."""


# LLM provider config — NVIDIA NIM (primary) or Google Gemini (fallback)
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
ADVISOR_MODEL_NVIDIA = "nvidia/nemotron-3-ultra-550b-a55b"
ADVISOR_MODEL_GEMINI = "gemini-3.5-flash"


class OptimizationAdvisor:
    """Reviews failed backtests and suggests strategy improvements."""

    def __init__(self):
        from agent.strategy_generator import _get_llm_client_and_model
        try:
            self._client, self._model = _get_llm_client_and_model(
                ADVISOR_MODEL_NVIDIA, ADVISOR_MODEL_GEMINI
            )
        except ValueError:
            logger.warning("advisor.no_api_keys", msg="No LLM API keys found, will use static fallback feedback")
            self._client, self._model = None, None

    async def generate_feedback(
        self,
        strategy_config: dict,
        backtest_result: dict,
        rejection_reasons: list[str],
        best_result: dict | None = None,
    ) -> str:
        """Generate optimization feedback for a failed backtest.

        Args:
            strategy_config: The strategy config that was tested
            backtest_result: Dict with total_return_pct, max_drawdown_pct, etc.
            rejection_reasons: List of gate rejection reason strings
            best_result: Optional best result from a prior iteration

        Returns:
            String of actionable feedback bullets.
        """
        if not self._client:
            logger.warning("advisor.fallback", msg="No LLM client, using static feedback")
            return "- Try wider indicator periods\n- Loosen entry thresholds\n- Reduce SL multiple"

        best_section = ""
        if best_result:
            best_section = BEST_SO_FAR_TEMPLATE.format(
                iteration=best_result.get("iteration", "?"),
                expectancy=best_result.get("expectancy_pct", 0),
                strategy_name=best_result.get("strategy_name", "unknown"),
            )

        prompt = ADVISOR_PROMPT.format(
            strategy_json=json.dumps(strategy_config, indent=2)[:1000],
            total_return=backtest_result.get("total_return_pct", 0),
            max_drawdown=backtest_result.get("max_drawdown_pct", 0),
            win_rate=backtest_result.get("win_rate", 0),
            num_trades=backtest_result.get("num_trades", 0),
            profit_factor=backtest_result.get("profit_factor", 0),
            expectancy=backtest_result.get("expectancy_pct", 0),
            min_expectancy=settings.gate_min_expectancy_pct,
            max_drawdown_threshold=settings.gate_max_drawdown_pct,
            min_win_rate=settings.gate_min_win_rate,
            min_trades=settings.gate_min_trades,
            min_profit_factor=settings.gate_min_profit_factor,
            rejection_reasons="\n".join(f"- {r}" for r in rejection_reasons),
            best_so_far_section=best_section,
        )

        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": "You are a concise quantitative strategy optimization advisor."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=400,
                temperature=0.3,
            )
            feedback = response.choices[0].message.content.strip()
            # Hard cap
            if len(feedback) > 500:
                feedback = feedback[:500].rsplit("\n", 1)[0]
            logger.info("advisor.feedback_generated", length=len(feedback))
            return feedback
        except Exception as e:
            logger.error("advisor.llm_error", error=str(e))
            return "- Try wider indicator periods\n- Loosen entry thresholds\n- Reduce SL multiple"
