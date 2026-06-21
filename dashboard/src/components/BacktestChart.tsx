import { useEffect, useRef, useState, useCallback } from 'react'
import {
    createChart,
    CandlestickSeries,
    HistogramSeries,
    createSeriesMarkers,
    type IChartApi,
    type ISeriesApi,
} from 'lightweight-charts'
import { useWebSocket } from '../hooks/useWebSocket'

interface OHLCVBar { ts: number; o: number; h: number; l: number; c: number; v: number }
interface Trade {
    id: number
    entry_ts: number
    exit_ts: number
    entry_price: number
    exit_price: number
    pnl_pct: number
    side?: string
}

export function BacktestChart({ bars, trades, equityCurve }: { bars: OHLCVBar[]; trades: Trade[]; equityCurve: any }) {
    const containerRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

    useEffect(() => {
        if (!containerRef.current || bars.length === 0) return
        if (chartRef.current) {
            try { chartRef.current.remove() } catch { }
            chartRef.current = null
        }

        const container = containerRef.current
        const chart = createChart(container, {
            width: container.clientWidth, height: container.clientHeight,
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
        candles.setData(bars.map(b => ({ time: b.ts as any, open: b.o, high: b.h, low: b.l, close: b.c })))
        candleRef.current = candles

        const volume = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        })
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
        volume.setData(bars.map(b => ({
            time: b.ts as any, value: b.v, color: b.c >= b.o ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'
        })))

        const markers = trades.flatMap(t => {
            return [
                {
                    time: t.entry_ts as any,
                    position: 'belowBar' as const,
                    color: '#432DD7', // secondary color
                    shape: 'arrowUp' as const,
                    text: `BUY @ ${t.entry_price.toFixed(2)}`,
                },
                {
                    time: t.exit_ts as any,
                    position: 'aboveBar' as const,
                    color: t.pnl_pct >= 0 ? '#16A34A' : '#DC2626',
                    shape: 'arrowDown' as const,
                    text: `${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct.toFixed(2)}%`,
                },
            ]
        }).sort((a, b) => (a.time as number) - (b.time as number))

        if (markers.length > 0) {
            createSeriesMarkers(candles, markers)
        }

        chart.timeScale().fitContent()

        const handleResize = () => {
            if (chartRef.current) {
                chartRef.current.applyOptions({ width: container.clientWidth, height: container.clientHeight })
            }
        }
        window.addEventListener('resize', handleResize)
        // Also handle the ResizeObserver for standard container resizes
        const observer = new ResizeObserver(() => handleResize())
        observer.observe(container)

        return () => {
            window.removeEventListener('resize', handleResize)
            observer.disconnect()
            if (chartRef.current === chart) {
                chartRef.current = null
                candleRef.current = null
                try { chart.remove() } catch { }
            }
        }
    }, [bars, trades])

    return (
        <div className="w-full h-full min-h-[300px]">
            <div ref={containerRef} data-testid="backtest-chart" className="w-full h-full" />
        </div>
    )
}
