import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Play, RotateCcw, ChevronDown, ChevronUp, Zap, Target, AlertTriangle } from 'lucide-react'

const INDICATOR_TYPES = ['EMA', 'RSI', 'ATR', 'BBands']
const OPERATORS = ['>', '<', '>=', '<=', 'crossover', 'crossunder']

interface Indicator {
    type: string
    period: number
    std_dev?: number
    alias?: string
}

interface Condition {
    left: string
    op: string
    right: string
}

interface CustomStrategy {
    indicators: Indicator[]
    entry_conditions: Condition[]
    exit_conditions: Condition[]
    stop_loss_atr_multiple: number
    take_profit_atr_multiple: number
}

interface Props {
    symbol: string
    interval: string
    onResult: (data: unknown) => void
    onRunning: (v: boolean) => void
    onError: (e: string) => void
}

export function StrategyBuilder({ symbol, interval, onResult, onRunning, onError }: Props) {
    const [strategy, setStrategy] = useState<CustomStrategy>({
        indicators: [
            { type: 'EMA', period: 9 },
            { type: 'EMA', period: 21 },
            { type: 'RSI', period: 14 },
            { type: 'ATR', period: 14 },
        ],
        entry_conditions: [
            { left: 'EMA_9', op: '>', right: 'EMA_21' },
            { left: 'RSI_14', op: '>', right: '55' },
        ],
        exit_conditions: [
            { left: 'EMA_9', op: 'crossunder', right: 'EMA_21' },
            { left: 'RSI_14', op: '<', right: '40' },
        ],
        stop_loss_atr_multiple: 2.0,
        take_profit_atr_multiple: 4.0,
    })

    const [expandedSection, setExpandedSection] = useState<string | null>('indicators')

    const addIndicator = () => {
        setStrategy(s => ({
            ...s,
            indicators: [...s.indicators, { type: 'EMA', period: 20 }]
        }))
    }

    const removeIndicator = (idx: number) => {
        setStrategy(s => ({
            ...s,
            indicators: s.indicators.filter((_, i) => i !== idx)
        }))
    }

    const updateIndicator = (idx: number, field: string, value: string | number) => {
        setStrategy(s => ({
            ...s,
            indicators: s.indicators.map((ind, i) => i === idx ? { ...ind, [field]: value } : ind)
        }))
    }

    const addCondition = (type: 'entry' | 'exit') => {
        const key = type === 'entry' ? 'entry_conditions' : 'exit_conditions'
        setStrategy(s => ({
            ...s,
            [key]: [...s[key], { left: '', op: '>', right: '' }]
        }))
    }

    const removeCondition = (type: 'entry' | 'exit', idx: number) => {
        const key = type === 'entry' ? 'entry_conditions' : 'exit_conditions'
        setStrategy(s => ({
            ...s,
            [key]: s[key].filter((_, i) => i !== idx)
        }))
    }

    const updateCondition = (type: 'entry' | 'exit', idx: number, field: string, value: string) => {
        const key = type === 'entry' ? 'entry_conditions' : 'exit_conditions'
        setStrategy(s => ({
            ...s,
            [key]: s[key].map((c, i) => i === idx ? { ...c, [field]: value } : c)
        }))
    }

    const runCustomBacktest = async () => {
        if (strategy.indicators.length === 0) {
            onError('Add at least one indicator')
            return
        }
        if (strategy.entry_conditions.length === 0) {
            onError('Add at least one entry condition')
            return
        }
        if (strategy.exit_conditions.length === 0) {
            onError('Add at least one exit condition')
            return
        }

        onRunning(true)
        onError('')
        try {
            const resp = await fetch('/api/backtest/custom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol,
                    interval,
                    limit: 1000,
                    indicators: strategy.indicators,
                    entry_conditions: strategy.entry_conditions,
                    exit_conditions: strategy.exit_conditions,
                    stop_loss_atr_multiple: strategy.stop_loss_atr_multiple,
                    take_profit_atr_multiple: strategy.take_profit_atr_multiple,
                }),
            })
            if (!resp.ok) {
                const d = await resp.json()
                throw new Error(d.detail || 'Custom backtest failed')
            }
            const data = await resp.json()
            onResult(data)
        } catch (e: unknown) {
            onError(e instanceof Error ? e.message : 'Unknown error')
        } finally {
            onRunning(false)
        }
    }

    const resetStrategy = () => {
        setStrategy({
            indicators: [
                { type: 'EMA', period: 9 },
                { type: 'EMA', period: 21 },
                { type: 'RSI', period: 14 },
                { type: 'ATR', period: 14 },
            ],
            entry_conditions: [
                { left: 'EMA_9', op: '>', right: 'EMA_21' },
                { left: 'RSI_14', op: '>', right: '55' },
            ],
            exit_conditions: [
                { left: 'EMA_9', op: 'crossunder', right: 'EMA_21' },
                { left: 'RSI_14', op: '<', right: '40' },
            ],
            stop_loss_atr_multiple: 2.0,
            take_profit_atr_multiple: 4.0,
        })
    }

    // Generate available signal options from defined indicators
    const getSignalOptions = (): string[] => {
        const opts: string[] = ['close', 'open', 'high', 'low']
        strategy.indicators.forEach(ind => {
            const alias = ind.alias || `${ind.type}_${ind.period}`
            if (ind.type === 'BBands') {
                opts.push(`BBANDS_${ind.period}.upper`, `BBANDS_${ind.period}.middle`, `BBANDS_${ind.period}.lower`)
            } else {
                opts.push(alias.toUpperCase())
            }
        })
        return opts
    }

    const toggleSection = (section: string) => {
        setExpandedSection(expandedSection === section ? null : section)
    }

    const signalOptions = getSignalOptions()

    return (
        <div className="flex flex-col gap-3 h-full overflow-y-auto text-sm p-1">
            {/* Indicators Section */}
            <div className="neo-card overflow-hidden">
                <button
                    onClick={() => toggleSection('indicators')}
                    className="w-full flex items-center justify-between p-3 hover:bg-surface/50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <Zap size={14} className="text-secondary" />
                        <span className="font-bold text-xs uppercase tracking-wider">Indicators ({strategy.indicators.length})</span>
                    </div>
                    {expandedSection === 'indicators' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <AnimatePresence>
                    {expandedSection === 'indicators' && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t-2 border-border"
                        >
                            <div className="p-3 flex flex-col gap-2">
                                {strategy.indicators.map((ind, idx) => (
                                    <div key={idx} className="flex items-center gap-2 p-2 rounded bg-surface border border-border/50">
                                        <select
                                            value={ind.type}
                                            onChange={e => updateIndicator(idx, 'type', e.target.value)}
                                            className="neo-select text-xs py-1 px-2 flex-1"
                                        >
                                            {INDICATOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <input
                                            type="number"
                                            value={ind.period}
                                            onChange={e => updateIndicator(idx, 'period', parseInt(e.target.value) || 1)}
                                            className="neo-input text-xs py-1 px-2 w-16 font-mono"
                                            min={1}
                                            max={500}
                                        />
                                        {ind.type === 'BBands' && (
                                            <input
                                                type="number"
                                                value={ind.std_dev || 2.0}
                                                onChange={e => updateIndicator(idx, 'std_dev', parseFloat(e.target.value) || 2.0)}
                                                className="neo-input text-xs py-1 px-2 w-14 font-mono"
                                                step={0.5}
                                                min={0.5}
                                                max={5}
                                                title="Std Dev"
                                            />
                                        )}
                                        <button onClick={() => removeIndicator(idx)} className="text-danger hover:bg-danger/10 p-1 rounded">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                                <button onClick={addIndicator} className="flex items-center gap-1 text-xs font-bold text-secondary hover:text-primary transition-colors p-1">
                                    <Plus size={12} /> Add Indicator
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Entry Conditions */}
            <div className="neo-card overflow-hidden">
                <button
                    onClick={() => toggleSection('entry')}
                    className="w-full flex items-center justify-between p-3 hover:bg-surface/50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <Target size={14} className="text-success" />
                        <span className="font-bold text-xs uppercase tracking-wider">Entry Rules ({strategy.entry_conditions.length})</span>
                    </div>
                    {expandedSection === 'entry' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <AnimatePresence>
                    {expandedSection === 'entry' && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t-2 border-border"
                        >
                            <div className="p-3 flex flex-col gap-2">
                                {strategy.entry_conditions.map((cond, idx) => (
                                    <ConditionRow
                                        key={idx}
                                        cond={cond}
                                        signalOptions={signalOptions}
                                        onChange={(field, val) => updateCondition('entry', idx, field, val)}
                                        onRemove={() => removeCondition('entry', idx)}
                                    />
                                ))}
                                <button onClick={() => addCondition('entry')} className="flex items-center gap-1 text-xs font-bold text-success hover:text-primary transition-colors p-1">
                                    <Plus size={12} /> Add Entry Rule
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Exit Conditions */}
            <div className="neo-card overflow-hidden">
                <button
                    onClick={() => toggleSection('exit')}
                    className="w-full flex items-center justify-between p-3 hover:bg-surface/50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={14} className="text-danger" />
                        <span className="font-bold text-xs uppercase tracking-wider">Exit Rules ({strategy.exit_conditions.length})</span>
                    </div>
                    {expandedSection === 'exit' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <AnimatePresence>
                    {expandedSection === 'exit' && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t-2 border-border"
                        >
                            <div className="p-3 flex flex-col gap-2">
                                {strategy.exit_conditions.map((cond, idx) => (
                                    <ConditionRow
                                        key={idx}
                                        cond={cond}
                                        signalOptions={signalOptions}
                                        onChange={(field, val) => updateCondition('exit', idx, field, val)}
                                        onRemove={() => removeCondition('exit', idx)}
                                    />
                                ))}
                                <button onClick={() => addCondition('exit')} className="flex items-center gap-1 text-xs font-bold text-danger hover:text-primary transition-colors p-1">
                                    <Plus size={12} /> Add Exit Rule
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Risk Parameters */}
            <div className="neo-card overflow-hidden">
                <button
                    onClick={() => toggleSection('risk')}
                    className="w-full flex items-center justify-between p-3 hover:bg-surface/50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={14} className="text-warning" />
                        <span className="font-bold text-xs uppercase tracking-wider">Risk Params</span>
                    </div>
                    {expandedSection === 'risk' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <AnimatePresence>
                    {expandedSection === 'risk' && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t-2 border-border"
                        >
                            <div className="p-3 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold">Stop Loss (ATR×)</label>
                                    <input
                                        type="number"
                                        value={strategy.stop_loss_atr_multiple}
                                        onChange={e => setStrategy(s => ({ ...s, stop_loss_atr_multiple: parseFloat(e.target.value) || 1 }))}
                                        className="neo-input text-xs py-1 px-2 w-20 font-mono text-right"
                                        step={0.5}
                                        min={0.5}
                                        max={10}
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold">Take Profit (ATR×)</label>
                                    <input
                                        type="number"
                                        value={strategy.take_profit_atr_multiple}
                                        onChange={e => setStrategy(s => ({ ...s, take_profit_atr_multiple: parseFloat(e.target.value) || 2 }))}
                                        className="neo-input text-xs py-1 px-2 w-20 font-mono text-right"
                                        step={0.5}
                                        min={0.5}
                                        max={20}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 mt-auto pt-2">
                <button
                    onClick={runCustomBacktest}
                    className="neo-btn neo-btn-primary flex-1 flex items-center justify-center gap-2 text-xs font-bold py-3"
                >
                    <Play size={14} /> Run Custom Backtest
                </button>
                <button
                    onClick={resetStrategy}
                    className="neo-btn bg-white p-3"
                    title="Reset to defaults"
                >
                    <RotateCcw size={14} />
                </button>
            </div>
        </div>
    )
}

function ConditionRow({ cond, signalOptions, onChange, onRemove }: {
    cond: Condition
    signalOptions: string[]
    onChange: (field: string, value: string) => void
    onRemove: () => void
}) {
    return (
        <div className="flex items-center gap-1 p-2 rounded bg-surface border border-border/50">
            <input
                type="text"
                value={cond.left}
                onChange={e => onChange('left', e.target.value)}
                placeholder="Signal"
                list="signal-options"
                className="neo-input text-xs py-1 px-2 flex-1 font-mono"
            />
            <select
                value={cond.op}
                onChange={e => onChange('op', e.target.value)}
                className="neo-select text-xs py-1 px-1 w-20 font-mono"
            >
                {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <input
                type="text"
                value={cond.right}
                onChange={e => onChange('right', e.target.value)}
                placeholder="Value"
                list="signal-options"
                className="neo-input text-xs py-1 px-2 flex-1 font-mono"
            />
            <button onClick={onRemove} className="text-danger hover:bg-danger/10 p-1 rounded">
                <Trash2 size={12} />
            </button>
            <datalist id="signal-options">
                {signalOptions.map(s => <option key={s} value={s} />)}
            </datalist>
        </div>
    )
}
