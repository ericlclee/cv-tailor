import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";

// Haiku keeps costs to a few cents per application. Set CLAUDE_MODEL=claude-opus-5-5 for stronger writing.
export const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

// Server-side refusal fallback is only accepted on these models.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"]);

export class AIError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

/** True when an Anthropic credential is configured. Without one the app runs in offline mode. */
export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
export function getClient() {
  client ??= new Anthropic();
  return client;
}

/** Server-side refusal fallback, where the model supports it. */
export function fallbackParams() {
  return FALLBACK_MODELS.has(MODEL) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {};
}

/** Turn an SDK error into a message the user can act on. */
export function friendlyError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new AIError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.", 401);
  if (err instanceof Anthropic.RateLimitError) return new AIError("Rate limited by the AI provider. Wait a moment and try again.", 429);
  if (err instanceof Anthropic.APIConnectionError) return new AIError("Could not reach the AI provider. Check your connection.", 503);
  if (err instanceof Anthropic.APIError) return new AIError(`AI request failed: ${err.message}`);
  return new AIError(err instanceof Error ? err.message : "AI request failed.");
}

interface JsonRequest<S extends z.ZodType> {
  schema: S;
  system: string;
  prompt: string | BetaContentBlockParam[];
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

/** Ask Claude for a response that matches `schema`, parsed and validated. */
export async function aiJson<S extends z.ZodType>(req: JsonRequest<S>): Promise<z.infer<S>> {
  if (!aiEnabled()) throw new AIError("AI is not configured. Add ANTHROPIC_API_KEY to .env.local.", 503);
  try {
    // Streamed so long outputs don't hit the SDK's non-streaming timeout limit.
    const stream = getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: req.maxTokens ?? 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: req.effort ?? "medium", format: betaZodOutputFormat(req.schema) },
      ...fallbackParams(),
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
    });
    const res = await stream.finalMessage();
    if (res.stop_reason === "refusal") throw new AIError("The AI declined to process this request.");
    if (res.stop_reason === "max_tokens") throw new AIError("The AI response was too long and got cut off. Try again with less input.");
    if (res.parsed_output == null) throw new AIError("The AI returned a response in an unexpected format. Please try again.");
    return res.parsed_output as z.infer<S>;
  } catch (err) {
    if (err instanceof Anthropic.AnthropicError || err instanceof AIError) throw friendlyError(err);
    throw err;
  }
}
