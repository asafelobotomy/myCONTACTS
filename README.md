# myCONTACTS

Local-first browser extension for extracting, storing, and exporting contact information from websites you open. No cloud, no telemetry — everything stays in your browser unless you export a file.

![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

## Features

- **Scan the active tab** on supported platforms or generic pages
- **Structured parsing**: JSON-LD, h-card, `mailto:` / `tel:` links, optional regex fallback
- **Platform adapters**: WhatsApp Web, Discord, Telegram Web, LinkedIn, generic websites
- **Region-aware phones**: libphonenumber validation with configurable default region
- **Named contacts by default**: phone-only entries optional via settings
- **Rich WhatsApp export**: saved names, push names, business fields, JID, status, photo URL when present in local cache
- **Local library**: dedupe/merge, paginated side panel, optional AES-GCM passphrase encryption
- **Export**: CSV, vCard (`.vcf`), or JSON with formula-injection hardening in CSV
- **Privacy controls**: per-platform toggles, regex fallback opt-in, first-scan disclaimer
- **Secure clear**: **Clear library** wipes IndexedDB, encrypted metadata, legacy keys, unlock keys, and in-panel scan data
- **On-demand injection**: content script loads only when you scan (stable loader for MV3)

## Supported platforms

| Platform | Method |
|----------|--------|
| WhatsApp Web | IndexedDB contact cache (`model-storage`, etc.) — individuals only, no groups/chats |
| Discord | Member list and profile DOM scraping |
| Telegram Web | Contact list and group member DOM scraping |
| LinkedIn | Connection list DOM scraping + official export guidance |
| Generic websites | JSON-LD, h-card, mailto/tel, optional regex |

## Quick start (recommended)

The install script is the best way to **clone, build, load, and keep the extension updated**. It detects your browser, walks you through setup once, then reuses saved settings on every later run.

```bash
git clone https://github.com/asafelobotomy/myCONTACTS.git
cd myCONTACTS
./scripts/mycontacts-dev update --launch
```

Equivalent npm shortcut:

```bash
npm run dev:update
```

**First run:** interactive browser + profile questionnaire (saved to `.mycontacts-dev.json`).

**Later runs:** pulls latest changes, installs deps, builds, and reloads the extension — no setup questionnaire.

If your browser is already open, the script asks **Restart [browser] now?**

- **Yes** — closes and relaunches the browser with remote debugging, then reloads the extension automatically
- **No** — prints manual reload steps (e.g. `brave://extensions` → Reload on myCONTACTS)

```bash
./scripts/mycontacts-dev update --launch   # pull + build + reload (or manual steps)
./scripts/mycontacts-dev reload --launch   # reload only
npm run dev:status                         # show saved browser, profile, extension id
```

Re-run setup if you change browsers or profiles:

```bash
./scripts/mycontacts-dev update --setup --launch
```

Non-interactive automation (auto-restart if the browser is open):

```bash
./scripts/mycontacts-dev update --yes --browser=google-chrome --profile=personal --launch --restart-browser
```

### Manual install (fallback)

If you prefer loading the extension yourself:

```bash
git clone https://github.com/asafelobotomy/myCONTACTS.git
cd myCONTACTS
npm install
npm run build
```

Then in your browser:

1. Open the extensions page (`chrome://extensions`, `brave://extensions`, etc.)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` folder

Open the side panel from the extension icon, navigate to a supported site, and click **Scan active tab**. After code changes, click **Reload** on the extension card or run `npm run dev:reload`.

## Development

```bash
npm run dev          # Vite watch build
npm run build        # Typecheck + production build
npm test             # Vitest + script tests
npm run lint         # TypeScript check
```

### Install script commands

| Command | Purpose |
|---------|---------|
| `./scripts/mycontacts-dev update --launch` | Pull, install deps, build, reload extension (recommended) |
| `./scripts/mycontacts-dev reload --launch` | Reload/load extension from existing `dist/` |
| `./scripts/mycontacts-dev build` | Install deps + build only |
| `./scripts/mycontacts-dev status` | Show saved browser, profile, extension state |
| `./scripts/mycontacts-dev launch` | Start browser with CDP enabled (Chromium) |
| `./scripts/mycontacts-dev update --setup` | Re-run browser/profile questionnaire |
| `./scripts/mycontacts-dev update --restart-browser` | Skip restart prompt; close and relaunch browser (use with `--yes`) |

Useful flags: `--no-pull`, `--no-install`, `--no-build`, `--no-reload`, `--dry-run`.

npm aliases: `dev:update`, `dev:reload`, `dev:build`, `dev:status`, `dev:chrome`.

Settings are saved locally in `.mycontacts-dev.json` (gitignored). See `scripts/mycontacts-dev.config.example.json`.

Browser notes:

- **Chromium-based** (Chrome, Brave, Edge, …): automated load/reload via CDP after optional browser restart
- **Browser already open?** The script asks **Restart [browser] now?** — Yes restarts with debugging enabled; No prints manual reload steps at `brave://extensions` / `chrome://extensions`
- **Non-interactive restart:** `./scripts/mycontacts-dev update --launch --yes --restart-browser`
- **Firefox-based**: manual temporary add-on steps (extension targets Chrome MV3)
- **Personal profile**: extension persists in your daily browser
- **Dev profile**: isolated under `~/.mycontacts-<browser>-dev`

Set `BROWSER_PATH` if auto-detection misses your browser:

```bash
BROWSER_PATH=/usr/bin/chromium ./scripts/mycontacts-dev update --launch
```

## Project layout

```
src/
  background/     Service worker, content-script injection
  content/        On-demand page extraction script
  core/           Adapters, storage, crypto, export, validation
  sidepanel/      React UI
public/icons/     Extension icons (generated from branding/)
branding/         Source icon asset
scripts/          Dev install helper (mycontacts-dev)
```

## Privacy & terms

- Prefer **official platform exports** when available (especially LinkedIn)
- Use for **personal contact portability** only
- Scraping logged-in web apps may violate platform terms
- Regex fallback is **off by default** (scans full page text)
- See [SECURITY.md](./SECURITY.md) for storage, encryption, and data-deletion details

## License

MIT — see [LICENSE](./LICENSE).
