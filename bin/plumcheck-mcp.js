#!/usr/bin/env node
// Deprecated alias, removed in 2.0. stdout stays reserved for JSON-RPC; the notice goes to stderr.
process.stderr.write('PlumbCheck: the "plumcheck-mcp" command is deprecated and will be removed in 2.0. Use "plumbcheck-mcp".\n');
await import('./plumbcheck-mcp.js');
