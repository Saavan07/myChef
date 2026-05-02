const storageKey = "pantry-pilot-state";

const locations = [
  {
    value: "chicago",
    label: "Chicago, IL",
    stores: ["FreshMart Lincoln Park", "Lakeview Green Grocer", "West Loop Market Hall"]
  },
  {
    value: "naperville",
    label: "Naperville, IL",
    stores: ["River Run Foods", "Naperville Organics", "Metro Fresh Naperville"]
  },
  {
    value: "austin",
    label: "Austin, TX",
    stores: ["South Lamar Market", "Capitol Fresh", "Hill Country Co-op"]
  },
  {
    value: "seattle",
    label: "Seattle, WA",
    stores: ["Rain City Foods", "Pike Street Pantry", "Soundview Market"]
  }
];

const preferenceOptions = [
  "Low sodium",
  "Gluten-free",
  "Vegan",
  "Vegetarian",
  "High protein",
  "Dairy-free"
];

const recipes = [
  {
    id: "citrus-tofu-bowl",
    name: "Citrus Tofu Grain Bowl",
    description: "Bright roasted vegetables, quinoa, and sesame tofu for an easy weekday lunch.",
    time: "25 min",
    calories: "460 cal",
    preferences: ["Vegan", "Gluten-free", "Dairy-free"],
    ingredients: ["1 cup Quinoa", "1 block Tofu", "2 Carrots", "2 cups Spinach", "1 Orange", "1 tbsp Sesame seeds"],
    locationAvailability: ["chicago", "austin", "seattle"]
  },
  {
    id: "herbed-salmon",
    name: "Herbed Salmon with Dill Potatoes",
    description: "A fast oven meal with lemon, baby potatoes, and a yogurt-free herb dressing.",
    time: "30 min",
    calories: "520 cal",
    preferences: ["Gluten-free", "High protein"],
    ingredients: ["2 Salmon fillets", "2 cups Baby potatoes", "1 Lemon", "2 cups Green beans", "1/4 cup Parsley"],
    locationAvailability: ["chicago", "naperville", "seattle"]
  },
  {
    id: "lentil-chili",
    name: "Smoky Lentil Chili",
    description: "Pantry-friendly chili with black beans, lentils, and a slow-building chipotle finish.",
    time: "35 min",
    calories: "410 cal",
    preferences: ["Vegan", "Low sodium", "Dairy-free"],
    ingredients: ["1 cup Lentils", "1 can Black beans", "1 can Tomatoes", "1 cup Corn", "1 Onion", "1 Bell pepper"],
    locationAvailability: ["naperville", "austin", "seattle"]
  },
  {
    id: "turkey-wraps",
    name: "Turkey Lettuce Wraps",
    description: "Lean ground turkey with crunchy vegetables and a savory low-sodium sauce.",
    time: "20 min",
    calories: "390 cal",
    preferences: ["Low sodium", "High protein", "Gluten-free"],
    ingredients: ["1 lb Ground turkey", "1 head Butter lettuce", "1 can Water chestnuts", "2 Carrots", "3 Scallions"],
    locationAvailability: ["chicago", "naperville", "austin"]
  },
  {
    id: "mushroom-pasta",
    name: "Creamy Mushroom Oat Pasta",
    description: "A dairy-free comfort dinner using oat cream, garlic mushrooms, and fresh thyme.",
    time: "28 min",
    calories: "500 cal",
    preferences: ["Vegetarian", "Dairy-free"],
    ingredients: ["8 oz Pasta", "2 cups Mushrooms", "1 cup Oat cream", "2 cloves Garlic", "1 tsp Thyme", "1/4 cup Parmesan alternative"],
    locationAvailability: ["chicago", "austin", "seattle"]
  },
  {
    id: "chickpea-tacos",
    name: "Sheet Pan Chickpea Tacos",
    description: "Crispy chickpeas, cabbage slaw, and avocado layered into quick weeknight tacos.",
    time: "22 min",
    calories: "430 cal",
    preferences: ["Vegan", "Dairy-free"],
    ingredients: ["1 can Chickpeas", "8 Corn tortillas", "2 cups Cabbage", "1 Avocado", "1 Lime", "1/4 cup Cilantro"],
    locationAvailability: ["naperville", "austin", "seattle"]
  },
  {
    id: "egg-bites",
    name: "Spinach Egg Bites",
    description: "Portable breakfast bites for busy mornings with spinach, peppers, and feta.",
    time: "24 min",
    calories: "280 cal",
    preferences: ["Vegetarian", "Gluten-free", "High protein"],
    ingredients: ["6 Eggs", "2 cups Spinach", "1 Red pepper", "1/2 cup Feta", "3 Scallions"],
    locationAvailability: ["chicago", "naperville", "austin", "seattle"]
  },
  {
    id: "rice-noodle-stir-fry",
    name: "Rice Noodle Veggie Stir-Fry",
    description: "Gluten-free noodles tossed with snap peas, tamari, and ginger-lime vegetables.",
    time: "18 min",
    calories: "440 cal",
    preferences: ["Gluten-free", "Vegan", "Dairy-free"],
    ingredients: ["8 oz Rice noodles", "2 cups Snap peas", "2 cups Broccoli", "2 tbsp Tamari", "1 tbsp Ginger", "1 Lime"],
    locationAvailability: ["chicago", "austin", "seattle"]
  }
];

const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const defaultState = {
  account: {
    name: "",
    email: ""
  },
  location: "chicago",
  preferences: ["Vegan"],
  favoriteRecipeIds: [],
  weeklyPlan: [],
  manualShoppingItems: [],
  recipeRotation: 0
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return saved ? { ...defaultState, ...saved } : { ...defaultState };
  } catch (_error) {
    return { ...defaultState };
  }
}

let state = loadState();

const accountForm = document.querySelector("#accountForm");
const accountSummary = document.querySelector("#accountSummary");
const preferencesContainer = document.querySelector("#preferences");
const locationSelect = document.querySelector("#locationSelect");
const locationSummary = document.querySelector("#locationSummary");
const recipeGrid = document.querySelector("#recipeGrid");
const weeklyMeals = document.querySelector("#weeklyMeals");
const shoppingList = document.querySelector("#shoppingList");
const favoriteMeals = document.querySelector("#favoriteMeals");
const recipeTemplate = document.querySelector("#recipeCardTemplate");
const refreshRecipesButton = document.querySelector("#refreshRecipes");
const clearWeekButton = document.querySelector("#clearWeek");
const manualShoppingForm = document.querySelector("#manualShoppingForm");
const manualItemName = document.querySelector("#manualItemName");
const manualItemQuantity = document.querySelector("#manualItemQuantity");
const manualItemUnit = document.querySelector("#manualItemUnit");

const dailyCount = document.querySelector("#dailyCount");
const favoriteCount = document.querySelector("#favoriteCount");
const shoppingCount = document.querySelector("#shoppingCount");
const storeName = document.querySelector("#storeName");

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

const unitAliases = {
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  cup: "cup",
  cups: "cup",
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  pound: "lb",
  pounds: "lb",
  lb: "lb",
  lbs: "lb",
  can: "can",
  cans: "can",
  block: "block",
  blocks: "block",
  clove: "clove",
  cloves: "clove",
  head: "head",
  heads: "head",
  slice: "slice",
  slices: "slice",
  leaf: "leaf",
  leaves: "leaf",
  jar: "jar",
  jars: "jar"
};

function parseQuantity(value) {
  if (!value) {
    return null;
  }

  if (value.includes("/")) {
    const [numerator, denominator] = value.split("/");
    const parsedNumerator = Number(numerator);
    const parsedDenominator = Number(denominator);
    if (parsedNumerator && parsedDenominator) {
      return parsedNumerator / parsedDenominator;
    }
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function singularizeWord(word) {
  if (word.length <= 3) {
    return word;
  }
  if (word.endsWith("ies")) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.endsWith("oes")) {
    return word.slice(0, -2);
  }
  if (word.endsWith("ves")) {
    return `${word.slice(0, -3)}f`;
  }
  if (word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

function createItemId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeItemName(value) {
  let tokens = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9/.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (tokens.length && parseQuantity(tokens[0]) !== null) {
    tokens = tokens.slice(1);
  }

  if (tokens.length && unitAliases[tokens[0]]) {
    tokens = tokens.slice(1);
  }

  return tokens.map(singularizeWord).join(" ");
}

function parseIngredient(ingredient) {
  let tokens = String(ingredient).trim().split(/\s+/).filter(Boolean);
  let quantity = 1;
  let unit = "";

  if (tokens.length) {
    const parsedQuantity = parseQuantity(tokens[0]);
    if (parsedQuantity !== null) {
      quantity = parsedQuantity;
      tokens = tokens.slice(1);
    }
  }

  if (tokens.length && unitAliases[tokens[0].toLowerCase()]) {
    unit = unitAliases[tokens[0].toLowerCase()];
    tokens = tokens.slice(1);
  }

  const name = tokens.join(" ") || ingredient;

  return {
    name,
    normalizedName: normalizeItemName(ingredient),
    quantity,
    unit
  };
}

function formatQuantity(quantity) {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatShoppingItem(item) {
  if (item.unit) {
    return `${formatQuantity(item.quantity)} ${item.unit} ${item.name}`;
  }
  if (item.quantity !== 1) {
    return `${formatQuantity(item.quantity)} ${item.name}`;
  }
  return item.name;
}

function addShoppingItemToMap(itemMap, ingredient, source) {
  const item = parseIngredient(ingredient);
  const key = `${item.normalizedName}::${item.unit}`;

  if (!itemMap.has(key)) {
    itemMap.set(key, {
      ...item,
      quantity: 0,
      sources: [],
      manual: false
    });
  }

  const existing = itemMap.get(key);
  existing.quantity += item.quantity;
  existing.sources.push(source);
  existing.manual = existing.manual || source === "manual";
}

function getShoppingItems() {
  const itemMap = new Map();

  state.weeklyPlan.forEach((entry) => {
    const recipe = recipes.find((item) => item.id === entry.recipeId);
    recipe?.ingredients.forEach((ingredient) => addShoppingItemToMap(itemMap, ingredient, "recipe"));
  });

  state.manualShoppingItems.forEach((item) => {
    const manualText = [item.quantity, item.unit, item.name].filter(Boolean).join(" ");
    addShoppingItemToMap(itemMap, manualText, "manual");
  });

  return [...itemMap.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function getLocationData() {
  return locations.find((location) => location.value === state.location) || locations[0];
}

function getFilteredRecipes() {
  return recipes.filter((recipe) => {
    const availableLocally = recipe.locationAvailability.includes(state.location);
    const matchesPreferences =
      state.preferences.length === 0 ||
      state.preferences.every((preference) => recipe.preferences.includes(preference));
    return availableLocally && matchesPreferences;
  });
}

function getDailyRecipes() {
  const filtered = getFilteredRecipes();
  if (filtered.length <= 4) {
    return filtered;
  }

  const offset = (new Date().getDay() + state.recipeRotation) % filtered.length;
  return [...filtered.slice(offset), ...filtered.slice(0, offset)].slice(0, 4);
}

function renderAccount() {
  document.querySelector("#name").value = state.account.name;
  document.querySelector("#email").value = state.account.email;

  if (state.account.name && state.account.email) {
    accountSummary.textContent = `${state.account.name} is ready to plan meals with ${state.account.email}.`;
  } else {
    accountSummary.textContent = "Create an account to persist your planning choices in this browser.";
  }
}

function renderPreferences() {
  preferencesContainer.innerHTML = "";

  preferenceOptions.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${state.preferences.includes(option) ? " active" : ""}`;
    button.textContent = option;
    button.addEventListener("click", () => {
      if (state.preferences.includes(option)) {
        state.preferences = state.preferences.filter((preference) => preference !== option);
      } else {
        state.preferences = [...state.preferences, option];
      }

      saveState();
      render();
    });
    preferencesContainer.appendChild(button);
  });
}

function renderLocations() {
  locationSelect.innerHTML = "";

  locations.forEach((location) => {
    const option = document.createElement("option");
    option.value = location.value;
    option.textContent = `${location.label} • ${location.stores[0]}`;
    locationSelect.appendChild(option);
  });

  locationSelect.value = state.location;

  const currentLocation = getLocationData();
  locationSummary.textContent = `Showing meals stocked by ${currentLocation.stores.join(", ")}.`;
  storeName.textContent = currentLocation.stores[0];
}

function createEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function addRecipeToWeek(recipeId) {
  if (state.weeklyPlan.some((entry) => entry.recipeId === recipeId)) {
    return;
  }

  const nextDay = weekDays[state.weeklyPlan.length % weekDays.length];
  state.weeklyPlan = [...state.weeklyPlan, { day: nextDay, recipeId }];
  saveState();
  render();
}

function addManualShoppingItem() {
  const name = manualItemName.value.trim();
  const quantity = Number(manualItemQuantity.value || 1);
  const unit = manualItemUnit.value.trim();

  if (!name || !Number.isFinite(quantity) || quantity <= 0) {
    return;
  }

  state.manualShoppingItems = [
    ...state.manualShoppingItems,
    {
      id: createItemId(),
      name,
      quantity,
      unit
    }
  ];

  manualShoppingForm.reset();
  manualItemQuantity.value = "1";
  saveState();
  renderWeeklyPlan();
}

function removeManualShoppingItem(itemId) {
  state.manualShoppingItems = state.manualShoppingItems.filter((item) => item.id !== itemId);
  saveState();
  renderWeeklyPlan();
}

function toggleFavorite(recipeId) {
  if (state.favoriteRecipeIds.includes(recipeId)) {
    state.favoriteRecipeIds = state.favoriteRecipeIds.filter((id) => id !== recipeId);
  } else {
    state.favoriteRecipeIds = [...state.favoriteRecipeIds, recipeId];
  }

  saveState();
  render();
}

async function shareRecipe(recipe) {
  const currentLocation = getLocationData();
  const shareText = `Try ${recipe.name} from PantryPilot. It matches ${state.preferences.join(", ") || "any"} preferences and is available near ${currentLocation.label}.`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: recipe.name,
        text: shareText
      });
      return;
    } catch (_error) {
      // Fall back to clipboard when share is cancelled or unavailable.
    }
  }

  await navigator.clipboard.writeText(shareText);
  window.alert("Recipe details copied so you can share them with a friend.");
}

function renderRecipes() {
  recipeGrid.innerHTML = "";

  const dailyRecipes = getDailyRecipes();
  dailyCount.textContent = String(dailyRecipes.length);

  if (dailyRecipes.length === 0) {
    recipeGrid.appendChild(
      createEmptyState("No recipes match the current preference and location filters. Try removing one preference.")
    );
    return;
  }

  dailyRecipes.forEach((recipe) => {
    const fragment = recipeTemplate.content.cloneNode(true);
    const article = fragment.querySelector(".recipe-card");

    fragment.querySelector("h3").textContent = recipe.name;
    fragment.querySelector(".recipe-store").textContent = getLocationData().stores[0];
    fragment.querySelector(".recipe-tags").textContent = recipe.preferences.join(" • ");
    fragment.querySelector(".recipe-description").textContent = recipe.description;
    fragment.querySelector(".recipe-meta").innerHTML = `
      <span class="ingredient-pill">${recipe.time}</span>
      <span class="ingredient-pill">${recipe.calories}</span>
      <span class="ingredient-pill">${recipe.ingredients.slice(0, 3).join(", ")}</span>
    `;

    fragment.querySelector(".plan-button").addEventListener("click", () => addRecipeToWeek(recipe.id));
    fragment.querySelector(".favorite-button").textContent = state.favoriteRecipeIds.includes(recipe.id)
      ? "Favorited"
      : "Favorite";
    fragment.querySelector(".favorite-button").addEventListener("click", () => toggleFavorite(recipe.id));
    fragment.querySelector(".share-button").addEventListener("click", () => {
      shareRecipe(recipe).catch(() => {
        window.alert("Sharing failed on this browser.");
      });
    });

    recipeGrid.appendChild(article);
  });
}

function renderWeeklyPlan() {
  weeklyMeals.innerHTML = "";

  if (state.weeklyPlan.length === 0) {
    weeklyMeals.appendChild(createEmptyState("Add recipes to build a weekly shopping plan."));
  } else {
    state.weeklyPlan.forEach((entry) => {
      const recipe = recipes.find((item) => item.id === entry.recipeId);
      if (!recipe) {
        return;
      }

      const card = document.createElement("article");
      card.className = "weekly-card";
      card.innerHTML = `
        <span class="meal-day">${entry.day}</span>
        <h3>${recipe.name}</h3>
        <div class="recipe-meta">
          ${recipe.ingredients.map((ingredient) => `<span class="ingredient-pill">${ingredient}</span>`).join("")}
        </div>
      `;
      weeklyMeals.appendChild(card);
    });
  }

  shoppingList.innerHTML = "";
  const items = getShoppingItems();
  shoppingCount.textContent = String(items.length);

  if (items.length === 0) {
    shoppingList.appendChild(createEmptyState("Your shopping list will appear here as you add meals to the week."));
    return;
  }

  items.forEach((shoppingItem) => {
    const recipeCount = shoppingItem.sources.filter((source) => source === "recipe").length;
    const labels = [
      recipeCount ? `${recipeCount} recipe${recipeCount > 1 ? "s" : ""}` : "",
      shoppingItem.manual ? "manual" : ""
    ].filter(Boolean);

    const item = document.createElement("li");
    item.innerHTML = `<span>${formatShoppingItem(shoppingItem)}</span><strong>${labels.join(" + ")}</strong>`;

    if (shoppingItem.manual) {
      const matchingManualItem = state.manualShoppingItems.find(
        (manualItem) => normalizeItemName(manualItem.name) === shoppingItem.normalizedName
      );
      if (matchingManualItem) {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove-item-button";
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", () => removeManualShoppingItem(matchingManualItem.id));
        item.appendChild(removeButton);
      }
    }

    shoppingList.appendChild(item);
  });
}

function renderFavorites() {
  favoriteMeals.innerHTML = "";

  const favorites = recipes.filter((recipe) => state.favoriteRecipeIds.includes(recipe.id));
  favoriteCount.textContent = String(favorites.length);

  if (favorites.length === 0) {
    favoriteMeals.appendChild(createEmptyState("Favorite meals appear here so users can bring them back in future weeks."));
    return;
  }

  favorites.forEach((recipe) => {
    const card = document.createElement("article");
    card.className = "favorite-card";
    card.innerHTML = `
      <h3>${recipe.name}</h3>
      <p class="recipe-description">${recipe.description}</p>
      <div class="recipe-meta">
        <span class="ingredient-pill">${recipe.time}</span>
        <span class="ingredient-pill">${recipe.preferences.join(" • ")}</span>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "recipe-actions";

    const reuseButton = document.createElement("button");
    reuseButton.type = "button";
    reuseButton.textContent = "Use next week";
    reuseButton.addEventListener("click", () => addRecipeToWeek(recipe.id));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary-button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => toggleFavorite(recipe.id));

    actions.appendChild(reuseButton);
    actions.appendChild(removeButton);
    card.appendChild(actions);
    favoriteMeals.appendChild(card);
  });
}

function render() {
  renderAccount();
  renderPreferences();
  renderLocations();
  renderRecipes();
  renderWeeklyPlan();
  renderFavorites();
}

accountForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.account = {
    name: document.querySelector("#name").value.trim(),
    email: document.querySelector("#email").value.trim()
  };
  saveState();
  renderAccount();
});

locationSelect.addEventListener("change", (event) => {
  state.location = event.target.value;
  state.weeklyPlan = state.weeklyPlan.filter((entry) => {
    const recipe = recipes.find((item) => item.id === entry.recipeId);
    return recipe?.locationAvailability.includes(state.location);
  });
  saveState();
  render();
});

refreshRecipesButton.addEventListener("click", () => {
  state.recipeRotation += 1;
  saveState();
  renderRecipes();
});

clearWeekButton.addEventListener("click", () => {
  state.weeklyPlan = [];
  saveState();
  renderWeeklyPlan();
});

manualShoppingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addManualShoppingItem();
});

render();
