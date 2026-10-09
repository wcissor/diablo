import { describe, expect, it } from "vitest";
import { CAP_LIMITS, maxCalls } from "./budget";
import { anthropicWorkspace, liveConfig, providerKey, publicConfig } from "./env";
import { claudeAcceptsEffort, claudeRejectsTemperature, DEFAULT_MODELS } from "./providers";

describe("live env: provider pick", () => {
  it("is not configured without a key (not a misconfiguration, so no problem text)", () => {
    const c = liveConfig({});
    expect(c.provider).toBeNull();
    expect(c.problem).toBeNull();
  });

  it("picks Gemini when only its key exists", () => {
    expect(liveConfig({ GEMINI_API_KEY: "g" }).provider).toBe("gemini");
  });

  it("prefers the Claude key over Gemini when both are set", () => {
    expect(liveConfig({ ANTHROPIC_API_KEY: "a" }).provider).toBe("anthropic");
    expect(liveConfig({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" }).provider).toBe("anthropic");
    expect(liveConfig({ ANTHROPIC_API_KEY: "  ", GEMINI_API_KEY: "g" }).provider).toBe("gemini");
  });

  it("DIABLO_LLM=anthropic|gemini chooses whatever else is set", () => {
    const all = { ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" };
    expect(liveConfig({ ...all, DIABLO_LLM: "GEMINI" }).provider).toBe("gemini");
    expect(liveConfig({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", DIABLO_LLM: "anthropic" }).provider).toBe("anthropic");
    const missing = liveConfig({ DIABLO_LLM: "anthropic", GEMINI_API_KEY: "g" });
    expect(missing.provider).toBeNull();
    expect(missing.problem).toMatch(/ANTHROPIC_API_KEY/);
    expect(liveConfig({ DIABLO_LLM: "claude", ANTHROPIC_API_KEY: "a" }).problem).toMatch(/"anthropic", "gemini"/);
  });

  it("DIABLO_LLM chooses, and needs that provider's key", () => {
    expect(liveConfig({ DIABLO_LLM: "gemini", ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" }).provider).toBe("gemini");
    const missing = liveConfig({ DIABLO_LLM: "gemini", ANTHROPIC_API_KEY: "a" });
    expect(missing.provider).toBeNull();
    expect(missing.problem).toMatch(/GEMINI_API_KEY/);
    expect(liveConfig({ DIABLO_LLM: "openai", GEMINI_API_KEY: "g" }).provider).toBeNull();
  });

  it("uses the provider's default models unless overridden, and refuses odd model ids", () => {
    const g = liveConfig({ GEMINI_API_KEY: "g" });
    expect([g.reasoningModel, g.targetModel]).toEqual([DEFAULT_MODELS.gemini.reasoning, DEFAULT_MODELS.gemini.target]);
    const o = liveConfig({ GEMINI_API_KEY: "g", DIABLO_TARGET_MODEL: "gemini-3.5-flash" });
    expect([o.reasoningModel, o.targetModel]).toEqual([DEFAULT_MODELS.gemini.reasoning, "gemini-3.5-flash"]);
    const bad = liveConfig({ GEMINI_API_KEY: "g", DIABLO_REASONING_MODEL: "../../v1/files" });
    expect(bad.provider).toBeNull();
    expect(bad.problem).toMatch(/DIABLO_REASONING_MODEL/);
  });
});

describe("live env: Claude", () => {
  it("defaults to Claude Opus 5.5 for reasoning and Claude Haiku 4.5 as the system under test", () => {
    const c = liveConfig({ ANTHROPIC_API_KEY: "a" });
    expect(DEFAULT_MODELS.anthropic).toEqual({ reasoning: "claude-opus-5-5", target: "claude-haiku-4-5" });
    expect([c.reasoningModel, c.targetModel]).toEqual(["claude-opus-5-5", "claude-haiku-4-5"]);
    expect(c.problem).toBeNull();
    const o = liveConfig({ ANTHROPIC_API_KEY: "a", DIABLO_REASONING_MODEL: "claude-sonnet-5-5", DIABLO_TARGET_MODEL: "claude-sonnet-4-6" });
    expect([o.provider, o.reasoningModel, o.targetModel]).toEqual(["anthropic", "claude-sonnet-5-5", "claude-sonnet-4-6"]);
  });

  it("refuses a target that cannot take the scenario's temperature 0.2, and says which to use", () => {
    for (const target of ["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5", "claude-opus-4-7"]) {
      const c = liveConfig({ ANTHROPIC_API_KEY: "a", DIABLO_TARGET_MODEL: target });
      expect(c.provider).toBeNull();
      expect(c.problem).toContain(`${target} accepts no temperature other than 1`);
      expect(c.problem).toContain("claude-haiku-4-5");
    }
    // The reasoning model is never sent a temperature, so Opus 5.5 is fine there; other providers are not checked.
    expect(liveConfig({ ANTHROPIC_API_KEY: "a", DIABLO_REASONING_MODEL: "claude-fable-5-1" }).provider).toBe("anthropic");
    expect(liveConfig({ GEMINI_API_KEY: "g", DIABLO_TARGET_MODEL: "claude-haiku-5-5" }).provider).toBe("gemini");
  });

  it("knows which Claude models reject a non-default temperature (Claude 4.7 and later, Mythos)", () => {
    for (const id of ["claude-opus-5-5", "claude-haiku-5-5", "claude-sonnet-5-5", "claude-sonnet-5", "claude-opus-5", "claude-opus-4-8", "claude-opus-4-7", "claude-fable-5-1", "claude-mythos-preview"]) {
      expect(claudeRejectsTemperature(id), id).toBe(true);
    }
    for (const id of ["claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6", "claude-opus-4-5-20251101", "gemini-3.8-flash", "something-else"]) {
      expect(claudeRejectsTemperature(id), id).toBe(false);
    }
  });

  it("knows which Claude models take output_config.effort (Opus 4.5+, Sonnet 4.6+, Haiku 5.5, Fable, Mythos; not Haiku 4.5)", () => {
    for (const id of ["claude-opus-5-5", "claude-opus-4-5-20251101", "claude-opus-4-6", "claude-sonnet-4-6", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1", "claude-mythos-5-1"]) {
      expect(claudeAcceptsEffort(id), id).toBe(true);
    }
    for (const id of ["claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-sonnet-4-5-20250929", "claude-opus-4-1-20250805", "gemini-3.8-flash", "something-else"]) {
      expect(claudeAcceptsEffort(id), id).toBe(false);
    }
  });

  it("passes a valid ANTHROPIC_WORKSPACE_ID on and refuses a malformed one", () => {
    expect(anthropicWorkspace({ ANTHROPIC_WORKSPACE_ID: "wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ" })).toBe("wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ");
    expect(anthropicWorkspace({})).toBeNull();
    const bad = liveConfig({ ANTHROPIC_API_KEY: "a", ANTHROPIC_WORKSPACE_ID: "default" });
    expect(bad.provider).toBeNull();
    expect(bad.problem).toMatch(/ANTHROPIC_WORKSPACE_ID/);
    expect(anthropicWorkspace({ ANTHROPIC_WORKSPACE_ID: "default" })).toBeNull();
  });

  it("the page sees the label and models, never the key", () => {
    const env = { ANTHROPIC_API_KEY: "sk-ant-api03-super-secret" };
    const pub = publicConfig(liveConfig(env));
    expect(JSON.stringify(pub)).not.toContain("sk-ant-api03-super-secret");
    expect(pub).toMatchObject({ configured: true, provider: "anthropic", providerLabel: "Claude API", reasoningModel: "claude-opus-5-5", targetModel: "claude-haiku-4-5" });
    expect(providerKey("anthropic", env)).toBe("sk-ant-api03-super-secret");
  });
});

describe("live env: caps", () => {
  it("defaults to 2 experiments × 2 arms × 40 items", () => {
    const { caps } = liveConfig({});
    expect([caps.maxExperiments, caps.maxItemsPerArm]).toEqual([2, 40]);
    expect(maxCalls(caps)).toEqual({ draft: 3, target: 160, interpret: 2, total: 165 });
  });

  it("clamps overrides to the absolute ceilings", () => {
    const { caps, limits } = liveConfig({
      LIVE_MAX_EXPERIMENTS: "50",
      LIVE_MAX_ITEMS_PER_ARM: "100000",
      LIVE_CONCURRENCY: "0",
      LIVE_RUN_DEADLINE_SECONDS: "9999",
      LIVE_DAILY_CALL_CAP: "abc",
      LIVE_COOLDOWN_SECONDS: "5",
    });
    expect(caps.maxExperiments).toBe(CAP_LIMITS.maxExperiments.max);
    expect(caps.maxItemsPerArm).toBe(CAP_LIMITS.maxItemsPerArm.max);
    expect(caps.concurrency).toBe(1);
    expect(caps.runDeadlineMs).toBe(CAP_LIMITS.runDeadlineMs.max);
    expect(limits.dailyCallCap).toBe(500);
    expect(limits.cooldownMs).toBe(5000);
  });
});

describe("live env: what the page sees", () => {
  it("has no key in it", () => {
    const env = { GEMINI_API_KEY: "AIza-super-secret" };
    const pub = publicConfig(liveConfig(env));
    expect(JSON.stringify(pub)).not.toContain("AIza-super-secret");
    expect(pub).toMatchObject({ configured: true, provider: "gemini", providerLabel: "Gemini API" });
    expect(providerKey("gemini", env)).toBe("AIza-super-secret");
  });

  it("shows the estimate even when not configured, and no model names", () => {
    const pub = publicConfig(liveConfig({}));
    expect(pub.configured).toBe(false);
    expect(pub.reasoningModel).toBeNull();
    expect(pub.estimate.total).toBe(165);
  });
});
