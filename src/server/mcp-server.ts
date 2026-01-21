import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { CommandQueue } from '../queue/command-queue';
import { Blocklist } from '../security/blocklist';
import { handleSudoExec, getSudoExecToolDefinition } from '../tools/sudo-exec';
import { log, logError } from '../utils/logger';

export class McpSudoServer {
  private server: Server;
  private queue: CommandQueue;
  private blocklist: Blocklist;
  private serverUrl: string;
  private useBridge: boolean;

  constructor(
    queue: CommandQueue,
    blocklist: Blocklist,
    serverUrl: string,
    useBridge: boolean = false
  ) {
    this.queue = queue;
    this.blocklist = blocklist;
    this.serverUrl = serverUrl;
    this.useBridge = useBridge;

    this.server = new Server(
      {
        name: 'sudo-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [getSudoExecToolDefinition()],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'sudo_exec') {
        const command = args?.command as string;
        
        if (!command) {
          return {
            content: [{
              type: 'text',
              text: 'Error: command parameter is required'
            }],
            isError: true
          };
        }

        try {
          return await handleSudoExec(
            command,
            this.queue,
            this.blocklist,
            this.serverUrl,
            this.useBridge
          );
        } catch (error) {
          logError('Error handling sudo_exec', error as Error);
          return {
            content: [{
              type: 'text',
              text: `Error: ${(error as Error).message}`
            }],
            isError: true
          };
        }
      }

      return {
        content: [{
          type: 'text',
          text: `Unknown tool: ${name}`
        }],
        isError: true
      };
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    log('MCP server started on stdio');
  }

  async stop(): Promise<void> {
    await this.server.close();
    log('MCP server stopped');
  }
}
