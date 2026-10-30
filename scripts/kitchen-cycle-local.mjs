import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { getPool } = require("../backend/db");
const base = process.env.MYCHEF_SMOKE_BASE_URL || "http://127.0.0.1:4000";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
assert(["127.0.0.1", "localhost"].includes(process.env.DB_HOST));
assert.equal(process.env.DB_NAME, "mychef_local");
let count = 0;
const ids = [];
function client() {
  return {
    cookie: "",
    async request(path, method = "GET", body, status = 200) {
      const response = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-MyChef-Request": "1",
          Cookie: this.cookie,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.headers.getSetCookie().length)
        this.cookie = response.headers.getSetCookie().at(-1).split(";")[0];
      const result = await response.json();
      count++;
      assert.equal(
        response.status,
        status,
        `${method} ${path}: ${JSON.stringify(result)}`,
      );
      return result;
    },
  };
}
const a = client(),
  b = client();
try {
  const first = await a.request(
    "/register",
    "POST",
    { username: `cycle-${Date.now()}`, password: "disposable-cycle-test" },
    201,
  );
  ids.push(first.user_id);
  const second = await b.request(
    "/register",
    "POST",
    {
      username: `cycle-other-${Date.now()}`,
      password: "disposable-cycle-test",
    },
    201,
  );
  ids.push(second.user_id);
  const prefix = `/users/${first.user_id}`;
  await a.request(`${prefix}/pantry`, "POST", {
    name: "rice",
    quantity: 1,
    unit: "cup",
  });
  let pantry = await a.request(`${prefix}/pantry`);
  const stale = pantry.pantry_revision;
  pantry = await a.request(`${prefix}/pantry/${pantry.pantry[0].id}`, "PATCH", {
    quantity: 1.5,
    pantry_revision: pantry.pantry_revision,
  });
  assert.equal(pantry.pantry[0].quantity, 1.5);
  await a.request(
    `${prefix}/pantry/${pantry.pantry[0].id}`,
    "PATCH",
    { quantity: 8, pantry_revision: stale },
    409,
  );
  await b.request(
    `${prefix}/pantry/${pantry.pantry[0].id}`,
    "PATCH",
    { quantity: 8, pantry_revision: pantry.pantry_revision },
    403,
  );
  pantry = await a.request(`${prefix}/pantry/${pantry.pantry[0].id}`, "PATCH", {
    quantity: 1,
    pantry_revision: pantry.pantry_revision,
  });
  let plan = await a.request(`${prefix}/meal-plan/generate`, "POST", {
    start_date: "2026-10-26",
    days: 3,
    servings: 2,
    max_minutes: 30,
    leftovers: true,
  });
  const path = `${prefix}/meal-plans/${plan.id}`;
  for (const entry of plan.entries.filter((e) => e.kind === "cook"))
    plan = await a.request(`${path}/swap`, "POST", {
      entry_id: entry.id,
      new_recipe_id: "r4",
      version: plan.version,
    });
  await a.request(`${prefix}/shopping-list/manual`, "POST", {
    name: "apple",
    quantity: 3,
    unit: "count",
  });
  let list = await a.request(`${path}/shopping-list`);
  const selected = list.shopping_list_items.filter((i) =>
    ["rice", "apple"].includes(i.name),
  );
  assert.equal(selected.find((i) => i.name === "rice").quantity, 2);
  for (const item of selected)
    await a.request(`${path}/shopping-list`, "PATCH", {
      key: item.key,
      checked: true,
    });
  const purchase = {
    operation_id: randomUUID(),
    version: plan.version,
    pantry_revision: list.pantry_revision,
    items: selected.map((i) => ({
      key: i.key,
      quantity: i.name === "rice" ? 3 : i.quantity,
    })),
  };
  await b.request(`${path}/purchases`, "POST", purchase, 403);
  const receipts = await Promise.all([
    a.request(`${path}/purchases`, "POST", purchase),
    a.request(`${path}/purchases`, "POST", purchase),
  ]);
  assert.equal(receipts.filter((r) => r.duplicate).length, 1);
  pantry = await a.request(`${prefix}/pantry`);
  assert.equal(pantry.pantry.find((i) => i.name === "rice").quantity, 4);
  assert.equal(pantry.pantry.find((i) => i.name === "apple").quantity, 3);
  assert.equal(
    (await a.request(`${prefix}/shopping-list/manual`)).items.length,
    0,
  );
  const cookPath = `${path}/cooking/${plan.entries[0].id}`;
  const leftoverPath = `${path}/cooking/${plan.entries[1].id}`;
  let cooking = await a.request(cookPath);
  let leftover = await a.request(leftoverPath);
  const finish = (data, feedback = {}) => ({
    version: data.version,
    pantry_revision: data.pantry_revision,
    used_ingredients: data.usage.map((i) => ({
      key: i.key,
      quantity: i.quantity,
    })),
    feedback,
  });
  await a.request(`${leftoverPath}/finish`, "POST", finish(leftover), 409);
  await b.request(`${cookPath}/finish`, "POST", finish(cooking), 403);
  const completed = await Promise.all([
    a.request(
      `${cookPath}/finish`,
      "POST",
      finish(cooking, {
        actual_minutes: 37,
        portions: "about_right",
        notes: "Larger pan next time.",
      }),
    ),
    a.request(
      `${cookPath}/finish`,
      "POST",
      finish(cooking, {
        actual_minutes: 37,
        portions: "about_right",
        notes: "Larger pan next time.",
      }),
    ),
  ]);
  assert.equal(completed.filter((r) => r.duplicate).length, 1);
  assert.equal(
    (await a.request(`${prefix}/pantry`)).pantry.find((i) => i.name === "rice")
      .quantity,
    2,
  );
  cooking = await a.request(cookPath);
  assert.equal(cooking.completion.feedback.actual_minutes, 37);
  assert(cooking.completion.untracked.some((i) => i.name === "tofu"));
  assert.equal(cooking.progress.completed, true);
  const remaining = await a.request(`${path}/shopping-list`);
  assert.equal(
    remaining.shopping_list_items.find((i) => i.name === "tofu").quantity,
    14,
  );
  await a.request(
    path,
    "PATCH",
    { action: "servings", servings: 4, version: cooking.version },
    409,
  );
  await a.request(
    `${path}/swap`,
    "POST",
    {
      entry_id: cooking.entry.id,
      new_recipe_id: "r1",
      version: cooking.version,
    },
    409,
  );
  plan = await a.request(path, "PATCH", {
    action: "replan",
    version: cooking.version,
  });
  assert.equal(plan.entries[0].recipe_id, "r4");
  assert.equal(plan.entries[0].servings, 4);
  cooking = await a.request(cookPath);
  await b.request(
    `${cookPath}/feedback`,
    "PATCH",
    { version: cooking.version, feedback: { notes: "spoof" } },
    403,
  );
  await a.request(`${cookPath}/feedback`, "PATCH", {
    version: cooking.version,
    feedback: {
      actual_minutes: 36,
      portions: "too_large",
      notes: "Saved after dinner.",
    },
  });
  cooking = await a.request(cookPath);
  assert.equal(cooking.completion.feedback.notes, "Saved after dinner.");
  leftover = await a.request(leftoverPath);
  await a.request(`${leftoverPath}/finish`, "POST", finish(leftover));
  assert.equal(
    (await a.request(`${prefix}/pantry`)).pantry.find((i) => i.name === "rice")
      .quantity,
    2,
  );
  cooking = await a.request(cookPath);
  await a.request(
    `${cookPath}/finish`,
    "DELETE",
    { version: cooking.version, pantry_revision: cooking.pantry_revision },
    409,
  );
  leftover = await a.request(leftoverPath);
  await a.request(`${leftoverPath}/finish`, "DELETE", {
    version: leftover.version,
    pantry_revision: leftover.pantry_revision,
  });
  cooking = await a.request(cookPath);
  await b.request(
    `${cookPath}/finish`,
    "DELETE",
    { version: cooking.version, pantry_revision: cooking.pantry_revision },
    403,
  );
  const undo = {
    version: cooking.version,
    pantry_revision: cooking.pantry_revision,
  };
  await a.request(`${cookPath}/finish`, "DELETE", undo);
  await a.request(`${cookPath}/finish`, "DELETE", undo, 409);
  pantry = await a.request(`${prefix}/pantry`);
  assert.equal(pantry.pantry.find((i) => i.name === "rice").quantity, 4);
  assert.equal(pantry.pantry.length, 2);
  assert.equal((await a.request(cookPath)).completion, null);
  assert.equal(
    (await a.request(`${prefix}/meal-plans`))[0].purchases.length,
    1,
  );
  console.log(
    `PASS: ${count} kitchen-cycle API requests. Reviewed purchases, partial stock, retry/concurrent safety, actual-use deductions, observations, leftovers, pantry edits, ownership, and undo verified.`,
  );
} finally {
  for (const id of ids)
    await getPool().execute("DELETE FROM users WHERE id = ?", [id]);
  await getPool().end();
}
