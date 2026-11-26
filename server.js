const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DB_DIR = path.join(ROOT, "data");
const BACKUP_DIR = path.join(ROOT, "backups");
fs.mkdirSync(DB_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, "rbc.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, phone TEXT DEFAULT '', address TEXT DEFAULT '',
  note TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, code TEXT DEFAULT '', category_id INTEGER,
  unit TEXT DEFAULT 'عدد', purchase_price REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0, stock REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE, customer_id INTEGER NOT NULL,
  date TEXT NOT NULL, subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0, note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL, product_id INTEGER,
  product_name TEXT NOT NULL, qty REAL NOT NULL,
  unit TEXT DEFAULT 'عدد', price REAL NOT NULL,
  line_total REAL NOT NULL,
  FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL, invoice_id INTEGER,
  amount REAL NOT NULL CHECK(amount > 0), date TEXT NOT NULL,
  note TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
`);

const defaults = {
  company_name: "RBC Company",
  company_phone: "",
  company_address: "",
  currency: "AFN",
  invoice_prefix: "RBC-2026-",
  next_invoice_number: "1"
};
const putSetting = db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)");
for (const [k,v] of Object.entries(defaults)) putSetting.run(k, String(v));

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(ROOT, "public")));

function settingsObject() {
  return Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x => [x.key,x.value]));
}
function customerBalance(customerId) {
  const sales = db.prepare("SELECT COALESCE(SUM(total),0) n FROM invoices WHERE customer_id=?").get(customerId).n;
  const payments = db.prepare("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE customer_id=?").get(customerId).n;
  return { sales, payments, debt: sales - payments };
}
function backupNow() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(BACKUP_DIR, `rbc-${stamp}.sqlite`);
  return db.backup(dest).then(() => {
    const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".sqlite"))
      .map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR,f)).mtimeMs }))
      .sort((a,b) => b.t-a.t);
    backups.slice(14).forEach(x => fs.unlinkSync(path.join(BACKUP_DIR,x.f)));
    return dest;
  });
}
function autoBackup() {
  const marker = path.join(BACKUP_DIR, "last-auto-backup.txt");
  let last = 0;
  try { last = Number(fs.readFileSync(marker, "utf8")) || 0; } catch {}
  if (Date.now() - last >= 24*60*60*1000) {
    backupNow().then(() => fs.writeFileSync(marker, String(Date.now())))
      .catch(err => console.error("Automatic backup failed:", err.message));
  }
}
autoBackup();
setInterval(autoBackup, 60*60*1000).unref();

app.get("/api/status", (req,res) => res.json({ ok:true, settings:settingsObject() }));
app.get("/api/dashboard", (req,res) => {
  const sales = db.prepare("SELECT COALESCE(SUM(total),0) n FROM invoices").get().n;
  const paid = db.prepare("SELECT COALESCE(SUM(amount),0) n FROM payments").get().n;
  const customers = db.prepare("SELECT COUNT(*) n FROM customers").get().n;
  const invoices = db.prepare("SELECT COUNT(*) n FROM invoices").get().n;
  res.json({sales,paid,debt:sales-paid,customers,invoices});
});

app.get("/api/customers", (req,res) => {
  const rows = db.prepare("SELECT * FROM customers ORDER BY name COLLATE NOCASE").all();
  res.json(rows.map(c => ({...c,...customerBalance(c.id)})));
});
app.post("/api/customers", (req,res) => {
  const {name,phone="",address="",note=""} = req.body;
  if (!String(name||"").trim()) return res.status(400).json({error:"نام مشتری الزامی است."});
  const r = db.prepare("INSERT INTO customers(name,phone,address,note) VALUES(?,?,?,?)")
    .run(String(name).trim(),phone,address,note);
  res.json({id:r.lastInsertRowid});
});
app.put("/api/customers/:id", (req,res) => {
  const {name,phone="",address="",note=""} = req.body;
  if (!String(name||"").trim()) return res.status(400).json({error:"نام مشتری الزامی است."});
  db.prepare("UPDATE customers SET name=?,phone=?,address=?,note=? WHERE id=?")
    .run(String(name).trim(),phone,address,note,req.params.id);
  res.json({ok:true});
});
app.get("/api/customers/:id/statement", (req,res) => {
  const id = Number(req.params.id);
  const customer = db.prepare("SELECT * FROM customers WHERE id=?").get(id);
  if (!customer) return res.status(404).json({error:"مشتری پیدا نشد."});
  const invoices = db.prepare("SELECT id,invoice_no,date,total,paid,note FROM invoices WHERE customer_id=? ORDER BY date DESC,id DESC").all(id);
  const payments = db.prepare("SELECT id,amount,date,note,invoice_id FROM payments WHERE customer_id=? ORDER BY date DESC,id DESC").all(id);
  res.json({customer,...customerBalance(id),invoices,payments});
});

app.get("/api/categories", (req,res) => res.json(db.prepare("SELECT * FROM categories ORDER BY name").all()));
app.post("/api/categories", (req,res) => {
  const name = String(req.body.name||"").trim();
  if (!name) return res.status(400).json({error:"نام دسته الزامی است."});
  try { const r=db.prepare("INSERT INTO categories(name) VALUES(?)").run(name); res.json({id:r.lastInsertRowid}); }
  catch { res.status(409).json({error:"این دسته قبلاً ثبت شده است."}); }
});
app.get("/api/products", (req,res) => res.json(db.prepare(`
 SELECT p.*,c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.name
`).all()));
app.post("/api/products", (req,res) => {
  const p=req.body;
  if (!String(p.name||"").trim()) return res.status(400).json({error:"نام جنس الزامی است."});
  const r=db.prepare(`INSERT INTO products(name,code,category_id,unit,purchase_price,sale_price,stock)
    VALUES(?,?,?,?,?,?,?)`).run(p.name,p.code||"",p.category_id||null,p.unit||"عدد",Number(p.purchase_price)||0,Number(p.sale_price)||0,Number(p.stock)||0);
  res.json({id:r.lastInsertRowid});
});
app.put("/api/products/:id", (req,res) => {
  const p=req.body;
  db.prepare(`UPDATE products SET name=?,code=?,category_id=?,unit=?,purchase_price=?,sale_price=?,stock=? WHERE id=?`)
    .run(p.name,p.code||"",p.category_id||null,p.unit||"عدد",Number(p.purchase_price)||0,Number(p.sale_price)||0,Number(p.stock)||0,req.params.id);
  res.json({ok:true});
});

app.get("/api/invoices", (req,res) => res.json(db.prepare(`
 SELECT i.*,c.name customer_name,c.phone customer_phone,
 (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.invoice_id=i.id) invoice_payments
 FROM invoices i JOIN customers c ON c.id=i.customer_id ORDER BY i.id DESC
`).all()));
app.get("/api/invoices/:id", (req,res) => {
  const invoice=db.prepare(`SELECT i.*,c.name customer_name,c.phone customer_phone,c.address customer_address
    FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.id=?`).get(req.params.id);
  if (!invoice) return res.status(404).json({error:"فاکتور پیدا نشد."});
  const items=db.prepare("SELECT * FROM invoice_items WHERE invoice_id=?").all(req.params.id);
  const payments=db.prepare("SELECT * FROM payments WHERE invoice_id=? ORDER BY date,id").all(req.params.id);
  res.json({invoice,items,payments,settings:settingsObject()});
});
app.post("/api/invoices", (req,res) => {
  const p=req.body;
  if (!p.customer_id || !Array.isArray(p.items) || !p.items.length) return res.status(400).json({error:"مشتری و حداقل یک جنس را انتخاب کنید."});
  const create = db.transaction(() => {
    const s=settingsObject();
    const seq=String(Number(s.next_invoice_number)||1).padStart(4,"0");
    const invoiceNo=(s.invoice_prefix||"RBC-")+seq;
    const items=p.items.map(x => {
      const product=x.product_id ? db.prepare("SELECT * FROM products WHERE id=?").get(x.product_id) : null;
      const name=product ? product.name : String(x.product_name||"جنس");
      const unit=product ? product.unit : (x.unit||"عدد");
      const qty=Number(x.qty), price=Number(x.price);
      if (!(qty>0) || price<0) throw new Error("تعداد یا قیمت جنس نادرست است.");
      return {product_id:product?.id||null,name,unit,qty,price,line_total:qty*price};
    });
    const subtotal=items.reduce((a,x)=>a+x.line_total,0);
    const discount=Math.max(0,Number(p.discount)||0);
    if (discount>subtotal) throw new Error("تخفیف نمی‌تواند بیشتر از مجموع خرید باشد.");
    const total=subtotal-discount;
    const paid=Math.max(0,Number(p.paid)||0);
    if (paid>total) throw new Error("مبلغ پرداختی از مبلغ فاکتور بیشتر است؛ اضافه‌پرداخت را جداگانه ثبت کنید.");
    const previousBalance=customerBalance(p.customer_id).debt;
    const r=db.prepare(`INSERT INTO invoices(invoice_no,customer_id,date,subtotal,discount,total,paid,note,previous_balance)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(invoiceNo,p.customer_id,p.date||new Date().toISOString().slice(0,10),subtotal,discount,total,0,p.note||"",previousBalance);
    const insertItem=db.prepare(`INSERT INTO invoice_items(invoice_id,product_id,product_name,qty,unit,price,line_total)
      VALUES(?,?,?,?,?,?,?)`);
    items.forEach(x=>insertItem.run(r.lastInsertRowid,x.product_id,x.name,x.qty,x.unit,x.price,x.line_total));
    if (paid>0) db.prepare("INSERT INTO payments(customer_id,invoice_id,amount,date,note) VALUES(?,?,?,?,?)")
      .run(p.customer_id,r.lastInsertRowid,paid,p.date||new Date().toISOString().slice(0,10),"پرداخت هنگام صدور فاکتور");
    db.prepare("UPDATE settings SET value=? WHERE key='next_invoice_number'").run(String((Number(s.next_invoice_number)||1)+1));
    return {id:r.lastInsertRowid,invoice_no:invoiceNo};
  });
  try { res.json(create()); } catch(e) { res.status(400).json({error:e.message}); }
});
app.post("/api/payments", (req,res) => {
  const p=req.body, amount=Number(p.amount);
  if (!p.customer_id || !(amount>0)) return res.status(400).json({error:"مشتری و مبلغ معتبر لازم است."});
  const c=db.prepare("SELECT id FROM customers WHERE id=?").get(p.customer_id);
  if (!c) return res.status(404).json({error:"مشتری پیدا نشد."});
  const r=db.prepare("INSERT INTO payments(customer_id,invoice_id,amount,date,note) VALUES(?,?,?,?,?)")
    .run(p.customer_id,p.invoice_id||null,amount,p.date||new Date().toISOString().slice(0,10),p.note||"");
  res.json({id:r.lastInsertRowid});
});

app.put("/api/settings", (req,res) => {
  const allowed=["company_name","company_phone","company_address","currency","invoice_prefix","next_invoice_number"];
  const update=db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const tx=db.transaction(()=>allowed.forEach(k=>{if(req.body[k]!==undefined) update.run(k,String(req.body[k]));}));
  tx(); res.json(settingsObject());
});
app.post("/api/backup", async (req,res) => {
  try { const f=await backupNow(); res.json({ok:true,file:path.basename(f)}); }
  catch(e) { res.status(500).json({error:e.message}); }
});
app.get("/api/backups", (req,res) => {
  const list=fs.readdirSync(BACKUP_DIR).filter(f=>f.endsWith(".sqlite"))
    .map(f=>({file:f,size:fs.statSync(path.join(BACKUP_DIR,f)).size,date:fs.statSync(path.join(BACKUP_DIR,f)).mtime}));
  res.json(list.sort((a,b)=>new Date(b.date)-new Date(a.date)));
});
app.get("/api/backup/download/:file", (req,res) => {
  const name=path.basename(req.params.file);
  if (!/^rbc-[\w.-]+\.sqlite$/.test(name)) return res.sendStatus(400);
  const f=path.join(BACKUP_DIR,name);
  if (!fs.existsSync(f)) return res.sendStatus(404);
  res.download(f);
});

app.listen(PORT,"0.0.0.0",()=>console.log(`RBC Company App is running on http://127.0.0.1:${PORT}`));
