/**
 * Static checks for the published bundle, with no network and no dependencies.
 *
 * Verifies the manifest contract DSH reads before it imports anything:
 * bundle patch, client platform, exported locale/icon resources, declared
 * files on disk, `engines.dsh` compatibility, a valid icon payload, and the
 * selector contract the client depends on.
 *
 * Run with `node scripts/check.mjs`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

/** Record a failed assertion. */
function fail(message) {
  failures.push(message);
}

/** Assert a condition, recording the message when it does not hold. */
function expect(condition, message) {
  if (!condition) fail(message);
}

/** Read and parse one JSON file relative to the package root. */
function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

/**
 * Expand a `files` entry the way npm does: a literal path, a directory, or a
 * single-`*` glob segment.
 * @param {string} entry - one `files` pattern.
 * @returns {string[]} matching package-relative paths.
 */
function expandFileEntry(entry) {
  if (!entry.includes('*')) {
    const target = join(root, entry);
    if (!existsSync(target)) return [];
    if (!statSync(target).isDirectory()) return [entry];
    const found = [];
    const walk = (directory) => {
      for (const name of readdirSync(directory)) {
        const absolute = join(directory, name);
        if (statSync(absolute).isDirectory()) walk(absolute);
        else found.push(relative(root, absolute).split('\\').join('/'));
      }
    };
    walk(target);
    return found;
  }

  const directory = join(root, dirname(entry));
  const pattern = new RegExp(`^${entry.split('/').pop().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => pattern.test(name))
    .map((name) => `${dirname(entry).split('\\').join('/')}/${name}`.replace(/^\.\//, ''));
}

const manifest = readJson('package.json');
const pluginManifest = readJson('dsh.plugin.json');

expect(typeof manifest.name === 'string' && manifest.name.length > 0, 'package.json: name is required');
expect(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version), 'package.json: version must be semantic');
expect(manifest.type === 'module', 'package.json: type must be "module"');
expect(manifest.dsh?.bundle?.patch === './cordis.patch.yml', 'package.json: dsh.bundle.patch must point at ./cordis.patch.yml');
expect(manifest.dsh?.client?.platform === 'web', 'package.json: dsh.client.platform must be "web"');
expect(Array.isArray(manifest.dsh?.client?.inject), 'package.json: dsh.client.inject must be an array');
expect(typeof manifest.engines?.dsh === 'string', 'package.json: engines.dsh is required for the compatibility gate');

expect(manifest.exports?.['.']?.default === './lib/index.js', 'package.json: "." must export lib/index.js');
expect(manifest.exports?.['./client']?.default === './lib/client.js', 'package.json: "./client" must export lib/client.js');
expect(manifest.exports?.['./icon'] === './icon.svg', 'package.json: "./icon" must export icon.svg');
expect(manifest.exports?.['./locale/*.json'] === './locale/*.json', 'package.json: locale files must be exported');

expect(Array.isArray(manifest.files) && manifest.files.includes('lib'), 'package.json: files must ship lib/');
expect(Array.isArray(manifest.files) && manifest.files.includes('cordis.patch.yml'), 'package.json: files must ship cordis.patch.yml');
expect(Array.isArray(manifest.files) && manifest.files.includes('dsh.plugin.json'), 'package.json: files must ship dsh.plugin.json');

expect(pluginManifest.name === manifest.name, 'dsh.plugin.json: name must match package.json');
expect(pluginManifest.version === manifest.version, 'dsh.plugin.json: version must match package.json');
expect(pluginManifest.entry?.name === manifest.name, 'dsh.plugin.json: entry.name must match package.json');

for (const relative of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'dsh.plugin.json', 'icon.svg', 'LICENSE', 'README.md']) {
  expect(existsSync(join(root, relative)), `missing file: ${relative}`);
}

for (const locale of ['en', 'zh']) {
  const relative = `locale/${locale}.json`;
  if (!existsSync(join(root, relative))) {
    fail(`missing file: ${relative}`);
    continue;
  }
  const dictionary = readJson(relative);
  expect(typeof dictionary.meta?.title === 'string' && dictionary.meta.title.length > 0, `${relative}: meta.title is required`);
  expect(typeof dictionary.meta?.description === 'string' && dictionary.meta.description.length > 0, `${relative}: meta.description is required`);
}

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
expect(/id:\s*reveal-in-explorer/.test(patch), 'cordis.patch.yml: must insert the reveal-in-explorer row');
expect(/name:\s*'dsh-reveal-in-explorer'/.test(patch), "cordis.patch.yml: row name must be 'dsh-reveal-in-explorer'");

const clientBundle = readFileSync(join(root, 'lib/client.js'), 'utf8');
expect(clientBundle.startsWith('/*'), 'lib/client.js: expected the build banner');
expect(clientBundle.includes(`id: ${JSON.stringify(manifest.name)}`), 'lib/client.js: loader id must equal the package name');
expect(clientBundle.includes('window.__ModuleLoader__.load({'), 'lib/client.js: missing the module-loader envelope');
expect(clientBundle.includes('factory(require)'), 'lib/client.js: factory must accept require');

const hostEntry = readFileSync(join(root, 'lib/index.js'), 'utf8');
expect(/export\s+function\s+apply\s*\(/.test(hostEntry), 'lib/index.js: must export apply()');

// The selector contract is the one place a DSH upgrade can break this plugin
// silently, so the fixture and the selector table must both be present.
expect(existsSync(join(root, 'test/fixtures/chat-transcript.html')), 'missing file: test/fixtures/chat-transcript.html');
expect(clientBundle.includes('SELECTORS'), 'lib/client.js: the selector table must be present');
for (const selector of ['data-chat-flow', 'data-ref-chip', 'data-presented-file', 'fileLink']) {
  expect(clientBundle.includes(selector), `lib/client.js: selector contract lost "${selector}"`);
}

const icon = readFileSync(join(root, 'icon.svg'), 'utf8');
expect(icon.trimStart().startsWith('<svg'), 'icon.svg: must be an SVG document');
expect(statSync(join(root, 'icon.svg')).size <= 256 * 1024, 'icon.svg: must stay under 256 KiB');

// Everything the manifest promises to ship must exist on disk, and the files
// DSH reads at install time must be inside that set — otherwise a published
// tarball is missing a file the Host will ask for.
const shipped = new Set();
for (const entry of manifest.files ?? []) {
  for (const file of expandFileEntry(entry)) shipped.add(file);
}
for (const required of [
  'lib/index.js',
  'lib/client.js',
  'cordis.patch.yml',
  'dsh.plugin.json',
  'locale/en.json',
  'locale/zh.json',
  'icon.svg',
  'LICENSE',
  'README.md',
]) {
  expect(shipped.has(required), `package.json "files" must ship ${required}`);
}

if (failures.length > 0) {
  for (const message of failures) console.error(`FAIL ${message}`);
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}

console.log(`OK ${manifest.name}@${manifest.version} — manifest, resources, selector contract, and shipped files are consistent`);
console.log(`   ${shipped.size} files ship from package.json "files"`);
