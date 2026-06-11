import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import { createSeriesMarkers } from 'lightweight-charts'

interface Bar { ts: number; o: number; h: number; l: number; c: number; v: number }
interface Trade { entry_ts: number; exit_ts: number; entry_price: number; exit_price: number; pnl_pct: number; side: string }

export function BacktestChart({ bars, trades }: { bars: Bar[]; trades: Trade[] }) {
    const chartRef = useRef<HTMLDivElement>(null)
    const chartInstance = useRef<IChartApi | null>(null)

    useEffect(() => {
        if (!chartRef.current || bars.length === 0) return
        if (chartInstance.current) { try { chartInstance.current.remove() } catch {} chartInstance.current = null }

        const container = chartRef.current
        const chart = createChart(container, {
            width: container.clientWidth, height: 350,
            layout: { background: { color: '#FFFFFF' }, textColor: '#1C293C', fontFamily: "'Inter', sans-serif" },
            grid: { vertLines: { color: '#f0f0ee' }, horzLines: { color: '#f0f0ee' } },
            crosshair: { mode: 0 },
            rightPriceScale: { borderColor: '#1C293C' },
            timeScale: { borderColor: '#1C293C', timeVisible: true },
        })
        chartInstance.current = chart

        const candleSeries: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, {
            upColor: '#16A34A', downColor: '#DC2626',
            borderUpColor: '#16A34A', borderDownColor: '#DC2626',
            wickUpColor: '#16A34A', wickDownColor: '#DC2626',
        })
        candleSeries.setData(bars.map(b => ({ time: b.ts as any, open: b.o, high: b.h, low: b.l, close: b.c })))

        // Build entry/exit markers
        const markers = trades.flatMap(t => [
            {
                time: t.entry_ts as any,
                position: 'belowBar' as const,
                color: '#16A34A',
                shape: 'arrowUp' as const,
                text: `BUY ${t.entry_price.toFixed(2)}`,
            },
            {
                time: t.exit_ts as any,
                position: 'aboveBar' as const,
                color: t.pnl_pct >= 0 ? '#16A34A' : '#DC2626',
                shape: 'arrowDown' as const,
                text: `${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct.toFixed(2)}%`,
            },
        ]).sort((a, b) => (a.time as number) - (b.time as number))

        if (markers.length > 0) createSeriesMarkers(candleSeries, markers)

        chart.timeScale().fitContent()

        const handleResize = () => { if (chartRef.current) chart.applyOptions({ width: container.clientWidth }) }
        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
            if (chartInstance.current === chart) { chartInstance.current = null; try { chart.remove() } catch {} }
        }
    }, [bars, trades])

    return (
        <div className="neo-card p-4">
            <h3 className="font-bold text-sm mb-3 uppercase tracking-wide">Price Chart with Entries/Exits</h3>
            <div ref={chartRef} data-testid="backtest-chart" />
        </div>
    )
}
