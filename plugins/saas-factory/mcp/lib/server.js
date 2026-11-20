'use strict';
// Minimal MCP stdio server (newline-delimited JSON-RPC 2.0). No dependencies on purpose:
// the agent box runs this code next to untrusted text, so there is no package tree to audit.
const readline = require('node:readline');

function validate(schema, args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('arguments must be an object');
  }
  const props = (schema && schema.properties) || {};
  for (const key of Object.keys(args)) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) throw new Error(`unknown argument: ${key}`);
  }
  for (const key of (schema && schema.required) || []) {
    if (args[key] === undefined) throw new Error(`missing argument: ${key}`);
  }
  for (const [key, value] of Object.entries(args)) {
    const spec = props[key];
    const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    const ok = spec.type === 'integer' ? Number.isInteger(value) : spec.type === actual;
    if (spec.type && !ok) throw new Error(`argument ${key} must be ${spec.type}`);
    if (spec.enum && !spec.enum.includes(value)) {
      throw new Error(`argument ${key} must be one of: ${spec.enum.join(', ')}`);
    }
  }
}

async function callTool(tools, name, args) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
  try {
    validate(tool.inputSchema, args === undefined ? {} : args);
    const out = await tool.handler(args || {});
    const text = typeof out === 'string' ? out : JSON.stringify(out, null, 2);
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `refused: ${err.message}` }], isError: true };
  }
}

function serve(info, tools, input = process.stdin, output = process.stdout) {
  const send = (msg) => output.write(JSON.stringify(msg) + '\n');
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
      return;
    }
    if (msg.id === undefined || msg.id === null) return; // notification
    const reply = (result) => send({ jsonrpc: '2.0', id: msg.id, result });
    switch (msg.method) {
      case 'initialize':
        reply({
          protocolVersion: (msg.params && msg.params.protocolVersion) || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: info,
        });
        break;
      case 'ping':
        reply({});
        break;
      case 'tools/list':
        reply({
          tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
        });
        break;
      case 'tools/call':
        reply(await callTool(tools, msg.params && msg.params.name, msg.params && msg.params.arguments));
        break;
      default:
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
    }
  });
}

module.exports = { serve, callTool, validate };
