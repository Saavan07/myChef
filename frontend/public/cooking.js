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
  const { recipe, entry, progress } = context.data;
  const current = recipe.steps[progress.step];
  const factor = entry.servings / recipe.base_servings;
  dialog.innerHTML = `
    <header class="cooking-header"><div><p class="eyebrow">${escape(entry.date)} | ${entry.kind === "leftover" ? "Leftovers" : `Cook ${entry.servings} portions`}</p><h2 id="cookingTitle">${escape(recipe.name)}</h2></div><button type="button" class="secondary-button" data-close>Close</button></header>
    <p class="cooking-error" role="alert">${escape(context.error || "")}</p>
    ${entry.kind === "cook" ? `<details class="cooking-ingredients" ${context.ingredientsOpen ? "open" : ""}><summary>Ingredients for ${entry.servings} portions</summary><ul>${recipe.ingredients.map((i) => `<li>${qty(i.quantity * factor)} ${i.unit === "count" ? "" : escape(i.unit)} ${escape(i.name)}</li>`).join("")}</ul><p class="inline-note">Rice, pasta, oats, and lentils are measured dry. Bean weights refer to canned package weights before draining.</p></details>` : "<p>Use the portion you reserved from the previous cooking day.</p>"}
    <p class="eyebrow">${progress.completed ? "Dinner complete" : `Step ${progress.step + 1} of ${recipe.steps.length}`}</p>
    <p class="cooking-instruction">${escape(current.instruction)}</p><p class="inline-note">${escape(current.tip || "")}</p>
    <div class="cooking-navigation"><button type="button" class="secondary-button" id="previousStep" ${progress.step === 0 ? "disabled" : ""}>Previous</button><button type="button" id="nextStep">${progress.completed ? "Cook again" : progress.step === recipe.steps.length - 1 ? "Finish cooking" : "Next step"}</button></div>
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
  dialog.querySelector("#nextStep").onclick = () =>
    save(
      progress.completed
        ? { step: 0, completed: false, timer_ends_at: null }
        : progress.step === recipe.steps.length - 1
          ? { completed: true, timer_ends_at: null }
          : { step: progress.step + 1, completed: false },
    );
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
