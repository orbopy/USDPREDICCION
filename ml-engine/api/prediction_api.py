import os
import json
import redis
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from models.ensemble import EnsemblePredictor

load_dotenv()

app = FastAPI(title="Frontier Market ML Engine", version="1.0.0")
predictor = EnsemblePredictor()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

ML_OUTPUT_CHANNEL = "market:ml:prediction"
RATE_HISTORY_KEY = "market:rate_history"


class PredictRequest(BaseModel):
    pair: str = "USD/ARS"
    horizon_minutes: int = 15
    use_cache: bool = True


class PredictResponse(BaseModel):
    pair: str
    direction: str
    confidence: float
    prob_up: float
    prob_down: float
    model: str
    horizon_minutes: int


@app.get("/health")
def health():
    return {"status": "ok", "service": "ml-engine"}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    raw = redis_client.lrange(f"{RATE_HISTORY_KEY}:{req.pair}", 0, -1)
    if len(raw) < 50:
        raise HTTPException(status_code=422, detail=f"Not enough data for {req.pair}: {len(raw)} rows, need 50")

    records = [json.loads(r) for r in raw]
    df = pd.DataFrame(records)

    result = predictor.predict(df)
    result['pair'] = req.pair
    result['horizon_minutes'] = req.horizon_minutes

    redis_client.publish(ML_OUTPUT_CHANNEL, json.dumps(result))

    return PredictResponse(**result)


@app.on_event("startup")
async def startup():
    pubsub = redis_client.pubsub()
    pubsub.subscribe("market:snapshot")
    import threading

    def listener():
        for msg in pubsub.listen():
            if msg['type'] != 'message':
                continue
            try:
                data = json.loads(msg['data'])
                for rate in data.get('rates', []):
                    pair = f"{rate['base']}/{rate['quote']}"
                    key = f"{RATE_HISTORY_KEY}:{pair}"
                    redis_client.rpush(key, json.dumps({
                        "timestamp": rate['timestamp'],
                        "close": rate['rate'],
                        "open": rate['rate'],
                        "high": rate['rate'],
                        "low": rate['rate'],
                    }))
                    redis_client.ltrim(key, -500, -1)
            except Exception as e:
                print(f"Snapshot processing error: {e}")

    threading.Thread(target=listener, daemon=True).start()
