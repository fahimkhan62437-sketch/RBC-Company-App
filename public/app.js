const $=id=>document.getElementById(id);
let customers=[],products=[],categories=[],draft=[];
let settings={currency:"AFN"};
const money=n=>new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(Number(n)||0)+" "+(settings.currency||"AFN");
const today=()=>new Date().toISOString().slice(0,10);
async function api(url,opts={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opts});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"خطا در ارتباط با سرور");return d}
function toast(s){$("toast").textContent=s;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",2800)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function page(name){document.querySelectorAll(".page").forEach(x=>x.classList.toggle("active",x.id===name));document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("active",x.dataset.page===name));}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{page(b.dataset.page);refreshPage(b.dataset.page)});
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).classList.add("hidden"));
async function loadAll(){const [s,c,p,cat]=await Promise.all([api("/api/status"),api("/api/customers"),api("/api/products"),api("/api/categories")]);settings=s.settings;customers=c;products=p;categories=cat;$("companyTitle").textContent=settings.company_name||"RBC Company";fillSelects();renderCustomers();renderProducts();renderCategories();renderInvoices();loadDashboard();}
async function loadCustomerInvoices(){
 const id=Number($("payCustomer").value);
 const sel=$("payInvoice");
 if(!sel)return;
 try{
  const rows=await api("/api/invoices");
  const list=rows.filter(i=>Number(i.customer_id)===id);
  sel.innerHTML='<option value="">بدون اتصال به فاکتور</option>'+list.map(i=>'<option value="'+i.id+'">'+esc(i.invoice_no)+' — '+esc(i.date)+' — باقی‌مانده: '+money(Number(i.total)-Number(i.invoice_payments))+'</option>').join("");
 }catch(e){toast(e.message)}
}
function fillSelects(){
 $("iCustomer").innerHTML=customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
 $("payCustomer").innerHTML=customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
 $("payCustomer").onchange=loadCustomerInvoices;loadCustomerInvoices();
 $("pCategory").innerHTML='<option value="">بدون دسته</option>'+categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
 $("iProduct").innerHTML=products.map(p=>`<option value="${p.id}">${esc(p.name)} — ${money(p.sale_price)}</option>`).join("");
}
async function loadDashboard(){const d=await api("/api/dashboard");$("stats").innerHTML=[["مجموع فروش",money(d.sales)],["دریافتی",money(d.paid)],["قرض باقی‌مانده",money(d.debt)],["مشتریان",d.customers],["فاکتورها",d.invoices]].map(x=>`<div class="card"><small>${x[0]}</small><b>${x[1]}</b></div>`).join("")}
function renderCustomers(){const q=($("customerSearch").value||"").toLowerCase();const list=customers.filter(c=>(c.name+" "+c.phone).toLowerCase().includes(q));$("customerList").innerHTML=list.map(c=>`<div class="row"><div><b>${esc(c.name)}</b><div class="muted">${esc(c.phone||"بدون شماره")}</div><div class="muted">خرید: ${money(c.sales)} | پرداخت: ${money(c.payments)} | قرض: <b>${money(c.debt)}</b></div></div><div class="actions"><button class="secondary" onclick="showStatement(${c.id})">حساب</button><button class="secondary" onclick="editCustomer(${c.id})">ویرایش</button></div></div>`).join("")||'<p class="muted">هنوز مشتری ثبت نشده است.</p>'}
$("customerSearch").oninput=renderCustomers;
$("newCustomer").onclick=()=>{["customerId","cName","cPhone","cAddress","cNote"].forEach(x=>$(x).value="");$("customerForm").classList.remove("hidden")};
window.editCustomer=id=>{const c=customers.find(x=>x.id===id);$("customerId").value=id;$("cName").value=c.name;$("cPhone").value=c.phone;$("cAddress").value=c.address;$("cNote").value=c.note;$("customerForm").classList.remove("hidden")};
$("saveCustomer").onclick=async()=>{try{const id=$("customerId").value,p={name:$("cName").value,phone:$("cPhone").value,address:$("cAddress").value,note:$("cNote").value};await api(id?"/api/customers/"+id:"/api/customers",{method:id?"PUT":"POST",body:JSON.stringify(p)});$("customerForm").classList.add("hidden");await loadAll();toast("مشتری ذخیره شد.")}catch(e){toast(e.message)}};
window.showStatement=async id=>{try{const d=await api("/api/customers/"+id+"/statement");const el=$("statement");el.classList.remove("hidden");el.innerHTML=`<h3>حساب مشتری: ${esc(d.customer.name)}</h3><div class="statementgrid"><div>مجموع خرید<b>${money(d.sales)}</b></div><div>مجموع پرداخت<b>${money(d.payments)}</b></div><div>قرض باقی‌مانده<b>${money(d.debt)}</b></div></div><h3>فاکتورها</h3>${d.invoices.map(i=>`<div class="row"><span>${esc(i.invoice_no)} — ${i.date}</span><b>${money(i.total)}</b></div>`).join("")||'<p class="muted">فاکتوری ثبت نشده.</p>'}<h3>پرداخت‌ها</h3>${d.payments.map(p=>`<div class="row"><span>${p.date} — ${esc(p.note||"پرداخت")}</span><b>${money(p.amount)}</b></div>`).join("")||'<p class="muted">پرداختی ثبت نشده.</p>'}`;el.scrollIntoView({behavior:"smooth"})}catch(e){toast(e.message)}};
function renderCategories(){$("categoryList").innerHTML=categories.map(c=>`<span class="chip">${esc(c.name)}</span>`).join("")}
$("addCategory").onclick=async()=>{try{await api("/api/categories",{method:"POST",body:JSON.stringify({name:$("categoryName").value})});$("categoryName").value="";categories=await api("/api/categories");fillSelects();renderCategories();toast("دسته ثبت شد.")}catch(e){toast(e.message)}};
function renderProducts(){$("productList").innerHTML='<div class="tablewrap"><table><thead><tr><th>نام جنس</th><th>دسته</th><th>قیمت فروش</th><th>موجودی</th><th></th></tr></thead><tbody>'+products.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.category_name||"-")}</td><td>${money(p.sale_price)}</td><td>${p.stock} ${esc(p.unit)}</td><td><button class="secondary" onclick="editProduct(${p.id})">ویرایش</button></td></tr>`).join("")+'</tbody></table></div>'}
$("newProduct").onclick=()=>{["productId","pName","pCode","pBuy","pSale","pStock"].forEach(x=>$(x).value="");$("pUnit").value="عدد";$("pCategory").value="";$("productForm").classList.remove("hidden")};
window.editProduct=id=>{const p=products.find(x=>x.id===id);$("productId").value=id;$("pName").value=p.name;$("pCode").value=p.code;$("pBuy").value=p.purchase_price;$("pSale").value=p.sale_price;$("pStock").value=p.stock;$("pUnit").value=p.unit;$("pCategory").value=p.category_id||"";$("productForm").classList.remove("hidden")};
$("saveProduct").onclick=async()=>{try{const id=$("productId").value,p={name:$("pName").value,code:$("pCode").value,category_id:$("pCategory").value||null,unit:$("pUnit").value,purchase_price:$("pBuy").value,sale_price:$("pSale").value,stock:$("pStock").value};await api(id?"/api/products/"+id:"/api/products",{method:id?"PUT":"POST",body:JSON.stringify(p)});$("productForm").classList.add("hidden");await loadAll();toast("جنس ذخیره شد.")}catch(e){toast(e.message)}};
$("newInvoice").onclick=()=>{if(!customers.length)return toast("ابتدا مشتری ثبت کنید.");if(!products.length)return toast("ابتدا جنس ثبت کنید.");draft=[];$("iDate").value=today();$("iDiscount").value=0;$("iPaid").value=0;$("iNote").value="";$("invoiceForm").classList.remove("hidden");renderDraft()};
$("addItem").onclick=()=>{const p=products.find(x=>x.id===Number($("iProduct").value));if(!p)return;const qty=Number($("iQty").value),price=Number($("iPrice").value||p.sale_price);if(!(qty>0)||price<0)return toast("تعداد یا قیمت را بررسی کنید.");draft.push({product_id:p.id,product_name:p.name,unit:p.unit,qty,price});renderDraft();$("iQty").value=1;$("iPrice").value=""};
function renderDraft(){const sub=draft.reduce((a,x)=>a+x.qty*x.price,0);$("draftItems").innerHTML=draft.map((x,i)=>`<div class="row"><span>${esc(x.product_name)} × ${x.qty} ${esc(x.unit)} — ${money(x.price*x.qty)}</span><button class="danger" onclick="removeDraft(${i})">حذف</button></div>`).join("");$("draftTotals").innerHTML=`مجموع اجناس: <b>${money(sub)}</b><br>مبلغ نهایی: <b>${money(Math.max(0,sub-Number($("iDiscount").value||0)))}</b>`}
window.removeDraft=i=>{draft.splice(i,1);renderDraft()};$("iDiscount").oninput=renderDraft;
$("saveInvoice").onclick=async()=>{try{const d=await api("/api/invoices",{method:"POST",body:JSON.stringify({customer_id:Number($("iCustomer").value),date:$("iDate").value,discount:$("iDiscount").value,paid:$("iPaid").value,note:$("iNote").value,items:draft})});$("invoiceForm").classList.add("hidden");await loadAll();toast("فاکتور "+d.invoice_no+" ثبت شد.");await invoiceActions(d.id)}catch(e){toast(e.message)}};
async function renderInvoices(){try{const rows=await api("/api/invoices");$("invoiceList").innerHTML=rows.map(i=>`<div class="row"><div><b>${esc(i.invoice_no)}</b><div class="muted">${esc(i.customer_name)} — ${i.date}</div></div><div><b>${money(i.total)}</b><div class="muted">پرداخت کل: ${money(i.invoice_payments)}</div></div><button class="primary" onclick="invoiceActions(${i.id})">نمایش / تصویر</button></div>`).join("")||'<p class="muted">هنوز فاکتوری ثبت نشده است.</p>'}catch{}}
window.invoiceActions=async id=>{try{const d=await api("/api/invoices/"+id);await makeInvoiceImage(d)}catch(e){toast(e.message)}};
async function makeInvoiceImage(d){
 const i=d.invoice, st=d.settings, currency=st.currency||"AFN";
 const paid=d.payments.reduce((a,p)=>a+Number(p.amount),0), balance=Number(i.total)-paid, previousBalance=Number(i.previous_balance)||0, finalBalance=previousBalance+balance;
 const rows=d.items.map(x=>`<tr><td>${esc(x.product_name)}</td><td>${x.qty} ${esc(x.unit)}</td><td>${fmt(x.price)}</td><td>${fmt(x.line_total)}</td></tr>`).join("");
 const html=`<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="${Math.max(1500,900+d.items.length*85)}" viewBox="0 0 1240 ${Math.max(1500,900+d.items.length*85)}"><rect width="100%" height="100%" fill="#fff"/><rect x="0" y="0" width="1240" height="230" fill="#123f91"/><text x="1160" y="95" text-anchor="end" font-size="56" font-weight="bold" fill="white">${xml(st.company_name||"RBC Company")}</text><text x="1160" y="155" text-anchor="end" font-size="27" fill="#e4edff">${xml(st.company_phone||"")}</text><text x="80" y="95" font-size="32" fill="white">INVOICE</text><text x="80" y="150" font-size="26" fill="white">${xml(i.invoice_no)}</text><text x="1160" y="300" text-anchor="end" font-size="30" fill="#123f91">مشتری: ${xml(i.customer_name)}</text><text x="1160" y="355" text-anchor="end" font-size="26" fill="#334155">تاریخ: ${xml(i.date)}</text><rect x="60" y="410" width="1120" height="70" rx="8" fill="#eaf0fa"/><text x="1100" y="455" text-anchor="end" font-size="25" fill="#123f91">جنس</text><text x="770" y="455" text-anchor="middle" font-size="25" fill="#123f91">تعداد</text><text x="480" y="455" text-anchor="middle" font-size="25" fill="#123f91">قیمت واحد</text><text x="180" y="455" text-anchor="middle" font-size="25" fill="#123f91">مجموع</text>${d.items.map((x,n)=>`<line x1="60" y1="${530+n*78}" x2="1180" y2="${530+n*78}" stroke="#dce4f2"/><text x="1100" y="${578+n*78}" text-anchor="end" font-size="24" fill="#17233a">${xml(x.product_name)}</text><text x="770" y="${578+n*78}" text-anchor="middle" font-size="24" fill="#17233a">${x.qty} ${xml(x.unit)}</text><text x="480" y="${578+n*78}" text-anchor="middle" font-size="24" fill="#17233a">${fmt(x.price)}</text><text x="180" y="${578+n*78}" text-anchor="middle" font-size="24" fill="#17233a">${fmt(x.line_total)}</text>`).join("")}<rect x="620" y="${570+d.items.length*78}" width="560" height="390" rx="12" fill="#f3f6fc"/><text x="1120" y="${630+d.items.length*78}" text-anchor="end" font-size="25" fill="#334155">مجموع: ${fmt(i.subtotal)} ${currency}</text><text x="1120" y="${690+d.items.length*78}" text-anchor="end" font-size="25" fill="#334155">تخفیف: ${fmt(i.discount)} ${currency}</text><text x="1120" y="${730+d.items.length*78}" text-anchor="end" font-size="25" fill="#334155">مانده قبلی: ${fmt(previousBalance)} ${currency}</text><text x="1120" y="${770+d.items.length*78}" text-anchor="end" font-size="30" font-weight="bold" fill="#123f91">قابل پرداخت: ${fmt(i.total)} ${currency}</text><text x="1120" y="${820+d.items.length*78}" text-anchor="end" font-size="25" fill="#334155">پرداخت شده: ${fmt(paid)} ${currency}</text><text x="1120" y="${860+d.items.length*78}" text-anchor="end" font-size="25" fill="#334155">باقی‌مانده فاکتور: ${fmt(balance)} ${currency}</text><text x="1120" y="${910+d.items.length*78}" text-anchor="end" font-size="28" font-weight="bold" fill="#a52626">مانده نهایی حساب: ${fmt(finalBalance)} ${currency}</text><text x="620" y="${1000+d.items.length*78}" text-anchor="middle" font-size="25" fill="#64748b">تشکر از خرید شما</text><text x="620" y="${1050+d.items.length*78}" text-anchor="middle" font-size="22" fill="#64748b">${xml(st.company_address||"")}</text></svg>`;
 const blob=new Blob([html],{type:"image/svg+xml"}), url=URL.createObjectURL(blob), img=new Image();
 img.onload=async()=>{const canvas=document.createElement("canvas");canvas.width=2480;canvas.height=img.height*2;canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);canvas.toBlob(async png=>{const file=new File([png],`${i.invoice_no}.png`,{type:"image/png"});const a=document.createElement("a");a.href=URL.createObjectURL(png);a.download=`${i.invoice_no}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:`فاکتور ${i.invoice_no}`,text:`فاکتور ${i.invoice_no}`})}catch{}}else{toast("تصویر فاکتور ذخیره شد؛ آن را از گالری در واتساپ تجاری ارسال کنید.")}}, "image/png");};
 img.onerror=()=>toast("ساخت تصویر فاکتور ناموفق بود.");img.src=url;
}
function fmt(n){return new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(Number(n)||0)}
function xml(s){return String(s??"").replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]))}
$("savePayment").onclick=async()=>{try{const customerId=Number($("payCustomer").value),amount=Number($("payAmount").value),invoiceId=$("payInvoice").value||null,date=$("payDate").value||today(),note=$("payNote").value;const saved=await api("/api/payments",{method:"POST",body:JSON.stringify({customer_id:customerId,invoice_id:invoiceId,amount,date,note})});$("payAmount").value="";$("payNote").value="";await loadAll();toast("پرداخت ثبت شد؛ رسید در حال ساخت است.");await makePaymentReceipt(saved.id,customerId,amount,invoiceId,date,note)}catch(e){toast(e.message)}};

async function makePaymentReceipt(paymentId,customerId,amount,invoiceId,date,note){
 try{
  const [st,statement]=await Promise.all([
   api("/api/status"),
   api("/api/customers/"+customerId+"/statement")
  ]);
  const company=st.settings;
  const payment=statement.payments.find(x=>Number(x.id)===Number(paymentId));
  const invoice=statement.invoices.find(x=>Number(x.id)===Number(invoiceId));
  const previous=Number(statement.debt)+Number(amount);
  const current=Number(statement.debt);
  const currency=company.currency||"AFN";
  const h=1050;
  const html='<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="'+h+'" viewBox="0 0 1240 '+h+'">'+
  '<rect width="100%" height="100%" fill="#fff"/>'+
  '<rect width="1240" height="230" fill="#123f91"/>'+
  '<text x="1160" y="95" text-anchor="end" font-size="56" font-weight="bold" fill="white">'+xml(company.company_name||"RBC Company")+'</text>'+
  '<text x="1160" y="155" text-anchor="end" font-size="27" fill="#e4edff">'+xml(company.company_phone||"")+'</text>'+
  '<text x="80" y="110" font-size="34" fill="white">PAYMENT RECEIPT</text>'+
  '<text x="1160" y="310" text-anchor="end" font-size="38" font-weight="bold" fill="#123f91">رسید دریافت پول</text>'+
  '<text x="1160" y="390" text-anchor="end" font-size="29" fill="#334155">شماره رسید: '+paymentId+'</text>'+
  '<text x="1160" y="455" text-anchor="end" font-size="29" fill="#334155">نام مشتری: '+xml(statement.customer.name)+'</text>'+
  '<text x="1160" y="520" text-anchor="end" font-size="29" fill="#334155">تاریخ: '+xml(date)+'</text>'+
  '<text x="1160" y="585" text-anchor="end" font-size="29" fill="#334155">فاکتور مربوطه: '+xml(invoice?invoice.invoice_no:"حساب عمومی")+'</text>'+
  '<rect x="60" y="640" width="1120" height="115" rx="14" fill="#eaf0fa"/>'+
  '<text x="1120" y="710" text-anchor="end" font-size="36" font-weight="bold" fill="#123f91">مبلغ دریافتی: '+fmt(amount)+' '+xml(currency)+'</text>'+
  '<text x="1120" y="825" text-anchor="end" font-size="28" fill="#334155">مانده حساب قبل از پرداخت: '+fmt(previous)+' '+xml(currency)+'</text>'+
  '<text x="1120" y="890" text-anchor="end" font-size="32" font-weight="bold" fill="#123f91">مانده حساب جدید: '+fmt(current)+' '+xml(currency)+'</text>'+
  '<text x="1120" y="950" text-anchor="end" font-size="23" fill="#64748b">یادداشت: '+xml(note||"—")+'</text>'+
  '<text x="620" y="1010" text-anchor="middle" font-size="25" fill="#64748b">با تشکر از پرداخت شما</text>'+
  '<text x="620" y="1040" text-anchor="middle" font-size="20" fill="#64748b">'+xml(company.company_address||"")+'</text></svg>';
  const blob=new Blob([html],{type:"image/svg+xml"});
  const url=URL.createObjectURL(blob),img=new Image();
  img.onload=async()=>{
   const canvas=document.createElement("canvas");
   canvas.width=2480;canvas.height=2100;
   canvas.getContext("2d").drawImage(img,0,0,2480,2100);
   URL.revokeObjectURL(url);
   canvas.toBlob(async png=>{
    const file=new File([png],"Receipt-"+paymentId+".png",{type:"image/png"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(png);
    a.download="Receipt-"+paymentId+".png";
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    if(navigator.canShare&&navigator.canShare({files:[file]})){
     try{await navigator.share({files:[file],title:"رسید دریافت پول"})}catch{}
    }else toast("تصویر رسید ذخیره شد.");
   },"image/png");
  };
  img.onerror=()=>toast("ساخت تصویر رسید ناموفق بود.");
  img.src=url;
 }catch(e){toast("پرداخت ثبت شد؛ اما ساخت رسید ناموفق بود: "+e.message)}
}

async function loadSettings(){const s=(await api("/api/status")).settings;$("sCompany").value=s.company_name;$("sPhone").value=s.company_phone;$("sAddress").value=s.company_address;$("sCurrency").value=s.currency;$("sPrefix").value=s.invoice_prefix;$("sNext").value=s.next_invoice_number;await loadBackups()}
$("saveSettings").onclick=async()=>{try{const s=await api("/api/settings",{method:"PUT",body:JSON.stringify({company_name:$("sCompany").value,company_phone:$("sPhone").value,company_address:$("sAddress").value,currency:$("sCurrency").value,invoice_prefix:$("sPrefix").value,next_invoice_number:$("sNext").value})});settings=s;$("companyTitle").textContent=s.company_name;toast("تنظیمات ذخیره شد.")}catch(e){toast(e.message)}};
async function loadBackups(){const b=await api("/api/backups");$("backupList").innerHTML="<h4>نسخه‌های موجود</h4>"+(b.map(x=>`<div class="row"><span>${esc(x.file)}<div class="muted">${new Date(x.date).toLocaleString()}</div></span><a class="secondary" href="/api/backup/download/${encodeURIComponent(x.file)}">دریافت</a></div>`).join("")||'<p class="muted">هنوز نسخه‌ای ساخته نشده است.</p>')}
$("makeBackup").onclick=async()=>{try{const d=await api("/api/backup",{method:"POST"});await loadBackups();toast("پشتیبان ساخته شد: "+d.file)}catch(e){toast(e.message)}};
async function refreshPage(n){if(n==="settings")await loadSettings();if(n==="invoices")await renderInvoices();if(n==="customers")renderCustomers();if(n==="products"){renderProducts();renderCategories()}}
$("iDate").value=today();$("payDate").value=today();
loadAll().catch(e=>{toast(e.message);$("serverState").textContent="عدم اتصال"});
