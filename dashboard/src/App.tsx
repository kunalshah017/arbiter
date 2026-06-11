import { useState } from 'react'
import { OHLCVChart } from './components/OHLCVChart'
import { BacktestPanel } from './components/BacktestPanel'
import { ScannerPanel } from './components/ScannerPanel'
import { PortfolioPanel } from './components/PortfolioPanel'
import { AgentStatus } from './components/AgentStatus'
import { Activity, BarChart3, Search, Wallet, Radio } from 'lucide-react'

type Tab = 'chart' | 'backtest' | 'scanner' | 'portfolio' | 'agent'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chart')
  const [symbol, setSymbol] = useState('BNB')

  return (
    <div className="min-h-screen bg-surface p-4">
      <header className="neo-card p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary border-[2.5px] border-border rounded flex items-center justify-center font-bold text-lg">A</div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Arbiter Dashboard</h1>
            <p className="text-sm opacity-60 font-mono">Backtest-Validated Trading</p>
          </div>
        </div>
        <select className="neo-select text-sm" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {['BNB','ETH','XRP','DOGE','ADA','LINK','AVAX','DOT','UNI','CAKE'].map(s => (
            <option key={s} value={s}>{s}/USDT</option>
          ))}
        </select>
      </header>

      <nav className="flex gap-2 mb-4 flex-wrap">
        {([
          { id: 'chart' as Tab, label: 'OHLCV Chart', icon: Activity },
          { id: 'backtest' as Tab, label: 'Backtest', icon: BarChart3 },
          { id: 'scanner' as Tab, label: 'Scanner', icon: Search },
          { id: 'portfolio' as Tab, label: 'Portfolio', icon: Wallet },
          { id: 'agent' as Tab, label: 'Agent', icon: Radio },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`neo-btn flex items-center gap-2 text-sm ${activeTab === tab.id ? 'neo-btn-primary' : 'bg-white'}`}>
            <tab.icon size={16} />{tab.label}
          </button>
        ))}
      </nav>

      <main>
        {activeTab === 'chart' && <OHLCVChart symbol={symbol} />}
        {activeTab === 'backtest' && <BacktestPanel symbol={symbol} />}
        {activeTab === 'scanner' && <ScannerPanel />}
        {activeTab === 'portfolio' && <PortfolioPanel />}
        {activeTab === 'agent' && <AgentStatus />}
      </main>
    </div>
  )
}

export default App
