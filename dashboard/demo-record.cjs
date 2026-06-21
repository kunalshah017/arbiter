"use strict";
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE_URL = "http://127.0.0.1:5173";
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
      font-size: 18px; font-weight: 600; letter-spacing: 0.3px;
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
  if (text) await page.waitForTimeout(800);
}

async function moveAndClick(page, locator, label, opts = {}) {
  const { postClickDelay = 800, ...clickOpts } = opts;
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
    await el.click(clickOpts);
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
      if (box && box.y < 700) {
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

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // ═══ STEP 1: LANDING PAGE ═══════════════════════════════════════════════
    await page.goto(BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(3000);
    await injectCursor(page);
    await injectSubtitleBar(page);

    await showSubtitle(page, "Step 1 — Landing Page Overview");
    await page.waitForTimeout(2500);

    // Pan over the hero section
    await page.mouse.move(720, 200, { steps: 10 });
    await page.waitForTimeout(1000);

    // Scroll down to workflow section
    await page.evaluate(() =>
      window.scrollTo({ top: 600, behavior: "smooth" }),
    );
    await page.waitForTimeout(2000);
    await showSubtitle(
      page,
      "Multi-agent AI workflow with Rust backtest engine",
    );
    await page.waitForTimeout(2500);

    // Scroll to features
    await page.evaluate(() =>
      window.scrollTo({ top: 1200, behavior: "smooth" }),
    );
    await page.waitForTimeout(2000);
    await showSubtitle(
      page,
      "6 core features: Speed, Defense, AI, Non-Custodial, Dashboard, On-Chain",
    );
    await page.waitForTimeout(2500);

    // Scroll to stats
    await page.evaluate(() =>
      window.scrollTo({ top: 1800, behavior: "smooth" }),
    );
    await page.waitForTimeout(2000);
    await showSubtitle(
      page,
      "Sub-50ms execution | 5 Risk Layers | 100% Non-Custodial",
    );
    await page.waitForTimeout(2000);

    // Scroll to CTA
    await page.evaluate(() =>
      window.scrollTo({ top: 2200, behavior: "smooth" }),
    );
    await page.waitForTimeout(1500);
    await showSubtitle(page, "");

    // ═══ STEP 2: NAVIGATE TO DASHBOARD ═══════════════════════════════════════
    await showSubtitle(page, "Step 2 — Launching the Trading Terminal");
    await page.waitForTimeout(1500);

    // Scroll back up to click Launch Terminal
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(1500);

    await moveAndClick(
      page,
      'a[href="/app"]:first-of-type',
      "Launch Terminal button",
      { postClickDelay: 3000 },
    );

    // Re-inject overlays after navigation
    await page.waitForTimeout(2000);
    await injectCursor(page);
    await injectSubtitleBar(page);

    await showSubtitle(
      page,
      "Step 3 — Arbiter Terminal: Strategy Configuration",
    );
    await page.waitForTimeout(3000);

    // Pan over the left panel
    await page.mouse.move(200, 300, { steps: 10 });
    await page.waitForTimeout(1000);
    await page.mouse.move(200, 500, { steps: 8 });
    await page.waitForTimeout(1000);

    // ═══ STEP 3: NATURAL LANGUAGE STRATEGY GENERATION ════════════════════════
    await showSubtitle(page, "Step 4 — Natural Language Strategy Generation");
    await page.waitForTimeout(1500);

    // Type a strategy description
    const prompt =
      "Buy when EMA 9 crosses above EMA 21 and RSI is above 50. Sell when RSI drops below 35.";
    await typeSlowly(page, "textarea", prompt, "strategy prompt", 25);
    await page.waitForTimeout(1500);

    // Show the generate button (don't click it - it requires API key)
    await page.mouse.move(200, 400, { steps: 8 });
    await page.waitForTimeout(1500);

    await showSubtitle(
      page,
      "AI converts natural language to structured strategy config",
    );
    await page.waitForTimeout(2500);

    // ═══ STEP 4: PREMADE STRATEGIES ═════════════════════════════════════════
    await showSubtitle(
      page,
      "Step 5 — Quick Strategies: Pre-validated for each regime",
    );
    await page.waitForTimeout(1500);

    // Pan over the premade strategy buttons
    await panElements(
      page,
      'button:has-text("Momentum"), button:has-text("Mean"), button:has-text("Volatility"), button:has-text("Cautious"), button:has-text("Tight")',
      5,
    );
    await page.waitForTimeout(1000);

    // ═══ STEP 5: RUN A BACKTEST ═════════════════════════════════════════════
    await showSubtitle(
      page,
      "Step 6 — Running Momentum Breakout backtest on BNB/USDT 1h",
    );
    await page.waitForTimeout(1500);

    // Click the Momentum Breakout strategy
    await moveAndClick(
      page,
      'button:has-text("Momentum Breakout")',
      "Momentum Breakout",
      { postClickDelay: 1000 },
    );

    // Wait for the backtest to complete (API call)
    await showSubtitle(
      page,
      "Rust engine backtesting 30 days of data in <50ms...",
    );
    await page.waitForTimeout(8000); // Wait for API response

    // ═══ STEP 6: RESULTS & ANALYTICS ════════════════════════════════════════
    await showSubtitle(
      page,
      "Step 7 — Backtest Results & Performance Analytics",
    );
    await page.waitForTimeout(2000);

    // Pan across the chart area
    await page.mouse.move(700, 400, { steps: 10 });
    await page.waitForTimeout(1500);
    await page.mouse.move(900, 400, { steps: 8 });
    await page.waitForTimeout(1000);

    // Pan over the right panel metrics
    await page.mouse.move(1250, 250, { steps: 10 });
    await page.waitForTimeout(1000);
    await page.mouse.move(1250, 400, { steps: 8 });
    await page.waitForTimeout(1000);
    await page.mouse.move(1250, 550, { steps: 8 });
    await page.waitForTimeout(1500);

    await showSubtitle(
      page,
      "Total Return, Win Rate, Profit Factor, Sharpe Ratio — all validated",
    );
    await page.waitForTimeout(3000);

    // ═══ STEP 7: STRATEGY CONFIG PANEL ══════════════════════════════════════
    await showSubtitle(
      page,
      "Step 8 — Review: Strategy config with gate pass/fail status",
    );
    await page.waitForTimeout(1500);

    // Pan the left panel showing results
    await page.mouse.move(180, 200, { steps: 8 });
    await page.waitForTimeout(1000);
    await page.mouse.move(180, 350, { steps: 8 });
    await page.waitForTimeout(1000);
    await page.mouse.move(180, 500, { steps: 8 });
    await page.waitForTimeout(1500);

    // ═══ STEP 8: CHANGE SYMBOL ══════════════════════════════════════════════
    await showSubtitle(page, "Step 9 — Switch tokens: supports 10+ pairs");
    await page.waitForTimeout(1500);

    // Click reset button first
    const resetBtn = page.locator('button:has-text("Reset")').first();
    if (await resetBtn.isVisible().catch(() => false)) {
      await moveAndClick(page, resetBtn, "Reset button", {
        postClickDelay: 1500,
      });
    }

    // Change symbol to ETH
    await moveAndClick(page, "select:first-of-type", "Symbol selector", {
      postClickDelay: 500,
    });
    await page.selectOption("select:first-of-type", "ETH");
    await page.waitForTimeout(2000);

    await showSubtitle(
      page,
      "Now showing ETH/USDT — live OHLCV data from Binance",
    );
    await page.waitForTimeout(3000);

    // ═══ STEP 9: MANUAL STRATEGY BUILDER ════════════════════════════════════
    await showSubtitle(
      page,
      "Step 10 — Manual Strategy Builder: Full control over indicators & rules",
    );
    await page.waitForTimeout(2000);

    // Click on indicators section
    const indicatorBtn = page.locator('button:has-text("Indicators")').first();
    if (await indicatorBtn.isVisible().catch(() => false)) {
      await moveAndClick(page, indicatorBtn, "Indicators section", {
        postClickDelay: 1000,
      });
    }
    await page.waitForTimeout(1500);

    // Show the entry rules
    const entryBtn = page.locator('button:has-text("Entry Rules")').first();
    if (await entryBtn.isVisible().catch(() => false)) {
      await moveAndClick(page, entryBtn, "Entry Rules", {
        postClickDelay: 1000,
      });
    }
    await page.waitForTimeout(1500);

    // Show exit rules
    const exitBtn = page.locator('button:has-text("Exit Rules")').first();
    if (await exitBtn.isVisible().catch(() => false)) {
      await moveAndClick(page, exitBtn, "Exit Rules", { postClickDelay: 1000 });
    }
    await page.waitForTimeout(1500);

    // Show risk params
    const riskBtn = page.locator('button:has-text("Risk Params")').first();
    if (await riskBtn.isVisible().catch(() => false)) {
      await moveAndClick(page, riskBtn, "Risk Params", {
        postClickDelay: 1500,
      });
    }

    await showSubtitle(
      page,
      "Configure indicators, entry/exit rules, and risk parameters",
    );
    await page.waitForTimeout(3000);

    // ═══ CLOSING ════════════════════════════════════════════════════════════
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
      } catch (e) {
        console.error("ERROR: Failed to copy video:", e.message);
      }
    }
    await browser.close();
  }
})();
