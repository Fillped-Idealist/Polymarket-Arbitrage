#!/bin/bash

# Polymarket Arbitrage Build Script
# This script builds the project for production

set -e

echo "Building Polymarket Arbitrage..."

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Run TypeScript type check
echo "Running TypeScript type check..."
pnpm run ts-check

# Build Next.js application
echo "Building Next.js application..."
pnpm exec next build

echo "Build completed successfully!"
