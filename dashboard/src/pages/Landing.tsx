import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, Shield, Zap, Bot, Lock, TrendingUp, Cpu, Network, Database } from 'lucide-react'

import { ArbiterLogo } from '../components/ArbiterLogo'
import { FlickeringGrid } from '../components/animations/FlickeringGrid'
import { AnimatedMarketData } from '../components/animations/AnimatedMarketData'
import { SpotlightCard } from '../components/animations/SpotlightCard'

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
}

const stagger = {
    visible: { transition: { staggerChildren: 0.15 } },
}

const features = [
    { icon: Zap, title: 'Speed & Precision', desc: 'Sub-50ms backtests using a PyO3-bridged Rust engine ensuring trade logic validation occurs instantly.' },
    { icon: Shield, title: 'Absolute Defense', desc: 'Every trade is aggressively filtered by 5 risk gates: drawdowns, correlation, exposure, and a global kill switch.' },
    { icon: TrendingUp, title: 'AI-Guided Strategy', desc: 'Advanced LLM-agents continuously monitor conditions, classifying market regimes to tune the strategy on the fly.' },
    { icon: Lock, title: 'Non-Custodial', desc: 'Arbiter never demands your keys. Trade payloads are generated and safely signed locally via TWAK SDK.' },
    { icon: Activity, title: 'Live Dashboard', desc: 'WebSocket-powered terminal providing pure transparency into Equity Curves, P&L, agent decisions, and live OHLCV data.' },
    { icon: Bot, title: 'On-Chain Verifiable', desc: 'Backed by BNB Agent SDK and an ERC-8004 identity—providing trustless operational proofs for quantitative bots.' },
]

const stats = [
    { value: '< 50ms', label: 'Backtest Engine execution time' },
    { value: '1M+', label: 'OHLCV rows parsed iteratively' },
    { value: '5 Layers', label: 'Risk validation gates actively monitoring' },
    { value: '100%', label: 'Custody retention for the user' },
]

export function Landing() {
    return (
        <div className="min-h-screen bg-surface relative overflow-hidden font-sans">
            {/* Background Grid - subtle and behind everything */}
            <div className="absolute inset-0 z-0 opacity-40">
                <FlickeringGrid
                    color="rgb(28, 41, 60)"
                    squareSize={2}
                    gridGap={20}
                    maxOpacity={0.4}
                    flickerChance={0.05}
                />
            </div>

            {/* Header */}
            <header className="border-b-[2.5px] border-border bg-white relative z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 group">
                        <motion.div whileHover={{ rotate: 10 }}>
                            <ArbiterLogo className="w-10 h-10" />
                        </motion.div>
                        <span className="text-xl font-bold tracking-tight">Arbiter</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <a href="https://github.com/kunalshah017/arbiter" target="_blank" rel="noopener noreferrer" className="text-sm font-bold hover:text-primary transition-colors hidden md:block">
                            Documentation
                        </a>
                        <Link to="/app" className="neo-btn neo-btn-primary text-sm font-bold flex items-center gap-2">
                            Launch Terminal <Zap size={16} />
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 pt-20 pb-16 lg:pt-32 lg:pb-24 flex flex-col lg:flex-row items-center gap-12">
                <motion.div
                    initial="hidden" animate="visible" variants={stagger}
                    className="flex-1 text-center lg:text-left"
                >
                    <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1 mb-6 border-2 border-border rounded-full bg-white font-mono text-xs font-bold neo-shadow" style={{ boxShadow: '3px 3px 0px var(--color-primary)' }}>
                        <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                        SYSTEM V0.1.0 • TRACK 2 (STRATEGY GENERATION)
                    </motion.div>

                    <motion.h1 variants={fadeUp} className="text-5xl lg:text-7xl font-bold leading-tight mb-8">
                        Execute on{' '}
                        <span className="relative inline-block mt-2 lg:mt-0">
                            <span className="relative z-10 px-4 py-1">Evidence</span>
                            <span className="absolute inset-0 bg-primary border-[3px] border-border -rotate-2 rounded" />
                        </span>
                        <br /> Not Emotion.
                    </motion.h1>

                    <motion.p variants={fadeUp} className="text-lg md:text-xl font-medium opacity-80 max-w-2xl mx-auto lg:mx-0 mb-10 leading-relaxed">
                        Arbiter is an autonomous quantitative trading agent.
                        It synthesizes LLM-driven market intuition with mathematical rigidity—forcing every proposed strategy through a merciless <strong>Rust backtest engine</strong> before ever risking your capital.
                    </motion.p>

                    <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                        <Link to="/app" className="neo-btn neo-btn-primary text-lg px-8 py-4 w-full sm:w-auto text-center transform transition-transform hover:-translate-y-1">
                            Deploy Strategy Now
                        </Link>
                        <a href="https://github.com/kunalshah017/arbiter" target="_blank" rel="noopener noreferrer" className="neo-btn bg-white text-lg px-8 py-4 w-full sm:w-auto text-center flex justify-center items-center gap-2 transform transition-transform hover:-translate-y-1">
                            <Cpu size={20} /> View Github
                        </a>
                    </motion.div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="flex-1 w-full lg:w-auto relative"
                >
                    {/* Floating decorative elements */}
                    <motion.div animate={{ y: [-10, 10, -10], rotate: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 4 }} className="absolute -top-10 -left-10 w-20 h-20 bg-secondary border-[3px] border-border rounded-lg -z-10" />
                    <motion.div animate={{ y: [10, -10, 10], rotate: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 5 }} className="absolute -bottom-6 -right-6 w-16 h-16 rounded-full bg-primary border-[3px] border-border -z-10" />

                    <div className="relative z-0">
                        <AnimatedMarketData />
                    </div>
                </motion.div>
            </section>

            {/* How It Works / Data Pipeline */}
            <section className="relative z-10 border-y-[2.5px] border-border bg-white mt-10">
                <div className="max-w-6xl mx-auto px-6 py-20">
                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger} className="text-center mb-16">
                        <motion.h2 variants={fadeUp} className="text-4xl font-bold mb-4">The Multi-Agent Workflow</motion.h2>
                        <motion.p variants={fadeUp} className="text-lg opacity-70 max-w-2xl mx-auto">
                            A seamless loop connecting pure data to mathematical verification.
                        </motion.p>
                    </motion.div>

                    <div className="relative">
                        {/* Connecting Line */}
                        <div className="absolute top-1/2 left-0 w-full h-[3px] bg-border -translate-y-1/2 hidden md:block" />

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
                            {[
                                { title: '1. Oracles & Data', desc: 'Pull real-time OHLCV buffers', icon: Database },
                                { title: '2. Multi-Agent AI', desc: 'Gemini analyzes regime & context', icon: Network },
                                { title: '3. Strategy Gen', desc: 'Logic is structured to JSON params', icon: Activity },
                                { title: '4. Rust Validation', desc: 'Millions of rows verified in <50ms', icon: Shield },
                            ].map((step, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: idx * 0.2 }}
                                    whileHover={{ y: -5 }}
                                    className="bg-surface border-2 border-border p-6 rounded-lg text-center relative"
                                    style={{ boxShadow: '4px 4px 0px var(--color-border)' }}
                                >
                                    <div className="w-12 h-12 rounded-full border-2 border-border bg-primary mx-auto mb-4 flex items-center justify-center text-text">
                                        <step.icon size={24} />
                                    </div>
                                    <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                                    <p className="text-sm font-medium opacity-75">{step.desc}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Core Features via Spotlight Cards */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 py-24">
                <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mb-16">
                    <h2 className="text-4xl font-bold mb-4">Built for Serious Quants</h2>
                    <p className="text-lg opacity-70">Combining modern UI paradigms with low-level execution speed.</p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {features.map((f, i) => (
                        <SpotlightCard key={i} className="p-8 h-full flex flex-col justify-start">
                            <div className="w-14 h-14 rounded-lg bg-surface border-[2.5px] border-border flex items-center justify-center mb-6" style={{ boxShadow: '2px 2px 0px var(--color-border)' }}>
                                <f.icon size={28} className="text-text" />
                            </div>
                            <h3 className="font-bold text-2xl mb-3">{f.title}</h3>
                            <p className="text-base font-medium opacity-70 leading-relaxed flex-1">{f.desc}</p>
                        </SpotlightCard>
                    ))}
                </div>
            </section>

            {/* Metric Banners */}
            <section className="relative z-10 bg-text text-white py-16 border-y-[3px] border-border">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 divide-border divide-y md:divide-y-0 md:divide-x-2">
                        {stats.map((s, i) => (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                key={i}
                                className="px-4 py-4 md:py-0 md:pl-8 text-center md:text-left"
                            >
                                <div className="text-5xl font-mono font-bold text-primary mb-2" style={{ textShadow: '2px 2px 0px #000' }}>{s.value}</div>
                                <div className="text-sm font-medium tracking-wide opacity-80">{s.label}</div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Bottom Call To Action */}
            <section className="relative z-10 max-w-4xl mx-auto px-6 py-32 text-center">
                <motion.div
                    initial="hidden" whileInView="visible" viewport={{ once: true }}
                    variants={fadeUp}
                    className="bg-primary border-[3px] border-border rounded-xl p-12 lg:p-20 relative overflow-hidden"
                    style={{ boxShadow: '8px 8px 0px var(--color-border)' }}
                >
                    {/* Background decorations inside CTA */}
                    <div className="absolute top-0 right-0 p-4 opacity-20 pointer-events-none">
                        <Activity size={180} />
                    </div>

                    <h2 className="text-4xl md:text-5xl font-bold mb-6 text-text relative z-10">Stop guessing.</h2>
                    <p className="text-xl font-medium text-text opacity-90 mb-10 max-w-xl mx-auto relative z-10">
                        Join the next generation of decentralized algorithmic trading. Validate your logic before deploying instantly to the chain.
                    </p>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="inline-block relative z-10">
                        <Link to="/app" className="neo-btn bg-white hover:bg-surface text-xl px-12 py-5 font-bold tracking-wide flex items-center justify-center gap-3">
                            Open Dashboard <TrendingUp />
                        </Link>
                    </motion.div>
                </motion.div>
            </section>

            {/* Footer */}
            <footer className="border-t-[3px] border-border bg-white relative z-10">
                <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <ArbiterLogo className="w-8 h-8 rounded-sm" />
                        <span className="font-bold text-lg tracking-tight">Arbiter</span>
                    </div>
                    <p className="text-sm font-medium opacity-60 text-center md:text-left">
                        Built for the BNB Hackathon. Bridging Off-Chain AI with On-Chain Execution.
                    </p>
                    <div className="flex items-center gap-6 text-sm font-bold">
                        <a href="https://github.com/kunalshah017/arbiter" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors hover:underline">
                            Source Code
                        </a>
                        <a href="https://www.bnbchain.org" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors hover:underline">
                            BNB Chain
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    )
}
