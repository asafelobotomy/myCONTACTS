# Security & privacy

myCONTACTS is designed to stay **local-first**: contact data is read from the active browser tab, processed in the extension, and stored only in your browser unless you export a file yourself.

## Data handling

| Data | Where it lives | Sent over the network? |
|------|----------------|------------------------|
| Extracted contacts | Extension IndexedDB / optional encrypted blob | No |
| Settings | `chrome.storage.local` | No |
| Library unlock passphrase | Service worker memory only (not persisted) | No |
| Exported CSV / vCard / JSON | File you download locally | Only if you choose to upload/share it |

There is no analytics, telemetry, crash reporting, or remote API in this extension.

## Storage

- **Library**: IndexedDB database `mycontacts-library` (contacts + metadata).
- **Encryption (optional)**: AES-GCM with PBKDF2 (310k iterations, SHA-256). Ciphertext and salt are stored locally; the passphrase is kept in memory while unlocked.
- **Legacy migration**: Older builds may have stored the library in `chrome.storage.local` under `contactLibrary`; migration moves data into IndexedDB and removes the legacy key.

## Clearing data

Use **Clear library** in the side panel to permanently remove:

- All saved contacts (plain and encrypted)
- Encrypted library metadata (salt, ciphertext)
- Legacy storage keys
- In-memory unlock keys
- The current scan shown in the panel

You will be asked to confirm before deletion.

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Local settings and library metadata |
| `sidePanel` | Contact review UI |
| `tabs` / `activeTab` / `scripting` | Scan only the tab you choose; content script injected on demand |
| `<all_urls>` host access | Read page/IndexedDB context on sites you scan (no background crawling) |

## Reporting issues

If you find a security issue, please open a [GitHub issue](https://github.com/asafelobotomy/myCONTACTS/issues) with reproduction steps. Do not include real contact exports or passphrases in reports.
