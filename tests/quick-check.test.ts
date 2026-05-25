import { describe, it, expect } from "vitest";

describe("quick-check patterns", () => {
  const SENSITIVE_PATTERNS = [
    /\.env$/i, /\.env\./i, /credentials/i, /secret/i,
    /\.pem$/i, /\.key$/i, /password/i, /token/i,
  ];
  const TEST_PATTERNS = [
    /\.test\./, /\.spec\./, /_test\./, /tests?\//, /__tests__\//,
  ];

  it("detects .env files as sensitive", () => {
    expect(SENSITIVE_PATTERNS.some((p) => p.test(".env"))).toBe(true);
    expect(SENSITIVE_PATTERNS.some((p) => p.test(".env.local"))).toBe(true);
  });

  it("detects .pem and .key as sensitive", () => {
    expect(SENSITIVE_PATTERNS.some((p) => p.test("server.pem"))).toBe(true);
    expect(SENSITIVE_PATTERNS.some((p) => p.test("private.key"))).toBe(true);
  });

  it("does not flag normal files as sensitive", () => {
    expect(SENSITIVE_PATTERNS.some((p) => p.test("index.ts"))).toBe(false);
    expect(SENSITIVE_PATTERNS.some((p) => p.test("README.md"))).toBe(false);
  });

  it("detects test files", () => {
    expect(TEST_PATTERNS.some((p) => p.test("foo.test.ts"))).toBe(true);
    expect(TEST_PATTERNS.some((p) => p.test("foo.spec.ts"))).toBe(true);
    expect(TEST_PATTERNS.some((p) => p.test("tests/bar.ts"))).toBe(true);
    expect(TEST_PATTERNS.some((p) => p.test("__tests__/baz.ts"))).toBe(true);
  });

  it("does not flag normal files as tests", () => {
    expect(TEST_PATTERNS.some((p) => p.test("app.ts"))).toBe(false);
  });
});
