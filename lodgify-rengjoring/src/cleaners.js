const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "cleaners.json");

function load() {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf-8"));
  return raw;
}

function forProperty(propertyId) {
  const { assignments, defaultCleaner } = load();
  const found = assignments.find(
    (a) => String(a.propertyId) === String(propertyId)
  );
  return found || { ...defaultCleaner, propertyId, propertyName: null };
}

function knownPropertyIds() {
  const { assignments } = load();
  return assignments.map((a) => String(a.propertyId));
}

module.exports = { load, forProperty, knownPropertyIds };
