"""Strategy optimizer: iterative generation + evaluation loop."""
import json
from dataclasses import dataclass, field
import structlog

from config.settings import settings
from data.models import Regime, BacktestGateResult
from agent.strategy import get_base_template
from agent.strategy_generator import StrategyGenerator
from agent.advisor import OptimizationAdvisor
from agent.gate import validate_strategy_detailed

logger = structlog.get_logger()


@dataclass
class OptimizationResult:
    """Result of the optimization loop."""
    status: str  # "accepted", "exhausted", "error"
    strategy_config: dict | None = None
    gate_result: BacktestGateResult | None = None
    raw_metrics: dict | None = None
    iteration: int = 0
    total_iterations: int = 0
    all_attempts: list[dict] = field(default_factory=list)
    last_feedback: str | None = None


class StrategyOptimizer:
    """Orchestrates the generate → evaluate → advise loop."""

    def __init__(self):
        self.generator = StrategyGenerator()
        self.advisor = OptimizationAdvisor()

    def optimize(
        self,
        regime: Regime,
        bars_json: str,
        max_iterations: int | None = None,
        num_variants: int | None = None,
        seed_feedback: str | None = None,
    ) -> OptimizationResult:
        """Run optimization loop to find a strategy that passes the gate."""
        max_iter = max_iterations or settings.optimizer_max_iterations
        n_variants = num_variants or settings.optimizer_num_variants

        base_template = get_base_template(regime)
        feedback = seed_feedback
        all_attempts = []
        best_raw = None
        best_score = float("-inf")

        for iteration in range(1, max_iter + 1):
            logger.info("optimizer.iteration", iteration=iteration, max=max_iter)

            # Generate variants
            variants = self.generator.generate_variants(base_template, n_variants, feedback)

            # In first iteration, always include the base template
            if iteration == 1:
                candidates = [base_template] + variants
            else:
                candidates = variants

            # Evaluate each candidate
            for candidate in candidates:
                config = self.generator._template_to_config(candidate)
                config_json = json.dumps(config)

                try:
                    gate_result, raw = validate_strategy_detailed(bars_json, config_json)
                except Exception as e:
                    logger.warning("optimizer.eval_failed", error=str(e), name=candidate.get("name"))
                    continue

                attempt = {
                    "name": candidate.get("name", "unknown"),
                    "iteration": iteration,
                    "passed": gate_result.passed,
                    "return_pct": raw.get("total_return_pct", 0),
                    "drawdown_pct": raw.get("max_drawdown_pct", 0),
                    "win_rate": raw.get("win_rate", 0),
                    "num_trades": raw.get("num_trades", 0),
                }
                all_attempts.append(attempt)

                # Track best result for advisor context
                score = raw.get("total_return_pct", 0) - abs(raw.get("max_drawdown_pct", 0))
                if score > best_score:
                    best_score = score
                    best_raw = raw

                if gate_result.passed:
                    logger.info("optimizer.accepted", name=candidate.get("name"), iteration=iteration)
                    return OptimizationResult(
                        status="accepted",
                        strategy_config=config,
                        gate_result=gate_result,
                        raw_metrics=raw,
                        iteration=iteration,
                        total_iterations=max_iter,
                        all_attempts=all_attempts,
                        last_feedback=feedback,
                    )

            # No candidate passed — get advisor feedback for next iteration
            if candidates:
                last_config = self.generator._template_to_config(candidates[-1])
                feedback = self.advisor.generate_feedback(
                    strategy_config=last_config,
                    backtest_result=best_raw or {},
                    rejection_reasons=gate_result.rejection_reasons if gate_result else [],
                    best_result=best_raw,
                )
                logger.info("optimizer.feedback", iteration=iteration, feedback_len=len(feedback))

        # Exhausted all iterations
        return OptimizationResult(
            status="exhausted",
            strategy_config=None,
            gate_result=None,
            raw_metrics=best_raw,
            iteration=max_iter,
            total_iterations=max_iter,
            all_attempts=all_attempts,
            last_feedback=feedback,
        )
