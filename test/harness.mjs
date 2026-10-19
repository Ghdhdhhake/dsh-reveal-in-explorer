/**
 * Shared test harness: evaluate the shipped `lib/client.js` in a `node:vm`
 * sandbox with a minimal React and DOM, and expose its exports.
 *
 * Every test file loads the built bundle rather than `src/`, so the suite
 * covers exactly what users install.
 *
 * @module test/harness
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { FixtureElement } from './dom.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal React surface the bundle uses; effects run synchronously. */
export function createReact(cleanups, presetState) {
  let stateCalls = 0;
  return {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useRef: (initial) => ({ current: initial }),
    useState: (initial) => {
      stateCalls += 1;
      // The first (and only) state slot in the overlay is the hovered entry;
      // a preset lets tests render the popup as if it were already open.
      if (stateCalls === 1 && presetState !== undefined) return [presetState, () => {}];
      return [initial, () => {}];
    },
    useEffect: (effect) => {
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    },
  };
}

/** Minimal document that records the listeners the overlay installs. */
export function createDocument(listeners) {
  return {
    addEventListener: (type, listener) => { listeners.set(type, listener); },
    removeEventListener: (type) => { listeners.delete(type); },
  };
}

/**
 * Evaluate `lib/client.js` and return the factory's module exports.
 * @param {{ listeners?: Map<string, Function>, warnings?: string[], presetEntry?: object }} [options] - recording sinks and an optional open popup entry.
 * @returns {object} the bundle exports, including `apply` and `__internals`.
 */
export function loadBundle(options = {}) {
  const listeners = options.listeners ?? new Map();
  const cleanups = [];
  const warnings = options.warnings ?? [];
  let definition;

  const sandbox = {
    window: {
      __ModuleLoader__: { load: (value) => { definition = value; } },
      innerWidth: 1200,
      innerHeight: 800,
      clearTimeout,
      setTimeout,
    },
    document: createDocument(listeners),
    Element: FixtureElement,
    console: {
      log: () => {},
      error: () => {},
      warn: (...args) => { warnings.push(args.map(String).join(' ')); },
    },
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(root, 'lib/client.js'), 'utf8'), sandbox, { filename: 'lib/client.js' });

  if (definition === undefined) throw new Error('bundle did not call __ModuleLoader__.load');
  const exports = definition.factory((specifier) => {
    if (specifier !== 'react') throw new Error(`unexpected require(${specifier})`);
    return createReact(cleanups, options.presetEntry);
  });
  exports.__test = { listeners, cleanups, warnings, definition };
  return exports;
}

/**
 * Build a plugin context double with the services the bundle reads.
 * @param {{ openWorkspacePath?: Function }} [options] - overrides.
 * @returns {{ ctx: object, state: object }} the context and its recorder.
 */
export function createContext(options = {}) {
  const state = { calls: [], locale: null, slot: null };
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
        if (key !== 'shell.overlay') throw new Error(`unexpected slot ${key}`);
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
