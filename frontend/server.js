const express = require("express");
const path = require("path");

const app = express();
app.disable("x-powered-by");
const port = process.env.PORT || 3000;
const host = process.env.HOST || "127.0.0.1";
const publicDir = path.join(__dirname, "public");
const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:4000";

app.get("/app-config.js", (_req, res) => {
  res.type("application/javascript");
  res.send(`window.__APP_CONFIG__ = ${JSON.stringify({ backendUrl })};`);
});

app.use(express.static(publicDir));

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, host, () => {
  console.log(`MyChef frontend available at http://${host}:${port}`);
});
