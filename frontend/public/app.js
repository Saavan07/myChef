import { api } from "/api.js";
import { openCooking, closeCooking } from "/cooking.js";
import { openPurchases, closePurchases } from "/purchases.js";

const storageKey = "mychef-session";
const weekDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const recipesPerPage = 4;
const storesPerPage = 3;
const defaultShopLocation = {
  latitude: 40.1106,
  longitude: -88.2284,
  label: "UIUC campus default",
};

const state = {
  userId: null,
  username: "",
  authMode: "login",
  authLoading: false,
  appLoading: false,
  statusMessage: "",
  errorMessage: "",
  recipeFilter: "",
  allRecipes: [],
  recipes: [],
  recipePage: 1,
  recipeDetails: new Map(),
  selectedRecipeId: null,
  preferences: [],
  restrictions: [],
  pantry: [],
  pantryRevision: null,
  favorites: [],
  manualShoppingItems: [],
  mealPlans: [],
  planCandidates: [],
  shoppingWarnings: [],
  activePlanId: null,
  shopLocation: null,
  nearbyStores: [],
  storePage: 1,
  selectedStoreId: null,
  storeReviews: {},
  shoppingListItems: [],
  alreadyHaveItems: [],
  panelLoading: {
    recipes: false,
    preferences: false,
    pantry: false,
    favorites: false,
    mealPlans: false,
    shoppingList: false,
    manualShopping: false,
    stores: false,
    storeReviews: false,
  },
  panelErrors: {
    recipes: "",
    preferences: "",
    pantry: "",
    favorites: "",
    mealPlans: "",
    shoppingList: "",
    manualShopping: "",
    stores: "",
    storeReviews: "",
  },
};

const elements = {
  statusBanner: document.querySelector("#statusBanner"),
  errorBanner: document.querySelector("#errorBanner"),
  recipeCount: document.querySelector("#recipeCount"),
  favoriteCount: document.querySelector("#favoriteCount"),
  shoppingCount: document.querySelector("#shoppingCount"),
  planCount: document.querySelector("#planCount"),
  accountPanelBody: document.querySelector("#accountPanelBody"),
  preferencesPanelBody: document.querySelector("#preferencesPanelBody"),
  preferences: document.querySelector("#preferences"),
  restrictionsInput: document.querySelector("#restrictionsInput"),
  savePreferencesButton: document.querySelector("#savePreferencesButton"),
  pantryForm: document.querySelector("#pantryForm"),
  pantryInput: document.querySelector("#pantryInput"),
  pantryList: document.querySelector("#pantryList"),
  pantryEmpty: document.querySelector("#pantryEmpty"),
  recipeFilter: document.querySelector("#recipeFilter"),
  refreshRecipesButton: document.querySelector("#refreshRecipes"),
  recipeGrid: document.querySelector("#recipeGrid"),
  recipePagination: document.querySelector("#recipePagination"),
  recipeDetail: document.querySelector("#recipeDetail"),
  generatePlanButton: document.querySelector("#generatePlanButton"),
  reloadPlansButton: document.querySelector("#reloadPlansButton"),
  planPickerWrap: document.querySelector("#planPickerWrap"),
  planPicker: document.querySelector("#planPicker"),
  weeklyMeals: document.querySelector("#weeklyMeals"),
  captureLocationButton: document.querySelector("#captureLocationButton"),
  shopNowButton: document.querySelector("#shopNowButton"),
  locationQueryInput: document.querySelector("#locationQueryInput"),
  locationStatus: document.querySelector("#locationStatus"),
  storeResults: document.querySelector("#storeResults"),
  storePagination: document.querySelector("#storePagination"),
  storeDetail: document.querySelector("#storeDetail"),
  manualShoppingForm: document.querySelector("#manualShoppingForm"),
  manualItemName: document.querySelector("#manualItemName"),
  manualItemQuantity: document.querySelector("#manualItemQuantity"),
  manualItemUnit: document.querySelector("#manualItemUnit"),
  manualShoppingList: document.querySelector("#manualShoppingList"),
  shoppingList: document.querySelector("#shoppingList"),
  alreadyHaveList: document.querySelector("#alreadyHaveList"),
  favoriteMeals: document.querySelector("#favoriteMeals"),
};

function loadStoredSession() {
  try {
    state.activePlanId =
      JSON.parse(localStorage.getItem(storageKey))?.activePlanId || null;
  } catch {
    localStorage.removeItem(storageKey);
  }
}
function persistSession() {
  localStorage.setItem(
    storageKey,
    JSON.stringify({ activePlanId: state.activePlanId }),
  );
}
function formatIngredient(item, factor = 1) {
  if (typeof item === "string") return item;
  if (item.quantity == null) return `${item.name} (add a measured amount)`;
  return `${Number((item.quantity * factor).toFixed(3))} ${item.unit === "count" ? "" : `${item.unit} `}${item.name}`;
}
function clearSession() {
  closeCooking();
  closePurchases();
  state.pantryRevision = null;
  state.planCandidates = [];
  state.shoppingWarnings = [];
  state.userId = null;
  state.username = "";
  state.preferences = [];
  state.restrictions = [];
  state.pantry = [];
  state.favorites = [];
  state.manualShoppingItems = [];
  state.mealPlans = [];
  state.activePlanId = null;
  state.shopLocation = null;
  state.nearbyStores = [];
  state.storePage = 1;
  state.selectedStoreId = null;
  state.storeReviews = {};
  state.shoppingListItems = [];
  state.alreadyHaveItems = [];
  persistSession();
}

function setStatus(message) {
  state.statusMessage = message;
  renderBanners();
}

function setError(message) {
  state.errorMessage = message;
  renderBanners();
}

function clearBanners() {
  state.statusMessage = "";
  state.errorMessage = "";
  renderBanners();
}

function setPanelLoading(panel, value) {
  state.panelLoading[panel] = value;
}

function setPanelError(panel, message) {
  state.panelErrors[panel] = message;
}

function renderBanners() {
  elements.statusBanner.textContent = state.statusMessage;
  elements.statusBanner.hidden = !state.statusMessage;
  elements.errorBanner.textContent = state.errorMessage;
  elements.errorBanner.hidden = !state.errorMessage;
}

function createEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character];
  });
}

function getAllTags() {
  return ["vegetarian", "vegan", "gluten-free"];
}

function getRecipeById(recipeId) {
  return state.allRecipes.find((recipe) => recipe.id === recipeId) || null;
}

function getRecipePageCount() {
  return Math.max(1, Math.ceil(state.recipes.length / recipesPerPage));
}

function getVisibleRecipes() {
  const pageCount = getRecipePageCount();
  const currentPage = Math.min(state.recipePage, pageCount);
  const start = (currentPage - 1) * recipesPerPage;
  return state.recipes.slice(start, start + recipesPerPage);
}

function getActivePlan() {
  return state.mealPlans.find((plan) => plan.id === state.activePlanId) || null;
}

function formatDistance(distanceMiles) {
  if (
    distanceMiles === null ||
    distanceMiles === undefined ||
    Number.isNaN(distanceMiles)
  ) {
    return "Distance unavailable";
  }

  if (distanceMiles < 0.2) {
    return "Less than 0.2 mi away";
  }

  return `${distanceMiles.toFixed(1)} mi away`;
}

function getSelectedStore() {
  return (
    state.nearbyStores.find(
      (store) => store.store_id === state.selectedStoreId,
    ) || null
  );
}

function getStoreReviews(storeId) {
  return state.storeReviews[storeId] || [];
}

function getAverageStoreRating(storeId) {
  const reviews = getStoreReviews(storeId);
  if (!reviews.length) {
    return null;
  }

  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return total / reviews.length;
}

function formatStarRating(rating) {
  if (!rating) {
    return "N/A";
  }

  const rounded = Math.round(rating);
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}

function parseCoordinateQuery(value) {
  const match = String(value)
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

async function loadStoreReviews(storeId) {
  setPanelLoading("storeReviews", true);
  setPanelError("storeReviews", "");

  try {
    const response = await api.getStoreReviews(storeId);
    state.storeReviews[storeId] = response.reviews || [];
    state.nearbyStores = state.nearbyStores.map((store) => {
      return store.store_id === storeId
        ? { ...store, ...response.store }
        : store;
    });
  } catch (error) {
    setPanelError("storeReviews", error.message);
    setError(error.message);
  } finally {
    setPanelLoading("storeReviews", false);
    renderStoreFinder();
  }
}

function getStorePageCount() {
  return Math.max(1, Math.ceil(state.nearbyStores.length / storesPerPage));
}

function getVisibleStores() {
  const pageCount = getStorePageCount();
  const currentPage = Math.min(state.storePage, pageCount);
  const start = (currentPage - 1) * storesPerPage;
  return state.nearbyStores.slice(start, start + storesPerPage);
}

async function fetchRecipeDetails(recipeId) {
  if (state.recipeDetails.has(recipeId)) {
    return state.recipeDetails.get(recipeId);
  }

  const recipe = await api.getRecipe(recipeId);
  state.recipeDetails.set(recipeId, recipe);
  return recipe;
}

async function loadRecipes() {
  setPanelLoading("recipes", true);
  setPanelError("recipes", "");

  try {
    const allRecipes = await api.getRecipes();
    state.allRecipes = allRecipes;
    const names = [
      ...new Set(
        allRecipes.flatMap((r) =>
          r.ingredients.map((i) => i.name).filter(Boolean),
        ),
      ),
    ].sort();
    document.querySelector("#ingredientNames").innerHTML = names
      .map((name) => `<option value="${escapeHtml(name)}"></option>`)
      .join("");
    state.recipes = state.recipeFilter
      ? await api.getRecipes(state.recipeFilter)
      : allRecipes;
    state.recipePage = 1;

    if (!state.selectedRecipeId || !getRecipeById(state.selectedRecipeId)) {
      state.selectedRecipeId = state.recipes[0]?.id || null;
    }

    if (state.selectedRecipeId) {
      await fetchRecipeDetails(state.selectedRecipeId);
    }
  } catch (error) {
    setPanelError("recipes", error.message);
    state.allRecipes = [];
    state.recipes = [];
    state.selectedRecipeId = null;
  } finally {
    setPanelLoading("recipes", false);
    renderRecipes();
    renderRecipeDetail();
    renderSummary();
  }
}

async function refreshShoppingList() {
  const requestedUser = state.userId;
  const requestedPlan = state.activePlanId;
  if (!state.userId || !state.activePlanId) {
    state.shoppingListItems = [];
    state.alreadyHaveItems = [];
    renderPlanner();
    renderSummary();
    return;
  }

  setPanelLoading("shoppingList", true);
  setPanelError("shoppingList", "");

  try {
    const [response, candidates] = await Promise.all([
      api.getShoppingList(state.userId, state.activePlanId),
      api.candidates(state.userId, state.activePlanId),
    ]);
    if (state.userId !== requestedUser || state.activePlanId !== requestedPlan)
      return;
    state.planCandidates = candidates;
    state.shoppingWarnings = response.warnings || [];
    state.shoppingListItems = response.shopping_list_items || [];
    state.alreadyHaveItems = response.already_have_items || [];
  } catch (error) {
    setPanelError("shoppingList", error.message);
    state.shoppingListItems = [];
    state.alreadyHaveItems = [];
    state.planCandidates = [];
    state.shoppingWarnings = [];
  } finally {
    setPanelLoading("shoppingList", false);
    renderPlanner();
    renderSummary();
  }
}

async function refreshMealPlans() {
  const requestedUser = state.userId;
  if (!state.userId) {
    return;
  }

  setPanelLoading("mealPlans", true);
  setPanelError("mealPlans", "");

  try {
    const plans = await api.getMealPlans(requestedUser);
    if (state.userId !== requestedUser) return;
    state.mealPlans = plans;
    if (
      !state.activePlanId ||
      !state.mealPlans.some((plan) => plan.id === state.activePlanId)
    ) {
      state.activePlanId = state.mealPlans.at(-1)?.id || null;
    }
    persistSession();
    await refreshShoppingList();
  } catch (error) {
    setPanelError("mealPlans", error.message);
  } finally {
    setPanelLoading("mealPlans", false);
    renderPlanner();
    renderSummary();
  }
}

async function loadUserData() {
  const requestedUser = state.userId;
  if (!state.userId) {
    render();
    return;
  }

  state.appLoading = true;
  clearBanners();
  renderAccount();

  try {
    const [preferences, pantry, favorites, manualItems, mealPlans] =
      await Promise.all([
        api.getPreferences(state.userId),
        api.getPantry(state.userId),
        api.getFavorites(state.userId),
        api.getManualShoppingItems(state.userId),
        api.getMealPlans(state.userId),
      ]);

    if (state.userId !== requestedUser) return;
    state.preferences = preferences.dietary_preferences || [];
    state.restrictions = preferences.dietary_restrictions || [];
    state.pantry = pantry.pantry || [];
    state.pantryRevision = pantry.pantry_revision;
    state.favorites = favorites || [];
    state.manualShoppingItems = manualItems.items || [];
    state.mealPlans = mealPlans || [];

    if (
      !state.activePlanId ||
      !state.mealPlans.some((plan) => plan.id === state.activePlanId)
    ) {
      state.activePlanId = state.mealPlans.at(-1)?.id || null;
    }

    persistSession();
    await refreshShoppingList();
    setStatus(`Signed in as ${state.username}.`);
  } catch (error) {
    clearSession();
    setError(`Session could not be restored: ${error.message}`);
  } finally {
    state.appLoading = false;
    render();
  }
}

function renderSummary() {
  elements.recipeCount.textContent = String(state.recipes.length);
  elements.favoriteCount.textContent = String(
    state.userId ? state.favorites.length : 0,
  );
  elements.shoppingCount.textContent = String(
    state.userId ? state.shoppingListItems.length : 0,
  );
  elements.planCount.textContent = String(
    state.userId ? state.mealPlans.length : 0,
  );
}

function renderAccount() {
  if (state.userId) {
    elements.accountPanelBody.innerHTML = `
      <div class="account-summary">
        <p class="inline-note">Signed in as <strong>${escapeHtml(state.username)}</strong>.</p>
        <p class="inline-note">Your pantry, plans, and cooking progress are saved to your account.</p>
        <button id="logoutButton" type="button" class="secondary-button">Log out</button>
      </div>
    `;

    elements.accountPanelBody
      .querySelector("#logoutButton")
      .addEventListener("click", async () => {
        try {
          await api.logout();
        } catch (error) {
          setError(error.message);
          return;
        }
        clearSession();
        clearBanners();
        setStatus("Logged out.");
        render();
      });
    return;
  }

  elements.accountPanelBody.innerHTML = `
    <div class="auth-toggle">
      <button type="button" class="toggle-button ${state.authMode === "login" ? "active" : ""}" data-mode="login">Login</button>
      <button type="button" class="toggle-button ${state.authMode === "register" ? "active" : ""}" data-mode="register">Register</button>
    </div>
    <form id="authForm" class="stack">
      <label>
        Username
        <input type="text" id="usernameInput" placeholder="student123" autocomplete="username" maxlength="40" required />
      </label>
      <label>
        Password
        <input type="password" id="passwordInput" placeholder="At least 12 characters" autocomplete="${state.authMode === "register" ? "new-password" : "current-password"}" maxlength="128" ${state.authMode === "register" ? 'minlength="12"' : ""} required />
      </label>
      <button type="submit">${state.authLoading ? "Working..." : state.authMode === "login" ? "Login" : "Create account"}</button>
    </form>
    <div class="inline-note">
      ${
        state.authMode === "register"
          ? "Create an account to save your kitchen and dinner plans."
          : "Welcome back. Pick up where you left off."
      }
    </div>
  `;

  elements.accountPanelBody
    .querySelectorAll("[data-mode]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        state.authMode = button.dataset.mode;
        renderAccount();
      });
    });

  elements.accountPanelBody
    .querySelector("#authForm")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      clearBanners();
      const username = elements.accountPanelBody
        .querySelector("#usernameInput")
        .value.trim();
      const password =
        elements.accountPanelBody.querySelector("#passwordInput").value;
      state.authLoading = true;
      renderAccount();

      try {
        const response =
          state.authMode === "login"
            ? await api.login({ username, password })
            : await api.register({
                username,
                password,
                dietary_preferences: [],
                dietary_restrictions: [],
              });

        state.userId = response.user_id;
        state.username = username;
        persistSession();
        await loadUserData();
      } catch (error) {
        setError(error.message);
      } finally {
        state.authLoading = false;
        renderAccount();
      }
    });
}

function renderPreferences() {
  const disabled =
    !state.userId || state.appLoading || state.panelLoading.preferences;
  const tags = getAllTags();

  elements.preferences.innerHTML = "";
  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${state.preferences.includes(tag) ? " active" : ""}`;
    button.textContent = tag;
    button.disabled = disabled;
    button.addEventListener("click", () => {
      state.preferences = state.preferences.includes(tag)
        ? state.preferences.filter((value) => value !== tag)
        : [...state.preferences, tag];
      renderPreferences();
    });
    elements.preferences.appendChild(button);
  });

  elements.restrictionsInput.value = state.restrictions.join(", ");
  elements.restrictionsInput.disabled = disabled;
  elements.savePreferencesButton.disabled = disabled;
  const message = elements.preferencesPanelBody.querySelector(".panel-message");
  message.textContent = state.panelErrors.preferences;
  message.hidden = !state.panelErrors.preferences;
  elements.preferencesPanelBody.querySelector(".auth-required-note").hidden =
    Boolean(state.userId);

  elements.pantryInput.disabled = disabled || state.panelLoading.pantry;
  elements.pantryForm.querySelector("button").disabled =
    disabled || state.panelLoading.pantry;
  renderPantry();
}

function renderPantry() {
  elements.pantryList.innerHTML = "";
  if (!state.userId) {
    elements.pantryEmpty.hidden = false;
    return;
  }

  if (!state.pantry.length) {
    elements.pantryEmpty.hidden = false;
  } else {
    elements.pantryEmpty.hidden = true;
    state.pantry.forEach((item) => {
      const row = document.createElement("li");
      row.className = "pantry-row";
      row.innerHTML = `<div class="pantry-item-heading"><span>${escapeHtml(formatIngredient(item))}</span><button type="button" class="secondary-button" data-remove>Remove</button></div>
        <details><summary>Set amount remaining</summary><form class="pantry-edit"><label>Amount<input aria-label="Remaining amount of ${escapeHtml(item.name)}" type="number" min="0" max="100000" step="any" value="${item.quantity ?? ""}" required /></label>
        ${item.quantity == null ? '<label>Unit<select><option value="count">items</option><option value="cup">cup</option><option value="tbsp">tbsp</option><option value="tsp">tsp</option><option value="g">g</option><option value="oz">oz</option><option value="lb">lb</option><option value="clove">clove</option></select></label>' : `<p>${escapeHtml(item.unit === "count" ? "items" : item.unit)} remaining. Set 0 to remove.</p>`}<button type="submit">Save amount</button></form></details>`;
      row.querySelector("[data-remove]").disabled = state.panelLoading.pantry;
      row.querySelector("[data-remove]").onclick = async () => {
        try {
          const response = await api.removePantryItem(state.userId, item.id);
          state.pantry = response.pantry;
          state.pantryRevision = response.pantry_revision;
          await refreshShoppingList();
          renderPantry();
        } catch (error) {
          setError(error.message);
        }
      };
      const revision = state.pantryRevision;
      row.querySelector("form").onsubmit = async (event) => {
        event.preventDefault();
        const button = row.querySelector('[type="submit"]');
        button.disabled = true;
        try {
          const response = await api.setPantryAmount(state.userId, item.id, {
            quantity: Number(row.querySelector("input").value),
            unit: row.querySelector("select")?.value || item.unit,
            pantry_revision: revision,
          });
          state.pantry = response.pantry;
          state.pantryRevision = response.pantry_revision;
          await refreshShoppingList();
          renderPantry();
          setStatus("Pantry amount updated.");
        } catch (error) {
          setError(error.message);
          if (error.status === 409) {
            const fresh = await api.getPantry(state.userId);
            state.pantry = fresh.pantry;
            state.pantryRevision = fresh.pantry_revision;
            renderPantry();
          }
        } finally {
          button.disabled = false;
        }
      };
      elements.pantryList.appendChild(row);
    });
  }

  const pantryMessage =
    elements.preferencesPanelBody.querySelector(".pantry-message");
  pantryMessage.textContent = state.panelErrors.pantry;
  pantryMessage.hidden = !state.panelErrors.pantry;
}

function renderRecipeDetail() {
  const detail = state.selectedRecipeId
    ? state.recipeDetails.get(state.selectedRecipeId) || null
    : null;

  elements.recipeDetail.innerHTML = "";
  if (!state.selectedRecipeId) {
    elements.recipeDetail.appendChild(
      createEmptyState("Select a recipe to load full instructions."),
    );
    return;
  }

  if (!detail) {
    elements.recipeDetail.appendChild(
      createEmptyState("Loading recipe details..."),
    );
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "detail-card";
  wrapper.innerHTML = `
    <div class="split-heading">
      <div>
        <p class="eyebrow">Recipe Details</p>
        <h3>${escapeHtml(detail.name)}</h3>
      </div>
      <span class="recipe-tags">${escapeHtml(detail.dietary_tags.length ? detail.dietary_tags.join(" / ") : "No tags")}</span>
    </div>
    <p class="inline-note">Serves ${detail.base_servings || "?"} | ${escapeHtml(detail.meal_type)} | About ${detail.prep_time_minutes} min</p>
    <p class="inline-note">Ingredients: ${escapeHtml(detail.ingredients.map((i) => formatIngredient(i)).join(", "))}</p>
    <ol class="steps-list">
      ${detail.steps
        .map(
          (step) => `
        <li>
          <strong>${escapeHtml(step.instruction)}</strong>
          <span>${escapeHtml(step.tip || "")}</span>
        </li>
      `,
        )
        .join("")}
    </ol>
  `;

  elements.recipeDetail.appendChild(wrapper);
}

function recipeCard(recipe) {
  const article = document.createElement("article");
  article.className = "recipe-card";
  const isFavorite = state.favorites.some(
    (favorite) => favorite.id === recipe.id,
  );

  article.innerHTML = `
    <div class="recipe-topline">
      <span class="recipe-store">${escapeHtml(recipe.meal_type)}</span>
      <span class="recipe-tags">${escapeHtml(recipe.dietary_tags.length ? recipe.dietary_tags.join(" / ") : "No tags")}</span>
    </div>
    <h3>${escapeHtml(recipe.name)}</h3>
    <p class="recipe-description">${escapeHtml(recipe.ingredients.map((i) => formatIngredient(i)).join(", "))}</p>
    <div class="recipe-meta">
      <span class="ingredient-pill">${recipe.prep_time_minutes} min</span>
      <span class="ingredient-pill">${recipe.ingredients.length} ingredients</span>
    </div>
    <div class="recipe-actions">
      <button type="button" data-action="view">View recipe</button>
      <button type="button" class="secondary-button" data-action="favorite">${isFavorite ? "Unfavorite" : "Favorite"}</button>
    </div>
  `;

  article
    .querySelector('[data-action="view"]')
    .addEventListener("click", async () => {
      state.selectedRecipeId = recipe.id;
      renderRecipeDetail();
      try {
        await fetchRecipeDetails(recipe.id);
        renderRecipeDetail();
      } catch (error) {
        setPanelError("recipes", error.message);
        renderRecipeDetail();
      }
    });

  article
    .querySelector('[data-action="favorite"]')
    .addEventListener("click", async () => {
      if (!state.userId) {
        setError("Login required before using favorites.");
        return;
      }

      clearBanners();
      try {
        if (isFavorite) {
          await api.removeFavorite(state.userId, recipe.id);
          state.favorites = state.favorites.filter(
            (favorite) => favorite.id !== recipe.id,
          );
          setStatus(`${recipe.name} removed from favorites.`);
        } else {
          await api.addFavorite(state.userId, recipe.id);
          const fullRecipe = await fetchRecipeDetails(recipe.id);
          state.favorites = [...state.favorites, fullRecipe];
          setStatus(`${recipe.name} added to favorites.`);
        }
        renderRecipes();
        renderFavorites();
        renderSummary();
      } catch (error) {
        setError(error.message);
      }
    });

  return article;
}

function renderRecipes() {
  const tags = getAllTags();
  elements.recipeFilter.innerHTML = `<option value="">All tags</option>`;
  tags.forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    option.selected = state.recipeFilter === tag;
    elements.recipeFilter.appendChild(option);
  });

  elements.recipeGrid.innerHTML = "";
  elements.recipePagination.innerHTML = "";

  if (state.panelLoading.recipes) {
    elements.recipeGrid.appendChild(createEmptyState("Loading recipes..."));
    return;
  }

  if (state.panelErrors.recipes) {
    elements.recipeGrid.appendChild(
      createEmptyState(state.panelErrors.recipes),
    );
    return;
  }

  if (!state.recipes.length) {
    elements.recipeGrid.appendChild(
      createEmptyState("No recipes match the current tag filter."),
    );
    return;
  }

  const pageCount = getRecipePageCount();
  state.recipePage = Math.min(state.recipePage, pageCount);

  getVisibleRecipes().forEach((recipe) => {
    elements.recipeGrid.appendChild(recipeCard(recipe));
  });

  renderRecipePagination();
}

function renderRecipePagination() {
  const pageCount = getRecipePageCount();

  if (state.recipes.length <= recipesPerPage) {
    elements.recipePagination.innerHTML = "";
    return;
  }

  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "pagination-button secondary-button";
  previousButton.textContent = "Previous";
  previousButton.disabled = state.recipePage === 1;
  previousButton.addEventListener("click", () => {
    state.recipePage -= 1;
    renderRecipes();
  });

  const status = document.createElement("span");
  status.className = "pagination-status";
  status.textContent = `Page ${state.recipePage} of ${pageCount}`;

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "pagination-button secondary-button";
  nextButton.textContent = "Next";
  nextButton.disabled = state.recipePage === pageCount;
  nextButton.addEventListener("click", () => {
    state.recipePage += 1;
    renderRecipes();
  });

  elements.recipePagination.append(previousButton, status, nextButton);
}

function renderStoreFinder() {
  const requiresPlan = !state.userId || !state.activePlanId;
  elements.captureLocationButton.disabled =
    !state.userId || state.panelLoading.stores;
  elements.shopNowButton.disabled = requiresPlan || state.panelLoading.stores;
  elements.locationQueryInput.disabled =
    !state.userId || state.panelLoading.stores;

  if (!state.userId) {
    elements.locationStatus.textContent =
      "Login to find nearby grocery stores.";
  } else if (!state.activePlanId) {
    elements.locationStatus.textContent =
      "Generate or load a meal plan before shopping.";
  } else if (state.panelLoading.stores) {
    elements.locationStatus.textContent = "Looking up nearby grocery stores...";
  } else if (state.panelErrors.stores) {
    elements.locationStatus.textContent = state.panelErrors.stores;
  } else {
    elements.locationStatus.textContent = "";
  }

  elements.storeResults.innerHTML = "";
  elements.storePagination.innerHTML = "";
  elements.storeDetail.innerHTML = "";

  if (!state.userId) {
    elements.storeResults.appendChild(
      createEmptyState("Nearby grocery stores appear here after login."),
    );
    return;
  }

  if (!state.activePlanId) {
    elements.storeResults.appendChild(
      createEmptyState("Create a meal plan to start shopping nearby."),
    );
    return;
  }

  if (state.panelLoading.stores) {
    elements.storeResults.appendChild(
      createEmptyState("Finding nearby stores..."),
    );
    return;
  }

  if (!state.nearbyStores.length) {
    elements.storeResults.appendChild(
      createEmptyState(
        "No store lookup yet. Click Shop now to use your saved or default location.",
      ),
    );
    return;
  }

  const pageCount = getStorePageCount();
  state.storePage = Math.min(state.storePage, pageCount);

  getVisibleStores().forEach((store) => {
    const averageRating =
      store.average_rating ?? getAverageStoreRating(store.store_id);
    const card = document.createElement("article");
    card.className = "store-card";
    card.innerHTML = `
      <div class="store-card-rating">
        <div class="store-stars">${formatStarRating(averageRating)}</div>
        <span>${averageRating ? `${averageRating.toFixed(1)} / 5` : "N/A"}</span>
      </div>
      <div class="store-card-body">
        <div>
          <h4>${escapeHtml(store.name)}</h4>
          <p class="inline-note">${formatDistance(store.distance_miles)}</p>
        </div>
        <button type="button" class="secondary-button" data-action="view-reviews">View reviews</button>
      </div>
    `;

    card
      .querySelector('[data-action="view-reviews"]')
      .addEventListener("click", () => {
        state.selectedStoreId = store.store_id;
        loadStoreReviews(store.store_id);
      });

    elements.storeResults.appendChild(card);
  });

  renderStorePagination();
  renderStoreDetail();
}

function renderStorePagination() {
  const pageCount = getStorePageCount();

  if (state.nearbyStores.length <= storesPerPage) {
    elements.storePagination.innerHTML = "";
    return;
  }

  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "pagination-button secondary-button";
  previousButton.textContent = "Previous";
  previousButton.disabled = state.storePage === 1;
  previousButton.addEventListener("click", () => {
    state.storePage -= 1;
    renderStoreFinder();
  });

  const status = document.createElement("span");
  status.className = "pagination-status";
  status.textContent = `Page ${state.storePage} of ${pageCount}`;

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "pagination-button secondary-button";
  nextButton.textContent = "Next";
  nextButton.disabled = state.storePage === pageCount;
  nextButton.addEventListener("click", () => {
    state.storePage += 1;
    renderStoreFinder();
  });

  elements.storePagination.append(previousButton, status, nextButton);
}

function renderStoreDetail() {
  const store = getSelectedStore();
  elements.storeDetail.innerHTML = "";

  if (!store) {
    return;
  }

  const reviews = getStoreReviews(store.store_id);
  const averageRating =
    store.average_rating ?? getAverageStoreRating(store.store_id);
  const reviewCountLabel = `${reviews.length} review${reviews.length === 1 ? "" : "s"}`;
  const currentUserReview =
    reviews.find((review) => review.user_id === state.userId) || null;
  const submitLabel = state.panelLoading.storeReviews
    ? currentUserReview
      ? "Saving..."
      : "Submitting..."
    : currentUserReview
      ? "Edit review"
      : "Submit review";

  const wrapper = document.createElement("div");
  wrapper.className = "store-review-layout";
  wrapper.innerHTML = `
    <section class="review-profile-card">
      <div class="review-profile-header">
        <div>
          <p class="eyebrow">Store Profile</p>
          <h3>${escapeHtml(store.name)}</h3>
          <p class="inline-note">${formatDistance(store.distance_miles)} from your selected location.</p>
        </div>
        <button type="button" class="secondary-button" data-action="close-reviews">Back to stores</button>
      </div>
      <div class="review-summary-grid">
        <div class="review-summary-stat">
          <span class="review-summary-label">Average rating</span>
          <strong>${averageRating ? `${averageRating.toFixed(2)} / 5` : "N/A"}</strong>
        </div>
        <div class="review-summary-stat">
          <span class="review-summary-label">Stars</span>
          <strong>${formatStarRating(averageRating)}</strong>
        </div>
        <div class="review-summary-stat">
          <span class="review-summary-label">Total reviews</span>
          <strong>${reviews.length}</strong>
        </div>
      </div>
    </section>
    <section class="review-write-card">
      <p class="eyebrow">Write A Review</p>
      <h3>Share your experience</h3>
      <form id="storeReviewForm" class="store-review-form">
        <label>
          Rating
          <select name="rating">
            <option value="5" ${currentUserReview?.rating === 5 ? "selected" : ""}>5 stars</option>
            <option value="4" ${currentUserReview?.rating === 4 ? "selected" : ""}>4 stars</option>
            <option value="3" ${currentUserReview?.rating === 3 ? "selected" : ""}>3 stars</option>
            <option value="2" ${currentUserReview?.rating === 2 ? "selected" : ""}>2 stars</option>
            <option value="1" ${currentUserReview?.rating === 1 ? "selected" : ""}>1 star</option>
          </select>
        </label>
        <label class="store-review-text">
          Review
          <textarea name="review" rows="4" placeholder="Describe your experience at this store." required>${escapeHtml(currentUserReview?.comment || "")}</textarea>
        </label>
        <div class="review-form-actions">
          <button type="submit">${submitLabel}</button>
          <button type="button" class="secondary-button" data-action="delete-review" ${currentUserReview ? "" : "disabled"}>Delete review</button>
        </div>
      </form>
    </section>
    <section class="review-list-card">
      <p class="eyebrow">User Reviews</p>
      <h3>${reviewCountLabel}</h3>
      <div class="review-list">
        ${
          state.panelLoading.storeReviews && !reviews.length
            ? `<div class="empty-state">Loading reviews...</div>`
            : reviews.length
              ? reviews
                  .map(
                    (review) => `
              <article class="user-review-card">
                <div class="user-review-header">
                  <div>
                    <strong>${escapeHtml(review.username)}</strong>
                    <p>${escapeHtml(review.created_at)}</p>
                  </div>
                  <span class="review-stars">${formatStarRating(review.rating)}</span>
                </div>
                <p>${escapeHtml(review.comment)}</p>
              </article>
            `,
                  )
                  .join("")
              : `<div class="empty-state">No reviews yet for this grocery store.</div>`
        }
      </div>
    </section>
  `;

  wrapper
    .querySelector('[data-action="close-reviews"]')
    .addEventListener("click", () => {
      state.selectedStoreId = null;
      renderStoreFinder();
    });

  wrapper
    .querySelector("#storeReviewForm")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const comment = String(formData.get("review") || "").trim();

      if (!comment) {
        return;
      }

      clearBanners();
      setPanelLoading("storeReviews", true);
      setPanelError("storeReviews", "");
      renderStoreFinder();

      api
        .addStoreReview(store.store_id, {
          user_id: state.userId,
          rating: Number(formData.get("rating")),
          comment,
          store_name: store.name,
          latitude: store.latitude,
          longitude: store.longitude,
        })
        .then((response) => {
          state.storeReviews[store.store_id] = response.reviews || [];
          state.nearbyStores = state.nearbyStores.map((entry) => {
            return entry.store_id === store.store_id
              ? { ...entry, ...response.store }
              : entry;
          });
          setStatus(
            currentUserReview
              ? `Review updated for ${store.name}.`
              : `Review saved for ${store.name}.`,
          );
        })
        .catch((error) => {
          setPanelError("storeReviews", error.message);
          setError(error.message);
        })
        .finally(() => {
          setPanelLoading("storeReviews", false);
          renderStoreFinder();
        });
    });

  const submitButton = wrapper.querySelector("#storeReviewForm button");
  submitButton.disabled = state.panelLoading.storeReviews;

  const deleteButton = wrapper.querySelector('[data-action="delete-review"]');
  deleteButton.disabled = !currentUserReview || state.panelLoading.storeReviews;
  deleteButton.addEventListener("click", () => {
    if (!currentUserReview) {
      return;
    }

    clearBanners();
    setPanelLoading("storeReviews", true);
    setPanelError("storeReviews", "");
    renderStoreFinder();

    api
      .deleteStoreReview(store.store_id, state.userId)
      .then((response) => {
        state.storeReviews[store.store_id] = response.reviews || [];
        state.nearbyStores = state.nearbyStores.map((entry) => {
          return entry.store_id === store.store_id
            ? { ...entry, ...response.store }
            : entry;
        });
        setStatus(`Review deleted for ${store.name}.`);
      })
      .catch((error) => {
        setPanelError("storeReviews", error.message);
        setError(error.message);
      })
      .finally(() => {
        setPanelLoading("storeReviews", false);
        renderStoreFinder();
      });
  });

  elements.storeDetail.appendChild(wrapper);
}

function renderManualShoppingItems() {
  elements.manualShoppingList.innerHTML = "";

  if (!state.userId) {
    elements.manualShoppingList.appendChild(
      createEmptyState("Login to save manual shopping items."),
    );
    return;
  }

  if (!state.manualShoppingItems.length) {
    elements.manualShoppingList.appendChild(
      createEmptyState("No manual shopping items yet."),
    );
    return;
  }

  state.manualShoppingItems.forEach((item) => {
    const row = document.createElement("li");
    const display = formatIngredient(item);
    row.innerHTML = `
      <span>${escapeHtml(display)}</span>
      <button type="button" class="secondary-button">Remove</button>
    `;
    row.querySelector("button").disabled = state.panelLoading.manualShopping;
    row.querySelector("button").addEventListener("click", async () => {
      clearBanners();
      setPanelLoading("manualShopping", true);
      renderManualShoppingItems();
      try {
        await api.removeManualShoppingItem(state.userId, item.id);
        state.manualShoppingItems = state.manualShoppingItems.filter(
          (entry) => entry.id !== item.id,
        );
        await refreshShoppingList();
        setStatus(`${item.name} removed from manual shopping items.`);
      } catch (error) {
        setError(error.message);
      } finally {
        setPanelLoading("manualShopping", false);
        renderManualShoppingItems();
      }
    });
    elements.manualShoppingList.appendChild(row);
  });
}

function renderPurchaseButton() {
  const button = document.querySelector("#reviewPurchases");
  button.disabled =
    !state.userId ||
    !getActivePlan()?.entries ||
    state.shoppingWarnings.length > 0 ||
    state.panelLoading.shoppingList ||
    !state.shoppingListItems.some((i) => i.checked);
}
function renderShoppingLists() {
  renderPurchaseButton();
  document.querySelector("#shoppingWarnings").textContent =
    state.shoppingWarnings.join(" ");
  elements.shoppingList.innerHTML = "";
  elements.alreadyHaveList.innerHTML = "";

  if (!state.userId) {
    elements.shoppingList.appendChild(
      createEmptyState("Login to generate a shopping list."),
    );
    elements.alreadyHaveList.appendChild(
      createEmptyState("Pantry amounts appear here after a plan is loaded."),
    );
    return;
  }

  if (state.panelLoading.shoppingList) {
    elements.shoppingList.appendChild(
      createEmptyState("Loading shopping list..."),
    );
    elements.alreadyHaveList.appendChild(
      createEmptyState("Checking pantry coverage..."),
    );
    return;
  }

  if (state.panelErrors.shoppingList) {
    elements.shoppingList.appendChild(
      createEmptyState(state.panelErrors.shoppingList),
    );
    elements.alreadyHaveList.appendChild(
      createEmptyState(state.panelErrors.shoppingList),
    );
    return;
  }

  if (!state.shoppingListItems.length) {
    elements.shoppingList.appendChild(
      createEmptyState(
        "No ingredients to buy, or this plan needs the changes shown above.",
      ),
    );
  } else {
    state.shoppingListItems.forEach((item) => {
      const row = document.createElement("li");
      row.innerHTML = `<label class="check-field shopping-check"><input type="checkbox" ${item.checked ? "checked" : ""} /><span>${escapeHtml(item.display)}</span></label>`;
      row.querySelector("input").addEventListener("change", async (event) => {
        const input = event.target;
        input.disabled = true;
        try {
          await api.checkShopping(state.userId, state.activePlanId, {
            key: item.key,
            checked: input.checked,
          });
          item.checked = input.checked;
          renderPurchaseButton();
        } catch (error) {
          input.checked = item.checked;
          setError(error.message);
        } finally {
          input.disabled = false;
        }
      });
      elements.shoppingList.appendChild(row);
    });
  }

  if (!state.alreadyHaveItems.length) {
    elements.alreadyHaveList.appendChild(
      createEmptyState("No pantry matches yet."),
    );
  } else {
    state.alreadyHaveItems.forEach((item) => {
      const row = document.createElement("li");
      row.innerHTML = `<span>${escapeHtml(item.display)}</span>`;
      elements.alreadyHaveList.appendChild(row);
    });
  }
}

async function changePlan(plan, payload, action = "update") {
  if (state.panelLoading.mealPlans) return;
  clearBanners();
  setPanelLoading("mealPlans", true);
  renderPlanner();
  try {
    const body = { ...payload, version: plan.version };
    if (action === "swap") await api.swapMeal(state.userId, plan.id, body);
    else if (action === "auto")
      await api.swapMealAuto(state.userId, plan.id, body);
    else await api.updatePlan(state.userId, plan.id, body);
    setStatus("Dinner plan saved. Your shopping list has been updated.");
  } catch (error) {
    setError(error.message);
  } finally {
    await refreshMealPlans();
  }
}
function renderPlanner() {
  const activePlan = getActivePlan();
  elements.planPickerWrap.hidden = state.mealPlans.length === 0;
  elements.planPicker.innerHTML = "";
  state.mealPlans.forEach((plan, index) => {
    const option = document.createElement("option");
    option.value = plan.id;
    option.textContent = plan.start_date
      ? `${plan.start_date} | ${plan.entries.length} dinners for ${plan.servings}`
      : `Earlier plan ${index + 1}`;
    option.selected = plan.id === state.activePlanId;
    elements.planPicker.appendChild(option);
  });
  const busy = state.panelLoading.mealPlans;
  elements.generatePlanButton.disabled = !state.userId || busy;
  elements.reloadPlansButton.disabled = !state.userId || busy;
  elements.weeklyMeals.innerHTML = "";
  const tools = document.querySelector("#savedPlanTools");
  tools.innerHTML = "";
  if (!state.userId)
    elements.weeklyMeals.appendChild(
      createEmptyState("Sign in to save your dinner plan."),
    );
  else if (busy)
    elements.weeklyMeals.appendChild(
      createEmptyState("Updating your dinners..."),
    );
  else if (!activePlan)
    elements.weeklyMeals.appendChild(
      createEmptyState(
        state.panelErrors.mealPlans ||
          "Choose a start date and plan your first dinners.",
      ),
    );
  else if (!activePlan.entries)
    elements.weeklyMeals.appendChild(
      createEmptyState(
        "This earlier plan has no serving amounts. Create a new dinner plan to use shopping calculations and guided cooking.",
      ),
    );
  else {
    if (state.panelErrors.mealPlans)
      elements.weeklyMeals.appendChild(
        createEmptyState(state.panelErrors.mealPlans),
      );
    tools.innerHTML = `<label>People for this saved plan<input id="savedServings" type="number" min="1" max="8" value="${activePlan.servings}" /></label><button id="saveServings" type="button" class="secondary-button">Update portions</button><button id="replanMeals" type="button" class="secondary-button">Replan unlocked dinners</button><button id="removePlan" type="button" class="secondary-button">Remove plan</button>`;
    const started = Object.keys(activePlan.completions || {}).length > 0;
    tools.querySelector("#savedServings").disabled = started;
    tools.querySelector("#saveServings").disabled = started;
    if (started) {
      const note = document.createElement("p");
      note.className = "inline-note";
      note.textContent =
        "Portions stay fixed once cooking starts. Unfinished dinners can still be replanned.";
      tools.appendChild(note);
    }
    tools.querySelector("#saveServings").onclick = () =>
      changePlan(activePlan, {
        action: "servings",
        servings: Number(tools.querySelector("#savedServings").value),
      });
    tools.querySelector("#replanMeals").onclick = () =>
      changePlan(activePlan, { action: "replan" });
    tools.querySelector("#removePlan").onclick = async () => {
      if (!window.confirm("Remove this saved plan and its cooking progress?"))
        return;
      try {
        await api.deletePlan(state.userId, activePlan.id);
        await refreshMealPlans();
        setStatus("Plan removed.");
      } catch (error) {
        setError(error.message);
      }
    };
    activePlan.entries.forEach((entry) => {
      const recipe = getRecipeById(entry.recipe_id);
      const completion = activePlan.completions?.[entry.id];
      const card = document.createElement("article");
      card.className = `weekly-card ${entry.kind === "leftover" ? "leftover-card" : ""}`;
      const date = new Date(`${entry.date}T12:00:00`).toLocaleDateString(
        undefined,
        { weekday: "short", month: "short", day: "numeric" },
      );
      const options = state.planCandidates
        .map(
          (r) =>
            `<option value="${escapeHtml(r.id)}" ${r.id === entry.recipe_id ? "selected" : ""}>${escapeHtml(r.name)}</option>`,
        )
        .join("");
      const matches = state.planCandidates.some(
        (r) => r.id === entry.recipe_id,
      );
      card.innerHTML = `<span class="meal-day">${escapeHtml(date)}</span><h3>${escapeHtml(recipe?.name || "Recipe unavailable")}</h3>
        <p class="inline-note">${entry.kind === "leftover" ? `Reserved leftovers for ${entry.servings}` : `Cook ${entry.servings} portions | about ${recipe?.prep_time_minutes || "?"} min${entry.servings > activePlan.servings ? " | includes tomorrow" : ""}`}</p>
        ${!matches && !completion ? '<p class="warning-text">This dinner no longer matches your settings.</p>' : ""}
        ${completion ? `<p class="completion-badge">${entry.kind === "leftover" ? "Served" : "Cooked"}${completion.feedback.actual_minutes ? ` | ${completion.feedback.actual_minutes} actual min` : ""}</p>` : ""}
        <button type="button" data-action="cook" ${!matches && !completion ? "disabled" : ""}>${completion ? "View cooking notes" : entry.kind === "leftover" ? "Reheat leftovers" : "Start / resume cooking"}</button>
        ${entry.kind === "cook" && !completion ? `<label class="check-field"><input type="checkbox" data-action="lock" ${entry.locked ? "checked" : ""} />Keep this dinner</label><div class="swap-controls"><label>Choose another dinner<select aria-label="Swap dinner for ${escapeHtml(date)}" ${entry.locked || !options ? "disabled" : ""}>${!matches ? '<option value="">Choose a matching dinner</option>' : ""}${options}</select></label><button type="button" data-action="swap" ${entry.locked || !options ? "disabled" : ""}>Swap dinner</button><button type="button" data-action="auto" class="secondary-button" ${entry.locked || state.planCandidates.length < 2 ? "disabled" : ""}>Suggest another</button></div>` : '<p class="inline-note">Reserved portions come from the original cooking day.</p>'}`;
      card.querySelector('[data-action="cook"]').onclick = async () => {
        try {
          await openCooking(state.userId, activePlan.id, entry.id);
        } catch (error) {
          setError(error.message);
        }
      };
      if (entry.kind === "cook" && !completion) {
        card.querySelector('[data-action="lock"]').onchange = (event) =>
          changePlan(activePlan, {
            action: "lock",
            entry_id: entry.id,
            locked: event.target.checked,
          });
        card.querySelector('[data-action="swap"]').onclick = () =>
          changePlan(
            activePlan,
            {
              entry_id: entry.id,
              new_recipe_id: card.querySelector("select").value,
            },
            "swap",
          );
        card.querySelector('[data-action="auto"]').onclick = () =>
          changePlan(activePlan, { entry_id: entry.id }, "auto");
      }
      elements.weeklyMeals.appendChild(card);
    });
  }
  renderManualShoppingItems();
  renderShoppingLists();
  renderStoreFinder();
}

function renderFavorites() {
  elements.favoriteMeals.innerHTML = "";

  if (!state.userId) {
    elements.favoriteMeals.appendChild(
      createEmptyState("Login to save favorite recipes."),
    );
    return;
  }

  if (!state.favorites.length) {
    elements.favoriteMeals.appendChild(
      createEmptyState("No favorite recipes saved yet."),
    );
    return;
  }

  state.favorites.forEach((recipe) => {
    const card = document.createElement("article");
    card.className = "favorite-card";
    card.innerHTML = `
      <h3>${escapeHtml(recipe.name)}</h3>
      <p class="recipe-description">${escapeHtml(recipe.ingredients.map((i) => formatIngredient(i)).join(", "))}</p>
      <div class="recipe-meta">
        <span class="ingredient-pill">${escapeHtml(recipe.dietary_tags.length ? recipe.dietary_tags.join(" / ") : "No tags")}</span>
      </div>
      <div class="recipe-actions">
        <button type="button" data-action="view">View recipe</button>
        <button type="button" class="secondary-button" data-action="remove">Remove</button>
      </div>
    `;

    card
      .querySelector('[data-action="view"]')
      .addEventListener("click", async () => {
        state.selectedRecipeId = recipe.id;
        renderRecipeDetail();
        try {
          await fetchRecipeDetails(recipe.id);
          renderRecipeDetail();
        } catch (error) {
          setError(error.message);
        }
      });

    card
      .querySelector('[data-action="remove"]')
      .addEventListener("click", async () => {
        clearBanners();
        try {
          await api.removeFavorite(state.userId, recipe.id);
          state.favorites = state.favorites.filter(
            (favorite) => favorite.id !== recipe.id,
          );
          renderFavorites();
          renderRecipes();
          renderSummary();
          setStatus(`${recipe.name} removed from favorites.`);
        } catch (error) {
          setError(error.message);
        }
      });

    elements.favoriteMeals.appendChild(card);
  });
}

function render() {
  renderBanners();
  renderSummary();
  renderAccount();
  renderPreferences();
  renderRecipes();
  renderRecipeDetail();
  renderPlanner();
  renderFavorites();
}

elements.savePreferencesButton.addEventListener("click", async () => {
  if (!state.userId) {
    setError("Login required before saving preferences.");
    return;
  }

  const restrictions = elements.restrictionsInput.value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  clearBanners();
  setPanelError("preferences", "");
  setPanelLoading("preferences", true);
  renderPreferences();

  try {
    await api.updatePreferences(state.userId, {
      dietary_preferences: state.preferences,
      dietary_restrictions: restrictions,
    });
    state.restrictions = restrictions;
    await refreshShoppingList();
    setStatus(
      "Dietary settings saved. Existing dinners that no longer match are marked for you to change.",
    );
  } catch (error) {
    setPanelError("preferences", error.message);
  } finally {
    setPanelLoading("preferences", false);
    renderPreferences();
  }
});

elements.pantryForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.userId) {
    setError("Login required before editing pantry.");
    return;
  }

  const item = elements.pantryInput.value.trim();
  if (!item) {
    return;
  }

  clearBanners();
  setPanelError("pantry", "");
  setPanelLoading("pantry", true);
  renderPreferences();

  try {
    const response = await api.updatePantry(state.userId, {
      name: item,
      quantity: Number(document.querySelector("#pantryQuantity").value),
      unit: document.querySelector("#pantryUnit").value,
    });
    state.pantry = response.pantry;
    state.pantryRevision = response.pantry_revision;
    elements.pantryInput.value = "";
    await refreshShoppingList();
    setStatus(`${item} added to pantry.`);
  } catch (error) {
    setPanelError("pantry", error.message);
  } finally {
    setPanelLoading("pantry", false);
    renderPreferences();
  }
});

elements.recipeFilter.addEventListener("change", async (event) => {
  state.recipeFilter = event.target.value;
  state.recipePage = 1;
  await loadRecipes();
});

elements.refreshRecipesButton.addEventListener("click", async () => {
  clearBanners();
  await loadRecipes();
  setStatus("Recipes refreshed.");
});

elements.generatePlanButton.addEventListener("click", async () => {
  if (!state.userId) {
    setError("Login required before generating a meal plan.");
    return;
  }

  clearBanners();
  setPanelError("mealPlans", "");
  setPanelLoading("mealPlans", true);
  renderPlanner();

  try {
    const plan = await api.generateMealPlan(state.userId, {
      start_date: document.querySelector("#planStart").value,
      days: Number(document.querySelector("#planDays").value),
      servings: Number(document.querySelector("#planServings").value),
      max_minutes: Number(document.querySelector("#planMinutes").value),
      leftovers: document.querySelector("#planLeftovers").checked,
    });
    state.activePlanId = plan.id;
    await refreshMealPlans();
    setStatus(
      "Your dinner plan is ready. Review your meals and shopping list below.",
    );
  } catch (error) {
    setPanelError("mealPlans", error.message);
  } finally {
    setPanelLoading("mealPlans", false);
    renderPlanner();
  }
});

elements.captureLocationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setPanelError("stores", "This browser does not support location lookup.");
    renderStoreFinder();
    return;
  }

  clearBanners();
  setPanelError("stores", "");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.shopLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        label: `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`,
      };
      elements.locationQueryInput.value = state.shopLocation.label;
      setStatus(
        "Location captured. Click Shop now to find nearby grocery stores.",
      );
      renderStoreFinder();
    },
    (error) => {
      setPanelError("stores", error.message || "Location access was denied.");
      renderStoreFinder();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000,
    },
  );
});

elements.shopNowButton.addEventListener("click", async () => {
  if (!state.userId) {
    setError("Login required before shopping nearby.");
    return;
  }

  if (!state.activePlanId) {
    setError("Generate a meal plan before shopping nearby.");
    return;
  }

  clearBanners();
  setPanelError("stores", "");
  setPanelLoading("stores", true);
  state.storePage = 1;
  renderStoreFinder();

  try {
    const lookupLocation = state.shopLocation || defaultShopLocation;
    const queryText = elements.locationQueryInput.value.trim();
    const coordinateQuery = parseCoordinateQuery(queryText);
    const payload = coordinateQuery
      ? {
          latitude: coordinateQuery.latitude,
          longitude: coordinateQuery.longitude,
        }
      : queryText
        ? { location_query: queryText }
        : {
            latitude: lookupLocation.latitude,
            longitude: lookupLocation.longitude,
          };

    const response = await api.findNearbyStores(payload);
    state.nearbyStores = response.stores || [];
    state.selectedStoreId = null;
    if (response.resolved_location) {
      elements.locationQueryInput.value = response.resolved_location;
    }
    setStatus(
      `Nearby grocery stores loaded using ${response.resolved_location || queryText || lookupLocation.label}.`,
    );
  } catch (error) {
    state.nearbyStores = [];
    setPanelError("stores", error.message);
    setError(error.message);
  } finally {
    setPanelLoading("stores", false);
    renderStoreFinder();
  }
});

elements.reloadPlansButton.addEventListener("click", async () => {
  clearBanners();
  await refreshMealPlans();
  setStatus("Reloaded meal plans.");
});

elements.planPicker.addEventListener("change", async (event) => {
  state.activePlanId = event.target.value;
  persistSession();
  await refreshShoppingList();
  renderPlanner();
});

elements.manualShoppingForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.userId) {
    setError("Login required before saving shopping items.");
    return;
  }

  const name = elements.manualItemName.value.trim();
  const quantity = Number(elements.manualItemQuantity.value || 1);
  const unit = elements.manualItemUnit.value.trim();

  if (!name || !Number.isFinite(quantity) || quantity <= 0) {
    setError(
      "Manual shopping item requires a name and a quantity greater than 0.",
    );
    return;
  }

  clearBanners();
  setPanelLoading("manualShopping", true);
  renderManualShoppingItems();

  try {
    const response = await api.addManualShoppingItem(state.userId, {
      name,
      quantity,
      unit,
    });
    state.manualShoppingItems = [...state.manualShoppingItems, response.item];
    elements.manualShoppingForm.reset();
    elements.manualItemQuantity.value = "1";
    await refreshShoppingList();
    setStatus(`${name} added to manual shopping items.`);
  } catch (error) {
    setError(error.message);
  } finally {
    setPanelLoading("manualShopping", false);
    renderManualShoppingItems();
  }
});

document
  .querySelector("#reviewPurchases")
  .addEventListener("click", async () => {
    try {
      await openPurchases(state.userId, state.activePlanId);
    } catch (error) {
      setError(error.message);
    }
  });
window.addEventListener("mychef:kitchen-changed", async () => {
  if (!state.userId) return;
  const userId = state.userId;
  try {
    const [pantry, manual] = await Promise.all([
      api.getPantry(userId),
      api.getManualShoppingItems(userId),
    ]);
    if (state.userId !== userId) return;
    state.pantry = pantry.pantry;
    state.pantryRevision = pantry.pantry_revision;
    state.manualShoppingItems = manual.items;
    await refreshMealPlans();
    renderPreferences();
    setStatus("Your kitchen and remaining dinners are up to date.");
  } catch (error) {
    setError(error.message);
  }
});
const unitOptions = [
  "count",
  "cup",
  "tbsp",
  "tsp",
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "l",
  "clove",
  "slice",
  "can",
];
for (const id of ["pantryUnit", "manualItemUnit"])
  document.querySelector(`#${id}`).innerHTML = unitOptions
    .map(
      (unit) =>
        `<option value="${unit}">${unit === "count" ? "items" : unit}</option>`,
    )
    .join("");
document.querySelector("#pantryUnit").value = "cup";
const today = new Date();
document.querySelector("#planStart").value =
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
document.querySelector("#planSettings").addEventListener("submit", (event) => {
  event.preventDefault();
  elements.generatePlanButton.click();
});
window.addEventListener("mychef:expired", () => {
  clearSession();
  setError("Please sign in again to continue.");
  render();
});
async function initialize() {
  loadStoredSession();
  render();
  await loadRecipes();
  try {
    const options = await api.dietaryOptions();
    document.querySelector("#exclusionOptions").textContent =
      options.exclusions.join(", ");
  } catch (error) {
    setError(error.message);
  }
  try {
    const session = await api.session();
    state.userId = session.user_id;
    state.username = session.username;
    await loadUserData();
  } catch (error) {
    clearSession();
    if (error.status !== 401) setError(error.message);
    render();
  }
}
initialize();
