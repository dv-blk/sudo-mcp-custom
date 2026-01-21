# Sudo MCP Bridge

```
⚠️  WARNING: AI-GENERATED CODE AHEAD ⚠️
```

**This entire library was conjured by AI.** Every line: TypeScript, bridge daemon, Chrome extension, SSH tunneling, even this README. I just sat there muttering "sure" and "pls no more sudo copy paste"

**Safe?** I don't know.

**Production?** Criminal negligence.

**Works?** Works for me™.

**Will it betray you?** You're about to give an AI's code sudo access to your machine. If Zalgo comes out of the void whispering your crypto seed phrases, you may just have to give him what he wants, but it's not my fault.

Just close the tab - you were warned. Good luck!

---

Approve sudo commands from AI assistants (OpenCode/Claude) through a single Chrome extension tab - even over SSH!

> **Platform:** Requires X11, Chrome/Chromium browser, and GUI password dialogs (zenity or kdialog). May work on macOS or WSL2 with proper X server setup, but untested. Windows support unknown.

## Overview

When your AI assistant needs to run `sudo` commands, they appear in a Chrome extension for your approval. Works seamlessly across multiple MCP instances and remote SSH servers.

```
┌─────────────────────────────────────────────────────────────┐
│  OpenCode (local) ──┐                                       │
│  OpenCode (SSH)   ──┼──> Bridge ──> Chrome Extension ──> You│
│  OpenCode (remote)──┘       ↓                               │
│                       Password Dialog                       │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install & Build

```bash
cd ~/Source/linux/sudo-mcp-custom
npm install
npm run build
```

### 2. Start the Bridge

```bash
npm run bridge
```

**Copy the token shown** (you'll need it next).

### 3. Install Chrome Extension

1. Open Chrome: `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select: `~/Source/linux/sudo-mcp-custom/extension/`
5. **Paste your token** when prompted

### 4. Configure OpenCode

Edit `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "sudo-mcp-custom": {
      "type": "local",
      "enabled": true,
      "command": ["node", "/home/YOUR_USERNAME/Source/linux/sudo-mcp-custom/build/index.js"]
    }
  }
}
```

Replace `YOUR_USERNAME` with your actual username.

### 5. Restart OpenCode

That's it! Now when the AI needs sudo, commands appear in the Chrome extension.

---

## SSH Setup (Remote Servers)

Use sudo commands from OpenCode running on a remote server - approvals appear on your **local** Chrome!

### On Your Local Machine

#### 1. Edit `~/.ssh/config`:

```
Host myserver
    HostName your-server-ip
    User your-username
    RemoteForward 9999 localhost:9999
    ForwardX11 yes
    ForwardX11Trusted yes
```

Replace `myserver`, `your-server-ip`, and `your-username` with your details.

#### 2. Start the bridge:

```bash
npm run bridge
```

Keep this running.

### On the Remote Server

#### 1. Enable X11 Forwarding in SSH daemon:

```bash
sudo nano /etc/ssh/sshd_config
```

Find and change:
```
#X11Forwarding no
```

To:
```
X11Forwarding yes
```

Save and restart SSH:
```bash
sudo systemctl restart sshd
```

#### 2. Install Password Dialog Tool:

For Arch Linux:
```bash
sudo pacman -S zenity
```

For Ubuntu/Debian:
```bash
sudo apt install zenity
```

For Fedora/RHEL:
```bash
sudo dnf install zenity
```

#### 3. Install & Build Sudo MCP:

```bash
cd ~/Source/linux/sudo-mcp-custom
npm install
npm run build
```

#### 4. Configure OpenCode on Remote:

Same as step 4 in Quick Start above.

### Test It

#### 1. SSH from local machine:

```bash
ssh myserver
```

Verify X11 is working:
```bash
echo $DISPLAY
# Should show something like: localhost:10.0
```

#### 2. Start OpenCode on remote server

#### 3. Request a sudo command

The approval request will appear in your **local** Chrome extension!

---

## How It Works

### Components

1. **Bridge Daemon** (`npm run bridge`)
   - Runs on your local machine
   - Routes messages between MCP servers and Chrome extension
   - Ports: 9999 (MCP), 9998 (Extension)

2. **Chrome Extension**
   - Single approval tab for all commands
   - Desktop notifications with sound
   - Flashing badge and title for attention
   - Dark mode support

3. **MCP Server** (runs with OpenCode)
   - Detects local vs SSH sessions
   - Auto-connects to bridge
   - Sends commands for approval

### Flow

1. AI requests sudo command
2. MCP sends to bridge (via WebSocket or SSH tunnel)
3. Bridge forwards to Chrome extension
4. You click **Execute** in Chrome
5. Password dialog appears (local or via X11)
6. Command runs, result returns to AI

### SSH Tunneling

```
Remote Server                     Local Machine
┌──────────────────┐             ┌──────────────────┐
│ MCP Server       │             │ Bridge Daemon    │
│   ↓              │             │   ↓              │
│ localhost:9999 ──┼─[SSH tunnel]→ localhost:9999  │
└──────────────────┘             │   ↓              │
                                 │ localhost:9998   │
                                 │   ↓              │
                                 │ Chrome Extension │
                                 └──────────────────┘
```

The `RemoteForward` in SSH config creates a tunnel so remote MCP can connect to your local bridge.

---

## Attention Features

When a new command arrives, the extension:

✅ **Shows desktop notification** (with sound)  
✅ **Flashes badge** (red/orange)  
✅ **Flashes tab title** ("🔔 NEW SUDO COMMAND!")  
✅ **Plays beep sound**  
✅ **Auto-focuses window/tab**  
✅ **Animates new command card**  

You won't miss a command!

---

## Daily Usage

### Local Usage

```bash
# Start bridge (one terminal, keep running)
npm run bridge

# Start OpenCode (asks for sudo commands as needed)
```

### Remote Usage

```bash
# On local machine: Start bridge
npm run bridge

# SSH to remote
ssh myserver

# On remote: Use OpenCode as normal
# Commands appear in your local Chrome!
```

---

## Troubleshooting

### Password dialog doesn't appear (SSH)

**Check X11 forwarding:**
```bash
# After SSH, run:
echo $DISPLAY
# Should show localhost:10.0 or similar, NOT empty
```

**If empty:**
- Check remote `/etc/ssh/sshd_config` has `X11Forwarding yes`
- Restart sshd: `sudo systemctl restart sshd`
- Reconnect SSH

**Workaround:**
```bash
# Pre-authenticate before using OpenCode:
sudo -v
```

This caches your password for ~15 minutes.

### "Failed to connect to bridge"

**Check bridge is running:**
```bash
ps aux | grep 'node.*bridge'
```

If not running:
```bash
npm run bridge
```

### Extension not connecting

1. Check token matches:
   ```bash
   cat ~/.config/sudo-mcp/bridge-token
   ```
   
2. In Chrome extension popup, verify token

3. Reload extension:
   - `chrome://extensions/`
   - Click reload button

### Port 9999 already in use (SSH)

**Kill stale SSH tunnel:**
```bash
ssh myserver "pkill -f 'sshd.*notty'"
# Reconnect
ssh myserver
```

---

## Advanced

### Multiple Remote Servers

Add each server to `~/.ssh/config`:

```
Host server1
    HostName 192.168.1.10
    RemoteForward 9999 localhost:9999
    ForwardX11 yes

Host server2
    HostName 192.168.1.20
    RemoteForward 9999 localhost:9999
    ForwardX11 yes
```

All servers connect to the same bridge. All commands appear in one Chrome tab!

### Run Bridge in Background

```bash
# Start detached
nohup npm run bridge > /tmp/sudo-mcp-bridge.log 2>&1 &

# Stop it later
pkill -f 'node.*bridge'
```

### Force HTTP Mode (No Bridge)

```bash
SUDO_MCP_USE_HTTP=true npm start
```

Each MCP instance opens its own browser window at `http://localhost:3000+`

---

## Security Notes

- **Commands are blocked:** Only catastrophic commands (e.g., `rm -rf /`)
- **Password required:** You must enter your sudo password each time (or every ~15 min if cached)
- **Local bridge:** Token is stored at `~/.config/sudo-mcp/bridge-token`
- **Review everything:** Always check commands before clicking Execute!

---

## Files & Directories

```
sudo-mcp-custom/
├── src/                     # TypeScript source
├── build/                   # Compiled JavaScript
├── extension/               # Chrome extension
│   ├── background/          # Service worker
│   ├── ui/                  # Approval interface
│   └── manifest.json
├── config/
│   └── blocklist.json       # Blocked commands
└── package.json
```

**Token location:** `~/.config/sudo-mcp/bridge-token`

---

## Commands Reference

```bash
# Build
npm run build

# Start bridge (local machine only)
npm run bridge

# Test MCP server directly
npm start

# Development (watch mode)
npm run dev
```

---

## Credits

Built for OpenCode using the Model Context Protocol (MCP).

**Requirements:**
- Node.js 18+
- Linux with X11
- Chrome/Chromium browser
- `zenity` or `kdialog` (for password dialogs over SSH)

---

## License

ISC
