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
const I_GEAR='<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.9 1.5h2.2l.4 1.8 1.2.6 1.6-1 1.5 1.5-1 1.6.5 1.2 1.9.4v2.2l-1.9.4-.5 1.2 1 1.6-1.5 1.5-1.6-1-1.2.5-.4 1.9H6.9l-.4-1.9-1.2-.5-1.6 1-1.5-1.5 1-1.6-.5-1.2-1.8-.4V6.9l1.8-.4.5-1.2-1-1.6 1.5-1.5 1.6 1 1.2-.6z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
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
  b.pl=b.pl||[];b.pageLay=b.pageLay||{};b.texts=b.texts||{};
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
// Page-keyed data (layout of each page, texts written for it) follows the pages when they move
function remapPages(b,fn){
  const o={};for(const [k,v] of Object.entries(b.pageLay||{}))o[fn(+k)]=v;b.pageLay=o;
  const t={};for(const [k,v] of Object.entries(b.texts||{})){const i=k.indexOf('|');t[fn(+k.slice(0,i))+k.slice(i)]=v}b.texts=t;
}
function takePages(b,pages){const out={lay:{},tx:{}};b.pageLay=b.pageLay||{};b.texts=b.texts||{};
  pages.forEach((p,i)=>{if(b.pageLay[p]){out.lay[i]=b.pageLay[p];delete b.pageLay[p]}});
  for(const k of Object.keys(b.texts)){const j=k.indexOf('|');const i=pages.indexOf(+k.slice(0,j));if(i>=0){out.tx[i+k.slice(j)]=b.texts[k];delete b.texts[k]}}return out}
function putPages(b,taken,dest){for(const [i,v] of Object.entries(taken.lay))if(dest[+i]!=null)b.pageLay[dest[+i]]=v;
  for(const [k,v] of Object.entries(taken.tx)){const j=k.indexOf('|');const i=+k.slice(0,j);if(dest[i]!=null)b.texts[dest[i]+k.slice(j)]=v}}
function planMove(b0,evId,T,Lp){
  const b=clone(b0);b.spreadNames=b.spreadNames||{};
  const own=Object.keys(b.pages).map(Number).filter(p=>b.pages[p]===evId).sort((a,z)=>a-z);
  const contiguous=own.every((p,i)=>i===0||p===own[i-1]+1);
  // planches fully owned by the event travel with it (layout, photos, name, lock) when the target is a left page
  const owned=spreadsOf(b.pageCount).filter(s=>{const pg=spreadPages(b,s.key);return pg.length===2&&pg.every(p=>b.pages[p]===evId)}).map(s=>s.key);
  const carry=(T%2===0&&contiguous&&own.length===Lp&&owned.length)?owned.map(k=>{const o={};SPREAD_MAPS.forEach(m=>{if(b[m]&&b[m][k]!==undefined){o[m]=b[m][k];delete b[m][k]}});return o}):[];
  own.forEach(p=>delete b.pages[p]);const tk=takePages(b,own);
  const busy=p=>!!b.pages[p];const S=2*Math.ceil(Lp/2);let G=null;
  const maxUsed=Math.max(0,...Object.keys(b.pages).map(Number));
  if([...Array(Lp).keys()].some(i=>busy(T+i))){
    // find the first gap of S free pages after T (same parity): the shift stops there instead of pushing the whole book
    for(let g=T+1;;g++){if((g-T)%2)continue;if(g>maxUsed+1){G=g;break}let free=true;for(let i=0;i<S;i++)if(busy(g+i)){free=false;break}if(free){G=g;break}}
    const np={};for(const [p,e] of Object.entries(b.pages)){const n=+p;np[n>=T&&n<G?n+S:n]=e}b.pages=np;
    for(const m of SPREAD_MAPS){if(!b[m])continue;const nm={};for(const [k,v] of Object.entries(b[m])){const n=+k;nm[n>0&&n>=T&&n<G?n+S:n]=v}b[m]=nm}
    remapPages(b,n=>n>=T&&n<G?n+S:n);
  }
  for(let i=0;i<Lp;i++)b.pages[T+i]=evId;
  putPages(b,tk,own.map((_,i)=>T+i));
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
  const lay=layById(b);const out={};const PL=usesPL(b),plm=plById(b);
  for(const s of spreadsOf(b.pageCount)){
    const pages=[s.l,s.r].filter(Boolean);const l=lay[b.spreads[s.key]];const placed=(b.assign[s.key]||[]).length;
    for(const p of pages){const e=b.pages[p];if(!e)continue;const o=out[e]=out[e]||{slots:0,known:true,spreads:new Set(),layouts:new Set(),placed:0};
      if(!o.spreads.has(s.key))o.placed+=placed;o.spreads.add(s.key);
      if(PL){const pl=plm[b.pageLay[p]];if(pl){o.layouts.add(pl.id);o.slots+=plPhotos(pl)}else o.known=false}
      else if(l){o.layouts.add(l.id);if(l.photos>0)o.slots+=l.photos/pages.length;else o.known=false}else o.known=false}
  }
  for(const k in out)out[k].slots=Math.round(out[k].slots);return out;
}
function metrics(b){
  const sp=spreadsOf(b.pageCount), ev=evById(b), PL=usesPL(b), u=PL?plUsage(b):usage(b), max=b.maxReuse;
  let filled=0;for(let p=1;p<=b.pageCount;p++)if(ev[b.pages[p]])filled++;
  const plm=PL?plById(b):null;let withLay=0;if(PL){for(let p=1;p<=b.pageCount;p++)if(plm[b.pageLay[p]])withLay++}else withLay=sp.filter(s=>b.layouts.some(l=>l.id===b.spreads[s.key])).length;
  const over=(PL?b.pl:b.layouts).filter(l=>(u[l.id]||[]).length>max);
  const needed=PL?(b.pageCount?Math.ceil(b.pageCount/max):0):(sp.length?Math.ceil(sp.length/max):0);
  const nLay=PL?b.pl.filter(l=>!l.gone).length:b.layouts.length;
  const cap=capacity(b);const short=b.events.filter(e=>e.photos>0&&cap[e.id]&&cap[e.id].known&&cap[e.id].slots<e.photos);
  const valid=new Set(sp.map(s=>String(s.key)));
  const placed=Object.entries(b.assign).filter(([k])=>valid.has(k)).reduce((a,[,v])=>a+v.length,0);
  let texts=0;for(const k in b.texts)if(hasText(b.texts[k]))texts++;
  return {sp,filled,withLay,over,needed,short,u,cap,placed,PL,nLay,texts};
}
function progress(b){return STAGES.reduce((a,[k])=>a+ST[b.stages[k]||'todo'].w,0)/STAGES.length}
function usedPaths(b){const m=new Map();if(!b)return m;for(const [k,arr] of Object.entries(b.assign))for(const a of arr){if(!m.has(a.p))m.set(a.p,[]);m.get(a.p).push(+k)}return m}

/* ================= storage ================= */
function setSaved(t){document.getElementById('saved').textContent=t;const m=document.getElementById('menu-saved');if(m)m.textContent=t||'En ligne'}
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
      ping(id?{book:id}:{all:1});setSaved('Enregistré dans ce navigateur · '+stamp());cloudQueue(id,removed);return}
    catch(e){toast("Impossible d'enregistrer dans le navigateur : "+(e&&e.name==='QuotaExceededError'?'espace plein.':'stockage bloqué.'));setSaved('Non enregistré');return}}
  try{localStorage.setItem(LS_KEY,JSON.stringify({books:[...books.values()],captures}));ping(id?{book:id}:{all:1});setSaved('Enregistré dans ce navigateur · '+stamp())}catch(e){toast("Impossible d'enregistrer : stockage du navigateur plein ou bloqué. Faites une sauvegarde (.json).")}}
/* ---- online storage (Supabase): every change is sent right away; a local copy stays in the browser for offline work ---- */
const CLOUD={cfg:window.CDF_CONFIG||{},sb:null,user:null,pending:new Map(),timers:new Map(),started:false,channel:null,busy:false};
const cloudConfigured=()=>!!(CLOUD.cfg.supabaseUrl&&CLOUD.cfg.supabaseKey&&window.supabase&&window.supabase.createClient);
const cloudOn=()=>!!(CLOUD.sb&&CLOUD.user);
function loadPending(){try{const o=JSON.parse(localStorage.getItem('cdf-pending')||'{}');CLOUD.pending=new Map(Object.entries(o))}catch(e){}}
function savePending(){try{localStorage.setItem('cdf-pending',JSON.stringify(Object.fromEntries(CLOUD.pending)))}catch(e){}}
function cloudStatus(){if(!cloudOn())return;const n=CLOUD.pending.size;setSaved(n?(navigator.onLine?`Envoi en ligne… (${n})`:`Hors ligne · ${n} modification${n>1?'s':''} en attente`):'En ligne · enregistré '+stamp())}
function cloudQueue(id,removed){ // id null = every book
  if(!CLOUD.sb)return;const ids=id?[id]:[...books.keys()];
  for(const i of ids){CLOUD.pending.set(i,removed?'del':'put');clearTimeout(CLOUD.timers.get(i));CLOUD.timers.set(i,setTimeout(()=>cloudFlush(i),600))}
  savePending();cloudStatus();
}
async function cloudFlush(id){
  if(!cloudOn()||!navigator.onLine){cloudStatus();return}
  const op=CLOUD.pending.get(id);if(!op)return;
  try{
    if(op==='del'||!books.get(id)){const {error}=await CLOUD.sb.from('books').delete().eq('id',id).eq('user_id',CLOUD.user.id);if(error)throw error
      for(const tb of ['project_docs','project_todos'])try{await CLOUD.sb.from(tb).delete().eq('owner',CLOUD.user.id).eq('book_id',id)}catch(e){}}
    else{const b=books.get(id);const {id:_,_owner,...data}=b;const now=new Date().toISOString();
      if(_owner&&_owner!==CLOUD.user.id){const {error}=await CLOUD.sb.from('books').update({data:clone(data),updated_at:now}).eq('user_id',_owner).eq('id',id);if(error)throw error}
      else{const {error}=await CLOUD.sb.from('books').upsert({id,data:clone(data),updated_at:now});if(error)throw error}}
    if(CLOUD.pending.get(id)===op){CLOUD.pending.delete(id);savePending()}
  }catch(e){clearTimeout(CLOUD.timers.get(id));CLOUD.timers.set(id,setTimeout(()=>cloudFlush(id),15000))}
  cloudStatus();
}
function cloudFlushAll(){for(const id of CLOUD.pending.keys())cloudFlush(id)}
window.addEventListener('online',()=>{cloudFlushAll();cloudStatus()});window.addEventListener('offline',cloudStatus);
async function cloudPutCapture(key,data){if(!cloudOn())return;try{await CLOUD.sb.from('layout_images').upsert({key,data})}catch(e){}}
async function cloudPutVersion(v){if(!cloudOn())return;try{await CLOUD.sb.from('book_versions').upsert({key:v.key,book_id:v.id,t:v.t,label:v.label||'',auto:!!v.auto,data:v.data})}catch(e){}}
async function cloudDelVersion(key){if(!cloudOn())return;try{await CLOUD.sb.from('book_versions').delete().eq('key',key)}catch(e){}}
async function selectAll(table,cols){const out=[];for(let from=0;;from+=500){const {data,error}=await CLOUD.sb.from(table).select(cols).range(from,from+499);if(error)throw error;out.push(...data);if(data.length<500)break}return out}
function takeRemoteBook(id,data,owner){const nb=normBook({...clone(data),id});if(owner&&CLOUD.user&&owner!==CLOUD.user.id)nb._owner=owner;else delete nb._owner;books.set(id,nb);baseline(nb);if(IDB.ok)idbPut('book:'+id,clone(nb)).catch(()=>{})}
async function cloudStart(){
  if(!cloudOn()||CLOUD.busy)return;CLOUD.busy=true;setSaved('Synchronisation…');
  try{
    let last='';try{last=localStorage.getItem('mb-owner')||''}catch(e){}
    if(last&&last!==CLOUD.user.id){const ids=[...books.keys()];books.clear();versions=[];CLOUD.pending.clear();try{savePending()}catch(e){}if(IDB.ok)ids.forEach(id=>idbDel('book:'+id).catch(()=>{}))}
    try{localStorage.setItem('mb-owner',CLOUD.user.id)}catch(e){}
    loadPending();
    let rows;try{rows=await selectAll('books','id,data,updated_at,user_id')}catch(e){rows=await selectAll('books','id,data,updated_at')}
    const remote=new Map();for(const r of rows){const mine=!r.user_id||r.user_id===CLOUD.user.id;if(!remote.has(r.id)||mine)remote.set(r.id,r)}
    if(!rows.length&&books.size){for(const id of books.keys())CLOUD.pending.set(id,'put');toast(`Vos ${books.size} livres sont envoyés dans votre espace en ligne`)}
    for(const [id,r] of remote){if(CLOUD.pending.has(id))continue;takeRemoteBook(id,r.data,r.user_id)}
    if(rows.length)for(const id of [...books.keys()])if(!remote.has(id)&&!CLOUD.pending.has(id))CLOUD.pending.set(id,'put'); // books only on this computer: send them
    savePending();
    const vrows=await selectAll('book_versions','key,book_id,t,label,auto,data');
    const known=new Set(vrows.map(v=>v.key));for(const v of versions)if(!known.has(v.key))cloudPutVersion(v);
    versions=[...vrows.map(v=>({key:v.key,id:v.book_id,t:+v.t,label:v.label,auto:v.auto,data:v.data})),...versions.filter(v=>!known.has(v.key))];
    const irows=await selectAll('layout_images','key,data');const ik=new Set(irows.map(r=>r.key));
    for(const [k,v] of Object.entries(captures))if(!ik.has(k))cloudPutCapture(k,v);
    irows.forEach(r=>{captures[r.key]=r.data;if(IDB.ok)idbPut('cap:'+r.key,r.data).catch(()=>{})});
    if(!CLOUD.channel){
      CLOUD.channel=CLOUD.sb.channel('cdf-'+CLOUD.user.id)
        .on('postgres_changes',{event:'*',schema:'public',table:'books'},pl=>{
          const id=(pl.new&&pl.new.id)||(pl.old&&pl.old.id);if(!id||CLOUD.pending.has(id))return;
          if(pl.eventType==='DELETE'){if(pl.old&&pl.old.user_id&&pl.old.user_id!==CLOUD.user.id&&books.get(id)&&!books.get(id)._owner)return;books.delete(id);if(IDB.ok)idbDel('book:'+id).catch(()=>{})}
          else{const ow=pl.new.user_id;const ex=books.get(id);if(ex&&ow&&ow!==CLOUD.user.id&&!ex._owner)return; // same id as one of my own books
            const cur_=books.get(id);if(cur_&&same(strip({...cur_,_owner:undefined}),strip({...pl.new.data,id,_owner:undefined})))return;takeRemoteBook(id,pl.new.data,ow);if(inCreation(books.get(id)))applyCreation(books.get(id));setSaved('Mis à jour depuis un autre appareil · '+stamp())}
          softRender()})
        .on('postgres_changes',{event:'*',schema:'public',table:'blocks'},crOnBlock)
        .on('postgres_changes',{event:'*',schema:'public',table:'book_presence'},crOnPresence)
        .on('postgres_changes',{event:'*',schema:'public',table:'project_docs'},pjOnDoc)
        .on('postgres_changes',{event:'*',schema:'public',table:'project_todos'},pjOnTodo)
        .on('postgres_changes',{event:'*',schema:'public',table:'creations'},pl=>{if(pl.new&&pl.new.book_id)crTake(pl.new).then(()=>softRender())})
        .on('postgres_changes',{event:'*',schema:'public',table:'creation_images'},pl=>{const r=pl.new;const b=r&&books.get(r.book_id);if(b&&r.data){const k=crImg(b,r.key);captures[k]=r.data;if(IDB.ok)idbPut('cap:'+k,r.data).catch(()=>{});softRender()}})
        .on('postgres_changes',{event:'*',schema:'public',table:'book_versions',filter:'user_id=eq.'+CLOUD.user.id},pl=>{
          const k=(pl.new&&pl.new.key)||(pl.old&&pl.old.key);versions=versions.filter(v=>v.key!==k);
          if(pl.eventType!=='DELETE'){const v=pl.new;versions.push({key:v.key,id:v.book_id,t:+v.t,label:v.label,auto:v.auto,data:v.data})}renderHistSlot()})
        .on('postgres_changes',{event:'*',schema:'public',table:'layout_images',filter:'user_id=eq.'+CLOUD.user.id},pl=>{if(pl.new&&pl.new.key){captures[pl.new.key]=pl.new.data;softRender()}})
        .subscribe();
    }
    await crLoadAll();await pjLoad();
    loaded=true;cloudFlushAll();cloudStatus();render();
  }catch(e){setSaved('Connexion en ligne impossible · travail local');toast("L'espace en ligne ne répond pas : vous travaillez en local, l'envoi se fera au retour de la connexion.")}
  CLOUD.busy=false;
}
async function cloudInit(){
  if(!cloudConfigured())return;
  CLOUD.sb=window.supabase.createClient(CLOUD.cfg.supabaseUrl,CLOUD.cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'cdf-auth'}});
  try{const {data}=await CLOUD.sb.auth.getSession();CLOUD.user=data.session?data.session.user:null}catch(e){}
  CLOUD.checked=true;
  CLOUD.sb.auth.onAuthStateChange((ev,sess)=>{const u=sess?sess.user:null;const changed=(u&&u.id)!==(CLOUD.user&&CLOUD.user.id);CLOUD.user=u;if(changed){if(u)cloudStart();else{if(CLOUD.channel){CLOUD.sb.removeChannel(CLOUD.channel);CLOUD.channel=null}forgetAccount();setSaved('');render()}}});
  if(CLOUD.user)await cloudStart();else render();
}
function forgetAccount(){
  const ids=[...books.keys()];books.clear();versions=[];CR.byBook.clear();PJ.docs.clear();PJ.todos.clear();CLOUD.pending.clear();try{savePending()}catch(e){}
  if(IDB.ok){ids.forEach(id=>idbDel('book:'+id).catch(()=>{}));}loaded=false;view.files=null;view.accounts=null;location.hash='#avancement';
}
const genPass=()=>{const a='abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';const r=crypto.getRandomValues(new Uint32Array(12));return [...r].map(x=>a[x%a.length]).join('').replace(/(.{4})(?!$)/g,'$1-')};
async function acctCall(body){const {data,error}=await CLOUD.sb.functions.invoke('comptes',{body});
  if(error){let m=error.message||'';try{const j=await error.context.json();if(j&&j.error)m=j.error}catch(e){}if(/not found|404|Failed to send/i.test(m))m="La fonction « comptes » n'est pas encore installée dans Supabase.";throw new Error(m)}
  if(data&&data.error)throw new Error(data.error);return data}
async function openAccounts(){view.menu=false;view.accounts={list:null,err:'',msg:'',draft:{email:'',password:genPass()},armed:null,shown:null};renderAccounts();
  try{view.accounts.list=(await acctCall({action:'list'})).users}catch(e){view.accounts.err=e.message}renderAccounts()}
function renderAccounts(){const v=view.accounts;if(!v)return;const me=myId();
  const row=u=>{const arm=v.armed===u.id;return `<div class="acct ${u.disabled?'off':''}"><div class="acct-n"><b>${esc(u.email)}</b><span class="small muted">créé ${u.created_at?fmtVer(u.created_at):'—'} · dernière connexion ${u.last_sign_in_at?fmtVer(u.last_sign_in_at):'jamais'}${u.disabled?' · <b class="err">désactivé</b>':''}${u.id===me?' · vous':''}</span>
    ${v.shown&&v.shown.id===u.id?`<span class="acct-pw">Nouveau mot de passe : <code>${esc(v.shown.password)}</code> <button class="btn ghost sm" data-act="acct-copy">Copier</button></span>`:''}</div>
    <div class="acct-a">${u.id===me?'':`<button class="btn ghost sm" data-act="acct-pass" data-id="${esc(u.id)}">Nouveau mot de passe</button><button class="btn ghost sm" data-act="${u.disabled?'acct-enable':'acct-disable'}" data-id="${esc(u.id)}">${u.disabled?'Réactiver':'Désactiver'}</button><button class="btn ghost sm danger ${arm?'armed':''}" data-act="acct-del" data-id="${esc(u.id)}" title="Supprime le compte et les livres dont il est propriétaire">${arm?'Confirmer : compte et livres supprimés':'Supprimer'}</button>`}</div></div>`};
  showModal(`<div class="row" style="justify-content:space-between"><h3>Comptes des utilisateurs</h3><button class="btn ghost sm" data-act="close-overlay">Fermer</button></div>
    <p class="small muted" style="margin:0">Personne ne peut créer de compte seul : vous créez chaque compte ici et transmettez l'adresse et le mot de passe à la personne. Elle pourra ensuite le changer (menu › Changer mon mot de passe). Pour qu'elle voie un livre, partagez-le avec son adresse (bouton Partager du livre).</p>
    <form class="acct-new" id="acct-form" novalidate><input class="f" id="ac-email" type="email" placeholder="Adresse e-mail" autocomplete="off" value="${esc(v.draft.email)}">
      <span class="acct-pwin"><input class="f mono" id="ac-pass" type="text" autocomplete="off" value="${esc(v.draft.password)}" aria-label="Mot de passe"><button class="btn ghost sm" type="button" data-act="acct-gen" title="Générer un autre mot de passe">↻</button></span>
      <button class="btn primary" type="submit">Créer le compte</button></form>
    ${v.msg?`<p class="small ok-msg" role="status" style="margin:0">${v.msg}</p>`:''}${v.err?`<p class="err small" role="alert" style="margin:0">${esc(v.err)}</p>`:''}
    <div class="acct-list">${v.list?v.list.map(row).join('')||'<p class="small muted">Aucun compte.</p>':(v.err?'':'<p class="small muted">Chargement…</p>')}</div>`,'wide');
}
async function acctDo(action,id,extra){const v=view.accounts;v.err='';v.msg='';try{const r=await acctCall(Object.assign({action,id},extra||{}));
  if(r&&r.user){const i=v.list.findIndex(x=>x.id===r.user.id);if(i>=0)v.list[i]=r.user;else v.list.push(r.user)}if(action==='delete')v.list=v.list.filter(x=>x.id!==id);return r}catch(e){v.err=e.message;return null}finally{renderAccounts()}}
function openMyPass(){view.menu=false;view.myPass={err:'',ok:false};renderMyPass()}
function renderMyPass(){const v=view.myPass;if(!v)return;
  showModal(`<div class="row" style="justify-content:space-between"><h3>Changer mon mot de passe</h3><button class="btn ghost sm" data-act="close-overlay">Fermer</button></div>
    ${v.ok?`<p class="small" role="status">Mot de passe changé.</p>`:`<form class="grid" id="mypass-form" novalidate style="display:grid;gap:8px"><input class="f" id="mp-1" type="password" autocomplete="new-password" placeholder="Nouveau mot de passe (8 caractères min.)"><input class="f" id="mp-2" type="password" autocomplete="new-password" placeholder="Le même, une seconde fois"><button class="btn primary" type="submit">Enregistrer</button>${v.err?`<p class="err small" role="alert" style="margin:0">${esc(v.err)}</p>`:''}</form>`}`);
  setTimeout(()=>document.getElementById('mp-1')?.focus(),0)}
function renderGate(){
  return `<div class="gate"><form class="panel gatebox" id="cloud-login" novalidate>
    <div class="gate-h"><span class="brand-mark" aria-hidden="true"><i></i><i></i></span><b>moodbook</b><span class="muted">conception livre</span></div>
    <p class="small muted" style="margin:0">Connectez-vous avec le compte que l'administrateur vous a créé.</p>
    <label class="small">Adresse e-mail<input class="f" id="cl-email" type="email" autocomplete="email" value="${esc(view.cloudEmail||'')}"></label>
    <label class="small">Mot de passe<input class="f" id="cl-pass" type="password" autocomplete="current-password"></label>
    <button class="btn primary" type="submit" data-mode="in">Se connecter</button>
    ${view.cloudMsg?`<p class="small ${view.cloudErr?'err':'muted'}" role="alert" style="margin:0">${esc(view.cloudMsg)}</p>`:''}
    <p class="small muted" style="margin:0">Pas de compte, ou mot de passe oublié ? Demandez-le à l'administrateur.</p></form></div>`;
}
function renderCloudBox(){
  if(!cloudConfigured()||CLOUD.user)return '';
  return `<form class="panel cloudbox" id="cloud-login" novalidate>
    <div><b>Votre espace en ligne</b><p class="small muted" style="margin:2px 0 0">Connectez-vous pour enregistrer vos livres en ligne et les retrouver sur tous vos ordinateurs. Les photos restent sur votre ordinateur.</p></div>
    <input class="f" id="cl-email" type="email" autocomplete="email" placeholder="Adresse e-mail" value="${esc(view.cloudEmail||'')}">
    <input class="f" id="cl-pass" type="password" autocomplete="current-password" placeholder="Mot de passe (6 caractères min.)">
    <button class="btn primary" type="submit" data-mode="in">Se connecter</button>
    ${view.cloudMsg?`<p class="small ${view.cloudErr?'err':'muted'}" style="grid-column:1/-1;margin:0">${esc(view.cloudMsg)}</p>`:''}</form>`;
}
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
  if(!same(a.texts,z.texts))return 'Texte rédigé';
  if(!same(a.pageLay,z.pageLay))return 'Mise en page des pages';
  if(!same(a.pl,z.pl))return 'Mises en page modifiées';
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
  cloudPutVersion(v);
}
async function dropVersion(v){versions=versions.filter(x=>x.key!==v.key);try{if(mode==='db')await db.doc('versions/'+v.key).delete();else if(IDB.ok){await idbDel('ver:'+v.key);ping({ver:v.key,del:1})}cloudDelVersion(v.key)}catch(e){}}
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
function save(b,quiet){b.updatedAt=new Date().toISOString();books.set(b.id,b);if(!applyingHist)record(b);if(!quiet)render();crPush(b);
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
  else if(IDB.ok){try{await idbPut('cap:'+key,data);ping({cap:key})}catch(e){toast("Image non enregistrée : l'espace du navigateur est peut-être plein.")}cloudPutCapture(key,data)}
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
  } else {mode='local';if(await idbOpen())await loadIDB();else loadLocal();loaded=true;setSaved(books.size?'Enregistré dans ce navigateur':'');render();cloudInit()}
}
function softRender(){if(drag){needsRender=true;return}const a=document.activeElement;if(a&&a.closest&&a.closest('#app')&&((/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&a.type!=='checkbox'&&a.type!=='range')||a.isContentEditable)){needsRender=true;return}render()}
document.addEventListener('focusout',()=>{if(needsRender&&!drag){needsRender=false;setTimeout(()=>{const a=document.activeElement;if(!(a&&(/INPUT|TEXTAREA|SELECT/.test(a.tagName)||a.isContentEditable)))render();else needsRender=true},0)}});

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
  const PL=usesPL(b),plm=plById(b);
  for(const r of exportRows(b))for(const side of ['l','r']){const list=r.photos.filter(a=>photoSide(r.key,a)===side);const pg=r.key===0?1:(side==='l'?r.key:r.key+1);const lname=PL?((plm[b.pageLay[pg]]||{}).name||''):r.layout;
    list.forEach((a,i)=>lines.push([r.label,pg,side==='l'?'gauche':'droite',r.event,lname,i+1,a.p,baseName(a.p),a.d?new Date(a.d).toLocaleString('fr-FR'):''].map(q).join(';')))}
  return '﻿'+lines.join('\r\n')}
const asciiJson=o=>JSON.stringify(o,null,1).replace(/[\u007f-￿]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
function buildJsx(b){
  const ev=evById(b),plm=plById(b),PL=usesPL(b);const pages=[];
  for(let p=1;p<=b.pageCount;p++){
    const key=spreadKeyOf(p),side=pageSideOf(p);const list=sideEntries(b,key,side);const l=PL?plm[b.pageLay[p]]:null;
    let photos=[],slots=null,nf=0;
    if(l){const F=pageFill(l,list);nf=F.frs.length;slots=[];F.frs.forEach((f,j)=>{const en=F.map.get(f.id);if(en){photos.push(en.a.p);slots.push(j)}});F.extra.forEach(en=>{photos.push(en.a.p);slots.push(-1)})}
    else photos=list.map(x=>x.a.p);
    const sts=PL?pageStories(b,p):[];const texts=[];
    sts.forEach((st,i)=>{const rec=b.texts[st.tkey];if(hasText(rec))texts.push({i,paras:rec.paras.map(pp=>({al:pp.al||'',runs:(pp.runs||[]).filter(r=>r.t).map(r=>({t:r.t,b:r.b?1:0,c:r.c?1:0}))}))})});
    if(!photos.length&&!texts.length)continue;
    const e=ev[b.pages[p]];const nm=(b.spreadNames||{})[key]||'';
    pages.push({page:p,label:`p. ${p}${p%2?' (droite)':' (gauche)'}${nm?' · '+nm:''}`,event:e?e.name:'',photos,slots,nf,texts,ns:sts.length});
  }
  const data={book:b.title,root:b.photoRoot||'',generated:new Date().toLocaleString('fr-FR'),onlyEmpty:true,rowTolerance:3,
    roots:bookFolders(b).slice(1).map(f=>f.name),placeholders:[...new Set(b.pl.flatMap(l=>l.ph||[]))],pages};
  return '\uFEFF'+JSX_TEMPLATE.replace('@@TITLE@@',b.title.replace(/[\r\n]/g,' ')).replace('@@DATE@@',data.generated).replace('@@DATA@@',()=>asciiJson(data));
}
const JSX_TEMPLATE="// moodbook - conception livre : photos et textes dans InDesign\n// Livre : @@TITLE@@ (g\u00e9n\u00e9r\u00e9 le @@DATE@@)\n// Installation : Fen\u00eatre > Utilitaires > Scripts, clic droit sur \u00ab Utilisateur \u00bb > Faire appara\u00eetre dans le Finder / l'Explorateur,\n// copiez ce fichier dans ce dossier, puis double-cliquez sur son nom dans le panneau Scripts (document du livre ouvert).\n// Une palette s'ouvre : choisissez une page, chargez ses photos dans le curseur et cliquez dans les blocs image dans l'ordre voulu,\n// ou utilisez le placement automatique. Les textes r\u00e9dig\u00e9s dans l'application se versent dans les blocs texte sans toucher\n// \u00e0 leur mise en forme. Chaque action s'annule avec \u00c9dition > Annuler.\n#target indesign\n#targetengine \"cheminDeFerPhotos\"\nvar DATA = @@DATA@@;\n(function () {\n  if (app.documents.length === 0) { alert(\"Ouvrez d'abord le document InDesign du livre.\"); return; }\n  var doc = app.activeDocument, base = null, baseChecked = false;\n  try { base = doc.filePath; } catch (e) { base = null; }\n  var PH = DATA.placeholders || [];\n  function has(a, v) { for (var i = 0; i < a.length; i++) if (a[i] === v) return true; return false; }\n  // Finds a photo: first at its path relative to the folder, otherwise by its file name anywhere inside the folder.\n  var indexes = {};\n  function nm(s) { try { s = decodeURI(s); } catch (e) {} return String(s).toLowerCase(); }\n  function walk(folder, depth) {\n    if (depth > 8) return;\n    var items = folder.getFiles();\n    for (var i = 0; i < items.length; i++) {\n      var it = items[i];\n      if (it instanceof Folder) { if (nm(it.name).charAt(0) !== \".\") walk(it, depth + 1); }\n      else { var k = nm(it.name); if (!index[k]) index[k] = it; }\n    }\n  }\n  function fileAt(folder, rel, deep) {\n    if (!folder) return null;\n    var f = new File(folder.fullName + \"/\" + rel); if (f.exists) return f;\n    var parts = rel.split(\"/\");\n    for (var s = 1; s < parts.length; s++) { f = new File(folder.fullName + \"/\" + parts.slice(s).join(\"/\")); if (f.exists) return f; }\n    if (deep === false) return null;\n    if (!indexes[folder.fullName]) { index = {}; walk(folder, 0); indexes[folder.fullName] = index; }\n    return indexes[folder.fullName][nm(parts[parts.length - 1])] || null;\n  }\n  var index = null, extra = {};\n  // Photos of extra folders are stored as \"@folder name/\u2026\": look inside the main folder first, then ask once for that folder\n  function resolve(rel) {\n    if (rel.charAt(0) !== \"@\") return fileAt(base, rel);\n    var cut = rel.indexOf(\"/\"), fname = rel.slice(1, cut), rest = rel.slice(cut + 1);\n    if (extra[fname] === undefined) {\n      var inBase = fileAt(base, fname + \"/\" + rest);\n      if (inBase) return inBase;\n      extra[fname] = Folder.selectDialog(\"S\u00e9lectionnez le dossier photos \u00ab \" + fname + \" \u00bb\") || null;\n    }\n    return extra[fname] ? fileAt(extra[fname], rest) : null;\n  }\n  // Pages to fill, in book order (photos and/or texts)\n  var items = DATA.pages || [];\n  if (!items.length) { alert(\"Rien \u00e0 placer : ni photo ni texte.\"); return; }\n  var nPhotos = 0, nTexts = 0;\n  for (var c0 = 0; c0 < items.length; c0++) { nPhotos += items[c0].photos.length; nTexts += (items[c0].texts || []).length; }\n  // The photo folder is only looked for when photos are placed\n  function ensureBase() {\n    if (baseChecked) return !!base;\n    var probe = null;\n    for (var pi = 0; pi < items.length && !probe; pi++) for (var pj = 0; pj < items[pi].photos.length && !probe; pj++) if (items[pi].photos[pj].charAt(0) !== \"@\") probe = items[pi].photos[pj];\n    var tries = [];\n    if (base) { tries.push(base); if (base.parent) tries.push(base.parent); }\n    var found = null;\n    if (!probe) found = base || Folder.desktop;\n    for (var t = 0; t < tries.length && !found; t++) if (fileAt(tries[t], probe, t === 0)) found = tries[t];\n    while (!found) {\n      var fol = Folder.selectDialog(\"Photos introuvables. S\u00e9lectionnez le dossier qui contient les photos du livre (celui choisi dans l'application : \u00ab \" + DATA.root + \" \u00bb)\");\n      if (!fol) return false;\n      if (fileAt(fol, probe)) found = fol;\n      else if (!confirm(\"La photo \u00ab \" + probe.split(\"/\").pop() + \" \u00bb n'est pas dans ce dossier ni ses sous-dossiers.\\nChoisir un autre dossier ?\")) return false;\n    }\n    base = found; baseChecked = true; return true;\n  }\n\n  function pageByNumber(n) { var p = doc.pages.itemByName(String(n)); if (p.isValid) return p; if (n - 1 < doc.pages.length) return doc.pages[n - 1]; return null; }\n  // Items of a page, the same way the MEP export sees them: an item straddling two pages belongs to the left one\n  function itemsOfPage(page) {\n    var spread = page.parent, pages = spread.pages, out = [], all = spread.allPageItems, idx = -1;\n    for (var q = 0; q < pages.length; q++) if (pages[q].id === page.id) idx = q;\n    for (var i = 0; i < all.length; i++) {\n      var it = all[i], gb;\n      try { gb = it.geometricBounds; } catch (e) { continue; }\n      var own = -1;\n      for (var q2 = 0; q2 < pages.length; q2++) { var pb = pages[q2].bounds; if (Math.min(gb[3], pb[3]) - Math.max(gb[1], pb[1]) > 0.5 && Math.min(gb[2], pb[2]) - Math.max(gb[0], pb[0]) > 0.5) { own = q2; break; } }\n      if (own === idx) out.push(it);\n    }\n    return out;\n  }\n  function byPosition(a, b) { var A = a.geometricBounds, B = b.geometricBounds; var dy = A[0] - B[0]; if (Math.abs(dy) > DATA.rowTolerance) return dy; return A[1] - B[1]; }\n  function linkName(fr) { try { var g = fr.allGraphics; return g.length ? nm(g[0].itemLink.name) : \"\"; } catch (e) { return \"\"; } }\n  function isPlaceholder(fr) { var l = linkName(fr); if (!l) return true; for (var i = 0; i < PH.length; i++) if (nm(PH[i]) === l) return true; return false; }\n  // Photo blocks of a page: graphic frames that are empty or still hold the placeholder image of the MEP\n  function graphicFrames(page) {\n    var out = [], all = itemsOfPage(page);\n    for (var i = 0; i < all.length; i++) {\n      var it = all[i];\n      if (!(it instanceof Rectangle || it instanceof Polygon || it instanceof Oval)) continue;\n      try { if (it.parent instanceof Character) continue; if (it.contentType !== ContentType.GRAPHIC_TYPE) continue; if (it.locked) continue; } catch (e) { continue; }\n      if (DATA.onlyEmpty && !isPlaceholder(it)) continue;\n      out.push(it);\n    }\n    out.sort(byPosition);\n    return out;\n  }\n  function withPoints(fn) {\n    var vp = doc.viewPreferences, h = vp.horizontalMeasurementUnits, v = vp.verticalMeasurementUnits;\n    try { vp.horizontalMeasurementUnits = MeasurementUnits.POINTS; vp.verticalMeasurementUnits = MeasurementUnits.POINTS; return fn(); }\n    finally { try { vp.horizontalMeasurementUnits = h; vp.verticalMeasurementUnits = v; } catch (e) {} }\n  }\n  function fitIn(fr) { try { fr.fit(FitOptions.FILL_PROPORTIONALLY); fr.fit(FitOptions.CENTER_CONTENT); } catch (e) {} }\n  function lst(t, a) { return a.length ? \"\\n\\n\" + t + \" (\" + a.length + \") :\\n\" + a.slice(0, 12).join(\"\\n\") + (a.length > 12 ? \"\\n...\" : \"\") : \"\"; }\n  function autoPlace(list) {\n    if (!ensureBase()) return;\n    var placed = 0, missing = [], noFrame = [], noPage = [], loose = [];\n    app.doScript(function () {\n      withPoints(function () {\n        for (var i = 0; i < list.length; i++) {\n          var it = list[i], pg = pageByNumber(it.page);\n          if (!it.photos.length) continue;\n          if (!pg) { noPage.push(it.page); continue; }\n          var frames = graphicFrames(pg), used = {};\n          // Same number of blocks as the layout in the application: each photo goes to the block chosen there\n          var useSlots = it.slots && it.nf && frames.length === it.nf;\n          for (var j = 0; j < it.photos.length; j++) {\n            // A photo not put in a block in the application is never placed automatically\n            if (it.slots && it.slots[j] < 0) { loose.push(it.label + \" : \" + it.photos[j].split(\"/\").pop()); continue; }\n            var f = resolve(it.photos[j]);\n            if (!f) { missing.push(it.label + \" : \" + it.photos[j]); continue; }\n            var fi = -1;\n            if (useSlots && it.slots[j] >= 0 && !used[it.slots[j]]) fi = it.slots[j];\n            else for (var k = 0; k < frames.length; k++) if (!used[k] && !(useSlots && has(it.slots, k))) { fi = k; break; }\n            if (fi < 0) for (var k2 = 0; k2 < frames.length; k2++) if (!used[k2]) { fi = k2; break; }\n            if (fi < 0) { noFrame.push(it.label + \" : \" + it.photos[j]); continue; }\n            used[fi] = true;\n            try { frames[fi].place(f); fitIn(frames[fi]); placed++; } catch (e) { missing.push(it.label + \" : \" + it.photos[j] + \" (\" + e.message + \")\"); }\n          }\n        }\n      });\n    }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, \"Placer les photos (chemin de fer)\");\n    alert(placed + \" photo(s) plac\u00e9e(s).\" + lst(\"Pas assez de blocs image vides\", noFrame) + lst(\"Fichiers introuvables\", missing) + lst(\"Pages absentes du document\", noPage) + lst(\"Pas encore dans un bloc (\u00e0 placer avec le curseur)\", loose));\n  }\n\n  // ---------- texts ----------\n  function onlyGraphic(story) { try { return story.allGraphics.length > 0 && String(story.contents).replace(/[\\s\ufffc]/g, \"\") === \"\"; } catch (e) { return false; } }\n  // Stories that start on this page, in reading order (top to bottom, then left to right), as in the application\n  function storiesOfPage(page) {\n    var all = itemsOfPage(page), heads = [];\n    for (var i = 0; i < all.length; i++) {\n      var it = all[i];\n      if (!(it instanceof TextFrame)) continue;\n      try { if (it.parent instanceof Character) continue; if (it.parentStory.textContainers[0].id !== it.id) continue; if (onlyGraphic(it.parentStory)) continue; } catch (e) { continue; }\n      heads.push(it);\n    }\n    heads.sort(byPosition);\n    var out = []; for (var h = 0; h < heads.length; h++) out.push(heads[h].parentStory);\n    return out;\n  }\n  function plain(p) { var s = \"\"; for (var i = 0; i < p.runs.length; i++) s += p.runs[i].t; return s; }\n  var BOLD = [\"Bold\", \"Semibold\", \"SemiBold\", \"Demi\", \"Black\", \"Heavy\", \"Medium\", \"Gras\"];\n  function setBold(story, from, to) {\n    var ch = story.characters[from], fam;\n    try { fam = ch.appliedFont.fontFamily; } catch (e) { return false; }\n    var cur = String(ch.fontStyle), want = /italic|oblique/i.test(cur) ? [\" Italic\", \"\"] : [\"\"];\n    for (var i = 0; i < BOLD.length; i++) for (var w = 0; w < want.length; w++) {\n      var st = BOLD[i] + want[w];\n      if (app.fonts.itemByName(fam + \"\\t\" + st).isValid) { story.characters.itemByRange(from, to).fontStyle = st; return true; }\n    }\n    return false;\n  }\n  // Replaces the text paragraph by paragraph: each paragraph keeps the formatting of the layout (style of its first character),\n  // extra paragraphs take the style of the last one. Bold, capitals and left/right alignment are then added on top.\n  function setStory(story, paras, warn) {\n    if (!paras.length) paras = [{ runs: [{ t: \"\" }] }];\n    var n = paras.length;\n    while (story.paragraphs.length < n) story.insertionPoints[-1].contents = \"\\r\";\n    if (story.paragraphs.length > n) {\n      story.paragraphs.itemByRange(n, story.paragraphs.length - 1).remove();\n      var last = story.characters[-1]; if (last.isValid && last.contents === \"\\r\") last.remove();\n    }\n    for (var i = n - 1; i >= 0; i--) {\n      var p = story.paragraphs[i], L = p.characters.length, endsCR = L > 0 && p.characters[L - 1].contents === \"\\r\", vis = endsCR ? L - 1 : L, txt = plain(paras[i]);\n      if (vis === 0) { if (txt) p.insertionPoints[0].contents = txt; }\n      else { if (vis > 1) p.characters.itemByRange(1, vis - 1).remove(); if (txt) p.characters[0].contents = txt; else p.characters[0].remove(); }\n    }\n    for (var i2 = 0; i2 < n; i2++) {\n      var para = story.paragraphs[i2], start = para.characters[0].index, off = 0, P = paras[i2];\n      if (P.al === \"l\") para.justification = Justification.LEFT_ALIGN;\n      else if (P.al === \"r\") para.justification = Justification.RIGHT_ALIGN;\n      for (var r = 0; r < P.runs.length; r++) {\n        var run = P.runs[r], len = run.t.length;\n        if (len && run.b && !setBold(story, start + off, start + off + len - 1)) warn.push(\"gras indisponible pour cette police\");\n        if (len && run.c) story.characters.itemByRange(start + off, start + off + len - 1).capitalization = Capitalization.ALL_CAPS;\n        off += len;\n      }\n    }\n  }\n  function injectTexts(list) {\n    var done = 0, missing = [], warn = [], noPage = [];\n    app.doScript(function () {\n      withPoints(function () {\n        for (var i = 0; i < list.length; i++) {\n          var it = list[i]; if (!it.texts || !it.texts.length) continue;\n          var pg = pageByNumber(it.page); if (!pg) { noPage.push(it.page); continue; }\n          var stories = storiesOfPage(pg);\n          for (var k = 0; k < it.texts.length; k++) {\n            var tx = it.texts[k]; if (!tx) continue;\n            var st = stories[tx.i];\n            if (!st) { missing.push(it.label + \" : bloc texte n\u00b0 \" + (tx.i + 1) + \" absent\"); continue; }\n            try { setStory(st, tx.paras, warn); done++; } catch (e) { missing.push(it.label + \" : \" + e.message); }\n          }\n          if (stories.length !== it.ns) warn.push(it.label + \" : \" + stories.length + \" bloc(s) texte dans InDesign, \" + it.ns + \" dans la mise en page de l'application\");\n        }\n      });\n    }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, \"Verser les textes (chemin de fer)\");\n    var w2 = []; for (var x = 0; x < warn.length; x++) if (!has(w2, warn[x])) w2.push(warn[x]);\n    alert(done + \" texte(s) vers\u00e9(s), mise en forme de la maquette conserv\u00e9e.\" + lst(\"Non vers\u00e9s\", missing) + lst(\"\u00c0 v\u00e9rifier\", w2) + lst(\"Pages absentes du document\", noPage));\n  }\n\n  // ---------- palette ----------\n  var w = new Window(\"palette\", \"moodbook \u00b7 \" + DATA.book, undefined, { resizeable: true });\n  w.orientation = \"column\"; w.alignChildren = [\"fill\", \"top\"]; w.spacing = 6; w.margins = 10;\n  var help = w.add(\"statictext\", undefined, \"1. Choisissez une page.  2. \u00ab Charger dans le curseur \u00bb, puis cliquez dans les blocs image dans l'ordre voulu (\u00c9chap vide le curseur).  Ou s\u00e9lectionnez un bloc et une photo, puis \u00ab Placer dans le bloc \u00bb.\", { multiline: true });\n  help.preferredSize = [460, 44];\n  w.add(\"statictext\", undefined, \"Pages :\");\n  var pageList = w.add(\"listbox\", undefined, []); pageList.preferredSize = [460, 200];\n  for (var i = 0; i < items.length; i++) {\n    var tN = (items[i].texts || []).length;\n    pageList.add(\"item\", items[i].label + \"  \u2014  \" + items[i].photos.length + \" photo(s)\" + (tN ? \" \u00b7 \" + tN + \" texte(s)\" : \"\"));\n  }\n  w.add(\"statictext\", undefined, \"Photos de la page (ordre de l'application) :\");\n  var photoList = w.add(\"listbox\", undefined, [], { multiselect: true }); photoList.preferredSize = [460, 130];\n  var g1 = w.add(\"group\"); g1.alignment = [\"fill\", \"top\"];\n  var bGo = g1.add(\"button\", undefined, \"Aller \u00e0 la page\");\n  var bGun = g1.add(\"button\", undefined, \"Charger dans le curseur\");\n  var bSel = g1.add(\"button\", undefined, \"Placer dans le bloc\");\n  var g2 = w.add(\"group\"); g2.alignment = [\"fill\", \"top\"];\n  var bAutoPage = g2.add(\"button\", undefined, \"Photos : cette page\");\n  var bAutoAll = g2.add(\"button\", undefined, \"Photos : tout le livre\");\n  var g3 = w.add(\"group\"); g3.alignment = [\"fill\", \"top\"];\n  var bTxtPage = g3.add(\"button\", undefined, \"Textes : cette page\");\n  var bTxtAll = g3.add(\"button\", undefined, \"Textes : tout le livre\");\n  var bClose = g3.add(\"button\", undefined, \"Fermer\");\n  if (!nTexts) { bTxtPage.enabled = false; bTxtAll.enabled = false; }\n  if (!nPhotos) { bGun.enabled = false; bSel.enabled = false; bAutoPage.enabled = false; bAutoAll.enabled = false; }\n  var status = w.add(\"statictext\", undefined, items.length + \" pages \u00b7 \" + nPhotos + \" photo(s) \u00b7 \" + nTexts + \" texte(s).\", { truncate: \"end\" }); status.preferredSize = [460, 18];\n  var cur = null, curFiles = null;\n  function current() { return pageList.selection ? items[pageList.selection.index] : null; }\n  function fillPhotos() {\n    photoList.removeAll(); cur = current(); if (!cur) return;\n    curFiles = [];\n    for (var j = 0; j < cur.photos.length; j++) {\n      var f = baseChecked ? resolve(cur.photos[j]) : null; curFiles.push(f);\n      photoList.add(\"item\", (j + 1) + \". \" + cur.photos[j].split(\"/\").pop() + (cur.slots ? (cur.slots[j] >= 0 ? \"  \u2192 bloc \" + (cur.slots[j] + 1) : \"  (\u00e0 placer)\") : \"\") + (baseChecked && !f ? \"   (introuvable)\" : \"\"));\n    }\n    status.text = cur.label + (cur.event ? \" \u00b7 \" + cur.event.split(\"\\n\")[0] : \"\");\n  }\n  function filesNow() { if (!ensureBase()) return null; curFiles = []; for (var j = 0; j < cur.photos.length; j++) curFiles.push(resolve(cur.photos[j])); return curFiles; }\n  function goTo() { if (!cur) return null; var pg = pageByNumber(cur.page); if (!pg) { status.text = \"Page \" + cur.page + \" absente du document.\"; return null; } try { app.activeWindow.activePage = pg; } catch (e) {} return pg; }\n  function chosenFiles() {\n    var out = []; if (!filesNow()) return out;\n    if (photoList.selection && photoList.selection.length) { for (var k = 0; k < photoList.selection.length; k++) { var f = curFiles[photoList.selection[k].index]; if (f) out.push(f); } }\n    else for (var j = 0; j < curFiles.length; j++) if (curFiles[j]) out.push(curFiles[j]);\n    return out;\n  }\n  pageList.onChange = function () { fillPhotos(); goTo(); };\n  bGo.onClick = function () { if (!cur) { status.text = \"Choisissez d'abord une page.\"; return; } goTo(); };\n  bGun.onClick = function () {\n    if (!cur) { status.text = \"Choisissez d'abord une page.\"; return; }\n    var files = chosenFiles(); if (!files.length) { status.text = \"Aucune photo trouv\u00e9e pour cette page.\"; return; }\n    goTo();\n    try { doc.placeGuns.loadPlaceGun(files, false); status.text = files.length + \" photo(s) dans le curseur : cliquez dans les blocs, dans l'ordre voulu.\"; }\n    catch (e) { alert(\"Le curseur charg\u00e9 n'est pas disponible dans cette version d'InDesign.\\nUtilisez \u00ab Placer dans le bloc \u00bb ou le placement automatique.\\n\\n\" + e.message); }\n  };\n  bSel.onClick = function () {\n    if (!cur) { status.text = \"Choisissez d'abord une page.\"; return; }\n    var files = chosenFiles(); if (!files.length) { status.text = \"S\u00e9lectionnez une photo dans la liste.\"; return; }\n    if (!app.selection.length) { status.text = \"S\u00e9lectionnez d'abord un bloc image dans le document.\"; return; }\n    var fr = app.selection[0];\n    try { if (!(fr instanceof Rectangle || fr instanceof Polygon || fr instanceof Oval) && fr.parent) fr = fr.parent; } catch (e) {}\n    if (!(fr instanceof Rectangle || fr instanceof Polygon || fr instanceof Oval)) { status.text = \"La s\u00e9lection n'est pas un bloc image.\"; return; }\n    app.doScript(function () { fr.place(files[0]); fitIn(fr); }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, \"Placer une photo\");\n    status.text = \"\u00ab \" + decodeURI(files[0].name) + \" \u00bb plac\u00e9e.\";\n    if (photoList.selection && photoList.selection.length) { var nx = photoList.selection[photoList.selection.length - 1].index + 1; photoList.selection = null; if (nx < photoList.items.length) photoList.selection = nx; }\n  };\n  bAutoPage.onClick = function () { if (!cur) { status.text = \"Choisissez d'abord une page.\"; return; } goTo(); autoPlace([cur]); };\n  bAutoAll.onClick = function () { autoPlace(items); };\n  bTxtPage.onClick = function () { if (!cur) { status.text = \"Choisissez d'abord une page.\"; return; } if (!(cur.texts || []).length) { status.text = \"Aucun texte r\u00e9dig\u00e9 pour cette page.\"; return; } goTo(); injectTexts([cur]); };\n  bTxtAll.onClick = function () { injectTexts(items); };\n  bClose.onClick = function () { w.close(); };\n  w.onResizing = w.onResize = function () { this.layout.resize(); };\n  pageList.selection = 0;\n  w.show();\n})();\n";
const MEP_JSX="// moodbook - conception livre : export des mises en page d'un fichier MEP\n// Installation : Fen\u00eatre > Utilitaires > Scripts, clic droit sur \u00ab Utilisateur \u00bb > Faire appara\u00eetre dans le Finder,\n// copiez ce fichier dans ce dossier. Ouvrez le fichier MEP, puis double-cliquez sur le script dans le panneau Scripts.\n// Le script cr\u00e9e, \u00e0 c\u00f4t\u00e9 du fichier, un dossier \u00ab <nom du fichier> - export MEP \u00bb contenant :\n//   - mep.json : chaque page = une mise en page (blocs photo, blocs texte, formes, superpositions, cha\u00eenages, colonnes, styles)\n//   - un aper\u00e7u basse d\u00e9finition de chaque page (complet, et sans les blocs pour l'application)\n// Glissez ensuite ce dossier sur le livre voulu dans l'application (onglet Mises en page).\n// Le document n'est pas modifi\u00e9 (les blocs masqu\u00e9s le temps de l'aper\u00e7u sont r\u00e9affich\u00e9s).\n#target indesign\n(function () {\n  if (app.documents.length === 0) { alert(\"Ouvrez d'abord le fichier MEP dans InDesign.\"); return; }\n  var doc = app.activeDocument;\n  var docName = String(decodeURI(doc.name)).replace(/\\.indd$/i, \"\");\n  if (!/MEP/i.test(docName) && !confirm(\"\u00ab \" + docName + \" \u00bb n'a pas \u00ab MEP \u00bb dans son nom.\\nL'exporter quand m\u00eame comme fichier de mises en page ?\")) return;\n\n  // ---------- small helpers (ExtendScript has no JSON nor Array.indexOf) ----------\n  function has(a, v) { for (var i = 0; i < a.length; i++) if (a[i] === v) return true; return false; }\n  function r4(n) { return Math.round(n * 10000) / 10000; }\n  function r2(n) { return Math.round(n * 100) / 100; }\n  function J(v) {\n    if (v === null || v === undefined) return \"null\";\n    var t = typeof v;\n    if (t === \"number\") return isFinite(v) ? String(v) : \"null\";\n    if (t === \"boolean\") return v ? \"true\" : \"false\";\n    if (t === \"string\") {\n      var s = \"\\\"\";\n      for (var i = 0; i < v.length; i++) {\n        var c = v.charAt(i), k = v.charCodeAt(i);\n        if (c === \"\\\"\") s += \"\\\\\\\"\"; else if (c === \"\\\\\") s += \"\\\\\\\\\";\n        else if (k === 13) s += \"\\\\r\"; else if (k === 10) s += \"\\\\n\"; else if (k === 9) s += \"\\\\t\";\n        else if (k < 32 || k > 126) { var h = k.toString(16); while (h.length < 4) h = \"0\" + h; s += \"\\\\u\" + h; }\n        else s += c;\n      }\n      return s + \"\\\"\";\n    }\n    if (v instanceof Array) { var a = []; for (var j = 0; j < v.length; j++) a.push(J(v[j])); return \"[\" + a.join(\",\") + \"]\"; }\n    var o = [];\n    for (var key in v) if (v.hasOwnProperty(key) && v[key] !== undefined) o.push(J(key) + \":\" + J(v[key]));\n    return \"{\" + o.join(\",\") + \"}\";\n  }\n  function safe(fn, dflt) { try { var r = fn(); return r === undefined ? dflt : r; } catch (e) { return dflt; } }\n\n  // ---------- where to write ----------\n  var base = safe(function () { return doc.filePath; }, null);\n  if (!base) { base = Folder.selectDialog(\"Ce document n'est pas encore enregistr\u00e9. Choisissez o\u00f9 cr\u00e9er le dossier d'export\"); if (!base) return; }\n  var out = new Folder(base.fsName + \"/\" + docName + \" - export MEP\");\n  if (!out.exists && !out.create()) { alert(\"Impossible de cr\u00e9er le dossier :\\n\" + out.fsName); return; }\n  var old = out.getFiles(\"*.jpg\"); for (var oi = 0; oi < old.length; oi++) safe(function () { old[oi].remove(); });\n\n  // ---------- which images mark the photo blocks (the fixed placeholder image) ----------\n  var linkCount = {}, linkNames = [];\n  function linkOf(fr) { return safe(function () { var g = fr.allGraphics; return g.length ? String(decodeURI(g[0].itemLink.name)) : \"\"; }, \"\"); }\n  var allFrames = doc.allPageItems;\n  for (var ai = 0; ai < allFrames.length; ai++) {\n    var it0 = allFrames[ai];\n    if (!(it0 instanceof Rectangle || it0 instanceof Polygon || it0 instanceof Oval || it0 instanceof TextFrame)) continue;\n    var ln = linkOf(it0); if (!ln) continue;\n    if (!linkCount[ln]) { linkCount[ln] = 0; linkNames.push(ln); } linkCount[ln]++;\n  }\n  linkNames.sort(function (a, b) { return linkCount[b] - linkCount[a]; });\n  var remembered = safe(function () { return doc.extractLabel(\"cdf-placeholders\"); }, \"\");\n  var placeholders = [];\n  if (linkNames.length) {\n    var dlg = new Window(\"dialog\", \"Images t\u00e9moin des blocs photo\");\n    dlg.orientation = \"column\"; dlg.alignChildren = [\"fill\", \"top\"]; dlg.margins = 14; dlg.spacing = 8;\n    dlg.add(\"statictext\", undefined, \"Cochez l'image (ou les images) que vous placez dans les blocs photo de vos mises en page. Les autres images restent du d\u00e9cor.\", { multiline: true }).preferredSize = [420, 36];\n    var boxes = [], list = dlg.add(\"panel\"); list.alignChildren = [\"left\", \"top\"]; list.margins = 10;\n    for (var li = 0; li < linkNames.length && li < 20; li++) {\n      var cb = list.add(\"checkbox\", undefined, linkNames[li] + \"  (\" + linkCount[linkNames[li]] + \" bloc\" + (linkCount[linkNames[li]] > 1 ? \"s\" : \"\") + \")\");\n      cb.value = remembered ? has(remembered.split(\"\\n\"), linkNames[li]) : li === 0;\n      boxes.push(cb);\n    }\n    var bg_ = dlg.add(\"group\"); bg_.alignment = [\"right\", \"top\"];\n    bg_.add(\"button\", undefined, \"Annuler\", { name: \"cancel\" }); bg_.add(\"button\", undefined, \"Exporter\", { name: \"ok\" });\n    if (dlg.show() !== 1) return;\n    for (var bi = 0; bi < boxes.length; bi++) if (boxes[bi].value) placeholders.push(linkNames[bi]);\n    safe(function () { doc.insertLabel(\"cdf-placeholders\", placeholders.join(\"\\n\")); });\n  }\n\n  // ---------- measurements: points, spread origin ----------\n  var vp = doc.viewPreferences;\n  var saved = { h: vp.horizontalMeasurementUnits, v: vp.verticalMeasurementUnits, ro: vp.rulerOrigin, zp: doc.zeroPoint };\n  var jp = app.jpegExportPreferences, jSaved = {};\n  var JP_KEYS = [\"exportingSpread\", \"jpegExportRange\", \"pageString\", \"jpegQuality\", \"exportResolution\", \"jpegColorSpace\", \"antiAlias\", \"useDocumentBleeds\", \"simulateOverprint\"];\n  for (var jk = 0; jk < JP_KEYS.length; jk++) jSaved[JP_KEYS[jk]] = safe(function () { return jp[JP_KEYS[jk]]; }, undefined);\n  var hidden = [];\n  var progress = new Window(\"palette\", \"Export MEP\"); progress.margins = 14;\n  var pText = progress.add(\"statictext\", undefined, \"Lecture des pages\u2026\"); pText.preferredSize = [360, 18];\n  var pBar = progress.add(\"progressbar\", undefined, 0, Math.max(1, doc.pages.length * 3)); pBar.preferredSize = [360, 8];\n  progress.show();\n  var mbUid = safe(function () { var m = String(doc.extractLabel(\"mb-doc\")).match(/\"uid\":\"([^\"]+)\"/); return m ? m[1] : \"\"; }, \"\");\n  var result = { app: \"cdf-mep\", v: 1, doc: docName, uid: mbUid, at: new Date().toString(), ph: placeholders, pages: [], stories: {} };\n  var nPh = 0, nTx = 0;\n\n  var JUST = [[\"LEFT_ALIGN\", \"l\"], [\"CENTER_ALIGN\", \"c\"], [\"RIGHT_ALIGN\", \"r\"], [\"LEFT_JUSTIFIED\", \"j\"], [\"CENTER_JUSTIFIED\", \"jc\"], [\"RIGHT_JUSTIFIED\", \"jr\"], [\"FULLY_JUSTIFIED\", \"jf\"], [\"TO_BINDING_SIDE\", \"b\"], [\"AWAY_FROM_BINDING_SIDE\", \"a\"]];\n  function just(v) { for (var i = 0; i < JUST.length; i++) if (safe(function () { return v == Justification[JUST[i][0]]; }, false)) return JUST[i][1]; return \"l\"; }\n  function color(c, tint) {\n    return safe(function () {\n      if (!c) return null;\n      var t = (tint === undefined || tint < 0) ? 100 : tint;\n      if (safe(function () { return c instanceof Tint; }, false)) { t = c.tintValue; c = c.baseColor; }\n      if (!safe(function () { return c instanceof Color; }, false)) return null;                 // None, gradients, mixed inks\n      if (/^(Paper|Papier)$/.test(String(c.name))) return { s: \"r\", v: [255, 255, 255], t: 100 };\n      var sp = c.space == ColorSpace.CMYK ? \"c\" : c.space == ColorSpace.RGB ? \"r\" : c.space == ColorSpace.LAB ? \"l\" : \"c\";\n      var v = c.colorValue, o = []; for (var i = 0; i < v.length; i++) o.push(r2(v[i]));\n      return { s: sp, v: o, t: t };\n    }, null);\n  }\n  function capsOf(p) { return safe(function () { return p.capitalization == Capitalization.ALL_CAPS ? \"all\" : p.capitalization == Capitalization.SMALL_CAPS ? \"small\" : (p.capitalization == Capitalization.CAP_TO_SMALL_CAP ? \"small\" : \"\"); }, \"\"); }\n  function paraInfo(p) {\n    var sz = safe(function () { return p.pointSize; }, 10), ld = safe(function () { return p.leading; }, null);\n    if (typeof ld !== \"number\") ld = sz * safe(function () { return p.autoLeading; }, 120) / 100;\n    var txt = safe(function () { return String(p.contents); }, \"\");\n    return {\n      st: safe(function () { return String(p.appliedParagraphStyle.name); }, \"\"),\n      ff: safe(function () { return String(p.appliedFont.fontFamily); }, safe(function () { return String(p.appliedFont).split(\"\\t\")[0]; }, \"\")),\n      fs: safe(function () { return String(p.fontStyle); }, \"Regular\"),\n      sz: r2(sz), ld: r2(ld), al: just(safe(function () { return p.justification; }, null)),\n      col: color(safe(function () { return p.fillColor; }, null), safe(function () { return p.fillTint; }, -1)),\n      caps: capsOf(p), tr: safe(function () { return p.tracking; }, 0),\n      sb: r2(safe(function () { return p.spaceBefore; }, 0)), sa: r2(safe(function () { return p.spaceAfter; }, 0)),\n      fi: r2(safe(function () { return p.firstLineIndent; }, 0)), li: r2(safe(function () { return p.leftIndent; }, 0)), ri: r2(safe(function () { return p.rightIndent; }, 0)),\n      t: txt.replace(/\\r$/, \"\").substr(0, 1500)\n    };\n  }\n  function storyInfo(story) {\n    var ps = story.paragraphs, out_ = [], total = 0;\n    for (var i = 0; i < ps.length && i < 40 && total < 6000; i++) { var pi = paraInfo(ps[i]); total += pi.t.length; out_.push(pi); }\n    return { paras: out_, n: safe(function () { return story.textContainers.length; }, 1) };\n  }\n  function isOnlyGraphic(tf) {\n    return safe(function () { return tf.parentStory.allGraphics.length > 0 && String(tf.parentStory.contents).replace(/[\\s\ufffc]/g, \"\") === \"\"; }, false);\n  }\n  function shapeOf(it, gb) {\n    if (it instanceof Oval) return { sh: \"ov\" };\n    return safe(function () {\n      if (it.paths.length !== 1) return {};\n      var pts = it.paths[0].entirePath, w = gb[3] - gb[1], h = gb[2] - gb[0], o = [], axis = true;\n      for (var i = 0; i < pts.length; i++) {\n        var p = pts[i]; if (p[0] instanceof Array) p = p[1]; // curved point: [left, anchor, right]\n        var x = (p[0] - gb[1]) / w, y = (p[1] - gb[0]) / h;\n        if (!((Math.abs(x) < .002 || Math.abs(x - 1) < .002) && (Math.abs(y) < .002 || Math.abs(y - 1) < .002))) axis = false;\n        o.push([r4(x), r4(y)]);\n      }\n      return (axis && o.length === 4) ? {} : { sh: \"poly\", pts: o };\n    }, {});\n  }\n  function stroke(it) { return safe(function () { var w = it.strokeWeight; if (!w) return null; var c = color(it.strokeColor, it.strokeTint); return c ? { w: r2(w), c: c } : null; }, null); }\n\n  try {\n    vp.horizontalMeasurementUnits = MeasurementUnits.POINTS; vp.verticalMeasurementUnits = MeasurementUnits.POINTS;\n    vp.rulerOrigin = RulerOrigin.SPREAD_ORIGIN; doc.zeroPoint = [0, 0];\n    var pageIdx = 0, step = 0;\n    for (var si = 0; si < doc.spreads.length; si++) {\n      var spread = doc.spreads[si], pages = spread.pages, pb = [];\n      for (var q = 0; q < pages.length; q++) pb.push(pages[q].bounds);\n      var recs = []; for (var q2 = 0; q2 < pages.length; q2++) recs.push([]);\n      var items = spread.allPageItems, N = items.length;\n      for (var ii = 0; ii < N; ii++) {\n        var it = items[ii];\n        var isTF = it instanceof TextFrame;\n        if (!(isTF || it instanceof Rectangle || it instanceof Polygon || it instanceof Oval)) continue;\n        if (safe(function () { return it.parent instanceof Character; }, false)) continue;            // anchored in a text\n        if (safe(function () { return it.visible === false || it.itemLayer.visible === false; }, false)) continue;\n        var kind = null, link = \"\";\n        if (isTF) kind = isOnlyGraphic(it) ? \"ph\" : \"tx\";\n        else {\n          link = linkOf(it);\n          if (link) kind = has(placeholders, link) ? \"ph\" : null;                                    // other images = decoration\n          else if (safe(function () { return it.contentType == ContentType.GRAPHIC_TYPE; }, false)) kind = \"ph\";\n        }\n        if (!kind) continue;\n        var gb = it.geometricBounds, pi_ = -1;\n        for (var q3 = 0; q3 < pb.length; q3++) if (Math.min(gb[3], pb[q3][3]) - Math.max(gb[1], pb[q3][1]) > 0.5 && Math.min(gb[2], pb[q3][2]) - Math.max(gb[0], pb[q3][0]) > 0.5) { pi_ = q3; break; } // straddling: left page\n        if (pi_ < 0) continue;\n        var P = pb[pi_], W = P[3] - P[1], H = P[2] - P[0];\n        var fr = { id: String(it.id), k: kind, x: r4((gb[1] - P[1]) / W), y: r4((gb[0] - P[0]) / H), w: r4((gb[3] - gb[1]) / W), h: r4((gb[2] - gb[0]) / H), z: N - ii };\n        var rot = safe(function () { return it.rotationAngle; }, 0); if (rot) fr.r = r2(rot);\n        var shp = shapeOf(it, gb); if (shp.sh) { fr.sh = shp.sh; if (shp.pts) fr.pts = shp.pts; }\n        var fill = color(safe(function () { return it.fillColor; }, null), safe(function () { return it.fillTint; }, -1)); if (fill) fr.bg = fill;\n        var sk = stroke(it); if (sk) fr.sk = sk;\n        if (kind === \"tx\") {\n          var story = it.parentStory, sid = String(story.id);\n          if (!result.stories[sid]) result.stories[sid] = storyInfo(story);\n          var tc = story.textContainers, ci = 0; for (var c = 0; c < tc.length; c++) if (tc[c].id === it.id) ci = c;\n          var tp = it.textFramePreferences;\n          fr.st = sid; fr.ci = ci; fr.cols = safe(function () { return tp.textColumnCount; }, 1);\n          fr.gut = r2(safe(function () { return tp.textColumnGutter; }, 12));\n          var ins = safe(function () { return tp.insetSpacing; }, 0); fr.ins = ins instanceof Array ? [r2(ins[0]), r2(ins[1]), r2(ins[2]), r2(ins[3])] : [r2(ins), r2(ins), r2(ins), r2(ins)];\n          fr.vj = safe(function () { var v = tp.verticalJustification; return v == VerticalJustification.CENTER_ALIGN ? \"c\" : v == VerticalJustification.BOTTOM_ALIGN ? \"b\" : v == VerticalJustification.JUSTIFY_ALIGN ? \"j\" : \"t\"; }, \"t\");\n          if (safe(function () { return it.overflows; }, false)) fr.ov = true;\n          nTx++;\n        } else { if (link) fr.ln = link; nPh++; }\n        recs[pi_].push({ fr: fr, item: it });\n      }\n      for (var q4 = 0; q4 < pages.length; q4++) {\n        var pg = pages[q4], B = pb[q4];\n        // Left / right from the position in the spread (sturdier than page.side): first of two pages = left\n        var side = pages.length >= 2 ? (q4 === 0 ? \"l\" : \"r\") : safe(function () { return pg.side == PageSideOptions.LEFT_HAND ? \"l\" : \"r\"; }, \"r\");\n        var frs = []; for (var f = 0; f < recs[q4].length; f++) frs.push(recs[q4][f].fr);\n        pageIdx++; pText.text = \"Page \" + pg.name + \" (\" + pageIdx + \"/\" + doc.pages.length + \")\"; pBar.value = ++step;\n        if (!frs.length) continue;\n        var num = String(pg.documentOffset + 1); while (num.length < 3) num = \"0\" + num;\n        result.pages.push({ pid: String(pg.id), name: String(pg.name), off: pg.documentOffset, sp: si, side: side, w: r2(B[3] - B[1]), h: r2(B[2] - B[0]), img: \"p\" + num + \".jpg\", bg: \"p\" + num + \"-fond.jpg\", frames: frs, _recs: recs[q4] });\n      }\n    }\n\n    // ---------- low resolution previews: full page, then without the blocks ----------\n    jp.exportingSpread = false; jp.jpegExportRange = ExportRangeOrAllPages.EXPORT_RANGE;\n    safe(function () { jp.jpegQuality = JPEGOptionsQuality.MEDIUM; }); safe(function () { jp.exportResolution = 60; });\n    safe(function () { jp.jpegColorSpace = JpegColorSpaceEnum.RGB; }); safe(function () { jp.antiAlias = true; }); safe(function () { jp.useDocumentBleeds = false; });\n    app.scriptPreferences.enableRedraw = false;\n    for (var e1 = 0; e1 < result.pages.length; e1++) {\n      var rp = result.pages[e1];\n      pText.text = \"Aper\u00e7u de la page \" + rp.name; pBar.value = ++step;\n      jp.pageString = \"+\" + (rp.off + 1);\n      doc.exportFile(ExportFormat.JPG, new File(out.fsName + \"/\" + rp.img), false);\n      var rs = rp._recs;\n      for (var h = 0; h < rs.length; h++) { var item = rs[h].item; if (safe(function () { return item.visible; }, false)) { item.visible = false; hidden.push(item); } }\n      pText.text = \"Fond de la page \" + rp.name; pBar.value = ++step;\n      doc.exportFile(ExportFormat.JPG, new File(out.fsName + \"/\" + rp.bg), false);\n      while (hidden.length) { var hi = hidden.pop(); safe(function () { hi.visible = true; }); }\n      delete rp._recs;\n    }\n  } catch (err) {\n    progress.close();\n    alert(\"L'export s'est arr\u00eat\u00e9 : \" + err.message + (err.line ? \" (ligne \" + err.line + \")\" : \"\"));\n    return;\n  } finally {\n    while (hidden.length) { var hx = hidden.pop(); safe(function () { hx.visible = true; }); }\n    safe(function () { vp.horizontalMeasurementUnits = saved.h; vp.verticalMeasurementUnits = saved.v; vp.rulerOrigin = saved.ro; doc.zeroPoint = saved.zp; });\n    for (var jk2 = 0; jk2 < JP_KEYS.length; jk2++) if (jSaved[JP_KEYS[jk2]] !== undefined) safe(function () { jp[JP_KEYS[jk2]] = jSaved[JP_KEYS[jk2]]; });\n    app.scriptPreferences.enableRedraw = true;\n  }\n  progress.close();\n  var jf = new File(out.fsName + \"/mep.json\"); jf.encoding = \"UTF-8\";\n  if (!jf.open(\"w\")) { alert(\"Impossible d'\u00e9crire \" + jf.fsName); return; }\n  jf.write(J(result)); jf.close();\n  if (confirm(\"Export termin\u00e9 : \" + result.pages.length + \" mises en page (\" + nPh + \" blocs photo, \" + nTx + \" blocs texte).\\n\\nDossier :\\n\" + out.fsName + \"\\n\\nGlissez ce dossier sur le livre dans l'application (onglet Mises en page).\\nOuvrir le dossier maintenant ?\")) out.execute();\n})();\n";
async function offerFile(filename,data,fallbackText,fallbackName){
  if(!downloads){try{const blob=data instanceof Blob?data:new Blob([data],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);return}catch(e){}}
  if(downloads){try{await downloads.save({filename,data});return}catch(e){const c=e&&e.code;if(c==='declined')return;if(!['unavailable','not_granted','capability_disabled','capability_removed'].includes(c)){toast("Le fichier n'a pas pu être proposé.");return}}}
  showModal(`<h3>Téléchargement indisponible ici</h3><p class="muted small">Copiez le texte ci-dessous et enregistrez-le dans un fichier nommé <b>${esc(fallbackName||filename)}</b>.</p><textarea readonly id="fallback-text">${esc(fallbackText||'')}</textarea><div class="row"><button class="btn primary" data-act="copy-fallback">Copier</button><button class="btn" data-act="close-overlay">Fermer</button></div>`);
}
function showModal(html,cls){document.getElementById('overlay').innerHTML=`<div class="overlay" data-act="overlay-bg"><div class="modal ${cls||''}" role="dialog" aria-modal="true">${html}</div></div>`}
function closeOverlay(){view.mepSettings=false;view.share=null;view.files=null;view.accounts=null;view.myPass=null;document.getElementById('overlay').innerHTML='';if(lightbox&&lightbox.url)URL.revokeObjectURL(lightbox.url);lightbox=null}

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
  lib.loading=null;if(inCreation(b)){applyCreation(b);baseline(b)}const ex=fresh.filter(x=>x.dateSrc==='exif').length;setTimeout(()=>toast(`« ${fo.name} » : ${fresh.length} photos, ${ex} avec date de prise de vue`),50);render();
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
    if(it.thumbBlob){
      if([3,6,8].includes(it.orient)){const bmp=await createImageBitmap(it.thumbBlob);const q=it.orient!==3;const c=document.createElement('canvas');c.width=q?bmp.height:bmp.width;c.height=q?bmp.width:bmp.height;const x=c.getContext('2d');
        x.translate(c.width/2,c.height/2);x.rotate(it.orient===6?Math.PI/2:it.orient===8?-Math.PI/2:Math.PI);x.drawImage(bmp,-bmp.width/2,-bmp.height/2);if(bmp.close)bmp.close();
        const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.85));it.thumb=URL.createObjectURL(blob)}
      else it.thumb=URL.createObjectURL(it.thumbBlob);
      it.thumbRot=1}
    else if(BROWSER_IMG.test(it.name)){const bmp=await createImageBitmap(it.file);const s=Math.min(1,320/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);if(bmp.close)bmp.close();
      const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.8));it.thumb=URL.createObjectURL(blob);it.thumbRot=1}
    else return;
    document.querySelectorAll(`[data-tid="${it.id}"]`).forEach(el=>{el.querySelector('.ext,.nm')?.remove();if(!el.querySelector('img'))el.insertAdjacentHTML('afterbegin',thumbImg(it))});
  }catch(e){}
}
const ROT={3:'rotate(180deg)',6:'rotate(90deg)',8:'rotate(-90deg)'};
// Photos shown in a layout block get a larger preview made from the file (orientation applied), so they fill the block sharply
let bigQueue=[],bigActive=0;
function queueBig(it){if(it.big||it.bigTried||!BROWSER_IMG.test(it.name))return;it.bigTried=true;bigQueue.push(it);pumpBig()}
function pumpBig(){while(bigActive<2&&bigQueue.length){const it=bigQueue.shift();bigActive++;makeBig(it).finally(()=>{bigActive--;pumpBig()})}}
async function makeBig(it){try{const bmp=await createImageBitmap(it.file);const sc=Math.min(1,900/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*sc);c.height=Math.round(bmp.height*sc);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);if(bmp.close)bmp.close();
  const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.85));it.big=URL.createObjectURL(blob);
  document.querySelectorAll(`.fr[data-tid="${it.id}"]`).forEach(el=>{el.querySelector('.nm')?.remove();const im=el.querySelector('img');if(im)im.src=it.big;else el.insertAdjacentHTML('afterbegin',`<img src="${it.big}" alt="">`)})}catch(e){}}
const blockImg=it=>it.big?`<img src="${it.big}" alt="">`:thumbImg(it);
const thumbImg=it=>it.thumb?`<img src="${it.thumb}" alt="" style="${ROT[it.thumbRot]?'transform:'+ROT[it.thumbRot]:''}">`:'';
function visibleItems(){
  const b=books.get(view.id);const used=usedPaths(b);
  let arr=lib.items.filter(it=>lib.sub?(lib.cwd===''||it.dir===lib.cwd||it.dir.startsWith(lib.cwd+'/')):it.dir===lib.cwd);
  if(lib.hideUsed)arr=arr.filter(it=>!used.has(it.path));
  if(lib.sort==='name')arr.sort((a,z)=>natural(a.path,z.path));else arr.sort((a,z)=>a.date-z.date||natural(a.name,z.name));
  return {arr,used};
}

/* ================= routing ================= */
function readHash(){const h=location.hash.slice(1);if(h.startsWith('livre-')){view.route='livre';view.id=h.slice(6)}else{view.route='avancement';view.id=null}view.sel.clear();view.highlight='';view.active=null;view.menu=false;view.edit=null;view.lpick=null;view.plpick=null;view.rsel=null}
window.addEventListener('hashchange',()=>{readHash();view.booksOpen=false;view.menu=false;render();window.scrollTo(0,0)});

/* ================= render ================= */
function render(){
  const gated=cloudConfigured()&&!CLOUD.user;document.body.classList.toggle('gated',gated);
  if(gated){document.getElementById('nav').innerHTML='';document.getElementById('burger-slot').innerHTML='';document.getElementById('hist-slot').innerHTML='';
    document.getElementById('app').innerHTML=CLOUD.checked?renderGate():loadingState();['pool','rbarslot'].forEach(id=>{const e=document.getElementById(id);if(e)e.innerHTML=''});
    document.body.classList.remove('has-pool','has-rbar');setTimeout(()=>{const e=document.getElementById(view.cloudEmail?'cl-pass':'cl-email');if(e&&!document.activeElement.closest('#cloud-login'))e.focus()},0);return}
  const nav=document.getElementById('nav');const b=view.route==='livre'?books.get(view.id):null;
  renderVersion();const nv=renderNav(b);nav.innerHTML=nv.links;document.getElementById('burger-slot').innerHTML=nv.burger;renderHistSlot();
  const app=document.getElementById('app');
  {const R=document.getElementById('fx-text');if(R&&view.fxKeep==null)view.fxKeep=R.scrollTop}
  const keep={pb:document.getElementById('pb-scroll')?.scrollTop,ps:document.getElementById('ps-scroll')?.scrollTop,tr:document.getElementById('tray-list')?.scrollTop};
  if(view.route==='livre'){if(b)app.innerHTML=renderBook(normBook(b));else app.innerHTML=loaded?`<div class="panel emptystate"><h2>Livre introuvable</h2><p class="muted">Il a peut-être été supprimé.</p><a class="btn" href="#avancement">Retour à l'avancement</a></div>`:loadingState()}
  else app.innerHTML=renderProgress();
  for(const [id,k] of [['pb-scroll','pb'],['ps-scroll','ps'],['tray-list','tr']]){const el=document.getElementById(id);if(el&&keep[k]!=null)el.scrollTop=keep[k]}
  document.documentElement.style.setProperty('--toph',headerH()+'px');observeTiles();renderSelbar();renderPool();renderRbar();if(loaded)saveUI();maybeReopenDir();
  if(view.route==='livre'&&view.tab==='redac')flowAll();
  if(view.route==='livre'&&view.tab==='redac'&&view.rfocus)fxBind();else view.fxKeep=null;
  crPresence();{const bb=view.route==='livre'?books.get(view.id):null;const want=bb&&inCreation(bb)&&view.tab==='redac'&&view.rsel?'s'+String(view.rsel).split('#')[1]:null;if(want!==CR.lockBid){if(want)crLock(bb,want);else crUnlock(bb||books.get(CR.lockBook))}CR.lockBook=bb&&bb.id}
  if(view.mepSettings){if(view.route==='livre'&&view.tab==='layouts'&&view._mepSet){const sc=document.querySelector('#overlay .modal')?.scrollTop;showModal(view._mepSet,'wide mepset');const md=document.querySelector('#overlay .modal');if(md&&sc)md.scrollTop=sc}else closeOverlay()}
  if(view.edit){const t=document.getElementById('pe-text');if(t&&document.activeElement!==t){t.focus();t.setSelectionRange(t.value.length,t.value.length)}}
}
function renderNav(b){
  const all=[...books.values()];const years=[...new Set(all.map(x=>+x.year||0))].sort((a,z)=>z-a);
  const chev='<svg class="chev" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const bookLink=x=>{const cr=inCreation(x);return `<a href="#livre-${esc(x.id)}" ${b&&x.id===b.id?'aria-current="page"':''}><span>${esc(x.title)}</span><small>${x.pageCount||0} p.${cr?' · en création':''}</small></a>`};
  const dd=`<div class="books-dd ${view.booksOpen?'open':''}"><button class="nav-dd" data-act="books-dd" aria-expanded="${!!view.booksOpen}" aria-haspopup="true" ${b?'aria-current="page"':''}>Livres ${chev}</button>
    <div class="dd-panel panel" role="menu"><div class="dd-cols">${years.map(y=>`<div class="dd-col"><div class="menu-y">${y||'Sans année'}</div>${all.filter(x=>(+x.year||0)===y).sort((a,z)=>(a.order??999)-(z.order??999)||a.title.localeCompare(z.title)).map(bookLink).join('')}</div>`).join('')||'<p class="small muted" style="margin:6px 10px">Aucun livre pour l\'instant.</p>'}</div>
      <div class="dd-foot"><a href="#avancement">Tous les livres sur le tableau de bord</a></div></div></div>`;
  const savedTxt=(document.getElementById('saved')||{}).textContent||'';
  const acc=cloudConfigured()&&CLOUD.user?`<div class="menu-y">Compte</div><div class="menu-acc"><b>${esc(CLOUD.user.email||'')}</b><span class="small muted" id="menu-saved">${esc(savedTxt||'En ligne')}</span></div><button class="mitem" data-act="my-pass">Changer mon mot de passe</button>${IS_ADMIN()?`<button class="mitem" data-act="accounts">Comptes des utilisateurs</button>`:''}`:'';
  const ver=IS_ADMIN()?`<div class="menu-sep"></div><div class="menu-y">Version</div><div class="menu-acc"><span class="mono small">v ${esc(fmtBuild(MB_VERSION))}</span></div><button class="mitem" data-act="load-latest">Charger la dernière version</button>`:'';
  return {links:`<a href="#avancement" ${view.route==='avancement'?'aria-current="page"':''}>Tableau de bord</a>${dd}`,burger:`
    <span class="burger"><button class="icon-btn" data-act="menu" aria-expanded="${!!view.menu}" aria-label="Menu" title="Menu"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
    ${view.menu?`<div class="menu panel">${acc}${ver}<div class="menu-sep"></div><div class="menu-y">InDesign</div>${cloudOn()?`<button class="mitem" data-act="pj-files">Fichiers InDesign des projets</button>`:''}<a href="indesign/moodbook.ccx" download>Télécharger le panneau InDesign</a><div class="menu-sep"></div><div class="menu-y">Sauvegarde</div><button class="mitem" data-act="backup">Sauvegarder dans un fichier (.json)</button><button class="mitem" data-act="restore">Restaurer une sauvegarde…</button>${cloudConfigured()&&CLOUD.user?`<div class="menu-sep"></div><button class="mitem" data-act="cloud-out">Se déconnecter</button>`:''}</div>`:''}</span>`};
}
const headerH=()=>(document.querySelector('.top')?.offsetHeight||52);
// Brings a full-height view (Visuel, Rédaction) right under the sticky section tabs
function scrollUnderTabs(id){const el=document.getElementById(id);if(!el)return;const t=document.querySelector('.tabs2');window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-headerH()-(t?t.offsetHeight:0)-6)}
const UI_KEY='atelier-ui';
function saveUI(){const u={hash:location.hash,tab:view.tab,rfocus:!!view.rfocus,cdfMode:view.cdfMode,active:view.active,rk:view.rk,pzh:view.pzh,plLines:!!view.plLines,lib:{sort:lib.sort,size:lib.size,sub:lib.sub,hideUsed:lib.hideUsed}};const j=JSON.stringify(u);try{sessionStorage.setItem(UI_KEY,j)}catch(e){}try{localStorage.setItem(UI_KEY,j)}catch(e){}}
function loadUI(){let u=null;try{u=JSON.parse(sessionStorage.getItem(UI_KEY)||'null')}catch(e){}if(!u)try{u=JSON.parse(localStorage.getItem(UI_KEY)||'null')}catch(e){}
  if(!u)return;if(u.tab)view.tab=u.tab==='events'?'cdf':u.tab;if(u.cdfMode)view.cdfMode=u.cdfMode;if(u.lib)Object.assign(lib,{sort:u.lib.sort||lib.sort,size:u.lib.size||lib.size,sub:u.lib.sub!==false,hideUsed:!!u.lib.hideUsed});
  if(u.rk!=null)view.rk=u.rk;view.rfocus=!!u.rfocus;if(u.pzh)view.pzh=u.pzh;view.plLines=!!u.plLines;
  if(!location.hash&&u.hash&&u.hash.startsWith('#livre-'))history.replaceState(null,'',u.hash);view._active=u.active}
const loadingState=()=>`<div class="panel emptystate"><p class="muted">Chargement de vos livres…</p></div>`;
function observeTiles(){
  if(observer)observer.disconnect();const root=document.getElementById('pb-scroll');if(!root)return;
  observer=new IntersectionObserver(ents=>{for(const e of ents)if(e.isIntersecting){const it=lib.items[+e.target.dataset.idx];if(it)queueThumb(it);observer.unobserve(e.target)}},{root,rootMargin:'300px'});
  root.querySelectorAll('.tile[data-idx]').forEach(t=>{const it=lib.items[+t.dataset.idx];if(it&&!it.thumb)observer.observe(t)});
  document.querySelectorAll('.athumb[data-tid],.fr[data-tid]').forEach(t=>{const it=lib.items.find(x=>x.id===t.dataset.tid);if(it&&!it.thumb)queueThumb(it);if(it&&t.classList.contains('fr'))queueBig(it)});
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
      const cdfInfo=b.pageCount?`<span class="mono">${m.filled}/${b.pageCount}</span> p. · <span class="mono">${m.nLay}</span> MEP${m.placed?` · <span class="mono">${m.placed}</span> ph.`:''}${m.over.length?` · <span class="pill bad">${m.over.length} &gt; ${b.maxReuse}×</span>`:''}${b.pageCount%4?' · <span class="pill bad">pages ≠ ×4</span>':''}`:'<span class="muted">—</span>';
      rows+=`<tr>
        <td><a class="booklink" href="#livre-${esc(b.id)}">${esc(b.title)}</a></td>
        <td><textarea class="note" rows="1" data-act="note" data-book="${esc(b.id)}" id="note-${esc(b.id)}" aria-label="Statut de ${esc(b.title)}">${esc(b.note)}</textarea></td>
        ${STAGES.map(([k])=>`<td class="st">${stChip(b.id,k)}</td>`).join('')}
        <td><div class="row" style="flex-wrap:nowrap"><div class="bar ${p===100?'ok':''}" style="flex:1"><i style="width:${p}%"></i></div><span class="mono small">${p}%</span></div></td>
        <td class="small" style="white-space:nowrap">${cdfInfo}</td>
        <td><a class="btn" href="#livre-${esc(b.id)}">Ouvrir</a></td></tr>`;
    }
  }
  return renderCloudBox()+`<div class="head"><div><div class="eyebrow">Tous les projets</div><h1>Tableau de bord</h1></div>
    <div class="row">${cloudOn()?`<button class="btn" data-act="pj-files">Fichiers InDesign${pjFixCount()?` <span class="pill bad">${pjFixCount()}</span>`:''}</button>`:''}<button class="btn primary" data-act="show-new">+ Nouveau livre</button></div></div>
    ${pjFixCount()?`<div class="warnbar">${pjFixCount()} projet${pjFixCount()>1?'s':''} en création sans fichier livre relié : synchronisation corrective recommandée.<button class="btn sm" data-act="pj-files">Voir les projets</button></div>`:''}
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
  const pctOf=(a,z)=>z?Math.round(a/z*100):0;
  const kc=(label,val,sub,bar,cls)=>`<div class="kc ${cls||''}"><span class="kc-l">${label}</span><span class="kc-v">${val}</span>${sub?`<span class="kc-s">${sub}</span>`:''}${bar!=null?`<span class="bar ${bar>=100?'ok':''}"><i style="width:${Math.min(100,bar)}%"></i></span>`:''}</div>`;
  const alertList=[m.over.length?`${m.over.length} mise${m.over.length>1?'s':''} en page utilisée${m.over.length>1?'s':''} plus de ${b.maxReuse} fois`:'',m.short.length?`${m.short.length} événement${m.short.length>1?'s':''} sans assez de places photo`:''].filter(Boolean);
  const head=`<header class="bookhead2">
      <div class="bh-main">
        <span class="eyebrow">Livre${isShared(b)?' · <span class="shared-tag">partagé avec vous</span>':''}${inCreation(b)?' · <span class="cr-tag">en création</span>':''}</span>
        <input class="titleinput" id="bk-title" data-act="title" value="${esc(b.title)}" aria-label="Titre du livre">
        <div class="bh-specs">
          <label class="spec">Année<input class="mini mono" type="number" id="bk-year" data-act="year" value="${b.year}" aria-label="Année"></label>
          <label class="spec">Pages<input class="mini mono" type="number" min="4" step="4" id="bk-pages" data-act="pages" value="${b.pageCount}" aria-label="Nombre de pages"></label>
          <span class="spec ro">Planches<b class="mono">${m.sp.length}</b></span>
        </div>
        ${pjChips(b)?`<div class="bh-files">${pjChips(b)}</div>`:''}
      </div>
      <div class="bh-act">
        <div class="row" style="gap:6px;justify-content:flex-end">${inCreation(b)?'<span class="sync-chip" title="Les photos et les textes se synchronisent avec le panneau moodbook d\'InDesign">⇄ Synchronisé avec InDesign</span>':''}<button class="btn ${inCreation(b)?'':'primary'}" data-act="export-indd" ${m.placed||m.texts?'':'disabled'} title="${m.placed||m.texts?'Script InDesign : photos placées et textes rédigés':'Placez des photos ou rédigez des textes pour activer l\'export'}">Export InDesign</button><button class="btn" data-act="export-csv" ${m.placed?'':'disabled'}>CSV</button></div>
        <div class="row" style="gap:6px;justify-content:flex-end">${IS_ADMIN()&&inCreation(b)?`<button class="btn ghost sm" data-act="diag" title="Télécharge les données de création de ce livre (structure, blocs, aperçus) pour le débogage">Diagnostic</button>`:''}${cloudOn()&&!isShared(b)?`<button class="btn ghost sm" data-act="share">Partager</button>`:''}${isShared(b)?'':`<button class="btn ghost sm danger ${view.armed==='book'?'armed':''}" data-act="del-book">${view.armed==='book'?'Confirmer la suppression':'Supprimer le livre'}</button>`}</div>
      </div>
    </header>
    <div id="presence-slot" class="presence">${inCreation(b)?presenceHtml():''}</div>
    <div class="kcards">
      ${kc('Événements',`${m.filled}<small>/${b.pageCount}</small>`,'pages renseignées',pctOf(m.filled,b.pageCount))}
      ${m.PL?kc('Mises en page posées',`${m.withLay}<small>/${b.pageCount}</small>`,'pages',pctOf(m.withLay,b.pageCount)):kc('Mises en page posées',`${m.withLay}<small>/${m.sp.length}</small>`,'planches',pctOf(m.withLay,m.sp.length))}
      ${kc('Mises en page',`${m.nLay}`,`${m.needed} minimum · ${b.maxReuse}× max chacune`,null,m.nLay&&m.nLay<m.needed?'warn':'')}
      ${kc('Photos placées',`${m.placed}`,'',null)}
      ${kc('Textes rédigés',`${m.texts}`,'',null)}
      ${alertList.length?`<div class="kc bad"><span class="kc-l">${alertList.length} alerte${alertList.length>1?'s':''}</span>${alertList.map(a=>`<span class="kc-s">${a}</span>`).join('')}</div>`:''}
    </div>`;
  const lo=Math.floor(b.pageCount/4)*4,hi=lo+4;
  const warn=b.pageCount%4?`<div class="warnbar">${b.pageCount} pages n'est pas un multiple de 4.${lo?`<button class="btn sm" data-act="setpages" data-n="${lo}">Passer à ${lo} pages</button>`:''}<button class="btn sm" data-act="setpages" data-n="${hi}">Passer à ${hi} pages</button></div>`:'';
  const curTab=view.tab==='cdf'?(view.cdfMode==='photos'?'visuel':'cdf'):view.tab;const CRM0=inCreation(b);
  const tb=(id,tab,mode,label,count)=>`<button role="tab" aria-selected="${curTab===id}" data-act="tab" data-tab="${tab}" ${mode?`data-mode="${mode}"`:''}>${label}${count!==''&&count!=null?`<span class="count">${count}</span>`:''}</button>`;
  const tabs=`<nav class="tabs2" aria-label="Sections du livre">
      <div class="tgrp ${CRM0?'done':''}"><span class="tgl"><span class="tgn">${CRM0?'✓':'1'}</span>Conception<span class="tgd">${CRM0?'terminée':'structure du livre'}</span></span><div class="tabs" role="tablist">${tb('layouts','layouts','','Mises en page',m.nLay)}${tb('cdf','cdf','plan','Chemin de fer',m.sp.length+' pl.')}</div></div>
      <div class="tgrp"><span class="tgl"><span class="tgn">2</span>Création<span class="tgd">${CRM0?'synchronisée avec InDesign':'photos et textes'}</span></span><div class="tabs" role="tablist">${tb('visuel','cdf','photos','Visuel',m.placed?m.placed+' ph.':'')}${tb('redac','redac','','Rédaction',m.texts||'')}${tb('notes','notes','','Notes',pjTodos(b).filter(t=>!t.done).length||'')}</div></div>${view.tab==='redac'&&b.pl.length?`<button class="fx-sw" data-act="r-focus" aria-pressed="${!!view.rfocus}" title="Relire tout le livre d'un seul défilement"><span class="sw"><i></i></span>Focus</button>`:''}</nav>`;
  let body='';const CRM=inCreation(b);
  if(CRM&&(view.tab==='layouts'||(view.tab==='cdf'&&view.cdfMode!=='photos'))){const c=crOf(b);
    body=`<div class="panel emptystate"><h2>${I_LOCK} Conception terminée</h2><p class="muted">Ce livre est en création depuis le document InDesign « ${esc(c.data.doc||'')} »${c.data.at?' ('+esc(fmtVer(c.data.at))+')':''} : ses pages, ses blocs photo et ses blocs texte viennent maintenant du document, et se synchronisent avec InDesign.</p><div class="row" style="justify-content:center"><button class="btn primary" data-act="tab" data-tab="cdf" data-mode="photos">Aller au Visuel</button><button class="btn" data-act="tab" data-tab="redac">Aller à la Rédaction</button></div></div>`}
  else if(view.tab==='cdf')body=view.cdfMode==='photos'?renderPhotos(b,m,ev):renderCdf(b,m,ev);
  else if(view.tab==='redac')body=renderRedac(b,m,ev);else if(view.tab==='notes')body=renderNotes(b);else body=renderPageLayouts(b,m,ev);
  return head+warn+tabs+body;
}
const cdfSwitch=()=>`<div class="seg" role="group" aria-label="Vue du chemin de fer"><button data-act="cdfmode" data-mode="plan" aria-pressed="${view.cdfMode==='plan'}">Plan des pages</button><button data-act="cdfmode" data-mode="photos" aria-pressed="${view.cdfMode==='photos'}">Visuel</button></div>`;

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
  if(!b.pageCount)return `<div class="panel emptystate"><h2>Indiquez le nombre de pages</h2><p class="muted">Saisissez le nombre de pages du livre (multiple de 4) sous le titre pour générer les planches, ou importez directement votre chemin de fer Excel.</p><button class="btn primary" data-act="imp-open">Importer depuis Excel…</button></div>`;
  const lay=layById(b);const PL=usesPL(b),plm=plById(b),pu=plUsage(b);const LAYS=PL?b.pl.filter(l=>!l.gone):b.layouts;
  const tools=`<div class="cdf-tools"><button class="btn sm" data-act="imp-open" title="Importer les événements d'un chemin de fer Excel">Importer depuis Excel…</button>
     <span class="small muted">Clic sur une page : écrire son événement. Glisser un événement sur un autre : fusionner. Le « + » entre deux planches en insère une.</span>
     <span style="flex:1"></span>
     <label class="row small muted">Repérer <select class="f" id="hl" data-act="highlight"><option value="">Toutes les MEP</option>${LAYS.map(l=>`<option value="${esc(l.id)}" ${view.highlight===l.id?'selected':''}>${esc(l.name)}</option>`).join('')}<option value="__none" ${view.highlight==='__none'?'selected':''}>Sans mise en page</option></select></label>
   </div>`;
  const palette=PL?(LAYS.length?`<div class="panel palette">${plPairs(b).map((g,i)=>{const ls=[g.l,g.r].filter(Boolean);const ns=ls.map(l=>(pu[l.id]||[]).length);const mx=Math.max(...ns);return `<span class="chip ${mx>b.maxReuse?'over':mx===b.maxReuse?'full-use':''} ${ls.some(l=>l.locked)?'locked':''}" draggable="true" data-drag="plpair" data-k="${esc(g.k)}" title="${esc(g.src)} · ${ls.map(l=>esc(l.name)).join(' + ')} · glisser sur une planche">${[g.l,g.r].map(l=>`<span class="cimg">${l&&l.img?`<img src="${esc(imgSrc(l.img))}" alt="">`:''}</span>`).join('')}${ls.map(l=>esc(l.name)).join(' · ')} <span class="n">${ns.join('·')}/${b.maxReuse}</span></span>`}).join('')}</div>`:''):b.layouts.length?`<div class="panel palette">${b.layouts.map(l=>{const n=(m.u[l.id]||[]).length;return `<span class="chip ${n>b.maxReuse?'over':n===b.maxReuse?'full-use':''} ${l.locked?'locked':''}" draggable="true" data-drag="layout" data-lay="${esc(l.id)}" title="Glisser sur une planche">${layVisual(l)}${l.locked?I_LOCK:''}${esc(l.name)} <span class="n">${n}/${b.maxReuse}</span></span>`}).join('')}</div>`:'';
  const cards=m.sp.map(s=>{
    const lid=b.spreads[s.key];const l=PL?null:lay[lid];const n=l?(m.u[l.id]||[]).length:0;
    const pgs=[s.l,s.r].filter(Boolean);const pls=PL?[s.l,s.r].map(p=>p?plm[b.pageLay[p]]:null):[];
    const dim=view.highlight&&(PL?(view.highlight==='__none'?pgs.every(p=>plm[b.pageLay[p]]):!pls.some(x=>x&&x.id===view.highlight)):(view.highlight==='__none'?!!l:view.highlight!==lid));
    const overPL=PL&&pls.some(x=>x&&(pu[x.id]||[]).length>b.maxReuse);
    const placed=(b.assign[s.key]||[]).length;const pinned=!!b.pins[s.key];const capPL=PL?pls.reduce((a,x)=>a+plPhotos(x),0):0;
    const slot=(p,x)=>{if(!p)return '<span class="pls none-pg"></span>';const k=x?(pu[x.id]||[]).length:0;return `<button class="pls ${x?'':'empty'} ${x&&k>b.maxReuse?'bad':''}" data-act="plpick" data-page="${p}" data-drop="pgl" ${x?'draggable="true" data-drag="pagelay"':''} title="${x?`${esc(x.name)} · ${plPhotos(x)} photo(s) · ${k}/${b.maxReuse} · clic : changer · glisser sur une autre page : échanger`:`Page ${p} : choisir une mise en page`}">${x?(x.img?`<img src="${esc(imgSrc(x.img))}" alt="">`:esc(x.name.slice(0,3))):'+'}</button>`};
    return `<article class="spread ${dim?'dim':''} ${(l&&n>b.maxReuse)||overPL?'over-limit':''}" data-key="${s.key}" data-drop="spread">
      ${s.key>=2?`<button class="ins" data-act="ins-pl" data-key="${s.key}" title="Insérer une planche vide avant la planche ${plancheNo(s.key)}" aria-label="Insérer une planche avant la planche ${plancheNo(s.key)}">+</button>`:''}
      <div class="sp-top"><span class="sp-label" data-drop="plmove" data-pl="${plancheNo(s.key)}" title="Déposez ici un événement pour le déplacer sur cette planche">Pl. ${plancheNo(s.key)}</span><input class="spname" id="spn-${s.key}" data-act="spread-name" data-key="${s.key}" value="${esc(b.spreadNames[s.key]||'')}" placeholder="Nommer la planche" aria-label="Nom de la planche ${plancheNo(s.key)}">${(()=>{const pk=s.key===0?null:s.key===2?0:s.key-2;const pn=pk!=null&&b.spreadNames[pk];return pn&&pn!==b.spreadNames[s.key]?`<button class="spprev" data-act="sp-prev" data-key="${s.key}" title="Reprendre le nom de la planche précédente : « ${esc(pn)} »">↶ ${esc(pn.length>14?pn.slice(0,13)+'…':pn)}</button>`:''})()}${s.key>=2?`<button class="pl-del ${view.armed==='pldel:'+s.key?'armed':''}" data-act="pl-del-planche" data-key="${s.key}" title="${view.armed==='pldel:'+s.key?'Cliquer à nouveau pour supprimer la planche':'Supprimer cette planche (la suite recule d\'une planche)'}" aria-label="Supprimer la planche ${plancheNo(s.key)}">${view.armed==='pldel:'+s.key?'Supprimer ?':I_TRASH}</button>`:''}<button class="pin ${pinned?'on':''}" data-act="pin" data-key="${s.key}" title="${pinned?'Planche verrouillée : la répartition automatique n\'y touche pas':'Verrouiller cette planche'}" aria-pressed="${pinned}">${pinned?I_LOCK:I_UNLOCK}</button></div>
      <div class="pair">${PL?(pls.some(Boolean)?`<div class="pair-bg pl" aria-hidden="true"><div>${pls[0]&&pls[0].img?`<img src="${esc(imgSrc(pls[0].img))}" alt="">`:''}</div><div>${pls[1]&&pls[1].img?`<img src="${esc(imgSrc(pls[1].img))}" alt="">`:''}</div></div>`:''):l?`<div class="pair-bg" aria-hidden="true">${layVisual(l)}</div>`:''}${(s.l&&s.r&&b.pages[s.l]&&b.pages[s.l]===b.pages[s.r]&&ev[b.pages[s.l]])?wideCell(b,s,ev[b.pages[s.l]]):pageCell(b,s.l,'left',ev)+pageCell(b,s.r,'right',ev)}</div>
      ${PL?`<div class="sp-foot pl"><span class="pls-pair">${slot(s.l,pls[0])}${slot(s.r,pls[1])}</span><span class="lcount small">${pls.filter(Boolean).map(x=>esc(x.name)).join(' · ')}</span><span class="ph" title="Photos placées / blocs photo des mises en page">${placed||'–'}/${capPL||'–'}</span></div>
      ${view.plpick!=null&&pgs.includes(view.plpick)?plPicker(b,view.plpick):''}`:`<div class="sp-foot"><button class="thumb lthumb ${l?'':'none'}" data-act="lpick" data-key="${s.key}" ${l?`draggable="true" data-drag="spreadlay"`:''} title="${l?esc(l.name)+' · clic : changer · glisser vers une autre planche : échanger':'Choisir une mise en page'}">${l?layVisual(l):'<span>+ MEP</span>'}</button>
        <span class="lcount mono ${n>b.maxReuse?'bad':''}" title="${l?esc(l.name)+' : utilisée '+n+' fois sur '+b.maxReuse:'Aucune mise en page'}">${l?n+'/'+b.maxReuse:''}</span>
        <span class="ph" title="Photos placées / places dans la mise en page">${placed||'–'}/${l&&l.photos?l.photos:'–'}</span></div>
      ${view.lpick===s.key?layPicker(b,m,s.key):''}`}
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
    remapPages(b,n=>n>=q&&n<G&&!keep.has(n)?n+2:n);
  }
  b.pages[q]=evId;
  const max=Math.max(0,...Object.keys(b.pages).map(Number));let grew='';if(max>b.pageCount){b.pageCount=Math.ceil(max/4)*4;grew=` · le livre passe à ${b.pageCount} pages`}
  save(b);toastUndo('Événement en double page'+grew);
}
function renderPhotos(b,m,ev){
  if(!b.pageCount)return `<div class="panel emptystate"><p class="muted">Indiquez d'abord le nombre de pages du livre sous son titre.</p></div>`;
  ensureLibFor(b);
  const lay=layById(b);const PL=usesPL(b),plm=plById(b);
  if(view.active==null||!m.sp.some(s=>s.key===view.active))view.active=m.sp[0].key;
  const top='';
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
    const pages=spreadPages(b,s.key);const evs=[...new Set(pages.map(p=>ev[b.pages[p]]).filter(Boolean))];const l=PL?null:lay[b.spreads[s.key]];const arr=b.assign[s.key]||[];
    const lps=PL?pages.map(p=>plm[b.pageLay[p]]):[];const cap=PL?lps.reduce((a,x)=>a+plPhotos(x),0):(l&&l.photos?l.photos:0);const cls=!cap?'':arr.length===cap?'ok':arr.length>cap?'bad':'';
    return `<section class="psr ${view.active===s.key?'active':''}" data-drop="psr" data-key="${s.key}">
      <div class="psr-h" data-act="activate" data-key="${s.key}"><span class="lbl" data-drop="plmove" data-pl="${plancheNo(s.key)}" title="${esc(spreadLabel(b,s.key))} · déposez un événement ici pour le déplacer sur cette planche">Pl. ${plancheNo(s.key)}</span>
        <div class="evcs">${evs.map(e=>`<div class="evc" data-drop="evmerge" data-ev="${esc(e.id)}" style="--h:${e.hue}"><span class="grip" draggable="true" data-drag="evmove" data-ev="${esc(e.id)}" title="Glisser sur un autre événement pour fusionner, sur un n° de planche pour déplacer, sur la corbeille pour désassigner" aria-label="Déplacer l'événement">⋮⋮</span><textarea class="evname" rows="1" id="psn-${s.key}-${esc(e.id)}" data-act="ev-name" data-ev="${esc(e.id)}" aria-label="Texte de l'événement">${esc(e.name)}</textarea>${sidePicto(b,e,s.key)}</div>`).join('')||'<span class="small muted">Sans événement</span>'}</div>
        <span class="cnt ${cls}" title="Photos placées / ${PL?'blocs photo des mises en page':'places dans '+(l?esc(l.name):'la mise en page')}">${arr.length}/${cap||'–'}</span></div>
      <div class="psr-b2 ${s.key===0?'single':''} ${arr.length||PL?'':'empty'}">${(s.key===0?['r']:['l','r']).map(side=>{
        const list=arr.map((a,i)=>({a,i})).filter(x=>photoSide(s.key,x.a)===side);const pg=side==='l'?s.l:s.r;const lp=PL&&pg?plm[b.pageLay[pg]]:null;
        let inner,F=null;if(lp){F=pageFill(lp,list);const freeB=F.frs.length-F.map.size;
          inner=`<div class="pz-mep">${plBlocks(lp,F,s.key,side)}</div>${F.extra.length?`<div class="pz-extra"><span class="pz-l">À placer (${F.extra.length}) :</span>${F.extra.map(({a,i})=>athumbHtml(s.key,a,i)).join('')}${freeB?`<button class="pz-btn" data-act="fill-blocks" data-key="${s.key}" data-side="${side}" title="Pose ces photos dans les blocs vides de cette page, dans l'ordre">Remplir les ${Math.min(freeB,F.extra.length)} bloc${Math.min(freeB,F.extra.length)>1?'s':''} vide${Math.min(freeB,F.extra.length)>1?'s':''}</button>`:''}</div>`:''}`}
        else inner=list.map(({a,i},j)=>athumbHtml(s.key,a,i,j)).join('');
        return `<div class="pz ${view.active===s.key&&defaultSide(s.key)===side?'act':''}" data-drop="psr" data-key="${s.key}" data-side="${side}" data-act="activate-side" title="Page ${side==='l'?'gauche':'droite'} ${pg||''} : glissez des photos ici${lp?' ou directement dans un bloc':''}">
          <span class="pz-l">${side==='l'?'Gauche':'Droite'} · p. ${pg||'–'}${lp?` · ${F.map.size}/${plPhotos(lp)} bloc${plPhotos(lp)>1?'s':''}`:list.length?` · ${list.length} ph.`:''}${lp&&F.map.size?`<button class="pz-btn" data-act="empty-blocks" data-key="${s.key}" data-side="${side}" title="Sortir les photos des blocs (elles restent sur la page, à placer)" style="margin-left:4px">Vider</button>`:''}${PL&&pg&&!inCreation(b)?`<button class="pz-lay ${lp?'':'none'}" data-act="plpick" data-page="${pg}" title="Choisir la mise en page de la page ${pg} (une page seule ou la planche entière)">${lp?'MEP '+esc(lp.name):'Choisir la MEP'} <span class="cv">▼</span></button>`:''}</span>${pg&&ev[b.pages[pg]]?`<span class="pz-t">${esc(ev[b.pages[pg]].name)}</span>`:''}
          ${inner}${PL&&pg&&view.plpick===pg?plPicker(b,pg):''}</div>`}).join('')}</div>
    </section>`}).join('');
  const right=`<div class="panel pane">
    <div class="pane-bar compact"><div class="strip">
      <select class="f sm" id="ps-ev" data-act="ps-ev" aria-label="Filtrer par événement" style="max-width:200px"><option value="">Toutes les planches</option>${evOpts}</select>
      <span class="mono small muted">${m.placed} ph.</span><span style="flex:1"></span>
      ${PL?`<label class="small muted row" style="gap:4px;flex-wrap:nowrap" title="Hauteur des pages">Hauteur <input type="range" class="pzh-in" id="pzh" data-act="pzh" min="160" max="700" step="10" value="${view.pzh||320}"></label>`:''}
</div></div>
    <div class="pane-scroll" id="ps-scroll" style="--pzh:${view.pzh||320}px">${rows}</div></div>`;
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
  let G=null;for(let g=key;;g+=2){if(g>Math.max(b.pageCount,...Object.keys(b.pages).map(Number))+1){G=g;break}if(!busyAt(g)&&!busyAt(g+1)&&!b.spreads[g]&&!b.pageLay[g]&&!b.pageLay[g+1]&&!(b.assign[g]||[]).length){G=g;break}}
  if(G===key){toast('Cette planche est déjà vide.');return}
  const np={};for(const [p,e] of Object.entries(b.pages)){const n=+p;np[n>=key&&n<G?n+2:n]=e}b.pages=np;
  for(const mp of SPREAD_MAPS){if(!b[mp])continue;const nm={};for(const [k,v] of Object.entries(b[mp])){const n=+k;nm[n>0&&n>=key&&n<G?n+2:n]=v}b[mp]=nm}
  remapPages(b,n=>n>=key&&n<G?n+2:n);
  const max=Math.max(0,...Object.keys(b.pages).map(Number));let grew='';if(max>b.pageCount){b.pageCount=Math.ceil(max/4)*4;grew=` · le livre passe à ${b.pageCount} pages`}
  save(b);toastUndo(`Planche vide insérée en planche ${plancheNo(key)}${grew}`);
}

// Removes a planche: its two pages disappear, everything after moves back one planche (sides kept), the book keeps its page count
function deletePlanche(b,key){
  key=+key;if(key<2)return;remember(b);const gone=new Set([key,key+1]);const sh=n=>n>=key+2?n-2:n;
  const lost=new Set(Object.entries(b.pages).filter(([p])=>gone.has(+p)).map(([,e])=>e));
  const np={};for(const [p,e] of Object.entries(b.pages)){const n=+p;if(!gone.has(n))np[sh(n)]=e}b.pages=np;
  for(const mp of SPREAD_MAPS){if(!b[mp])continue;const nm={};for(const [k,v] of Object.entries(b[mp])){const n=+k;if(n===key)continue;nm[n>key?n-2:n]=v}b[mp]=nm}
  for(const p of gone){delete b.pageLay[p];for(const k of Object.keys(b.texts))if(+k.slice(0,k.indexOf('|'))===p)delete b.texts[k]}
  remapPages(b,sh);
  const still=new Set(Object.values(b.pages));const orphan=[...lost].filter(e=>!still.has(e)).length;
  view.sel.clear();view.edit=null;save(b);
  toastUndo(`Planche ${plancheNo(key)} supprimée · la suite recule d'une planche${orphan?` · ${orphan} événement${orphan>1?'s':''} dans « Sans page »`:''}`);
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
      <td class="mono small" title="Photos placées dans Visuel">${c&&c.placed?c.placed+' ph.':''}</td>
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

/* ================= page layouts: each page of a MEP file exported from InDesign ================= */
const usesPL=b=>b.pl.length>0||!b.layouts.length;
function plById(b){const m={};b.pl.forEach(l=>m[l.id]=l);return m}
function plUsage(b){const u={};for(let p=1;p<=b.pageCount;p++){const id=b.pageLay[p];if(id)(u[id]=u[id]||[]).push(p)}return u}
const phFrames=l=>l&&l.frames?l.frames.filter(f=>f.k==='ph').sort((a,z)=>a.o-z.o):[];
const plPhotos=l=>phFrames(l).length;
const plTexts=l=>l&&l.stories?Object.keys(l.stories).length:0;
const pageSideOf=p=>p===1||p%2===1?'r':'l';
const pct=v=>(+v*100).toFixed(3)+'%';
const cq=(pt,W)=>`${(pt/W*100).toFixed(4)}cqw`;
function frStyle(f){let s=`left:${pct(f.x)};top:${pct(f.y)};width:${pct(f.w)};height:${pct(f.h)};z-index:${f.z||1};`;
  if(f.sh==='poly'&&f.pts&&f.pts.length>2)s+=`clip-path:polygon(${f.pts.map(([x,y])=>pct(x)+' '+pct(y)).join(',')});`;return s}
function labRgb(L,a,bb){let y=(L+16)/116,x=a/500+y,z=y-bb/200;const f=t=>t**3>0.008856?t**3:(t-16/116)/7.787;x=0.95047*f(x);y=f(y);z=1.08883*f(z);
  const r=x*3.2406-y*1.5372-z*0.4986,g=-x*0.9689+y*1.8758+z*0.0415,b_=x*0.0557-y*0.2040+z*1.0570;const c=v=>255*Math.max(0,Math.min(1,v>0.0031308?1.055*v**(1/2.4)-0.055:12.92*v));return [c(r),c(g),c(b_)]}
function cssColor(c){if(!c||!c.v)return '';let rgb;const v=c.v;
  if(c.s==='r')rgb=v.slice(0,3);else if(c.s==='l')rgb=labRgb(v[0],v[1],v[2]);else{const [C,M,Y,K]=v.map(x=>(x||0)/100);rgb=[255*(1-C)*(1-K),255*(1-M)*(1-K),255*(1-Y)*(1-K)]}
  const t=(c.t==null||c.t<0?100:c.t)/100;return `rgb(${rgb.map(x=>Math.round(255-(255-x)*t)).join(',')})`}
// Création: the page preview already shows this block as InDesign has it (same image, with its crop, stroke, effects)
// (a copy converted by the panel, « nom_converted.jpg », counts as the same photo)
const pvName=n=>String(n||'').toLowerCase().replace(/\.[^.\/]+$/,'').replace(/(_converted| \(moodbook\))$/,'');
const pvKeeps=(l,f,e)=>!!(l&&l.cr&&l.pf&&e&&(f.id in l.pf)&&l.pf[f.id]&&pvName(baseName(String(e.a.p||'').replace(/^abs:/,'')))===pvName(l.pf[f.id]));
// Small preview of a page layout (image exported by InDesign), with the blocks outlined if asked
function plThumb(l,lines){if(!l)return '';const src=imgSrc(l.img);
  return `<div class="plv" style="aspect-ratio:${l.w}/${l.h}">${src?`<img class="plv-bg" src="${esc(src)}" alt="" loading="lazy">`:''}${lines?l.frames.map(f=>f.k==='ph'?`<div class="fr lin ph" style="${frStyle(f)}">${f.o+1}</div>`:`<div class="fr lin tx" style="${frStyle(f)}">${f.cols>1?f.cols+' col.':'T'}</div>`).join(''):''}</div>`}
// Which photo is in which block: only the photos put in a block (by hand or with the page button); the others wait « à placer »
function pageFill(l,entries){
  const frs=phFrames(l),map=new Map(),used=new Set();
  for(const e of entries)if(e.a.f&&!map.has(e.a.f)&&frs.some(f=>f.id===e.a.f)){map.set(e.a.f,e);used.add(e)}
  const extra=entries.filter(e=>!used.has(e)); // photos not yet in a block: placed by hand, or with « Remplir les blocs vides »
  return {frs,map,extra};
}
const sideEntries=(b,key,side)=>(b.assign[key]||[]).map((a,i)=>({a,i})).filter(x=>photoSide(key,x.a)===side);
const pageOfSide=(key,side)=>+key===0?1:(side==='l'?+key:+key+1);
function athumbHtml(key,a,i,j){const it=lib.byPath.get(a.p);return `<div class="athumb ${it?'':'missing'}" draggable="true" data-drag="assigned" data-key="${key}" data-idx="${i}" ${it?`data-tid="${it.id}"`:''} title="${esc(a.p)}">${it&&it.thumb?thumbImg(it):`<span class="nm">${esc(baseName(a.p))}</span>`}${j!=null?`<span class="ord">${j+1}</span>`:''}<button class="x" data-act="unassign" data-key="${key}" data-idx="${i}" aria-label="Retirer">×</button></div>`}
function plBlocks(l,F,key,side){
  const src=imgSrc(l.img);const cb=cur();const crr=l.cr&&cb?crOf(cb):null;
  return `<div class="plv" style="aspect-ratio:${l.w}/${l.h};--hw:${(l.h/l.w).toFixed(4)}">${src?`<img class="plv-bg" src="${esc(src)}" alt="">`:''}${F.frs.map((f,j)=>{const e=F.map.get(f.id);const it=e&&lib.byPath.get(e.a.p);
    const lk=crr&&lockedByOther(crr.rows.get(f.id));
    if(lk)return `<div class="fr ph locked ${f.sh==='ov'?'ov':''}" style="${frStyle(f)}" title="En cours de modification par ${esc(lockWho(crr.rows.get(f.id)))}">${e&&it&&(it.big||it.thumb)?blockImg(it):''}<span class="lk">${I_LOCK}</span></div>`;
    if(crr&&e&&(!it||pvKeeps(l,f,e)))return `<div class="fr ph cr-keep" data-drop="blk" data-key="${key}" data-side="${side}" data-f="${esc(f.id)}" style="${frStyle(f)}" title="${esc(baseName(e.a.p))} (photo placée dans InDesign) · déposez une photo pour la remplacer"></div>`;
    return `<div class="fr ph ${f.sh==='ov'?'ov':''} ${e?'full':''} ${crr&&!e?'cr-empty':''}" data-drop="blk" data-key="${key}" data-side="${side}" data-f="${esc(f.id)}" style="${frStyle(f)}" ${e?`draggable="true" data-drag="assigned" data-key="${key}" data-idx="${e.i}" ${it?`data-tid="${it.id}"`:''} title="${esc(e.a.p)} · glisser dans un autre bloc pour échanger"`:`title="Bloc ${j+1} : déposez une photo"`}>${e?(it&&(it.big||it.thumb)?blockImg(it):`<span class="nm">${esc(baseName(e.a.p))}</span>`)+`<button class="x" data-act="unassign" data-key="${key}" data-idx="${e.i}" aria-label="Retirer">×</button>`:j+1}</div>`}).join('')}</div>`;
}
function plPicker(b,page){
  const u=plUsage(b);const cur_=b.pageLay[page];const side=pageSideOf(page);const key=spreadKeyOf(page);const srcs=[...new Set(b.pl.map(l=>l.src))];
  const half=l=>{if(!l)return '<span class="pp-h none"></span>';const n=(u[l.id]||[]).length;const full=n>=b.maxReuse&&l.id!==cur_;const near=l.id===cur_?[]:nearUses(b,l.id,page);
    return `<button class="pp-h ${l.id===cur_?'on':''} ${l.side===side?'same':''} ${near.length?'near':''}" data-act="pl-set" data-page="${page}" data-pl="${esc(l.id)}" ${full?`disabled title="Déjà utilisée ${n} fois"`:`title="${esc(l.name)} · ${plPhotos(l)} photo(s) · ${n}/${b.maxReuse}${near.length?` · ⚠ déjà utilisée en Pl. ${near.join(', ')}, moins de 2 planches d'écart`:''} · poser sur la page ${page}"`}>${plThumb(l)}<span class="mono">${near.length?`<b class="nearw">⚠ Pl. ${near.join(',')}</b> `:''}${n}/${b.maxReuse}</span></button>`};
  return `<div class="plpick panel" role="dialog" aria-label="Mise en page de la page ${page}"><div class="small"><b>Page ${page}</b> <span class="muted">(${side==='l'?'gauche':'droite'}) · cliquez une page pour la poser seule, ou prenez la planche entière</span></div>
    <div class="plpick-grid pp-grid">${srcs.map(src=>(srcs.length>1?`<h5>${esc(src)}</h5>`:'')+plPairs(b,src).map((g,i)=>`<div class="pp"><div class="pp-sp">${half(g.l)}${half(g.r)}</div><button class="pp-all" data-act="pl-pair-set" data-key="${key}" data-k="${esc(g.k)}" title="Poser la gauche et la droite de cette planche sur la planche ${plancheNo(key)}">Planche ${i+1} entière</button></div>`).join('')).join('')||'<p class="small muted">Aucune mise en page : importez un export MEP dans l\'onglet Mises en page.</p>'}</div>
    ${cur_?`<button class="btn ghost sm" data-act="pl-set" data-page="${page}" data-pl="">Retirer la mise en page de la page ${page}</button>`:''}</div>`;
}
// Original planches of the MEP files: left and right pages exported side by side
function plPairs(b,src,withGone){
  const m=new Map();
  for(const l of b.pl.filter(l=>(withGone||!l.gone)&&(!src||l.src===src)).sort((a,z)=>natural(a.src,z.src)||a.order-z.order)){
    const k=l.src+'#'+(l.sp!=null?l.sp:'o'+l.order);if(!m.has(k))m.set(k,{k,src:l.src,l:null,r:null});const g=m.get(k);
    if(l.side==='l'&&!g.l)g.l=l;else if(!g.r)g.r=l;else if(!g.l)g.l=l}
  return [...m.values()]}
// Planches (2 before or after, same planche included) where a layout is already used near a page
function nearUses(b,lid,page){const P=plancheNo(spreadKeyOf(page));return [...new Set((plUsage(b)[lid]||[]).filter(p=>p!==page&&Math.abs(plancheNo(spreadKeyOf(p))-P)<=2).map(p=>plancheNo(spreadKeyOf(p))))].sort((a,z)=>a-z)}
function nearWarn(b,jobs){ // jobs: [[page, layout]] just set
  const msgs=[];for(const [p,l] of jobs){if(!p||!l)continue;const near=nearUses(b,l.id,p).filter(n=>!jobs.some(([q,m])=>m&&m.id===l.id&&q!==p&&plancheNo(spreadKeyOf(q))===n&&n===plancheNo(spreadKeyOf(p))));if(near.length)msgs.push(`« ${l.name} » déjà utilisée en Pl. ${near.join(', ')}`)}
  if(msgs.length)toastUndo(`Attention : ${msgs.join(' · ')} (moins de 2 planches d'écart)`);}
function setPair(b,key,g){
  const u=plUsage(b);const s=spreadsOf(b.pageCount).find(x=>x.key===+key);if(!s||!g)return;
  const jobs=+key===0?[[s.r,g.r||g.l]]:[[s.l,g.l],[s.r,g.r]];
  for(const [p,l] of jobs){if(!p||!l)continue;const n=(u[l.id]||[]).filter(x=>x!==p).length;if(n>=b.maxReuse){toast(`Limite atteinte : « ${l.name} » est déjà utilisée ${n} fois.`);return}}
  remember(b);for(const [p,l] of jobs){if(!p)continue;if(l)b.pageLay[p]=l.id;else delete b.pageLay[p]}
  save(b);nearWarn(b,jobs);
}
function autoAssignPL(b){
  const u=plUsage(b),max=b.maxReuse;const cnt={};b.pl.forEach(l=>cnt[l.id]=(u[l.id]||[]).length);
  const pairs=plPairs(b).filter(g=>![g.l,g.r].some(x=>x&&x.locked));const ok=x=>x&&cnt[x.id]<max;let n=0,prev=null;
  for(const s of spreadsOf(b.pageCount)){if(b.pins[s.key])continue;
    const pages=[s.l,s.r].filter(p=>p&&p<=b.pageCount);const free=pages.filter(p=>!b.pageLay[p]);if(!free.length){prev=null;continue}
    if(free.length===2){ // keep the planche of the MEP file together
      let c=pairs.filter(g=>ok(g.l)&&ok(g.r)&&g.k!==prev);if(!c.length)c=pairs.filter(g=>ok(g.l)&&ok(g.r));
      if(c.length){c.sort((a,z)=>(cnt[a.l.id]+cnt[a.r.id])-(cnt[z.l.id]+cnt[z.r.id])||Math.random()-.5);const g=c[0];
        b.pageLay[s.l]=g.l.id;b.pageLay[s.r]=g.r.id;cnt[g.l.id]++;cnt[g.r.id]++;n+=2;prev=g.k;continue}}
    for(const p of free){const side=pageSideOf(p);const c=b.pl.filter(l=>!l.locked&&!l.gone&&cnt[l.id]<max);if(!c.length)continue;
      c.sort((a,z)=>((a.side===side?0:1)-(z.side===side?0:1))||cnt[a.id]-cnt[z.id]||Math.random()-.5);b.pageLay[p]=c[0].id;cnt[c[0].id]++;n++}
    prev=null}
  return n;
}
const MEP_SCRIPT_NAME='Export MEP - moodbook.jsx';
function renderPageLayouts(b,m,ev){
  const max=b.maxReuse,u=plUsage(b);const needed=b.pageCount?Math.ceil(b.pageCount/max):0;
  let free=0;for(let p=1;p<=b.pageCount;p++)if(!b.pageLay[p])free++;
  const live=b.pl.filter(l=>!l.gone);const over=b.pl.filter(l=>(u[l.id]||[]).length>max);
  const calc=`<div class="panel calc">
      <span class="big"><span class="mono">${b.pageCount}</span> pages → <em>${needed} mises en page minimum</em></span>
      <label class="small muted row" style="gap:6px">Réutilisation max d'une mise en page <input class="f mono" style="width:60px;padding:3px 6px" type="number" min="1" id="bk-max" data-act="maxreuse" value="${b.maxReuse}"></label>
      <span class="small muted">Importées : <b class="mono">${live.length}</b>${live.length&&live.length<needed?` (il en manque <b class="mono" style="color:var(--bad)">${needed-live.length}</b>)`:''} · ${free} page${free>1?'s':''} sans mise en page${over.length?` · <span class="pill bad">${over.map(l=>esc(l.name)).join(', ')} &gt; ${max}×</span>`:''}</span></div>`;
  const actions=`<div class="lay-actions">
      <button class="btn primary" data-act="mep-pick">${I_FOLDER} Importer un export MEP</button>
      <button class="btn" data-act="mep-script" title="Script InDesign qui exporte les blocs et les aperçus d'un fichier MEP">Script d'export InDesign</button>
      <button class="btn" data-act="auto" ${!live.length||!free?'disabled':''}>Remplir les ${free} pages libres</button>
      <button class="btn ${view.armed==='redistribute'?'armed':''}" data-act="redistribute" ${live.length?'':'disabled'}>${view.armed==='redistribute'?'Confirmer : tout redistribuer':'Tout redistribuer'}</button>
      <label class="check"><input type="checkbox" id="pl-lines" data-act="pl-lines" ${view.plLines?'checked':''}> Afficher les blocs</label>
      <span class="small muted" style="flex-basis:100%">Les planches du fichier MEP sont gardées telles quelles : la répartition pose la gauche et la droite ensemble. Vous pouvez ensuite changer une page seule dans le plan (chaque page reste limitée à ${max} utilisations). La répartition ignore les mises en page verrouillées ${I_LOCK} et les planches verrouillées.</span></div>`;
  const srcs=[...new Set(b.pl.map(l=>l.src))];
  const col=l=>{const used=u[l.id]||[];const n=used.length;const tx=l.frames.filter(f=>f.k==='tx');const cols=Math.max(1,...tx.map(f=>f.cols||1));const chained=Object.values(l.stories||{}).some(s=>s.n>1);
    return `<div class="plc-col ${n>max?'over':''} ${l.locked?'locked':''} ${l.gone?'gone':''}">
        <input class="f" id="pln-${esc(l.id)}" data-act="pl-name" data-pl="${esc(l.id)}" value="${esc(l.name)}" aria-label="Nom de la mise en page">
        <div class="plc-info"><span>${plPhotos(l)} ph.</span><span>${tx.length} texte${tx.length>1?'s':''}</span>${cols>1?`<span>${cols} col.</span>`:''}${chained?'<span>chaîné</span>':''}${l.gone?'<span class="bad">absente du dernier export</span>':''}</div>
        <div class="lay-line"><div class="usage" style="flex:1"><b style="color:${n>max?'var(--bad)':'inherit'}">${n}/${max}</b><div class="bar ${n>max?'bad':n===max?'ok':''}"><i style="width:${Math.min(100,n/max*100)}%"></i></div></div>
          <button class="icon-btn ${l.locked?'on':''}" data-act="pl-lock" data-pl="${esc(l.id)}" aria-pressed="${!!l.locked}" title="${l.locked?'Verrouillée : jamais attribuée automatiquement':'Verrouiller (sommaire, page de garde, 4e de couverture, sur mesure…)'}">${l.locked?I_LOCK:I_UNLOCK}</button>
          <button class="icon-btn ${view.armed==='pl:'+l.id?'armed':''}" data-act="pl-del" data-pl="${esc(l.id)}" title="${view.armed==='pl:'+l.id?'Cliquer à nouveau pour supprimer':'Supprimer cette page'}" aria-label="Supprimer">${I_TRASH}</button></div>
        ${used.length?`<div class="uses">${used.map(p=>{const e=ev[b.pages[p]];return `<button data-act="goto-page" data-page="${p}" title="${e?esc(e.name):'Sans événement'}">p. ${p}</button>`}).join('')}</div>`:''}</div>`};
  const pcard=(g,i)=>{const ls=[g.l,g.r];const any=ls.filter(Boolean);
    return `<article class="panel plc ${any.some(l=>(u[l.id]||[]).length>max)?'over':''} ${any.every(l=>l.gone)?'gone':''}">
      <div class="plc-head" draggable="true" data-drag="plpair" data-k="${esc(g.k)}" title="Glisser la planche entière sur une planche du plan"><span class="grip">⋮⋮</span>Planche ${i+1}<span class="muted small">${g.l&&g.r?'gauche + droite':g.r?'page seule':'page gauche seule'}</span></div>
      <div class="plc-sp">${ls.map((l,k)=>`<div class="plc-h ${l?'':'none'}" ${l?`draggable="true" data-drag="playout" data-pl="${esc(l.id)}" title="Glisser cette page seule sur une page du plan"`:''}>${l?plThumb(l,view.plLines):''}</div>`).join('')}</div>
      <div class="plc-cols">${ls.map(l=>l?col(l):'<div></div>').join('')}</div></article>`};
  const groups=srcs.map(src=>{const ls=b.pl.filter(l=>l.src===src);const pairs=plPairs(b,src,true);const info=(b.mepSrc||{})[src];
    return `<section class="mepgrp"><div class="mepgrp-h"><h3>${esc(src)}</h3><button class="icon-btn" data-act="mep-settings" title="Réglages et import des mises en page" aria-label="Réglages des mises en page">${I_GEAR}</button><span class="small muted">${pairs.length} planche${pairs.length>1?'s':''} · ${ls.length} page${ls.length>1?'s':''}${info&&info.at?' · importé le '+esc(fmtVer(info.at)):''}</span><span style="flex:1"></span><button class="btn ghost sm danger ${view.armed==='src:'+src?'armed':''}" data-act="mep-src-del" data-src="${esc(src)}">${view.armed==='src:'+src?'Confirmer : retirer ce fichier':'Retirer ce fichier'}</button></div>
      <div class="plcs">${pairs.map(pcard).join('')}</div></section>`}).join('');
  const drop=`<div class="mepdrop" data-drop="mepdir">Glissez ici le dossier « … - export MEP » créé par le script InDesign. Un nouvel export du même fichier met à jour ses mises en page sans toucher aux pages où elles sont posées.</div>`;
  const empty=`<div class="panel emptystate" data-drop="mepdir"><h2>Importer les mises en page du fichier MEP</h2>
      <ol class="steps"><li><span>Téléchargez le <b>script d'export</b> et copiez-le dans InDesign (Fenêtre &gt; Utilitaires &gt; Scripts, clic droit sur « Utilisateur » &gt; Faire apparaître dans le Finder).</span></li>
      <li><span>Ouvrez votre fichier MEP et double-cliquez sur le script : cochez l'image témoin de vos blocs photo. Il crée un dossier « … - export MEP » à côté du fichier.</span></li>
      <li><span>Glissez ce dossier ici (ou « Importer un export MEP »). Chaque page devient une mise en page de ce livre uniquement.</span></li></ol>
      <div class="row" style="justify-content:center"><button class="btn" data-act="mep-script">Télécharger le script d'export</button><button class="btn primary" data-act="mep-pick">${I_FOLDER} Importer un export MEP</button></div></div>`;
  const legacy=b.layouts.length?`<details class="legacy" ${b.pl.length?'':'open'}><summary>Anciennes mises en page (captures) · ${b.layouts.length}<button class="btn ghost sm danger ${view.armed==='legacy'?'armed':''}" data-act="legacy-del" title="Supprimer toutes les anciennes mises en page de ce livre">${view.armed==='legacy'?'Confirmer : tout supprimer':I_TRASH}</button></summary>${renderLayouts(b,m,ev)}</details>`:'';
  view._mepSet=`<div class="row" style="justify-content:space-between"><h3>Réglages des mises en page</h3><button class="btn ghost sm" data-act="close-overlay">Fermer</button></div>`+calc+actions+drop;
  return b.pl.length?groups+legacy:calc+actions+empty+legacy;
}
// Reads the folder exported by the InDesign script into the current book only
function shortName(src){return src}
async function importMep(b,files,force){
  const list=[...files];const jf=list.find(f=>f.name==='mep.json');
  if(!jf){toast("Pas de mep.json dans ce dossier : choisissez le dossier « … - export MEP » créé par le script InDesign.");return}
  let d;try{d=JSON.parse((await jf.text()).replace(/^\uFEFF/,''))}catch(e){toast('mep.json illisible.');return}
  if(d.app!=='cdf-mep'||!Array.isArray(d.pages)){toast("Ce mep.json ne vient pas du script d'export MEP.");return}
  // The design file linked to this project (from the InDesign panel) must be the one the folder comes from
  if(!force&&PJ.ok===true){const mreg=pjDoc(b,'mep');const elsewhere=d.uid?[...PJ.docs.values()].find(r=>r.doc_uid===d.uid&&!(r.book_id===b.id&&r.owner===ownerOf(b)&&r.role==='mep')):null;let why='';
    if(elsewhere){const ob=books.get(elsewhere.book_id);why=`Ce dossier vient de « ${d.doc} », qui est relié au projet « ${ob?ob.title:elsewhere.book_id} » comme ${elsewhere.role==='mep'?'fichier de conception':'fichier livre'}.`}
    else if(mreg&&((d.uid&&d.uid!==mreg.doc_uid)||(!d.uid&&d.doc!==mreg.name)))why=`Le fichier de conception relié à « ${b.title} » est « ${mreg.name} », mais ce dossier vient de « ${d.doc} ».`;
    if(why){view.mepPending={book:b.id,files:list};showModal(`<h3>Ce n'est pas le fichier de conception de ce projet</h3><p class="small muted" style="margin:0">${esc(why)} Vérifiez que vous déposez le bon dossier.</p><div class="row"><button class="btn" data-act="close-overlay">Annuler</button><button class="btn ghost" data-act="mep-force">Importer quand même dans « ${esc(b.title)} »</button></div>`);return}}
  const others=[...books.values()].filter(x=>x.id!==b.id&&(x.pl||[]).some(l=>l.src===d.doc));
  if(others.length&&!force){view.mepPending={book:b.id,files:list};
    showModal(`<h3>« ${esc(d.doc)} » est déjà importé ailleurs</h3><p class="small muted" style="margin:0">Ce fichier MEP est déjà utilisé par ${others.map(o=>`« ${esc(o.title)} »`).join(', ')}. C'est normal si ce livre a été dupliqué d'un ancien livre ; sinon vous vous êtes peut-être trompé de livre. Les mises en page importées ici restent propres à « ${esc(b.title)} ».</p><div class="row"><button class="btn primary" data-act="mep-force">Importer dans « ${esc(b.title)} »</button><button class="btn" data-act="close-overlay">Annuler</button></div>`);return}
  const byName=new Map(list.map(f=>[f.name,f]));const src=d.doc;const existing=b.pl.filter(l=>l.src===src);const seen=new Set();let upd=0,add=0;
  // Original planche of each page. Older exports have no planche number and may have all pages on the same side:
  // then a book layout is assumed (page 1 alone, then 2–3, 4–5…) and sides follow from it
  const sidesOk=d.pages.some(x=>x.side==='l')&&d.pages.some(x=>x.side==='r');
  if(!sidesOk||d.pages.every(x=>x.sp==null))d.pages.forEach(pg=>{if(pg.sp==null){if(!sidesOk)pg.side=pg.off%2===1?'l':'r';pg.sp='o'+(pg.off%2===1?pg.off:pg.off-1)}});
  const spOf=d.pages.map(pg=>String(pg.sp));
  for(const [i,pg] of d.pages.entries()){
    let l=existing.find(x=>x.pid===pg.pid);if(!l){l={id:uid('pl'),src,pid:pg.pid,name:'p. '+pg.name,locked:false};b.pl.push(l);add++}else upd++;
    seen.add(l.id);
    const stories={};for(const f of pg.frames)if(f.k==='tx'&&d.stories&&d.stories[f.st])stories[f.st]=d.stories[f.st];
    const tol=3/(pg.h||600);const ord=arr=>arr.sort((a,z)=>Math.abs(a.y-z.y)>tol?a.y-z.y:a.x-z.x).forEach((f,j)=>f.o=j);
    ord(pg.frames.filter(f=>f.k==='ph'));ord(pg.frames.filter(f=>f.k==='tx'));
    Object.assign(l,{sp:spOf[i],pname:pg.name,side:pg.side,w:pg.w,h:pg.h,frames:pg.frames,stories,ph:d.ph||[],gone:false,order:i});
    for(const [k,fn,mx] of [['img',pg.img,640],['bg',pg.bg,1100]]){const f=byName.get(fn);if(!f)continue;
      try{const data=await shrink(f,mx,.74,false);const key=`pl~${b.id}~${l.id}~${k}`;await putCapture(key,data);l[k]='cap:'+key}catch(e){}}
    setSaved(`Import des mises en page… ${i+1}/${d.pages.length}`);
  }
  let gone=0;existing.forEach(l=>{if(!seen.has(l.id)){l.gone=true;gone++}});
  b.mepSrc=b.mepSrc||{};b.mepSrc[src]={at:Date.now(),n:d.pages.length};
  save(b);
  toast(`« ${src} » : ${add} nouvelle${add>1?'s':''} mise${add>1?'s':''} en page${upd?`, ${upd} mise${upd>1?'s':''} à jour`:''}${gone?`, ${gone} absente${gone>1?'s':''} du nouvel export`:''}`);
}
function dropEntries(dt){return [...(dt.items||[])].map(i=>i.webkitGetAsEntry&&i.webkitGetAsEntry()).filter(Boolean)}
async function entriesFiles(ents){const out=[];
  const walk=async(en,prefix)=>{if(en.isFile){const f=await new Promise((res,rej)=>en.file(res,rej));f._rel=prefix+en.name;out.push(f)}
    else if(en.isDirectory){const r=en.createReader();let batch;do{batch=await new Promise((res,rej)=>r.readEntries(res,rej));for(const c of batch)await walk(c,prefix+en.name+'/')}while(batch.length)}};
  for(const en of ents)await walk(en,'');return out}

/* ================= writing: texts poured into the text blocks of the layouts ================= */
// Stories (chained text blocks) of a planche; each is keyed by the page where it starts
function spreadStories(b,key){
  const plm=plById(b);const sides=+key===0?[['r',1]]:[['l',+key],['r',+key+1]];const ids=sides.map(([,p])=>p<=b.pageCount?b.pageLay[p]:null);
  const map=new Map();
  sides.forEach(([side,p],k)=>{if(p>b.pageCount)return;const l=plm[ids[k]];if(!l)return;
    for(const f of l.frames)if(f.k==='tx'){const mk=l.src+'#'+f.st+(ids[0]&&ids[0]===ids[1]?'@'+p:'');if(!map.has(mk))map.set(mk,{sk:l.src+'#'+f.st,frames:[],story:l.stories&&l.stories[f.st]});map.get(mk).frames.push({f,l,page:p,side})}});
  const out=[...map.values()];for(const s of out){s.frames.sort((a,z)=>a.f.ci-z.f.ci);s.page=s.frames[0].page;s.tkey=s.page+'|'+s.sk}
  return out.sort((a,z)=>a.page-z.page||a.frames[0].f.o-z.frames[0].f.o);
}
function pageStories(b,p){return spreadStories(b,spreadKeyOf(p)).filter(s=>s.page===p)}
const plainOf=p=>(p.runs||[]).map(r=>r.t).join('');
const hasText=rec=>!!(rec&&rec.paras&&rec.paras.some(p=>plainOf(p).trim()));
function textState(rec){if(!hasText(rec)||!rec.st)return '';if(rec.st==='checking')return 'draft';if(rec.st!=='done')return 'draft';return rec.q&&rec.q.length?'q':'done'}
function allStories(b){const out=[];for(const s of spreadsOf(b.pageCount))out.push(...spreadStories(b,s.key));return out}
function storyContent(b,s){const rec=b.texts[s.tkey];if(hasText(rec))return {paras:rec.paras,user:true};return {paras:((s.story&&s.story.paras)||[]).map(p=>({runs:[{t:p.t||''}]})),user:false}}
function weightOf(fs){fs=String(fs||'');return /black|heavy|ultra/i.test(fs)?800:/extra ?bold/i.test(fs)?800:/semi|demi/i.test(fs)?600:/bold|gras/i.test(fs)?700:/medium/i.test(fs)?500:/light/i.test(fs)?300:/thin|hair/i.test(fs)?200:400}
const ALIGN={l:'left',c:'center',r:'right',j:'justify',jc:'justify',jr:'justify',jf:'justify',b:'left',a:'right'};
const LAST={j:'left',jc:'center',jr:'right',jf:'justify'};
function paraCss(st,al,W){st=st||{sz:10,ld:12,al:'l'};const a=st.al||'l';
  let s=`font-family:'${String(st.ff||'').replace(/["'\\<>]/g,'')}',var(--f-body);font-weight:${weightOf(st.fs)};${/italic|oblique/i.test(st.fs||'')?'font-style:italic;':''}font-size:${cq(st.sz||10,W)};line-height:${cq(st.ld||(st.sz||10)*1.2,W)};`;
  s+=al?`text-align:${al==='r'?'right':'left'};`:`text-align:${ALIGN[a]||'left'};${LAST[a]?`text-align-last:${LAST[a]};`:''}`;
  const col=cssColor(st.col);if(col)s+=`color:${col};`;
  if(st.caps==='all')s+='text-transform:uppercase;';else if(st.caps==='small')s+='font-variant-caps:small-caps;';
  if(st.tr)s+=`letter-spacing:${(st.tr/1000).toFixed(3)}em;`;
  if(st.sb)s+=`margin-top:${cq(st.sb,W)};`;if(st.sa)s+=`margin-bottom:${cq(st.sa,W)};`;
  if(st.fi)s+=`text-indent:${cq(st.fi,W)};`;if(st.li)s+=`padding-left:${cq(st.li,W)};`;if(st.ri)s+=`padding-right:${cq(st.ri,W)};`;
  return s}
function tokensOf(para){const toks=[];for(const r of para.runs||[]){String(r.t||'').split('\n').forEach((pt,i)=>{if(i>0)toks.push({br:1,b:r.b,c:r.c});(pt.match(/\S+\s*|\s+/g)||[]).forEach(t=>toks.push({t,b:r.b,c:r.c}))})}if(!toks.length)toks.push({t:'\u200b'});return toks}
function sliceHtml(F,content,styles,W,s,e,tpl){
  let h='',i=s;
  while(i<e){const pi=F.flat[i][0],t0=F.flat[i][1];let j=i;while(j<e&&F.flat[j][0]===pi)j++;const t1=F.flat[j-1][1]+1;
    const st=styles[Math.min(pi,styles.length-1)]||null;const para=content.paras[pi];const toks=F.P[pi].slice(t0,t1);let inner='',k=0;
    while(k<toks.length){const a=toks[k];let run='',m=k;while(m<toks.length&&!!toks[m].b===!!a.b&&!!toks[m].c===!!a.c){run+=toks[m].br?'<br>':esc(toks[m].t);m++}
      inner+=(a.b||a.c)?`<span style="${a.b?'font-weight:700;':''}${a.c?'text-transform:uppercase;':''}">${run}</span>`:run;k=m}
    h+=`<p class="${t0>0?'cont':''}${tpl?' tpl':''}" style="${paraCss(st,para.al,W)}">${inner}</p>`;i=j}
  return h}
// Pours a story into its blocks in order (columns included), like InDesign: what does not fit goes to the next block, the rest is overset
function flowStory(s,content,els){
  const styles=(s.story&&s.story.paras)||[];const W=s.frames[0].l.w||450;
  const P=content.paras.map(tokensOf);const flat=[];P.forEach((ts,pi)=>ts.forEach((_,ti)=>flat.push([pi,ti])));const F={P,flat};const total=flat.length;let start=0;
  els.forEach(el=>el.querySelector('.badge-ovs')?.remove());
  for(const el of els){const box=el.querySelector('.tfc');if(!box)continue;
    if(start>=total){box.innerHTML='';continue}
    const fits=e=>{box.innerHTML=sliceHtml(F,content,styles,W,start,e,!content.user);return box.scrollHeight<=box.clientHeight+1&&box.scrollWidth<=box.clientWidth+1};
    if(fits(total)){start=total;continue}
    let lo=start,hi=total;while(hi-lo>1){const mid=(lo+hi)>>1;if(fits(mid))lo=mid;else hi=mid}
    box.innerHTML=sliceHtml(F,content,styles,W,start,lo,!content.user);start=lo}
  const ovs=start<total;if(ovs&&els.length)els[els.length-1].insertAdjacentHTML('beforeend','<span class="badge-ovs" title="Texte en excès : il ne tient pas dans le bloc">+</span>');
  return ovs}
// Fingerprint of a text (letters and digits only): the same function in the InDesign panel marks the texts of each page preview
function thash(str){const t=String(str||'').normalize('NFC').replace(/[^\p{L}\p{N}]+/gu,'');let h=5381;for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return (h>>>0).toString(36)}
function storyFresh(b,s){const h=thash(storyContent(b,s).paras.map(plainOf).join('\n'));return s.frames.every(x=>x.l&&x.l.th&&x.l.th[x.f.st]===h)}
function flowAll(only){
  const b=cur();if(!b||view.tab!=='redac')return;
  for(const s of spreadStories(b,view.rk)){if(only&&s.tkey!==only)continue;
    const els=[...document.querySelectorAll('.fr.tx[data-tk]')].filter(el=>el.dataset.tk===s.tkey).sort((a,z)=>a.dataset.ci-z.dataset.ci);
    if(els.length&&els[0].classList.contains('pv')){const fresh=storyFresh(b,s);els.forEach(e=>e.classList.toggle('ghost',fresh));if(fresh){els.forEach(e=>{const c=e.querySelector('.tfc');if(c)c.innerHTML='';e.querySelector('.badge-ovs')?.remove()});view.ovs=view.ovs||{};view.ovs[s.tkey]=false;continue}}
    if(els.length){const o=flowStory(s,storyContent(b,s),els);view.ovs=view.ovs||{};view.ovs[s.tkey]=o;const w=document.getElementById('ovs-warn');if(w&&view.rsel===s.tkey)w.hidden=!o}}
}
function rPage(b,key,p,side,l,stories){
  if(!p)return `<div class="rpage blank ${side}"></div>`;
  if(!l)return `<div class="rpage nolay ${side}"><span>p. ${p}<br>Pas de mise en page<br><button class="btn sm" data-act="r-plpick" data-page="${p}" style="margin-top:8px">Choisir</button></span></div>`;
  const W=l.w;const F=pageFill(l,sideEntries(b,key,side));
  const ph=F.frs.map((f,j)=>{const e=F.map.get(f.id);const it=e&&lib.byPath.get(e.a.p);if(l.cr&&e&&(!it||pvKeeps(l,f,e)))return '';if(l.cr&&!e)return `<div class="fr ph cr-empty ${f.sh==='ov'?'ov':''}" style="${frStyle(f)}"></div>`;return `<div class="fr ph ${f.sh==='ov'?'ov':''} ${e?'full':''}" style="${frStyle(f)}" ${it?`data-tid="${it.id}"`:''}>${e?(it&&(it.big||it.thumb)?blockImg(it):`<span class="nm">${esc(baseName(e.a.p))}</span>`):j+1}</div>`}).join('');
  const tx=l.frames.filter(f=>f.k==='tx').map(f=>{const s=stories.find(x=>x.frames.some(y=>y.f===f&&y.page===p));if(!s)return '';const head=s.frames[0].f===f&&s.frames[0].page===p;
    const ins=f.ins||[0,0,0,0];const pad=`padding:${cq(ins[0],W)} ${cq(ins[3],W)} ${cq(ins[2],W)} ${cq(ins[1],W)};`;
    const cols=(f.cols||1)>1?`column-count:${f.cols};column-gap:${cq(f.gut||12,W)};`:'';const vj=(f.cols||1)===1&&f.vj&&f.vj!=='t'?{c:'safe center',b:'safe flex-end',j:'space-between'}[f.vj]:'';
    const bg=f.bg?`background:${cssColor(f.bg)};`:'';const sk=f.sk?`box-shadow:inset 0 0 0 ${cq(f.sk.w,W)} ${cssColor(f.sk.c)};`:'';
    const full=!!(l.cr&&l.th&&l.bg);const ghost=full&&storyFresh(b,s);
    const mask=full?`<div class="tmk"><img src="${esc(imgSrc(l.bg))}" alt="" style="left:${(-f.x/f.w*100).toFixed(3)}%;top:${(-f.y/f.h*100).toFixed(3)}%;width:${(100/f.w).toFixed(3)}%;height:${(100/f.h).toFixed(3)}%"></div>`:'';
    const n=(s.story&&s.story.n)||s.frames.length;const st=textState(b.texts[s.tkey]);
    const crr2=b&&inCreation(b)?crOf(b):null;const lr=crr2&&crr2.rows.get('s'+String(s.tkey).split('#')[1]);const lko=lockedByOther(lr);
    return `<div class="fr tx ${full?'pv':''} ${ghost?'ghost':''} ${view.rsel===s.tkey?'sel':''} ${lko?'locked':''}" ${lko?`data-lockby="${esc(lockWho(lr))}"`:''} data-act="rsel" data-tk="${esc(s.tkey)}" data-ci="${f.ci||0}" style="${frStyle(f)}${full?'':bg+sk}" title="Clic : rédiger ce texte">${mask}${full&&(bg||sk)?`<div class="tfb" style="${bg}${sk}"></div>`:''}<div class="tfi" style="${pad}"><div class="tfc ${vj?'vj':''}" style="${cols}${vj?`justify-content:${vj};`:''}"></div></div>${n>1?`<span class="chain" title="Texte chaîné">${(f.ci||0)+1}/${n}</span>`:''}${head&&st?`<span class="badge-st ${st}" title="${st==='done'?(b.texts[s.tkey]&&b.texts[s.tkey].at?'Terminé et relu':'Terminé'):st==='q'?'Relu : questions en attente':'En cours de rédaction'}">${st==='done'?'✓':st==='q'?'?':'✎'}</span>`:''}</div>`}).join('');
  const bgSrc=l.cr&&l.th&&l.bg?imgSrc(l.img):imgSrc(l.bg||l.img);
  return `<div class="rpage ${side}" lang="fr" style="aspect-ratio:${l.w}/${l.h}">${bgSrc?`<img class="plv-bg" src="${esc(bgSrc)}" alt="">`:''}${ph}${tx}</div>`;
}
const I_AL_L='<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M2 3h12M2 6.3h8M2 9.6h12M2 13h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const I_AL_R='<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M2 3h12M6 6.3h8M2 9.6h12M7 13h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
function edCss(st,al){st=st||{};const a=al||st.al||'l';return `font-family:'${String(st.ff||'').replace(/["'\\<>]/g,'')}',var(--f-body);font-weight:${weightOf(st.fs)};${/italic|oblique/i.test(st.fs||'')?'font-style:italic;':''}font-size:${Math.max(13,Math.min(26,(st.sz||10)*1.4)).toFixed(1)}px;text-align:${al?(al==='r'?'right':'left'):(ALIGN[a]||'left')};${st.caps==='all'?'text-transform:uppercase;':st.caps==='small'?'font-variant-caps:small-caps;':''}`}
function runsHtml(runs){return (runs||[]).map(r=>{let h=esc(r.t).replace(/\n/g,'<br>');if(r.c)h=`<span class="cap">${h}</span>`;if(r.b)h=`<b>${h}</b>`;return h}).join('')}
function edHtml(paras,styles){if(!paras.some(p=>plainOf(p)))return paras.length>1?paras.map((p,i)=>`<p data-i="${i}" ${p.al?`data-al="${p.al}"`:''} style="${edCss(styles[Math.min(i,styles.length-1)],p.al)}"><br></p>`).join(''):'';
  return paras.map((p,i)=>`<p data-i="${i}" ${p.al?`data-al="${p.al}"`:''} style="${edCss(styles[Math.min(i,styles.length-1)],p.al)}">${runsHtml(p.runs)||'<br>'}</p>`).join('')}
// Editor DOM → paragraphs of runs {t, b, c}; also turns DOM positions (marks) into {p, o} positions
function parseEd(root,marks){
  const paras=[];let cur_=null;const pos=(marks||[]).map(()=>null);
  const newPara=al=>{cur_={runs:[],len:0};if(al)cur_.al=al;paras.push(cur_)};
  const hit=(node,off)=>{(marks||[]).forEach((m,k)=>{if(pos[k]==null&&m.node===node&&m.off===off){if(!cur_)newPara();pos[k]={p:paras.length-1,o:cur_.len}}})};
  const push=(t,b,c)=>{if(!t)return;if(!cur_)newPara();const r=cur_.runs[cur_.runs.length-1];if(r&&!!r.b===!!b&&!!r.c===!!c)r.t+=t;else cur_.runs.push(Object.assign({t},b?{b:1}:{},c?{c:1}:{}));cur_.len+=t.length};
  const text=(n,b,c)=>{const v=n.nodeValue.replace(/\u00a0/g,' ').replace(/\u200b/g,'');(marks||[]).forEach((m,k)=>{if(pos[k]==null&&m.node===n){if(!cur_)newPara();pos[k]={p:paras.length-1,o:cur_.len+Math.min(m.off,v.length)}}});push(v,b,c)};
  const walk=(n,b,c)=>{const kids=[...n.childNodes];kids.forEach((ch,i)=>{hit(n,i);if(ch.nodeType===3)text(ch,b,c);else if(ch.nodeType===1){if(ch.tagName==='BR'){if(ch.nextSibling)push('\n',b,c)}else walk(ch,b||ch.tagName==='B'||ch.tagName==='STRONG',c||ch.classList.contains('cap'))}});hit(n,kids.length)};
  const kids=[...root.childNodes];
  kids.forEach((ch,i)=>{hit(root,i);if(ch.nodeType===1&&/^(P|DIV|H\d|LI|BLOCKQUOTE)$/.test(ch.tagName)){newPara(ch.dataset.al||'');hit(ch,0);walk(ch,false,false);cur_=null}
    else if(ch.nodeType===3){if(!cur_)newPara();text(ch,false,false)}else if(ch.nodeType===1&&ch.tagName==='BR'){cur_=null}else if(ch.nodeType===1){if(!cur_)newPara();walk(ch,ch.tagName==='B'||ch.tagName==='STRONG',ch.classList.contains('cap'))}});
  hit(root,kids.length);
  const out=paras.map(p=>{const o={runs:p.runs.filter(r=>r.t)};if(p.al)o.al=p.al;return o});
  return {paras:out.length?out:[{runs:[]}],pos};
}
function setEdSel(root,a,z){
  const find=({p,o})=>{const el=root.querySelector(`p[data-i="${p}"]`);if(!el)return [root,root.childNodes.length];let left=o;const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let n;
    while((n=tw.nextNode())){if(n.nodeType===3){if(left<=n.nodeValue.length)return [n,left];left-=n.nodeValue.length}else if(n.tagName==='BR'&&n.nextSibling){if(left===0)return [n.parentNode,[...n.parentNode.childNodes].indexOf(n)];left-=1}}return [el,el.childNodes.length]};
  try{const [sn,so]=find(a),[en,eo]=find(z);const r=document.createRange();r.setStart(sn,so);r.setEnd(en,eo);const s=getSelection();s.removeAllRanges();s.addRange(r)}catch(e){}
}
const charsOf=para=>{const out=[];for(const r of para.runs||[])for(const ch of String(r.t).split(''))out.push({t:ch,b:!!r.b,c:!!r.c});return out};
const runsOf=chars=>{const runs=[];for(const c of chars){const l=runs[runs.length-1];if(l&&l.b===c.b&&l.c===c.c)l.t+=c.t;else runs.push({t:c.t,b:c.b,c:c.c})}return runs.map(r=>Object.assign({t:r.t},r.b?{b:1}:{},r.c?{c:1}:{}))};
function toggleAttr(paras,a,z,attr){
  if(a.p===z.p&&a.o===z.o){const t=plainOf(paras[a.p]||{runs:[]});let s=a.o,e=a.o;while(s>0&&/\S/.test(t[s-1]))s--;while(e<t.length&&/\S/.test(t[e]))e++;a={p:a.p,o:s};z={p:a.p,o:e}}
  const sel=[];const ch={};for(let p=a.p;p<=z.p;p++){if(!paras[p])continue;ch[p]=charsOf(paras[p]);const s=p===a.p?a.o:0,e=p===z.p?z.o:ch[p].length;for(let i=s;i<e;i++)if(ch[p][i]&&ch[p][i].t!=='\n')sel.push([p,i])}
  if(!sel.length)return null;const all=sel.every(([p,i])=>ch[p][i][attr]);sel.forEach(([p,i])=>ch[p][i][attr]=!all);
  for(const p in ch)paras[p].runs=runsOf(ch[p]);return [a,z];
}
function replaceRange(para,s,e,txt){const ch=charsOf(para);const at=ch[s]||ch[s-1]||{b:false,c:false};ch.splice(s,e-s,...txt.split('').map(t=>({t,b:at.b,c:at.c})));para.runs=runsOf(ch)}
function applyFix(paras,fx){const p=paras[fx.p];if(!p||!fx.avant)return false;const i=plainOf(p).indexOf(fx.avant);if(i<0)return false;replaceRange(p,i,i+fx.avant.length,fx.apres??'');return true}
function redacPanel(b,s,stories){
  if(!s){const list=stories.map(x=>{const st=textState(b.texts[x.tkey]);const first=(plainOf(storyContent(b,x).paras[0]||{runs:[]})||'Bloc vide').slice(0,60);
      return `<button data-act="rsel" data-tk="${esc(x.tkey)}"><span class="dot-st ${st}"></span><span class="mono small">p. ${x.page}</span><span>${esc(first)}</span></button>`}).join('');
    return `<aside class="panel rpanel"><b>Rédaction</b><p class="small muted" style="margin:0">Cliquez sur un bloc texte de la planche pour l'écrire. Le texte prend la mise en forme de la maquette (polices, tailles, colonnes, chaînage) ; vous ne pouvez ajouter que les capitales, le ferré à gauche ou à droite et le gras.</p>${list?`<div class="rlist">${list}</div>`:'<p class="small muted">Aucun bloc texte sur cette planche.</p>'}</aside>`}
  const rec=b.texts[s.tkey];const styles=(s.story&&s.story.paras)||[];const paras=rec&&rec.paras&&rec.paras.length?rec.paras:[{runs:[]}];
  const cols=Math.max(1,...s.frames.map(x=>x.f.cols||1));const n=(s.story&&s.story.n)||s.frames.length;
  const stNames=[];styles.forEach(st=>{const k=`${st.st||'Style'} · ${st.ff||''} ${st.sz||''}/${Math.round((st.ld||0)*10)/10}`;if(!stNames.includes(k))stNames.push(k)});
  const cb=cur();const crr=cb&&inCreation(cb)?crOf(cb):null;const lrow=crr&&crr.rows.get('s'+String(s.tkey).split('#')[1]);const lockedO=lockedByOther(lrow);
  const checking=(rec&&rec.st==='checking')||lockedO;const tpl=s.story&&s.story.paras&&s.story.paras.some(p=>(p.t||'').trim());
  const fx=(rec&&rec.fx)||[],q=(rec&&rec.q)||[];
  return `<aside class="panel rpanel" id="rpanel">
    <div class="row" style="justify-content:space-between;gap:6px"><b>Bloc texte · p. ${s.page}</b><button class="btn ghost sm" data-act="r-unsel">Tous les blocs</button></div>
    ${lockedO?`<div class="lockbar">${I_LOCK} ${esc(lockWho(lrow))} modifie ce texte : il se met à jour ici en direct, vous pourrez écrire dès qu'il sera libre.</div>`:''}
    ${crr&&lrow&&lrow.src==='id'&&!lrow.committed?'<p class="small muted" style="margin:0">Modifié dans InDesign, pas encore enregistré dans le document.</p>':''}
    <div class="rstyle"><span>${n>1?`chaîné sur ${n} blocs`:'1 bloc'}</span>${cols>1?`<span>${cols} colonnes</span>`:''}${stNames.slice(0,4).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
    <div class="rtools" role="toolbar" aria-label="Mise en forme">
      <button data-act="rt" data-cmd="c" title="Capitales">CAP</button>
      <button data-act="rt" data-cmd="l" title="Ferré à gauche">${I_AL_L}</button>
      <button data-act="rt" data-cmd="r" title="Ferré à droite">${I_AL_R}</button>
      <button data-act="rt" data-cmd="b" title="Gras (${IS_MAC?'⌘':'Ctrl+'}B)"><b>G</b></button></div>
    <div class="red-ed" id="red-ed" contenteditable="${checking?'false':'true'}" spellcheck="true" lang="fr" data-tk="${esc(s.tkey)}" data-ph="Écrivez le texte de ce bloc…">${edHtml(paras,styles)}</div>
    <p class="small err" id="ovs-warn" ${view.ovs&&view.ovs[s.tkey]?'':'hidden'} style="margin:0">Le texte dépasse des blocs (signe + rouge) : raccourcissez-le.</p>
    <div class="row"><button class="btn primary" data-act="red-next" data-tk="${esc(s.tkey)}" ${checking?'disabled':''} title="Marque ce texte comme terminé et ouvre le texte suivant">${lockedO?'Texte en cours ailleurs':"J'ai terminé →"}</button><button class="btn" data-act="red-done" data-tk="${esc(s.tkey)}" ${checking?'disabled':''} title="Relecture de l'orthographe, de la conjugaison et de la ponctuation">${checking&&!lockedO?'Relecture en cours…':'Relecture'}</button>${!hasText(rec)&&tpl?`<button class="btn ghost sm" data-act="red-tpl" data-tk="${esc(s.tkey)}" title="Partir du texte présent dans la maquette">Reprendre le texte de la maquette</button>`:''}</div>
    ${rec&&rec.err?`<p class="small err" style="margin:0">${esc(rec.err)} <button class="linkish" data-act="red-done" data-tk="${esc(s.tkey)}">Relancer</button></p>`:''}
    ${rec&&rec.st==='done'&&!rec.err&&!fx.length&&!q.length?'<p class="small" style="margin:0;color:var(--ok)">✓ Relu : aucune faute trouvée.</p>':''}
    ${q.length?`<div class="fixes"><b class="small">Questions de la relecture</b>${q.map((x,i)=>`<div class="fix q"><span><del>${esc(x.avant)}</del> → <ins>${esc(x.apres||'')}</ins></span><span class="why">${esc(x.question||'')}</span><span class="row" style="gap:6px"><button class="btn sm primary" data-act="q-yes" data-tk="${esc(s.tkey)}" data-i="${i}">Corriger</button><button class="btn sm" data-act="q-no" data-tk="${esc(s.tkey)}" data-i="${i}">Garder tel quel</button></span></div>`).join('')}</div>`:''}
    ${rec&&rec.st==='done'&&!lockedO?`<div class="rnext"><button class="btn primary" data-act="red-next" data-tk="${esc(s.tkey)}" title="Garde le texte tel qu'il est${q.length?' (les questions restantes sont ignorées)':''} et ouvre le texte suivant">${rec.ok?'Texte suivant':'Valider et texte suivant'} →</button><button class="btn" data-act="red-nextpl" title="Ouvre le premier texte de la planche suivante">Planche suivante ⇥</button></div>`:''}
    ${fx.length?`<div class="fixes"><b class="small">Corrigé automatiquement</b>${fx.map((x,i)=>`<div class="fix"><span><del>${esc(x.avant)}</del> → <ins>${esc(x.apres||'')}</ins></span>${x.type||x.raison?`<span class="why">${esc([x.type,x.raison].filter(Boolean).join(' · '))}</span>`:''}<span><button class="btn ghost sm" data-act="fx-undo" data-tk="${esc(s.tkey)}" data-i="${i}">Annuler cette correction</button></span></div>`).join('')}</div>`:''}
  </aside>`;
}
function renderRedac(b,m,ev){
  if(b.pl.length&&view.rfocus)return renderFocus(b,m);
  if(!b.pl.length)return `<div class="panel emptystate"><h2>Rédaction</h2><p class="muted">Importez d'abord les mises en page de votre fichier MEP (onglet Mises en page) et posez-les sur les pages : vous pourrez ensuite écrire directement dans leurs blocs texte.</p><button class="btn primary" data-act="tab" data-tab="layouts">Aller aux mises en page</button></div>`;
  const sp=m.sp;const withTx=sp.filter(s=>spreadStories(b,s.key).length);
  if(view.rk==null||!sp.some(s=>s.key===view.rk))view.rk=(withTx[0]||sp[0]).key;
  const key=view.rk;const s=sp.find(x=>x.key===key);const stories=spreadStories(b,key);const plm=plById(b);
  if(view.rsel&&!stories.some(x=>x.tkey===view.rsel))view.rsel=null;
  const L=s.l?plm[b.pageLay[s.l]]:null,R=s.r?plm[b.pageLay[s.r]]:null;const ref=L||R||b.pl[0];const ratio=(2*ref.w/ref.h).toFixed(4);
  const all=allStories(b);const done=all.filter(x=>textState(b.texts[x.tkey])==='done').length;
  const opts=sp.map(x=>{const n=spreadStories(b,x.key).length;return `<option value="${x.key}" ${x.key===key?'selected':''}>${esc(spreadLabel(b,x.key))}${n?` · ${n} texte${n>1?'s':''}`:''}</option>`}).join('');
  const stage=`<div class="rstage"><div class="rspread ${!s.l||!s.r?'single':''}" style="width:min(100cqw,calc(100cqh * ${ratio}));aspect-ratio:${ratio}">${rPage(b,key,s.l,'left',L,stories)}${rPage(b,key,s.r,'right',R,stories)}</div></div>`;
  const pick=view.plpick!=null&&(view.plpick===s.l||view.plpick===s.r)?`<div style="position:relative">${plPicker(b,view.plpick)}</div>`:'';
  return `<div class="redac ${view.rfs?'fs':''}" id="redac"><div class="rmain">${pick}${stage}</div>${redacPanel(b,stories.find(x=>x.tkey===view.rsel)||null,stories)}</div>`;
}
const edState={t:null};
function edRecord(b,tk,paras){let rec=b.texts[tk];if(!rec)rec=b.texts[tk]={paras:[],st:'draft'};if(!rec.st)rec.st='draft';rec.paras=paras;if(rec.st!=='draft'&&rec.st!=='checking'){rec.st='draft';rec.fx=[];rec.q=[];rec.err=''}return rec}
function edCommand(cmd){
  const b=cur();const el=document.getElementById('red-ed');if(!b||!el)return;const tk=el.dataset.tk;const s=spreadStories(b,view.rk).find(x=>x.tkey===tk);if(!s)return;
  const sel=getSelection();let marks=[];if(sel.rangeCount){const r=sel.getRangeAt(0);if(el.contains(r.startContainer))marks=[{node:r.startContainer,off:r.startOffset},{node:r.endContainer,off:r.endOffset}]}
  const {paras,pos}=parseEd(el,marks);let a=pos[0],z=pos[1];
  if(!a||!z){a={p:paras.length-1,o:plainOf(paras[paras.length-1]).length};z=a}
  if(cmd==='b'||cmd==='c'){const r=toggleAttr(paras,a,z,cmd);if(!r){toast('Sélectionnez le texte à mettre '+(cmd==='b'?'en gras':'en capitales')+'.');return}[a,z]=r}
  else{const ps=[];for(let p=a.p;p<=z.p;p++)if(paras[p])ps.push(paras[p]);const all=ps.every(p=>p.al===cmd);ps.forEach(p=>{if(all)delete p.al;else p.al=cmd})}
  edRecord(b,tk,paras);el.innerHTML=edHtml(paras,(s.story&&s.story.paras)||[]);el.focus();setEdSel(el,a,z);
  save(b,true);flowAll(tk);
}
async function finishText(bid,tk){
  let b=books.get(bid);let rec=b&&b.texts[tk];
  const el=document.getElementById('red-ed');if(el&&el.dataset.tk===tk){rec=edRecord(b,tk,parseEd(el).paras)}
  if(!hasText(rec)){toast("Le bloc est vide : écrivez d'abord le texte.");return}
  rec.st='checking';rec.err='';rec.q=[];rec.fx=[];save(b);
  const paras=rec.paras.map(plainOf);let res=null,err='';
  if(!cloudOn())err="Relecture automatique indisponible : connectez-vous à l'espace en ligne (page Tableau de bord).";
  else try{const {data,error}=await CLOUD.sb.functions.invoke('relecture',{body:{paras}});if(error)throw error;if(!data||data.error)throw new Error((data&&data.error)||'réponse vide');res=data}
  catch(e){const st=e&&e.context&&e.context.status;err=st===404?"La relecture n'est pas encore installée dans Supabase (fonction « relecture »).":`Relecture indisponible pour le moment${e&&e.message?' ('+e.message+')':''}.`}
  b=books.get(bid);rec=b&&b.texts[tk];if(!rec)return;
  rec.st='done';rec.at=Date.now();
  if(err)rec.err=err;
  else{rec.fx=[];for(const c of res.corrections||[])if(applyFix(rec.paras,c))rec.fx.push({p:c.p,avant:c.avant,apres:c.apres,type:c.type||'',raison:c.raison||''});
    rec.q=(res.questions||[]).filter(x=>rec.paras[x.p]&&plainOf(rec.paras[x.p]).includes(x.avant)).map(x=>({p:x.p,avant:x.avant,apres:x.apres||'',question:x.question||''}))}
  save(b);
  if(!err)toast(rec.fx.length||rec.q.length?`Relu : ${rec.fx.length} correction${rec.fx.length>1?'s':''}${rec.q.length?`, ${rec.q.length} question${rec.q.length>1?'s':''}`:''}`:'Relu : aucune faute trouvée');
}
window.addEventListener('resize',()=>{clearTimeout(flowAll.t);flowAll.t=setTimeout(()=>flowAll(),150)});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>flowAll());
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&view.rfs){view.rfs=false;render()}else setTimeout(()=>flowAll(),60)});
document.addEventListener('mousedown',e=>{if(e.target.closest&&e.target.closest('.rtools button'))e.preventDefault()});
document.addEventListener('input',e=>{const t=e.target;if(!t||t.id!=='red-ed')return;const b=cur();if(!b)return;const tk=t.dataset.tk;
  edRecord(b,tk,parseEd(t).paras);clearTimeout(edState.t);edState.t=setTimeout(()=>{save(b,true);flowAll(tk)},150)});
document.addEventListener('paste',e=>{const t=e.target&&e.target.closest&&e.target.closest('#red-ed');if(!t)return;e.preventDefault();e.stopPropagation();
  const txt=(e.clipboardData&&e.clipboardData.getData('text/plain')||'').replace(/\r\n?/g,'\n');document.execCommand('insertText',false,txt)},true);
document.addEventListener('keydown',e=>{const t=e.target;if(!t||t.id!=='red-ed')return;const mod=e.metaKey||e.ctrlKey;const k=(e.key||'').toLowerCase();
  if(mod&&k==='b'){e.preventDefault();edCommand('b')}else if(mod&&(k==='i'||k==='u')){e.preventDefault()}});
document.addEventListener('focusout',e=>{if(e.target&&e.target.id==='red-ed'){const b=cur();if(b)save(b,true)}});

/* ================= Création : le document InDesign réel, synchronisé bloc par bloc =================
   La structure (pages, blocs, styles) vient du panneau InDesign (table creations). Chaque bloc photo et chaque texte
   est un enregistrement (table blocks) avec une version et un verrou : le site et InDesign écrivent bloc par bloc,
   jamais le livre entier, et une écriture sur une version périmée ou un bloc verrouillé est refusée. */
const MB_VERSION='202610240918';
const IS_ADMIN=()=>((CLOUD.user&&CLOUD.user.email)||'').toLowerCase()==='gardy.eugene@gmail.com';
function fmtBuild(v){const m=String(v).match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)/);return m?`${m[3]}/${m[2]} ${m[4]}:${m[5]}`:v}
function renderVersion(){const el=document.getElementById('ver-slot');if(!el)return;
  el.innerHTML=IS_ADMIN()?`<span class="vtag mono" title="Version de l'application chargée">v ${esc(fmtBuild(MB_VERSION))}</span><button class="btn ghost sm" data-act="load-latest">Charger la dernière version</button>`:''}
async function latestVersion(){const r=await fetch('version.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('version');return (await r.json()).v}
async function loadLatest(){
  toast('Recherche de la dernière version…');
  let v;try{v=await latestVersion()}catch(e){toast('Impossible de vérifier la version en ligne pour le moment.');return}
  if(v===MB_VERSION){toast(`✓ Vous avez déjà la dernière version (v ${fmtBuild(v)}).`);return}
  try{sessionStorage.setItem('mb-expect',v)}catch(e){}
  location.replace(location.pathname+'?v='+encodeURIComponent(v)+location.hash);
}
// After reloading for a new version: say whether it really is the latest one
(()=>{let exp=null;try{exp=sessionStorage.getItem('mb-expect');sessionStorage.removeItem('mb-expect')}catch(e){}
  if(exp)setTimeout(()=>toast(exp===MB_VERSION?`✓ Dernière version chargée (v ${fmtBuild(MB_VERSION)}).`:`La version ${fmtBuild(exp)} n'est pas encore disponible : GitHub la publie, réessayez dans une minute (chargée : v ${fmtBuild(MB_VERSION)}).`),900)})();
const SID='w'+Math.random().toString(36).slice(2,10);
const CR={byBook:new Map(),timers:new Map(),lockBid:null,lockTimer:null,lastAct:Date.now(),pushing:new Set(),again:new Set(),own:new Set()};
const crOf=b=>b&&CR.byBook.get(b.id);
const inCreation=b=>{const c=crOf(b);return !!(c&&c.data&&c.data.pages&&c.data.pages.length)};
const myId=()=>CLOUD.user&&CLOUD.user.id;
const ownerOf=b=>(b&&b._owner)||myId();
const isShared=b=>!!(b&&b._owner&&b._owner!==myId());
const myName=()=>{const e=(CLOUD.user&&CLOUD.user.email)||'';const n=e.split('@')[0];return n?n.charAt(0).toUpperCase()+n.slice(1):'Quelqu\'un'};
const crImg=(b,key)=>'cr~'+b.id+'~'+key;
const lockedByOther=r=>!!(r&&r.lock_until&&new Date(r.lock_until).getTime()>Date.now()&&r.lock_sid!==SID);
const lockWho=r=>r?(r.lock_client==='indesign'?`${r.lock_name||'Quelqu\'un'} dans InDesign`:`${r.lock_name||'Quelqu\'un'} sur le site`):'';
const txData=rec=>{if(!rec)return null;const o={paras:rec.paras||[]};for(const k of ['st','fx','q','at','err'])if(rec[k]!==undefined&&rec[k]!=='')o[k]=rec[k];return o};
// A photo path coming from InDesign may be absolute ("abs:/Users/…"): use the photo of the library with the same name
function crLocalPath(p){if(!p)return p;if(lib.byPath.has(p))return p;const bn=baseName(String(p).replace(/^abs:/,'')).toLowerCase();const it=lib.items.find(x=>x.name.toLowerCase()===bn);return it?it.path:p}
function applyCreation(b){
  const c=crOf(b);if(!inCreation(b))return;const d=c.data;
  if(!b.conception&&(b.pl.length||b.layouts.length))b.conception={pl:b.pl.filter(l=>!l.cr),pageLay:b.pageLay,spreads:b.spreads,at:Date.now()};
  const tol=0.006;const ord=arr=>arr.slice().sort((a,z)=>Math.abs(a.y-z.y)>tol?a.y-z.y:a.x-z.x).forEach((f,j)=>f.o=j);
  b.pl=d.pages.map(pg=>{const frames=pg.frames.map(f=>Object.assign({},f,{id:f.k==='ph'?f.bid:'t'+f.fid}));ord(frames.filter(f=>f.k==='ph'));ord(frames.filter(f=>f.k==='tx'));
    const stories={};frames.forEach(f=>{if(f.k==='tx'&&d.stories&&d.stories[f.st])stories[f.st]=d.stories[f.st]});
    return {id:'cr'+pg.n,src:'cr',cr:true,name:'p. '+(pg.name||pg.n),pname:pg.name,side:pg.side,w:pg.w,h:pg.h,frames,stories,img:pg.img?'cap:'+crImg(b,pg.img):'',bg:pg.bg?'cap:'+crImg(b,pg.bg):'',th:pg.bg&&pg.th?pg.th:null,pf:pg.bg&&pg.pf?pg.pf:null,ph:[],order:pg.n,locked:false}});
  b.pageLay={};d.pages.forEach(pg=>b.pageLay[pg.n]='cr'+pg.n);
  const maxP=Math.max(...d.pages.map(p=>p.n));if(maxP>b.pageCount)b.pageCount=maxP;
  const assign={};for(const [k,arr] of Object.entries(b.assign||{})){const loose=arr.filter(a=>!a.f);if(loose.length)assign[k]=loose.slice()}
  for(const pg of d.pages)for(const f of pg.frames){if(f.k!=='ph')continue;const r=c.rows.get(f.bid);const p=r&&!r.deleted&&r.data&&r.data.p;if(!p)continue;
    const key=spreadKeyOf(pg.n);(assign[key]=assign[key]||[]).push({p:crLocalPath(p),d:0,s:pageSideOf(pg.n),f:f.bid})}
  for(const k in assign)assign[k]=[...assign[k].filter(a=>photoSide(k,a)==='l'),...assign[k].filter(a=>photoSide(k,a)==='r')];
  b.assign=assign;
  const texts={};for(const s of allStories(b)){const r=c.rows.get('s'+s.sk.split('#')[1]);if(r&&!r.deleted&&r.data&&r.data.paras)texts[s.tkey]=clone(r.data)}
  b.texts=texts;
}
// After each change on the site: send the blocks that differ from the online version (photos and texts only)
function crPush(b){if(!inCreation(b)||!cloudOn())return;clearTimeout(CR.timers.get(b.id));CR.timers.set(b.id,setTimeout(()=>crPushNow(b.id),450))}
async function crSave(b,bid,kind,page,data,retried){
  const c=crOf(b);const row=c.rows.get(bid);
  const {data:res,error}=await CLOUD.sb.rpc('block_save',{p_owner:ownerOf(b),p_book:b.id,p_bid:bid,p_kind:kind,p_page:page,p_data:data,p_rev:row?row.rev:0,p_src:'site',p_committed:true,p_sid:SID,p_name:myName()});
  if(error)throw error;if(res&&res.row)c.rows.set(bid,res.row);
  if(res&&res.ok)CR.own.add(bid+':'+res.row.rev);
  // Refused because of a newer version that this very tab wrote (two saves in a row): not a conflict, save again on top of it
  if(res&&!res.ok&&res.reason==='rev'&&res.row&&CR.own.has(bid+':'+res.row.rev)&&!retried){return crSave(b,bid,kind,page,data,true)}
  return res;
}
async function crPushNow(id){
  if(CR.pushing.has(id)){CR.again.add(id);return}   // one push at a time per book: the next one starts when this one is done
  CR.pushing.add(id);
  try{await crPushOnce(id)}finally{CR.pushing.delete(id);if(CR.again.delete(id))crPush(books.get(id))}
}
async function crPushOnce(id){
  const b=books.get(id);if(!inCreation(b)||!cloudOn())return;const c=crOf(b);const d=c.data;let refused=null;
  try{
    for(const pg of d.pages)for(const f of pg.frames){if(f.k!=='ph')continue;
      const e=(b.assign[spreadKeyOf(pg.n)]||[]).find(a=>a.f===f.bid);const want=e?e.p:null;const r=c.rows.get(f.bid);const have=r&&!r.deleted&&r.data?r.data.p:null;
      if((want||null)===(have||null)||(want&&have&&crLocalPath(have)===want))continue;
      const res=await crSave(b,f.bid,'ph',pg.n,{p:want,ln:want?baseName(want):null});if(!res.ok)refused=refused||{res,bid:f.bid}}
    for(const s of allStories(b)){const bid='s'+s.sk.split('#')[1];const rec=b.texts[s.tkey];if(!rec)continue;const r=c.rows.get(bid);
      const want=txData(rec);const have=r&&r.data?txData(r.data):null;if(JSON.stringify(want)===JSON.stringify(have))continue;
      const res=await crSave(b,bid,'tx',s.page,want);if(!res.ok)refused=refused||{res,bid,tkey:s.tkey,mine:want}}
  }catch(e){setSaved('Envoi impossible · nouvel essai');clearTimeout(CR.timers.get(id));CR.timers.set(id,setTimeout(()=>crPushNow(id),8000));return}
  if(refused){const r=refused.res;
    if(r.reason==='locked'){toast(`Ce bloc est en cours de modification par ${lockWho(r.row)} : votre changement n'a pas été envoyé.`);applyCreation(b);baseline(b);render()}
    else if(r.reason==='rev'&&refused.mine)openReconcile(b,refused.bid,refused.mine);
    else{applyCreation(b);baseline(b);render()}}
  cloudStatus();
}
// Text changed elsewhere while it was being written here: choose a version (or keep both)
function openReconcile(b,bid,mine){
  const r=crOf(b).rows.get(bid);const theirs=r&&r.data?txData(r.data):{paras:[]};const pt=x=>(x.paras||[]).map(plainOf).join('\n');
  view.recon={book:b.id,bid,mine,theirs};
  showModal(`<h3>Ce texte a changé ailleurs pendant que vous écriviez</h3>
    <p class="small muted" style="margin:0">Modifié par ${esc(r&&r.by_name||'quelqu\'un')}${r&&r.src==='id'?' dans InDesign':' sur le site'}. Choisissez la version à garder.</p>
    <div class="recon"><div><b class="small">Votre version</b><pre>${esc(pt(mine))}</pre></div><div><b class="small">L'autre version</b><pre>${esc(pt(theirs))}</pre></div></div>
    <div class="row"><button class="btn primary" data-act="rc-mine">Garder la mienne</button><button class="btn" data-act="rc-theirs">Prendre l'autre</button><button class="btn" data-act="rc-both">Garder les deux (la mienne en dessous)</button></div>`,'wide');
}
async function resolveReconcile(how){
  const rc=view.recon;view.recon=null;closeOverlay();if(!rc)return;const b=books.get(rc.book);if(!b)return;const c=crOf(b);const r=c.rows.get(rc.bid);
  if(how==='theirs'){applyCreation(b);baseline(b);render();return}
  const data=how==='mine'?rc.mine:{paras:[...(rc.theirs.paras||[]),...(rc.mine.paras||[])]};
  const res=await crSave(b,rc.bid,'tx',r&&r.page,data);
  if(!res.ok){toast(res.reason==='locked'?`Bloc verrouillé par ${lockWho(res.row)} : réessayez quand il aura fini.`:'Le texte a encore changé : réessayez.');}
  applyCreation(b);baseline(b);render();
}
// Text block locks: taken while a text is open in Rédaction, renewed every 20 s, released when leaving it
async function crLock(b,bid){
  if(CR.lockBid&&CR.lockBid!==bid)crUnlock(b);if(!bid||!cloudOn())return;CR.lockBid=bid;
  const go=async()=>{try{const {data}=await CLOUD.sb.rpc('block_lock',{p_owner:ownerOf(b),p_book:b.id,p_bid:bid,p_sid:SID,p_name:myName(),p_client:'site',p_ttl:60});if(data&&data.row)crOf(b).rows.set(bid,data.row);if(data&&!data.ok)softRender()}catch(e){}};
  await go();clearInterval(CR.lockTimer);CR.lockTimer=setInterval(go,20000);
}
function crUnlock(b){clearInterval(CR.lockTimer);const bid=CR.lockBid;CR.lockBid=null;if(!bid||!b||!cloudOn())return;CLOUD.sb.rpc('block_unlock',{p_owner:ownerOf(b),p_book:b.id,p_sid:SID,p_bid:bid}).then(()=>{},()=>{})}
window.addEventListener('beforeunload',()=>{const b=view.route==='livre'&&books.get(view.id);if(b&&CR.lockBid)crUnlock(b)});
// Presence: every open tab and InDesign panel sends a signal every 20 s (table book_presence); a signal older than 60 s is ignored
CR.pres=new Map();CR.presKey='';CR.presTimer=null;
function crPresence(){
  const b=view.route==='livre'?books.get(view.id):null;const key=b&&inCreation(b)&&cloudOn()?ownerOf(b)+'|'+b.id:'';
  if(key===CR.presKey)return;
  if(CR.presKey)crLeave();CR.presKey=key;CR.pres=new Map();clearInterval(CR.presTimer);if(!key)return;
  crTrack();CR.presTimer=setInterval(crTrack,20000);
  const [o,bid]=key.split('|');selectWhere('book_presence','*',{owner:o,book_id:bid}).then(rows=>{rows.forEach(r=>CR.pres.set(r.sid,r));renderPresence()}).catch(()=>{});
}
function crTrack(){if(!CR.presKey||!cloudOn())return;const [o,bid]=CR.presKey.split('|');const active=Date.now()-CR.lastAct<120000;
  CLOUD.sb.from('book_presence').upsert({owner:o,book_id:bid,sid:SID,client:'site',name:myName(),active,bid:CR.lockBid||null,seen_at:new Date().toISOString()}).then(()=>{},()=>{})}
function crLeave(){if(!CR.presKey||!cloudOn())return;const [o,bid]=CR.presKey.split('|');CLOUD.sb.from('book_presence').delete().eq('owner',o).eq('book_id',bid).eq('sid',SID).then(()=>{},()=>{})}
window.addEventListener('pagehide',crLeave);
function crOnPresence(pl){const r=pl.new&&pl.new.sid?pl.new:pl.old;if(r&&r.book_id==='_panel'){pjOnPanel(pl);return}if(!r||!CR.presKey)return;if(r.owner+'|'+r.book_id!==CR.presKey)return;if(pl.eventType==='DELETE')CR.pres.delete(r.sid);else CR.pres.set(r.sid,pl.new);renderPresence()}
['pointerdown','keydown'].forEach(t=>document.addEventListener(t,()=>{const was=Date.now()-CR.lastAct<120000;CR.lastAct=Date.now();if(!was)crTrack()},true));
setInterval(renderPresence,15000);
function presenceHtml(){
  const ps=[...CR.pres.values()].filter(p=>p.sid!==SID&&Date.now()-new Date(p.seen_at).getTime()<60000);if(!ps.length)return '';
  return ps.map(p=>`<span class="pres ${p.client==='indesign'?'id':''} ${p.active?'':'idle'}"><i></i>${esc(p.name||'Quelqu\'un')} ${p.client==='indesign'?`édite dans InDesign${p.doc?' · '+esc(p.doc):''}${p.page?' · p. '+esc(p.page):''}`:'est sur le site'}${p.active?'':' (inactif)'}</span>`).join('');
}
function renderPresence(){const el=document.getElementById('presence-slot');if(el)el.innerHTML=presenceHtml()}
// Loading: structure, blocks and page previews of the books in creation
async function selectWhere(table,cols,eq){const out=[];for(let from=0;;from+=500){let q=CLOUD.sb.from(table).select(cols);for(const [k,v] of Object.entries(eq))q=q.eq(k,v);const {data,error}=await q.range(from,from+499);if(error)throw error;out.push(...data);if(data.length<500)break}return out}
async function crLoadAll(){
  let rows=[];try{rows=await selectAll('creations','owner,book_id,data,rev,updated_at')}catch(e){return}
  for(const r of rows)await crTake(r);
}
async function crTake(r){
  const b=books.get(r.book_id);if(!b)return;const old=CR.byBook.get(b.id);
  const c={owner:r.owner,data:r.data,rev:r.rev,rows:old?old.rows:new Map()};CR.byBook.set(b.id,c);
  if(!old){try{(await selectWhere('blocks','*',{owner:r.owner,book_id:r.book_id})).forEach(x=>c.rows.set(x.bid,x))}catch(e){}}
  const keys=(r.data.pages||[]).flatMap(p=>[p.img,p.bg]).filter(Boolean);
  // previews no longer used by the document: forgotten here and in this browser's cache
  const keep=new Set(keys.map(k=>crImg(b,k)));for(const k of Object.keys(captures))if(k.startsWith('cr~'+b.id+'~')&&!keep.has(k)){delete captures[k];if(IDB.ok)idbDel('cap:'+k).catch(()=>{})}
  applyCreation(b);baseline(b);
  crLoadImgs(b,r,keys);   // in the background, a few at a time: the book opens right away
}
// Page previews: fetched by small batches (a big book has hundreds), kept in this browser so a reload does not fetch them again
async function crLoadImgs(b,r,keys){
  const todo=keys.filter(k=>!captures[crImg(b,k)]);if(!todo.length)return;
  CR.imgLoading=(CR.imgLoading||0)+todo.length;let done=0;
  const batch=async part=>{for(let attempt=0;attempt<3;attempt++){try{const {data,error}=await CLOUD.sb.from('creation_images').select('key,data').eq('owner',r.owner).eq('book_id',r.book_id).in('key',part);if(error)throw error;
      data.forEach(x=>{const k=crImg(b,x.key);captures[k]=x.data;if(IDB.ok)idbPut('cap:'+k,x.data).catch(()=>{})});return}catch(e){CR.imgErr=(e&&e.message)||String(e);await new Promise(z=>setTimeout(z,800*(attempt+1)))}}};
  const parts=[];for(let i=0;i<todo.length;i+=6)parts.push(todo.slice(i,i+6));
  let next=0;const worker=async()=>{while(next<parts.length){const part=parts[next++];await batch(part);done+=part.length;CR.imgLoading-=part.length;softRender()}};
  await Promise.all([worker(),worker(),worker()]);
}
function crOnBlock(pl){
  const r=pl.new;if(!r||!r.book_id)return;const b=books.get(r.book_id);const c=crOf(b);if(!c||r.owner!==c.owner)return;
  const prev=c.rows.get(r.bid);if(prev&&prev.rev>r.rev)return;c.rows.set(r.bid,r);
  const editing=view.rsel&&document.activeElement&&document.activeElement.id==='red-ed'&&r.bid==='s'+String(view.rsel).split('#')[1];
  const contentChanged=!prev||prev.rev!==r.rev;
  if(contentChanged&&!editing){applyCreation(b);baseline(b);if(IDB.ok)idbPut('book:'+b.id,clone(b)).catch(()=>{})}
  if(view.route==='livre'&&view.id===b.id)softRender();
}

/* ================= Rédaction · mode Focus (relecture de tout le livre d'un seul défilement) ================= */
// Pages à gauche (40 % ; 20 % sur tablette ; bandeau de 30 % de haut sur téléphone), textes à droite, une planche après
// l'autre : son titre, puis ses blocs reliés par une ligne. Les deux colonnes défilent ensemble.
function fxHidden(b){try{return new Set(JSON.parse(localStorage.getItem('mb-fxhide-'+b.id)||'[]'))}catch(e){return new Set()}}
function fxSetHidden(b,set){try{localStorage.setItem('mb-fxhide-'+b.id,JSON.stringify([...set]))}catch(e){}}
function spreadTitle(b,k){const nm=b.spreadNames&&b.spreadNames[k];if(nm)return nm;const ev=evById(b);const ids=[...new Set(spreadPages(b,k).map(p=>b.pages[p]).filter(Boolean))];
  return ids.map(id=>ev[id]&&String(ev[id].name||'').split('\n')[0]).filter(Boolean).join(' · ')}
function renderFocus(b,m){
  const plm=plById(b);const sp=m.sp;const hidden=fxHidden(b);
  const groups=sp.map(x=>({x,stories:spreadStories(b,x.key)})).filter(g=>g.stories.length);
  if(!groups.length)return `<div class="panel emptystate"><h2>Mode Focus</h2><p class="muted">Aucun bloc texte dans ce livre pour l'instant.</p></div>`;
  const flat=groups.flatMap(g=>g.stories.filter(s=>!hidden.has(s.tkey)).map(s=>s.tkey));
  const ai=flat.indexOf(view.rsel);const curPl=view.fxPl!=null?view.fxPl:(view.rk!=null?view.rk:groups[0].x.key);
  const thumb=(p,side)=>{const l=p&&p<=b.pageCount?plm[b.pageLay[p]]:null;const src=l?imgSrc(l.img||l.bg):'';return `<span class="fxpg ${side} ${p&&p<=b.pageCount?'':'none'}">${src?`<img src="${esc(src)}" alt="" loading="lazy">`:''}</span>`};
  const left=groups.map(g=>`<button class="fxsp ${g.x.key===curPl?'on':''}" data-sync="${g.x.key}" data-act="fx-go" data-k="${g.x.key}" aria-label="${esc(spreadLabel(b,g.x.key))}"><span class="fxsp-l">${esc(spreadLabel(b,g.x.key))}</span><span class="fxsp-p">${thumb(g.x.l,'l')}${thumb(g.x.r,'r')}</span></button>`).join('');
  const right=groups.map((g,gi)=>{const title=spreadTitle(b,g.x.key);const gIdx=flat.indexOf(g.stories.find(s=>!hidden.has(s.tkey))?.tkey);
    const on=g.x.key===curPl;const reached=ai>=0&&gIdx>=0&&gIdx<=ai;
    const vis=g.stories.filter(s=>!hidden.has(s.tkey));
    const cards=vis.map((s,i)=>{const idx=flat.indexOf(s.tkey),act=s.tkey===view.rsel,st=textState(b.texts[s.tkey]);const content=storyContent(b,s);const styles=(s.story&&s.story.paras)||[];
      const last=gi===groups.length-1&&i===vis.length-1;const kind=(styles[0]&&styles[0].st)||'Texte';
      const node=`<span class="fxline ${idx<ai?'on':''} ${last?'last':''}"></span><span class="fxnode ${act?'act':''} ${st==='done'?'done':''} ${idx<=ai?'on':''}"></span>`;
      const tools=`<span class="fxtools"><button class="fxb" data-act="${act?'rt':'rsel'}" data-cmd="c" data-tk="${esc(s.tkey)}" title="Capitales">CAP</button><button class="fxb" data-act="${act?'rt':'rsel'}" data-cmd="b" data-tk="${esc(s.tkey)}" title="Gras"><b>Gras</b></button><button class="fxb ${st==='done'?'ok':''}" data-act="red-done" data-tk="${esc(s.tkey)}" title="Relecture de l'orthographe, de la conjugaison et de la ponctuation">${st==='done'?'Relu ✓':'Relire'}</button><button class="fxb ico" data-act="fx-hide" data-tk="${esc(s.tkey)}" title="Masquer ce bloc" aria-label="Masquer ce bloc"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 13.5 13.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button></span>`;
      let body;
      if(act){const full=redacPanel(b,s,g.stories);const ed=full.slice(full.indexOf('<div class="red-ed"'),full.indexOf('<p class="small err" id="ovs-warn"'));const after=full.slice(full.indexOf('<div class="row"><button class="btn primary" data-act="red-next"'),full.lastIndexOf('</aside>'));body=ed+after}
      else body=`<div class="fxprev">${hasText(b.texts[s.tkey])?content.paras.map((p,j)=>`<p style="${edCss(styles[Math.min(j,styles.length-1)],p.al)}">${runsHtml(p.runs)||'&nbsp;'}</p>`).join(''):'<p class="muted small">Bloc vide : cliquez pour écrire.</p>'}</div>`;
      return `<div class="fxrow">${node}<div class="fxcard ${act?'act':''}" ${act?'':`data-act="rsel" data-tk="${esc(s.tkey)}"`} id="fxc-${esc(s.tkey.replace(/[^\w-]/g,'_'))}"><div class="fxhead"><span class="small muted"><b>p. ${s.page}</b> · ${esc(kind)}</span>${tools}</div>${body}</div></div>`}).join('');
    return `<section class="fxg" data-sync="${g.x.key}" id="fxg-${g.x.key}"><div class="fxrow">${`<span class="fxline ${reached?'on':''}"></span><span class="fxdot ${on||reached?'on':''}"></span>`}<div class="fxtitle ${on?'on':''}"><span>${esc(spreadLabel(b,g.x.key).split(' · ').slice(0,2).join(' · '))}</span>${title?`<b>${esc(title)}</b>`:''}</div></div>${cards}</section>`}).join('');
  const hid=[...hidden].map(tk=>{const s=groups.flatMap(g=>g.stories).find(x=>x.tkey===tk);return s?`<button class="fxpill" data-act="fx-show" data-tk="${esc(tk)}" title="Réafficher ce bloc">p. ${s.page} ↺</button>`:''}).join('');
  const all=allStories(b);const done=all.filter(x=>textState(b.texts[x.tkey])==='done').length;
  return `<div class="redac fx" id="redac"><div class="fx-wrap"><div class="fx-pages" id="fx-pages">${left}</div>
    <div class="fx-text" id="fx-text"><div class="fxbar"><b>Relecture</b><span class="small muted">${done}/${all.length} textes relus</span><span style="flex:1"></span>${hid?`<span class="small muted">Masqués :</span>${hid}`:''}</div>${right}</div></div></div>`;
}
// Synchronised scroll: a planche's position in one column maps to the same position in the other (proportionally)
function fxSync(src,dst){
  if(!src||!dst)return;const a=[...src.querySelectorAll('[data-sync]')],z=[...dst.querySelectorAll('[data-sync]')];if(!a.length||a.length!==z.length)return;
  const H=el=>{const c=getComputedStyle(el);return /flex/.test(c.display)&&c.flexDirection==='row'};const hs=H(src),hd=H(dst);
  // position of an element inside its scrolling column (independent of offsetParent and of the sticky bar)
  const pos=(el,box,h)=>{const r=el.getBoundingClientRect(),q=box.getBoundingClientRect();return h?r.left-q.left+box.scrollLeft:r.top-q.top+box.scrollTop};
  const scr=(box,h)=>h?box.scrollLeft:box.scrollTop;const max=(box,h)=>h?box.scrollWidth-box.clientWidth:box.scrollHeight-box.clientHeight;
  const st=scr(src,hs);let i=0;while(i<a.length-1&&pos(a[i+1],src,hs)<=st+4)i++;
  const a0=pos(a[i],src,hs),a1=i<a.length-1?pos(a[i+1],src,hs):max(src,hs);const f=a1>a0?Math.min(1,Math.max(0,(st-a0)/(a1-a0))):0;
  const b0=pos(z[i],dst,hd),b1=i<z.length-1?pos(z[i+1],dst,hd):max(dst,hd);
  fxSync.lock=dst;const v=b0+f*(b1-b0);if(hd)dst.scrollLeft=v;else dst.scrollTop=v;
  const k=+a[i].dataset.sync;if(k!==view.fxPl){view.fxPl=k;view.rk=k;document.querySelectorAll('.fxsp').forEach(e=>e.classList.toggle('on',+e.dataset.k===k));document.querySelectorAll('.fxtitle').forEach(e=>e.classList.toggle('on',+e.closest('.fxg').dataset.sync===k));renderRbar()}
}
function fxBind(){
  const L=document.getElementById('fx-pages'),R=document.getElementById('fx-text');if(!L||!R)return;
  L.onscroll=()=>{if(fxSync.lock===L){fxSync.lock=null;return}fxSync(L,R)};R.onscroll=()=>{if(fxSync.lock===R){fxSync.lock=null;return}fxSync(R,L)};
  if(view.fxKeep!=null){R.scrollTop=view.fxKeep;view.fxKeep=null;fxSync(R,L)}
  if(view.fxGoto!=null){const g=document.getElementById('fxg-'+view.fxGoto);view.fxGoto=null;if(g){R.scrollTop=g.getBoundingClientRect().top-R.getBoundingClientRect().top+R.scrollTop-44;fxSync(R,L)}}
  if(view.rsel&&view._fxSel!==view.rsel&&!view.fxShow)view.fxShow='fxc-'+view.rsel.replace(/[^\w-]/g,'_');view._fxSel=view.rsel;
  if(view.fxShow){const c=document.getElementById(view.fxShow);view.fxShow=null;if(c){const r=c.getBoundingClientRect(),rr=R.getBoundingClientRect();if(r.top<rr.top+40||r.bottom>rr.bottom-20)R.scrollTop+=r.top-rr.top-80}}
}
/* ================= Projets : fichiers InDesign reliés (conception / livre), notes, synchronisation corrective ================= */
// Un projet = un fichier de conception (« Mon projet - MEP ») + un fichier livre (« Mon projet »), reliés à la main depuis le
// panneau moodbook d'InDesign. Les liens vivent en ligne (project_docs) ; les notes aussi (project_todos).
const PJ={docs:new Map(),todos:new Map(),panel:new Map(),ok:null};
const pjKey=(o,id,role)=>o+'|'+id+'|'+role;
const pjDoc=(b,role)=>b?PJ.docs.get(pjKey(ownerOf(b),b.id,role)):null;
const pjTodos=b=>b?(PJ.todos.get(ownerOf(b)+'|'+b.id)||[]):[];
const PJ_ROLE={mep:'Conception (MEP)',livre:'Livre'};
async function pjLoad(){
  try{const d=await selectAll('project_docs','*');PJ.docs=new Map(d.map(r=>[pjKey(r.owner,r.book_id,r.role),r]));
    const t=await selectAll('project_todos','*');PJ.todos=new Map();t.forEach(pjPutTodo);PJ.ok=true}catch(e){PJ.ok=false}
  try{const p=await selectWhere('book_presence','*',{owner:myId(),book_id:'_panel'});PJ.panel=new Map(p.map(r=>[r.sid,r]))}catch(e){}
  setTimeout(pjMaybeShowFix,600);
}
function pjPutTodo(r){const k=r.owner+'|'+r.book_id;const a=(PJ.todos.get(k)||[]).filter(x=>x.id!==r.id);a.push(r);a.sort((x,z)=>String(x.created_at).localeCompare(String(z.created_at)));PJ.todos.set(k,a)}
const pjEditing=()=>{const a=document.activeElement;return !!(a&&(a.id==='td-text'||a.id==='td-page'||a.id==='rn-text'||(a.dataset&&a.dataset.tdedit)))};
function pjRefresh(){if(view.files)renderFiles();if(!pjEditing())softRender()}
function pjOnDoc(pl){if(pl.eventType==='DELETE'){const o=pl.old;if(o&&o.owner)PJ.docs.delete(pjKey(o.owner,o.book_id,o.role))}else{const r=pl.new;if(r&&r.owner)PJ.docs.set(pjKey(r.owner,r.book_id,r.role),r)}pjRefresh()}
function pjOnTodo(pl){if(pl.eventType==='DELETE'){const o=pl.old;if(!o||!o.owner)return;const k=o.owner+'|'+o.book_id;PJ.todos.set(k,(PJ.todos.get(k)||[]).filter(x=>x.id!==o.id))}else if(pl.new&&pl.new.owner)pjPutTodo(pl.new);pjRefresh()}
function pjOnPanel(pl){const r=pl.new&&pl.new.sid?pl.new:pl.old;if(!r||r.owner!==myId())return;if(pl.eventType==='DELETE')PJ.panel.delete(r.sid);else PJ.panel.set(r.sid,pl.new);if(view.files)renderFiles()}
const pjPanelOn=()=>[...PJ.panel.values()].filter(p=>Date.now()-new Date(p.seen_at).getTime()<60000).sort((a,z)=>String(z.seen_at).localeCompare(String(a.seen_at)))[0];
// What needs attention on a project
function pjIssues(b){const out=[];if(PJ.ok!==true)return out;const cr=inCreation(b);const l=pjDoc(b,'livre');
  if(cr&&!l)out.push({k:'nolivre',msg:`En création, mais aucun fichier livre n'est relié${crOf(b).data.doc?` (document connu : « ${crOf(b).data.doc} »)`:''} : la synchronisation avec InDesign n'est pas sûre.`});
  if(l&&l.open_err)out.push({k:'err',msg:l.open_err});
  const m=pjDoc(b,'mep');if(m&&m.open_err)out.push({k:'err',msg:m.open_err});
  return out}
const pjFixCount=()=>[...books.values()].filter(b=>pjIssues(b).some(i=>i.k==='nolivre')).length;
function pjMaybeShowFix(){if(PJ.ok!==true||view.files)return;let seen=false;try{seen=sessionStorage.getItem('mb-fix-shown')==='1'}catch(e){}
  if(seen||!pjFixCount())return;try{sessionStorage.setItem('mb-fix-shown','1')}catch(e){}openFiles(null)}
function openFiles(bookId){view.files={book:bookId||null,armed:null};renderFiles()}
setInterval(()=>{if(view.files)renderFiles()},15000);
function pjChips(b){if(!cloudOn()||PJ.ok!==true)return '';
  return ['mep','livre'].map(role=>{const r=pjDoc(b,role);const warn=role==='livre'&&!r&&inCreation(b);
    return `<button class="fchip ${r?'ok':warn?'warn':'none'}" data-act="pj-files" data-book="${esc(b.id)}" title="${r?esc(r.path||''):'Relier ce fichier depuis le panneau moodbook d\'InDesign'}"><i></i>${PJ_ROLE[role]}${r?` · <b>${esc(r.name||'?')}</b>`:warn?' · à relier':' · non relié'}</button>`}).join('')}
function pjFileLine(b,role){const r=pjDoc(b,role);const cr=inCreation(b);const lab=PJ_ROLE[role];const ids=`data-book="${esc(b.id)}" data-role="${role}"`;
  if(!r)return `<div class="pjf none"><span class="pjr">${lab}</span><div class="pjn"><span class="muted small">${role==='livre'&&cr?`Non relié. Ouvrez ${crOf(b).data.doc?`« ${esc(crOf(b).data.doc)} »`:'le document du livre'} dans InDesign (Fichier › Ouvrir) : le panneau moodbook vous demandera de le confirmer, puis fera la synchronisation corrective. Les fois suivantes, ce bouton l'ouvrira pour vous.`:`Non relié. Ouvrez « ${esc(b.title)}${role==='mep'?' - MEP':''} » dans InDesign et reliez-le depuis le panneau moodbook.`}</span></div></div>`;
  const more=(r.paths||[]).filter(p=>p!==r.path).length;const armed=view.files&&view.files.armed===role+'|'+b.id;
  const waiting=r.open_req&&Date.now()-new Date(r.open_req).getTime()<10*60000;const panel=pjPanelOn();
  return `<div class="pjf"><span class="pjr">${lab}</span><div class="pjn"><b>${esc(r.name||'?')}</b><span class="mono small muted pjp">${esc(r.path||'')}${more?` <span class="muted">(+${more} autre${more>1?'s':''} emplacement${more>1?'s':''})</span>`:''}</span>
    <span class="small muted">Relié ${r.linked_at?fmtVer(r.linked_at):''}${r.linked_by?' par '+esc(r.linked_by):''} · ouvert dans InDesign ${r.seen_at?fmtVer(r.seen_at):'jamais'}${role==='livre'&&r.fixed_at?` · resynchronisé ${fmtVer(r.fixed_at)}`:''}</span>
    ${r.open_err?`<span class="err small">${esc(r.open_err)}</span>`:''}${waiting?`<span class="small pjwait">${panel?'Demande envoyée au panneau InDesign…':'Demande en attente : ouvrez InDesign et le panneau moodbook.'}</span>`:''}</div>
    <div class="pja">${waiting?`<button class="btn sm" data-act="pj-cancel" ${ids}>Annuler la demande</button>`:`${role==='livre'&&cr?`<button class="btn sm primary" data-act="pj-open" data-mode="fix" ${ids} title="Ouvre le fichier dans InDesign et remet d'accord le site et le document">Ouvrir et resynchroniser</button>`:''}<button class="btn sm ${role==='livre'&&cr?'':'primary'}" data-act="pj-open" data-mode="open" ${ids}>Ouvrir dans InDesign</button>`}
    <button class="btn ghost sm" data-act="pj-copy" ${ids}>Copier l'emplacement</button><button class="btn ghost sm danger ${armed?'armed':''}" data-act="pj-unlink" ${ids}>${armed?'Confirmer':'Délier'}</button></div></div>`}
function renderFiles(){const v=view.files;if(!v)return;
  const md=document.querySelector('#overlay .modal.files');const sc=md?md.scrollTop:0;
  if(!cloudOn()){showModal(`<div class="row" style="justify-content:space-between"><h3>Fichiers InDesign</h3><button class="btn ghost sm" data-act="close-overlay">Fermer</button></div><p class="muted">Connectez-vous à l'espace en ligne pour relier les fichiers InDesign à vos projets.</p>`,'wide files');return}
  let list=[...books.values()].map(normBook);if(v.book)list=list.filter(b=>b.id===v.book);
  list.sort((a,z)=>(inCreation(z)-inCreation(a))||(pjIssues(z).length-pjIssues(a).length)||(z.year-a.year)||a.title.localeCompare(z.title));
  const panel=pjPanelOn();const fixN=pjFixCount();
  const fixable=[...books.values()].filter(b=>inCreation(b)&&pjDoc(b,'livre'));
  const row=b=>{const is=pjIssues(b);const cr=inCreation(b);const nt=pjTodos(b).filter(t=>!t.done).length;
    return `<section class="pj ${is.some(i=>i.k==='nolivre')?'bad':''}"><div class="pj-h"><a href="#livre-${esc(b.id)}" data-act="close-overlay">${esc(b.title)}</a><span class="pill ${cr?'ok':''}">${cr?'en création':'en conception'}</span>${isShared(b)?'<span class="pill">partagé</span>':''}${nt?`<span class="pill">${nt} note${nt>1?'s':''} à faire</span>`:''}</div>
      ${is.filter(i=>i.k==='nolivre').map(i=>`<p class="pj-issue">${esc(i.msg)}</p>`).join('')}${pjFileLine(b,'mep')}${pjFileLine(b,'livre')}</section>`};
  const cr=list.filter(b=>inCreation(b)),co=list.filter(b=>!inCreation(b));
  showModal(`<div class="row" style="justify-content:space-between"><h3>Fichiers InDesign des projets</h3><button class="btn ghost sm" data-act="close-overlay">Fermer</button></div>
    <p class="small muted" style="margin:0">Un projet = un fichier de conception « Mon projet - MEP » et un fichier livre « Mon projet ». Chacun est relié au projet à la main, depuis le panneau moodbook d'InDesign (version 1.1 ou plus) : un fichier ne peut appartenir qu'à un seul projet, et une copie est reconnue comme telle.</p>
    ${PJ.ok===false?`<p class="err">Les fichiers reliés ne sont pas encore installés dans Supabase : lancez le script <b>supabase-projets.sql</b> (SQL Editor), puis rechargez la page.</p>`:''}
    <div class="pj-panel ${panel?'on':''}"><i></i>${panel?`Panneau InDesign connecté${panel.doc?` · ${esc(panel.doc)} ouvert`:''}`:'Panneau InDesign non détecté : ouvrez InDesign et le panneau moodbook (Fenêtre › Extensions › moodbook). Les demandes d\'ouverture l\'attendront.'}</div>
    ${fixN&&!v.book?`<div class="pj-fix"><b>Synchronisation corrective</b><span>${fixN} projet${fixN>1?'s':''} en création ${fixN>1?'n\'ont':'n\'a'} pas de fichier livre relié. Pour chacun : ouvrez son document dans InDesign, confirmez dans le panneau (« Oui, c'est le fichier livre de… ») ; le panneau remet alors d'accord le site et le document. Si un document est une copie d'un autre projet, choisissez « détacher » puis reliez-le au bon projet.</span></div>`:''}
    ${fixable.length>1&&!v.book?`<div class="row"><button class="btn" data-act="pj-all">Ouvrir et resynchroniser les ${fixable.length} projets en création</button></div>`:''}
    ${v.book?`<div class="row"><button class="btn ghost sm" data-act="pj-files">Voir tous les projets</button></div>`:''}
    ${cr.length?`${v.book?'':'<h4 class="pj-g">En création</h4>'}${cr.map(row).join('')}`:''}
    ${co.length?`${v.book?'':'<h4 class="pj-g">En conception</h4>'}${co.map(row).join('')}`:''}`,'wide files');
  const nm=document.querySelector('#overlay .modal.files');if(nm&&sc)nm.scrollTop=sc;
}
async function pjPatch(b,role,patch){const r=pjDoc(b,role);if(!r)return;Object.assign(r,patch);renderFiles();
  const {error}=await CLOUD.sb.from('project_docs').update(patch).eq('owner',r.owner).eq('book_id',r.book_id).eq('role',role);if(error)toast('Envoi impossible : '+error.message)}
function pjOpen(b,role,mode){return pjPatch(b,role,{open_req:new Date().toISOString(),open_mode:mode,open_for:String(CLOUD.user.email||'').toLowerCase(),open_err:null})}
// Notes / à faire
// Rédaction: bottom strip (like « Sans page ») with the planche navigation and the notes of the pages shown
function renderRbar(){
  const el=document.getElementById('rbarslot');if(!el)return;const b=view.route==='livre'?books.get(view.id):null;
  const on=!!(b&&view.tab==='redac'&&b.pl&&b.pl.length&&view.rk!=null);document.body.classList.toggle('has-rbar',on);
  if(!on){el.innerHTML='';return}
  const keepFocus=document.activeElement&&document.activeElement.id==='rn-text';
  const sp=spreadsOf(b.pageCount);const s=sp.find(x=>x.key===view.rk);if(!s){el.innerHTML='';return}
  const all=allStories(b);const done=all.filter(x=>textState(b.texts[x.tkey])==='done').length;
  const opts=sp.map(x=>{const n=spreadStories(b,x.key).length;return `<option value="${x.key}" ${x.key===view.rk?'selected':''}>${esc(spreadLabel(b,x.key))}${n?` · ${n} texte${n>1?'s':''}`:''}</option>`}).join('');
  const pages=[s.l,s.r].filter(p=>p&&p<=b.pageCount);
  const selStory=view.rsel?spreadStories(b,view.rk).find(x=>x.tkey===view.rsel):null;
  const pg=view.rnPage&&pages.includes(view.rnPage)?view.rnPage:(selStory?selStory.page:pages[0]);
  const notes=cloudOn()&&PJ.ok===true?pjTodos(b).filter(t=>!t.done&&pages.includes(t.page)):[];const tg=view.tdTarget||'site';
  const notesHtml=cloudOn()&&PJ.ok===true?`<span class="pool-t">Notes <b class="mono">${notes.length}</b></span>
    <div class="pool-list">${notes.map(t=>`<label class="nchip ${t.target==='indesign'?'id':''}" title="${esc(t.text)}${t.by_name?' · '+esc(t.by_name):''}"><input type="checkbox" data-todo="${esc(t.id)}" aria-label="Fait"><b>p. ${t.page}</b>${esc(t.text)}${t.target==='indesign'?'<i>InDesign</i>':''}</label>`).join('')}</div>
    <form class="rnote" id="rnote-form"><select class="f sm" id="rn-page" aria-label="Page de la note">${pages.map(p=>`<option value="${p}" ${p===pg?'selected':''}>p. ${p}</option>`).join('')}</select>
      <input class="f sm" id="rn-text" placeholder="Noter quelque chose à faire sur cette page…" autocomplete="off" value="${esc(view.rnDraft||'')}">
      <span class="seg sm" role="group" aria-label="À faire"><button type="button" data-act="td-target" data-t="site" aria-pressed="${tg==='site'}">Site</button><button type="button" data-act="td-target" data-t="indesign" aria-pressed="${tg==='indesign'}">InDesign</button></span>
      <button class="btn sm primary" type="submit">Noter</button></form>`:'<span style="flex:1"></span>';
  el.innerHTML=`<div class="pool rstrip"><div class="wrap">
    <div class="rnav"><button class="btn sm" data-act="rk-step" data-d="-1" aria-label="Planche précédente">‹</button><select class="f sm" id="rk-sel" data-act="rk-sel" aria-label="Planche">${opts}</select><button class="btn sm" data-act="rk-step" data-d="1" aria-label="Planche suivante">›</button>
      <span class="small muted nowrap"><b class="mono">${done}/${all.length}</b> terminés</span><button class="btn ghost sm" data-act="r-fs">${view.rfs?'Quitter le plein écran':'Plein écran'}</button></div>
    <span class="rsep"></span>${notesHtml}</div></div>`;
  if(keepFocus){const i=document.getElementById('rn-text');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}}
}
function renderNotes(b){
  if(!cloudOn())return `<div class="panel emptystate"><h2>Notes</h2><p class="muted">Les notes sont enregistrées dans l'espace en ligne : connectez-vous pour les utiliser.</p></div>`;
  if(PJ.ok===false)return `<div class="panel emptystate"><h2>Notes</h2><p class="err">Les notes ne sont pas encore installées dans Supabase : lancez le script supabase-projets.sql, puis rechargez la page.</p></div>`;
  const all=pjTodos(b);const tg=view.tdTarget||'site';
  const item=t=>`<div class="todo ${t.done?'done':''}"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done?'checked':''} aria-label="Fait">
    <div class="td-b"><input class="td-in" data-tdedit="${esc(t.id)}" value="${esc(t.text)}" aria-label="Note">
      <span class="small muted">${t.page?`<button class="linkish" data-act="td-go" data-page="${t.page}">p. ${t.page}</button> · `:''}${esc(t.by_name||'')}${t.created_at?' · '+fmtVer(t.created_at):''}${t.done&&t.done_by?` · fait par ${esc(t.done_by)}${t.done_at?' '+fmtVer(t.done_at):''}`:''}</span></div>
    <button class="icon-btn sm" data-act="td-move" data-id="${esc(t.id)}" title="${t.target==='indesign'?'Passer en note pour le site':'Passer en note pour InDesign'}">${t.target==='indesign'?'→ Site':'→ InDesign'}</button>
    <button class="icon-btn sm" data-act="td-del" data-id="${esc(t.id)}" title="Supprimer">${I_TRASH}</button></div>`;
  const col=(target,title,sub)=>{const open=all.filter(t=>t.target===target&&!t.done);return `<div class="panel td-col"><div class="td-h"><b>${title}</b><span class="count">${open.length}</span></div><p class="small muted" style="margin:0 0 6px">${sub}</p>${open.map(item).join('')||'<p class="small muted">Rien à faire.</p>'}</div>`};
  const done=all.filter(t=>t.done);
  return `<div class="notes">
    <form class="panel td-add" id="todo-form"><input class="f" id="td-text" placeholder="Nouvelle note : dernière étape avant l'impression, modification à faire dans InDesign…" autocomplete="off">
      <div class="seg" role="group" aria-label="À faire"><button type="button" data-act="td-target" data-t="site" aria-pressed="${tg==='site'}">Sur le site</button><button type="button" data-act="td-target" data-t="indesign" aria-pressed="${tg==='indesign'}">Dans InDesign</button></div>
      <input class="f mini mono" id="td-page" type="number" min="1" max="${b.pageCount}" placeholder="p." aria-label="Page (facultatif)"><button class="btn primary" type="submit">Ajouter</button></form>
    <div class="td-cols">${col('site','À faire sur le site','Dernières étapes de finalisation du livre sur le site.')}${col('indesign','À faire dans InDesign','Visibles et cochables dans le panneau moodbook d\'InDesign.')}</div>
    ${done.length?`<div class="panel td-col"><button class="linkish" data-act="td-showdone">${view.tdDone?'Masquer':'Afficher'} les ${done.length} note${done.length>1?'s':''} terminée${done.length>1?'s':''}</button>${view.tdDone?done.map(item).join(''):''}</div>`:''}</div>`;
}
async function tdPatch(b,id,patch){const t=pjTodos(b).find(x=>x.id===id);if(!t)return;Object.assign(t,patch,{updated_at:new Date().toISOString()});softRender();
  const {error}=await CLOUD.sb.from('project_todos').update(Object.assign({},patch,{updated_at:t.updated_at})).eq('owner',t.owner).eq('book_id',t.book_id).eq('id',id);if(error)toast('Note non enregistrée : '+error.message)}
// Sharing a book with another account (by e-mail)
async function openShare(b){
  view.share={book:b.id,list:null,err:''};renderShare();
  try{const {data,error}=await CLOUD.sb.from('book_shares').select('email,created_at').eq('owner',myId()).eq('book_id',b.id);if(error)throw error;view.share.list=data}catch(e){view.share.err="Le partage n'est pas encore installé dans Supabase (script supabase-creation.sql)."}
  renderShare();
}
function renderShare(){const s=view.share;if(!s)return;const b=books.get(s.book);
  showModal(`<div class="row" style="justify-content:space-between"><h3>Partager « ${esc(b.title)} »</h3><button class="btn ghost sm" data-act="close-overlay">Fermer</button></div>
    <p class="small muted" style="margin:0">La personne invitée crée son propre compte moodbook avec cette adresse e-mail : le livre apparaît alors dans sa liste. Elle peut rédiger les textes et voir l'avancement ; vous voyez quand elle est sur le livre.</p>
    ${s.err?`<p class="err">${esc(s.err)}</p>`:''}
    ${s.list?`<div class="share-list">${s.list.map(x=>`<div class="row"><span>${esc(x.email)}</span><span style="flex:1"></span><button class="btn ghost sm danger" data-act="share-del" data-email="${esc(x.email)}">Retirer</button></div>`).join('')||'<p class="small muted">Ce livre n\'est partagé avec personne.</p>'}</div>`:'<p class="small muted">Chargement…</p>'}
    <form class="row" id="share-form"><input class="f" id="share-email" type="email" placeholder="Adresse e-mail" style="flex:1"><button class="btn primary" type="submit">Inviter</button></form>`);
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
  if(view.booksOpen&&!ev.target.closest('.books-dd')){view.booksOpen=false;render()}
  if(view.hist&&!ev.target.closest('.hist')&&!ev.target.closest('.histmenu')){view.hist=false;renderHistSlot()}
  if(view.lpick!=null&&!ev.target.closest('.lpick')&&!ev.target.closest('[data-act="lpick"]')){view.lpick=null;render()}
  if(view.plpick!=null&&!ev.target.closest('.plpick')&&!ev.target.closest('[data-act="plpick"]')&&!ev.target.closest('[data-act="r-plpick"]')){view.plpick=null;render()}
  const t=ev.target.closest('[data-act]');if(!t)return;const act=t.dataset.act;const b=cur();
  if(t.tagName==='INPUT'||t.tagName==='SELECT'||t.tagName==='TEXTAREA')return;
  switch(act){
    case 'show-new':view.showNew=true;view.newErr='';view.newDraft=null;render();setTimeout(()=>document.getElementById('nb-title')?.focus(),0);break;
    case 'hide-new':view.showNew=false;render();break;
    case 'cycle':{const bk=books.get(t.dataset.book);bk.stages[t.dataset.stage]=ST[bk.stages[t.dataset.stage]||'todo'].next;save(bk);break}
    case 'tab':if(t.dataset.tab==='cdf'&&view.tab==='cdf'&&t.dataset.mode&&t.dataset.mode!==view.cdfMode){switchCdf(t.dataset.mode);break}
      if(t.dataset.mode)view.cdfMode=t.dataset.mode;view.tab=t.dataset.tab;view.sel.clear();view.plpick=null;if(view.tab!=='redac'&&view.rfs){view.rfs=false;if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})}render();
      if(view.tab==='redac')scrollUnderTabs('redac');else if(view.tab==='cdf'&&view.cdfMode==='photos')scrollUnderTabs('split');break;
    case 'cdfmode':switchCdf(t.dataset.mode);break;
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
    case 'plpick':case 'r-plpick':{ev.stopPropagation();const p=+t.dataset.page;view.plpick=view.plpick===p?null:p;render();document.querySelector('.plpick')?.scrollIntoView({block:'nearest',behavior:'smooth'});break}
    case 'pl-set':{const p=+t.dataset.page,id=t.dataset.pl;if(id){const n=(plUsage(b)[id]||[]).filter(x=>x!==p).length;if(n>=b.maxReuse){toast(`Limite atteinte : cette mise en page est déjà utilisée ${n} fois.`);break}remember(b);b.pageLay[p]=id}else delete b.pageLay[p];view.plpick=null;save(b);if(id)nearWarn(b,[[p,plById(b)[id]]]);break}
    case 'pl-pair-set':{const g=plPairs(b).find(x=>x.k===t.dataset.k);view.plpick=null;setPair(b,+t.dataset.key,g);break}
    case 'fill-blocks':{const key=t.dataset.key,side=t.dataset.side;const l=plById(b)[b.pageLay[pageOfSide(key,side)]];if(!l)break;const F=pageFill(l,sideEntries(b,key,side));
      const free=F.frs.filter(f=>!F.map.has(f.id));let k=0;for(const e of F.extra){if(k>=free.length)break;e.a.f=free[k++].id}save(b);toast(k?`${k} photo${k>1?'s':''} posée${k>1?'s':''} dans les blocs vides`:'Aucun bloc vide');break}
    case 'empty-blocks':{const key=t.dataset.key,side=t.dataset.side;(b.assign[key]||[]).forEach(a=>{if(photoSide(key,a)===side)delete a.f});save(b);break}
    case 'mep-settings':view.mepSettings=true;render();break;
    case 'legacy-del':{ev.preventDefault();if(view.armed!=='legacy'){arm('legacy');break}view.armed=null;remember(b);const n=b.layouts.length;b.layouts=[];b.spreads={};save(b);toastUndo(`${n} anciennes mises en page supprimées`);break}
    case 'share':openShare(b);break;
    case 'r-focus':view.rfocus=!view.rfocus;view.fxKeep=null;view.fxPl=null;if(view.rfocus){view.fxGoto=view.rk;if(view.rsel)view.fxShow='fxc-'+view.rsel.replace(/[^\w-]/g,'_')}render();if(!view.rfocus)scrollUnderTabs('redac');break;
    case 'fx-go':{const k=+t.dataset.k;view.fxGoto=k;view.fxKeep=null;view.rk=k;render();break}
    case 'fx-hide':{const set=fxHidden(b);set.add(t.dataset.tk);fxSetHidden(b,set);if(view.rsel===t.dataset.tk)view.rsel=null;render();toast('Bloc masqué dans le mode Focus');break}
    case 'fx-show':{const set=fxHidden(b);set.delete(t.dataset.tk);fxSetHidden(b,set);render();break}
    case 'accounts':openAccounts();break;
    case 'my-pass':openMyPass();break;
    case 'acct-gen':{const i=document.getElementById('ac-pass');view.accounts.draft.email=document.getElementById('ac-email').value;view.accounts.draft.password=genPass();renderAccounts();break}
    case 'acct-copy':{try{await navigator.clipboard.writeText(view.accounts.shown.password);toast('Mot de passe copié')}catch(e){}break}
    case 'acct-pass':{const pw=genPass();const r=await acctDo('password',t.dataset.id,{password:pw});if(r){const u=view.accounts.list.find(x=>x.id===t.dataset.id);view.accounts.shown={id:t.dataset.id,password:pw};view.accounts.msg=`Nouveau mot de passe pour ${esc(u?u.email:'')} : transmettez-le à la personne.`;renderAccounts()}break}
    case 'acct-disable':acctDo('disable',t.dataset.id);break;
    case 'acct-enable':acctDo('enable',t.dataset.id);break;
    case 'acct-del':{const id=t.dataset.id;if(view.accounts.armed!==id){view.accounts.armed=id;renderAccounts();setTimeout(()=>{if(view.accounts&&view.accounts.armed===id){view.accounts.armed=null;renderAccounts()}},5000);break}view.accounts.armed=null;await acctDo('delete',id);break}
    case 'diag':{const c=crOf(b);if(!c)break;const imgs={};for(const pg of c.data.pages||[])if(pg.img&&captures[crImg(b,pg.img)])imgs[pg.img]=captures[crImg(b,pg.img)];
      const out={app:'moodbook-diagnostic',site:MB_VERSION,at:new Date().toISOString(),book:{id:b.id,title:b.title,pageCount:b.pageCount,photoRoot:b.photoRoot||'',folders:(b.photoFolders||[]).map(f=>f.name)},
        files:['mep','livre'].map(r=>pjDoc(b,r)).filter(Boolean).map(({open_req,open_for,...r})=>r),creation:c.data,
        blocks:[...c.rows.values()].map(r=>({bid:r.bid,kind:r.kind,page:r.page,data:r.data,rev:r.rev,src:r.src,committed:r.committed,deleted:r.deleted})),
        imgErr:CR.imgErr||'',imgLoading:CR.imgLoading||0,missingPreviews:(c.data.pages||[]).filter(pg=>!pg.img||!captures[crImg(b,pg.img)]).map(pg=>pg.n),previews:imgs};
      const name='diagnostic-'+(b.title||b.id).replace(/[^\w\u00C0-\u017F -]+/g,'').trim().replace(/\s+/g,'-')+'.json';
      offerFile(name,new Blob([JSON.stringify(out)],{type:'application/json'}),'',name);toast('Diagnostic téléchargé : '+name);break}
    case 'pj-files':view.menu=false;openFiles(t.dataset.book||null);break;
    case 'pj-open':{const bk=books.get(t.dataset.book);if(bk){await pjOpen(bk,t.dataset.role,t.dataset.mode);toast(pjPanelOn()?'Demande envoyée au panneau InDesign':'Demande enregistrée : elle sera traitée dès que le panneau moodbook sera ouvert dans InDesign')}break}
    case 'pj-all':{for(const bk of [...books.values()].filter(x=>inCreation(x)&&pjDoc(x,'livre')))await pjOpen(bk,'livre','fix');toast('Demandes envoyées : chaque document est resynchronisé quand il passe au premier plan dans InDesign');break}
    case 'pj-cancel':{const bk=books.get(t.dataset.book);if(bk)await pjPatch(bk,t.dataset.role,{open_req:null,open_mode:null,open_for:null});break}
    case 'pj-copy':{const bk=books.get(t.dataset.book);const r=pjDoc(bk,t.dataset.role);if(r){try{await navigator.clipboard.writeText(r.path||'');toast('Emplacement copié')}catch(e){toast(r.path||'')}}break}
    case 'pj-unlink':{const bk=books.get(t.dataset.book);const k=t.dataset.role+'|'+t.dataset.book;if(!bk)break;
      if(view.files.armed!==k){view.files.armed=k;renderFiles();setTimeout(()=>{if(view.files&&view.files.armed===k){view.files.armed=null;renderFiles()}},4000);break}
      const r=pjDoc(bk,t.dataset.role);view.files.armed=null;if(!r)break;const {error}=await CLOUD.sb.from('project_docs').delete().eq('owner',r.owner).eq('book_id',r.book_id).eq('role',r.role);
      if(error){toast('Impossible de délier : '+error.message);break}PJ.docs.delete(pjKey(r.owner,r.book_id,r.role));renderFiles();softRender();toast(`« ${r.name} » n'est plus relié à « ${bk.title} »`);break}
    case 'td-target':{const inStrip=!!t.closest('.rstrip');view.tdTarget=t.dataset.t;render();document.getElementById(inStrip?'rn-text':'td-text')?.focus();break}
    case 'td-showdone':view.tdDone=!view.tdDone;render();break;
    case 'td-go':{const p=+t.dataset.page;view.tab='redac';view.rk=spreadKeyOf(p);view.rsel=null;render();scrollUnderTabs('redac');break}
    case 'td-del':{const tt=pjTodos(b).find(x=>x.id===t.dataset.id);if(!tt)break;const k=tt.owner+'|'+tt.book_id;PJ.todos.set(k,pjTodos(b).filter(x=>x.id!==tt.id));render();
      const {error}=await CLOUD.sb.from('project_todos').delete().eq('owner',tt.owner).eq('book_id',tt.book_id).eq('id',tt.id);if(error){pjPutTodo(tt);render();toast('Suppression impossible : '+error.message)}else toast('Note supprimée');break}
    case 'td-move':{const tt=pjTodos(b).find(x=>x.id===t.dataset.id);if(tt)tdPatch(b,tt.id,{target:tt.target==='indesign'?'site':'indesign'});break}
    case 'share-del':{const em=t.dataset.email;try{await CLOUD.sb.from('book_shares').delete().eq('owner',myId()).eq('book_id',view.share.book).eq('email',em);view.share.list=view.share.list.filter(x=>x.email!==em)}catch(e){toast('Retrait impossible pour le moment.')}renderShare();break}
    case 'rc-mine':resolveReconcile('mine');break;
    case 'rc-theirs':resolveReconcile('theirs');break;
    case 'rc-both':resolveReconcile('both');break;
    case 'pl-lock':{const l=b.pl.find(x=>x.id===t.dataset.pl);if(l){l.locked=!l.locked;save(b)}break}
    case 'pl-del':{const id=t.dataset.pl;if(view.armed==='pl:'+id){view.armed=null;remember(b);b.pl=b.pl.filter(l=>l.id!==id);for(const k in b.pageLay)if(b.pageLay[k]===id)delete b.pageLay[k];save(b);toastUndo('Mise en page supprimée')}else arm('pl:'+id);break}
    case 'mep-src-del':{const src=t.dataset.src;if(view.armed==='src:'+src){view.armed=null;remember(b);const ids=new Set(b.pl.filter(l=>l.src===src).map(l=>l.id));b.pl=b.pl.filter(l=>!ids.has(l.id));for(const k in b.pageLay)if(ids.has(b.pageLay[k]))delete b.pageLay[k];if(b.mepSrc)delete b.mepSrc[src];save(b);toastUndo(`« ${src} » retiré du livre`)}else arm('src:'+src);break}
    case 'mep-pick':{const i=document.getElementById('mepdir');i.value='';i.click();break}
    case 'mep-script':offerFile(MEP_SCRIPT_NAME,'\uFEFF'+MEP_JSX,MEP_JSX);break;
    case 'mep-force':{const pnd=view.mepPending;view.mepPending=null;closeOverlay();const bk=pnd&&books.get(pnd.book);if(bk)importMep(bk,pnd.files,true);break}
    case 'goto-page':{const p=+t.dataset.page;view.tab='cdf';view.cdfMode='plan';view.sel=new Set([p]);render();document.querySelector('.pg.sel')?.scrollIntoView({block:'center',behavior:'smooth'});break}
    case 'rsel':{view.rsel=t.dataset.tk;view.plpick=null;if(view.rfocus){view.fxKeep=document.getElementById('fx-text')?.scrollTop??null;const sp=spreadStories(b,view.rk).some(x=>x.tkey===view.rsel)?null:allStories(b).find(x=>x.tkey===view.rsel);if(sp)view.rk=spreadKeyOf(sp.page)}render();setTimeout(()=>{const el=document.getElementById('red-ed');if(el&&el.isContentEditable){el.focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const sl=getSelection();sl.removeAllRanges();sl.addRange(r)}},0);break}
    case 'r-unsel':view.rsel=null;render();break;
    case 'rk-step':{const sp=spreadsOf(b.pageCount);const i=sp.findIndex(x=>x.key===view.rk);const n=sp[Math.max(0,Math.min(sp.length-1,i+(+t.dataset.d)))];if(n){view.rk=n.key;view.rsel=null;view.plpick=null;if(view.rfocus){view.fxGoto=n.key;view.fxKeep=null}render()}break}
    case 'r-fs':{view.rfs=!view.rfs;render();try{if(view.rfs&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>{});else if(!view.rfs&&document.fullscreenElement)document.exitFullscreen().catch(()=>{})}catch(e){}break}
    case 'rt':edCommand(t.dataset.cmd);break;
    case 'red-done':finishText(b.id,t.dataset.tk);break;
    case 'load-latest':loadLatest();break;
    case 'red-tpl':{const s_=spreadStories(b,view.rk).find(x=>x.tkey===t.dataset.tk);if(s_&&s_.story){edRecord(b,s_.tkey,s_.story.paras.map(p=>({runs:[{t:p.t||''}]})));save(b)}break}
    case 'fx-undo':{const rec=b.texts[t.dataset.tk];const i=+t.dataset.i;const f=rec&&rec.fx&&rec.fx[i];if(!f)break;applyFix(rec.paras,{p:f.p,avant:f.apres,apres:f.avant});rec.fx.splice(i,1);save(b);break}
    case 'q-yes':{const rec=b.texts[t.dataset.tk];const i=+t.dataset.i;const q=rec&&rec.q&&rec.q[i];if(!q)break;if(!applyFix(rec.paras,q))toast("Le passage a changé depuis la relecture.");rec.q.splice(i,1);save(b);break}
    case 'red-next':case 'red-nextpl':{
      const tk=t.dataset.tk;if(act==='red-next'&&tk&&b.texts[tk]&&hasText(b.texts[tk])){const rec=b.texts[tk];rec.q=[];rec.ok=true;rec.st='done';save(b,true)}
      const all=allStories(b);const curTk=tk||view.rsel;const i=all.findIndex(x=>x.tkey===curTk);let next=null;
      if(act==='red-next')next=all[i+1]||null;
      else{const curKey=view.rk;next=all.find(x=>spreadKeyOf(x.page)!==curKey&&(spreadKeyOf(x.page)>curKey))||null}
      if(!next){toast(act==='red-next'?'C\'était le dernier texte du livre.':'Pas d\'autre planche avec du texte après celle-ci.');render();break}
      view.rk=spreadKeyOf(next.page);view.rsel=next.tkey;view.plpick=null;render();
      setTimeout(()=>{const el=document.getElementById('red-ed');if(el&&el.isContentEditable){el.focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const sl=getSelection();sl.removeAllRanges();sl.addRange(r)}},0);break}
    case 'q-no':{const rec=b.texts[t.dataset.tk];const i=+t.dataset.i;if(rec&&rec.q){rec.q.splice(i,1);save(b)}break}
    case 'lp-set':{const k=t.dataset.key,id=t.dataset.lay;if(id)b.spreads[k]=id;else delete b.spreads[k];view.lpick=null;save(b);break}
    case 'ins-pl':insertPlanche(b,+t.dataset.key);break;
    case 'pl-del-planche':{const k=+t.dataset.key;if(view.armed==='pldel:'+k){view.armed=null;deletePlanche(b,k)}else arm('pldel:'+k);break}
    case 'menu':view.menu=!view.menu;view.booksOpen=false;render();break;
    case 'books-dd':view.booksOpen=!view.booksOpen;view.menu=false;render();break;
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
    case 'auto':if(usesPL(b)){const n=autoAssignPL(b);save(b);toast(n?`${n} page${n>1?'s':''} attribuée${n>1?'s':''}`:'Aucune mise en page disponible : toutes ont atteint la limite ou sont verrouillées.');break}{const n=autoAssign(b);save(b);toast(n?`${n} double${n>1?'s':''} page${n>1?'s':''} attribuée${n>1?'s':''}`:'Aucune mise en page disponible : toutes ont atteint la limite ou sont verrouillées.');break}
    case 'redistribute':{if(view.armed!=='redistribute'){arm('redistribute');return}view.armed=null;
      if(usesPL(b)){const plm=plById(b);for(let p=1;p<=b.pageCount;p++){const l=plm[b.pageLay[p]];if(b.pageLay[p]&&!b.pins[spreadKeyOf(p)]&&!(l&&l.locked))delete b.pageLay[p]}const n=autoAssignPL(b);save(b);toast(`${n} pages redistribuées (verrouillées conservées)`);break}for(const s of spreadsOf(b.pageCount)){if(b.spreads[s.key]&&!isFixed(b,s.key))delete b.spreads[s.key]}const n=autoAssign(b);save(b);toast(`${n} doubles pages redistribuées (verrouillées conservées)`);break}
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
    case 'cloud-out':{view.menu=false;if(CLOUD.pending.size&&!view.armedOut){view.armedOut=true;toast(`${CLOUD.pending.size} modification(s) pas encore envoyée(s) : cliquez à nouveau pour vous déconnecter quand même.`);break}view.armedOut=false;await CLOUD.sb.auth.signOut();break}
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
    case 'export-indd':{const jsx=buildJsx(b);const readme=['Placement des photos et des textes dans InDesign','','1. Décompressez ce dossier.','2. Ouvrez le document InDesign du livre.','3. Fenêtre > Utilitaires > Scripts. Clic droit sur « Utilisateur » > Faire apparaître dans le Finder (ou l\'Explorateur).','4. Copiez placer_photos_textes.jsx dans ce dossier, puis double-cliquez dessus dans le panneau Scripts.','','Le script cherche les photos à partir du dossier du document InDesign (le même que celui choisi dans l\'Atelier : « '+(b.photoRoot||'')+' »).','S\'il ne les trouve pas, il vous demande de sélectionner ce dossier.','Les photos vont dans les blocs image vides (ou contenant encore l\'image témoin de la MEP) : chacune dans le bloc choisi dans l\'application, sinon de haut en bas puis de gauche à droite.','Les textes rédigés se versent dans les blocs texte de chaque page (même ordre de lecture), en gardant la mise en forme de la maquette.','Chaque placement s\'annule en une seule fois avec Édition > Annuler.',''].join('\r\n');
      const zip=makeZip([{name:'placer_photos_textes.jsx',data:jsx},{name:'assignations.csv',data:buildCsv(b)},{name:'LISEZMOI.txt',data:'﻿'+readme}]);
      offerFile(`${b.title} - InDesign.zip`,zip,jsx,'placer_photos_textes.jsx');break}
    case 'lb-prev':openLightbox(lightbox.i-1);break;
    case 'lb-next':openLightbox(lightbox.i+1);break;
    case 'lb-add':{const i=lightbox.i;assignPhotos(b,view.active,[t.dataset.path]);save(b);toast('Ajoutée à '+spreadLabel(b,view.active));openLightbox(i+1);break}
    case 'overlay-bg':if(ev.target===t)closeOverlay();break;
    case 'close-overlay':closeOverlay();break;
    case 'copy-fallback':{const ta=document.getElementById('fallback-text');try{await navigator.clipboard.writeText(ta.value);toast('Copié')}catch(e){ta.select();toast('Texte sélectionné : copiez-le avec Ctrl/Cmd + C')}break}
  }
});
document.addEventListener('dblclick',e=>{const t=e.target.closest('.tile');if(!t)return;const {arr}=visibleItems();openLightbox(arr.findIndex(x=>x.path===t.dataset.path))});
// Chemin de fer ⇄ Visuel: each view keeps its own scroll position
function switchCdf(to){const from=view.cdfMode;if(from===to)return;
      view.scrollMem=view.scrollMem||{};view.scrollMem[from]={y:window.scrollY,pb:document.getElementById('pb-scroll')?.scrollTop,ps:document.getElementById('ps-scroll')?.scrollTop};
      view.cdfMode=to;view.sel.clear();view.edit=null;view.plpick=null;render();
      const mem=view.scrollMem[to];
      if(mem){window.scrollTo(0,mem.y);const pb=document.getElementById('pb-scroll'),ps=document.getElementById('ps-scroll');if(pb&&mem.pb!=null)pb.scrollTop=mem.pb;if(ps&&mem.ps!=null)ps.scrollTop=mem.ps}
      else if(to==='photos')scrollUnderTabs('split');
      }
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
document.getElementById('mepdir').addEventListener('change',e=>{const b=cur();if(b&&e.target.files.length)importMep(b,e.target.files)});
document.getElementById('impfile').addEventListener('change',e=>{if(e.target.files[0])importFile(e.target.files[0])});
document.addEventListener('change',e=>{const t=e.target;
  if(t.id==='imp-sheet'){imp.sheet=+t.value;imp.result=imp.grids[imp.sheet];imp.error=imp.result?'':"Pas de chemin de fer reconnu sur cette feuille.";renderImpPreview()}
  else if(t.name==='imp-mode'){imp.mode=t.value;renderImpPreview()}
  else if(t.id==='imp-extend'){imp.extend=t.checked}
  else if(t.id==='rn-page'){view.rnPage=+t.value}
  else if(t.dataset&&t.dataset.todo){const b=cur();if(b)tdPatch(b,t.dataset.todo,{done:t.checked,done_by:t.checked?myName():null,done_at:t.checked?new Date().toISOString():null})}
  else if(t.dataset&&t.dataset.tdedit){const b=cur();const v=t.value.trim();if(b&&v)tdPatch(b,t.dataset.tdedit,{text:v})}});
document.addEventListener('input',e=>{const t=e.target;
  if(t.id==='mv-page'){mv.page=t.value;mv.mode='page';const r=document.querySelector('input[name="mv-mode"][value="page"]');if(r)r.checked=true;renderMovePreview()}
  else if(t.id==='mv-planche'){mv.planche=t.value;mv.mode='planche';const r=document.querySelector('input[name="mv-mode"][value="planche"]');if(r)r.checked=true;renderMovePreview()}
  else if(t.name==='mv-mode'){mv.mode=t.value;renderMovePreview()}});
document.addEventListener('input',e=>{if(e.target.id==='rn-text')view.rnDraft=e.target.value});
let impT=null;document.addEventListener('input',e=>{if(e.target.id==='imp-paste'){clearTimeout(impT);const v=e.target.value;impT=setTimeout(()=>{imp.src='';importText(v)},250)}});
document.addEventListener('keydown',e=>{
  const mod=e.metaKey||e.ctrlKey;const k=(e.key||'').toLowerCase();
  if(mod&&(k==='z'||k==='y')){const a=document.activeElement;if(a&&(/TEXTAREA/.test(a.tagName)||a.isContentEditable||(a.tagName==='INPUT'&&!/checkbox|radio|range/.test(a.type))))return;
    e.preventDefault();if(k==='y'||(k==='z'&&e.shiftKey))histRedo();else histUndo();renderHistSlot();return}
  {const a=document.activeElement;const typing=a&&(/INPUT|TEXTAREA|SELECT/.test(a.tagName)||a.isContentEditable);
    if(!typing&&!lightbox&&view.route==='livre'&&view.tab==='redac'&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){const b=cur();const sp=spreadsOf(b.pageCount);const i=sp.findIndex(x=>x.key===view.rk);const n=sp[i+(e.key==='ArrowRight'?1:-1)];if(n){view.rk=n.key;view.rsel=null;render()}return}
    if(e.key==='Escape'&&view.rfs&&!typing){view.rfs=false;render();return}}
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
const ACCEPT={spread:['layout','spreadlay','plpair'],psr:['photos','assigned'],half:['trayimg','files'],newlay:['trayimg'],pgmove:['evmove','playout','plpair'],plmove:['evmove'],evmerge:['evmove'],trash:['evmove','assigned','pagelay'],pool:['evmove'],evrow:['evmove'],pgl:['playout','pagelay','plpair'],blk:['photos','assigned'],mepdir:['files']};
document.addEventListener('dragstart',e=>{
  const s=e.target.closest&&e.target.closest('[data-drag]');if(!s)return;const k=s.dataset.drag;
  if(k==='layout')drag={k,id:s.dataset.lay};
  else if(k==='spreadlay')drag={k,key:+s.dataset.key};
  else if(k==='evmove')drag={k,ev:s.dataset.ev};
  else if(k==='assigned')drag={k,key:s.dataset.key,idx:+s.dataset.idx};
  else if(k==='trayimg')drag={k,item:tray.items.find(x=>x.id===s.dataset.tid)};
  else if(k==='playout')drag={k,id:s.dataset.pl};
  else if(k==='plpair')drag={k,pk:s.dataset.k};
  else if(k==='pagelay')drag={k,page:+s.dataset.page};
  if(k==='photo'){const p=s.dataset.path;let paths=[p];if(lib.sel.has(p)){const {arr}=visibleItems();paths=arr.filter(x=>lib.sel.has(x.path)).map(x=>x.path)}drag={k:'photos',paths}}
  try{e.dataTransfer.setData('text/plain',k);e.dataTransfer.effectAllowed='copyMove'}catch(_){}
  if(drag&&(drag.k==='evmove'||drag.k==='assigned'||drag.k==='pagelay'))document.body.classList.add('dragging-del');
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
  if(type==='mepdir'){const ents=dropEntries(e.dataTransfer);const fl=[...(e.dataTransfer.files||[])];(ents.length?entriesFiles(ents):Promise.resolve(fl)).then(f=>importMep(b,f)).catch(()=>toast("Le dossier n'a pas pu être lu."));return}
  if(d&&d.k==='plpair'&&(type==='spread'||type==='pgl'||type==='pgmove')){const key=type==='spread'?+z.dataset.key:spreadKeyOf(+z.dataset.page);setPair(b,key,plPairs(b).find(x=>x.k===d.pk));return}
  if(type==='pgl'||(type==='pgmove'&&d&&d.k==='playout')){let T=+z.dataset.page;
    if(z.classList.contains('wide')){const r=z.getBoundingClientRect();if(e.clientX>r.left+r.width/2)T=T+1}
    if(d.k==='playout'){const n=(plUsage(b)[d.id]||[]).filter(p=>p!==T).length;if(n>=b.maxReuse){toast(`Limite atteinte : cette mise en page est déjà utilisée ${n} fois.`);return}b.pageLay[T]=d.id;save(b)}
    else if(d.k==='pagelay'&&d.page!==T){const a=b.pageLay[d.page],c=b.pageLay[T];if(c)b.pageLay[d.page]=c;else delete b.pageLay[d.page];b.pageLay[T]=a;save(b);toast('Mises en page échangées')}
    return}
  if(type==='blk'){const key=z.dataset.key,side=z.dataset.side,fid=z.dataset.f;const l=plById(b)[b.pageLay[pageOfSide(key,side)]];if(!l)return;
    const occ=pageFill(l,sideEntries(b,key,side)).map.get(fid);
    if(d.k==='photos'){const first=d.paths[0];
      placeItems(b,key,d.paths.map(p=>{const it=lib.byPath.get(p);return {p,d:it&&it.dateSrc==='exif'?it.date:0}}),side,null);
      b.assign[key].forEach(a=>{if(a.f===fid&&a.p!==first)delete a.f});const it=b.assign[key].find(a=>a.p===first);if(it)it.f=fid;
      lib.sel.clear();view.active=+key;view.activeSide=side;save(b)}
    else if(d.k==='assigned'){const src=b.assign[d.key];const item=src&&src[d.idx];if(!item)return;
      const sSide=photoSide(d.key,item);const sl=plById(b)[b.pageLay[pageOfSide(d.key,sSide)]];let srcFid=null;
      if(sl){for(const [f,en] of pageFill(sl,sideEntries(b,d.key,sSide)).map)if(en.a===item)srcFid=f}
      if(occ&&occ.a!==item){if(String(d.key)===String(key)&&sSide===side&&srcFid)occ.a.f=srcFid;else delete occ.a.f}
      if(String(d.key)!==String(key)||sSide!==side){src.splice(src.indexOf(item),1);if(!src.length)delete b.assign[d.key];item.s=side;const A=b.assign[key]=b.assign[key]||[];A.push(item);b.assign[key]=[...A.filter(a=>photoSide(key,a)==='l'),...A.filter(a=>photoSide(key,a)==='r')]}
      b.assign[key].forEach(a=>{if(a!==item&&a.f===fid)delete a.f});item.f=fid;save(b)}
    return}
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
    else if(d.k==='assigned'){const a=b.assign[d.key];if(a){a.splice(d.idx,1);if(!a.length)delete b.assign[d.key];save(b)}}
    else if(d.k==='pagelay'){if(b.pageLay[d.page]){delete b.pageLay[d.page];save(b);toast('Mise en page retirée de la page '+d.page)}}}
  else if(type==='evmerge'){if(z.dataset.ev!==d.ev)mergeEvents(b,d.ev,z.dataset.ev)}
  else if(type==='plmove'){moveNow(b,d.ev,'planche',+z.dataset.pl)}
  else if(type==='evrow'){const tid=z.dataset.ev;const r=z.getBoundingClientRect();const before=e.clientY<r.top+r.height*0.35;z.classList.remove('ins-before','merge');if(tid===d.ev)return;
    if(before){const tp=Object.keys(b.pages).map(Number).filter(p=>b.pages[p]===tid).sort((x,y)=>x-y)[0];if(tp==null){toast("Cet événement n'a pas de page : glissez plutôt sur une ligne placée.");return}moveNow(b,d.ev,'page',tp)}
    else mergeEvents(b,d.ev,tid)}
  else if(type==='pool'){if(Object.values(b.pages).includes(d.ev)){remember(b);for(const k in b.pages)if(b.pages[k]===d.ev)delete b.pages[k];save(b);toastUndo('Événement retiré de ses pages')}}
  else if(type==='newlay'&&d&&d.k==='trayimg'){const l={id:uid('m'),name:d.item.name.replace(/\.[^.]+$/,'').replace(SIDE_RE,''),family:'',photos:0,capture:'',locked:false};b.layouts.push(l);save(b);setHalf(b.id,l.id,'left',d.item.file,d.item.name)}
});

/* ---------- inputs ---------- */
document.addEventListener('input',e=>{const t=e.target;if(t.id==='pzh'){view.pzh=+t.value;document.getElementById('ps-scroll')?.style.setProperty('--pzh',view.pzh+'px');return}if(t.id==='lib-size'){lib.size=+t.value;t.closest('.pane').style.setProperty('--tile',lib.size+'px')}});
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
    case 'pl-name':{const x=b.pl.find(l=>l.id===t.dataset.pl);if(x&&v.trim()){x.name=v.trim();save(b)}break}
    case 'pl-lines':view.plLines=t.checked;render();break;
    case 'rk-sel':view.rk=+v;view.rsel=null;view.plpick=null;if(view.rfocus){view.fxGoto=+v;view.fxKeep=null}render();break;
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
    case 'pzh':saveUI();break;
    case 'ps-ev':view.psEvent=v;render();break;
    case 'spread-name':{const k=t.dataset.key;if(v.trim())b.spreadNames[k]=v.trim();else delete b.spreadNames[k];save(b);break}
    case 'jal-name':{const j=b.jalons.find(x=>x.id===t.dataset.j);if(j&&v.trim()){j.name=v.trim();save(b)}break}
  }
});
document.addEventListener('submit',e=>{
  e.preventDefault();const f=e.target;const b=cur();
  if(f.id==='cloud-login'){const email=document.getElementById('cl-email').value.trim(),pass=document.getElementById('cl-pass').value;view.cloudEmail=email;const m='in';
    if(!email||!pass){view.cloudMsg='Indiquez votre e-mail et votre mot de passe.';view.cloudErr=true;render();return}
    view.cloudMsg=m==='up'?'Création du compte…':'Connexion…';view.cloudErr=false;render();
    (async()=>{const r=m==='up'?await CLOUD.sb.auth.signUp({email,password:pass,options:{emailRedirectTo:location.href.split('#')[0]}}):await CLOUD.sb.auth.signInWithPassword({email,password:pass});
      if(r.error){view.cloudMsg=/invalid login/i.test(r.error.message)?'E-mail ou mot de passe incorrect.':/already registered/i.test(r.error.message)?'Ce compte existe déjà : utilisez « Se connecter ».':/confirm/i.test(r.error.message)?'Confirmez d\'abord votre adresse avec le lien reçu par e-mail.':r.error.message;view.cloudErr=true}
      else if(m==='up'&&!r.data.session){view.cloudMsg='Compte créé : cliquez sur le lien reçu par e-mail, puis connectez-vous.';view.cloudErr=false}
      else{view.cloudMsg='';view.cloudErr=false}render()})();return}
  if(f.id==='share-form'){const em=document.getElementById('share-email').value.trim().toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){view.share.err='Adresse e-mail invalide.';renderShare();return}
    (async()=>{const {error}=await CLOUD.sb.from('book_shares').insert({book_id:view.share.book,email:em});if(error&&!/duplicate/i.test(error.message)){view.share.err="Invitation impossible : "+error.message}else{view.share.err='';view.share.list=[...(view.share.list||[]).filter(x=>x.email!==em),{email:em}]}renderShare()})();return}
  if(f.id==='acct-form'){const v=view.accounts;if(!v)return;const email=document.getElementById('ac-email').value.trim().toLowerCase(),password=document.getElementById('ac-pass').value.trim();v.draft={email,password};
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){v.err='Adresse e-mail invalide.';renderAccounts();return}if(password.length<8){v.err='Mot de passe de 8 caractères minimum.';renderAccounts();return}
    (async()=>{const r=await acctDo('create',null,{email,password});if(r&&r.user){view.accounts.shown={id:r.user.id,password};view.accounts.msg=`Compte créé pour <b>${esc(email)}</b>. Transmettez-lui son adresse et son mot de passe.`;view.accounts.draft={email:'',password:genPass()};renderAccounts()}})();return}
  if(f.id==='mypass-form'){const v=view.myPass;const a=document.getElementById('mp-1').value,b2=document.getElementById('mp-2').value;
    if(a.length<8){v.err='8 caractères minimum.';renderMyPass();return}if(a!==b2){v.err='Les deux mots de passe ne sont pas identiques.';renderMyPass();return}
    (async()=>{const {error}=await CLOUD.sb.auth.updateUser({password:a});if(error){v.err=error.message}else{v.ok=true}renderMyPass()})();return}
  if(f.id==='rnote-form'){const b=cur();if(!b||!cloudOn())return;const i=document.getElementById('rn-text');const text=i.value.trim();if(!text){i.focus();return}
    const pg=parseInt(document.getElementById('rn-page').value,10);view.rnPage=pg;
    const row={owner:ownerOf(b),book_id:b.id,id:uid('t'),text,target:view.tdTarget||'site',page:pg>0?pg:null,by_name:myName(),created_at:new Date().toISOString()};
    pjPutTodo(row);i.value='';view.rnDraft='';render();setTimeout(()=>document.getElementById('rn-text')?.focus(),0);toast(`Note ajoutée pour la page ${pg}`);
    (async()=>{const {created_at,...ins}=row;const {error}=await CLOUD.sb.from('project_todos').insert(ins);if(error){const k=row.owner+'|'+row.book_id;PJ.todos.set(k,(PJ.todos.get(k)||[]).filter(x=>x.id!==row.id));render();toast('Note non enregistrée : '+error.message)}})();return}
  if(f.id==='todo-form'){const b=cur();if(!b||!cloudOn())return;const text=document.getElementById('td-text').value.trim();if(!text){document.getElementById('td-text').focus();return}
    const pg=parseInt(document.getElementById('td-page').value,10);
    const row={owner:ownerOf(b),book_id:b.id,id:uid('t'),text,target:view.tdTarget||'site',page:pg>0?pg:null,by_name:myName(),created_at:new Date().toISOString()};
    pjPutTodo(row);render();setTimeout(()=>document.getElementById('td-text')?.focus(),0);
    (async()=>{const {created_at,...ins}=row;const {error}=await CLOUD.sb.from('project_todos').insert(ins);if(error){const k=row.owner+'|'+row.book_id;PJ.todos.set(k,(PJ.todos.get(k)||[]).filter(x=>x.id!==row.id));render();toast('Note non enregistrée : '+error.message)}})();return}
  if(f.id==='ver-form'){const bk=books.get(view.id);if(!bk)return;const name=document.getElementById('ver-name').value.trim()||'Version manuelle';addVersion(bk.id,strip(bk),name,false);toast('Version enregistrée');return}
  if(f.id==='newbook'){const title=document.getElementById('nb-title').value.trim();const pages=parseInt(document.getElementById('nb-pages').value)||0;const year=document.getElementById('nb-year').value;
    view.newDraft={title,pages:document.getElementById('nb-pages').value,year};
    if(!title){view.newErr='Donnez un titre au livre.';render();return}
    if(pages<4||pages%4){const lo=Math.max(4,Math.floor(pages/4)*4),hi=Math.max(4,Math.ceil(pages/4)*4);view.newErr=`Le nombre de pages doit être un multiple de 4 : essayez ${lo===hi?lo:lo+' ou '+hi}.`;render();return}
    const id=uid('b');const nb=normBook({id,title,year:+year,pageCount:pages,order:books.size,useTypes:false});
    view.showNew=false;view.newErr='';view.newDraft=null;save(nb);location.hash='#livre-'+id;
    setTimeout(()=>showModal(`<h3>Dossier des photos de « ${esc(title)} »</h3><p class="muted small" style="margin:0">Choisissez le dossier où se trouvent les photos de ce livre (et le fichier InDesign). Vous pourrez en ajouter d'autres, le changer ou le retirer plus tard dans Visuel.</p><div class="row"><button class="btn primary" data-act="folder-add">${I_FOLDER} Choisir le dossier</button><button class="btn ghost" data-act="folder-later">Plus tard</button></div>`),60);return}
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

window.__atelier={idb:IDB,importMep,planMove,extendEvent,makeZip,buildJsx,buildCsv,readExif,loadFolderFiles,loadTray,lib,tray,books};
document.getElementById('restorepick').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;
  try{const d=JSON.parse(await f.text());if(!Array.isArray(d.books))throw 0;
    for(const bk of d.books){const nb=normBook(bk);const old=books.get(nb.id);if(old)record(old,strip(nb));else record(nb,strip(nb));books.set(nb.id,nb);baseline(nb);
      if(mode==='db'){const {id:_,...data}=nb;await db.doc('books/'+nb.id).set(clone(data))}}
    for(const [k,v] of Object.entries(d.captures||{}))await putCapture(k,v);
    if(mode!=='db')await saveLocal();render();toast(d.books.length+' livres restaurés')}
  catch(err){toast("Ce fichier n'est pas une sauvegarde de l'Atelier.")}});
loadUI();readHash();if(view._active!=null)view.active=view._active;boot();
})();
