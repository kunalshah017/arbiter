#!/bin/bash
set -e

export PATH="$HOME/.cargo/bin:$PATH"

# Install Rust if not present
if ! command -v cargo &> /dev/null; then
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# Build Rust engine if needed
cd /home/site/wwwroot
NEED_BUILD=true
for f in arbiter/_engine*.so; do
    if [ -f "$f" ]; then
        NEED_BUILD=false
        break
    fi
done

if [ "$NEED_BUILD" = true ]; then
    echo "Building Rust engine..."
    pip install maturin
    maturin develop --release --manifest-path engine/Cargo.toml
    echo "Rust engine built successfully"
fi

# Install Python deps if not already
pip install -r requirements.txt 2>/dev/null || true

# Start the server
echo "Starting Arbiter server..."
exec gunicorn server.api:app --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 120 --workers 1
