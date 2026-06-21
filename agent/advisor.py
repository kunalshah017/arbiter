"""Optimization advisor: generates feedback for strategy refinement."""
import json
import structlog
from agent.strategy_generator import _get_llm_client_and_model

logger = structlog.get_logger()

NVIDIA_ADVISOR_MODEL = "deepseek-ai/deepseek-v4-flash"
GEMINI_ADVISOR_MODEL = "gemini-2.0-flash"

SYSTEM_PROMPT = """You are a quantitative trading strategy advisor. Analyze backtest results and provide specific, actionable feedback to improve strategy performance.

Focus on:
- Why the strategy was rejected (specific metrics that failed)
- What parameter changes could address each failure
- Trade-offs between different objectives (return vs drawdown, win rate vs profit factor)
- Concrete suggestions for indicator tuning or condition changes

Keep feedback concise and structured. Maximum 200 words."""


class OptimizationAdvisor:
    """Generates feedback for strategy optimization iterations."""

    def __init__(self):
        self.client, self.model = _get_llm_client_and_model(
            NVIDIA_ADVISOR_MODEL, GEMINI_ADVISOR_MODEL
        )

    def generate_feedback(
        self,
        strategy_config: dict,
        backtest_result: dict,
        rejection_reasons: list[str],
        best_result: dict | None = None,
    ) -> str:
        """Generate optimization feedback based on backtest results."""
        user_msg = f"""Strategy config:
```json
{json.dumps(strategy_config, indent=2)}
```

Backtest results:
- Total return: {backtest_result.get('total_return_pct', 0):.2f}%
- Max drawdown: {backtest_result.get('max_drawdown_pct', 0):.2f}%
- Win rate: {backtest_result.get('win_rate', 0):.1f}%
- Num trades: {backtest_result.get('num_trades', 0)}
- Profit factor: {backtest_result.get('profit_factor', 0):.2f}
- Expectancy: {backtest_result.get('expectancy_pct', 0):.2f}%

Rejection reasons: {'; '.join(rejection_reasons)}"""

        if best_result:
            user_msg += f"""

Best result so far:
- Total return: {best_result.get('total_return_pct', 0):.2f}%
- Max drawdown: {best_result.get('max_drawdown_pct', 0):.2f}%
- Win rate: {best_result.get('win_rate', 0):.1f}%
- Profit factor: {best_result.get('profit_factor', 0):.2f}%"""

        try:
            if self.client is None:
                return f"Strategy rejected: {'; '.join(rejection_reasons)}. Try adjusting indicator periods or thresholds."
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.5,
                max_tokens=1024,
            )
            feedback = response.choices[0].message.content.strip()
            logger.info("advisor.feedback_generated", length=len(feedback))
            return feedback
        except Exception as e:
            logger.warning("advisor.feedback_failed", error=str(e))
            return f"Strategy rejected: {'; '.join(rejection_reasons)}. Try adjusting parameters."
