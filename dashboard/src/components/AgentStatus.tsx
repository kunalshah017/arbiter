import { useEffect, useState } from 'react'
import { Radio, Clock, Activity, BarChart3, Zap } from 'lucide-react'

interface AgentState {
    running: boolean; regime: string; trades_today: number; last_scan: string; uptime: string
}

export function AgentStatus() {
    const [status, setStatus] = useState<AgentState | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const fetchStatus = async () => {
        try {
            const resp = await fetch('/api/agent/status')
            if (!resp.ok) throw new Error('Failed to fetch agent status')
            setStatus(await resp.json())
            setError('')
        } catch (e: any) { setError(e.message) }
        finally { setLoading(false) }
    }

    useEffect(() => {
        fetchStatus()
        const iv = window.setInterval(fetchStatus, 30000)
        return () => clearInterval(iv)
    }, [])

    if (loading) return <div className="neo-card p-8 text-center font-mono text-sm opacity-50">Loading agent status...</div>
    if (error) return <div className="neo-card p-4 text-danger font-mono text-sm">{error}</div>
    if (!status) return null

    return (
        <div className="neo-card p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg flex items-center gap-2"><Radio size={20} /> Agent Status</h2>
                <span className={`neo-badge ${status.running ? 'neo-badge-success' : 'neo-badge-danger'}`}>
                    {status.running ? '● RUNNING' : '● STOPPED'}
                </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatusCard icon={Activity} label="Regime" value={status.regime} />
                <StatusCard icon={BarChart3} label="Trades Today" value={`${status.trades_today}`} />
                <StatusCard icon={Clock} label="Last Scan" value={status.last_scan} />
                <StatusCard icon={Zap} label="Uptime" value={status.uptime} />
            </div>
        </div>
    )
}

function StatusCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
    return (
        <div className="neo-card p-3 !shadow-[2px_2px_0px_var(--color-border)]">
            <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className="opacity-50" />
                <span className="text-xs font-bold uppercase tracking-wide opacity-60">{label}</span>
            </div>
            <p className="font-mono font-bold text-lg">{value}</p>
        </div>
    )
}
