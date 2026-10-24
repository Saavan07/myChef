// Run only on the disposable local database before starting the API.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const { getPool } = require("../backend/db");
const { migrate } = require("../backend/migrate");
const { verifyPassword } = require("../backend/auth");
assert(["localhost", "127.0.0.1"].includes(process.env.DB_HOST));
assert.equal(process.env.DB_NAME, "mychef_local");
const db = getPool();
const id = randomUUID();
tryRun().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
async function tryRun() {
  try {
    const schema = await fs.readFile(
      new URL("../backend/schema.sql", `file://${__filename}`),
      "utf8",
    );
    for (const statement of schema.split(";").filter((s) => s.trim()))
      await db.query(statement);
    await db.execute(
      `INSERT INTO users (id, username, password, dietary_preferences, dietary_restrictions, pantry, favorites, shopping_list_items, meal_plans, meal_history) VALUES (?, ?, ?, '[]', '[]', '["rice"]', '["r7"]', '[]', '[{"id":"old-plan","recipe_ids":["r7"]}]', '["r7"]')`,
      [id, `migration-${id.slice(0, 8)}`, "legacy-test-password"],
    );
    await db.execute(
      `INSERT IGNORE INTO recipes (id, name, ingredients, steps, dietary_tags, meal_type, prep_time_minutes) VALUES ('r7', 'Oatmeal', '["1 cup milk", "1 tbsp honey"]', '[]', '["vegan"]', 'breakfast', 10)`,
    );
    await migrate();
    await migrate();
    const [[user]] = await db.execute("SELECT * FROM users WHERE id = ?", [id]);
    assert.notEqual(user.password, "legacy-test-password");
    assert(await verifyPassword("legacy-test-password", user.password));
    assert.deepEqual(user.pantry, ["rice"]);
    assert.deepEqual(user.favorites, ["r7"]);
    assert.equal(user.meal_plans[0].id, "old-plan");
    const [[oats]] = await db.query("SELECT * FROM recipes WHERE id = 'r7'");
    assert(!oats.dietary_tags.includes("vegan"));
    assert.equal(oats.base_servings, 2);
    const [[archive]] = await db.query(
      "SELECT * FROM recipe_baseline_archive WHERE id = 'r7'",
    );
    assert(archive.dietary_tags.includes("vegan"));
    console.log(
      "PASS: legacy passwords upgraded, pantry/favorites/plans preserved, catalog archived and corrected, repeated migration safe.",
    );
  } finally {
    await db.execute("DELETE FROM users WHERE id = ?", [id]);
    await db.end();
  }
}
