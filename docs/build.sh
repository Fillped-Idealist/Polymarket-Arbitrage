#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
PROJECT_ROOT="${COZE_WORKSPACE_PATH}/polymarket-website"

cd "${PROJECT_ROOT}"

echo "Building the project..."
npx next build

echo "Build completed successfully!"
