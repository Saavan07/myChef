const { createHash } = require("node:crypto");
const d = require("./meal-domain");
const k = require("./kitchen-domain");
const { schema } = require("./assistant-provider");

const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function request(payload) {
  if (!payload || !/^[a-f0-9-]{36}$/i.test(payload.operation_id || ""))
    throw new d.InputError("Start a new assistant request.");
  d.number(payload.version, "Plan version", 1, Number.MAX_SAFE_INTEGER, true);
  d.dateString(payload.local_date);
  if (
    !Array.isArray(payload.messages) ||
    !payload.messages.length ||
    payload.messages.length > 7
  )
    throw new d.InputError(
      "Start a new request after a few follow-up questions.",
    );
  const messages = payload.messages.map((m, index) => {
    const role = index % 2 ? "assistant" : "user";
    if (m?.role !== role)
      throw new d.InputError("Start a new assistant request.");
    if (
      typeof m.content !== "string" ||
      !m.content.trim() ||
      m.content.trim().length > 800 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(m.content)
    )
      throw new d.InputError("Enter a meal-swap request of 1-800 characters.");
    return { role, content: m.content.trim() };
  });
  if (messages.at(-1).role !== "user")
    throw new d.InputError("Enter a meal-swap request.");
  const result = {
    operation_id: payload.operation_id,
    version: payload.version,
    local_date: payload.local_date,
    messages,
  };
  result.fingerprint = hash(result);
  return result;
}

function replay(plan, input) {
  const saved = (plan.assistant_operations || []).find(
    (op) => op.id === input.operation_id,
  );
  if (!saved) return null;
  if (saved.fingerprint !== input.fingerprint)
    throw new d.InputError(
      "This request was already used. Send a new request.",
      409,
    );
  return { ...saved.result, replayed: true };
}

// Check changes that affect the interpretation, while allowing harmless checkbox changes.
function revision(user, plan, all) {
  return hash({
    version: plan.version,
    entries: plan.entries,
    preferences: user.dietary_preferences,
    restrictions: user.dietary_restrictions,
    pantry: user.pantry,
    favorites: user.favorites,
    recipes: all,
  });
}

function context(user, plan, all, localDate) {
  const candidates = d.matchingRecipes(all, user, plan.max_minutes);
  return {
    local_date: localDate,
    saved_diets: user.dietary_preferences,
    saved_exclusions: user.dietary_restrictions,
    max_minutes: plan.max_minutes,
    people: plan.servings,
    plan: plan.entries.map((e) => ({
      date: e.date,
      weekday: new Date(`${e.date}T12:00:00Z`).toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "UTC",
      }),
      kind: e.kind,
      recipe_name: all.find((r) => r.id === e.recipe_id)?.name,
      source_date:
        plan.entries.find((s) => s.id === e.source_entry_id)?.date || null,
      locked: e.locked,
      finished: Boolean(k.completeEntry(plan, e.id)),
    })),
    eligible_recipes: candidates.map((r) => ({
      id: r.id,
      name: r.name,
      minutes: r.prep_time_minutes,
      ingredients: r.ingredients.map((i) => i.name),
      diets: r.dietary_tags,
    })),
    ingredient_names: [
      ...new Set(all.flatMap((r) => r.ingredients.map((i) => i.name))),
    ],
    exclusion_groups: Object.keys(d.exclusionGroups),
    diet_options: d.diets,
    pantry: user.pantry.map(({ name, quantity, unit }) => ({
      name,
      quantity,
      unit,
    })),
  };
}

function validateIntent(value) {
  const invalid = () => {
    throw new d.InputError(
      "The assistant returned an unclear request. Your plan was kept. Try naming the day and replacement.",
      502,
    );
  };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !==
      Object.keys(schema.properties).sort().join()
  )
    invalid();
  if (
    !["swap", "clarify", "unsupported"].includes(value.action) ||
    typeof value.quicker !== "boolean" ||
    typeof value.question !== "string" ||
    value.question.length > 800
  )
    invalid();
  for (const field of ["date", "recipe_id"])
    if (
      value[field] !== null &&
      (typeof value[field] !== "string" || value[field].length > 80)
    )
      invalid();
  if (
    value.max_minutes !== null &&
    (!Number.isInteger(value.max_minutes) ||
      value.max_minutes < 1 ||
      value.max_minutes > 180)
  )
    invalid();
  for (const field of ["include_ingredients", "exclude_ingredients", "diets"])
    if (
      !Array.isArray(value[field]) ||
      value[field].length > 30 ||
      value[field].some(
        (v) => typeof v !== "string" || !v.trim() || v.length > 80,
      )
    )
      invalid();
  if (value.action !== "swap" && !value.question.trim()) invalid();
  return value;
}

function shopping(user, plan, all) {
  const warnings = k
    .remainingEntries(plan)
    .filter(
      (e) =>
        e.kind === "cook" &&
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
  return {
    ...(warnings.length
      ? { shopping_list_items: [], already_have_items: [] }
      : d.shoppingList(plan, all, user.pantry, user.shopping_list_items)),
    warnings,
  };
}

function apply(user, plan, all, input, rawIntent, expectedRevision) {
  const previous = replay(plan, input);
  if (previous) return previous;
  d.checkVersion(plan, input.version);
  if (revision(user, plan, all) !== expectedRevision)
    throw new d.InputError(
      "Your plan, pantry or dietary settings changed while the assistant was thinking. Review the latest plan and send a new request.",
      409,
    );
  const intent = validateIntent(rawIntent);
  let result;
  if (intent.action !== "swap") {
    result = {
      status: intent.action,
      message: intent.question.trim().replaceAll("\u2014", ","),
      changed: [],
    };
  } else {
    const entry = plan.entries.find((e) => e.date === intent.date);
    if (!entry)
      throw new d.InputError(
        "Name one date or weekday from this plan so I know which dinner to swap.",
        422,
      );
    if (entry.kind !== "cook")
      throw new d.InputError(
        "Swap the original cooking day to update its reserved leftovers.",
        422,
      );
    if (entry.locked || k.completeEntry(plan, entry.id))
      throw new d.InputError(
        "That dinner is kept or already finished. Choose an unfinished, unlocked cooking day.",
        409,
      );
    if (
      plan.entries.some(
        (e) => e.source_entry_id === entry.id && k.completeEntry(plan, e.id),
      )
    )
      throw new d.InputError(
        "A reserved portion of this dinner is already finished, so this batch cannot be changed.",
        409,
      );
    const additional = d.preferences(
      {
        dietary_preferences: [
          ...new Set([...user.dietary_preferences, ...intent.diets]),
        ],
        dietary_restrictions: [
          ...new Set([
            ...user.dietary_restrictions,
            ...intent.exclude_ingredients,
          ]),
        ],
      },
      all,
    );
    const ingredientNames = new Set(
      all.flatMap((r) => r.ingredients.map((i) => i.name)),
    );
    if (intent.include_ingredients.some((name) => !ingredientNames.has(name)))
      throw new d.InputError(
        "I could not match a requested ingredient to this recipe collection. Try its ingredient name from the pantry suggestions.",
        422,
      );
    const oldRecipe = all.find((r) => r.id === entry.recipe_id);
    const max = Math.min(
      plan.max_minutes,
      intent.max_minutes ?? plan.max_minutes,
      intent.quicker
        ? (oldRecipe?.prep_time_minutes || 0) - 1
        : plan.max_minutes,
    );
    const candidates = d
      .matchingRecipes(all, { ...user, ...additional }, max)
      .filter(
        (r) =>
          r.id !== entry.recipe_id &&
          intent.include_ingredients.every((name) =>
            r.ingredients.some((i) => i.name === name),
          ) &&
          (!intent.recipe_id || r.id === intent.recipe_id),
      );
    if (!candidates.length) {
      result = {
        status: "no_match",
        message:
          "I couldn't find a different dinner that meets all of your request and saved dietary settings in this recipe collection. Your plan was kept. Try another ingredient or allow more time within your plan's limit.",
        changed: [],
      };
    } else {
      const selected = d.chooseRecipe(
        candidates,
        user,
        plan.recipe_ids,
        entry.recipe_id,
      );
      const affected = plan.entries.filter(
        (e) => e.id === entry.id || e.source_entry_id === entry.id,
      );
      d.swapPlan(
        plan,
        {
          version: input.version,
          entry_id: entry.id,
          new_recipe_id: selected.id,
        },
        user,
        all,
      );
      // A swap changes quantities. Require a fresh review before recording purchases.
      plan.checked = [];
      const list = shopping(user, plan, all);
      result = {
        status: "swapped",
        message: `Changed ${entry.date} from ${oldRecipe?.name || "your previous dinner"} to ${selected.name} (${selected.prep_time_minutes} estimated minutes).${affected.length > 1 ? " Its reserved leftover dinner was updated too." : ""} ${list.warnings.length ? "Another dinner still conflicts with your settings; swap it to restore the shopping list." : "Your shopping list is updated using your pantry amounts."} Saved dietary settings were kept. Shopping checkmarks were cleared for a fresh review.`,
        changed: affected.map((e) => ({
          date: e.date,
          kind: e.kind,
          from: oldRecipe?.name || "Previous dinner",
          to: selected.name,
        })),
      };
    }
  }
  plan.assistant_operations = [
    ...(plan.assistant_operations || []),
    { id: input.operation_id, fingerprint: input.fingerprint, result },
  ].slice(-50);
  return result;
}

module.exports = {
  request,
  replay,
  revision,
  context,
  validateIntent,
  shopping,
  apply,
};
