import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { getPool } = require("../backend/db");
const base = process.env.MYCHEF_SMOKE_BASE_URL || "http://127.0.0.1:4000";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert.equal(process.env.DB_NAME, "mychef_local");
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
    await page.goto(base);
    await page.waitForSelector(".recipe-card");
    await page.getByRole("button", { name: "Register", exact: true }).click();
    const username = `browser-${Date.now()}-${viewport.width}`;
    accounts.push(username);
    await page.locator("#usernameInput").fill(username);
    await page.locator("#passwordInput").fill("disposable-browser-password");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await page.getByRole("button", { name: "Log out", exact: true }).waitFor();
    const cookies = await context.cookies();
    assert(
      cookies.some(
        (c) =>
          c.name === "mychef_session" && c.httpOnly && c.sameSite === "Lax",
      ),
    );
    await page
      .locator("#preferences")
      .getByRole("button", { name: "vegan", exact: true })
      .click();
    await page.locator("#restrictionsInput").fill("no peanuts");
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector("#statusBanner")
        .textContent.includes("Dietary settings saved"),
    );
    assert.equal(
      await page.locator("#restrictionsInput").inputValue(),
      "no peanuts",
    );
    await page.locator("#pantryInput").fill("rice");
    await page.locator("#pantryQuantity").fill("1");
    await page.locator("#pantryUnit").selectOption("cup");
    await page
      .locator("#pantryForm")
      .getByRole("button", { name: "Add item" })
      .click();
    await page.waitForFunction(() =>
      document.querySelector("#pantryList").textContent.includes("1 cup rice"),
    );
    await page.locator("#planStart").fill("2026-10-26");
    await page.locator("#planDays").selectOption("3");
    await page.locator("#planServings").fill("2");
    await page.locator("#planLeftovers").uncheck();
    await page
      .getByRole("button", { name: "Plan my dinners", exact: true })
      .click();
    await page.locator(".weekly-card").first().waitFor();
    assert.equal(await page.locator(".weekly-card").count(), 3);
    for (let i = 0; i < 3; i++) {
      const card = page.locator(".weekly-card").nth(i);
      await card.locator("select").selectOption("r4");
      await card
        .getByRole("button", { name: "Swap dinner", exact: true })
        .click();
      await page.waitForFunction(
        () => document.querySelectorAll(".weekly-card").length === 3,
      );
      await page.waitForFunction(
        () => !document.querySelector("#reloadPlansButton").disabled,
      );
    }
    await page.waitForFunction(() =>
      document
        .querySelector("#shoppingList")
        .textContent.includes("2 cup rice"),
    );
    assert(
      (await page.locator("#alreadyHaveList").textContent()).includes(
        "1 cup rice",
      ),
    );
    await page.locator("#manualItemName").fill("apples");
    await page.locator("#manualItemQuantity").fill("3");
    await page.locator("#manualItemUnit").selectOption("count");
    await page
      .locator("#manualShoppingForm")
      .getByRole("button", { name: "Add item" })
      .click();
    await page.waitForFunction(() =>
      document.querySelector("#shoppingList").textContent.includes("apples"),
    );
    const rice = page
      .locator("#shoppingList label")
      .filter({ hasText: "2 cup rice" })
      .locator("input");
    await rice.check();
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll("#shoppingList input")).some(
          (i) => i.disabled,
        ),
    );
    await page
      .locator(".weekly-card")
      .first()
      .getByRole("button", { name: "Start / resume cooking" })
      .click();
    await page.locator("#cookingDialog").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector("#cookingDialog")
        .textContent.includes("Step 2 of"),
    );
    await page.locator("#timerMinutes").fill("2");
    await page
      .getByRole("button", { name: "Start timer", exact: true })
      .click();
    await page.waitForFunction(() =>
      document.querySelector("#timerOutput").textContent.includes("remaining"),
    );
    await page.screenshot({
      path: `test-results/cooking-${viewport.width}.png`,
    });
    await page.reload();
    await page.locator(".weekly-card").first().waitFor();
    assert.equal(
      await page
        .locator("#shoppingList label")
        .filter({ hasText: "2 cup rice" })
        .locator("input")
        .isChecked(),
      true,
    );
    assert(
      (await page.locator("#shoppingList").textContent()).includes("apples"),
    );
    await page
      .locator(".weekly-card")
      .first()
      .getByRole("button", { name: "Start / resume cooking" })
      .click();
    await page.locator("#cookingDialog").waitFor({ state: "visible" });
    assert(
      (await page.locator("#cookingDialog").textContent()).includes(
        "Step 2 of",
      ),
    );
    assert(
      (await page.locator("#timerOutput").textContent()).includes("remaining"),
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.locator("#planner").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/planner-${viewport.width}.png`,
      fullPage: true,
    });
    await page
      .locator("#planner")
      .screenshot({ path: `test-results/dinner-plan-${viewport.width}.png` });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false, `Horizontal overflow at ${viewport.width}px`);
    await page
      .locator(".weekly-card")
      .first()
      .getByLabel("Keep this dinner")
      .check();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".weekly-card").length === 3 &&
        !document.querySelector("#reloadPlansButton").disabled,
    );
    assert(
      await page
        .locator(".weekly-card")
        .first()
        .getByRole("button", { name: "Swap dinner", exact: true })
        .isDisabled(),
    );
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await page
      .getByRole("button", { name: "Login", exact: true })
      .first()
      .waitFor();
    await page.reload();
    await page.waitForSelector(".recipe-card");
    assert.equal(await page.locator(".weekly-card").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      `PASS: ${viewport.width}px browser workflow, cookie/session persistence, quantity shopping, manual items, saved checkboxes, cooking steps/timer, locked dinners, logout, and no horizontal overflow.`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  for (const username of accounts)
    await getPool().execute("DELETE FROM users WHERE username = ?", [username]);
  await getPool().end();
}
