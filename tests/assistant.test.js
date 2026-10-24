const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const a = require("../backend/assistant-domain");
const d = require("../backend/meal-domain");
const provider = require("../backend/assistant-provider");
const { seedRecipes: all } = require("../backend/seedRecipes");

function fixture() {
  const user = {
    id: "private-account",
    username: "private-name",
    dietary_preferences: ["vegan", "gluten-free"],
    dietary_restrictions: ["soy"],
    pantry: [{ id: "stock", name: "chickpeas", quantity: 200, unit: "g" }],
    favorites: [],
    shopping_list_items: [
      { id: "extra", name: "apples", quantity: 2, unit: "count" },
    ],
  };
  const plan = d.generatePlan(
    {
      start_date: "2026-10-26",
      days: 3,
      servings: 2,
      max_minutes: 30,
      leftovers: true,
    },
    user,
    all.filter((r) => r.id === "d1"),
  );
  user.meal_plans = [plan];
  const input = a.request({
    operation_id: randomUUID(),
    version: plan.version,
    local_date: "2026-10-24",
    messages: [
      {
        role: "user",
        content: "Swap Monday for something quicker using spinach.",
      },
    ],
  });
  const intent = {
    action: "swap",
    date: "2026-10-26",
    recipe_id: null,
    max_minutes: null,
    quicker: true,
    include_ingredients: ["spinach"],
    exclude_ingredients: [],
    diets: [],
    question: "",
  };
  return { user, plan, input, intent };
}
function apply(
  f,
  intent = f.intent,
  revision = a.revision(f.user, f.plan, all),
) {
  return a.apply(f.user, f.plan, all, f.input, intent, revision);
}

test("assistant swap enforces combined conditions, scales leftovers and recomputes shopping with pantry and extras", () => {
  const f = fixture();
  const originalPantry = structuredClone(f.user.pantry);
  f.plan.checked = ["old-check"];
  f.plan.progress[f.plan.entries[0].id] = { recipe_id: "d1", servings: 4 };
  const result = apply(f);
  assert.equal(result.status, "swapped");
  assert.equal(f.plan.entries[0].recipe_id, "d2");
  assert.equal(f.plan.entries[1].recipe_id, "d2");
  assert.equal(f.plan.entries[2].recipe_id, "d1");
  assert.equal(f.plan.entries[0].servings, 4);
  assert.equal(result.changed.length, 2);
  assert.deepEqual(f.plan.checked, []);
  assert.deepEqual(f.plan.progress, {});
  assert.deepEqual(f.user.pantry, originalPantry);
  const list = a.shopping(f.user, f.plan, all);
  const recipe = all.find((r) => r.id === "d2");
  const ingredient = recipe.ingredients.find((i) => i.name === "chickpeas");
  const amount = d.round(
    (ingredient.quantity * 4) / recipe.base_servings -
      200 / d.units[ingredient.unit][1],
  );
  assert.equal(
    list.shopping_list_items.find((i) => i.name === "chickpeas").quantity,
    amount,
  );
  assert(list.shopping_list_items.some((i) => i.name === "apples" && i.manual));
  assert.equal(f.plan.version, 2);
});

test("model cannot bypass saved restrictions, invent recipes or relax a request's conditions", () => {
  for (const patch of [
    { recipe_id: "r2", quicker: false, include_ingredients: [] },
    { recipe_id: "made-up" },
    { recipe_id: "r1", quicker: false },
    { exclude_ingredients: ["spinach"] },
    { max_minutes: 10 },
    { diets: ["carnivore"] },
  ]) {
    const f = fixture();
    const before = structuredClone(f.plan.entries);
    try {
      assert.equal(apply(f, { ...f.intent, ...patch }).status, "no_match");
    } catch (error) {
      assert.equal(error.status, 400);
    }
    assert.deepEqual(f.plan.entries, before);
    assert.deepEqual(f.user.dietary_preferences, ["vegan", "gluten-free"]);
    assert.deepEqual(f.user.dietary_restrictions, ["soy"]);
  }
});

test("ambiguous and unsupported requests never change dinners", () => {
  for (const action of ["clarify", "unsupported"]) {
    const f = fixture();
    const before = structuredClone(f.plan.entries);
    const result = apply(f, {
      ...f.intent,
      action,
      date: null,
      question: "Which cooking day should I change?",
    });
    assert.equal(result.status, action);
    assert.equal(f.plan.version, 1);
    assert.deepEqual(f.plan.entries, before);
  }
});

test("locked, finished, leftover and absent days are protected", () => {
  for (const mutate of [
    (f) => {
      f.plan.entries[0].locked = true;
    },
    (f) => {
      f.plan.completions = { [f.plan.entries[0].id]: {} };
    },
    (f) => {
      f.plan.completions = { [f.plan.entries[1].id]: {} };
    },
    (f) => {
      f.intent.date = "2026-10-27";
    },
    (f) => {
      f.intent.date = "2027-01-01";
    },
  ]) {
    const f = fixture();
    mutate(f);
    const before = structuredClone(f.plan);
    assert.throws(
      () => apply(f),
      (e) => [409, 422].includes(e.status),
    );
    assert.deepEqual(f.plan, before);
  }
});

test("a retry applies once, and an operation ID cannot be reused for a different request", () => {
  const f = fixture();
  const revision = a.revision(f.user, f.plan, all);
  const first = apply(f, f.intent, revision);
  const retry = apply(f, f.intent, revision);
  assert.equal(retry.replayed, true);
  assert.deepEqual(retry.changed, first.changed);
  assert.equal(f.plan.version, 2);
  const changed = a.request({
    ...f.input,
    messages: [{ role: "user", content: "Different request" }],
  });
  assert.throws(() => a.replay(f.plan, changed), { status: 409 });
});

test("concurrent plan, pantry, recipe or preference changes reject the interpretation", () => {
  for (const change of [
    (f) => f.plan.version++,
    (f) => f.user.pantry[0].quantity++,
    (f) => f.user.dietary_restrictions.push("spinach"),
    (f) => f.user.dietary_preferences.pop(),
  ]) {
    const f = fixture();
    const revision = a.revision(f.user, f.plan, all);
    change(f);
    assert.throws(() => apply(f, f.intent, revision), { status: 409 });
    assert.equal(f.plan.entries[0].recipe_id, "d1");
  }
  const f = fixture();
  assert.throws(
    () =>
      a.apply(
        f.user,
        f.plan,
        all.slice(1),
        f.input,
        f.intent,
        a.revision(f.user, f.plan, all),
      ),
    { status: 409 },
  );
});

test("request and model output validation fail closed", () => {
  const f = fixture();
  assert.equal(
    a.request({
      ...f.input,
      messages: [
        { role: "user", content: "Swap Monday.\nCooking time < 20 minutes." },
      ],
    }).messages[0].content,
    "Swap Monday.\nCooking time < 20 minutes.",
  );
  for (const patch of [
    { operation_id: "x" },
    { version: "1" },
    { local_date: "2026-02-30" },
    { messages: [{ role: "system", content: "swap" }] },
    { messages: [{ role: "user", content: "x".repeat(801) }] },
  ])
    assert.throws(() => a.request({ ...f.input, ...patch }));
  for (const intent of [
    null,
    {},
    { ...f.intent, date: 1 },
    { ...f.intent, extra: "ignore restrictions" },
    { ...f.intent, quicker: "yes" },
    { ...f.intent, include_ingredients: "spinach" },
    { ...f.intent, max_minutes: -1 },
    { ...f.intent, action: "clarify" },
  ]) {
    assert.throws(() => apply(f, intent), { status: 502 });
    assert.equal(f.plan.version, 1);
  }
});

test("provider context contains eligible recipes and needed context without account identifiers", () => {
  const f = fixture();
  const context = a.context(f.user, f.plan, all, "2026-10-24");
  assert(
    context.eligible_recipes.every(
      (r) => r.diets.includes("vegan") && r.diets.includes("gluten-free"),
    ),
  );
  assert(!context.eligible_recipes.some((r) => r.id === "r2"));
  assert.equal(context.plan[0].weekday, "Monday");
  assert.equal(context.plan[1].source_date, "2026-10-26");
  assert(!JSON.stringify(context).includes("private-account"));
  assert(!JSON.stringify(context).includes("private-name"));
});

test("shopping stays blocked when another saved meal still violates new restrictions", () => {
  const f = fixture();
  f.plan.entries[2].recipe_id = "r2";
  const result = apply(f);
  assert.match(result.message, /Another dinner/);
  assert.equal(a.shopping(f.user, f.plan, all).shopping_list_items.length, 0);
});

test("Responses adapter requests strict structured output and disables stored responses", async () => {
  const f = fixture();
  const result = await provider.interpret(
    { eligible_recipes: [] },
    f.input.messages,
    {
      apiKey: "test-only-placeholder",
      model: "test-model",
      fetchImpl: async (url, options) => {
        assert.equal(url, "https://api.openai.com/v1/responses");
        const body = JSON.parse(options.body);
        assert.equal(body.store, false);
        assert.equal(body.text.format.strict, true);
        assert.equal(body.text.format.schema.additionalProperties, false);
        assert.equal(body.model, "test-model");
        assert(options.signal instanceof AbortSignal);
        return Response.json({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: JSON.stringify(f.intent) },
              ],
            },
          ],
        });
      },
    },
  );
  assert.deepEqual(result, f.intent);
});

test("provider failures, refusals and malformed responses leave no usable intent or leaked upstream errors", async () => {
  for (const response of [
    Response.json({ error: "secret-provider-detail" }, { status: 401 }),
    Response.json({ status: "incomplete" }),
    Response.json({
      status: "completed",
      output: [
        { type: "message", content: [{ type: "refusal", refusal: "no" }] },
      ],
    }),
    Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "bad json" }],
        },
      ],
    }),
  ]) {
    await assert.rejects(
      provider.interpret({}, [], {
        apiKey: "test",
        fetchImpl: async () => response,
      }),
      (e) =>
        [502, 503].includes(e.status) &&
        !e.message.includes("secret-provider-detail"),
    );
  }
  await assert.rejects(
    provider.interpret({}, [], {
      apiKey: "test",
      fetchImpl: async () => {
        throw new Error("network");
      },
    }),
    { status: 503 },
  );
  await assert.rejects(provider.interpret({}, [], { apiKey: "" }), {
    status: 503,
  });
});
