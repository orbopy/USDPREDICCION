import pandas as pd
from .xgboost_model import XGBoostPredictor
from .lstm_model import LSTMPredictor


class EnsemblePredictor:
    """
    Weighted ensemble: 60% XGBoost (faster, works with less data) + 40% LSTM (captures sequences).
    Weights tuned for frontier market characteristics: high noise, sparse data.
    """
    XGB_WEIGHT = 0.60
    LSTM_WEIGHT = 0.40

    def __init__(self):
        self.xgb = XGBoostPredictor()
        self.lstm = LSTMPredictor()

    def predict(self, df: pd.DataFrame) -> dict:
        results = {}

        try:
            xgb_pred = self.xgb.predict(df)
            results['xgb'] = xgb_pred
        except Exception as e:
            results['xgb'] = None
            print(f"XGB prediction failed: {e}")

        try:
            lstm_pred = self.lstm.predict(df)
            results['lstm'] = lstm_pred
        except Exception as e:
            results['lstm'] = None
            print(f"LSTM prediction failed: {e}")

        return self._merge(results)

    def _merge(self, results: dict) -> dict:
        available = {k: v for k, v in results.items() if v is not None}

        if not available:
            return {"direction": "NEUTRAL", "confidence": 0.0, "model": "ensemble_failed"}

        if len(available) == 1:
            only = list(available.values())[0]
            only['model'] = f"ensemble_partial_{list(available.keys())[0]}"
            return only

        weights = {'xgb': self.XGB_WEIGHT, 'lstm': self.LSTM_WEIGHT}
        total_weight = sum(weights[k] for k in available)

        weighted_prob_up = sum(
            available[k]['prob_up'] * weights[k] / total_weight
            for k in available
        )

        direction = "UP" if weighted_prob_up > 0.5 else "DOWN"
        confidence = max(weighted_prob_up, 1 - weighted_prob_up)

        return {
            "direction": direction,
            "confidence": float(confidence),
            "prob_up": float(weighted_prob_up),
            "prob_down": float(1 - weighted_prob_up),
            "model": "ensemble",
            "components": {k: available[k] for k in available},
        }
