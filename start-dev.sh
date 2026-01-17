#!/bin/bash

# Start DaLat App Dev Server
# This script ensures Node 20 is used

echo "🚀 Starting DaLat App (ui-ct branch)..."
echo ""

# Check if nvm is available
if command -v nvm &> /dev/null; then
    echo "✓ Found nvm, switching to Node 20..."
    source ~/.nvm/nvm.sh
    nvm use 20
elif command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        echo "❌ Error: Node.js version 20+ required, but found v$NODE_VERSION"
        echo ""
        echo "Please install Node 20:"
        echo "  nvm install 20 && nvm use 20"
        echo "  OR use another Node version manager"
        exit 1
    fi
    echo "✓ Node $(node -v) detected"
else
    echo "❌ Error: Node.js not found"
    echo "Please install Node.js 20+"
    exit 1
fi

echo ""
echo "Starting dev server..."
echo "Open: http://localhost:3000"
echo ""

npm run dev
