/**
 * Client half of `dsh-reveal-in-explorer`.
 *
 * Hovering a file reference in the chat transcript pops up a small action that
 * reveals the file in the operating system's file manager. The default click
 * behaviour (open the file in the right Sidebar) is left untouched.
 *
 * Written as a CommonJS factory body: `scripts/build.mjs` wraps it in the
 * `window.__ModuleLoader__` envelope the Web client expects, so the shipped
 * `lib/client.js` is a faithful, reproducible build of this file.
 *
 * @module dsh-reveal-in-explorer/client
 */
'use strict';

const React = require('react');

/** Locale namespace shared by the dictionaries and the slot entry. */
const NS = 'reveal-in-explorer';
/** Hover dwell before the popup appears, so pointer pass-through never flashes it. */
const HOVER_DELAY_MS = 160;
/** Grace period for moving the pointer from the reference onto the popup. */
const HIDE_DELAY_MS = 260;
/** How long the success state stays visible before the popup closes itself. */
const DONE_HOLD_MS = 1400;
/** Maximum popup width; narrower viewports clamp further. */
const POPUP_WIDTH = 300;
/** Attribute marking our own floating surface, so hovering it never re-arms a hover. */
const SURFACE_ATTR = 'data-reveal-in-explorer';

/** Runtime dictionaries (the `locale/*.json` files only carry plugin metadata). */
const zh = {
  'reveal.action': '在资源管理器中显示',
  'reveal.busy': '正在打开…',
  'reveal.done': '已在资源管理器中定位',
  'reveal.error': '无法打开文件资源管理器',
};
const en = {
  'reveal.action': 'Reveal in File Explorer',
  'reveal.busy': 'Opening…',
  'reveal.done': 'Revealed in File Explorer',
  'reveal.error': 'Could not open the file manager',
};

/**
 * Whether a path is already absolute in either spelling the Host accepts.
 * @param {string} path - candidate path.
 * @returns {boolean} true for POSIX, Windows drive, and UNC paths.
 */
function isAbsolutePath(path) {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
}

/**
 * Join a workspace-relative reference onto the Session's workspace root.
 * @param {string | undefined} cwd - absolute workspace root, when known.
 * @param {string} path - absolute or workspace-relative path.
 * @returns {string} an absolute path when a root is available.
 */
function resolveWorkspacePath(cwd, path) {
  if (isAbsolutePath(path)) return path;
  if (typeof cwd !== 'string' || cwd === '') return path;
  const separator = cwd.includes('\\') ? '\\' : '/';
  return `${cwd.replace(/[/\\]+$/, '')}${separator}${path.replace(/^[/\\]+/, '')}`;
}

/**
 * Whether a tooltip value names a file rather than an action.
 *
 * Action tooltips are short prose ("Copy", "Retry"), while file tooltips carry
 * a separator or end in a bare `name.ext`.
 * @param {string} value - the candidate tooltip text.
 * @returns {boolean} true when the value looks like a filesystem path.
 */
function looksLikePath(value) {
  const text = value.trim();
  if (text === '' || text.length > 1024) return false;
  if (/^(?:https?|mailto|data|dsh-resource):/i.test(text)) return false;
  if (/[\\/]/.test(text)) return true;
  if (/\s/.test(text)) return false;
  return /^[^<>:"|?*]{1,240}\.[A-Za-z0-9]{1,10}$/.test(text);
}

/**
 * Find the file reference under a pointer target.
 *
 * The chat renders a resolved inline-code mention as `code > button[title]`, a
 * path-shaped Markdown link as a `fileLink` button, composer and user-message
 * chips as `[data-ref-chip]`, and delivered files as a `[data-presented-file]`
 * card whose action carries the resolved path. Anything else falls back to a
 * titled control inside the chat flow whose tooltip is a path.
 * @param {Element} start - the pointer target.
 * @returns {{ element: Element, path: string } | null} the reference, if any.
 */
function readPathTarget(start) {
  if (!(start instanceof Element)) return null;

  const mention = start.closest('code > button[title]');
  if (mention !== null) {
    const path = mention.getAttribute('title');
    return path === null || path === '' ? null : { element: mention, path };
  }

  const chip = start.closest('[data-ref-chip="file"][title], [data-ref-chip="folder"][title]');
  if (chip !== null) {
    const path = chip.getAttribute('title');
    return path === null || path === '' ? null : { element: chip, path };
  }

  const link = start.closest('button[title][class*="fileLink"]');
  if (link !== null) {
    const path = link.getAttribute('title');
    return path === null || path === '' ? null : { element: link, path };
  }

  const card = start.closest('[data-presented-file]');
  if (card !== null) {
    const button = card.querySelector('button[title]');
    if (button !== null) {
      const path = button.getAttribute('title');
      if (path !== null && path !== '') return { element: card, path };
    }
  }

  const titled = start.closest('[data-chat-flow] button[title], [data-chat-flow] a[title]');
  if (titled !== null) {
    const path = titled.getAttribute('title');
    if (path !== null && looksLikePath(path)) return { element: titled, path };
  }

  return null;
}

/** Folder glyph for the popup action. */
function FolderIcon() {
  return React.createElement('svg', {
    viewBox: '0 0 16 16',
    width: 14,
    height: 14,
    'aria-hidden': true,
    style: { flex: 'none', display: 'block' },
  }, React.createElement('path', {
    d: 'M1.6 4.1c0-.7.6-1.3 1.3-1.3h3.2l1.3 1.5h5.7c.7 0 1.3.6 1.3 1.3v5.6c0 .7-.6 1.3-1.3 1.3H2.9c-.7 0-1.3-.6-1.3-1.3Z',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.3,
    strokeLinejoin: 'round',
  }));
}

/**
 * Place the chip next to a reference without covering it.
 *
 * Preference order: right of the reference (side by side, overlapping the
 * least transcript text), then below it, then above it. The result is clamped
 * inside the viewport so the chip is always reachable.
 * @param {{ left: number, top: number, right: number, bottom: number, height: number }} rect - reference bounds.
 * @param {{ width: number, height: number }} size - chip size.
 * @param {{ width: number, height: number }} viewport - window inner size.
 * @returns {{ left: number, top: number }} viewport coordinates.
 */
function placeChip(rect, size, viewport) {
  const gap = 8;
  const margin = 8;
  const roomRight = viewport.width - rect.right;
  const roomBelow = viewport.height - rect.bottom;
  const roomAbove = rect.top;

  let left;
  let top;
  if (roomRight >= size.width + gap) {
    left = rect.right + gap;
    top = rect.top + rect.height / 2 - size.height / 2;
  } else if (roomBelow >= size.height + gap) {
    left = rect.left;
    top = rect.bottom + gap;
  } else if (roomAbove >= size.height + gap) {
    left = rect.left;
    top = rect.top - size.height - gap;
  } else {
    left = rect.left;
    top = rect.bottom + gap;
  }

  return {
    left: Math.max(margin, Math.min(left, viewport.width - size.width - margin)),
    top: Math.max(margin, Math.min(top, viewport.height - size.height - margin)),
  };
}

/**
 * Frame-wide hover popup.
 *
 * Mounted into `shell.overlay`, which is click-through by default; only the
 * action button opts back into pointer events.
 * @param {object} props - slot kit props plus this entry's injected operations.
 * @returns {object | null} the popup, or null while nothing is hovered.
 */
function RevealOverlay(props) {
  const translate = props.t;
  const t = typeof translate === 'function' ? translate : (key) => key;
  const cwdProvider = React.useRef(props.currentCwd);
  cwdProvider.current = props.currentCwd;
  const reveal = props.reveal;
  const [entry, setEntry] = React.useState(null);
  const doneTimer = React.useRef(0);
  const closeRef = React.useRef(null);

  React.useEffect(() => {
    let showTimer = 0;
    let hideTimer = 0;
    /** Element the pending/visible popup is anchored to. */
    let anchor = null;
    let disposed = false;

    const clearTimers = () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      showTimer = 0;
      hideTimer = 0;
    };

    const close = () => {
      clearTimers();
      anchor = null;
      if (!disposed) setEntry(null);
    };
    closeRef.current = close;

    const scheduleClose = () => {
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(close, HIDE_DELAY_MS);
    };

    const open = (found) => {
      const raw = found.path.trim();
      if (raw === '') return;
      if (!found.element.isConnected) return;
      const cwd = typeof cwdProvider.current === 'function' ? cwdProvider.current() : undefined;
      const path = resolveWorkspacePath(cwd, raw);
      const rect = found.element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      if (disposed || anchor !== found.element) return;
      setEntry({
        path,
        phase: 'idle',
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      });
    };

    const arm = (found) => {
      if (anchor === found.element) {
        window.clearTimeout(hideTimer);
        hideTimer = 0;
        return;
      }
      clearTimers();
      anchor = found.element;
      showTimer = window.setTimeout(() => {
        showTimer = 0;
        if (disposed || anchor !== found.element) return;
        open(found);
      }, HOVER_DELAY_MS);
    };

    const onPointerOver = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(`[${SURFACE_ATTR}]`) !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = 0;
        return;
      }
      if (target.closest('[data-chat-flow], [data-ref-chip], [data-presented-file]') === null) {
        if (anchor !== null) scheduleClose();
        return;
      }
      const found = readPathTarget(target);
      if (found === null) {
        if (anchor !== null) scheduleClose();
        return;
      }
      arm(found);
    };

    const onFocusIn = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-chat-flow]') === null) return;
      const found = readPathTarget(target);
      if (found !== null) arm(found);
    };

    const onScroll = () => {
      if (anchor !== null) close();
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && anchor !== null) close();
    };

    const onPointerOut = (event) => {
      if (event.relatedTarget === null) close();
    };

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      disposed = true;
      clearTimers();
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  React.useEffect(() => () => window.clearTimeout(doneTimer.current), []);

  if (entry === null) return null;

  const run = async () => {
    if (entry.phase === 'busy' || entry.phase === 'done') return;
    setEntry((current) => (current === null ? current : { ...current, phase: 'busy' }));
    let outcome;
    try {
      outcome = await reveal(entry.path);
    } catch (error) {
      outcome = { ok: false, error: String(error) };
    }
    if (outcome !== undefined && outcome.ok === true) {
      setEntry((current) => (current === null ? current : { ...current, phase: 'done' }));
      window.clearTimeout(doneTimer.current);
      doneTimer.current = window.setTimeout(() => {
        if (typeof closeRef.current === 'function') closeRef.current();
        else setEntry(null);
      }, DONE_HOLD_MS);
      return;
    }
    setEntry((current) => (current === null ? current : { ...current, phase: 'error' }));
  };

  const label = entry.phase === 'busy'
    ? t('reveal.busy')
    : entry.phase === 'done'
      ? t('reveal.done')
      : entry.phase === 'error'
        ? t('reveal.error')
        : t('reveal.action');

  const accent = entry.phase === 'error'
    ? 'var(--dsw-alias-state-error-primary)'
    : entry.phase === 'done'
      ? 'var(--dsw-alias-state-success-primary)'
      : 'var(--dsw-alias-label-primary)';

  // The chip sizes to its label; the estimated width only decides placement.
  const maxWidth = Math.min(POPUP_WIDTH, Math.max(180, window.innerWidth - 16));
  const chipWidth = Math.min(maxWidth, 96 + label.length * 14);
  const placed = placeChip(entry.rect, { width: chipWidth, height: 34 }, {
    width: window.innerWidth,
    height: window.innerHeight,
  });

  return React.createElement('div', {
    [SURFACE_ATTR]: '',
    style: {
      position: 'fixed',
      left: placed.left,
      top: placed.top,
      maxWidth,
      zIndex: 2147483000,
      display: 'flex',
      justifyContent: 'flex-start',
      pointerEvents: 'none',
    },
  }, React.createElement('button', {
    type: 'button',
    title: entry.path,
    'aria-label': `${label}: ${entry.path}`,
    disabled: entry.phase === 'busy',
    onClick: run,
    style: {
      pointerEvents: 'auto',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      maxWidth: '100%',
      minHeight: 34,
      padding: '6px 12px',
      border: '0.5px solid var(--dsw-alias-border-l2)',
      borderRadius: 'var(--dsw-radius-lg, 10px)',
      background: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1))',
      boxShadow: 'var(--dsw-elevation-panel, 0 6px 20px rgba(0, 0, 0, 0.18))',
      color: accent,
      cursor: entry.phase === 'busy' ? 'progress' : 'pointer',
      font: 'var(--dsw-font-xs-strong-13, 500 13px/18px system-ui)',
      textAlign: 'left',
    },
  }, React.createElement(FolderIcon), React.createElement('span', {
    style: {
      flex: '1 1 auto',
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
  }, label)));
}

/**
 * The Host Remote namespace that owns native path opening, or undefined when
 * the composition does not provide it.
 * @param {object} ctx - client plugin context.
 * @returns {object | undefined} the `remote.session` face.
 */
function remoteSessionOf(ctx) {
  try {
    const remote = ctx.get('remote');
    const session = remote === undefined ? undefined : remote.session;
    return session !== undefined && typeof session.openWorkspacePath === 'function' ? session : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read the active Session's workspace root without subscribing: the popup only
 * needs it at the moment it resolves a relative reference.
 * @param {object} ctx - client plugin context.
 * @returns {string | undefined} the absolute workspace directory.
 */
function currentWorkspaceOf(ctx) {
  try {
    const sessions = ctx.get('sessions');
    const snapshot = sessions === undefined ? undefined : sessions.list.getSnapshot();
    if (snapshot === undefined) return undefined;
    const id = snapshot.current;
    const row = id === undefined || id === null ? undefined : snapshot.byId[id];
    return row === undefined ? undefined : row.cwd;
  } catch {
    return undefined;
  }
}

/**
 * Register the dictionaries and the frame-overlay popup.
 * @param {object} ctx - client plugin context.
 * @returns {void}
 */
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'reveal-in-explorer: dictionaries');

  const reveal = async (path) => {
    const session = remoteSessionOf(ctx);
    if (session === undefined) return { ok: false, error: 'remote.session unavailable' };
    try {
      const result = await session.openWorkspacePath({ path, action: 'reveal' });
      if (result !== undefined && result.ok === true) return { ok: true };
      const error = result === undefined ? undefined : result.error;
      const message = error === undefined
        ? 'open failed'
        : String(error.message ?? error.code ?? error);
      return { ok: false, error: message };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  };

  const currentCwd = () => currentWorkspaceOf(ctx);

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'reveal-in-explorer',
    locale: NS,
    inject: () => ({ reveal, currentCwd }),
  }, RevealOverlay));
}

module.exports = {
  inject: ['slots', 'locale', 'remote', 'remote.session'],
  apply,
  // Exported for the test script; the loader only consumes `inject` and `apply`.
  __internals: {
    isAbsolutePath,
    resolveWorkspacePath,
    looksLikePath,
    readPathTarget,
    placeChip,
    NS,
  },
};
