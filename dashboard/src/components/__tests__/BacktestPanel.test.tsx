import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BacktestPanel } from '../BacktestPanel'

describe('BacktestPanel', () => {
    beforeEach(() => { vi.restoreAllMocks() })

    it('renders the backtest form', () => {
        render(<BacktestPanel symbol="BNB" />)
        expect(screen.getByRole('button', { name: /Run Backtest/i })).toBeInTheDocument()
        expect(screen.getByText('BNB/USDT')).toBeInTheDocument()
    })

    it('displays results after successful backtest', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: true, json: async () => ({
                symbol: 'BNB', regime: 'trending_up', bars_count: 720, passed: true,
                total_return_pct: 5.2, max_drawdown_pct: -3.1, win_rate: 65.0,
                num_trades: 12, profit_factor: 2.1, expectancy_pct: 0.8, rejection_reasons: [],
            }),
        } as Response)

        render(<BacktestPanel symbol="BNB" />)
        fireEvent.click(screen.getByRole('button', { name: /Run Backtest/i }))

        await waitFor(() => {
            expect(screen.getByText('✓ GATE PASSED')).toBeInTheDocument()
            expect(screen.getByText('+5.20%')).toBeInTheDocument()
        })
    })

    it('displays rejection reasons when gate fails', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: true, json: async () => ({
                symbol: 'BNB', regime: 'choppy', bars_count: 720, passed: false,
                total_return_pct: -2.0, max_drawdown_pct: -18.0, win_rate: 30.0,
                num_trades: 3, profit_factor: 0.5, expectancy_pct: -0.5,
                rejection_reasons: ['Too few trades: 3 < 5'],
            }),
        } as Response)

        render(<BacktestPanel symbol="BNB" />)
        fireEvent.click(screen.getByRole('button', { name: /Run Backtest/i }))

        await waitFor(() => {
            expect(screen.getByText('✗ REJECTED')).toBeInTheDocument()
            expect(screen.getByText(/Too few trades/)).toBeInTheDocument()
        })
    })
})
