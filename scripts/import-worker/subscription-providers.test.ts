import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  parseJsonCandidates,
  SubscriptionModelRunner,
  type SpawnRequest,
} from "./subscription-providers";

const baseEnv = {
  HOME: "/Users/test",
  PATH: "/usr/bin:/bin",
  USER: "test",
  SHELL: "/bin/zsh",
  LANG: "en_CA.UTF-8",
  SUPABASE_SERVICE_ROLE_KEY: "must-not-leak",
};
const testFile = path.join(process.cwd(), "scripts/import-worker/subscription-providers.test.ts");
const codexEnv = { ...baseEnv, CODEX_BIN: testFile };

function valid(output: string) {
  return JSON.parse(output) as { ok: boolean };
}

describe("SubscriptionModelRunner", () => {
  it("prefers fast Grok extraction before the heavier fallback CLIs", () => {
    const requests: SpawnRequest[] = [];
    const runner = new SubscriptionModelRunner({
      env: baseEnv,
      platform: "darwin",
      toolLessAgentFile: testFile,
      executor: (request) => {
        requests.push(request);
        return { status: 0, stdout: '{"ok":true}', stderr: "" };
      },
      log: () => {},
    });

    expect(runner.askStructured("extraction", "prompt", valid)).toEqual({ ok: true });
    expect(requests[0].command).toBe("grok");
  });

  it("runs Codex behind both sandboxes without leaking worker secrets", () => {
    const requests: SpawnRequest[] = [];
    const runner = new SubscriptionModelRunner({
      env: { ...codexEnv, WORKER_EXTRACT_PROVIDERS: "codex" },
      platform: "darwin",
      toolLessAgentFile: testFile,
      sandboxExecutable: testFile,
      executor: (request) => {
        requests.push(request);
        return { status: 0, stdout: '{"ok":true}', stderr: "" };
      },
      log: () => {},
    });

    expect(runner.askStructured("extraction", "prompt", valid)).toEqual({ ok: true });
    expect(requests).toHaveLength(1);
    expect(requests[0].command).toBe(testFile);
    expect(requests[0].args).toContain("--ephemeral");
    expect(requests[0].args).toContain("--ignore-user-config");
    expect(requests[0].args).toContain("read-only");
    expect(requests[0].input).toBe("prompt");
    expect(requests[0].env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it("falls back after a provider process failure and circuits it for the run", () => {
    const commands: string[] = [];
    const runner = new SubscriptionModelRunner({
      env: { ...codexEnv, WORKER_EXTRACT_PROVIDERS: "codex,grok" },
      platform: "darwin",
      toolLessAgentFile: testFile,
      sandboxExecutable: testFile,
      executor: (request) => {
        commands.push(request.command);
        if (request.command === testFile) {
          return { status: 1, stdout: "", stderr: "login expired" };
        }
        return { status: 0, stdout: '{"ok":true}', stderr: "" };
      },
      log: () => {},
    });

    expect(runner.askStructured("extraction", "one", valid)).toEqual({ ok: true });
    expect(runner.askStructured("extraction", "two", valid)).toEqual({ ok: true });
    expect(commands).toEqual([testFile, "grok", "grok"]);
  });

  it("falls back on invalid output without disabling that provider", () => {
    const commands: string[] = [];
    let codexCalls = 0;
    const runner = new SubscriptionModelRunner({
      env: { ...codexEnv, WORKER_EXTRACT_PROVIDERS: "codex,grok" },
      platform: "darwin",
      toolLessAgentFile: testFile,
      sandboxExecutable: testFile,
      executor: (request) => {
        commands.push(request.command);
        if (request.command === testFile && codexCalls++ === 0) {
          return { status: 0, stdout: "not json", stderr: "" };
        }
        return { status: 0, stdout: '{"ok":true}', stderr: "" };
      },
      log: () => {},
    });

    expect(runner.askStructured("extraction", "one", valid)).toEqual({ ok: true });
    expect(runner.askStructured("extraction", "two", valid)).toEqual({ ok: true });
    expect(commands).toEqual([testFile, "grok", testFile]);
  });

  it("uses tool-less Kimi first for translations", () => {
    const requests: SpawnRequest[] = [];
    const runner = new SubscriptionModelRunner({
      env: baseEnv,
      platform: "darwin",
      toolLessAgentFile: testFile,
      executor: (request) => {
        requests.push(request);
        return { status: 0, stdout: '{"ok":true}', stderr: "" };
      },
      log: () => {},
    });

    expect(runner.askStructured("translation", "prompt", valid)).toEqual({ ok: true });
    expect(requests[0].command).toBe("kimi");
    expect(requests[0].args).toContain("--agent-file");
    expect(requests[0].args).toContain(testFile);
  });

  it("rejects unknown providers instead of silently changing the order", () => {
    const runner = new SubscriptionModelRunner({
      env: { ...baseEnv, WORKER_EXTRACT_PROVIDERS: "codex,unknown" },
      platform: "darwin",
      toolLessAgentFile: testFile,
      executor: () => ({ status: 0, stdout: '{"ok":true}', stderr: "" }),
      log: () => {},
    });

    expect(() => runner.askStructured("extraction", "prompt", valid)).toThrow(
      "Unknown subscription provider"
    );
  });
});

describe("parseJsonCandidates", () => {
  it("recovers valid structured output from noisy subscription CLI text", () => {
    const output = 'thinking about {"echo":true}\nfinal: {"provider":"kimi","ok":true}\nresume hint';
    expect(parseJsonCandidates(output)).toEqual([
      { echo: true },
      { provider: "kimi", ok: true },
    ]);
  });
});
