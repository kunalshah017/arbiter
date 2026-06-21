import { useState } from 'react'
import { Sparkles, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react'

interface Attempt {
    name: string
    iteration: number
    passed: boolean
    return_pct: number
    win_rate: number
    num_trades: number
    drawdown_pct: number
}

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
    all_attempts: Attempt[]
    last_feedback: string | null
    strategy_config: Record<string, any> | null
}

export function OptimizerPanel({ symbol }: { symbol: string }) {
    const [regime, setRegime] = useState('trending_up')
    const [result, setResult] = useState<OptimizeResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const runOptimizer = async () => {
        setLoading(true); setError('')
        try {
            const resp = await fetch('/api/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol, regime, interval: '1h', limit: 720 }),
            })
            if (!resp.ok) { const d = await resp.json(); throw new Error(d.detail || 'Failed') }
            setResult(await resp.json())
        } catch (e: any) { setError(e.message) }
        finally { setLoading(false) }
    }

    const statusBadge = (status: string) => {
        switch (status) {
            case 'accepted':
                return <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 border-2 border-green-600 text-green-800 font-bold text-xs rounded"><CheckCircle size={12} />ACCEPTED</span>
            case 'exhausted':
                return <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 border-2 border-yellow-600 text-yellow-800 font-bold text-xs rounded"><AlertTriangle size={12} />BEST EFFORT</span>
            default:
                return <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 border-2 border-red-600 text-red-800 font-bold text-xs rounded"><XCircle size={12} />FAILED</span>
        }
    }

    return (
        <div className="space-y-4">
            <div className="neo-card p-4">
                <h2 className="font-bold text-lg mb-3 flex items-center gap-2"><Sparkles size={20} />Strategy Optimizer</h2>
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
                            <option value="volatile">Volatile</option>
                        </select>
                    </div>
                    <button onClick={runOptimizer} disabled={loading} className="neo-btn neo-btn-secondary flex items-center gap-2">
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        {loading ? 'Optimizing...' : 'Run Optimizer'}
                    </button>
                </div>
                {error && <p className="mt-2 text-red-600 font-bold text-sm">{error}</p>}
            </div>

            {result && (
                <>
                    <div className="neo-card p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold">Result</h3>
                            {statusBadge(result.status)}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="neo-card p-3 text-center">
                                <div className="text-xs font-bold uppercase opacity-60">Strategy</div>
                                <div className="font-mono font-bold text-sm mt-1">{result.strategy_name || '—'}</div>
                            </div>
                            <div className="neo-card p-3 text-center">
                                <div className="text-xs font-bold uppercase opacity-60">Iterations</div>
                                <div className="font-mono font-bold text-sm mt-1">{result.iteration}/{result.total_iterations}</div>
                            </div>
                            <div className="neo-card p-3 text-center">
                                <div className="text-xs font-bold uppercase opacity-60">Expectancy</div>
                                <div className="font-mono font-bold text-sm mt-1">{result.expectancy_pct.toFixed(2)}%</div>
                            </div>
                            <div className="neo-card p-3 text-center">
                                <div className="text-xs font-bold uppercase opacity-60">Variants Tested</div>
                                <div className="font-mono font-bold text-sm mt-1">{result.all_attempts.length}</div>
                            </div>
                        </div>
                        {result.status === 'accepted' && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                                <div className="neo-card p-3 text-center">
                                    <div className="text-xs font-bold uppercase opacity-60">Return</div>
                                    <div className={`font-mono font-bold text-sm mt-1 ${result.total_return_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>{result.total_return_pct.toFixed(2)}%</div>
                                </div>
                                <div className="neo-card p-3 text-center">
                                    <div className="text-xs font-bold uppercase opacity-60">Win Rate</div>
                                    <div className="font-mono font-bold text-sm mt-1">{(result.win_rate * 100).toFixed(1)}%</div>
                                </div>
                                <div className="neo-card p-3 text-center">
                                    <div className="text-xs font-bold uppercase opacity-60">Trades</div>
                                    <div className="font-mono font-bold text-sm mt-1">{result.num_trades}</div>
                                </div>
                                <div className="neo-card p-3 text-center">
                                    <div className="text-xs font-bold uppercase opacity-60">Profit Factor</div>
                                    <div className="font-mono font-bold text-sm mt-1">{result.profit_factor.toFixed(2)}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {result.all_attempts.length > 0 && (
                        <div className="neo-card p-4">
                            <h3 className="font-bold mb-3">All Attempts</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm font-mono">
                                    <thead>
                                        <tr className="border-b-2 border-border">
                                            <th className="text-left p-2">#</th>
                                            <th className="text-left p-2">Strategy</th>
                                            <th className="text-right p-2">Return%</th>
                                            <th className="text-right p-2">Win%</th>
                                            <th className="text-right p-2">Trades</th>
                                            <th className="text-right p-2">DD%</th>
                                            <th className="text-center p-2">Gate</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.all_attempts.map((a, i) => (
                                            <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                                                <td className="p-2">{a.iteration}</td>
                                                <td className="p-2">{a.name}</td>
                                                <td className={`p-2 text-right ${a.return_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>{a.return_pct.toFixed(2)}</td>
                                                <td className="p-2 text-right">{(a.win_rate * 100).toFixed(1)}</td>
                                                <td className="p-2 text-right">{a.num_trades}</td>
                                                <td className="p-2 text-right text-red-600">{a.drawdown_pct.toFixed(2)}</td>
                                                <td className="p-2 text-center">{a.passed ? <CheckCircle size={14} className="inline text-green-600" /> : <XCircle size={14} className="inline text-red-400" />}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {result.last_feedback && (
                        <div className="neo-card p-4">
                            <h3 className="font-bold mb-2">Advisor Feedback</h3>
                            <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-50 border-2 border-border p-3 rounded">{result.last_feedback}</pre>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
