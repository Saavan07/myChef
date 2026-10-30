const test = require("node:test");
const assert = require("node:assert/strict");
const d = require("../backend/meal-domain");
const { seedRecipes } = require("../backend/seedRecipes");
const user = (extra = {}) => ({
  pantry: [],
  favorites: [],
  dietary_preferences: [],
  dietary_restrictions: [],
  ...extra,
});
const settings = (extra = {}) => ({
  start_date: "2026-10-26",
  days: 3,
  servings: 2,
  max_minutes: 30,
  leftovers: false,
  ...extra,
});
const recipe = (id) => seedRecipes.find((r) => r.id === id);

test("reviewed catalog has structured, positive ingredients and consistent diet metadata", () => {
  assert.equal(new Set(seedRecipes.map((r) => r.id)).size, seedRecipes.length);
  for (const r of seedRecipes) {
    assert(r.base_servings > 0 && r.steps.length >= 2);
    for (const i of r.ingredients) {
      d.ingredient(i);
      assert(Array.isArray(i.allergens));
    }
    if (r.dietary_tags.includes("vegan")) {
      assert(r.dietary_tags.includes("vegetarian"));
      assert(
        !r.ingredients.some((i) =>
          [
            "milk",
            "butter",
            "cheese",
            "egg",
            "parmesan",
            "honey",
            "chicken breast",
            "ground beef",
            "turkey",
            "caesar dressing",
          ].includes(i.name),
        ),
      );
    }
    if (r.dietary_tags.includes("gluten-free"))
      assert(
        !r.ingredients.some((i) =>
          i.allergens.some((a) => ["wheat", "gluten"].includes(a)),
        ),
      );
  }
  assert(!recipe("r7").dietary_tags.includes("vegan"));
  assert(!recipe("r3").dietary_tags.includes("vegetarian"));
});

test("all selected diets are required, including swaps; empty matches never relax restrictions", () => {
  const u = user({
    dietary_preferences: ["vegan", "gluten-free"],
    dietary_restrictions: ["no soy"],
  });
  const matches = d.matchingRecipes(seedRecipes, u, 30);
  assert(matches.length > 2);
  assert(!matches.some((r) => ["r1", "r2", "r4", "r5"].includes(r.id)));
  const plan = d.generatePlan(settings(), u, seedRecipes);
  assert.throws(
    () =>
      d.swapPlan(
        plan,
        { version: 1, entry_id: plan.entries[0].id, new_recipe_id: "r2" },
        u,
        seedRecipes,
      ),
    { status: 422 },
  );
  assert.throws(
    () => d.generatePlan(settings({ max_minutes: 10 }), u, seedRecipes),
    { status: 422 },
  );
});

test("recognized exclusions include ingredient groups and reject unknown claims", () => {
  assert.deepEqual(
    d.preferences(
      {
        dietary_preferences: [],
        dietary_restrictions: ["no dairy", "without spinach"],
      },
      seedRecipes,
    ).dietary_restrictions,
    ["dairy", "spinach"],
  );
  assert.throws(
    () =>
      d.preferences(
        { dietary_preferences: [], dietary_restrictions: ["low fodmap"] },
        seedRecipes,
      ),
    /Unrecognized exclusion/,
  );
  assert.throws(
    () =>
      d.preferences(
        { dietary_preferences: [], dietary_restrictions: ["constructor"] },
        seedRecipes,
      ),
    /Unrecognized exclusion/,
  );
  assert(!d.eligible(recipe("r4"), user({ dietary_restrictions: ["wheat"] })));
});

test("shopping subtracts quantities and converts compatible units without mixing weight and volume", () => {
  const plan = d.generatePlan(settings(), user(), [recipe("r4")]);
  const pantry = [
    { name: "rice", quantity: 16, unit: "tbsp" },
    { name: "rice", quantity: 999, unit: "g" },
  ];
  const list = d.shoppingList(plan, seedRecipes, pantry, []);
  assert.equal(
    list.shopping_list_items.find((i) => i.name === "rice").quantity,
    2,
  );
  assert.equal(
    list.already_have_items.find((i) => i.name === "rice").quantity,
    1,
  );
  assert.equal(
    list.shopping_list_items.find((i) => i.name === "soy sauce").quantity,
    6,
  );
});

test("pantry availability is consumed across the whole plan, with no negative shortages", () => {
  const plan = d.generatePlan(settings(), user(), [recipe("r4")]);
  const list = d.shoppingList(
    plan,
    seedRecipes,
    [{ name: "rice", quantity: 10, unit: "cup" }],
    [],
  );
  assert(!list.shopping_list_items.some((i) => i.name === "rice"));
  assert.equal(
    list.already_have_items.find((i) => i.name === "rice").quantity,
    3,
  );
  assert(
    d
      .shoppingList(
        plan,
        seedRecipes,
        [{ name: "rice", quantity: null, unit: "cup" }],
        [],
      )
      .shopping_list_items.some((i) => i.name === "rice" && i.quantity === 3),
  );
});

test("manual purchases remain extra even when pantry already covers that ingredient", () => {
  const plan = d.generatePlan(settings(), user(), [recipe("r4")]);
  const list = d.shoppingList(
    plan,
    seedRecipes,
    [{ name: "rice", quantity: 100, unit: "cup" }],
    [{ id: "extra-rice", name: "rice", quantity: 2, unit: "cup" }],
  );
  assert.equal(
    list.shopping_list_items.find((i) => i.name === "rice").quantity,
    2,
  );
  assert.equal(
    list.shopping_list_items.find((i) => i.name === "rice").manual,
    true,
  );
});

test("leftovers reserve servings without double counting purchases and follow a swapped source", () => {
  const plan = d.generatePlan(settings({ days: 4, leftovers: true }), user(), [
    recipe("r4"),
  ]);
  assert.deepEqual(
    plan.entries.map((e) => e.kind),
    ["cook", "leftover", "cook", "leftover"],
  );
  assert.deepEqual(
    plan.entries.map((e) => e.servings),
    [4, 2, 4, 2],
  );
  assert.equal(
    d
      .shoppingList(plan, seedRecipes, [], [])
      .shopping_list_items.find((i) => i.name === "rice").quantity,
    4,
  );
  const swapped = d.swapPlan(
    plan,
    { version: 1, entry_id: plan.entries[0].id, new_recipe_id: "r1" },
    user(),
    seedRecipes,
  );
  assert.equal(swapped.entries[1].recipe_id, "r1");
  assert.equal(
    d
      .shoppingList(swapped, seedRecipes, [], [])
      .shopping_list_items.find((i) => i.name === "rice").quantity,
    2,
  );
  assert.throws(
    () =>
      d.swapPlan(
        plan,
        { version: 2, entry_id: plan.entries[1].id, new_recipe_id: "r4" },
        user(),
        seedRecipes,
      ),
    /original cooking day/,
  );
});

test("locked dinners and stale edits are rejected and single-candidate auto swaps explain failure", () => {
  const plan = d.generatePlan(settings(), user(), [recipe("r4")]);
  const payload = {
    version: 1,
    entry_id: plan.entries[0].id,
    new_recipe_id: "r1",
  };
  assert.throws(
    () => d.swapPlan(plan, { ...payload, version: 0 }, user(), seedRecipes),
    { status: 409 },
  );
  plan.entries[0].locked = true;
  assert.throws(() => d.swapPlan(plan, payload, user(), seedRecipes), /Unlock/);
  plan.entries[0].locked = false;
  assert.throws(() => d.swapPlan(plan, payload, user(), [recipe("r4")], true), {
    status: 422,
  });
});

test("dates, servings, units, and input boundaries reject invalid or ambiguous values", () => {
  for (const change of [
    { start_date: "2026-02-30" },
    { days: 8 },
    { servings: 1.5 },
    { servings: 0 },
    { max_minutes: 0 },
  ])
    assert.throws(() => d.generatePlan(settings(change), user(), seedRecipes));
  for (const change of [
    { quantity: -1 },
    { quantity: Infinity },
    { unit: "constructor" },
    { name: "<img onerror=alert(1)>" },
  ])
    assert.throws(() =>
      d.ingredient({ name: "rice", quantity: 1, unit: "cup", ...change }),
    );
  assert.equal(
    d.generatePlan(settings({ start_date: "2026-12-31" }), user(), seedRecipes)
      .entries[1].date,
    "2027-01-01",
  );
});

test("pantry additions merge compatible units and replace unknown amounts, preserving other items", () => {
  const pantry = [
    { id: "legacy", name: "rice", quantity: null, unit: "count" },
    { id: "carrot", name: "carrot", quantity: 1, unit: "count" },
  ];
  const updated = d.addPantry(pantry, {
    name: "white rice",
    quantity: 1,
    unit: "cup",
  });
  d.addPantry(updated, { name: "rice", quantity: 8, unit: "tbsp" });
  assert.equal(updated.find((i) => i.name === "rice").quantity, 1.5);
  assert.equal(updated.length, 2);
});

test("legacy unsupported exclusions cannot silently pass a new plan or swap", () => {
  const u = user({ dietary_restrictions: ["unknown allergy"] });
  assert.throws(
    () => d.generatePlan(settings(), u, seedRecipes),
    /Unrecognized exclusion/,
  );
});

test("swapping or resizing a cooked dinner invalidates its prior progress immediately", () => {
  const plan = d.generatePlan(settings({ leftovers: true }), user(), [
    recipe("r4"),
  ]);
  const entry = plan.entries[0];
  plan.progress[entry.id] = {
    recipe_id: entry.recipe_id,
    servings: entry.servings,
    step: 2,
    completed: false,
  };
  d.swapPlan(
    plan,
    { version: 1, entry_id: entry.id, new_recipe_id: "r1" },
    user(),
    seedRecipes,
  );
  assert.equal(plan.progress[entry.id], undefined);
  plan.progress[entry.id] = {
    recipe_id: entry.recipe_id,
    servings: entry.servings,
    step: 1,
  };
  plan.servings = 3;
  d.syncPlan(plan);
  assert.equal(plan.progress[entry.id], undefined);
});
