import { describe, expect, it } from "vitest";
import { CLAUDE_PRICES, formatUsd, priceOf, runCostUsd } from "./pricing";

describe("Claude list prices", () => {
  it("are the pricing page's figures (USD per million tokens, read 9 Oct 2026)", () => {
    expect(CLAUDE_PRICES["claude-opus-5-5"]).toEqual({ input: 4, cacheHit: 0.2, output: 20 });
    expect(CLAUDE_PRICES["claude-haiku-5-5"]).toEqual({ input: 0.1, cacheHit: 0.01, output: 0.5 });
    expect(CLAUDE_PRICES["claude-haiku-4-5"]).toEqual({ input: 1, cacheHit: 0.1, output: 5 });
  });

  it("finds a dated snapshot under its alias, and nothing for other providers", () => {
    expect(priceOf("claude-haiku-4-5-20251001")).toBe(CLAUDE_PRICES["claude-haiku-4-5"]);
    expect(priceOf("gemini-3.8-flash")).toBeNull();
    expect(priceOf("unknown-model-1")).toBeNull();
  });

  it("prices plan and conclusion at the reasoning model's rate and the target calls at the target's", () => {
    const zero = { inputTokens: 0, outputTokens: 0 };
    const c = runCostUsd(
      { reasoning: "claude-opus-5-5", target: "claude-haiku-4-5" },
      {
        draft: { inputTokens: 3000, outputTokens: 4000 }, // 0.012 + 0.08
        interpret: { inputTokens: 2000, outputTokens: 1000 }, // 0.008 + 0.02
        run: { inputTokens: 16_000, outputTokens: 40_000 }, // 0.016 + 0.2
      },
    )!;
    expect(c.reasoning).toBeCloseTo(0.12, 10);
    expect(c.target).toBeCloseTo(0.216, 10);
    expect(c.total).toBeCloseTo(0.336, 10);
    expect(runCostUsd({ reasoning: "gemini-3.8-flash", target: "claude-haiku-4-5" }, { draft: zero, interpret: zero, run: zero })).toBeNull();
  });

  it("formats cents and fractions of a cent readably", () => {
    expect(formatUsd(0.336)).toBe("$0.34");
    expect(formatUsd(0.0123)).toBe("$0.012");
    expect(formatUsd(0.000045)).toBe("$0.000045");
    expect(formatUsd(1.234)).toBe("$1.23");
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(1e-9)).toBe("under $0.000001");
  });
});
