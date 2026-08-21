require("dotenv").config();
const { buildCleaningTasks } = require("./cleaning");
const { notifyAll } = require("./notify");

async function run() {
  console.log(`[${new Date().toISOString()}] Sjekker Lodgify for rengjøringsoppgaver...`);
  const tasks = await buildCleaningTasks();
  console.log(`Fant ${tasks.length} leilighet(er) som trenger rengjøring.`);

  if (tasks.length === 0) return;

  const results = await notifyAll(tasks);
  for (const r of results) {
    console.log(
      `- ${r.propertyName}: SMS ${r.sms.sent ? "sendt" : "ikke sendt"}, e-post ${r.email.sent ? "sendt" : "ikke sendt"}`
    );
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Feil under rengjøringssjekk:", err.message);
    process.exit(1);
  });
