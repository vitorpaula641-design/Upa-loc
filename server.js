const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const TTL_MINUTES = Number(process.env.LOCATION_TTL_MINUTES || 60);
const TTL_MS = TTL_MINUTES * 600 * 10000;

const db = new Database(process.env.DB_PATH || path.join(__dirname, "locations.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS stats (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS locations (
    name TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )
`);

app.use(express.json({ limit: "20kb" }));
app.get("/", (req,res,next) => { incrementStat("site_accesses"); res.sendFile(path.join(__dirname,"public","index.html")); });
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/stats", (req,res) => res.json(getStats()));


function incrementStat(key) {
  db.prepare(`INSERT INTO stats (key,value) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET value=value+1`).run(key);
}
function getStats() {
  const rows = db.prepare("SELECT key,value FROM stats").all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function hashPassword(password) {
  // SHA-256 via Web Crypto is not available synchronously in all Node versions;
  // use Node's built-in crypto here.
  return require("crypto").createHash("sha256").update(password).digest("hex");
}

function cleanExpired() {
  db.prepare("DELETE FROM locations WHERE expires_at <= ?").run(Date.now());
}
setInterval(cleanExpired, 60_000).unref();

app.post("/api/location", (req, res) => {
  cleanExpired();
  const { name, password, latitude, longitude, accuracy } = req.body || {};

  if (typeof name !== "string" || !/^[A-Za-z0-9_-]{3,40}$/.test(name)) {
    return res.status(400).json({ error: "Nome inválido. Use 3–40 caracteres: letras, números, _ ou -." });
  }
  if (typeof password !== "string" || password.length < 6 || password.length > 100) {
    return res.status(400).json({ error: "A senha precisa ter entre 6 e 100 caracteres." });
  }
  if (![latitude, longitude].every(Number.isFinite) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: "Coordenadas inválidas." });
  }

  const now = Date.now();
  const expires = now + TTL_MS;
  const passwordHash = hashPassword(password);

  const existing = db.prepare("SELECT password_hash FROM locations WHERE name = ?").get(name);
  if (existing && existing.password_hash !== passwordHash) {
    return res.status(409).json({ error: "Esse nome já está em uso. Escolha outro ou use a senha correta." });
  }

  db.prepare(`
    INSERT INTO locations (name,password_hash,latitude,longitude,accuracy,updated_at,expires_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(name) DO UPDATE SET
      latitude=excluded.latitude,
      longitude=excluded.longitude,
      accuracy=excluded.accuracy,
      updated_at=excluded.updated_at,
      expires_at=excluded.expires_at
  `).run(name, passwordHash, latitude, longitude, Number.isFinite(accuracy) ? accuracy : null, now, expires);

  incrementStat("location_shares");
  res.json({ ok: true, expiresAt: expires, ttlMinutes: TTL_MINUTES });
});

app.post("/api/locate", (req, res) => {
  cleanExpired();
  const { name, password } = req.body || {};
  if (typeof name !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Informe nome e senha." });
  }

  const row = db.prepare("SELECT * FROM locations WHERE name = ?").get(name);
  if (!row || row.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: "Nome ou senha incorretos, ou localização expirada." });
  }

  incrementStat("location_queries");
  res.json({
    ok: true,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at
  });
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
