const { randomUUID } = require("node:crypto");
const { getPool } = require("./db");
const auth = require("./auth");
const d = require("./meal-domain");
const k = require("./kitchen-domain");

const fields = [
  "dietary_preferences",
  "dietary_restrictions",
  "pantry",
  "favorites",
  "shopping_list_items",
  "meal_plans",
  "meal_history",
];
function parse(value) {
  return typeof value === "string" ? JSON.parse(value) : value || [];
}
function mapUser(row) {
  const user = { id: row.id, username: row.username };
  for (const field of fields) user[field] = parse(row[field]);
  user.pantry = user.pantry.map((item, index) =>
    typeof item === "string"
      ? { id: `legacy-${index}`, name: item, quantity: null, unit: "count" }
      : item,
  );
  user.shopping_list_items = user.shopping_list_items.map((item) => ({
    ...item,
    unit: d.normalizeUnit(item.unit),
  }));
  return user;
}
function mapRecipe(row) {
  return {
    ...row,
    ingredients: parse(row.ingredients),
    steps: parse(row.steps),
    dietary_tags: parse(row.dietary_tags),
    base_servings: row.base_servings,
  };
}
async function recipes(db = getPool()) {
  const [rows] = await db.query("SELECT * FROM recipes ORDER BY id");
  return rows.map(mapRecipe);
}
async function readUser(id, db = getPool(), lock = false) {
  const [rows] = await db.execute(
    `SELECT * FROM users WHERE id = ?${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  if (!rows.length) throw new d.InputError("Account not found.", 404);
  return mapUser(rows[0]);
}
async function mutate(id, changedFields, operation) {
  const db = await getPool().getConnection();
  try {
    await db.beginTransaction();
    const user = await readUser(id, db, true);
    const result = await operation(user, db);
    if (changedFields.some((field) => !fields.includes(field)))
      throw new Error("Invalid update field");
    await db.execute(
      `UPDATE users SET ${changedFields.map((field) => `${field} = ?`).join(", ")} WHERE id = ?`,
      [...changedFields.map((field) => JSON.stringify(user[field])), id],
    );
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
function installUserRoutes(app) {
  app.post("/register", auth.limitAuthentication, async (req, res) => {
    const username = d.text(req.body?.username, "Username", 40);
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(username))
      throw new d.InputError(
        "Use 3-40 letters, numbers, underscores, or hyphens for your username.",
      );
    const password = req.body?.password;
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    )
      throw new d.InputError("Use a password between 12 and 128 characters.");
    const id = randomUUID();
    try {
      await getPool().execute(
        `INSERT INTO users (id, username, password, dietary_preferences, dietary_restrictions, pantry, favorites, shopping_list_items, meal_plans, meal_history) VALUES (?, ?, ?, '[]', '[]', '[]', '[]', '[]', '[]', '[]')`,
        [id, username, await auth.hashPassword(password)],
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY")
        throw new d.InputError("That username is already taken.", 409);
      throw error;
    }
    await auth.createSession(req, res, id);
    res.status(201).json({ user_id: id, username });
  });
  app.post("/login", auth.limitAuthentication, async (req, res) => {
    const username = d.text(req.body?.username, "Username", 40);
    const password = req.body?.password;
    if (typeof password !== "string" || password.length > 128)
      throw new d.InputError("Enter a valid password.");
    const [rows] = await getPool().execute(
      "SELECT id, username, password FROM users WHERE username = ?",
      [username],
    );
    const user = rows[0];
    // Use the same expensive verification even when the username does not exist.
    const placeholder =
      "scrypt$32768$8$3$" + "0".repeat(32) + "$" + "0".repeat(128);
    const valid = await auth.verifyPassword(
      password,
      user?.password || placeholder,
    );
    if (!user || !valid)
      throw new d.InputError("Username or password is incorrect.", 401);
    await auth.createSession(req, res, user.id);
    res.json({ user_id: user.id, username: user.username });
  });
  app.get("/session", auth.authenticate, (req, res) =>
    res.json({ user_id: req.account.id, username: req.account.username }),
  );
  app.post("/logout", async (req, res) => {
    await auth.revokeSession(req, res);
    res.json({ message: "Signed out." });
  });
  app.use("/users/:userId", auth.authenticate, auth.owner);

  app.get("/recipes", async (req, res) => {
    const all = await recipes();
    res.json(
      req.query.tag
        ? all.filter((r) => r.dietary_tags.includes(req.query.tag))
        : all,
    );
  });
  app.get("/recipes/:recipeId", async (req, res) => {
    const recipe = (await recipes()).find((r) => r.id === req.params.recipeId);
    if (!recipe) throw new d.InputError("Recipe not found.", 404);
    res.json(recipe);
  });
  app.get("/dietary-options", async (_req, res) =>
    res.json({
      diets: d.diets,
      exclusions: [
        ...new Set([
          ...Object.keys(d.exclusionGroups),
          ...(await recipes()).flatMap((r) =>
            r.ingredients.map((i) => i.name).filter(Boolean),
          ),
        ]),
      ].sort(),
    }),
  );
  app.get("/users/:userId/preferences", async (req, res) => {
    const user = await readUser(req.account.id);
    res.json({
      dietary_preferences: user.dietary_preferences,
      dietary_restrictions: user.dietary_restrictions,
    });
  });
  app.post("/users/:userId/preferences", async (req, res) => {
    const settings = d.preferences(req.body || {}, await recipes());
    res.json(
      await mutate(
        req.account.id,
        ["dietary_preferences", "dietary_restrictions"],
        (user) => {
          Object.assign(user, settings);
          return settings;
        },
      ),
    );
  });
  app.get("/users/:userId/pantry", async (req, res) =>
    res.json(k.pantryResult(await readUser(req.account.id))),
  );
  app.post("/users/:userId/pantry", async (req, res) => {
    const item = d.ingredient(req.body);
    res.json(
      await mutate(req.account.id, ["pantry"], (user) => {
        if (user.pantry.length >= 200)
          throw new d.InputError(
            "Your pantry is full. Remove unused entries first.",
          );
        user.pantry = d.addPantry(user.pantry, item);
        return k.pantryResult(user);
      }),
    );
  });
  app.patch("/users/:userId/pantry/:itemId", async (req, res) =>
    res.json(
      await mutate(req.account.id, ["pantry"], (user) =>
        k.setPantryAmount(user, req.params.itemId, req.body || {}),
      ),
    ),
  );
  app.delete("/users/:userId/pantry/:itemId", async (req, res) =>
    res.json(
      await mutate(req.account.id, ["pantry"], (user) => {
        user.pantry = user.pantry.filter((i) => i.id !== req.params.itemId);
        return k.pantryResult(user);
      }),
    ),
  );
  app.get("/users/:userId/favorites", async (req, res) => {
    const user = await readUser(req.account.id);
    res.json((await recipes()).filter((r) => user.favorites.includes(r.id)));
  });
  app.post("/users/:userId/favorites/:recipeId", async (req, res) => {
    if (!(await recipes()).some((r) => r.id === req.params.recipeId))
      throw new d.InputError("Recipe not found.", 404);
    res.json(
      await mutate(req.account.id, ["favorites"], (user) => {
        user.favorites = [...new Set([...user.favorites, req.params.recipeId])];
        return { favorites: user.favorites };
      }),
    );
  });
  app.delete("/users/:userId/favorites/:recipeId", async (req, res) =>
    res.json(
      await mutate(req.account.id, ["favorites"], (user) => {
        user.favorites = user.favorites.filter(
          (id) => id !== req.params.recipeId,
        );
        return { favorites: user.favorites };
      }),
    ),
  );
  app.get("/users/:userId/shopping-list/manual", async (req, res) =>
    res.json({ items: (await readUser(req.account.id)).shopping_list_items }),
  );
  app.post("/users/:userId/shopping-list/manual", async (req, res) => {
    const item = { ...d.ingredient(req.body), id: randomUUID() };
    res.json(
      await mutate(req.account.id, ["shopping_list_items"], (user) => {
        if (user.shopping_list_items.length >= 100)
          throw new d.InputError(
            "Remove some extra shopping items before adding more.",
          );
        user.shopping_list_items.push(item);
        return { item };
      }),
    );
  });
  app.delete("/users/:userId/shopping-list/manual/:itemId", async (req, res) =>
    res.json(
      await mutate(req.account.id, ["shopping_list_items"], (user) => {
        user.shopping_list_items = user.shopping_list_items.filter(
          (i) => i.id !== req.params.itemId,
        );
        return { items: user.shopping_list_items };
      }),
    ),
  );
  app.post("/users/:userId/meal-plan/generate", async (req, res) => {
    res.json(
      await mutate(
        req.account.id,
        ["meal_plans", "meal_history"],
        async (user, db) => {
          if (user.meal_plans.length >= 100)
            throw new d.InputError(
              "You have reached 100 saved plans. Remove an old plan before creating another.",
            );
          const plan = d.generatePlan(req.body || {}, user, await recipes(db));
          user.meal_plans.push(plan);
          user.meal_history = [...user.meal_history, ...plan.recipe_ids].slice(
            -700,
          );
          return plan;
        },
      ),
    );
  });
  app.get("/users/:userId/meal-plans", async (req, res) =>
    res.json((await readUser(req.account.id)).meal_plans),
  );
  app.delete("/users/:userId/meal-plans/:planId", async (req, res) =>
    res.json(
      await mutate(req.account.id, ["meal_plans"], (user) => {
        user.meal_plans = user.meal_plans.filter(
          (p) => p.id !== req.params.planId,
        );
        return { message: "Plan removed." };
      }),
    ),
  );
  for (const auto of [false, true])
    app.post(
      `/users/:userId/meal-plans/:planId/${auto ? "swap-auto" : "swap"}`,
      async (req, res) =>
        res.json(
          await mutate(req.account.id, ["meal_plans"], async (user, db) =>
            d.swapPlan(
              d.planFrom(user, req.params.planId),
              req.body || {},
              user,
              await recipes(db),
              auto,
            ),
          ),
        ),
    );
  app.patch("/users/:userId/meal-plans/:planId", async (req, res) =>
    res.json(
      await mutate(req.account.id, ["meal_plans"], async (user, db) => {
        const plan = d.planFrom(user, req.params.planId);
        d.checkVersion(plan, req.body?.version);
        if (req.body.action === "servings") {
          if (k.hasCompletions(plan))
            throw new d.InputError(
              "Portions are fixed after cooking starts. Create a new plan for a different number of people.",
              409,
            );
          plan.servings = d.number(req.body.servings, "People", 1, 8, true);
        } else if (req.body.action === "lock") {
          const entry = plan.entries.find(
            (e) => e.id === req.body.entry_id && e.kind === "cook",
          );
          if (!entry || typeof req.body.locked !== "boolean")
            throw new d.InputError("Choose a cooking day to keep.");
          entry.locked = req.body.locked;
        } else if (req.body.action === "replan") {
          const candidates = d.matchingRecipes(
            await recipes(db),
            user,
            plan.max_minutes,
          );
          if (!candidates.length)
            throw new d.InputError(
              "No dinners match your current settings. Your existing plan was kept.",
              422,
            );
          const used = plan.entries
            .filter((e) => e.locked || k.completeEntry(plan, e.id))
            .map((e) => e.recipe_id);
          for (const entry of plan.entries.filter(
            (e) =>
              e.kind === "cook" && !e.locked && !k.completeEntry(plan, e.id),
          )) {
            entry.recipe_id = d.chooseRecipe(
              candidates,
              user,
              used,
              candidates.length > 1 ? entry.recipe_id : null,
            ).id;
            used.push(entry.recipe_id);
          }
        } else throw new d.InputError("Unknown plan change.");
        plan.version++;
        return d.syncPlan(plan);
      }),
    ),
  );
  app.get("/users/:userId/meal-plans/:planId/candidates", async (req, res) => {
    const user = await readUser(req.account.id);
    const plan = d.planFrom(user, req.params.planId);
    res.json(d.matchingRecipes(await recipes(), user, plan.max_minutes));
  });
  app.get(
    "/users/:userId/meal-plans/:planId/shopping-list",
    async (req, res) => {
      const user = await readUser(req.account.id);
      const plan = d.planFrom(user, req.params.planId);
      const all = await recipes();
      d.preferences(user, all);
      const warnings = k
        .remainingEntries(plan)
        .filter((e) => e.kind === "cook")
        .filter(
          (e) =>
            !d.eligible(
              all.find((r) => r.id === e.recipe_id) || { ingredients: [] },
              user,
              plan.max_minutes,
            ),
        )
        .map(
          (e) =>
            `${e.date}: this saved dinner no longer matches your settings. Swap it before using this list.`,
        );
      res.json({
        ...(warnings.length
          ? { shopping_list_items: [], already_have_items: [] }
          : d.shoppingList(plan, all, user.pantry, user.shopping_list_items)),
        warnings,
        pantry_revision: k.pantryRevision(user.pantry),
      });
    },
  );
  app.patch(
    "/users/:userId/meal-plans/:planId/shopping-list",
    async (req, res) =>
      res.json(
        await mutate(req.account.id, ["meal_plans"], async (user, db) => {
          const plan = d.planFrom(user, req.params.planId);
          k.ensureRemainingMealsMatch(plan, await recipes(db), user);
          const list = d.shoppingList(
            plan,
            await recipes(db),
            user.pantry,
            user.shopping_list_items,
          );
          if (
            typeof req.body?.checked !== "boolean" ||
            !list.shopping_list_items.some((i) => i.key === req.body.key)
          )
            throw new d.InputError(
              "The shopping list changed. Reload it before checking this item.",
              409,
            );
          plan.checked = (plan.checked || []).filter(
            (key) =>
              key !== req.body.key &&
              list.shopping_list_items.some((i) => i.key === key),
          );
          if (req.body.checked) plan.checked.push(req.body.key);
          return { checked: plan.checked };
        }),
      ),
  );
  app.post("/users/:userId/meal-plans/:planId/purchases", async (req, res) =>
    res.json(
      await mutate(
        req.account.id,
        ["pantry", "shopping_list_items", "meal_plans"],
        async (user, db) =>
          k.recordPurchases(
            user,
            d.planFrom(user, req.params.planId),
            req.body || {},
            await recipes(db),
          ),
      ),
    ),
  );
  app.post(
    "/users/:userId/meal-plans/:planId/cooking/:entryId/finish",
    async (req, res) =>
      res.json(
        await mutate(
          req.account.id,
          ["pantry", "meal_plans"],
          async (user, db) =>
            k.finishDinner(
              user,
              d.planFrom(user, req.params.planId),
              req.params.entryId,
              req.body || {},
              await recipes(db),
            ),
        ),
      ),
  );
  app.delete(
    "/users/:userId/meal-plans/:planId/cooking/:entryId/finish",
    async (req, res) =>
      res.json(
        await mutate(req.account.id, ["pantry", "meal_plans"], (user) =>
          k.undoDinner(
            user,
            d.planFrom(user, req.params.planId),
            req.params.entryId,
            req.body || {},
          ),
        ),
      ),
  );
  app.patch(
    "/users/:userId/meal-plans/:planId/cooking/:entryId/feedback",
    async (req, res) =>
      res.json(
        await mutate(req.account.id, ["meal_plans"], (user) => {
          const plan = d.planFrom(user, req.params.planId);
          d.checkVersion(plan, req.body?.version);
          const completion = k.completeEntry(plan, req.params.entryId);
          if (!completion)
            throw new d.InputError(
              "Finish this dinner before saving observations.",
              409,
            );
          completion.feedback = k.feedback(req.body.feedback);
          plan.version++;
          return { completion, version: plan.version };
        }),
      ),
  );
  app.get(
    "/users/:userId/meal-plans/:planId/cooking/:entryId",
    async (req, res) => {
      const user = await readUser(req.account.id);
      const plan = d.planFrom(user, req.params.planId);
      res.json(cooking(plan, req.params.entryId, await recipes(), user));
    },
  );
  app.patch(
    "/users/:userId/meal-plans/:planId/cooking/:entryId",
    async (req, res) =>
      res.json(
        await mutate(req.account.id, ["meal_plans"], async (user, db) => {
          const plan = d.planFrom(user, req.params.planId);
          d.checkVersion(plan, req.body?.version);
          const result = cooking(
            plan,
            req.params.entryId,
            await recipes(db),
            user,
          );
          if (result.completion)
            throw new d.InputError(
              "This dinner is already finished. Undo it before restarting.",
              409,
            );
          const progress = result.progress;
          progress.step = d.number(
            req.body.step,
            "Cooking step",
            0,
            result.recipe.steps.length - 1,
            true,
          );
          if (typeof req.body.completed !== "boolean")
            throw new d.InputError("Choose a cooking status.");
          progress.completed = req.body.completed;
          if (req.body.timer_ends_at !== null)
            d.number(
              req.body.timer_ends_at,
              "Timer",
              0,
              Date.now() + 24 * 60 * 60 * 1000,
              true,
            );
          progress.timer_ends_at = req.body.timer_ends_at;
          plan.progress ||= {};
          plan.progress[result.entry.id] = progress;
          return { ...result, progress };
        }),
      ),
  );
}
function cooking(plan, entryId, all, user) {
  const entry = plan.entries.find((e) => e.id === entryId);
  if (!entry) throw new d.InputError("Dinner not found.", 404);
  const recipe = all.find((r) => r.id === entry.recipe_id);
  if (!recipe?.base_servings)
    throw new d.InputError("Recipe not available for guided cooking.", 409);
  const completion = k.completeEntry(plan, entry.id);
  if (!completion) d.preferences(user, all);
  if (!completion && !d.eligible(recipe, user, plan.max_minutes))
    throw new d.InputError(
      "This dinner no longer matches your dietary settings. Swap it before cooking.",
      422,
    );
  let progress = plan.progress?.[entryId];
  if (
    !progress ||
    progress.recipe_id !== recipe.id ||
    progress.servings !== entry.servings
  )
    progress = {
      recipe_id: recipe.id,
      servings: entry.servings,
      step: 0,
      completed: false,
      timer_ends_at: null,
    };
  const displayRecipe =
    entry.kind === "leftover"
      ? {
          ...recipe,
          steps: [
            {
              instruction:
                "Reheat your reserved portion until it reaches 165 F (74 C).",
              tip: "Only use leftovers that were promptly refrigerated. Use a food thermometer.",
            },
          ],
        }
      : recipe;
  return {
    entry,
    recipe: displayRecipe,
    progress,
    version: plan.version,
    completion,
    usage: k.cookingUsage(entry, recipe, user.pantry),
    pantry_revision: k.pantryRevision(user.pantry),
    source_finished:
      entry.kind !== "leftover" ||
      Boolean(k.completeEntry(plan, entry.source_entry_id)),
  };
}
module.exports = { installUserRoutes, readUser, recipes, mutate };
