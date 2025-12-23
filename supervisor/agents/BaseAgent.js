/**
 * BaseAgent - Abstract base class for all specialized agents
 * Adapted to use providers.js for LLM calls
 */

const { v4: uuidv4 } = require('uuid');
const { complete, getAvailableProviders } = require('../src/providers');

class BaseAgent {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.description = config.description;
    
    // LLM Configuration
    this.primaryConfig = config.primary;
    this.fallbackConfig = config.fallback;
    
    // Capabilities & Keywords
    this.capabilities = config.capabilities || [];
    this.keywords = config.keywords || [];
    
    // Settings
    this.settings = config.settings || {};
    this.costs = config.costs || { input: 0, output: 0 };
    
    // State
    this.status = 'idle';
    this.currentTasks = new Map();
    this.taskHistory = [];
    this.metrics = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      totalTokensInput: 0,
      totalTokensOutput: 0,
      totalCost: 0,
      averageLatency: 0,
    };
    
    // Circuit Breaker State (simplified)
    this.circuitState = 'closed';
    this.failureCount = 0;
    this.lastFailure = null;
    this.circuitResetTimeout = 30000;
    this.failureThreshold = 3;
  }
  
  /**
   * Initialize agent
   */
  async initialize() {
    console.log(`[agent] Initializing ${this.name}`);
    this.status = 'ready';
    return true;
  }
  
  /**
   * Check circuit breaker state
   */
  checkCircuit() {
    if (this.circuitState === 'open') {
      const timeSinceFailure = Date.now() - this.lastFailure;
      if (timeSinceFailure > this.circuitResetTimeout) {
        this.circuitState = 'half-open';
        console.log(`[circuit] ${this.name} circuit half-open, testing...`);
      }
    }
    return this.circuitState !== 'open';
  }
  
  /**
   * Record success - reset circuit breaker
   */
  recordSuccess() {
    this.failureCount = 0;
    this.circuitState = 'closed';
  }
  
  /**
   * Record failure - potentially open circuit
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailure = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.circuitState = 'open';
      console.log(`[circuit] ${this.name} circuit OPEN after ${this.failureCount} failures`);
    }
  }
  
  /**
   * Check if agent can handle a task based on keywords
   */
  canHandle(task) {
    const content = (task.content || '').toLowerCase();
    const type = (task.type || '').toLowerCase();
    
    if (type === this.type) return 1.0;
    
    let matchCount = 0;
    for (const keyword of this.keywords) {
      if (content.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }
    
    return this.keywords.length > 0 ? matchCount / this.keywords.length : 0;
  }
  
  /**
   * Execute a task
   */
  async execute(task) {
    const taskId = task.id || uuidv4();
    const startTime = Date.now();
    
    console.log(`[agent] ${this.name} executing task ${taskId}`);
    
    // Check circuit breaker
    if (!this.checkCircuit()) {
      throw new Error(`Circuit breaker open for ${this.name}`);
    }
    
    this.status = 'busy';
    this.currentTasks.set(taskId, { task, startTime });
    this.metrics.totalTasks++;
    
    try {
      const result = await this.executeWithFallback(task);
      
      const latency = Date.now() - startTime;
      this.updateMetrics(result, latency, true);
      this.recordSuccess();
      
      this.taskHistory.push({
        taskId,
        type: task.type,
        success: true,
        latency,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`[agent] ${this.name} completed task in ${latency}ms`);
      
      return {
        success: true,
        taskId,
        agentId: this.id,
        agentName: this.name,
        result: result.content,
        provider: result.provider,
        model: result.model,
        usage: result.usage,
        latency,
        fallbackUsed: result.fallbackUsed || false,
      };
      
    } catch (error) {
      const latency = Date.now() - startTime;
      this.metrics.failedTasks++;
      this.recordFailure();
      
      this.taskHistory.push({
        taskId,
        type: task.type,
        success: false,
        error: error.message,
        latency,
        timestamp: new Date().toISOString(),
      });
      
      console.error(`[agent] ${this.name} failed: ${error.message}`);
      throw error;
      
    } finally {
      this.currentTasks.delete(taskId);
      this.status = this.currentTasks.size > 0 ? 'busy' : 'ready';
    }
  }
  
  /**
   * Execute with primary/fallback using providers.js
   */
  async executeWithFallback(task) {
    const prompt = this.buildPrompt(task);
    const messages = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ];
    
    // Try primary provider
    try {
      const content = await complete(
        this.primaryConfig.provider,
        this.primaryConfig.model,
        messages,
        this.primaryConfig.config || {}
      );
      
      return {
        content,
        provider: this.primaryConfig.provider,
        model: this.primaryConfig.model,
        usage: { input_tokens: 0, output_tokens: 0 }, // providers.js doesn't return usage yet
        fallbackUsed: false,
      };
    } catch (primaryError) {
      console.warn(`[agent] ${this.name} primary failed: ${primaryError.message}`);
      
      // Try fallback provider
      try {
        const content = await complete(
          this.fallbackConfig.provider,
          this.fallbackConfig.model,
          messages,
          this.fallbackConfig.config || {}
        );
        
        return {
          content,
          provider: this.fallbackConfig.provider,
          model: this.fallbackConfig.model,
          usage: { input_tokens: 0, output_tokens: 0 },
          fallbackUsed: true,
        };
      } catch (fallbackError) {
        console.error(`[agent] ${this.name} fallback also failed: ${fallbackError.message}`);
        throw fallbackError;
      }
    }
  }
  
  /**
   * Build prompt for the task (override in child classes)
   */
  buildPrompt(task) {
    return {
      system: 'You are a helpful assistant.',
      user: task.content || ''
    };
  }
  
  /**
   * Update metrics after task completion
   */
  updateMetrics(result, latency, success) {
    if (success) {
      this.metrics.successfulTasks++;
    }
    
    if (result.usage) {
      this.metrics.totalTokensInput += result.usage.input_tokens || 0;
      this.metrics.totalTokensOutput += result.usage.output_tokens || 0;
      
      const inputCost = (result.usage.input_tokens || 0) / 1000000 * this.costs.input;
      const outputCost = (result.usage.output_tokens || 0) / 1000000 * this.costs.output;
      this.metrics.totalCost += inputCost + outputCost;
    }
    
    const totalCompleted = this.metrics.successfulTasks + this.metrics.failedTasks;
    if (totalCompleted > 0) {
      this.metrics.averageLatency = (
        (this.metrics.averageLatency * (totalCompleted - 1) + latency) / totalCompleted
      );
    }
  }
  
  /**
   * Get agent health status
   */
  getHealth() {
    return {
      agentId: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      status: this.status,
      circuitBreaker: this.circuitState,
      currentTasks: this.currentTasks.size,
      metrics: {
        totalTasks: this.metrics.totalTasks,
        successfulTasks: this.metrics.successfulTasks,
        failedTasks: this.metrics.failedTasks,
        successRate: this.metrics.totalTasks > 0 
          ? ((this.metrics.successfulTasks / this.metrics.totalTasks) * 100).toFixed(1) + '%'
          : 'N/A',
        averageLatency: Math.round(this.metrics.averageLatency) + 'ms',
        totalTokensUsed: this.metrics.totalTokensInput + this.metrics.totalTokensOutput,
        totalCost: '$' + this.metrics.totalCost.toFixed(4),
      },
      primary: {
        provider: this.primaryConfig.provider,
        model: this.primaryConfig.model,
      },
      fallback: {
        provider: this.fallbackConfig.provider,
        model: this.fallbackConfig.model,
      },
      capabilities: this.capabilities,
    };
  }
  
  /**
   * Get agent info
   */
  getInfo() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      status: this.status,
      capabilities: this.capabilities,
      keywords: this.keywords,
      primary: this.primaryConfig,
      fallback: this.fallbackConfig,
      settings: this.settings,
    };
  }
}

module.exports = BaseAgent;
