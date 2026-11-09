import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';

export interface AiRequest { system: string; user: string; maxTokens: number; model?: string }
export interface AiCompletion { text: string; model: string; inputTokens: number; outputTokens: number }

/** Thrown by adapters. `retryable` distinguishes outages and rate limits from bad requests. */
export class AiProviderError extends Error {
  constructor(message: string, public readonly retryable: boolean) { super(message); }
}

export interface AiProvider {
  readonly name: string;
  isConfigured(): boolean;
  complete(req: AiRequest): Promise<AiCompletion>;
}

class DisabledProvider implements AiProvider {
  readonly name = 'none';
  isConfigured() { return false; }
  async complete(): Promise<AiCompletion> { throw new AiProviderError('No AI provider configured', false); }
}

const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private client: Anthropic | null = null;
  isConfigured() { return !!env.ANTHROPIC_API_KEY; }

  async complete(req: AiRequest): Promise<AiCompletion> {
    this.client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });
    const model = req.model ?? env.AI_MODEL ?? 'claude-opus-5-5';
    try {
      // Server-side fallback covers safety-classifier refusals on the models that accept it.
      const stream = this.client.beta.messages.stream({
        model, max_tokens: req.maxTokens, system: req.system,
        messages: [{ role: 'user', content: req.user }],
        output_config: { effort: 'medium' },
        ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') throw new AiProviderError('The model declined this request', false);
      if (msg.stop_reason === 'max_tokens') throw new AiProviderError('The response was cut off', false);
      const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      return { text, model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
    } catch (err) {
      if (err instanceof AiProviderError) throw err;
      if (err instanceof Anthropic.RateLimitError) throw new AiProviderError('Provider rate limit reached', true);
      if (err instanceof Anthropic.APIConnectionError) throw new AiProviderError('Could not reach the provider', true);
      if (err instanceof Anthropic.APIError) throw new AiProviderError(`Provider returned ${err.status}`, (err.status ?? 500) >= 500);
      throw err;
    }
  }
}

/** Any service exposing the common /chat/completions shape: OpenAI, Azure, Groq, OpenRouter, Ollama and others. */
class OpenAiCompatibleProvider implements AiProvider {
  readonly name = 'openai-compatible';
  isConfigured() { return !!env.AI_MODEL && !!env.OPENAI_COMPAT_BASE_URL; }

  async complete(req: AiRequest): Promise<AiCompletion> {
    const model = req.model ?? env.AI_MODEL!;
    let res: Response;
    try {
      res = await fetch(`${env.OPENAI_COMPAT_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(env.OPENAI_COMPAT_API_KEY ? { authorization: `Bearer ${env.OPENAI_COMPAT_API_KEY}` } : {}) },
        body: JSON.stringify({ model, max_tokens: req.maxTokens, messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }] }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new AiProviderError('Could not reach the provider', true);
    }
    if (!res.ok) throw new AiProviderError(`Provider returned ${res.status}`, res.status === 429 || res.status >= 500);
    const data = await res.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new AiProviderError('Provider returned an empty response', true);
    return { text, model: data.model ?? model, inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 };
  }
}

let override: AiProvider | null = null;
/** Test seam only. Production selects a provider from environment variables. */
export function setAiProviderForTests(p: AiProvider | null): void { override = p; }

const providers: Record<string, AiProvider> = {
  none: new DisabledProvider(),
  anthropic: new AnthropicProvider(),
  'openai-compatible': new OpenAiCompatibleProvider(),
};

export function getAiProvider(): AiProvider { return override ?? providers[env.AI_PROVIDER]; }
