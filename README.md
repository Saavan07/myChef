# myChef

A team-built meal-planning web application for students cooking for themselves. Plan a week from stored recipes, use pantry ingredients, and turn the plan into an aggregated shopping list.

I worked on myChef with Ayush Chandra, Sam Tewari, and Tanish Mittal for CS 222 at the University of Illinois Urbana-Champaign in Spring 2026. We built it around planning meals, keeping track of pantry ingredients, and putting together a shopping list. This repository keeps our original team history as I continue working on the project.

## Implemented scope

| Flow | Implementation |
| --- | --- |
| Accounts and preferences | Registration, login, dietary preferences and restrictions stored in MySQL |
| Pantry and favorites | Add/remove pantry items and save favorite recipes |
| Recipes | Browse stored recipes with ingredients, steps, preparation times, and cooking tips |
| Meal planning | Generate seven days of meals and swap selections using recipe tags, favorites, pantry overlap, and repetition penalties |
| Shopping | Aggregate ingredient quantities, normalize names/units, separate pantry matches, and add manual items |
| Grocery search | Google Places lookup by location, plus stored reviews |

The planner selects existing recipes. It does not generate recipes with an AI model. Grocery search does not provide live store inventory or price comparison. Friends, meal sharing, voice cooking assistance, and native mobile apps are future directions.

## Architecture

```text
Browser: HTML, CSS, vanilla JavaScript
  -> frontend/server.js: Express static server, port 3000
  -> frontend/public/api.js: browser API client
  -> backend/server.js: Express API, port 4000
     -> MySQL: users, recipes, grocery stores, reviews
     -> Google Places: optional nearby grocery lookup
```

The active application uses Node.js. `main.py` preserves an earlier Python backend iteration and is not launched by the current setup. The browser keeps the selected user in local storage; this is not secure session authentication.

## Run locally

Use Node.js 24 and MySQL 8.4 for the verification environment. Use a disposable local database and test account credentials.

1. From a checkout of this repository, install both sets of locked dependencies:

   ```bash
   npm ci
   npm --prefix frontend ci
   ```

2. Create a database and database user using your local MySQL installation. Grant that user access to the new database. Import the schema, replacing `mychef` and the username with your choices:

   ```bash
   mysql -u your_mysql_user -p mychef < backend/schema.sql
   ```

3. Copy the example configuration and enter your local database settings:

   ```bash
   cp backend/.env.example backend/.env
   ```

   `backend/env.js` reads **backend/.env**. `GOOGLE_MAPS_API_KEY` is optional for the core planning flow and required for external grocery lookup. Supply your own restricted key; keep it out of Git.

4. Start the API from the repository root:

   ```bash
   npm start
   ```

   Startup checks the database, creates grocery/review tables if needed, and seeds recipes when the recipes table is empty. `backend/seedRecipes.js` exports seed data; it is not a standalone database initializer.

5. In a second terminal, start the frontend:

   ```bash
   npm --prefix frontend start
   ```

6. Open http://127.0.0.1:3000. The API health endpoint is http://127.0.0.1:4000/health.

If you change the API address, set `BACKEND_URL` in the frontend terminal. The frontend server does not load `backend/.env`. Its generated `/app-config.js` tells the browser where to reach the API.

## Local smoke check

With the API running against a disposable local database, run `node scripts/smoke-local.mjs`. It creates test records and verifies the core API flow. Do not run it against a database you need to keep clean.

## Demonstration flow

Register a disposable account, save preferences, add garlic to the pantry, favorite a recipe, generate a week, swap one meal, and add a manual shopping item. Compare the shopping list with the pantry. Grocery search needs a separately configured Google API key.

## Limitations

- Passwords are stored and compared as plaintext in the inherited prototype. User-ID routes do not enforce authenticated ownership. Do not deploy this version for real users or reuse a real password.
- Dietary filtering relies on recipe tags and simple ingredient matching, includes known incorrect seed tags, and can fall back to unrestricted recipes. It cannot establish allergy safety or account for cross-contamination.
- Pantry matches indicate ingredient presence, not whether enough quantity remains. Unit aggregation is limited and does not perform general unit conversion.
- Recipe variety is constrained by the seed catalog. Nutrition, ingredient amounts, and cooking directions need review before product release.
- The frontend and API use separate dependency versions. Setup and dependency findings are recorded in `docs/verification.md`.

## Contributions and provenance

I worked on the frontend prototype and improved shopping-list ingredient matching, quantities, manual items, and how those appeared in the app. Commit `1cf2c63` includes that work across the frontend and earlier Python backend. My teammates contributed to the Node.js/MySQL integration, and we helped each other across the project.

The commit history records many of our changes, alongside the design, debugging, and pair work we did together.

See `docs/project-baseline.md` for the boundary between the team application and later development. No new blanket license is assigned by this documentation update; preserve existing contributor and third-party notices.

See [publication history and original commit mapping](docs/publication-history.md) for the cleaned-copy provenance.
