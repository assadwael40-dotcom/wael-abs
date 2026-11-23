const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function loadSite(){
 const r=await fetch("/api/site"); const data=await r.json();
 $("#servicesGrid").innerHTML=data.services.map((s,i)=>`<article class="service"><span class="num">0${i+1} / SERVICE</span><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p></article>`).join("");
 $("#serviceSelect").innerHTML='<option value="">اختر الخدمة</option>'+data.services.map(s=>`<option>${esc(s.title)}</option>`).join("");
 $("#packagesGrid").innerHTML=data.packages.map((p,i)=>`<article class="package ${i===1?"featured":""}"><h3>${esc(p.name)}</h3><div class="price">${Number(p.price).toLocaleString("en-US")} <small>جنيه مصري</small></div><p>${esc(p.description)}</p><a class="btn" href="#contact" data-package="${p.id}">اختار الباقة</a></article>`).join("");
 $("#packageSelect").innerHTML='<option value="">بدون باقة محددة</option>'+data.packages.map(p=>`<option value="${p.id}">${esc(p.name)} - ${p.price} جنيه</option>`).join("");
 $("#videosGrid").innerHTML=data.videos.length?data.videos.map(v=>`<article class="work">${v.thumbnail_url?`<img src="${esc(v.thumbnail_url)}" alt="">`:'<div class="empty">WAEL ADS</div>'}<div><b>${esc(v.title)}</b><p>${esc(v.description)}</p>${v.video_url?`<a class="btn small" href="${esc(v.video_url)}" target="_blank" rel="noopener">مشاهدة العمل ↗</a>`:""}</div></article>`).join(""):'<div class="empty">سيتم عرض نماذج الأعمال هنا بعد إضافتها من لوحة الإدارة.</div>';
 $("#waLink").href=`https://wa.me/${data.whatsapp}?text=${encodeURIComponent("مرحباً WAEL ADS، أريد الاستفسار عن إعلان.")}`;
 document.querySelectorAll("[data-package]").forEach(a=>a.addEventListener("click",()=>$("#packageSelect").value=a.dataset.package));
}
$("#orderForm").addEventListener("submit",async e=>{
 e.preventDefault(); const msg=$("#formMsg"); msg.textContent="جارٍ إرسال الطلب...";
 const body=Object.fromEntries(new FormData(e.currentTarget).entries());
 try{const r=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error);e.currentTarget.reset();
 if(d.amount>0){msg.textContent=`تم حفظ طلبك رقم #${d.orderId}. جارٍ تجهيز الدفع...`;const pr=await fetch("/api/payments/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId:d.orderId})});const pd=await pr.json();if(pr.ok&&pd.checkoutUrl){location.href=pd.checkoutUrl;return;}msg.textContent=`تم حفظ طلبك رقم #${d.orderId}. ${pd.error||"الدفع غير متاح حالياً."} تواصل معنا لتأكيد الطلب.`;}
 else {msg.textContent=`تم استلام طلبك رقم #${d.orderId}. سيتم التواصل معك قريباً.`;}}
 catch(err){msg.textContent=err.message||"حدث خطأ. حاول مرة أخرى.";}
});
$("#year").textContent=new Date().getFullYear();loadSite();
