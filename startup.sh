#!/bin/bash
set -e

# Install Rust if not present
if ! command -v cargo &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

source "$HOME/.cargo/env" 2>/dev/null || true

# Build Rust engine
cd /home/site/wwwroot
if [ ! -f arbiter/_engine*.so ] || [ engine/src/lib.rs -nt arbiter/_engine*.so ]; then
    pip install maturin
    cd engine && maturin develop --release && cd ..
fi

# Start the server
exec gunicorn server.api:app --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 120 --workers 2
