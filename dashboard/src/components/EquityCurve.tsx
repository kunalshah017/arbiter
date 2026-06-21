import { useEffect, useRef } from 'react'
import { createChart, LineSeries, type IChartApi } from 'lightweight-charts'

interface EquityPoint { trade_num: number; equity: number }

export function EquityCurve({ data }: { data: EquityPoint[] | number[] | undefined }) {
    const chartRef = useRef<HTMLDivElement>(null)
    const chartInstance = useRef<IChartApi | null>(null)

    // Normalize: accept both number[] and {trade_num, equity}[]
    const points: EquityPoint[] = !data || data.length === 0 ? [] :
        typeof data[0] === 'number'
            ? (data as number[]).map((v, i) => ({ trade_num: i, equity: v }))
            : data as EquityPoint[]

    const startValue = points.length > 0 ? points[0].equity : 0
    const endValue = points.length > 0 ? points[points.length - 1].equity : 0
    const pctChange = startValue > 0 ? ((endValue - startValue) / startValue) * 100 : 0
    const profitable = endValue >= startValue

    if (points.length === 0) return null

    useEffect(() => {
        if (!chartRef.current || points.length === 0) return
        if (chartInstance.current) { try { chartInstance.current.remove() } catch { } chartInstance.current = null }

        const container = chartRef.current
        const chart = createChart(container, {
            width: container.clientWidth, height: 200,
            layout: { background: { color: '#FFFFFF' }, textColor: '#1C293C', fontFamily: "'Inter', sans-serif" },
            grid: { vertLines: { color: '#f0f0ee' }, horzLines: { color: '#f0f0ee' } },
            rightPriceScale: { borderColor: '#1C293C' },
            timeScale: { borderColor: '#1C293C', visible: false },
        })
        chartInstance.current = chart

        const lineSeries = chart.addSeries(LineSeries, {
            color: profitable ? '#16A34A' : '#DC2626',
            lineWidth: 2,
            priceFormat: { type: 'custom', formatter: (v: number) => `$${v.toFixed(0)}` },
        })
        lineSeries.setData(points.map((d, i) => ({ time: (i + 1) as any, value: d.equity })))
        chart.timeScale().fitContent()

        const handleResize = () => { if (chartRef.current) chart.applyOptions({ width: container.clientWidth }) }
        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
            if (chartInstance.current === chart) { chartInstance.current = null; try { chart.remove() } catch { } }
        }
    }, [points, profitable])

    return (
        <div className="neo-card p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm uppercase tracking-wide">Equity Curve</h3>
                <div className="flex gap-4 text-xs font-mono">
                    <span>Start: <strong>${startValue.toFixed(0)}</strong></span>
                    <span>End: <strong>${endValue.toFixed(0)}</strong></span>
                    <span className={profitable ? 'text-success' : 'text-danger'}>
                        {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(2)}%
                    </span>
                </div>
            </div>
            <div ref={chartRef} data-testid="equity-curve" />
        </div>
    )
}
