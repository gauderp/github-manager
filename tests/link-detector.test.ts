import { describe, it, expect } from "vitest";
import { extractCardIds } from "../src/sync/link-detector.js";

describe("extractCardIds", () => {
  it("finds CARD-123 in branch name", () => {
    expect(extractCardIds("feature/CARD-123-add-login", "some title"))
      .toEqual(["CARD-123"]);
  });

  it("finds #456 in PR title", () => {
    expect(extractCardIds("feature/something", "Fix bug #456"))
      .toEqual(["#456"]);
  });

  it("finds multiple IDs across branch and title", () => {
    expect(extractCardIds("CARD-10-and-CARD-20", "also #30"))
      .toEqual(["CARD-10", "CARD-20", "#30"]);
  });

  it("returns empty array when no IDs found", () => {
    expect(extractCardIds("feature/something", "no ids here"))
      .toEqual([]);
  });

  it("deduplicates IDs", () => {
    expect(extractCardIds("CARD-5-fix", "Fixes CARD-5"))
      .toEqual(["CARD-5"]);
  });

  it("handles issue key formats like ABC-123", () => {
    expect(extractCardIds("main", "Implements ABC-42 feature"))
      .toEqual(["ABC-42"]);
  });
});
