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

function isActiveBooking(booking) {
  if (booking.is_deleted) return false;
  if (booking.canceled_at) return false;
  if (booking.status !== "Booked") return false;
  return true;
}

async function buildCleaningTasks(dateISO = isoDatePlusDays(Number(process.env.CLEANING_LOOKAHEAD_DAYS || 0))) {
  const [departuresRaw, arrivalsRaw, properties] = await Promise.all([
    lodgify.getDeparturesOn(dateISO),
    lodgify.getArrivalsOn(dateISO),
    lodgify.getProperties().catch(() => []),
  ]);

  const departures = departuresRaw.filter(isActiveBooking);
  const arrivals = arrivalsRaw.filter(isActiveBooking);

  const propertyById = new Map(properties.map((p) => [String(p.id), p]));

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
    const property = propertyById.get(pid);
    const key = `${pid}_${dateISO}`;

    return {
      key,
      propertyId: pid,
      propertyName: assignment.propertyName || (property && property.name) || `Leilighet ${pid}`,
      imageUrl: property && property.image_url ? "https:" + property.image_url : null,
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
      note: status[key]?.note || "",
      photos: status[key]?.photos || [],
      amount: typeof status[key]?.amount === "number" ? status[key].amount : 400,
      paid: status[key]?.paid || false,
      selfCleaned: status[key]?.selfCleaned || false,
    };
  });

  tasks.sort((a, b) => a.propertyName.localeCompare(b.propertyName));

  return tasks;
}

/**
 * Bygger en månedlig rapport (YYYY-MM): for hver dag i måneden, se etter
 * utsjekk hos de kjente leilighetene, og hent inn rengjørings- og
 * betalingsstatus for hver av dem.
 */
async function buildMonthlyReport(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  const knownIds = cleaners.knownPropertyIds();
  const status = storage.getAll();
  const properties = await lodgify.getProperties().catch(() => []);
  const propertyById = new Map(properties.map((p) => [String(p.id), p]));

  const entries = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateISO = `${yearMonth}-${String(day).padStart(2, "0")}`;
    const departuresRaw = await lodgify.getDeparturesOn(dateISO);
    const departures = departuresRaw
      .filter(isActiveBooking)
      .filter((dep) => knownIds.includes(String(propertyIdOf(dep))));

    for (const dep of departures) {
      const pid = String(propertyIdOf(dep));
      const assignment = cleaners.forProperty(pid);
      const property = propertyById.get(pid);
      const key = `${pid}_${dateISO}`;

      entries.push({
        key,
        date: dateISO,
        propertyName: assignment.propertyName || (property && property.name) || `Leilighet ${pid}`,
        cleanerName: assignment.cleanerName,
        done: status[key]?.done || false,
        amount: typeof status[key]?.amount === "number" ? status[key].amount : 400,
        paid: status[key]?.paid || false,
        selfCleaned: status[key]?.selfCleaned || false,
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.propertyName.localeCompare(b.propertyName));

  const paidEntries = entries.filter((e) => e.paid);
  const unpaidEntries = entries.filter((e) => !e.paid && !e.selfCleaned);
  const selfCleanedEntries = entries.filter((e) => e.selfCleaned);

  const totals = {
    count: entries.length,
    paidCount: paidEntries.length,
    unpaidCount: unpaidEntries.length,
    selfCleanedCount: selfCleanedEntries.length,
    totalPaidAmount: paidEntries.reduce((sum, e) => sum + (e.amount || 0), 0),
    totalUnpaidAmount: unpaidEntries.reduce((sum, e) => sum + (e.amount || 0), 0),
  };

  return { month: yearMonth, entries, totals };
}

module.exports = { buildCleaningTasks, buildMonthlyReport, isoDatePlusDays };
