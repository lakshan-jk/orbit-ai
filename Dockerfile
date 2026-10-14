# Backend image: FastAPI + Alembic, served by uvicorn.
FROM python:3.13-slim

WORKDIR /app

# Install deps first so this layer caches unless requirements change.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code (see .dockerignore — the web/ frontend and venv are excluded).
COPY . .

EXPOSE 8100

# Apply migrations, then start the API. `migrate` runs once at boot so a fresh
# database is schema-ready without a manual step.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8100"]
