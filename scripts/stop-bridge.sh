#!/bin/bash

# Sudo MCP Bridge - Stop script
# Stops the background bridge daemon

PID_FILE="/tmp/sudo-mcp-bridge.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "Bridge is not running (no PID file found)"
  exit 0
fi

PID=$(cat "$PID_FILE")

if ! ps -p "$PID" > /dev/null 2>&1; then
  echo "Bridge is not running (process $PID not found)"
  rm -f "$PID_FILE"
  exit 0
fi

echo "Stopping bridge (PID $PID)..."
kill "$PID"

# Wait for process to exit
for i in {1..10}; do
  if ! ps -p "$PID" > /dev/null 2>&1; then
    echo "Bridge stopped"
    rm -f "$PID_FILE"
    exit 0
  fi
  sleep 0.5
done

# Force kill if still running
if ps -p "$PID" > /dev/null 2>&1; then
  echo "Force killing bridge..."
  kill -9 "$PID"
  rm -f "$PID_FILE"
fi

echo "Bridge stopped"
