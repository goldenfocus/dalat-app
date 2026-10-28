import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonSchema } from "./work-plan";

/** No API keys, source text in argv, repository tools or persistent model sessions. */
export async function cliJson(
  engine: "claude" | "codex",
  prompt: string,
  schema?: JsonSchema,
  attempt = 0,
): Promise<Record<string, any>> {
  const dir = await mkdtemp(join(tmpdir(), "dalat-translation-"));
  const allowedEnvironment = new Set([
    "HOME",
    "PATH",
    "SHELL",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "TERM",
    "CODEX_HOME",
    "CLAUDE_CONFIG_DIR",
    "XDG_CONFIG_HOME",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
  ]);
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV || "production",
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        allowedEnvironment.has(key),
      ),
    ),
  };
  const output = join(dir, "result.json");
  const schemaPath = join(dir, "schema.json");
  if (engine === "codex" && schema)
    await writeFile(schemaPath, JSON.stringify(schema), { mode: 0o600 });
  const args =
    engine === "claude"
      ? [
          "-p",
          "--model",
          process.env.TRANSLATION_CLAUDE_MODEL || "sonnet",
          "--effort",
          "high",
          "--tools",
          "",
          "--no-session-persistence",
          "--output-format",
          "json",
          "--json-schema",
          JSON.stringify(
            schema || { type: "object", additionalProperties: true },
          ),
        ]
      : [
          "exec",
          "--ignore-user-config",
          "--ephemeral",
          "--skip-git-repo-check",
          "-s",
          "read-only",
          "-m",
          process.env.TRANSLATION_CODEX_MODEL || "gpt-6.1-sol",
          "-c",
          'model_reasoning_effort="high"',
          "-c",
          "features.shell_tool=false",
          ...(schema ? ["--output-schema", schemaPath] : []),
          "-o",
          output,
          "-",
        ];
  try {
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn(engine, args, {
        cwd: dir,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`${engine} timed out`));
      }, 8 * 60_000);
      child.stdout.on("data", (data) => {
        stdout += data;
      });
      child.stderr.resume();
      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        code === 0
          ? resolve(stdout)
          : reject(
              new Error(
                `${engine} unavailable (exit ${code}); check CLI authentication and quota`,
              ),
            );
      });
      child.stdin.end(prompt);
    });
    let raw = engine === "codex" ? await readFile(output, "utf8") : text;
    if (engine === "claude") {
      const envelope = JSON.parse(raw);
      if (
        envelope.structured_output &&
        typeof envelope.structured_output === "object"
      )
        return envelope.structured_output;
      raw = envelope.result || raw;
    }
    const start = raw.indexOf("{"),
      end = raw.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error(`${engine} returned no JSON`);
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      if (attempt >= 1) throw new Error(`${engine} returned malformed JSON`);
      return cliJson(
        engine,
        prompt +
          "\nYour output must be strict JSON. Escape all quote characters and newlines inside strings. Do not include prose or markdown fences.",
        schema,
        attempt + 1,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
