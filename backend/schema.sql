-- Local development schema reconstructed from the Spring 2026 API queries.
-- Select an empty, disposable database before importing this file.
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  dietary_preferences JSON NOT NULL,
  dietary_restrictions JSON NOT NULL,
  pantry JSON NOT NULL,
  favorites JSON NOT NULL,
  shopping_list_items JSON NOT NULL,
  meal_plans JSON NOT NULL,
  meal_history JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recipes (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  ingredients JSON NOT NULL,
  steps JSON NOT NULL,
  dietary_tags JSON NOT NULL,
  meal_type VARCHAR(32) NOT NULL,
  prep_time_minutes INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
