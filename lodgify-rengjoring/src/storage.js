const fs = require("fs");
const path = require("path");

const STATUS_FILE = path.join(__dirname, "..", "data", "status.json");

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeStatus(status) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

function markDone(key, done) {
  const status = readStatus();
  status[key] = {
    ...(status[key] || {}),
    done,
    updatedAt: new Date().toISOString(),
  };
  writeStatus(status);
  return status[key];
}

function setNote(key, note) {
  const status = readStatus();
  status[key] = {
    ...(status[key] || {}),
    note,
    updatedAt: new Date().toISOString(),
  };
  writeStatus(status);
  return status[key];
}

function addPhoto(key, url) {
  const status = readStatus();
  const existing = status[key] || {};
  const photos = Array.isArray(existing.photos) ? existing.photos : [];
  photos.push(url);
  status[key] = {
    ...existing,
    photos,
    updatedAt: new Date().toISOString(),
  };
  writeStatus(status);
  return status[key];
}

function getAll() {
  return readStatus();
}

module.exports = { markDone, setNote, addPhoto, getAll };
