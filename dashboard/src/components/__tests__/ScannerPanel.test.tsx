import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScannerPanel } from '../ScannerPanel'

describe('ScannerPanel', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('renders scanner form', () => {
    render(<ScannerPanel />)
    expect(screen.getByText('Token Scanner')).toBeInTheDocument()
    expect(screen.getByText('Scan Tokens')).toBeInTheDocument()
  })

  it('displays results table after scan', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true, json: async () => [
        { symbol: 'BNB', price: 600.5, volume_24h: 1500000000, change_24h_pct: 3.2, momentum_score: 28.8 },
        { symbol: 'ETH', price: 3500.0, volume_24h: 2000000000, change_24h_pct: -1.5, momentum_score: 15.2 },
      ],
    } as Response)

    render(<ScannerPanel />)
    fireEvent.click(screen.getByText('Scan Tokens'))

    await waitFor(() => {
      expect(screen.getByText('BNB')).toBeInTheDocument()
      expect(screen.getByText('ETH')).toBeInTheDocument()
    })
  })
})
