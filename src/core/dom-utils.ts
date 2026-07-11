export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function debounce<T extends (...args: never[]) => void>(fn: T, waitMs: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => fn(...args), waitMs);
  }) as T;
}

export function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(keyFn(item), item);
  }
  return Array.from(map.values());
}

export function textContent(element: Element | null | undefined): string | undefined {
  const value = element?.textContent?.replace(/\s+/g, " ").trim();
  return value || undefined;
}

export async function waitForSelector(
  root: ParentNode,
  selector: string,
  timeoutMs = 5000,
): Promise<Element | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const element = root.querySelector(selector);
    if (element) {
      return element;
    }
    await sleep(150);
  }
  return null;
}

export async function autoScrollElement(
  element: Element,
  options: { stepPx?: number; delayMs?: number; maxSteps?: number } = {},
): Promise<void> {
  const stepPx = options.stepPx ?? 400;
  const delayMs = options.delayMs ?? 250;
  const maxSteps = options.maxSteps ?? 40;
  let lastScrollTop = -1;

  for (let step = 0; step < maxSteps; step += 1) {
    const scrollable = findScrollable(element) ?? element;
    scrollable.scrollTop += stepPx;
    await sleep(delayMs);

    if (scrollable.scrollTop === lastScrollTop) {
      break;
    }
    lastScrollTop = scrollable.scrollTop;
  }
}

function findScrollable(element: Element): HTMLElement | null {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const style = getComputedStyle(element);
  const overflowY = style.overflowY;
  if ((overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight) {
    return element;
  }

  for (const child of Array.from(element.children)) {
    const nested = findScrollable(child);
    if (nested) {
      return nested;
    }
  }

  return null;
}

export async function observeDomUntilStable(
  root: Node,
  action: () => Promise<void> | void,
  idleMs = 350,
  timeoutMs = 10000,
): Promise<void> {
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveIdle: (() => void) | undefined;

  const idlePromise = new Promise<void>((resolve) => {
    resolveIdle = resolve;
  });

  const observer = new MutationObserver(() => {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(() => resolveIdle?.(), idleMs);
  });

  observer.observe(root, { childList: true, subtree: true });
  idleTimer = setTimeout(() => resolveIdle?.(), idleMs);

  const timeout = sleep(timeoutMs).then(() => undefined);
  await action();
  await Promise.race([idlePromise, timeout]);
  observer.disconnect();
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
}
