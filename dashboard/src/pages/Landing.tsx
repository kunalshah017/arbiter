import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, Shield, Zap, Bot, Lock, TrendingUp } from 'lucide-react'

import { ArbiterLogo } from '../components/ArbiterLogo';

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0 },
}

const stagger = {
    visible: { transition: { staggerChildren: 0.1 } },
}

const features = [
    { icon: Zap, title: 'Rust Engine', desc: 'Sub-50ms backtests via PyO3-bridged Rust engine with full OHLCV replay' },
    { icon: Shield, title: '5-Layer Risk Gate', desc: 'Position sizing, drawdown limits, correlation checks, exposure caps, kill switch' },
    { icon: TrendingUp, title: 'Regime-Aware', desc: 'AI classifies market regimes and selects optimal strategy parameters' },
    { icon: Lock, title: 'Self-Custody', desc: 'Never holds keys. Signs via TWAK CLI with hardware wallet support' },
    { icon: Activity, title: 'Realtime Monitoring', desc: 'WebSocket-driven dashboard with live P&L, equity curves, and alerts' },
    { icon: Bot, title: 'ERC-8004 Identity', desc: 'On-chain agent registration with BNB Agent SDK for verifiable identity' },
]

const techStack = [
    'Rust + PyO3', 'Python asyncio', 'Binance API', 'TWAK CLI',
    'BNB Agent SDK', 'PostgreSQL', 'FastAPI', 'React + Vite',
]

const stats = [
    { value: '<50ms', label: 'Backtest Latency' },
    { value: '20', label: 'Tokens Tracked' },
    { value: '43', label: 'Risk Parameters' },
    { value: '5', label: 'Gate Layers' },
]

const pipeline = ['Market Data', 'AI Classifies', 'Strategy', 'Rust Validates', 'Execute']

export function Landing() {
    return (
        <div className="min-h-screen bg-surface">
            {/* Header */}
            <header className="border-b-[2.5px] border-border bg-white">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <ArbiterLogo />
                        <span className="text-xl font-bold tracking-tight">Arbiter</span>
                    </div>
                    <Link to="/app" className="neo-btn neo-btn-primary text-sm">
                        Launch Dashboard →
                    </Link>
                </div>
            </header>

            {/* Hero */}
            <section className="max-w-6xl mx-auto px-6 py-24 text-center">
                <motion.div initial="hidden" animate="visible" variants={stagger}>
                    <motion.h1 variants={fadeUp} className="text-5xl md:text-6xl font-bold leading-tight mb-6">
                        Trade on{' '}
                        <span className="relative inline-block">
                            <span className="relative z-10 px-3 py-1">Evidence</span>
                            <span className="absolute inset-0 bg-primary border-[2.5px] border-border rotate-[-1deg] rounded" />
                        </span>
                        , Not Belief
                    </motion.h1>
                    <motion.p variants={fadeUp} className="text-lg opacity-70 max-w-2xl mx-auto mb-10">
                        Autonomous trading agent that only executes strategies validated by a sub-50ms Rust backtest engine.
                        Every trade passes through 5 layers of risk gates before execution.
                    </motion.p>
                    <motion.div variants={fadeUp} className="flex items-center justify-center gap-4 flex-wrap">
                        <Link to="/app" className="neo-btn neo-btn-primary text-base">Open Dashboard</Link>
                        <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="neo-btn bg-white text-base">
                            GitHub ↗
                        </a>
                    </motion.div>
                </motion.div>
            </section>

            {/* How It Works */}
            <section className="max-w-6xl mx-auto px-6 py-16">
                <motion.h2
                    initial="hidden" whileInView="visible" viewport={{ once: true }}
                    variants={fadeUp}
                    className="text-3xl font-bold text-center mb-12"
                >
                    How It Works
                </motion.h2>
                <motion.div
                    initial="hidden" whileInView="visible" viewport={{ once: true }}
                    variants={stagger}
                    className="flex flex-wrap items-center justify-center gap-3"
                >
                    {pipeline.map((step, i) => (
                        <motion.div key={step} variants={fadeUp} className="flex items-center gap-3">
                            <div className="neo-card px-5 py-3 font-mono text-sm font-bold">
                                <span className="text-secondary mr-2">{i + 1}.</span>{step}
                            </div>
                            {i < pipeline.length - 1 && <span className="text-2xl font-bold opacity-40">→</span>}
                        </motion.div>
                    ))}
                </motion.div>
            </section>

            {/* Features Grid */}
            <section className="max-w-6xl mx-auto px-6 py-16">
                <motion.h2
                    initial="hidden" whileInView="visible" viewport={{ once: true }}
                    variants={fadeUp}
                    className="text-3xl font-bold text-center mb-12"
                >
                    Built for Serious Traders
                </motion.h2>
                <motion.div
                    initial="hidden" whileInView="visible" viewport={{ once: true }}
                    variants={stagger}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                >
                    {features.map(f => (
                        <motion.div key={f.title} variants={fadeUp} className="neo-card p-6">
                            <f.icon size={28} className="text-secondary mb-3" />
                            <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                            <p className="text-sm opacity-70">{f.desc}</p>
                        </motion.div>
                    ))}
                </motion.div>
            </section>

            {/* Stats */}
            <section className="max-w-6xl mx-auto px-6 py-16">
                <motion.div
                    initial="hidden" whileInView="visible" viewport={{ once: true }}
                    variants={stagger}
                    className="grid grid-cols-2 md:grid-cols-4 gap-5"
                >
                    {stats.map(s => (
                        <motion.div key={s.label} variants={fadeUp} className="neo-card p-6 text-center">
                            <div className="text-3xl font-bold font-mono text-secondary">{s.value}</div>
                            <div className="text-sm opacity-70 mt-1">{s.label}</div>
                        </motion.div>
                    ))}
                </motion.div>
            </section>

            {/* Tech Stack */}
            <section className="max-w-6xl mx-auto px-6 py-16">
                <motion.h2
                    initial="hidden" whileInView="visible" viewport={{ once: true }}
                    variants={fadeUp}
                    className="text-3xl font-bold text-center mb-12"
                >
                    Tech Stack
                </motion.h2>
                <motion.div
                    initial="hidden" whileInView="visible" viewport={{ once: true }}
                    variants={stagger}
                    className="grid grid-cols-2 md:grid-cols-4 gap-4"
                >
                    {techStack.map(t => (
                        <motion.div key={t} variants={fadeUp} className="neo-card p-4 text-center font-mono text-sm font-bold">
                            {t}
                        </motion.div>
                    ))}
                </motion.div>
            </section>

            {/* CTA */}
            <section className="max-w-6xl mx-auto px-6 py-16">
                <motion.div
                    initial="hidden" whileInView="visible" viewport={{ once: true }}
                    variants={fadeUp}
                    className="bg-primary border-[2.5px] border-border rounded-lg p-12 text-center"
                    style={{ boxShadow: '6px 6px 0px var(--color-border)' }}
                >
                    <h2 className="text-3xl font-bold mb-4">Ready to trade on evidence?</h2>
                    <p className="opacity-70 mb-8 max-w-lg mx-auto">
                        Stop guessing. Let validated strategies and real-time risk gates protect your capital.
                    </p>
                    <Link to="/app" className="neo-btn bg-white text-base">
                        Open Dashboard →
                    </Link>
                </motion.div>
            </section>

            {/* Footer */}
            <footer className="border-t-[2.5px] border-border bg-white mt-16">
                <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary border-[2.5px] border-border rounded flex items-center justify-center font-bold text-sm">A</div>
                        <span className="font-bold">Arbiter</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm font-mono">
                        <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-secondary transition-colors">
                            GitHub
                        </a>
                        <a href="https://www.bnbchain.org" target="_blank" rel="noopener noreferrer" className="hover:text-secondary transition-colors">
                            BNB Hack
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    )
}
