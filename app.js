const SUPABASE_URL='https://nzmvmsqdfgichbhyaoje.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_RmmP1iJehqfvSSrklLJCvg_teUEyLkS';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

const PAGE=12; let FREE_LIMIT=2;
const CURS=['TL','Yang'];
const SERVERS=['Alesta','Tramola','Tuva','Yakamoz'];
const UNITS=['Won','KK'];
const PLUS=['+9','+8','+7','+6','+5','+4','+3','+2','+1','+0'];
let CATALOG=[], EFSUN=[], STONES=[], active=0, editId=null, efShown=2;
const STONE_CATS=['Silah','Zırh'];
const cache=new Map();
let favorites=new Set(JSON.parse(localStorage.getItem('favs')||'[]'));

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const opts=(arr,first)=>(first?`<option value="">${first}</option>`:'')+arr.map(v=>`<option>${esc(v)}</option>`).join('');
const clean=s=>s.trim().replace(/[%*,()\\]/g,' ').replace(/\s+/g,' ');

let user=null, view='items', page=0, total=0, timer, toastT, authMode='in', recovery=false;

function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2600)}

$('#fPlus').innerHTML=opts(PLUS,'Hepsi');$('#pPlus').innerHTML=opts(PLUS);
$('#fCur').innerHTML=opts(CURS,'Hepsi');$('#pCur').innerHTML=opts(CURS);
$('#fSrv').innerHTML=opts(SERVERS,'Hepsi');$('#fySrv').innerHTML=opts(SERVERS,'Hepsi');
$('#pSrv').innerHTML=opts(SERVERS,'Sunucu seç');$('#ySrv').innerHTML=opts(SERVERS,'Sunucu seç');
$('#fyUnit').innerHTML=opts(UNITS,'Hepsi');$('#yUnit').innerHTML=opts(UNITS);

let lastErr='';
addEventListener('error',e=>{lastErr=String(e.message||'').slice(0,200)});
addEventListener('unhandledrejection',e=>{lastErr=String((e.reason&&e.reason.message)||e.reason||'').slice(0,200)});
const fmt=n=>Number(n).toLocaleString('tr-TR',{maximumFractionDigits:2});
const nowIso=()=>new Date().toISOString();
const prefSrv=()=>{try{return localStorage.getItem('srv')||''}catch{return ''}};
const savePref=v=>{try{localStorage.setItem('srv',v)}catch{}};

async function initCatalog(){
  const [a,b,c]=await Promise.all([sb.from('item_catalog').select('category,name').order('name'),sb.from('efsun_catalog').select('name').order('name'),sb.from('stone_catalog').select('name').order('name')]);
  if(a.error||b.error||c.error){toast('Katalog yüklenemedi.');return}
  CATALOG=a.data;EFSUN=b.data.map(x=>x.name);STONES=c.data.map(x=>x.name);
  const cats=[...new Set(CATALOG.map(x=>x.category))].sort((x,y)=>x.localeCompare(y,'tr'));
  $('#fCat').innerHTML=opts(cats,'Hepsi');$('#pCat').innerHTML=opts(cats,'Kategori seç');
  fillNames();
  $('#efRows').innerHTML=[1,2,3,4,5,6].map(i=>`<div class="ef${i>2?' x':''}" id="efr${i}"><select id="ef${i}n" aria-label="Efsun ${i}">${opts(EFSUN,'Efsun '+i+(i>2?'':' (zorunlu)'))}</select><input id="ef${i}v" class="efv" type="text" inputmode="numeric" maxlength="5" placeholder="Değer (Örn: 15 veya 2000)" autocomplete="off" aria-label="Efsun ${i} değeri">${i>2?`<button class="btn sm bad" type="button" data-rm="${i}" aria-label="Efsunu kaldır">×</button>`:''}</div>`).join('');
  efLayout();
}
function efLayout(){
  for(let n=1;n<=6;n++){const r=$('#efr'+n);if(r)r.classList.toggle('hide',n>efShown)}
  $('#addEf').classList.toggle('hide',efShown>=6);
}
function setEfsuns(item){
  const vals=[];
  if(item)for(let n=1;n<=6;n++){const e=(item['efsun_'+n]||'').match(/^(.*) \+(\d+)$/);if(e)vals.push(e)}
  efShown=Math.max(2,vals.length);
  for(let n=1;n<=6;n++){const e=vals[n-1];$(`#ef${n}n`).value=e?e[1]:'';$(`#ef${n}v`).value=e?e[2]:''}
  efLayout();
}
function efRemove(k){
  const vals=[];
  for(let n=1;n<=efShown;n++)if(n!==k)vals.push([$(`#ef${n}n`).value,$(`#ef${n}v`).value]);
  efShown--;
  for(let n=1;n<=6;n++){const v=vals[n-1]||['',''];$(`#ef${n}n`).value=v[0];$(`#ef${n}v`).value=v[1]}
  efLayout();
}
function stLayout(){$('#addSt').classList.toggle('hide',$('#stRows').children.length>=4)}
function toggleStone(){
  const on=STONE_CATS.includes($('#pCat').value);
  $('#stoneBox').classList.toggle('hide',!on);
  if(!on)$('#stRows').innerHTML='';
  stLayout();
}
function addStone(n,v){
  if($('#stRows').children.length>=4)return;
  const d=document.createElement('div');d.className='ef x';
  d.innerHTML=`<select class="sn" aria-label="Taş">${opts(STONES,'Taş seç')}</select><select class="sv" aria-label="Taş artısı">${opts(['+1','+2','+3','+4'])}</select><button class="btn sm bad" type="button" data-rmst aria-label="Taşı kaldır">×</button>`;
  d.querySelector('.sn').value=n||'';if(v)d.querySelector('.sv').value=v;
  $('#stRows').appendChild(d);stLayout();
}
function fillNames(){const c=$('#pCat').value;$('#pName').innerHTML=opts(CATALOG.filter(x=>x.category===c).map(x=>x.name),c?'İtem seç':'Önce kategori seç')}
async function refreshQuota(){
  if(!user){active=0;FEAT_LIMIT=0;MYRENT=[];$('#quotaBar').classList.add('hide');return}
  const now=nowIso();
  const c=(t,f)=>{const q=sb.from(t).select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('status','active').gt('expires_at',now);return f?q.eq('featured',true):q};
  const [a,b,l,fl,fa,fb,rn]=await Promise.all([c('items'),c('yang_listings'),sb.rpc('my_limit'),sb.rpc('my_featured_limit'),c('items',1),c('yang_listings',1),
    sb.from('premium_rentals').select('pos,ends_at').eq('user_id',user.id).lte('starts_at',now).gt('ends_at',now)]);
  active=(a.count||0)+(b.count||0);FEAT_USED=(fa.count||0)+(fb.count||0);
  if(typeof l.data==='number')FREE_LIMIT=l.data;
  FEAT_LIMIT=typeof fl.data==='number'?fl.data:0;MYRENT=rn.data||[];
  $('#quotaTxt').textContent=`Aktif ilan: ${active}/${FREE_LIMIT}`+(cb('featured_enabled')?` · ⭐ Öne çıkarma: ${FEAT_USED}/${FEAT_LIMIT}`:'')+(MYRENT.length?` · 💎 Premium alan: ${MYRENT.map(r=>'#'+r.pos).join(', ')}`:'');
  $('#quotaBar').classList.toggle('hide',view!=='mine');
}
const dbErr=m=>/check constraint/i.test(m)?'Girdiğin bilgiler kurallara uymuyor. Alanları kontrol et.':m;

function renderAuth(){
  $('#authBar').innerHTML=user
    ?`<span class="seller" style="margin-right:8px">${esc(user.email)}</span><button class="btn sm" id="outBtn">Çıkış</button>`
    :`<button class="btn sm gold" id="inBtn">Giriş / Kayıt</button>`;
  $('#tabMine').classList.toggle('hide',!user);
  $('#tabAdmin').classList.toggle('hide',!isAdmin);
  applyCfg();
  if(!user&&view==='mine'){setView('items');return}
}
async function setUser(u){user=u;isAdmin=false;renderAuth();if(u){try{const {data}=await sb.rpc('is_admin');isAdmin=data===true}catch{}renderAuth()}load(true)}
sb.auth.getSession().then(({data})=>setUser(data.session?.user||null));
sb.auth.onAuthStateChange((ev,s)=>{
  if(ev==='PASSWORD_RECOVERY'){recovery=true;openAuth('recover')}
  if(ev==='SIGNED_IN'||ev==='SIGNED_OUT'){ if((s?.user?.id||null)!==(user?.id||null)) setUser(s?.user||null) }
});

function openAuth(mode){
  authMode=mode;$('#authErr').textContent='';
  const rec=mode==='recover';
  $('#authModes').classList.toggle('hide',rec);
  $('#emailRow').classList.toggle('hide',rec);
  $('#forgot').classList.toggle('hide',rec);
  $('#consentRow').classList.toggle('hide',mode!=='up');
  $('#oauthRow').classList.toggle('hide',rec||!(cb('oauth_google',false)||cb('oauth_discord',false)));
  document.querySelectorAll('#authModes .tab').forEach(b=>b.setAttribute('aria-selected',b.dataset.mode===mode));
  $('#authTitle').textContent=rec?'Yeni şifre belirle':mode==='in'?'Giriş yap':'Kayıt ol';
  $('#passLbl').textContent=rec?'Yeni şifre':'Şifre';
  $('#authGo').textContent=rec?'Şifreyi kaydet':mode==='in'?'Giriş yap':'Kayıt ol';
  if(!$('#authDlg').open)$('#authDlg').showModal();
}
async function authSubmit(){
  const email=$('#email').value.trim(),password=$('#pass').value,err=$('#authErr'),btn=$('#authGo');
  err.textContent='';
  if(authMode!=='recover'&&!/^\S+@\S+\.\S+$/.test(email)){err.textContent='Geçerli bir e-posta gir.';return}
  if(password.length<6){err.textContent='Şifre en az 6 karakter olmalı.';return}
  if(authMode==='up'&&!cb('signups_open')){err.textContent='Yeni kayıtlar şu an kapalı.';return}
  if(authMode==='up'&&!$('#consent').checked){err.textContent='Devam etmek için şartları kabul etmelisin.';return}
  btn.disabled=true;
  let r;
  if(authMode==='recover'){r=await sb.auth.updateUser({password});if(!r.error){recovery=false;toast('Şifren güncellendi.');$('#authDlg').close()}}
  else if(authMode==='up'){
    r=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
    if(!r.error){ if(r.data.session){toast('Kayıt tamamlandı, hoş geldin!')}else{toast('Kayıt alındı. E-postandaki bağlantıyla hesabını doğrula.')} $('#authDlg').close()}
  }else{
    r=await sb.auth.signInWithPassword({email,password});
    if(!r.error){toast('Giriş yapıldı.');$('#authDlg').close()}
  }
  btn.disabled=false;
  if(r.error)err.textContent=r.error.message;
}
async function forgot(){
  const email=$('#email').value.trim();
  if(!/^\S+@\S+\.\S+$/.test(email)){$('#authErr').textContent='Önce e-posta adresini yaz.';return}
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  if(error)$('#authErr').textContent=error.message;
  else{toast('Sıfırlama bağlantısı e-postana gönderildi.');$('#authDlg').close()}
}

function setView(v){
  view=v;
  const T={items:'#tabItems',yang:'#tabYang',feat:'#tabFeat',prem:'#tabPrem',mine:'#tabMine'};
  for(const k in T)$(T[k]).setAttribute('aria-selected',k===v);
  $('#fItems').classList.toggle('hide',v!=='items');
  $('#fYang').classList.toggle('hide',v!=='yang');
  $('#resetBtn').classList.toggle('hide',!(v==='items'||v==='yang'));
  const note=v==='feat'?(CFG.featured_text||'Öne çıkarılan ilanlar burada ve listelerin en üstünde görünür.'):v==='prem'?(CFG.premium_text||'Premium alanlar zamana göre kiralanır.'):'';
  $('#viewNote').textContent='';if(note){$('#viewNote').innerHTML='<span>'+(v==='prem'?'💎 ':'⭐ ')+esc(note)+'</span>'}
  $('#viewNote').classList.toggle('hide',!note);
  load(true);
}
let loadTok=0,fresh=0,isAdmin=false;
let FEAT_LIMIT=0,FEAT_USED=0,MYRENT=[],OFFERS=[],SHARE=null,ADS={top:[],feed:[],bottom:[]};const adSeen=new Set();
async function load(reset){
  const tok=++loadTok;
  if(reset){page=0;fresh=0;$('#freshBar').classList.add('hide');$('#list').innerHTML='<div class="skel"></div><div class="skel"></div>';$('#moreBtn').classList.add('hide')}
  if(view==='feat')return loadFeat(tok);
  if(view==='prem')return loadPrem(tok);
  let html='',cnt=0,err=null;
  if(view==='mine'){
    if(!user)return;
    const mk=t=>sb.from(t).select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(30);
    const [a,b]=await Promise.all([mk('items'),mk('yang_listings')]);
    err=a.error||b.error;
    if(!err){
      cnt=total=a.data.length+b.data.length;
      html=(a.data.length?`<h4 class="sec">İtem ilanlarım (${a.data.length})</h4>`+a.data.map(card).join(''):'')+(b.data.length?`<h4 class="sec">Yang ilanlarım (${b.data.length})</h4>`+b.data.map(yangCard).join(''):'');
    }
  }else{
    const isY=view==='yang';
    let q=sb.from(isY?'yang_listings':'items').select('*',{count:'exact'}).eq('status','active').gt('expires_at',nowIso());
    if(isY){
      if($('#fySrv').value)q=q.eq('server',$('#fySrv').value);
      if($('#fyUnit').value)q=q.eq('unit',$('#fyUnit').value);
      const s=$('#fySort').value;
      if(s==='low')q=q.order('unit_price',{ascending:true});
      else if(s==='high')q=q.order('unit_price',{ascending:false});
    }else{
      const name=clean($('#fName').value),ef=clean($('#fEfsun').value);
      if(name)q=q.ilike('item_name',`%${name}%`);
      if(ef)q=q.or(['efsun_1','efsun_2','efsun_3','efsun_4','efsun_5','efsun_6'].map(c=>`${c}.ilike.%${ef}%`).join(','));
      if($('#fCat').value)q=q.eq('category',$('#fCat').value);
      if($('#fPlus').value)q=q.ilike('item_name',`%${$('#fPlus').value}`);
      if($('#fCur').value)q=q.eq('currency',$('#fCur').value);
      if($('#fSrv').value)q=q.eq('server',$('#fSrv').value);
      const s=$('#fSort').value;
      if(s==='low')q=q.order('price_value',{ascending:true,nullsFirst:false});
      else if(s==='high')q=q.order('price_value',{ascending:false,nullsFirst:false});
    }
    const sv=isY?$('#fySort').value:$('#fSort').value;if(sv!=='low'&&sv!=='high')q=q.order('featured',{ascending:false});
    q=q.order('created_at',{ascending:false}).range(page*PAGE,page*PAGE+PAGE-1);
    const r=await q;err=r.error;
    if(!err){total=r.count||0;cnt=r.data.length;html=withAds(r.data,isY?yangCard:card,page*PAGE)}
  }
  if(tok!==loadTok)return;
  if(err){$('#list').innerHTML=`<div class="empty" style="grid-column:1/-1">İlanlar yüklenemedi.</div>`;return}
  if(reset)$('#list').innerHTML='';
  if(!cnt&&reset){
    $('#list').innerHTML=`<div class="empty" style="grid-column:1/-1">${view==='mine'?'Henüz ilanın yok.':'Kriterlere uygun ilan bulunamadı.'}</div>`;
  }else $('#list').insertAdjacentHTML('beforeend',html);
  const shown=$('#list').querySelectorAll('.card').length;
  $('#count').textContent=total?`${total} ilan`:'';
  $('#moreBtn').classList.toggle('hide',view==='mine'||shown>=total);
  refreshQuota();paintAds();
  if(view==='yang'){if(reset)yangStats()}else $('#mkt').classList.add('hide');
}
function parts(i,k,o){
  const pr=!!o&&o.prem===true;
  cache.set(k+i.id,i);
  const ms=new Date(i.expires_at)-Date.now(),expired=ms<=0,sold=i.status==='sold',mine=user&&user.id===i.user_id;
  const isFav=favorites.has(i.id);
  const st=sold?'<span class="tag st">Satıldı</span>':expired?'<span class="tag st">Süresi doldu</span>':'';
  const tags=`<div class="tags">${i.featured?'<span class="badge">⭐ Öne çıkan</span>':''}${pr?'<span class="badge prem">💎 Premium</span>':''}${i.server?`<span class="tag srv">📍 ${esc(i.server)}</span>`:''}${st}</div>`;
  const who=(i.seller_name?`<span>Karakter: <b>${esc(i.seller_name)}</b></span>`:'')+(i.contact_info?`<span>İletişim: <b>${esc(i.contact_info)}</b></span>`:'')||'<span>İletişim yok</span>';
  const d=`data-k="${k}" data-id="${i.id}"`;
  const acts=`<button class="btn sm ${isFav?'gold':''}" data-act="fav" ${d}>${isFav?'❤️':'🤍'}</button>`+
    (mine
      ?`<button class="btn sm" data-act="share" ${d}>🔗</button><button class="btn sm" data-act="edit" ${d}>Düzenle</button>`+(!sold&&!expired?`<button class="btn sm ok" data-act="sold" ${d}>Satıldı</button>`:`<button class="btn sm ok" data-act="renew" ${d}>Yenile</button>`)+`<button class="btn sm bad" data-act="del" ${d}>Sil</button>`
      :`<button class="btn sm" data-act="share" ${d}>🔗</button>`+(i.seller_name?`<button class="btn sm gold" data-act="copy" data-nick="${esc(i.seller_name)}">/w kopyala</button>`:'')+`<button class="btn sm" data-act="report" ${d}>🚩</button>`+(isAdmin?`<button class="btn sm bad" data-act="adel" ${d}>🛡</button>`:''));
  const left=!sold&&!expired?` · ${Math.ceil(ms/36e5)} saat kaldı`:'';
  return {cls:`${sold?'sold':''} ${expired?'exp':''} ${i.featured?'feat':''} ${pr?'prem':''}`,tags,who,acts,left,date:new Date(i.created_at).toLocaleDateString('tr-TR')};
}
function card(i,o){
  const p=parts(i,'i',o);
  const efs=[1,2,3,4,5,6].map(n=>i['efsun_'+n]).filter(Boolean).map((e,k)=>{
    const m=e.match(/^(.*) (\+\d+)$/);
    return `<li><span class="n">${k+1}.</span><span>${esc(m?m[1]:e)}${m?` <b>${esc(m[2])}</b>`:''}</span></li>`}).join('');
  const price=i.price_value!=null?`${fmt(i.price_value)} ${esc(i.currency||'')}`:esc(i.price||'');
  return `<article class="card ${p.cls}">
    <div class="head"><h3>${esc(i.item_name)}</h3><span class="price">${price}</span></div>
    ${p.tags}
    <ol class="efl">${efs}</ol>
    <div class="who">${p.who}</div>
    <div class="foot"><span>${esc(i.category||'')} · ${p.date}${p.left}</span><div class="acts">${p.acts}</div></div>
  </article>`;
}
function yangCard(i,o){
  const p=parts(i,'y',o);
  return `<article class="card ${p.cls}">
    <div class="head"><h3>💰 ${fmt(i.amount)} ${esc(i.unit)} Yang</h3><span class="price">${fmt(i.price_tl)} TL</span></div>
    ${p.tags}
    <div class="seller">Birim fiyat: <b>${fmt(i.price_tl/i.amount)} TL / ${esc(i.unit)}</b></div>
    <div class="who">${p.who}</div>
    <div class="foot"><span>${p.date}${p.left}</span><div class="acts">${p.acts}</div></div>
  </article>`;
}

async function openPost(item){
  if(!user){toast('Giriş yap.');openAuth('in');return}
  await refreshQuota();
  const live=item&&item.status==='active'&&new Date(item.expires_at)>new Date();
  if(!live&&active>=FREE_LIMIT){openLimit();return}
  editId=item?item.id:null;
  $('#postErr').textContent='';
  $('#postTitle').textContent=item?'İlanı düzenle':'Yeni ilan';
  $('#postGo').textContent=item?'Kaydet':'Yayınla';
  $('#stRows').innerHTML='';
  $('#pSrv').value=item?item.server||'':prefSrv();
  if(item){
    $('#pCat').value=item.category;fillNames();toggleStone();
    const m=item.item_name.match(/^(.*)\s(\+\d+)$/);
    $('#pName').value=m?m[1]:'';$('#pPlus').value=m?m[2]:'+0';
    setEfsuns(item);
    $('#pPrice').value=item.price_value??'';$('#pCur').value=item.currency||'TL';
    $('#pNick').value=item.seller_name||'';$('#pContact').value=item.contact_info||'';$('#pDur').value=item.duration_hours||24;
  }else{
    $('#pCat').value='';fillNames();toggleStone();$('#pPlus').selectedIndex=0;setEfsuns(null);
    ['#pPrice','#pNick','#pContact'].forEach(x=>$(x).value='');$('#pCur').selectedIndex=0;$('#pDur').value='24';
  }
  $('#postDlg').showModal();
}
async function postSubmit(){
  const err=$('#postErr'),btn=$('#postGo');err.textContent='';
  const cat=$('#pCat').value,base=$('#pName').value,price=parseFloat($('#pPrice').value);
  const nick=$('#pNick').value.trim()||null,contact=$('#pContact').value.trim()||null;
  if(!$('#pSrv').value){err.textContent='Sunucu seç.';return}
  if(!cat||!base){err.textContent='Kategori ve item seç.';return}
  const row={server:$('#pSrv').value,category:cat,item_name:`${base} ${$('#pPlus').value}`,price_value:price,currency:$('#pCur').value,
    price:`${price} ${$('#pCur').value}`,seller_name:nick,contact_info:contact,duration_hours:+$('#pDur').value,status:'active'};
  const seen=new Set();
  for(let n=1;n<=6;n++){
    row['efsun_'+n]=null;
    if(n>efShown)continue;
    const nm=$(`#ef${n}n`).value,v=$(`#ef${n}v`).value.trim();
    if(!nm){err.textContent=`${n}. efsunu seç.`;return}
    if(!/^\d{1,5}$/.test(v)||+v<1||+v>10000){err.textContent=`${n}. efsun değeri 1-10000 arasında olmalı.`;return}
    if(seen.has(nm)){err.textContent='Aynı efsun iki kez seçilemez.';return}
    seen.add(nm);row['efsun_'+n]=`${nm} +${+v}`;
  }
  row.stones=[];
  if(!(price>0)){err.textContent='Geçerli fiyat gir.';return}
  btn.disabled=true;
  let r;
  if(editId){row.expires_at=new Date().toISOString();r=await sb.from('items').update(row).eq('id',editId).eq('user_id',user.id)}
  else{row.user_id=user.id;r=await sb.from('items').insert([row])}
  btn.disabled=false;
  if(r.error){err.textContent=dbErr(r.error.message);return}
  savePref(row.server);$('#postDlg').close();toast('İlan yayınlandı!');
  view==='mine'?load(true):setView('mine');
}

async function openNew(){
  if(!cb('posting_open')&&!isAdmin)return toast('İlan verme kapalı.');
  if(!user){toast('Giriş yap.');openAuth('in');return}
  await refreshQuota();if(active>=FREE_LIMIT){openLimit();return}
  $('#typeDlg').showModal();
}
let yEditId=null;
async function openYang(item){
  if(!user){toast('Giriş yap.');openAuth('in');return}
  await refreshQuota();
  const live=item&&item.status==='active'&&new Date(item.expires_at)>new Date();
  if(!live&&active>=FREE_LIMIT){openLimit();return}
  yEditId=item?item.id:null;
  $('#yErr').textContent='';
  $('#yTitle').textContent=item?'Yang düzenle':'Yang ilanı';
  $('#yGo').textContent=item?'Kaydet':'Yayınla';
  $('#ySrv').value=item?item.server||'':prefSrv();
  $('#yAmt').value=item?item.amount:'';$('#yUnit').value=item?item.unit:UNITS[0];
  $('#yPrice').value=item?item.price_tl:'';
  $('#yNick').value=item?item.seller_name||'':'';$('#yContact').value=item?item.contact_info||'':'';
  yCalc();$('#yangDlg').showModal();
}
function yCalc(){const a=parseFloat($('#yAmt').value),p=parseFloat($('#yPrice').value);$('#yUnitPrice').textContent=a>0&&p>0?`Birim fiyat: ${fmt(p/a)} TL / ${$('#yUnit').value}`:''}
async function yangSubmit(){
  const err=$('#yErr'),btn=$('#yGo');err.textContent='';
  const srv=$('#ySrv').value,amt=parseFloat($('#yAmt').value),pr=parseFloat($('#yPrice').value);
  const nick=$('#yNick').value.trim()||null,contact=$('#yContact').value.trim()||null;
  if(!srv){err.textContent='Sunucu seç.';return}
  if(!(amt>0)){err.textContent='Yang miktarı gir.';return}
  if(!(pr>0)){err.textContent='Fiyat gir.';return}
  const row={server:srv,amount:amt,unit:$('#yUnit').value,price_tl:pr,seller_name:nick,contact_info:contact,duration_hours:+$('#yDur').value,status:'active'};
  btn.disabled=true;
  let r;
  if(yEditId){row.expires_at=nowIso();r=await sb.from('yang_listings').update(row).eq('id',yEditId).eq('user_id',user.id)}
  else{row.user_id=user.id;r=await sb.from('yang_listings').insert([row])}
  btn.disabled=false;
  if(r.error){err.textContent=dbErr(r.error.message);return}
  savePref(srv);$('#yangDlg').close();toast('Yang ilanı yayınlandı!');
  view==='mine'?load(true):setView('mine');
}

let fbRef=null;
function openFeedback(kind,ref,msg){
  fbRef=ref||null;
  $('#fbKind').value=kind||'hata';$('#fbKind').disabled=!!ref;
  $('#fbMsg').value=msg||'';$('#fbErr').textContent='';$('#fbDlg').showModal();
}
async function fbSubmit(){
  const err=$('#fbErr');err.textContent='';
  const msg=$('#fbMsg').value.trim(),contact=$('#fbContact').value.trim()||null;
  if(msg.length<10){err.textContent='En az 10 karakter yaz.';return}
  $('#fbGo').disabled=true;
  await sb.from('feedback').insert([{kind:fbRef?'sikayet':$('#fbKind').value,message:msg,contact,ref:fbRef,view}]);
  $('#fbGo').disabled=false;$('#fbDlg').close();toast('Gönderildi.');
}

async function onCardClick(e){
  const b=e.target.closest('button[data-act]');if(!b)return;
  const act=b.dataset.act,id=+b.dataset.id,k=b.dataset.k,T=k==='y'?'yang_listings':'items';
  if(act==='fav'){if(favorites.has(id))favorites.delete(id);else favorites.add(id);localStorage.setItem('favs',JSON.stringify([...favorites]));load(false);return}
  if(act==='copy'){try{await navigator.clipboard.writeText('/w '+b.dataset.nick);toast('Kopyalandı')}catch{}return}
  if(act==='share'){openShare(k,id);return}
  if(act==='feat'){await refreshQuota();if(FEAT_USED>=FEAT_LIMIT)return openLimit();await sb.from(T).update({featured:true}).eq('id',id).eq('user_id',user.id);toast('Öne çıkarıldı');load(true);return}
  if(act==='unfeat'){await sb.from(T).update({featured:false}).eq('id',id).eq('user_id',user.id);toast('Kaldırıldı');load(true);return}
  if(act==='edit'){k==='y'?openYang(cache.get('y'+id)):openPost(cache.get('i'+id));return}
  if(act==='report'){openFeedback('sikayet',`${T}:${id}`);return}
  if(act==='del'){if(!confirm('Silinsin mi?'))return;await sb.from(T).delete().eq('id',id).eq('user_id',user.id);toast('Silindi');load(true);return}
  const patch=act==='sold'?{status:'sold'}:{status:'active',expires_at:nowIso()};
  await sb.from(T).update(patch).eq('id',id).eq('user_id',user.id);toast('Güncellendi');load(true);
}
$('#list').addEventListener('click',onCardClick);
$('#authBar').addEventListener('click',async e=>{
  if(e.target.id==='inBtn')openAuth('in');
  if(e.target.id==='outBtn'){await sb.auth.signOut();setUser(null);toast('Çıkış yapıldı.')}
});
document.querySelectorAll('#authModes .tab').forEach(b=>b.onclick=()=>openAuth(b.dataset.mode));
$('#authGo').onclick=authSubmit;$('#forgot').onclick=forgot;$('#authClose').onclick=()=>$('#authDlg').close();
$('#newBtn').onclick=openNew;$('#postGo').onclick=postSubmit;$('#postClose').onclick=()=>$('#postDlg').close();
$('#tabItems').onclick=()=>setView('items');$('#tabYang').onclick=()=>setView('yang');$('#tabMine').onclick=()=>setView('mine');
$('#moreBtn').onclick=()=>{page++;load(false)};

['fName','fEfsun'].forEach(id=>$('#'+id).addEventListener('input',()=>{
  clearTimeout(timer);
  const val=$('#'+id).value.trim();
  if(val.length>0&&val.length<2)return;
  timer=setTimeout(()=>load(true),500);
}));
['fCat','fPlus','fSort','fCur','fSrv','fySrv','fyUnit','fySort'].forEach(id=>$('#'+id).addEventListener('change',()=>load(true)));
$('#resetBtn').onclick=()=>{['fName','fEfsun','fCat','fPlus','fCur','fSrv','fySrv','fyUnit'].forEach(id=>$('#'+id).value='');load(true)};
$('#pCat').onchange=()=>{fillNames();toggleStone()};
$('#addEf').onclick=()=>{if(efShown<6){efShown++;efLayout()}};
$('#efRows').addEventListener('click',e=>{const b=e.target.closest('[data-rm]');if(b)efRemove(+b.dataset.rm)});
$('#moreSlots').onclick=()=>openLimit();$('#limitClose').onclick=()=>$('#limitDlg').close();
$('#chItem').onclick=()=>{$('#typeDlg').close();openPost()};
$('#chYang').onclick=()=>{$('#typeDlg').close();openYang()};
$('#typeClose').onclick=()=>$('#typeDlg').close();
$('#yGo').onclick=yangSubmit;$('#yClose').onclick=()=>$('#yangDlg').close();
['yAmt','yPrice'].forEach(id=>$('#'+id).addEventListener('input',yCalc));$('#yUnit').onchange=yCalc;
$('#fbBtn').onclick=()=>openFeedback();$('#fbLink').onclick=()=>openFeedback();
$('#fbGo').onclick=fbSubmit;$('#fbClose').onclick=()=>$('#fbDlg').close();

async function yangStats(){
  let q=sb.from('yang_listings').select('unit,unit_price').eq('status','active').gt('expires_at',nowIso()).limit(500);
  if($('#fySrv').value)q=q.eq('server',$('#fySrv').value);
  const {data}=await q,box=$('#mkt');
  if(view!=='yang'||!data||!data.length){box.classList.add('hide');return}
  const by={};data.forEach(r=>{(by[r.unit]=by[r.unit]||[]).push(Number(r.unit_price))});
  const row=([u,a])=>{a.sort((x,y)=>x-y);return `1 ${esc(u)}: en düşük <b>${fmt(a[0])}</b> TL`};
  box.innerHTML=`<span>📊 <b>Piyasa özeti:</b> ${Object.entries(by).map(row).join(' · ')}</span>`;
  box.classList.remove('hide');
}

let CFG={};
const cb=(k,d=true)=>CFG[k]===undefined?d:CFG[k]==='true';
async function loadCfg(){
  try{const {data}=await sb.from('site_settings').select('key,value');CFG={};(data||[]).forEach(r=>CFG[r.key]=r.value)}catch{}
  applyCfg();
}
function applyCfg(){
  const set=(id,k)=>{if(CFG[k])$(id).textContent=CFG[k]};
  set('#brandTxt','site_title');set('#brandSub','site_subtitle');set('#heroH','hero_title');set('#heroP','hero_text');set('#gameN','game_notice');set('#footTxt','footer_text');
  if(CFG.site_title)document.title=CFG.site_title;
  $('#tabItems').classList.toggle('hide',!cb('items_enabled'));$('#tabYang').classList.toggle('hide',!cb('yang_enabled'));
  $('#tabFeat').classList.toggle('hide',!cb('featured_enabled'));$('#tabPrem').classList.toggle('hide',!cb('premium_enabled'));
}

async function openLimit(){
  $('#limTxt').textContent=`Aynı anda ${FREE_LIMIT} aktif ilan verebilirsin.`;
  $('#planList').innerHTML='Paketler yükleniyor...';$('#limitDlg').showModal();
  const pl=await sb.from('plans').select('*').eq('active',true);
  $('#planList').innerHTML=(pl.data||[]).map(p=>`<div class="card" style="margin-top:8px"><h3>${esc(p.name)}</h3><button class="btn sm gold" data-plan="${p.id}">İstiyorum</button></div>`).join('');
}
$('#planList').addEventListener('click',e=>{
  const b=e.target.closest('[data-plan]');if(!b)return;
  $('#limitDlg').close();openFeedback('diger','plan:'+b.dataset.plan,'Paket talebi gönderiyorum.');
});

async function loadFeat(tok){
  const now=nowIso(),mk=t=>sb.from(t).select('*').eq('featured',true).eq('status','active').gt('expires_at',now).limit(60);
  const [a,b]=await Promise.all([mk('items'),mk('yang_listings')]);
  if(tok!==loadTok)return;
  const n=a.data.length+b.data.length;total=n;
  $('#count').textContent=`${n} öne çıkan`;
  $('#list').innerHTML=n?(a.data.length?a.data.map(card).join(''):'')+(b.data.length?b.data.map(yangCard).join(''):''):'<div class="empty" style="grid-column:1/-1">Öne çıkan ilan yok.</div>';
  refreshQuota();
}
async function loadPrem(tok){
  const bd=await sb.rpc('premium_board');
  if(tok!==loadTok)return;
  $('#list').innerHTML=(bd.data||[]).map(r=>r.listing?card(r.listing,{prem:true}):'<div class="slot">Boş alan</div>').join('');
}

const siteUrl=()=>location.origin+location.pathname.replace(/index\.html$/,'');
function openShare(k,id){
  const r=cache.get(k+id);if(!r)return;
  const url=`${siteUrl()}?${k==='y'?'y':'i'}=${id}`;
  SHARE={url,title:k==='y'?'Yang ilanı':r.item_name};
  $('#shTitle').textContent=SHARE.title;$('#shUrl').value=url;
  $('#shareDlg').showModal();
}
$('#shCp').onclick=()=>{navigator.clipboard.writeText(SHARE.url);toast('Kopyalandı')};
$('#shClose').onclick=()=>$('#shareDlg').close();$('#viewClose').onclick=()=>$('#viewDlg').close();

async function openShared(k,id){
  const {data}=await sb.from(k==='y'?'yang_listings':'items').select('*').eq('id',id).maybeSingle();
  $('#viewBody').innerHTML=!data?'<div class="empty">Bulunamadı</div>':(k==='y'?yangCard(data):card(data));
  $('#viewDlg').showModal();
}
{const q=new URLSearchParams(location.search);if(q.get('i'))openShared('i',q.get('i'));else if(q.get('y'))openShared('y',q.get('y'))}

{const tb=$('#themeBtn');tb.textContent=themeLabel();tb.onclick=()=>{cycleTheme();tb.textContent=themeLabel()}}

initCatalog();loadCfg();
