import { api } from "/api.js";

const storageKey = "mychef-frontend-state";
const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
  recipeDetails: new Map(),
  selectedRecipeId: null,
  preferences: [],
  restrictions: [],
  pantry: [],
  favorites: [],
  mealPlans: [],
  activePlanId: null,
  shoppingList: [],
  alreadyHave: [],
  panelLoading: {
    recipes: false,
    preferences: false,
    pantry: false,
    favorites: false,
    mealPlans: false,
    shoppingList: false
  },
  panelErrors: {
    recipes: "",
    preferences: "",
    pantry: "",
    favorites: "",
    mealPlans: "",
    shoppingList: ""
  }
};

const elements = {
  statusBanner: document.querySelector("#statusBanner"),
  errorBanner: document.querySelector("#errorBanner"),
  dailyCount: document.querySelector("#dailyCount"),
  favoriteCount: document.querySelector("#favoriteCount"),
  shoppingCount: document.querySelector("#shoppingCount"),
  activePlanCount: document.querySelector("#activePlanCount"),
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
  recipeDetail: document.querySelector("#recipeDetail"),
  generatePlanButton: document.querySelector("#generatePlanButton"),
  reloadPlansButton: document.querySelector("#reloadPlansButton"),
  planPicker: document.querySelector("#planPicker"),
  planPickerWrap: document.querySelector("#planPickerWrap"),
  weeklyMeals: document.querySelector("#weeklyMeals"),
  shoppingList: document.querySelector("#shoppingList"),
  alreadyHaveList: document.querySelector("#alreadyHaveList"),
  favoriteMeals: document.querySelector("#favoriteMeals")
};

function loadStoredSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (stored?.userId) {
      state.userId = stored.userId;
      state.username = stored.username || "";
      state.activePlanId = stored.activePlanId || null;
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
  state.mealPlans = [];
  state.activePlanId = null;
  state.shoppingList = [];
  state.alreadyHave = [];
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

function setPanelLoading(panel, isLoading) {
  state.panelLoading[panel] = isLoading;
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

function getAllTags() {
  return [...new Set(state.allRecipes.flatMap((recipe) => recipe.dietary_tags))].sort();
}

function getRecipeById(recipeId) {
  return state.allRecipes.find((recipe) => recipe.id === recipeId) || null;
}

function getSelectedRecipeDetail() {
  return state.selectedRecipeId ? state.recipeDetails.get(state.selectedRecipeId) || null : null;
}

function getActivePlan() {
  return state.mealPlans.find((plan) => plan.id === state.activePlanId) || null;
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

async function loadUserData() {
  if (!state.userId) {
    render();
    return;
  }

  state.appLoading = true;
  clearBanners();
  renderAccount();

  try {
    const [preferences, pantry, favorites, mealPlans] = await Promise.all([
      api.getPreferences(state.userId),
      api.getPantry(state.userId),
      api.getFavorites(state.userId),
      api.getMealPlans(state.userId)
    ]);

    state.preferences = preferences.dietary_preferences || [];
    state.restrictions = preferences.dietary_restrictions || [];
    state.pantry = pantry.pantry || [];
    state.favorites = favorites || [];
    state.mealPlans = mealPlans || [];

    if (!state.activePlanId || !state.mealPlans.some((plan) => plan.id === state.activePlanId)) {
      state.activePlanId = state.mealPlans.at(-1)?.id || null;
    }

    if (state.activePlanId) {
      const shopping = await api.getShoppingList(state.userId, state.activePlanId);
      state.shoppingList = shopping.shopping_list || [];
      state.alreadyHave = shopping.already_have || [];
    } else {
      state.shoppingList = [];
      state.alreadyHave = [];
    }

    persistSession();
    setStatus(`Signed in as ${state.username || "user"}.`);
  } catch (error) {
    clearSession();
    setError(`Session could not be restored: ${error.message}`);
  } finally {
    state.appLoading = false;
    render();
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

async function refreshShoppingList() {
  if (!state.userId || !state.activePlanId) {
    state.shoppingList = [];
    state.alreadyHave = [];
    renderPlanner();
    renderSummary();
    return;
  }

  setPanelLoading("shoppingList", true);
  setPanelError("shoppingList", "");

  try {
    const shopping = await api.getShoppingList(state.userId, state.activePlanId);
    state.shoppingList = shopping.shopping_list || [];
    state.alreadyHave = shopping.already_have || [];
  } catch (error) {
    setPanelError("shoppingList", error.message);
    state.shoppingList = [];
    state.alreadyHave = [];
  } finally {
    setPanelLoading("shoppingList", false);
    renderPlanner();
    renderSummary();
  }
}

function createEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function renderSummary() {
  elements.dailyCount.textContent = String(state.recipes.length);
  elements.favoriteCount.textContent = String(state.favorites.length);
  elements.shoppingCount.textContent = String(state.shoppingList.length);
  elements.activePlanCount.textContent = getActivePlan() ? "1 active" : "No plan";
}

function renderAccount() {
  const authenticated = Boolean(state.userId);

  if (authenticated) {
    elements.accountPanelBody.innerHTML = `
      <div class="account-summary">
        <p class="inline-note">Signed in as <strong>${state.username}</strong>.</p>
        <p class="inline-note">Stored session uses backend-provided <code>user_id</code> because there is no token yet.</p>
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
        ? "Registration currently creates an in-memory backend user and immediately signs them in."
        : "Login uses the backend's current plaintext username/password flow."}
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
    state.authLoading = true;
    renderAccount();

    const username = elements.accountPanelBody.querySelector("#usernameInput").value.trim();
    const password = elements.accountPanelBody.querySelector("#passwordInput").value.trim();

    try {
      const payload = { username, password };
      const response =
        state.authMode === "login"
          ? await api.login(payload)
          : await api.register({
              ...payload,
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
        ? state.preferences.filter((item) => item !== tag)
        : [...state.preferences, tag];
      renderPreferences();
    });
    elements.preferences.appendChild(button);
  });

  elements.restrictionsInput.value = state.restrictions.join(", ");
  elements.restrictionsInput.disabled = disabled;
  elements.savePreferencesButton.disabled = disabled;
  elements.preferencesPanelBody.querySelector(".panel-message").textContent = state.panelErrors.preferences;
  elements.preferencesPanelBody.querySelector(".panel-message").hidden = !state.panelErrors.preferences;
  elements.preferencesPanelBody.querySelector(".auth-required-note").hidden = Boolean(state.userId);

  elements.pantryInput.disabled = disabled || state.panelLoading.pantry;
  elements.pantryForm.querySelector("button").disabled = disabled || state.panelLoading.pantry;
  renderPantry();
}

function renderPantry() {
  elements.pantryList.innerHTML = "";

  if (state.pantry.length === 0) {
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
          state.pantry = state.pantry.filter((entry) => entry !== item);
          renderPantry();
          await refreshShoppingList();
          setStatus(`Removed ${item} from pantry.`);
        } catch (error) {
          setPanelError("pantry", error.message);
          renderPreferences();
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

function recipeCard(recipe) {
  const article = document.createElement("article");
  article.className = "recipe-card";

  const isFavorite = state.favorites.some((favorite) => favorite.id === recipe.id);

  article.innerHTML = `
    <div class="recipe-topline">
      <span class="recipe-store">Recipe</span>
      <span class="recipe-tags">${recipe.dietary_tags.length ? recipe.dietary_tags.join(" • ") : "No tags"}</span>
    </div>
    <h3>${recipe.name}</h3>
    <p class="recipe-description">${recipe.ingredients.join(", ")}</p>
    <div class="recipe-meta">
      <span class="ingredient-pill">${recipe.ingredients.length} ingredients</span>
      <span class="ingredient-pill">${recipe.steps.length} steps</span>
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
  const currentOptions = new Set(
    [...elements.recipeFilter.options].map((option) => option.value)
  );

  if (currentOptions.size !== tags.length + 1 || !currentOptions.has(state.recipeFilter || "")) {
    elements.recipeFilter.innerHTML = `<option value="">All tags</option>`;
    tags.forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      elements.recipeFilter.appendChild(option);
    });
  }

  elements.recipeFilter.value = state.recipeFilter;
  elements.recipeGrid.innerHTML = "";

  if (state.panelLoading.recipes) {
    elements.recipeGrid.appendChild(createEmptyState("Loading recipes..."));
    return;
  }

  if (state.panelErrors.recipes) {
    elements.recipeGrid.appendChild(createEmptyState(state.panelErrors.recipes));
    return;
  }

  if (state.recipes.length === 0) {
    elements.recipeGrid.appendChild(createEmptyState("No recipes match the current backend tag filter."));
    return;
  }

  state.recipes.forEach((recipe) => {
    elements.recipeGrid.appendChild(recipeCard(recipe));
  });
}

function renderRecipeDetail() {
  const detail = getSelectedRecipeDetail();

  if (!state.selectedRecipeId) {
    elements.recipeDetail.innerHTML = "";
    elements.recipeDetail.appendChild(createEmptyState("Select a recipe to load full steps and tips from the backend."));
    return;
  }

  if (!detail) {
    elements.recipeDetail.innerHTML = "";
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
    <p class="inline-note">Ingredients: ${detail.ingredients.join(", ")}</p>
    <ol class="steps-list">
      ${detail.steps
        .map(
          (step) => `
            <li>
              <strong>${step.instruction}</strong>
              <span>${step.tip}</span>
            </li>
          `
        )
        .join("")}
    </ol>
  `;

  elements.recipeDetail.innerHTML = "";
  elements.recipeDetail.appendChild(wrapper);
}

function renderPlanner() {
  const activePlan = getActivePlan();
  elements.planPickerWrap.hidden = state.mealPlans.length === 0;
  elements.planPicker.innerHTML = "";

  state.mealPlans.forEach((plan, index) => {
    const option = document.createElement("option");
    option.value = plan.id;
    option.textContent = `Plan ${index + 1} • ${plan.id.slice(0, 8)}`;
    elements.planPicker.appendChild(option);
  });

  if (state.activePlanId) {
    elements.planPicker.value = state.activePlanId;
  }

  elements.generatePlanButton.disabled = !state.userId || state.panelLoading.mealPlans;
  elements.reloadPlansButton.disabled = !state.userId || state.panelLoading.mealPlans;

  elements.weeklyMeals.innerHTML = "";

  if (!state.userId) {
    elements.weeklyMeals.appendChild(createEmptyState("Login to generate and save meal plans."));
  } else if (state.panelLoading.mealPlans) {
    elements.weeklyMeals.appendChild(createEmptyState("Loading meal plans..."));
  } else if (state.panelErrors.mealPlans) {
    elements.weeklyMeals.appendChild(createEmptyState(state.panelErrors.mealPlans));
  } else if (!activePlan) {
    elements.weeklyMeals.appendChild(createEmptyState("No saved meal plan yet. Generate one from the backend."));
  } else {
    activePlan.recipe_ids.forEach((recipeId, dayIndex) => {
      const recipe = getRecipeById(recipeId) || state.recipeDetails.get(recipeId);
      const card = document.createElement("article");
      card.className = "weekly-card";

      const swapOptions = state.allRecipes
        .length
        ? state.allRecipes
        .map((item) => `<option value="${item.id}" ${item.id === recipeId ? "selected" : ""}>${item.name}</option>`)
        .join("")
        : "";

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
          <button type="button">Swap meal</button>
        </div>
      `;

      const select = card.querySelector("select");
      const button = card.querySelector("button");
      button.addEventListener("click", async () => {
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

      elements.weeklyMeals.appendChild(card);
    });
  }

  renderShoppingLists();
}

function renderShoppingLists() {
  elements.shoppingList.innerHTML = "";
  elements.alreadyHaveList.innerHTML = "";

  if (!state.userId) {
    elements.shoppingList.appendChild(createEmptyState("Shopping list appears after login and meal plan generation."));
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

  if (state.shoppingList.length === 0) {
    elements.shoppingList.appendChild(createEmptyState("No shopping list yet for the current meal plan."));
  } else {
    state.shoppingList.forEach((item) => {
      const row = document.createElement("li");
      row.textContent = item;
      elements.shoppingList.appendChild(row);
    });
  }

  if (state.alreadyHave.length === 0) {
    elements.alreadyHaveList.appendChild(createEmptyState("No pantry matches yet."));
  } else {
    state.alreadyHave.forEach((item) => {
      const row = document.createElement("li");
      row.textContent = item;
      elements.alreadyHaveList.appendChild(row);
    });
  }
}

function renderFavorites() {
  elements.favoriteMeals.innerHTML = "";

  if (!state.userId) {
    elements.favoriteMeals.appendChild(createEmptyState("Login to save and revisit favorite recipes."));
    return;
  }

  if (state.favorites.length === 0) {
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
        <button type="button">View recipe</button>
        <button type="button" class="secondary-button">Remove</button>
      </div>
    `;

    const [viewButton, removeButton] = card.querySelectorAll("button");
    viewButton.addEventListener("click", async () => {
      state.selectedRecipeId = recipe.id;
      renderRecipeDetail();
      try {
        await fetchRecipeDetails(recipe.id);
        renderRecipeDetail();
      } catch (error) {
        setError(error.message);
      }
    });
    removeButton.addEventListener("click", async () => {
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

  const nextPantry = state.pantry.includes(item) ? state.pantry : [...state.pantry, item];

  try {
    const response = await api.updatePantry(state.userId, { items: nextPantry });
    state.pantry = response.pantry || nextPantry;
    elements.pantryInput.value = "";
    renderPantry();
    await refreshShoppingList();
    setStatus(`${item} added to pantry.`);
  } catch (error) {
    setPanelError("pantry", error.message);
    renderPreferences();
  } finally {
    setPanelLoading("pantry", false);
    renderPreferences();
  }
});

elements.recipeFilter.addEventListener("change", async (event) => {
  state.recipeFilter = event.target.value;
  await loadRecipes();
});

elements.refreshRecipesButton.addEventListener("click", async () => {
  clearBanners();
  await loadRecipes();
  setStatus("Recipes refreshed from backend.");
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

elements.reloadPlansButton.addEventListener("click", async () => {
  clearBanners();
  await refreshMealPlans();
  setStatus("Reloaded saved meal plans.");
});

elements.planPicker.addEventListener("change", async (event) => {
  state.activePlanId = event.target.value;
  persistSession();
  await refreshShoppingList();
  renderPlanner();
});

loadStoredSession();
render();
loadRecipes().then(() => {
  if (state.userId) {
    return loadUserData();
  }
  return null;
});
