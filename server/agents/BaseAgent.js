/**
 * BaseAgent - Erweiterte Version v2.1 mit Zukunfts-Features
 * ==========================================================
 *
 * FEATURES:
 * - Streaming-Support für lange Antworten
 * - Batch-Processing für mehrere Tasks
 * - Automatische Prompt-Optimierung basierend auf Feedback
 * - Erweiterte Metriken und Analytics
 * - Circuit Breaker Pattern
 * - Rate Limiting (Token Bucket)
 * - Graceful Shutdown
 */

const EventEmitter = require('events');

// ============================================================================
// CIRCUIT BREAKER STATES
// ============================================================================
const CIRCUIT_STATES = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
});

// ============================================================================
// BASE AGENT CLASS
// ============================================================================
class BaseAgent extends EventEmitter {
  constructor(config) {
    super();

    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.version = config.version || '2.1.0';
    this.description = config.description;

    // Provider-Konfiguration
    this.primary = config.primary;
    this.fallback = config.fallback;

    // Capabilities
    this.capabilities = new Set(config.capabilities || []);
    this.keywords = config.keywords || [];
    this.costs = config.costs || { input: 3, output: 15 };

    // Einstellungen
    this.settings = {
      circuitBreaker: {
        failureThreshold: config.circuitBreaker?.failureThreshold || 3,
        resetTimeout: config.circuitBreaker?.resetTimeout || 30000,
        halfOpenMaxAttempts: config.circuitBreaker?.halfOpenMaxAttempts || 1,
        enabled: config.circuitBreaker?.enabled !== false
      },
      retry: {
        maxAttempts: config.retry?.maxAttempts || 2,
        baseDelay: config.retry?.baseDelay || 1000,
        maxDelay: config.retry?.maxDelay || 10000,
        jitterFactor: config.retry?.jitterFactor || 0.3
      },
      timeout: {
        request: config.timeout?.request || 60000,
        graceful: config.timeout?.graceful || 5000
      },
      history: {
        maxSize: config.history?.maxSize || 100,
        retentionMs: config.history?.retentionMs || 24 * 60 * 60 * 1000
      },
      rateLimit: {
        maxTokens: config.rateLimit?.maxTokens || 100,
        refillRate: config.rateLimit?.refillRate || 10
      },
      streaming: {
        enabled: config.streaming?.enabled || false,
        chunkSize: config.streaming?.chunkSize || 100,
        flushInterval: config.streaming?.flushInterval || 50
      },
      batch: {
        maxSize: config.batch?.maxSize || 10,
        maxWaitMs: config.batch?.maxWaitMs || 1000,
        concurrency: config.batch?.concurrency || 3
      },
      feedback: {
        enabled: config.feedback?.enabled || true,
        learningRate: config.feedback?.learningRate || 0.1,
        minSamples: config.feedback?.minSamples || 10
      }
    };

    // State
    this._circuitState = CIRCUIT_STATES.CLOSED;
    this._failureCount = 0;
    this._lastFailure = null;
    this._halfOpenAttempts = 0;
    this._taskHistory = [];
    this._taskIndex = new Map();
    this._activeRequests = 0;
    this._isShuttingDown = false;

    // Rate Limiting (Token Bucket)
    this._rateLimitTokens = this.settings.rateLimit.maxTokens;
    this._lastRefill = Date.now();

    // Streaming-State
    this._activeStreams = new Map();

    // Batch-Queue
    this._batchQueue = [];
    this._batchTimer = null;
    this._batchProcessing = false;

    // Feedback-Store für Prompt-Optimierung
    this._feedbackStore = {
      ratings: [],
      promptVariants: new Map(),
      optimalPrompts: new Map()
    };

    // Analytics
    this._analytics = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      totalLatency: 0,
      avgLatency: 0,
      feedbackScores: [],
      promptPerformance: new Map()
    };

    // Cleanup-Interval
    this._cleanupInterval = null;
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async initialize() {
    this._cleanupInterval = setInterval(() => {
      this._cleanupHistory();
      this._refillRateLimitTokens();
    }, 60000);

    this.emit('agent:initialized', { agentId: this.id });
    return this;
  }

  async shutdown() {
    this._isShuttingDown = true;
    this.emit('agent:shutting_down', { agentId: this.id });

    // Batch-Queue abarbeiten
    if (this._batchQueue.length > 0) {
      await this._flushBatch();
    }

    // Active Streams beenden
    for (const [streamId, stream] of this._activeStreams) {
      stream.controller?.abort();
      this._activeStreams.delete(streamId);
    }

    // Auf aktive Requests warten
    const timeout = this.settings.timeout.graceful;
    const start = Date.now();

    while (this._activeRequests > 0 && (Date.now() - start) < timeout) {
      await this._sleep(100);
    }

    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
    }

    this.emit('agent:shutdown', { agentId: this.id });
  }

  // ==========================================================================
  // STREAMING SUPPORT
  // ==========================================================================

  /**
   * Streaming-Ausführung für lange Antworten
   * @param {Object} task - Task-Objekt
   * @returns {AsyncGenerator} Stream von Chunks
   */
  async *executeStream(task) {
    const streamId = this._generateId();
    const abortController = new AbortController();

    this._activeStreams.set(streamId, {
      id: streamId,
      controller: abortController,
      startTime: Date.now(),
      chunks: []
    });

    this.emit('stream:start', { agentId: this.id, streamId, taskId: task.id });

    try {
      const prompt = this.buildPrompt(task);

      // Streaming-Antwort (in Produktion: echtes LLM-Streaming)
      const fullResponse = await this._executeWithRetry(task, {
        id: streamId,
        abortController
      });

      // Response in Chunks aufteilen
      const chunkSize = this.settings.streaming.chunkSize;
      const text = fullResponse.result || '';

      for (let i = 0; i < text.length; i += chunkSize) {
        if (abortController.signal.aborted) break;

        const chunk = text.slice(i, i + chunkSize);
        this._activeStreams.get(streamId)?.chunks.push(chunk);

        yield {
          type: 'chunk',
          content: chunk,
          index: Math.floor(i / chunkSize),
          done: i + chunkSize >= text.length
        };

        await this._sleep(this.settings.streaming.flushInterval);
      }

      // Finale Metadaten
      yield {
        type: 'metadata',
        content: fullResponse.metadata,
        done: true
      };

      this.emit('stream:complete', {
        agentId: this.id,
        streamId,
        totalChunks: Math.ceil(text.length / chunkSize)
      });

    } catch (error) {
      this.emit('stream:error', { agentId: this.id, streamId, error: error.message });
      yield { type: 'error', content: error.message, done: true };
    } finally {
      this._activeStreams.delete(streamId);
    }
  }

  /**
   * Stream abbrechen
   */
  cancelStream(streamId) {
    const stream = this._activeStreams.get(streamId);
    if (stream) {
      stream.controller.abort();
      this._activeStreams.delete(streamId);
      this.emit('stream:cancelled', { agentId: this.id, streamId });
      return true;
    }
    return false;
  }

  // ==========================================================================
  // BATCH PROCESSING
  // ==========================================================================

  /**
   * Task zur Batch-Queue hinzufügen
   * @param {Object} task - Task-Objekt
   * @returns {Promise} Wird resolved wenn Task fertig ist
   */
  async executeBatch(task) {
    return new Promise((resolve, reject) => {
      const batchItem = {
        id: this._generateId(),
        task,
        resolve,
        reject,
        addedAt: Date.now()
      };

      this._batchQueue.push(batchItem);
      this.emit('batch:queued', {
        agentId: this.id,
        taskId: batchItem.id,
        queueSize: this._batchQueue.length
      });

      // Timer starten wenn nicht aktiv
      if (!this._batchTimer && !this._batchProcessing) {
        this._batchTimer = setTimeout(() => {
          this._processBatch();
        }, this.settings.batch.maxWaitMs);
      }

      // Sofort verarbeiten wenn Queue voll
      if (this._batchQueue.length >= this.settings.batch.maxSize) {
        clearTimeout(this._batchTimer);
        this._batchTimer = null;
        this._processBatch();
      }
    });
  }

  async _processBatch() {
    if (this._batchProcessing || this._batchQueue.length === 0) return;

    this._batchProcessing = true;
    const batch = this._batchQueue.splice(0, this.settings.batch.maxSize);

    this.emit('batch:processing', {
      agentId: this.id,
      batchSize: batch.length
    });

    // Parallel mit Concurrency-Limit
    const concurrency = this.settings.batch.concurrency;
    const results = [];

    for (let i = 0; i < batch.length; i += concurrency) {
      const chunk = batch.slice(i, i + concurrency);
      const chunkResults = await Promise.allSettled(
        chunk.map(item => this.execute(item.task))
      );

      chunkResults.forEach((result, idx) => {
        const item = chunk[idx];
        if (result.status === 'fulfilled') {
          item.resolve(result.value);
        } else {
          item.reject(result.reason);
        }
        results.push({ id: item.id, status: result.status });
      });
    }

    this.emit('batch:complete', {
      agentId: this.id,
      results,
      remainingQueue: this._batchQueue.length
    });

    this._batchProcessing = false;

    // Nächsten Batch schedulen wenn Queue nicht leer
    if (this._batchQueue.length > 0) {
      this._batchTimer = setTimeout(() => {
        this._processBatch();
      }, this.settings.batch.maxWaitMs);
    }
  }

  async _flushBatch() {
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }
    await this._processBatch();
  }

  // ==========================================================================
  // FEEDBACK & PROMPT-OPTIMIERUNG
  // ==========================================================================

  /**
   * Feedback für einen Task erfassen
   * @param {string} taskId - Task-ID
   * @param {Object} feedback - Feedback-Daten
   */
  recordFeedback(taskId, feedback) {
    if (!this.settings.feedback.enabled) return;

    const task = this._taskIndex.get(taskId);
    if (!task) {
      this.emit('feedback:error', { agentId: this.id, taskId, error: 'Task not found' });
      return;
    }

    const feedbackEntry = {
      taskId,
      taskType: task.type,
      promptHash: this._hashPrompt(task.prompt),
      rating: feedback.rating,
      comments: feedback.comments,
      corrections: feedback.corrections,
      timestamp: Date.now()
    };

    this._feedbackStore.ratings.push(feedbackEntry);
    this._analytics.feedbackScores.push(feedback.rating);

    // Prompt-Performance tracken
    const promptKey = feedbackEntry.promptHash;
    if (!this._analytics.promptPerformance.has(promptKey)) {
      this._analytics.promptPerformance.set(promptKey, {
        count: 0,
        totalRating: 0,
        avgRating: 0
      });
    }

    const perf = this._analytics.promptPerformance.get(promptKey);
    perf.count++;
    perf.totalRating += feedback.rating;
    perf.avgRating = perf.totalRating / perf.count;

    this.emit('feedback:recorded', { agentId: this.id, taskId, rating: feedback.rating });

    // Prompt-Optimierung triggern wenn genug Samples
    if (this._feedbackStore.ratings.length >= this.settings.feedback.minSamples) {
      this._optimizePrompts();
    }
  }

  /**
   * Automatische Prompt-Optimierung basierend auf Feedback
   */
  _optimizePrompts() {
    const taskTypes = new Map();

    // Feedback nach Task-Type gruppieren
    for (const entry of this._feedbackStore.ratings) {
      if (!taskTypes.has(entry.taskType)) {
        taskTypes.set(entry.taskType, []);
      }
      taskTypes.get(entry.taskType).push(entry);
    }

    // Beste Prompts pro Task-Type finden
    for (const [taskType, entries] of taskTypes) {
      const promptRatings = new Map();

      for (const entry of entries) {
        if (!promptRatings.has(entry.promptHash)) {
          promptRatings.set(entry.promptHash, { total: 0, count: 0 });
        }
        const pr = promptRatings.get(entry.promptHash);
        pr.total += entry.rating;
        pr.count++;
      }

      // Besten Prompt finden
      let bestPrompt = null;
      let bestAvg = 0;

      for (const [hash, data] of promptRatings) {
        const avg = data.total / data.count;
        if (avg > bestAvg && data.count >= 3) {
          bestAvg = avg;
          bestPrompt = hash;
        }
      }

      if (bestPrompt) {
        this._feedbackStore.optimalPrompts.set(taskType, {
          promptHash: bestPrompt,
          avgRating: bestAvg,
          sampleCount: promptRatings.get(bestPrompt).count
        });

        this.emit('prompt:optimized', {
          agentId: this.id,
          taskType,
          avgRating: bestAvg
        });
      }
    }
  }

  // ==========================================================================
  // CORE EXECUTION
  // ==========================================================================

  async execute(task) {
    if (this._isShuttingDown) {
      throw new Error('Agent is shutting down');
    }

    const taskContext = {
      id: task.id || this._generateId(),
      startTime: Date.now(),
      abortController: new AbortController()
    };

    this._activeRequests++;
    this._analytics.totalTasks++;

    // Timeout
    const timeoutId = setTimeout(() => {
      taskContext.abortController.abort();
    }, this.settings.timeout.request);

    this.emit('task:start', { agentId: this.id, taskId: taskContext.id });

    try {
      // Rate Limiting prüfen
      if (!this._consumeRateLimitToken()) {
        throw new Error('Rate limit exceeded');
      }

      // Circuit Breaker prüfen
      this._checkCircuitBreaker();

      // Prompt bauen
      const prompt = this.buildPrompt(task);

      // Execution mit Retry
      const result = await this._executeWithRetry(task, taskContext);

      // Erfolg tracken
      this._recordSuccess(taskContext, result);
      this._analytics.successfulTasks++;

      const latency = Date.now() - taskContext.startTime;
      this._analytics.totalLatency += latency;
      this._analytics.avgLatency = this._analytics.totalLatency / this._analytics.successfulTasks;

      this.emit('task:complete', {
        agentId: this.id,
        taskId: taskContext.id,
        latency
      });

      return result;

    } catch (error) {
      this._recordFailure(taskContext, error);
      this._analytics.failedTasks++;

      this.emit('task:error', {
        agentId: this.id,
        taskId: taskContext.id,
        error: error.message
      });

      throw error;
    } finally {
      clearTimeout(timeoutId);
      this._activeRequests--;
    }
  }

  async _executeWithRetry(task, context) {
    const { maxAttempts, baseDelay, maxDelay, jitterFactor } = this.settings.retry;
    let lastError;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = this._calculateBackoff(attempt, baseDelay, maxDelay, jitterFactor);
        await this._sleep(delay);
        this.emit('task:retry', { agentId: this.id, taskId: context.id, attempt });
      }

      try {
        return await this._executeWithFallback(task, context.abortController.signal);
      } catch (error) {
        lastError = error;

        if (this._isNonRetryableError(error)) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  async _executeWithFallback(task, signal) {
    const prompt = this.buildPrompt(task);

    try {
      const result = await this._callProvider(this.primary, prompt, signal);
      return this._formatResult(task, result, this.primary);
    } catch (primaryError) {
      this.emit('provider:failure', {
        agentId: this.id,
        provider: this.primary.provider,
        error: primaryError.message
      });

      if (this.fallback) {
        try {
          const result = await this._callProvider(this.fallback, prompt, signal);
          return this._formatResult(task, result, this.fallback, true);
        } catch (fallbackError) {
          this.emit('provider:failure', {
            agentId: this.id,
            provider: this.fallback.provider,
            error: fallbackError.message
          });
          throw fallbackError;
        }
      }

      throw primaryError;
    }
  }

  async _callProvider(provider, prompt, signal) {
    // Integration mit providers.js
    try {
      const { complete } = require('../providers');
      const messages = [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ];

      const content = await complete(
        provider.provider,
        provider.model,
        messages,
        provider.config || {}
      );

      return content;
    } catch (error) {
      throw error;
    }
  }

  // ==========================================================================
  // CIRCUIT BREAKER
  // ==========================================================================

  _checkCircuitBreaker() {
    if (!this.settings.circuitBreaker.enabled) return;

    const now = Date.now();

    switch (this._circuitState) {
      case CIRCUIT_STATES.OPEN:
        if (now - this._lastFailure >= this.settings.circuitBreaker.resetTimeout) {
          this._transitionCircuit(CIRCUIT_STATES.HALF_OPEN);
        } else {
          throw new Error('Circuit breaker is OPEN');
        }
        break;

      case CIRCUIT_STATES.HALF_OPEN:
        if (this._halfOpenAttempts >= this.settings.circuitBreaker.halfOpenMaxAttempts) {
          throw new Error('Circuit breaker is HALF_OPEN - max attempts reached');
        }
        this._halfOpenAttempts++;
        break;
    }
  }

  _transitionCircuit(newState) {
    const oldState = this._circuitState;
    this._circuitState = newState;

    if (newState === CIRCUIT_STATES.CLOSED) {
      this._failureCount = 0;
      this._halfOpenAttempts = 0;
    }

    this.emit('circuit:transition', {
      agentId: this.id,
      from: oldState,
      to: newState
    });
  }

  _recordSuccess(context, result) {
    if (this._circuitState === CIRCUIT_STATES.HALF_OPEN) {
      this._transitionCircuit(CIRCUIT_STATES.CLOSED);
    }

    this._addToHistory({
      id: context.id,
      type: 'success',
      prompt: result.prompt,
      timestamp: Date.now(),
      latency: Date.now() - context.startTime
    });

    this.emit('circuit:success', { agentId: this.id });
  }

  _recordFailure(context, error) {
    this._lastFailure = Date.now();
    this._failureCount++;

    if (this._circuitState === CIRCUIT_STATES.HALF_OPEN) {
      this._transitionCircuit(CIRCUIT_STATES.OPEN);
    } else if (this._failureCount >= this.settings.circuitBreaker.failureThreshold) {
      this._transitionCircuit(CIRCUIT_STATES.OPEN);
    }

    this._addToHistory({
      id: context.id,
      type: 'failure',
      error: error.message,
      timestamp: Date.now()
    });

    this.emit('circuit:failure', { agentId: this.id, error: error.message });
  }

  /**
   * Manueller Circuit Breaker Reset
   */
  resetCircuit() {
    this._transitionCircuit(CIRCUIT_STATES.CLOSED);
    this._failureCount = 0;
    this._lastFailure = null;
    this.emit('circuit:reset', { agentId: this.id });
  }

  // ==========================================================================
  // CANHANDLE SCORING
  // ==========================================================================

  canHandle(task) {
    const { type, content } = task;

    // Exakter Type-Match
    if (type === this.type) return 1.0;

    // Capability-Match
    if (type && this.capabilities.has(type)) return 0.9;

    // Keyword-basiertes Scoring
    if (!content) return 0;

    const lower = content.toLowerCase();
    let matchScore = 0;
    const keywordWeight = 0.15;

    for (const keyword of this.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        matchScore += keyword.length > 5 ? keywordWeight * 1.5 : keywordWeight;
      }
    }

    return Math.min(1.0, matchScore);
  }

  // ==========================================================================
  // PROMPT BUILDING (Override in subclasses)
  // ==========================================================================

  buildPrompt(task) {
    return {
      system: `You are ${this.name}. ${this.description}`,
      user: task.content
    };
  }

  _formatResult(task, result, provider, usedFallback = false) {
    return {
      taskId: task.id,
      agentId: this.id,
      result,
      provider: provider.provider,
      model: provider.model,
      usedFallback,
      metadata: {}
    };
  }

  // ==========================================================================
  // ANALYTICS
  // ==========================================================================

  getAnalytics() {
    return {
      ...this._analytics,
      avgFeedbackScore: this._analytics.feedbackScores.length > 0
        ? this._analytics.feedbackScores.reduce((a, b) => a + b, 0) / this._analytics.feedbackScores.length
        : null,
      successRate: this._analytics.totalTasks > 0
        ? this._analytics.successfulTasks / this._analytics.totalTasks
        : 0,
      circuitState: this._circuitState,
      activeRequests: this._activeRequests,
      batchQueueSize: this._batchQueue.length,
      activeStreams: this._activeStreams.size
    };
  }

  getHealth() {
    return {
      agentId: this.id,
      name: this.name,
      type: this.type,
      version: this.version,
      status: this._isShuttingDown ? 'shutting_down' : 'ready',
      circuitBreaker: this._circuitState,
      activeRequests: this._activeRequests,
      batchQueueSize: this._batchQueue.length,
      analytics: this.getAnalytics(),
      primary: this.primary,
      fallback: this.fallback
    };
  }

  resetAnalytics() {
    this._analytics = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      totalLatency: 0,
      avgLatency: 0,
      feedbackScores: [],
      promptPerformance: new Map()
    };
    this.emit('analytics:reset', { agentId: this.id });
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  _generateId() {
    return `${this.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _hashPrompt(prompt) {
    const str = JSON.stringify(prompt);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  _calculateBackoff(attempt, baseDelay, maxDelay, jitterFactor) {
    const exponential = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    const jitter = exponential * jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, exponential + jitter);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _isNonRetryableError(error) {
    const nonRetryable = ['INVALID_API_KEY', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'];
    return nonRetryable.some(code => error.message?.includes(code));
  }

  _consumeRateLimitToken() {
    this._refillRateLimitTokens();
    if (this._rateLimitTokens > 0) {
      this._rateLimitTokens--;
      return true;
    }
    return false;
  }

  _refillRateLimitTokens() {
    const now = Date.now();
    const elapsed = (now - this._lastRefill) / 1000;
    const tokensToAdd = elapsed * this.settings.rateLimit.refillRate;

    this._rateLimitTokens = Math.min(
      this.settings.rateLimit.maxTokens,
      this._rateLimitTokens + tokensToAdd
    );
    this._lastRefill = now;
  }

  _addToHistory(entry) {
    this._taskHistory.push(entry);
    this._taskIndex.set(entry.id, entry);

    // LRU: Älteste entfernen wenn Limit erreicht
    while (this._taskHistory.length > this.settings.history.maxSize) {
      const oldest = this._taskHistory.shift();
      this._taskIndex.delete(oldest.id);
    }
  }

  _cleanupHistory() {
    const cutoff = Date.now() - this.settings.history.retentionMs;
    this._taskHistory = this._taskHistory.filter(entry => {
      if (entry.timestamp < cutoff) {
        this._taskIndex.delete(entry.id);
        return false;
      }
      return true;
    });
  }
}

// Exports
BaseAgent.CIRCUIT_STATES = CIRCUIT_STATES;

module.exports = BaseAgent;
