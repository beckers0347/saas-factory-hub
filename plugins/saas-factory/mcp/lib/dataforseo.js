'use strict';
// DataForSEO adapter: Google Ads search volume, with a growth figure worked out from the
// month-by-month history in the same response. Each live call costs money, so calls are
// capped per server process.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { requestJson } = require('./sources');
const { sanitize } = require('./untrusted');

const DEFAULT_BASE = 'https://api.dataforseo.com';
const MAX_CALLS_PER_PROCESS = 10;
const US = 2840; // DataForSEO location code for the United States
let calls = 0;

// Copies DATAFORSEO_* lines from a keys file into env, without overriding values already
// set. The file lives outside any repo: FACTORY_KEYS_FILE, or ~/.saas-factory/data-keys.env.
// Only server start-up calls this, so tests never pick up a real key.
function loadKeysFile(env) {
  const file = env.FACTORY_KEYS_FILE || path.join(os.homedir(), '.saas-factory', 'data-keys.env');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^(DATAFORSEO_[A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !env[m[1]]) env[m[1]] = m[2].trim();
  }
  return true;
}

function authHeader(env) {
  if (env.DATAFORSEO_BASIC_AUTH) return `Basic ${env.DATAFORSEO_BASIC_AUTH}`;
  if (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD) {
    return `Basic ${Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`).toString('base64')}`;
  }
  return null;
}

const configured = (env) => authHeader(env) !== null;

// Percent change of the latest three months against the three before them. Null when the
// history is too short or the earlier period is zero.
function trendPct90d(monthly) {
  const rows = (Array.isArray(monthly) ? monthly : [])
    .filter((m) => m && Number.isFinite(Number(m.year)) && Number.isFinite(Number(m.month)))
    .map((m) => ({ t: Number(m.year) * 12 + Number(m.month), v: Number(m.search_volume) || 0 }))
    .sort((a, b) => b.t - a.t);
  if (rows.length < 6) return null;
  const sum = (list) => list.reduce((s, r) => s + r.v, 0);
  const recent = sum(rows.slice(0, 3));
  const prior = sum(rows.slice(3, 6));
  if (prior === 0) return null;
  return Math.round(((recent - prior) / prior) * 1000) / 10;
}

async function searchVolume(env, keywords) {
  const auth = authHeader(env);
  if (!auth) throw new Error('DataForSEO is not configured');
  if (calls >= MAX_CALLS_PER_PROCESS) throw new Error('DataForSEO call limit for this session reached');
  calls += 1;
  const data = await requestJson(env.DATAFORSEO_API_BASE || DEFAULT_BASE, 'v3/keywords_data/google_ads/search_volume/live', {
    authHeader: auth,
    method: 'POST',
    body: [{ keywords, location_code: US, language_code: 'en' }],
  });
  // DataForSEO reports errors inside a 200 response.
  if (!data || data.status_code !== 20000) {
    throw new Error(`DataForSEO refused the request: ${sanitize(data && data.status_message, 200) || 'no message'}`);
  }
  const task = Array.isArray(data.tasks) ? data.tasks[0] : null;
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO task failed: ${sanitize(task && task.status_message, 200) || 'no task returned'}`);
  }
  const rows = Array.isArray(task.result) ? task.result : [];
  return {
    cost_usd: Number(data.cost) || 0,
    keywords: rows.slice(0, 50).map((r) => ({
      keyword: sanitize(r.keyword, 80),
      volume: Number.isFinite(Number(r.search_volume)) && r.search_volume !== null ? Number(r.search_volume) : null,
      trend_pct_90d: trendPct90d(r.monthly_searches),
      cpc_usd: Number.isFinite(Number(r.cpc)) && r.cpc !== null ? Number(r.cpc) : null,
      competition: sanitize(r.competition, 20) || null,
    })),
  };
}

const resetCallCount = () => { calls = 0; };

module.exports = { loadKeysFile, configured, searchVolume, trendPct90d, resetCallCount, MAX_CALLS_PER_PROCESS };
