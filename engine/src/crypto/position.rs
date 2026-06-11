#[derive(Debug, Clone)]
pub struct Position {
    pub entry_price: f64,
    pub entry_bar_idx: usize,
    pub stop_loss: f64,
    pub take_profit: f64,
    pub highest_since_entry: f64,
}

#[derive(Debug, Clone)]
pub struct CompletedTrade {
    pub entry_price: f64,
    pub exit_price: f64,
    pub entry_bar_idx: usize,
    pub exit_bar_idx: usize,
    pub pnl_pct: f64,
    pub exit_reason: ExitReason,
}

#[derive(Debug, Clone, Copy)]
pub enum ExitReason {
    StopLoss,
    TakeProfit,
    SignalExit,
    EndOfData,
}
