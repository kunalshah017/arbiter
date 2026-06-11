# Arbiter — Project Status Tracker

> Last updated: 2026-06-11
> Reference plan: [docs/superpowers/plans/2025-06-11-arbiter-implementation.md](docs/superpowers/plans/2025-06-11-arbiter-implementation.md)

---

## Overall Progress

| Task | Status | Notes |
|------|--------|-------|
| Task 1: Project Scaffold + Rust Engine | ✅ Complete | All files created, compiles clean |
| Task 2: Rust CryptoSpotRunner | ✅ Complete | 436-line runner with full state machine |
| Task 3: Python Data Layer | ✅ Complete | **Adapted:** Uses Binance (not CMC REST) for OHLCV |
| Task 4: Regime + Strategy + Gate | ✅ Complete | 5 regime strategies, LLM classifier, decision gate |
| Task 5: TWAK + Risk Management | ✅ Complete | Sizing, guardrails, portfolio tracking |
| Task 6: Token Scanner | ✅ Complete | Binance 24hr ticker ranking, 43 tokens |
| Task 7: Main Agent Loop | ✅ Complete | Scan/monitor/daily async loops |
| Task 8: Telegram Notifications | ✅ Complete | Entry/exit/daily/error alerts |
| Task 9: Docker + Deployment | ✅ Complete | Dockerfile + docker-compose.yml |
| Task 10: Registration + README | ✅ Complete | scripts/register.py + README.md |
| Task 11: Integration Tests | ✅ Complete | 7 integration tests + manual_backtest.py |
| Task 12: Final Verification | ⬜ Pending | Need to push, tag v0.1.0 |
| **Bonus: Dashboard UI** | ✅ Complete | Vite+React+lightweight-charts, neobrutalism |
| **Bonus: FastAPI Server** | ✅ Complete | /api/ohlcv, /api/backtest, /api/scanner |

---

## Test Suite Status

| Test File | Tests | Status |
|-----------|-------|--------|
| tests/test_engine.py | 7 | ✅ Pass |
| tests/test_gate.py | 3 | ✅ Pass |
| tests/test_transforms.py | 3 | ✅ Pass |
| tests/test_risk.py | 6 | ✅ Pass |
| tests/test_scanner.py | 4 | ✅ Pass |
| tests/test_integration.py | 7 | ✅ Pass |
| tests/test_api.py | 3 | ✅ Pass |
| dashboard (vitest) | 5 | ✅ Pass |
| **Total** | **38** | **All passing** |

---

## Architecture Deviations from Plan

| Plan says | Actual | Reason |
|-----------|--------|--------|
| CMC REST OHLCV | Binance public API | CMC OHLCV not available on free tier |
| CMC MCP for OHLCV | CMC MCP for regime signals only | MCP has no OHLCV tool (12 tools available) |
| `integrations/cmc.py` (REST+MCP) | `integrations/cmc.py` (MCP only) + `integrations/binance.py` | Split by data source |
| `data/transforms.py` (CMC format) | `data/transforms.py` (Binance kline format) | Different API response format |
| `conditions/` module (from Astryx) | Conditions inline in `runner.rs` | Simpler — no separate evaluator needed |
| `agent/scheduler.py` | Logic in `agent/main.py` | Single orchestrator class handles scheduling |
| `risk/competition.py` | Removed (was empty placeholder) | Guardrails cover competition DD cap |
| 149 tokens | 43 tokens | Filtered to Binance-available USDT pairs |
| `nautilus-indicators = "0.4"` | `nautilus-indicators = "0.54.0"` | Matched actual Astryx version |

---

## File Inventory vs Plan

### ✅ Implemented (matches plan)

```
engine/Cargo.toml
engine/src/lib.rs
engine/src/crypto/mod.rs
engine/src/crypto/config.rs
engine/src/crypto/runner.rs
engine/src/crypto/position.rs
engine/src/crypto/result.rs
engine/src/indicators/mod.rs
engine/src/indicators/registry.rs
engine/src/indicators/nautilus_wrapper.rs
agent/__init__.py
agent/main.py
agent/regime.py
agent/scanner.py
agent/strategy.py
agent/gate.py
agent/monitor.py
integrations/__init__.py
integrations/cmc.py
integrations/twak.py
integrations/bnb_sdk.py
risk/__init__.py
risk/portfolio.py
risk/guardrails.py
risk/sizing.py
data/__init__.py
data/db.py
data/models.py
data/transforms.py
config/settings.py
config/strategies.yaml
config/tokens.yaml
notifications/__init__.py
notifications/telegram.py
tests/test_engine.py
tests/test_gate.py
tests/test_scanner.py
tests/test_risk.py
tests/test_transforms.py
tests/test_integration.py
scripts/register.py
scripts/manual_backtest.py
pyproject.toml
Dockerfile
docker-compose.yml
.env.example
.gitignore
README.md
```

### ➕ Extra (not in plan, added)

```
integrations/binance.py          — Binance OHLCV client (replaces CMC REST)
server/__init__.py               — FastAPI server package
server/api.py                    — Dashboard backend API
tests/test_api.py                — API endpoint tests
arbiter/__init__.py              — Package init for maturin
dashboard/                       — Full React+Vite dashboard UI
.agents/skills/design-system/    — Neobrutalism design system skill
```

### ❌ Not implemented (from plan)

```
engine/src/conditions/mod.rs     — Conditions are inline in runner.rs
engine/src/conditions/evaluator.rs — Not needed (simplified)
config/__init__.py               — Exists but empty (fine)
integrations/x402_payer.py       — Removed (not needed, CMC MCP handles payment)
```

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Python files (non-empty) | 28 |
| Rust source files | 9 |
| Total lines (Python) | ~1,800 |
| Total lines (Rust) | ~960 |
| Test count | 38 |
| Technical indicators | 20 |
| Strategy regimes | 5 |
| Tradeable tokens | 43 |
| Backtest speed | <50ms per run |

---

## Remaining Work (Pre-Submission)

- [ ] Commit dashboard fix (OHLCVChart.tsx dispose error)
- [ ] Commit all pending changes (dashboard + server edits)
- [ ] Push to GitHub
- [ ] Tag `v0.1.0`
- [ ] Fund wallet with competition USDT on BSC
- [ ] Run `scripts/register.py` (ERC-8004 + competition)
- [ ] Deploy to VPS via `docker compose up -d`
- [ ] Verify Telegram notifications
- [ ] Record demo video
- [ ] Submit on DoraHacks

---

## How to Run

### Backend (API server for dashboard)
```bash
cd /Users/kunal/arbiter
source .venv/bin/activate
uvicorn server.api:app --reload --port 8000
```

### Dashboard
```bash
cd /Users/kunal/arbiter/dashboard
npm run dev
```
→ Open http://localhost:5173

### Full Agent (autonomous trading)
```bash
cd /Users/kunal/arbiter
source .venv/bin/activate
python -m agent.main
```

### Manual Backtest (single token)
```bash
python scripts/manual_backtest.py BNB trending_up
python scripts/manual_backtest.py ETH mean_reverting
```

### Run Tests
```bash
# Python tests (33)
pytest tests/ -v

# Dashboard tests (5)
cd dashboard && npx vitest run
```
