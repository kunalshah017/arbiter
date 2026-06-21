"""LLM-powered strategy variant generator."""
import json
import structlog
from openai import OpenAI
from config.settings import settings

logger = structlog.get_logger()

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"

NVIDIA_GENERATOR_MODEL = "deepseek-ai/deepseek-v4-flash"
GEMINI_GENERATOR_MODEL = "gemini-3.5-flash"


def _get_llm_client_and_model(nvidia_model: str, gemini_model: str) -> tuple[OpenAI, str]:
    """Get LLM client preferring NVIDIA NIM, falling back to Google Gemini."""
    if settings.nvidia_api_key:
        client = OpenAI(base_url=NVIDIA_BASE_URL,
                        api_key=settings.nvidia_api_key)
        return client, nvidia_model
    elif settings.google_api_key:
        client = OpenAI(base_url=GEMINI_BASE_URL,
                        api_key=settings.google_api_key)
        return client, gemini_model
    else:
        raise RuntimeError(
            "No LLM API key configured. Set NVIDIA_API_KEY or GOOGLE_API_KEY.")


SYSTEM_PROMPT = """You are a quantitative trading strategy designer. Given a base strategy template, generate variants that modify indicator parameters, entry/exit conditions, or stop-loss/take-profit levels.

Rules:
- Output ONLY a JSON array of strategy objects
- Each strategy must have: name, indicators, entry_conditions, exit_conditions, stop_loss_atr_multiple, take_profit_atr_multiple
- indicators is a list of objects with "type" and "period" keys
- entry_conditions and exit_conditions are lists of objects with "left", "op", "right" keys
- op must be one of: ">", "<", ">=", "<=", "crosses_above", "crosses_below"
- stop_loss_atr_multiple and take_profit_atr_multiple must be positive numbers
- Keep variants realistic and varied
- Do NOT include any text outside the JSON array"""


class StrategyGenerator:
    """Generates strategy variants using LLM."""

    def __init__(self):
        self.client, self.model = _get_llm_client_and_model(
            NVIDIA_GENERATOR_MODEL, GEMINI_GENERATOR_MODEL
        )

    def generate_variants(self, base_template: dict, num_variants: int = 3, feedback: str | None = None) -> list[dict]:
        """Generate strategy variants from a base template."""
        user_msg = f"Base strategy:\n```json\n{json.dumps(base_template, indent=2)}\n```\n\nGenerate {num_variants} variants."
        if feedback:
            user_msg += f"\n\nFeedback from previous iteration:\n{feedback}"

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.8,
                max_tokens=4096,
            )
            content = response.choices[0].message.content.strip()
            # Strip markdown code fences if present
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                content = content.rsplit("```", 1)[0]
            variants_raw = json.loads(content)
        except (json.JSONDecodeError, Exception) as e:
            logger.warning("strategy_generator.parse_failed", error=str(e))
            return []

        variants = []
        for v in variants_raw:
            normalized = self._normalize_variant(v)
            if normalized:
                variants.append(normalized)

        logger.info("strategy_generator.generated", count=len(variants))
        return variants

    def _normalize_variant(self, variant: dict) -> dict | None:
        """Validate and normalize a variant dict. Returns None if invalid."""
        required = ["name", "indicators", "entry_conditions", "exit_conditions",
                    "stop_loss_atr_multiple", "take_profit_atr_multiple"]
        for key in required:
            if key not in variant:
                return None

        if not variant["indicators"] or not variant["entry_conditions"]:
            return None

        # Ensure ATR indicator is present (needed for stop/TP)
        has_atr = any(i.get("type") == "ATR" for i in variant["indicators"])
        if not has_atr:
            variant["indicators"].append({"type": "ATR", "period": 14})

        return variant

    def _template_to_config(self, template: dict) -> dict:
        """Convert a strategy template to a Rust engine config dict."""
        return {
            "indicators": template["indicators"],
            "entry_conditions": template["entry_conditions"],
            "exit_conditions": template.get("exit_conditions", []),
            "stop_loss_atr_multiple": template.get("stop_loss_atr_multiple", 2.0),
            "take_profit_atr_multiple": template.get("take_profit_atr_multiple", 4.0),
            "fee_bps": 50,
            "initial_capital": 10000.0,
            "warmup_bars": 30,
            "atr_period": 14,
        }
