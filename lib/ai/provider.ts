/**
 * Unified AI text provider with a zero-credit fallback chain:
 *
 *   1. Local Ollama (qwen3:14b) on the Mac mini, via Cloudflare tunnel — primary
 *   2. Cloudflare Workers AI (Llama 3.3 70B) — free tier
 *   3. OpenRouter free models — last resort
 *
 * All providers are prompt-in/text-out. Callers that need JSON should pass
 * `json: true` and parse defensively (models may still wrap output in fences).
 */

export interface AIChatOptions {
  system?: string;
  prompt: string;
  /** Ask the model for a JSON object response */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Per-provider timeout; the chain moves on when it elapses */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

const OPENROUTER_FREE_MODELS = [
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
];

const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

class ProviderError extends Error {
  constructor(provider: string, cause: string) {
    super(`[ai-provider:${provider}] ${cause}`);
  }
}

/** JSON nudge appended when the provider has no native JSON mode */
function jsonNudge(system: string | undefined): string {
  const nudge = 'Respond with a single valid JSON object only. No markdown fences, no prose before or after.';
  return system ? `${system}\n\n${nudge}` : nudge;
}

async function localOllama(opts: AIChatOptions): Promise<string> {
  const url = process.env.LOCAL_AI_URL;
  const token = process.env.LOCAL_AI_TOKEN;
  if (!url || !token) throw new ProviderError('local', 'LOCAL_AI_URL/LOCAL_AI_TOKEN not configured');

  const res = await fetch(`${url.replace(/\/$/, '')}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      system: opts.system,
      prompt: opts.prompt,
      json: opts.json === true,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) throw new ProviderError('local', `status ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new ProviderError('local', 'empty response');
  if (text.includes('[ollama error:')) throw new ProviderError('local', text.slice(-200));
  return text;
}

async function cloudflareAI(opts: AIChatOptions): Promise<string> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_TOKEN;
  if (!accountId || !token) throw new ProviderError('cloudflare', 'CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_AI_TOKEN not configured');

  const messages: { role: string; content: string }[] = [];
  const system = opts.json ? jsonNudge(opts.system) : opts.system;
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: opts.prompt });

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 2048,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    }
  );

  if (!res.ok) throw new ProviderError('cloudflare', `status ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new ProviderError('cloudflare', JSON.stringify(data.errors).slice(0, 200));
  // Workers AI returns either an OpenAI-style result or {response} depending on model
  const text: string | undefined =
    data.result?.choices?.[0]?.message?.content ?? data.result?.response;
  if (!text || !text.trim()) throw new ProviderError('cloudflare', 'empty response');
  return text;
}

async function openRouter(opts: AIChatOptions): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new ProviderError('openrouter', 'OPENROUTER_API_KEY not configured');

  const messages: { role: string; content: string }[] = [];
  const system = opts.json ? jsonNudge(opts.system) : opts.system;
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: opts.prompt });

  let lastError: Error = new ProviderError('openrouter', 'no models attempted');
  for (const model of OPENROUTER_FREE_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.maxTokens ?? 2048,
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      const data = await res.json();
      if (data.error) throw new ProviderError('openrouter', `${model}: ${data.error.message ?? data.error}`.slice(0, 200));
      const text: string | undefined = data.choices?.[0]?.message?.content;
      if (!text || !text.trim()) throw new ProviderError('openrouter', `${model}: empty response`);
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Free models are frequently rate-limited upstream; try the next one
    }
  }
  throw lastError;
}

const CHAIN: Array<{ name: string; run: (opts: AIChatOptions) => Promise<string> }> = [
  { name: 'local', run: localOllama },
  { name: 'cloudflare', run: cloudflareAI },
  { name: 'openrouter', run: openRouter },
];

/**
 * Run a chat completion through the free-provider chain.
 * Throws only when every provider fails.
 */
export async function aiChat(opts: AIChatOptions): Promise<string> {
  const errors: string[] = [];
  for (const provider of CHAIN) {
    try {
      const text = await provider.run(opts);
      if (provider.name !== 'local') {
        console.warn(`[ai-provider] served by fallback "${provider.name}" (${errors.join('; ').slice(0, 300)})`);
      }
      return text;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(`All AI providers failed: ${errors.join(' | ')}`);
}

/**
 * aiChat + lenient JSON extraction, for prompts that request a JSON object.
 */
export async function aiChatJson<T>(opts: Omit<AIChatOptions, 'json'>): Promise<T> {
  const raw = await aiChat({ ...opts, json: true });
  let text = raw.trim();
  if (text.startsWith('```json')) text = text.slice(7);
  else if (text.startsWith('```')) text = text.slice(3);
  if (text.endsWith('```')) text = text.slice(0, -3);
  text = text.trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error(`AI response was not valid JSON: ${text.slice(0, 200)}`);
  }
}
