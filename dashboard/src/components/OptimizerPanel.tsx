import { useState } from 'react'
import { Zap, CheckCircle, XCircle, RefreshCw } from 'lucide-react'

interface Attempt {
  iteration: number
  strategy_name: string
  passed: boolean
  total_return_pct: number
  expectancy_pct: number
  win_rate: number
  num_trades: number
  profit_factor: number
  rejection_reasons: string[]
}

interface OptResult {
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
  all_attempts: Attempt[]
  last_feedback: string
}

export function OptimizerPanel({ symbol }: { symbol: string }) {
  const [regime, setRegime] = useState('trending_up')
  const [result, setResult] = useState<OptResult | null>(null)
  const [loading, setLoading] = useState(false)

  const runOptimizer = async () => {
    setLoading(true)
    try {
      const resp = await fetch('http://localhost:8000/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, regime, interval: '1h', limit: 720 }),
      })
      if (resp.ok) setResult(await resp.json())
    } catch {}
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="neo-card p-4">
        <h2 className="font-bold text-lg mb-3">Strategy Optimizer</h2>
        <p className="text-sm opacity-60 mb-3">LLM generates strategy variations → Rust engine evaluates → Advisor suggests improvements → iterate</p>
        <div className="flex items-end gap-3">
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
          <button onClick={runOptimizer} disabled={loading}
            className="neo-btn neo-btn-secondary text-white flex items-center gap-2">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
            {loading ? 'Optimizing...' : 'Run Optimizer'}
          </button>
        </div>
      </div>

      {result && (
        <>
          {/* Status */}
          <div className="neo-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Result</h3>
              <span className={`neo-badge ${result.status === 'accepted' ? 'neo-badge-success' : 'neo-badge-danger'}`}>
                {result.status === 'accepted' ? '✓ ACCEPTED' : result.status === 'best_effort' ? '~ BEST EFFORT' : '✗ FAILED'}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="p-2 border-2 border-border rounded">
                <span className="text-xs opacity-60 block">Strategy</span>
                <span className="font-bold font-mono">{result.strategy_name || '-'}</span>
              </div>
              <div className="p-2 border-2 border-border rounded">
                <span className="text-xs opacity-60 block">Iterations</span>
                <span className="font-bold font-mono">{result.iteration}/{result.total_iterations}</span>
              </div>
              <div className="p-2 border-2 border-border rounded">
                <span className="text-xs opacity-60 block">Expectancy</span>
                <span className={`font-bold font-mono ${result.expectancy_pct > 0 ? 'text-success' : 'text-danger'}`}>
                  {result.expectancy_pct?.toFixed(2)}%
                </span>
              </div>
              <div className="p-2 border-2 border-border rounded">
                <span className="text-xs opacity-60 block">Variants Tested</span>
                <span className="font-bold font-mono">{result.all_attempts.length}</span>
              </div>
            </div>
          </div>

          {/* All Attempts */}
          <div className="neo-card p-4">
            <h3 className="font-bold mb-3">All Attempts ({result.all_attempts.length})</h3>
            <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b-2 border-border">
                    <th className="text-left py-2">Iter</th>
                    <th className="text-left py-2">Strategy</th>
                    <th className="text-right py-2">Return</th>
                    <th className="text-right py-2">Win%</th>
                    <th className="text-right py-2">Trades</th>
                    <th className="text-right py-2">Exp%</th>
                    <th className="text-center py-2">Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {result.all_attempts.map((a, i) => (
                    <tr key={i} className={`border-b border-border/30 ${a.passed ? 'bg-success/10' : ''}`}>
                      <td className="py-1.5 font-mono text-xs">{a.iteration}</td>
                      <td className="py-1.5 text-xs">{a.strategy_name}</td>
                      <td className={`py-1.5 text-right font-mono ${a.total_return_pct >= 0 ? 'text-success' : 'text-danger'}`}>
                        {a.total_return_pct?.toFixed(2)}%
                      </td>
                      <td className="py-1.5 text-right font-mono">{a.win_rate?.toFixed(1)}%</td>
                      <td className="py-1.5 text-right font-mono">{a.num_trades}</td>
                      <td className={`py-1.5 text-right font-mono font-bold ${a.expectancy_pct >= 0 ? 'text-success' : 'text-danger'}`}>
                        {a.expectancy_pct?.toFixed(2)}%
                      </td>
                      <td className="py-1.5 text-center">
                        {a.passed ? <CheckCircle size={14} className="text-success inline" /> : <XCircle size={14} className="text-danger inline" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Feedback */}
          {result.last_feedback && (
            <div className="neo-card p-4">
              <h3 className="font-bold mb-2">Advisor Feedback</h3>
              <pre className="text-sm font-mono whitespace-pre-wrap opacity-70">{result.last_feedback}</pre>
            </div>
          )}
        </>
      )}
    </div>
  )
}
