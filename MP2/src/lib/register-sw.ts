// Guarded service worker registration.
// Skips Lovable preview/dev environments to avoid stale-cache white-screens.
// Visit any page with ?sw=off to unregister an installed worker.

const PREVIEW_HOSTS = [
  "lovableproject.com",
  "lovableproject-dev.com",
  "beta.lovable.dev",
];

const PREVIEW_PREFIXES = ["id-preview--", "preview--"];

function isPreviewHost(hostname: string): boolean {
  if (PREVIEW_PREFIXES.some((p) => hostname.startsWith(p))) return true;
  return PREVIEW_HOSTS.some(
    (h) => hostname === h || hostname.endsWith(`.${h}`),
  );
}

async function unregisterExisting() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => r.active?.scriptURL.endsWith("/sw.js"))
      .map((r) => r.unregister()),
  );
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const url = new URL(window.location.href);
  const killSwitch = url.searchParams.get("sw") === "off";
  const inIframe = window.self !== window.top;
  const isDev = !import.meta.env.PROD;
  const isPreview = isPreviewHost(window.location.hostname);

  if (killSwitch || inIframe || isDev || isPreview) {
    void unregisterExisting();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[sw] registration failed", err);
    });
  });
}
