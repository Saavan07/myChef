const d = require("./meal-domain");
const a = require("./assistant-domain");
const provider = require("./assistant-provider");

function installAssistantRoutes(
  app,
  { readUser, recipes, mutate },
  connection = provider,
) {
  const limits = new Map();
  const inflight = new Set();
  app.get("/users/:userId/assistant", (_req, res) =>
    res.json({ available: connection.configured() }),
  );
  app.post("/users/:userId/meal-plans/:planId/assistant", async (req, res) => {
    const input = a.request(req.body);
    const id = req.account.id;
    const user = await readUser(id);
    const plan = d.planFrom(user, req.params.planId);
    const previous = a.replay(plan, input);
    if (previous) return res.json(previous);
    d.checkVersion(plan, input.version);
    if (!connection.configured())
      throw new d.InputError(
        "The meal assistant is not connected yet. You can still use the dinner swap controls.",
        503,
      );
    const now = Date.now();
    for (const [key, limit] of limits)
      if (limit.until <= now) limits.delete(key);
    if (inflight.has(id))
      throw new d.InputError(
        "An assistant request is already running. Wait for it to finish before trying again.",
        429,
      );
    const limit = limits.get(id) || { count: 0, until: now + 60000 };
    if (limit.count >= 8 || (limits.size >= 5000 && !limits.has(id)))
      throw new d.InputError(
        "The assistant has had several requests. Please wait a minute before trying again.",
        429,
      );
    limit.count++;
    limits.set(id, limit);
    inflight.add(id);
    try {
      const all = await recipes();
      const revision = a.revision(user, plan, all);
      const intent = await connection.interpret(
        a.context(user, plan, all, input.local_date),
        input.messages,
      );
      const result = await mutate(id, ["meal_plans"], async (latest, db) =>
        a.apply(
          latest,
          d.planFrom(latest, plan.id),
          await recipes(db),
          input,
          intent,
          revision,
        ),
      );
      res.json(result);
    } finally {
      inflight.delete(id);
    }
  });
}
module.exports = { installAssistantRoutes };
