import OpenAI from "openai";
import { z, type ZodType } from "zod";

type Provider = "moonshot" | "openrouter" | "custom";

function pickProvider(): { provider: Provider; baseURL: string; apiKey: string; model: string; extraHeaders?: Record<string, string> } {
  const explicitBase = process.env.MOONSHOT_BASE_URL;
  const moonshotKey = process.env.MOONSHOT_API_KEY ?? "";
  const openrouterKey =
    process.env.OPENROUTER_API_KEY ??
    process.env.OPEN_ROUTER_API_KEY ??
    "";
  const modelOverride = process.env.KIMI_MODEL;

  if (openrouterKey && !moonshotKey) {
    return {
      provider: "openrouter",
      baseURL: explicitBase ?? "https://openrouter.ai/api/v1",
      apiKey: openrouterKey,
      model: modelOverride ?? "moonshotai/kimi-k2-0905",
      extraHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://github.com/erenakbulut/telepath",
        "X-Title": "Telepath",
      },
    };
  }
  if (moonshotKey) {
    return {
      provider: "moonshot",
      baseURL: explicitBase ?? "https://api.moonshot.ai/v1",
      apiKey: moonshotKey,
      model: modelOverride ?? "kimi-k2-0905-preview",
    };
  }
  return {
    provider: "custom",
    baseURL: explicitBase ?? "",
    apiKey: "",
    model: modelOverride ?? "kimi-k2-0905-preview",
  };
}

const cfg = pickProvider();
export const KIMI_MODEL = cfg.model;
export const KIMI_PROVIDER = cfg.provider;

let _client: OpenAI | null = null;

export function kimi(): OpenAI {
  if (_client) return _client;
  if (!cfg.apiKey) {
    throw new Error(
      "No LLM key found. Set either MOONSHOT_API_KEY (https://platform.moonshot.ai) or OPENROUTER_API_KEY (https://openrouter.ai) in .env.local.",
    );
  }
  _client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    defaultHeaders: cfg.extraHeaders,
  });
  return _client;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatJSONOptions = {
  temperature?: number;
  maxRetries?: number;
  model?: string;
};

export async function chatJSON<T>(
  schema: ZodType<T>,
  messages: ChatMessage[],
  opts: ChatJSONOptions = {},
): Promise<T> {
  const { temperature = 0.4, maxRetries = 2, model = KIMI_MODEL } = opts;
  const client = kimi();

  const seed: ChatMessage[] = [
    {
      role: "system",
      content:
        "You always respond with a single JSON object that matches the requested schema exactly. No prose, no markdown fences, just JSON.",
    },
    ...messages,
  ];

  let lastError: unknown = null;
  let lastRaw = "";
  const conv: ChatMessage[] = [...seed];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const completion = await client.chat.completions.create({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: conv,
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    lastRaw = raw;
    try {
      const parsed = JSON.parse(raw);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      lastError = result.error;
      const pretty = z.prettifyError(result.error);
      if (process.env.TELEPATH_DEBUG_VALIDATION === "1") {
        console.warn(`[chatJSON] attempt ${attempt + 1} validation failed:\n${pretty.slice(0, 1500)}`);
      }
      conv.push({ role: "assistant", content: raw });
      conv.push({
        role: "user",
        content: `Your previous response did not match the schema. Validation errors:\n${pretty}\n\nReturn a corrected JSON object.`,
      });
    } catch (parseErr) {
      lastError = parseErr;
      conv.push({ role: "assistant", content: raw });
      conv.push({
        role: "user",
        content: `Your previous response was not valid JSON. Return a single JSON object only.`,
      });
    }
  }
  throw new Error(
    `chatJSON failed after ${maxRetries + 1} attempts. Last raw: ${lastRaw.slice(0, 400)}`,
    { cause: lastError as Error },
  );
}

export type StreamChunk = { delta: string; done: boolean };

export type ChatStreamOptions = {
  temperature?: number;
  model?: string;
  responseFormat?: "json_object" | "text";
};

export async function* chatStream(
  messages: ChatMessage[],
  opts: ChatStreamOptions = {},
): AsyncGenerator<StreamChunk> {
  const { temperature = 0.4, model = KIMI_MODEL, responseFormat } = opts;
  const client = kimi();
  const stream = await client.chat.completions.create({
    model,
    temperature,
    stream: true,
    messages,
    ...(responseFormat ? { response_format: { type: responseFormat } } : {}),
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) yield { delta, done: false };
  }
  yield { delta: "", done: true };
}
