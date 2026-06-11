import { useEffect, useState } from 'react'
import { Wallet, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'

interface Position {
    symbol: string; entry_price: number; current_price: number; pnl_pct: number; stop_loss: number; take_profit: number
}

interface Portfolio {
    total_value: number; daily_pnl: number; daily_pnl_pct: number; exposure_pct: number; cash: number; positions: Position[]
}

export function PortfolioPanel() {
    const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const fetchPortfolio = async () => {
        try {
            const resp = await fetch('/api/portfolio')
            if (!resp.ok) throw new Error('Failed to fetch portfolio')
            setPortfolio(await resp.json())
            setError('')
        } catch (e: any) { setError(e.message) }
        finally { setLoading(false) }
    }

    useEffect(() => { fetchPortfolio() }, [])

    if (loading) return <div className="neo-card p-8 text-center font-mono text-sm opacity-50">Loading portfolio...</div>
    if (error) return <div className="neo-card p-4 text-danger font-mono text-sm">{error}</div>
    if (!portfolio) return null

    return (
        <div className="space-y-4">
            <div className="neo-card p-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-lg flex items-center gap-2"><Wallet size={20} /> Portfolio</h2>
                    <button onClick={fetchPortfolio} className="neo-btn bg-white text-xs flex items-center gap-1">
                        <RefreshCw size={12} /> Refresh
                    </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCard label="Total Value" value={`$${portfolio.total_value.toLocaleString()}`} />
                    <MetricCard label="Daily P&L" value={`${portfolio.daily_pnl >= 0 ? '+' : ''}$${portfolio.daily_pnl.toFixed(2)}`}
                        color={portfolio.daily_pnl >= 0 ? 'text-success' : 'text-danger'}
                        icon={portfolio.daily_pnl >= 0 ? TrendingUp : TrendingDown} />
                    <MetricCard label="Exposure" value={`${portfolio.exposure_pct.toFixed(1)}%`} />
                    <MetricCard label="Cash" value={`$${portfolio.cash.toLocaleString()}`} />
                </div>
            </div>

            {portfolio.positions.length > 0 && (
                <div className="neo-card p-4">
                    <h3 className="font-bold text-sm mb-3 uppercase tracking-wide">Open Positions</h3>
                    <div className="overflow-auto border-2 border-border rounded">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr className="border-b-2 border-border">
                                    <th className="px-3 py-2 text-left font-bold">Symbol</th>
                                    <th className="px-3 py-2 text-right font-bold">Entry</th>
                                    <th className="px-3 py-2 text-right font-bold">Current</th>
                                    <th className="px-3 py-2 text-right font-bold">P&L</th>
                                    <th className="px-3 py-2 text-right font-bold">SL</th>
                                    <th className="px-3 py-2 text-right font-bold">TP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {portfolio.positions.map((p, i) => (
                                    <tr key={i} className="border-b border-border/50 hover:bg-gray-50">
                                        <td className="px-3 py-2 font-bold">{p.symbol}</td>
                                        <td className="px-3 py-2 font-mono text-right">${p.entry_price.toFixed(2)}</td>
                                        <td className="px-3 py-2 font-mono text-right">${p.current_price.toFixed(2)}</td>
                                        <td className={`px-3 py-2 font-mono text-right font-bold ${p.pnl_pct >= 0 ? 'text-success' : 'text-danger'}`}>
                                            {p.pnl_pct >= 0 ? '+' : ''}{p.pnl_pct.toFixed(2)}%
                                        </td>
                                        <td className="px-3 py-2 font-mono text-right">${p.stop_loss.toFixed(2)}</td>
                                        <td className="px-3 py-2 font-mono text-right">${p.take_profit.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}

function MetricCard({ label, value, color, icon: Icon }: { label: string; value: string; color?: string; icon?: any }) {
    return (
        <div className="neo-card p-3 !shadow-[2px_2px_0px_var(--color-border)]">
            <div className="flex items-center gap-2 mb-1">
                {Icon && <Icon size={14} className="opacity-50" />}
                <span className="text-xs font-bold uppercase tracking-wide opacity-60">{label}</span>
            </div>
            <p className={`font-mono font-bold text-lg ${color || ''}`}>{value}</p>
        </div>
    )
}
