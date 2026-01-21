#!/bin/bash

# Sudo MCP Bridge - Start in background
# Starts the bridge daemon as a background process

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

PID_FILE="/tmp/sudo-mcp-bridge.pid"

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "Bridge is already running (PID $PID)"
    exit 0
  else
    echo "Removing stale PID file"
    rm -f "$PID_FILE"
  fi
fi

echo "Starting Sudo MCP Bridge in background..."

# Start in background
nohup node "$PROJECT_DIR/build/index.js" --bridge > /tmp/sudo-mcp-bridge.log 2>&1 &
PID=$!

# Save PID
echo "$PID" > "$PID_FILE"

echo "Bridge started with PID $PID"
echo "Log file: /tmp/sudo-mcp-bridge.log"
