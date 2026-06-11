//! NautilusTrader Indicator Wrappers — adapted from Astryx engine.

use nautilus_indicators::{
    average::{
        sma::SimpleMovingAverage,
        ema::ExponentialMovingAverage,
        dema::DoubleExponentialMovingAverage,
        hma::HullMovingAverage,
        wma::WeightedMovingAverage,
        vwap::VolumeWeightedAveragePrice,
        rma::WilderMovingAverage,
        lr::LinearRegression,
        MovingAverageType,
    },
    momentum::{
        macd::MovingAverageConvergenceDivergence,
        aroon::AroonOscillator,
        bb::BollingerBands,
        cci::CommodityChannelIndex,
        roc::RateOfChange,
        stochastics::Stochastics,
        obv::OnBalanceVolume,
    },
    volatility::{
        atr::AverageTrueRange,
        kc::KeltnerChannel,
        dc::DonchianChannel,
    },
    ratio::efficiency_ratio::EfficiencyRatio,
    indicator::{Indicator, MovingAverage},
};
use nautilus_model::enums::PriceType;

/// Custom RSI implementation matching Python nautilus_trader 1.222.0 (EMA-based).
/// NOTE: Outputs values in 0-1 range (not 0-100). The runner handles scaling.
#[derive(Debug)]
pub struct CustomRsi {
    period: usize,
    prev_close: Option<f64>,
    avg_gain: f64,
    avg_loss: f64,
    count: usize,
    alpha: f64,
    pub value: f64,
    pub initialized: bool,
}

impl CustomRsi {
    pub fn new(period: usize) -> Self {
        Self {
            period,
            prev_close: None,
            avg_gain: 0.0,
            avg_loss: 0.0,
            count: 0,
            alpha: 2.0 / (period as f64 + 1.0),
            value: 0.0,
            initialized: false,
        }
    }

    pub fn update_raw(&mut self, close: f64) {
        if let Some(prev) = self.prev_close {
            self.count += 1;
            let change = close - prev;
            let gain = if change > 0.0 { change } else { 0.0 };
            let loss = if change < 0.0 { -change } else { 0.0 };
            self.avg_gain = self.alpha * gain + (1.0 - self.alpha) * self.avg_gain;
            self.avg_loss = self.alpha * loss + (1.0 - self.alpha) * self.avg_loss;
            if self.count >= self.period {
                self.initialized = true;
            }
            if self.initialized {
                if self.avg_loss == 0.0 {
                    self.value = 1.0;
                } else {
                    let rs = self.avg_gain / self.avg_loss;
                    self.value = 1.0 - (1.0 / (1.0 + rs));
                }
            }
        }
        self.prev_close = Some(close);
    }
}

/// Indicator output values
#[derive(Debug, Clone, Default)]
pub struct IndicatorOutput {
    pub value: f64,
    pub upper: Option<f64>,
    pub middle: Option<f64>,
    pub lower: Option<f64>,
    pub signal: Option<f64>,
    pub histogram: Option<f64>,
    pub k: Option<f64>,
    pub d: Option<f64>,
    pub aroon_up: Option<f64>,
    pub aroon_down: Option<f64>,
}

impl IndicatorOutput {
    pub fn single(value: f64) -> Self {
        Self { value, ..Default::default() }
    }

    pub fn bands(upper: f64, middle: f64, lower: f64) -> Self {
        Self {
            value: middle,
            upper: Some(upper),
            middle: Some(middle),
            lower: Some(lower),
            ..Default::default()
        }
    }

    pub fn macd(value: f64, signal: f64, histogram: f64) -> Self {
        Self {
            value,
            signal: Some(signal),
            histogram: Some(histogram),
            ..Default::default()
        }
    }

    pub fn stochastic(k: f64, d: f64) -> Self {
        Self {
            value: k,
            k: Some(k),
            d: Some(d),
            ..Default::default()
        }
    }

    pub fn aroon(up: f64, down: f64) -> Self {
        Self {
            value: up - down,
            aroon_up: Some(up),
            aroon_down: Some(down),
            ..Default::default()
        }
    }

    pub fn get_subfield(&self, subfield: &str) -> Option<f64> {
        match subfield.to_lowercase().as_str() {
            "value" => Some(self.value),
            "top" | "upper" => self.upper,
            "mid" | "middle" => self.middle,
            "bot" | "lower" => self.lower,
            "signal" => self.signal,
            "histogram" | "hist" => self.histogram,
            "k" => self.k,
            "d" => self.d,
            "up" | "aroon_up" => self.aroon_up,
            "down" | "aroon_down" => self.aroon_down,
            _ => None,
        }
    }
}

#[derive(Debug)]
pub enum NautilusIndicator {
    Sma(SimpleMovingAverage),
    Ema(ExponentialMovingAverage),
    Dema(DoubleExponentialMovingAverage),
    Hma(HullMovingAverage),
    Wma(WeightedMovingAverage),
    Vwap(VolumeWeightedAveragePrice),
    Rma(WilderMovingAverage),
    RsiCustom(CustomRsi),
    Macd(MovingAverageConvergenceDivergence),
    Aroon(AroonOscillator),
    Cci(CommodityChannelIndex),
    Roc(RateOfChange),
    Stochastic(Stochastics),
    Atr(AverageTrueRange),
    BBands(BollingerBands),
    Keltner(KeltnerChannel),
    Donchian(DonchianChannel),
    Obv(OnBalanceVolume),
    EffRatio(EfficiencyRatio),
    LinReg(LinearRegression),
}

impl NautilusIndicator {
    pub fn new_sma(period: usize) -> Self { Self::Sma(SimpleMovingAverage::new(period, Some(PriceType::Last))) }
    pub fn new_ema(period: usize) -> Self { Self::Ema(ExponentialMovingAverage::new(period, Some(PriceType::Last))) }
    pub fn new_dema(period: usize) -> Self { Self::Dema(DoubleExponentialMovingAverage::new(period, Some(PriceType::Last))) }
    pub fn new_hma(period: usize) -> Self { Self::Hma(HullMovingAverage::new(period, Some(PriceType::Last))) }
    pub fn new_wma(period: usize) -> Self {
        let weights: Vec<f64> = (1..=period).map(|i| i as f64).collect();
        Self::Wma(WeightedMovingAverage::new(period, weights, Some(PriceType::Last)))
    }
    pub fn new_vwap() -> Self { Self::Vwap(VolumeWeightedAveragePrice::new()) }
    pub fn new_rma(period: usize) -> Self { Self::Rma(WilderMovingAverage::new(period, Some(PriceType::Last))) }
    pub fn new_rsi(period: usize) -> Self { Self::RsiCustom(CustomRsi::new(period)) }
    pub fn new_macd(fast: usize, slow: usize, _signal: usize) -> Self {
        Self::Macd(MovingAverageConvergenceDivergence::new(fast, slow, Some(MovingAverageType::Exponential), Some(PriceType::Last)))
    }
    pub fn new_aroon(period: usize) -> Self { Self::Aroon(AroonOscillator::new(period)) }
    pub fn new_cci(period: usize, scalar: f64) -> Self { Self::Cci(CommodityChannelIndex::new(period, scalar, None)) }
    pub fn new_roc(period: usize) -> Self { Self::Roc(RateOfChange::new(period, Some(true))) }
    pub fn new_stochastic(period_k: usize, period_d: usize) -> Self { Self::Stochastic(Stochastics::new(period_k, period_d)) }
    pub fn new_atr(period: usize) -> Self { Self::Atr(AverageTrueRange::new(period, Some(MovingAverageType::Wilder), Some(true), None)) }
    pub fn new_bbands(period: usize, k: f64) -> Self { Self::BBands(BollingerBands::new(period, k, Some(MovingAverageType::Simple))) }
    pub fn new_keltner(period: usize, k_multiplier: f64) -> Self { Self::Keltner(KeltnerChannel::new(period, k_multiplier, None, None, None, None)) }
    pub fn new_donchian(period: usize) -> Self { Self::Donchian(DonchianChannel::new(period)) }
    pub fn new_obv() -> Self { Self::Obv(OnBalanceVolume::new(1)) }
    pub fn new_efficiency_ratio(period: usize) -> Self { Self::EffRatio(EfficiencyRatio::new(period, Some(PriceType::Last))) }
    pub fn new_linear_regression(period: usize) -> Self { Self::LinReg(LinearRegression::new(period)) }

    pub fn initialized(&self) -> bool {
        match self {
            Self::Sma(ind) => ind.initialized(),
            Self::Ema(ind) => ind.initialized(),
            Self::Dema(ind) => ind.initialized(),
            Self::Hma(ind) => ind.initialized(),
            Self::Wma(ind) => ind.initialized(),
            Self::Vwap(ind) => ind.initialized(),
            Self::Rma(ind) => ind.initialized(),
            Self::RsiCustom(ind) => ind.initialized,
            Self::Macd(ind) => ind.initialized(),
            Self::Aroon(ind) => ind.initialized(),
            Self::Cci(ind) => ind.initialized(),
            Self::Roc(ind) => ind.initialized(),
            Self::Stochastic(ind) => ind.initialized(),
            Self::Atr(ind) => ind.initialized(),
            Self::BBands(ind) => ind.initialized(),
            Self::Keltner(ind) => ind.initialized(),
            Self::Donchian(ind) => ind.initialized(),
            Self::Obv(ind) => ind.initialized(),
            Self::EffRatio(ind) => ind.initialized(),
            Self::LinReg(ind) => ind.initialized(),
        }
    }

    pub fn update(&mut self, open: f64, high: f64, low: f64, close: f64, volume: f64) -> IndicatorOutput {
        match self {
            Self::Sma(ind) => { ind.update_raw(close); IndicatorOutput::single(ind.value()) }
            Self::Ema(ind) => { ind.update_raw(close); IndicatorOutput::single(ind.value()) }
            Self::Dema(ind) => { ind.update_raw(close); IndicatorOutput::single(ind.value()) }
            Self::Hma(ind) => { ind.update_raw(close); IndicatorOutput::single(ind.value()) }
            Self::Wma(ind) => { ind.update_raw(close); IndicatorOutput::single(ind.value()) }
            Self::Vwap(ind) => { ind.update_raw(close, volume, 0.0); IndicatorOutput::single(ind.value) }
            Self::Rma(ind) => { ind.update_raw(close); IndicatorOutput::single(ind.value()) }
            Self::RsiCustom(ind) => { ind.update_raw(close); IndicatorOutput::single(ind.value) }
            Self::Macd(ind) => { ind.update_raw(close); IndicatorOutput::single(ind.value) }
            Self::Aroon(ind) => { ind.update_raw(high, low); IndicatorOutput::aroon(ind.aroon_up, ind.aroon_down) }
            Self::Cci(ind) => { ind.update_raw(high, low, close); IndicatorOutput::single(ind.value) }
            Self::Roc(ind) => { ind.update_raw(close); IndicatorOutput::single(ind.value) }
            Self::Stochastic(ind) => { ind.update_raw(high, low, close); IndicatorOutput::stochastic(ind.value_k, ind.value_d) }
            Self::Atr(ind) => { ind.update_raw(high, low, close); IndicatorOutput::single(ind.value) }
            Self::BBands(ind) => { ind.update_raw(high, low, close); IndicatorOutput::bands(ind.upper, ind.middle, ind.lower) }
            Self::Keltner(ind) => { ind.update_raw(high, low, close); IndicatorOutput::bands(ind.upper, ind.middle, ind.lower) }
            Self::Donchian(ind) => { ind.update_raw(high, low); IndicatorOutput::bands(ind.upper, ind.middle, ind.lower) }
            Self::Obv(ind) => { ind.update_raw(open, close, volume); IndicatorOutput::single(ind.value) }
            Self::EffRatio(ind) => { ind.update_raw(close); IndicatorOutput::single(ind.value) }
            Self::LinReg(ind) => { ind.update_raw(close); IndicatorOutput::single(ind.value) }
        }
    }
}
