import { useState } from 'react'
import { Search } from 'lucide-react'

interface TokenResult { symbol: string; price: number; volume_24h: number; change_24h_pct: number; momentum_score: number }

export function ScannerPanel() {
  const [regime, setRegime] = useState('trending_up')
  const [results, setResults] = useState<TokenResult[]>([])
  const [loading, setLoading] = useState(false)

  const runScan = async () => {
    setLoading(true)
    try { const r = await fetch(`/api/scanner/${regime}?top_n=15`); if (r.ok) setResults(await r.json()) } catch {}
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="neo-card p-4">
        <h2 className="font-bold text-lg mb-3">Token Scanner</h2>
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
          <button onClick={runScan} disabled={loading} className="neo-btn neo-btn-secondary text-white">
            <Search size={14} className="inline mr-1" />{loading ? 'Scanning...' : 'Scan Tokens'}
          </button>
        </div>
      </div>
      {results.length > 0 && (
        <div className="neo-card p-4">
          <h3 className="font-bold mb-3">Top {results.length} Candidates</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b-2 border-border">
              <th className="text-left py-2 font-bold">#</th>
              <th className="text-left py-2 font-bold">Symbol</th>
              <th className="text-right py-2 font-bold">Price</th>
              <th className="text-right py-2 font-bold">24h Vol</th>
              <th className="text-right py-2 font-bold">24h %</th>
              <th className="text-right py-2 font-bold">Score</th>
            </tr></thead>
            <tbody>{results.map((t, i) => (
              <tr key={t.symbol} className="border-b border-border/30 hover:bg-primary/10">
                <td className="py-2 font-mono text-xs opacity-50">{i+1}</td>
                <td className="py-2 font-bold">{t.symbol}</td>
                <td className="py-2 text-right font-mono">${t.price<1?t.price.toFixed(6):t.price.toFixed(2)}</td>
                <td className="py-2 text-right font-mono text-xs">${(t.volume_24h/1e6).toFixed(1)}M</td>
                <td className={`py-2 text-right font-mono font-bold ${t.change_24h_pct>=0?'text-success':'text-danger'}`}>
                  {t.change_24h_pct>=0?'+':''}{t.change_24h_pct.toFixed(2)}%
                </td>
                <td className="py-2 text-right"><span className="neo-badge bg-primary/20 text-text font-mono">{t.momentum_score.toFixed(1)}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
