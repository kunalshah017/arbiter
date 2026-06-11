import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import { useWebSocket } from '../hooks/useWebSocket'

interface OHLCVBar { ts: number; o: number; h: number; l: number; c: number; v: number }

export function OHLCVChart({ symbol }: { symbol: string }) {
    const chartRef = useRef<HTMLDivElement>(null)
    const chartInstance = useRef<IChartApi | null>(null)
    const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
    const [bars, setBars] = useState<OHLCVBar[]>([])
    const [loading, setLoading] = useState(true)
    const [interval, setInterval_] = useState('1h')
    const loadingMore = useRef(false)
    const barsRef = useRef<OHLCVBar[]>([])
    barsRef.current = bars

    useEffect(() => {
        setLoading(true)
        fetch(`/api/ohlcv/${symbol}?interval=${interval}&limit=300`)
            .then(r => r.json()).then(data => { setBars(data); setLoading(false) })
            .catch(() => setLoading(false))
    }, [symbol, interval])

    const handleWsMessage = useCallback((bar: OHLCVBar & { closed?: boolean }) => {
        if (!candleSeriesRef.current || !volumeSeriesRef.current) return
        candleSeriesRef.current.update({ time: bar.ts as any, open: bar.o, high: bar.h, low: bar.l, close: bar.c })
        volumeSeriesRef.current.update({ time: bar.ts as any, value: bar.v, color: bar.c >= bar.o ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)' })
        if (bar.closed) {
            setBars(prev => {
                const updated = [...prev]
                if (updated.length > 0 && updated[updated.length - 1].ts === bar.ts) {
                    updated[updated.length - 1] = bar
                } else {
                    updated.push(bar)
                }
                return updated
            })
        }
    }, [])

    useWebSocket({ url: `/ws/ohlcv/${symbol}?interval=${interval}`, onMessage: handleWsMessage, enabled: !loading && bars.length > 0 })

    useEffect(() => {
        if (!chartRef.current || bars.length === 0) return

        // Clean up previous chart safely
        if (chartInstance.current) {
            try { chartInstance.current.remove() } catch { /* already disposed */ }
            chartInstance.current = null
            candleSeriesRef.current = null
            volumeSeriesRef.current = null
        }

        const container = chartRef.current
        const chart = createChart(container, {
            width: container.clientWidth, height: 450,
            layout: { background: { color: '#FFFFFF' }, textColor: '#1C293C', fontFamily: "'Inter', sans-serif" },
            grid: { vertLines: { color: '#f0f0ee' }, horzLines: { color: '#f0f0ee' } },
            crosshair: { mode: 0 },
            rightPriceScale: { borderColor: '#1C293C' },
            timeScale: { borderColor: '#1C293C', timeVisible: true },
        })
        chartInstance.current = chart

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#16A34A', downColor: '#DC2626',
            borderUpColor: '#16A34A', borderDownColor: '#DC2626',
            wickUpColor: '#16A34A', wickDownColor: '#DC2626',
        })
        candleSeries.setData(bars.map(b => ({ time: b.ts as any, open: b.o, high: b.h, low: b.l, close: b.c })))
        candleSeriesRef.current = candleSeries

        const volumeSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' })
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
        volumeSeries.setData(bars.map(b => ({ time: b.ts as any, value: b.v, color: b.c >= b.o ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)' })))
        volumeSeriesRef.current = volumeSeries
        chart.timeScale().fitContent()

        // Infinite scroll: load older bars when near left edge
        const onVisibleRangeChange = () => {
            if (loadingMore.current) return
            const timeScale = chart.timeScale()
            const logicalRange = timeScale.getVisibleLogicalRange()
            if (!logicalRange) return
            if (logicalRange.from < 10) {
                loadingMore.current = true
                const oldestTs = barsRef.current[0]?.ts
                if (!oldestTs) { loadingMore.current = false; return }
                const endTime = oldestTs * 1000
                fetch(`/api/ohlcv/${symbol}?interval=${interval}&limit=200&endTime=${endTime}`)
                    .then(r => r.json())
                    .then((olderBars: OHLCVBar[]) => {
                        if (olderBars.length === 0) return
                        // Filter out any overlap
                        const filtered = olderBars.filter(b => b.ts < oldestTs)
                        if (filtered.length === 0) return
                        setBars(prev => [...filtered, ...prev])
                    })
                    .finally(() => { loadingMore.current = false })
            }
        }
        chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange)

        const handleResize = () => {
            if (chartInstance.current) chart.applyOptions({ width: container.clientWidth })
        }
        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange)
            if (chartInstance.current === chart) {
                chartInstance.current = null
                candleSeriesRef.current = null
                volumeSeriesRef.current = null
                try { chart.remove() } catch { /* already disposed in StrictMode */ }
            }
        }
    }, [bars])

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
            {loading ? (
                <div className="h-[450px] flex items-center justify-center font-mono text-sm opacity-50">Loading {symbol} data...</div>
            ) : (
                <div ref={chartRef} data-testid="ohlcv-chart" />
            )}
            <div className="mt-3 flex gap-4 text-xs font-mono opacity-60">
                <span>Bars: {bars.length}</span>
                {bars.length > 0 && (<>
                    <span>Last: ${bars[bars.length - 1]?.c.toFixed(2)}</span>
                    <span>High: ${Math.max(...bars.map(b => b.h)).toFixed(2)}</span>
                    <span>Low: ${Math.min(...bars.map(b => b.l)).toFixed(2)}</span>
                </>)}
            </div>
        </div>
    )
}
