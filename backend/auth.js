const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { getPool } = require("./db");

const scrypt = promisify(crypto.scrypt);
const cookieName = "mychef_session";
const lifetime = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
const digest = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$32768$8$3$${salt}$${key.toString("hex")}`;
}

async function verifyPassword(password, encoded) {
  const parts = String(encoded).split("$");
  if (parts.length !== 6 || parts.slice(0, 4).join("$") !== "scrypt$32768$8$3")
    return false;
  if (!/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5]))
    return false;
  const key = await scrypt(password, parts[4], 64, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  });
  return crypto.timingSafeEqual(key, Buffer.from(parts[5], "hex"));
}

function sessionToken(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token || "") ? token : null;
}

async function revokeSession(req, res) {
  const token = sessionToken(req);
  if (token)
    await getPool().execute("DELETE FROM sessions WHERE token_hash = ?", [
      digest(token),
    ]);
  res.clearCookie(cookieName, cookieOptions);
}

async function createSession(req, res, userId) {
  await revokeSession(req, res);
  await getPool().execute("DELETE FROM sessions WHERE expires_at <= NOW()");
  const token = crypto.randomBytes(32).toString("hex");
  await getPool().execute(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    [digest(token), userId, new Date(Date.now() + lifetime)],
  );
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: lifetime });
}

async function authenticate(req, res, next) {
  const token = sessionToken(req);
  if (!token)
    return res.status(401).json({ detail: "Please sign in to continue." });
  const [rows] = await getPool().execute(
    "SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > NOW()",
    [digest(token)],
  );
  if (!rows.length)
    return res
      .status(401)
      .json({ detail: "Your session has expired. Please sign in again." });
  req.account = rows[0];
  res.set("Cache-Control", "no-store");
  next();
}

function owner(req, res, next) {
  if (req.params.userId !== req.account.id)
    return res
      .status(403)
      .json({ detail: "This account belongs to another user." });
  next();
}

// A bounded, single-process throttle for this local milestone. Shared hosting needs a shared limiter.
const attempts = new Map();
function limitAuthentication(req, res, next) {
  const now = Date.now();
  for (const [key, value] of attempts)
    if (value.until <= now) attempts.delete(key);
  const key = req.ip;
  const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (++entry.count > 30 || attempts.size > 10000)
    return res
      .status(429)
      .json({
        detail: "Too many sign-in attempts. Please try again in 15 minutes.",
      });
  attempts.set(key, entry);
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  authenticate,
  owner,
  createSession,
  revokeSession,
  limitAuthentication,
};
