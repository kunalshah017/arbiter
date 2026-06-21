"use strict";
const { firefox } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE_URL = "http://localhost:5173";
const VIDEO_DIR = path.join(__dirname, "screenshots");
const OUTPUT_NAME = "arbiter-demo.webm";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function injectCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById("demo-cursor")) return;
    const cursor = document.createElement("div");
    cursor.id = "demo-cursor";
    cursor.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
    cursor.style.cssText = `
      position: fixed; z-index: 999999; pointer-events: none;
      width: 24px; height: 24px;
      transition: left 0.08s linear, top 0.08s linear;
      filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.3));
    `;
    cursor.style.left = "0px";
    cursor.style.top = "0px";
    document.body.appendChild(cursor);
    document.addEventListener("mousemove", (e) => {
      cursor.style.left = e.clientX + "px";
      cursor.style.top = e.clientY + "px";
    });
  });
}

async function injectSubtitleBar(page) {
  await page.evaluate(() => {
    if (document.getElementById("demo-subtitle")) return;
    const bar = document.createElement("div");
    bar.id = "demo-subtitle";
    bar.style.cssText = `
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 999998;
      text-align: center; padding: 14px 24px;
      background: rgba(0, 0, 0, 0.8);
      color: white; font-family: -apple-system, "Segoe UI", sans-serif;
      font-size: 17px; font-weight: 600; letter-spacing: 0.3px;
      transition: opacity 0.3s;
      pointer-events: none;
    `;
    bar.textContent = "";
    bar.style.opacity = "0";
    document.body.appendChild(bar);
  });
}

async function showSubtitle(page, text) {
  await page.evaluate((t) => {
    const bar = document.getElementById("demo-subtitle");
    if (!bar) return;
    if (t) {
      bar.textContent = t;
      bar.style.opacity = "1";
    } else {
      bar.style.opacity = "0";
    }
  }, text);
  if (text) await page.waitForTimeout(600);
}

async function moveAndClick(page, locator, label, opts = {}) {
  const { postClickDelay = 800 } = opts;
  const el =
    typeof locator === "string" ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    console.error(`WARNING: moveAndClick skipped - "${label}" not visible`);
    return false;
  }
  try {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await el.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
        steps: 12,
      });
      await page.waitForTimeout(400);
    }
    await el.click();
  } catch (e) {
    console.error(`WARNING: moveAndClick failed on "${label}": ${e.message}`);
    return false;
  }
  await page.waitForTimeout(postClickDelay);
  return true;
}

async function typeSlowly(page, locator, text, label, charDelay = 30) {
  const el =
    typeof locator === "string" ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    console.error(`WARNING: typeSlowly skipped - "${label}" not visible`);
    return false;
  }
  await moveAndClick(page, el, label);
  await el.fill("");
  await el.pressSequentially(text, { delay: charDelay });
  await page.waitForTimeout(500);
  return true;
}

async function panElements(page, selector, maxCount = 6) {
  const elements = await page.locator(selector).all();
  for (let i = 0; i < Math.min(elements.length, maxCount); i++) {
    try {
      const box = await elements[i].boundingBox();
      if (box && box.y < 680) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
          steps: 8,
        });
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // skip
    }
  }
}

// ─── Main Recording ─────────────────────────────────────────────────────────

(async () => {
  if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

  console.log("Launching Firefox...");
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    // ═══ STEP 1: LANDING PAGE ═══════════════════════════════════════════════
    console.log("Step 1: Landing page...");
    await page.goto(BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(2000);
    await injectCursor(page);
    await injectSubtitleBar(page);

    await showSubtitle(
      page,
      "Step 1 — Landing Page: Execute on Evidence, Not Emotion",
    );
    await page.waitForTimeout(3000);

    // Pan over hero
    await page.mouse.move(640, 300, { steps: 10 });
    await page.waitForTimeout(1500);

    // ═══ STEP 2: SCROLL TO WORKFLOW ══════════════════════════════════════════
    console.log("Step 2: Workflow section...");
    await page.evaluate(() =>
      window.scrollTo({ top: 650, behavior: "smooth" }),
    );
    await page.waitForTimeout(2000);
    await showSubtitle(
      page,
      "Step 2 — Multi-Agent AI Workflow: Data → AI → Strategy → Rust Validation",
    );
    await page.waitForTimeout(3000);

    // Pan workflow cards
    await panElements(page, "h3");
    await page.waitForTimeout(1000);

    // ═══ STEP 3: FEATURES ════════════════════════════════════════════════════
    console.log("Step 3: Features...");
    await page.evaluate(() =>
      window.scrollTo({ top: 1250, behavior: "smooth" }),
    );
    await page.waitForTimeout(2000);
    await showSubtitle(
      page,
      "Step 3 — 6 Core Features: Speed, Defense, AI, Non-Custodial, Dashboard, On-Chain",
    );
    await page.waitForTimeout(3500);

    // ═══ STEP 4: STATS ══════════════════════════════════════════════════════
    console.log("Step 4: Stats...");
    await page.evaluate(() =>
      window.scrollTo({ top: 1850, behavior: "smooth" }),
    );
    await page.waitForTimeout(2000);
    await showSubtitle(
      page,
      "Step 4 — Performance: <50ms Backtests | 1M+ Rows | 5 Risk Layers | 100% Custody",
    );
    await page.waitForTimeout(3000);

    // ═══ STEP 5: NAVIGATE TO DASHBOARD ═══════════════════════════════════════
    console.log("Step 5: Navigate to Dashboard...");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(1500);
    await showSubtitle(page, "Step 5 — Launching the Trading Terminal");
    await page.waitForTimeout(1500);

    await moveAndClick(page, 'a[href="/app"]', "Launch Terminal link", {
      postClickDelay: 3000,
    });

    // Re-inject overlays after navigation
    await page.waitForTimeout(2000);
    await injectCursor(page);
    await injectSubtitleBar(page);

    // ═══ STEP 6: DASHBOARD OVERVIEW ══════════════════════════════════════════
    console.log("Step 6: Dashboard overview...");
    await showSubtitle(
      page,
      "Step 6 — Arbiter Terminal: Live OHLCV Chart + Strategy Builder",
    );
    await page.waitForTimeout(3000);

    // Pan across the interface
    await page.mouse.move(200, 350, { steps: 10 });
    await page.waitForTimeout(1000);
    await page.mouse.move(640, 400, { steps: 10 });
    await page.waitForTimeout(1000);
    await page.mouse.move(1100, 350, { steps: 10 });
    await page.waitForTimeout(1500);

    // ═══ STEP 7: NATURAL LANGUAGE INPUT ══════════════════════════════════════
    console.log("Step 7: Natural language strategy...");
    await showSubtitle(page, "Step 7 — Describe Strategy in Plain English");
    await page.waitForTimeout(1500);

    const prompt =
      "Buy when EMA 9 crosses above EMA 21 and RSI > 50. Sell when RSI drops below 35.";
    await typeSlowly(page, "textarea", prompt, "NL strategy prompt", 25);
    await page.waitForTimeout(2000);

    await showSubtitle(
      page,
      "AI converts natural language → structured indicator config",
    );
    await page.waitForTimeout(2500);

    // ═══ STEP 8: RUN PREMADE BACKTEST ════════════════════════════════════════
    console.log("Step 8: Run Momentum Breakout...");
    await showSubtitle(
      page,
      "Step 8 — Running Momentum Breakout on BNB/USDT (1h candles)",
    );
    await page.waitForTimeout(1500);

    await moveAndClick(
      page,
      'button:has-text("Momentum Breakout")',
      "Momentum Breakout",
      { postClickDelay: 1500 },
    );

    // Wait for backtest API response
    await showSubtitle(
      page,
      "Rust engine backtesting 30 days of OHLCV data...",
    );
    await page.waitForTimeout(8000);

    // ═══ STEP 9: VIEW RESULTS ════════════════════════════════════════════════
    console.log("Step 9: View results...");
    await showSubtitle(
      page,
      "Step 9 — Results: Backtest Chart with Trade Markers",
    );
    await page.waitForTimeout(3000);

    // Pan across chart area
    await page.mouse.move(640, 350, { steps: 10 });
    await page.waitForTimeout(1500);
    await page.mouse.move(800, 400, { steps: 8 });
    await page.waitForTimeout(1000);

    // ═══ STEP 10: ANALYTICS ══════════════════════════════════════════════════
    console.log("Step 10: Analytics panel...");
    await showSubtitle(
      page,
      "Step 10 — Analytics: Return, Sharpe, Win Rate, Profit Factor",
    );
    await page.waitForTimeout(2000);

    // Pan right panel metrics
    await page.mouse.move(1100, 200, { steps: 10 });
    await page.waitForTimeout(800);
    await page.mouse.move(1100, 350, { steps: 8 });
    await page.waitForTimeout(800);
    await page.mouse.move(1100, 500, { steps: 8 });
    await page.waitForTimeout(2000);

    // ═══ STEP 11: STRATEGY CONFIG PANEL ══════════════════════════════════════
    console.log("Step 11: Strategy config...");
    await showSubtitle(
      page,
      "Step 11 — Strategy Config: Gate Passed + Deployed Parameters",
    );
    await page.waitForTimeout(2000);

    // Pan left panel
    await page.mouse.move(150, 250, { steps: 8 });
    await page.waitForTimeout(1000);
    await page.mouse.move(150, 400, { steps: 8 });
    await page.waitForTimeout(2000);

    // ═══ STEP 12: RESET & TRY ANOTHER ═══════════════════════════════════════
    console.log("Step 12: Reset...");
    const resetBtn = page.locator('button:has-text("Reset")').first();
    if (await resetBtn.isVisible().catch(() => false)) {
      await showSubtitle(page, "Step 12 — Reset and Try Another Strategy");
      await moveAndClick(page, resetBtn, "Reset button", {
        postClickDelay: 2000,
      });
    }

    // ═══ STEP 13: MANUAL BUILDER ═════════════════════════════════════════════
    console.log("Step 13: Manual builder...");
    await showSubtitle(
      page,
      "Step 13 — Manual Builder: Indicators, Entry/Exit Rules, Risk Params",
    );
    await page.waitForTimeout(2000);

    // Show entry rules section
    const entryBtn = page.locator('button:has-text("Entry Rules")').first();
    if (await entryBtn.isVisible().catch(() => false)) {
      await moveAndClick(page, entryBtn, "Entry Rules", {
        postClickDelay: 1500,
      });
    }

    // Show exit rules
    const exitBtn = page.locator('button:has-text("Exit Rules")').first();
    if (await exitBtn.isVisible().catch(() => false)) {
      await moveAndClick(page, exitBtn, "Exit Rules", { postClickDelay: 1500 });
    }

    // Show risk params
    const riskBtn = page.locator('button:has-text("Risk Params")').first();
    if (await riskBtn.isVisible().catch(() => false)) {
      await moveAndClick(page, riskBtn, "Risk Params", {
        postClickDelay: 1500,
      });
    }

    await showSubtitle(
      page,
      "Full control: EMA, RSI, ATR, BBands + custom entry/exit conditions",
    );
    await page.waitForTimeout(3000);

    // ═══ STEP 14: RUN CUSTOM BACKTEST ════════════════════════════════════════
    console.log("Step 14: Run custom backtest...");
    await showSubtitle(
      page,
      "Step 14 — Run Custom Backtest with Manual Configuration",
    );
    await page.waitForTimeout(1500);

    await moveAndClick(
      page,
      'button:has-text("Run Custom Backtest")',
      "Run Custom Backtest",
      { postClickDelay: 1500 },
    );

    // Wait for results
    await showSubtitle(
      page,
      "Validating custom strategy through Rust engine...",
    );
    await page.waitForTimeout(8000);

    await showSubtitle(
      page,
      "Custom strategy validated — chart and metrics updated",
    );
    await page.waitForTimeout(3000);

    // ═══ CLOSING ════════════════════════════════════════════════════════════
    console.log("Closing frames...");
    await showSubtitle(
      page,
      "Arbiter — AI Strategy Optimization with Rust Validation",
    );
    await page.waitForTimeout(3000);
    await showSubtitle(
      page,
      "BNB Hack Track 2 | github.com/kunalshah017/arbiter",
    );
    await page.waitForTimeout(3000);
    await showSubtitle(page, "");
    await page.waitForTimeout(1500);

    console.log("Recording complete!");
  } catch (err) {
    console.error("DEMO ERROR:", err.message);
  } finally {
    await context.close();
    const video = page.video();
    if (video) {
      const src = await video.path();
      const dest = path.join(VIDEO_DIR, OUTPUT_NAME);
      try {
        fs.copyFileSync(src, dest);
        console.log("Video saved:", dest);
        // Clean up temp video
        if (src !== dest) fs.unlinkSync(src);
      } catch (e) {
        console.error("ERROR: Failed to copy video:", e.message);
      }
    }
    await browser.close();
  }
})();
