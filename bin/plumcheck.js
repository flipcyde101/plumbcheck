#!/usr/bin/env node
// Deprecated alias, removed in 2.0. stdout and exit codes are unchanged; the notice goes to stderr.
process.stderr.write('PlumbCheck: the "plumcheck" command is deprecated and will be removed in 2.0. Use "plumbcheck".\n');
await import('./plumbcheck.js');
