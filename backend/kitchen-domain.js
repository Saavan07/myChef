const { createHash, randomUUID } = require("node:crypto");
const d = require("./meal-domain");

function pantryRevision(pantry) {
  return createHash("sha256").update(JSON.stringify(pantry)).digest("hex");
}
function pantryResult(user) {
  return { pantry: user.pantry, pantry_revision: pantryRevision(user.pantry) };
}
function checkPantry(user, revision) {
  if (revision !== pantryRevision(user.pantry))
    throw new d.InputError(
      "Your pantry changed. Reload the amounts and review this change again.",
      409,
    );
}
function completeEntry(plan, id) {
  return plan.completions?.[id] || null;
}
function hasCompletions(plan) {
  return Object.keys(plan.completions || {}).length > 0;
}
function remainingEntries(plan) {
  return plan.entries.filter((e) => !completeEntry(plan, e.id));
}
function ensureRemainingMealsMatch(plan, recipes, user) {
  d.preferences(user, recipes);
  if (
    remainingEntries(plan)
      .filter((e) => e.kind === "cook")
      .some(
        (e) =>
          !d.eligible(
            recipes.find((r) => r.id === e.recipe_id) || { ingredients: [] },
            user,
            plan.max_minutes,
          ),
      )
  )
    throw new d.InputError(
      "Some remaining dinners no longer match your settings. Swap them before shopping.",
      422,
    );
}
function setPantryAmount(user, itemId, payload) {
  checkPantry(user, payload.pantry_revision);
  const item = user.pantry.find((i) => i.id === itemId);
  if (!item)
    throw new d.InputError(
      "That pantry entry no longer exists. Reload your pantry.",
      409,
    );
  const quantity = d.number(payload.quantity, "Amount remaining", 0, 100000);
  if (quantity === 0) user.pantry = user.pantry.filter((i) => i.id !== itemId);
  else if (item.quantity == null) {
    const measured = d.ingredient({
      name: item.name,
      quantity,
      unit: payload.unit,
    });
    user.pantry = d.addPantry(
      user.pantry.filter((i) => i.id !== itemId),
      measured,
    );
  } else item.quantity = quantity;
  return pantryResult(user);
}
function recordPurchases(user, plan, payload, recipes) {
  if (!/^[a-f0-9-]{36}$/.test(payload.operation_id || ""))
    throw new d.InputError("Please reopen the purchase review and try again.");
  // A retry after a lost response must not add the same groceries twice.
  const previous = (plan.purchases || []).find(
    (p) => p.id === payload.operation_id,
  );
  if (previous)
    return { receipt: previous, duplicate: true, ...pantryResult(user) };
  d.checkVersion(plan, payload.version);
  checkPantry(user, payload.pantry_revision);
  ensureRemainingMealsMatch(plan, recipes, user);
  if (
    !Array.isArray(payload.items) ||
    payload.items.length < 1 ||
    payload.items.length > 100
  )
    throw new d.InputError("Select between 1 and 100 purchases.");
  if ((plan.purchases || []).length >= 50)
    throw new d.InputError(
      "This plan has reached its purchase-history limit. Add further stock directly to your pantry.",
    );
  const list = d.shoppingList(
    plan,
    recipes,
    user.pantry,
    user.shopping_list_items,
  ).shopping_list_items;
  const seen = new Set();
  const items = payload.items.map((value) => {
    const item = list.find((i) => i.key === value?.key && i.checked);
    if (!item || seen.has(value.key))
      throw new d.InputError(
        "The checked shopping items changed. Reload the list and review your purchases again.",
        409,
      );
    seen.add(value.key);
    const measured = d.ingredient({
      name: item.name,
      quantity: value.quantity,
      unit: item.unit,
    });
    return {
      ...measured,
      shopping_key: item.key,
      manual_id: item.manual ? item.id : null,
    };
  });
  let next = structuredClone(user.pantry);
  for (const item of items) next = d.addPantry(next, item);
  if (next.length > 200 || next.some((i) => i.quantity > 100000))
    throw new d.InputError(
      "These purchases exceed the pantry limit. Record a smaller amount.",
    );
  user.pantry = next;
  const manualIds = items.map((i) => i.manual_id).filter(Boolean);
  user.shopping_list_items = user.shopping_list_items.filter(
    (i) => !manualIds.includes(i.id),
  );
  plan.checked = [];
  const receipt = {
    id: payload.operation_id,
    recorded_at: new Date().toISOString(),
    items,
  };
  plan.purchases ||= [];
  plan.purchases.push(receipt);
  return { receipt, duplicate: false, ...pantryResult(user) };
}
function cookingUsage(entry, recipe, pantry) {
  if (entry.kind === "leftover") return [];
  const totals = new Map();
  for (const ingredient of recipe.ingredients) {
    const key = d.ingredientKey(ingredient);
    const item = totals.get(key) || {
      name: ingredient.name,
      unit: ingredient.unit,
      quantity: 0,
      key,
    };
    item.quantity +=
      (((ingredient.quantity * entry.servings) / recipe.base_servings) *
        d.units[ingredient.unit][1]) /
      d.units[item.unit][1];
    totals.set(key, item);
  }
  return [...totals.values()].map((item) => ({
    ...item,
    quantity: d.round(item.quantity),
    available: d.round(
      pantry
        .filter((p) => p.quantity > 0 && d.ingredientKey(p) === item.key)
        .reduce(
          (sum, p) =>
            sum + (p.quantity * d.units[p.unit][1]) / d.units[item.unit][1],
          0,
        ),
    ),
  }));
}
function feedback(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new d.InputError(
      "Provide cooking observations as fields, or leave them blank.",
    );
  const actual_minutes =
    value.actual_minutes == null
      ? null
      : d.number(value.actual_minutes, "Actual minutes", 1, 1440, true);
  const portions = value.portions ?? null;
  if (![null, "too_small", "about_right", "too_large"].includes(portions))
    throw new d.InputError("Choose how the portions worked out.");
  const notes = value.notes ?? "";
  if (
    typeof notes !== "string" ||
    notes.length > 1000 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(notes)
  )
    throw new d.InputError(
      "Use up to 1,000 characters for your cooking notes.",
    );
  return { actual_minutes, portions, notes: notes.trim() };
}
function finishDinner(user, plan, entryId, payload, recipes) {
  const entry = plan.entries.find((e) => e.id === entryId);
  if (!entry) throw new d.InputError("Dinner not found.", 404);
  const previous = completeEntry(plan, entry.id);
  if (previous)
    return { completion: previous, duplicate: true, ...pantryResult(user) };
  d.checkVersion(plan, payload.version);
  checkPantry(user, payload.pantry_revision);
  const recipe = recipes.find((r) => r.id === entry.recipe_id);
  d.preferences(user, recipes);
  if (!recipe || !d.eligible(recipe, user, plan.max_minutes))
    throw new d.InputError(
      "This dinner no longer matches your saved settings. Change it before recording cooking.",
      422,
    );
  if (entry.kind === "leftover" && !completeEntry(plan, entry.source_entry_id))
    throw new d.InputError(
      "Record the original cooking day before serving its reserved leftovers.",
      409,
    );
  const expected = cookingUsage(entry, recipe, user.pantry);
  if (
    !Array.isArray(payload.used_ingredients) ||
    payload.used_ingredients.length !== expected.length
  )
    throw new d.InputError("Review each ingredient amount before finishing.");
  const seen = new Set();
  const used = payload.used_ingredients.map((value) => {
    const item = expected.find((i) => i.key === value?.key);
    if (!item || seen.has(value.key))
      throw new d.InputError(
        "The ingredients changed. Reopen the cooking review.",
        409,
      );
    seen.add(value.key);
    return {
      name: item.name,
      unit: item.unit,
      key: item.key,
      quantity: d.number(value.quantity, "Amount used", 0, 100000),
    };
  });
  const observations = feedback(payload.feedback);
  const deducted = [],
    untracked = [];
  const next = structuredClone(user.pantry);
  for (const item of used) {
    let remaining = item.quantity;
    for (const stock of next.filter(
      (p) => p.quantity > 0 && d.ingredientKey(p) === item.key,
    )) {
      const factor = d.units[stock.unit][1] / d.units[item.unit][1];
      const take = Math.min(stock.quantity, remaining / factor);
      if (take <= 0) continue;
      stock.quantity = d.round(stock.quantity - take);
      remaining = Math.max(0, d.round(remaining - take * factor));
      deducted.push({
        name: stock.name,
        unit: stock.unit,
        quantity: d.round(take),
      });
    }
    if (remaining > 0.000001)
      untracked.push({ name: item.name, unit: item.unit, quantity: remaining });
  }
  user.pantry = next.filter((i) => i.quantity == null || i.quantity > 0.000001);
  const completion = {
    entry_id: entry.id,
    recipe_id: entry.recipe_id,
    recipe_name: recipe.name,
    kind: entry.kind,
    servings: entry.servings,
    recorded_at: new Date().toISOString(),
    used_ingredients: used,
    deducted,
    untracked,
    feedback: observations,
  };
  plan.completions ||= {};
  plan.completions[entry.id] = completion;
  plan.progress ||= {};
  plan.progress[entry.id] = {
    recipe_id: entry.recipe_id,
    servings: entry.servings,
    step: (entry.kind === "leftover" ? 1 : recipe.steps.length) - 1,
    completed: true,
    timer_ends_at: null,
  };
  plan.checked = [];
  plan.version++;
  return { completion, duplicate: false, ...pantryResult(user) };
}
function undoDinner(user, plan, entryId, payload) {
  d.checkVersion(plan, payload.version);
  checkPantry(user, payload.pantry_revision);
  const completion = completeEntry(plan, entryId);
  if (!completion)
    throw new d.InputError("This dinner is not recorded as finished.", 409);
  if (
    plan.entries.some(
      (e) => e.source_entry_id === entryId && completeEntry(plan, e.id),
    )
  )
    throw new d.InputError(
      "Undo the served leftovers first, then undo the original dinner.",
      409,
    );
  let next = structuredClone(user.pantry);
  for (const item of completion.deducted) {
    const existing = next.find(
      (p) => p.quantity != null && d.ingredientKey(p) === d.ingredientKey(item),
    );
    // Restore the server-recorded amount exactly, including tiny converted quantities.
    if (existing)
      existing.quantity = d.round(
        existing.quantity +
          (item.quantity * d.units[item.unit][1]) / d.units[existing.unit][1],
      );
    else next.push({ ...item, id: randomUUID() });
  }
  if (next.length > 200 || next.some((i) => i.quantity > 100000))
    throw new d.InputError(
      "Restoring these ingredients would exceed the pantry limit. Adjust your pantry first.",
    );
  user.pantry = next;
  delete plan.completions[entryId];
  delete plan.progress[entryId];
  plan.checked = [];
  plan.version++;
  return pantryResult(user);
}
module.exports = {
  pantryRevision,
  pantryResult,
  checkPantry,
  completeEntry,
  hasCompletions,
  remainingEntries,
  ensureRemainingMealsMatch,
  setPantryAmount,
  recordPurchases,
  cookingUsage,
  feedback,
  finishDinner,
  undoDinner,
};
