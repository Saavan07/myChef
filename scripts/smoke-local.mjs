import assert from "node:assert/strict";

const base = process.env.MYCHEF_SMOKE_BASE_URL || "http://127.0.0.1:4000";
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname),
  "This test creates disposable records and must target a local test database.");
let requests = 0;
async function request(path, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  assert(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  requests++;
  return result;
}
assert.equal((await request("/health")).ok, true);
const credentials = { username: `smoke-${Date.now()}`, password: "disposable-local-smoke" };
const { user_id: id } = await request("/register", "POST", credentials);
assert.equal((await request("/login", "POST", credentials)).user_id, id);
await request(`/users/${id}/preferences`, "POST", { dietary_preferences: ["vegetarian"], dietary_restrictions: [] });
await request(`/users/${id}/pantry`, "POST", { items: ["garlic"] });
await request(`/users/${id}/favorites/r1`, "POST");
const plan = await request(`/users/${id}/meal-plan/generate`, "POST");
assert.equal(plan.recipe_ids.length, 7);
await request(`/users/${id}/meal-plans/${plan.id}/swap`, "POST", { day_index: 0, new_recipe_id: "r1" });
await request(`/users/${id}/meal-plans/${plan.id}/swap-auto?day_index=1`, "POST");
await request(`/users/${id}/shopping-list/manual`, "POST", { name: "apples", quantity: 3, unit: "" });
const shopping = await request(`/users/${id}/meal-plans/${plan.id}/shopping-list`);
assert(shopping.shopping_list_items.some(item => item.name === "apples" && item.quantity === 3));
assert(shopping.already_have_items.some(item => /garlic/.test(item.name)));
const plans = await request(`/users/${id}/meal-plans`);
assert(JSON.stringify(plans).includes(plan.id));
console.log(`PASS: ${requests} local API requests verified registration, login, preferences, pantry, favorites, planning, swaps, shopping, and persisted plans.`);
console.log("External grocery lookup, authorization, and dietary safety are outside this smoke test.");
