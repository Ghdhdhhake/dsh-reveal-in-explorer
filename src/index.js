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
 * Bundle entry point. Intentionally empty: the Client half owns the UI.
 * @returns {void}
 */
export function apply() {}
