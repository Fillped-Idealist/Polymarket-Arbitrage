#!/bin/bash

# Polymarket Arbitrage Development Script
# This script starts the development server

set -e

echo "Starting Polymarket Arbitrage development server..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  pnpm install
fi

# Start development server on port 5000
echo "Starting server on port 5000..."
pnpm exec next dev -p 5000 -H 0.0.0.0
