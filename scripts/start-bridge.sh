#!/bin/bash

# Sudo MCP Bridge - Start script
# Starts the bridge daemon

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Starting Sudo MCP Bridge..."
echo "Press Ctrl+C to stop"
echo ""

node "$PROJECT_DIR/build/index.js" --bridge
