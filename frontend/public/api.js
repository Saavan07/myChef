const config = window.__APP_CONFIG__ || {};

const API_BASE_URL = (config.backendUrl || "http://127.0.0.1:8000").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    let detail = "Request failed";

    try {
      const data = await response.json();
      detail = data.detail || data.message || detail;
    } catch (_error) {
      detail = response.statusText || detail;
    }

    throw new Error(detail);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function buildQuery(params) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  });

  const query = search.toString();
  return query ? `?${query}` : "";
}

export const api = {
  baseUrl: API_BASE_URL,
  register(payload) {
    return request("/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  login(payload) {
    return request("/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  getPreferences(userId) {
    return request(`/users/${userId}/preferences`);
  },
  updatePreferences(userId, payload) {
    return request(`/users/${userId}/preferences`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  getPantry(userId) {
    return request(`/users/${userId}/pantry`);
  },
  updatePantry(userId, payload) {
    return request(`/users/${userId}/pantry`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  removePantryItem(userId, item) {
    return request(`/users/${userId}/pantry/${encodeURIComponent(item)}`, {
      method: "DELETE"
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
      method: "POST"
    });
  },
  removeFavorite(userId, recipeId) {
    return request(`/users/${userId}/favorites/${recipeId}`, {
      method: "DELETE"
    });
  },
  generateMealPlan(userId) {
    return request(`/users/${userId}/meal-plan/generate`, {
      method: "POST"
    });
  },
  getMealPlans(userId) {
    return request(`/users/${userId}/meal-plans`);
  },
  swapMeal(userId, planId, payload) {
    return request(`/users/${userId}/meal-plans/${planId}/swap`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  getShoppingList(userId, planId) {
    return request(`/users/${userId}/meal-plans/${planId}/shopping-list`);
  }
};
