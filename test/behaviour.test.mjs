/**
 * Behavioural tests for the built client bundle.
 *
 * Covered: module registration, the `inject` contract, locale registration,
 * slot registration, chip placement, the hover listener set, the exact Host
 * Remote request the action sends, and the failure path (error text kept on
 * screen plus a console warning).
 *
 * Run with `node --test test/behaviour.test.mjs`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createContext, loadBundle } from './harness.mjs';

test('the bundle registers under its package name with the expected contract', () => {
  const bundle = loadBundle();
  assert.equal(bundle.__test.definition.id, 'dsh-reveal-in-explorer');
  assert.deepEqual(
    [...bundle.inject],
    ['slots', 'locale', 'remote', 'remote.session'],
  );
});

test('apply registers the dictionaries and the overlay entry', () => {
  const bundle = loadBundle();
  const { ctx, state } = createContext();
  bundle.apply(ctx);

  assert.ok(state.locale, 'locale dictionaries must be registered');
  assert.equal(state.locale.namespace, bundle.__internals.NS);
  assert.equal(state.locale.dictionaries.zh['reveal.action'], '在资源管理器中显示');
  assert.equal(state.locale.dictionaries.en['reveal.action'], 'Reveal in File Explorer');

  assert.ok(state.slot, 'the overlay entry must be registered');
  assert.equal(state.slot.registration.name, 'shell.overlay');
  assert.equal(state.slot.registration.id, 'reveal-in-explorer');
  assert.equal(state.slot.registration.locale, bundle.__internals.NS);
});

test('the overlay mounts closed and installs its listeners', () => {
  const listeners = new Map();
  const bundle = loadBundle({ listeners });
  const { ctx, state } = createContext();
  bundle.apply(ctx);

  const props = { ...state.slot.registration.inject(), t: (key) => key };
  assert.equal(state.slot.component(props), null, 'the popup must start closed');
  for (const type of ['pointerover', 'pointerout', 'focusin', 'scroll', 'keydown']) {
    assert.ok(listeners.has(type), `missing ${type} listener`);
  }
  for (const cleanup of bundle.__test.cleanups) cleanup();
  assert.equal(listeners.size, 0, 'unmounting must remove every listener');
});

test('reveal asks the Host Remote to reveal the file', async () => {
  const bundle = loadBundle();
  const { ctx, state } = createContext();
  bundle.apply(ctx);
  const injected = state.slot.registration.inject();

  assert.equal(injected.currentCwd(), 'C:\\workspace', 'the active Session workspace must be readable');

  const outcome = await injected.reveal('C:\\workspace\\B站下载器代码.txt');
  assert.equal(outcome.ok, true);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].path, 'C:\\workspace\\B站下载器代码.txt');
  assert.equal(state.calls[0].action, 'reveal');
});

test('a Host failure surfaces its reason instead of a bare failure', async () => {
  const bundle = loadBundle();
  const { ctx, state } = createContext({
    openWorkspacePath: async () => ({
      ok: false,
      error: { code: 'gateway/bad-request', message: 'Path has no verified Host path' },
    }),
  });
  bundle.apply(ctx);
  const injected = state.slot.registration.inject();

  const outcome = await injected.reveal('nope.txt');
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, 'Path has no verified Host path');
});

test('a thrown transport error is reported, not swallowed', async () => {
  const bundle = loadBundle();
  const { ctx, state } = createContext({
    openWorkspacePath: async () => { throw new Error('connection closed'); },
  });
  bundle.apply(ctx);
  const outcome = await state.slot.registration.inject().reveal('a.txt');
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /connection closed/);
});

test('a composition without the Host Remote fails softly', async () => {
  const bundle = loadBundle();
  const { ctx, state } = createContext();
  const originalGet = ctx.get;
  ctx.get = (name) => (name === 'remote' ? undefined : originalGet(name));
  bundle.apply(ctx);
  const outcome = await state.slot.registration.inject().reveal('docs/a.txt');
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /remote\.session/);
});

test('a failed reveal logs a warning with the path and the reason', () => {
  const warnings = [];
  const bundle = loadBundle({ warnings });
  bundle.__internals.reportFailure('C:\\workspace\\a.txt', 'permission denied');
  assert.equal(warnings.length, 1, 'exactly one warning per failure');
  assert.match(warnings[0], /reveal-in-explorer/);
  assert.match(warnings[0], /permission denied/);
  assert.match(warnings[0], /C:\\workspace\\a\.txt/);
});

test('the failure reason is kept on the entry for the popup to show', async () => {
  const bundle = loadBundle();
  const { ctx, state } = createContext({
    openWorkspacePath: async () => ({ ok: false, error: { message: 'permission denied' } }),
  });
  bundle.apply(ctx);
  const injected = state.slot.registration.inject();
  const outcome = await injected.reveal('a.txt');
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, 'permission denied', 'the overlay renders this string');
});

// --- chip placement ------------------------------------------------------
test('the chip prefers the right of the reference', () => {
  const { placeChip } = loadBundle().__internals;
  const placed = placeChip(
    { left: 100, top: 200, right: 300, bottom: 220, width: 200, height: 20 },
    { width: 260, height: 34 },
    { width: 1200, height: 800 },
  );
  assert.equal(placed.left, 308);
  assert.equal(placed.top, 193, 'vertically centred on the reference');
});

test('the chip drops below when the right side is tight', () => {
  const { placeChip } = loadBundle().__internals;
  const placed = placeChip(
    { left: 900, top: 200, right: 1180, bottom: 220, width: 280, height: 20 },
    { width: 260, height: 34 },
    { width: 1200, height: 800 },
  );
  assert.equal(placed.left, 900);
  assert.equal(placed.top, 228);
});

test('the chip flips above and stays inside the viewport at the bottom edge', () => {
  const { placeChip } = loadBundle().__internals;
  const placed = placeChip(
    { left: 900, top: 780, right: 1180, bottom: 798, width: 280, height: 18 },
    { width: 260, height: 34 },
    { width: 1200, height: 800 },
  );
  assert.equal(placed.top, 738);
  assert.ok(placed.left + 260 <= 1200 - 8);
  assert.ok(placed.top >= 8);
});
