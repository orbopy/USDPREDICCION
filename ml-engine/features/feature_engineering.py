import numpy as np
import pandas as pd
from ta.momentum import RSIIndicator, StochasticOscillator
from ta.trend import EMAIndicator, MACD
from ta.volatility import BollingerBands, AverageTrueRange


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Expects df with columns: [timestamp, open, high, low, close, volume]
    Returns feature matrix ready for ML models.
    """
    df = df.copy().sort_values('timestamp').reset_index(drop=True)

    close = df['close']
    high = df['high']
    low = df['low']
    volume = df.get('volume', pd.Series(np.ones(len(df))))

    # --- Price returns ---
    for lag in [1, 2, 3, 5, 10, 15, 30]:
        df[f'ret_{lag}'] = close.pct_change(lag)

    # --- Volatility ---
    for window in [5, 10, 20]:
        df[f'vol_{window}'] = close.pct_change().rolling(window).std()

    # --- EMA ---
    for period in [5, 10, 20, 50]:
        ema = EMAIndicator(close=close, window=period)
        df[f'ema_{period}'] = ema.ema_indicator()
        df[f'ema_{period}_dist'] = (close - df[f'ema_{period}']) / df[f'ema_{period}']

    # --- RSI ---
    rsi = RSIIndicator(close=close, window=14)
    df['rsi_14'] = rsi.rsi()

    # --- MACD ---
    macd = MACD(close=close)
    df['macd_line'] = macd.macd()
    df['macd_signal'] = macd.macd_signal()
    df['macd_hist'] = macd.macd_diff()

    # --- Bollinger Bands ---
    bb = BollingerBands(close=close, window=20)
    df['bb_width'] = bb.bollinger_wband()
    df['bb_pct'] = bb.bollinger_pband()

    # --- ATR ---
    atr = AverageTrueRange(high=high, low=low, close=close, window=14)
    df['atr_14'] = atr.average_true_range()
    df['atr_14_pct'] = df['atr_14'] / close

    # --- Volume ---
    df['vol_ratio'] = volume / volume.rolling(20).mean()

    # --- Time features ---
    ts = pd.to_datetime(df['timestamp'], unit='ms')
    df['hour_sin'] = np.sin(2 * np.pi * ts.dt.hour / 24)
    df['hour_cos'] = np.cos(2 * np.pi * ts.dt.hour / 24)
    df['dow_sin'] = np.sin(2 * np.pi * ts.dt.dayofweek / 7)
    df['dow_cos'] = np.cos(2 * np.pi * ts.dt.dayofweek / 7)

    return df.dropna()


def build_target(df: pd.DataFrame, horizon: int = 15) -> pd.Series:
    """Binary target: 1 if price goes up in `horizon` candles, else 0."""
    future_return = df['close'].pct_change(horizon).shift(-horizon)
    return (future_return > 0).astype(int)


FEATURE_COLS = [
    'ret_1', 'ret_2', 'ret_3', 'ret_5', 'ret_10', 'ret_15', 'ret_30',
    'vol_5', 'vol_10', 'vol_20',
    'ema_5_dist', 'ema_10_dist', 'ema_20_dist', 'ema_50_dist',
    'rsi_14', 'macd_line', 'macd_signal', 'macd_hist',
    'bb_width', 'bb_pct', 'atr_14_pct',
    'vol_ratio', 'hour_sin', 'hour_cos', 'dow_sin', 'dow_cos',
]
