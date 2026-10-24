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
    // Review a purchase using the quantity actually bought, then finish and undo a dinner.
    await page
      .getByRole("button", { name: "Review checked purchases", exact: true })
      .click();
    await page.locator("#purchaseDialog").waitFor({ state: "visible" });
    await page.locator('#purchaseDialog input[data-index="0"]').fill("5");
    await page
      .getByRole("button", { name: "Add purchases to pantry", exact: true })
      .click();
    await page.locator("#purchaseDialog").waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      document.querySelector("#pantryList").textContent.includes("6 cup rice"),
    );
    await page
      .locator(".weekly-card")
      .first()
      .getByRole("button", { name: "Start / resume cooking" })
      .click();
    await page.locator("#cookingDialog").waitFor({ state: "visible" });
    while (
      await page.getByRole("button", { name: "Next step", exact: true }).count()
    ) {
      const before = await page
        .locator("#cookingDialog .eyebrow")
        .last()
        .textContent();
      await page
        .getByRole("button", { name: "Next step", exact: true })
        .click();
      await page.waitForFunction(
        (before) =>
          document
            .querySelector("#cookingDialog")
            .textContent.includes("Step") &&
          [...document.querySelectorAll("#cookingDialog .eyebrow")].at(-1)
            .textContent !== before,
        before,
      );
    }
    await page
      .getByRole("button", { name: "Review and finish", exact: true })
      .click();
    await page.locator("#finishDinnerForm").waitFor();
    await page.locator("#actualMinutes").fill("37");
    await page.locator("#portionFeedback").selectOption("about_right");
    await page
      .locator("#cookingNotes")
      .fill("Trial note: use a bigger pan. <b>Literal text</b>");
    await page.locator("#finishConfirmed").check();
    await page.screenshot({
      path: `test-results/finish-review-${viewport.width}.png`,
    });
    await page
      .getByRole("button", { name: "Save finished dinner", exact: true })
      .click();
    await page.locator("#observationsForm").waitFor();
    assert.equal(await page.locator("#actualMinutes").inputValue(), "37");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.reload();
    await page
      .locator(".weekly-card")
      .first()
      .getByRole("button", { name: "View cooking notes" })
      .waitFor();
    assert(
      (await page.locator("#pantryList").textContent()).includes("5 cup rice"),
    );
    assert(
      (await page.locator(".weekly-card").first().textContent()).includes(
        "37 actual min",
      ),
    );
    await page
      .locator(".weekly-card")
      .first()
      .getByRole("button", { name: "View cooking notes" })
      .click();
    await page.locator("#observationsForm").waitFor();
    assert(
      (await page.locator("#cookingNotes").inputValue()).includes(
        "<b>Literal text</b>",
      ),
    );
    assert.equal(await page.locator("#cookingDialog b").count(), 0);
    await page.locator("#actualMinutes").fill("36");
    await page.route("**/cooking/*/feedback", (route) => route.abort(), {
      times: 1,
    });
    await page
      .getByRole("button", { name: "Save cooking notes", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector("#cookingDialog .cooking-error").textContent
          .length > 0,
    );
    assert.equal(
      await page.locator("#actualMinutes").inputValue(),
      "36",
      "A failed save must preserve the entered observations",
    );
    assert(
      (await page.locator("#cookingNotes").inputValue()).includes("Larger") ||
        (await page.locator("#cookingNotes").inputValue()).includes(
          "bigger pan",
        ),
    );
    const feedbackSaved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/feedback") &&
        r.request().method() === "PATCH" &&
        r.ok(),
    );
    await page
      .getByRole("button", { name: "Save cooking notes", exact: true })
      .click();
    await feedbackSaved;
    await page.waitForFunction(
      () =>
        document.querySelector("#observationsForm button") &&
        !document.querySelector("#observationsForm button").disabled,
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();
    const ricePantry = page
      .locator("#pantryList li")
      .filter({ hasText: "rice" });
    await ricePantry.locator("summary").click();
    await ricePantry.getByRole("spinbutton").fill("0.5");
    await ricePantry
      .getByRole("button", { name: "Save amount", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector("#pantryList")
        .textContent.includes("0.5 cup rice"),
    );
    await page.waitForFunction(() =>
      document
        .querySelector("#shoppingList")
        .textContent.includes("1.5 cup rice"),
    );
    await page
      .locator(".weekly-card")
      .first()
      .getByRole("button", { name: "View cooking notes" })
      .click();
    await page.locator("#observationsForm").waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Undo finished dinner", exact: true })
      .click();
    await page.locator("#cookingDialog").waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      document
        .querySelector("#pantryList")
        .textContent.includes("1.5 cup rice"),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
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
      `PASS: ${viewport.width}px browser workflow, cookie/session persistence, quantity shopping, manual items, saved checkboxes, cooking steps/timer, locked dinners, reviewed purchases, recorded cooking/notes, pantry edits, undo, logout, and no horizontal overflow.`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  for (const username of accounts)
    await getPool().execute("DELETE FROM users WHERE username = ?", [username]);
  await getPool().end();
}
