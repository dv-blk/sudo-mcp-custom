# Sudo MCP Server

A Model Context Protocol (MCP) server that allows AI assistants to execute commands with sudo privileges through a browser-based approval interface.

## Features

- **Browser-based approval UI**: Clean, real-time web interface for approving sudo commands
- **Lazy authentication**: Password prompt only appears when first command is executed
- **Pipeline queue**: Execute commands individually or all at once
- **Auto-clear**: Completed commands automatically removed after 30 seconds of inactivity
- **Minimal blocklist**: Only blocks catastrophic system-destroying commands
- **Offline capable**: All dependencies bundled locally (HTMX included)
- **Real-time updates**: Server-Sent Events (SSE) for instant UI synchronization

## Architecture

### Pipeline Flow

```
OpenCode AI → MCP Server (validates) → Command Queue → Browser UI
                                                         ↓
User approves → Session Manager (auth) → Sudo Executor → Result
                                                         ↓
                                        Result returned to OpenCode
```

### Key Components

- **Command Queue**: Manages pending, executing, and completed commands
- **Session Manager**: Handles sudo authentication via `systemd-ask-password` GUI dialog
- **Blocklist Validator**: Prevents execution of catastrophic commands
- **HTTP + SSE Server**: Serves browser UI with real-time updates
- **MCP Server**: Exposes `sudo_exec` tool via stdio transport

## Installation

### Prerequisites

- Node.js 18+ and npm
- Linux system with GUI (X11)
- `systemd-ask-password` (for GUI password dialog)
- `xdg-open` (for browser launching)

### Setup

1. **Clone or download this project**:
   ```bash
   cd ~/Source/linux/sudo-mcp-custom
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

4. **Add to OpenCode configuration**:
   
   Edit `~/.config/opencode/opencode.json`:
   ```json
   {
     "mcp": {
       "sudo-mcp-custom": {
         "type": "local",
         "enabled": true,
         "command": ["node", "/home/blk/Source/linux/sudo-mcp-custom/build/index.js"]
       }
     }
   }
   ```

5. **Restart OpenCode** to load the new MCP server

## Usage

### From OpenCode

Simply ask the AI to run a command with sudo:

```
User: Install htop using sudo
AI: I'll use the sudo_exec tool to install htop...
```

The browser will open automatically on the first command, showing the approval UI.

### Browser UI

The browser interface shows:

- **Pending commands**: Blue border, Execute/Decline buttons
- **Executing commands**: Orange border with spinner
- **Completed commands**: Green (success) or red (failed) with exit code
- **Declined commands**: Gray with strikethrough

### Batch Operations

When multiple commands are pending:
- **Execute All**: Run all commands sequentially
- **Decline All**: Remove all pending commands

### Auto-clear Behavior

- Completed/declined commands stay visible while queue is active
- Once queue is empty (no pending/executing), commands auto-clear after 30 seconds
- New commands reset the timer, preserving context

## Configuration

### Blocklist

Edit `config/blocklist.json` to customize blocked commands:

```json
{
  "exactMatches": ["rm -rf /"],
  "regexPatterns": ["^mkfs\\..*\\s+/dev/[sh]d[a-z]$"],
  "blockedBinaries": ["mkfs.ext4", "mkfs.xfs"]
}
```

### Command Timeout

Default: 5 minutes (300 seconds)

Modify in `src/executor/sudo-executor.ts`:
```typescript
export async function executeSudoCommand(
  command: string,
  timeout: number = 300000  // Change this value
)
```

### Auto-clear Timeout

Default: 30 seconds

Modify in `src/queue/command-queue.ts`:
```typescript
this.clearTimer = setTimeout(() => {
  this.clearCompleted();
}, 30000);  // Change this value (milliseconds)
```

## Development

### Project Structure

```
sudo-mcp-custom/
├── src/
│   ├── index.ts              # Entry point
│   ├── auth/
│   │   └── session-manager.ts    # Sudo authentication
│   ├── executor/
│   │   └── sudo-executor.ts      # Command execution
│   ├── queue/
│   │   └── command-queue.ts      # Pipeline with auto-clear
│   ├── security/
│   │   └── blocklist.ts          # Command validation
│   ├── server/
│   │   ├── http-server.ts        # Express + SSE
│   │   ├── html-renderer.ts      # UI generation
│   │   └── mcp-server.ts         # MCP protocol
│   ├── tools/
│   │   └── sudo-exec.ts          # MCP tool implementation
│   └── utils/
│       ├── browser-opener.ts     # Lazy browser launch
│       └── logger.ts             # stderr logging
├── config/
│   └── blocklist.json        # Blocked commands
├── public/
│   └── htmx.min.js          # HTMX library (bundled)
└── build/                   # Compiled JavaScript
```

### Available Scripts

- `npm run build` - Compile TypeScript
- `npm run dev` - Watch mode compilation
- `npm start` - Run the server (for testing)

### Debugging

Enable debug logging:
```bash
DEBUG=1 node build/index.js
```

## Security Considerations

### What's Blocked

- Catastrophic commands only (e.g., `rm -rf /`, `mkfs` on system disks)
- No risk analysis or warnings (by design)
- No audit logging (by design)

### Authentication

- Password prompted via `systemd-ask-password` (native GUI dialog)
- Sudo credentials cached for ~15 minutes (system default)
- Re-authentication required after cache expires

### Best Practices

1. **Review commands** in the browser UI before executing
2. **Don't execute** commands you don't understand
3. **Use carefully** in production environments
4. **Customize blocklist** for your specific needs

## Troubleshooting

### Browser doesn't open

**Issue**: Browser fails to launch on first command

**Solutions**:
- Check if `xdg-open` is installed: `which xdg-open`
- Check DISPLAY environment: `echo $DISPLAY`
- Manually open the URL shown in OpenCode output

### No password dialog appears

**Issue**: `systemd-ask-password` doesn't show GUI dialog

**Solutions**:
- Ensure polkit agent is running (for KDE/LXQt)
- Check if running in SSH session (GUI required)
- Try running `systemd-ask-password test` manually to verify

### Commands stuck in "Executing"

**Issue**: Command appears to hang

**Possible causes**:
- Command requires interactive input (not supported)
- Command timeout (default 5 minutes)
- Sudo password expired and dialog failed

**Solutions**:
- Decline the command and try again
- Check OpenCode output for error messages
- Restart the MCP server

### Port already in use

**Issue**: HTTP server fails to start

**Solution**: The server automatically finds an available port starting from 3000. Check OpenCode output for the actual port used.

## Limitations

- **GUI required**: Cannot run headless (by design)
- **No SSH support**: Designed for local GUI environments only
- **Sequential execution**: Commands run one at a time (not parallel)
- **No interactive commands**: Commands requiring stdin input will hang

## License

ISC

## Credits

Built for OpenCode using:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- [HTMX](https://htmx.org)
- [Express](https://expressjs.com)
