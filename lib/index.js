/**
 * Host half of `dsh-reveal-in-explorer`.
 *
 * The whole feature is browser-side: it calls the Host Remote already provided
 * by DSH (`remote.session.openWorkspacePath({ action: 'reveal' })`), which
 * verifies the path against the Session workspace and then spawns the platform
 * file manager (Explorer `/select`, Finder `open -R`, `xdg-open` on the parent
 * directory). No Host service, route, tool, or config is needed, so this entry
 * exists only to give the bundle a Host row.
 *
 * @module dsh-reveal-in-explorer
 */

/**
 * Bundle entry point.
 *
 * The whole feature is browser-side, so there is nothing to mount here: the
 * Host row exists so the bundle has an entry the Loader can load, and the
 * Client half does the work through the Host Remote DSH already provides.
 *
 * @param {object} ctx - Cordis plugin context supplied by the Loader.
 * @returns {void}
 */
export function apply(ctx) {
  void ctx;
}
