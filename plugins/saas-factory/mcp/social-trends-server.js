'use strict';
// social-trends: read-only demand signals. Every result says whether its source is verified.
// A source that is not configured returns weight 0, so the scoring step cannot lean on it
// and a human fills the gap at Gate 1.
const { serve } = require('./lib/server');
const { NOTICE, sanitize, wrapUntrusted } = require('./lib/untrusted');
const { source } = require('./lib/sources');

const unverified = (signal, humanStep) => ({ signal, verified: false, weight: 0, note: `No verified source is configured. ${humanStep}` });

function makeTools(env = process.env) {
  return [
    {
      name: 'query_search_trends',
      description: 'Returns search volume and 90-day trend for up to 10 keywords.',
      inputSchema: { type: 'object', properties: { keywords: { type: 'array' } }, required: ['keywords'] },
      handler: async ({ keywords }) => {
        const list = keywords.filter((k) => typeof k === 'string').map((k) => sanitize(k, 80)).filter(Boolean).slice(0, 10);
        if (!list.length) throw new Error('keywords must hold at least one string');
        const data = await source(env, 'trend', 'search-trends', {
          baseEnv: 'TREND_API_BASE', keyEnv: 'TREND_DATA_API_KEY', query: { keywords: list.join(',') },
        });
        if (data === undefined) {
          return unverified('rising search interest', 'Score this signal as zero and ask the owner to check search volumes by hand.');
        }
        return {
          signal: 'rising search interest', verified: true, weight: 1,
          keywords: (Array.isArray(data && data.keywords) ? data.keywords : []).slice(0, 10).map((k) => ({
            keyword: sanitize(k.keyword, 80), volume: Number(k.volume) || 0, trend_pct_90d: Number(k.trend_pct_90d) || 0,
          })),
        };
      },
    },
    {
      name: 'query_ad_library',
      description: 'Returns long-running ads for a niche, if an ad data source is configured.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      handler: async ({ query }) => {
        const data = await source(env, 'trend', 'ads', {
          baseEnv: 'TREND_API_BASE', keyEnv: 'TREND_DATA_API_KEY', query: { q: sanitize(query, 120) },
        });
        if (data === undefined) {
          return unverified('ad longevity', 'Score this signal as zero. The owner reviews the ad library web UI for the top 3 candidates at Gate 1.');
        }
        const ads = (Array.isArray(data && data.ads) ? data.ads : []).slice(0, 15);
        return [
          NOTICE,
          'signal: ad longevity (verified source, weight 1)',
          ...ads.map((a) => `- ${sanitize(a.advertiser, 80)}, running ${Number(a.days_running) || 0} days: ${wrapUntrusted('AD_TEXT', a.text, 400)}`),
        ].join('\n');
      },
    },
    {
      name: 'query_community_pain',
      description: 'Searches Hacker News and Stack Overflow for recurring complaints and requests about a workflow.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      handler: async ({ query }) => {
        const q = sanitize(query, 120);
        if (!q) throw new Error('query is empty');
        const out = [NOTICE, 'signal: complaints and requests (public APIs, weight 1 only if results are on-topic)'];
        try {
          const hn = await source(env, 'hn', 'search', {
            base: 'https://hn.algolia.com/api/v1', query: { query: q, tags: '(story,comment)', hitsPerPage: 10 },
          });
          const hits = (hn && Array.isArray(hn.hits) ? hn.hits : []).slice(0, 10);
          out.push(`\nHacker News: ${hits.length} result(s)`);
          for (const h of hits) {
            out.push(`- ${Number(h.points) || 0} points, ${sanitize(h.created_at, 30)}: ${wrapUntrusted('FORUM_TEXT', h.title || h.story_title || h.comment_text || h.story_text, 500)}`);
          }
        } catch (err) {
          out.push(`\nHacker News: unavailable (${err.message}). Weight 0 for this source.`);
        }
        try {
          const se = await source(env, 'stackexchange', 'search/advanced', {
            base: 'https://api.stackexchange.com/2.3',
            query: { q, site: 'stackoverflow', order: 'desc', sort: 'votes', pagesize: 10 },
          });
          const items = (se && Array.isArray(se.items) ? se.items : []).slice(0, 10);
          out.push(`\nStack Overflow: ${items.length} result(s)`);
          for (const it of items) {
            out.push(`- score ${Number(it.score) || 0}, ${Number(it.view_count) || 0} views, ${Number(it.answer_count) || 0} answers: ${wrapUntrusted('FORUM_TEXT', it.title, 300)}`);
          }
        } catch (err) {
          out.push(`\nStack Overflow: unavailable (${err.message}). Weight 0 for this source.`);
        }
        return out.join('\n');
      },
    },
  ];
}

if (require.main === module) serve({ name: 'social-trends', version: '0.3.0' }, makeTools());

module.exports = { makeTools };
