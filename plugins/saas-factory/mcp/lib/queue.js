'use strict';
// The only way a draft server "writes": a new JSON file under queue/ in the checkout.
// Files are never overwritten, so an agent cannot edit something a human already reviewed.
const fs = require('node:fs');
const path = require('node:path');

const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function writeNew(cwd, sub, name, obj) {
  if (!NAME.test(String(name))) throw new Error(`bad file name: ${name}`);
  if (!NAME.test(String(sub))) throw new Error(`bad queue folder: ${sub}`);
  const root = path.join(cwd, 'queue');
  const dir = path.join(root, sub);
  fs.mkdirSync(dir, { recursive: true });
  const realRoot = fs.realpathSync(root);
  const realDir = fs.realpathSync(dir);
  if (!realDir.startsWith(realRoot + path.sep)) throw new Error('queue folder resolves outside queue/');
  const json = JSON.stringify(obj, null, 2) + '\n';
  if (json.length > 500000) throw new Error('queue file too large');
  const file = path.join(realDir, `${name}.json`);
  try {
    fs.writeFileSync(file, json, { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') throw new Error(`queue/${sub}/${name}.json already exists; use a new name`);
    throw err;
  }
  return `queue/${sub}/${name}.json`;
}

module.exports = { writeNew, NAME };
