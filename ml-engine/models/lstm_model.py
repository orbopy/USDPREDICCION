import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from pathlib import Path
from sklearn.preprocessing import StandardScaler
from features.feature_engineering import build_features, build_target, FEATURE_COLS


class LSTMNet(nn.Module):
    def __init__(self, input_size: int, hidden_size: int = 64, num_layers: int = 2, dropout: float = 0.2):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.head = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out, _ = self.lstm(x)
        return self.head(out[:, -1, :]).squeeze(-1)


class LSTMPredictor:
    def __init__(self, seq_len: int = 30, model_path: str = "artifacts/lstm_model.pt"):
        self.seq_len = seq_len
        self.model_path = Path(model_path)
        self.scaler_path = self.model_path.with_suffix('.scaler.npy')
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model: LSTMNet | None = None
        self.scaler: StandardScaler | None = None

    def train(self, df: pd.DataFrame, horizon: int = 15, epochs: int = 50) -> dict:
        features_df = build_features(df)
        target = build_target(features_df, horizon)

        mask = target.notna()
        X = features_df.loc[mask, FEATURE_COLS].values.astype(np.float32)
        y = target[mask].values.astype(np.float32)

        self.scaler = StandardScaler()
        X = self.scaler.fit_transform(X)

        X_seq, y_seq = self._make_sequences(X, y)
        split = int(len(X_seq) * 0.8)
        X_tr, X_val = X_seq[:split], X_seq[split:]
        y_tr, y_val = y_seq[:split], y_seq[split:]

        self.model = LSTMNet(input_size=len(FEATURE_COLS)).to(self.device)
        optimizer = torch.optim.Adam(self.model.parameters(), lr=1e-3, weight_decay=1e-4)
        loss_fn = nn.BCELoss()
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5)

        best_val_loss = float('inf')
        best_state = None

        for epoch in range(epochs):
            self.model.train()
            optimizer.zero_grad()
            out = self.model(X_tr.to(self.device))
            loss = loss_fn(out, y_tr.to(self.device))
            loss.backward()
            nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
            optimizer.step()

            self.model.eval()
            with torch.no_grad():
                val_out = self.model(X_val.to(self.device))
                val_loss = loss_fn(val_out, y_val.to(self.device)).item()

            scheduler.step(val_loss)

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                best_state = {k: v.clone() for k, v in self.model.state_dict().items()}

        if best_state:
            self.model.load_state_dict(best_state)

        self._save()
        return {"best_val_loss": best_val_loss, "epochs": epochs}

    def predict(self, df: pd.DataFrame) -> dict:
        if self.model is None:
            self._load()

        features_df = build_features(df)
        X = features_df[FEATURE_COLS].values.astype(np.float32)
        X = self.scaler.transform(X)

        if len(X) < self.seq_len:
            raise ValueError(f"Need at least {self.seq_len} rows, got {len(X)}")

        seq = torch.tensor(X[-self.seq_len:]).unsqueeze(0)
        self.model.eval()
        with torch.no_grad():
            prob_up = self.model(seq.to(self.device)).item()

        direction = "UP" if prob_up > 0.5 else "DOWN"
        return {
            "direction": direction,
            "confidence": float(max(prob_up, 1 - prob_up)),
            "prob_up": prob_up,
            "prob_down": 1 - prob_up,
            "model": "lstm",
        }

    def _make_sequences(self, X: np.ndarray, y: np.ndarray):
        xs, ys = [], []
        for i in range(self.seq_len, len(X)):
            xs.append(X[i - self.seq_len:i])
            ys.append(y[i])
        return torch.tensor(np.array(xs)), torch.tensor(np.array(ys))

    def _save(self):
        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        torch.save(self.model.state_dict(), self.model_path)
        np.save(str(self.scaler_path), [self.scaler.mean_, self.scaler.scale_])

    def _load(self):
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model not found: {self.model_path}. Train first.")
        self.model = LSTMNet(input_size=len(FEATURE_COLS)).to(self.device)
        self.model.load_state_dict(torch.load(self.model_path, map_location=self.device))
        data = np.load(str(self.scaler_path), allow_pickle=True)
        self.scaler = StandardScaler()
        self.scaler.mean_, self.scaler.scale_ = data[0], data[1]
