const NodeCache = require("node-cache");

class CacheService {
  constructor({ enabled }) {
    this.enabled = !!enabled;
    this.cache = new NodeCache({ stdTTL: 60 * 10, checkperiod: 60 });
    this.hits = 0;
    this.misses = 0;
  }

  buildKey(parts) {
    return `emir:cache:${parts.join(":")}`;
  }

  get(parts) {
    if (!this.enabled) return null;
    const key = this.buildKey(parts);
    const value = this.cache.get(key);
    if (value === undefined) {
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return value;
  }

  set(parts, value, ttlSeconds) {
    if (!this.enabled) return;
    const key = this.buildKey(parts);
    this.cache.set(key, value, ttlSeconds || 600);
  }

  stats() {
    return {
      enabled: this.enabled,
      keys: this.cache.keys().length,
      hits: this.hits,
      misses: this.misses
    };
  }

  invalidate(pattern) {
    const allKeys = this.cache.keys();
    let deleted = 0;
    const prefix = pattern.replace("*", "");
    for (const k of allKeys) {
      if (!pattern || pattern === "*" || k.startsWith(prefix)) {
        if (this.cache.del(k) > 0) deleted += 1;
      }
    }
    return { deleted };
  }
}

module.exports = { CacheService };
