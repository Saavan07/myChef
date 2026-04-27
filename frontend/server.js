const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "127.0.0.1";
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, host, () => {
  console.log(`Meal planner frontend available at http://${host}:${port}`);
});
