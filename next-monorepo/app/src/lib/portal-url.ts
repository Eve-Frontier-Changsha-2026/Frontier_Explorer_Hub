type ValidationResult = { valid: true } | { valid: false; error: string };

const BLOCKED_SCHEMES = ["javascript:", "data:", "blob:"];
const MAX_URL_LENGTH = 2048;

export function validatePortalUrl(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, error: "URL is required" };
  if (trimmed.length > MAX_URL_LENGTH) return { valid: false, error: "URL exceeds 2048 characters" };

  const lower = trimmed.toLowerCase();
  for (const scheme of BLOCKED_SCHEMES) {
    if (lower.startsWith(scheme)) return { valid: false, error: `${scheme} URLs are not allowed` };
  }

  // Allow http://localhost for dev
  const isLocalhost = lower.startsWith("http://localhost");
  if (!isLocalhost && !lower.startsWith("https://")) {
    return { valid: false, error: "Only https:// URLs are allowed" };
  }

  try {
    new URL(trimmed);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  return { valid: true };
}
