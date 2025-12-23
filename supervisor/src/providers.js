/**
 * AI Provider Management v2.1
 * Unterstützt: OpenAI, Anthropic, xAI, Gemini
 */

let OpenAI, Anthropic;
try { OpenAI = require('openai'); } catch (e) { OpenAI = null; }
try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) { Anthropic = null; }

// Provider instances
let openaiClient = null;
let anthropicClient = null;

// Initialize providers based on available API keys
function initProviders() {
  if (OpenAI && process.env.OPENAI_API_KEY && !openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  if (Anthropic && process.env.ANTHROPIC_API_KEY && !anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
}

/**
 * Get list of configured providers
 */
function getAvailableProviders() {
  const providers = [];
  if (process.env.OPENAI_API_KEY) providers.push('openai');
  if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');
  if (process.env.XAI_API_KEY) providers.push('xai');
  if (process.env.GEMINI_API_KEY) providers.push('gemini');
  if (process.env.CURSOR_API_KEY) providers.push('cursor');
  return providers;
}

/**
 * Complete with specified provider
 */
async function complete({ provider = 'anthropic', model, messages, maxTokens = 4096, temperature = 0.7 }) {
  initProviders();

  if (provider === 'anthropic' && anthropicClient) {
    const response = await anthropicClient.messages.create({
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: maxTokens,
      temperature,
      messages: messages.map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content
      }))
    });
    return {
      content: response.content[0]?.text || '',
      usage: {
        input_tokens: response.usage?.input_tokens || 0,
        output_tokens: response.usage?.output_tokens || 0
      }
    };
  }

  if (provider === 'openai' && openaiClient) {
    const response = await openaiClient.chat.completions.create({
      model: model || 'gpt-4o',
      max_tokens: maxTokens,
      temperature,
      messages
    });
    return {
      content: response.choices[0]?.message?.content || '',
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0
      }
    };
  }

  throw new Error(`Provider ${provider} not configured or not supported`);
}

/**
 * Smart complete - tries primary, falls back to secondary
 */
async function smartComplete({ primary, fallback, messages, maxTokens = 4096, temperature = 0.7 }) {
  try {
    return await complete({
      provider: primary?.provider || 'anthropic',
      model: primary?.model,
      messages,
      maxTokens,
      temperature
    });
  } catch (error) {
    console.warn(`[providers] Primary failed (${primary?.provider}), trying fallback...`);
    if (fallback) {
      return await complete({
        provider: fallback.provider,
        model: fallback.model,
        messages,
        maxTokens,
        temperature
      });
    }
    throw error;
  }
}

module.exports = {
  complete,
  smartComplete,
  getAvailableProviders,
  initProviders
};
