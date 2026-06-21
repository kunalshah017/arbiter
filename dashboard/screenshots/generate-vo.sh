#!/bin/bash
# Generate voiceover segments for Arbiter demo video
# Each segment is timed to match the video flow (~133s total)

VOICE="Samantha"
RATE=175
OUT_DIR="/Users/kunal/arbiter/dashboard/screenshots/vo_segments"
mkdir -p "$OUT_DIR"

# Segment timings match the demo-record-v2.cjs flow
# Step 1: Landing (0s - 10s)
say -v "$VOICE" -r $RATE -o "$OUT_DIR/01.aiff" \
  "Welcome to Arbiter. An autonomous AI trading agent that validates every strategy through a high-performance Rust backtest engine before risking capital."

# Step 2: Workflow (10s - 20s)
say -v "$VOICE" -r $RATE -o "$OUT_DIR/02.aiff" \
  "The system follows a multi-agent workflow. Market data flows through an AI regime classifier, into strategy generation, and finally through Rust validation in under 50 milliseconds."

# Step 3: Features (20s - 30s)
say -v "$VOICE" -r $RATE -o "$OUT_DIR/03.aiff" \
  "Six core features: blazing speed with Rust, five-layer risk defense, AI-guided strategy tuning, non-custodial design, a live dashboard, and on-chain verification."

# Step 4: Stats (30s - 38s)
say -v "$VOICE" -r $RATE -o "$OUT_DIR/04.aiff" \
  "Performance metrics: sub-50 millisecond backtests, over one million OHLCV rows processed, five active risk layers, and one hundred percent custody retained by the user."

# Step 5: Navigate (38s - 45s)
say -v "$VOICE" -r $RATE -o "$OUT_DIR/05.aiff" \
  "Let's launch the trading terminal and see it in action."

# Step 6: Dashboard (45s - 55s)
say -v "$VOICE" -r $RATE -o "$OUT_DIR/06.aiff" \
  "This is the Arbiter Terminal. On the left, the strategy configuration panel. In the center, live OHLCV candlestick charts from Binance. On the right, the analytics panel."

# Step 7: NL Strategy (55s - 68s)
say -v "$VOICE" -r $RATE -o "$OUT_DIR/07.aiff" \
  "You can describe strategies in plain English. Here we're typing: Buy when EMA 9 crosses above EMA 21 and RSI is above 50. The AI converts this into a structured configuration."

# Step 8: Backtest (68s - 82s)
say -v "$VOICE" -r $RATE -o "$OUT_DIR/08.aiff" \
  "We also have five pre-validated regime strategies. Let's run the Momentum Breakout strategy on BNB USDT hourly candles. The Rust engine validates 30 days of data in under 50 milliseconds."

# Step 9-10: Results (82s - 100s)
say -v "$VOICE" -r $RATE -o "$OUT_DIR/09.aiff" \
  "Results are in. The chart shows entry and exit markers overlaid on candlesticks. The analytics panel displays total return, Sharpe ratio, win rate, profit factor, and a full trade log."

# Step 11: Config (100s - 108s)
say -v "$VOICE" -r $RATE -o "$OUT_DIR/10.aiff" \
  "The strategy configuration panel shows the gate validation status and deployed parameters."

# Step 12-13: Manual Builder (108s - 122s)
say -v "$VOICE" -r $RATE -o "$OUT_DIR/11.aiff" \
  "The manual strategy builder gives full control over indicators like EMA, RSI, ATR, and Bollinger Bands. You can configure entry conditions, exit rules, and risk parameters individually."

# Step 14: Closing (122s - 133s)
say -v "$VOICE" -r $RATE -o "$OUT_DIR/12.aiff" \
  "Arbiter. AI strategy optimization with Rust validation. Built for BNB Hack Track 2. Available on GitHub."

echo "All segments generated."
ls -la "$OUT_DIR"/*.aiff | wc -l
