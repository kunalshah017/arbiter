import { useState } from 'react'
import { Link } from 'react-router-dom'
import Markdown from 'react-markdown'
import { OHLCVChart } from '../components/OHLCVChart'
import { BacktestChart } from '../components/BacktestChart'
import { EquityCurve } from '../components/EquityCurve'
import { TradeTable } from '../components/TradeTable'
import { ArbiterLogo } from '../components/ArbiterLogo'
import {
    Activity, TrendingUp, TrendingDown, Target, Percent, Award,
    BarChart3, Zap, CheckCircle, XCircle, Sparkles, Search,
    AlertTriangle, Loader2, Shield, Settings2, History, RotateCcw
} from 'lucide-react'

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
    { value: 'high_volatility', label: 'Volatile' },
    { value: 'choppy', label: 'Choppy' },
]

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
    label: string; value: string | React.ReactNode; icon: React.ElementType; color?: string
}) {
    return (
        <div className="neo-card p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1 opacity-60">
                <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
                <Icon size={14} />
            </div>
            <div className={`font-mono font-bold text-lg leading-tight ${color || ''}`}>{value}</div>
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'accepted':
            return (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 border-2 border-green-600 text-green-800 font-bold text-[10px] uppercase rounded">
                    <CheckCircle size={12} />Optimized
                </span>
            )
        case 'best_effort':
            return (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 border-2 border-yellow-600 text-yellow-800 font-bold text-[10px] uppercase rounded">
                    <AlertTriangle size={12} />Best Effort
                </span>
            )
        default:
            return (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 border-2 border-red-600 text-red-800 font-bold text-[10px] uppercase rounded">
                    <XCircle size={12} />Failed
                </span>
            )
    }
}

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

            // Normalize endpoint differences
            if (!data.status) data.status = data.passed ? 'accepted' : 'best_effort'
            if (!data.iteration) data.iteration = 1
            if (!data.total_iterations) data.total_iterations = 1

            // Fetch chart geometry if missing
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

    const resetView = () => {
        setResult(null)
        setError('')
    }

    const trades = result?.trades ?? []
    const derived = computeDerivedMetrics(trades)
    const winCount = trades.filter(t => t.pnl_pct >= 0).length
    const lossCount = trades.filter(t => t.pnl_pct < 0).length

    return (
        <div className="h-screen w-screen overflow-hidden bg-surface flex flex-col font-sans text-text">
            {/* ── HEADER ─────────────────────────────────────────────────── */}
            <header className="h-16 shrink-0 bg-white border-b-[2.5px] border-border px-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                    <Link to="/" className="hover:-translate-y-0.5 transition-transform" title="Back to Landing">
                        <ArbiterLogo />
                    </Link>
                    <div className="hidden sm:block">
                        <h1 className="text-xl font-bold tracking-tight leading-none mb-0.5">Arbiter Terminal</h1>
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-success animate-pulse"></span>
                            <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">Live</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Toolbar Form */}
                    <div className="flex items-center gap-2 bg-gray-50 border-[2.5px] border-border rounded p-1">
                        <select
                            className="bg-transparent border-r-[2px] border-border/30 px-2 py-1 text-sm font-bold outline-none cursor-pointer"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value)}
                        >
                            {SYMBOLS.map(s => <option key={s} value={s}>{s}/USDT</option>)}
                        </select>
                        <select
                            className="bg-transparent border-r-[2px] border-border/30 px-2 py-1 text-sm font-bold outline-none cursor-pointer"
                            value={interval}
                            onChange={(e) => setInterval_(e.target.value)}
                        >
                            {INTERVALS.map(iv => <option key={iv} value={iv}>{iv}</option>)}
                        </select>
                        <select
                            className="bg-transparent px-2 py-1 text-sm font-bold outline-none cursor-pointer w-32 truncate"
                            value={regime}
                            onChange={e => setRegime(e.target.value)}
                        >
                            {REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => runOptimize(false)}
                            disabled={isRunning}
                            className="neo-btn neo-btn-primary flex items-center gap-2 px-4 py-1.5 min-w-[120px] justify-center"
                        >
                            {isRunning ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
                            {isRunning ? 'Running...' : 'Backtest'}
                        </button>
                        <button
                            onClick={() => runOptimize(true)}
                            disabled={isRunning}
                            className="neo-btn neo-btn-secondary text-white flex items-center gap-2 px-4 py-1.5"
                            title="Multi-Agent LLM Optimizer"
                        >
                            <Sparkles size={16} />
                            <span className="hidden sm:inline">Optimize</span>
                        </button>
                        {result && (
                            <button onClick={resetView} className="neo-btn bg-white px-2 py-1.5 border-border" title="Reset View">
                                <RotateCcw size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* ── WORKSPACE ──────────────────────────────────────────────── */}
            <div className="flex-1 flex overflow-hidden">

                {/* ── LEFT PANE: STRATEGY & OPTIMIZER ── */}
                <aside className="w-80 shrink-0 bg-white border-r-[2.5px] border-border flex flex-col overflow-y-auto hidden md:flex">
                    <div className="p-4 border-b-[2.5px] border-border bg-gray-50 flex items-center gap-2">
                        <Settings2 size={16} />
                        <h2 className="font-bold text-sm uppercase tracking-wider">Strategy Config</h2>
                    </div>
                    <div className="p-4 flex-1">
                        {error && (
                            <div className="mb-4 neo-card p-3 border-red-500 bg-red-50 text-red-700 font-bold text-xs">
                                {error}
                            </div>
                        )}

                        {!result ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-40 text-center gap-3">
                                <Search size={32} />
                                <p className="text-xs font-bold uppercase">Ready to backtest</p>
                                <p className="text-[10px]">Select constraints above and hit Run to evaluate strategy edge.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Optimizer Status */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <StatusBadge status={result.status} />
                                        <span className="font-mono text-xs font-bold">Iter {result.iteration}/{result.total_iterations}</span>
                                    </div>
                                    {result.strategy_name && (
                                        <div className="bg-primary/20 p-2 border-2 border-primary rounded text-xs font-bold">
                                            {result.strategy_name}
                                        </div>
                                    )}
                                    {result.passed ? (
                                        <div className="text-xs text-green-700 font-bold flex items-center gap-1.5 bg-green-50 p-2 border-2 border-green-200 rounded">
                                            <Shield size={14} /> Gate Passed: Viable Strategy
                                        </div>
                                    ) : (
                                        <div className="text-xs text-red-700 font-bold flex items-center gap-1.5 bg-red-50 p-2 border-2 border-red-200 rounded">
                                            <AlertTriangle size={14} /> Gate Failed: Not Viable
                                        </div>
                                    )}
                                </div>

                                {/* Rejection Reasons */}
                                {((result.rejection_reasons?.length ?? 0) > 0) && (
                                    <div>
                                        <h3 className="text-[10px] font-bold uppercase opacity-50 mb-2">Gate Rejections</h3>
                                        <div className="space-y-1">
                                            {result.rejection_reasons?.map((r, i) => (
                                                <div key={i} className="text-xs text-red-600 flex items-start gap-1.5 font-mono">
                                                    <XCircle size={12} className="shrink-0 mt-0.5" />{r}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Advisor Feedback */}
                                {result.last_feedback && (
                                    <div>
                                        <h3 className="text-[10px] font-bold uppercase opacity-50 mb-2 flex items-center gap-1">
                                            <Sparkles size={12} /> Advisor Feedback
                                        </h3>
                                        <div className="p-3 bg-gray-50 border-2 border-border/20 rounded text-xs leading-relaxed prose prose-xs max-w-none font-sans">
                                            <Markdown>{result.last_feedback}</Markdown>
                                        </div>
                                    </div>
                                )}

                                {/* Technical Params */}
                                {result.strategy_config && (
                                    <div>
                                        <h3 className="text-[10px] font-bold uppercase opacity-50 mb-2">Deployed Parameters</h3>
                                        <div className="space-y-1 text-xs font-mono bg-surface p-2 border-2 border-border/20 rounded max-h-[300px] overflow-y-auto">
                                            {Object.entries(result.strategy_config).map(([key, val]) => (
                                                <div key={key} className="flex justify-between gap-2 py-1 border-b border-border/10 last:border-b-0">
                                                    <span className="opacity-60 shrink-0">{key}</span>
                                                    <span className="font-bold text-right truncate">
                                                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </aside>

                {/* ── CENTER PANE: CHARTS ── */}
                <main className="flex-1 flex flex-col min-w-0 bg-surface">
                    {/* Top Chart Area */}
                    <div className="flex-1 p-2 min-h-0 flex flex-col">
                        <div className="neo-card flex-1 flex flex-col overflow-hidden relative">
                            {/* Overlay info */}
                            <div className="absolute top-4 left-4 z-10 pointer-events-none">
                                <span className="font-bold text-lg bg-white/80 px-2 py-1 rounded border-2 border-border backdrop-blur-sm">
                                    {symbol} / USDT <span className="text-secondary tracking-widest text-xs uppercase">{interval}</span>
                                </span>
                            </div>

                            {result?.bars && result?.trades ? (
                                <BacktestChart bars={result.bars} trades={result.trades} equityCurve={result.equity_curve as number[] || []} />
                            ) : (
                                <OHLCVChart symbol={symbol} />
                            )}
                        </div>
                    </div>

                    {/* Bottom Equity Area */}
                    {result && result.equity_curve && (
                        <div className="h-48 p-2 shrink-0 border-t-[2.5px] border-border bg-white flex flex-col">
                            <h3 className="text-[10px] font-bold uppercase opacity-60 ml-2 mb-1">Portfolio Equity</h3>
                            <div className="flex-1 neo-card overflow-hidden">
                                <EquityCurve data={result.equity_curve} />
                            </div>
                        </div>
                    )}
                </main>

                {/* ── RIGHT PANE: METRICS & TRADES ── */}
                <aside className="w-[380px] shrink-0 bg-white border-l-[2.5px] border-border flex flex-col overflow-hidden hidden lg:flex">
                    <div className="p-4 border-b-[2.5px] border-border bg-gray-50 flex items-center gap-2">
                        <History size={16} />
                        <h2 className="font-bold text-sm uppercase tracking-wider">Analytics</h2>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-surface p-3 space-y-3">
                        {!result ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-40 text-center gap-3">
                                <BarChart3 size={32} />
                                <p className="text-xs font-bold uppercase">No data</p>
                            </div>
                        ) : (
                            <>
                                {/* Primary Metrics Grid */}
                                <div className="grid grid-cols-2 gap-2">
                                    <MetricCard
                                        label="Total Return"
                                        value={`${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct.toFixed(2)}%`}
                                        icon={TrendingUp}
                                        color={result.total_return_pct >= 0 ? 'text-success' : 'text-danger'}
                                    />
                                    <MetricCard
                                        label="Expectancy"
                                        value={`${result.expectancy_pct >= 0 ? '+' : ''}${result.expectancy_pct.toFixed(2)}%`}
                                        icon={Percent}
                                        color={result.expectancy_pct >= 0 ? 'text-success' : 'text-danger'}
                                    />
                                    <MetricCard
                                        label="Max Drawdown"
                                        value={`${result.max_drawdown_pct.toFixed(2)}%`}
                                        icon={TrendingDown}
                                        color="text-danger"
                                    />
                                    <MetricCard
                                        label="Win Rate"
                                        value={<div className="flex items-baseline gap-1">
                                            <span>{(result.win_rate).toFixed(1)}%</span>
                                            <span className="text-[10px] opacity-40">({winCount}/{trades.length})</span>
                                        </div>}
                                        icon={Target}
                                        color={result.win_rate >= 50 ? 'text-success' : 'text-danger'}
                                    />
                                    <MetricCard
                                        label="Profit Factor"
                                        value={result.profit_factor.toFixed(2)}
                                        icon={Award}
                                        color={result.profit_factor >= 1.5 ? 'text-success' : result.profit_factor >= 1 ? 'text-yellow-600' : 'text-danger'}
                                    />
                                    <MetricCard
                                        label="Sharpe Ratio"
                                        value={derived.sharpe.toFixed(2)}
                                        icon={Activity}
                                        color={derived.sharpe >= 1 ? 'text-success' : derived.sharpe >= 0 ? 'text-yellow-600' : 'text-danger'}
                                    />
                                </div>

                                {/* Secondary Metrics */}
                                <div className="neo-card p-3 font-mono text-[11px] space-y-2">
                                    <div className="flex justify-between border-b border-border/10 pb-1">
                                        <span className="opacity-60">Avg Win</span>
                                        <span className="text-success font-bold">+{derived.avgWin.toFixed(2)}%</span>
                                    </div>
                                    <div className="flex justify-between border-b border-border/10 pb-1">
                                        <span className="opacity-60">Avg Loss</span>
                                        <span className="text-danger font-bold">{derived.avgLoss.toFixed(2)}%</span>
                                    </div>
                                    <div className="flex justify-between border-b border-border/10 pb-1">
                                        <span className="opacity-60">Best Trade</span>
                                        <span className="text-success font-bold">+{derived.bestTrade.toFixed(2)}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="opacity-60">Worst Trade</span>
                                        <span className="text-danger font-bold">{derived.worstTrade.toFixed(2)}%</span>
                                    </div>
                                </div>

                                {/* Trade Bar */}
                                {trades.length > 0 && (
                                    <div className="neo-card p-3">
                                        <h3 className="text-[10px] font-bold uppercase tracking-wider mb-2 opacity-60">W/L Distribution</h3>
                                        <div className="flex items-center w-full h-4 rounded overflow-hidden border-2 border-border mb-2">
                                            <div className="h-full bg-success" style={{ width: `${(winCount / trades.length) * 100}%` }}></div>
                                            <div className="h-full bg-danger" style={{ width: `${(lossCount / trades.length) * 100}%` }}></div>
                                        </div>
                                        <div className="flex justify-between text-[10px] font-bold">
                                            <span className="text-success">{winCount} WINS</span>
                                            <span className="text-danger">{lossCount} LOSSES</span>
                                        </div>
                                    </div>
                                )}

                                {/* Trade List */}
                                {trades.length > 0 && (
                                    <div className="p-0 border-t-0 border-x-0 border-b-0">
                                        <TradeTable trades={trades} />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    )
}
