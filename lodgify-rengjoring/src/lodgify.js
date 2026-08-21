const axios = require("axios");

const BASE_URL = process.env.LODGIFY_API_BASE || "https://api.lodgify.com";

function client() {
  const apiKey = process.env.LODGIFY_API_KEY;
  if (!apiKey) {
    throw new Error("LODGIFY_API_KEY mangler i .env");
  }
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      "X-ApiKey": apiKey,
      Accept: "application/json",
    },
    timeout: 15000,
  });
}

async function getProperties() {
  const { data } = await client().get("/v2/properties");
  return Array.isArray(data) ? data : data.items || [];
}

async function getBookings({ stayFilter, stayFilterDate, page = 1, size = 50 } = {}) {
  const params = { page, size };
  if (stayFilter) params.stayFilter = stayFilter;
  if (stayFilterDate) params.stayFilterDate = stayFilterDate;

  const { data } = await client().get("/v2/reservations/bookings", { params });
  return Array.isArray(data) ? data : data.items || [];
}

async function getDeparturesOn(dateISO) {
  return getBookings({ stayFilter: "DepartureDate", stayFilterDate: dateISO });
}

async function getArrivalsOn(dateISO) {
  return getBookings({ stayFilter: "ArrivalDate", stayFilterDate: dateISO });
}

module.exports = {
  getProperties,
  getBookings,
  getDeparturesOn,
  getArrivalsOn,
};
