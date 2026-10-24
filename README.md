# myChef

A meal-planning app for students cooking for themselves. Choose dinners for the week, use what is already in your pantry, shop for the missing amounts, and follow the recipes on your phone.

The foundation is the Spring 2026 CS 222 team project by Saavan Kiran, Ayush Chandra, Sam Tewari, and Tanish Mittal at the University of Illinois Urbana-Champaign. The October 2026 work extends that baseline in this personal repository. Original team history and source attribution remain preserved.

## The first cooking week

- Plan 1-7 consecutive dinners with a start date, number of people, and cooking-time limit.
- Cook extra for the following night. Leftover portions are included in the original batch and counted once in the shopping list.
- Keep selected dinners, replan the others, swap a meal, or change portions. Conflicting edits from another tab require a reload.
- Save measured pantry amounts. Shopping subtracts available quantities across the entire selected plan, converts compatible units, and retains intentional extra purchases.
- Check off purchases and review the actual amounts bought before adding them to the pantry. Correct remaining stock directly when needed.
- Follow a phone-friendly cooking view with scaled ingredients, saved steps, and a timer that resumes after reload.
- Review actual ingredient use when finishing a dinner. Tracked stock is deducted once, leftovers do not consume raw ingredients twice, and the shopping list covers remaining cooking days.
- Save optional observations about actual time, portion size, and what to change next time. Undo a finished dinner to restore only the stock that was deducted.
- Choose from 17 recipes, including 12 dinners. Dietary settings apply to generation and swaps. Conflicting older plans require changes before shopping or cooking.
- Sign in with a server-verified session. Passwords are salted and hashed, session cookies are HttpOnly, and private routes check account ownership.

These features are verified locally with the real API and MySQL database. This is not a hosted public release or a claim of allergy safety. See [milestone verification](docs/cooking-week-verification.md).

## Run locally

Requires Node.js 22 or newer, npm, and Docker Compose. Node.js 24 and MySQL 8.4 were used for verification.

```sh
npm ci
docker compose -f compose.local.yml up -d
cp backend/.env.example backend/.env
npm start
```

Wait for the database to be ready before starting the app. Open **http://127.0.0.1:4000**. The same server serves the interface and API, so only one application process is needed. Create a local test account with a password of at least 12 characters.

The supplied database credentials are disposable development values. The database and application bind to local loopback by default. The optional Google Places key can be left blank; dinner planning, shopping, and cooking do not require it.

To stop the database while retaining its contents:

```sh
docker compose -f compose.local.yml stop
```

An existing MySQL database can be configured through `backend/.env`. Back it up before upgrading. Startup creates missing tables, archives the previous bundled recipe rows, upgrades the catalog once, and hashes legacy plaintext passwords before serving requests. Existing user data is retained. Old unmeasured pantry entries need a quantity, and old seven-recipe plans remain listed but need to be replaced with a dinner plan to use the new calculations. Details are in [the migration notes](docs/cooking-week-verification.md#migration).

The optional standalone frontend still works with `npm --prefix frontend ci` followed by `npm --prefix frontend start`. It runs on port 3000 and uses the API on port 4000. Use the same hostname for both, and configure `BACKEND_URL` and `WEB_ORIGINS` if changing those addresses.

## Checks

```sh
npm test
node scripts/migration-check.cjs
npm run test:integration
npx playwright install chromium
npm run test:browser
```

Run the migration check against the disposable Compose database before starting the API. The integration and browser checks require the application to be running. They create their own accounts and remove them afterward. They refuse nonlocal destinations and require the disposable `mychef_local` database. Browser checks cover 1440px desktop and 390px phone layouts and write screenshots to the ignored `test-results/` directory. To use an installed Chrome instead of downloading Chromium, set `MYCHEF_BROWSER_CHANNEL=chrome`.

The GitHub workflow runs the same checks with MySQL and Chromium.

## Boundaries of this version

- Dietary filtering uses a reviewed catalog and recognized ingredient exclusions. Package ingredients, brand substitutions, and cross-contact must still be checked by the person cooking.
- Checkmarks and cooking-step navigation do not change pantry stock. The explicit purchase and finish reviews apply the changes. Ingredients missing from the pantry are recorded as untracked, never negative stock.
- Finished dinners keep their original recipe and portions. Undo them before changing them; undo served leftovers before undoing their source batch. A new plan is needed for a different number of people once cooking has started.
- Cooking observations are private, user-entered notes. Leaving a field blank means it is unknown; recipe estimates are never copied into actual results.
- Volume conversions use US cooking measures. Mass and volume stay separate; cans, slices, and individual items do not convert to weight. Rice, pasta, oats, and lentils are measured dry. Bean weights are canned package net weights before draining.
- Cooking times are estimates. Recipes have not yet been kitchen-tested across serving sizes. Timers show status when the app is open and resume after reload; they do not send background alarms.
- Google Places is an optional nearby-store lookup. It does not provide inventory, prices, or nutrition data. AI assistance, voice, friends, and native apps remain future work.
- Public hosting still needs HTTPS, production cookie/origin configuration, backups, account recovery, and an appropriate shared request limiter. The current sign-in limiter is for one application process.

## Architecture

The browser uses HTML, CSS, and JavaScript. Express serves the interface and API, with MySQL persistence. `backend/auth.js` handles sessions and password hashing; `backend/meal-domain.js` contains planning and quantity rules; `backend/kitchen-domain.js` handles reviewed purchases, inventory changes, and cooking records; `backend/user-routes.js` handles account-owned data with transactions; `backend/migrate.js` manages startup upgrades. The existing grocery integration remains in `backend/server.js`.

`main.py` is an earlier team backend retained for history and is not part of the active application.

## Contributions and provenance

This was collaborative work across the team. Saavan's recorded changes include frontend prototype work and commit `1cf2c63`, which repaired shopping-list ingredient matching, quantities, manual items, and their presentation across the frontend and earlier Python backend. The final Node.js/MySQL integration incorporates work from the other team members.

Git commits are evidence of recorded changes, not a complete measure of design, debugging, or pair work. Individual and shared responsibilities will be refined with the contributors instead of assigning exclusive ownership from commit counts.

See `docs/project-baseline.md` for the boundary between the team application and later development. No new blanket license is assigned by this documentation update; preserve existing contributor and third-party notices.

See [publication history and original commit mapping](docs/publication-history.md) for the cleaned-copy provenance.
