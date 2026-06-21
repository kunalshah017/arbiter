import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import { useWebSocket } from '../hooks/useWebSocket'

interface OHLCVBar { ts: number; o: number; h: number; l: number; c: number; v: number }

export function OHLCVChart({ symbol }: { symbol: string }) {
    const containerRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
    const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
    const barsRef = useRef<OHLCVBar[]>([])
    const loadingMore = useRef(false)
    const symbolRef = useRef(symbol)
    const intervalRef = useRef('1h')
    const [barCount, setBarCount] = useState(0)
    const [lastPrice, setLastPrice] = useState(0)
    const [loading, setLoading] = useState(true)
    const [interval, setInterval_] = useState('1h')

    symbolRef.current = symbol
    intervalRef.current = interval

    // Create chart ONCE on mount
    useEffect(() => {
        if (!containerRef.current) return
        const chart = createChart(containerRef.current, {
            width: containerRef.current.clientWidth, height: 450,
            layout: { background: { color: '#FFFFFF' }, textColor: '#1C293C', fontFamily: "'Inter', sans-serif" },
            grid: { vertLines: { color: '#f0f0ee' }, horzLines: { color: '#f0f0ee' } },
            crosshair: { mode: 0 },
            rightPriceScale: { borderColor: '#1C293C' },
            timeScale: { borderColor: '#1C293C', timeVisible: true },
        })
        chartRef.current = chart
        const candles = chart.addSeries(CandlestickSeries, {
            upColor: '#16A34A', downColor: '#DC2626',
            borderUpColor: '#16A34A', borderDownColor: '#DC2626',
            wickUpColor: '#16A34A', wickDownColor: '#DC2626',
        })
        candleRef.current = candles
        const volume = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' }, priceScaleId: 'volume',
        })
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
        volumeRef.current = volume

        // Infinite scroll: load older data when user scrolls to left edge
        chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
            if (!logicalRange || loadingMore.current || barsRef.current.length === 0) return
            if (logicalRange.from < 5) {
                loadingMore.current = true
                const oldestTs = barsRef.current[0].ts
                fetch(`/api/ohlcv/${symbolRef.current}?interval=${intervalRef.current}&limit=200&endTime=${oldestTs * 1000}`)
                    .then(r => r.json())
                    .then((olderBars: OHLCVBar[]) => {
                        if (!olderBars || olderBars.length === 0) { loadingMore.current = false; return }
                        const filtered = olderBars.filter(b => b.ts < oldestTs)
                        if (filtered.length === 0) { loadingMore.current = false; return }
                        const visibleRange = chart.timeScale().getVisibleLogicalRange()
                        barsRef.current = [...filtered, ...barsRef.current]
                        setBarCount(barsRef.current.length)
                        candleRef.current?.setData(barsRef.current.map(b => ({ time: b.ts as any, open: b.o, high: b.h, low: b.l, close: b.c })))
                        volumeRef.current?.setData(barsRef.current.map(b => ({ time: b.ts as any, value: b.v, color: b.c >= b.o ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)' })))
                        // Restore position shifted by prepended bars
                        if (visibleRange) {
                            chart.timeScale().setVisibleLogicalRange({
                                from: visibleRange.from + filtered.length,
                                to: visibleRange.to + filtered.length,
                            })
                        }
                        loadingMore.current = false
                    })
                    .catch(() => { loadingMore.current = false })
            }
        })

        const handleResize = () => {
            if (containerRef.current && chartRef.current) chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
        }
        window.addEventListener('resize', handleResize)
        return () => {
            window.removeEventListener('resize', handleResize)
            if (chartRef.current) { try { chartRef.current.remove() } catch {} }
            chartRef.current = null; candleRef.current = null; volumeRef.current = null
        }
    }, [])

    // Load initial data on symbol/interval change (no chart recreation)
    useEffect(() => {
        setLoading(true)
        barsRef.current = []
        setBarCount(0)
        fetch(`/api/ohlcv/${symbol}?interval=${interval}&limit=300`)
            .then(r => r.json())
            .then((data: OHLCVBar[]) => {
                if (!data || data.length === 0) { setLoading(false); return }
                barsRef.current = data
                setBarCount(data.length)
                setLastPrice(data[data.length - 1]?.c || 0)
                candleRef.current?.setData(data.map(b => ({ time: b.ts as any, open: b.o, high: b.h, low: b.l, close: b.c })))
                volumeRef.current?.setData(data.map(b => ({ time: b.ts as any, value: b.v, color: b.c >= b.o ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)' })))
                chartRef.current?.timeScale().fitContent()
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [symbol, interval])

    // WebSocket for realtime updates
    const handleWsMessage = useCallback((bar: OHLCVBar & { closed?: boolean }) => {
        if (!candleRef.current || !volumeRef.current) return
        candleRef.current.update({ time: bar.ts as any, open: bar.o, high: bar.h, low: bar.l, close: bar.c })
        volumeRef.current.update({ time: bar.ts as any, value: bar.v, color: bar.c >= bar.o ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)' })
        setLastPrice(bar.c)
        if (bar.closed) {
            const bars = barsRef.current
            if (bars.length > 0 && bars[bars.length - 1].ts === bar.ts) bars[bars.length - 1] = bar
            else bars.push(bar)
            setBarCount(bars.length)
        }
    }, [])

    useWebSocket({ url: `/ws/ohlcv/${symbol}?interval=${interval}`, onMessage: handleWsMessage, enabled: !loading && barCount > 0 })

    return (
        <div className="neo-card p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg">{symbol}/USDT</h2>
                <div className="flex gap-1">
                    {['15m', '1h', '4h', '1d'].map(iv => (
                        <button key={iv} onClick={() => setInterval_(iv)}
                            className={`neo-btn text-xs px-3 py-1 ${interval === iv ? 'neo-btn-primary' : 'bg-white'}`}>{iv}</button>
                    ))}
                </div>
            </div>
            <div ref={containerRef} data-testid="ohlcv-chart" style={{ display: loading ? 'none' : 'block' }} />
            {loading && <div className="h-[450px] flex items-center justify-center font-mono text-sm opacity-50">Loading {symbol} data...</div>}
            <div className="mt-3 flex gap-4 text-xs font-mono opacity-60">
                <span>Bars: {barCount}</span>
                {lastPrice > 0 && <span>Last: ${lastPrice.toFixed(2)}</span>}
            </div>
        </div>
    )
}
