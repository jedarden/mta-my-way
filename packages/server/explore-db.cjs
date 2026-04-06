const Database = require("better-sqlite3");
const db = new Database("data/subscriptions.db");

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables:", JSON.stringify(tables, null, 2));

tables.forEach(t => {
  const info = db.prepare(`PRAGMA table_info(${t.name})`).all();
  console.log(`Table ${t.name}:`, JSON.stringify(info, null, 2));
});

db.close();
