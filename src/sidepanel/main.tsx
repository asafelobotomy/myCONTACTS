import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { listPhoneRegions, phoneRegionLabel } from "../core/phone-region";
import { contactPersonName } from "../core/contact-utils";
import type {
  Contact,
  ExportFormat,
  ExtractionResult,
  ExtensionSettings,
  PlatformId,
} from "../core/types";
import { DEFAULT_PLATFORM_TOGGLES } from "../core/types";
import { downloadTextFile, sendRuntimeMessage } from "./messaging";
import "./styles.css";

const PAGE_SIZE = 50;
const PHONE_REGIONS = listPhoneRegions();

const PLATFORM_LABELS: Record<PlatformId, string> = {
  "whatsapp-web": "WhatsApp Web",
  "discord-web": "Discord",
  "telegram-web": "Telegram Web",
  linkedin: "LinkedIn",
  "generic-web": "Generic websites",
};

function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [libraryCount, setLibraryCount] = useState(0);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [meta, setMeta] = useState<ExtractionResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState("Scan the active tab to extract contacts.");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [libraryLocked, setLibraryLocked] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  useEffect(() => {
    void loadInitialState();
  }, []);

  const selectedContacts = useMemo(
    () => contacts.filter((contact) => selectedIds.has(contact.id)),
    [contacts, selectedIds],
  );

  const totalPages = Math.max(1, Math.ceil(contacts.length / PAGE_SIZE));
  const visibleContacts = useMemo(() => {
    const start = page * PAGE_SIZE;
    return contacts.slice(start, start + PAGE_SIZE);
  }, [contacts, page]);

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  async function loadInitialState(): Promise<void> {
    const settingsResponse = await sendRuntimeMessage({ type: "GET_SETTINGS" });
    if (settingsResponse.type === "SETTINGS_RESULT") {
      setSettings(settingsResponse.payload);
      setFormat(settingsResponse.payload.defaultExportFormat);
    }

    await refreshLibraryCount();
  }

  async function refreshLibraryCount(): Promise<void> {
    const response = await sendRuntimeMessage({ type: "GET_LIBRARY" });
    if (response.type === "LIBRARY_RESULT") {
      setLibraryCount(response.payload.contacts.length);
      setLibraryLocked(false);
    } else if (response.type === "LIBRARY_LOCKED") {
      setLibraryLocked(true);
    }
  }

  async function acceptDisclaimer(): Promise<void> {
    const response = await sendRuntimeMessage({
      type: "UPDATE_SETTINGS",
      payload: { acceptedDisclaimer: true },
    });
    if (response.type === "SETTINGS_RESULT") {
      setSettings(response.payload);
    }
    setShowDisclaimer(false);
    await scanActiveTab(true);
  }

  async function scanActiveTab(skipDisclaimer = false): Promise<void> {
    if (!skipDisclaimer && !settings?.acceptedDisclaimer) {
      setShowDisclaimer(true);
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Scanning active tab...");
    const response = await sendRuntimeMessage({ type: "EXTRACT_CONTACTS" });

    if (response.type === "ERROR") {
      setError(response.payload);
      setStatus("Scan failed.");
      setBusy(false);
      return;
    }

    if (response.type !== "EXTRACTION_RESULT") {
      setError("Unexpected response from background worker.");
      setBusy(false);
      return;
    }

    setMeta(response.payload);
    setContacts(response.payload.contacts);
    setSelectedIds(new Set(response.payload.contacts.map((contact) => contact.id)));
    setWarnings(response.payload.warnings ?? []);
    setPage(0);
    setStatus(`Found ${response.payload.contacts.length} contact(s) via ${response.payload.adapterId}.`);
    setBusy(false);
    await refreshLibraryCount();
  }

  async function saveSelection(): Promise<void> {
    if (!selectedContacts.length) {
      return;
    }
    setBusy(true);
    const response = await sendRuntimeMessage({
      type: "SAVE_TO_LIBRARY",
      payload: selectedContacts,
    });
    if (response.type === "LIBRARY_RESULT") {
      setLibraryCount(response.payload.contacts.length);
      setLibraryLocked(false);
      setStatus(`Saved ${selectedContacts.length} contact(s) to library (${response.payload.contacts.length} total).`);
    } else if (response.type === "LIBRARY_LOCKED") {
      setLibraryLocked(true);
      setError("Unlock the encrypted library before saving contacts.");
    } else if (response.type === "ERROR") {
      setError(response.payload);
    }
    setBusy(false);
  }

  async function loadLibrary(): Promise<void> {
    setBusy(true);
    const response = await sendRuntimeMessage({ type: "GET_LIBRARY" });
    if (response.type === "LIBRARY_RESULT") {
      setContacts(response.payload.contacts);
      setSelectedIds(new Set(response.payload.contacts.map((contact) => contact.id)));
      setMeta(null);
      setWarnings([]);
      setPage(0);
      setStatus(`Loaded ${response.payload.contacts.length} contact(s) from library.`);
      setLibraryCount(response.payload.contacts.length);
      setLibraryLocked(false);
    } else if (response.type === "LIBRARY_LOCKED") {
      setLibraryLocked(true);
      setStatus("Library is locked. Enter your passphrase to unlock.");
    }
    setBusy(false);
  }

  async function clearLibrary(): Promise<void> {
    const hasPersistedData = libraryCount > 0 || libraryLocked || settings?.libraryEncryptionEnabled;
    const hasSessionData = contacts.length > 0 || meta !== null || warnings.length > 0;

    if (!hasPersistedData && !hasSessionData) {
      return;
    }

    const confirmed = window.confirm(
      "Permanently delete all saved contacts, encrypted library data, unlock keys, and the current scan from this panel?",
    );
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
    const response = await sendRuntimeMessage({ type: "CLEAR_LIBRARY" });
    if (response.type === "LIBRARY_RESULT") {
      setContacts([]);
      setSelectedIds(new Set());
      setMeta(null);
      setWarnings([]);
      setLibraryCount(0);
      setLibraryLocked(false);
      setPassphrase("");
      setPage(0);
      setStatus("All contact data cleared from local storage and memory.");
    } else if (response.type === "ERROR") {
      setError(response.payload);
      setStatus("Failed to clear contact data.");
    }
    setBusy(false);
  }

  async function exportSelection(): Promise<void> {
    if (!selectedContacts.length) {
      return;
    }
    setBusy(true);
    const response = await sendRuntimeMessage({
      type: "EXPORT_CONTACTS",
      payload: { contacts: selectedContacts, format },
    });
    if (response.type === "EXPORT_RESULT") {
      downloadTextFile(response.payload.filename, response.payload.mimeType, response.payload.content);
      setStatus(`Exported ${selectedContacts.length} contact(s) as ${format.toUpperCase()}.`);
    } else if (response.type === "ERROR") {
      setError(response.payload);
    }
    setBusy(false);
  }

  async function updateDefaultFormat(nextFormat: ExportFormat): Promise<void> {
    setFormat(nextFormat);
    const response = await sendRuntimeMessage({
      type: "UPDATE_SETTINGS",
      payload: { defaultExportFormat: nextFormat },
    });
    if (response.type === "SETTINGS_RESULT") {
      setSettings(response.payload);
    }
  }

  async function updateSettings(partial: Partial<ExtensionSettings>): Promise<void> {
    const response = await sendRuntimeMessage({
      type: "UPDATE_SETTINGS",
      payload: partial,
    });
    if (response.type === "SETTINGS_RESULT") {
      setSettings(response.payload);
    }
  }

  async function togglePlatform(platformId: PlatformId, checked: boolean): Promise<void> {
    if (!settings) {
      return;
    }
    await updateSettings({
      enabledPlatforms: {
        ...settings.enabledPlatforms,
        [platformId]: checked,
      },
    });
  }

  async function unlockLibrary(): Promise<void> {
    if (!passphrase.trim()) {
      setError("Enter your library passphrase.");
      return;
    }
    setBusy(true);
    const response = await sendRuntimeMessage({
      type: "UNLOCK_LIBRARY",
      payload: { passphrase },
    });
    if (response.type === "LIBRARY_RESULT") {
      setLibraryLocked(false);
      setLibraryCount(response.payload.contacts.length);
      setStatus("Library unlocked.");
      setError(null);
    } else if (response.type === "ERROR") {
      setError(response.payload);
    }
    setBusy(false);
  }

  async function lockLibrary(): Promise<void> {
    setBusy(true);
    await sendRuntimeMessage({ type: "LOCK_LIBRARY" });
    setLibraryLocked(true);
    setPassphrase("");
    setStatus("Library locked.");
    setBusy(false);
  }

  async function toggleLibraryEncryption(enabled: boolean): Promise<void> {
    if (!passphrase.trim()) {
      setError("Enter a passphrase before changing library encryption.");
      return;
    }

    setBusy(true);
    const response = await sendRuntimeMessage({
      type: "SET_LIBRARY_ENCRYPTION",
      payload: { enabled, passphrase },
    });
    if (response.type === "LIBRARY_RESULT") {
      setLibraryLocked(false);
      setLibraryCount(response.payload.contacts.length);
      await updateSettings({ libraryEncryptionEnabled: enabled });
      setStatus(enabled ? "Library encryption enabled." : "Library encryption disabled.");
      setError(null);
    } else if (response.type === "ERROR") {
      setError(response.payload);
    }
    setBusy(false);
  }

  function toggleContact(id: string, checked: boolean): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function toggleAll(checked: boolean): void {
    setSelectedIds(checked ? new Set(contacts.map((contact) => contact.id)) : new Set());
  }

  const allVisibleSelected =
    visibleContacts.length > 0 && visibleContacts.every((contact) => selectedIds.has(contact.id));

  return (
    <div className="app">
      <header className="header">
        <img className="header-logo" src="/icons/icon32.png" alt="" width={32} height={32} />
        <div>
          <h1>myCONTACTS</h1>
          <p>Local-first contact extraction from the active tab.</p>
        </div>
      </header>

      <div className="toolbar">
        <button className="primary" onClick={() => void scanActiveTab()} disabled={busy}>
          Scan active tab
        </button>
        <button onClick={() => void loadLibrary()} disabled={busy}>
          Load library
        </button>
        <button onClick={() => void saveSelection()} disabled={busy || !selectedContacts.length}>
          Save selected
        </button>
        <button
          onClick={() => void clearLibrary()}
          disabled={
            busy ||
            (libraryCount === 0 &&
              contacts.length === 0 &&
              !libraryLocked &&
              !settings?.libraryEncryptionEnabled &&
              !meta &&
              warnings.length === 0)
          }
        >
          Clear library
        </button>
      </div>

      <div className="export-bar">
        <select
          value={format}
          onChange={(event) => void updateDefaultFormat(event.target.value as ExportFormat)}
        >
          <option value="csv">CSV</option>
          <option value="vcard">vCard</option>
          <option value="json">JSON</option>
        </select>
        <button onClick={() => void exportSelection()} disabled={busy || !selectedContacts.length}>
          Export selected
        </button>
        <span className="meta">Library: {libraryLocked ? "locked" : libraryCount}</span>
      </div>

      <section className="settings-panel">
        <h2>Privacy &amp; settings</h2>
        <div className="settings">
          <label>
            <input
              type="checkbox"
              checked={settings?.autoSaveToLibrary ?? true}
              onChange={(event) => void updateSettings({ autoSaveToLibrary: event.target.checked })}
            />
            Auto-save scans to library
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings?.enableRegexFallback ?? false}
              onChange={(event) => void updateSettings({ enableRegexFallback: event.target.checked })}
            />
            Allow regex fallback on generic pages
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings?.includeUnnamedContacts ?? false}
              onChange={(event) => void updateSettings({ includeUnnamedContacts: event.target.checked })}
            />
            Include unnamed entries (phone-only numbers)
          </label>
        </div>

        <div className="settings">
          <label className="phone-region-field">
            Default phone region
            <select
              value={settings?.defaultPhoneRegion ?? "US"}
              onChange={(event) =>
                void updateSettings({
                  defaultPhoneRegion: event.target.value as ExtensionSettings["defaultPhoneRegion"],
                })
              }
            >
              {PHONE_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {phoneRegionLabel(region)}
                </option>
              ))}
            </select>
          </label>
          <p className="settings-note">
            Used for local numbers without a country code. International numbers (+…) are validated
            against their own region automatically.
          </p>
        </div>

        <div className="platform-toggles">
          <p className="settings-note">Enable extractors by platform:</p>
          {(Object.keys(DEFAULT_PLATFORM_TOGGLES) as PlatformId[]).map((platformId) => (
            <label key={platformId}>
              <input
                type="checkbox"
                checked={settings?.enabledPlatforms[platformId] ?? true}
                onChange={(event) => void togglePlatform(platformId, event.target.checked)}
              />
              {PLATFORM_LABELS[platformId]}
            </label>
          ))}
        </div>

        <div className="encryption-panel">
          <p className="settings-note">Optional AES-GCM encryption for the local library.</p>
          <label className="passphrase-field">
            Library passphrase
            <input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Used to unlock or change encryption"
              autoComplete="off"
            />
          </label>
          <div className="encryption-actions">
            <button onClick={() => void unlockLibrary()} disabled={busy || !libraryLocked}>
              Unlock library
            </button>
            <button onClick={() => void lockLibrary()} disabled={busy || libraryLocked}>
              Lock library
            </button>
            <button
              onClick={() => void toggleLibraryEncryption(true)}
              disabled={busy || settings?.libraryEncryptionEnabled === true}
            >
              Enable encryption
            </button>
            <button
              onClick={() => void toggleLibraryEncryption(false)}
              disabled={busy || settings?.libraryEncryptionEnabled !== true}
            >
              Disable encryption
            </button>
          </div>
        </div>
      </section>

      <div className="status">{status}</div>
      {meta ? (
        <div className="meta">
          Adapter: {meta.adapterId} v{meta.adapterVersion}
        </div>
      ) : null}
      {warnings.map((warning) => (
        <div className="warning" key={warning}>
          {warning}
        </div>
      ))}
      {error ? <div className="error">{error}</div> : null}

      <div className="table-wrap">
        {contacts.length ? (
          <>
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          for (const contact of visibleContacts) {
                            if (checked) {
                              next.add(contact.id);
                            } else {
                              next.delete(contact.id);
                            }
                          }
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Region</th>
                  <th>Email</th>
                  <th>Org</th>
                  <th>Notes</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {visibleContacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(contact.id)}
                        onChange={(event) => toggleContact(contact.id, event.target.checked)}
                      />
                    </td>
                    <td>{contactPersonName(contact) ?? "—"}</td>
                    <td>{contact.phones?.map((phone) => phone.e164 ?? phone.value).join(", ") ?? ""}</td>
                    <td>{contact.phones?.map((phone) => phone.region ?? "").filter(Boolean).join(", ") ?? "—"}</td>
                    <td>{contact.emails?.map((email) => email.value).join(", ") ?? "—"}</td>
                    <td>{contact.org ?? "—"}</td>
                    <td>{contact.notes ?? "—"}</td>
                    <td>{contact.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination">
              <button onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>
                Previous
              </button>
              <span>
                Page {page + 1} of {totalPages} ({contacts.length} contacts)
              </span>
              <button
                onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
              </button>
              <label className="select-all-label">
                <input
                  type="checkbox"
                  checked={selectedContacts.length === contacts.length && contacts.length > 0}
                  onChange={(event) => toggleAll(event.target.checked)}
                />
                Select all
              </label>
            </div>
          </>
        ) : (
          <div className="empty">No contacts yet. Open a supported site and scan the active tab.</div>
        )}
      </div>

      {showDisclaimer ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
          <div className="modal">
            <h2 id="disclaimer-title">Before you scan</h2>
            <p>
              myCONTACTS reads contact information from the active tab and stores it locally in your browser.
              Scraping logged-in websites may violate platform terms. Prefer official exports when available.
            </p>
            <p>Use this tool for personal contact portability only.</p>
            <div className="modal-actions">
              <button onClick={() => setShowDisclaimer(false)}>Cancel</button>
              <button className="primary" onClick={() => void acceptDisclaimer()}>
                I understand, scan
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Side panel root element not found");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
