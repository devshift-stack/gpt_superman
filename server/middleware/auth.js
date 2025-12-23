const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "muci-superman-secret-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

/**
 * Authentication Middleware
 * Supports: API-Key (Bearer token) and JWT
 */

// In-memory API keys store (in production: use database)
const apiKeys = new Map();
const apiKeyUsage = new Map();

// Default admin key (should be changed in production)
const ADMIN_KEY = process.env.ADMIN_API_KEY || "sk-admin-muci-superman-2024";

// Initialize with admin key
apiKeys.set(ADMIN_KEY, {
  id: "admin",
  name: "Admin Key",
  role: "admin",
  createdAt: new Date().toISOString(),
  rateLimit: 1000,
  enabled: true
});

/**
 * Generate a new API key
 */
function generateApiKey(prefix = "sk") {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let key = prefix + "-";
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

/**
 * Create a new API key
 */
function createApiKey({ name, role = "user", rateLimit = 100 }) {
  const key = generateApiKey("sk");
  const keyData = {
    id: `key-${Date.now()}`,
    name,
    role,
    rateLimit,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    usageCount: 0
  };
  apiKeys.set(key, keyData);
  return { key, ...keyData };
}

/**
 * List all API keys (without the actual key values)
 */
function listApiKeys() {
  const keys = [];
  apiKeys.forEach((data, key) => {
    keys.push({
      id: data.id,
      name: data.name,
      role: data.role,
      rateLimit: data.rateLimit,
      enabled: data.enabled,
      createdAt: data.createdAt,
      lastUsed: data.lastUsed,
      usageCount: data.usageCount,
      keyPreview: key.substring(0, 7) + "..." + key.substring(key.length - 4)
    });
  });
  return keys;
}

/**
 * Revoke an API key
 */
function revokeApiKey(keyId) {
  for (const [key, data] of apiKeys.entries()) {
    if (data.id === keyId) {
      apiKeys.delete(key);
      return true;
    }
  }
  return false;
}

/**
 * Validate API key and check rate limit
 */
function validateApiKey(key) {
  const keyData = apiKeys.get(key);
  if (!keyData) return { valid: false, error: "INVALID_API_KEY" };
  if (!keyData.enabled) return { valid: false, error: "API_KEY_DISABLED" };

  // Rate limiting per key
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const usage = apiKeyUsage.get(key) || { count: 0, windowStart: now };

  if (now - usage.windowStart > windowMs) {
    // Reset window
    usage.count = 1;
    usage.windowStart = now;
  } else {
    usage.count++;
  }

  if (usage.count > keyData.rateLimit) {
    return { valid: false, error: "RATE_LIMIT_EXCEEDED" };
  }

  apiKeyUsage.set(key, usage);

  // Update usage stats
  keyData.lastUsed = new Date().toISOString();
  keyData.usageCount++;

  return { valid: true, keyData };
}

/**
 * Generate JWT token
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return { valid: true, decoded: jwt.verify(token, JWT_SECRET) };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Auth Middleware - Protects routes
 * Accepts: Bearer <api-key> or Bearer <jwt-token>
 */
function authMiddleware(options = {}) {
  const { required = true, roles = [] } = options;

  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    // No auth header
    if (!authHeader) {
      if (!required) {
        req.auth = { authenticated: false };
        return next();
      }
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authorization header required" });
    }

    // Parse Bearer token
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ error: "INVALID_AUTH_FORMAT", message: "Use: Bearer <token>" });
    }

    const token = parts[1];

    // Try API key first (starts with sk-)
    if (token.startsWith("sk-")) {
      const result = validateApiKey(token);
      if (!result.valid) {
        return res.status(401).json({ error: result.error });
      }

      // Check role
      if (roles.length > 0 && !roles.includes(result.keyData.role)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Insufficient permissions" });
      }

      req.auth = {
        authenticated: true,
        type: "api-key",
        role: result.keyData.role,
        keyId: result.keyData.id,
        keyName: result.keyData.name
      };
      return next();
    }

    // Try JWT token
    const jwtResult = verifyToken(token);
    if (!jwtResult.valid) {
      return res.status(401).json({ error: "INVALID_TOKEN", message: jwtResult.error });
    }

    // Check role
    if (roles.length > 0 && !roles.includes(jwtResult.decoded.role)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Insufficient permissions" });
    }

    req.auth = {
      authenticated: true,
      type: "jwt",
      role: jwtResult.decoded.role,
      userId: jwtResult.decoded.userId,
      ...jwtResult.decoded
    };
    return next();
  };
}

/**
 * Admin-only middleware
 */
function adminOnly() {
  return authMiddleware({ required: true, roles: ["admin"] });
}

/**
 * Optional auth - doesn't fail if no auth provided
 */
function optionalAuth() {
  return authMiddleware({ required: false });
}

module.exports = {
  authMiddleware,
  adminOnly,
  optionalAuth,
  generateApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  validateApiKey,
  generateToken,
  verifyToken,
  JWT_SECRET
};
