const fs = require("node:fs/promises");
const path = require("node:path");
const { getPool } = require("./db");
const { hashPassword } = require("./auth");
const { seedRecipes } = require("./seedRecipes");

async function migrate() {
  const db = await getPool().getConnection();
  try {
    const [[lock]] = await db.query(
      "SELECT GET_LOCK('mychef_schema_migration', 30) AS acquired",
    );
    if (!lock.acquired)
      throw new Error(
        "Another migration is running. Try starting again shortly.",
      );
    const schema = await fs.readFile(
      path.join(__dirname, "schema.sql"),
      "utf8",
    );
    for (const statement of schema.split(";").filter((s) => s.trim()))
      await db.query(statement);
    await db.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(64) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    );
    await db.query(
      `CREATE TABLE IF NOT EXISTS sessions (token_hash CHAR(64) PRIMARY KEY, user_id CHAR(36) COLLATE utf8mb4_unicode_ci NOT NULL, expires_at DATETIME(3) NOT NULL, INDEX (expires_at), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    const [columns] = await db.query(
      "SHOW COLUMNS FROM recipes LIKE 'base_servings'",
    );
    if (!columns.length)
      await db.query("ALTER TABLE recipes ADD COLUMN base_servings INT NULL");
    const [done] = await db.query(
      "SELECT version FROM schema_migrations WHERE version = '20261024-cooking-week'",
    );
    if (!done.length) {
      // Retain the prior recipe rows before correcting the bundled catalog.
      await db.query(
        "CREATE TABLE IF NOT EXISTS recipe_baseline_archive LIKE recipes",
      );
      await db.beginTransaction(); // Apply the catalog changes and version marker atomically.
      for (const r of seedRecipes) {
        await db.execute(
          "INSERT IGNORE INTO recipe_baseline_archive SELECT * FROM recipes WHERE id = ?",
          [r.id],
        );
        await db.execute(
          `INSERT INTO recipes (id, name, ingredients, steps, dietary_tags, meal_type, prep_time_minutes, base_servings)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), ingredients = VALUES(ingredients), steps = VALUES(steps), dietary_tags = VALUES(dietary_tags), meal_type = VALUES(meal_type), prep_time_minutes = VALUES(prep_time_minutes), base_servings = VALUES(base_servings)`,
          [
            r.id,
            r.name,
            JSON.stringify(r.ingredients),
            JSON.stringify(r.steps),
            JSON.stringify(r.dietary_tags),
            r.meal_type,
            r.prep_time_minutes,
            r.base_servings,
          ],
        );
      }
      await db.execute(
        "INSERT INTO schema_migrations (version) VALUES ('20261024-cooking-week')",
      );
      await db.commit();
    }
    // Upgrade legacy passwords before accepting requests; never keep a plaintext login fallback.
    const [users] = await db.query("SELECT id, password FROM users");
    for (const user of users) {
      if (
        !/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(
          user.password,
        )
      ) {
        await db.execute(
          "UPDATE users SET password = ? WHERE id = ? AND password = ?",
          [await hashPassword(user.password), user.id, user.password],
        );
      }
    }
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.query("SELECT RELEASE_LOCK('mychef_schema_migration')");
    db.release();
  }
}
module.exports = { migrate };
