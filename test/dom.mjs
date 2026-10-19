/**
 * A tiny DOM for the selector tests.
 *
 * The bundle only ever needs `closest`, `querySelector`, `getAttribute` and
 * `getBoundingClientRect`, so the test suite ships a ~150-line HTML reader and
 * selector matcher instead of pulling a browser DOM into CI. It supports
 * exactly the grammar `SELECTORS` uses: comma lists, the descendant and child
 * combinators, tag names, and `[attr]`, `[attr="value"]` and `[attr*="value"]`.
 *
 * Anything outside that grammar throws, so a future selector cannot quietly
 * "pass" by being unsupported here.
 *
 * @module test/dom
 */

/** Void elements that never take a closing tag. */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * One parsed element.
 *
 * Text nodes are dropped: the plugin only reads attributes and structure, and
 * keeping text would add noise without covering a code path.
 */
export class FixtureElement {
  /**
   * @param {string} tagName - lowercased tag name.
   * @param {Record<string, string>} attributes - attribute map.
   * @param {FixtureElement | null} parent - parent element.
   */
  constructor(tagName, attributes, parent) {
    this.tagName = tagName;
    this.attributes = attributes;
    this.parentNode = parent;
    this.children = [];
    this.isConnected = true;
  }

  /** @returns {string | null} the attribute value, or null when absent. */
  getAttribute(name) {
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
  }

  /** @returns {{ left: number, top: number, right: number, bottom: number, width: number, height: number }} */
  getBoundingClientRect() {
    return { left: 100, top: 200, right: 300, bottom: 220, width: 200, height: 20 };
  }

  /**
   * Nearest inclusive ancestor-or-self matching any selector group.
   * @param {string} selector - selector list.
   * @returns {FixtureElement | null} the match.
   */
  closest(selector) {
    const groups = parseSelectorList(selector);
    for (let node = this; node !== null; node = node.parentNode) {
      for (const group of groups) {
        if (matchesGroup(node, group)) return node;
      }
    }
    return null;
  }

  /**
   * First matching descendant (never self, like `Element.querySelector`).
   * @param {string} selector - selector list.
   * @returns {FixtureElement | null} the match.
   */
  querySelector(selector) {
    const groups = parseSelectorList(selector);
    const stack = [...this.children].reverse();
    while (stack.length > 0) {
      const node = stack.pop();
      for (const group of groups) {
        if (matchesGroup(node, group)) return node;
      }
      stack.push(...[...node.children].reverse());
    }
    return null;
  }

  /** @returns {string} a short debug label. */
  toString() {
    const attrs = Object.entries(this.attributes).map(([k, v]) => ` ${k}="${v}"`).join('');
    return `<${this.tagName}${attrs}>`;
  }
}

/**
 * Parse an HTML string into a fixture tree.
 * @param {string} html - markup with no need for text fidelity.
 * @returns {FixtureElement} a synthetic document root.
 */
export function parseHtml(html) {
  const root = new FixtureElement('#document', {}, null);
  const stack = [root];
  const tagPattern = /<!--[\s\S]*?-->|<\/([A-Za-z][\w:-]*)\s*>|<([A-Za-z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
  let cursor = 0;
  let match;

  while ((match = tagPattern.exec(html)) !== null) {
    if (match[0].startsWith('<!--')) continue;
    if (match[1] !== undefined) {
      const name = match[1].toLowerCase();
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tagName === name) {
          stack.length = index;
          break;
        }
      }
      continue;
    }

    const name = match[2].toLowerCase();
    const parent = stack[stack.length - 1];
    const element = new FixtureElement(name, parseAttributes(match[3] ?? ''), parent);
    parent.children.push(element);
    if (!VOID.has(name) && match[4] !== '/') stack.push(element);
  }

  cursor = 0;
  return root;
}

/**
 * Parse an attribute string into a map.
 * @param {string} text - raw attribute source.
 * @returns {Record<string, string>} attribute values.
 */
function parseAttributes(text) {
  const attributes = {};
  const pattern = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attributes[match[1].toLowerCase()] = value;
  }
  return attributes;
}

/**
 * Parse a selector list into matchable groups.
 *
 * A group is an array of `{ combinator, compound }` pairs read left to right,
 * where `combinator` is `' '` (descendant) or `'>'` (child).
 * @param {string} selector - selector list.
 * @returns {Array<Array<{ combinator: string, compound: object }>>} groups.
 */
export function parseSelectorList(selector) {
  return selector.split(',').map((part) => parseGroup(part.trim()));
}

/**
 * Parse one complex selector.
 * @param {string} text - selector text without commas.
 * @returns {Array<{ combinator: string, compound: object }>} the steps.
 */
function parseGroup(text) {
  const tokens = text.replace(/\s*>\s*/g, ' > ').trim().split(/\s+/);
  const steps = [];
  let combinator = ' ';
  for (const token of tokens) {
    if (token === '>') {
      combinator = '>';
      continue;
    }
    steps.push({ combinator, compound: parseCompound(token) });
    combinator = ' ';
  }
  if (steps.length === 0) throw new Error(`empty selector: ${JSON.stringify(text)}`);
  steps[0].combinator = ' ';
  return steps;
}

/**
 * Parse one compound selector (`tag`, `[attr]`, `tag[attr="v"]`, …).
 * @param {string} token - compound source.
 * @returns {{ tag: string | null, attributes: Array<{ name: string, op: string, value: string }> }} compound.
 */
function parseCompound(token) {
  const attributePattern = /\[([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:(\*?=)(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\]/g;
  const tagMatch = /^([a-zA-Z][\w-]*)/.exec(token);
  const tag = tagMatch === null ? null : tagMatch[1].toLowerCase();
  const rest = token.slice(tagMatch === null ? 0 : tagMatch[1].length);
  const attributes = [];
  let consumed = 0;
  let match;
  while ((match = attributePattern.exec(rest)) !== null) {
    attributes.push({
      name: match[1].toLowerCase(),
      op: match[2] ?? '',
      value: match[3] ?? match[4] ?? match[5] ?? '',
    });
    consumed += match[0].length;
  }
  if (consumed !== rest.length) {
    throw new Error(`unsupported selector syntax: ${JSON.stringify(token)}`);
  }
  return { tag, attributes };
}

/**
 * Whether a node satisfies one compound selector.
 * @param {FixtureElement} node - candidate element.
 * @param {{ tag: string | null, attributes: Array<object> }} compound - parsed compound.
 * @returns {boolean} true when every part matches.
 */
function matchesCompound(node, compound) {
  if (compound.tag !== null && node.tagName !== compound.tag) return false;
  for (const attribute of compound.attributes) {
    const value = node.getAttribute(attribute.name);
    if (value === null) return false;
    if (attribute.op === '=' && value !== attribute.value) return false;
    if (attribute.op === '*=' && !value.includes(attribute.value)) return false;
  }
  return true;
}

/**
 * Whether a node satisfies one complex selector, matched right to left.
 * @param {FixtureElement} node - candidate element.
 * @param {Array<{ combinator: string, compound: object }>} group - parsed steps.
 * @returns {boolean} true when the whole chain matches.
 */
function matchesGroup(node, group) {
  const last = group[group.length - 1];
  if (!matchesCompound(node, last.compound)) return false;
  let current = node;
  for (let index = group.length - 2; index >= 0; index -= 1) {
    const step = group[index + 1];
    const target = group[index].compound;
    if (step.combinator === '>') {
      current = current.parentNode;
      if (current === null || !matchesCompound(current, target)) return false;
      continue;
    }
    let ancestor = current.parentNode;
    let found = null;
    while (ancestor !== null) {
      if (matchesCompound(ancestor, target)) {
        found = ancestor;
        break;
      }
      ancestor = ancestor.parentNode;
    }
    if (found === null) return false;
    current = found;
  }
  return true;
}

/**
 * Collect every element matching a selector, for snapshot-style assertions.
 * @param {FixtureElement} root - subtree root.
 * @param {string} selector - selector list.
 * @returns {FixtureElement[]} matches in document order.
 */
export function querySelectorAll(root, selector) {
  const groups = parseSelectorList(selector);
  const found = [];
  const stack = [...root.children].reverse();
  while (stack.length > 0) {
    const node = stack.pop();
    if (groups.some((group) => matchesGroup(node, group))) found.push(node);
    stack.push(...[...node.children].reverse());
  }
  return found;
}
