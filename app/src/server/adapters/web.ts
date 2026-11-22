import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import type { UntrustedText } from "../../shared/contracts";
import { createHttpClient, type AdapterMode, type HttpClient } from "./http";

// web.read (docs/IMPLEMENTATION_PLAN.md WP2 step 4). Server-side page fetch that:
//   - only allows http(s) on ports 80/443, without URL credentials;
//   - resolves the host and refuses private, loopback, link-local and other non-public addresses,
//     re-checking on every redirect hop;
//   - caps time, redirects and bytes read;
//   - returns text as UntrustedText and flags instruction-like content.
//
// Known gap: the address check and the connection resolve DNS separately, so a DNS-rebinding host
// could answer differently the second time. Pinning the resolved address needs a custom undici
// dispatcher; not done within the hackathon timebox.

const PROVIDER = "web";

export const WEB_LIMITS = {
  timeoutMs: 10_000,
  maxBytes: 1_000_000,
  maxRedirects: 3,
  maxTextChars: 20_000,
};

/** ActionLog reason for a page that tried to instruct the agent (WP2 acceptance). */
export const UNTRUSTED_INSTRUCTION_REASON = "untrusted_instruction_detected";

export class WebReadError extends Error {
  constructor(
    readonly code: "invalid_url" | "blocked_address" | "too_many_redirects" | "unsupported_content" | "http_error" | "dns_failed",
    message: string,
  ) {
    super(message);
    this.name = "WebReadError";
  }
}

export interface WebPage {
  content: UntrustedText;
  title?: string;
  /** Names of the instruction patterns that matched; empty when not flagged. */
  flagReasons: string[];
}

export interface WebAdapter {
  read(url: string): Promise<WebPage>;
}

export type HostLookup = (hostname: string) => Promise<string[]>;

export interface WebAdapterOptions {
  /** Defaults to an http.ts client whose fetch is the guarded fetch below. */
  http?: HttpClient;
  mode?: AdapterMode;
  lookup?: HostLookup;
  now?: () => Date;
}

export function createWebAdapter(options: WebAdapterOptions = {}): WebAdapter {
  const lookup = options.lookup ?? defaultLookup;
  const http = options.http ?? createHttpClient({ mode: options.mode, fetch: createGuardedFetch({ lookup }) });
  const now = options.now ?? (() => new Date());

  return {
    async read(rawUrl) {
      const url = parsePublicUrl(rawUrl);
      const res = await http.request<string>({ provider: PROVIDER, method: "GET", url: url.toString() });
      if (!res.ok) throw new WebReadError("http_error", `GET ${url.host} returned HTTP ${res.status}`);
      const raw = typeof res.body === "string" ? res.body : JSON.stringify(res.body);

      const title = extractTitle(raw);
      const text = truncate(htmlToText(raw), WEB_LIMITS.maxTextChars);
      const flagReasons = detectInstructions(raw, text);

      return {
        content: {
          kind: "untrusted",
          text,
          flagged: flagReasons.length > 0,
          source: {
            provider: PROVIDER,
            url: url.toString(),
            fetchedAt: now().toISOString(),
            claim: title ? `Page text from ${url.host}: "${truncate(title, 120)}"` : `Page text from ${url.host}`,
          },
        },
        ...(title ? { title } : {}),
        flagReasons,
      };
    },
  };
}

// ---------- URL and address checks ----------

export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WebReadError("invalid_url", `Not a valid URL: ${truncate(raw, 100)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebReadError("invalid_url", `Only http and https are allowed (got ${url.protocol})`);
  }
  if (url.username || url.password) throw new WebReadError("invalid_url", "URLs with credentials are not allowed");
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new WebReadError("invalid_url", `Port ${url.port} is not allowed`);
  }
  url.hash = "";
  return url;
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]);
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) return !blocked.check(address, "ipv6");
  return false;
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

async function assertPublicHost(url: URL, lookup: HostLookup): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await lookup(host);
    } catch {
      throw new WebReadError("dns_failed", `Could not resolve ${host}`);
    }
  }
  if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a))) {
    throw new WebReadError("blocked_address", `${host} resolves to a non-public address`);
  }
}

// ---------- guarded fetch (used by http.ts in live and record modes) ----------

const ALLOWED_TYPES = /^(text\/html|text\/plain|application\/xhtml\+xml)/i;

export function createGuardedFetch(options: { lookup?: HostLookup; fetch?: typeof fetch } = {}): typeof fetch {
  const lookup = options.lookup ?? defaultLookup;
  const doFetch = options.fetch ?? globalThis.fetch;

  return (async (input: string | URL | Request, init?: RequestInit) => {
    let url = parsePublicUrl(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const signal = AbortSignal.timeout(WEB_LIMITS.timeoutMs);

    for (let hop = 0; ; hop++) {
      await assertPublicHost(url, lookup);
      const res = await doFetch(url, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "AtlasBot/0.1 (+research prototype)" },
      });

      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        if (hop >= WEB_LIMITS.maxRedirects) throw new WebReadError("too_many_redirects", `More than ${WEB_LIMITS.maxRedirects} redirects`);
        url = parsePublicUrl(new URL(res.headers.get("location")!, url).toString());
        await res.body?.cancel();
        continue;
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (res.ok && !ALLOWED_TYPES.test(contentType)) {
        await res.body?.cancel();
        throw new WebReadError("unsupported_content", `Unsupported content type: ${contentType || "none"}`);
      }
      const text = await readLimited(res, WEB_LIMITS.maxBytes);
      return new Response(text, { status: res.status, headers: { "content-type": contentType || "text/plain" } });
    }
  }) as typeof fetch;
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - total;
    chunks.push(value.length > room ? value.subarray(0, room) : value);
    total += Math.min(value.length, room);
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

// ---------- text extraction ----------

export function extractTitle(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
  return title || undefined;
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|head|title)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

// ---------- instruction detection ----------
// Heuristic only. A miss is acceptable because tainted requests are still denied by the gateway's
// `taint` rule; a hit only flags the page and logs it. Neither outcome grants anything.

const INSTRUCTION_PATTERNS: [name: string, pattern: RegExp][] = [
  ["ignore_previous", /\b(ignore|disregard|forget|override)\b[^.\n]{0,30}\b(previous|prior|above|earlier|all|your|any)\b[^.\n]{0,20}\b(instructions?|prompts?|rules|directions|guidelines|messages)\b/i],
  ["you_must_now", /\byou (must|should|will|are to) now\b/i],
  ["addressed_to_ai", /\b(dear|attention|note to|hello|hi|hey|to)\s*,?\s*(the\s+)?(ai|a\.i\.|assistant|chat ?bot|llm|language model|ai agent|agent|claude|chatgpt|gpt|copilot)s?\b\s*[,:!]/i],
  ["if_you_are_ai", /\bif you('re| are) (an? )?(ai|llm|language model|assistant|bot|agent|automated)\b/i],
  ["new_instructions", /\b(new|updated|real|actual|hidden) (system )?instructions\b|\bsystem prompt\b|\bdeveloper mode\b|\bjailbreak\b/i],
  ["role_tags", /<\/?(system|assistant|user)>|\[\/?INST\]|<\|im_start\|>|^\s*(system|assistant)\s*:/im],
  ["agent_action_request", /\b(send|email|forward|transfer|reveal|share)\b[^.\n]{0,40}\b(api key|password|credentials|budget|contact list|all (your|the) (data|emails|contacts))\b/i],
];

export function detectInstructions(raw: string, text: string): string[] {
  const haystacks = [text, raw];
  return INSTRUCTION_PATTERNS.filter(([, pattern]) => haystacks.some((h) => pattern.test(h))).map(([name]) => name);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
