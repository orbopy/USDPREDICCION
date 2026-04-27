import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from xgboost import XGBClassifier
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler
from features.feature_engineering import build_features, build_target, FEATURE_COLS


class XGBoostPredictor:
    def __init__(self, model_path: str = "artifacts/xgb_model.joblib"):
        self.model_path = Path(model_path)
        self.scaler_path = self.model_path.with_suffix('.scaler.joblib')
        self.model: XGBClassifier | None = None
        self.scaler: StandardScaler | None = None

    def train(self, df: pd.DataFrame, horizon: int = 15) -> dict:
        features_df = build_features(df)
        target = build_target(features_df, horizon)

        mask = target.notna()
        X = features_df.loc[mask, FEATURE_COLS]
        y = target[mask]

        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        self.model = XGBClassifier(
            n_estimators=300,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            use_label_encoder=False,
            eval_metric='logloss',
            random_state=42,
            n_jobs=-1,
        )

        tscv = TimeSeriesSplit(n_splits=5)
        val_scores = []

        for train_idx, val_idx in tscv.split(X_scaled):
            X_tr, X_val = X_scaled[train_idx], X_scaled[val_idx]
            y_tr, y_val = y.iloc[train_idx], y.iloc[val_idx]
            self.model.fit(X_tr, y_tr, eval_set=[(X_val, y_val)], verbose=False)
            proba = self.model.predict_proba(X_val)[:, 1]
            val_scores.append(roc_auc_score(y_val, proba))

        self.model.fit(X_scaled, y)
        self._save()

        return {
            "mean_auc": float(np.mean(val_scores)),
            "std_auc": float(np.std(val_scores)),
            "n_samples": int(len(y)),
            "n_features": len(FEATURE_COLS),
        }

    def predict(self, df: pd.DataFrame) -> dict:
        if self.model is None:
            self._load()

        features_df = build_features(df)
        X = features_df.iloc[[-1]][FEATURE_COLS]
        X_scaled = self.scaler.transform(X)

        proba = self.model.predict_proba(X_scaled)[0]
        direction = "UP" if proba[1] > 0.5 else "DOWN"

        return {
            "direction": direction,
            "confidence": float(max(proba)),
            "prob_up": float(proba[1]),
            "prob_down": float(proba[0]),
            "model": "xgboost",
        }

    def _save(self):
        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model, self.model_path)
        joblib.dump(self.scaler, self.scaler_path)

    def _load(self):
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model not found: {self.model_path}. Train first.")
        self.model = joblib.load(self.model_path)
        self.scaler = joblib.load(self.scaler_path)
