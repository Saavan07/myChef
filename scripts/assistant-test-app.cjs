// Test-only composition. The production app never exposes a mock-provider switch.
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");
const { getPool } = require("../backend/db");
const { installUserRoutes } = require("../backend/user-routes");

async function startTestApp(connection) {
  assert.equal(process.env.DB_NAME, "mychef_local");
  assert(["127.0.0.1", "localhost"].includes(process.env.DB_HOST));
  const app = express();
  app.use(express.json());
  installUserRoutes(app, { assistant: connection });
  app.get("/app-config.js", (_req, res) =>
    res.type("application/javascript").send("window.__APP_CONFIG__ = {};"),
  );
  app.use(express.static(path.join(__dirname, "../frontend/public")));
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ detail: error.message }),
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
    pool: getPool(),
  };
}

function intent(overrides = {}) {
  return {
    action: "swap",
    date: "2026-10-26",
    recipe_id: "d2",
    max_minutes: null,
    quicker: false,
    include_ingredients: [],
    exclude_ingredients: [],
    diets: [],
    question: "",
    ...overrides,
  };
}
module.exports = { startTestApp, intent };
