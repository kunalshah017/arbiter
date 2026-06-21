#!/bin/bash
# Custom build script for Azure App Service (Oryx)
# Installs Rust and builds the PyO3 engine during deployment

set -e

echo "=== Installing Rust toolchain ==="
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
export PATH="$HOME/.cargo/bin:$PATH"

echo "=== Installing Python dependencies ==="
pip install --upgrade pip
pip install -r requirements.txt

echo "=== Building Rust backtest engine ==="
pip install maturin
maturin develop --release --manifest-path engine/Cargo.toml

echo "=== Build complete ==="
