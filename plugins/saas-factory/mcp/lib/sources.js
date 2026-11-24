'use strict';
// One place for every outbound HTTP call the MCP servers make. Calls go only to base URLs
// taken from the environment (never from a tool argument), never follow redirects, and
// are capped in time and size. See docs/SETUP.md for the expected JSON shapes.
const fs = require('node:fs');
const path = require('node:path');

const SEGMENT = /^[A-Za-z0-9_.-]+$/;

function checkPath(p) {
  const parts = String(p).split('/');
  if (!parts.length || parts.some((s) => !SEGMENT.test(s) || s === '.' || s === '..')) {
    throw new Error(`bad API path: ${p}`);
  }
  return parts;
}

// `key` sends "Authorization: Bearer <key>". `authHeader` sends that exact header value
// instead, for providers that use another scheme.
async function requestJson(baseUrl, apiPath, { key, authHeader, method = 'GET', body, query } = {}) {
  const base = new URL(baseUrl);
  const local = base.hostname === 'localhost' || base.hostname === '127.0.0.1';
  if (base.protocol !== 'https:' && !(local && base.protocol === 'http:')) {
    throw new Error('API base URL must be https');
  }
  const url = new URL(base.pathname.replace(/\/+$/, '') + '/' + checkPath(apiPath).join('/'), base);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  if (url.origin !== base.origin) throw new Error('request left the configured API origin');
  const headers = { accept: 'application/json' };
  if (authHeader) headers.authorization = authHeader;
  else if (key) headers.authorization = `Bearer ${key}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url.pathname} returned HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 1000000) throw new Error('API response too large');
  return text ? JSON.parse(text) : null;
}

// Read from a named data source. Returns undefined when the source is not configured, so
// callers can report "unverified, weight zero" instead of inventing data.
// With FACTORY_FIXTURE_DIR set (tests and dry runs), GETs read <dir>/<name>/<path>.json.
async function source(env, name, apiPath, { keyEnv, baseEnv, base, query } = {}) {
  const fixtures = env.FACTORY_FIXTURE_DIR;
  if (fixtures) {
    const file = path.join(fixtures, name, ...checkPath(apiPath)) + '.json';
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const baseUrl = base || (baseEnv && env[baseEnv]);
  if (!baseUrl) return undefined;
  return requestJson(baseUrl, apiPath, { key: keyEnv ? env[keyEnv] : undefined, query });
}

module.exports = { requestJson, source, checkPath };
