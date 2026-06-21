# Arbiter — Project Status Tracker

> Last updated: 2026-06-21
> Track: **Track 2 — Strategy Skills ($6,000)**
> Reference plan: [docs/superpowers/plans/2025-06-11-arbiter-implementation.md](docs/superpowers/plans/2025-06-11-arbiter-implementation.md)

---

## Overall Progress

| Task                                   | Status      | Notes                                              |
| -------------------------------------- | ----------- | -------------------------------------------------- |
| Task 1: Project Scaffold + Rust Engine | ✅ Complete | All files created, compiles clean                  |
| Task 2: Rust CryptoSpotRunner          | ✅ Complete | 436-line runner with full state machine            |
| Task 3: Python Data Layer              | ✅ Complete | Uses Binance for OHLCV                             |
| Task 4: Regime + Strategy + Gate       | ✅ Complete | 5 regime strategies, LLM classifier, decision gate |
| Task 5: Risk Management                | ✅ Complete | Sizing, guardrails, portfolio tracking             |
| Task 6: Token Scanner                  | ✅ Complete | Binance 24hr ticker ranking, 43 tokens             |
| Task 7: Main Agent Loop                | ✅ Complete | Optimization loop orchestrator                     |
| Task 8: Telegram Notifications         | ✅ Complete | Strategy pass/fail alerts                          |
| Task 9: Docker + Deployment            | ✅ Complete | Dockerfile + docker-compose.yml                    |
| Task 10: README + Docs                 | ✅ Complete | Track 2 focused documentation                     |
| Task 11: Integration Tests             | ✅ Complete | 7 integration tests + manual_backtest.py           |
| Task 12: Strategy Optimizer            | ✅ Complete | Generator → Engine → Advisor feedback loop         |
| **Bonus: Dashboard UI**                | ✅ Complete | Vite+React+lightweight-charts, neobrutalism        |
| **Bonus: FastAPI Server**              | ✅ Complete | /api/ohlcv, /api/backtest, /api/scanner            |
| **Optional: TWAK Execution**           | ⬜ Bonus    | Not required for Track 2 (strategy-only)           |
| **Optional: BSC Live Trading**         | ⬜ Bonus    | Not required for Track 2 (strategy-only)           |

---

## Test Suite Status

| Test File                 | Tests  | Status          |
| ------------------------- | ------ | --------------- |
| tests/test_engine.py      | 7      | ✅ Pass         |
| tests/test_gate.py        | 3      | ✅ Pass         |
| tests/test_transforms.py  | 3      | ✅ Pass         |
| tests/test_risk.py        | 6      | ✅ Pass         |
| tests/test_scanner.py     | 4      | ✅ Pass         |
| tests/test_integration.py | 7      | ✅ Pass         |
| tests/test_api.py         | 3      | ✅ Pass         |
| tests/test_optimizer.py   | 4      | ✅ Pass         |
| tests/test_strategy_gen.py| 3      | ✅ Pass         |
| dashboard (vitest)        | 5      | ✅ Pass         |
| **Total**                 | **45** | **All passing** |

---

## Architecture Deviations from Plan

| Plan says                          | Actual                                                       | Reason                                       |
| ---------------------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| CMC REST OHLCV                     | Binance public API                                           | CMC OHLCV not available on free tier         |
| CMC MCP for OHLCV                  | CMC MCP for regime signals only                              | MCP has no OHLCV tool (12 tools available)   |
| `integrations/cmc.py` (REST+MCP)   | `integrations/cmc.py` (MCP only) + `integrations/binance.py` | Split by data source                         |
| `data/transforms.py` (CMC format)  | `data/transforms.py` (Binance kline format)                  | Different API response format                |
| `conditions/` module (from Astryx) | Conditions inline in `runner.rs`                             | Simpler — no separate evaluator needed       |
| `agent/scheduler.py`               | Logic in `agent/main.py`                                     | Single orchestrator class handles scheduling |
| 149 tokens                         | 43 tokens                                                    | Filtered to Binance-available USDT pairs     |

---

## Key Metrics

| Metric                   | Value         |
| ------------------------ | ------------- |
| Python files (non-empty) | 30            |
| Rust source files        | 9             |
| Total lines (Python)     | ~2,100        |
| Total lines (Rust)       | ~960          |
| Test count               | 45            |
| Technical indicators     | 22            |
| Strategy regimes         | 5             |
| Scannable tokens         | 43            |
| Backtest speed           | <50ms per run |
| Optimization iterations  | Up to 20/sec  |

---

## Remaining Work (Pre-Submission)

- [ ] Record demo video showing optimization loop in action
- [ ] Generate 3-5 example strategy specs with backtest proofs
- [ ] Write strategy documentation (what each regime strategy does)
- [ ] Push final code to GitHub
- [ ] Tag `v1.0.0`
- [ ] Submit on DoraHacks (strategy spec + backtest results + code)
- [ ] Prepare 2-minute walkthrough for judges

### Optional / Bonus:
- [ ] Wire up TWAK execution layer (for Best Use of BNB SDK prize)
- [ ] Deploy live agent on BSC (not required for Track 2)

---

## How to Run

### Strategy Optimization Loop (core feature)

```bash
cd /Users/kunal/arbiter
source .venv/bin/activate
python -m agent.main
```

### Manual Backtest (single token + regime)

```bash
python scripts/manual_backtest.py BNB trending_up
python scripts/manual_backtest.py ETH mean_reverting
python scripts/manual_backtest.py SOL high_volatility
```

### API Server (for dashboard)

```bash
uvicorn server.api:app --reload --port 8000
```

### Dashboard

```bash
cd /Users/kunal/arbiter/dashboard
npm run dev
```

→ Open http://localhost:5173

### Docker (full stack)

```bash
docker compose up -d
```

---

## Track 2 Submission Checklist

- [x] Strategy spec with entry/exit rules
- [x] Backtest results (Sharpe, drawdown, win rate, profit factor)
- [x] Source code (Python orchestrator + Rust engine)
- [x] CMC Agent Hub integration (MCP tools for regime classification)
- [x] Dashboard for visualization
- [ ] Demo video
- [ ] DoraHacks submission
