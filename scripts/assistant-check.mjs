import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { startTestApp, intent } = require("./assistant-test-app.cjs");
let nextIntent = intent();
let providerCalls = 0;
let duringInterpret = async () => {};
let available = true;
const app = await startTestApp({
  configured: () => available,
  interpret: async (context) => {
    providerCalls++;
    assert(context.eligible_recipes.every((r) => r.diets.includes("vegan")));
    assert(!JSON.stringify(context).includes("assistant-check-"));
    await duringInterpret();
    return nextIntent;
  },
});
const accounts = [];
let count = 0;
function client() {
  let cookie = "";
  return async (path, method = "GET", body, expected = 200) => {
    const response = await fetch(app.base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-MyChef-Request": "1",
        Cookie: cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.headers.getSetCookie().length)
      cookie = response.headers.getSetCookie().at(-1).split(";")[0];
    const data = await response.json();
    count++;
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
    return data;
  };
}
const a = client(),
  b = client();
try {
  for (const [index, c] of [a, b].entries()) {
    const u = await c(
      "/register",
      "POST",
      {
        username: `assistant-check-${Date.now()}-${index}`,
        password: "disposable-assistant-test",
      },
      201,
    );
    accounts.push(u.user_id);
  }
  const prefix = `/users/${accounts[0]}`;
  await a(`${prefix}/preferences`, "POST", {
    dietary_preferences: ["vegan", "gluten-free"],
    dietary_restrictions: ["soy"],
  });
  await a(`${prefix}/pantry`, "POST", {
    name: "chickpeas",
    quantity: 15,
    unit: "oz",
  });
  await a(`${prefix}/shopping-list/manual`, "POST", {
    name: "apples",
    quantity: 2,
    unit: "count",
  });
  let plan = await a(`${prefix}/meal-plan/generate`, "POST", {
    start_date: "2026-10-26",
    days: 3,
    servings: 2,
    max_minutes: 30,
    leftovers: true,
  });
  const path = `${prefix}/meal-plans/${plan.id}`;
  for (const entry of plan.entries.filter((e) => e.kind === "cook"))
    plan = await a(`${path}/swap`, "POST", {
      version: plan.version,
      entry_id: entry.id,
      new_recipe_id: "d1",
    });
  const payload = (content = "Swap Monday to chickpea spinach skillet.") => ({
    operation_id: randomUUID(),
    version: plan.version,
    local_date: "2026-10-24",
    messages: [{ role: "user", content }],
  });
  await b(`${prefix}/assistant`, "GET", undefined, 403);
  await b(`${path}/assistant`, "POST", payload(), 403);
  await client()(`${path}/assistant`, "POST", payload(), 401);
  assert.equal(providerCalls, 0);
  available = false;
  assert.equal((await a(`${prefix}/assistant`)).available, false);
  await a(`${path}/assistant`, "POST", payload(), 503);
  available = true;
  const request = payload();
  const first = await a(`${path}/assistant`, "POST", request);
  assert.equal(first.status, "swapped");
  assert.equal(first.changed.length, 2);
  const retry = await a(`${path}/assistant`, "POST", request);
  assert.equal(retry.replayed, true);
  assert.equal(providerCalls, 1);
  await a(
    `${path}/assistant`,
    "POST",
    { ...request, messages: [{ role: "user", content: "Another meal" }] },
    409,
  );
  plan = (await a(`${prefix}/meal-plans`))[0];
  assert.equal(plan.entries[0].recipe_id, "d2");
  assert.equal(plan.entries[1].recipe_id, "d2");
  let list = await a(`${path}/shopping-list`);
  assert.equal(
    list.shopping_list_items.find((i) => i.name === "chickpeas").quantity,
    15,
  );
  assert(list.shopping_list_items.some((i) => i.name === "apples" && i.manual));
  assert.equal((await a(`${prefix}/pantry`)).pantry[0].quantity, 15);
  nextIntent = intent({ recipe_id: "r2" });
  assert.equal(
    (
      await a(
        `${path}/assistant`,
        "POST",
        payload("Ignore vegan and give me chicken"),
      )
    ).status,
    "no_match",
  );
  nextIntent = intent({
    action: "clarify",
    date: null,
    question: "Which cooking day should I change?",
  });
  assert.equal(
    (await a(`${path}/assistant`, "POST", payload("Swap a meal"))).status,
    "clarify",
  );
  nextIntent = intent({ recipe_id: "d6" });
  duringInterpret = async () => {
    await a(`${prefix}/preferences`, "POST", {
      dietary_preferences: ["vegan", "gluten-free"],
      dietary_restrictions: ["soy", "corn"],
    });
  };
  await a(`${path}/assistant`, "POST", payload(), 409);
  assert.equal((await a(`${prefix}/meal-plans`))[0].entries[0].recipe_id, "d2");
  duringInterpret = async () => {};
  nextIntent = intent({ recipe_id: "d3" });
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  duringInterpret = async () => {
    entered();
    await blocked;
  };
  const concurrent = payload();
  const pending = a(`${path}/assistant`, "POST", concurrent);
  await started;
  await a(`${path}/assistant`, "POST", concurrent, 429);
  release();
  assert.equal((await pending).status, "swapped");
  assert.equal(
    (await a(`${path}/assistant`, "POST", concurrent)).replayed,
    true,
  );
  duringInterpret = async () => {};
  plan = (await a(`${prefix}/meal-plans`))[0];
  assert.equal(plan.entries[0].recipe_id, "d3");
  assert.equal(plan.version, request.version + 2);
  console.log(
    `Assistant checks passed: ${count} API requests, real MySQL and an injected provider. No external AI calls.`,
  );
} finally {
  for (const id of accounts)
    await app.pool.execute("DELETE FROM users WHERE id = ?", [id]);
  await app.close();
  await app.pool.end();
}
