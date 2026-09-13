const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const TTL_MINUTES = Number(process.env.LOCATION_TTL_MINUTES || 60);
const TTL_MS = TTL_MINUTES * 60 * 1000;

const db = new Database(process.env.DB_PATH || path.join(__dirname, "locations.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    name TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS locations (
    name TEXT PRIMARY KEY,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(name) REFERENCES users(name)
  )
`);;

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

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
  if (typeof name !== "string" || !/^[A-Za-z0-9_-]{3,40}$/.test(name))
    return res.status(400).json({ error: "Nome inválido. Use 3–40 caracteres: letras, números, _ ou -." });
  if (typeof password !== "string" || password.length < 6 || password.length > 100)
    return res.status(400).json({ error: "A senha precisa ter entre 6 e 100 caracteres." });
  if (![latitude, longitude].every(Number.isFinite) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
    return res.status(400).json({ error: "Coordenadas inválidas." });
  const now = Date.now(), expires = now + TTL_MS, passwordHash = hashPassword(password);
  const existing = db.prepare("SELECT password_hash FROM users WHERE name = ?").get(name);
  if (!existing) {
    db.prepare("INSERT INTO users (name,password_hash,created_at) VALUES (?,?,?)").run(name,passwordHash,now);
  } else if (existing.password_hash !== passwordHash) {
    return res.status(409).json({ error: "Esse nome já existe. Use a senha da sua conta." });
  }
  db.prepare(`INSERT INTO locations (name,latitude,longitude,accuracy,updated_at,expires_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET latitude=excluded.latitude,
    longitude=excluded.longitude, accuracy=excluded.accuracy, updated_at=excluded.updated_at,
    expires_at=excluded.expires_at`).run(name,latitude,longitude,Number.isFinite(accuracy)?accuracy:null,now,expires);
  res.json({ ok:true, expiresAt:expires, ttlMinutes:TTL_MINUTES });
});

app.post("/api/locate", (req, res) => {
  cleanExpired();
  const { name, password } = req.body || {};
  if (typeof name !== "string" || typeof password !== "string")
    return res.status(400).json({ error: "Informe nome e senha." });
  const user = db.prepare("SELECT password_hash FROM users WHERE name = ?").get(name);
  if (!user || user.password_hash !== hashPassword(password))
    return res.status(401).json({ error: "Nome ou senha incorretos." });
  const row = db.prepare("SELECT * FROM locations WHERE name = ?").get(name);
  if (!row) return res.status(404).json({ error: "A conta existe, mas não há uma localização compartilhada válida no momento." });
  res.json({ok:true,latitude:row.latitude,longitude:row.longitude,accuracy:row.accuracy,updatedAt:row.updated_at,expiresAt:row.expires_at});
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
