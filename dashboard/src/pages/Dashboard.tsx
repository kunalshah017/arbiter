import { useState } from 'react'
import { Link } from 'react-router-dom'
import { OHLCVChart } from '../components/OHLCVChart'
import { BacktestChart } from '../components/BacktestChart'
import { EquityCurve } from '../components/EquityCurve'
import { TradeTable } from '../components/TradeTable'
import {
    Activity, TrendingUp, TrendingDown, Target, Percent, Award,
    BarChart3, Zap, CheckCircle, XCircle, Sparkles,
    AlertTriangle, Loader2, Shield
} from 'lucide-react'

/* ── types ────────────────────────────────────────── */

interface Trade {
    entry_ts: number; exit_ts: number; entry_price: number; exit_price: number
    pnl_pct: number; side: string; duration_bars: number
}
interface EquityPoint { trade_num: number; equity: number }
interface Bar { ts: number; o: number; h: number; l: number; c: number; v: number }

interface OptimizeResult {
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
    rejection_reasons: string[]
    all_attempts: { name: string; iteration: number; passed: boolean; return_pct: number; win_rate: number; num_trades: number; drawdown_pct: number }[]
    last_feedback: string | null
    strategy_config: Record<string, unknown> | null
    bars?: Bar[]
    trades?: Trade[]
    equity_curve?: EquityPoint[] | number[]
}

const SYMBOLS = ['BNB', 'ETH', 'XRP', 'DOGE', 'ADA', 'LINK', 'AVAX', 'DOT', 'UNI', 'CAKE']
const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d']
const REGIMES = [
    { value: 'trending_up', label: 'Trending Up' },
    { value: 'trending_down', label: 'Trending Down' },
    { value: 'mean_reverting', label: 'Mean Reverting' },
    { value: 'volatile', label: 'Volatile' },
]

/* ── helpers ──────────────────────────────────────── */

function computeDerivedMetrics(trades: Trade[]) {
    const pnls = trades.map(t => t.pnl_pct)
    if (pnls.length === 0) return { sharpe: 0, bestTrade: 0, worstTrade: 0, avgWin: 0, avgLoss: 0 }

    const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length
    const variance = pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / pnls.length
    const std = Math.sqrt(variance)
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0

    const wins = pnls.filter(p => p >= 0)
    const losses = pnls.filter(p => p < 0)
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0
    const bestTrade = Math.max(...pnls)
    const worstTrade = Math.min(...pnls)

    return { sharpe, bestTrade, worstTrade, avgWin, avgLoss }
}

function MetricCard({ label, value, icon: Icon, color }: {
    label: string; value: string; icon: React.ElementType; color?: string
}) {
    return (
        <div className="neo-card p-3">
            <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className="opacity-50" />
                <span className="text-[11px] font-bold uppercase tracking-wide opacity-60">{label}</span>
            </div>
            <div className={`font-mono font-bold text-lg ${color || ''}`}>{value}</div>
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'accepted':
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 border-2 border-green-600 text-green-800 font-bold text-xs rounded">
                    <CheckCircle size={14} />OPTIMIZED ✓
                </span>
            )
        case 'exhausted':
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-100 border-2 border-yellow-600 text-yellow-800 font-bold text-xs rounded">
                    <AlertTriangle size={14} />BEST EFFORT
                </span>
            )
        default:
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 border-2 border-red-600 text-red-800 font-bold text-xs rounded">
                    <XCircle size={14} />FAILED
                </span>
            )
    }
}

/* ── main component ──────────────────────────────── */

export function Dashboard() {
    const [symbol, setSymbol] = useState('BNB')
    const [interval, setInterval_] = useState('1m')
    const [regime, setRegime] = useState('trending_up')
    const [result, setResult] = useState<OptimizeResult | null>(null)
    const [isRunning, setIsRunning] = useState(false)
    const [error, setError] = useState('')

    const runOptimize = async (useOptimizer = false) => {
        setIsRunning(true)
        setError('')
        try {
            const endpoint = useOptimizer ? '/api/optimize' : '/api/backtest/detailed'
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol, regime, interval, limit: 1000 }),
            })
            if (!resp.ok) {
                const d = await resp.json()
                throw new Error(d.detail || 'Request failed')
            }
            const data: OptimizeResult = await resp.json()

            // backtest/detailed returns slightly different shape — normalize
            if (!data.status) data.status = data.passed ? 'accepted' : 'best_effort'
            if (!data.iteration) data.iteration = 1
            if (!data.total_iterations) data.total_iterations = 1

            // If optimize doesn't return bars/trades, fetch a detailed backtest for chart data
            if (!data.bars || !data.trades) {
                const btResp = await fetch('/api/backtest/detailed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ symbol, regime, interval, limit: 1000 }),
                })
                if (btResp.ok) {
                    const bt = await btResp.json()
                    data.bars = bt.bars
                    data.trades = bt.trades
                    data.equity_curve = bt.equity_curve
                    if (!data.total_return_pct && bt.total_return_pct != null) data.total_return_pct = bt.total_return_pct
                    if (!data.max_drawdown_pct && bt.max_drawdown_pct != null) data.max_drawdown_pct = bt.max_drawdown_pct
                    if (!data.win_rate && bt.win_rate != null) data.win_rate = bt.win_rate
                    if (!data.profit_factor && bt.profit_factor != null) data.profit_factor = bt.profit_factor
                    if (!data.expectancy_pct && bt.expectancy_pct != null) data.expectancy_pct = bt.expectancy_pct
                    if (!data.num_trades && bt.num_trades != null) data.num_trades = bt.num_trades
                }
            }

            setResult(data)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unknown error')
        } finally {
            setIsRunning(false)
        }
    }

    const trades = result?.trades ?? []
    const derived = computeDerivedMetrics(trades)
    const winCount = trades.filter(t => t.pnl_pct >= 0).length
    const lossCount = trades.filter(t => t.pnl_pct < 0).length

    return (
        <div className="min-h-screen bg-surface p-4 space-y-4">
            {/* ── HEADER ──────────────────────────────────── */}
            <header className="neo-card p-4 flex flex-wrap items-center gap-4">
                <Link
                    to="/"
                    className="w-10 h-10 bg-primary border-[2.5px] border-border rounded flex items-center justify-center font-bold text-lg shrink-0"
                >
                    A
                </Link>
                <div className="mr-auto">
                    <h1 className="text-xl font-bold tracking-tight">Arbiter</h1>
                    <p className="text-xs opacity-50 font-mono">Backtest-Validated Trading</p>
                </div>

                <select
                    className="neo-select text-sm"
                    value={symbol}
                    onChange={e => setSymbol(e.target.value)}
                >
                    {SYMBOLS.map(s => (
                        <option key={s} value={s}>{s}/USDT</option>
                    ))}
                </select>

                <div className="flex gap-1">
                    {INTERVALS.map(iv => (
                        <button
                            key={iv}
                            onClick={() => setInterval_(iv)}
                            className={`neo-btn text-xs px-3 py-1 ${interval === iv ? 'neo-btn-primary' : 'bg-white'}`}
                        >
                            {iv}
                        </button>
                    ))}
                </div>

                <select
                    className="neo-select text-sm"
                    value={regime}
                    onChange={e => setRegime(e.target.value)}
                >
                    {REGIMES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                </select>

                <button
                    onClick={() => runOptimize(false)}
                    disabled={isRunning}
                    className="neo-btn neo-btn-primary flex items-center gap-2 text-sm"
                >
                    {isRunning ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                    {isRunning ? 'Running…' : 'Backtest'}
                </button>

                <button
                    onClick={() => runOptimize(true)}
                    disabled={isRunning}
                    className="neo-btn neo-btn-secondary flex items-center gap-2 text-sm"
                    title="Uses LLM to generate and test strategy variations (slower, requires API key)"
                >
                    <Sparkles size={16} />
                    Optimize
                </button>

                {result && <StatusBadge status={result.status} />}
            </header>

            {error && (
                <div className="neo-card p-3 border-red-500 bg-red-50 text-red-700 font-bold text-sm">
                    {error}
                </div>
            )}

            {/* ── MAIN GRID: chart + sidebar ─────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                    {result?.bars && result?.trades ? (
                        <BacktestChart bars={result.bars} trades={result.trades} />
                    ) : (
                        <OHLCVChart symbol={symbol} />
                    )}
                </div>

                <div className="space-y-4">
                    <div className="neo-card p-4">
                        <h3 className="font-bold text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
                            <Zap size={14} />Strategy Config
                        </h3>
                        {result?.strategy_config ? (
                            <div className="space-y-2 text-xs font-mono max-h-[280px] overflow-auto">
                                {Object.entries(result.strategy_config).map(([key, val]) => (
                                    <div key={key} className="flex justify-between gap-2 py-1 border-b border-border/20">
                                        <span className="opacity-60 shrink-0">{key}</span>
                                        <span className="font-bold text-right truncate">
                                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs opacity-50">Run a backtest to see strategy configuration.</p>
                        )}
                    </div>

                    <div className="neo-card p-4">
                        <h3 className="font-bold text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
                            <Sparkles size={14} />Optimization Status
                        </h3>
                        {result ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="opacity-60">Iteration</span>
                                    <span className="font-mono font-bold">{result.iteration}/{result.total_iterations}</span>
                                </div>
                                {result.strategy_name && (
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="opacity-60">Strategy</span>
                                        <span className="font-mono font-bold text-xs">{result.strategy_name}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between text-sm">
                                    <span className="opacity-60">Variants Tested</span>
                                    <span className="font-mono font-bold">{result.all_attempts.length}</span>
                                </div>
                                {result.last_feedback && (
                                    <div className="mt-2 p-2 bg-gray-50 border-2 border-border/30 rounded text-xs leading-relaxed">
                                        <span className="font-bold uppercase text-[10px] opacity-50 block mb-1">Advisor Feedback</span>
                                        {result.last_feedback}
                                    </div>
                                )}
                                {result.rejection_reasons.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                        <span className="font-bold uppercase text-[10px] opacity-50">Rejection Reasons</span>
                                        {result.rejection_reasons.map((r, i) => (
                                            <div key={i} className="text-xs text-danger flex items-start gap-1">
                                                <XCircle size={12} className="shrink-0 mt-0.5" />{r}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs opacity-50">No optimization run yet.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── METRICS BAR ────────────────────────────── */}
            {result && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <MetricCard
                            label="Total Return"
                            value={`${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct.toFixed(2)}%`}
                            icon={TrendingUp}
                            color={result.total_return_pct >= 0 ? 'text-success' : 'text-danger'}
                        />
                        <MetricCard
                            label="Max Drawdown"
                            value={`${result.max_drawdown_pct.toFixed(2)}%`}
                            icon={TrendingDown}
                            color="text-danger"
                        />
                        <MetricCard
                            label="Win Rate"
                            value={`${(result.win_rate * 100).toFixed(1)}% (${winCount}/${trades.length})`}
                            icon={Target}
                            color={result.win_rate >= 0.5 ? 'text-success' : 'text-danger'}
                        />
                        <MetricCard
                            label="Profit Factor"
                            value={result.profit_factor.toFixed(2)}
                            icon={Award}
                            color={result.profit_factor >= 1.5 ? 'text-success' : result.profit_factor >= 1 ? 'text-warning' : 'text-danger'}
                        />
                        <MetricCard
                            label="Expectancy"
                            value={`${result.expectancy_pct >= 0 ? '+' : ''}${result.expectancy_pct.toFixed(2)}%`}
                            icon={Percent}
                            color={result.expectancy_pct >= 0 ? 'text-success' : 'text-danger'}
                        />
                        <MetricCard
                            label="Num Trades"
                            value={String(result.num_trades)}
                            icon={BarChart3}
                        />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <MetricCard
                            label="Sharpe Ratio"
                            value={derived.sharpe.toFixed(2)}
                            icon={Activity}
                            color={derived.sharpe >= 1 ? 'text-success' : derived.sharpe >= 0 ? 'text-warning' : 'text-danger'}
                        />
                        <MetricCard
                            label="Best Trade"
                            value={`${derived.bestTrade >= 0 ? '+' : ''}${derived.bestTrade.toFixed(2)}%`}
                            icon={TrendingUp}
                            color="text-success"
                        />
                        <MetricCard
                            label="Worst Trade"
                            value={`${derived.worstTrade.toFixed(2)}%`}
                            icon={TrendingDown}
                            color="text-danger"
                        />
                        <MetricCard
                            label="Avg Win"
                            value={`+${derived.avgWin.toFixed(2)}%`}
                            icon={CheckCircle}
                            color="text-success"
                        />
                        <MetricCard
                            label="Avg Loss"
                            value={`${derived.avgLoss.toFixed(2)}%`}
                            icon={XCircle}
                            color="text-danger"
                        />
                        <MetricCard
                            label="Gate Status"
                            value={result.passed ? 'PASSED' : 'FAILED'}
                            icon={Shield}
                            color={result.passed ? 'text-success' : 'text-danger'}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <EquityCurve data={result.equity_curve} />

                        <div className="neo-card p-4">
                            <h3 className="font-bold text-sm uppercase tracking-wide mb-3">Trade Distribution</h3>
                            <div className="flex items-end gap-1 h-[200px]">
                                {trades.length > 0 ? (
                                    <>
                                        <div className="flex-1 flex flex-col items-center justify-end h-full gap-2">
                                            <div className="w-full flex items-end justify-center gap-4 h-full">
                                                <div className="flex flex-col items-center gap-1 flex-1">
                                                    <span className="font-mono font-bold text-success text-sm">{winCount}</span>
                                                    <div
                                                        className="w-full bg-success/20 border-2 border-success rounded-t"
                                                        style={{ height: `${trades.length > 0 ? (winCount / trades.length) * 160 : 0}px` }}
                                                    />
                                                    <span className="text-[10px] font-bold uppercase opacity-60">Wins</span>
                                                </div>
                                                <div className="flex flex-col items-center gap-1 flex-1">
                                                    <span className="font-mono font-bold text-danger text-sm">{lossCount}</span>
                                                    <div
                                                        className="w-full bg-danger/20 border-2 border-danger rounded-t"
                                                        style={{ height: `${trades.length > 0 ? (lossCount / trades.length) * 160 : 0}px` }}
                                                    />
                                                    <span className="text-[10px] font-bold uppercase opacity-60">Losses</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-1 flex flex-col h-full">
                                            <span className="text-[10px] font-bold uppercase opacity-60 mb-1 text-center">P&L Spread</span>
                                            <div className="flex items-end gap-px h-full">
                                                {trades.slice(0, 40).map((t, i) => (
                                                    <div
                                                        key={i}
                                                        className={`flex-1 min-w-[3px] rounded-t ${t.pnl_pct >= 0 ? 'bg-success' : 'bg-danger'}`}
                                                        style={{ height: `${Math.min(Math.abs(t.pnl_pct) * 20, 160)}px` }}
                                                        title={`Trade ${i + 1}: ${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct.toFixed(2)}%`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs opacity-50">
                                        No trades to display
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {trades.length > 0 && <TradeTable trades={trades} />}
                </>
            )}

            {!result && !isRunning && (
                <div className="neo-card p-8 text-center">
                    <Sparkles size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="font-bold text-lg mb-1">Ready to Optimize</p>
                    <p className="text-sm opacity-50">
                        Select a symbol, interval, and regime, then click <strong>Run Backtest</strong> to auto-optimize and see comprehensive results.
                    </p>
                </div>
            )}
        </div>
    )
}
