require("dotenv").config();
const express = require("express");
const cron = require("node-cron");
const path = require("path");

const { buildCleaningTasks } = require("./src/cleaning");
const { notifyAll } = require("./src/notify");
const storage = require("./src/storage");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Enkel passordbeskyttelse for dashboard-API-et, slik at ikke hvem som
// helst med lenken kan se gjesteinfo. Rengjørere skriver inn passordet
// én gang i nettleseren (lagres i localStorage av frontend).
function requirePassword(req, res, next) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return next(); // ingen passord satt = åpen tilgang
  const provided = req.header("x-dashboard-password") || req.query.password;
  if (provided !== expected) {
    return res.status(401).json({ error: "Feil eller manglende passord" });
  }
  next();
}

app.get("/api/tasks", requirePassword, async (req, res) => {
  try {
    const dateISO = req.query.date; // valgfritt: ?date=YYYY-MM-DD
    const tasks = await buildCleaningTasks(dateISO);
    res.json({ date: dateISO || tasks[0]?.date || null, tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, details: err.response ? err.response.data : null });
  }
});

app.post("/api/tasks/:key/done", requirePassword, (req, res) => {
  const { key } = req.params;
  const { done } = req.body;
  const updated = storage.markDone(key, !!done);
  res.json({ key, ...updated });
});

app.post("/api/notify-now", requirePassword, async (req, res) => {
  try {
    const tasks = await buildCleaningTasks();
    const results = await notifyAll(tasks);
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, details: err.response ? err.response.data : null });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Rengjøringsdashbord kjører på http://localhost:${port}`);
});

// Planlagt daglig varsling (SMS/e-post) - styres av NOTIFY_CRON i .env
const cronExpr = process.env.NOTIFY_CRON || "0 9 * * *";
cron.schedule(
  cronExpr,
  async () => {
    console.log(`[cron] Kjører daglig rengjøringssjekk (${cronExpr})`);
    try {
      const tasks = await buildCleaningTasks();
      await notifyAll(tasks);
      console.log(`[cron] Varslet om ${tasks.length} leilighet(er)`);
    } catch (err) {
      console.error("[cron] Feil:", err.message);
    }
  },
  { timezone: process.env.TZ || "Europe/Oslo" }
);
