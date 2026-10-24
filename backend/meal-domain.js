const { randomUUID } = require("node:crypto");

class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "InputError";
    this.status = status;
  }
}
const units = {
  count: ["count", 1],
  clove: ["clove", 1],
  slice: ["slice", 1],
  can: ["can", 1],
  cup: ["volume", 48],
  tbsp: ["volume", 3],
  tsp: ["volume", 1],
  ml: ["volume", 1 / 4.92892159375],
  l: ["volume", 1000 / 4.92892159375],
  g: ["mass", 1],
  kg: ["mass", 1000],
  oz: ["mass", 28.349523125],
  lb: ["mass", 453.59237],
};
const unitAliases = {
  "": "count",
  item: "count",
  items: "count",
  cups: "cup",
  cloves: "clove",
  slices: "slice",
  cans: "can",
  tablespoons: "tbsp",
  tablespoon: "tbsp",
  teaspoons: "tsp",
  teaspoon: "tsp",
  grams: "g",
  kilograms: "kg",
  ounces: "oz",
  pounds: "lb",
  lbs: "lb",
  liters: "l",
  milliliters: "ml",
};
const nameAliases = {
  eggs: "egg",
  bananas: "banana",
  carrots: "carrot",
  tomatoes: "tomato",
  "bell peppers": "bell pepper",
  "chicken breasts": "chicken breast",
  "garlic cloves": "garlic",
  "cloves garlic": "garlic",
  "white rice": "rice",
  "uncooked rice": "rice",
  "dry rice": "rice",
  "olive oils": "olive oil",
  "red lentil": "red lentils",
  chickpea: "chickpeas",
  "black bean": "black beans",
};
function normalizeName(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return Object.hasOwn(nameAliases, text) ? nameAliases[text] : text;
}
function normalizeUnit(value) {
  const text = String(value ?? "count")
    .trim()
    .toLowerCase();
  return Object.hasOwn(unitAliases, text) ? unitAliases[text] : text;
}
function text(value, label, max = 80) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    /[\x00-\x1f<>]/.test(value)
  )
    throw new InputError(
      `${label} must contain 1-${max} plain-text characters.`,
    );
  return value.trim();
}
function number(value, label, min, max, integer = false) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new InputError(
      `${label} must be ${integer ? "a whole number " : ""}between ${min} and ${max}.`,
    );
  return value;
}
function ingredient(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError("Enter an ingredient name, quantity, and unit.");
  const name = normalizeName(text(value.name, "Ingredient name"));
  const unit = normalizeUnit(value.unit);
  if (!Object.hasOwn(units, unit))
    throw new InputError(
      "Choose a supported unit. Package sizes such as cans stay separate from weights.",
    );
  return {
    name,
    quantity: number(value.quantity, "Quantity", 0.001, 100000),
    unit,
  };
}
const round = (n) => Math.round((n + Number.EPSILON) * 1000000) / 1000000;
function formatItem(item) {
  const qty = Number(item.quantity.toFixed(3));
  return `${qty} ${item.unit === "count" ? "" : `${item.unit} `}${item.name}`;
}
function ingredientKey(item) {
  return `${normalizeName(item.name)}|${units[normalizeUnit(item.unit)]?.[0] || item.unit}`;
}
function addPantry(pantry, value) {
  const item = ingredient(value);
  const existing = pantry.find(
    (entry) =>
      entry.quantity != null && ingredientKey(entry) === ingredientKey(item),
  );
  if (existing)
    existing.quantity = round(
      existing.quantity +
        (item.quantity * units[item.unit][1]) / units[existing.unit][1],
    );
  else pantry.push({ ...item, id: randomUUID() });
  return pantry.filter(
    (entry) =>
      entry.quantity != null || normalizeName(entry.name) !== item.name,
  );
}

const diets = ["vegetarian", "vegan", "gluten-free"];
const exclusionGroups = {
  milk: ["milk"],
  dairy: ["milk"],
  egg: ["egg"],
  eggs: ["egg"],
  soy: ["soy"],
  wheat: ["wheat"],
  gluten: ["wheat", "gluten"],
  peanut: ["peanut"],
  peanuts: ["peanut"],
  "tree nuts": ["tree nuts"],
  nuts: ["tree nuts", "peanut"],
  shellfish: ["shellfish"],
  fish: ["fish"],
  sesame: ["sesame"],
};
function normalizeRestriction(value) {
  return normalizeName(String(value).replace(/^(no|without)\s+/i, ""));
}
function preferences(payload, recipes) {
  const selected = payload.dietary_preferences;
  const excluded = payload.dietary_restrictions;
  if (
    !Array.isArray(selected) ||
    !Array.isArray(excluded) ||
    selected.length > 3 ||
    excluded.length > 30
  )
    throw new InputError(
      "Choose dietary settings and up to 30 ingredient exclusions.",
    );
  if (selected.some((tag) => !diets.includes(tag)))
    throw new InputError(
      "Supported diets are vegetarian, vegan, and gluten-free.",
    );
  const names = new Set(
    recipes.flatMap((r) => r.ingredients.map((i) => normalizeName(i.name))),
  );
  const restrictions = [
    ...new Set(
      excluded.map((item) => normalizeRestriction(text(item, "Exclusion"))),
    ),
  ];
  const unknown = restrictions.filter(
    (name) => !Object.hasOwn(exclusionGroups, name) && !names.has(name),
  );
  if (unknown.length)
    throw new InputError(
      `Unrecognized exclusion: ${unknown.join(", ")}. Choose a suggested ingredient or group so it can be checked reliably.`,
    );
  return {
    dietary_preferences: [...new Set(selected)],
    dietary_restrictions: restrictions,
  };
}
function eligible(recipe, user, maxMinutes = 180) {
  if (
    !recipe.base_servings ||
    !recipe.ingredients.every((i) => typeof i === "object" && i.quantity > 0)
  )
    return false;
  if (recipe.meal_type !== "dinner" || recipe.prep_time_minutes > maxMinutes)
    return false;
  if (
    !(user.dietary_preferences || []).every((tag) =>
      recipe.dietary_tags.includes(tag),
    )
  )
    return false;
  return (user.dietary_restrictions || []).every((value) => {
    const name = normalizeRestriction(value);
    return recipe.ingredients.every(
      (i) =>
        normalizeName(i.name) !== name &&
        !(
          Object.hasOwn(exclusionGroups, name) ? exclusionGroups[name] : []
        ).some((tag) => (i.allergens || []).includes(tag)),
    );
  });
}
function matchingRecipes(recipes, user, minutes) {
  preferences(
    {
      dietary_preferences: user.dietary_preferences || [],
      dietary_restrictions: user.dietary_restrictions || [],
    },
    recipes,
  );
  return recipes.filter((recipe) => eligible(recipe, user, minutes));
}
function chooseRecipe(candidates, user, used = [], excluding = null) {
  const available = candidates.filter((recipe) => recipe.id !== excluding);
  if (!available.length)
    throw new InputError(
      "No other dinner matches your saved dietary settings and cooking time. Keep this meal or adjust your settings.",
      422,
    );
  return available
    .map((recipe) => ({
      recipe,
      score:
        used.filter((id) => id === recipe.id).length * -100 +
        ((user.favorites || []).includes(recipe.id) ? 10 : 0) +
        recipe.ingredients.filter((i) =>
          user.pantry.some(
            (p) => p.quantity > 0 && ingredientKey(p) === ingredientKey(i),
          ),
        ).length,
    }))
    .sort((a, b) => b.score - a.score)[0].recipe;
}
function dateString(value) {
  if (typeof value !== "string" || !/^20\d\d-\d\d-\d\d$/.test(value))
    throw new InputError("Choose a valid start date between 2000 and 2099.");
  const date = new Date(`${value}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new InputError("Choose a valid start date.");
  return date;
}
function syncPlan(plan) {
  for (const entry of plan.entries) {
    if (entry.kind === "cook")
      entry.servings =
        plan.servings *
        (1 + plan.entries.filter((e) => e.source_entry_id === entry.id).length);
    else {
      const source = plan.entries.find((e) => e.id === entry.source_entry_id);
      entry.recipe_id = source.recipe_id;
      entry.servings = plan.servings;
    }
  }
  for (const entry of plan.entries) {
    const progress = plan.progress?.[entry.id];
    if (
      progress &&
      (progress.recipe_id !== entry.recipe_id ||
        progress.servings !== entry.servings)
    )
      delete plan.progress[entry.id];
  }
  plan.recipe_ids = plan.entries.map((e) => e.recipe_id);
  return plan;
}
function generatePlan(payload, user, recipes) {
  const date = dateString(payload.start_date);
  const days = number(payload.days, "Dinners", 1, 7, true);
  const servings = number(payload.servings, "People", 1, 8, true);
  const max = number(payload.max_minutes, "Cooking time", 10, 120, true);
  if (typeof payload.leftovers !== "boolean")
    throw new InputError("Choose whether to plan leftovers.");
  const candidates = matchingRecipes(recipes, user, max);
  if (!candidates.length)
    throw new InputError(
      "No dinners match all your saved dietary settings and cooking time. Adjust your settings or allow more time. Your exclusions have been kept.",
      422,
    );
  const plan = {
    id: randomUUID(),
    version: 1,
    start_date: payload.start_date,
    servings,
    max_minutes: max,
    entries: [],
    checked: [],
    progress: {},
    created_at: new Date().toISOString(),
  };
  for (let index = 0; index < days; index++) {
    const day = new Date(date);
    day.setUTCDate(date.getUTCDate() + index);
    const previous = plan.entries.at(-1);
    const leftover = payload.leftovers && index % 2 === 1;
    plan.entries.push({
      id: randomUUID(),
      date: day.toISOString().slice(0, 10),
      kind: leftover ? "leftover" : "cook",
      recipe_id: leftover
        ? previous.recipe_id
        : chooseRecipe(
            candidates,
            user,
            plan.entries.map((e) => e.recipe_id),
          ).id,
      source_entry_id: leftover ? previous.id : null,
      locked: false,
    });
  }
  return syncPlan(plan);
}
function planFrom(user, id) {
  const plan = user.meal_plans.find((p) => p.id === id);
  if (!plan) throw new InputError("Meal plan not found.", 404);
  if (!plan.entries)
    throw new InputError(
      "This is an older plan. Create a dinner plan to use quantities and cooking progress.",
      409,
    );
  return plan;
}
function checkVersion(plan, value) {
  if (value !== plan.version)
    throw new InputError(
      "This plan changed in another tab. Reload it before editing again.",
      409,
    );
}
function swapPlan(plan, payload, user, recipes, auto = false) {
  checkVersion(plan, payload.version);
  const entry = plan.entries.find((e) => e.id === payload.entry_id);
  if (!entry) throw new InputError("Dinner not found.", 404);
  if (entry.kind === "leftover")
    throw new InputError(
      "Swap the original cooking day to change its leftovers.",
    );
  if (plan.completions?.[entry.id])
    throw new InputError(
      "This dinner is already finished. Undo it before changing the recipe.",
      409,
    );
  if (entry.locked)
    throw new InputError("Unlock this dinner before swapping it.", 409);
  const candidates = matchingRecipes(recipes, user, plan.max_minutes);
  const recipe = auto
    ? chooseRecipe(candidates, user, plan.recipe_ids, entry.recipe_id)
    : candidates.find((r) => r.id === payload.new_recipe_id);
  if (!recipe)
    throw new InputError(
      "That dinner does not match your saved dietary settings or cooking time.",
      422,
    );
  entry.recipe_id = recipe.id;
  plan.version++;
  return syncPlan(plan);
}
function shoppingList(plan, recipes, pantry, manual) {
  const totals = new Map();
  for (const entry of plan.entries.filter(
    (e) => e.kind === "cook" && !plan.completions?.[e.id],
  )) {
    const recipe = recipes.find((r) => r.id === entry.recipe_id);
    if (!recipe?.base_servings)
      throw new InputError(
        "A recipe is unavailable. Swap that dinner before shopping.",
        409,
      );
    for (const i of recipe.ingredients) {
      const key = ingredientKey(i);
      const item = totals.get(key) || {
        name: i.name,
        quantity: 0,
        unit: i.unit,
        sources: [],
      };
      item.quantity +=
        (((i.quantity * entry.servings) / recipe.base_servings) *
          units[i.unit][1]) /
        units[item.unit][1];
      item.sources.push(recipe.name);
      totals.set(key, item);
    }
  }
  const shopping = [],
    covered = [];
  function result(item, quantity, manualItem = false) {
    const value = {
      ...item,
      quantity: round(quantity),
      sources: [...new Set(item.sources)],
      manual: manualItem,
    };
    value.key = `${manualItem ? `manual:${item.id}` : ingredientKey(item)}|${value.quantity}`;
    value.display = formatItem(value);
    value.checked = (plan.checked || []).includes(value.key);
    return value;
  }
  for (const [key, item] of totals) {
    const available = pantry
      .filter((p) => p.quantity > 0 && ingredientKey(p) === key)
      .reduce(
        (total, p) =>
          total + (p.quantity * units[p.unit][1]) / units[item.unit][1],
        0,
      );
    const used = Math.min(available, item.quantity);
    if (used > 0.000001) covered.push(result(item, used));
    if (item.quantity - used > 0.000001)
      shopping.push(result(item, item.quantity - used));
  }
  // Manual purchases are intentional extras, even when the pantry contains the same item.
  for (const item of manual)
    shopping.push(
      result({ ...item, sources: ["Extra item"] }, item.quantity, true),
    );
  return { shopping_list_items: shopping, already_have_items: covered };
}

module.exports = {
  InputError,
  units,
  diets,
  exclusionGroups,
  text,
  number,
  ingredient,
  normalizeName,
  normalizeUnit,
  formatItem,
  ingredientKey,
  addPantry,
  preferences,
  eligible,
  matchingRecipes,
  chooseRecipe,
  dateString,
  generatePlan,
  syncPlan,
  planFrom,
  checkVersion,
  swapPlan,
  shoppingList,
  round,
};
