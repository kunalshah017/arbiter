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


# LLM provider config — NVIDIA NIM (primary) or Google Gemini (fallback)
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
STRATEGY_MODEL_NVIDIA = "deepseek-ai/deepseek-v4-flash"
STRATEGY_MODEL_GEMINI = "gemini-3.5-flash"


def _get_llm_client_and_model(nvidia_model: str, gemini_model: str):
    """Resolve LLM client based on available API keys. NVIDIA NIM > Google Gemini."""
    if settings.nvidia_api_key:
        return AsyncOpenAI(api_key=settings.nvidia_api_key, base_url=NVIDIA_BASE_URL), nvidia_model
    if settings.google_api_key:
        return AsyncOpenAI(api_key=settings.google_api_key, base_url=GEMINI_BASE_URL), gemini_model
    raise ValueError("Set NVIDIA_API_KEY or GOOGLE_API_KEY in .env")


class StrategyGenerator:
    """Generates strategy config variations using an LLM."""

    def __init__(self):
        try:
            self._client, self._model = _get_llm_client_and_model(
                STRATEGY_MODEL_NVIDIA, STRATEGY_MODEL_GEMINI
            )
        except ValueError:
            logger.warning("strategy_gen.no_api_keys", msg="No LLM API keys found, will use base template fallback")
            self._client, self._model = None, None

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
        if not self._client:
            logger.warning("strategy_gen.fallback", msg="No LLM client, using base template")
            return [self._template_to_config(base_template)]

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
