#!/bin/bash

# Sudo MCP Bridge - Status script
# Shows the current status of the bridge

PID_FILE="/tmp/sudo-mcp-bridge.pid"

echo "Sudo MCP Bridge Status"
echo "====================="
echo ""

# Check PID file
if [ ! -f "$PID_FILE" ]; then
  echo "Status: Not running"
  echo ""
  echo "To start: npm run bridge"
  echo "Or: ./scripts/start-bridge-bg.sh"
  exit 0
fi

PID=$(cat "$PID_FILE")

# Check if process is running
if ! ps -p "$PID" > /dev/null 2>&1; then
  echo "Status: Not running (stale PID file)"
  rm -f "$PID_FILE"
  exit 0
fi

# Process is running
echo "Status: Running"
echo "PID: $PID"

# Get process info
if command -v ps > /dev/null 2>&1; then
  echo ""
  ps -p "$PID" -o pid,ppid,etime,comm
fi

# Check token file
TOKEN_FILE="$HOME/.config/sudo-mcp/bridge-token"
if [ -f "$TOKEN_FILE" ]; then
  TOKEN=$(cat "$TOKEN_FILE")
  echo ""
  echo "Token: ${TOKEN:0:8}... (in $TOKEN_FILE)"
fi

# Check log file
LOG_FILE="/tmp/sudo-mcp-bridge.log"
if [ -f "$LOG_FILE" ]; then
  echo ""
  echo "Recent log (last 10 lines):"
  echo "---"
  tail -n 10 "$LOG_FILE"
fi
