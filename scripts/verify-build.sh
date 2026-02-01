#!/bin/bash

# Polymarket Arbitrage Build Verification Script

echo "=========================================="
echo "Polymarket Arbitrage Build Verification"
echo "=========================================="
echo ""

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

echo "✅ Found package.json"
echo ""

# Check Node.js version
echo "Checking Node.js version..."
NODE_VERSION=$(node -v)
echo "Node.js version: $NODE_VERSION"

# Check if Node.js version >= 18
if [[ "$NODE_VERSION" < "v18" ]]; then
    echo "❌ Error: Node.js version must be >= 18. Current version: $NODE_VERSION"
    exit 1
fi

echo "✅ Node.js version is compatible"
echo ""

# Check if pnpm is installed
echo "Checking pnpm..."
if ! command -v pnpm &> /dev/null; then
    echo "❌ Error: pnpm is not installed. Please install pnpm first."
    echo "   Install command: npm install -g pnpm"
    exit 1
fi

echo "✅ pnpm is installed"
PNPM_VERSION=$(pnpm -v)
echo "pnpm version: $PNPM_VERSION"
echo ""

# Check critical directories
echo "Checking project structure..."
CRITICAL_DIRS=(
    "src/lib/polymarket"
    "src/lib/polymarket/strategies"
    "src/lib/polymarket/live-trading"
    "src/lib/backtest"
    "src/app/api"
)

for dir in "${CRITICAL_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "✅ $dir exists"
    else
        echo "❌ Error: $dir does not exist"
        exit 1
    fi
done

echo ""

# Check critical files
echo "Checking critical files..."
CRITICAL_FILES=(
    "src/lib/backtest/types.ts"
    "src/lib/polymarket/strategies/live-reversal-v9.ts"
    "src/lib/polymarket/strategies/live-convergence.ts"
    "src/lib/polymarket/gamma-api-v2.ts"
    "src/lib/polymarket/clob-api-v2.ts"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ Error: $file does not exist"
        exit 1
    fi
done

echo ""

# Check if dependencies are installed
echo "Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "⚠️  node_modules not found. Installing dependencies..."
    pnpm install
    if [ $? -ne 0 ]; then
        echo "❌ Error: Failed to install dependencies"
        exit 1
    fi
    echo "✅ Dependencies installed successfully"
else
    echo "✅ Dependencies are already installed"
fi

echo ""

# TypeScript type check
echo "Running TypeScript type check..."
pnpm run ts-check
if [ $? -ne 0 ]; then
    echo "❌ Error: TypeScript type check failed"
    echo "   Please fix the type errors before building"
    exit 1
fi

echo "✅ TypeScript type check passed"
echo ""

# Build the project
echo "Building the project..."
pnpm run build
if [ $? -ne 0 ]; then
    echo "❌ Error: Build failed"
    echo "   Please check the error messages above"
    exit 1
fi

echo "✅ Build successful"
echo ""

# Check if .next directory exists
if [ ! -d ".next" ]; then
    echo "⚠️  Warning: .next directory not found after build"
    echo "   This might indicate a build issue"
else
    echo "✅ .next directory created successfully"
fi

echo ""
echo "=========================================="
echo "✅ All checks passed!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Start development server: pnpm run dev"
echo "2. Start production server: pnpm run start"
echo "3. Deploy to Vercel: vercel --prod"
echo ""
