"""Closed-Loop Strategy Optimizer — generate → backtest → advise → iterate."""
import json
import structlog

from config.settings import settings
from data.models import Regime
from agent.strategy import get_base_template
from agent.strategy_generator import StrategyGenerator
from agent.advisor import OptimizationAdvisor
from agent.gate import validate_strategy_detailed

logger = structlog.get_logger()


class OptimizationResult:
    """Result of an optimization run."""

    def __init__(
        self,
        status: str,  # "accepted", "best_effort", "failed"
        strategy_config: dict | None,
        gate_result=None,
        raw_metrics: dict | None = None,
        iteration: int = 0,
        total_iterations: int = 0,
        all_attempts: list[dict] | None = None,
        last_feedback: str = "",
    ):
        self.status = status
        self.strategy_config = strategy_config
        self.gate_result = gate_result
        self.raw_metrics = raw_metrics
        self.iteration = iteration
        self.total_iterations = total_iterations
        self.all_attempts = all_attempts or []
        self.last_feedback = last_feedback


class StrategyOptimizer:
    """Orchestrates the closed-loop strategy optimization."""

    def __init__(self):
        self.generator = StrategyGenerator()
        self.advisor = OptimizationAdvisor()

    async def optimize(
        self,
        regime: Regime,
        bars_json: str,
        max_iterations: int | None = None,
        num_variants: int | None = None,
        seed_feedback: str | None = None,
    ) -> OptimizationResult:
        """Run the optimization loop for a given regime and OHLCV data.

        Args:
            regime: Market regime
            bars_json: JSON string of OHLCV bars
            max_iterations: Override settings.optimizer_max_iterations
            num_variants: Override settings.optimizer_num_variants
            seed_feedback: Resume from prior run's last_feedback

        Returns:
            OptimizationResult with the best strategy found.
        """
        max_iter = max_iterations or settings.optimizer_max_iterations
        n_variants = num_variants or settings.optimizer_num_variants
        base_template = get_base_template(regime)

        best_result: dict | None = None
        best_gate = None
        best_config: dict | None = None
        best_ic: float | None = None
        feedback = seed_feedback
        all_attempts: list[dict] = []

        for iteration in range(1, max_iter + 1):
            logger.info("optimizer.iteration", iteration=iteration, max=max_iter, regime=regime.value)

            # Generate strategy variants
            variants = await self.generator.generate_variants(
                base_template=base_template,
                num_variants=n_variants,
                feedback=feedback,
            )

            # Also include the base template as a candidate in iteration 1
            if iteration == 1 and not seed_feedback:
                base_config = self.generator._template_to_config(base_template)
                variants.insert(0, base_config)

            # Evaluate each variant
            for variant in variants:
                config_json = json.dumps(variant)
                gate_result, raw_metrics = validate_strategy_detailed(bars_json, config_json)

                attempt = {
                    "iteration": iteration,
                    "strategy_name": variant.get("name", "unknown"),
                    "passed": gate_result.passed,
                    "total_return_pct": gate_result.total_return_pct,
                    "max_drawdown_pct": gate_result.max_drawdown_pct,
                    "win_rate": gate_result.win_rate,
                    "num_trades": gate_result.num_trades,
                    "profit_factor": gate_result.profit_factor,
                    "expectancy_pct": gate_result.expectancy_pct,
                    "rejection_reasons": gate_result.rejection_reasons,
                }
                all_attempts.append(attempt)

                logger.info("optimizer.evaluated",
                            name=variant.get("name"),
                            passed=gate_result.passed,
                            return_pct=gate_result.total_return_pct,
                            expectancy=gate_result.expectancy_pct,
                            trades=gate_result.num_trades)

                # Track best
                current_score = abs(gate_result.expectancy_pct) if gate_result.num_trades >= 3 else 0
                if best_ic is None or current_score > best_ic:
                    best_ic = current_score
                    best_result = raw_metrics
                    best_gate = gate_result
                    best_config = variant

                # Early accept
                if gate_result.passed:
                    logger.info("optimizer.accepted",
                                iteration=iteration,
                                name=variant.get("name"),
                                expectancy=gate_result.expectancy_pct)
                    return OptimizationResult(
                        status="accepted",
                        strategy_config=variant,
                        gate_result=gate_result,
                        raw_metrics=raw_metrics,
                        iteration=iteration,
                        total_iterations=max_iter,
                        all_attempts=all_attempts,
                        last_feedback=feedback or "",
                    )

            # No variant passed — get advisor feedback for next iteration
            if iteration < max_iter and best_config:
                feedback = await self.advisor.generate_feedback(
                    strategy_config=best_config,
                    backtest_result={
                        "total_return_pct": best_gate.total_return_pct,
                        "max_drawdown_pct": best_gate.max_drawdown_pct,
                        "win_rate": best_gate.win_rate,
                        "num_trades": best_gate.num_trades,
                        "profit_factor": best_gate.profit_factor,
                        "expectancy_pct": best_gate.expectancy_pct,
                    },
                    rejection_reasons=best_gate.rejection_reasons,
                    best_result={
                        "iteration": iteration,
                        "expectancy_pct": best_gate.expectancy_pct,
                        "strategy_name": best_config.get("name", "unknown"),
                    },
                )
                logger.info("optimizer.feedback", iteration=iteration, feedback=feedback[:100])

        # Exhausted iterations — return best effort
        if best_config:
            logger.info("optimizer.best_effort",
                        iterations=max_iter,
                        expectancy=best_gate.expectancy_pct if best_gate else 0)
            return OptimizationResult(
                status="best_effort",
                strategy_config=best_config,
                gate_result=best_gate,
                raw_metrics=best_result,
                iteration=max_iter,
                total_iterations=max_iter,
                all_attempts=all_attempts,
                last_feedback=feedback or "",
            )

        return OptimizationResult(
            status="failed",
            strategy_config=None,
            iteration=max_iter,
            total_iterations=max_iter,
            all_attempts=all_attempts,
        )
