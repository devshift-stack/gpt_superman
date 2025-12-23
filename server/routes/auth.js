const express = require("express");
const {
  authMiddleware,
  adminOnly,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  generateToken
} = require("../middleware/auth");

// In-memory users (in production: use database)
const users = new Map();

// Default admin user
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "muci-superman-2024";

users.set(ADMIN_USER, {
  id: "user-admin",
  username: ADMIN_USER,
  password: ADMIN_PASS, // In production: use bcrypt hash
  role: "admin",
  createdAt: new Date().toISOString()
});

function createAuthRouter() {
  const router = express.Router();

  /**
   * POST /auth/login
   * Login with username/password, returns JWT token
   */
  router.post("/login", (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: "MISSING_CREDENTIALS", message: "Username and password required" });
    }

    const user = users.get(username);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid username or password" });
    }

    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  });

  /**
   * GET /auth/me
   * Get current user info (requires auth)
   */
  router.get("/me", authMiddleware(), (req, res) => {
    res.json({
      ok: true,
      auth: req.auth
    });
  });

  /**
   * POST /auth/keys
   * Create a new API key (admin only)
   */
  router.post("/keys", adminOnly(), (req, res) => {
    const { name, role = "user", rateLimit = 100 } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: "MISSING_NAME", message: "API key name required" });
    }

    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "INVALID_ROLE", message: "Role must be 'user' or 'admin'" });
    }

    const keyData = createApiKey({ name, role, rateLimit });

    res.status(201).json({
      ok: true,
      message: "API key created. Save this key - it won't be shown again!",
      apiKey: keyData
    });
  });

  /**
   * GET /auth/keys
   * List all API keys (admin only)
   */
  router.get("/keys", adminOnly(), (_req, res) => {
    const keys = listApiKeys();
    res.json({
      ok: true,
      count: keys.length,
      keys
    });
  });

  /**
   * DELETE /auth/keys/:id
   * Revoke an API key (admin only)
   */
  router.delete("/keys/:id", adminOnly(), (req, res) => {
    const { id } = req.params;
    const success = revokeApiKey(id);

    if (!success) {
      return res.status(404).json({ error: "KEY_NOT_FOUND", message: "API key not found" });
    }

    res.json({
      ok: true,
      message: "API key revoked",
      keyId: id
    });
  });

  /**
   * POST /auth/users
   * Create a new user (admin only)
   */
  router.post("/users", adminOnly(), (req, res) => {
    const { username, password, role = "user" } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "Username and password required" });
    }

    if (users.has(username)) {
      return res.status(409).json({ error: "USER_EXISTS", message: "Username already exists" });
    }

    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "INVALID_ROLE", message: "Role must be 'user' or 'admin'" });
    }

    const user = {
      id: `user-${Date.now()}`,
      username,
      password, // In production: bcrypt.hash(password, 10)
      role,
      createdAt: new Date().toISOString()
    };

    users.set(username, user);

    res.status(201).json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  });

  /**
   * GET /auth/users
   * List all users (admin only)
   */
  router.get("/users", adminOnly(), (_req, res) => {
    const userList = [];
    users.forEach((user) => {
      userList.push({
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt
      });
    });

    res.json({
      ok: true,
      count: userList.length,
      users: userList
    });
  });

  /**
   * DELETE /auth/users/:username
   * Delete a user (admin only, cannot delete self)
   */
  router.delete("/users/:username", adminOnly(), (req, res) => {
    const { username } = req.params;

    if (!users.has(username)) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    // Prevent deleting yourself
    if (req.auth.type === "jwt" && req.auth.username === username) {
      return res.status(400).json({ error: "CANNOT_DELETE_SELF", message: "Cannot delete your own account" });
    }

    users.delete(username);

    res.json({
      ok: true,
      message: "User deleted",
      username
    });
  });

  return router;
}

module.exports = { createAuthRouter };
