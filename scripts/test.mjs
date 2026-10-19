/**
 * Behavioural tests for the built client bundle, with no browser and no
 * network: `lib/client.js` is evaluated in a `node:vm` sandbox whose
 * `__ModuleLoader__`, React, and DOM are minimal stubs.
 *
 * Covered: module registration, the `inject` contract, locale registration,
 * slot registration, workspace-relative path resolution, the pointer-hover
 * listener set, and the exact Host Remote request the action sends.
 *
 * Run with `node scripts/test.mjs`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** Minimal React surface the bundle uses. */
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useRef: (initial) => ({ current: initial }),
  useState: (initial) => [initial, () => {}],
  // Run the effect synchronously so the listener assertions below observe the
  // same registration the browser would perform on mount.
  useEffect: (effect) => {
    const cleanup = effect();
    if (typeof cleanup === 'function') cleanups.push(cleanup);
  },
};

/** Cleanups returned by the stubbed effects, run at the end of the test. */
const cleanups = [];

/** Minimal document that records the listeners the overlay installs. */
const listeners = new Map();
const document = {
  addEventListener: (type, listener) => { listeners.set(type, listener); },
  removeEventListener: (type) => { listeners.delete(type); },
};

/** A stand-in for `Element` that only answers the selectors a test sets up. */
class FakeElement {
  constructor(selectors = {}) {
    this.selectors = selectors;
    this.connected = true;
  }
  get isConnected() {
    return this.connected;
  }
  closest(selector) {
    return this.selectors[selector] ?? null;
  }
  querySelector(selector) {
    return this.selectors[`query:${selector}`] ?? null;
  }
  getAttribute(name) {
    return this.selectors[`@${name}`] ?? null;
  }
  getBoundingClientRect() {
    return { left: 10, top: 20, right: 120, bottom: 40, width: 110, height: 20 };
  }
}

/** Evaluate the bundle and return its factory exports. */
function loadBundle() {
  let definition;
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (value) => { definition = value; } },
      innerWidth: 1200,
      innerHeight: 800,
      clearTimeout,
      setTimeout,
    },
    document,
    Element: FakeElement,
    console,
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(root, 'lib/client.js'), 'utf8'), sandbox, { filename: 'lib/client.js' });

  assert.ok(definition, 'bundle did not call __ModuleLoader__.load');
  assert.equal(definition.id, manifest.name, 'loader id must equal the package name');
  assert.equal(typeof definition.factory, 'function', 'loader factory must be a function');

  const factory = definition.factory;
  const loaded = factory((specifier) => {
    assert.equal(specifier, 'react', `unexpected require(${specifier})`);
    return React;
  });
  return loaded;
}

/** Build a plugin context double with the services the bundle reads. */
function createContext(options = {}) {
  const state = {
    calls: [],
    locale: null,
    slot: null,
    listenersInstalled: false,
  };
  const openWorkspacePath = options.openWorkspacePath ?? (async (request) => {
    state.calls.push(request);
    return { ok: true, value: { opened: true } };
  });

  const ctx = {
    effect: (callback) => {
      const dispose = callback();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    locale: {
      register: (namespace, dictionaries) => {
        state.locale = { namespace, dictionaries };
        return () => {};
      },
    },
    get: (name) => {
      if (name === 'remote') return { session: { openWorkspacePath } };
      if (name === 'sessions') {
        return {
          list: {
            getSnapshot: () => ({
              current: 'session-1',
              byId: { 'session-1': { cwd: 'C:\\workspace' } },
            }),
          },
        };
      }
      return undefined;
    },
    slots: {
      inject: (key, callback) => {
        assert.equal(key, 'shell.overlay', 'must mount into the frame overlay');
        callback();
        return () => {};
      },
      register: (registration, component) => {
        state.slot = { registration, component };
        return () => {};
      },
    },
  };

  return { ctx, state };
}

const bundle = loadBundle();

assert.deepEqual(
  [...bundle.inject],
  ['slots', 'locale', 'remote', 'remote.session'],
  'inject must declare the services the bundle reads',
);

const internals = bundle.__internals;
assert.ok(internals, 'bundle must expose __internals for tests');

// --- path helpers ---------------------------------------------------------
assert.equal(internals.isAbsolutePath('/usr/local/a.txt'), true);
assert.equal(internals.isAbsolutePath('C:\\work\\a.txt'), true);
assert.equal(internals.isAbsolutePath('\\\\server\\share\\a.txt'), true);
assert.equal(internals.isAbsolutePath('docs/a.txt'), false);
assert.equal(internals.resolveWorkspacePath('C:\\workspace', 'docs/a.txt'), 'C:\\workspace\\docs/a.txt');
assert.equal(internals.resolveWorkspacePath('/home/me/ws', 'docs/a.txt'), '/home/me/ws/docs/a.txt');
assert.equal(internals.resolveWorkspacePath('/home/me/ws', '/etc/passwd'), '/etc/passwd');
assert.equal(internals.resolveWorkspacePath(undefined, 'docs/a.txt'), 'docs/a.txt');
assert.equal(internals.basename('C:\\workspace\\B站下载器代码.txt'), 'B站下载器代码.txt');
assert.equal(internals.basename('docs/readme.md'), 'readme.md');

// --- tooltip classification ----------------------------------------------
assert.equal(internals.looksLikePath('C:\\workspace\\a.txt'), true);
assert.equal(internals.looksLikePath('docs/a.txt'), true);
assert.equal(internals.looksLikePath('B站下载器代码.txt'), true);
assert.equal(internals.looksLikePath('Copy'), false);
assert.equal(internals.looksLikePath('Open in sidebar'), false);
assert.equal(internals.looksLikePath('https://example.com/a.txt'), false);
assert.equal(internals.looksLikePath('dsh-resource://file/session/x/a.txt'), false);

// --- reference detection -------------------------------------------------
const mention = new FakeElement({ 'code > button[title]': null, '@title': 'docs/a.txt' });
mention.selectors['code > button[title]'] = mention;
{
  const found = internals.readPathTarget(mention);
  assert.equal(found.element, mention, 'inline-code mentions resolve through their title');
  assert.equal(found.path, 'docs/a.txt', 'inline-code mentions resolve through their title');
}

const chip = new FakeElement({ '@title': 'docs/chip.txt' });
chip.selectors['[data-ref-chip="file"][title], [data-ref-chip="folder"][title]'] = chip;
assert.equal(internals.readPathTarget(chip).path, 'docs/chip.txt', 'file chips resolve through their title');

const cardButton = new FakeElement({ '@title': 'C:\\workspace\\card.txt' });
const card = new FakeElement({ 'query:button[title]': cardButton });
card.selectors['[data-presented-file]'] = card;
{
  const found = internals.readPathTarget(card);
  assert.equal(found.element, card, 'delivered-file cards resolve through their action title');
  assert.equal(found.path, 'C:\\workspace\\card.txt', 'delivered-file cards resolve through their action title');
}

const plainButton = new FakeElement({ '@title': 'Copy' });
plainButton.selectors['[data-chat-flow] button[title], [data-chat-flow] a[title]'] = plainButton;
assert.equal(internals.readPathTarget(plainButton), null, 'prose tooltips must not become actions');

// --- registration --------------------------------------------------------
{
  const { ctx, state } = createContext();
  bundle.apply(ctx);

  assert.ok(state.locale, 'locale dictionaries must be registered');
  assert.equal(state.locale.namespace, internals.NS);
  assert.equal(state.locale.dictionaries.zh['reveal.action'], '在资源管理器中显示');
  assert.equal(state.locale.dictionaries.en['reveal.action'], 'Reveal in File Explorer');

  assert.ok(state.slot, 'the overlay entry must be registered');
  assert.equal(state.slot.registration.name, 'shell.overlay');
  assert.equal(state.slot.registration.id, 'reveal-in-explorer');
  assert.equal(state.slot.registration.locale, internals.NS);

  const injected = state.slot.registration.inject();
  assert.equal(typeof injected.reveal, 'function');
  assert.equal(typeof injected.currentCwd, 'function');
  assert.equal(injected.currentCwd(), 'C:\\workspace', 'the active Session workspace must be readable');

  const outcome = await injected.reveal('C:\\workspace\\B站下载器代码.txt');
  // Values crossing the vm boundary carry the sandbox realm's prototypes, so
  // compare fields rather than object identity.
  assert.equal(outcome.ok, true);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].path, 'C:\\workspace\\B站下载器代码.txt');
  assert.equal(state.calls[0].action, 'reveal', 'the action must ask the Host Remote to reveal the file');

  // The component mounts closed and installs the hover listeners.
  const props = { ...injected, t: (key) => key };
  assert.equal(state.slot.component(props), null, 'the popup must start closed');
  for (const type of ['pointerover', 'pointerout', 'focusin', 'scroll', 'keydown']) {
    assert.ok(listeners.has(type), `missing ${type} listener`);
  }
}

for (const cleanup of cleanups) cleanup();
assert.equal(listeners.size, 0, 'unmounting must remove every listener');

// --- failure reporting ---------------------------------------------------
{
  const { ctx, state } = createContext({
    openWorkspacePath: async () => ({ ok: false, error: { code: 'gateway/bad-request', message: 'no verified Host path' } }),
  });
  bundle.apply(ctx);
  const injected = state.slot.registration.inject();
  const outcome = await injected.reveal('nope.txt');
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, 'no verified Host path', 'Host failures must surface the reason');
}

// --- missing Remote degrades instead of throwing -------------------------
{
  const { ctx, state } = createContext();
  const originalGet = ctx.get;
  ctx.get = (name) => (name === 'remote' ? undefined : originalGet(name));
  bundle.apply(ctx);
  const injected = state.slot.registration.inject();
  const outcome = await injected.reveal('docs/a.txt');
  assert.equal(outcome.ok, false, 'a composition without the Host Remote must fail softly');
  assert.match(outcome.error, /remote\.session/, 'the failure must name the missing service');
}

console.log('OK client bundle behaviour verified');
