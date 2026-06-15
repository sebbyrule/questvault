import { describe, it, expect } from "vitest";
// Import the module directly (not the package index) so the test stays DB-free.
import { toVectorLiteral, embeddingsEnabled } from "./embeddings";

describe("toVectorLiteral", () => {
  it("formats a vector for the pgvector cast", () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });

  it("handles an empty vector and negatives", () => {
    expect(toVectorLiteral([])).toBe("[]");
    expect(toVectorLiteral([-1, 0, 1])).toBe("[-1,0,1]");
  });
});

describe("embeddingsEnabled", () => {
  it("reflects USE_EMBEDDINGS", () => {
    const prev = process.env.USE_EMBEDDINGS;
    process.env.USE_EMBEDDINGS = "true";
    expect(embeddingsEnabled()).toBe(true);
    process.env.USE_EMBEDDINGS = "false";
    expect(embeddingsEnabled()).toBe(false);
    if (prev === undefined) delete process.env.USE_EMBEDDINGS;
    else process.env.USE_EMBEDDINGS = prev;
  });
});
