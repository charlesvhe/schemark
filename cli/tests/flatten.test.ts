import { describe, expect, it } from "vitest";
import { flattenRow } from "../src/flatten.js";

describe("flattenRow", () => {
  it("preserves top-level scalars", () => {
    expect(flattenRow({ path: "a/b.md", count: 3, flag: true })).toEqual({
      path: "a/b.md",
      count: 3,
      flag: true,
    });
  });

  it("expands top-level objects one level", () => {
    const row = { sprint: { type: "sprint", name: "S1" } };
    expect(flattenRow(row)).toEqual({ sprint_type: "sprint", sprint_name: "S1" });
  });

  it("stringifies sub-property arrays", () => {
    const row = { frontmatter: { tags: ["a", "b"] } };
    expect(flattenRow(row)).toEqual({ frontmatter_tags: '["a","b"]' });
  });

  it("stringifies sub-property objects", () => {
    const row = { frontmatter: { meta: { author: "x" } } };
    expect(flattenRow(row)).toEqual({ frontmatter_meta: '{"author":"x"}' });
  });

  it("skips empty top-level objects", () => {
    const row = { path: "x.md", overview: {}, frontmatter: {} };
    expect(flattenRow(row)).toEqual({ path: "x.md" });
  });

  it("skips null and undefined values at top level", () => {
    const row = { path: "x.md", extra: null, missing: undefined };
    expect(flattenRow(row)).toEqual({ path: "x.md" });
  });

  it("skips null and undefined sub-properties", () => {
    const row = { frontmatter: { tags: null, owner: "x" } };
    expect(flattenRow(row)).toEqual({ frontmatter_owner: "x" });
  });

  it("stringifies top-level arrays", () => {
    const row = { items: [1, 2, 3] };
    expect(flattenRow(row)).toEqual({ items: "[1,2,3]" });
  });
});
