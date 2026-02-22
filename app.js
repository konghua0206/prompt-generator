import { mountPromptGen, getPromptGenOutput } from './promptgen.js';

// ---------------- Storage keys ----------------
const LS_PRESETS = 'nai_presets_v1';
const LS_HISTORY = 'nai_history_v1'; // [{ts, thumbDataUrl, seed, w,h,steps,cfg,sampler, main,char,neg}]
const LS_SEEDS   = 'nai_seed_history_v1';
const MAX_HISTORY = 24;
const MAX_SEEDS = 50;

// ---------------- Helpers ----------------
const $ = (id) => document.getElementById(id);
const nowTs = () => new Date().toISOString();

function safeJsonParse(s, fallback){
  try{ return JSON.parse(s); }catch(e){ return fallback; }
}
function getPresets(){ return safeJsonParse(localStorage.getItem(LS_PRESETS)||'[]', []); }
function setPresets(v){ localStorage.setItem(LS_PRESETS, JSON.stringify(v)); }
function getHistory(){ return safeJsonParse(localStorage.getItem(LS_HISTORY)||'[]', []); }
function setHistory(v){ localStorage.setItem(LS_HISTORY, JSON.stringify(v)); }
function getSeeds(){ return safeJsonParse(localStorage.getItem(LS_SEEDS)||'[]', []); }
function setSeeds(v){ localStorage.setItem(LS_SEEDS, JSON.stringify(v)); }

function clampHistory(arr){
  if (arr.length > MAX_HISTORY) return arr.slice(0, MAX_HISTORY);
  return arr;
}

function setStatus(msg, cls=''){
  const el = $('status');
  el.className = 'status ' + cls;
  el.textContent = msg;
}

function openOverlay(id){ $(id).style.display='block'; }
function closeOverlay(id){ $(id).style.display='none'; }

function combinePrompt(main, charPrompt){
  const c = (charPrompt||'').trim();
  const m = (main||'').trim();
  if (c && m) return `${c}, ${m}`;
  return c || m;
}

function settingsSnapshot(){
  return {
    width: +$('width').value,
    height: +$('height').value,
    steps: +$('steps').value,
    cfg: +$('cfg').value,
    sampler: $('sampler').value,
    seed: +$('seed').value,
    batch: +$('batch').value,
    storePrompts: !!$('optStorePrompts').checked,
    storeImages: !!$('optStoreImages').checked,
  };
}

function applySettingsSnapshot(s){
  if (!s) return;
  if (typeof s.width === 'number') $('width').value = s.width;
  if (typeof s.height === 'number') $('height').value = s.height;
  if (typeof s.steps === 'number') $('steps').value = s.steps;
  if (typeof s.cfg === 'number') $('cfg').value = s.cfg;
  if (typeof s.sampler === 'string') $('sampler').value = s.sampler;
  if (typeof s.seed === 'number') $('seed').value = s.seed;
  if (typeof s.batch === 'number') $('batch').value = s.batch;
}

function updateSizePresetFromWH(){
  const w = +$('width').value, h = +$('height').value;
  const presets = { '768x768': [768,768], '512x768':[512,768], '768x512':[768,512], '1024x1024':[1024,1024] };
  for (const [k,[pw,ph]] of Object.entries(presets)){
    if (w===pw && h===ph){ $('sizePreset').value = k; return; }
  }
  $('sizePreset').value = 'custom';
}

function saveSeed(seed){
  if (!Number.isFinite(seed)) return;
  const seeds = getSeeds();
  const next = [seed, ...seeds.filter(x=>x!==seed)].slice(0, MAX_SEEDS);
  setSeeds(next);
  renderSeedHistory();
}

// Convert Blob -> dataURL for thumbnail storage
async function blobToDataUrl(blob){
  return await new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(String(r.result||''));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function renderHistory(){
  const hist = getHistory();
  $('histCount').textContent = String(hist.length);
  const grid = $('historyGrid');
  grid.innerHTML = '';
  for (const item of hist){
    const div = document.createElement('div');
    div.className = 'thumb';
    const img = document.createElement('img');
    img.src = item.thumbDataUrl || '';
    img.alt = 'history';
    img.loading = 'lazy';
    img.addEventListener('click', () => {
      // Load prompts + settings back
      $('promptMain').value = item.main || '';
      $('promptChar').value = item.char || '';
      $('promptNeg').value = item.neg || '';
      applySettingsSnapshot({
        width:item.w, height:item.h, steps:item.steps, cfg:item.cfg, sampler:item.sampler, seed:item.seed, batch:1
      });
      $('lastSeed').textContent = String(item.seed ?? '-');
      setStatus('已從歷史載入設定/提示詞 ✅','ok');
      window.scrollTo({top:0, behavior:'smooth'});
    });
    const meta = document.createElement('div');
    meta.className='meta';
    meta.innerHTML = `<span class="mono">${item.w}×${item.h}</span><span class="mono">seed ${item.seed}</span>`;
    div.appendChild(img);
    div.appendChild(meta);
    grid.appendChild(div);
  }
}

function renderSeedHistory(){
  const seeds = getSeeds();
  const el = $('seedList');
  if (!seeds.length){ el.innerHTML = '<span class="muted">（尚無）</span>'; return; }
  el.innerHTML = seeds.map(s => `<span class="pill mono" style="margin:0 8px 8px 0;cursor:pointer" data-seed="${s}">${s}</span>`).join('');
  el.querySelectorAll('[data-seed]').forEach(p => {
    p.addEventListener('click', () => {
      $('seed').value = p.getAttribute('data-seed');
      $('lastSeed').textContent = p.getAttribute('data-seed');
      setStatus('Seed 已套用 ✅','ok');
      closeOverlay('ovHistory');
    });
  });
}

function renderPresetList(){
  const list = $('presetList');
  const presets = getPresets();
  if (!presets.length){
    list.innerHTML = '<div class="hint">（尚無 presets）</div>';
    return;
  }
  list.innerHTML = '';
  for (const p of presets){
    const row = document.createElement('div');
    row.className='card';
    row.style.margin='10px 0';
    row.style.background='rgba(255,255,255,.02)';
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
        <div>
          <div style="font-weight:800">${escapeHtml(p.name||'Unnamed')}</div>
          <div class="hint mono">${(p.settings?.width||'?')}×${(p.settings?.height||'?')} steps ${(p.settings?.steps||'?')} cfg ${(p.settings?.cfg||'?')} sampler ${(p.settings?.sampler||'?')}</div>
        </div>
        <div class="btnbar" style="justify-content:flex-end">
          <button class="ghost" data-act="load" data-name="${encodeAttr(p.name)}">Load</button>
          <button class="danger" data-act="del" data-name="${encodeAttr(p.name)}">Delete</button>
        </div>
      </div>
    `;
    list.appendChild(row);
  }
  list.querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      const name = btn.getAttribute('data-name');
      if (act === 'load'){
        const p = getPresets().find(x => x.name === name);
        if (!p) return;
        $('promptMain').value = p.prompts?.main || '';
        $('promptChar').value = p.prompts?.char || '';
        $('promptNeg').value = p.prompts?.neg || '';
        applySettingsSnapshot(p.settings);
        updateSizePresetFromWH();
        setStatus(`已載入 preset：${name} ✅`,'ok');
        closeOverlay('ovPresets');
        window.scrollTo({top:0, behavior:'smooth'});
      }else if (act === 'del'){
        const next = getPresets().filter(x => x.name !== name);
        setPresets(next);
        renderPresetList();
      }
    });
  });
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function encodeAttr(s){
  return String(s||'').replace(/"/g,'&quot;');
}

// ---------------- Prompt overlay tabs ----------------
function wireTabs(){
  const buttons = Array.from(document.querySelectorAll('#ovPrompts .tabs button'));
  const panels = { tMain:$('tMain'), tNeg:$('tNeg'), tChar:$('tChar') };
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      for (const k of Object.keys(panels)) panels[k].style.display = (k===tab) ? 'block' : 'none';
    });
  });
}

// ---------------- NovelAI request ----------------
// NOTE: Pure GitHub Pages may hit CORS depending on NovelAI; this is a functional implementation.
// If CORS blocks, user must use a proxy backend.
async function requestOneImage(token, payload){
  const resp = await fetch('https://image.novelai.net/ai/generate-image', {
    method:'POST',
    headers:{
      'Authorization': 'Bearer ' + token,
      'Content-Type':'application/json',
      'Accept':'image/png'
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok){
    const t = await resp.text().catch(()=>'');
    throw new Error(`HTTP ${resp.status}: ${t.slice(0,400)}`);
  }
  const blob = await resp.blob();
  return blob;
}

// ---------------- Generate flow (supports batch + grid) ----------------
async function generate(){
  const token = $('token').value.trim();
  if (!token){ alert('Token required'); return; }

  const main = $('promptMain').value;
  const charP = $('promptChar').value;
  const neg = $('promptNeg').value;

  const s = settingsSnapshot();
  const combined = combinePrompt(main, charP);
  if (!combined.trim()){ alert('請輸入主提示詞或人物提示詞'); return; }

  $('debug').style.display='none';
  $('debug').textContent='';
  $('resultArea').innerHTML = '';
  setStatus('Generating...','warn');
  $('btnGenerate').disabled = true;
  $('tbGenerate').disabled = true;

  const baseSeed = s.seed;
  const batch = Math.max(1, Math.min(12, s.batch || 1));

  const payloadBase = {
    input: combined,
    model: 'nai-diffusion',
    parameters: {
      width: s.width, height: s.height,
      steps: s.steps,
      scale: s.cfg,
      sampler: s.sampler,
      seed: baseSeed,
      n_samples: 1,
      uc: neg
    }
  };

  const imgs = [];
  for (let i=0; i<batch; i++){
    const seedToUse = (baseSeed === -1) ? -1 : (baseSeed + i);
    const payload = structuredClone(payloadBase);
    payload.parameters.seed = seedToUse;

    setStatus(`Generating... (${i+1}/${batch})`,'warn');

    try{
      const blob = await requestOneImage(token, payload);
      // create on-page result
      const url = URL.createObjectURL(blob);
      imgs.push({ url, blob, seedUsed: seedToUse });

      // Determine actual seed if returned seed was -1: we don't have it from API response here.
      // We'll set lastSeed to provided seedToUse; if -1, show 'random'.
      $('lastSeed').textContent = (seedToUse === -1) ? 'random' : String(seedToUse);

    }catch(e){
      $('debug').style.display='block';
      $('debug').textContent = String(e?.message || e);
      setStatus('Error（可能是 CORS 或 token/參數錯誤）','err');
      break;
    }
  }

  // render results as grid
  if (imgs.length){
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const it of imgs){
      const wrap = document.createElement('div');
      wrap.className='thumb';
      const img = document.createElement('img');
      img.src = it.url;
      img.alt = 'generated';
      const meta = document.createElement('div');
      meta.className='meta';
      meta.innerHTML = `<span class="mono">${s.width}×${s.height}</span><span class="mono">${it.seedUsed===-1?'seed ?':('seed '+it.seedUsed)}</span>`;
      wrap.appendChild(img); wrap.appendChild(meta);
      grid.appendChild(wrap);
    }
    $('resultArea').appendChild(grid);
    setStatus('Done ✅','ok');
  }

  // persist history/presets components if enabled
  if (imgs.length && s.storeImages){
    // store first image as thumbnail for each (capped)
    const hist = getHistory();
    for (const it of imgs){
      const thumb = await blobToDataUrl(it.blob).catch(()=>'');
      const item = {
        ts: nowTs(),
        thumbDataUrl: thumb,
        seed: it.seedUsed,
        w: s.width, h: s.height, steps: s.steps, cfg: s.cfg, sampler: s.sampler,
        main: s.storePrompts ? main : '',
        char: s.storePrompts ? charP : '',
        neg: s.storePrompts ? neg : ''
      };
      hist.unshift(item);
      saveSeed(it.seedUsed);
    }
    setHistory(clampHistory(hist));
    renderHistory();
  }else if (imgs.length){
    // still store seeds if images not stored
    for (const it of imgs) saveSeed(it.seedUsed);
  }

  $('btnGenerate').disabled = false;
  $('tbGenerate').disabled = false;
}

// ---------------- Copy combined prompt ----------------
function copyCombined(){
  const combined = combinePrompt($('promptMain').value, $('promptChar').value);
  const neg = $('promptNeg').value.trim();
  const txt = `PROMPT:\n${combined}\n\nNEGATIVE:\n${neg}`;
  navigator.clipboard.writeText(txt).then(()=>setStatus('Copied ✅','ok'));
}

// ---------------- Wire UI events ----------------
function init(){
  // prompt generator
  mountPromptGen($('promptgenMount'));

  // overlays open/close
  const openPrompts = () => {
    $('pMain2').value = $('promptMain').value;
    $('pNeg2').value = $('promptNeg').value;
    $('pChar2').value = $('promptChar').value;
    openOverlay('ovPrompts');
  };
  const applyPrompts = () => {
    $('promptMain').value = $('pMain2').value;
    $('promptNeg').value = $('pNeg2').value;
    $('promptChar').value = $('pChar2').value;
    setStatus('提示詞已套用 ✅','ok');
  };

  $('btnOpenPrompts').addEventListener('click', openPrompts);
  $('tbPrompts').addEventListener('click', openPrompts);
  $('btnClosePrompts').addEventListener('click', ()=>closeOverlay('ovPrompts'));
  $('btnApplyPrompts').addEventListener('click', ()=>{ applyPrompts(); closeOverlay('ovPrompts'); });

  $('btnPGtoMain').addEventListener('click', () => {
    const out = getPromptGenOutput();
    if (!out) return alert('請先在產生器按 Generate');
    $('pMain2').value = out;
    setStatus('已把產生器輸出放到「主」tab（記得套用）','ok');
  });
  $('btnPGtoChar').addEventListener('click', () => {
    const out = getPromptGenOutput();
    if (!out) return alert('請先在產生器按 Generate');
    $('pChar2').value = out;
    setStatus('已把產生器輸出放到「人物」tab（記得套用）','ok');
  });

  // settings overlay
  const openSettings = () => openOverlay('ovSettings');
  $('btnOpenSettings').addEventListener('click', openSettings);
  $('tbSettings').addEventListener('click', openSettings);
  $('btnCloseSettings').addEventListener('click', ()=>closeOverlay('ovSettings'));

  $('sizePreset').addEventListener('change', () => {
    const v = $('sizePreset').value;
    if (v === 'custom') return;
    const [w,h] = v.split('x').map(Number);
    $('width').value = w; $('height').value = h;
  });
  $('width').addEventListener('input', updateSizePresetFromWH);
  $('height').addEventListener('input', updateSizePresetFromWH);

  $('btnResetSettings').addEventListener('click', () => {
    $('sizePreset').value = '768x768';
    $('width').value = 768; $('height').value = 768;
    $('steps').value = 28; $('cfg').value = 11;
    $('sampler').value = 'k_euler_ancestral';
    $('seed').value = -1; $('batch').value = 1;
    $('optStorePrompts').checked = true;
    $('optStoreImages').checked = true;
    setStatus('Settings reset ✅','ok');
  });

  // presets overlay
  $('btnOpenPresets').addEventListener('click', ()=>{ renderPresetList(); openOverlay('ovPresets'); });
  $('btnClosePresets').addEventListener('click', ()=>closeOverlay('ovPresets'));

  $('btnSavePreset').addEventListener('click', () => {
    const name = ($('presetName').value || '').trim();
    if (!name) return alert('請輸入 preset 名稱');
    const presets = getPresets().filter(p=>p.name !== name);
    presets.unshift({
      name,
      prompts: { main:$('promptMain').value, char:$('promptChar').value, neg:$('promptNeg').value },
      settings: settingsSnapshot(),
      ts: nowTs()
    });
    setPresets(presets);
    $('presetName').value='';
    renderPresetList();
    setStatus('Preset saved ✅','ok');
  });

  $('btnClearPresets').addEventListener('click', () => {
    if (!confirm('確定清空所有 presets？')) return;
    localStorage.removeItem(LS_PRESETS);
    renderPresetList();
  });

  // history overlay
  $('btnOpenHistory').addEventListener('click', ()=>{ renderSeedHistory(); openOverlay('ovHistory'); });
  $('btnCloseHistory').addEventListener('click', ()=>closeOverlay('ovHistory'));
  $('btnClearHistory').addEventListener('click', () => {
    if (!confirm('確定清空歷史與 seed 記錄？')) return;
    localStorage.removeItem(LS_HISTORY);
    localStorage.removeItem(LS_SEEDS);
    renderHistory();
    renderSeedHistory();
    setStatus('History cleared ✅','ok');
  });

  // token clear (RAM only)
  $('btnClearToken').addEventListener('click', () => $('token').value='');

  // generate
  $('btnGenerate').addEventListener('click', generate);
  $('tbGenerate').addEventListener('click', generate);

  // copy combined
  $('btnCopyCombined').addEventListener('click', copyCombined);

  // tabs
  wireTabs();

  // initial render
  renderHistory();
  renderSeedHistory();
  updateSizePresetFromWH();
}
init();
