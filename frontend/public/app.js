import { api } from "/api.js";

const storageKey = "mychef-session";
const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const recipesPerPage = 4;
const storesPerPage = 3;
const defaultShopLocation = {
  latitude: 40.1106,
  longitude: -88.2284,
  label: "UIUC campus default"
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
  favorites: [],
  manualShoppingItems: [],
  mealPlans: [],
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
    storeReviews: false
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
    storeReviews: ""
  }
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
  favoriteMeals: document.querySelector("#favoriteMeals")
};

function loadStoredSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.userId) {
      state.userId = saved.userId;
      state.username = saved.username || "";
      state.activePlanId = saved.activePlanId || null;
    }
  } catch (_error) {
    localStorage.removeItem(storageKey);
  }
}

function persistSession() {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      userId: state.userId,
      username: state.username,
      activePlanId: state.activePlanId
    })
  );
}

function clearSession() {
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
      "'": "&#39;"
    }[character];
  });
}

function getAllTags() {
  return [...new Set(state.allRecipes.flatMap((recipe) => recipe.dietary_tags || []))].sort();
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
  if (distanceMiles === null || distanceMiles === undefined || Number.isNaN(distanceMiles)) {
    return "Distance unavailable";
  }

  if (distanceMiles < 0.2) {
    return "Less than 0.2 mi away";
  }

  return `${distanceMiles.toFixed(1)} mi away`;
}

function getSelectedStore() {
  return state.nearbyStores.find((store) => store.store_id === state.selectedStoreId) || null;
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
  const match = String(value).trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
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
      return store.store_id === storeId ? { ...store, ...response.store } : store;
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
    state.recipes = state.recipeFilter ? await api.getRecipes(state.recipeFilter) : allRecipes;
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
    const response = await api.getShoppingList(state.userId, state.activePlanId);
    state.shoppingListItems = response.shopping_list_items || [];
    state.alreadyHaveItems = response.already_have_items || [];
  } catch (error) {
    setPanelError("shoppingList", error.message);
    state.shoppingListItems = [];
    state.alreadyHaveItems = [];
  } finally {
    setPanelLoading("shoppingList", false);
    renderPlanner();
    renderSummary();
  }
}

async function refreshMealPlans() {
  if (!state.userId) {
    return;
  }

  setPanelLoading("mealPlans", true);
  setPanelError("mealPlans", "");

  try {
    state.mealPlans = await api.getMealPlans(state.userId);
    if (!state.activePlanId || !state.mealPlans.some((plan) => plan.id === state.activePlanId)) {
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
  if (!state.userId) {
    render();
    return;
  }

  state.appLoading = true;
  clearBanners();
  renderAccount();

  try {
    const [preferences, pantry, favorites, manualItems, mealPlans] = await Promise.all([
      api.getPreferences(state.userId),
      api.getPantry(state.userId),
      api.getFavorites(state.userId),
      api.getManualShoppingItems(state.userId),
      api.getMealPlans(state.userId)
    ]);

    state.preferences = preferences.dietary_preferences || [];
    state.restrictions = preferences.dietary_restrictions || [];
    state.pantry = pantry.pantry || [];
    state.favorites = favorites || [];
    state.manualShoppingItems = manualItems.items || [];
    state.mealPlans = mealPlans || [];

    if (!state.activePlanId || !state.mealPlans.some((plan) => plan.id === state.activePlanId)) {
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
  elements.favoriteCount.textContent = String(state.favorites.length);
  elements.shoppingCount.textContent = String(state.shoppingListItems.length);
  elements.planCount.textContent = String(state.mealPlans.length);
}

function renderAccount() {
  if (state.userId) {
    elements.accountPanelBody.innerHTML = `
      <div class="account-summary">
        <p class="inline-note">Signed in as <strong>${state.username}</strong>.</p>
        <p class="inline-note">The frontend stores the backend-returned <code>user_id</code> locally because there is no token yet.</p>
        <button id="logoutButton" type="button" class="secondary-button">Log out</button>
      </div>
    `;

    elements.accountPanelBody.querySelector("#logoutButton").addEventListener("click", () => {
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
        <input type="text" id="usernameInput" placeholder="student123" required />
      </label>
      <label>
        Password
        <input type="password" id="passwordInput" placeholder="••••••••" required />
      </label>
      <button type="submit">${state.authLoading ? "Working..." : state.authMode === "login" ? "Login" : "Create account"}</button>
    </form>
    <div class="inline-note">
      ${state.authMode === "register"
        ? "Account creation writes a user record through the backend."
        : "Login checks the backend user record and returns a user_id."}
    </div>
  `;

  elements.accountPanelBody.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.mode;
      renderAccount();
    });
  });

  elements.accountPanelBody.querySelector("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearBanners();
    const username = elements.accountPanelBody.querySelector("#usernameInput").value.trim();
    const password = elements.accountPanelBody.querySelector("#passwordInput").value.trim();
    state.authLoading = true;
    renderAccount();

    try {
      const response = state.authMode === "login"
        ? await api.login({ username, password })
        : await api.register({
            username,
            password,
            dietary_preferences: [],
            dietary_restrictions: []
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
  const disabled = !state.userId || state.appLoading || state.panelLoading.preferences;
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
  elements.preferencesPanelBody.querySelector(".auth-required-note").hidden = Boolean(state.userId);

  elements.pantryInput.disabled = disabled || state.panelLoading.pantry;
  elements.pantryForm.querySelector("button").disabled = disabled || state.panelLoading.pantry;
  renderPantry();
}

function renderPantry() {
  elements.pantryList.innerHTML = "";

  if (!state.pantry.length) {
    elements.pantryEmpty.hidden = false;
  } else {
    elements.pantryEmpty.hidden = true;
    state.pantry.forEach((item) => {
      const row = document.createElement("li");
      row.innerHTML = `
        <span>${item}</span>
        <button type="button" class="secondary-button">Remove</button>
      `;
      row.querySelector("button").disabled = !state.userId || state.panelLoading.pantry;
      row.querySelector("button").addEventListener("click", async () => {
        clearBanners();
        setPanelError("pantry", "");
        setPanelLoading("pantry", true);
        renderPreferences();
        try {
          await api.removePantryItem(state.userId, item);
          state.pantry = state.pantry.filter((value) => value !== item);
          await refreshShoppingList();
          setStatus(`Removed ${item} from pantry.`);
        } catch (error) {
          setPanelError("pantry", error.message);
        } finally {
          setPanelLoading("pantry", false);
          renderPreferences();
        }
      });
      elements.pantryList.appendChild(row);
    });
  }

  const pantryMessage = elements.preferencesPanelBody.querySelector(".pantry-message");
  pantryMessage.textContent = state.panelErrors.pantry;
  pantryMessage.hidden = !state.panelErrors.pantry;
}

function renderRecipeDetail() {
  const detail = state.selectedRecipeId ? state.recipeDetails.get(state.selectedRecipeId) || null : null;

  elements.recipeDetail.innerHTML = "";
  if (!state.selectedRecipeId) {
    elements.recipeDetail.appendChild(createEmptyState("Select a recipe to load full instructions."));
    return;
  }

  if (!detail) {
    elements.recipeDetail.appendChild(createEmptyState("Loading recipe details..."));
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "detail-card";
  wrapper.innerHTML = `
    <div class="split-heading">
      <div>
        <p class="eyebrow">Recipe Details</p>
        <h3>${detail.name}</h3>
      </div>
      <span class="recipe-tags">${detail.dietary_tags.length ? detail.dietary_tags.join(" • ") : "No tags"}</span>
    </div>
    <p class="inline-note">Meal type: ${detail.meal_type} • Prep: ${detail.prep_time_minutes} min</p>
    <p class="inline-note">Ingredients: ${detail.ingredients.join(", ")}</p>
    <ol class="steps-list">
      ${detail.steps.map((step) => `
        <li>
          <strong>${step.instruction}</strong>
          <span>${step.tip}</span>
        </li>
      `).join("")}
    </ol>
  `;

  elements.recipeDetail.appendChild(wrapper);
}

function recipeCard(recipe) {
  const article = document.createElement("article");
  article.className = "recipe-card";
  const isFavorite = state.favorites.some((favorite) => favorite.id === recipe.id);

  article.innerHTML = `
    <div class="recipe-topline">
      <span class="recipe-store">${recipe.meal_type}</span>
      <span class="recipe-tags">${recipe.dietary_tags.length ? recipe.dietary_tags.join(" • ") : "No tags"}</span>
    </div>
    <h3>${recipe.name}</h3>
    <p class="recipe-description">${recipe.ingredients.join(", ")}</p>
    <div class="recipe-meta">
      <span class="ingredient-pill">${recipe.prep_time_minutes} min</span>
      <span class="ingredient-pill">${recipe.ingredients.length} ingredients</span>
    </div>
    <div class="recipe-actions">
      <button type="button" data-action="view">View recipe</button>
      <button type="button" class="secondary-button" data-action="favorite">${isFavorite ? "Unfavorite" : "Favorite"}</button>
    </div>
  `;

  article.querySelector('[data-action="view"]').addEventListener("click", async () => {
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

  article.querySelector('[data-action="favorite"]').addEventListener("click", async () => {
    if (!state.userId) {
      setError("Login required before using favorites.");
      return;
    }

    clearBanners();
    try {
      if (isFavorite) {
        await api.removeFavorite(state.userId, recipe.id);
        state.favorites = state.favorites.filter((favorite) => favorite.id !== recipe.id);
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
    elements.recipeGrid.appendChild(createEmptyState(state.panelErrors.recipes));
    return;
  }

  if (!state.recipes.length) {
    elements.recipeGrid.appendChild(createEmptyState("No recipes match the current tag filter."));
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
  elements.captureLocationButton.disabled = !state.userId || state.panelLoading.stores;
  elements.shopNowButton.disabled = requiresPlan || state.panelLoading.stores;
  elements.locationQueryInput.disabled = !state.userId || state.panelLoading.stores;

  if (!state.userId) {
    elements.locationStatus.textContent = "Login to find nearby grocery stores.";
  } else if (!state.activePlanId) {
    elements.locationStatus.textContent = "Generate or load a meal plan before shopping.";
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
    elements.storeResults.appendChild(createEmptyState("Nearby grocery stores appear here after login."));
    return;
  }

  if (!state.activePlanId) {
    elements.storeResults.appendChild(createEmptyState("Create a meal plan to start shopping nearby."));
    return;
  }

  if (state.panelLoading.stores) {
    elements.storeResults.appendChild(createEmptyState("Finding nearby stores..."));
    return;
  }

  if (!state.nearbyStores.length) {
    elements.storeResults.appendChild(createEmptyState("No store lookup yet. Click Shop now to use your saved or default location."));
    return;
  }

  const pageCount = getStorePageCount();
  state.storePage = Math.min(state.storePage, pageCount);

  getVisibleStores().forEach((store) => {
    const averageRating = store.average_rating ?? getAverageStoreRating(store.store_id);
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

    card.querySelector('[data-action="view-reviews"]').addEventListener("click", () => {
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
  const averageRating = store.average_rating ?? getAverageStoreRating(store.store_id);
  const reviewCountLabel = `${reviews.length} review${reviews.length === 1 ? "" : "s"}`;
  const currentUserReview = reviews.find((review) => review.user_id === state.userId) || null;
  const submitLabel = state.panelLoading.storeReviews
    ? currentUserReview ? "Saving..." : "Submitting..."
    : currentUserReview ? "Edit review" : "Submit review";

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
            ? reviews.map((review) => `
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
            `).join("")
            : `<div class="empty-state">No reviews yet for this grocery store.</div>`
        }
      </div>
    </section>
  `;

  wrapper.querySelector('[data-action="close-reviews"]').addEventListener("click", () => {
    state.selectedStoreId = null;
    renderStoreFinder();
  });

  wrapper.querySelector("#storeReviewForm").addEventListener("submit", (event) => {
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

    api.addStoreReview(store.store_id, {
      user_id: state.userId,
      rating: Number(formData.get("rating")),
      comment,
      store_name: store.name,
      latitude: store.latitude,
      longitude: store.longitude
    }).then((response) => {
      state.storeReviews[store.store_id] = response.reviews || [];
      state.nearbyStores = state.nearbyStores.map((entry) => {
        return entry.store_id === store.store_id ? { ...entry, ...response.store } : entry;
      });
      setStatus(currentUserReview ? `Review updated for ${store.name}.` : `Review saved for ${store.name}.`);
    }).catch((error) => {
      setPanelError("storeReviews", error.message);
      setError(error.message);
    }).finally(() => {
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

    api.deleteStoreReview(store.store_id, state.userId).then((response) => {
      state.storeReviews[store.store_id] = response.reviews || [];
      state.nearbyStores = state.nearbyStores.map((entry) => {
        return entry.store_id === store.store_id ? { ...entry, ...response.store } : entry;
      });
      setStatus(`Review deleted for ${store.name}.`);
    }).catch((error) => {
      setPanelError("storeReviews", error.message);
      setError(error.message);
    }).finally(() => {
      setPanelLoading("storeReviews", false);
      renderStoreFinder();
    });
  });

  elements.storeDetail.appendChild(wrapper);
}

function renderManualShoppingItems() {
  elements.manualShoppingList.innerHTML = "";

  if (!state.userId) {
    elements.manualShoppingList.appendChild(createEmptyState("Login to save manual shopping items."));
    return;
  }

  if (!state.manualShoppingItems.length) {
    elements.manualShoppingList.appendChild(createEmptyState("No manual shopping items yet."));
    return;
  }

  state.manualShoppingItems.forEach((item) => {
    const row = document.createElement("li");
    const display = [item.quantity || 1, item.unit || "", item.name].filter(Boolean).join(" ");
    row.innerHTML = `
      <span>${display}</span>
      <button type="button" class="secondary-button">Remove</button>
    `;
    row.querySelector("button").disabled = state.panelLoading.manualShopping;
    row.querySelector("button").addEventListener("click", async () => {
      clearBanners();
      setPanelLoading("manualShopping", true);
      renderManualShoppingItems();
      try {
        await api.removeManualShoppingItem(state.userId, item.id);
        state.manualShoppingItems = state.manualShoppingItems.filter((entry) => entry.id !== item.id);
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

function renderShoppingLists() {
  elements.shoppingList.innerHTML = "";
  elements.alreadyHaveList.innerHTML = "";

  if (!state.userId) {
    elements.shoppingList.appendChild(createEmptyState("Login to generate a shopping list."));
    elements.alreadyHaveList.appendChild(createEmptyState("Pantry matches appear here after a plan is loaded."));
    return;
  }

  if (state.panelLoading.shoppingList) {
    elements.shoppingList.appendChild(createEmptyState("Loading shopping list..."));
    elements.alreadyHaveList.appendChild(createEmptyState("Checking pantry coverage..."));
    return;
  }

  if (state.panelErrors.shoppingList) {
    elements.shoppingList.appendChild(createEmptyState(state.panelErrors.shoppingList));
    elements.alreadyHaveList.appendChild(createEmptyState(state.panelErrors.shoppingList));
    return;
  }

  if (!state.shoppingListItems.length) {
    elements.shoppingList.appendChild(createEmptyState("No shopping list yet for the current meal plan."));
  } else {
    state.shoppingListItems.forEach((item) => {
      const row = document.createElement("li");
      row.innerHTML = `<span>${item.display}</span><strong>${item.sources.join(" + ")}</strong>`;
      elements.shoppingList.appendChild(row);
    });
  }

  if (!state.alreadyHaveItems.length) {
    elements.alreadyHaveList.appendChild(createEmptyState("No pantry matches yet."));
  } else {
    state.alreadyHaveItems.forEach((item) => {
      const row = document.createElement("li");
      row.innerHTML = `<span>${item.display}</span><strong>${item.sources.join(" + ")}</strong>`;
      elements.alreadyHaveList.appendChild(row);
    });
  }
}

function renderPlanner() {
  const activePlan = getActivePlan();
  elements.planPickerWrap.hidden = state.mealPlans.length === 0;
  elements.planPicker.innerHTML = "";

  state.mealPlans.forEach((plan, index) => {
    const option = document.createElement("option");
    option.value = plan.id;
    option.textContent = `Plan ${index + 1} • ${plan.id.slice(0, 8)}`;
    option.selected = plan.id === state.activePlanId;
    elements.planPicker.appendChild(option);
  });

  elements.generatePlanButton.disabled = !state.userId || state.panelLoading.mealPlans;
  elements.reloadPlansButton.disabled = !state.userId || state.panelLoading.mealPlans;
  elements.weeklyMeals.innerHTML = "";

  if (!state.userId) {
    elements.weeklyMeals.appendChild(createEmptyState("Login to generate and manage meal plans."));
  } else if (state.panelLoading.mealPlans) {
    elements.weeklyMeals.appendChild(createEmptyState("Loading meal plans..."));
  } else if (state.panelErrors.mealPlans) {
    elements.weeklyMeals.appendChild(createEmptyState(state.panelErrors.mealPlans));
  } else if (!activePlan) {
    elements.weeklyMeals.appendChild(createEmptyState("No meal plan saved yet. Generate one to get started."));
  } else {
    activePlan.recipe_ids.forEach((recipeId, dayIndex) => {
      const recipe = getRecipeById(recipeId) || state.recipeDetails.get(recipeId);
      const card = document.createElement("article");
      card.className = "weekly-card";
      const swapOptions = state.allRecipes
        .map((item) => `<option value="${item.id}" ${item.id === recipeId ? "selected" : ""}>${item.name}</option>`)
        .join("");

      card.innerHTML = `
        <span class="meal-day">${weekDays[dayIndex]}</span>
        <h3>${recipe ? recipe.name : recipeId}</h3>
        <div class="recipe-meta">
          ${
            recipe
              ? recipe.ingredients.map((ingredient) => `<span class="ingredient-pill">${ingredient}</span>`).join("")
              : `<span class="ingredient-pill">Recipe unavailable</span>`
          }
        </div>
        <div class="swap-controls">
          <select aria-label="Swap meal for ${weekDays[dayIndex]}">${swapOptions}</select>
          <button type="button" data-action="swap">Swap meal</button>
          <button type="button" class="secondary-button" data-action="auto-swap">Auto swap</button>
        </div>
      `;

      const select = card.querySelector("select");
      const swapButton = card.querySelector('[data-action="swap"]');
      const autoSwapButton = card.querySelector('[data-action="auto-swap"]');

      swapButton.addEventListener("click", async () => {
        clearBanners();
        try {
          await api.swapMeal(state.userId, activePlan.id, {
            day_index: dayIndex,
            new_recipe_id: select.value
          });
          setStatus(`Swapped ${weekDays[dayIndex]}'s meal.`);
          await refreshMealPlans();
        } catch (error) {
          setError(error.message);
        }
      });

      autoSwapButton.addEventListener("click", async () => {
        clearBanners();
        try {
          await api.swapMealAuto(state.userId, activePlan.id, dayIndex);
          setStatus(`Auto-swapped ${weekDays[dayIndex]}'s meal.`);
          await refreshMealPlans();
        } catch (error) {
          setError(error.message);
        }
      });

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
    elements.favoriteMeals.appendChild(createEmptyState("Login to save favorite recipes."));
    return;
  }

  if (!state.favorites.length) {
    elements.favoriteMeals.appendChild(createEmptyState("No favorite recipes saved yet."));
    return;
  }

  state.favorites.forEach((recipe) => {
    const card = document.createElement("article");
    card.className = "favorite-card";
    card.innerHTML = `
      <h3>${recipe.name}</h3>
      <p class="recipe-description">${recipe.ingredients.join(", ")}</p>
      <div class="recipe-meta">
        <span class="ingredient-pill">${recipe.dietary_tags.length ? recipe.dietary_tags.join(" • ") : "No tags"}</span>
      </div>
      <div class="recipe-actions">
        <button type="button" data-action="view">View recipe</button>
        <button type="button" class="secondary-button" data-action="remove">Remove</button>
      </div>
    `;

    card.querySelector('[data-action="view"]').addEventListener("click", async () => {
      state.selectedRecipeId = recipe.id;
      renderRecipeDetail();
      try {
        await fetchRecipeDetails(recipe.id);
        renderRecipeDetail();
      } catch (error) {
        setError(error.message);
      }
    });

    card.querySelector('[data-action="remove"]').addEventListener("click", async () => {
      clearBanners();
      try {
        await api.removeFavorite(state.userId, recipe.id);
        state.favorites = state.favorites.filter((favorite) => favorite.id !== recipe.id);
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

  clearBanners();
  setPanelError("preferences", "");
  setPanelLoading("preferences", true);
  renderPreferences();

  try {
    const restrictions = elements.restrictionsInput.value
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    await api.updatePreferences(state.userId, {
      dietary_preferences: state.preferences,
      dietary_restrictions: restrictions
    });
    state.restrictions = restrictions;
    setStatus("Preferences saved.");
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
    const nextPantry = state.pantry.includes(item) ? state.pantry : [...state.pantry, item];
    const response = await api.updatePantry(state.userId, { items: nextPantry });
    state.pantry = response.pantry || nextPantry;
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
    const plan = await api.generateMealPlan(state.userId);
    state.activePlanId = plan.id;
    await refreshMealPlans();
    setStatus("Generated a new 7-day meal plan.");
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
        label: `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`
      };
      elements.locationQueryInput.value = state.shopLocation.label;
      setStatus("Location captured. Click Shop now to find nearby grocery stores.");
      renderStoreFinder();
    },
    (error) => {
      setPanelError("stores", error.message || "Location access was denied.");
      renderStoreFinder();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
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
          longitude: coordinateQuery.longitude
        }
      : queryText
        ? { location_query: queryText }
        : {
            latitude: lookupLocation.latitude,
            longitude: lookupLocation.longitude
          };

    const response = await api.findNearbyStores(payload);
    state.nearbyStores = response.stores || [];
    state.selectedStoreId = null;
    if (response.resolved_location) {
      elements.locationQueryInput.value = response.resolved_location;
    }
    setStatus(`Nearby grocery stores loaded using ${response.resolved_location || queryText || lookupLocation.label}.`);
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
    setError("Manual shopping item requires a name and a quantity greater than 0.");
    return;
  }

  clearBanners();
  setPanelLoading("manualShopping", true);
  renderManualShoppingItems();

  try {
    const response = await api.addManualShoppingItem(state.userId, { name, quantity, unit });
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

loadStoredSession();
render();
loadRecipes().then(() => {
  if (state.userId) {
    return loadUserData();
  }
  return null;
});
