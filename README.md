# Calcolatore Prospetti — Quick start

This README contains a minimal set of commands to run the project locally (backend + frontend), check the current commit/version, push changes and wait for the Render deployment to become healthy. It's designed so you can copy & paste the commands in your macOS (zsh) terminal.

Prerequisites
- Node.js (ideally v22.x as declared in package.json, but v23 works locally)
- npm
- Git

Quick guide

1) Install dependencies (root will also install backend deps)

```bash
npm install
```

2) Start the backend locally (auto-selects a free port between 3002..3010 and opens the frontend)

```bash
npm run start:local
# The script prints the chosen port, backend PID, and opens index.html pointing at the chosen API.
```

3) Check backend health, version and configured project links

Replace PORT with the port printed by the previous command (or use your Render URL):

```bash
# Check local
npm run version:check http://localhost:PORT

# Check remote (example)
npm run version:check https://calcolatore-prospetti.onrender.com
```

The `/_version` endpoint returns the commit SHA and node runtime. The `/_links` endpoint returns the short-links config (see `backend/config/links.json`).

4) Working on the code and pushing to Render

Make changes, commit & push as usual. There's a helper script which commits (if any changes) and pushes, then polls Render `/_health` until the site becomes healthy:

```bash
# Example usage
npm run deploy:push "My changes and deploy"

# If you prefer to push manually:
git add -A
git commit -m "My changes"
git push origin main

# Then poll the live health endpoint yourself
curl -s -o /dev/null -w "%{http_code}" https://calcolatore-prospetti.onrender.com/_health
```

Utility commands (debug)

List all prospects in the connected database:

```bash
cd backend
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.prospect.findMany({ include: { property: true } })
  .then(rows => {
    console.log('Prospects:', rows.length);
    console.log(rows.map(r => r.slug));
  })
  .catch(err => {
    console.error('Error', err);
  })
  .finally(() => prisma.$disconnect());
NODE
```

Check the live API for saved prospects:

```bash
curl -s https://calcolatore-prospetti.onrender.com/api/prospetti | jq
```

Remove a temporary test prospect from the live API (replace the slug if needed):

```bash
curl -s -X DELETE https://calcolatore-prospetti.onrender.com/api/prospetti/test-salvataggio | jq
```

Notes about Render and automatic commit detection
- During deploy the project runs `postinstall` which writes the current commit SHA into `backend/config/commit.json`. That makes `/_version` show the deployed commit automatically (no manual env changes needed).
- Ensure the Render service has `DATABASE_URL` set in its environment settings. If the DB is missing, Prisma will log errors on startup.
- Recommended Render settings:
  - Start command: `npm start` (this runs `node backend/app.js` in production)
  - Health check path: `/_health`
  - Enable Auto Deploy from GitHub (so every push triggers a deploy)
- Audit log events sono ora persistiti nella tabella `AuditLog` del database e sono leggibili via `GET /api/audit/logs?limit=200`.
- Quando deployi una nuova versione assicurati di eseguire `npm run migrate:deploy` (o lascia che Render lo faccia in fase di build) per creare la tabella `AuditLog` e le altre migrazioni Prisma.

Short links and redirects
- The short links are stored in `backend/config/links.json`. Example key: `calcolatore-prospetti` maps to your Render URL.
- You can open the short redirect locally or in production:

```
# Local: replace PORT
curl -v -L http://localhost:PORT/r/calcolatore-prospetti

# Production:
https://calcolatore-prospetti.onrender.com/r/calcolatore-prospetti
```

Add new links
- Edit `backend/config/links.json` and add entries of the form:

```json
"my-project": {
  "render": "https://my-project.onrender.com",
  "github": "https://github.com/owner-value/my-project",
  "project_page": "",
  "notes": "..."
}
```

Optionally I can implement a `POST /_links` API to add links programmatically.

5) Backup del database (properties + prospetti)

Esegui uno snapshot in JSON del database connesso (rispetta la variabile `DATABASE_URL`):

```bash
npm run backup
# oppure: npm run backup -- --stdout > backup.json   # stampa su stdout
```

Il comando crea un file `backend/storage/backups/backup-YYYYMMDD-HHMMSS.json` con l'elenco completo di proprietà e prospetti. Puoi cambiare cartella o nome file usando:

```bash
npm run backup -- --dir ./backups-personali
npm run backup -- --file ./backups/personale.json
```

Per ripristinare i dati puoi importare manualmente il JSON (scrivendo uno script inverso) oppure salvare i record via interfaccia.

Ripristino da backup (restore)

Carica nuovamente un file creato con `npm run backup`:

```bash
npm run restore -- --file backend/storage/backups/backup-YYYYMMDD-HHMMSS.json

# Opzioni utili
#   --dry-run    mostra cosa verrebbe ripristinato senza toccare il database
#   --truncate   cancella tutte le proprietà/prospetti prima di ripristinare (richiede conferma)
#   --force      salta la richiesta di conferma insieme a --truncate
```

Lo script esegue upsert: aggiorna i record esistenti con lo stesso slug oppure li crea se mancanti. I prospetti vengono ricollegati alla proprietà indicata nel backup (in caso di slug mancante, restano scollegati).

Troubleshooting
- If `curl http://localhost:3001/_health` returns 404, another process is likely occupying port 3001. Use `npm run start:local` instead or free the port:

```bash
lsof -iTCP:3001 -sTCP:LISTEN -Pn
# if the process is safe to stop
kill <PID>
```

- If the deployed Render service returns 404 for `/_version` or `/_links` after a push, wait a couple minutes for Render to finish the deploy, then re-run the `version:check` command.

If you want, I can now:
- Add an API to edit `links.json` (POST `/_links`) so you don't edit files manually.
- Create a tiny admin UI to view/add links and show the deployed commit SHA.

Done — minimal goal
- With this README you should be able to run local dev, check the local and remote version, push and confirm Render shows the new commit. If you want any of the optional automations above, tell me which and I'll implement it next.

---
Last edited: 2025-10-29
