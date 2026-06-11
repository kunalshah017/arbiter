interface Trade {
    entry_ts: number; exit_ts: number; entry_price: number; exit_price: number; pnl_pct: number; side: string; duration_bars: number
}

export function TradeTable({ trades }: { trades: Trade[] }) {
    return (
        <div className="neo-card p-4">
            <h3 className="font-bold text-sm mb-3 uppercase tracking-wide">Trade Log</h3>
            <div className="overflow-auto max-h-[300px] border-2 border-border rounded">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                        <tr className="border-b-2 border-border">
                            <th className="px-3 py-2 text-left font-bold">#</th>
                            <th className="px-3 py-2 text-right font-bold">Entry</th>
                            <th className="px-3 py-2 text-right font-bold">Exit</th>
                            <th className="px-3 py-2 text-right font-bold">P&L %</th>
                            <th className="px-3 py-2 text-right font-bold">Bars</th>
                        </tr>
                    </thead>
                    <tbody>
                        {trades.map((t, i) => (
                            <tr key={i} className="border-b border-border/50 hover:bg-gray-50">
                                <td className="px-3 py-2 font-mono">{i + 1}</td>
                                <td className="px-3 py-2 font-mono text-right">${t.entry_price.toFixed(2)}</td>
                                <td className="px-3 py-2 font-mono text-right">${t.exit_price.toFixed(2)}</td>
                                <td className={`px-3 py-2 font-mono text-right font-bold ${t.pnl_pct >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct.toFixed(2)}%
                                </td>
                                <td className="px-3 py-2 font-mono text-right">{t.duration_bars}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
