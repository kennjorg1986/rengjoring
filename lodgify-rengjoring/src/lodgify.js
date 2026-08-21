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

/**
 * Henter alle properties (leiligheter/hus) fra Lodgify, slik at vi kan
 * vise navn i stedet for bare en ID.
 * Endepunkt: GET /v2/properties
 */
async function getProperties() {
  const { data } = await client().get("/v2/properties");
  // Responsen kan enten være en liste direkte, eller { items: [...] }
  // avhengig av API-versjon - vi håndterer begge.
  return Array.isArray(data) ? data : data.items || [];
}

/**
 * Henter bookinger fra Lodgify innenfor et datointervall, filtrert på
 * enten ankomst eller avreise.
 *
 * stayFilter: "ArrivalDate" | "DepartureDate" | "Upcoming" | "Current" | "All"
 * start/end: "YYYY-MM-DD"
 *
 * NB: Sjekk https://docs.lodgify.com/reference/getallasync for eksakt
 * navn på query-parametere - Lodgify har justert disse noen ganger.
 * Endepunkt: GET /v2/reservations/bookings
 */
async function getBookings({ stayFilter, start, end, page = 1, size = 50 } = {}) {
  const params = { page, size };
  if (stayFilter) params.stayFilter = stayFilter;
  if (start) params.start = start;
  if (end) params.end = end;

  const { data } = await client().get("/v2/reservations/bookings", { params });
  return Array.isArray(data) ? data : data.items || [];
}

/**
 * Henter bookinger med utsjekk på en gitt dato (typisk "i morgen"),
 * som er dagene der en leilighet trenger rengjøring.
 */
async function getDeparturesOn(dateISO) {
  return getBookings({ stayFilter: "DepartureDate", start: dateISO, end: dateISO });
}

/**
 * Henter bookinger med innsjekk på en gitt dato, slik at vi kan vise
 * hvor mange nye gjester som kommer inn samme dag rengjøringen skjer.
 */
async function getArrivalsOn(dateISO) {
  return getBookings({ stayFilter: "ArrivalDate", start: dateISO, end: dateISO });
}

module.exports = {
  getProperties,
  getBookings,
  getDeparturesOn,
  getArrivalsOn,
};
