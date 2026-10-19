/**
 * Selector contract tests.
 *
 * Every selector the plugin uses must still find the right element in
 * `test/fixtures/chat-transcript.html`. This is the guard against a silent
 * break: if a DSH upgrade renames `data-chat-flow`, drops the `title` on file
 * mentions, or stops marking delivered cards, these tests fail while the
 * fixture still describes the markup the plugin was written against.
 *
 * Run with `node --test test/selectors.test.mjs`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { parseHtml, querySelectorAll } from './dom.mjs';
import { loadBundle, root } from './harness.mjs';

const bundle = loadBundle();
const { readPathTarget, looksLikePath } = bundle.__internals;

/** The fixture parsed once per file. */
const fixture = parseHtml(readFileSync(join(root, 'test/fixtures/chat-transcript.html'), 'utf8'));

/** Every element matching a selector, as `tag[title]` labels for readable failures. */
function matches(selector) {
  return querySelectorAll(fixture, selector).map((element) => {
    const title = element.getAttribute('title');
    return title === null ? element.tagName : `${element.tagName}[${title}]`;
  });
}

/** The bundle's selector table, read from the built artifact. */
const SELECTORS = bundle.__internals.SELECTORS;

test('the bundle exposes its selector table', () => {
  assert.equal(typeof SELECTORS, 'object');
  for (const key of ['mention', 'chip', 'fileLink', 'presentedCard', 'presentedAction', 'chatFlow', 'titledFallback']) {
    assert.equal(typeof SELECTORS[key], 'string', `SELECTORS.${key} must be a selector string`);
  }
});

test('inline-code mentions are found by the mention selector', () => {
  assert.deepEqual(
    matches(SELECTORS.mention),
    ['button[B站下载器代码.txt]', 'button[C:\\work\\bili-下载\\downloader.py]'],
  );
});

test('the file chip selector only matches file/folder chips', () => {
  assert.deepEqual(matches(SELECTORS.chip), ['button[docs/spec.pdf]']);
});

test('the markdown file-link selector matches the link form', () => {
  assert.deepEqual(matches(SELECTORS.fileLink), ['button[docs/usage.md]']);
});

test('delivered-file cards expose a titled action', () => {
  const cards = querySelectorAll(fixture, SELECTORS.presentedCard);
  assert.equal(cards.length, 1, 'the fixture must contain one delivered-file card');
  const action = cards[0].querySelector(SELECTORS.presentedAction);
  assert.ok(action !== null, 'the card must expose a titled action');
  assert.equal(action.getAttribute('title'), 'C:\\work\\bili-下载\\README.md');
});

test('the transcript column selector matches the chat flow', () => {
  assert.equal(querySelectorAll(fixture, SELECTORS.chatFlow).length, 1);
});

test('the titled fallback matches titled actions in the transcript', () => {
  const found = matches(SELECTORS.titledFallback);
  assert.ok(found.includes('button[Copy]'), 'prose tooltips are still matched by the fallback');
  assert.ok(found.includes('button[C:\\work\\bili-下载\\README.md]'));
});

// --- behaviour on the fixture --------------------------------------------

/** Resolve a reference from a real fixture node, the way the overlay does. */
function resolveAt(selector, title) {
  const elements = querySelectorAll(fixture, selector);
  const target = elements.find((element) => element.getAttribute('title') === title);
  assert.ok(target !== undefined, `fixture has no ${selector} with title ${title}`);
  return readPathTarget(target);
}

test('an inline-code mention resolves to its path', () => {
  const found = resolveAt(SELECTORS.mention, 'B站下载器代码.txt');
  assert.equal(found.path, 'B站下载器代码.txt');
  assert.equal(found.element.getAttribute('title'), 'B站下载器代码.txt');
});

test('a markdown file link resolves to its path', () => {
  const found = resolveAt(SELECTORS.fileLink, 'docs/usage.md');
  assert.equal(found.path, 'docs/usage.md');
});

test('a delivered-file card resolves through its action button', () => {
  const card = querySelectorAll(fixture, SELECTORS.presentedCard)[0];
  const found = readPathTarget(card);
  assert.equal(found.path, 'C:\\work\\bili-下载\\README.md');
  assert.equal(found.element, card, 'the popup anchors to the card, not its button');
});

test('a file chip resolves to its path', () => {
  const found = resolveAt(SELECTORS.chip, 'docs/spec.pdf');
  assert.equal(found.path, 'docs/spec.pdf');
});

test('prose tooltips never become reveal actions', () => {
  for (const label of ['Copy', 'Open in sidebar', 'Retry']) {
    const button = querySelectorAll(fixture, SELECTORS.titledFallback)
      .find((element) => element.getAttribute('title') === label);
    assert.ok(button !== undefined, `fixture has no titled control ${label}`);
    assert.equal(readPathTarget(button), null, `${label} must stay inert`);
  }
});

test('a non-file ref chip stays inert', () => {
  const skill = querySelectorAll(fixture, '[data-ref-chip]')
    .find((element) => element.getAttribute('data-ref-chip') === 'skill');
  assert.ok(skill !== undefined);
  assert.equal(readPathTarget(skill), null);
});

test('tooltip classification agrees with the fixture', () => {
  assert.equal(looksLikePath('C:\\work\\bili-下载\\README.md'), true);
  assert.equal(looksLikePath('docs/usage.md'), true);
  assert.equal(looksLikePath('B站下载器代码.txt'), true);
  assert.equal(looksLikePath('Copy'), false);
  assert.equal(looksLikePath('Open in sidebar'), false);
  assert.equal(looksLikePath('Retry'), false);
});
