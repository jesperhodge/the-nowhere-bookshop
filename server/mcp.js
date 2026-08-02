#!/usr/bin/env node
/* ============================================================
   The same Hardcover client (server/hardcover.js), exposed as
   an MCP tool over stdio — a second way to give an assistant
   working the shop's data access to the API, alongside the
   /api/book route, without the token ever leaving this machine.

   Optional: @modelcontextprotocol/sdk is listed under
   optionalDependencies, so the rest of the server runs fine
   without it. This file is the only thing that needs it.

     node server/mcp.js

   Point an MCP-capable client at this as a stdio server.
   ============================================================ */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MODE, lookupBook } from './hardcover.js';

const server = new McpServer({ name: 'nowhere-bookshop-hardcover', version: '1.0.0' });

server.registerTool(
  'hardcover_search',
  {
    title: 'Hardcover book lookup',
    description: 'Look up a book on Hardcover by title and author. Returns ISBN-13, ' +
      'page count, first-publication year and a publisher description when a ' +
      'confident match is found. Runs in "live" or "fixture" mode depending on ' +
      'whether HARDCOVER_TOKEN is set; always reports which in `source`.',
    inputSchema: {
      title: z.string().describe('Book title'),
      author: z.string().describe('Author name'),
    },
  },
  async ({ title, author }) => {
    const result = await lookupBook({ title, author });
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`hardcover MCP tool ready over stdio (mode: ${MODE})`);
