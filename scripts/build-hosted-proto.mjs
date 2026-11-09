import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

// Build the Vue app first. Runtime secrets are never part of this artifact.
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.csv': 'text/csv; charset=utf-8', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const assets = {};
function collect(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['server', '.openai'].includes(entry.name)) continue;
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) collect(join(directory, entry.name), name);
    else assets[name] = { type: types[extname(entry.name)] || 'application/octet-stream', data: readFileSync(join(directory, entry.name)).toString('base64') };
  }
}
collect('dist');
const evidence = JSON.parse(readFileSync('hosting/demo-evidence.json', 'utf8'));
const worker = readFileSync('hosting/worker.mjs', 'utf8').replace("import { assets, demoEvidence } from './generated-assets.mjs';", `const assets = ${JSON.stringify(assets)};\nconst demoEvidence = ${JSON.stringify(evidence)};`);
mkdirSync('dist/server', { recursive: true });
writeFileSync('dist/server/index.js', worker);
console.log(`Hosted prototype: ${Object.keys(assets).length} assets, ${evidence.length} warehouse pairs; runtime map secret excluded.`);
