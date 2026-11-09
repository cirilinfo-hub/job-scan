import { env } from '../config/env';
import { AiProviderError, getAiProvider } from '../integrations/ai/provider';
import { PromptTemplate } from '../integrations/ai/prompts';
import { AppError, aiUnavailable, limitReached } from '../utils/errors';
import { logger } from '../utils/logger';
import { usageRepo } from '../repositories/usage.repository';
import { settingsService } from './settings.service';

/** Blocks the feature if the user's plan limit for this calendar month is spent. Applies to AI and non-AI features. */
export async function enforceLimit(userId: number, limitKey: string, feature: string, isAi = false): Promise<void> {
  const limits = await usageRepo.planLimits(userId);
  const limit = limits[limitKey];
  if (limit === undefined || limit === null || limit < 0) return;
  const used = isAi ? await usageRepo.monthlyAiCalls(userId) : await usageRepo.monthlyCount(userId, feature);
  if (used >= limit) {
    await usageRepo.log({ userId, feature, isAi, status: 'blocked' });
    throw limitReached(`You've reached your plan's monthly limit for this feature (${limit}).`);
  }
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in response');
  return JSON.parse(text.slice(start, end + 1));
}

const cost = (inTok: number, outTok: number): number | null => {
  const i = env.AI_COST_INPUT_PER_MTOK;
  const o = env.AI_COST_OUTPUT_PER_MTOK;
  return i === undefined || o === undefined ? null : (inTok * i + outTok * o) / 1_000_000;
};

export const aiService = {
  async status() {
    const provider = getAiProvider();
    const enabled = await settingsService.feature('ai');
    return { available: provider.isConfigured() && enabled, provider: provider.name, configured: provider.isConfigured(), enabled };
  },

  async isAvailable(): Promise<boolean> { return (await this.status()).available; },

  /**
   * Runs a prompt template and returns schema-validated output. It throws rather than returning a
   * placeholder, so callers cannot mistake a failure for an AI result.
   */
  async generate<T>(tpl: PromptTemplate<T>, vars: Record<string, string>, userId: number): Promise<T> {
    const provider = getAiProvider();
    if (!provider.isConfigured() || !(await settingsService.feature('ai'))) throw aiUnavailable();
    await enforceLimit(userId, 'ai_calls_per_month', tpl.feature, true);
    const model = (await settingsService.get<{ model?: string }>('ai_config', {})).model || undefined;
    const user = tpl.render(vars);
    let lastBad: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await provider.complete({
          system: tpl.system,
          user: attempt === 0 ? user : `${user}\n\nYour previous reply was not valid JSON for the requested shape. Reply with only the JSON object.`,
          maxTokens: tpl.maxTokens, model,
        });
        await usageRepo.log({
          userId, feature: tpl.feature, isAi: true, provider: provider.name, model: out.model,
          inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd: cost(out.inputTokens, out.outputTokens), status: 'ok',
        });
        try {
          return tpl.schema.parse(extractJson(out.text));
        } catch (bad) {
          lastBad = bad;
        }
      } catch (err) {
        await usageRepo.log({ userId, feature: tpl.feature, isAi: true, provider: provider.name, status: 'error' });
        if (err instanceof AppError) throw err;
        if (err instanceof AiProviderError) {
          logger.warn({ feature: tpl.feature, provider: provider.name, message: err.message }, 'AI provider error');
          throw new AppError(503, 'AI_UNAVAILABLE', err.retryable ? 'The AI service is busy or unreachable. Please try again shortly.' : 'The AI service could not complete this request.');
        }
        throw err;
      }
    }
    logger.warn({ feature: tpl.feature, err: String(lastBad) }, 'AI returned invalid output twice');
    throw new AppError(502, 'AI_BAD_OUTPUT', 'The AI service returned an unusable response. Please try again.');
  },
};
