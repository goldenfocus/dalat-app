import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonSchema } from "./work-plan";

/** Classify provider status without putting source prose or model output in logs. */
export function cliFailure(engine: "claude" | "codex", code: number | null, stdout: string): Error {
  if (engine === "claude") {
    try {
      const response = JSON.parse(stdout);
      if (response.subtype === "error_max_structured_output_retries")
        return new Error("claude structured output failed; retry smaller locale groups");
    } catch { /* Not a structured response. */ }
  }
  return new Error(`${engine} unavailable (exit ${code}); check CLI authentication and quota`);
}

/** Validate the small JSON-schema vocabulary used by the translation worker. */
export function validateCliOutput(value: any, schema?: JsonSchema, path = "response"): any {
  if (!schema) return value;
  if (schema.enum && !(schema.enum as unknown[]).includes(value))
    throw new Error(`Invalid structured output at ${path}`);
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Invalid structured output at ${path}`);
    const properties = (schema.properties || {}) as Record<string, JsonSchema>;
    if ((schema.required as string[] | undefined)?.some((key) => !(key in value)) ||
        (schema.additionalProperties === false && Object.keys(value).some((key) => !(key in properties))))
      throw new Error(`Invalid structured output keys at ${path}`);
    for (const [key, child] of Object.entries(properties))
      if (key in value) validateCliOutput(value[key], child, `${path}.${key}`);
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) throw new Error(`Invalid structured output at ${path}`);
    for (const item of value) validateCliOutput(item, schema.items as JsonSchema, `${path}[]`);
  } else if (schema.type === "string") {
    if (typeof value !== "string" || value.length < Number(schema.minLength || 0))
      throw new Error(`Invalid structured output at ${path}`);
  } else if (schema.type === "boolean" && typeof value !== "boolean") {
    throw new Error(`Invalid structured output at ${path}`);
  }
  return value;
}

/** No API keys, source text in argv, repository tools or persistent model sessions. */
export async function cliJson(
  engine: "claude" | "codex",
  prompt: string,
  schema?: JsonSchema,
  attempt = 0,
  // Claude's structured wrapper can spend a minute retrying valid translation
  // shapes. Prompt for JSON directly and enforce the same schema locally.
  plainJson = engine === "claude",
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
          ...(!plainJson ? ["--json-schema", JSON.stringify(
            schema || { type: "object", additionalProperties: true },
          )] : []),
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
          : reject(cliFailure(engine, code, stdout));
      });
      child.stdin.end(plainJson && schema
        ? `${prompt}\nReturn strict JSON only, matching this schema exactly: ${JSON.stringify(schema)}`
        : prompt);
    });
    let raw = engine === "codex" ? await readFile(output, "utf8") : text;
    if (engine === "claude") {
      const envelope = JSON.parse(raw);
      if (
        envelope.structured_output &&
        typeof envelope.structured_output === "object"
      )
        return validateCliOutput(envelope.structured_output, schema);
      raw = envelope.result || raw;
    }
    const start = raw.indexOf("{"),
      end = raw.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error(`${engine} returned no JSON`);
    try {
      return validateCliOutput(JSON.parse(raw.slice(start, end + 1)), schema);
    } catch {
      if (attempt >= 1) throw new Error(`${engine} returned malformed JSON`);
      return cliJson(
        engine,
        prompt +
          "\nYour output must be strict JSON. Escape all quote characters and newlines inside strings. Do not include prose or markdown fences.",
        schema,
        attempt + 1,
        plainJson,
      );
    }
  } catch (error) {
    // Same model, same exact schema and independent review. Avoid repeatedly
    // failing the provider's structured-output wrapper when ordinary JSON works.
    if (engine === "claude" && !plainJson && /structured output/.test(String(error)))
      return cliJson(engine, prompt, schema, 0, true);
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
