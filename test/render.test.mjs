/**
 * Render tests for the popup itself.
 *
 * The overlay's states are what a user actually sees, so they are pinned here:
 * the idle chip offers the action, a failure shows the Host's reason under the
 * label, and a success state closes itself. React is a stub, so this asserts the
 * element tree the component returns — enough to catch a state that renders
 * nothing or loses its error text.
 *
 * Run with `node --test test/render.test.mjs`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createContext, loadBundle } from './harness.mjs';

/** Flatten a stub element tree into its text content. */
function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node.children ?? []).map(textOf).join('');
}

/** Render the overlay with a preset open entry and return its element tree. */
function renderOpen(entry, options = {}) {
  const bundle = loadBundle({ presetEntry: entry });
  const { ctx, state } = createContext();
  bundle.apply(ctx);
  const props = {
    ...state.slot.registration.inject(),
    t: (key) => options.dictionary?.[key] ?? key,
  };
  const tree = state.slot.component(props);
  for (const cleanup of bundle.__test.cleanups) cleanup();
  return tree;
}

/** The chip rect used by every case. */
const RECT = { left: 100, top: 200, right: 300, bottom: 220, width: 200, height: 20 };

test('the idle chip shows the action and anchors to the reference path', () => {
  const tree = renderOpen({ path: 'C:\\workspace\\a.txt', phase: 'idle', rect: RECT });
  assert.ok(tree !== null, 'an open entry must render a chip');
  const button = tree.children[0];
  assert.equal(button.type, 'button');
  assert.equal(button.props.title, 'C:\\workspace\\a.txt');
  assert.equal(button.props['data-phase'], 'idle');
  assert.match(button.props['aria-label'], /C:\\workspace\\a\.txt/);
  assert.match(textOf(tree), /reveal\.action/);
});

test('a failure renders the Host reason under the label', () => {
  const tree = renderOpen({
    path: 'C:\\workspace\\a.txt',
    phase: 'error',
    detail: 'Path has no verified Host path',
    rect: RECT,
  });
  const text = textOf(tree);
  assert.match(text, /reveal\.error/, 'the failure headline stays visible');
  assert.match(text, /Path has no verified Host path/, 'the reason is shown, not swallowed');
  const button = tree.children[0];
  assert.equal(button.props['data-phase'], 'error');
  assert.match(button.props.title, /Path has no verified Host path/, 'the tooltip keeps the reason too');
  assert.equal(button.props.disabled, false, 'a failed attempt must stay clickable to retry');
});

test('a failure without a reason still renders a usable chip', () => {
  const tree = renderOpen({ path: 'a.txt', phase: 'error', detail: '', rect: RECT });
  assert.match(textOf(tree), /reveal\.error/);
  assert.equal(tree.children[0].props.disabled, false);
});

test('the busy state disables the chip so the action cannot double-fire', () => {
  const tree = renderOpen({ path: 'a.txt', phase: 'busy', rect: RECT });
  assert.equal(tree.children[0].props.disabled, true);
  assert.match(textOf(tree), /reveal\.busy/);
});

test('the done state is not clickable', () => {
  const tree = renderOpen({ path: 'a.txt', phase: 'done', rect: RECT });
  assert.match(textOf(tree), /reveal\.done/);
});

test('the chip uses theme tokens rather than hard-coded colours', () => {
  const tree = renderOpen({ path: 'a.txt', phase: 'idle', rect: RECT });
  const style = tree.children[0].props.style;
  assert.match(style.background, /^var\(--dsw-/);
  assert.match(style.border, /var\(--dsw-/);
  assert.match(style.color, /^var\(--dsw-/);
});

test('a failing chip is tinted with the error token', () => {
  const tree = renderOpen({ path: 'a.txt', phase: 'error', detail: 'boom', rect: RECT });
  assert.match(tree.children[0].props.style.color, /state-error/);
});

test('the rendered chip stays inside the viewport', () => {
  const tree = renderOpen({ path: 'a.txt', phase: 'idle', rect: { left: 1100, top: 760, right: 1180, bottom: 780, width: 80, height: 20 } });
  const style = tree.props.style;
  assert.ok(style.left >= 0 && style.left <= 1200, `left ${style.left} is inside the viewport`);
  assert.ok(style.top >= 0 && style.top <= 800, `top ${style.top} is inside the viewport`);
});
