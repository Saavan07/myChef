import { api } from "/api.js";

const storageKey = "mychef-session";
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
  manualShoppingItems: [],
  mealPlans: [],
  activePlanId: null,
  shoppingListItems: [],
  alreadyHaveItems: [],
  panelLoading: {
    recipes: false,
    preferences: false,
    pantry: false,
    favorites: false,
    mealPlans: false,
    shoppingList: false,
    manualShopping: false
  },
  panelErrors: {
    recipes: "",
    preferences: "",
    pantry: "",
    favorites: "",
    mealPlans: "",
    shoppingList: "",
    manualShopping: ""
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
  recipeDetail: document.querySelector("#recipeDetail"),
  generatePlanButton: document.querySelector("#generatePlanButton"),
  reloadPlansButton: document.querySelector("#reloadPlansButton"),
  planPickerWrap: document.querySelector("#planPickerWrap"),
  planPicker: document.querySelector("#planPicker"),
  weeklyMeals: document.querySelector("#weeklyMeals"),
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

function getAllTags() {
  return [...new Set(state.allRecipes.flatMap((recipe) => recipe.dietary_tags || []))].sort();
}

function getRecipeById(recipeId) {
  return state.allRecipes.find((recipe) => recipe.id === recipeId) || null;
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

  state.recipes.forEach((recipe) => {
    elements.recipeGrid.appendChild(recipeCard(recipe));
  });
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
