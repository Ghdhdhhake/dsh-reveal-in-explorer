/**
 * Path-resolution tests: the cross-platform correctness core of this plugin.
 *
 * The Host decides where a reference lands, and the only thing this plugin
 * contributes is the absolute path it hands over. A wrong separator or a
 * dropped drive letter silently reveals the wrong folder, so every branch of
 * `isAbsolutePath` / `resolveWorkspacePath` is pinned here, per platform.
 *
 * Run with `node --test test/paths.test.mjs`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadBundle } from './harness.mjs';

const { isAbsolutePath, resolveWorkspacePath } = loadBundle().__internals;

test('Windows drive paths are absolute', () => {
  assert.equal(isAbsolutePath('C:\\work\\a.txt'), true);
  assert.equal(isAbsolutePath('c:/work/a.txt'), true);
  assert.equal(isAbsolutePath('Z:\\'), true);
});

test('Windows UNC paths are absolute', () => {
  assert.equal(isAbsolutePath('\\\\server\\share\\a.txt'), true);
  assert.equal(isAbsolutePath('//server/share/a.txt'), true);
});

test('POSIX paths are absolute', () => {
  assert.equal(isAbsolutePath('/home/me/a.txt'), true);
  assert.equal(isAbsolutePath('/'), true);
});

test('bare and relative names are not absolute', () => {
  for (const value of ['a.txt', 'docs/a.txt', './a.txt', '../a.txt', 'C:a.txt', '']) {
    assert.equal(isAbsolutePath(value), false, `${value} must not be absolute`);
  }
});

test('Windows workspace joins with a backslash', () => {
  assert.equal(
    resolveWorkspacePath('C:\\work', 'docs/a.txt'),
    'C:\\work\\docs/a.txt',
  );
  assert.equal(
    resolveWorkspacePath('C:\\work\\', 'docs/a.txt'),
    'C:\\work\\docs/a.txt',
    'a trailing separator must not double up',
  );
  assert.equal(
    resolveWorkspacePath('C:\\work', '\\docs\\a.txt'),
    'C:\\work\\docs\\a.txt',
    'a leading separator must not escape the workspace',
  );
});

test('macOS workspace joins with a slash', () => {
  assert.equal(
    resolveWorkspacePath('/Users/me/project', 'src/index.ts'),
    '/Users/me/project/src/index.ts',
  );
  assert.equal(
    resolveWorkspacePath('/Users/me/project/', 'src/index.ts'),
    '/Users/me/project/src/index.ts',
    'a trailing separator must not double up',
  );
  assert.equal(
    resolveWorkspacePath('/Users/me/project/', './src/index.ts'),
    '/Users/me/project/./src/index.ts',
    'the join is textual; the Host normalizes the result',
  );
});

test('a POSIX absolute reference wins over the workspace root', () => {
  assert.equal(
    resolveWorkspacePath('/Users/me/project/', '/src/index.ts'),
    '/src/index.ts',
    'a leading slash is absolute, never a workspace-relative hint',
  );
});

test('Linux workspace joins with a slash', () => {
  assert.equal(
    resolveWorkspacePath('/home/me/project', 'docs/spec.pdf'),
    '/home/me/project/docs/spec.pdf',
  );
});

test('an absolute reference wins over the workspace root', () => {
  assert.equal(
    resolveWorkspacePath('C:\\work', 'D:\\elsewhere\\a.txt'),
    'D:\\elsewhere\\a.txt',
  );
  assert.equal(
    resolveWorkspacePath('/home/me/project', '/etc/hosts'),
    '/etc/hosts',
  );
});

test('a missing or empty workspace leaves the reference untouched', () => {
  assert.equal(resolveWorkspacePath(undefined, 'docs/a.txt'), 'docs/a.txt');
  assert.equal(resolveWorkspacePath('', 'docs/a.txt'), 'docs/a.txt');
  assert.equal(resolveWorkspacePath(null, 'docs/a.txt'), 'docs/a.txt');
});

test('CJK and space-bearing names survive the join unchanged', () => {
  assert.equal(
    resolveWorkspacePath('C:\\工作 目录', 'B站下载器代码.txt'),
    'C:\\工作 目录\\B站下载器代码.txt',
  );
  assert.equal(
    resolveWorkspacePath('/home/me/my project', '文档/说明 文档.md'),
    '/home/me/my project/文档/说明 文档.md',
  );
});
