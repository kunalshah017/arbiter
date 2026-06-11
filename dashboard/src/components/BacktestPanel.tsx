import { useState } from 'react'
import { TrendingUp, TrendingDown, Activity, Target, Percent, CheckCircle, XCircle, BarChart3, Award } from 'lucide-react'

interface BacktestResult {
    symbol: string; regime: string; bars_count: number; passed: boolean
    total_return_pct: number; max_drawdown_pct: number; win_rate: number
    num_trades: number; profit_factor: number; expectancy_pct: number
    rejection_reasons: string[]
}

export function BacktestPanel({ symbol }: { symbol: string }) {
    const [regime, setRegime] = useState('trending_up')
    const [result, setResult] = useState<BacktestResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const runBacktest = async () => {
        setLoading(true); setError('')
        try {
            const resp = await fetch('/api/backtest', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol, regime, interval: '1h', limit: 720 }),
            })
            if (!resp.ok) { const d = await resp.json(); throw new Error(d.detail || 'Failed') }
            setResult(await resp.json())
        } catch (e: any) { setError(e.message) }
        finally { setLoading(false) }
    }

    return (
        <div className="space-y-4">
            <div className="neo-card p-4">
                <h2 className="font-bold text-lg mb-3">Run Backtest</h2>
                <div className="flex items-end gap-3">
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wide block mb-1">Symbol</label>
                        <div className="neo-input bg-gray-50 font-mono">{symbol}/USDT</div>
                    </div>
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
                    <button onClick={runBacktest} disabled={loading} className="neo-btn neo-btn-primary">
                        {loading ? 'Running...' : 'Run Backtest'}
                    </button>
                </div>
                {error && <p className="mt-2 text-danger font-mono text-sm">{error}</p>}
            </div>

            {result && (
                <div className="neo-card p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg">Results</h3>
                        <span className={`neo-badge ${result.passed ? 'neo-badge-success' : 'neo-badge-danger'}`}>
                            {result.passed ? '✓ GATE PASSED' : '✗ REJECTED'}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Metric icon={TrendingUp} label="Total Return" value={`${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct.toFixed(2)}%`} ok={result.total_return_pct > 0} />
                        <Metric icon={TrendingDown} label="Max Drawdown" value={`${result.max_drawdown_pct.toFixed(2)}%`} ok={result.max_drawdown_pct > -10} />
                        <Metric icon={Target} label="Win Rate" value={`${result.win_rate.toFixed(1)}%`} ok={result.win_rate > 50} />
                        <Metric icon={Activity} label="Trades" value={`${result.num_trades}`} ok={result.num_trades >= 5} />
                        <Metric icon={Award} label="Profit Factor" value={result.profit_factor === Infinity ? '∞' : result.profit_factor.toFixed(2)} ok={result.profit_factor > 1.5} />
                        <Metric icon={Percent} label="Expectancy" value={`${result.expectancy_pct >= 0 ? '+' : ''}${result.expectancy_pct.toFixed(2)}%`} ok={result.expectancy_pct > 0} />
                        <Metric icon={BarChart3} label="Bars" value={`${result.bars_count}`} ok={true} />
                        <Metric icon={result.passed ? CheckCircle : XCircle} label="Gate" value={result.passed ? 'PASSED' : 'FAILED'} ok={result.passed} />
                    </div>
                    {result.rejection_reasons.length > 0 && (
                        <div className="mt-4 p-3 bg-danger/10 border-2 border-danger rounded">
                            <p className="font-bold text-sm text-danger mb-1">Rejection Reasons:</p>
                            <ul className="text-sm font-mono space-y-1">{result.rejection_reasons.map((r, i) => <li key={i}>• {r}</li>)}</ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function Metric({ icon: Icon, label, value, ok }: { icon: any; label: string; value: string; ok: boolean }) {
    return (
        <div className="neo-card p-3 !shadow-[2px_2px_0px_var(--color-border)]">
            <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className="opacity-50" />
                <span className="text-xs font-bold uppercase tracking-wide opacity-60">{label}</span>
            </div>
            <p className={`font-mono font-bold text-lg ${ok ? 'text-success' : 'text-danger'}`}>{value}</p>
        </div>
    )
}
