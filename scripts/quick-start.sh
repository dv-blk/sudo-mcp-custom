#!/bin/bash

# Quick Start Guide for Sudo MCP Bridge & Extension

echo "======================================================================"
echo "Sudo MCP Bridge & Extension - Quick Start"
echo "======================================================================"
echo ""

# Check if build exists
if [ ! -d "build" ]; then
    echo "❌ Build directory not found. Running npm run build..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "❌ Build failed. Please fix errors and try again."
        exit 1
    fi
    echo "✅ Build complete"
    echo ""
fi

# Check if token exists
TOKEN_FILE="$HOME/.config/sudo-mcp/bridge-token"
if [ ! -f "$TOKEN_FILE" ]; then
    echo "ℹ️  No token found. Will generate on first bridge start."
    echo ""
fi

echo "Choose what to start:"
echo ""
echo "1. Start Bridge (show token for extension setup)"
echo "2. Start MCP Server (requires bridge running)"
echo "3. Start Both (bridge in background, MCP in foreground)"
echo "4. Stop All"
echo "5. Show Status"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        echo "Starting bridge..."
        echo "Copy the token and paste it in the Chrome extension setup page"
        echo ""
        npm run bridge
        ;;
    2)
        echo ""
        echo "Starting MCP server..."
        npm start
        ;;
    3)
        echo ""
        echo "Starting bridge in background..."
        ./scripts/start-bridge-bg.sh
        sleep 2
        
        if [ -f "$TOKEN_FILE" ]; then
            TOKEN=$(cat "$TOKEN_FILE")
            echo ""
            echo "======================================================================"
            echo "Extension Token (paste in Chrome extension):"
            echo ""
            echo "  $TOKEN"
            echo ""
            echo "======================================================================"
            echo ""
        fi
        
        echo "Starting MCP server..."
        npm start
        ;;
    4)
        echo ""
        echo "Stopping all processes..."
        ./scripts/stop-bridge.sh
        pkill -f "sudo-mcp-custom" 2>/dev/null
        echo "✅ Stopped"
        ;;
    5)
        echo ""
        ./scripts/bridge-status.sh
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac
