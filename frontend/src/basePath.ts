// Where the app is mounted. "/" by default; "/portask/" when built with
// VITE_BASE_PATH=/portask (see vite.config.ts). `BASE` has no trailing slash.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Server-relative URLs such as "/uploads/x.png" must carry the mount prefix. Absolute
// URLs are left alone.
export function withBase(url: string): string {
  return url.startsWith("/") && !url.startsWith("//") ? `${BASE}${url}` : url;
}
