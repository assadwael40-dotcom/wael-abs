const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "data");
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, "wael-ads.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 100);
CREATE TABLE IF NOT EXISTS videos(id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, video_url TEXT, thumbnail_url TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS packages(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, price INTEGER NOT NULL DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, service TEXT NOT NULL, details TEXT, package_id INTEGER, amount INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', payment_ref TEXT, created_at TEXT);
`);
if (db.prepare("SELECT COUNT(*) n FROM services").get().n === 0) {
  const s = db.prepare("INSERT INTO services(title,description,sort_order) VALUES(?,?,?)");
  [
    ["إعلانات الفيديو", "فيديوهات إعلانية جذابة لعرض المنتجات والخدمات.", 1],
    ["إعلانات المنتجات", "تصميم إعلان احترافي يبرز مميزات منتجك.", 2],
    ["إعلانات السوشيال ميديا", "محتوى بصري مناسب لمنصات التواصل.", 3],
    ["إعلانات الشركات", "هوية إعلانية وعروض تعريفية للمشروعات.", 4],
    ["مونتاج وتصميم", "مونتاج فيديوهات وتصميم مواد تسويقية.", 5]
  ].forEach(x => s.run(...x));
  const p = db.prepare("INSERT INTO packages(name,description,price) VALUES(?,?,?)");
  [
    ["البداية", "إعلان بسيط مناسب للتجربة. السعر قابل للتعديل.", 500],
    ["الاحترافية", "إعلان متكامل مع تعديلات أساسية.", 1000],
    ["المميزة", "حل إعلاني مخصص للمشروعات والعلامات التجارية.", 2000]
  ].forEach(x => p.run(...x));
}
module.exports = db;
