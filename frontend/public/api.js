const config = window.__APP_CONFIG__ || {};

const API_BASE_URL = (config.backendUrl || window.location.origin).replace(
  /\/$/,
  "",
);

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-MyChef-Request": "1",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let detail = "Request failed";

    try {
      const data = await response.json();
      detail = data.detail || data.message || detail;
    } catch (_error) {
      detail = response.statusText || detail;
    }

    const error = new Error(detail);
    error.status = response.status;
    if (response.status === 401 && path.startsWith("/users/"))
      window.dispatchEvent(new Event("mychef:expired"));
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function buildQuery(params) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

export const api = {
  session() {
    return request("/session");
  },
  logout() {
    return request("/logout", { method: "POST" });
  },
  dietaryOptions() {
    return request("/dietary-options");
  },
  updatePlan(userId, planId, payload) {
    return request(`/users/${userId}/meal-plans/${planId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deletePlan(userId, planId) {
    return request(`/users/${userId}/meal-plans/${planId}`, {
      method: "DELETE",
    });
  },
  candidates(userId, planId) {
    return request(`/users/${userId}/meal-plans/${planId}/candidates`);
  },
  checkShopping(userId, planId, payload) {
    return request(`/users/${userId}/meal-plans/${planId}/shopping-list`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  cooking(userId, planId, entryId) {
    return request(`/users/${userId}/meal-plans/${planId}/cooking/${entryId}`);
  },
  saveCooking(userId, planId, entryId, payload) {
    return request(`/users/${userId}/meal-plans/${planId}/cooking/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  setPantryAmount(userId, itemId, payload) {
    return request(`/users/${userId}/pantry/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  recordPurchases(userId, planId, payload) {
    return request(`/users/${userId}/meal-plans/${planId}/purchases`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  finishDinner(userId, planId, entryId, payload) {
    return request(
      `/users/${userId}/meal-plans/${planId}/cooking/${entryId}/finish`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  },
  undoDinner(userId, planId, entryId, payload) {
    return request(
      `/users/${userId}/meal-plans/${planId}/cooking/${entryId}/finish`,
      { method: "DELETE", body: JSON.stringify(payload) },
    );
  },
  saveFeedback(userId, planId, entryId, payload) {
    return request(
      `/users/${userId}/meal-plans/${planId}/cooking/${entryId}/feedback`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
  },
  register(payload) {
    return request("/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  login(payload) {
    return request("/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getPreferences(userId) {
    return request(`/users/${userId}/preferences`);
  },
  updatePreferences(userId, payload) {
    return request(`/users/${userId}/preferences`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getPantry(userId) {
    return request(`/users/${userId}/pantry`);
  },
  updatePantry(userId, payload) {
    return request(`/users/${userId}/pantry`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  removePantryItem(userId, item) {
    return request(`/users/${userId}/pantry/${encodeURIComponent(item)}`, {
      method: "DELETE",
    });
  },
  getRecipes(tag) {
    return request(`/recipes${buildQuery({ tag })}`);
  },
  getRecipe(recipeId) {
    return request(`/recipes/${recipeId}`);
  },
  getFavorites(userId) {
    return request(`/users/${userId}/favorites`);
  },
  addFavorite(userId, recipeId) {
    return request(`/users/${userId}/favorites/${recipeId}`, {
      method: "POST",
    });
  },
  removeFavorite(userId, recipeId) {
    return request(`/users/${userId}/favorites/${recipeId}`, {
      method: "DELETE",
    });
  },
  getManualShoppingItems(userId) {
    return request(`/users/${userId}/shopping-list/manual`);
  },
  addManualShoppingItem(userId, payload) {
    return request(`/users/${userId}/shopping-list/manual`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  removeManualShoppingItem(userId, itemId) {
    return request(`/users/${userId}/shopping-list/manual/${itemId}`, {
      method: "DELETE",
    });
  },
  generateMealPlan(userId, payload) {
    return request(`/users/${userId}/meal-plan/generate`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getMealPlans(userId) {
    return request(`/users/${userId}/meal-plans`);
  },
  swapMeal(userId, planId, payload) {
    return request(`/users/${userId}/meal-plans/${planId}/swap`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  swapMealAuto(userId, planId, payload) {
    return request(`/users/${userId}/meal-plans/${planId}/swap-auto`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getShoppingList(userId, planId) {
    return request(`/users/${userId}/meal-plans/${planId}/shopping-list`);
  },
  findNearbyStores(payload) {
    return request("/stores/nearby", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getStoreReviews(storeId) {
    return request(`/stores/${storeId}/reviews`);
  },
  addStoreReview(storeId, payload) {
    return request(`/stores/${storeId}/reviews`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteStoreReview(storeId, userId) {
    return request(`/stores/${storeId}/reviews/${userId}`, {
      method: "DELETE",
    });
  },
};
