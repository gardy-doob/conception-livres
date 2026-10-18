(() => {
'use strict';
/* ================= constants ================= */
const STAGES=[['cdf','Chemin de fer'],['photos','Photos'],['template','Template'],['texte','Texte'],['mep','Mise en page'],['relecture','Relecture']];
const ST={todo:{label:'Pas commencé',next:'wait',w:0},wait:{label:'À faire',next:'doing',w:0},doing:{label:'En cours',next:'done',w:.5},done:{label:'Fait',next:'todo',w:1}};
const FAMILIES=['Base','Pêle-mêle','Mixte','Mise en avant','Spéciale'];
const HUES=[12,48,95,150,190,215,260,300,330,28,120,175,240,280];
const LS_KEY='atelier-cdf-v1';
const IMG_EXT=/\.(jpe?g|png|webp|gif|tiff?|heic|heif|psd|dng|cr2|cr3|nef|arw|raf|orf|rw2)$/i;
const BROWSER_IMG=/\.(jpe?g|png|webp|gif)$/i;
const I_LOCK='<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const I_UNLOCK='<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.4-1" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const I_TRASH='<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const I_FOLDER='<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.5 4a1 1 0 0 1 1-1h3.6l1.4 1.5h5.9a1 1 0 0 1 1 1v6.8a1 1 0 0 1-1 1h-10.9a1 1 0 0 1-1-1z" fill="currentColor" opacity=".8"/></svg>';

/* ================= state ================= */
let books=new Map(), captures={}, loaded=false, mode='init', db=null, assets=null, downloads=null;
const view={route:'avancement',id:null,tab:'cdf',cdfMode:'plan',sel:new Set(),last:null,highlight:'',armed:null,showNew:false,newErr:'',active:null,psEvent:'',sim:{pages:96,max:5}};
const pending=new Map(); const deleted=new Set();
let needsRender=false, drag=null;
// Session only: local files stay on the computer, except layout images you assign (uploaded, reduced)
const tray={items:[],hideUsed:false};
const lib={bookId:null,loaded:{},root:'',items:[],byPath:new Map(),dirs:new Set(),cwd:'',sub:true,sort:'exif',hideUsed:false,size:120,sel:new Set(),lastSel:null,loading:null};

/* ================= utils ================= */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const clone=o=>JSON.parse(JSON.stringify(o));
const natural=(a,b)=>a.localeCompare(b,'fr',{numeric:true,sensitivity:'base'});
const ranges=nums=>{const a=[...nums].sort((x,y)=>x-y);const out=[];let s=null,p=null;for(const n of a){if(s===null){s=p=n;continue}if(n===p+1){p=n;continue}out.push(s===p?`${s}`:`${s}–${p}`);s=p=n}if(s!==null)out.push(s===p?`${s}`:`${s}–${p}`);return out.join(', ')};
function toast(msg){document.querySelectorAll('.toast').forEach(x=>x.remove());const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2800)}
const fmtDay=ms=>new Date(ms).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const fmtDayShort=ms=>new Date(ms).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
const fmtTime=ms=>new Date(ms).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
const dayKey=ms=>{const d=new Date(ms);return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate()};
const baseName=p=>p.split('/').pop();
const jalCmp=(a,z)=>a.t-z.t||natural(a.n,z.n); // same order as the photo grid (date, then file name)
const segPaths=[];
const I_DBL='<svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true"><rect x="1" y="1" width="7" height="10" rx="1" fill="currentColor"/><rect x="10" y="1" width="7" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.5"/></svg>';
const I_DBL_FULL='<svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true"><rect x="1" y="1" width="7" height="10" rx="1" fill="currentColor"/><rect x="10" y="1" width="7" height="10" rx="1" fill="currentColor"/></svg>';
const I_CUT='<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="4" cy="4.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="4" cy="11.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.8 5.8 14 12.5M5.8 10.2 14 3.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
function normBook(b){
  b.stages=Object.assign({cdf:'todo',photos:'todo',template:'todo',texte:'todo',mep:'todo',relecture:'todo'},b.stages||{});
  b.events=b.events||[];b.pages=b.pages||{};b.layouts=b.layouts||[];b.spreads=b.spreads||{};b.pins=b.pins||{};b.assign=b.assign||{};b.jalons=b.jalons||[];b.spreadNames=b.spreadNames||{};
  b.pageCount=+b.pageCount||0;b.maxReuse=+b.maxReuse||5;b.note=b.note||'';b.year=+b.year||new Date().getFullYear();
  if(b.useTypes===undefined)b.useTypes=b.layouts.some(l=>l.family);
  b.layouts.forEach(l=>{if(l.locked===undefined)l.locked=l.family==='Spéciale'});
  return b}

/* ================= book maths ================= */
function spreadsOf(n){const s=[];if(n<1)return s;s.push({key:0,l:null,r:1});for(let L=2;L<=n;L+=2)s.push({key:L,l:L,r:L+1<=n?L+1:null});return s}
const spreadKeyOf=p=>p<2?0:p-(p%2);
const spreadPages=(b,k)=>(+k)===0?[1]:[+k,+k+1].filter(p=>p<=b.pageCount);
const photoSide=(key,a)=>+key===0?'r':(a.s==='r'?'r':'l');
const plancheNo=k=>(+k)===0?1:(+k)/2+1;                 // planche 1 = page 1 alone, planche 2 = p. 2–3, planche 5 = p. 8–9
const plancheKey=n=>n<=1?0:(n-1)*2;
const sideOf=p=>p===1||p%2===1?'droite':'gauche';
const spreadLabel=(b,k)=>{const nm=b.spreadNames&&b.spreadNames[k];return `Pl. ${plancheNo(k)} · p. ${spreadPages(b,k).join('–')}${nm?' · '+nm:''}`};
function pagesLabel(pages){ // "Pl. 2 · p. 3 (droite)" or "Pl. 3–4 · p. 4–7"
  if(!pages.length)return '';const pls=[...new Set(pages.map(p=>plancheNo(spreadKeyOf(p))))];
  return `Pl. ${ranges(pls)} · p. ${ranges(pages)}${pages.length===1?` (${sideOf(pages[0])})`:''}`}

/* ---- moving an event: everything after the target moves by whole planches, so each page keeps its side ---- */
const SPREAD_MAPS=['spreads','assign','pins','spreadNames'];
function planMove(b0,evId,T,Lp){
  const b=clone(b0);b.spreadNames=b.spreadNames||{};
  const own=Object.keys(b.pages).map(Number).filter(p=>b.pages[p]===evId).sort((a,z)=>a-z);
  const contiguous=own.every((p,i)=>i===0||p===own[i-1]+1);
  // planches fully owned by the event travel with it (layout, photos, name, lock) when the target is a left page
  const owned=spreadsOf(b.pageCount).filter(s=>{const pg=spreadPages(b,s.key);return pg.length===2&&pg.every(p=>b.pages[p]===evId)}).map(s=>s.key);
  const carry=(T%2===0&&contiguous&&own.length===Lp&&owned.length)?owned.map(k=>{const o={};SPREAD_MAPS.forEach(m=>{if(b[m]&&b[m][k]!==undefined){o[m]=b[m][k];delete b[m][k]}});return o}):[];
  own.forEach(p=>delete b.pages[p]);
  const busy=p=>!!b.pages[p];const S=2*Math.ceil(Lp/2);let G=null;
  const maxUsed=Math.max(0,...Object.keys(b.pages).map(Number));
  if([...Array(Lp).keys()].some(i=>busy(T+i))){
    // find the first gap of S free pages after T (same parity): the shift stops there instead of pushing the whole book
    for(let g=T+1;;g++){if((g-T)%2)continue;if(g>maxUsed+1){G=g;break}let free=true;for(let i=0;i<S;i++)if(busy(g+i)){free=false;break}if(free){G=g;break}}
    const np={};for(const [p,e] of Object.entries(b.pages)){const n=+p;np[n>=T&&n<G?n+S:n]=e}b.pages=np;
    for(const m of SPREAD_MAPS){if(!b[m])continue;const nm={};for(const [k,v] of Object.entries(b[m])){const n=+k;nm[n>0&&n>=T&&n<G?n+S:n]=v}b[m]=nm}
  }
  for(let i=0;i<Lp;i++)b.pages[T+i]=evId;
  carry.forEach((o,i)=>{const k=T+2*i;for(const m in o)b[m][k]=o[m]});
  const newMax=Math.max(0,...Object.keys(b.pages).map(Number));
  const grow=newMax>b.pageCount?Math.ceil(newMax/4)*4:0;if(grow)b.pageCount=grow;
  return {b,own,contiguous,shift:G==null?null:{from:T,to:G-1,S},grow,carried:carry.length};
}
const mv={};
function openMove(evId,mode,target){
  const b=cur();const e=b.events.find(x=>x.id===evId);if(!e)return;
  const own=Object.keys(b.pages).map(Number).filter(p=>b.pages[p]===evId).sort((a,z)=>a-z);
  Object.assign(mv,{evId,mode:mode||'page',page:mode==='planche'?'':(target||''),planche:mode==='planche'?target:'',size:own.length===1||!own.length?'keep':'keep'});
  showModal(`<div class="row" style="justify-content:space-between"><h3>Déplacer « ${esc(e.name.slice(0,60))} »</h3><button class="btn ghost sm" data-act="close-overlay">Fermer</button></div>
    <p class="small muted" style="margin:0">Actuellement : <b>${own.length?esc(pagesLabel(own)):'aucune page'}</b>. Les événements suivants avancent par planches entières : chaque page garde son côté (gauche ou droite). Un espace libre plus loin absorbe le décalage.</p>
    <div class="row"><label class="check"><input type="radio" name="mv-mode" value="page" ${mv.mode==='page'?'checked':''}> Vers la page</label><input class="f mono" id="mv-page" type="number" min="1" style="width:80px" value="${esc(mv.page)}">
      <label class="check"><input type="radio" name="mv-mode" value="planche" ${mv.mode==='planche'?'checked':''}> Vers la planche (double page entière)</label><input class="f mono" id="mv-planche" type="number" min="1" style="width:80px" value="${esc(mv.planche)}"></div>
    <div id="mv-preview"></div>`,'wide');
  renderMovePreview();
}
function moveTarget(b){
  const own=Object.keys(b.pages).map(Number).filter(p=>b.pages[p]===mv.evId);const L=Math.max(1,own.length);
  if(mv.mode==='planche'){const n=parseInt(mv.planche);if(!n||n<1)return null;if(n===1)return {T:1,Lp:1};return {T:plancheKey(n),Lp:2*Math.ceil(L/2)}}
  const T=parseInt(mv.page);if(!T||T<1)return null;return {T,Lp:L};
}
function renderMovePreview(){
  const el=document.getElementById('mv-preview');if(!el)return;const b=cur();const t=moveTarget(b);
  if(!t){el.innerHTML='<p class="small muted">Indiquez un numéro de page ou de planche.</p>';return}
  const r=planMove(b,mv.evId,t.T,t.Lp);const dest=[...Array(t.Lp).keys()].map(i=>t.T+i);
  const lines=[`Occupera <b>${esc(pagesLabel(dest))}</b>.`];
  if(!r.contiguous)lines.push('Ses pages non consécutives seront regroupées.');
  if(r.shift)lines.push(`Les pages ${r.shift.from} à ${r.shift.to} avancent ${r.shift.S>2?`de ${r.shift.S/2} planches`:'d\'une planche'} (${r.shift.S} pages), en gardant leur côté.`);else lines.push('Aucun autre événement ne bouge : la place est libre.');
  if(r.carried)lines.push(`Sa mise en page, ses photos et le nom de ${r.carried>1?'ses planches':'sa planche'} le suivent.`);
  if(r.own.length)lines.push(r.own.length>1?`Les pages ${ranges(r.own)} deviennent libres.`:`La page ${r.own[0]} devient libre.`);
  if(r.grow)lines.push(`<span class="err">Le livre passe de ${b.pageCount} à ${r.grow} pages.</span>`);
  el.innerHTML=`<div class="panel" style="padding:10px;display:grid;gap:6px">${lines.map(l=>`<span class="small">${l}</span>`).join('')}<div><button class="btn primary" data-act="mv-apply">Déplacer</button></div></div>`;
}
function moveNow(b,evId,mode,target){
  Object.assign(mv,{evId,mode,page:mode==='page'?target:'',planche:mode==='planche'?target:''});
  const t=moveTarget(b);if(!t)return;remember(b);const r=planMove(b,evId,t.T,t.Lp);books.set(b.id,normBook(r.b));save(books.get(b.id));
  const dest=[...Array(t.Lp).keys()].map(i=>t.T+i);
  toastUndo(`Placé ${pagesLabel(dest)}`+(r.shift?` · la suite avance de ${r.shift.S/2} planche${r.shift.S>2?'s':''}`:'')+(r.grow?` · le livre passe à ${r.grow} pages`:''));
}
function applyMove(){const b=cur();const t=moveTarget(b);if(!t)return;remember(b);const r=planMove(b,mv.evId,t.T,t.Lp);closeOverlay();books.set(b.id,normBook(r.b));save(books.get(b.id));toastUndo(r.grow?`Événement déplacé, le livre passe à ${r.grow} pages`:'Événement déplacé')}
function usage(b){const u={};const valid=new Set(spreadsOf(b.pageCount).map(s=>String(s.key)));
  for(const [k,lid] of Object.entries(b.spreads)) if(valid.has(k)&&lid){(u[lid]=u[lid]||[]).push(+k)}
  for(const k in u)u[k].sort((a,b)=>a-b);return u}
function evById(b){const m={};b.events.forEach(e=>m[e.id]=e);return m}
function layById(b){const m={};b.layouts.forEach(l=>m[l.id]=l);return m}
function eventPages(b){const m={};for(let p=1;p<=b.pageCount;p++){const e=b.pages[p];if(e)(m[e]=m[e]||[]).push(p)}return m}
function capacity(b){
  const lay=layById(b);const out={};
  for(const s of spreadsOf(b.pageCount)){
    const pages=[s.l,s.r].filter(Boolean);const l=lay[b.spreads[s.key]];const placed=(b.assign[s.key]||[]).length;
    for(const p of pages){const e=b.pages[p];if(!e)continue;const o=out[e]=out[e]||{slots:0,known:true,spreads:new Set(),layouts:new Set(),placed:0};
      if(!o.spreads.has(s.key))o.placed+=placed;o.spreads.add(s.key);
      if(l){o.layouts.add(l.id);if(l.photos>0)o.slots+=l.photos/pages.length;else o.known=false}else o.known=false}
  }
  for(const k in out)out[k].slots=Math.round(out[k].slots);return out;
}
function metrics(b){
  const sp=spreadsOf(b.pageCount), ev=evById(b), u=usage(b), max=b.maxReuse;
  let filled=0;for(let p=1;p<=b.pageCount;p++)if(ev[b.pages[p]])filled++;
  const withLay=sp.filter(s=>b.layouts.some(l=>l.id===b.spreads[s.key])).length;
  const over=b.layouts.filter(l=>(u[l.id]||[]).length>max);
  const needed=sp.length?Math.ceil(sp.length/max):0;
  const cap=capacity(b);const short=b.events.filter(e=>e.photos>0&&cap[e.id]&&cap[e.id].known&&cap[e.id].slots<e.photos);
  const valid=new Set(sp.map(s=>String(s.key)));
  const placed=Object.entries(b.assign).filter(([k])=>valid.has(k)).reduce((a,[,v])=>a+v.length,0);
  return {sp,filled,withLay,over,needed,short,u,cap,placed};
}
function progress(b){return STAGES.reduce((a,[k])=>a+ST[b.stages[k]||'todo'].w,0)/STAGES.length}
function usedPaths(b){const m=new Map();if(!b)return m;for(const [k,arr] of Object.entries(b.assign))for(const a of arr){if(!m.has(a.p))m.set(a.p,[]);m.get(a.p).push(+k)}return m}

/* ================= storage ================= */
function setSaved(t){document.getElementById('saved').textContent=t}
/* Local mode: each book is its own record in the browser's database (IndexedDB), so nothing hits the 5 MB limit,
   and every write pings the other open tabs of the same index.html so they reload that book. */
const TAB_ID=Math.random().toString(36).slice(2);const PING='atelier-ping';
const IDB={db:null,ok:false};let dirHandles={};
function idbOpen(){return new Promise(res=>{try{const r=indexedDB.open('atelier-chemin-de-fer',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>{IDB.db=r.result;IDB.ok=true;res(true)};r.onerror=()=>res(false);r.onblocked=()=>res(false);setTimeout(()=>res(false),4000)}catch(e){res(false)}})}
function idbReq(mode,fn){return new Promise((res,rej)=>{try{const tx=IDB.db.transaction('kv',mode);const q=fn(tx.objectStore('kv'));tx.oncomplete=()=>res(q&&'result' in q?q.result:undefined);tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)}catch(e){rej(e)}})}
const idbGet=k=>idbReq('readonly',st=>st.get(k));
const idbPut=(k,v)=>idbReq('readwrite',st=>st.put(v,k));
const idbDel=k=>idbReq('readwrite',st=>st.delete(k));
async function idbAll(){const keys=await idbReq('readonly',st=>st.getAllKeys());const vals=await idbReq('readonly',st=>st.getAll());const m=new Map();keys.forEach((k,i)=>m.set(k,vals[i]));return m}
function ping(msg){try{localStorage.setItem(PING,JSON.stringify({...msg,from:TAB_ID,t:Date.now()}))}catch(e){}}
const stamp=()=>new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
async function saveLocal(id,removed){
  if(IDB.ok){try{
      if(id&&removed)await idbDel('book:'+id);
      else if(id){const b=books.get(id);if(b)await idbPut('book:'+id,clone(b))}
      else{for(const b of books.values())await idbPut('book:'+b.id,clone(b))}
      ping(id?{book:id}:{all:1});setSaved('Enregistré dans ce navigateur · '+stamp());return}
    catch(e){toast("Impossible d'enregistrer dans le navigateur : "+(e&&e.name==='QuotaExceededError'?'espace plein.':'stockage bloqué.'));setSaved('Non enregistré');return}}
  try{localStorage.setItem(LS_KEY,JSON.stringify({books:[...books.values()],captures}));ping(id?{book:id}:{all:1});setSaved('Enregistré dans ce navigateur · '+stamp())}catch(e){toast("Impossible d'enregistrer : stockage du navigateur plein ou bloqué. Faites une sauvegarde (.json).")}}
async function loadIDB(){
  const all=await idbAll();let n=0;
  for(const [k,v] of all){if(k.startsWith('book:')){const nb=normBook(v);books.set(nb.id,nb);baseline(nb);n++}else if(k.startsWith('cap:'))captures[k.slice(4)]=v;else if(k.startsWith('dirs:'))dirHandles[k.slice(5)]=Object.assign(dirHandles[k.slice(5)]||{},v);else if(k.startsWith('dir:')){const bid=k.slice(4);dirHandles[bid]=Object.assign({f0:v},dirHandles[bid]||{})}else if(k.startsWith('ver:'))versions.push(v)}
  if(!n){ // first launch: take the older localStorage save, or the books shipped with the app
    let d=null;try{d=JSON.parse(localStorage.getItem(LS_KEY)||'null')}catch(e){}
    if(!d&&window.ATELIER_DATA)d=window.ATELIER_DATA;
    if(d){(d.books||[]).forEach(b=>{const nb=normBook(b);books.set(nb.id,nb);baseline(nb)});captures=d.captures||{};
      for(const b of books.values())await idbPut('book:'+b.id,clone(b));for(const [k,v] of Object.entries(captures))await idbPut('cap:'+k,v)}
  }
}
window.addEventListener('storage',async e=>{
  if(mode!=='local')return;
  if(e.key===PING&&e.newValue){let m;try{m=JSON.parse(e.newValue)}catch(_){return}if(m.from===TAB_ID)return;
    if(IDB.ok){
      if(m.book){const v=await idbGet('book:'+m.book);if(v){const nb=normBook(v);books.set(nb.id,nb);baseline(nb)}else books.delete(m.book)}
      else if(m.cap){const v=await idbGet('cap:'+m.cap);if(v)captures[m.cap]=v}
      else if(m.ver){versions=versions.filter(x=>x.key!==m.ver);if(!m.del){const v=await idbGet('ver:'+m.ver);if(v)versions.push(v)}renderHistSlot();return}
      else if(m.all){books=new Map();captures={};await loadIDB()}
    }else{books=new Map();loadLocal()}
    setSaved('Mis à jour depuis un autre onglet · '+stamp());softRender();
  }
});
function loadLocal(){try{let d=JSON.parse(localStorage.getItem(LS_KEY)||'null');if(!d&&window.ATELIER_DATA)d=window.ATELIER_DATA;if(d){d.books.forEach(b=>{const nb=normBook(b);books.set(b.id,nb);baseline(nb)});captures=d.captures||{}}}catch(e){}}
/* ---- history: every saved change is recorded (before/after) so it can be undone and redone ---- */
const hist=[],redoSt=[],prevState=new Map();let applyingHist=false;
const strip=o=>{if(!o)return null;const c=clone(o);delete c.updatedAt;return c};
const same=(a,z)=>JSON.stringify(a)===JSON.stringify(z);
function baseline(b){prevState.set(b.id,strip(b))}
function autoLabel(a,z){
  if(!a)return 'Livre créé';if(!z)return 'Livre supprimé';
  if(a.title!==z.title)return 'Titre modifié';
  if(!same(a.stages,z.stages)){const k=STAGES.find(([k])=>a.stages[k]!==z.stages[k]);return `Avancement : ${k?k[1]:'étape'} → ${ST[z.stages[k?k[0]:'cdf']]?.label||''}`}
  if(a.note!==z.note)return 'Statut global modifié';
  if(a.pageCount!==z.pageCount)return `Nombre de pages : ${a.pageCount} → ${z.pageCount}`;
  if(a.events.length<z.events.length)return 'Événement ajouté';
  if(a.events.length>z.events.length)return 'Événement supprimé';
  if(!same(a.pages,z.pages)){const keys=new Set([...Object.keys(a.pages),...Object.keys(z.pages)]);const n=[...keys].filter(k=>a.pages[k]!==z.pages[k]).length;return `Événements sur les pages (${n} page${n>1?'s':''})`}
  if(!same(a.events,z.events))return a.events.some((e,i)=>z.events[i]&&e.name!==z.events[i].name)?"Texte d'événement modifié":'Événement modifié';
  if(!same(a.spreads,z.spreads))return 'Mise en page de planche';
  if(!same(a.layouts,z.layouts))return 'Mises en page modifiées';
  if(!same(a.assign,z.assign))return 'Photos placées';
  if(!same(a.jalons,z.jalons))return 'Jalons';
  if(!same(a.spreadNames,z.spreadNames))return 'Nom de planche';
  if(!same(a.pins,z.pins))return 'Verrou de planche';
  return 'Modification';
}
/* ---- versions: saved snapshots of a book, kept between sessions (automatic at the start of each session, or by hand) ---- */
let versions=[];const sessVer=new Set();
async function storeVersion(v){
  if(mode==='db'){await db.doc('versions/'+v.key).set({bookId:v.id,t:v.t,label:v.label,auto:!!v.auto,data:v.data})}
  else if(IDB.ok){await idbPut('ver:'+v.key,v);ping({ver:v.key})}
}
async function dropVersion(v){versions=versions.filter(x=>x.key!==v.key);try{if(mode==='db')await db.doc('versions/'+v.key).delete();else if(IDB.ok){await idbDel('ver:'+v.key);ping({ver:v.key,del:1})}}catch(e){}}
function addVersion(id,data,label,auto){
  if(!data)return;const t=Date.now();const v={key:id+'~'+t,id,t,label,auto:!!auto,data:clone(data)};versions.push(v);
  storeVersion(v).catch(()=>toast("La version n'a pas pu être enregistrée."));
  const autos=versions.filter(x=>x.id===id&&x.auto).sort((a,z)=>z.t-a.t);autos.slice(20).forEach(dropVersion); // keep the 20 latest automatic ones
  renderHistSlot();return v;
}
function restoreVersion(key){
  const v=versions.find(x=>x.key===key);if(!v)return;const curB=books.get(v.id);
  if(curB)addVersion(v.id,strip(curB),'Avant restauration',true);
  const nb=normBook({...clone(v.data),id:v.id});deleted.delete(v.id);books.set(v.id,nb);save(nb);
  const top=hist[hist.length-1];if(top){top.label='Version restaurée : '+(v.label||fmtVer(v.t));top.sealed=true}
  view.hist=false;renderHistSlot();toastUndo('Version du '+fmtVer(v.t)+' restaurée');
}
const fmtVer=t=>new Date(t).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
function record(b,after){
  const before=prevState.has(b.id)?prevState.get(b.id):null;after=after===undefined?strip(b):after;
  if(before&&after&&same(before,after))return;
  if(before&&!applyingHist&&!sessVer.has(b.id)){sessVer.add(b.id);addVersion(b.id,before,'Début de séance',true)}
  const label=autoLabel(before,after);const now=Date.now();const top=hist[hist.length-1];
  if(top&&top.id===b.id&&top.label===label&&now-top.t<1500&&!top.sealed){top.after=after;top.t=now}
  else{hist.push({id:b.id,title:b.title,label,before,after,t:now});if(hist.length>150)hist.shift()}
  redoSt.length=0;if(after)prevState.set(b.id,after);else prevState.delete(b.id);renderHistSlot();
}
function applyState(id,state){
  applyingHist=true;
  try{if(!state){removeBook(id)}else{deleted.delete(id);const nb=normBook({...clone(state),id});books.set(id,nb);save(nb,true)}prevState.set(id,state);if(!state)prevState.delete(id)}
  finally{applyingHist=false}
  view.edit=null;view.lpick=null;render();
}
function applyEntry(h,dir){
  const target=dir==='before'?h.before:h.after,other=dir==='before'?h.after:h.before;const cur_=books.get(h.id);
  if(!target||!other||!cur_){applyState(h.id,target);return}
  const nb=strip(cur_);for(const k of new Set([...Object.keys(target),...Object.keys(other)]))if(!same(target[k],other[k])){if(target[k]===undefined)delete nb[k];else nb[k]=clone(target[k])}
  applyState(h.id,nb);
}
function histUndo(){const h=hist.pop();if(!h){toast('Rien à annuler');return}h.sealed=true;redoSt.push(h);applyEntry(h,'before');toast(`Annulé : ${h.label}`)}
function histRedo(){const h=redoSt.pop();if(!h){toast('Rien à rétablir');return}hist.push(h);applyEntry(h,'after');toast(`Rétabli : ${h.label}`)}
const IS_MAC=/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent||'');
const KEY_UNDO=IS_MAC?'⌘Z':'Ctrl+Z',KEY_REDO=IS_MAC?'⌘Y':'Ctrl+Y';
function verSection(){
  const b=view.route==='livre'?books.get(view.id):null;if(!b)return '<div class="menu-sep"></div><p class="small muted" style="padding:4px 10px;margin:0">Ouvrez un livre pour voir ses versions.</p>';
  if(mode==='local'&&!IDB.ok)return '';
  const list=versions.filter(v=>v.id===b.id).sort((a,z)=>z.t-a.t);
  return `<div class="menu-sep"></div><div class="menu-y">Versions de « ${esc(b.title)} »</div>
    <form class="row ver-new" id="ver-form"><input class="f sm" id="ver-name" placeholder="Nom de la version (facultatif)"><button class="btn sm" type="submit">Enregistrer une version</button></form>
    ${list.length?list.map(v=>`<div class="hver"><span class="mono muted">${esc(fmtVer(v.t))}</span><span class="hl">${esc(v.label||'Version')}${v.auto?' <span class="muted small">(auto)</span>':''}</span>
      ${view.armed==='ver:'+v.key?`<span class="row" style="gap:4px"><button class="btn sm armed" data-act="ver-restore" data-key="${esc(v.key)}">Confirmer</button><button class="btn ghost sm" data-act="ver-cancel">Annuler</button></span>`:`<button class="btn ghost sm" data-act="ver-arm" data-key="${esc(v.key)}">Restaurer</button>`}</div>`).join('')
      :'<p class="small muted" style="padding:4px 10px;margin:0">Aucune version pour l\'instant. Une version est créée automatiquement au début de chaque séance de travail.</p>'}`;
}
function renderHistSlot(){
  const el=document.getElementById('hist-slot');if(!el)return;
  const list=[...redoSt.map((h,i)=>({h,kind:'redo',i})),...hist.map((h,i)=>({h,kind:'undo',i})).reverse()];
  el.innerHTML=`<span class="burger hist"><button class="icon-btn" data-act="hist" aria-expanded="${!!view.hist}" title="Historique (${KEY_UNDO} annuler · ${KEY_REDO} rétablir)" aria-label="Historique"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.4h2.4M8 5v3.2l2.2 1.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>${hist.length?`<span class="hcount mono">${hist.length}</span>`:''}</button>
    ${view.hist?`<div class="menu panel histmenu"><div class="row hist-actions"><button class="btn sm" data-act="h-undo" ${hist.length?'':'disabled'}>↶ Annuler <span class="kbd">${KEY_UNDO}</span></button><button class="btn sm" data-act="h-redo" ${redoSt.length?'':'disabled'}>↷ Rétablir <span class="kbd">${KEY_REDO}</span></button></div>
      ${list.length?list.map(({h,kind,i})=>`<button class="hitem ${kind}" data-act="h-goto" data-kind="${kind}" data-i="${i}" title="${kind==='undo'?'Revenir juste avant cette modification':'Rétablir jusqu\'à cette modification'}"><span class="mono muted">${fmtTime(h.t)}</span><span class="hl">${esc(h.label)}</span><span class="muted hb">${esc(h.title||'')}</span></button>`).join(''):'<p class="small muted" style="padding:6px 10px;margin:0">Aucune modification dans cette séance.</p>'}
      <p class="small muted" style="padding:4px 10px;margin:0">L'historique ci-dessus couvre la séance en cours.</p>
      ${verSection()}</div>`:''}</span>`;
}
function save(b,quiet){b.updatedAt=new Date().toISOString();books.set(b.id,b);if(!applyingHist)record(b);if(!quiet)render();
  if(mode!=='db'){saveLocal(b.id);return}
  const p=pending.get(b.id)||{};clearTimeout(p.t);p.t=setTimeout(()=>flush(b.id),450);pending.set(b.id,p);setSaved('Enregistrement…')}
async function flush(id){const p=pending.get(id);if(!p)return;if(p.writing){p.again=true;return}
  const b=books.get(id);if(!b){pending.delete(id);return}
  p.writing=true;const {id:_,...data}=b;
  try{await db.doc('books/'+id).set(clone(data));setSaved('Enregistré')}
  catch(e){toast(e&&e.code==='quota_exceeded'?"Espace de stockage plein : supprimez des images ou des livres.":"Enregistrement impossible pour l'instant. Réessayez dans un moment.");setSaved('Non enregistré')}
  p.writing=false;if(p.again){p.again=false;flush(id)}else pending.delete(id)}
async function removeBook(id){const old=books.get(id);if(old&&!applyingHist)record(old,null);books.delete(id);deleted.add(id);
  if(mode==='db'){try{await db.doc('books/'+id).delete()}catch(e){toast('Suppression impossible pour le moment.')}}else saveLocal(id,true)}
async function putCapture(key,data){captures[key]=data;
  if(mode==='db'){try{await db.doc('captures/'+key).set({data})}catch(e){toast("Image non enregistrée : l'espace est peut-être plein.")}}
  else if(IDB.ok){try{await idbPut('cap:'+key,data);ping({cap:key})}catch(e){toast("Image non enregistrée : l'espace du navigateur est peut-être plein.")}}
  else{try{localStorage.setItem(LS_KEY,JSON.stringify({books:[...books.values()],captures}))}catch(e){toast("Image non enregistrée : stockage du navigateur plein.")}}}
async function boot(){
  render();
  const use=n=>(window.claude&&window.claude.use)?window.claude.use(n).catch(()=>null):Promise.resolve(null);
  [db,downloads]=await Promise.all([use('db'),use('downloads')]);
  if(db){
    mode='db';assets=await use('assets');
    db.collection('books').onSnapshot(snap=>{
      const seen=new Set();
      for(const d of snap.docs){seen.add(d.id);if(pending.has(d.id)||deleted.has(d.id))continue;{const nb=normBook({id:d.id,...clone(d.data())});books.set(d.id,nb);baseline(nb)}}
      for(const id of [...books.keys()])if(!seen.has(id)&&!pending.has(id))books.delete(id);
      loaded=true;setSaved('Synchronisé');softRender();
    },()=>toast('Connexion aux données interrompue. Rechargez la page.'));
    db.collection('versions').onSnapshot(snap=>{versions=snap.docs.map(d=>{const x=d.data();return {key:d.id,id:x.bookId,t:x.t,label:x.label,auto:x.auto,data:x.data}});renderHistSlot()},()=>{});
    db.collection('captures').onSnapshot(snap=>{const c={};snap.docs.forEach(d=>c[d.id]=d.data().data);captures=c;softRender()},()=>{});
  } else {mode='local';if(await idbOpen())await loadIDB();else loadLocal();loaded=true;setSaved(books.size?'Enregistré dans ce navigateur':'');render()}
}
function softRender(){if(drag){needsRender=true;return}const a=document.activeElement;if(a&&a.closest&&a.closest('#app')&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&a.type!=='checkbox'&&a.type!=='range'){needsRender=true;return}render()}
document.addEventListener('focusout',()=>{if(needsRender&&!drag){needsRender=false;setTimeout(()=>{const a=document.activeElement;if(!(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)))render();else needsRender=true},0)}});

/* ================= images ================= */
function loadImg(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file);const i=new Image();i.onload=()=>{res(i);setTimeout(()=>URL.revokeObjectURL(u),1000)};i.onerror=rej;i.src=u})}
async function shrink(file,max,q,asBlob){const img=await loadImg(file);const s=Math.min(1,max/img.naturalWidth);const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*s);c.height=Math.round(img.naturalHeight*s);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);
  if(asBlob)return new Promise(r=>c.toBlob(r,'image/jpeg',q));return c.toDataURL('image/jpeg',q)}
const imgSrc=c=>!c?'':c.startsWith('cap:')?(captures[c.slice(4)]||''):c;
async function storeImage(file,key,max){
  if(assets){const blob=await shrink(file,max,.85,true);const r=await assets.upload(blob);return r.url}
  const data=await shrink(file,Math.min(max,460),.72,false);await putCapture(key,data);return 'cap:'+key}
async function setHalf(bookId,layId,side,file,srcName){
  if(!file||!(/^image\//.test(file.type)||BROWSER_IMG.test(file.name||''))){toast('Choisissez une image (PNG, JPG…).');return}
  const b=books.get(bookId);const l=b&&b.layouts.find(x=>x.id===layId);if(!l)return;
  setSaved("Envoi de l'image…");
  try{const ref=await storeImage(file,bookId+'~'+layId+'~'+side,800);l[side]=ref;l[side+'Src']=srcName||file.name;save(b)}
  catch(e){setSaved('');toast("L'image n'a pas pu être enregistrée.")}
}
function layVisual(l){
  const L=imgSrc(l&&l.left),R=imgSrc(l&&l.right),F=imgSrc(l&&l.capture);
  if(!L&&!R&&F)return `<div class="halves"><div class="half"></div><div class="half"></div><img class="full" src="${esc(F)}" alt=""></div>`;
  return `<div class="halves"><div class="half">${L?`<img src="${esc(L)}" alt="">`:''}</div><div class="half">${R?`<img src="${esc(R)}" alt="">`:''}</div></div>`;
}

/* ================= files out (zip, csv, InDesign) ================= */
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u8){let crc=0xFFFFFFFF;for(let i=0;i<u8.length;i++)crc=CRC_T[(crc^u8[i])&0xFF]^(crc>>>8);return (crc^0xFFFFFFFF)>>>0}
function makeZip(files){
  const enc=new TextEncoder();const parts=[],central=[];let offset=0;
  for(const f of files){const nameB=enc.encode(f.name);const dataB=typeof f.data==='string'?enc.encode(f.data):f.data;const crc=crc32(dataB);
    const lh=new DataView(new ArrayBuffer(30));lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(12,0x21,true);lh.setUint32(14,crc,true);lh.setUint32(18,dataB.length,true);lh.setUint32(22,dataB.length,true);lh.setUint16(26,nameB.length,true);
    parts.push(lh.buffer,nameB,dataB);
    const ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(14,0x21,true);ch.setUint32(16,crc,true);ch.setUint32(20,dataB.length,true);ch.setUint32(24,dataB.length,true);ch.setUint16(28,nameB.length,true);ch.setUint32(42,offset,true);
    central.push(ch.buffer,nameB);offset+=30+nameB.length+dataB.length}
  const cdSize=central.reduce((a,b)=>a+b.byteLength,0);
  const end=new DataView(new ArrayBuffer(22));end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,cdSize,true);end.setUint32(16,offset,true);
  return new Blob([...parts,...central,end.buffer],{type:'application/zip'});
}
function exportRows(b){
  const ev=evById(b),lay=layById(b);const rows=[];
  for(const s of spreadsOf(b.pageCount)){const arr=b.assign[s.key]||[];if(!arr.length)continue;const pages=spreadPages(b,s.key);
    const evs=[...new Set(pages.map(p=>ev[b.pages[p]]&&ev[b.pages[p]].name).filter(Boolean))].join(' / ');const l=lay[b.spreads[s.key]];
    rows.push({key:s.key,label:spreadLabel(b,s.key),pages,event:evs,layout:l?l.name:'',photos:arr})}
  return rows}
function buildCsv(b){
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const lines=[['Planche','Page','Côté','Événement','Mise en page','Ordre sur la page','Chemin','Fichier','Date de prise de vue'].map(q).join(';')];
  for(const r of exportRows(b))for(const side of ['l','r']){const list=r.photos.filter(a=>photoSide(r.key,a)===side);const pg=r.key===0?1:(side==='l'?r.key:r.key+1);
    list.forEach((a,i)=>lines.push([r.label,pg,side==='l'?'gauche':'droite',r.event,r.layout,i+1,a.p,baseName(a.p),a.d?new Date(a.d).toLocaleString('fr-FR'):''].map(q).join(';')))}
  return '﻿'+lines.join('\r\n')}
const asciiJson=o=>JSON.stringify(o,null,1).replace(/[\u007f-￿]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
function buildJsx(b){
  const data={book:b.title,root:b.photoRoot||'',generated:new Date().toLocaleString('fr-FR'),onlyEmpty:true,rowTolerance:3,
    roots:bookFolders(b).slice(1).map(f=>f.name),spreads:exportRows(b).map(r=>({label:r.label,name:(b.spreadNames||{})[r.key]||'',layout:r.layout,event:r.event,sides:(r.key===0?[['r',1]]:[['l',r.key],['r',r.key+1]]).map(([sd,pg])=>({page:pg,photos:r.photos.filter(a=>photoSide(r.key,a)===sd).map(a=>a.p)})).filter(x=>x.photos.length)}))};
  return '\uFEFF'+JSX_TEMPLATE.replace('@@TITLE@@',b.title.replace(/[\r\n]/g,' ')).replace('@@DATE@@',data.generated).replace('@@DATA@@',()=>asciiJson(data));
}
const JSX_TEMPLATE="// Chemin de fer - conception livre : placement des photos dans InDesign\n// Livre : @@TITLE@@ (g\u00e9n\u00e9r\u00e9 le @@DATE@@)\n// Installation : Fen\u00eatre > Utilitaires > Scripts, clic droit sur \u00ab Utilisateur \u00bb > Faire appara\u00eetre dans le Finder / l'Explorateur,\n// copiez ce fichier dans ce dossier, puis double-cliquez sur son nom dans le panneau Scripts (document du livre ouvert).\n// Une palette s'ouvre : choisissez une page, chargez ses photos dans le curseur et cliquez dans les blocs image dans l'ordre voulu,\n// ou utilisez le placement automatique. Chaque action s'annule avec \u00c9dition > Annuler.\n#target indesign\n#targetengine \"cheminDeFerPhotos\"\nvar DATA = @@DATA@@;\n(function () {\n  if (app.documents.length === 0) { alert(\"Ouvrez d'abord le document InDesign du livre.\"); return; }\n  var doc = app.activeDocument, base = null;\n  try { base = doc.filePath; } catch (e) { base = null; }\n  // Finds a photo: first at its path relative to the folder, otherwise by its file name anywhere inside the folder.\n  var indexes = {};\n  function nm(s) { try { s = decodeURI(s); } catch (e) {} return String(s).toLowerCase(); }\n  function walk(folder, depth) {\n    if (depth > 8) return;\n    var items = folder.getFiles();\n    for (var i = 0; i < items.length; i++) {\n      var it = items[i];\n      if (it instanceof Folder) { if (nm(it.name).charAt(0) !== \".\") walk(it, depth + 1); }\n      else { var k = nm(it.name); if (!index[k]) index[k] = it; }\n    }\n  }\n  function fileAt(folder, rel, deep) {\n    if (!folder) return null;\n    var f = new File(folder.fullName + \"/\" + rel); if (f.exists) return f;\n    var parts = rel.split(\"/\");\n    for (var s = 1; s < parts.length; s++) { f = new File(folder.fullName + \"/\" + parts.slice(s).join(\"/\")); if (f.exists) return f; }\n    if (deep === false) return null;\n    if (!indexes[folder.fullName]) { index = {}; walk(folder, 0); indexes[folder.fullName] = index; }\n    return indexes[folder.fullName][nm(parts[parts.length - 1])] || null;\n  }\n  var index = null, extra = {};\n  // Photos of extra folders are stored as \"@folder name/\u2026\": look inside the main folder first, then ask once for that folder\n  function resolve(rel) {\n    if (rel.charAt(0) !== \"@\") return fileAt(base, rel);\n    var cut = rel.indexOf(\"/\"), fname = rel.slice(1, cut), rest = rel.slice(cut + 1);\n    if (extra[fname] === undefined) {\n      var inBase = fileAt(base, fname + \"/\" + rest);\n      if (inBase) return inBase;\n      extra[fname] = Folder.selectDialog(\"S\u00e9lectionnez le dossier photos \u00ab \" + fname + \" \u00bb\") || null;\n    }\n    return extra[fname] ? fileAt(extra[fname], rest) : null;\n  }\n  // Pages to fill, in book order\n  var items = [];\n  for (var i = 0; i < DATA.spreads.length; i++) {\n    var sp = DATA.spreads[i];\n    for (var q = 0; q < sp.sides.length; q++) {\n      var sd = sp.sides[q];\n      items.push({ page: sd.page, photos: sd.photos, label: \"p. \" + sd.page + (sd.page % 2 ? \" (droite)\" : \" (gauche)\") + (sp.name ? \" \u00b7 \" + sp.name : \"\"), event: sp.event });\n    }\n  }\n  if (!items.length) { alert(\"Aucune photo \u00e0 placer.\"); return; }\n  var probe = null;\n  for (var pi = 0; pi < items.length && !probe; pi++) for (var pj = 0; pj < items[pi].photos.length && !probe; pj++) if (items[pi].photos[pj].charAt(0) !== \"@\") probe = items[pi].photos[pj];\n  var tries = [];\n  if (base) { tries.push(base); if (base.parent) tries.push(base.parent); }\n  var found = null;\n  if (!probe) found = base;\n  for (var t = 0; t < tries.length && !found; t++) if (fileAt(tries[t], probe, t === 0)) found = tries[t];\n  while (!found) {\n    var fol = Folder.selectDialog(\"Photos introuvables. S\u00e9lectionnez le dossier qui contient les photos du livre (celui choisi dans l'application : \u00ab \" + DATA.root + \" \u00bb)\");\n    if (!fol) return;\n    if (fileAt(fol, probe)) found = fol;\n    else if (!confirm(\"La photo \u00ab \" + probe.split(\"/\").pop() + \" \u00bb n'est pas dans ce dossier ni ses sous-dossiers.\\nChoisir un autre dossier ?\")) return;\n  }\n  base = found;\n\n  function pageByNumber(n) { var p = doc.pages.itemByName(String(n)); if (p.isValid) return p; if (n - 1 < doc.pages.length) return doc.pages[n - 1]; return null; }\n  function graphicFrames(page) {\n    var out = [], all = page.allPageItems;\n    for (var i = 0; i < all.length; i++) {\n      var it = all[i];\n      if (!(it instanceof Rectangle || it instanceof Polygon || it instanceof Oval)) continue;\n      try { if (it.contentType !== ContentType.GRAPHIC_TYPE) continue; if (it.locked) continue; } catch (e) { continue; }\n      if (DATA.onlyEmpty && it.allGraphics.length > 0) continue;\n      out.push(it);\n    }\n    out.sort(function (a, b) { var A = a.geometricBounds, B = b.geometricBounds; var dy = A[0] - B[0]; if (Math.abs(dy) > DATA.rowTolerance) return dy; return A[1] - B[1]; });\n    return out;\n  }\n  function fitIn(fr) { try { fr.fit(FitOptions.FILL_PROPORTIONALLY); fr.fit(FitOptions.CENTER_CONTENT); } catch (e) {} }\n  function filesOf(item) { var ok = [], miss = []; for (var j = 0; j < item.photos.length; j++) { var f = resolve(item.photos[j]); if (f) ok.push(f); else miss.push(item.photos[j]); } return { ok: ok, miss: miss }; }\n  function autoPlace(list) {\n    var placed = 0, missing = [], noFrame = [], noPage = [];\n    app.doScript(function () {\n      for (var i = 0; i < list.length; i++) {\n        var it = list[i], pg = pageByNumber(it.page);\n        if (!pg) { noPage.push(it.page); continue; }\n        var frames = graphicFrames(pg), fi = 0;\n        for (var j = 0; j < it.photos.length; j++) {\n          var f = resolve(it.photos[j]);\n          if (!f) { missing.push(it.label + \" : \" + it.photos[j]); continue; }\n          if (fi >= frames.length) { noFrame.push(it.label + \" : \" + it.photos[j]); continue; }\n          var fr = frames[fi++];\n          try { fr.place(f); fitIn(fr); placed++; } catch (e) { missing.push(it.label + \" : \" + it.photos[j] + \" (\" + e.message + \")\"); }\n        }\n      }\n    }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, \"Placer les photos (chemin de fer)\");\n    function lst(t, a) { return a.length ? \"\\n\\n\" + t + \" (\" + a.length + \") :\\n\" + a.slice(0, 12).join(\"\\n\") + (a.length > 12 ? \"\\n...\" : \"\") : \"\"; }\n    alert(placed + \" photo(s) plac\u00e9e(s).\" + lst(\"Pas assez de blocs image vides\", noFrame) + lst(\"Fichiers introuvables\", missing) + lst(\"Pages absentes du document\", noPage));\n  }\n\n  // ---------- palette ----------\n  var w = new Window(\"palette\", \"Photos \u00b7 \" + DATA.book, undefined, { resizeable: true });\n  w.orientation = \"column\"; w.alignChildren = [\"fill\", \"top\"]; w.spacing = 6; w.margins = 10;\n  var help = w.add(\"statictext\", undefined, \"1. Choisissez une page.  2. \u00ab Charger dans le curseur \u00bb, puis cliquez dans les blocs image dans l'ordre voulu (\u00c9chap vide le curseur).  Ou s\u00e9lectionnez un bloc et une photo, puis \u00ab Placer dans le bloc \u00bb.\", { multiline: true });\n  help.preferredSize = [440, 44];\n  w.add(\"statictext\", undefined, \"Pages \u00e0 remplir :\");\n  var pageList = w.add(\"listbox\", undefined, []); pageList.preferredSize = [440, 200];\n  for (var i = 0; i < items.length; i++) pageList.add(\"item\", items[i].label + \"  \u2014  \" + items[i].photos.length + \" photo(s)\");\n  w.add(\"statictext\", undefined, \"Photos de la page (ordre de l'application) :\");\n  var photoList = w.add(\"listbox\", undefined, [], { multiselect: true }); photoList.preferredSize = [440, 150];\n  var g1 = w.add(\"group\"); g1.alignment = [\"fill\", \"top\"];\n  var bGo = g1.add(\"button\", undefined, \"Aller \u00e0 la page\");\n  var bGun = g1.add(\"button\", undefined, \"Charger dans le curseur\");\n  var bSel = g1.add(\"button\", undefined, \"Placer dans le bloc\");\n  var g2 = w.add(\"group\"); g2.alignment = [\"fill\", \"top\"];\n  var bAutoPage = g2.add(\"button\", undefined, \"Auto : cette page\");\n  var bAutoAll = g2.add(\"button\", undefined, \"Auto : tout le livre\");\n  var bClose = g2.add(\"button\", undefined, \"Fermer\");\n  var status = w.add(\"statictext\", undefined, items.length + \" pages \u00e0 remplir.\", { truncate: \"end\" }); status.preferredSize = [440, 18];\n  var cur = null, curFiles = null;\n  function current() { return pageList.selection ? items[pageList.selection.index] : null; }\n  function fillPhotos() {\n    photoList.removeAll(); cur = current(); if (!cur) return;\n    curFiles = [];\n    for (var j = 0; j < cur.photos.length; j++) {\n      var f = resolve(cur.photos[j]); curFiles.push(f);\n      photoList.add(\"item\", (j + 1) + \". \" + cur.photos[j].split(\"/\").pop() + (f ? \"\" : \"   (introuvable)\"));\n    }\n    status.text = cur.label + (cur.event ? \" \u00b7 \" + cur.event.split(\"\\n\")[0] : \"\");\n  }\n  function goTo() { if (!cur) return null; var pg = pageByNumber(cur.page); if (!pg) { status.text = \"Page \" + cur.page + \" absente du document.\"; return null; } try { app.activeWindow.activePage = pg; } catch (e) {} return pg; }\n  function chosenFiles() {\n    var out = [];\n    if (photoList.selection && photoList.selection.length) { for (var k = 0; k < photoList.selection.length; k++) { var f = curFiles[photoList.selection[k].index]; if (f) out.push(f); } }\n    else for (var j = 0; j < curFiles.length; j++) if (curFiles[j]) out.push(curFiles[j]);\n    return out;\n  }\n  pageList.onChange = function () { fillPhotos(); goTo(); };\n  bGo.onClick = function () { if (!cur) { status.text = \"Choisissez d'abord une page.\"; return; } goTo(); };\n  bGun.onClick = function () {\n    if (!cur) { status.text = \"Choisissez d'abord une page.\"; return; }\n    var files = chosenFiles(); if (!files.length) { status.text = \"Aucune photo trouv\u00e9e pour cette page.\"; return; }\n    goTo();\n    try { doc.placeGuns.loadPlaceGun(files, false); status.text = files.length + \" photo(s) dans le curseur : cliquez dans les blocs, dans l'ordre voulu.\"; }\n    catch (e) { alert(\"Le curseur charg\u00e9 n'est pas disponible dans cette version d'InDesign.\\nUtilisez \u00ab Placer dans le bloc \u00bb ou le placement automatique.\\n\\n\" + e.message); }\n  };\n  bSel.onClick = function () {\n    if (!cur) { status.text = \"Choisissez d'abord une page.\"; return; }\n    var files = chosenFiles(); if (!files.length) { status.text = \"S\u00e9lectionnez une photo dans la liste.\"; return; }\n    if (!app.selection.length) { status.text = \"S\u00e9lectionnez d'abord un bloc image dans le document.\"; return; }\n    var fr = app.selection[0];\n    try { if (!(fr instanceof Rectangle || fr instanceof Polygon || fr instanceof Oval) && fr.parent) fr = fr.parent; } catch (e) {}\n    if (!(fr instanceof Rectangle || fr instanceof Polygon || fr instanceof Oval)) { status.text = \"La s\u00e9lection n'est pas un bloc image.\"; return; }\n    app.doScript(function () { fr.place(files[0]); fitIn(fr); }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, \"Placer une photo\");\n    status.text = \"\u00ab \" + decodeURI(files[0].name) + \" \u00bb plac\u00e9e.\";\n    if (photoList.selection && photoList.selection.length) { var nx = photoList.selection[photoList.selection.length - 1].index + 1; photoList.selection = null; if (nx < photoList.items.length) photoList.selection = nx; }\n  };\n  bAutoPage.onClick = function () { if (!cur) { status.text = \"Choisissez d'abord une page.\"; return; } goTo(); autoPlace([cur]); };\n  bAutoAll.onClick = function () { autoPlace(items); };\n  bClose.onClick = function () { w.close(); };\n  w.onResizing = w.onResize = function () { this.layout.resize(); };\n  pageList.selection = 0;\n  w.show();\n})();\n";
async function offerFile(filename,data,fallbackText,fallbackName){
  if(!downloads){try{const blob=data instanceof Blob?data:new Blob([data],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);return}catch(e){}}
  if(downloads){try{await downloads.save({filename,data});return}catch(e){const c=e&&e.code;if(c==='declined')return;if(!['unavailable','not_granted','capability_disabled','capability_removed'].includes(c)){toast("Le fichier n'a pas pu être proposé.");return}}}
  showModal(`<h3>Téléchargement indisponible ici</h3><p class="muted small">Copiez le texte ci-dessous et enregistrez-le dans un fichier nommé <b>${esc(fallbackName||filename)}</b>.</p><textarea readonly id="fallback-text">${esc(fallbackText||'')}</textarea><div class="row"><button class="btn primary" data-act="copy-fallback">Copier</button><button class="btn" data-act="close-overlay">Fermer</button></div>`);
}
function showModal(html,cls){document.getElementById('overlay').innerHTML=`<div class="overlay" data-act="overlay-bg"><div class="modal ${cls||''}" role="dialog" aria-modal="true">${html}</div></div>`}
function closeOverlay(){document.getElementById('overlay').innerHTML='';if(lightbox&&lightbox.url)URL.revokeObjectURL(lightbox.url);lightbox=null}

/* ================= photo library (EXIF) ================= */
function parseTiff(v,t){
  if(t+8>v.byteLength)return null;
  const le=v.getUint16(t)===0x4949;const g16=o=>v.getUint16(o,le),g32=o=>v.getUint32(o,le);const res={};
  const readIFD=(off,cb)=>{if(off<0||off+2>v.byteLength)return 0;const n=g16(off);for(let i=0;i<n;i++){const e=off+2+i*12;if(e+12>v.byteLength)break;cb(g16(e),g32(e+4),e+8)}const nx=off+2+n*12;return nx+4<=v.byteLength?g32(nx):0};
  const str=(count,vo)=>{const p=count>4?t+g32(vo):vo;let s='';for(let i=0;i<count-1&&p+i<v.byteLength;i++)s+=String.fromCharCode(v.getUint8(p+i));return s};
  let exifPtr=0,dt0='';
  const next=readIFD(t+g32(t+4),(tag,count,vo)=>{if(tag===0x8769)exifPtr=g32(vo);else if(tag===0x0132)dt0=str(count,vo);else if(tag===0x0112)res.orient=g16(vo)});
  if(exifPtr)readIFD(t+exifPtr,(tag,count,vo)=>{if(tag===0x9003)res.dto=str(count,vo)});
  if(next){let to=0,tl=0;readIFD(t+next,(tag,count,vo)=>{if(tag===0x0201)to=g32(vo);if(tag===0x0202)tl=g32(vo)});if(to&&tl&&t+to+tl<=v.byteLength)res.thumb=[t+to,tl]}
  const d=res.dto||dt0;const m=d&&d.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);if(m&&+m[1]>1900)res.date=new Date(+m[1],m[2]-1,+m[3],+m[4],+m[5],+m[6]).getTime();
  return res}
async function readExif(file){
  try{const buf=await file.slice(0,196608).arrayBuffer();const v=new DataView(buf);if(v.byteLength<12)return null;
    const sig=v.getUint16(0);
    if(sig===0x4949||sig===0x4D4D){const r=parseTiff(v,0);if(r)delete r.thumb;return r}
    if(sig!==0xFFD8)return null;
    let o=2;while(o<v.byteLength-10){const m=v.getUint16(o);if((m&0xFF00)!==0xFF00)break;const len=v.getUint16(o+2);
      if(m===0xFFE1&&v.getUint32(o+4)===0x45786966){const r=parseTiff(v,o+10);if(r&&r.thumb)r.thumbBlob=new Blob([buf.slice(r.thumb[0],r.thumb[0]+r.thumb[1])],{type:'image/jpeg'});return r}
      if(m===0xFFDA)break;o+=2+len}
  }catch(e){}return null}
/* ---- photo folders: each book has its own list (first = main folder, others anywhere on the computer) ----
   Paths of the main folder are stored as before (relative to it); paths of extra folders start with "@name/". */
function bookFolders(b){if(!b.photoFolders){b.photoFolders=b.photoRoot?[{id:'f0',name:b.photoRoot}]:[]}return b.photoFolders}
const folderPrefix=(b,fid)=>{const fs=bookFolders(b);const f=fs.find(x=>x.id===fid);return !f||fs[0].id===fid?'':'@'+f.name+'/'};
function persistHandles(b){if(IDB.ok)idbPut('dirs:'+b.id,dirHandles[b.id]||{}).catch(()=>{})}
function resetLib(){lib.items.forEach(it=>{if(it.thumb)URL.revokeObjectURL(it.thumb)});thumbQueue=[];lib.items=[];lib.byPath=new Map();lib.dirs=new Set(['']);lib.cwd='';lib.sel.clear();lib.loaded={}}
function ensureLibFor(b){if(lib.bookId!==b.id){resetLib();lib.bookId=b.id}}
function rebuildDirs(){lib.dirs=new Set(['']);for(const it of lib.items){let d='';for(const seg of it.dir.split('/')){if(!seg)continue;d=d?d+'/'+seg:seg;lib.dirs.add(d)}}}
async function walkDir(dir,prefix,out){for await(const [name,h] of dir.entries()){if(name.startsWith('.'))continue;if(h.kind==='file'){if(IMG_EXT.test(name)){const f=await h.getFile();f._rel=prefix+'/'+name;out.push(f)}}else await walkDir(h,prefix+'/'+name,out)}}
// Adds (or replaces) one folder of the current book from a list of files whose first path segment is the folder name
async function loadFolderFiles(b,fid,files){
  ensureLibFor(b);const list=[...files].filter(f=>IMG_EXT.test(f.name)&&!f.name.startsWith('.'));
  const fo=bookFolders(b).find(x=>x.id===fid);if(!fo)return;
  lib.items.filter(it=>it.fid===fid).forEach(it=>{if(it.thumb)URL.revokeObjectURL(it.thumb);lib.byPath.delete(it.path)});
  lib.items=lib.items.filter(it=>it.fid!==fid);
  const pre=folderPrefix(b,fid);const fresh=[];
  for(const f of list){const parts=(f._rel||f.webkitRelativePath||f.name).split('/');const rel=parts.length>1?parts.slice(1).join('/'):parts[0];const rdir=rel.includes('/')?rel.slice(0,rel.lastIndexOf('/')):'';
    const path=pre+rel;const pdir=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'/';
    const it={id:'ph'+Math.random().toString(36).slice(2,9),fid,path,pdir,dir:fo.name+(rdir?'/'+rdir:''),name:f.name,file:f,date:f.lastModified,dateSrc:'file',orient:1,thumb:'',thumbBlob:null};
    lib.items.push(it);lib.byPath.set(path,it);fresh.push(it)}
  rebuildDirs();lib.loaded[fid]=fresh.length;
  if(!list.length){toast(`Aucune photo trouvée dans « ${fo.name} ».`);render();return}
  lib.loading={done:0,total:fresh.length};render();
  let i=0;const worker=async()=>{while(i<fresh.length){const it=fresh[i++];if(/\.(jpe?g|tiff?|dng|cr2|nef|arw|orf|rw2)$/i.test(it.name)){const r=await readExif(it.file);if(r){if(r.date){it.date=r.date;it.dateSrc='exif'}if(r.orient)it.orient=r.orient;if(r.thumbBlob)it.thumbBlob=r.thumbBlob}}
    lib.loading.done++;if(lib.loading.done%60===0)updateLoading()}};
  await Promise.all(Array.from({length:6},worker));
  lib.loading=null;const ex=fresh.filter(x=>x.dateSrc==='exif').length;setTimeout(()=>toast(`« ${fo.name} » : ${fresh.length} photos, ${ex} avec date de prise de vue`),50);render();
}
// Registers a folder for the book: mode 'add' (new or same-name folder) or 'replace' an existing one
function registerFolder(b,name,mode,fid){
  const fs=bookFolders(b);let fo;
  if(mode==='replace'&&(fo=fs.find(x=>x.id===fid))){
    if(fo.name!==name&&fs[0].id!==fid){const o='@'+fo.name+'/',n='@'+name+'/';for(const arr of Object.values(b.assign))arr.forEach(a=>{if(a.p.startsWith(o))a.p=n+a.p.slice(o.length)});b.jalons.forEach(j=>{if(j.p&&j.p.startsWith(o))j.p=n+j.p.slice(o.length)})}
    fo.name=name;
  }else{fo=fs.find(x=>x.name===name);if(!fo){fo={id:uid('f'),name};fs.push(fo)}}
  b.photoRoot=fs[0].name;save(b,true);return fo.id;
}
async function openDirHandle(b,h,fid){setSaved('Lecture du dossier…');const out=[];await walkDir(h,h.name,out);await loadFolderFiles(b,fid,out)}
async function pickFolder(b,mode,fid){
  if(window.showDirectoryPicker&&window.top===window){
    try{const h=await window.showDirectoryPicker({id:'atelier-photos',mode:'read'});const id=registerFolder(b,h.name,mode,fid);
      dirHandles[b.id]=dirHandles[b.id]||{};dirHandles[b.id][id]=h;persistHandles(b);ensureLibFor(b);await openDirHandle(b,h,id);return}
    catch(e){if(e&&e.name==='AbortError')return}
  }
  view.pendingFolder={book:b.id,mode,fid};const i=document.getElementById('photodir');i.value='';i.click();
}
async function removeFolder(b,fid){
  const fs=bookFolders(b);const i=fs.findIndex(x=>x.id===fid);if(i<0)return;const wasMain=i===0;fs.splice(i,1);
  if(wasMain&&fs.length){const o='@'+fs[0].name+'/';for(const arr of Object.values(b.assign))arr.forEach(a=>{if(a.p.startsWith(o))a.p=a.p.slice(o.length)});b.jalons.forEach(j=>{if(j.p&&j.p.startsWith(o))j.p=j.p.slice(o.length)});
    lib.items.filter(it=>it.fid===fs[0].id).forEach(it=>{lib.byPath.delete(it.path);if(it.path.startsWith(o))it.path=it.path.slice(o.length);it.pdir=it.path.includes('/')?it.path.slice(0,it.path.lastIndexOf('/')):'/';lib.byPath.set(it.path,it)})}
  b.photoRoot=fs[0]?fs[0].name:'';
  if(dirHandles[b.id])delete dirHandles[b.id][fid];persistHandles(b);
  lib.items.filter(it=>it.fid===fid).forEach(it=>{if(it.thumb)URL.revokeObjectURL(it.thumb);lib.byPath.delete(it.path)});lib.items=lib.items.filter(it=>it.fid!==fid);delete lib.loaded[fid];rebuildDirs();lib.cwd='';
  save(b);toast('Dossier retiré du livre');
}
let reopenTried=new Set();
async function maybeReopenDir(){ // silently reload remembered folders when the browser still allows it
  const b=view.route==='livre'?books.get(view.id):null;if(!b||view.tab!=='cdf'||view.cdfMode!=='photos'||lib.loading)return;ensureLibFor(b);
  const hs=dirHandles[b.id]||{};
  for(const fo of bookFolders(b)){const h=hs[fo.id];const key=b.id+'|'+fo.id;if(!h||lib.loaded[fo.id]!=null||reopenTried.has(key))continue;reopenTried.add(key);
    try{if((await h.queryPermission({mode:'read'}))==='granted')await openDirHandle(b,h,fo.id)}catch(e){}}
}
async function reopenFolder(b,fid){const h=(dirHandles[b.id]||{})[fid];if(!h){pickFolder(b,'replace',fid);return}
  try{if((await h.requestPermission({mode:'read'}))==='granted'){ensureLibFor(b);await openDirHandle(b,h,fid)}else toast("Accès refusé : choisissez le dossier à nouveau.")}catch(e){toast("Le dossier n'a pas pu être rouvert : choisissez-le à nouveau.")}}
function updateLoading(){const el=document.getElementById('lib-loading');if(el&&lib.loading)el.textContent=`Lecture des dates… ${lib.loading.done}/${lib.loading.total}`}
let thumbQueue=[],thumbActive=0,observer=null;
function queueThumb(it){if(it.thumb||it.thumbQueued)return;it.thumbQueued=true;thumbQueue.push(it);pumpThumbs()}
function pumpThumbs(){while(thumbActive<3&&thumbQueue.length){const it=thumbQueue.shift();thumbActive++;makeThumb(it).finally(()=>{thumbActive--;pumpThumbs()})}}
async function makeThumb(it){
  try{
    if(it.thumbBlob){it.thumb=URL.createObjectURL(it.thumbBlob);it.thumbRot=it.orient}
    else if(BROWSER_IMG.test(it.name)){const bmp=await createImageBitmap(it.file);const s=Math.min(1,320/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);if(bmp.close)bmp.close();
      const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.8));it.thumb=URL.createObjectURL(blob);it.thumbRot=1}
    else return;
    document.querySelectorAll(`[data-tid="${it.id}"]`).forEach(el=>{el.querySelector('.ext,.nm')?.remove();if(!el.querySelector('img'))el.insertAdjacentHTML('afterbegin',thumbImg(it))});
  }catch(e){}
}
const ROT={3:'rotate(180deg)',6:'rotate(90deg)',8:'rotate(-90deg)'};
const thumbImg=it=>it.thumb?`<img src="${it.thumb}" alt="" style="${ROT[it.thumbRot]?'transform:'+ROT[it.thumbRot]:''}">`:'';
function visibleItems(){
  const b=books.get(view.id);const used=usedPaths(b);
  let arr=lib.items.filter(it=>lib.sub?(lib.cwd===''||it.dir===lib.cwd||it.dir.startsWith(lib.cwd+'/')):it.dir===lib.cwd);
  if(lib.hideUsed)arr=arr.filter(it=>!used.has(it.path));
  if(lib.sort==='name')arr.sort((a,z)=>natural(a.path,z.path));else arr.sort((a,z)=>a.date-z.date||natural(a.name,z.name));
  return {arr,used};
}

/* ================= routing ================= */
function readHash(){const h=location.hash.slice(1);if(h.startsWith('livre-')){view.route='livre';view.id=h.slice(6)}else{view.route='avancement';view.id=null}view.sel.clear();view.highlight='';view.active=null;view.menu=false;view.edit=null;view.lpick=null}
window.addEventListener('hashchange',()=>{readHash();render();window.scrollTo(0,0)});

/* ================= render ================= */
function render(){
  const nav=document.getElementById('nav');const b=view.route==='livre'?books.get(view.id):null;
  const nv=renderNav(b);nav.innerHTML=nv.links;document.getElementById('burger-slot').innerHTML=nv.burger;renderHistSlot();
  const app=document.getElementById('app');
  const keep={pb:document.getElementById('pb-scroll')?.scrollTop,ps:document.getElementById('ps-scroll')?.scrollTop,tr:document.getElementById('tray-list')?.scrollTop};
  if(view.route==='livre'){if(b)app.innerHTML=renderBook(normBook(b));else app.innerHTML=loaded?`<div class="panel emptystate"><h2>Livre introuvable</h2><p class="muted">Il a peut-être été supprimé.</p><a class="btn" href="#avancement">Retour à l'avancement</a></div>`:loadingState()}
  else app.innerHTML=renderProgress();
  for(const [id,k] of [['pb-scroll','pb'],['ps-scroll','ps'],['tray-list','tr']]){const el=document.getElementById(id);if(el&&keep[k]!=null)el.scrollTop=keep[k]}
  document.documentElement.style.setProperty('--toph',headerH()+'px');observeTiles();renderSelbar();renderPool();if(loaded)saveUI();maybeReopenDir();
  if(view.edit){const t=document.getElementById('pe-text');if(t&&document.activeElement!==t){t.focus();t.setSelectionRange(t.value.length,t.value.length)}}
}
function renderNav(b){
  const all=[...books.values()];
  let recent=all.slice().sort((a,z)=>String(z.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,3);
  if(b&&!recent.includes(b))recent=[b,...recent.slice(0,2)];
  const years=[...new Set(all.map(x=>+x.year||0))].sort((a,z)=>z-a);
  return {links:`<a href="#avancement" ${view.route==='avancement'?'aria-current="page"':''}>Avancement</a>${recent.map(x=>`<a href="#livre-${esc(x.id)}" ${b&&x.id===b.id?'aria-current="page"':''}>${esc(x.title)}</a>`).join('')}`,burger:`
    <span class="burger"><button class="icon-btn" data-act="menu" aria-expanded="${!!view.menu}" aria-label="Tous les livres" title="Tous les livres"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
    ${view.menu?`<div class="menu panel">${years.map(y=>`<div class="menu-y">${y||'Sans année'}</div>${all.filter(x=>(+x.year||0)===y).sort((a,z)=>(a.order??999)-(z.order??999)||a.title.localeCompare(z.title)).map(x=>`<a href="#livre-${esc(x.id)}" ${b&&x.id===b.id?'aria-current="page"':''}>${esc(x.title)}</a>`).join('')}`).join('')}<div class="menu-sep"></div><a href="#avancement">Avancement de tous les livres</a><div class="menu-sep"></div><button class="mitem" data-act="backup">Sauvegarder dans un fichier (.json)</button><button class="mitem" data-act="restore">Restaurer une sauvegarde…</button></div>`:''}</span>`};
}
const headerH=()=>(document.querySelector('.top')?.offsetHeight||52);
const UI_KEY='atelier-ui';
function saveUI(){const u={hash:location.hash,tab:view.tab,cdfMode:view.cdfMode,active:view.active,lib:{sort:lib.sort,size:lib.size,sub:lib.sub,hideUsed:lib.hideUsed}};const j=JSON.stringify(u);try{sessionStorage.setItem(UI_KEY,j)}catch(e){}try{localStorage.setItem(UI_KEY,j)}catch(e){}}
function loadUI(){let u=null;try{u=JSON.parse(sessionStorage.getItem(UI_KEY)||'null')}catch(e){}if(!u)try{u=JSON.parse(localStorage.getItem(UI_KEY)||'null')}catch(e){}
  if(!u)return;if(u.tab)view.tab=u.tab;if(u.cdfMode)view.cdfMode=u.cdfMode;if(u.lib)Object.assign(lib,{sort:u.lib.sort||lib.sort,size:u.lib.size||lib.size,sub:u.lib.sub!==false,hideUsed:!!u.lib.hideUsed});
  if(!location.hash&&u.hash&&u.hash.startsWith('#livre-'))history.replaceState(null,'',u.hash);view._active=u.active}
const loadingState=()=>`<div class="panel emptystate"><p class="muted">Chargement de vos livres…</p></div>`;
function observeTiles(){
  if(observer)observer.disconnect();const root=document.getElementById('pb-scroll');if(!root)return;
  observer=new IntersectionObserver(ents=>{for(const e of ents)if(e.isIntersecting){const it=lib.items[+e.target.dataset.idx];if(it)queueThumb(it);observer.unobserve(e.target)}},{root,rootMargin:'300px'});
  root.querySelectorAll('.tile[data-idx]').forEach(t=>{const it=lib.items[+t.dataset.idx];if(it&&!it.thumb)observer.observe(t)});
  document.querySelectorAll('.athumb[data-tid]').forEach(t=>{const it=lib.items.find(x=>x.id===t.dataset.tid);if(it&&!it.thumb)queueThumb(it)});
}

function stChip(bookId,k){const s=books.get(bookId).stages[k]||'todo';return `<button class="stchip st-${s}" data-act="cycle" data-book="${esc(bookId)}" data-stage="${k}" title="Cliquer pour passer à « ${ST[ST[s].next].label} »">${ST[s].label}</button>`}

function renderProgress(){
  if(!loaded)return loadingState();
  const list=[...books.values()].map(normBook).sort((a,b)=>a.year-b.year||(a.order??999)-(b.order??999)||a.title.localeCompare(b.title));
  const done=list.filter(b=>progress(b)===1).length, doing=list.filter(b=>{const p=progress(b);return p>0&&p<1}).length;
  const overAll=list.reduce((a,b)=>a+metrics(b).over.length,0);
  const years=[...new Set(list.map(b=>b.year))];
  const newForm=view.showNew?`<form class="panel newbook" id="newbook" novalidate>
      <label>Titre du livre<input class="f" id="nb-title" placeholder="ex. Vacances Bretagne" value="${esc(view.newDraft?.title||'')}"></label>
      <label>Année<input class="f mono" id="nb-year" type="number" value="${esc(view.newDraft?.year||new Date().getFullYear())}"></label>
      <label>Nombre de pages (multiple de 4)<input class="f mono" id="nb-pages" type="number" min="4" step="4" value="${esc(view.newDraft?.pages||96)}"></label>
      <button class="btn primary" type="submit">Créer le livre</button>
      <button class="btn ghost" type="button" data-act="hide-new">Annuler</button>
      ${view.newErr?`<p class="err" role="alert">${esc(view.newErr)}</p>`:''}</form>`:'';
  let rows='';
  for(const y of years){
    rows+=`<tr class="year"><td colspan="11">${y}</td></tr>`;
    for(const b of list.filter(x=>x.year===y)){
      const m=metrics(b);const p=Math.round(progress(b)*100);
      const cdfInfo=b.pageCount?`<span class="mono">${m.filled}/${b.pageCount}</span> p. · <span class="mono">${b.layouts.length}</span> MEP${m.placed?` · <span class="mono">${m.placed}</span> ph.`:''}${m.over.length?` · <span class="pill bad">${m.over.length} &gt; ${b.maxReuse}×</span>`:''}${b.pageCount%4?' · <span class="pill bad">pages ≠ ×4</span>':''}`:'<span class="muted">—</span>';
      rows+=`<tr>
        <td><a class="booklink" href="#livre-${esc(b.id)}">${esc(b.title)}</a></td>
        <td><textarea class="note" rows="1" data-act="note" data-book="${esc(b.id)}" id="note-${esc(b.id)}" aria-label="Statut de ${esc(b.title)}">${esc(b.note)}</textarea></td>
        ${STAGES.map(([k])=>`<td class="st">${stChip(b.id,k)}</td>`).join('')}
        <td><div class="row" style="flex-wrap:nowrap"><div class="bar ${p===100?'ok':''}" style="flex:1"><i style="width:${p}%"></i></div><span class="mono small">${p}%</span></div></td>
        <td class="small" style="white-space:nowrap">${cdfInfo}</td>
        <td><a class="btn" href="#livre-${esc(b.id)}">Ouvrir</a></td></tr>`;
    }
  }
  return `<div class="head"><div><div class="eyebrow">Tous les projets</div><h1>Avancement des livres</h1></div>
    <button class="btn primary" data-act="show-new">+ Nouveau livre</button></div>
    ${newForm}
    <div class="kpis">
      <div class="panel kpi"><span class="eyebrow">Livres</span><b class="mono">${list.length}</b></div>
      <div class="panel kpi"><span class="eyebrow">En cours</span><b class="mono">${doing}</b></div>
      <div class="panel kpi"><span class="eyebrow">Terminés</span><b class="mono">${done}</b></div>
      <div class="panel kpi"><span class="eyebrow">MEP utilisées plus de 5 fois</span><b class="mono" style="color:${overAll?'var(--bad)':'inherit'}">${overAll}</b></div>
    </div>
    ${list.length?`<div class="panel tablebox"><table class="prog">
      <thead><tr><th rowspan="2">Livre</th><th rowspan="2">Statut global</th><th class="grp" colspan="4">Conception</th><th class="grp" colspan="2">Production</th><th rowspan="2">Avancement</th><th rowspan="2">Chemin de fer</th><th rowspan="2"></th></tr>
      <tr>${STAGES.map(([,l])=>`<th style="text-align:center">${l}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="legend small muted">Cliquez sur une étape pour changer son état :${Object.entries(ST).map(([k,v])=>`<span class="stchip st-${k}" style="cursor:default">${v.label}</span>`).join('')}</div>`
    :`<div class="panel emptystate"><h2>Aucun livre pour l'instant</h2><p class="muted">Créez votre premier livre : vous pourrez ensuite poser son chemin de fer, ses événements et ses mises en page.</p><button class="btn primary" data-act="show-new">+ Nouveau livre</button></div>`}`;
}

function renderBook(b){
  const m=metrics(b);const ev=evById(b);
  const alerts=m.over.length+m.short.length;
  const head=`<div class="bookhead"><div style="min-width:0">
      <input class="titleinput" id="bk-title" data-act="title" value="${esc(b.title)}" aria-label="Titre du livre">
      <div class="bookmeta">
        <label>Livre <input class="mini mono" type="number" id="bk-year" data-act="year" value="${b.year}" aria-label="Année"></label>
        <label><input class="mini mono" type="number" min="4" step="4" id="bk-pages" data-act="pages" value="${b.pageCount}" aria-label="Nombre de pages"> pages</label>
        <span class="bk-exp"><button class="btn sm primary" data-act="export-indd" ${m.placed?'':'disabled'} title="${m.placed?'Script InDesign avec les photos placées':'Placez des photos dans Définition des photos pour activer l\'export'}">Export InDesign</button><button class="btn sm" data-act="export-csv" ${m.placed?'':'disabled'}>CSV</button></span>
      </div>
      <div class="bookstats"><span><b>${m.filled}/${b.pageCount}</b> pages avec événement</span><span><b>${m.withLay}/${m.sp.length}</b> planches avec mise en page</span><span class="${b.layouts.length<m.needed?'bad':''}"><b>${b.layouts.length}</b> mises en page (${m.needed} min.)</span><span><b>${m.placed}</b> photos placées</span>${alerts?`<span class="bad"><b>${alerts}</b> alerte${alerts>1?'s':''} : ${[m.over.length?m.over.length+' MEP > '+b.maxReuse+'×':'',m.short.length?m.short.length+' évén. sans assez de places photo':''].filter(Boolean).join(', ')}</span>`:''}</div></div>
      <button class="btn ghost sm danger ${view.armed==='book'?'armed':''}" data-act="del-book">${view.armed==='book'?'Confirmer la suppression':'Supprimer le livre'}</button></div>`;
  const lo=Math.floor(b.pageCount/4)*4,hi=lo+4;
  const warn=b.pageCount%4?`<div class="warnbar">${b.pageCount} pages n'est pas un multiple de 4.${lo?`<button class="btn sm" data-act="setpages" data-n="${lo}">Passer à ${lo} pages</button>`:''}<button class="btn sm" data-act="setpages" data-n="${hi}">Passer à ${hi} pages</button></div>`:'';
  const tabs=`<div class="tabs" role="tablist">
      ${[['cdf','Chemin de fer',m.sp.length+' pl.'],['events','Événements',b.events.length],['layouts','Mises en page',b.layouts.length]].map(([k,l,c])=>`<button role="tab" aria-selected="${view.tab===k}" data-act="tab" data-tab="${k}">${l}<span class="count">${c}</span></button>`).join('')}</div>`;
  let body='';
  if(view.tab==='cdf')body=view.cdfMode==='photos'?renderPhotos(b,m,ev):renderCdf(b,m,ev);
  else if(view.tab==='events')body=renderEvents(b,m);else body=renderLayouts(b,m,ev);
  return head+warn+tabs+body;
}
const cdfSwitch=()=>`<div class="seg" role="group" aria-label="Vue du chemin de fer"><button data-act="cdfmode" data-mode="plan" aria-pressed="${view.cdfMode==='plan'}">Plan des pages</button><button data-act="cdfmode" data-mode="photos" aria-pressed="${view.cdfMode==='photos'}">Définition des photos</button></div>`;

function layOptions(b,u,current){
  const max=b.maxReuse;
  return `<option value="">— Mise en page —</option>`+b.layouts.map(l=>{const n=(u[l.id]||[]).length;const full=n>=max&&l.id!==current;return `<option value="${esc(l.id)}" ${l.id===current?'selected':''} ${full?'disabled':''}>${esc(l.name)}${l.locked?' (verrouillée)':''} · ${n}/${max}</option>`}).join('');
}
function pageCell(b,p,side,ev){
  if(!p)return `<div class="pg blank ${side}" aria-hidden="true"></div>`;
  const e=ev[b.pages[p]];const sel=view.sel.has(p);
  if(view.edit===p)return `<div class="pg ${side} editing ${e?'has-ev':''}" ${e?`style="--h:${e.hue}"`:''}>
      <textarea class="pe-text" id="pe-text" data-page="${p}" placeholder="${e?'':'Nouvel événement…'}" aria-label="Texte de l'événement page ${p}">${esc(e?e.name:'')}</textarea>
      <div class="pe-actions"><button class="btn sm" data-act="pe-spread" data-page="${p}" title="Étendre à l'autre page de la planche">Planche entière</button>${e?`<button class="btn sm" data-act="pe-free" data-page="${p}" title="Retirer l'événement de cette page">Libérer</button>`:''}</div>
      <span class="folio">${p}</span></div>`;
  return `<button class="pg ${side} ${e?'has-ev':''} ${sel?'sel':''}" data-act="page" data-page="${p}" data-drop="pgmove" ${e?`draggable="true" data-drag="evmove" data-ev="${esc(e.id)}" style="--h:${e.hue}"`:''} title="${e?'Clic : modifier le texte · glisser sur un autre événement : fusionner · sur une page libre ou un n° de planche : déplacer':'Clic : écrire un événement · Maj + clic : sélectionner plusieurs pages'}" aria-label="Page ${p}${e?' : '+esc(e.name):' libre'}">
    ${e?`<span class="ev">${esc(e.name)}</span>`:`<span class="empty">Libre</span>`}${e&&dblOther(b,p)!=null?`<span class="dbl" data-act="pg-dbl" data-page="${p}" role="button" title="Passer en double page (la suite avance d'une planche si l'autre page est occupée)" aria-label="Passer en double page">${I_DBL}</span>`:''}<span class="folio">${p}</span></button>`;
}
// An event spanning the whole planche is shown once across both pages
function wideCell(b,s,e){
  const sel=view.sel.has(s.l)||view.sel.has(s.r);
  if(view.edit===s.l||view.edit===s.r)return `<div class="pg wide editing has-ev" style="--h:${e.hue}">
      <textarea class="pe-text" id="pe-text" data-page="${s.l}" aria-label="Texte de l'événement, pages ${s.l} et ${s.r}">${esc(e.name)}</textarea>
      <div class="pe-actions"><button class="btn sm" data-act="pe-free" data-page="${s.r}" title="Garder seulement la page de gauche">Page gauche seule</button><button class="btn sm" data-act="pe-free" data-page="${s.l}" title="Garder seulement la page de droite">Page droite seule</button></div>
      <span class="folio fl">${s.l}</span><span class="folio fr">${s.r}</span></div>`;
  return `<button class="pg wide has-ev ${sel?'sel':''}" data-act="page" data-page="${s.l}" data-drop="pgmove" draggable="true" data-drag="evmove" data-ev="${esc(e.id)}" style="--h:${e.hue}" title="Double page · clic : modifier le texte · glisser sur un autre événement : fusionner · sur une page libre ou un n° de planche : déplacer" aria-label="Pages ${s.l} et ${s.r} : ${esc(e.name)}">
    <span class="ev">${esc(e.name)}</span><span class="wide-mark" aria-hidden="true">${I_DBL_FULL}</span><span class="folio fl">${s.l}</span><span class="folio fr">${s.r}</span></button>`;
}
function dblOther(b,p){const k=spreadKeyOf(p);if(k===0)return null;const o=p===k?k+1:k;if(o>b.pageCount||b.pages[o]===b.pages[p])return null;return o}
function layPicker(b,m,key){
  const cur_=b.spreads[key];
  return `<div class="lpick panel" role="dialog" aria-label="Choisir une mise en page">
    <div class="lpick-grid">${b.layouts.map(l=>{const n=(m.u[l.id]||[]).length;const full=n>=b.maxReuse&&l.id!==cur_;
      return `<button class="lp ${l.id===cur_?'on':''}" data-act="lp-set" data-key="${key}" data-lay="${esc(l.id)}" ${full?'disabled title="Déjà utilisée '+n+' fois"':''}>${layVisual(l)}<span class="lp-n">${l.locked?I_LOCK:''}${esc(l.name)}</span><span class="lp-u mono ${n>b.maxReuse?'bad':''}">${n}/${b.maxReuse}</span></button>`}).join('')||'<p class="small muted">Aucune mise en page : créez-les dans l\'onglet Mises en page.</p>'}</div>
    ${cur_?`<button class="btn ghost sm" data-act="lp-set" data-key="${key}" data-lay="">Retirer la mise en page</button>`:''}</div>`;
}
function renderCdf(b,m,ev){
  if(!b.pageCount)return cdfSwitch()+`<div class="panel emptystate"><h2>Indiquez le nombre de pages</h2><p class="muted">Saisissez le nombre de pages du livre (multiple de 4) sous le titre pour générer les planches, ou importez directement votre chemin de fer Excel.</p><button class="btn primary" data-act="imp-open">Importer depuis Excel…</button></div>`;
  const lay=layById(b);
  const tools=`<div class="cdf-tools">${cdfSwitch()}
     <span class="small muted">Clic sur une page : écrire son événement. Glisser un événement sur un autre : fusionner. Le « + » entre deux planches en insère une.</span>
     <span style="flex:1"></span>
     <label class="row small muted">Repérer <select class="f" id="hl" data-act="highlight"><option value="">Toutes les MEP</option>${b.layouts.map(l=>`<option value="${esc(l.id)}" ${view.highlight===l.id?'selected':''}>${esc(l.name)}</option>`).join('')}<option value="__none" ${view.highlight==='__none'?'selected':''}>Sans mise en page</option></select></label>
   </div>`;
  const palette=b.layouts.length?`<div class="panel palette">${b.layouts.map(l=>{const n=(m.u[l.id]||[]).length;return `<span class="chip ${n>b.maxReuse?'over':n===b.maxReuse?'full-use':''} ${l.locked?'locked':''}" draggable="true" data-drag="layout" data-lay="${esc(l.id)}" title="Glisser sur une planche">${layVisual(l)}${l.locked?I_LOCK:''}${esc(l.name)} <span class="n">${n}/${b.maxReuse}</span></span>`}).join('')}</div>`:'';
  const cards=m.sp.map(s=>{
    const lid=b.spreads[s.key];const l=lay[lid];const n=l?(m.u[l.id]||[]).length:0;
    const dim=view.highlight&&(view.highlight==='__none'?!!l:view.highlight!==lid);
    const placed=(b.assign[s.key]||[]).length;const pinned=!!b.pins[s.key];
    return `<article class="spread ${dim?'dim':''} ${l&&n>b.maxReuse?'over-limit':''}" data-key="${s.key}" data-drop="spread">
      ${s.key>=2?`<button class="ins" data-act="ins-pl" data-key="${s.key}" title="Insérer une planche vide avant la planche ${plancheNo(s.key)}" aria-label="Insérer une planche avant la planche ${plancheNo(s.key)}">+</button>`:''}
      <div class="sp-top"><span class="sp-label" data-drop="plmove" data-pl="${plancheNo(s.key)}" title="Déposez ici un événement pour le déplacer sur cette planche">Pl. ${plancheNo(s.key)}</span><input class="spname" id="spn-${s.key}" data-act="spread-name" data-key="${s.key}" value="${esc(b.spreadNames[s.key]||'')}" placeholder="Nommer la planche" aria-label="Nom de la planche ${plancheNo(s.key)}">${(()=>{const pk=s.key===0?null:s.key===2?0:s.key-2;const pn=pk!=null&&b.spreadNames[pk];return pn&&pn!==b.spreadNames[s.key]?`<button class="spprev" data-act="sp-prev" data-key="${s.key}" title="Reprendre le nom de la planche précédente : « ${esc(pn)} »">↶ ${esc(pn.length>14?pn.slice(0,13)+'…':pn)}</button>`:''})()}<button class="pin ${pinned?'on':''}" data-act="pin" data-key="${s.key}" title="${pinned?'Planche verrouillée : la répartition automatique n\'y touche pas':'Verrouiller cette planche'}" aria-pressed="${pinned}">${pinned?I_LOCK:I_UNLOCK}</button></div>
      <div class="pair">${l?`<div class="pair-bg" aria-hidden="true">${layVisual(l)}</div>`:''}${(s.l&&s.r&&b.pages[s.l]&&b.pages[s.l]===b.pages[s.r]&&ev[b.pages[s.l]])?wideCell(b,s,ev[b.pages[s.l]]):pageCell(b,s.l,'left',ev)+pageCell(b,s.r,'right',ev)}</div>
      <div class="sp-foot"><button class="thumb lthumb ${l?'':'none'}" data-act="lpick" data-key="${s.key}" ${l?`draggable="true" data-drag="spreadlay"`:''} title="${l?esc(l.name)+' · clic : changer · glisser vers une autre planche : échanger':'Choisir une mise en page'}">${l?layVisual(l):'<span>+ MEP</span>'}</button>
        <span class="lcount mono ${n>b.maxReuse?'bad':''}" title="${l?esc(l.name)+' : utilisée '+n+' fois sur '+b.maxReuse:'Aucune mise en page'}">${l?n+'/'+b.maxReuse:''}</span>
        <span class="ph" title="Photos placées / places dans la mise en page">${placed||'–'}/${l&&l.photos?l.photos:'–'}</span></div>
      ${view.lpick===s.key?layPicker(b,m,s.key):''}
    </article>`}).join('');
  return tools+palette+`<div class="cdf">${cards}</div>`;
}

function renderPool(){
  const el=document.getElementById('pool');const b=view.route==='livre'?books.get(view.id):null;
  const on=b&&view.tab==='cdf'&&view.cdfMode==='plan'&&b.pageCount;document.body.classList.toggle('has-pool',!!on);
  if(!on){el.innerHTML='';return}
  const used=new Set(Object.values(b.pages));const free=b.events.filter(e=>!used.has(e.id));
  el.innerHTML=`<div class="pool" data-drop="pool"><div class="wrap"><span class="pool-t">Sans page <b class="mono">${free.length}</b></span>
    <div class="pool-list">${free.map(e=>view.armed==='pool:'+e.id?`<span class="pchip armed">Supprimer « ${esc(e.name.split('\n')[0].slice(0,24))} » du livre ? <button class="btn sm" data-act="pool-del-yes" data-ev="${esc(e.id)}">Supprimer</button><button class="btn ghost sm" data-act="pool-del-no">Annuler</button></span>`
      :`<span class="pchip" draggable="true" data-drag="evmove" data-ev="${esc(e.id)}" title="${esc(e.name)}">${esc(e.name.split('\n')[0].slice(0,40))}<button class="px" data-act="pool-del" data-ev="${esc(e.id)}" title="Supprimer cet événement du livre" aria-label="Supprimer cet événement du livre">×</button></span>`).join('')||'<span class="small muted">Glissez ici un événement pour le retirer de ses pages ; glissez une étiquette d\'ici sur une page pour le placer.</span>'}</div></div></div>`;
}
function renderSelbar(){
  const el=document.getElementById('selbar');const b=view.route==='livre'?books.get(view.id):null;
  if(!b||view.tab!=='cdf'||view.cdfMode!=='plan'||!view.sel.size){el.innerHTML='';return}
  const pages=[...view.sel];
  el.innerHTML=`<div class="selbar"><div class="wrap">
    <span><b>${pages.length} page${pages.length>1?'s':''}</b> <span class="mono small">p. ${ranges(pages)}</span></span>
    <form class="grp" id="sel-new"><input class="f" id="sel-new-name" placeholder="Texte du nouvel événement sur ces pages" style="min-width:260px"><button class="btn primary" type="submit">Créer l'événement</button></form>
    <button class="btn" data-act="sel-free">Libérer ces pages</button>
    <button class="btn ghost" data-act="clear-sel">Annuler la sélection</button>
  </div></div>`;
}

/* ---------- photos split view ---------- */
function sidePicto(b,e,key){ // two clickable halves: left page / right page of the planche
  const k=+key;const L=k!==0&&b.pages[k]===e.id;const R=b.pages[k===0?1:k+1]===e.id;
  const half=(side,on,page)=>page==null?`<span class="sp-h void" aria-hidden="true"></span>`:
    `<button class="sp-h ${on?'on':''}" data-act="side" data-ev="${esc(e.id)}" data-page="${page}" title="${on?(L&&R?'Retirer la page '+page+' (garder l\'autre page)':'Page '+page+' ('+(side==='l'?'gauche':'droite')+')'):'Étendre à la page '+page+' : double page, la suite avance d\'une planche'}" aria-pressed="${on}" aria-label="Page ${side==='l'?'gauche':'droite'} ${page}"></button>`;
  return `<span class="sp-pic">${half('l',L,k===0?null:k)}${half('r',R,k===0?1:(k+1<=b.pageCount?k+1:null))}</span>`;
}
// Give one more page of its planche to an event: if that page is taken, everything from it moves one planche on (sides kept)
function extendEvent(b,evId,q){
  remember(b);
  if(b.pages[q]&&b.pages[q]!==evId){
    const busy=p=>!!b.pages[p];const maxUsed=Math.max(0,...Object.keys(b.pages).map(Number));let G;
    for(let g=q+2;;g+=2){if(g>maxUsed+1){G=g;break}if(!busy(g)&&!busy(g+1)){G=g;break}}
    const k=spreadKeyOf(q);const keep=new Set([k,k+1].filter(p=>p!==q&&b.pages[p]===evId)); // the event's own page in this planche stays put
    const np={};for(const [p,e] of Object.entries(b.pages)){const n=+p;np[n>=q&&n<G&&!keep.has(n)?n+2:n]=e}b.pages=np;
    for(const mp of SPREAD_MAPS){if(!b[mp])continue;const nm={};for(const [kk,v] of Object.entries(b[mp])){const n=+kk;nm[n>0&&n>q&&n<G?n+2:n]=v}b[mp]=nm}
  }
  b.pages[q]=evId;
  const max=Math.max(0,...Object.keys(b.pages).map(Number));let grew='';if(max>b.pageCount){b.pageCount=Math.ceil(max/4)*4;grew=` · le livre passe à ${b.pageCount} pages`}
  save(b);toastUndo('Événement en double page'+grew);
}
function renderPhotos(b,m,ev){
  if(!b.pageCount)return cdfSwitch();
  ensureLibFor(b);
  const lay=layById(b);
  if(view.active==null||!m.sp.some(s=>s.key===view.active))view.active=m.sp[0].key;
  const top=`<div class="cdf-tools" id="photos-top">${cdfSwitch()}</div>`;
  let left;
  if(!lib.items.length){
    left=`<div class="panel pane"><div class="pane-scroll"><div class="emptystate"><h2>Ouvrez le dossier du livre</h2>
      <p class="muted">Les photos des dossiers du livre (et de leurs sous-dossiers) sont lues sur votre ordinateur et classées par date de prise de vue. Elles ne sont pas envoyées en ligne.</p>
      ${bookFolders(b).length?`<div class="folder-list">${bookFolders(b).map((fo,i)=>`<div class="row" style="justify-content:center;gap:6px"><b>${I_FOLDER} ${esc(fo.name)}</b>${i===0?'<span class="small muted">(principal)</span>':''}<button class="btn primary sm" data-act="folder-reopen" data-fid="${esc(fo.id)}">${(dirHandles[b.id]||{})[fo.id]?'Rouvrir':'Choisir'}</button></div>`).join('')}</div>`:''}
      <div class="row" style="justify-content:center"><button class="btn ${bookFolders(b).length?'':'primary'}" data-act="folder-add">${I_FOLDER} ${bookFolders(b).length?'Ajouter un autre dossier':'Choisir le dossier du livre'}</button></div></div></div></div>`;
  } else {
    const {arr,used}=visibleItems();const idx=new Map(lib.items.map((it,i)=>[it,i]));
    const crumbs=['',...(lib.cwd?lib.cwd.split('/').map((_,i,a)=>a.slice(0,i+1).join('/')):[])];
    const kids=[...lib.dirs].filter(d=>d&&(lib.cwd?d.startsWith(lib.cwd+'/')&&!d.slice(lib.cwd.length+1).includes('/'):!d.includes('/'))).sort(natural);
    const count=d=>lib.items.filter(it=>it.dir===d||it.dir.startsWith(d+'/')).length;
    const groups=[];const gmap=new Map();
    for(const it of arr){const k=lib.sort==='name'?(it.pdir||'/'):dayKey(it.date);if(!gmap.has(k)){const g={k,items:[],title:lib.sort==='name'?(it.dir||lib.root||'Dossier'):fmtDay(it.date),short:lib.sort==='name'?'':fmtDayShort(it.date)};gmap.set(k,g);groups.push(g)}gmap.get(k).items.push(it)}
    // Milestones (jalons) split each day or folder into consecutive sections. Every photo lands in exactly one section: nothing is hidden.
    const byName=lib.sort==='name';const jCmp=byName?(a,z)=>natural(a.p,z.p):jalCmp;
    const jalByDay=new Map();for(const j of [...b.jalons].filter(j=>!byName||j.p).sort(jCmp)){const k=byName?(j.p.includes('/')?j.p.slice(0,j.p.lastIndexOf('/')):'/'):dayKey(j.t);if(!jalByDay.has(k))jalByDay.set(k,[]);jalByDay.get(k).push(j)}
    const starts=new Set();segPaths.length=0;
    for(const g of groups){const js=jalByDay.get(g.k)||[];let ji=-1;g.segs=[{jal:null,items:[]}];
      for(const it of g.items){while(ji+1<js.length&&jCmp(js[ji+1],{t:it.date,n:it.name,p:it.path})<=0){ji++;g.segs.push({jal:js[ji],items:[]});starts.add(it.path)}g.segs[g.segs.length-1].items.push(it)}
      g.segs=g.segs.filter(s=>s.items.length||s.jal);g.segs.forEach(s=>{s.idx=segPaths.length;segPaths.push(s.items.map(x=>x.path))})}
    const tile=it=>{const u=used.get(it.path);const sel=lib.sel.has(it.path);
      return `<div class="tw"><button class="tile ${sel?'sel':''} ${u?'is-used':''}" draggable="true" data-drag="photo" data-act="tile" data-path="${esc(it.path)}" data-idx="${idx.get(it)}" data-tid="${it.id}" title="${esc(it.path)}${it.dateSrc==='exif'?'':' (date du fichier)'}">${thumbImg(it)}${it.thumb?'':`<span class="ext">${esc(it.name.split('.').pop().toUpperCase())}</span>`}<span class="tm">${lib.sort==='name'?esc(it.name.slice(0,14)):fmtTime(it.date)}</span>${u?`<span class="used">Pl. ${plancheNo(u[0])}</span>`:''}</button>${!starts.has(it.path)?`<button class="cut" data-act="cut" data-path="${esc(it.path)}" title="Poser un jalon avant cette photo (${byName?esc(it.name):fmtTime(it.date)})" aria-label="Poser un jalon avant cette photo">${I_CUT}</button>`:''}</div>`};
    const g_hasJal=s=>groups.some(g=>g.segs.includes(s)&&g.segs.some(x=>x.jal));
    const segHtml=s=>{const first=s.items[0],last=s.items[s.items.length-1];const lbl=x=>byName?x.name:fmtTime(x.date);const range=first?`${esc(lbl(first))} → ${esc(lbl(last))}`:'aucune photo';
      const head=s.jal?`<div class="jal" id="jal-${esc(s.jal.id)}"><span class="jal-mark">${I_CUT}</span><input class="f" id="jn-${esc(s.jal.id)}" data-act="jal-name" data-j="${esc(s.jal.id)}" value="${esc(s.jal.name)}" aria-label="Nom du jalon"><span class="mono small muted">${range} · ${s.items.length}</span><span style="flex:1"></span>${s.items.length?`<button class="btn ghost sm" data-act="sel-seg" data-seg="${s.idx}">Tout sélectionner</button>`:''}<button class="btn ghost sm" data-act="jal-del" data-j="${esc(s.jal.id)}" title="Les photos rejoignent la section précédente">Retirer</button></div>`
        :(s.items.length&&g_hasJal(s)?`<div class="jal plain"><span class="mono small muted">${range} · ${s.items.length}</span><span style="flex:1"></span><button class="btn ghost sm" data-act="sel-seg" data-seg="${s.idx}">Tout sélectionner</button></div>`:'');
      return head+`<div class="tiles">${s.items.map(tile).join('')}</div>`};
    left=`<div class="panel pane" style="--tile:${lib.size}px">
      <div class="pane-bar compact">
        <div class="strip folders">${bookFolders(b).map((fo,i)=>{const n=lib.loaded[fo.id];return `<span class="fchip ${lib.cwd===fo.name||lib.cwd.startsWith(fo.name+'/')?'on':''}">${n!=null?`<button class="fname" data-act="cwd" data-dir="${esc(fo.name)}" title="Afficher ce dossier">${I_FOLDER} ${esc(fo.name)} <span class="mono muted">${n}</span></button>`:`<button class="fname" data-act="folder-reopen" data-fid="${esc(fo.id)}" title="Recharger ce dossier">${I_FOLDER} ${esc(fo.name)} <span class="small">· rouvrir</span></button>`}${i===0?'<span class="fmain" title="Dossier principal">principal</span>':''}<button class="fbtn" data-act="folder-replace" data-fid="${esc(fo.id)}" title="Changer ce dossier">↻</button><button class="fbtn ${view.armed==='fold:'+fo.id?'armed':''}" data-act="folder-del" data-fid="${esc(fo.id)}" title="${view.armed==='fold:'+fo.id?'Cliquer à nouveau pour retirer':'Retirer ce dossier du livre'}">${view.armed==='fold:'+fo.id?'Retirer ?':'×'}</button></span>`}).join('')}<button class="btn ghost sm" data-act="folder-add">+ Ajouter un dossier</button></div>
        <div class="strip"><div class="crumbs">${crumbs.map(c=>`<button data-act="cwd" data-dir="${esc(c)}" aria-current="${c===lib.cwd}">${c?esc(c.split('/').pop()):I_FOLDER+' Tous les dossiers'}</button>`).join('<span class="muted">/</span>')}</div>
          ${kids.map(d=>`<button class="dchip" data-act="cwd" data-dir="${esc(d)}">${I_FOLDER}${esc(d.split('/').pop())} <span class="mono muted">${count(d)}</span></button>`).join('')}</div>
        <div class="strip small">
          <select class="f sm" id="lib-sort" data-act="lib-sort" aria-label="Classement"><option value="exif" ${lib.sort==='exif'?'selected':''}>Par date</option><option value="name" ${lib.sort==='name'?'selected':''}>Par dossier</option></select>
          <label class="check" title="Inclure les sous-dossiers"><input type="checkbox" id="lib-sub" data-act="lib-sub" ${lib.sub?'checked':''}> Sous-dossiers</label>
          <label class="check"><input type="checkbox" id="lib-hide" data-act="lib-hide" ${lib.hideUsed?'checked':''}> Masquer placées</label>
          <input type="range" id="lib-size" data-act="lib-size" min="70" max="240" value="${lib.size}" aria-label="Taille des vignettes" title="Taille des vignettes">
          <span class="mono muted" id="lib-loading">${lib.loading?`Lecture des dates… ${lib.loading.done}/${lib.loading.total}`:`${arr.length} ph.`}</span>
        </div>
        ${(groups.length>1||b.jalons.length)?`<div class="strip days">${groups.map((g,i)=>`<button data-act="jump" data-target="grp-${i}">${esc(byName?(g.title.split('/').pop()):g.short)} · ${g.items.length}</button>`+g.segs.filter(s=>s.jal).map(s=>`<button class="jchip" data-act="jump" data-target="jal-${esc(s.jal.id)}">${I_CUT}${esc(s.jal.name.slice(0,22))} · ${s.items.length}</button>`).join('')).join('')}</div>`:''}
      </div>
      <div class="pane-scroll" id="pb-scroll">${groups.map((g,i)=>`<section class="daygrp" id="grp-${i}"><h4>${esc(g.title)} <span class="small muted mono">${g.items.length} photos</span></h4>${g.segs.map(segHtml).join('')}</section>`).join('')||'<p class="muted">Aucune photo ici.</p>'}</div>
      ${lib.sel.size?`<div class="pane-foot"><b>${lib.sel.size} sélectionnée${lib.sel.size>1?'s':''}</b><button class="btn primary sm" data-act="add-sel">Ajouter à Pl. ${plancheNo(view.active)} · page ${defaultSide(view.active)==='l'?'gauche':'droite'}</button><span class="small muted">(cliquez sur la zone gauche ou droite d'une planche pour changer)</span><button class="btn ghost sm" data-act="clear-libsel">Désélectionner</button></div>`:''}
    </div>`;
  }
  const evOpts=b.events.map(e=>`<option value="${esc(e.id)}" ${view.psEvent===e.id?'selected':''}>${esc(e.name.split('\n')[0].slice(0,50))}</option>`).join('');
  const rows=m.sp.filter(s=>!view.psEvent||spreadPages(b,s.key).some(p=>b.pages[p]===view.psEvent)).map(s=>{
    const pages=spreadPages(b,s.key);const evs=[...new Set(pages.map(p=>ev[b.pages[p]]).filter(Boolean))];const l=lay[b.spreads[s.key]];const arr=b.assign[s.key]||[];
    const cap=l&&l.photos?l.photos:0;const cls=!cap?'':arr.length===cap?'ok':arr.length>cap?'bad':'';
    return `<section class="psr ${view.active===s.key?'active':''}" data-drop="psr" data-key="${s.key}">
      <div class="psr-h" data-act="activate" data-key="${s.key}"><span class="lbl" data-drop="plmove" data-pl="${plancheNo(s.key)}" title="${esc(spreadLabel(b,s.key))} · déposez un événement ici pour le déplacer sur cette planche">Pl. ${plancheNo(s.key)}</span>
        <div class="evcs">${evs.map(e=>`<div class="evc" data-drop="evmerge" data-ev="${esc(e.id)}" style="--h:${e.hue}"><span class="grip" draggable="true" data-drag="evmove" data-ev="${esc(e.id)}" title="Glisser sur un autre événement pour fusionner, sur un n° de planche pour déplacer, sur la corbeille pour désassigner" aria-label="Déplacer l'événement">⋮⋮</span><textarea class="evname" rows="1" id="psn-${s.key}-${esc(e.id)}" data-act="ev-name" data-ev="${esc(e.id)}" aria-label="Texte de l'événement">${esc(e.name)}</textarea>${sidePicto(b,e,s.key)}</div>`).join('')||'<span class="small muted">Sans événement</span>'}</div>
        <span class="cnt ${cls}" title="Photos placées / places dans ${l?esc(l.name):'la mise en page'}">${arr.length}/${cap||'–'}</span></div>
      <div class="psr-b2 ${s.key===0?'single':''} ${arr.length?'':'empty'}">${(s.key===0?['r']:['l','r']).map(side=>{
        const list=arr.map((a,i)=>({a,i})).filter(x=>photoSide(s.key,x.a)===side);const pg=side==='l'?s.l:s.r;
        return `<div class="pz ${view.active===s.key&&defaultSide(s.key)===side?'act':''}" data-drop="psr" data-key="${s.key}" data-side="${side}" data-act="activate-side" title="Page ${side==='l'?'gauche':'droite'} ${pg||''} : glissez des photos ici">
          <span class="pz-l">${side==='l'?'Gauche':'Droite'} · p. ${pg||'–'}${list.length?` · ${list.length} ph.`:''}</span>${pg&&ev[b.pages[pg]]?`<span class="pz-t">${esc(ev[b.pages[pg]].name)}</span>`:''}
          ${list.map(({a,i},j)=>{const it=lib.byPath.get(a.p);return `<div class="athumb ${it?'':'missing'}" draggable="true" data-drag="assigned" data-key="${s.key}" data-idx="${i}" ${it?`data-tid="${it.id}"`:''} title="${esc(a.p)}">${it&&it.thumb?thumbImg(it):`<span class="nm">${esc(baseName(a.p))}</span>`}<span class="ord">${j+1}</span><button class="x" data-act="unassign" data-key="${s.key}" data-idx="${i}" aria-label="Retirer">×</button></div>`}).join('')}</div>`}).join('')}</div>
    </section>`}).join('');
  const right=`<div class="panel pane">
    <div class="pane-bar compact"><div class="strip">
      <select class="f sm" id="ps-ev" data-act="ps-ev" aria-label="Filtrer par événement" style="max-width:200px"><option value="">Toutes les planches</option>${evOpts}</select>
      <span class="mono small muted">${m.placed} ph.</span><span style="flex:1"></span>
</div></div>
    <div class="pane-scroll" id="ps-scroll">${rows}</div></div>`;
  return top+`<div class="split" id="split">${left}${right}</div>`;
}

/* ---------- edits on events: merge, split, free ---------- */
function remember(b){if(hist.length){/* seal so the next change gets its own entry */hist[hist.length-1].sealed=true}}
function toastUndo(msg){document.querySelectorAll('.toast').forEach(x=>x.remove());const top=hist[hist.length-1];if(top&&Date.now()-top.t<1000){top.label=msg.split(' · ')[0].split(' : ')[0];top.sealed=true;renderHistSlot()}const t=document.createElement('div');t.className='toast';t.innerHTML=`<span>${esc(msg)}</span> <button class="btn sm" data-act="undo">Annuler</button>`;document.body.appendChild(t);setTimeout(()=>t.remove(),6000)}
function mergeEvents(b,srcId,dstId){
  const s=b.events.find(e=>e.id===srcId),d=b.events.find(e=>e.id===dstId);if(!s||!d||s===d)return;
  remember(b);d.name=d.name.replace(/\s+$/,'')+'\n'+s.name;d.photos=(d.photos||0)+(s.photos||0);
  for(const k in b.pages)if(b.pages[k]===srcId)delete b.pages[k];   // its pages become free
  b.events=b.events.filter(e=>e.id!==srcId);save(b);toastUndo('Textes fusionnés : les pages de l\'événement glissé sont libérées');
}
function dropOrphans(b){const used=new Set(Object.values(b.pages));b.events=b.events.filter(e=>used.has(e.id)||e.photos>0)}
function insertPlanche(b,key){
  remember(b);const busyAt=p=>!!b.pages[p];
  let G=null;for(let g=key;;g+=2){if(g>Math.max(b.pageCount,...Object.keys(b.pages).map(Number))+1){G=g;break}if(!busyAt(g)&&!busyAt(g+1)&&!b.spreads[g]&&!(b.assign[g]||[]).length){G=g;break}}
  if(G===key){toast('Cette planche est déjà vide.');return}
  const np={};for(const [p,e] of Object.entries(b.pages)){const n=+p;np[n>=key&&n<G?n+2:n]=e}b.pages=np;
  for(const mp of SPREAD_MAPS){if(!b[mp])continue;const nm={};for(const [k,v] of Object.entries(b[mp])){const n=+k;nm[n>0&&n>=key&&n<G?n+2:n]=v}b[mp]=nm}
  const max=Math.max(0,...Object.keys(b.pages).map(Number));let grew='';if(max>b.pageCount){b.pageCount=Math.ceil(max/4)*4;grew=` · le livre passe à ${b.pageCount} pages`}
  save(b);toastUndo(`Planche vide insérée en planche ${plancheNo(key)}${grew}`);
}

/* ---------- events tab ---------- */
function pageDesc(pages){
  if(!pages.length)return '';
  if(pages.length===1)return `p. ${pages[0]} · ${sideOf(pages[0])}`;
  if(pages.length===2&&pages[0]%2===0&&pages[1]===pages[0]+1)return `p. ${pages[0]}–${pages[1]} · double page`;
  return `p. ${ranges(pages)}`;
}
function renderEvents(b,m){
  const ep=eventPages(b);
  const list=b.events.map(e=>({e,pages:ep[e.id]||[]})).sort((a,z)=>(a.pages[0]??1e9)-(z.pages[0]??1e9));
  let rows='',lastGroup=null;
  for(const {e,pages} of list){
    const grp=pages.length?(b.spreadNames[spreadKeyOf(pages[0])]||''):'__none';
    if(grp!==lastGroup&&(grp||lastGroup)){rows+=`<tr class="grp-row"><td colspan="5">${grp==='__none'?'Sans page':grp?esc(grp):'<span class="muted">Planche sans nom</span>'}</td></tr>`}
    lastGroup=grp;
    const c=m.cap[e.id];
    rows+=`<tr class="evrow" data-drop="evrow" data-ev="${esc(e.id)}">
      <td class="grip-c"><span class="grip" draggable="true" data-drag="evmove" data-ev="${esc(e.id)}" title="Glisser entre deux lignes pour déplacer, sur une ligne pour fusionner">⋮⋮</span></td>
      <td style="min-width:260px"><textarea class="f evname-t" rows="1" id="evn-${esc(e.id)}" data-act="ev-name" data-ev="${esc(e.id)}" aria-label="Texte de l'événement">${esc(e.name)}</textarea></td>
      <td class="small" style="white-space:nowrap">${pages.length?`<button class="linkish mono" data-act="goto-pages" data-ev="${esc(e.id)}">${esc(pageDesc(pages))}</button>`:'<span class="muted">aucune page</span>'}</td>
      <td class="mono small" title="Photos placées dans Définition des photos">${c&&c.placed?c.placed+' ph.':''}</td>
      <td><button class="btn ghost danger sm ${view.armed==='ev:'+e.id?'armed':''}" data-act="del-ev" data-ev="${esc(e.id)}">${view.armed==='ev:'+e.id?'Confirmer':'Supprimer'}</button></td></tr>`;
  }
  return `<form class="row" id="add-ev" style="margin-bottom:14px">
      <button class="btn primary" type="button" data-act="imp-open">Importer depuis Excel…</button>
      <input class="f" id="ae-name" placeholder="Nouvel événement (ex. Jour 3 : grotte)" style="flex:1;min-width:200px">
      <button class="btn" type="submit">Ajouter l'événement</button></form>
    ${b.events.length?`<div class="panel tablebox"><table class="evtable"><thead><tr><th></th><th>Événement</th><th>Pages</th><th>Photos</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small muted">Glissez la poignée ⋮⋮ entre deux lignes pour déplacer un événement à cet endroit (la suite avance par planches en gardant ses côtés), ou sur une ligne pour fusionner les textes. Les titres de groupe reprennent les noms de planches.</p>`
    :`<div class="panel emptystate"><h2>Pas encore d'événement</h2><p class="muted">Importez votre chemin de fer Excel, ajoutez les événements un par un ici, ou cliquez sur une page du plan pour en écrire un.</p><button class="btn primary" data-act="imp-open">Importer depuis Excel…</button></div>`}`;
}

/* ---------- layouts tab ---------- */
function renderLayouts(b,m,ev){
  const max=b.maxReuse;const others=[...books.values()].filter(x=>x.id!==b.id&&(x.layouts||[]).length);
  const free=m.sp.filter(s=>!b.layouts.some(l=>l.id===b.spreads[s.key])).length;
  const simSp=spreadsOf(+view.sim.pages||0).length;
  const lockedCount=b.layouts.filter(l=>l.locked).length;
  const calc=`<div class="panel calc">
      <span class="big"><span class="mono">${b.pageCount}</span> p. → <span class="mono">${m.sp.length}</span> doubles pages → <em>${m.needed} MEP minimum</em></span>
      <label class="small muted row" style="gap:6px">Réutilisation max d'une mise en page <input class="f mono" style="width:60px;padding:3px 6px" type="number" min="1" id="bk-max" data-act="maxreuse" value="${b.maxReuse}"></label>
      <span class="small muted">Définies : <b class="mono">${b.layouts.length}</b>${b.layouts.length<m.needed?` (il en manque <b class="mono" style="color:var(--bad)">${m.needed-b.layouts.length}</b>)`:''} · ${free} double${free>1?'s':''} page${free>1?'s':''} libre${free>1?'s':''}${m.over.length?` · <span class="pill bad">${m.over.map(l=>esc(l.name)).join(', ')} &gt; ${max}×</span>`:''}</span>
      <span class="sim">Simuler : <input class="f mono" type="number" min="4" step="4" id="sim-pages" data-act="sim" value="${esc(view.sim.pages)}" aria-label="Pages"> p., max <input class="f mono" type="number" min="1" id="sim-max" data-act="sim" value="${esc(view.sim.max)}" aria-label="Maximum par mise en page"> → <b class="mono">${simSp&&+view.sim.max?Math.ceil(simSp/+view.sim.max):0}</b> MEP</span></div>`;
  const actions=`<div class="lay-actions">
      <button class="btn primary" data-act="pick-laydir">${I_FOLDER} Importer le dossier des mises en page</button>
      <button class="btn" data-act="add-lay">+ Mise en page vide</button>
      <button class="btn" data-act="auto" ${!b.layouts.length||!free?'disabled':''}>Remplir les ${free} doubles pages libres</button>
      <button class="btn ${view.armed==='redistribute'?'armed':''}" data-act="redistribute" ${b.layouts.length?'':'disabled'}>${view.armed==='redistribute'?'Confirmer : tout redistribuer':'Tout redistribuer'}</button>
      ${others.length?`<span class="row" style="gap:6px"><select class="f" id="copy-from" aria-label="Livre source"><option value="">Copier les MEP d'un livre…</option>${others.map(o=>`<option value="${esc(o.id)}">${esc(o.title)} (${o.layouts.length})</option>`).join('')}</select><button class="btn" data-act="copy-lays">Copier</button></span>`:''}
      <label class="check"><input type="checkbox" id="use-types" data-act="use-types" ${b.useTypes?'checked':''}> Classer par type</label>
      <span class="small muted" style="flex-basis:100%">La répartition ignore les mises en page verrouillées ${I_LOCK} (${lockedCount}) et les doubles pages verrouillées. Une mise en page reste limitée à ${max} utilisations.</span></div>`;
  const usedNames=new Set();b.layouts.forEach(l=>{[l.leftSrc,l.rightSrc,l.captureSrc].forEach(n=>n&&usedNames.add(n))});
  const trayHtml=tray.items.length?`<aside class="panel tray"><div class="pane-bar"><div class="row" style="justify-content:space-between"><b>${tray.items.length} images</b><button class="btn ghost sm" data-act="close-tray">Fermer</button></div>
      <span class="small muted">Glissez chaque image sur le côté gauche ou droit d'une mise en page, ou créez-les en série :</span>
      <div class="row" style="gap:6px"><button class="btn sm" data-act="tray-pairs" title="Les noms finissant par _G / _D (ou gauche / droite) sont appariés ; sinon les images sont prises deux par deux dans l'ordre des noms">Créer par paires G/D</button><button class="btn sm" data-act="tray-singles" title="Chaque image montre une double page entière">1 image = 1 double page</button></div>
      <label class="check"><input type="checkbox" id="tray-hide" data-act="tray-hide" ${tray.hideUsed?'checked':''}> Masquer les images utilisées</label></div>
    <div class="tray-list" id="tray-list">${tray.items.filter(t=>!tray.hideUsed||!usedNames.has(t.name)).map(t=>`<div class="timg ${usedNames.has(t.name)?'used':''}" draggable="true" data-drag="trayimg" data-tid="${t.id}" title="${esc(t.name)}"><img src="${t.url}" alt="" loading="lazy"><span>${esc(t.name)}</span></div>`).join('')}</div></aside>`:'';
  const cards=b.layouts.map(l=>{
    const used=m.u[l.id]||[];const n=used.length;const pct=Math.min(100,n/max*100);
    const L=imgSrc(l.left),R=imgSrc(l.right),F=imgSrc(l.capture);const showFull=!L&&!R&&F;
    const half=(side,src,label)=>`<div class="half" data-drop="half" data-act="half" data-lay="${esc(l.id)}" data-side="${side}" tabindex="0" role="button" aria-label="${label} de ${esc(l.name)}" title="${label} : clic, glisser une image ou coller (Ctrl/Cmd+V)">${src?`<img src="${esc(src)}" alt="">`:showFull?'':`<span>${side==='left'?'G':'D'}</span>`}</div>`;
    return `<article class="panel lay ${n>max?'over':''} ${l.locked?'locked':''}" data-lay="${esc(l.id)}">
      <div class="halves">${half('left',L,'Page gauche')}${half('right',R,'Page droite')}${showFull?`<img class="full" src="${esc(F)}" alt="" style="pointer-events:none">`:''}</div>
      <div class="lay-body">
        <input class="f lay-name" id="ln-${esc(l.id)}" data-act="lay-name" data-lay="${esc(l.id)}" value="${esc(l.name)}" aria-label="Nom">
        <div class="lay-line">
          <input class="f mono ph-in" type="number" min="0" id="lp-${esc(l.id)}" data-act="lay-photos" data-lay="${esc(l.id)}" value="${l.photos||''}" placeholder="ph." title="Nombre de photos sur la double page" aria-label="Nombre de photos">
          ${b.useTypes?`<select class="f" id="lf-${esc(l.id)}" data-act="lay-fam" data-lay="${esc(l.id)}" aria-label="Type"><option value="">Type…</option>${FAMILIES.map(f=>`<option ${f===l.family?'selected':''}>${f}</option>`).join('')}</select>`:'<span style="flex:1"></span>'}
          <button class="icon-btn ${l.locked?'on':''}" data-act="lock-lay" data-lay="${esc(l.id)}" aria-pressed="${!!l.locked}" title="${l.locked?'Verrouillée : jamais attribuée automatiquement':'Verrouiller (sommaire, page de garde, 4e de couverture, sur mesure…)'}">${l.locked?I_LOCK:I_UNLOCK}</button>
          <button class="icon-btn ${view.armed==='lay:'+l.id?'armed':''}" data-act="del-lay" data-lay="${esc(l.id)}" title="${view.armed==='lay:'+l.id?'Cliquer à nouveau pour supprimer':'Supprimer'}" aria-label="Supprimer">${I_TRASH}</button>
        </div>
        <div class="usage"><b style="color:${n>max?'var(--bad)':'inherit'}">${n}/${max}</b><div class="bar ${n>max?'bad':n===max?'ok':''}"><i style="width:${pct}%"></i></div></div>
        ${used.length?`<div class="uses">${used.map(k=>{const pg=spreadPages(b,k);const e=ev[b.pages[pg[0]]]||ev[b.pages[pg[1]]];return `<button data-act="goto-spread" data-key="${k}" title="${e?esc(e.name):'Sans événement'}">${e?`<span class="dot" style="--h:${e.hue}"></span>`:''}${pg.join('–')}</button>`}).join('')}</div>`:''}
      </div></article>`}).join('');
  const grid=`<div class="lays">${cards}${tray.items.length?`<div class="newlay" data-drop="newlay">Déposez une image ici pour créer une nouvelle mise en page</div>`:''}</div>`;
  return calc+actions+(b.layouts.length||tray.items.length?`<div class="layzone ${tray.items.length?'with-tray':''}">${trayHtml}${grid}</div>`:`<div class="panel emptystate"><h2>Aucune mise en page</h2><p class="muted">Importez le dossier où sont rangées vos mises en page, puis attribuez à chacune son image de gauche et de droite.</p><button class="btn primary" data-act="pick-laydir">${I_FOLDER} Importer le dossier des mises en page</button></div>`);
}

/* ================= import des événements ================= */
const XLSX_URL='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let xlsxLoading=null;
function loadXLSX(){if(window.XLSX)return Promise.resolve(window.XLSX);if(!xlsxLoading)xlsxLoading=new Promise((res,rej)=>{const s=document.createElement('script');s.src=XLSX_URL;s.onload=()=>res(window.XLSX);s.onerror=()=>{xlsxLoading=null;rej(new Error('xlsx'))};document.head.appendChild(s)});return xlsxLoading}
const normName=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
const cellText=v=>v==null?'':String(v).replace(/\s+/g,' ').trim();
const isPageNum=v=>typeof v==='number'?Number.isInteger(v)&&v>=0&&v<3000:/^\s*\d{1,4}(\.0+)?\s*$/.test(String(v??''));
// Grid = the chemin de fer as laid out in Excel: a row of texts directly above a row of page numbers.
function parseGrid(G){
  const numRows=[];
  G.forEach((row,r)=>{const filled=row.filter(v=>cellText(v)!=='').length;const ints=row.filter(isPageNum).length;if(ints>=4&&ints/filled>=.6)numRows.push(r)});
  if(!numRows.length)return null;
  const pageCols=[...new Set(numRows.flatMap(r=>G[r].map((v,c)=>isPageNum(v)?c:-1).filter(c=>c>=0)))].sort((a,b)=>a-b);
  const colIdx=new Map(pageCols.map((c,i)=>[c,i]));
  const pages=new Map();let inherited=0;const N=pageCols.length;
  const starts=new Map();
  for(const r of numRows){
    const cnt=new Map();G[r].forEach((v,c)=>{if(isPageNum(v)&&colIdx.has(c)){const o=Math.round(+v)-colIdx.get(c);cnt.set(o,(cnt.get(o)||0)+1)}});
    starts.set(r,[...cnt.entries()].sort((a,z)=>z[1]-a[1]||a[0]-z[0])[0][0]);   // most common offset: tolerant of typos
  }
  // Blocks whose page numbers were erased: infer them from the regular rhythm of the grid (same row spacing, N pages per line)
  if(numRows.length>=2){
    const diffs=new Map();for(let i=1;i<numRows.length;i++){const d=numRows[i]-numRows[i-1];diffs.set(d,(diffs.get(d)||0)+1)}
    const P=[...diffs.entries()].sort((a,z)=>z[1]-a[1])[0][0];const r0=numRows[0],s0=starts.get(r0);
    if(P>=2)for(let s=r0%P||P;s<G.length;s+=P){if(starts.has(s)||s<1)continue;const row=G[s-1]||[];
      if(pageCols.filter(c=>cellText(row[c])).length>=2&&(G[s]||[]).filter(v=>cellText(v)).length<=N/2){const st=s0+(s-r0)/P*N;if(st+N>1)starts.set(s,st)}}
  }
  for(const [r,start] of [...starts.entries()].sort((a,z)=>a[0]-z[0])){
    const tr=r-1;if(tr<0||starts.has(tr))continue;
    const cols=pageCols.filter(c=>{const p=start+colIdx.get(c);return p>=1});
    const row=G[tr]||[];
    for(const c of cols){const p=start+colIdx.get(c);let t=cellText(row[c]);
      if(!t&&p%2===1&&colIdx.has(c-1)&&start+colIdx.get(c-1)===p-1){const left=cellText(row[c-1]);if(left&&!/^\d+$/.test(left)){t=left;inherited++}} // empty right page continues the left one
      if(t&&!/^\d+([.,]\d+)?$/.test(t))pages.set(p,t)}
  }
  return pages.size?{pages,inherited}:null;
}
// List = one line per event: "4-7 ⇥ Nom ⇥ 12" (pages, name, optional photo count) or just names
function parseList(text){
  const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);const pages=new Map();const names=[];let any=false;
  for(const l of lines){const cols=l.split(/\t|;/).map(x=>x.trim());const m=cols[0].match(/^(\d{1,4})\s*(?:[-–à]|a)\s*(\d{1,4})$|^(\d{1,4})$/i);
    if(m&&cols[1]){any=true;const a=+(m[1]||m[3]),z=+(m[2]||m[3]);for(let p=Math.min(a,z);p<=Math.max(a,z);p++)pages.set(p,cols[1]);const ph=parseInt(cols[2]);if(ph)names.push({name:cols[1],photos:ph})}
    else if(!m)names.push({name:cols.join(' ').trim(),photos:parseInt(cols.find((c,i)=>i>0&&/^\d+$/.test(c)))||0})}
  return {pages,names,hasPages:any};
}
function buildImport(pages,extraNames,inherited){
  const evs=[];const byN=new Map();
  for(const p of [...pages.keys()].sort((a,z)=>a-z)){const name=pages.get(p);const k=normName(name);if(!byN.has(k)){const m=name.match(/(\d+)\s*photos?/i);const e={name:name.charAt(0).toUpperCase()+name.slice(1),photos:m?+m[1]:0,pages:[]};byN.set(k,e);evs.push(e)}byN.get(k).pages.push(p)}
  for(const n of extraNames||[]){const k=normName(n.name);if(!k)continue;if(byN.has(k)){if(n.photos)byN.get(k).photos=n.photos}else{const e={name:n.name,photos:n.photos||0,pages:[]};byN.set(k,e);evs.push(e)}}
  const all=[...pages.keys()];
  return {events:evs,pageCount:all.length,maxPage:all.length?Math.max(...all):0,minPage:all.length?Math.min(...all):0,inherited:inherited||0};
}
const imp={};
function sheetGrid(X,ws){
  if(!ws||!ws['!ref'])return [];const R=X.utils.decode_range(ws['!ref']);const G=[];
  for(let r=R.s.r;r<=R.e.r;r++){const row=[];for(let c=R.s.c;c<=R.e.c;c++){const cell=ws[X.utils.encode_cell({r,c})];row[c-R.s.c]=cell?cell.v:null}G.push(row)}
  for(const m of ws['!merges']||[]){const v=ws[X.utils.encode_cell(m.s)];if(!v)continue;for(let r=m.s.r;r<=m.e.r;r++)for(let c=m.s.c;c<=m.e.c;c++){if(G[r-R.s.r])G[r-R.s.r][c-R.s.c]=v.v}}
  return G;
}
function openImport(){const b=cur();Object.assign(imp,{result:null,src:'',sheets:null,sheet:0,mode:b.events.length?'merge':'replace',extend:true,error:'',grids:null});
  showModal(`<div class="row" style="justify-content:space-between"><h3>Importer des événements</h3><button class="btn ghost sm" data-act="close-overlay">Fermer</button></div>
    <p class="small muted" style="margin:0">Votre chemin de fer Excel est lu tel quel : chaque ligne de textes est associée à la ligne de numéros de page juste en dessous, cellules fusionnées comprises. Les textes identiques forment un seul événement, et « 6 photos » dans un texte devient le nombre de photos.</p>
    <div class="row"><button class="btn primary" data-act="imp-file">${I_FOLDER} Choisir un fichier Excel ou CSV</button><span class="small muted" id="imp-src"></span></div>
    <div id="imp-sheets"></div>
    <label class="small muted" for="imp-paste">Ou collez ici des cellules copiées depuis Excel : la grille du chemin de fer, ou une ligne par événement (pages, nom, photos).</label>
    <textarea class="f" id="imp-paste" rows="4" placeholder="4-7&#9;Jour 1 : arrivée au camping&#9;12&#10;8-9&#9;Pont du Gard&#10;Jour 2 : cascades"></textarea>
    <div id="imp-preview"></div>`,'wide');
  renderImpPreview();
}
function renderImpPreview(){
  const el=document.getElementById('imp-preview');if(!el)return;const b=cur();const r=imp.result;
  document.getElementById('imp-src').textContent=imp.src||'';
  const sh=document.getElementById('imp-sheets');
  if(sh)sh.innerHTML=imp.sheets&&imp.sheets.length>1?`<label class="row small muted">Feuille <select class="f" id="imp-sheet">${imp.sheets.map((n,i)=>`<option value="${i}" ${i===imp.sheet?'selected':''}>${esc(n)}${imp.grids[i]?` (${imp.grids[i].events.length} événements)`:' (pas de chemin de fer reconnu)'}</option>`).join('')}</select></label>`:'';
  if(imp.error){el.innerHTML=`<p class="err">${esc(imp.error)}</p>`;return}
  if(!r){el.innerHTML='';return}
  if(!r.events.length){el.innerHTML='<p class="err">Aucun événement reconnu. Vérifiez que chaque ligne de textes est juste au-dessus de sa ligne de numéros de page.</p>';return}
  const newMax=Math.ceil(r.maxPage/4)*4;
  el.innerHTML=`<div class="panel" style="padding:10px;display:grid;gap:8px">
    <b>${r.events.length} événements${r.pageCount?` sur ${r.pageCount} pages (p. ${r.minPage} à ${r.maxPage})`:' sans pages'}</b>
    ${r.inherited?`<span class="small muted">${r.inherited} page${r.inherited>1?'s':''} de droite vide${r.inherited>1?'s':''} rattachée${r.inherited>1?'s':''} à l'événement de la page de gauche.</span>`:''}
    <div class="tablebox" style="max-height:240px;overflow:auto"><table class="small"><thead><tr><th>Événement</th><th>Pages</th><th>Photos</th></tr></thead><tbody>${r.events.map(e=>`<tr><td>${esc(e.name)}</td><td class="mono">${e.pages.length?ranges(e.pages):'—'}</td><td class="mono">${e.photos||''}</td></tr>`).join('')}</tbody></table></div>
    <div class="row small">
      <label class="check"><input type="radio" name="imp-mode" value="replace" ${imp.mode==='replace'?'checked':''}> Remplacer les événements du livre</label>
      <label class="check"><input type="radio" name="imp-mode" value="merge" ${imp.mode==='merge'?'checked':''}> Compléter (seules les pages libres sont remplies)</label>
    </div>
    ${r.maxPage>b.pageCount?`<label class="check small"><input type="checkbox" id="imp-extend" ${imp.extend?'checked':''}> Passer le livre de ${b.pageCount} à ${newMax} pages</label>`:''}
    <div class="row"><button class="btn primary" data-act="imp-apply">Importer ${r.events.length} événements</button>${b.events.length&&imp.mode==='replace'?`<span class="small err">Les ${b.events.length} événements actuels seront remplacés.</span>`:''}</div></div>`;
}
async function importFile(f){
  imp.error='';imp.src=f.name;imp.result=null;renderImpPreview();
  try{
    if(/\.(csv|txt|tsv)$/i.test(f.name)){importText(await f.text());return}
    imp.src=f.name+' · lecture…';renderImpPreview();
    const X=await loadXLSX();const wb=X.read(await f.arrayBuffer(),{type:'array'});
    imp.sheets=wb.SheetNames;imp.grids=wb.SheetNames.map(n=>{const g=parseGrid(sheetGrid(X,wb.Sheets[n]));return g?buildImport(g.pages,[],g.inherited):null});
    let best=0;imp.grids.forEach((g,i)=>{if(g&&(!imp.grids[best]||g.events.length>imp.grids[best].events.length))best=i});
    imp.sheet=best;imp.result=imp.grids[best];imp.src=f.name;
    if(!imp.result)imp.error="Aucun chemin de fer reconnu dans ce fichier : il faut une ligne de textes juste au-dessus d'une ligne de numéros de page.";
  }catch(e){imp.error=e&&e.message==='xlsx'?"Le lecteur Excel n'a pas pu être chargé (connexion internet nécessaire). Vous pouvez copier-coller les cellules à la place.":"Ce fichier n'a pas pu être lu."}
  renderImpPreview();
}
function importText(text){
  imp.error='';
  if(!text.trim()){imp.result=null;renderImpPreview();return}
  const G=text.split(/\r?\n/).map(l=>l.split('\t'));const g=parseGrid(G);
  if(g){imp.result=buildImport(g.pages,[],g.inherited)}
  else{const l=parseList(text);imp.result=buildImport(l.pages,l.names,0)}
  imp.sheets=null;renderImpPreview();
}
function applyImport(){
  const b=cur();const r=imp.result;if(!b||!r)return;
  if(imp.mode==='replace'){b.events=[];b.pages={}}
  const byN=new Map(b.events.map(e=>[normName(e.name),e]));let set=0;
  for(const e of r.events){let ev=byN.get(normName(e.name));
    if(!ev){ev={id:uid('e'),name:e.name,photos:e.photos||0,hue:nextHue(b)};b.events.push(ev);byN.set(normName(e.name),ev)}else if(e.photos&&!ev.photos)ev.photos=e.photos;
    for(const p of e.pages){if(imp.mode==='merge'&&b.pages[p]&&b.pages[p]!==ev.id)continue;b.pages[p]=ev.id;set++}}
  if(imp.extend&&r.maxPage>b.pageCount)b.pageCount=Math.ceil(r.maxPage/4)*4;
  closeOverlay();save(b);toast(`${r.events.length} événements importés, ${set} pages renseignées`);
}

/* ================= actions ================= */
const cur=()=>books.get(view.id);
function nextHue(b){const used=new Set(b.events.map(e=>e.hue));return HUES.find(h=>!used.has(h))??HUES[b.events.length%HUES.length]}
const isFixed=(b,key)=>{if(b.pins[key])return true;const l=b.layouts.find(x=>x.id===b.spreads[key]);return !!(l&&l.locked)};
function autoAssign(b){
  const sp=spreadsOf(b.pageCount),u=usage(b),max=b.maxReuse,ev=evById(b),cap=capacity(b);const cnt={};b.layouts.forEach(l=>cnt[l.id]=(u[l.id]||[]).length);
  const pool=b.layouts.filter(l=>!l.locked);let n=0;
  sp.forEach((s,i)=>{if(b.layouts.some(l=>l.id===b.spreads[s.key])||b.pins[s.key])return;
    const prev=sp[i-1]&&b.spreads[sp[i-1].key],next=sp[i+1]&&b.spreads[sp[i+1].key];
    const e=ev[b.pages[s.l]]||ev[b.pages[s.r]];const target=e&&e.photos&&cap[e.id]?e.photos/cap[e.id].spreads.size:0;
    let c=pool.filter(l=>cnt[l.id]<max&&l.id!==prev&&l.id!==next);
    if(!c.length)c=pool.filter(l=>cnt[l.id]<max);
    if(!c.length)return;
    c.sort((a,z)=>(target&&a.photos&&z.photos?Math.abs(a.photos-target)-Math.abs(z.photos-target):0)||cnt[a.id]-cnt[z.id]||Math.random()-.5);
    b.spreads[s.key]=c[0].id;cnt[c[0].id]++;n++});
  return n;
}
function arm(key){view.armed=key;render();clearTimeout(arm.t);arm.t=setTimeout(()=>{if(view.armed===key){view.armed=null;render()}},4000)}
function placeItems(b,key,items,side,beforePath){
  if(+key===0)side='r';
  const all=(b.assign[key]||[]).filter(a=>!items.some(x=>x.p===a.p));
  const L=all.filter(a=>photoSide(key,a)==='l'),Rr=all.filter(a=>photoSide(key,a)==='r');const tgt=side==='r'?Rr:L;
  let at=tgt.length;if(beforePath){const i=tgt.findIndex(a=>a.p===beforePath);if(i>=0)at=i}
  tgt.splice(at,0,...items.map(x=>({...x,s:side})));b.assign[key]=[...L,...Rr];
}
function assignPhotos(b,key,paths,beforePath,side){
  const items=paths.map(p=>{const it=lib.byPath.get(p);return {p,d:it&&it.dateSrc==='exif'?it.date:0}});
  placeItems(b,key,items,side||defaultSide(key),beforePath);
}
const defaultSide=key=>+key===0?'r':(view.active===+key&&view.activeSide?view.activeSide:'l');
let lightbox=null;
function openLightbox(i){
  const {arr}=visibleItems();if(i<0||i>=arr.length)return;const it=arr[i];
  if(lightbox&&lightbox.url)URL.revokeObjectURL(lightbox.url);
  const url=BROWSER_IMG.test(it.name)?URL.createObjectURL(it.file):'';lightbox={i,url};const b=cur();
  document.getElementById('overlay').innerHTML=`<div class="overlay" data-act="overlay-bg"><div class="lightbox">${url?`<img src="${url}" alt="${esc(it.name)}">`:`<div class="modal"><p>Aperçu indisponible pour ce format (${esc(it.name.split('.').pop())}).</p></div>`}
    <div class="cap-line"><span class="mono">${esc(it.path)}</span><span>${it.dateSrc==='exif'?fmtDay(it.date)+' · '+fmtTime(it.date):'Date du fichier : '+fmtDay(it.date)}</span>
    <button class="btn sm" data-act="lb-prev" aria-label="Photo précédente">←</button><button class="btn sm" data-act="lb-next" aria-label="Photo suivante">→</button><button class="btn primary sm" data-act="lb-add" data-path="${esc(it.path)}">Ajouter à Pl. ${plancheNo(view.active)} · ${defaultSide(view.active)==='l'?'gauche':'droite'}</button><button class="btn sm" data-act="close-overlay">Fermer</button></div></div></div>`;
}
function loadTray(files){
  tray.items.forEach(t=>URL.revokeObjectURL(t.url));
  tray.items=[...files].filter(f=>BROWSER_IMG.test(f.name)&&!f.name.startsWith('.')).sort((a,z)=>natural(a.webkitRelativePath||a.name,z.webkitRelativePath||z.name)).map((f,i)=>({id:'t'+i,name:f.name,file:f,url:URL.createObjectURL(f)}));
  if(!tray.items.length){toast('Aucune image (JPG, PNG) trouvée dans ce dossier.');render();return}
  toast(`${tray.items.length} images chargées`);render();
}
const SIDE_RE=/[\s_\-.]+(g|d|gauche|droite|left|right|l|r|gch|dte)$/i;
async function trayCreate(how){
  const b=cur();const usedNames=new Set();b.layouts.forEach(l=>[l.leftSrc,l.rightSrc,l.captureSrc].forEach(n=>n&&usedNames.add(n)));
  const items=tray.items.filter(t=>!usedNames.has(t.name));if(!items.length){toast('Toutes les images sont déjà utilisées.');return}
  const stem=n=>n.replace(/\.[^.]+$/,'');const jobs=[];
  if(how==='singles'){items.forEach(t=>jobs.push({name:stem(t.name),full:t}))}
  else{
    const groups=new Map();const loose=[];
    items.forEach(t=>{const s=stem(t.name);const m=s.match(SIDE_RE);if(m){const k=s.replace(SIDE_RE,'');if(!groups.has(k))groups.set(k,{});const right=/^(d|droite|right|r|dte)$/i.test(m[1]);groups.get(k)[right?'right':'left']=t}else loose.push(t)});
    for(const [k,g] of groups)jobs.push({name:k,left:g.left,right:g.right});
    for(let i=0;i<loose.length;i+=2)jobs.push({name:stem(loose[i].name),left:loose[i],right:loose[i+1]});
  }
  let done=0;
  for(const j of jobs){const l={id:uid('m'),name:j.name,family:'',photos:0,capture:'',locked:false};b.layouts.push(l);
    try{for(const side of ['left','right']){if(j[side]){l[side]=await storeImage(j[side].file,b.id+'~'+l.id+'~'+side,800);l[side+'Src']=j[side].name}}
      if(j.full){l.capture=await storeImage(j.full.file,b.id+'~'+l.id+'~full',1200);l.captureSrc=j.full.name}}catch(e){toast("Une image n'a pas pu être enregistrée.")}
    done++;setSaved(`Import ${done}/${jobs.length}…`);if(done%4===0)save(b)}
  save(b);toast(`${jobs.length} mises en page créées`);
}

document.addEventListener('click',async ev=>{
  if(view.menu&&!ev.target.closest('.burger:not(.hist)')){view.menu=false;render()}
  if(view.hist&&!ev.target.closest('.hist')&&!ev.target.closest('.histmenu')){view.hist=false;renderHistSlot()}
  if(view.lpick!=null&&!ev.target.closest('.lpick')&&!ev.target.closest('[data-act="lpick"]')){view.lpick=null;render()}
  const t=ev.target.closest('[data-act]');if(!t)return;const act=t.dataset.act;const b=cur();
  if(t.tagName==='INPUT'||t.tagName==='SELECT'||t.tagName==='TEXTAREA')return;
  switch(act){
    case 'show-new':view.showNew=true;view.newErr='';view.newDraft=null;render();setTimeout(()=>document.getElementById('nb-title')?.focus(),0);break;
    case 'hide-new':view.showNew=false;render();break;
    case 'cycle':{const bk=books.get(t.dataset.book);bk.stages[t.dataset.stage]=ST[bk.stages[t.dataset.stage]||'todo'].next;save(bk);break}
    case 'tab':view.tab=t.dataset.tab;view.sel.clear();render();break;
    case 'cdfmode':{const from=view.cdfMode,to=t.dataset.mode;if(from===to)break;
      view.scrollMem=view.scrollMem||{};view.scrollMem[from]={y:window.scrollY,pb:document.getElementById('pb-scroll')?.scrollTop,ps:document.getElementById('ps-scroll')?.scrollTop};
      view.cdfMode=to;view.sel.clear();view.edit=null;render();
      const mem=view.scrollMem[to];
      if(mem){window.scrollTo(0,mem.y);const pb=document.getElementById('pb-scroll'),ps=document.getElementById('ps-scroll');if(pb&&mem.pb!=null)pb.scrollTop=mem.pb;if(ps&&mem.ps!=null)ps.scrollTop=mem.ps}
      else if(to==='photos'){const top=document.querySelector('.cdf-tools');if(top)window.scrollTo(0,top.getBoundingClientRect().top+window.scrollY-headerH())}
      break}
    case 'setpages':b.pageCount=+t.dataset.n;save(b);break;
    case 'page':{if(t.tagName!=='BUTTON')return;const p=+t.dataset.page;
      if(ev.shiftKey||ev.metaKey||ev.ctrlKey){if(ev.shiftKey&&view.last){const [a,z]=[Math.min(view.last,p),Math.max(view.last,p)];for(let i=a;i<=z;i++)view.sel.add(i)}else{view.sel.has(p)?view.sel.delete(p):view.sel.add(p)}view.last=p;view.edit=null;render();break}
      view.sel.clear();view.last=p;view.edit=p;render();break}
    case 'pe-spread':{const p=+t.dataset.page;commitPageEdit();const k=spreadKeyOf(p);const other=k===0?null:(p===k?k+1:k);const id=b.pages[p];
      if(!id){toast("Écrivez d'abord le texte de l'événement.");break}
      if(other==null||other>b.pageCount){toast("Cette planche n'a qu'une page.");break}
      if(b.pages[other]&&b.pages[other]!==id){mergeEvents(b,b.pages[other],id);view.edit=null;render();break}
      b.pages[other]=id;view.edit=null;save(b);break}
    case 'pe-free':{const p=+t.dataset.page;remember(b);delete b.pages[p];dropOrphans(b);view.edit=null;save(b);toastUndo('Page libérée');break}
    case 'lpick':{const k=+t.dataset.key;view.lpick=view.lpick===k?null:k;render();break}
    case 'lp-set':{const k=t.dataset.key,id=t.dataset.lay;if(id)b.spreads[k]=id;else delete b.spreads[k];view.lpick=null;save(b);break}
    case 'ins-pl':insertPlanche(b,+t.dataset.key);break;
    case 'menu':view.menu=!view.menu;render();break;
    case 'undo':t.closest('.toast')?.remove();histUndo();break;
    case 'hist':view.hist=!view.hist;renderHistSlot();break;
    case 'h-undo':histUndo();renderHistSlot();break;
    case 'h-redo':histRedo();renderHistSlot();break;
    case 'ver-arm':view.armed='ver:'+t.dataset.key;renderHistSlot();break;
    case 'ver-cancel':view.armed=null;renderHistSlot();break;
    case 'ver-restore':view.armed=null;restoreVersion(t.dataset.key);break;
    case 'h-goto':{const i=+t.dataset.i;if(t.dataset.kind==='undo'){while(hist.length>i)histUndo()}else{while(redoSt.length>i)histRedo()}view.hist=false;renderHistSlot();break}
    case 'sel-free':{remember(b);for(const p of view.sel)delete b.pages[p];dropOrphans(b);view.sel.clear();save(b);toastUndo('Pages libérées');break}
    case 'pin':{const k=t.dataset.key;if(b.pins[k])delete b.pins[k];else b.pins[k]=true;save(b);break}
    case 'clear-sel':view.sel.clear();render();break;
    case 'del-book':if(view.armed==='book'){view.armed=null;await removeBook(b.id);location.hash='#avancement';toast('Livre supprimé')}else arm('book');break;
    case 'del-ev':{const id=t.dataset.ev;if(view.armed==='ev:'+id){view.armed=null;b.events=b.events.filter(e=>e.id!==id);for(const k in b.pages)if(b.pages[k]===id)delete b.pages[k];save(b)}else arm('ev:'+id);break}
    case 'del-lay':{const id=t.dataset.lay;if(view.armed==='lay:'+id){view.armed=null;b.layouts=b.layouts.filter(l=>l.id!==id);for(const k in b.spreads)if(b.spreads[k]===id)delete b.spreads[k];save(b)}else arm('lay:'+id);break}
    case 'lock-lay':{const l=b.layouts.find(x=>x.id===t.dataset.lay);l.locked=!l.locked;save(b);break}
    case 'hue':{const e=b.events.find(x=>x.id===t.dataset.ev);e.hue=HUES[(HUES.indexOf(e.hue)+1)%HUES.length];save(b);break}
    case 'goto-pages':{const ep=eventPages(b)[t.dataset.ev]||[];view.tab='cdf';view.cdfMode='plan';view.sel=new Set(ep);render();document.querySelector('.pg.sel')?.scrollIntoView({block:'center',behavior:'smooth'});break}
    case 'goto-spread':{const k=+t.dataset.key;view.tab='cdf';view.cdfMode='plan';view.sel=new Set(spreadPages(b,k));render();document.querySelector(`.spread[data-key="${k}"]`)?.scrollIntoView({block:'center',behavior:'smooth'});break}
    case 'add-lay':{const i=b.layouts.length;b.layouts.push({id:uid('m'),name:'MEP '+(i<26?String.fromCharCode(65+i):i+1),family:'',photos:0,capture:'',locked:false});save(b);break}
    case 'auto':{const n=autoAssign(b);save(b);toast(n?`${n} double${n>1?'s':''} page${n>1?'s':''} attribuée${n>1?'s':''}`:'Aucune mise en page disponible : toutes ont atteint la limite ou sont verrouillées.');break}
    case 'redistribute':{if(view.armed!=='redistribute'){arm('redistribute');return}view.armed=null;for(const s of spreadsOf(b.pageCount)){if(b.spreads[s.key]&&!isFixed(b,s.key))delete b.spreads[s.key]}const n=autoAssign(b);save(b);toast(`${n} doubles pages redistribuées (verrouillées conservées)`);break}
    case 'copy-lays':{const src=books.get(document.getElementById('copy-from').value);if(!src){toast('Choisissez un livre source.');return}
      for(const l of src.layouts){const nl={...clone(l),id:uid('m')};for(const side of ['left','right','capture']){const ref=l[side];if(ref&&ref.startsWith('cap:')&&captures[ref.slice(4)]){const key=b.id+'~'+nl.id+'~'+side;await putCapture(key,captures[ref.slice(4)]);nl[side]='cap:'+key}}b.layouts.push(nl)}
      save(b);toast(`${src.layouts.length} mises en page copiées`);break}
    case 'half':{pickFor={book:b.id,lay:t.dataset.lay,side:t.dataset.side};const fp=document.getElementById('filepick');fp.value='';fp.click();break}
    case 'pick-laydir':{const i=document.getElementById('laydir');i.value='';i.click();break}
    case 'close-tray':tray.items.forEach(x=>URL.revokeObjectURL(x.url));tray.items=[];render();break;
    case 'tray-pairs':trayCreate('pairs');break;
    case 'tray-singles':trayCreate('singles');break;
    case 'pick-photos':case 'folder-add':closeOverlay();pickFolder(b,'add');break;
    case 'folder-replace':pickFolder(b,'replace',t.dataset.fid);break;
    case 'folder-reopen':reopenFolder(b,t.dataset.fid);break;
    case 'folder-del':{const k='fold:'+t.dataset.fid;if(view.armed===k){view.armed=null;removeFolder(b,t.dataset.fid)}else arm(k);break}
    case 'folder-later':closeOverlay();break;
    case 'backup':{const data=JSON.stringify({app:'atelier-chemin-de-fer',saved:new Date().toISOString(),books:[...books.values()],captures},null,1);offerFile('atelier-sauvegarde-'+new Date().toISOString().slice(0,10)+'.json',data,data);view.menu=false;break}
    case 'restore':{const i=document.getElementById('restorepick');i.value='';i.click();view.menu=false;break}
    case 'cwd':lib.cwd=t.dataset.dir;render();{const s=document.getElementById('pb-scroll');if(s)s.scrollTop=0}break;
    case 'jump':document.getElementById(t.dataset.target)?.scrollIntoView({block:'start'});break;
    case 'imp-open':openImport();break;
    case 'imp-file':{const i=document.getElementById('impfile');i.value='';i.click();break}
    case 'imp-apply':applyImport();break;
    case 'mv-open':openMove(t.dataset.ev,'page','');setTimeout(()=>document.getElementById('mv-page')?.focus(),0);break;
    case 'mv-apply':applyMove();break;
    case 'cut':{ev.stopPropagation();const it=lib.byPath.get(t.dataset.path);if(!it)return;const n=b.jalons.filter(j=>dayKey(j.t)===dayKey(it.date)).length+1;
      const j={id:uid('j'),name:lib.sort==='name'?`Jalon ${b.jalons.filter(x=>x.p&&x.p.slice(0,x.p.lastIndexOf('/'))===it.dir).length+1}`:`Jalon ${n} · ${fmtTime(it.date)}`,t:it.date,n:it.name,p:it.path};b.jalons.push(j);save(b);
      setTimeout(()=>{const inp=document.getElementById('jn-'+j.id);if(inp){inp.focus();inp.select()}},0);break}
    case 'jal-del':{b.jalons=b.jalons.filter(j=>j.id!==t.dataset.j);save(b);toast('Jalon retiré : ses photos rejoignent la section précédente');break}
    case 'sel-seg':{(segPaths[+t.dataset.seg]||[]).forEach(p=>lib.sel.add(p));render();break}
    case 'tile':{if(ev.detail>1)return;const p=t.dataset.path;const {arr}=visibleItems();
      if(ev.shiftKey&&lib.lastSel){const ia=arr.findIndex(x=>x.path===lib.lastSel),ib=arr.findIndex(x=>x.path===p);if(ia>=0&&ib>=0){for(let i=Math.min(ia,ib);i<=Math.max(ia,ib);i++)lib.sel.add(arr[i].path)}}
      else lib.sel.has(p)?lib.sel.delete(p):lib.sel.add(p);
      lib.lastSel=p;render();break}
    case 'clear-libsel':lib.sel.clear();render();break;
    case 'add-sel':{const {arr}=visibleItems();const paths=arr.filter(x=>lib.sel.has(x.path)).map(x=>x.path);assignPhotos(b,view.active,paths);lib.sel.clear();save(b);toast(`${paths.length} photo${paths.length>1?'s':''} ajoutée${paths.length>1?'s':''} à Pl. ${plancheNo(view.active)}, page ${defaultSide(view.active)==='l'?'gauche':'droite'}`);break}
    case 'activate':view.active=+t.dataset.key;render();break;
    case 'sp-prev':{const k=+t.dataset.key;const pk=k===2?0:k-2;if(b.spreadNames[pk]){b.spreadNames[k]=b.spreadNames[pk];save(b)}break}
    case 'activate-side':view.active=+t.dataset.key;view.activeSide=t.dataset.side;render();break;
    case 'pool-del':{ev.stopPropagation();view.armed='pool:'+t.dataset.ev;renderPool();break}
    case 'pool-del-no':view.armed=null;renderPool();break;
    case 'pool-del-yes':{const id=t.dataset.ev;view.armed=null;remember(b);b.events=b.events.filter(e=>e.id!==id);for(const k in b.pages)if(b.pages[k]===id)delete b.pages[k];save(b);toastUndo('Événement supprimé du livre');break}
    case 'pg-dbl':{ev.stopPropagation();const p=+t.dataset.page;const o=dblOther(b,p);if(o!=null)extendEvent(b,b.pages[p],o);break}
    case 'side':{ev.stopPropagation();const q=+t.dataset.page,id=t.dataset.ev;
      if(b.pages[q]===id){const k=spreadKeyOf(q);const other=k===0?null:(q===k?k+1:k);if(other!=null&&b.pages[other]===id){remember(b);delete b.pages[q];save(b);toastUndo('Page '+q+' libérée')}else toast("C'est la seule page de l'événement sur cette planche : glissez-le sur la corbeille pour le désassigner.")}
      else extendEvent(b,id,q);break}
    case 'unassign':{ev.stopPropagation();const k=t.dataset.key;b.assign[k].splice(+t.dataset.idx,1);if(!b.assign[k].length)delete b.assign[k];save(b);break}
    case 'export-csv':{const csv=buildCsv(b);offerFile(`${b.title} - photos par double page.csv`,csv,csv);break}
    case 'export-indd':{const jsx=buildJsx(b);const readme=['Placement des photos dans InDesign','','1. Décompressez ce dossier.','2. Ouvrez le document InDesign du livre.','3. Fenêtre > Utilitaires > Scripts. Clic droit sur « Utilisateur » > Faire apparaître dans le Finder (ou l\'Explorateur).','4. Copiez placer_photos.jsx dans ce dossier, puis double-cliquez dessus dans le panneau Scripts.','','Le script cherche les photos à partir du dossier du document InDesign (le même que celui choisi dans l\'Atelier : « '+(b.photoRoot||'')+' »).','S\'il ne les trouve pas, il vous demande de sélectionner ce dossier.','Les photos vont dans les blocs image vides de chaque double page, dans l\'ordre de la liste (de haut en bas, puis de gauche à droite, page de gauche d\'abord).','Tout le placement s\'annule en une seule fois avec Édition > Annuler.',''].join('\r\n');
      const zip=makeZip([{name:'placer_photos.jsx',data:jsx},{name:'assignations.csv',data:buildCsv(b)},{name:'LISEZMOI.txt',data:'﻿'+readme}]);
      offerFile(`${b.title} - InDesign.zip`,zip,jsx,'placer_photos.jsx');break}
    case 'lb-prev':openLightbox(lightbox.i-1);break;
    case 'lb-next':openLightbox(lightbox.i+1);break;
    case 'lb-add':{const i=lightbox.i;assignPhotos(b,view.active,[t.dataset.path]);save(b);toast('Ajoutée à '+spreadLabel(b,view.active));openLightbox(i+1);break}
    case 'overlay-bg':if(ev.target===t)closeOverlay();break;
    case 'close-overlay':closeOverlay();break;
    case 'copy-fallback':{const ta=document.getElementById('fallback-text');try{await navigator.clipboard.writeText(ta.value);toast('Copié')}catch(e){ta.select();toast('Texte sélectionné : copiez-le avec Ctrl/Cmd + C')}break}
  }
});
document.addEventListener('dblclick',e=>{const t=e.target.closest('.tile');if(!t)return;const {arr}=visibleItems();openLightbox(arr.findIndex(x=>x.path===t.dataset.path))});
function commitPageEdit(){
  const ta=document.getElementById('pe-text');const b=cur();if(!ta||!b)return;const p=+ta.dataset.page;const v=ta.value.replace(/\s+$/,'');
  const id=b.pages[p];
  if(id){const e=b.events.find(x=>x.id===id);if(e&&v&&v!==e.name){e.name=v;save(b,true)}}
  else if(v){const e={id:uid('e'),name:v,photos:0,hue:nextHue(b)};b.events.push(e);b.pages[p]=e.id;save(b,true)}
}
document.addEventListener('keydown',e=>{const t=e.target;if(t.id!=='pe-text')return;
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();commitPageEdit();view.edit=null;render()}
  else if(e.key==='Escape'){e.stopPropagation();view.edit=null;render()}});
document.addEventListener('focusout',e=>{if(e.target.id!=='pe-text')return;const p=view.edit;commitPageEdit();
  setTimeout(()=>{if(view.edit===p&&!document.activeElement?.closest?.('.pg.editing')){view.edit=null;render()}},180)});
let pickFor=null;
document.getElementById('filepick').addEventListener('change',e=>{const f=e.target.files[0];if(f&&pickFor)setHalf(pickFor.book,pickFor.lay,pickFor.side,f)});
document.getElementById('laydir').addEventListener('change',e=>{if(e.target.files.length)loadTray(e.target.files)});
document.getElementById('photodir').addEventListener('change',async e=>{const files=e.target.files;if(!files.length)return;const pf=view.pendingFolder||{book:view.id,mode:'add'};view.pendingFolder=null;
  const b=books.get(pf.book);if(!b)return;const first=(files[0].webkitRelativePath||files[0].name).split('/');const name=first.length>1?first[0]:'Photos';
  const id=registerFolder(b,name,pf.mode,pf.fid);ensureLibFor(b);await loadFolderFiles(b,id,files)});
document.getElementById('impfile').addEventListener('change',e=>{if(e.target.files[0])importFile(e.target.files[0])});
document.addEventListener('change',e=>{const t=e.target;
  if(t.id==='imp-sheet'){imp.sheet=+t.value;imp.result=imp.grids[imp.sheet];imp.error=imp.result?'':"Pas de chemin de fer reconnu sur cette feuille.";renderImpPreview()}
  else if(t.name==='imp-mode'){imp.mode=t.value;renderImpPreview()}
  else if(t.id==='imp-extend'){imp.extend=t.checked}});
document.addEventListener('input',e=>{const t=e.target;
  if(t.id==='mv-page'){mv.page=t.value;mv.mode='page';const r=document.querySelector('input[name="mv-mode"][value="page"]');if(r)r.checked=true;renderMovePreview()}
  else if(t.id==='mv-planche'){mv.planche=t.value;mv.mode='planche';const r=document.querySelector('input[name="mv-mode"][value="planche"]');if(r)r.checked=true;renderMovePreview()}
  else if(t.name==='mv-mode'){mv.mode=t.value;renderMovePreview()}});
let impT=null;document.addEventListener('input',e=>{if(e.target.id==='imp-paste'){clearTimeout(impT);const v=e.target.value;impT=setTimeout(()=>{imp.src='';importText(v)},250)}});
document.addEventListener('keydown',e=>{
  const mod=e.metaKey||e.ctrlKey;const k=(e.key||'').toLowerCase();
  if(mod&&(k==='z'||k==='y')){const a=document.activeElement;if(a&&(/TEXTAREA/.test(a.tagName)||(a.tagName==='INPUT'&&!/checkbox|radio|range/.test(a.type))))return;
    e.preventDefault();if(k==='y'||(k==='z'&&e.shiftKey))histRedo();else histUndo();renderHistSlot();return}
  if(lightbox&&e.key==='ArrowRight'){openLightbox(lightbox.i+1);return}
  if(lightbox&&e.key==='ArrowLeft'){openLightbox(lightbox.i-1);return}
  if(e.key==='Escape'){if(document.getElementById('overlay').innerHTML){closeOverlay();return}if(view.sel.size){view.sel.clear();render()}else if(lib.sel.size){lib.sel.clear();render()}}
  if((e.key==='Enter'||e.key===' ')&&e.target.classList&&e.target.classList.contains('half')){e.preventDefault();e.target.click()}
});
let hoverHalf=null;
document.addEventListener('pointerover',e=>{const h=e.target.closest&&e.target.closest('.lay .half');hoverHalf=h?{lay:h.dataset.lay,side:h.dataset.side}:null});
document.addEventListener('paste',e=>{
  const a=document.activeElement;const tgt=(a&&a.classList&&a.classList.contains('half')&&a.dataset.lay)?{lay:a.dataset.lay,side:a.dataset.side}:hoverHalf;
  if(!tgt||view.route!=='livre'||view.tab!=='layouts')return;
  const item=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));if(!item)return;
  e.preventDefault();setHalf(view.id,tgt.lay,tgt.side,item.getAsFile(),'collage');
});

/* ---------- drag and drop ---------- */
const ACCEPT={spread:['layout','spreadlay'],psr:['photos','assigned'],half:['trayimg','files'],newlay:['trayimg'],pgmove:['evmove'],plmove:['evmove'],evmerge:['evmove'],trash:['evmove','assigned'],pool:['evmove'],evrow:['evmove']};
document.addEventListener('dragstart',e=>{
  const s=e.target.closest&&e.target.closest('[data-drag]');if(!s)return;const k=s.dataset.drag;
  if(k==='layout')drag={k,id:s.dataset.lay};
  else if(k==='spreadlay')drag={k,key:+s.dataset.key};
  else if(k==='evmove')drag={k,ev:s.dataset.ev};
  else if(k==='assigned')drag={k,key:s.dataset.key,idx:+s.dataset.idx};
  else if(k==='trayimg')drag={k,item:tray.items.find(x=>x.id===s.dataset.tid)};
  if(k==='photo'){const p=s.dataset.path;let paths=[p];if(lib.sel.has(p)){const {arr}=visibleItems();paths=arr.filter(x=>lib.sel.has(x.path)).map(x=>x.path)}drag={k:'photos',paths}}
  try{e.dataTransfer.setData('text/plain',k);e.dataTransfer.effectAllowed='copyMove'}catch(_){}
  if(drag&&(drag.k==='evmove'||drag.k==='assigned'))document.body.classList.add('dragging-del');
  if(drag&&(drag.k==='photos'||drag.k==='assigned'))document.body.classList.add('dragging-ph');
});
function dropTarget(e){const kind=drag?drag.k:(e.dataTransfer&&[...e.dataTransfer.types].includes('Files')?'files':null);if(!kind)return null;
  let z=e.target.closest&&e.target.closest('[data-drop]');while(z){if(ACCEPT[z.dataset.drop].includes(kind))return z;z=z.parentElement&&z.parentElement.closest('[data-drop]')}return null}
document.addEventListener('dragover',e=>{const z=dropTarget(e);document.querySelectorAll('.psr.over-l,.psr.over-r').forEach(x=>{if(x!==z)x.classList.remove('over-l','over-r')});if(!z)return;e.preventDefault();
  if(z.classList.contains('evrow')){const r=z.getBoundingClientRect();const before=e.clientY<r.top+r.height*0.35;z.classList.toggle('ins-before',before);z.classList.toggle('merge',!before)}
  document.querySelectorAll('.evrow.ins-before,.evrow.merge').forEach(x=>{if(x!==z)x.classList.remove('ins-before','merge')});
  if(z.classList.contains('psr')){const r=z.getBoundingClientRect();const sd=(+z.dataset.key===0||e.clientX>r.left+r.width/2)?'r':'l';z.classList.toggle('over-l',sd==='l');z.classList.toggle('over-r',sd==='r')}document.querySelectorAll('[data-drop].over').forEach(x=>x!==z&&x.classList.remove('over'));z.classList.add('over')});
document.addEventListener('dragleave',e=>{const z=e.target.closest&&e.target.closest('[data-drop]');if(z&&!z.contains(e.relatedTarget))z.classList.remove('over')});
document.addEventListener('dragend',()=>{drag=null;document.querySelectorAll('.evrow.ins-before,.evrow.merge').forEach(x=>x.classList.remove('ins-before','merge'));document.querySelectorAll('.psr.over-l,.psr.over-r').forEach(x=>x.classList.remove('over-l','over-r'));document.body.classList.remove('dragging-del','dragging-ph');document.querySelectorAll('[data-drop].over').forEach(x=>x.classList.remove('over'));if(needsRender){needsRender=false;render()}});
document.addEventListener('drop',async e=>{
  const z=dropTarget(e);if(!z){document.body.classList.remove('dragging-del');if(e.target.closest&&e.target.closest('main'))e.preventDefault();return}
  e.preventDefault();z.classList.remove('over');document.body.classList.remove('dragging-del','dragging-ph');const b=cur();const d=drag;drag=null;if(!b)return;
  const type=z.dataset.drop;
  if(type==='spread'){const key=+z.dataset.key;const u=usage(b);
    if(d.k==='layout'){const n=(u[d.id]||[]).filter(k=>k!==key).length;if(n>=b.maxReuse){toast(`Limite atteinte : cette mise en page est déjà utilisée ${n} fois.`);return}b.spreads[key]=d.id;save(b)}
    else if(d.k==='spreadlay'&&d.key!==key){if(b.pins[key]||b.pins[d.key]){toast('Une des deux doubles pages est verrouillée.');return}const a=b.spreads[d.key],c=b.spreads[key];if(c)b.spreads[d.key]=c;else delete b.spreads[d.key];b.spreads[key]=a;save(b);toast('Mises en page échangées')}
  }
  else if(type==='psr'){const key=z.dataset.key;let side=z.dataset.side;if(!side){const r=z.getBoundingClientRect();side=(+key===0||e.clientX>r.left+r.width/2)?'r':'l'}z.classList.remove('over-l','over-r');const over=e.target.closest('.athumb');
    const beforePath=over&&over.dataset.key===key?((b.assign[key]||[])[+over.dataset.idx]||{}).p:null;
    if(d.k==='photos'){assignPhotos(b,key,d.paths,beforePath,side);lib.sel.clear();view.active=+key;view.activeSide=side;save(b)}
    else if(d.k==='assigned'){const src=b.assign[d.key];const item=src&&src[d.idx];if(!item)return;if(beforePath===item.p)return;
      src.splice(d.idx,1);if(!src.length)delete b.assign[d.key];placeItems(b,key,[{p:item.p,d:item.d}],side,beforePath);save(b)}
  }
  else if(type==='half'){const file=d&&d.k==='trayimg'?d.item.file:e.dataTransfer.files[0];setHalf(b.id,z.dataset.lay,z.dataset.side,file,d&&d.item?d.item.name:undefined)}
  else if(type==='pgmove'){const T=+z.dataset.page;const there=b.pages[T];if(there===d.ev)return;if(there)mergeEvents(b,d.ev,there);else moveNow(b,d.ev,'page',T)}
  else if(type==='trash'){document.body.classList.remove('dragging-del');
    if(d.k==='evmove'){remember(b);for(const k in b.pages)if(b.pages[k]===d.ev)delete b.pages[k];save(b);toastUndo("Événement désassigné : il reste dans l'onglet Événements")}
    else if(d.k==='assigned'){const a=b.assign[d.key];if(a){a.splice(d.idx,1);if(!a.length)delete b.assign[d.key];save(b)}}}
  else if(type==='evmerge'){if(z.dataset.ev!==d.ev)mergeEvents(b,d.ev,z.dataset.ev)}
  else if(type==='plmove'){moveNow(b,d.ev,'planche',+z.dataset.pl)}
  else if(type==='evrow'){const tid=z.dataset.ev;const r=z.getBoundingClientRect();const before=e.clientY<r.top+r.height*0.35;z.classList.remove('ins-before','merge');if(tid===d.ev)return;
    if(before){const tp=Object.keys(b.pages).map(Number).filter(p=>b.pages[p]===tid).sort((x,y)=>x-y)[0];if(tp==null){toast("Cet événement n'a pas de page : glissez plutôt sur une ligne placée.");return}moveNow(b,d.ev,'page',tp)}
    else mergeEvents(b,d.ev,tid)}
  else if(type==='pool'){if(Object.values(b.pages).includes(d.ev)){remember(b);for(const k in b.pages)if(b.pages[k]===d.ev)delete b.pages[k];save(b);toastUndo('Événement retiré de ses pages')}}
  else if(type==='newlay'&&d&&d.k==='trayimg'){const l={id:uid('m'),name:d.item.name.replace(/\.[^.]+$/,'').replace(SIDE_RE,''),family:'',photos:0,capture:'',locked:false};b.layouts.push(l);save(b);setHalf(b.id,l.id,'left',d.item.file,d.item.name)}
});

/* ---------- inputs ---------- */
document.addEventListener('input',e=>{const t=e.target;if(t.id==='lib-size'){lib.size=+t.value;t.closest('.pane').style.setProperty('--tile',lib.size+'px')}});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='sel-ev-id'){const isNew=t.value==='__new';document.getElementById('sel-ev-name').hidden=!isNew;document.getElementById('sel-ev-ph').hidden=!isNew;if(isNew)document.getElementById('sel-ev-name').focus();return}
  const act=t.dataset&&t.dataset.act;if(!act)return;const b=cur();const v=t.value;
  switch(act){
    case 'note':{const bk=books.get(t.dataset.book);bk.note=v;save(bk);break}
    case 'title':if(v.trim()){b.title=v.trim();save(b)}break;
    case 'pages':{const n=parseInt(v)||0;if(n<4||n%4){toast(`Le nombre de pages doit être un multiple de 4 (par exemple ${Math.max(4,Math.round(n/4)*4)}).`);render();return}b.pageCount=Math.min(2000,n);view.sel.clear();save(b);break}
    case 'year':b.year=parseInt(v)||b.year;save(b);break;
    case 'maxreuse':b.maxReuse=Math.max(1,parseInt(v)||5);save(b);break;
    case 'spread-lay':if(v)b.spreads[t.dataset.key]=v;else delete b.spreads[t.dataset.key];save(b);break;
    case 'highlight':view.highlight=v;render();break;
    case 'ev-name':{const x=b.events.find(e=>e.id===t.dataset.ev);if(v.trim()&&x){x.name=v.replace(/\s+$/,'');save(b,t.classList.contains('evname'))}break}
    case 'ev-photos':{const x=b.events.find(e=>e.id===t.dataset.ev);x.photos=Math.max(0,parseInt(v)||0);save(b);break}
    case 'lay-name':{const x=b.layouts.find(l=>l.id===t.dataset.lay);if(v.trim()){x.name=v.trim();save(b)}break}
    case 'lay-fam':{const x=b.layouts.find(l=>l.id===t.dataset.lay);x.family=v;save(b);break}
    case 'lay-photos':{const x=b.layouts.find(l=>l.id===t.dataset.lay);x.photos=Math.max(0,parseInt(v)||0);save(b);break}
    case 'use-types':b.useTypes=t.checked;save(b);break;
    case 'sim':view.sim={pages:document.getElementById('sim-pages').value,max:document.getElementById('sim-max').value};render();break;
    case 'tray-hide':tray.hideUsed=t.checked;render();break;
    case 'lib-sub':lib.sub=t.checked;render();break;
    case 'lib-sort':lib.sort=v;render();break;
    case 'lib-hide':lib.hideUsed=t.checked;render();break;
    case 'lib-size':render();break;
    case 'ps-ev':view.psEvent=v;render();break;
    case 'spread-name':{const k=t.dataset.key;if(v.trim())b.spreadNames[k]=v.trim();else delete b.spreadNames[k];save(b);break}
    case 'jal-name':{const j=b.jalons.find(x=>x.id===t.dataset.j);if(j&&v.trim()){j.name=v.trim();save(b)}break}
  }
});
document.addEventListener('submit',e=>{
  e.preventDefault();const f=e.target;const b=cur();
  if(f.id==='ver-form'){const bk=books.get(view.id);if(!bk)return;const name=document.getElementById('ver-name').value.trim()||'Version manuelle';addVersion(bk.id,strip(bk),name,false);toast('Version enregistrée');return}
  if(f.id==='newbook'){const title=document.getElementById('nb-title').value.trim();const pages=parseInt(document.getElementById('nb-pages').value)||0;const year=document.getElementById('nb-year').value;
    view.newDraft={title,pages:document.getElementById('nb-pages').value,year};
    if(!title){view.newErr='Donnez un titre au livre.';render();return}
    if(pages<4||pages%4){const lo=Math.max(4,Math.floor(pages/4)*4),hi=Math.max(4,Math.ceil(pages/4)*4);view.newErr=`Le nombre de pages doit être un multiple de 4 : essayez ${lo===hi?lo:lo+' ou '+hi}.`;render();return}
    const id=uid('b');const nb=normBook({id,title,year:+year,pageCount:pages,order:books.size,useTypes:false});
    view.showNew=false;view.newErr='';view.newDraft=null;save(nb);location.hash='#livre-'+id;
    setTimeout(()=>showModal(`<h3>Dossier des photos de « ${esc(title)} »</h3><p class="muted small" style="margin:0">Choisissez le dossier où se trouvent les photos de ce livre (et le fichier InDesign). Vous pourrez en ajouter d'autres, le changer ou le retirer plus tard dans Définition des photos.</p><div class="row"><button class="btn primary" data-act="folder-add">${I_FOLDER} Choisir le dossier</button><button class="btn ghost" data-act="folder-later">Plus tard</button></div>`),60);return}
  if(f.id==='add-ev'){const name=document.getElementById('ae-name').value.trim();if(!name)return;b.events.push({id:uid('e'),name,photos:parseInt((document.getElementById('ae-ph')||{}).value)||0,hue:nextHue(b)});save(b);setTimeout(()=>document.getElementById('ae-name')?.focus(),0);return}
  if(f.id==='sel-new'){const name=document.getElementById('sel-new-name').value.trim();if(!name){toast("Écrivez le texte de l'événement.");return}
    const e={id:uid('e'),name,photos:0,hue:nextHue(b)};b.events.push(e);for(const p of view.sel)b.pages[p]=e.id;dropOrphans(b);const n=view.sel.size;view.sel.clear();save(b);toast(`Événement créé sur ${n} page${n>1?'s':''}`);return}
  if(f.id==='sel-ev'){let id=document.getElementById('sel-ev-id').value;
    if(id==='__new'){const name=document.getElementById('sel-ev-name').value.trim();if(!name){toast("Donnez un nom à l'événement.");return}id=uid('e');b.events.push({id,name,photos:parseInt(document.getElementById('sel-ev-ph').value)||0,hue:nextHue(b)})}
    for(const p of view.sel){if(id)b.pages[p]=id;else delete b.pages[p]}
    const n=view.sel.size;view.sel.clear();save(b);toast(id?`Événement associé à ${n} page${n>1?'s':''}`:'Pages libérées');return}
  if(f.id==='sel-lay'){const id=document.getElementById('sel-lay-id').value;const keys=[...new Set([...view.sel].map(spreadKeyOf))];
    const u=usage(b);const already=(u[id]||[]).filter(k=>!keys.includes(k)).length;
    if(id&&already+keys.length>b.maxReuse){toast(`Impossible : cette mise en page serait utilisée ${already+keys.length} fois (max ${b.maxReuse}).`);return}
    keys.forEach(k=>{if(id)b.spreads[k]=id;else delete b.spreads[k]});view.sel.clear();save(b);toast(`${keys.length} double${keys.length>1?'s':''} page${keys.length>1?'s':''} mise${keys.length>1?'s':''} à jour`);return}
});

window.__atelier={idb:IDB,planMove,extendEvent,makeZip,buildJsx,buildCsv,readExif,loadFolderFiles,loadTray,lib,tray,books};
document.getElementById('restorepick').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;
  try{const d=JSON.parse(await f.text());if(!Array.isArray(d.books))throw 0;
    for(const bk of d.books){const nb=normBook(bk);const old=books.get(nb.id);if(old)record(old,strip(nb));else record(nb,strip(nb));books.set(nb.id,nb);baseline(nb);
      if(mode==='db'){const {id:_,...data}=nb;await db.doc('books/'+nb.id).set(clone(data))}}
    for(const [k,v] of Object.entries(d.captures||{}))await putCapture(k,v);
    if(mode!=='db')await saveLocal();render();toast(d.books.length+' livres restaurés')}
  catch(err){toast("Ce fichier n'est pas une sauvegarde de l'Atelier.")}});
loadUI();readHash();if(view._active!=null)view.active=view._active;boot();
})();
