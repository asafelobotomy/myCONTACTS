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

## Quick start

### Install (development)

```bash
git clone https://github.com/asafelobotomy/myCONTACTS.git
cd myCONTACTS
npm install
npm run build
```

Load the unpacked extension from `dist/` in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` folder

Open the side panel from the extension icon, navigate to a supported site, and click **Scan active tab**.

### Production use

Build with `npm run build`, load `dist/` as above, and reload the extension after each update.

## Development

```bash
npm run dev          # Vite watch build
npm run build        # Typecheck + production build
npm test             # Vitest + script tests
npm run lint         # TypeScript check
```

### One-command update & install

Interactive helper: pull, build, detect browser, install/reload extension:

```bash
npm run dev:update
```

Non-interactive example:

```bash
npm run dev:update -- --yes --browser=google-chrome --profile=personal --launch
```

Other commands:

```bash
npm run dev:status    # saved browser/profile state
npm run dev:chrome    # launch browser with CDP
npm run dev:reload    # reload extension only
npm run dev:build     # install deps + build
```

Settings are saved locally in `.mycontacts-dev.json` (gitignored). See `scripts/mycontacts-dev.config.example.json`.

Browser notes:

- **Chromium-based**: automated install/reload via CDP
- **Firefox-based**: manual temporary add-on load (extension targets Chrome MV3)
- **Dev profile**: isolated under `~/.mycontacts-<browser>-dev`

## Project layout

```
src/
  background/     Service worker, content-script injection
  content/        On-demand page extraction script
  core/           Adapters, storage, crypto, export, validation
  sidepanel/      React UI
public/icons/     Extension icons (generated from branding/)
branding/         Source icon asset
scripts/          Dev install helper
```

## Privacy & terms

- Prefer **official platform exports** when available (especially LinkedIn)
- Use for **personal contact portability** only
- Scraping logged-in web apps may violate platform terms
- Regex fallback is **off by default** (scans full page text)
- See [SECURITY.md](./SECURITY.md) for storage, encryption, and data-deletion details

## License

MIT — see [LICENSE](./LICENSE).
