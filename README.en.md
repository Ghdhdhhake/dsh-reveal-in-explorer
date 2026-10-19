# dsh-reveal-in-explorer

> Hover a blue file reference in the DeepSeek Harness chat to reveal that file in your operating system's file manager.

English · [中文](README.md)

![Hover a file reference to get a “Reveal in File Explorer” action](docs/preview.svg)

Clicking a file reference keeps the native behaviour (open it in the right Sidebar). This plugin only adds a **hover** affordance: one click opens Explorer / Finder / the Linux file manager with the file selected.

## Features

- **Hover to reveal** — after a 160 ms dwell the overlay shows “📂 Reveal in File Explorer” to the **right** of the reference, falling back to below, then above, and always clamped inside the viewport.
- **Native click untouched** — the plugin never intercepts the existing preview action.
- **Platform-aware** — the Host's `open-in-app` / `native-command` decides the target: `explorer.exe /select,` on Windows, `open -R` on macOS, the parent directory on Linux.
- **Workspace-relative paths** — `docs/a.md` is resolved against the active Session's `cwd`.
- **Host-verified** — paths go through `remote.session.openWorkspacePath({ action: 'reveal' })`; the plugin spawns no process and reads no file content.
- **Bilingual UI**, theme-token styling, keyboard reachable (`focusin` also arms it, `Esc` closes).

## Covered reference types

| Surface | DOM shape |
| --- | --- |
| Inline-code file reference in an assistant reply (the blue filename) | `code > button[title]` |
| Markdown link that points at a path | `button.fileLink[title]` |
| Composer / user-message file chip | `[data-ref-chip="file"][title]` |
| Delivered-file card | `[data-presented-file] button[title]` |
| Fallback for other chat controls with a path tooltip | `[data-chat-flow] button[title]` / `a[title]` |

The fallback only accepts tooltips that look like paths (a separator, or a bare `name.ext`), so action labels such as `Copy` or `Open in sidebar` are ignored.

## Install

```sh
dsh plugin --profile <profile> add github:Ghdhdhhake/dsh-reveal-in-explorer
```

Or from a local directory:

```sh
dsh plugin --profile <profile> add /path/to/dsh-reveal-in-explorer
```

Refresh the page afterwards; Client changes hot-reload, no restart needed.

### Manual mount (offline)

If pnpm cannot reach the registry, install the directory as a `link:` dependency and let the profile's bundle stack mount it:

1. In the profile's `package.json`:

   ```json
   "dependencies": { "dsh-reveal-in-explorer": "link:/path/to/dsh-reveal-in-explorer" }
   ```

2. In `pnpm-lock.yaml` under `importers['.']`:

   ```yaml
   dsh-reveal-in-explorer:
     specifier: link:/path/to/dsh-reveal-in-explorer
     version: link:/path/to/dsh-reveal-in-explorer
   ```

3. Add `dsh-reveal-in-explorer` to `dsh.profile.bundles`, then:

   ```sh
   pnpm install --offline --ignore-scripts --config.trust-lockfile=true
   ```

## Uninstall

Disable and remove `dsh-reveal-in-explorer` under **Settings → Plugins**, or delete it from the profile's `dependencies` / `dsh.profile.bundles` and reinstall dependencies.

## Development

```sh
node scripts/build.mjs   # src/ → lib/index.js and lib/client.js
node scripts/check.mjs   # manifest, resources, and artifact consistency
node scripts/test.mjs    # behavioural tests for the client bundle in a vm sandbox
```

All three are dependency-free and offline. `lib/` is committed, so installing the bundle never runs a build script.

### Layout

```
src/index.js           Host entry (empty; gives the bundle a Host row)
src/client/index.js    Client implementation (CommonJS factory source)
lib/index.js           Built Host entry
lib/client.js          Built client bundle wrapped in the __ModuleLoader__ envelope
cordis.patch.yml       Bundle patch inserting the reveal-in-explorer row
dsh.plugin.json        Plugin manifest (name / entry / client.platform)
locale/{en,zh}.json    Marketplace title and description
icon.svg               Plugin icon
scripts/               Build, static checks, behavioural tests
```

## Compatibility

- Requires `dsh >= 0.2.0-rc.1 < 0.3.0` (`engines.dsh`); verified on `0.2.1-rc.2`.
- Needs the Host's `remote.session` (`@deepseek-ai/dsh-api-remotes`) and the `shell.overlay` slot. When either is missing the plugin degrades to a no-op instead of breaking the page.
- On a host without a desktop file manager (a plain server, for example) the button still appears, but clicking reports the failure reason rather than pretending success.

## Known limitations

- Reference detection follows the DOM the Host renders today; if that markup changes, `readPathTarget` needs the same change.
- The overlay is positioned from the reference's bounding box and closes when the reference scrolls out of view.

## License

MIT
