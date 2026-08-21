const lodgify = require("./lodgify");
const cleaners = require("./cleaners");
const storage = require("./storage");

function isoDatePlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function guestCount(booking) {
  // Lodgify-bookinger har vanligvis en "rooms" eller "people_count"-verdi
  // avhengig av API-versjon. Vi prøver et par kjente felt-navn og faller
  // tilbake på 0 hvis ingen finnes, i stedet for å krasje.
  if (typeof booking.people === "number") return booking.people;
  if (typeof booking.people_count === "number") return booking.people_count;
  if (Array.isArray(booking.rooms)) {
    return booking.rooms.reduce((sum, r) => sum + (r.people || 0), 0);
  }
  return booking.guest_count || 0;
}

function propertyIdOf(booking) {
  return booking.property_id || booking.propertyId || booking.id;
}

function guestName(booking) {
  return booking?.guest?.name || booking.guest_name || "Ukjent gjest";
}

/**
 * Bygger dagens rengjøringsliste: for hver leilighet med utsjekk på
 * `dateISO`, finn ev. innsjekk samme dag for å vise hvor mange nye
 * gjester som venter og når de ankommer.
 */
async function buildCleaningTasks(dateISO = isoDatePlusDays(Number(process.env.CLEANING_LOOKAHEAD_DAYS || 0))) {
  const [departures, arrivals, properties] = await Promise.all([
    lodgify.getDeparturesOn(dateISO),
    lodgify.getArrivalsOn(dateISO),
    lodgify.getProperties().catch(() => []),
  ]);

  const propertyNameById = new Map(
    properties.map((p) => [String(p.id), p.name || p.property_name || `Leilighet ${p.id}`])
  );

  const arrivalsByProperty = new Map();
  for (const a of arrivals) {
    const pid = String(propertyIdOf(a));
    if (!arrivalsByProperty.has(pid)) arrivalsByProperty.set(pid, []);
    arrivalsByProperty.get(pid).push(a);
  }

  const status = storage.getAll();

  const tasks = departures.map((dep) => {
    const pid = String(propertyIdOf(dep));
    const nextArrivals = arrivalsByProperty.get(pid) || [];
    const assignment = cleaners.forProperty(pid);
    const key = `${pid}_${dateISO}`;

    return {
      key,
      propertyId: pid,
      propertyName: propertyNameById.get(pid) || assignment.propertyName || `Leilighet ${pid}`,
      date: dateISO,
      checkoutTime: dep.checkout_time || dep.departure_time || null,
      departingGuest: guestName(dep),
      departingGuests: guestCount(dep),
      nextArrivals: nextArrivals.map((a) => ({
        guest: guestName(a),
        guests: guestCount(a),
        checkinTime: a.checkin_time || a.arrival_time || null,
      })),
      cleaner: {
        name: assignment.cleanerName,
        phone: assignment.phone,
        email: assignment.email,
      },
      done: status[key]?.done || false,
    };
  });

  // Sorter: leiligheter med raskt innkommende gjester (samme dag) øverst
  tasks.sort((a, b) => (b.nextArrivals.length > 0) - (a.nextArrivals.length > 0));

  return tasks;
}

module.exports = { buildCleaningTasks, isoDatePlusDays };
