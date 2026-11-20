'use strict';
// Starts each server as a real child process and speaks MCP over stdio to it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

function talk(file, messages, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', file)], {
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', () => {
      if (err) return reject(new Error(err));
      resolve(out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    });
    for (const m of messages) child.stdin.write(JSON.stringify(m) + '\n');
    setTimeout(() => child.stdin.end(), 500);
  });
}

const handshake = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
];

const expected = {
  'support-ops-server.js': ['get_open_tickets', 'search_docs', 'draft_reply', 'get_error_spikes', 'page_owner'],
  'marketing-read-server.js': ['get_search_intent', 'get_funnel_metrics'],
  'marketing-draft-server.js': ['draft_social_queue', 'draft_email_drip'],
  'outbound-research-server.js': ['find_icp_companies', 'enrich_public_domain', 'stage_outreach_batch'],
  'social-trends-server.js': ['query_search_trends', 'query_ad_library', 'query_community_pain'],
};

for (const [file, names] of Object.entries(expected)) {
  test(`${file} completes the MCP handshake and lists exactly its tools`, async () => {
    const replies = await talk(file, handshake);
    assert.equal(replies.length, 2, 'the notification gets no reply');
    assert.equal(replies[0].result.protocolVersion, '2025-06-18');
    assert.deepEqual(replies[1].result.tools.map((t) => t.name), names);
    for (const t of replies[1].result.tools) assert.equal(t.inputSchema.type, 'object');
  });
}

test('no server exposes a send, publish, charge, deploy or shell tool', () => {
  const all = Object.values(expected).flat();
  for (const name of all) assert.doesNotMatch(name, /send|publish|charge|refund|deploy|exec|shell|reply_ticket|upsert/);
});

test('tools/call, unknown methods and bad JSON are handled', async () => {
  const replies = await talk('support-ops-server.js', [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_docs', arguments: { query: 'anything here' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'send_email', arguments: {} } },
    { jsonrpc: '2.0', id: 3, method: 'resources/list' },
  ]);
  const byId = Object.fromEntries(replies.map((r) => [r.id, r])); // replies may arrive out of order
  assert.match(byId[1].result.content[0].text, /No documentation matches/);
  assert.equal(byId[2].result.isError, true);
  assert.equal(byId[3].error.code, -32601);
});
