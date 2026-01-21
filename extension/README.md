# Sudo MCP Bridge & Extension

This extends the Sudo MCP server with a **bridge daemon** and **Chrome extension** to aggregate command approvals from multiple MCP instances into a single browser tab.

## Architecture

```
Local Machine:
  Chrome Extension (Single Approval Tab)
         ↑
         | WebSocket :9998
         ↓
  Bridge Daemon (Auto-started)
    - Port 9999: MCP connections
    - Port 9998: Extension connection
    - Token authentication
         ↑
         | WebSocket :9999
    ┌────┴────┬─────────┬─────────┐
    ↓         ↓         ↓          ↓
  MCP 1    MCP 2    MCP 3    Remote MCP (SSH)
```

## Features

- **Single Approval Tab**: All sudo commands from all MCP instances appear in one Chrome tab
- **Auto-Start Bridge**: First MCP instance automatically starts the bridge daemon
- **Auto-Stop**: Bridge shuts down 30s after last connection closes
- **SSH Support**: Remote MCPs connect through SSH reverse tunnel
- **Token Auth**: One-time setup with 32-char hex token
- **Source Display**: Shows PID, working directory, and SSH status for each command
- **No Manual Management**: Bridge lifecycle managed automatically

## Installation

### 1. Install Dependencies

```bash
cd ~/Source/linux/sudo-mcp-custom
npm install
npm run build
```

### 2. Install Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension` folder: `~/Source/linux/sudo-mcp-custom/extension`

### 3. Setup Token (First Time)

The extension will automatically open a setup page on first run. Follow these steps:

1. In a terminal, start the bridge manually once:
   ```bash
   npm run bridge
   ```

2. The bridge will display your authentication token:
   ```
   ======================================================================
   FIRST-TIME SETUP: Chrome Extension Token
   ======================================================================

   Your authentication token:

     a8f3d2c9b1e4f7a6d5c3b2a1f9e8d7c6

   Please copy this token and paste it into the Chrome extension
   when prompted. This is a one-time setup.

   Token saved to: ~/.config/sudo-mcp/bridge-token
   ======================================================================
   ```

3. Copy the token and paste it into the extension setup page
4. Click "Save & Connect"
5. Done! You can now close the bridge (Ctrl+C)

## Usage

### Local Usage (Automatic)

Just use OpenCode normally:

1. Open OpenCode instance(s)
2. Request a sudo command
3. Bridge auto-starts (if not running)
4. Approval tab opens automatically
5. Approve or decline commands
6. Close all OpenCode instances → bridge auto-stops after 30s

**Zero manual steps required!**

### SSH Usage

**If you have local OpenCode running:**

```bash
# SSH with reverse tunnel (add to ~/.ssh/config for convenience)
ssh -R 9999:localhost:9999 user@remote

# On remote, use OpenCode normally
# Commands appear in your local browser automatically
```

**If SSH-only (no local OpenCode):**

```bash
# On local machine, start bridge manually:
npm run bridge
# Or: ./scripts/start-bridge-bg.sh

# Then SSH:
ssh -R 9999:localhost:9999 user@remote
```

### SSH Configuration (Recommended)

Add to `~/.ssh/config` for automatic tunnel:

```
Host *
    RemoteForward 9999 localhost:9999
```

Now all SSH connections automatically create the tunnel.

## Scripts

All scripts are in `~/Source/linux/sudo-mcp-custom/scripts/`:

### Start Bridge (Foreground)
```bash
npm run bridge
# Or: ./scripts/start-bridge.sh
```

### Start Bridge (Background)
```bash
./scripts/start-bridge-bg.sh
# Runs as daemon, logs to /tmp/sudo-mcp-bridge.log
```

### Stop Bridge
```bash
./scripts/stop-bridge.sh
```

### Bridge Status
```bash
./scripts/bridge-status.sh
# Or: npm run bridge:status
```

## File Locations

- **Token**: `~/.config/sudo-mcp/bridge-token` (auto-generated, mode 0600)
- **Extension**: `~/Source/linux/sudo-mcp-custom/extension/`
- **Bridge PID** (when run in background): `/tmp/sudo-mcp-bridge.pid`
- **Bridge Log** (when run in background): `/tmp/sudo-mcp-bridge.log`

## How It Works

### Automatic Bridge Startup

1. MCP server starts
2. Detects if running in SSH session (`$SSH_CONNECTION` env var)
3. If **local** (not SSH):
   - Checks if bridge running on port 9999
   - If not running → spawns bridge daemon automatically
   - Connects to bridge
4. If **SSH**:
   - Just connects to port 9999 (assumes tunnel exists)
   - Shows error if bridge not accessible

### Command Flow

```
1. User requests sudo command
2. MCP adds to queue → sends to bridge
3. Bridge forwards to extension
4. Extension shows in approval tab
5. User clicks Execute → extension sends to bridge
6. Bridge routes to correct MCP
7. MCP executes command
8. Result sent back: MCP → Bridge → Extension → UI
```

### Authentication

- **Token Generation**: First bridge start generates random 32-char hex token
- **Token Storage**: Saved to `~/.config/sudo-mcp/bridge-token` (mode 0600)
- **MCP Auth**: Each MCP connection validates token
- **Extension Auth**: Extension validates token once on connect
- **Invalid Token**: Connection rejected, extension shows setup page

### Display Format

Commands show:
```
PID 12345 • ~/projects/myapp • 10:30:15 AM

PID 67890 • ~/remote/path (SSH) • 10:31:42 AM
```

- **PID**: Process ID of the MCP instance
- **Path**: Working directory (shortened with `~`)
- **(SSH)**: Tag shown for commands from SSH sessions

## Troubleshooting

### "Cannot connect to bridge"

**Problem**: MCP can't connect to bridge on port 9999

**Solutions**:
- **Local**: Bridge should auto-start. If not, check logs.
- **SSH**: Make sure bridge is running on local machine
- Check firewall isn't blocking port 9999

### Extension not connecting

**Problem**: Extension shows "Disconnected"

**Solutions**:
- Check bridge is running: `./scripts/bridge-status.sh`
- Verify token matches: Compare extension token with `~/.config/sudo-mcp/bridge-token`
- Check browser console for errors (F12 → Console)
- Try resetting token: Click "Reset Token" in extension popup

### Commands not appearing

**Problem**: Commands queue in MCP but don't show in extension

**Solutions**:
- Check extension is connected (green dot in approval tab header)
- Check bridge logs: `tail -f /tmp/sudo-mcp-bridge.log`
- Verify MCP connected to bridge (check bridge logs)

### SSH commands not appearing locally

**Problem**: Remote MCP commands don't appear in local browser

**Solutions**:
- Verify SSH tunnel: `ssh -R 9999:localhost:9999 user@remote`
- Check local bridge is running
- On remote, check MCP connected: Should see "Connected to bridge" in logs
- Test tunnel: On remote, run `curl http://localhost:9999` (should connect)

## Development

### Running in Dev Mode

```bash
# Terminal 1: Build in watch mode
npm run dev

# Terminal 2: Start bridge
npm run bridge

# Extension: Reload in chrome://extensions/
```

### Testing Multiple MCPs

```bash
# Open 3 terminals, run in each:
cd ~/Source/linux/sudo-mcp-custom
npm start

# All should connect to same bridge
# Commands from all 3 appear in one extension tab
```

## Technical Details

### WebSocket Protocol

**MCP → Bridge (Register):**
```json
{
  "type": "register",
  "serverId": "uuid",
  "token": "a8f3d2c9...",
  "hostname": "my-laptop",
  "pid": 12345,
  "cwd": "~/projects/myapp",
  "isSSH": false,
  "sshClientIp": null
}
```

**MCP → Bridge (Command Queued):**
```json
{
  "type": "command_queued",
  "command": {
    "id": "cmd-uuid",
    "command": "whoami",
    "status": "pending",
    "queuedAt": "2026-01-20T10:00:00Z"
  }
}
```

**Bridge → MCP (Approve):**
```json
{
  "type": "approve",
  "commandId": "cmd-uuid"
}
```

### Ports

- **9999**: MCP connections (WebSocket)
- **9998**: Extension connection (WebSocket)
- **3000+**: HTTP fallback servers (existing, still functional)

### Auto-Start Logic

```typescript
if (isSSHSession()) {
  // SSH mode: Just connect (don't try to start bridge)
  await connectToBridge();
} else {
  // Local mode: Auto-start bridge if needed
  if (!await isBridgeRunning()) {
    await startBridge();
  }
  await connectToBridge();
}
```

## Future Enhancements

Possible improvements:

- [ ] Bridge status in extension popup
- [ ] Command history persistence
- [ ] Multiple approval tabs (each shows same queue)
- [ ] Command filtering/search
- [ ] Keyboard shortcuts
- [ ] Desktop notifications for urgent commands
- [ ] Command templates/aliases

## License

Same as sudo-mcp-custom
