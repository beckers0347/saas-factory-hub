'use strict';
// marketing-draft: holds no credential and makes no network call. Its only effect is a new
// file under queue/, which the owner reviews and loads into the email or social tool by hand.
const { serve } = require('./lib/server');
const { writeNew, NAME } = require('./lib/queue');

const today = () => new Date().toISOString().slice(0, 10);
const text = (v, max, what) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`${what} must be 1 to ${max} characters`);
  return v.trim();
};

function makeTools(env = process.env, cwd = process.cwd()) {
  const slug = env.PRODUCT_SLUG || null;
  return [
    {
      name: 'draft_social_queue',
      description: 'Saves short-form social script drafts to queue/social/ for human review. Nothing is published.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' }, items: { type: 'array' } },
        required: ['name', 'items'],
      },
      handler: async ({ name, items }) => {
        if (!NAME.test(name)) throw new Error('name must be letters, digits, dash or underscore');
        if (!items.length || items.length > 20) throw new Error('items must hold 1 to 20 drafts');
        const drafts = items.map((it, i) => ({
          platform: text(it && it.platform, 40, `items[${i}].platform`),
          hook: text(it && it.hook, 200, `items[${i}].hook`),
          script: text(it && it.script, 2000, `items[${i}].script`),
        }));
        const file = writeNew(cwd, 'social', `${today()}-${name}`, {
          product: slug, status: 'PENDING_HUMAN_APPROVAL', created: new Date().toISOString(), drafts,
        });
        return `Saved ${drafts.length} draft(s) to ${file}. Nothing was published.`;
      },
    },
    {
      name: 'draft_email_drip',
      description: 'Saves a lifecycle email sequence draft (opted-in waitlist or new users only) to queue/drips/. Cannot edit a live sequence.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          audience: { type: 'string', enum: ['waitlist', 'new_users'] },
          emails: { type: 'array' },
        },
        required: ['name', 'audience', 'emails'],
      },
      handler: async ({ name, audience, emails }) => {
        if (!NAME.test(name)) throw new Error('name must be letters, digits, dash or underscore');
        if (!emails.length || emails.length > 8) throw new Error('emails must hold 1 to 8 messages');
        const sequence = emails.map((e, i) => {
          const delay = e && e.delay_days;
          if (!Number.isInteger(delay) || delay < 0 || delay > 60) throw new Error(`emails[${i}].delay_days must be 0 to 60`);
          return {
            delay_days: delay,
            subject: text(e.subject, 120, `emails[${i}].subject`),
            body: text(e.body, 4000, `emails[${i}].body`),
          };
        });
        const file = writeNew(cwd, 'drips', `${today()}-${name}`, {
          product: slug, audience, status: 'PENDING_HUMAN_APPROVAL', created: new Date().toISOString(), sequence,
        });
        return `Saved a ${sequence.length}-email draft to ${file}. The owner approves it and loads it into the email provider.`;
      },
    },
  ];
}

if (require.main === module) serve({ name: 'marketing-draft', version: '0.3.0' }, makeTools());

module.exports = { makeTools };
