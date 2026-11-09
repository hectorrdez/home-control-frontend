// Feature 132: a stable id per panel (browser tab profile or Electron window) and a readable name.
// The id goes out as X-Client-Id on every call and as ?clientId= on the stream; the backend echoes it as `by`.

const STORAGE_KEY = "hc.client.v1";
const NAME_MAX = 40;

// Session cache: once an id exists it is reused even when storage later fails or is corrupt.
let sessionId: string | null = null;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Insecure contexts (plain http on a LAN) have no randomUUID; build a v4 UUID from getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readStoredId(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: unknown; id?: unknown } | null;
    return parsed && parsed.v === 1 && typeof parsed.id === "string" && parsed.id.length > 0 ? parsed.id : null;
  } catch {
    return null;
  }
}

export function getClientId(): string {
  if (sessionId) return sessionId;
  sessionId = readStoredId();
  if (sessionId) return sessionId;
  sessionId = newId();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, id: sessionId }));
  } catch {
    // Storage unavailable: the id stays in memory for this session.
  }
  return sessionId;
}

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, "Edge"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/Linux|X11/, "Linux"],
];

export function nameFromUserAgent(ua: string): string {
  // Electron's default UA carries "Electron/<version>"; the shell is detected by that token (feature 107 shell).
  if (/Electron\//.test(ua)) return "Electron";
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? "Browser";
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  return (system ? `${browser} ${system}` : browser).slice(0, NAME_MAX);
}

export function getClientName(): string {
  return nameFromUserAgent(typeof navigator === "undefined" ? "" : navigator.userAgent);
}

// Test seam: forget the session cache so the next call re-reads storage.
export function resetClientIdentityForTests(): void {
  sessionId = null;
}
