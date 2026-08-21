const lodgify = require("./lodgify");
const cleaners = require("./cleaners");
const storage = require("./storage");

function isoDatePlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function guestCount(booking) {
  if (Array.isArray(booking.rooms)) {
    return booking.rooms.reduce((sum, r) => {
      const gb = r.guest_breakdown || {};
      return sum + (gb.adults || 0) + (gb.children || 0);
    }, 0);
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
  const knownIds = cleaners.knownPropertyIds();
  const relevantDepartures = departures.filter((dep) => knownIds.includes(String(propertyIdOf(dep))));

  const tasks = relevantDepartures.map((dep) => {
    const pid = String(propertyIdOf(dep));
    const nextArrivals = arrivalsByProperty.get(pid) || [];
    const assignment = cleaners.forProperty(pid);
    const key = `${pid}_${dateISO}`;

    return {
      key,
      propertyId: pid,
      propertyName: assignment.propertyName || propertyNameById.get(pid) || `Leilighet ${pid}`,
      date: dateISO,
      checkoutTime: dep.check_out ? dep.check_out.time : null,
      departingGuest: guestName(dep),
      departingGuests: guestCount(dep),
      nextArrivals: nextArrivals.map((a) => ({
        guest: guestName(a),
        guests: guestCount(a),
        checkinTime: a.check_in ? a.check_in.time : null,
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
