import { api } from "/api.js";

export function createAssistant({ getContext, onUpdated }) {
  const form = document.querySelector("#assistantForm");
  const input = document.querySelector("#assistantMessage");
  const send = document.querySelector("#assistantSend");
  const status = document.querySelector("#assistantStatus");
  const log = document.querySelector("#assistantLog");
  const reset = document.querySelector("#assistantReset");
  const connection = document.querySelector("#assistantReconnect");
  let identity = "";
  let account = null;
  let available = false;
  let checking = false;
  let busy = false;
  let messages = [];
  let retry = null;
  let generation = 0;

  function addMessage(label, text, kind = "") {
    const block = document.createElement("div");
    block.className = `assistant-message ${kind}`;
    const author = document.createElement("strong");
    author.textContent = label;
    const body = document.createElement("p");
    body.textContent = text;
    block.append(author, body);
    log.appendChild(block);
    while (log.children.length > 12) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  async function checkConnection() {
    const { userId } = getContext();
    if (!userId) return;
    checking = true;
    render();
    try {
      const result = await api.assistantStatus(userId);
      if (account === userId) available = result.available;
    } catch {
      if (account === userId) available = false;
    } finally {
      if (account === userId) {
        checking = false;
        render();
      }
    }
  }

  function render() {
    const { userId, plan, loading, preferences, restrictions } = getContext();
    const next = `${userId || ""}:${plan?.id || ""}`;
    if (identity !== next) {
      identity = next;
      generation++;
      messages = [];
      retry = null;
      busy = false;
      input.value = "";
      log.replaceChildren();
    }
    if (account !== userId) {
      account = userId;
      available = false;
      checking = false;
      if (userId) void checkConnection();
    }
    const ready = Boolean(userId && plan?.entries && available && !loading);
    input.disabled = !ready || busy || checking;
    send.disabled = !ready || busy || checking;
    reset.disabled = busy || !userId;
    connection.hidden = !userId || available;
    connection.disabled = checking;
    send.textContent = busy
      ? "Finding a dinner..."
      : retry
        ? "Retry request"
        : "Update my plan";
    form.setAttribute("aria-busy", String(busy));
    status.textContent = !userId
      ? "Sign in and create a dinner plan to ask for a swap."
      : !plan?.entries
        ? "Create a dinner plan first, then tell me what you'd like to change."
        : checking
          ? "Checking assistant connection..."
          : !available
            ? "The assistant is not connected yet. You can still swap dinners using the controls above."
            : busy
              ? "Checking recipes against your request and saved dietary settings..."
              : `Plan starting ${plan.start_date}. Saved settings: ${[...preferences, ...restrictions.map((s) => `no ${s.replace(/^(no |without |avoid )/i, "")}`)].join(", ") || "none"}.`;
  }

  reset.addEventListener("click", () => {
    messages = [];
    retry = null;
    log.replaceChildren();
    input.value = "";
    render();
    input.focus();
  });
  connection.addEventListener("click", checkConnection);
  input.addEventListener("input", () => {
    if (retry && input.value.trim() !== retry.messages.at(-1).content) {
      retry = null;
      render();
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { userId, plan } = getContext();
    if (busy || !available || !plan?.entries || !input.value.trim()) return;
    const currentGeneration = generation;
    const text = input.value.trim();
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const payload = retry || {
      operation_id: crypto.randomUUID(),
      version: plan.version,
      local_date: localDate,
      messages: [...messages, { role: "user", content: text }],
    };
    if (!retry) addMessage("You", text, "assistant-user");
    retry = payload;
    busy = true;
    render();
    try {
      const result = await api.askAssistant(userId, plan.id, payload);
      if (generation !== currentGeneration) return;
      retry = null;
      input.value = "";
      addMessage(
        "myChef",
        `${result.replayed ? "This request was already processed. " : ""}${result.message}`,
        result.status === "swapped" ? "assistant-success" : "",
      );
      messages =
        result.status === "clarify" && payload.messages.length < 7
          ? [
              ...payload.messages,
              { role: "assistant", content: result.message },
            ]
          : [];
      if (result.status === "clarify" && payload.messages.length >= 7)
        addMessage(
          "myChef",
          "Please put the day and all your requirements together in a new request.",
        );
      await onUpdated(userId, plan.id);
    } catch (error) {
      if (generation !== currentGeneration) return;
      addMessage("myChef", error.message, "assistant-error");
      // Keep the operation ID on network/provider failures: retrying cannot apply twice.
      if (error.status && error.status < 500 && error.status !== 429) {
        retry = null;
        messages = [];
      }
      if (error.status === 409) await onUpdated(userId, plan.id);
    } finally {
      if (generation === currentGeneration) {
        busy = false;
        render();
      }
    }
  });
  return { render };
}
