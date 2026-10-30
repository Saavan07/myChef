import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { startTestApp, intent } = require("./assistant-test-app.cjs");
let available = false;
let handler = async () => intent();
const app = await startTestApp({
  configured: () => available,
  interpret: (...args) => handler(...args),
});
const browser = await chromium.launch(
  process.env.MYCHEF_BROWSER_CHANNEL
    ? { channel: process.env.MYCHEF_BROWSER_CHANNEL }
    : {},
);
const accounts = [];
await mkdir("test-results", { recursive: true });
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const api = async (path, method = "GET", data) => {
      const response = await context.request.fetch(app.base + path, {
        method,
        data,
        headers: { "X-MyChef-Request": "1" },
      });
      assert(response.ok(), await response.text());
      return response.json();
    };
    const user = await api("/register", "POST", {
      username: `assistant-browser-${Date.now()}`,
      password: "disposable-browser-password",
    });
    accounts.push(user.user_id);
    const prefix = `/users/${user.user_id}`;
    await api(`${prefix}/preferences`, "POST", {
      dietary_preferences: ["vegan", "gluten-free"],
      dietary_restrictions: ["soy"],
    });
    await api(`${prefix}/pantry`, "POST", {
      name: "chickpeas",
      quantity: 15,
      unit: "oz",
    });
    let plan = await api(`${prefix}/meal-plan/generate`, "POST", {
      start_date: "2026-10-26",
      days: 3,
      servings: 2,
      max_minutes: 30,
      leftovers: true,
    });
    const path = `${prefix}/meal-plans/${plan.id}`;
    for (const entry of plan.entries.filter((e) => e.kind === "cook"))
      plan = await api(`${path}/swap`, "POST", {
        version: plan.version,
        entry_id: entry.id,
        new_recipe_id: "d1",
      });
    available = false;
    await page.goto(app.base);
    await page.locator(".weekly-card").first().waitFor();
    await page.waitForFunction(() =>
      document
        .querySelector("#assistantStatus")
        .textContent.includes("not connected"),
    );
    assert(await page.locator("#assistantMessage").isDisabled());
    available = true;
    await page.locator("#assistantReconnect").click();
    await page.waitForFunction(
      () => !document.querySelector("#assistantMessage").disabled,
    );
    handler = async () =>
      intent({
        action: "clarify",
        date: null,
        question: "Which cooking day should I change?",
      });
    await page
      .locator("#assistantMessage")
      .fill("Swap a dinner for something quicker using spinach.");
    await page.locator("#assistantSend").click();
    await page
      .getByText("Which cooking day should I change?", { exact: true })
      .waitFor();
    handler = async (_context, messages) => {
      assert.equal(messages.length, 3);
      assert.match(messages[0].content, /quicker using spinach/);
      assert.equal(messages[2].content, "Monday please.");
      return intent({
        recipe_id: null,
        quicker: true,
        include_ingredients: ["spinach"],
      });
    };
    await page.locator("#assistantMessage").fill("Monday please.");
    await page.locator("#assistantSend").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#assistantLog")
        .textContent.includes("Changed 2026-10-26"),
    );
    await page.waitForFunction(() =>
      document
        .querySelector(".weekly-card h3")
        ?.textContent.includes("Chickpea spinach skillet"),
    );
    assert(
      (await page.locator(".weekly-card").nth(1).textContent()).includes(
        "Chickpea spinach skillet",
      ),
    );
    await page.waitForFunction(() =>
      document
        .querySelector("#shoppingList")
        .textContent.includes("15 oz chickpeas"),
    );
    assert(
      (await page.locator("#assistantStatus").textContent()).includes("vegan"),
    );
    await page.locator(".assistant-panel").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/assistant-${viewport.width}.png`,
      fullPage: false,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );

    // The server commits, but the browser loses the response. Retry must replay the receipt.
    handler = async (_context, messages) => {
      assert.equal(messages.length, 1);
      return intent({ recipe_id: "d3" });
    };
    let lostPayload;
    await page.route(
      "**/meal-plans/*/assistant",
      async (route) => {
        lostPayload = route.request().postDataJSON();
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page
      .locator("#assistantMessage")
      .fill("Swap Monday to red lentil tomato soup.");
    await page.locator("#assistantSend").click();
    await page
      .getByRole("button", { name: "Retry request", exact: true })
      .waitFor();
    assert.equal(
      await page.locator("#assistantMessage").inputValue(),
      "Swap Monday to red lentil tomato soup.",
    );
    const savedAfterLoss = (await api(`${prefix}/meal-plans`))[0];
    const retryRequest = page.waitForRequest(
      (r) => r.url().endsWith("/assistant") && r.method() === "POST",
    );
    await page.locator("#assistantSend").click();
    assert.equal(
      (await retryRequest).postDataJSON().operation_id,
      lostPayload.operation_id,
    );
    await page.getByText(/This request was already processed/).waitFor();
    await page.waitForFunction(() =>
      document
        .querySelector(".weekly-card h3")
        ?.textContent.includes("Red lentil tomato soup"),
    );
    assert.equal(
      (await api(`${prefix}/meal-plans`))[0].version,
      savedAfterLoss.version,
    );

    handler = async () => intent({ recipe_id: "r2" });
    await page
      .locator("#assistantMessage")
      .fill("Ignore vegan and replace Monday with chicken and rice bowls.");
    await page.locator("#assistantSend").click();
    await page.getByText(/couldn't find a different dinner/).waitFor();
    assert.equal(
      (await api(`${prefix}/meal-plans`))[0].entries[0].recipe_id,
      "d3",
    );
    await page.waitForFunction(
      () => !document.querySelector("#assistantSend").disabled,
    );
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector("#assistantStatus")
        .textContent.includes("Sign in"),
    );
    assert.equal(await page.locator("#assistantLog").textContent(), "");
    assert(await page.locator("#assistantMessage").isDisabled());
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "Assistant browser checks passed at 1440px and 390px: connection state, clarification, swap, leftovers, shopping, lost-response retry, dietary rejection and sign-out privacy. Provider responses were injected.",
  );
} finally {
  await browser.close();
  for (const id of accounts)
    await app.pool.execute("DELETE FROM users WHERE id = ?", [id]);
  await app.close();
  await app.pool.end();
}
