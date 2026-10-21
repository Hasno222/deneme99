const SUPABASE_URL='https://nzmvmsqdfgichbhyaoje.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_RmmP1iJehqfvSSrklLJCvg_teUEyLkS';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

const PAGE = 12; 
let FREE_LIMIT = 2;
const CURS = ['TL', 'Yang'];
const SERVERS = ['Alesta', 'Tramola', 'Tuva', 'Yakamoz'];
const UNITS = ['Won', 'KK'];
const PLUS = ['+9', '+8', '+7', '+6', '+5', '+4', '+3', '+2', '+1', '+0'];
let CATALOG = [], EFSUN = [], STONES = [], active = 0, editId = null, efShown = 2;
const cache = new Map();
let favorites = new Set(JSON.parse(localStorage.getItem('favs') || '[]'));

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opts = (arr, first) => (first ? `<option value="">${first}</option>` : '') + arr.map(v => `<option>${esc(v)}</option>`).join('');
const clean = s => String(s || '').trim().replace(/[%*,()\\]/g, ' ').replace(/\s+/g, ' ');
const fmt = n => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const nowIso = () => new Date().toISOString();

let user = null, view = 'items', page = 0, total = 0, timer, toastT, authMode = 'in', isAdmin = false;
let FEAT_LIMIT = 0, FEAT_USED = 0, CFG = {};

function toast(msg) {
  const t = $('#toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

// Filtre seçeneklerini doldur
if($('#fPlus')) $('#fPlus').innerHTML = opts(PLUS, 'Hepsi');
if($('#pPlus')) $('#pPlus').innerHTML = opts(PLUS);
if($('#fCur')) $('#fCur').innerHTML = opts(CURS, 'Hepsi');
if($('#pCur')) $('#pCur').innerHTML = opts(CURS);
if($('#fSrv')) $('#fSrv').innerHTML = opts(SERVERS, 'Hepsi');
if($('#fySrv')) $('#fySrv').innerHTML = opts(SERVERS, 'Hepsi');
if($('#pSrv')) $('#pSrv').innerHTML = opts(SERVERS, 'Sunucu seç');
if($('#ySrv')) $('#ySrv').innerHTML = opts(SERVERS, 'Sunucu seç');
if($('#fyUnit')) $('#fyUnit').innerHTML = opts(UNITS, 'Hepsi');
if($('#yUnit')) $('#yUnit').innerHTML = opts(UNITS);

async function initCatalog() {
  try {
    const [a, b, c] = await Promise.all([
      sb.from('item_catalog').select('category,name').order('name'),
      sb.from('efsun_catalog').select('name').order('name'),
      sb.from('stone_catalog').select('name').order('name')
    ]);
    if (a.data) CATALOG = a.data;
    if (b.data) EFSUN = b.data.map(x => x.name);
    if (c.data) STONES = c.data.map(x => x.name);

    const cats = [...new Set(CATALOG.map(x => x.category))].sort((x, y) => x.localeCompare(y, 'tr'));
    if($('#fCat')) $('#fCat').innerHTML = opts(cats, 'Hepsi');
    if($('#pCat')) $('#pCat').innerHTML = opts(cats, 'Kategori seç');
    fillNames();
    
    if($('#efRows')) {
      $('#efRows').innerHTML = [1, 2, 3, 4, 5, 6].map(i => 
        `<div class="ef${i > 2 ? ' x' : ''}" id="efr${i}">
          <select id="ef${i}n">${opts(EFSUN, 'Efsun ' + i + (i > 2 ? '' : ' (zorunlu)'))}</select>
          <input id="ef${i}v" class="efv" type="text" inputmode="numeric" maxlength="5" placeholder="Değer (Örn: 2000)" autocomplete="off">
          ${i > 2 ? `<button class="btn sm bad" type="button" data-rm="${i}">×</button>` : ''}
        </div>`
      ).join('');
    }
    efLayout();
  } catch(e) { console.error("Katalog hatası:", e); }
}

function efLayout() {
  for (let n = 1; n <= 6; n++) {
    const r = $('#efr' + n);
    if (r) r.classList.toggle('hide', n > efShown);
  }
  if($('#addEf')) $('#addEf').classList.toggle('hide', efShown >= 6);
}

function fillNames() {
  const c = $('#pCat') ? $('#pCat').value : '';
  if($('#pName')) $('#pName').innerHTML = opts(CATALOG.filter(x => x.category === c).map(x => x.name), c ? 'İtem seç' : 'Önce kategori seç');
}

// Kullanıcı & Yetki Durumu
async function setUser(u) {
  user = u;
  isAdmin = false;
  if (u) {
    try {
      const { data } = await sb.rpc('is_admin');
      isAdmin = (data === true);
    } catch(e) {}
  }
  renderAuth();
  load(true);
}

function renderAuth() {
  if($('#authBar')) {
    $('#authBar').innerHTML = user
      ? `<span class="seller" style="margin-right:8px">${esc(user.email)}</span><button class="btn sm" id="outBtn">Çıkış</button>`
      : `<button class="btn sm gold" id="inBtn">Giriş / Kayıt</button>`;
  }
  if($('#tabMine')) $('#tabMine').classList.toggle('hide', !user);
  if($('#tabAdmin')) $('#tabAdmin').classList.toggle('hide', !isAdmin);
}

sb.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
sb.auth.onAuthStateChange((ev, s) => {
  if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') {
    if ((s?.user?.id || null) !== (user?.id || null)) setUser(s?.user || null);
  }
});

// Sekme Yönetimi
function setView(v) {
  view = v;
  const T = { items: '#tabItems', yang: '#tabYang', feat: '#tabFeat', prem: '#tabPrem', mine: '#tabMine', admin: '#tabAdmin' };
  for (const k in T) {
    if($(T[k]))$(T[k]).setAttribute('aria-selected', k === v);
  }

  // Yönetim sekmesine tıklandıysa yönlendir
  if(v === 'admin') {
    window.location.href = 'admin.html';
    return;
  }

  if($('#fItems')) $('#fItems').classList.toggle('hide', v !== 'items');
  if($('#fYang')) $('#fYang').classList.toggle('hide', v !== 'yang');
  if($('#resetBtn')) $('#resetBtn').classList.toggle('hide', !(v === 'items' || v === 'yang'));

  load(true);
}

let loadTok = 0;
async function load(reset) {
  const tok = ++loadTok;
  if (reset) {
    page = 0;
    if($('#list')) $('#list').innerHTML = '<div class="skel"></div><div class="skel"></div>';
    if($('#moreBtn')) $('#moreBtn').classList.add('hide');
  }

  if (view === 'feat') return loadFeat(tok);
  if (view === 'prem') return loadPrem(tok);

  let html = '', cnt = 0, err = null;

  if (view === 'mine') {
    if (!user) return;
    const mk = t => sb.from(t).select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    const [a, b] = await Promise.all([mk('items'), mk('yang_listings')]);
    err = a.error || b.error;
    if (!err) {
      cnt = total = (a.data?.length || 0) + (b.data?.length || 0);
      html = (a.data?.length ? `<h4 class="sec">İtem İlanlarım (${a.data.length})</h4>` + a.data.map(i => card(i, 'i')).join('') : '') +
             (b.data?.length ? `<h4 class="sec">Yang İlanlarım (${b.data.length})</h4>` + b.data.map(i => yangCard(i, 'y')).join('') : '');
    }
  } else {
    const isY = (view === 'yang');
    let q = sb.from(isY ? 'yang_listings' : 'items').select('*', { count: 'exact' }).eq('status', 'active').gt('expires_at', nowIso());

    if (isY) {
      if ($('#fySrv') && $('#fySrv').value) q = q.eq('server', $('#fySrv').value);
      if ($('#fyUnit') && $('#fyUnit').value) q = q.eq('unit', $('#fyUnit').value);
    } else {
      const name = clean($('#fName') ? $('#fName').value : '');
      const ef = clean($('#fEfsun') ? $('#fEfsun').value : '');
      if (name) q = q.ilike('item_name', `%${name}%`);
      if (ef) q = q.or(['efsun_1','efsun_2','efsun_3','efsun_4','efsun_5','efsun_6'].map(c => `${c}.ilike.%${ef}%`).join(','));
      if ($('#fCat') && $('#fCat').value) q = q.eq('category', $('#fCat').value);
      if ($('#fSrv') && $('#fSrv').value) q = q.eq('server', $('#fSrv').value);
    }

    q = q.order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    const r = await q;
    err = r.error;
    if (!err && r.data) {
      total = r.count || 0;
      cnt = r.data.length;
      html = r.data.map(i => isY ? yangCard(i, 'y') : card(i, 'i')).join('');
    }
  }

  if (tok !== loadTok) return;

  if (err) {
    if($('#list')) $('#list').innerHTML = `<div class="empty" style="grid-column:1/-1">İlanlar yüklenirken bir hata oluştu.</div>`;
    return;
  }

  // Liste güncellenirken her zaman temizleyip basıyoruz (Sonsuz çoğalma hatası çözüldü)
  if ($('#list')) {
    if (reset) $('#list').innerHTML = '';
    if (!cnt && reset) {
      $('#list').innerHTML = `<div class="empty" style="grid-column:1/-1">${view === 'mine' ? 'Henüz aktif ilanın yok.' : 'Kriterlere uygun ilan bulunamadı.'}</div>`;
    } else {
      $('#list').insertAdjacentHTML('beforeend', html);
    }
  }

  if($('#count')) $('#count').textContent = total ? `${total} İlan Bulundu` : '';
  if($('#moreBtn')) $('#moreBtn').classList.toggle('hide', view === 'mine' || (page + 1) * PAGE >= total);
}

// Kart Elemanları ve İçerikleri
function parts(i, k) {
  cache.set(k + i.id, i);
  const expired = new Date(i.expires_at) <= new Date();
  const sold = i.status === 'sold';
  const mine = user && user.id === i.user_id;
  const isFav = favorites.has(i.id);
  
  const st = sold ? '<span class="tag st">Satıldı</span>' : expired ? '<span class="tag st">Süresi Doldu</span>' : '';
  const tags = `<div class="tags">${i.featured ? '<span class="badge">⭐ Öne Çıkan</span>' : ''}${i.server ? `<span class="tag srv">📍 ${esc(i.server)}</span>` : ''}${st}</div>`;
  const who = (i.seller_name ? `<span>Satıcı: <b>${esc(i.seller_name)}</b></span>` : '') + (i.contact_info ? `<span>İletişim: <b>${esc(i.contact_info)}</b></span>` : '');
  const d = `data-k="${k}" data-id="${i.id}"`;

  const acts = `<button class="btn sm ${isFav ? 'gold' : ''}" data-act="fav" ${d}>${isFav ? '❤️' : '🤍'}</button>` +
    (mine
      ? `<button class="btn sm" data-act="edit" ${d}>Düzenle</button><button class="btn sm bad" data-act="del" ${d}>Sil</button>`
      : (i.seller_name ? `<button class="btn sm gold" data-act="copy" data-nick="${esc(i.seller_name)}">/w Kopyala</button>` : ''));

  return { cls: `${sold ? 'sold' : ''} ${expired ? 'exp' : ''} ${i.featured ? 'feat' : ''}`, tags, who, acts, date: new Date(i.created_at).toLocaleDateString('tr-TR') };
}

function card(i, k) {
  const p = parts(i, k);
  const efs = [1, 2, 3, 4, 5, 6].map(n => i['efsun_' + n]).filter(Boolean).map((e, idx) => `<li><span class="n">${idx + 1}.</span><span>${esc(e)}</span></li>`).join('');
  const price = i.price_value != null ? `${fmt(i.price_value)} ${esc(i.currency || '')}` : esc(i.price || '');
  return `<article class="card ${p.cls}">
    <div class="head"><h3>${esc(i.item_name)}</h3><span class="price">${price}</span></div>
    ${p.tags}
    <ol class="efl">${efs}</ol>
    <div class="who">${p.who}</div>
    <div class="foot"><span>${esc(i.category || '')} · ${p.date}</span><div class="acts">${p.acts}</div></div>
  </article>`;
}

function yangCard(i, k) {
  const p = parts(i, k);
  return `<article class="card ${p.cls}">
    <div class="head"><h3>💰 ${fmt(i.amount)} ${esc(i.unit)} Yang</h3><span class="price">${fmt(i.price_tl)} TL</span></div>
    ${p.tags}
    <div class="seller">Birim Fiyat: <b>${fmt(i.price_tl / i.amount)} TL / ${esc(i.unit)}</b></div>
    <div class="who">${p.who}</div>
    <div class="foot"><span>${p.date}</span><div class="acts">${p.acts}</div></div>
  </article>`;
}

// Öne Çıkanlar & Premium Yükleme
async function loadFeat(tok) {
  const now = nowIso();
  const [a, b] = await Promise.all([
    sb.from('items').select('*').eq('featured', true).eq('status', 'active').gt('expires_at', now),
    sb.from('yang_listings').select('*').eq('featured', true).eq('status', 'active').gt('expires_at', now)
  ]);
  if (tok !== loadTok) return;
  const listA = a.data || [], listB = b.data || [];
  total = listA.length + listB.length;
  if($('#count')) $('#count').textContent = `${total} Öne Çıkan İlan`;
  if($('#list')) {
    $('#list').innerHTML = total 
      ? listA.map(i => card(i, 'i')).join('') + listB.map(i => yangCard(i, 'y')).join('') 
      : '<div class="empty" style="grid-column:1/-1">Öne çıkarılan ilan bulunmamaktadır.</div>';
  }
}

async function loadPrem(tok) {
  const { data, error } = await sb.from('premium_rentals').select('*, items(*), yang_listings(*)').gt('ends_at', nowIso());
  if (tok !== loadTok) return;
  if (error || !data || !data.length) {
    if($('#list')) $('#list').innerHTML = '<div class="empty" style="grid-column:1/-1">Aktif kiralık premium pazar ilanı yok.</div>';
    return;
  }
  if($('#list')) {
    $('#list').innerHTML = data.map(r => {
      if(r.items) return card(r.items, 'i');
      if(r.yang_listings) return yangCard(r.yang_listings, 'y');
      return '';
    }).join('');
  }
}

// Kart İçi Tıklama Olayları
if($('#list')) {
  $('#list').addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act, id = +b.dataset.id, k = b.dataset.k, T = (k === 'y' ? 'yang_listings' : 'items');

    if (act === 'fav') {
      if (favorites.has(id)) favorites.delete(id);
      else favorites.add(id);
      localStorage.setItem('favs', JSON.stringify([...favorites]));
      
      // Butonun görünümünü anlık güncelle (Tüm listeyi baştan yükleyip kart çoğaltmayı önler)
      b.classList.toggle('gold', favorites.has(id));
      b.textContent = favorites.has(id) ? '❤️' : '🤍';
      return;
    }

    if (act === 'copy') {
      try {
        await navigator.clipboard.writeText('/w ' + b.dataset.nick);
        toast('Oyundaki nick kopyalandı!');
      } catch(err) {}
      return;
    }

    if (act === 'del') {
      if (!confirm('İlanı silmek istediğinize emin misiniz?')) return;
      await sb.from(T).delete().eq('id', id).eq('user_id', user.id);
      toast('İlan silindi.');
      load(true);
      return;
    }
  });
}

// Sekme Tıklamaları
if($('#tabItems')) $('#tabItems').onclick = () => setView('items');
if($('#tabYang')) $('#tabYang').onclick = () => setView('yang');
if($('#tabFeat')) $('#tabFeat').onclick = () => setView('feat');
if($('#tabPrem')) $('#tabPrem').onclick = () => setView('prem');
if($('#tabMine')) $('#tabMine').onclick = () => setView('mine');
if($('#tabAdmin')) $('#tabAdmin').onclick = () => setView('admin');

// Filtre Dinleyicileri
['fName', 'fEfsun'].forEach(id => {
  if($('#' + id)) {
    $('#' + id).addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => load(true), 500);
    });
  }
});
['fCat', 'fPlus', 'fSort', 'fCur', 'fSrv', 'fySrv', 'fyUnit', 'fySort'].forEach(id => {
  if($('#' + id)) $('#' + id).addEventListener('change', () => load(true));
});

if($('#resetBtn')) {
  $('#resetBtn').onclick = () => {
    ['fName', 'fEfsun', 'fCat', 'fPlus', 'fCur', 'fSrv', 'fySrv', 'fyUnit'].forEach(id => { if($('#' + id)) $('#' + id).value = ''; });
    load(true);
  };
}

if($('#moreBtn')) $('#moreBtn').onclick = () => { page++; load(false); };

initCatalog();
