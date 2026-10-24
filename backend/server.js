const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
require("./env");
const { getPool, testConnection } = require("./db");
const { migrate } = require("./migrate");
const { installUserRoutes } = require("./user-routes");
const { authenticate, owner } = require("./auth");
const path = require("node:path");

const app = express();
const port = Number(process.env.API_PORT || process.env.PORT || 4000);
const host = process.env.API_HOST || "127.0.0.1";

const origins = (
  process.env.WEB_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000"
)
  .split(",")
  .map((s) => s.trim());
app.disable("x-powered-by");
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "same-origin");
  res.set("X-Frame-Options", "DENY");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const sameOrigin = `${req.protocol}://${req.get("host")}`;
    if (
      req.get("X-MyChef-Request") !== "1" ||
      (origin && origin !== sameOrigin && !origins.includes(origin))
    )
      return res
        .status(403)
        .json({
          detail:
            "Request origin could not be verified. Reload myChef and try again.",
        });
  }
  next();
});

function createId() {
  return crypto.randomUUID();
}

function mapStoreRow(row) {
  return {
    store_id: row.store_id,
    name: row.name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    average_rating:
      row.average_rating === null || row.average_rating === undefined
        ? null
        : Number(row.average_rating),
    review_count:
      row.review_count === null || row.review_count === undefined
        ? 0
        : Number(row.review_count),
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
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function getDistanceMiles(
  fromLatitude,
  fromLongitude,
  toLatitude,
  toLongitude,
) {
  if (
    ![fromLatitude, fromLongitude, toLatitude, toLongitude].every(
      Number.isFinite,
    )
  ) {
    return null;
  }

  const earthRadiusMiles = 3958.8;
  const dLatitude = toRadians(toLatitude - fromLatitude);
  const dLongitude = toRadians(toLongitude - fromLongitude);
  const a =
    Math.sin(dLatitude / 2) ** 2 +
    Math.cos(toRadians(fromLatitude)) *
      Math.cos(toRadians(toLatitude)) *
      Math.sin(dLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusMiles * c).toFixed(1));
}

function buildStoreResponse(store, userLocation) {
  return {
    ...store,
    distance_miles: userLocation
      ? getDistanceMiles(
          userLocation.latitude,
          userLocation.longitude,
          store.latitude,
          store.longitude,
        )
      : null,
  };
}

function sanitizeStoreName(rawName) {
  const name = String(rawName || "").trim();
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const genericNames = new Set([
    "grocery",
    "grocery store",
    "store",
    "supermarket",
    "market",
  ]);

  if (!name || genericNames.has(normalized)) {
    return "Local grocery store";
  }

  return name;
}

async function ensureStoresTable() {
  await getPool().execute(
    `CREATE TABLE IF NOT EXISTS grocery_stores (
      store_id VARCHAR(32) NOT NULL,
      name VARCHAR(255) NOT NULL,
      latitude DECIMAL(10,7) NOT NULL,
      longitude DECIMAL(10,7) NOT NULL,
      PRIMARY KEY (store_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
}

async function ensureReviewsTable() {
  await getPool().execute(
    `CREATE TABLE IF NOT EXISTS reviews (
      review_id CHAR(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      user_id CHAR(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      facility_id VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL,
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
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
    [storeId],
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
    [store.store_id, store.name, store.latitude, store.longitude],
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
    [storeId],
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
    [userId, storeId],
  );
  return rows[0] ? mapReviewRow(rows[0]) : null;
}

async function addReview(review) {
  await getPool().execute(
    `INSERT INTO reviews
     (review_id, user_id, facility_id, rating, comment)
     VALUES (?, ?, ?, ?, ?)`,
    [
      review.review_id,
      review.user_id,
      review.facility_id,
      review.rating,
      review.comment,
    ],
  );
}

async function updateReview(review) {
  await getPool().execute(
    `UPDATE reviews
     SET rating = ?, comment = ?, updated_at = CURRENT_TIMESTAMP
     WHERE review_id = ?`,
    [review.rating, review.comment, review.review_id],
  );
}

async function deleteReview(reviewId) {
  await getPool().execute("DELETE FROM reviews WHERE review_id = ?", [
    reviewId,
  ]);
}

async function findNearbyStores(latitude, longitude) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    const error = new Error("Google Maps API key is not configured");
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.location",
      },
      body: JSON.stringify({
        includedTypes: ["grocery_store"],
        maxResultCount: 10,
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: {
            center: {
              latitude,
              longitude,
            },
            radius: 5000,
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(
      `Places lookup failed with status ${response.status}`,
    );
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

  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: locationQuery,
        maxResultCount: 1,
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(
      `Location lookup failed with status ${response.status}`,
    );
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
    resolved_location:
      place.formattedAddress || place.displayName?.text || locationQuery,
  };
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

app.post("/stores/nearby", authenticate, async (req, res) => {
  try {
    let latitude = Number(req.body?.latitude);
    let longitude = Number(req.body?.longitude);
    let resolvedLocation = "";

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      const locationQuery = String(req.body?.location_query || "").trim();
      if (!locationQuery) {
        res
          .status(400)
          .json({
            detail: "latitude and longitude or location_query is required",
          });
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
        longitude: place.location?.longitude ?? longitude,
      });

      stores.push(buildStoreResponse(store, { latitude, longitude }));
    }

    stores.sort(
      (left, right) =>
        (left.distance_miles ?? Number.POSITIVE_INFINITY) -
        (right.distance_miles ?? Number.POSITIVE_INFINITY),
    );
    res.json({
      stores,
      resolved_location:
        resolvedLocation || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    });
  } catch (error) {
    console.error("[nearby stores]", error.externalDetail || error.message);
    res.status(error.statusCode || 500).json({
      detail:
        error.statusCode === 500 && /Google Maps API key/i.test(error.message)
          ? "Google Maps API key is missing in backend/.env"
          : "Unable to find nearby stores",
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
      reviews,
    });
  } catch (error) {
    console.error("[get store reviews]", error.message);
    res.status(500).json({ detail: "Unable to load store reviews" });
  }
});

app.post("/stores/:storeId/reviews", authenticate, async (req, res) => {
  try {
    const userId = req.account.id;
    if (req.body?.user_id && req.body.user_id !== userId)
      return res
        .status(403)
        .json({ detail: "You can only post your own reviews." });
    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || "").trim();
    const fallbackName = String(req.body?.store_name || "").trim();
    const fallbackLatitude = Number(req.body?.latitude);
    const fallbackLongitude = Number(req.body?.longitude);

    if (
      !requireFields(res, [
        { name: "user_id", value: userId },
        { name: "comment", value: comment },
      ])
    ) {
      return;
    }

    if (
      comment.length > 2000 ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      res
        .status(400)
        .json({ detail: "rating must be an integer between 1 and 5" });
      return;
    }

    const user = req.account;
    if (!user) {
      res.status(404).json({ detail: "user not found" });
      return;
    }

    let store = await getStoreById(req.params.storeId);
    if (!store) {
      if (
        !fallbackName ||
        !Number.isFinite(fallbackLatitude) ||
        !Number.isFinite(fallbackLongitude)
      ) {
        res
          .status(400)
          .json({
            detail: "store metadata is required before adding the first review",
          });
        return;
      }

      store = await upsertStore({
        store_id: req.params.storeId,
        name: fallbackName,
        latitude: fallbackLatitude,
        longitude: fallbackLongitude,
      });
    }

    const existingReview = await getReviewByUserAndStore(
      user.id,
      store.store_id,
    );
    if (existingReview) {
      await updateReview({
        review_id: existingReview.review_id,
        rating,
        comment,
      });
    } else {
      await addReview({
        review_id: createId(),
        user_id: user.id,
        facility_id: store.store_id,
        rating,
        comment,
      });
    }

    const updatedStore = await getStoreById(store.store_id);
    const reviews = await getReviewsByStoreId(store.store_id);
    res.status(existingReview ? 200 : 201).json({
      message: existingReview ? "review updated" : "review added",
      store: buildStoreResponse(updatedStore),
      reviews,
    });
  } catch (error) {
    console.error("[add store review]", error.message);
    res.status(500).json({ detail: "Unable to save store review" });
  }
});

app.delete(
  "/stores/:storeId/reviews/:userId",
  authenticate,
  owner,
  async (req, res) => {
    try {
      const userId = String(req.params.userId || "").trim();
      const storeId = String(req.params.storeId || "").trim();

      const user = req.account;
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
        reviews,
      });
    } catch (error) {
      console.error("[delete store review]", error.message);
      res.status(500).json({ detail: "Unable to delete review" });
    }
  },
);

installUserRoutes(app);
app.get("/app-config.js", (_req, res) =>
  res.type("application/javascript").send("window.__APP_CONFIG__ = {};"),
);
app.use(express.static(path.join(__dirname, "../frontend/public")));
app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error("[request]", error.message);
  res
    .status(status)
    .json({
      detail:
        status >= 500
          ? "Unable to save or load your data. Please try again."
          : error.message,
    });
});

async function start() {
  await testConnection();
  await migrate();
  await ensureStoresTable();
  await ensureReviewsTable();
  app.listen(port, host, () => {
    console.log(`MyChef API available at http://${host}:${port}`);
  });
}

start().catch((error) => {
  console.error("[startup]", error.message);
  process.exit(1);
});
