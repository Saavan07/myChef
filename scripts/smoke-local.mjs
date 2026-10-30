import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { getPool } = require("../backend/db");
const { verifyPassword } = require("../backend/auth");
const base = process.env.MYCHEF_SMOKE_BASE_URL || "http://127.0.0.1:4000";
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname),
  "Only target a local disposable database.",
);
assert(["127.0.0.1", "localhost"].includes(process.env.DB_HOST));
assert.equal(
  process.env.DB_NAME,
  "mychef_local",
  "This check uses the compose.local.yml disposable database.",
);
let requests = 0;
const users = [];
function client() {
  return {
    cookie: "",
    async request(path, method = "GET", body, expected = 200, headers = {}) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-MyChef-Request": "1",
          Cookie: this.cookie,
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) this.cookie = cookies.at(-1).split(";")[0];
      const result = await response.json();
      requests++;
      assert.equal(
        response.status,
        expected,
        `${method} ${path}: ${JSON.stringify(result)}`,
      );
      return result;
    },
  };
}
const a = client(),
  b = client(),
  guest = client();
let prefix, id, other;
try {
  await guest.request("/health");
  await guest.request("/session", "GET", undefined, 401);
  const credentials = {
    username: `smoke-${Date.now()}`,
    password: "disposable-local-smoke",
  };
  ({ user_id: id } = await a.request("/register", "POST", credentials, 201));
  users.push(id);
  ({ user_id: other } = await b.request(
    "/register",
    "POST",
    { ...credentials, username: `${credentials.username}-b` },
    201,
  ));
  users.push(other);
  prefix = `/users/${id}`;
  assert.equal((await a.request("/session")).user_id, id);
  const [[stored]] = await getPool().execute(
    "SELECT password FROM users WHERE id = ?",
    [id],
  );
  assert.notEqual(stored.password, credentials.password);
  assert(await verifyPassword(credentials.password, stored.password));
  await a.request("/login", "POST", { ...credentials, password: "wrong" }, 401);
  await a.request("/login", "POST", credentials);
  for (const path of [
    "preferences",
    "pantry",
    "favorites",
    "meal-plans",
    "shopping-list/manual",
  ]) {
    await guest.request(`${prefix}/${path}`, "GET", undefined, 401);
    await b.request(`${prefix}/${path}`, "GET", undefined, 403);
  }
  await b.request(
    `${prefix}/pantry`,
    "POST",
    { name: "rice", quantity: 99, unit: "cup" },
    403,
  );
  await b.request(
    "/stores/test-store/reviews",
    "POST",
    { user_id: id, rating: 5, comment: "spoof" },
    403,
  );
  await b.request(`/stores/test-store/reviews/${id}`, "DELETE", undefined, 403);
  await guest.request("/stores/nearby", "POST", {}, 401);
  await a.request(
    `${prefix}/pantry`,
    "POST",
    { name: "rice", quantity: 1, unit: "cup" },
    403,
    { Origin: "https://untrusted.example" },
  );
  await a.request(
    `${prefix}/pantry`,
    "POST",
    { name: "rice", quantity: 1, unit: "cup" },
    403,
    { "X-MyChef-Request": "" },
  );
  await a.request(
    `${prefix}/pantry`,
    "POST",
    { name: "<img onerror=alert(1)>", quantity: 1, unit: "cup" },
    400,
  );
  await a.request(
    `${prefix}/pantry`,
    "POST",
    { name: "rice", quantity: -1, unit: "cup" },
    400,
  );
  await a.request(
    `${prefix}/preferences`,
    "POST",
    { dietary_preferences: [], dietary_restrictions: ["unknown allergy"] },
    400,
  );
  await a.request(`${prefix}/preferences`, "POST", {
    dietary_preferences: ["vegan", "gluten-free"],
    dietary_restrictions: ["no soy"],
  });
  const options = {
    start_date: "2026-10-26",
    days: 3,
    servings: 2,
    max_minutes: 30,
    leftovers: false,
  };
  await a.request(
    `${prefix}/meal-plan/generate`,
    "POST",
    { ...options, max_minutes: 10 },
    422,
  );
  assert.equal((await a.request(`${prefix}/meal-plans`)).length, 0);
  await a.request(
    `${prefix}/meal-plan/generate`,
    "POST",
    { ...options, start_date: "2026-02-30" },
    400,
  );
  await a.request(`${prefix}/preferences`, "POST", {
    dietary_preferences: ["vegan"],
    dietary_restrictions: [],
  });
  const pantry = await a.request(`${prefix}/pantry`, "POST", {
    name: "rice",
    quantity: 16,
    unit: "tbsp",
  });
  let plan = await a.request(`${prefix}/meal-plan/generate`, "POST", options);
  const planPath = `${prefix}/meal-plans/${plan.id}`;
  for (const entry of plan.entries)
    plan = await a.request(`${planPath}/swap`, "POST", {
      version: plan.version,
      entry_id: entry.id,
      new_recipe_id: "r4",
    });
  let list = await a.request(`${planPath}/shopping-list`);
  assert.equal(
    list.shopping_list_items.find((i) => i.name === "rice").quantity,
    2,
  );
  assert.equal(
    list.already_have_items.find((i) => i.name === "rice").quantity,
    1,
  );
  const manual = await a.request(`${prefix}/shopping-list/manual`, "POST", {
    name: "rice",
    quantity: 1,
    unit: "cup",
  });
  list = await a.request(`${planPath}/shopping-list`);
  assert.equal(
    list.shopping_list_items.filter((i) => i.name === "rice").length,
    2,
  );
  const checkedItem = list.shopping_list_items.find(
    (i) => i.name === "rice" && !i.manual,
  );
  await a.request(`${planPath}/shopping-list`, "PATCH", {
    key: checkedItem.key,
    checked: true,
  });
  assert(
    (await a.request(`${planPath}/shopping-list`)).shopping_list_items.find(
      (i) => i.key === checkedItem.key,
    ).checked,
  );
  plan = await a.request(planPath, "PATCH", {
    action: "servings",
    servings: 4,
    version: plan.version,
  });
  list = await a.request(`${planPath}/shopping-list`);
  assert.equal(
    list.shopping_list_items.find((i) => i.name === "rice" && !i.manual)
      .quantity,
    5,
  );
  assert(
    !list.shopping_list_items.find((i) => i.name === "rice" && !i.manual)
      .checked,
  );
  await a.request(
    planPath,
    "PATCH",
    { action: "servings", servings: 3, version: plan.version - 1 },
    409,
  );
  plan = await a.request(planPath, "PATCH", {
    action: "lock",
    entry_id: plan.entries[0].id,
    locked: true,
    version: plan.version,
  });
  await a.request(
    `${planPath}/swap`,
    "POST",
    {
      entry_id: plan.entries[0].id,
      new_recipe_id: "r1",
      version: plan.version,
    },
    409,
  );
  plan = await a.request(planPath, "PATCH", {
    action: "replan",
    version: plan.version,
  });
  assert.equal(plan.entries[0].recipe_id, "r4");
  await a.request(`${prefix}/preferences`, "POST", {
    dietary_preferences: ["vegan", "gluten-free"],
    dietary_restrictions: ["no soy"],
  });
  await a.request(
    `${planPath}/swap`,
    "POST",
    {
      entry_id: plan.entries[2].id,
      new_recipe_id: "r2",
      version: plan.version,
    },
    422,
  );
  await a.request(
    `${planPath}/swap`,
    "POST",
    {
      entry_id: plan.entries[2].id,
      new_recipe_id: "r4",
      version: plan.version,
    },
    422,
  );
  const incompatible = await a.request(`${planPath}/shopping-list`);
  assert(incompatible.warnings.length > 0);
  assert.equal(incompatible.shopping_list_items.length, 0);
  await a.request(
    `${planPath}/cooking/${plan.entries[0].id}`,
    "GET",
    undefined,
    422,
  );
  const candidates = await a.request(`${planPath}/candidates`);
  assert(!candidates.some((r) => ["r1", "r2", "r4", "r5"].includes(r.id)));
  plan = await a.request(`${planPath}/swap-auto`, "POST", {
    entry_id: plan.entries[2].id,
    version: plan.version,
  });
  assert(candidates.some((r) => r.id === plan.entries[2].recipe_id));
  // Updates on the same row must not lose one another, including additions to the same field.
  await Promise.all([
    ...Array.from({ length: 12 }, () =>
      a.request(`${prefix}/pantry`, "POST", {
        name: "rice",
        quantity: 1,
        unit: "tbsp",
      }),
    ),
    a.request(`${prefix}/favorites/d1`, "POST"),
    a.request(`${prefix}/shopping-list/manual`, "POST", {
      name: "apple",
      quantity: 3,
      unit: "count",
    }),
  ]);
  assert.equal(
    (await a.request(`${prefix}/pantry`)).pantry.find((i) => i.name === "rice")
      .quantity,
    28,
  );
  assert((await a.request(`${prefix}/favorites`)).some((r) => r.id === "d1"));
  assert(
    (await a.request(`${prefix}/shopping-list/manual`)).items.some(
      (i) => i.name === "apple",
    ),
  );
  const leftovers = await a.request(`${prefix}/meal-plan/generate`, "POST", {
    ...options,
    days: 4,
    leftovers: true,
  });
  assert.deepEqual(
    leftovers.entries.map((e) => e.servings),
    [4, 2, 4, 2],
  );
  const cookingPath = `${prefix}/meal-plans/${leftovers.id}/cooking/${leftovers.entries[0].id}`;
  const timer = Date.now() + 60000;
  await a.request(cookingPath, "PATCH", {
    version: leftovers.version,
    step: 1,
    completed: false,
    timer_ends_at: timer,
  });
  const cooked = await a.request(cookingPath);
  assert.equal(cooked.progress.step, 1);
  assert.equal(cooked.progress.timer_ends_at, timer);
  await b.request(cookingPath, "GET", undefined, 403);
  await a.request(`${prefix}/meal-plans/${leftovers.id}`, "PATCH", {
    action: "servings",
    servings: 3,
    version: leftovers.version,
  });
  assert.equal((await a.request(cookingPath)).progress.step, 0);
  const lastCookie = a.cookie;
  await a.request("/logout", "POST");
  a.cookie = lastCookie;
  await a.request("/session", "GET", undefined, 401);
  await a.request(`${prefix}/pantry`, "GET", undefined, 401);
  await a.request("/login", "POST", credentials);
  await getPool().execute(
    "UPDATE sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE user_id = ?",
    [id],
  );
  await a.request("/session", "GET", undefined, 401);
  await a.request(`${prefix}/meal-plans`, "GET", undefined, 401);
  console.log(
    `PASS: ${requests} API requests against real MySQL. Account isolation, sessions, CSRF, validation, strict diets, quantity arithmetic, leftovers, swaps, locks, stale edits, concurrent writes, checked shopping, and cooking persistence verified.`,
  );
} finally {
  for (const userId of users)
    await getPool().execute("DELETE FROM users WHERE id = ?", [userId]);
  await getPool().end();
}
