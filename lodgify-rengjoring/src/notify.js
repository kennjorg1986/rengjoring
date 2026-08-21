function smsEnabled() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

function emailEnabled() {
  return !!process.env.RESEND_API_KEY;
}

function taskMessage(task) {
  const lines = [
    `Rengjøring: ${task.propertyName}`,
    `Utsjekk: ${task.date}${task.checkoutTime ? " kl " + task.checkoutTime : ""} (${task.departingGuests} gjester reiser)`,
  ];
  if (task.nextArrivals.length > 0) {
    for (const a of task.nextArrivals) {
      lines.push(
        `Innsjekk samme dag: ${a.guests} gjester${a.checkinTime ? " kl " + a.checkinTime : ""}`
      );
    }
  } else {
    lines.push("Ingen innsjekk samme dag.");
  }
  return lines.join("\n");
}

async function sendSms(task) {
  if (!smsEnabled() || !task.cleaner.phone) return { sent: false, reason: "sms_disabled_or_no_phone" };
  const twilio = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await twilio.messages.create({
    body: taskMessage(task),
    from: process.env.TWILIO_FROM_NUMBER,
    to: task.cleaner.phone,
  });
  return { sent: true };
}

async function sendEmail(task) {
  if (!emailEnabled() || !task.cleaner.email) return { sent: false, reason: "email_disabled_or_no_address" };
  const { Resend } = require("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: task.cleaner.email,
    subject: `Rengjøring i dag: ${task.propertyName}`,
    text: taskMessage(task),
  });
  return { sent: true };
}

/** Sender både SMS og e-post (den som er konfigurert) for en liste med oppgaver. */
async function notifyAll(tasks) {
  const results = [];
  for (const task of tasks) {
    const [sms, email] = await Promise.all([
      sendSms(task).catch((e) => ({ sent: false, error: e.message })),
      sendEmail(task).catch((e) => ({ sent: false, error: e.message })),
    ]);
    results.push({ propertyName: task.propertyName, sms, email });
  }
  return results;
}

module.exports = { notifyAll, taskMessage, smsEnabled, emailEnabled };
