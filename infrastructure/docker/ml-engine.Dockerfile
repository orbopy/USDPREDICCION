FROM python:3.11-slim
WORKDIR /app

# CPU-only torch para reducir imagen (swap por versión CUDA si tenés GPU)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY ml-engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ml-engine/ .
COPY shared/ ./shared/

ENV PYTHONUNBUFFERED=1
EXPOSE 8001
CMD ["python", "main.py"]
