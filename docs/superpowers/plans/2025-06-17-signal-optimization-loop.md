# Signal Optimization Loop — Multi-Agent Strategy Discovery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Arbiter's static 5-strategy templates with a closed-loop multi-agent optimization system inspired by NVIDIA's signal discovery pattern — where an LLM generates strategy variations, the Rust engine evaluates them, and an advisor LLM provides feedback to iterate until the gate passes or max attempts exhausted.

**Architecture:** Three specialized LLM agents (Strategy Generator, Optimization Advisor, Regime Classifier) powered by free NVIDIA NIM models via OpenAI-compatible API. The Strategy Generator (DeepSeek V4 Flash — creative, fast JSON generation) proposes indicator/condition parameter variations seeded from base templates. The Rust engine evaluates each. The Advisor (Nemotron 3 Ultra 550B — best reasoning) reviews failures and suggests concrete improvements. The Regime Classifier switches from GPT-4o-mini to DeepSeek V4 Flash (free, same quality). State persists in PostgreSQL so the agent learns across sessions. The existing gate thresholds remain the acceptance criteria.

**Tech Stack:** Python asyncio, NVIDIA NIM free API (DeepSeek V4 Flash + Nemotron 3 Ultra via OpenAI-compatible endpoint at `integrate.api.nvidia.com`), existing Rust backtest engine, PostgreSQL for optimization history, existing FastAPI dashboard endpoints.

**LLM Model Selection:**

| Agent | Model | Endpoint | Why |
|-------|-------|----------|-----|
| Strategy Generator | `deepseek-ai/deepseek-v4-flash` | Free NIM | 284B MoE, fast, excellent structured JSON output |
| Optimization Advisor | `nvidia/nemotron-3-ultra-550b-a55b` | Free NIM | 550B flagship, strongest reasoning for analysis |
| Regime Classifier | `deepseek-ai/deepseek-v4-flash` | Free NIM | Replaces GPT-4o-mini — same quality, zero cost |

All models use OpenAI-compatible API: `base_url="https://integrate.api.nvidia.com/v1/"`, auth via `NVIDIA_API_KEY`.

---

## Current Flow vs Proposed Flow

```
CURRENT:
  scan → regime → FIXED strategy template → backtest → REJECT → skip token

PROPOSED:
  scan → regime → base template → LLM generates 3 variations →
    backtest each → best passes gate? → ACCEPT
                                      → REJECT → Advisor suggests tweaks →
                                        LLM generates improved variations →
                                        backtest → (repeat up to 3 iterations)
                                      → best-effort or skip
```

## File Structure

```
agent/
├── optimizer.py          # Create: closed-loop strategy optimization orchestrator
├── strategy_generator.py # Create: LLM agent that generates strategy config variations
├── advisor.py            # Create: LLM agent that reviews failed backtests + suggests fixes
├── strategy.py           # Modify: add get_base_template(), keep get_strategy_config() as fallback
├── gate.py               # Modify: add validate_strategy_batch() for multi-signal evaluation
├── main.py               # Modify: _scan_and_trade() uses optimizer instead of fixed strategy

server/
├── models.py             # Modify: add OptimizationRun model
├── crud.py               # Modify: add optimization history CRUD
├── api.py                # Modify: add /api/optimize endpoint for dashboard

config/
├── settings.py           # Modify: add optimizer settings (max_iterations, num_variants)

tests/
├── test_optimizer.py     # Create: tests for the optimization loop
├── test_strategy_gen.py  # Create: tests for strategy generation
├── test_advisor.py       # Create: tests for advisor feedback
```

---

### Task 1: Strategy Generator Agent

**Files:**

- Create: `agent/strategy_generator.py`
- Modify: `agent/strategy.py`

The Strategy Generator takes a base template + optional feedback and produces N strategy config variations by tweaking indicator periods, entry/exit thresholds, and SL/TP multiples.

- [ ] **Step 1: Add `get_base_template()` to `agent/strategy.py`**

This returns the raw YAML template (not the engine-ready config) so the generator can see the template structure and propose modifications.

```python
def get_base_template(regime: Regime) -> dict:
    """Get the raw strategy template for a regime (for LLM modification)."""
    strategies = _load_strategies()
    template = strategies.get(regime.value)
    if template is None:
        template = strategies["choppy"]
    return template
```

Add this function right after the existing `get_strategy_config()`.

- [ ] **Step 2: Create `agent/strategy_generator.py`**

````python
"""Strategy Generator Agent — produces strategy config variations using LLM."""
import json
import structlog
from openai import AsyncOpenAI
from config.settings import settings

logger = structlog.get_logger()

STRATEGY_GEN_PROMPT = """You are a quantitative trading strategy designer for crypto markets.

Given a base strategy template and optional feedback from a previous iteration, generate {num_variants} VARIATIONS of this strategy by modifying parameters.

BASE TEMPLATE:
{base_template}

{feedback_section}

RULES:
- Keep the same indicator TYPES but vary PERIODS (e.g., EMA period 9→12, RSI period 14→21)
- Adjust entry/exit threshold VALUES (e.g., RSI > 55 → RSI > 50, or RSI > 60)
- Vary SL/TP ATR multiples (e.g., SL 2.0→1.5, TP 4.0→3.0)
- You MUST include ATR with period 14 in every variant (needed for SL/TP calculation)
- RSI thresholds are on 0-100 scale
- Only use these indicator types: EMA, SMA, RSI, ATR, BBands
- Only use these operators in conditions: >, <, >=, <=, crossover, crossunder
- Left/right operands can be: indicator aliases (e.g. "EMA_9"), price fields ("close", "open", "high", "low"), or numeric strings (e.g. "55")
- Indicator aliases follow the pattern: TYPE_PERIOD (e.g., "EMA_9", "RSI_14", "ATR_14")
- For BBands subfields use: BBANDS_PERIOD.upper, BBANDS_PERIOD.middle, BBANDS_PERIOD.lower

Return a JSON array of {num_variants} strategy objects. Each must have:
- "name": string (descriptive name for this variant)
- "indicators": array of indicator definitions
- "entry_conditions": array of conditions (AND-combined)
- "exit_conditions": array of conditions (OR-combined)
- "stop_loss_atr_multiple": float
- "take_profit_atr_multiple": float

Respond with ONLY the JSON array, no markdown fences, no explanation."""

FEEDBACK_TEMPLATE = """FEEDBACK FROM PREVIOUS ITERATION:
The previous strategies were backtested. Here are the results and advisor suggestions:

{feedback}

Use this feedback to improve your strategy variations. Try to BEAT the best result."""


# NVIDIA NIM model for strategy generation (creative, fast JSON output)
STRATEGY_MODEL = "deepseek-ai/deepseek-v4-flash"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/"


class StrategyGenerator:
    """Generates strategy config variations using an LLM."""

    def __init__(self):
        api_key = settings.nvidia_api_key or settings.openai_api_key
        base_url = NVIDIA_BASE_URL if settings.nvidia_api_key else None
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = STRATEGY_MODEL if settings.nvidia_api_key else "gpt-4o-mini"

    async def generate_variants(
        self,
        base_template: dict,
        num_variants: int = 3,
        feedback: str | None = None,
    ) -> list[dict]:
        """Generate N strategy variations from a base template.

        Args:
            base_template: The regime's base strategy template from YAML
            num_variants: Number of variants to generate
            feedback: Optional advisor feedback from a prior failed iteration

        Returns:
            List of strategy config dicts ready for the Rust engine.
        """
        feedback_section = ""
        if feedback:
            feedback_section = FEEDBACK_TEMPLATE.format(feedback=feedback)

        prompt = STRATEGY_GEN_PROMPT.format(
            num_variants=num_variants,
            base_template=json.dumps(base_template, indent=2),
            feedback_section=feedback_section,
        )

        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2000,
                temperature=0.7,  # Creative for variation
            )
            text = response.choices[0].message.content.strip()
            # Strip markdown fences if present
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text.rsplit("```", 1)[0]
                text = text.strip()

            variants = json.loads(text)
            if not isinstance(variants, list):
                variants = [variants]

            # Validate and normalize each variant
            valid = []
            for v in variants:
                config = self._normalize_variant(v)
                if config:
                    valid.append(config)

            if not valid:
                logger.warning("strategy_gen.no_valid_variants")
                return [self._template_to_config(base_template)]

            logger.info("strategy_gen.generated", count=len(valid),
                        names=[v.get("name", "?") for v in valid])
            return valid

        except (json.JSONDecodeError, KeyError) as e:
            logger.error("strategy_gen.parse_error", error=str(e))
            return [self._template_to_config(base_template)]
        except Exception as e:
            logger.error("strategy_gen.llm_error", error=str(e))
            return [self._template_to_config(base_template)]

    def _normalize_variant(self, variant: dict) -> dict | None:
        """Validate and normalize a strategy variant into engine config format."""
        try:
            indicators = variant.get("indicators", [])
            entry = variant.get("entry_conditions", [])
            exit_conds = variant.get("exit_conditions", [])

            if not indicators or not entry:
                return None

            # Ensure ATR_14 is present
            has_atr = any(
                i.get("type", "").upper() == "ATR" and i.get("period", 0) == 14
                for i in indicators
            )
            if not has_atr:
                indicators.append({"type": "ATR", "period": 14})

            return {
                "name": variant.get("name", "LLM Variant"),
                "indicators": indicators,
                "entry_conditions": entry,
                "exit_conditions": exit_conds,
                "stop_loss_atr_multiple": float(variant.get("stop_loss_atr_multiple", 2.0)),
                "take_profit_atr_multiple": float(variant.get("take_profit_atr_multiple", 4.0)),
                "fee_bps": 50,
                "initial_capital": 10000.0,
                "warmup_bars": 30,
                "atr_period": 14,
            }
        except (ValueError, TypeError):
            return None

    def _template_to_config(self, template: dict) -> dict:
        """Convert a raw YAML template to engine config (fallback)."""
        return {
            "name": template.get("name", "Base Template"),
            "indicators": template.get("indicators", []),
            "entry_conditions": template.get("entry_conditions", []),
            "exit_conditions": template.get("exit_conditions", []),
            "stop_loss_atr_multiple": template.get("stop_loss_atr_multiple", 2.0),
            "take_profit_atr_multiple": template.get("take_profit_atr_multiple", 4.0),
            "fee_bps": 50,
            "initial_capital": 10000.0,
            "warmup_bars": 30,
            "atr_period": 14,
        }
````

- [ ] **Step 3: Write test for strategy generator**

Create `tests/test_strategy_gen.py`:

```python
"""Tests for strategy generator agent."""
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from agent.strategy_generator import StrategyGenerator


def test_normalize_variant_valid():
    gen = StrategyGenerator.__new__(StrategyGenerator)
    variant = {
        "name": "Test Variant",
        "indicators": [
            {"type": "EMA", "period": 12},
            {"type": "RSI", "period": 14},
            {"type": "ATR", "period": 14},
        ],
        "entry_conditions": [{"left": "EMA_12", "op": ">", "right": "close"}],
        "exit_conditions": [{"left": "RSI_14", "op": "<", "right": "30"}],
        "stop_loss_atr_multiple": 1.5,
        "take_profit_atr_multiple": 3.0,
    }
    result = gen._normalize_variant(variant)
    assert result is not None
    assert result["name"] == "Test Variant"
    assert result["fee_bps"] == 50
    assert result["warmup_bars"] == 30


def test_normalize_variant_adds_atr():
    gen = StrategyGenerator.__new__(StrategyGenerator)
    variant = {
        "name": "No ATR",
        "indicators": [{"type": "EMA", "period": 9}],
        "entry_conditions": [{"left": "EMA_9", "op": ">", "right": "close"}],
        "exit_conditions": [],
        "stop_loss_atr_multiple": 2.0,
        "take_profit_atr_multiple": 4.0,
    }
    result = gen._normalize_variant(variant)
    assert result is not None
    atr_indicators = [i for i in result["indicators"] if i["type"] == "ATR"]
    assert len(atr_indicators) >= 1


def test_normalize_variant_rejects_empty():
    gen = StrategyGenerator.__new__(StrategyGenerator)
    assert gen._normalize_variant({}) is None
    assert gen._normalize_variant({"indicators": []}) is None


def test_template_to_config():
    gen = StrategyGenerator.__new__(StrategyGenerator)
    template = {
        "name": "Momentum",
        "indicators": [{"type": "EMA", "period": 9}],
        "entry_conditions": [{"left": "EMA_9", "op": ">", "right": "close"}],
        "exit_conditions": [],
        "stop_loss_atr_multiple": 2.0,
        "take_profit_atr_multiple": 4.0,
    }
    config = gen._template_to_config(template)
    assert config["fee_bps"] == 50
    assert config["warmup_bars"] == 30
    assert config["atr_period"] == 14
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/kunal/arbiter && source .venv/bin/activate
pytest tests/test_strategy_gen.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(agent): strategy generator agent with LLM-based variant creation"
```

---

### Task 2: Optimization Advisor Agent

**Files:**

- Create: `agent/advisor.py`
- Create: `tests/test_advisor.py`

The Advisor reviews failed backtest results and generates actionable feedback for the next iteration.

- [ ] **Step 1: Create `agent/advisor.py`**

```python
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


# NVIDIA NIM model for optimization advice (strongest reasoning)
ADVISOR_MODEL = "nvidia/nemotron-3-ultra-550b-a55b"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/"


class OptimizationAdvisor:
    """Reviews failed backtests and suggests strategy improvements."""

    def __init__(self):
        api_key = settings.nvidia_api_key or settings.openai_api_key
        base_url = NVIDIA_BASE_URL if settings.nvidia_api_key else None
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = ADVISOR_MODEL if settings.nvidia_api_key else "gpt-4o-mini"

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
```

- [ ] **Step 2: Write test**

Create `tests/test_advisor.py`:

```python
"""Tests for the optimization advisor agent."""
from agent.advisor import OptimizationAdvisor


def test_advisor_init():
    advisor = OptimizationAdvisor.__new__(OptimizationAdvisor)
    assert advisor is not None
```

- [ ] **Step 3: Run tests and commit**

```bash
pytest tests/test_advisor.py -v
git add -A && git commit -m "feat(agent): optimization advisor agent for backtest feedback"
```

---

### Task 3: Closed-Loop Optimizer Orchestrator

**Files:**

- Create: `agent/optimizer.py`
- Modify: `config/settings.py`
- Modify: `agent/gate.py`

This is the core orchestrator that wires Generator → Backtest → Advisor in a loop.

- [ ] **Step 1: Add optimizer settings to `config/settings.py`**

Add these fields to the Settings class:

```python
    # NVIDIA NIM API (free models — build.nvidia.com)
    nvidia_api_key: str = ""

    # Optimizer settings
    optimizer_max_iterations: int = 3
    optimizer_num_variants: int = 3
    optimizer_enabled: bool = True
```

Also add to `.env.example`:
```bash
# NVIDIA NIM API (free models from build.nvidia.com)
NVIDIA_API_KEY=nvapi-...
```

- [ ] **Step 2: Add `validate_strategy_detailed()` to `agent/gate.py`**

This returns the raw backtest metrics alongside the gate result (needed for advisor feedback):

```python
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
```

- [ ] **Step 3: Create `agent/optimizer.py`**

```python
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
```

- [ ] **Step 4: Write optimizer tests**

Create `tests/test_optimizer.py`:

```python
"""Tests for the closed-loop strategy optimizer."""
import json
import pytest
from agent.optimizer import StrategyOptimizer, OptimizationResult
from agent.strategy import get_base_template, get_strategy_config
from agent.gate import validate_strategy_detailed
from data.models import Regime


def make_trending_bars(n: int = 200, start_price: float = 100.0) -> list[dict]:
    bars = []
    price = start_price
    for i in range(n):
        price *= 1.002
        noise = 0.005 * price * ((-1) ** i)
        bars.append({"ts": 1700000000 + i * 3600, "o": price + noise,
                      "h": price * 1.005, "l": price * 0.995,
                      "c": price - noise, "v": 1000000.0})
    return bars


def test_get_base_template():
    template = get_base_template(Regime.TRENDING_UP)
    assert "name" in template
    assert "indicators" in template
    assert "entry_conditions" in template


def test_validate_strategy_detailed_returns_tuple():
    bars = make_trending_bars(200)
    config = get_strategy_config(Regime.TRENDING_UP)
    gate_result, raw = validate_strategy_detailed(json.dumps(bars), json.dumps(config))
    assert hasattr(gate_result, "passed")
    assert "num_trades" in raw
    assert "trade_pnls" in raw


def test_optimization_result_creation():
    result = OptimizationResult(
        status="accepted",
        strategy_config={"name": "test"},
        iteration=1,
        total_iterations=3,
    )
    assert result.status == "accepted"
    assert result.iteration == 1
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_optimizer.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(agent): closed-loop strategy optimizer orchestrator"
```

---

### Task 4: Integrate Optimizer into Main Agent Loop

**Files:**

- Modify: `agent/main.py`

- [ ] **Step 1: Update `_scan_and_trade()` in `agent/main.py`**

Replace the section that calls `get_strategy_config()` + `validate_strategy()` with the optimizer:

The key change is in the `_scan_and_trade` method. After getting OHLCV bars for a candidate token, instead of:

```python
# OLD: Fixed strategy
strategy_config = get_strategy_config(regime)
gate_result = validate_strategy(bars_json, config_json)
if gate_result.passed:
    execute...
```

Use:

```python
# NEW: Optimizer loop (falls back to fixed strategy if disabled)
from agent.optimizer import StrategyOptimizer

if settings.optimizer_enabled:
    optimizer = StrategyOptimizer()
    opt_result = await optimizer.optimize(regime, bars_json)
    if opt_result.status == "accepted":
        strategy_config = opt_result.strategy_config
        # Execute trade with the optimized strategy
        success = await self._execute_entry(token.symbol, position_size, strategy_config)
        if success:
            executed += 1
            self._trades_today += 1
    else:
        logger.debug("optimizer.no_acceptable_strategy",
                      symbol=token.symbol, status=opt_result.status)
else:
    # Fallback: use fixed strategy templates
    strategy_config = get_strategy_config(regime)
    config_json = json.dumps(strategy_config)
    gate_result = validate_strategy(bars_json, config_json)
    if gate_result.passed:
        success = await self._execute_entry(token.symbol, position_size, strategy_config)
        if success:
            executed += 1
            self._trades_today += 1
```

Move `strategy_config = get_strategy_config(regime)` INSIDE the per-token loop since optimizer produces per-token strategies. Also move `position_size` calculation to after strategy is selected (uses the strategy's SL/TP values).

- [ ] **Step 2: Run full test suite**

```bash
cd /Users/kunal/arbiter && source .venv/bin/activate
pytest tests/ -v --tb=short
```

Expected: All 33+ tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(agent): integrate optimizer into scan-and-trade loop"
```

---

### Task 5: Persist Optimization History in PostgreSQL

**Files:**

- Modify: `server/models.py`
- Modify: `server/crud.py`
- Modify: `server/api.py`

- [ ] **Step 1: Add OptimizationRun model to `server/models.py`**

```python
class OptimizationRun(Base):
    """Record of a strategy optimization attempt."""
    __tablename__ = "optimization_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now(), index=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    regime: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20))  # accepted, best_effort, failed
    iterations_used: Mapped[int] = mapped_column(Integer)
    max_iterations: Mapped[int] = mapped_column(Integer)
    best_strategy_name: Mapped[str] = mapped_column(String(100), nullable=True)
    best_expectancy_pct: Mapped[float] = mapped_column(Float, nullable=True)
    best_return_pct: Mapped[float] = mapped_column(Float, nullable=True)
    best_win_rate: Mapped[float] = mapped_column(Float, nullable=True)
    best_num_trades: Mapped[int] = mapped_column(Integer, nullable=True)
    strategy_config_json: Mapped[str] = mapped_column(Text, nullable=True)
    last_feedback: Mapped[str] = mapped_column(Text, nullable=True)
    all_attempts_json: Mapped[str] = mapped_column(Text, nullable=True)
```

- [ ] **Step 2: Add CRUD operations to `server/crud.py`**

```python
from server.models import OptimizationRun

async def save_optimization_run(db: AsyncSession, **kwargs) -> OptimizationRun:
    run = OptimizationRun(**kwargs)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


async def get_optimization_history(db: AsyncSession, symbol: str | None = None, limit: int = 20) -> list[OptimizationRun]:
    query = select(OptimizationRun).order_by(desc(OptimizationRun.timestamp)).limit(limit)
    if symbol:
        query = query.where(OptimizationRun.symbol == symbol)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_last_feedback_for_regime(db: AsyncSession, regime: str) -> str | None:
    """Get the last optimization feedback for a regime to seed the next run."""
    result = await db.execute(
        select(OptimizationRun)
        .where(OptimizationRun.regime == regime)
        .where(OptimizationRun.last_feedback.isnot(None))
        .order_by(desc(OptimizationRun.timestamp))
        .limit(1)
    )
    run = result.scalar_one_or_none()
    return run.last_feedback if run else None
```

- [ ] **Step 3: Add `/api/optimize` endpoint to `server/api.py`**

```python
@app.post("/api/optimize")
async def run_optimization(req: BacktestRequest):
    """Run the strategy optimization loop for a symbol."""
    from agent.optimizer import StrategyOptimizer
    try:
        regime = Regime(req.regime)
    except ValueError:
        raise HTTPException(400, f"Invalid regime: {req.regime}")

    bars = await binance.fetch_ohlcv(req.symbol, interval=req.interval, limit=req.limit)
    if not bars or len(bars) < 50:
        raise HTTPException(400, f"Insufficient data for {req.symbol}")
    engine_bars = bars_to_engine_json(bars)

    optimizer = StrategyOptimizer()
    result = await optimizer.optimize(regime, json.dumps(engine_bars))

    return {
        "status": result.status,
        "iteration": result.iteration,
        "total_iterations": result.total_iterations,
        "strategy_name": result.strategy_config.get("name") if result.strategy_config else None,
        "passed": result.gate_result.passed if result.gate_result else False,
        "total_return_pct": result.gate_result.total_return_pct if result.gate_result else 0,
        "max_drawdown_pct": result.gate_result.max_drawdown_pct if result.gate_result else 0,
        "win_rate": result.gate_result.win_rate if result.gate_result else 0,
        "num_trades": result.gate_result.num_trades if result.gate_result else 0,
        "profit_factor": result.gate_result.profit_factor if result.gate_result else 0,
        "expectancy_pct": result.gate_result.expectancy_pct if result.gate_result else 0,
        "rejection_reasons": result.gate_result.rejection_reasons if result.gate_result else [],
        "all_attempts": result.all_attempts,
        "last_feedback": result.last_feedback,
        "strategy_config": result.strategy_config,
    }
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/ -v --tb=short
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(db): persist optimization history + /api/optimize endpoint"
```

---

### Task 6: Dashboard — Optimizer Panel

**Files:**

- Create: `dashboard/src/components/OptimizerPanel.tsx`
- Modify: `dashboard/src/pages/Dashboard.tsx`

- [ ] **Step 1: Create `dashboard/src/components/OptimizerPanel.tsx`**

A panel that lets you run the optimization loop from the dashboard, showing:

- Regime selector + Run button
- Live iteration progress (iteration 1/3... 2/3... 3/3)
- All attempts table with metrics
- Final result: accepted strategy config or best-effort
- Advisor feedback text

```typescript
import { useState } from 'react'
import { Zap, CheckCircle, XCircle, RefreshCw } from 'lucide-react'

interface Attempt {
  iteration: number
  strategy_name: string
  passed: boolean
  total_return_pct: number
  expectancy_pct: number
  win_rate: number
  num_trades: number
  profit_factor: number
  rejection_reasons: string[]
}

interface OptResult {
  status: string
  iteration: number
  total_iterations: number
  strategy_name: string | null
  passed: boolean
  total_return_pct: number
  max_drawdown_pct: number
  win_rate: number
  num_trades: number
  profit_factor: number
  expectancy_pct: number
  all_attempts: Attempt[]
  last_feedback: string
}

export function OptimizerPanel({ symbol }: { symbol: string }) {
  const [regime, setRegime] = useState('trending_up')
  const [result, setResult] = useState<OptResult | null>(null)
  const [loading, setLoading] = useState(false)

  const runOptimizer = async () => {
    setLoading(true)
    try {
      const resp = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, regime, interval: '1h', limit: 720 }),
      })
      if (resp.ok) setResult(await resp.json())
    } catch {}
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="neo-card p-4">
        <h2 className="font-bold text-lg mb-3">Strategy Optimizer</h2>
        <p className="text-sm opacity-60 mb-3">LLM generates strategy variations → Rust engine evaluates → Advisor suggests improvements → iterate</p>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide block mb-1">Regime</label>
            <select className="neo-select" value={regime} onChange={e => setRegime(e.target.value)}>
              <option value="trending_up">Trending Up</option>
              <option value="trending_down">Trending Down</option>
              <option value="mean_reverting">Mean Reverting</option>
              <option value="high_volatility">High Volatility</option>
              <option value="choppy">Choppy</option>
            </select>
          </div>
          <button onClick={runOptimizer} disabled={loading}
            className="neo-btn neo-btn-secondary text-white flex items-center gap-2">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
            {loading ? 'Optimizing...' : 'Run Optimizer'}
          </button>
        </div>
      </div>

      {result && (
        <>
          {/* Status */}
          <div className="neo-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Result</h3>
              <span className={`neo-badge ${result.status === 'accepted' ? 'neo-badge-success' : 'neo-badge-danger'}`}>
                {result.status === 'accepted' ? '✓ ACCEPTED' : result.status === 'best_effort' ? '~ BEST EFFORT' : '✗ FAILED'}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="p-2 border-2 border-border rounded">
                <span className="text-xs opacity-60 block">Strategy</span>
                <span className="font-bold font-mono">{result.strategy_name || '-'}</span>
              </div>
              <div className="p-2 border-2 border-border rounded">
                <span className="text-xs opacity-60 block">Iterations</span>
                <span className="font-bold font-mono">{result.iteration}/{result.total_iterations}</span>
              </div>
              <div className="p-2 border-2 border-border rounded">
                <span className="text-xs opacity-60 block">Expectancy</span>
                <span className={`font-bold font-mono ${result.expectancy_pct > 0 ? 'text-success' : 'text-danger'}`}>
                  {result.expectancy_pct.toFixed(2)}%
                </span>
              </div>
              <div className="p-2 border-2 border-border rounded">
                <span className="text-xs opacity-60 block">Variants Tested</span>
                <span className="font-bold font-mono">{result.all_attempts.length}</span>
              </div>
            </div>
          </div>

          {/* All Attempts */}
          <div className="neo-card p-4">
            <h3 className="font-bold mb-3">All Attempts ({result.all_attempts.length})</h3>
            <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b-2 border-border">
                    <th className="text-left py-2">Iter</th>
                    <th className="text-left py-2">Strategy</th>
                    <th className="text-right py-2">Return</th>
                    <th className="text-right py-2">Win%</th>
                    <th className="text-right py-2">Trades</th>
                    <th className="text-right py-2">Exp%</th>
                    <th className="text-center py-2">Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {result.all_attempts.map((a, i) => (
                    <tr key={i} className={`border-b border-border/30 ${a.passed ? 'bg-success/10' : ''}`}>
                      <td className="py-1.5 font-mono text-xs">{a.iteration}</td>
                      <td className="py-1.5 text-xs">{a.strategy_name}</td>
                      <td className={`py-1.5 text-right font-mono ${a.total_return_pct >= 0 ? 'text-success' : 'text-danger'}`}>
                        {a.total_return_pct.toFixed(2)}%
                      </td>
                      <td className="py-1.5 text-right font-mono">{a.win_rate.toFixed(1)}%</td>
                      <td className="py-1.5 text-right font-mono">{a.num_trades}</td>
                      <td className={`py-1.5 text-right font-mono font-bold ${a.expectancy_pct >= 0 ? 'text-success' : 'text-danger'}`}>
                        {a.expectancy_pct.toFixed(2)}%
                      </td>
                      <td className="py-1.5 text-center">
                        {a.passed ? <CheckCircle size={14} className="text-success inline" /> : <XCircle size={14} className="text-danger inline" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Feedback */}
          {result.last_feedback && (
            <div className="neo-card p-4">
              <h3 className="font-bold mb-2">Advisor Feedback</h3>
              <pre className="text-sm font-mono whitespace-pre-wrap opacity-70">{result.last_feedback}</pre>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add Optimizer tab to Dashboard**

In `dashboard/src/pages/Dashboard.tsx`, add:

```typescript
import { OptimizerPanel } from '../components/OptimizerPanel'
import { Sparkles } from 'lucide-react'

// Add to Tab type:
type Tab = 'chart' | 'backtest' | 'scanner' | 'portfolio' | 'status' | 'optimizer'

// Add to nav tabs array:
{ id: 'optimizer' as Tab, label: 'Optimizer', icon: Sparkles },

// Add to main render:
{activeTab === 'optimizer' && <OptimizerPanel symbol={symbol} />}
```

- [ ] **Step 3: Run dashboard build**

```bash
cd /Users/kunal/arbiter/dashboard && npx tsc --noEmit && npm run build
```

Expected: clean compile, successful build.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(dashboard): optimizer panel with iteration tracking + advisor feedback"
```

---

### Task 7: Final Verification

**Files:**

- None new — verification only

- [ ] **Step 1: Run full Python test suite**

```bash
cd /Users/kunal/arbiter && source .venv/bin/activate
pytest tests/ -v --tb=short
```

Expected: All pass (33 existing + 6 new = ~39).

- [ ] **Step 2: Run dashboard tests**

```bash
cd /Users/kunal/arbiter/dashboard && npx vitest run
```

Expected: All pass.

- [ ] **Step 3: Manual test of optimizer endpoint**

```bash
source .venv/bin/activate
python -c "
from fastapi.testclient import TestClient
from server.api import app
c = TestClient(app)
r = c.post('/api/optimize', json={'symbol':'BNB','regime':'trending_up','limit':200})
print(f'Status: {r.status_code}')
d = r.json()
print(f'Result: {d[\"status\"]} after {d[\"iteration\"]}/{d[\"total_iterations\"]} iterations')
print(f'Attempts: {len(d[\"all_attempts\"])}')
print(f'Best: {d[\"strategy_name\"]} exp={d[\"expectancy_pct\"]:.2f}%')
"
```

Note: This requires OPENAI_API_KEY set in .env. If not available, the generator falls back to the base template which still works but without LLM variations.

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A && git commit -m "chore: final verification fixes for optimizer integration"
```

---

## Summary of Deliverables

| Feature                                            | Task   |
| -------------------------------------------------- | ------ |
| Strategy Generator Agent (LLM → config variations) | Task 1 |
| Optimization Advisor Agent (backtest → feedback)   | Task 2 |
| Closed-loop Optimizer Orchestrator                 | Task 3 |
| Integration into main agent scan loop              | Task 4 |
| PostgreSQL persistence (optimization history)      | Task 5 |
| Dashboard Optimizer panel (run + view iterations)  | Task 6 |
| Full verification                                  | Task 7 |

## Design Decisions

1. **NVIDIA NIM free models** — DeepSeek V4 Flash for generation, Nemotron 3 Ultra for advising. Falls back to GPT-4o-mini if `NVIDIA_API_KEY` not set.
2. **Base template always included** — iteration 1 tests the base + LLM variants. This ensures we never do worse than before.
3. **`optimizer_enabled` flag** — can disable to fall back to static strategies without code changes.
4. **Seed feedback from DB** — `get_last_feedback_for_regime()` lets the optimizer resume from where it left off across sessions.
5. **All attempts tracked** — every variant tested is logged for analysis.
