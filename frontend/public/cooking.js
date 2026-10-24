import { api } from "./api.js";
const dialog = document.querySelector("#cookingDialog");
let context = null;
let clock = null;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const qty = (n) => Number(n.toFixed(3));
function tick() {
  const output = dialog.querySelector("#timerOutput");
  if (!output || !context) return;
  const end = context.data.progress.timer_ends_at;
  if (!end) {
    output.textContent = "No timer running";
    return;
  }
  const seconds = Math.max(0, Math.ceil((end - Date.now()) / 1000));
  output.textContent = seconds
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} remaining`
    : "Timer finished. Check your food.";
}
async function save(changes) {
  if (!context || context.busy) return;
  const active = context;
  context.busy = true;
  dialog.querySelectorAll("button:not([data-close])").forEach((b) => {
    b.disabled = true;
  });
  try {
    const data = await api.saveCooking(
      active.userId,
      active.planId,
      active.entryId,
      { ...active.data.progress, ...changes, version: active.data.version },
    );
    if (context !== active) return;
    if (
      changes.step !== undefined &&
      changes.step !== active.data.progress.step
    )
      active.timerMinutes = null;
    active.data = data;
    context.error = "";
    render();
  } catch (error) {
    if (context !== active) return;
    context.error = error.message;
    if (error.status === 409) {
      try {
        const fresh = await api.cooking(
          active.userId,
          active.planId,
          active.entryId,
        );
        if (context !== active) return;
        active.data = fresh;
      } catch {
        /* Keep the unsaved state visible so the user can retry. */
      }
    }
    render();
  } finally {
    if (context === active) active.busy = false;
  }
}
function render() {
  if (context.data.completion) {
    renderCompletion();
    return;
  }
  if (context.review) {
    renderFinishReview();
    return;
  }
  const { recipe, entry, progress } = context.data;
  const current = recipe.steps[progress.step];
  const factor = entry.servings / recipe.base_servings;
  dialog.innerHTML = `
    <header class="cooking-header"><div><p class="eyebrow">${escape(entry.date)} | ${entry.kind === "leftover" ? "Leftovers" : `Cook ${entry.servings} portions`}</p><h2 id="cookingTitle">${escape(recipe.name)}</h2></div><button type="button" class="secondary-button" data-close>Close</button></header>
    <p class="cooking-error" role="alert">${escape(context.error || "")}</p>
    ${entry.kind === "cook" ? `<details class="cooking-ingredients" ${context.ingredientsOpen ? "open" : ""}><summary>Ingredients for ${entry.servings} portions</summary><ul>${recipe.ingredients.map((i) => `<li>${qty(i.quantity * factor)} ${i.unit === "count" ? "" : escape(i.unit)} ${escape(i.name)}</li>`).join("")}</ul><p class="inline-note">Rice, pasta, oats, and lentils are measured dry. Bean weights refer to canned package weights before draining.</p></details>` : "<p>Use the portion you reserved from the previous cooking day.</p>"}
    <p class="eyebrow">${progress.completed ? "Dinner complete" : `Step ${progress.step + 1} of ${recipe.steps.length}`}</p>
    <p class="cooking-instruction">${escape(current.instruction)}</p><p class="inline-note">${escape(current.tip || "")}</p>
    <div class="cooking-navigation"><button type="button" class="secondary-button" id="previousStep" ${progress.step === 0 ? "disabled" : ""}>Previous</button><button type="button" id="nextStep">${progress.completed || progress.step === recipe.steps.length - 1 ? "Review and finish" : "Next step"}</button></div>
    <section class="timer-controls"><label>Timer (minutes)<input id="timerMinutes" type="number" min="1" max="180" value="${context.timerMinutes || current.timer_minutes || 5}" /></label><button type="button" id="startTimer" class="secondary-button">Start timer</button><button type="button" id="clearTimer" class="secondary-button">Clear timer</button><p id="timerOutput" role="timer"></p></section>
    <p class="inline-note">Your step and timer are saved to this plan. Timer status resumes when you reopen it; no background alarm is sent.</p>
    ${entry.kind === "cook" ? '<p class="inline-note">Refrigerate reserved portions promptly in shallow containers, within 2 hours (1 hour above 90 F / 32 C). Use refrigerated leftovers within 3-4 days. <a href="https://www.foodsafety.gov/keep-food-safe/4-steps-to-food-safety" target="_blank" rel="noopener noreferrer">Food storage guidance</a></p>' : ""}
  `;
  const ingredients = dialog.querySelector(".cooking-ingredients");
  if (ingredients)
    ingredients.ontoggle = () => {
      if (context) context.ingredientsOpen = ingredients.open;
    };
  dialog.querySelector("[data-close]").onclick = closeCooking;
  dialog.querySelector("#previousStep").onclick = () =>
    save({ step: progress.step - 1, completed: false });
  dialog.querySelector("#nextStep").onclick = () => {
    if (progress.step === recipe.steps.length - 1 || progress.completed)
      beginFinishReview();
    else save({ step: progress.step + 1, completed: false });
  };
  dialog.querySelector("#startTimer").onclick = () => {
    const minutes = Number(dialog.querySelector("#timerMinutes").value);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
      context.error = "Choose a timer between 1 and 180 minutes.";
      render();
      return;
    }
    context.timerMinutes = minutes;
    save({ timer_ends_at: Date.now() + minutes * 60000 });
  };
  dialog.querySelector("#clearTimer").onclick = () =>
    save({ timer_ends_at: null });
  tick();
}
function observationFields(value = {}) {
  return `<div class="observation-fields"><label>Actual total time (minutes, optional)<input id="actualMinutes" type="number" min="1" max="1440" step="1" value="${value.actual_minutes ?? ""}" placeholder="Leave blank if you did not time it" /></label>
    <label>How were the portions? (optional)<select id="portionFeedback"><option value="">Not recorded</option><option value="too_small" ${value.portions === "too_small" ? "selected" : ""}>Too small</option><option value="about_right" ${value.portions === "about_right" ? "selected" : ""}>About right</option><option value="too_large" ${value.portions === "too_large" ? "selected" : ""}>Too large</option></select></label>
    <label class="wide-field">Cooking notes (optional)<textarea id="cookingNotes" maxlength="1000" rows="3" placeholder="What would you change next time?">${escape(value.notes || "")}</textarea></label></div>`;
}
function observations() {
  const minutes = dialog.querySelector("#actualMinutes").value;
  return {
    actual_minutes: minutes === "" ? null : Number(minutes),
    portions: dialog.querySelector("#portionFeedback").value || null,
    notes: dialog.querySelector("#cookingNotes").value,
  };
}
async function beginFinishReview() {
  const active = context;
  if (!active || active.busy) return;
  active.busy = true;
  try {
    const fresh = await api.cooking(
      active.userId,
      active.planId,
      active.entryId,
    );
    if (context !== active) return;
    const changed =
      fresh.entry.recipe_id !== active.data.entry.recipe_id ||
      fresh.entry.servings !== active.data.entry.servings;
    active.data = fresh;
    if (changed) active.finishDraft = null;
    active.error = changed
      ? "The recipe or portions changed in another tab. Review the updated dinner before recording it."
      : "";
    active.review = !changed;
    render();
  } catch (error) {
    if (context === active) {
      active.error = error.message;
      render();
    }
  } finally {
    if (context === active) active.busy = false;
  }
}
function renderFinishReview() {
  const { entry, recipe, usage, source_finished } = context.data;
  dialog.innerHTML = `<header class="cooking-header"><div><p class="eyebrow">Record your dinner</p><h2 id="cookingTitle">${escape(recipe.name)}</h2></div><button type="button" data-back class="secondary-button">Back</button></header>
    <form id="finishDinnerForm">
      ${entry.kind === "cook" ? `<p>Review what you actually used for this ${entry.servings}-portion batch. Only the amounts available in your tracked pantry will be deducted.</p><div class="usage-list">${usage.map((item, index) => `<label>${escape(item.name)} (${escape(item.unit === "count" ? "items" : item.unit)})<input data-usage="${index}" type="number" min="0" max="100000" step="any" value="${context.finishDraft?.used_ingredients?.find((i) => i.key === item.key)?.quantity ?? item.quantity}" required /><span class="inline-note">Tracked pantry: ${qty(item.available)} ${escape(item.unit === "count" ? "items" : item.unit)}. Any excess will be recorded as untracked.</span></label>`).join("")}</div>` : `<p>Serving these leftovers does not deduct raw ingredients again.</p>${!source_finished ? '<p class="warning-text">Record the original cooking day first.</p>' : ""}`}
      <h3>How did it go?</h3><p class="inline-note">These are your observations. Leave anything you did not measure blank.</p>${observationFields(context.finishDraft?.feedback)}
      <label class="check-field finish-confirm"><input id="finishConfirmed" type="checkbox" required />I ${entry.kind === "leftover" ? "served these leftovers" : "cooked this dinner and reviewed the amounts above"}.</label>
      <p class="cooking-error" role="alert">${escape(context.error || "")}</p><button type="submit" ${!source_finished ? "disabled" : ""}>Save finished dinner</button>
    </form>`;
  dialog.querySelector("[data-back]").onclick = () => {
    context.finishDraft = {
      feedback: observations(),
      used_ingredients: [...dialog.querySelectorAll("[data-usage]")].map(
        (input) => ({
          key: usage[Number(input.dataset.usage)].key,
          quantity: Number(input.value),
        }),
      ),
    };
    context.review = false;
    context.error = "";
    render();
  };
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const active = context;
    if (!active || active.busy) return;
    const payload = {
      version: active.data.version,
      pantry_revision: active.data.pantry_revision,
      feedback: observations(),
      used_ingredients: [...dialog.querySelectorAll("[data-usage]")].map(
        (input) => ({
          key: usage[Number(input.dataset.usage)].key,
          quantity: Number(input.value),
        }),
      ),
    };
    active.busy = true;
    const button = dialog.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api.finishDinner(
        active.userId,
        active.planId,
        active.entryId,
        payload,
      );
      window.dispatchEvent(new Event("mychef:kitchen-changed"));
      const fresh = await api.cooking(
        active.userId,
        active.planId,
        active.entryId,
      );
      if (context !== active) return;
      active.data = fresh;
      active.feedbackDraft = null;
      active.review = false;
      active.error = "";
      render();
    } catch (error) {
      if (context === active)
        dialog.querySelector(".cooking-error").textContent =
          error.status === 409
            ? `${error.message} Go back and reopen the review.`
            : `${error.message} Retrying will not deduct ingredients twice.`;
    } finally {
      if (context === active) {
        active.busy = false;
        button.disabled = false;
      }
    }
  };
}
function renderCompletion() {
  const { completion } = context.data;
  dialog.innerHTML = `<header class="cooking-header"><div><p class="eyebrow">${completion.kind === "leftover" ? "Leftovers served" : "Dinner finished"}</p><h2 id="cookingTitle">${escape(completion.recipe_name)}</h2></div><button type="button" data-close class="secondary-button">Close</button></header>
    <p>This dinner is saved. Shopping now covers the remaining cooking days.</p>
    ${completion.deducted.length ? `<details><summary>Amounts deducted from the pantry</summary><ul>${completion.deducted.map((i) => `<li>${qty(i.quantity)} ${escape(i.unit === "count" ? "" : i.unit)} ${escape(i.name)}</li>`).join("")}</ul></details>` : '<p class="inline-note">No tracked pantry amounts were deducted.</p>'}
    ${completion.untracked.length ? `<p class="inline-note">Some ingredients were not fully recorded in your pantry. Their quantities were left at zero, not made negative: ${escape(completion.untracked.map((i) => `${qty(i.quantity)} ${i.unit} ${i.name}`).join(", "))}.</p>` : ""}
    <form id="observationsForm"><h3>Your cooking notes</h3>${observationFields(context.feedbackDraft || completion.feedback)}<button type="submit">Save cooking notes</button></form>
    <p role="alert" class="cooking-error">${escape(context.error || "")}</p>
    <button type="button" id="undoDinner" class="secondary-button">Undo finished dinner</button><p class="inline-note">Undo adds back only the amounts actually deducted. It does not remove groceries you purchased.</p>`;
  dialog.querySelector("[data-close]").onclick = closeCooking;
  async function update(operation, undo = false) {
    const active = context;
    if (!active || active.busy) return;
    active.busy = true;
    dialog.querySelectorAll("button:not([data-close])").forEach((b) => {
      b.disabled = true;
    });
    try {
      await operation(active);
      window.dispatchEvent(new Event("mychef:kitchen-changed"));
      if (undo) {
        if (context === active) closeCooking();
        return;
      }
      const fresh = await api.cooking(
        active.userId,
        active.planId,
        active.entryId,
      );
      if (context !== active) return;
      active.data = fresh;
      active.feedbackDraft = null;
      active.review = false;
      active.error = "";
      render();
    } catch (error) {
      if (context === active) {
        active.error = error.message;
        render();
      }
    } finally {
      if (context === active) active.busy = false;
    }
  }
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    const feedback = observations();
    context.feedbackDraft = feedback;
    update((active) =>
      api.saveFeedback(active.userId, active.planId, active.entryId, {
        version: active.data.version,
        feedback,
      }),
    );
  };
  dialog.querySelector("#undoDinner").onclick = () => {
    const amounts = completion.deducted
      .map((i) => `${qty(i.quantity)} ${i.unit} ${i.name}`)
      .join(", ");
    if (
      !window.confirm(
        `Undo this dinner? ${amounts ? `Add back ${amounts} to your current pantry.` : "No pantry stock will be added."}`,
      )
    )
      return;
    update(
      (active) =>
        api.undoDinner(active.userId, active.planId, active.entryId, {
          version: active.data.version,
          pantry_revision: active.data.pantry_revision,
        }),
      true,
    );
  };
}
export async function openCooking(userId, planId, entryId) {
  const data = await api.cooking(userId, planId, entryId);
  context = {
    userId,
    planId,
    entryId,
    data,
    busy: false,
    error: "",
    ingredientsOpen: window.innerWidth >= 600,
  };
  render();
  dialog.showModal();
  clearInterval(clock);
  clock = setInterval(tick, 1000);
}
export function closeCooking() {
  dialog.close();
  clearInterval(clock);
  context = null;
}
dialog.addEventListener("cancel", () => {
  clearInterval(clock);
  context = null;
});
