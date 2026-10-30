import { api } from "./api.js";
const dialog = document.querySelector("#purchaseDialog");
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let active = null;
export function closePurchases() {
  active = null;
  dialog.close();
}
export async function openPurchases(userId, planId) {
  const [list, plans] = await Promise.all([
    api.getShoppingList(userId, planId),
    api.getMealPlans(userId),
  ]);
  const plan = plans.find((p) => p.id === planId);
  const items = list.shopping_list_items.filter((i) => i.checked);
  if (!plan || list.warnings.length || !items.length)
    throw new Error(
      "Reload your shopping list and check the purchases you want to record.",
    );
  active = {
    userId,
    planId,
    version: plan.version,
    pantry_revision: list.pantry_revision,
    items,
    operation_id: crypto.randomUUID(),
  };
  dialog.innerHTML = `<header class="cooking-header"><h2 id="purchaseTitle">Put groceries away</h2><button type="button" class="secondary-button" data-close>Cancel</button></header>
    <p>Confirm the amounts you actually bought, using the units shown. They will be added to your current pantry. Extra shopping items recorded here will be removed from the list.</p>
    <form id="purchaseForm"><div class="purchase-items">${items.map((item, i) => `<label>${escape(item.name)} (${escape(item.unit === "count" ? "items" : item.unit)})<input data-index="${i}" type="number" min="0.001" max="100000" step="any" value="${item.quantity}" required /></label>`).join("")}</div>
    <p class="inline-note">Checkmarks alone never change stock. If you bought a different package size, adjust these amounts first. Keep weights and volumes separate.</p>
    <p role="alert" class="cooking-error" id="purchaseError"></p><button type="submit">Add purchases to pantry</button></form>`;
  dialog.querySelector("[data-close]").onclick = closePurchases;
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const current = active;
    if (!current || current.busy) return;
    current.busy = true;
    const button = dialog.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api.recordPurchases(current.userId, current.planId, {
        operation_id: current.operation_id,
        version: current.version,
        pantry_revision: current.pantry_revision,
        items: [...dialog.querySelectorAll("[data-index]")].map((input) => ({
          key: current.items[Number(input.dataset.index)].key,
          quantity: Number(input.value),
        })),
      });
      window.dispatchEvent(new Event("mychef:kitchen-changed"));
      if (active !== current) return;
      closePurchases();
    } catch (error) {
      if (active === current)
        dialog.querySelector("#purchaseError").textContent =
          error.status === 409
            ? `${error.message} Close this review and reopen it before saving.`
            : `${error.message} You can retry safely.`;
    } finally {
      if (active === current) {
        current.busy = false;
        button.disabled = false;
      }
    }
  };
  dialog.showModal();
}
dialog.addEventListener("cancel", () => {
  active = null;
});
