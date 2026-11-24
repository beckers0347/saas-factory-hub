'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { callTool } = require('../lib/server');
const dataforseo = require('../lib/dataforseo');
const trends = require('../social-trends-server');

const months = (values) => values.map((v, i) => ({ year: 2026, month: 12 - i, search_volume: v })); // newest first

function fakeProvider(reply) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(typeof reply === 'function' ? reply() : reply));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    seen, close: () => server.close(), base: `http://127.0.0.1:${server.address().port}`,
  })));
}

const ok = (result) => ({ status_code: 20000, status_message: 'Ok.', cost: 0.075, tasks: [{ status_code: 20000, status_message: 'Ok.', result }] });
const text = (res) => res.content[0].text;

test('trendPct90d compares the latest three months with the three before', () => {
  assert.equal(dataforseo.trendPct90d(months([200, 200, 200, 100, 100, 100, 50, 50])), 100);
  assert.equal(dataforseo.trendPct90d(months([90, 90, 90, 100, 100, 100])), -10);
  assert.equal(dataforseo.trendPct90d(months([100, 100, 100, 100, 100, 100]).reverse()), 0, 'order of the input does not matter');
  assert.equal(dataforseo.trendPct90d(months([5, 5, 5, 0, 0, 0])), null, 'no growth figure from a zero base');
  assert.equal(dataforseo.trendPct90d(months([1, 2, 3])), null, 'too little history');
  assert.equal(dataforseo.trendPct90d(null), null);
});

test('query_search_trends calls DataForSEO once and normalises the result', async () => {
  dataforseo.resetCallCount();
  const fake = await fakeProvider(ok([
    { keyword: 'invoice generator', search_volume: 40500, cpc: 4.21, competition: 'MEDIUM', monthly_searches: months([60000, 50000, 40000, 30000, 30000, 40000]) },
    { keyword: 'obscure <b>phrase</b>', search_volume: null, cpc: null, competition: null, monthly_searches: null },
  ]));
  try {
    const tools = trends.makeTools({ DATAFORSEO_BASIC_AUTH: 'dGVzdDp0ZXN0', DATAFORSEO_API_BASE: fake.base });
    const res = await callTool(tools, 'query_search_trends', { keywords: ['Invoice Generator', 'invoice generator', 'obscure phrase', 7] });
    assert.ok(!res.isError, text(res));
    const out = JSON.parse(text(res));
    assert.deepEqual([out.verified, out.weight, out.cost_usd], [true, 1, 0.075]);
    assert.deepEqual(out.keywords[0], { keyword: 'invoice generator', volume: 40500, trend_pct_90d: 50, cpc_usd: 4.21, competition: 'MEDIUM' });
    assert.deepEqual(out.keywords[1], { keyword: 'obscure phrase', volume: null, trend_pct_90d: null, cpc_usd: null, competition: null }, 'missing figures stay null, never zero');
    assert.equal(fake.seen.length, 1);
    assert.equal(fake.seen[0].method, 'POST');
    assert.equal(fake.seen[0].url, '/v3/keywords_data/google_ads/search_volume/live');
    assert.equal(fake.seen[0].auth, 'Basic dGVzdDp0ZXN0');
    assert.deepEqual(fake.seen[0].body, [{ keywords: ['invoice generator', 'obscure phrase'], location_code: 2840, language_code: 'en' }], 'duplicates and non-strings dropped');
  } finally {
    fake.close();
  }
});

test('a provider error inside a 200 response is reported, not treated as data', async () => {
  dataforseo.resetCallCount();
  const fake = await fakeProvider({ status_code: 40104, status_message: 'Please verify your account before using the API.', tasks: null });
  try {
    const res = await callTool(trends.makeTools({ DATAFORSEO_BASIC_AUTH: 'x', DATAFORSEO_API_BASE: fake.base }), 'query_search_trends', { keywords: ['a b c'] });
    assert.equal(res.isError, true);
    assert.match(text(res), /Please verify your account/);
  } finally {
    fake.close();
  }
  const failing = await fakeProvider({ status_code: 20000, tasks: [{ status_code: 40501, status_message: 'Invalid Field: keywords.' }] });
  try {
    const res = await callTool(trends.makeTools({ DATAFORSEO_BASIC_AUTH: 'x', DATAFORSEO_API_BASE: failing.base }), 'query_search_trends', { keywords: ['a b c'] });
    assert.equal(res.isError, true);
    assert.match(text(res), /Invalid Field/);
  } finally {
    failing.close();
  }
});

test('paid calls stop at the per-session limit', async () => {
  dataforseo.resetCallCount();
  const fake = await fakeProvider(ok([]));
  try {
    const tools = trends.makeTools({ DATAFORSEO_BASIC_AUTH: 'x', DATAFORSEO_API_BASE: fake.base });
    for (let i = 0; i < dataforseo.MAX_CALLS_PER_PROCESS; i += 1) {
      assert.ok(!(await callTool(tools, 'query_search_trends', { keywords: ['abc'] })).isError);
    }
    const over = await callTool(tools, 'query_search_trends', { keywords: ['abc'] });
    assert.equal(over.isError, true);
    assert.match(text(over), /call limit/);
    assert.equal(fake.seen.length, dataforseo.MAX_CALLS_PER_PROCESS, 'the refused call never reached the provider');
  } finally {
    fake.close();
    dataforseo.resetCallCount();
  }
});

test('login and password are accepted as an alternative to the encoded credential', async () => {
  dataforseo.resetCallCount();
  const fake = await fakeProvider(ok([]));
  try {
    await callTool(trends.makeTools({ DATAFORSEO_LOGIN: 'me@example.com', DATAFORSEO_PASSWORD: 'pw', DATAFORSEO_API_BASE: fake.base }), 'query_search_trends', { keywords: ['abc'] });
    assert.equal(fake.seen[0].auth, `Basic ${Buffer.from('me@example.com:pw').toString('base64')}`);
  } finally {
    fake.close();
  }
});

test('loadKeysFile reads only DATAFORSEO_ lines and never overrides the environment', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-'));
  const file = path.join(dir, 'data-keys.env');
  fs.writeFileSync(file, '# comment\nDATAFORSEO_BASIC_AUTH=from-file\r\nDATAFORSEO_LOGIN=file-login\nOTHER_SECRET=nope\nPATH=/evil\n');
  const env = { FACTORY_KEYS_FILE: file, DATAFORSEO_LOGIN: 'already-set' };
  assert.equal(dataforseo.loadKeysFile(env), true);
  assert.deepEqual(env, { FACTORY_KEYS_FILE: file, DATAFORSEO_LOGIN: 'already-set', DATAFORSEO_BASIC_AUTH: 'from-file' });
  assert.equal(dataforseo.loadKeysFile({ FACTORY_KEYS_FILE: path.join(dir, 'missing.env') }), false);
});

test('without credentials the tool still reports unverified with weight zero', async () => {
  const out = JSON.parse(text(await callTool(trends.makeTools({}), 'query_search_trends', { keywords: ['abc'] })));
  assert.deepEqual([out.verified, out.weight], [false, 0]);
});
