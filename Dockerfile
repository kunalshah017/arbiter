# Multi-stage: build Rust + Python wheel, then run
FROM python:3.12-slim AS builder

RUN apt-get update && apt-get install -y curl build-essential && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

RUN pip install maturin

WORKDIR /app
COPY engine/ engine/
COPY pyproject.toml .
COPY arbiter/ arbiter/

RUN maturin build --release --out dist/ --manifest-path engine/Cargo.toml

# Runtime stage
FROM python:3.12-slim

WORKDIR /app

COPY --from=builder /app/dist/*.whl /tmp/
RUN pip install /tmp/*.whl && rm /tmp/*.whl

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY agent/ agent/
COPY integrations/ integrations/
COPY risk/ risk/
COPY data/ data/
COPY config/ config/
COPY notifications/ notifications/
COPY server/ server/
COPY dashboard/dist/ dashboard/dist/

EXPOSE 8000

CMD ["gunicorn", "server.api:app", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--timeout", "120", "--workers", "2"]
