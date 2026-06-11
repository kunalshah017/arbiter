# Multi-stage: build Rust + Python wheel, then run
FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y curl build-essential && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

RUN pip install maturin

WORKDIR /app
COPY engine/ engine/
COPY pyproject.toml .
COPY arbiter/ arbiter/

RUN maturin build --release --out dist/

# Runtime stage
FROM python:3.11-slim

WORKDIR /app

COPY --from=builder /app/dist/*.whl /tmp/
COPY pyproject.toml .
RUN pip install /tmp/*.whl && pip install . && rm /tmp/*.whl

COPY agent/ agent/
COPY integrations/ integrations/
COPY risk/ risk/
COPY data/ data/
COPY config/ config/
COPY notifications/ notifications/

CMD ["python", "-m", "agent.main"]
