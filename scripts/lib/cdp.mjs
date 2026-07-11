export async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

export async function isDebugPortOpen(port) {
  try {
    await fetchJson(`http://127.0.0.1:${port}/json/version`);
    return true;
  } catch {
    return false;
  }
}

export async function connectCdp(port) {
  const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    pending.get(message.id)(message);
    pending.delete(message.id);
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (message) => {
        if (message.error) {
          reject(new Error(message.error.message ?? `CDP error for ${method}`));
          return;
        }
        resolve(message.result ?? {});
      });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return {
    send,
    close() {
      ws.close();
    },
  };
}

export async function withCdp(port, fn) {
  const client = await connectCdp(port);
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}

export async function listTargets(port) {
  return fetchJson(`http://127.0.0.1:${port}/json/list`);
}

export async function getInstalledExtensions(port) {
  return withCdp(port, (client) => client.send("Extensions.getExtensions"));
}

export async function loadUnpackedExtension(port, absolutePath, enableInIncognito) {
  return withCdp(port, (client) =>
    client.send("Extensions.loadUnpacked", {
      path: absolutePath,
      enableInIncognito,
    }),
  );
}

export async function uninstallExtension(port, extensionId) {
  return withCdp(port, (client) => client.send("Extensions.uninstall", { id: extensionId }));
}

export async function reloadExtensionServiceWorker(port, extensionId) {
  const targets = await listTargets(port);
  const serviceWorker = targets.find(
    (target) =>
      target.type === "service_worker" &&
      typeof target.url === "string" &&
      target.url.startsWith(`chrome-extension://${extensionId}/`),
  );

  if (!serviceWorker?.webSocketDebuggerUrl) {
    throw new Error(`Service worker target not found for extension ${extensionId}.`);
  }

  const ws = new WebSocket(serviceWorker.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let messageId = 0;
  const result = await new Promise((resolve, reject) => {
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) {
        return;
      }
      if (message.error) {
        reject(new Error(message.error.message ?? "Failed to reload extension service worker."));
        return;
      }
      resolve(message.result);
    });

    ws.send(
      JSON.stringify({
        id: ++messageId,
        method: "Runtime.evaluate",
        params: {
          expression: "chrome.runtime.reload()",
          awaitPromise: true,
        },
      }),
    );
  });

  ws.close();
  return result;
}

export function findExtensionByPath(extensions, absolutePath) {
  const normalized = absolutePath.replace(/\\/g, "/").replace(/\/+$/, "");
  return (extensions ?? []).find((entry) => {
    const entryPath = String(entry.path ?? "")
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    return entryPath === normalized;
  });
}
