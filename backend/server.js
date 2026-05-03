const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
require("./env");
const { getPool, testConnection } = require("./db");
const { seedRecipes } = require("./seedRecipes");

const app = express();
const port = Number(process.env.API_PORT || process.env.PORT || 4000);
const host = process.env.API_HOST || "127.0.0.1";

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000"
    ],
    credentials: true
  })
);
app.use(express.json());

const UNIT_ALIASES = {
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
  slice: "slice",
  slices: "slice",
  clove: "clove",
  cloves: "clove",
  head: "head",
  heads: "head",
  leaf: "leaf",
  leaves: "leaf",
  block: "block",
  blocks: "block",
  jar: "jar",
  jars: "jar",
  can: "can",
  cans: "can"
};

function createId() {
  return crypto.randomUUID();
}

function parseJsonField(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function serializeJson(value) {
  return JSON.stringify(value ?? []);
}

function mapUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    password: row.password,
    dietary_preferences: parseJsonField(row.dietary_preferences, []),
    dietary_restrictions: parseJsonField(row.dietary_restrictions, []),
    pantry: parseJsonField(row.pantry, []),
    favorites: parseJsonField(row.favorites, []),
    shopping_list_items: parseJsonField(row.shopping_list_items, []),
    meal_plans: parseJsonField(row.meal_plans, []),
    meal_history: parseJsonField(row.meal_history, [])
  };
}

function mapRecipeRow(row) {
  return {
    id: row.id,
    name: row.name,
    ingredients: parseJsonField(row.ingredients, []),
    steps: parseJsonField(row.steps, []),
    dietary_tags: parseJsonField(row.dietary_tags, []),
    meal_type: row.meal_type,
    prep_time_minutes: row.prep_time_minutes
  };
}

function mapStoreRow(row) {
  return {
    store_id: row.store_id,
    name: row.name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    average_rating: row.average_rating === null || row.average_rating === undefined ? null : Number(row.average_rating),
    review_count: row.review_count === null || row.review_count === undefined ? 0 : Number(row.review_count)
  };
}

function mapReviewRow(row) {
  return {
    review_id: row.review_id,
    user_id: row.user_id,
    facility_id: row.facility_id,
    username: row.username,
    rating: Number(row.rating),
    comment: row.comment,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
  };
}

function parseQuantity(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  if (text.includes("/")) {
    const [numerator, denominator] = text.split("/", 2);
    const left = Number(numerator);
    const right = Number(denominator);
    if (Number.isFinite(left) && Number.isFinite(right) && right !== 0) {
      return left / right;
    }
    return null;
  }

  const parsed = Number(text);
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

  if (tokens.length && UNIT_ALIASES[tokens[0]]) {
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

  if (tokens.length && UNIT_ALIASES[tokens[0].toLowerCase()]) {
    unit = UNIT_ALIASES[tokens[0].toLowerCase()];
    tokens = tokens.slice(1);
  }

  return {
    name: tokens.join(" ") || ingredient,
    normalized_name: normalizeItemName(ingredient),
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

function pantryContainsItem(pantryItems, item) {
  const pantryNames = new Set((pantryItems || []).map((pantryItem) => normalizeItemName(pantryItem)));
  return pantryNames.has(item.normalized_name);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function getDistanceMiles(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  if (![fromLatitude, fromLongitude, toLatitude, toLongitude].every(Number.isFinite)) {
    return null;
  }

  const earthRadiusMiles = 3958.8;
  const dLatitude = toRadians(toLatitude - fromLatitude);
  const dLongitude = toRadians(toLongitude - fromLongitude);
  const a = Math.sin(dLatitude / 2) ** 2
    + Math.cos(toRadians(fromLatitude)) * Math.cos(toRadians(toLatitude)) * Math.sin(dLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusMiles * c).toFixed(1));
}

function buildStoreResponse(store, userLocation) {
  return {
    ...store,
    distance_miles: userLocation
      ? getDistanceMiles(userLocation.latitude, userLocation.longitude, store.latitude, store.longitude)
      : null
  };
}

function sanitizeStoreName(rawName) {
  const name = String(rawName || "").trim();
  const normalized = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const genericNames = new Set([
    "grocery",
    "grocery store",
    "store",
    "supermarket",
    "market"
  ]);

  if (!name || genericNames.has(normalized)) {
    return "Local grocery store";
  }

  return name;
}

function aggregateIngredients(ingredients, source) {
  const aggregated = new Map();

  for (const ingredient of ingredients) {
    const item = parseIngredient(ingredient);
    const key = `${item.normalized_name}::${item.unit}`;

    if (!aggregated.has(key)) {
      aggregated.set(key, {
        name: item.name,
        normalized_name: item.normalized_name,
        quantity: 0,
        unit: item.unit,
        sources: [],
        manual: source === "manual"
      });
    }

    const existing = aggregated.get(key);
    existing.quantity += item.quantity;
    existing.sources.push(source);
    existing.manual = existing.manual || source === "manual";
  }

  return aggregated;
}

function passesRestrictions(recipe, restrictions) {
  const normalizedRestrictions = (restrictions || [])
    .map((restriction) => normalizeItemName(String(restriction).replace(/^no\s+/i, "").replace(/^without\s+/i, "")))
    .filter(Boolean);

  for (const ingredient of recipe.ingredients) {
    const normalizedIngredient = normalizeItemName(ingredient);
    if (normalizedRestrictions.some((restriction) => normalizedIngredient.includes(restriction))) {
      return false;
    }
  }

  return true;
}

function scoreRecipe(recipe, user, recentlyUsedIds, allPlanIds) {
  let score = 0;

  if ((user.favorites || []).includes(recipe.id)) {
    score += 30;
  }

  const pantryHits = recipe.ingredients.filter((ingredient) =>
    pantryContainsItem(user.pantry || [], parseIngredient(ingredient))
  ).length;
  score += pantryHits * 10;

  const history = user.meal_history || [];
  if (history.includes(recipe.id)) {
    const lastSeen = history.length - 1 - [...history].reverse().indexOf(recipe.id);
    const weeksAgo = Math.floor((history.length - lastSeen) / 7);
    if (weeksAgo === 0) {
      score -= 50;
    } else if (weeksAgo === 1) {
      score -= 20;
    } else if (weeksAgo === 2) {
      score -= 5;
    }
  }

  const timesInCurrentPlan = allPlanIds.filter((id) => id === recipe.id).length;
  score -= timesInCurrentPlan * 40;

  if (recentlyUsedIds.includes(recipe.id)) {
    score -= 25;
  }

  score += Math.floor(Math.random() * 6);
  return score;
}

function pickRecipeForSlot(candidates, mealType, user, recentlyUsedIds, currentPlanIds) {
  const typed = candidates.filter((recipe) => recipe.meal_type === mealType);
  const pool = typed.length ? typed : candidates;
  const scored = pool
    .map((recipe) => [recipe, scoreRecipe(recipe, user, recentlyUsedIds, currentPlanIds)])
    .sort((left, right) => right[1] - left[1]);

  const topCount = Math.max(1, Math.floor(scored.length / 3));
  const topCandidates = scored.slice(0, topCount);
  const weights = topCandidates.map(([, score]) => Math.max(1, score + 100));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  let cursor = Math.random() * totalWeight;
  for (let index = 0; index < topCandidates.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) {
      return topCandidates[index][0];
    }
  }

  return topCandidates[0][0];
}

async function getUserById(userId) {
  const [rows] = await getPool().execute("SELECT * FROM users WHERE id = ?", [userId]);
  return rows[0] ? mapUserRow(rows[0]) : null;
}

async function getUserByUsername(username) {
  const [rows] = await getPool().execute("SELECT * FROM users WHERE username = ?", [username]);
  return rows[0] ? mapUserRow(rows[0]) : null;
}

async function saveUser(user) {
  await getPool().execute(
    `UPDATE users
     SET username = ?, password = ?, dietary_preferences = ?, dietary_restrictions = ?,
         pantry = ?, favorites = ?, shopping_list_items = ?, meal_plans = ?, meal_history = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      user.username,
      user.password,
      serializeJson(user.dietary_preferences),
      serializeJson(user.dietary_restrictions),
      serializeJson(user.pantry),
      serializeJson(user.favorites),
      serializeJson(user.shopping_list_items),
      serializeJson(user.meal_plans),
      serializeJson(user.meal_history),
      user.id
    ]
  );
}

async function getRecipeById(recipeId) {
  const [rows] = await getPool().execute("SELECT * FROM recipes WHERE id = ?", [recipeId]);
  return rows[0] ? mapRecipeRow(rows[0]) : null;
}

async function getAllRecipes(tag) {
  let query = "SELECT * FROM recipes";
  const params = [];

  if (tag) {
    query += " WHERE JSON_CONTAINS(dietary_tags, JSON_ARRAY(?))";
    params.push(tag);
  }

  query += " ORDER BY name ASC";
  const [rows] = await getPool().execute(query, params);
  return rows.map(mapRecipeRow);
}

async function ensureStoresTable() {
  await getPool().execute(
    `CREATE TABLE IF NOT EXISTS grocery_stores (
      store_id VARCHAR(32) NOT NULL,
      name VARCHAR(255) NOT NULL,
      latitude DECIMAL(10,7) NOT NULL,
      longitude DECIMAL(10,7) NOT NULL,
      PRIMARY KEY (store_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

async function ensureReviewsTable() {
  await getPool().execute(
    `CREATE TABLE IF NOT EXISTS reviews (
      review_id CHAR(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      user_id CHAR(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      facility_id VARCHAR(32) COLLATE utf8mb4_0900_ai_ci NOT NULL,
      rating INT NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (review_id),
      KEY idx_reviews_user_id (user_id),
      KEY idx_reviews_facility_id (facility_id),
      UNIQUE KEY uq_reviews_user_facility (user_id, facility_id),
      CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_reviews_store FOREIGN KEY (facility_id) REFERENCES grocery_stores(store_id) ON DELETE CASCADE,
      CONSTRAINT chk_reviews_rating CHECK (rating >= 1 AND rating <= 5)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

async function getStoreById(storeId) {
  const [rows] = await getPool().execute(
    `SELECT grocery_stores.*,
            AVG(reviews.rating) AS average_rating,
            COUNT(reviews.review_id) AS review_count
     FROM grocery_stores
     LEFT JOIN reviews ON reviews.facility_id = grocery_stores.store_id
     WHERE grocery_stores.store_id = ?
     GROUP BY grocery_stores.store_id, grocery_stores.name, grocery_stores.latitude, grocery_stores.longitude`,
    [storeId]
  );
  return rows[0] ? mapStoreRow(rows[0]) : null;
}

async function upsertStore(store) {
  await getPool().execute(
    `INSERT INTO grocery_stores
     (store_id, name, latitude, longitude)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       latitude = VALUES(latitude),
       longitude = VALUES(longitude)`,
    [
      store.store_id,
      store.name,
      store.latitude,
      store.longitude
    ]
  );

  return getStoreById(store.store_id);
}

async function getReviewsByStoreId(storeId) {
  const [rows] = await getPool().execute(
    `SELECT reviews.*, users.username
     FROM reviews
     INNER JOIN users ON users.id = reviews.user_id
     WHERE reviews.facility_id = ?
     ORDER BY reviews.created_at DESC`,
    [storeId]
  );
  return rows.map(mapReviewRow);
}

async function getReviewByUserAndStore(userId, storeId) {
  const [rows] = await getPool().execute(
    `SELECT reviews.*, users.username
     FROM reviews
     INNER JOIN users ON users.id = reviews.user_id
     WHERE reviews.user_id = ? AND reviews.facility_id = ?
     LIMIT 1`,
    [userId, storeId]
  );
  return rows[0] ? mapReviewRow(rows[0]) : null;
}

async function addReview(review) {
  await getPool().execute(
    `INSERT INTO reviews
     (review_id, user_id, facility_id, rating, comment)
     VALUES (?, ?, ?, ?, ?)`,
    [review.review_id, review.user_id, review.facility_id, review.rating, review.comment]
  );
}

async function updateReview(review) {
  await getPool().execute(
    `UPDATE reviews
     SET rating = ?, comment = ?, updated_at = CURRENT_TIMESTAMP
     WHERE review_id = ?`,
    [review.rating, review.comment, review.review_id]
  );
}

async function deleteReview(reviewId) {
  await getPool().execute("DELETE FROM reviews WHERE review_id = ?", [reviewId]);
}

async function findNearbyStores(latitude, longitude) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    const error = new Error("Google Maps API key is not configured");
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location"
    },
    body: JSON.stringify({
      includedTypes: ["grocery_store"],
      maxResultCount: 10,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: {
            latitude,
            longitude
          },
          radius: 5000
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Places lookup failed with status ${response.status}`);
    error.statusCode = 502;
    error.externalDetail = detail;
    throw error;
  }

  const data = await response.json();
  return Array.isArray(data.places) ? data.places : [];
}

async function resolveLocationQuery(locationQuery) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    const error = new Error("Google Maps API key is not configured");
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location"
    },
    body: JSON.stringify({
      textQuery: locationQuery,
      maxResultCount: 1
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Location lookup failed with status ${response.status}`);
    error.statusCode = 502;
    error.externalDetail = detail;
    throw error;
  }

  const data = await response.json();
  const place = Array.isArray(data.places) ? data.places[0] : null;
  if (!place?.location) {
    const error = new Error("Location not found");
    error.statusCode = 404;
    throw error;
  }

  return {
    latitude: place.location.latitude,
    longitude: place.location.longitude,
    resolved_location: place.formattedAddress || place.displayName?.text || locationQuery
  };
}

async function ensureRecipesSeeded() {
  const [rows] = await getPool().execute("SELECT COUNT(*) AS count FROM recipes");
  if (rows[0].count > 0) {
    return;
  }

  for (const recipe of seedRecipes) {
    await getPool().execute(
      `INSERT INTO recipes
       (id, name, ingredients, steps, dietary_tags, meal_type, prep_time_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        recipe.id,
        recipe.name,
        serializeJson(recipe.ingredients),
        serializeJson(recipe.steps),
        serializeJson(recipe.dietary_tags),
        recipe.meal_type,
        recipe.prep_time_minutes
      ]
    );
  }
}

function requireFields(res, fields) {
  const missing = fields.filter((field) => {
    const value = field.value;
    return value === undefined || value === null || value === "";
  });

  if (missing.length > 0) {
    res.status(400).json({ detail: `${missing[0].name} is required` });
    return false;
  }

  return true;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/stores/nearby", async (req, res) => {
  try {
    let latitude = Number(req.body?.latitude);
    let longitude = Number(req.body?.longitude);
    let resolvedLocation = "";

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      const locationQuery = String(req.body?.location_query || "").trim();
      if (!locationQuery) {
        res.status(400).json({ detail: "latitude and longitude or location_query is required" });
        return;
      }

      const resolved = await resolveLocationQuery(locationQuery);
      latitude = resolved.latitude;
      longitude = resolved.longitude;
      resolvedLocation = resolved.resolved_location;
    }

    const places = await findNearbyStores(latitude, longitude);
    const stores = [];

    for (const place of places) {
      const store = await upsertStore({
        store_id: place.id,
        name: sanitizeStoreName(place.displayName?.text),
        latitude: place.location?.latitude ?? latitude,
        longitude: place.location?.longitude ?? longitude
      });

      stores.push(buildStoreResponse(store, { latitude, longitude }));
    }

    stores.sort((left, right) => (left.distance_miles ?? Number.POSITIVE_INFINITY) - (right.distance_miles ?? Number.POSITIVE_INFINITY));
    res.json({
      stores,
      resolved_location: resolvedLocation || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
    });
  } catch (error) {
    console.error("[nearby stores]", error.externalDetail || error.message);
    res.status(error.statusCode || 500).json({
      detail: error.statusCode === 500 && /Google Maps API key/i.test(error.message)
        ? "Google Maps API key is missing in backend/.env"
        : "Unable to find nearby stores"
    });
  }
});

app.get("/stores/:storeId/reviews", async (req, res) => {
  try {
    const store = await getStoreById(req.params.storeId);
    if (!store) {
      res.status(404).json({ detail: "store not found" });
      return;
    }

    const reviews = await getReviewsByStoreId(req.params.storeId);
    res.json({
      store: buildStoreResponse(store),
      reviews
    });
  } catch (error) {
    console.error("[get store reviews]", error.message);
    res.status(500).json({ detail: "Unable to load store reviews" });
  }
});

app.post("/stores/:storeId/reviews", async (req, res) => {
  try {
    const userId = String(req.body?.user_id || "").trim();
    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || "").trim();
    const fallbackName = String(req.body?.store_name || "").trim();
    const fallbackLatitude = Number(req.body?.latitude);
    const fallbackLongitude = Number(req.body?.longitude);

    if (!requireFields(res, [
      { name: "user_id", value: userId },
      { name: "comment", value: comment }
    ])) {
      return;
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ detail: "rating must be an integer between 1 and 5" });
      return;
    }

    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    let store = await getStoreById(req.params.storeId);
    if (!store) {
      if (!fallbackName || !Number.isFinite(fallbackLatitude) || !Number.isFinite(fallbackLongitude)) {
        res.status(400).json({ detail: "store metadata is required before adding the first review" });
        return;
      }

      store = await upsertStore({
        store_id: req.params.storeId,
        name: fallbackName,
        latitude: fallbackLatitude,
        longitude: fallbackLongitude
      });
    }

    const existingReview = await getReviewByUserAndStore(user.id, store.store_id);
    if (existingReview) {
      await updateReview({
        review_id: existingReview.review_id,
        rating,
        comment
      });
    } else {
      await addReview({
        review_id: createId(),
        user_id: user.id,
        facility_id: store.store_id,
        rating,
        comment
      });
    }

    const updatedStore = await getStoreById(store.store_id);
    const reviews = await getReviewsByStoreId(store.store_id);
    res.status(existingReview ? 200 : 201).json({
      message: existingReview ? "review updated" : "review added",
      store: buildStoreResponse(updatedStore),
      reviews
    });
  } catch (error) {
    console.error("[add store review]", error.message);
    res.status(500).json({ detail: "Unable to save store review" });
  }
});

app.delete("/stores/:storeId/reviews/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    const storeId = String(req.params.storeId || "").trim();

    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    const store = await getStoreById(storeId);
    if (!store) {
      res.status(404).json({ detail: "store not found" });
      return;
    }

    const existingReview = await getReviewByUserAndStore(userId, storeId);
    if (!existingReview) {
      res.status(404).json({ detail: "review not found" });
      return;
    }

    await deleteReview(existingReview.review_id);

    const updatedStore = await getStoreById(storeId);
    const reviews = await getReviewsByStoreId(storeId);
    res.json({
      message: "review deleted",
      store: buildStoreResponse(updatedStore),
      reviews
    });
  } catch (error) {
    console.error("[delete store review]", error.message);
    res.status(500).json({ detail: "Unable to delete review" });
  }
});

app.post("/register", async (req, res) => {
  try {
    const rawUsername = String(req.body?.username || "");
    const username = rawUsername.trim();
    const password = String(req.body?.password || "");
    const dietary_preferences = req.body?.dietary_preferences ?? [];
    const dietary_restrictions = req.body?.dietary_restrictions ?? [];
    if (!requireFields(res, [{ name: "username", value: username }, { name: "password", value: password }])) {
      return;
    }

    const existing = await getUserByUsername(username);
    if (existing) {
      res.status(400).json({ detail: "username already taken" });
      return;
    }

    const userId = createId();
    await getPool().execute(
      `INSERT INTO users
       (id, username, password, dietary_preferences, dietary_restrictions, pantry, favorites, shopping_list_items, meal_plans, meal_history)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        username,
        password,
        serializeJson(dietary_preferences),
        serializeJson(dietary_restrictions),
        serializeJson([]),
        serializeJson([]),
        serializeJson([]),
        serializeJson([]),
        serializeJson([])
      ]
    );

    res.json({ message: "user created", user_id: userId });
  } catch (error) {
    console.error("[register]", error.message);
    res.status(500).json({ detail: "Unable to create user" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    if (!requireFields(res, [{ name: "username", value: username }, { name: "password", value: password }])) {
      return;
    }

    const user = await getUserByUsername(username);
    if (!user || user.password !== password) {
      res.status(401).json({ detail: "invalid credentials" });
      return;
    }

    res.json({ message: "login successful", user_id: user.id });
  } catch (error) {
    console.error("[login]", error.message);
    res.status(500).json({ detail: "Unable to login" });
  }
});

app.get("/users/:userId/preferences", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    res.json({
      dietary_preferences: user.dietary_preferences,
      dietary_restrictions: user.dietary_restrictions
    });
  } catch (error) {
    console.error("[get preferences]", error.message);
    res.status(500).json({ detail: "Unable to load preferences" });
  }
});

app.post("/users/:userId/preferences", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    const dietaryPreferences = Array.isArray(req.body?.dietary_preferences) ? req.body.dietary_preferences : null;
    const dietaryRestrictions = Array.isArray(req.body?.dietary_restrictions) ? req.body.dietary_restrictions : [];

    if (!dietaryPreferences) {
      res.status(400).json({ detail: "dietary_preferences must be an array" });
      return;
    }

    user.dietary_preferences = dietaryPreferences;
    user.dietary_restrictions = dietaryRestrictions;
    await saveUser(user);
    res.json({ message: "preferences updated" });
  } catch (error) {
    console.error("[update preferences]", error.message);
    res.status(500).json({ detail: "Unable to update preferences" });
  }
});

app.get("/users/:userId/pantry", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    res.json({ pantry: user.pantry });
  } catch (error) {
    console.error("[get pantry]", error.message);
    res.status(500).json({ detail: "Unable to load pantry" });
  }
});

app.post("/users/:userId/pantry", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    if (!Array.isArray(req.body?.items)) {
      res.status(400).json({ detail: "items must be an array" });
      return;
    }

    user.pantry = req.body.items.map((item) => String(item).trim()).filter(Boolean);
    await saveUser(user);
    res.json({ message: "pantry updated", pantry: user.pantry });
  } catch (error) {
    console.error("[update pantry]", error.message);
    res.status(500).json({ detail: "Unable to update pantry" });
  }
});

app.delete("/users/:userId/pantry/:item", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    const match = user.pantry.find((item) => normalizeItemName(item) === normalizeItemName(req.params.item));
    if (!match) {
      res.status(404).json({ detail: "item not in pantry" });
      return;
    }

    user.pantry = user.pantry.filter((item) => item !== match);
    await saveUser(user);
    res.json({ message: `removed ${match} from pantry` });
  } catch (error) {
    console.error("[remove pantry]", error.message);
    res.status(500).json({ detail: "Unable to remove pantry item" });
  }
});

app.get("/recipes", async (req, res) => {
  try {
    const tag = req.query.tag ? String(req.query.tag) : undefined;
    res.json(await getAllRecipes(tag));
  } catch (error) {
    console.error("[get recipes]", error.message);
    res.status(500).json({ detail: "Unable to load recipes" });
  }
});

app.get("/recipes/:recipeId", async (req, res) => {
  try {
    const recipe = await getRecipeById(req.params.recipeId);
    if (!recipe) {
      res.status(404).json({ detail: "recipe not found" });
      return;
    }

    res.json(recipe);
  } catch (error) {
    console.error("[get recipe]", error.message);
    res.status(500).json({ detail: "Unable to load recipe" });
  }
});

app.get("/users/:userId/favorites", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    const recipes = await Promise.all(user.favorites.map((recipeId) => getRecipeById(recipeId)));
    res.json(recipes.filter(Boolean));
  } catch (error) {
    console.error("[get favorites]", error.message);
    res.status(500).json({ detail: "Unable to load favorites" });
  }
});

app.post("/users/:userId/favorites/:recipeId", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    const recipe = await getRecipeById(req.params.recipeId);
    if (!recipe) {
      res.status(404).json({ detail: "recipe not found" });
      return;
    }

    if (user.favorites.includes(recipe.id)) {
      res.json({ message: "already in favorites" });
      return;
    }

    user.favorites.push(recipe.id);
    await saveUser(user);
    res.json({ message: "added to favorites" });
  } catch (error) {
    console.error("[add favorite]", error.message);
    res.status(500).json({ detail: "Unable to add favorite" });
  }
});

app.delete("/users/:userId/favorites/:recipeId", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    if (!user.favorites.includes(req.params.recipeId)) {
      res.status(404).json({ detail: "recipe not in favorites" });
      return;
    }

    user.favorites = user.favorites.filter((recipeId) => recipeId !== req.params.recipeId);
    await saveUser(user);
    res.json({ message: "removed from favorites" });
  } catch (error) {
    console.error("[remove favorite]", error.message);
    res.status(500).json({ detail: "Unable to remove favorite" });
  }
});

app.get("/users/:userId/shopping-list/manual", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    res.json({ items: user.shopping_list_items });
  } catch (error) {
    console.error("[get manual shopping]", error.message);
    res.status(500).json({ detail: "Unable to load manual shopping items" });
  }
});

app.post("/users/:userId/shopping-list/manual", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    const name = String(req.body?.name || "").trim();
    const quantity = req.body?.quantity === undefined ? 1 : Number(req.body.quantity);
    const unit = String(req.body?.unit || "").trim();

    if (!name) {
      res.status(400).json({ detail: "item name is required" });
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      res.status(400).json({ detail: "quantity must be greater than 0" });
      return;
    }

    const item = {
      id: createId(),
      name,
      quantity,
      unit
    };

    user.shopping_list_items.push(item);
    await saveUser(user);
    res.json({ message: "item added", item });
  } catch (error) {
    console.error("[add manual shopping]", error.message);
    res.status(500).json({ detail: "Unable to add shopping item" });
  }
});

app.delete("/users/:userId/shopping-list/manual/:itemId", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    const item = user.shopping_list_items.find((shoppingItem) => shoppingItem.id === req.params.itemId);
    if (!item) {
      res.status(404).json({ detail: "shopping list item not found" });
      return;
    }

    user.shopping_list_items = user.shopping_list_items.filter((shoppingItem) => shoppingItem.id !== req.params.itemId);
    await saveUser(user);
    res.json({ message: "item removed" });
  } catch (error) {
    console.error("[remove manual shopping]", error.message);
    res.status(500).json({ detail: "Unable to remove shopping item" });
  }
});

app.post("/users/:userId/meal-plan/generate", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    const preferences = user.dietary_preferences.map((tag) => String(tag).toLowerCase());
    const restrictions = user.dietary_restrictions;
    const allRecipes = await getAllRecipes();

    let filtered = allRecipes.filter((recipe) => {
      if (!passesRestrictions(recipe, restrictions)) {
        return false;
      }
      if (!preferences.length) {
        return true;
      }
      const tags = recipe.dietary_tags.map((tag) => String(tag).toLowerCase());
      return preferences.some((preference) => tags.includes(preference));
    });

    if (!filtered.length) {
      filtered = allRecipes.filter((recipe) => passesRestrictions(recipe, restrictions));
    }
    if (!filtered.length) {
      filtered = allRecipes;
    }

    const mealSlots = ["breakfast", "lunch", "dinner", "breakfast", "lunch", "dinner", "dinner"];
    const planIds = [];
    const recentlyUsedIds = [];

    for (const slot of mealSlots) {
      const chosen = pickRecipeForSlot(filtered, slot, user, recentlyUsedIds, planIds);
      planIds.push(chosen.id);
      recentlyUsedIds.push(chosen.id);
    }

    const mealPlan = { id: createId(), recipe_ids: planIds };
    user.meal_plans = [...user.meal_plans, mealPlan];
    user.meal_history = [...user.meal_history, ...planIds];

    await saveUser(user);
    res.json(mealPlan);
  } catch (error) {
    console.error("[generate meal plan]", error.message);
    res.status(500).json({ detail: "Unable to generate meal plan" });
  }
});

app.get("/users/:userId/meal-plans", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    res.json(user.meal_plans);
  } catch (error) {
    console.error("[get meal plans]", error.message);
    res.status(500).json({ detail: "Unable to load meal plans" });
  }
});

app.post("/users/:userId/meal-plans/:planId/swap", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    const dayIndex = Number(req.body?.day_index);
    const newRecipeId = String(req.body?.new_recipe_id || "");

    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
      res.status(400).json({ detail: "day_index must be 0-6" });
      return;
    }

    const recipe = await getRecipeById(newRecipeId);
    if (!recipe) {
      res.status(404).json({ detail: "recipe not found" });
      return;
    }

    const plan = user.meal_plans.find((entry) => entry.id === req.params.planId);
    if (!plan) {
      res.status(404).json({ detail: "meal plan not found" });
      return;
    }

    const oldRecipe = plan.recipe_ids[dayIndex];
    plan.recipe_ids[dayIndex] = newRecipeId;
    await saveUser(user);

    res.json({
      message: "meal swapped",
      day: dayIndex,
      old_recipe: oldRecipe,
      new_recipe: newRecipeId
    });
  } catch (error) {
    console.error("[swap meal]", error.message);
    res.status(500).json({ detail: "Unable to swap meal" });
  }
});

app.post("/users/:userId/meal-plans/:planId/swap-auto", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    const dayIndex = Number(req.query.day_index);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
      res.status(400).json({ detail: "day_index must be 0-6" });
      return;
    }

    const plan = user.meal_plans.find((entry) => entry.id === req.params.planId);
    if (!plan) {
      res.status(404).json({ detail: "meal plan not found" });
      return;
    }

    const currentRecipeId = plan.recipe_ids[dayIndex];
    const currentRecipe = await getRecipeById(currentRecipeId);
    const allRecipes = await getAllRecipes();
    const preferences = user.dietary_preferences.map((tag) => String(tag).toLowerCase());
    const restrictions = user.dietary_restrictions;

    let filtered = allRecipes.filter((recipe) => {
      if (recipe.id === currentRecipeId) {
        return false;
      }
      if (!passesRestrictions(recipe, restrictions)) {
        return false;
      }
      if (!preferences.length) {
        return true;
      }
      const tags = recipe.dietary_tags.map((tag) => String(tag).toLowerCase());
      return preferences.some((preference) => tags.includes(preference));
    });

    if (!filtered.length) {
      filtered = allRecipes.filter((recipe) => recipe.id !== currentRecipeId && passesRestrictions(recipe, restrictions));
    }

    if (!filtered.length) {
      res.status(400).json({ detail: "no other recipes available to swap in" });
      return;
    }

    const chosen = pickRecipeForSlot(
      filtered,
      currentRecipe?.meal_type || "dinner",
      user,
      plan.recipe_ids,
      plan.recipe_ids
    );

    plan.recipe_ids[dayIndex] = chosen.id;
    await saveUser(user);

    res.json({
      message: "meal swapped",
      day: dayIndex,
      old_recipe: currentRecipeId,
      new_recipe: chosen.id
    });
  } catch (error) {
    console.error("[swap meal auto]", error.message);
    res.status(500).json({ detail: "Unable to auto-swap meal" });
  }
});

app.get("/users/:userId/meal-plans/:planId/shopping-list", async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    const plan = user.meal_plans.find((entry) => entry.id === req.params.planId);
    if (!plan) {
      res.status(404).json({ detail: "meal plan not found" });
      return;
    }

    const aggregated = new Map();
    for (const recipeId of plan.recipe_ids) {
      const recipe = await getRecipeById(recipeId);
      if (!recipe) {
        continue;
      }
      const items = aggregateIngredients(recipe.ingredients, "meal_plan");
      for (const [key, item] of items.entries()) {
        if (!aggregated.has(key)) {
          aggregated.set(key, item);
        } else {
          const existing = aggregated.get(key);
          existing.quantity += item.quantity;
          existing.sources.push(...item.sources);
          existing.manual = existing.manual || item.manual;
        }
      }
    }

    for (const manualItem of user.shopping_list_items) {
      const text = [manualItem.quantity || 1, manualItem.unit || "", manualItem.name || ""].filter(Boolean).join(" ");
      const items = aggregateIngredients([text], "manual");
      for (const [key, item] of items.entries()) {
        if (!aggregated.has(key)) {
          aggregated.set(key, item);
        } else {
          const existing = aggregated.get(key);
          existing.quantity += item.quantity;
          existing.sources.push(...item.sources);
          existing.manual = existing.manual || item.manual;
        }
      }
    }

    const shoppingListItems = [];
    const alreadyHaveItems = [];

    for (const item of aggregated.values()) {
      const responseItem = {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        display: formatShoppingItem(item),
        sources: [...new Set(item.sources)].sort(),
        manual: item.manual
      };

      if (pantryContainsItem(user.pantry, item)) {
        alreadyHaveItems.push(responseItem);
      } else {
        shoppingListItems.push(responseItem);
      }
    }

    res.json({
      shopping_list: shoppingListItems.map((item) => item.display),
      already_have: alreadyHaveItems.map((item) => item.display),
      shopping_list_items: shoppingListItems,
      already_have_items: alreadyHaveItems
    });
  } catch (error) {
    console.error("[get shopping list]", error.message);
    res.status(500).json({ detail: "Unable to build shopping list" });
  }
});

async function start() {
  await testConnection();
  await ensureStoresTable();
  await ensureReviewsTable();
  await ensureRecipesSeeded();
  app.listen(port, host, () => {
    console.log(`MyChef API available at http://${host}:${port}`);
  });
}

start().catch((error) => {
  console.error("[startup]", error.message);
  process.exit(1);
});
