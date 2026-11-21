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
import { MODE, lookupBook } from './lookup.js';

const server = new McpServer({ name: 'nowhere-bookshop-hardcover', version: '1.0.0' });

server.registerTool(
  'hardcover_search',
  {
    title: 'Hardcover book lookup',
    description: 'Look up a book by title and author, through the same provider chain the ' +
      'site uses (Hardcover when a token is present, then Open Library). Returns ISBN-13, ' +
      'page count, first-publication year and a publisher description when a ' +
      'confident match is found. Always reports which mode answered in `source` ' +
      '(live · fixture · miss) and which upstream in `via`.',
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
