import uvicorn
from api.prediction_api import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(__import__('os').getenv("ML_PORT", "8001")))
