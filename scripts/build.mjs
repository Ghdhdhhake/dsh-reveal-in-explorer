/**
 * Build the shipped artifacts from `src/`.
 *
 * Two outputs, both committed so that installing this bundle never runs a
 * build script:
 *
 * - `lib/index.js` — the Host entry (`export function apply()`), copied as-is
 *   because it is already plain ESM.
 * - `lib/client.js` — the Web client entry. DSH's browser module loader expects
 *   a `window.__ModuleLoader__.load({ id, factory })` envelope whose factory is
 *   CommonJS; the authored source is a CJS factory body, so the build only adds
 *   that envelope and the banner.
 *
 * Run with `node scripts/build.mjs`. The script is dependency-free.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** Read one authored source file as UTF-8. */
function readSource(relative) {
  return readFileSync(join(root, relative), 'utf8');
}

/** Write one shipped artifact, creating its directory first. */
function writeArtifact(relative, contents) {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, 'utf8');
  return relative;
}

const banner = `/* ${manifest.name} ${manifest.version} — built from src/client/index.js by scripts/build.mjs. Do not edit. */\n`;

const clientSource = readSource('src/client/index.js');
const clientBundle = `${banner}window.__ModuleLoader__.load({
  id: ${JSON.stringify(manifest.name)},
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
${clientSource
  .split('\n')
  .map((line) => (line === '' ? '' : `    ${line}`))
  .join('\n')}
    return module.exports;
  },
});
`;

const written = [
  writeArtifact('lib/index.js', readSource('src/index.js')),
  writeArtifact('lib/client.js', clientBundle),
];

for (const file of written) console.log(`built ${file}`);
