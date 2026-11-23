require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const helmet = require("helmet");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const db = require("./src/db");
const { createPaymobPayment, verifyPaymobHmac } = require("./src/paymob");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: dataDir }),
  secret: process.env.SESSION_SECRET || "development-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(express.static(path.join(__dirname, "public")));

function adminOnly(req, res, next) {
  if (req.session.admin) return next();
  return res.status(401).json({ error: "يلزم تسجيل دخول المدير." });
}
function clean(v, max=500) { return String(v ?? "").trim().slice(0, max); }

app.get("/api/site", (req, res) => {
  const services = db.prepare("SELECT * FROM services WHERE active=1 ORDER BY sort_order,id").all();
  const videos = db.prepare("SELECT * FROM videos WHERE active=1 ORDER BY id DESC").all();
  const packages = db.prepare("SELECT * FROM packages WHERE active=1 ORDER BY price").all();
  res.json({ services, videos, packages, whatsapp: process.env.OWNER_WHATSAPP || "201099183732" });
});

app.post("/api/orders", (req, res) => {
  const name = clean(req.body.name, 100), phone = clean(req.body.phone, 30);
  const service = clean(req.body.service, 100), details = clean(req.body.details, 2000);
  const packageId = Number(req.body.packageId) || null;
  if (!name || !phone || !service) return res.status(400).json({ error: "اكتب الاسم ورقم الهاتف واختر الخدمة." });
  const pkg = packageId ? db.prepare("SELECT * FROM packages WHERE id=? AND active=1").get(packageId) : null;
  const result = db.prepare(`INSERT INTO orders(name,phone,service,details,package_id,amount,status,created_at)
    VALUES(?,?,?,?,?,?,?,datetime('now'))`).run(name, phone, service, details, pkg?.id || null, pkg?.price || 0, "pending");
  res.status(201).json({ ok: true, orderId: result.lastInsertRowid, amount: pkg?.price || 0, message: "تم استلام طلبك. سنتواصل معك لتأكيد التفاصيل." });
});

app.post("/api/payments/create", async (req, res) => {
  const orderId = Number(req.body.orderId);
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
  if (!order) return res.status(404).json({ error: "الطلب غير موجود." });
  if (!process.env.PAYMOB_API_KEY || !process.env.PAYMOB_INTEGRATION_ID || !process.env.PAYMOB_IFRAME_ID) {
    return res.status(503).json({ error: "الدفع الإلكتروني غير مفعّل بعد. يلزم إعداد حساب Paymob ومفاتيح التاجر." });
  }
  try {
    const payment = await createPaymobPayment(order);
    db.prepare("UPDATE orders SET payment_ref=?,status='payment_pending' WHERE id=?").run(String(payment.orderId), orderId);
    res.json({ checkoutUrl: payment.checkoutUrl });
  } catch (e) {
    console.error("Paymob create error:", e.message);
    res.status(502).json({ error: "تعذر إنشاء جلسة الدفع حالياً." });
  }
});

// Paymob transaction callback. HMAC must be configured before accepting payments.
app.post("/api/payments/paymob/webhook", (req, res) => {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (!secret || !verifyPaymobHmac(req.body, secret)) return res.status(403).send("Invalid HMAC");
  const txn = req.body.obj || {};
  const merchantOrderId = String(txn.order?.merchant_order_id || "");
  const orderId = Number(merchantOrderId.replace("WAEL-", ""));
  if (!orderId) return res.status(400).send("Missing order");
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
  if (!order) return res.status(404).send("Unknown order");
  const paid = txn.success === true && txn.pending === false && txn.is_voided !== true && txn.is_refunded !== true;
  if (paid) db.prepare("UPDATE orders SET status='paid',payment_ref=? WHERE id=?").run(String(txn.id || ""), orderId);
  else if (txn.pending === false) db.prepare("UPDATE orders SET status='payment_failed' WHERE id=?").run(orderId);
  res.send("OK");
});

app.post("/api/admin/login", async (req, res) => {
  const username = clean(req.body.username, 80), password = String(req.body.password || "");
  const configuredUser = process.env.ADMIN_USERNAME || "admin";
  const configuredPass = process.env.ADMIN_PASSWORD || "change-this-immediately";
  if (username !== configuredUser || !(await bcrypt.compare(password, await bcrypt.hash(configuredPass, 10)))) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة." });
  }
  req.session.admin = true;
  res.json({ ok: true });
});
app.post("/api/admin/logout", adminOnly, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/admin/me", (req, res) => res.json({ authenticated: !!req.session.admin }));
app.get("/api/admin/orders", adminOnly, (req, res) => {
  res.json(db.prepare(`SELECT orders.*, packages.name AS package_name FROM orders
    LEFT JOIN packages ON packages.id=orders.package_id ORDER BY orders.id DESC`).all());
});
app.patch("/api/admin/orders/:id", adminOnly, (req, res) => {
  const allowed = ["pending", "contacted", "in_progress", "completed", "cancelled"];
  const status = clean(req.body.status, 30);
  if (!allowed.includes(status)) return res.status(400).json({ error: "حالة غير صالحة." });
  db.prepare("UPDATE orders SET status=? WHERE id=?").run(status, Number(req.params.id));
  res.json({ ok: true });
});
app.get("/api/admin/content", adminOnly, (req, res) => res.json({
  services: db.prepare("SELECT * FROM services ORDER BY sort_order,id").all(),
  videos: db.prepare("SELECT * FROM videos ORDER BY id DESC").all(),
  packages: db.prepare("SELECT * FROM packages ORDER BY id DESC").all()
}));
app.post("/api/admin/content/:kind", adminOnly, (req, res) => {
  const kind = req.params.kind;
  const title = clean(req.body.title, 120), description = clean(req.body.description, 1000);
  if (!title) return res.status(400).json({ error: "العنوان مطلوب." });
  if (kind === "services") {
    db.prepare("INSERT INTO services(title,description,active,sort_order) VALUES(?,?,1,100)").run(title, description);
  } else if (kind === "videos") {
    db.prepare("INSERT INTO videos(title,description,video_url,thumbnail_url,active) VALUES(?,?,?,?,1)")
      .run(title, description, clean(req.body.video_url, 500), clean(req.body.thumbnail_url, 500));
  } else if (kind === "packages") {
    const price = Math.max(0, Number(req.body.price) || 0);
    db.prepare("INSERT INTO packages(name,description,price,active) VALUES(?,?,?,1)").run(title, description, price);
  } else return res.status(404).json({ error: "نوع غير معروف." });
  res.json({ ok: true });
});
app.delete("/api/admin/content/:kind/:id", adminOnly, (req, res) => {
  const tables = { services: "services", videos: "videos", packages: "packages" };
  const table = tables[req.params.kind];
  if (!table) return res.status(404).json({ error: "غير موجود." });
  db.prepare(`UPDATE ${table} SET active=0 WHERE id=?`).run(Number(req.params.id));
  res.json({ ok: true });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`WAEL ADS running at http://localhost:${PORT}`));
