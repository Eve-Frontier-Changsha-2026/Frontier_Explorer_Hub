import { describe, it, expect } from "vitest";
import { validatePortalUrl } from "@/lib/portal-url";

describe("validatePortalUrl", () => {
  it("accepts valid https URL", () => {
    expect(validatePortalUrl("https://example.com")).toEqual({ valid: true });
  });

  it("accepts https URL with path and query", () => {
    expect(validatePortalUrl("https://example.com/path?q=1#hash")).toEqual({ valid: true });
  });

  it("accepts https IP-based URL", () => {
    expect(validatePortalUrl("https://192.168.1.1")).toEqual({ valid: true });
  });

  it("accepts http://localhost for dev", () => {
    expect(validatePortalUrl("http://localhost:3000")).toEqual({ valid: true });
  });

  it("rejects http (non-localhost)", () => {
    const r = validatePortalUrl("http://example.com");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toContain("https");
  });

  it("rejects javascript: scheme", () => {
    const r = validatePortalUrl("javascript:alert(1)");
    expect(r.valid).toBe(false);
  });

  it("rejects data: scheme", () => {
    const r = validatePortalUrl("data:text/html,<h1>hi</h1>");
    expect(r.valid).toBe(false);
  });

  it("rejects blob: scheme", () => {
    const r = validatePortalUrl("blob:https://example.com/uuid");
    expect(r.valid).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validatePortalUrl("").valid).toBe(false);
  });

  it("rejects URL exceeding 2048 chars", () => {
    const long = "https://example.com/" + "a".repeat(2030);
    expect(validatePortalUrl(long).valid).toBe(false);
  });

  it("rejects non-URL string", () => {
    expect(validatePortalUrl("not a url").valid).toBe(false);
  });
});
