const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const d = require("../backend/meal-domain");
const k = require("../backend/kitchen-domain");
const { seedRecipes } = require("../backend/seedRecipes");
const stir = seedRecipes.find((r) => r.id === "r4");
function setup(leftovers = false) {
  const user = {
    pantry: [{ id: "rice", name: "rice", quantity: 1, unit: "cup" }],
    favorites: [],
    dietary_preferences: [],
    dietary_restrictions: [],
    shopping_list_items: [],
  };
  const plan = d.generatePlan(
    {
      start_date: "2026-10-26",
      days: 3,
      servings: 2,
      max_minutes: 30,
      leftovers,
    },
    user,
    [stir],
  );
  user.meal_plans = [plan];
  return { user, plan };
}
function finishPayload(user, plan, entry = plan.entries[0]) {
  return {
    version: plan.version,
    pantry_revision: k.pantryRevision(user.pantry),
    used_ingredients: k
      .cookingUsage(entry, stir, user.pantry)
      .map((i) => ({ key: i.key, quantity: i.quantity })),
    feedback: {
      actual_minutes: 34,
      portions: "about_right",
      notes: "Needed a larger pan.",
    },
  };
}

test("checked purchases add actual amounts once and retire purchased manual extras", () => {
  const { user, plan } = setup();
  user.shopping_list_items.push({
    id: "apples",
    name: "apple",
    quantity: 3,
    unit: "count",
  });
  const list = d.shoppingList(
    plan,
    seedRecipes,
    user.pantry,
    user.shopping_list_items,
  ).shopping_list_items;
  const selected = list.filter((i) => ["rice", "apple"].includes(i.name));
  plan.checked = selected.map((i) => i.key);
  const payload = {
    operation_id: randomUUID(),
    version: plan.version,
    pantry_revision: k.pantryRevision(user.pantry),
    items: selected.map((i) => ({
      key: i.key,
      quantity: i.name === "rice" ? 5 : i.quantity,
    })),
  };
  k.recordPurchases(user, plan, payload, seedRecipes);
  assert.equal(user.pantry.find((i) => i.name === "rice").quantity, 6);
  assert.equal(user.pantry.find((i) => i.name === "apple").quantity, 3);
  assert.equal(user.shopping_list_items.length, 0);
  assert.equal(
    k.recordPurchases(user, plan, payload, seedRecipes).duplicate,
    true,
  );
  assert.equal(user.pantry.find((i) => i.name === "rice").quantity, 6);
});

test("purchase reviews reject stale pantry, changed items, duplicates, and unchecked purchases", () => {
  const { user, plan } = setup();
  const item = d.shoppingList(plan, seedRecipes, user.pantry, [])
    .shopping_list_items[0];
  const payload = {
    operation_id: randomUUID(),
    version: plan.version,
    pantry_revision: k.pantryRevision(user.pantry),
    items: [{ key: item.key, quantity: 2 }],
  };
  assert.throws(() => k.recordPurchases(user, plan, payload, seedRecipes), {
    status: 409,
  });
  plan.checked = [item.key];
  assert.throws(
    () =>
      k.recordPurchases(
        user,
        plan,
        { ...payload, items: [payload.items[0], payload.items[0]] },
        seedRecipes,
      ),
    { status: 409 },
  );
  user.pantry[0].quantity = 2;
  assert.throws(() => k.recordPurchases(user, plan, payload, seedRecipes), {
    status: 409,
  });
  assert.equal(user.pantry[0].quantity, 2);
});

test("finishing consumes measured stock once, records untracked ingredients, and excludes the cooked day", () => {
  const { user, plan } = setup();
  const payload = finishPayload(user, plan);
  const { completion } = k.finishDinner(
    user,
    plan,
    plan.entries[0].id,
    payload,
    seedRecipes,
  );
  assert.equal(user.pantry.length, 0);
  assert.equal(completion.deducted.find((i) => i.name === "rice").quantity, 1);
  assert(completion.untracked.some((i) => i.name === "tofu"));
  assert.equal(completion.feedback.actual_minutes, 34);
  assert.equal(
    d
      .shoppingList(plan, seedRecipes, user.pantry, [])
      .shopping_list_items.find((i) => i.name === "rice").quantity,
    2,
  );
  assert(
    k.finishDinner(user, plan, plan.entries[0].id, payload, seedRecipes)
      .duplicate,
  );
  assert.equal(user.pantry.length, 0);
});

test("finish review accepts changed actual use, preserves compatible leftover stock, and rejects incomplete input", () => {
  const { user, plan } = setup();
  user.pantry[0] = { id: "rice", name: "rice", quantity: 32, unit: "tbsp" };
  const payload = finishPayload(user, plan);
  assert.throws(() =>
    k.finishDinner(
      user,
      plan,
      plan.entries[0].id,
      { ...payload, used_ingredients: [] },
      seedRecipes,
    ),
  );
  payload.used_ingredients.find((i) => i.key.startsWith("rice|")).quantity =
    0.5;
  k.finishDinner(user, plan, plan.entries[0].id, payload, seedRecipes);
  assert.equal(user.pantry[0].quantity, 24);
});

test("leftovers require the original batch, deduct nothing again, and enforce undo order", () => {
  const { user, plan } = setup(true);
  const leftover = plan.entries[1];
  assert.throws(
    () =>
      k.finishDinner(
        user,
        plan,
        leftover.id,
        finishPayload(user, plan, leftover),
        seedRecipes,
      ),
    { status: 409 },
  );
  k.finishDinner(
    user,
    plan,
    plan.entries[0].id,
    finishPayload(user, plan),
    seedRecipes,
  );
  assert.equal(
    d
      .shoppingList(plan, seedRecipes, user.pantry, [])
      .shopping_list_items.find((i) => i.name === "rice").quantity,
    1,
  );
  const result = k.finishDinner(
    user,
    plan,
    leftover.id,
    finishPayload(user, plan, leftover),
    seedRecipes,
  );
  assert.deepEqual(result.completion.deducted, []);
  assert.throws(
    () =>
      k.undoDinner(user, plan, plan.entries[0].id, {
        version: plan.version,
        pantry_revision: k.pantryRevision(user.pantry),
      }),
    /leftovers first/,
  );
  k.undoDinner(user, plan, leftover.id, {
    version: plan.version,
    pantry_revision: k.pantryRevision(user.pantry),
  });
  k.undoDinner(user, plan, plan.entries[0].id, {
    version: plan.version,
    pantry_revision: k.pantryRevision(user.pantry),
  });
  assert.equal(user.pantry.find((i) => i.name === "rice").quantity, 1);
  assert.equal(user.pantry.length, 1); // Untracked ingredients must not appear on undo.
});

test("undo restores tiny converted quantities and cannot be applied twice", () => {
  const { user, plan } = setup();
  user.pantry.push({ id: "sauce", name: "soy sauce", quantity: 1, unit: "l" });
  const payload = finishPayload(user, plan);
  payload.used_ingredients.find((i) =>
    i.key.startsWith("soy sauce|"),
  ).quantity = 0.01;
  k.finishDinner(user, plan, plan.entries[0].id, payload, seedRecipes);
  const undo = {
    version: plan.version,
    pantry_revision: k.pantryRevision(user.pantry),
  };
  k.undoDinner(user, plan, plan.entries[0].id, undo);
  assert.equal(user.pantry.find((i) => i.name === "soy sauce").quantity, 1);
  assert.throws(() => k.undoDinner(user, plan, plan.entries[0].id, undo), {
    status: 409,
  });
});

test("pantry edits set remaining stock rather than adding it and detect stale edits", () => {
  const { user } = setup();
  const revision = k.pantryRevision(user.pantry);
  k.setPantryAmount(user, "rice", { quantity: 0.5, pantry_revision: revision });
  assert.equal(user.pantry[0].quantity, 0.5);
  assert.throws(
    () =>
      k.setPantryAmount(user, "rice", {
        quantity: 3,
        pantry_revision: revision,
      }),
    { status: 409 },
  );
  k.setPantryAmount(user, "rice", {
    quantity: 0,
    pantry_revision: k.pantryRevision(user.pantry),
  });
  assert.deepEqual(user.pantry, []);
});

test("blank observations stay unknown and invalid observations do not mutate inventory", () => {
  assert.deepEqual(k.feedback(), {
    actual_minutes: null,
    portions: null,
    notes: "",
  });
  assert.throws(() => k.feedback(null));
  assert.throws(() => k.feedback({ actual_minutes: -1 }));
  const { user, plan } = setup();
  assert.throws(() =>
    k.finishDinner(
      user,
      plan,
      plan.entries[0].id,
      { ...finishPayload(user, plan), feedback: { portions: "perfect" } },
      seedRecipes,
    ),
  );
  assert.equal(user.pantry[0].quantity, 1);
  assert.equal(k.hasCompletions(plan), false);
});
