# Rengjøringsvarsling koblet mot Lodgify

Dette er en liten webapp som:
1. Henter dagens/morgendagens utsjekkinger fra Lodgify.
2. Finner ut om noen sjekker inn samme dag (og hvor mange gjester).
3. Viser dette i et enkelt dashbord som rengjørere kan sjekke på mobilen.
4. Sender automatisk SMS og/eller e-post til rengjøreren som er satt opp for hver leilighet.

## Hvorfor en egen backend (og ikke bare en nettside)?

Lodgify sitt API krever en hemmelig API-nøkkel i hver forespørsel, og tillater ikke
kall direkte fra en nettleser (ingen CORS-støtte for dette). Nøkkelen må derfor ligge
trygt på en server – aldri i kode som kjører i brukerens nettleser. Denne appen er
derfor bygget som en liten Node.js-server som:
- prater med Lodgify på vegne av deg,
- serverer et enkelt dashbord (`public/index.html`) som prater med *din egen* server (ikke Lodgify direkte),
- kjører en daglig, tidsstyrt jobb som sender varsler.

## 1. Oppsett

```bash
npm install
cp .env.example .env
```

Åpne `.env` og fyll inn:

- `LODGIFY_API_KEY` – finnes i Lodgify under **Innstillinger → Public API**.
- `DASHBOARD_PASSWORD` – enkelt passord rengjørerne taster inn for å åpne siden.
- (Valgfritt) Twilio-nøkler for SMS, og/eller Resend-nøkkel for e-post. La stå tomt for å skru av den kanalen.

Rediger `data/cleaners.json` og legg inn:
- `propertyId` – ID-en Lodgify bruker for hver leilighet (finnes i Lodgify-dashbordet, eller ved å kalle `GET /v2/properties` med din API-nøkkel).
- Navn, telefon og e-post til rengjøreren som er ansvarlig for den leiligheten.

## 2. Kjør lokalt

```bash
npm start
```

Åpne `http://localhost:3000` i nettleseren – dette er dashbordet rengjørerne vil bruke.

Vil du teste varslingen manuelt uten å vente på klokkeslettet i cron-jobben:

```bash
npm run check-now
```

## 3. Automatisk daglig varsling

Serveren planlegger selv en daglig sjekk basert på `NOTIFY_CRON` i `.env`
(standard kl 09:00 norsk tid). Så lenge serveren kjører kontinuerlig, sendes
SMS/e-post automatisk – ingen ekstra oppsett nødvendig.

## 4. Sette den i produksjon

Denne typen liten Node-server passer godt på f.eks. **Railway**, **Render** eller
en billig VPS. Kort oppskrift (Render/Railway-stil):

1. Push koden til et git-repo (GitHub/GitLab).
2. Koble repoet til Render/Railway, velg "Web Service" / Node.
3. Legg inn de samme miljøvariablene som i `.env` under prosjektets "Environment"-innstillinger.
4. Start-kommando: `npm start`.
5. Del lenken til dashbordet (f.eks. `https://dittprosjekt.onrender.com`) med rengjørerne, sammen med passordet.

Siden serveren kjører kontinuerlig i skyen (i motsetning til lokalt på din PC), vil
den daglige varslingsjobben også kjøre pålitelig uten at noen trenger å ha
maskinen på.

## 5. Viktig å sjekke selv

Lodgifys API har justert enkelte parameternavn over tid. Denne koden er bygget
etter dagens offisielle dokumentasjon (`https://docs.lodgify.com/reference/getallasync`),
men siden jeg ikke kan teste mot din faktiske konto:

- Kjør `npm run check-now` og se i terminalen at riktig antall leiligheter og
  gjestetall kommer ut. Hvis feltnavn ikke stemmer (f.eks. gjestetall vises som 0),
  se i `src/cleaning.js`-funksjonen `guestCount()` og juster mot det faktiske
  JSON-svaret (logg `console.log(JSON.stringify(booking, null, 2))` midlertidig
  i `src/lodgify.js` for å se nøyaktig hvordan Lodgify svarer for din konto).
- Verifiser `propertyId`-verdiene i `data/cleaners.json` mot ID-ene Lodgify faktisk bruker.

## Filstruktur

```
lodgify-rengjoring/
├── server.js              # Express-server, API-endepunkter, cron-jobb
├── src/
│   ├── lodgify.js          # Alt kall mot Lodgify sitt API
│   ├── cleaning.js         # Bygger dagens rengjøringsliste
│   ├── notify.js           # SMS (Twilio) og e-post (Resend)
│   ├── cleaners.js         # Leser hvem som rengjør hvilken leilighet
│   ├── storage.js          # Lagrer "rengjort"-status i en JSON-fil
│   └── runCleaningCheck.js # Kjør varsling manuelt: npm run check-now
├── public/index.html       # Dashbordet rengjørerne åpner på mobilen
├── data/
│   ├── cleaners.json        # Hvem rengjør hvilken leilighet
│   └── status.json          # (opprettes automatisk) rengjort-status
└── .env.example
```
