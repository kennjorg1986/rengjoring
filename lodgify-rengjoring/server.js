require("dotenv").config();
const express = require("express");
const cron = require("node-cron");
const path = require("path");

const { buildCleaningTasks, buildMonthlyReport } = require("./src/cleaning");
const { notifyAll } = require("./src/notify");
const storage = require("./src/storage");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function requirePassword(req, res, next) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return next();
  const provided = req.header("x-dashboard-password") || req.query.password;
  if (provided !== expected) {
    return res.status(401).json({ error: "Feil eller manglende passord" });
  }
  next();
}

app.get("/api/debug-properties", requirePassword, async (req, res) => {
  try {
    const lodgify = require("./src/lodgify");
    const props = await lodgify.getProperties();
    res.json(props);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug-day", requirePassword, async (req, res) => {
  try {
    const lodgify = require("./src/lodgify");
    const dateISO = req.query.date;
    const deps = await lodgify.getDeparturesOn(dateISO);
    res.json({ dateISO, count: deps.length, deps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tasks", requirePassword, async (req, res) => {
  try {
    const dateISO = req.query.date;
    const tasks = await buildCleaningTasks(dateISO);
    res.json({ date: dateISO || tasks[0]?.date || null, tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, details: err.response ? err.response.data : null });
  }
});

app.get("/api/report", requirePassword, async (req, res) => {
  try {
    const month = req.query.month;
    if (!month) {
      return res.status(400).json({ error: "Mangler måned (YYYY-MM)" });
    }
    const report = await buildMonthlyReport(month);
    res.json(report);
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

app.post("/api/tasks/:key/note", requirePassword, (req, res) => {
  const { key } = req.params;
  const { note } = req.body;
  const updated = storage.setNote(key, note || "");
  res.json({ key, ...updated });
});

app.post("/api/tasks/:key/photos", requirePassword, (req, res) => {
  const { key } = req.params;
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "Mangler bilde-URL" });
  }
  const updated = storage.addPhoto(key, url);
  res.json({ key, ...updated });
});

app.post("/api/tasks/:key/photos/delete", requirePassword, (req, res) => {
  const { key } = req.params;
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "Mangler bilde-URL" });
  }
  const updated = storage.removePhoto(key, url);
  res.json({ key, ...updated });
});

app.post("/api/tasks/:key/payment", requirePassword, (req, res) => {
  const { key } = req.params;
  const { amount, paid, selfCleaned } = req.body;
  const updated = storage.setPayment(key, { amount, paid, selfCleaned });
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
