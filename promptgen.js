// Prompt Generator (ported from user's index_with_fixed_prefix_v2.html)
// Requires data/<category>.txt (Chinese filenames supported via encodeURIComponent)
const GROUPS = {
  clothes: ["主題裝","泳裝","套裝","外套","上衣","褲","裙","內衣","內褲","襪"],
  scene: ["動作","表情","場景","鏡頭","羞恥","擦邊","R18"]
};
const OUTPUT_ORDER = [...GROUPS.clothes, ...GROUPS.scene];
const FORMATTERS = { "R18": (t) => `${t} sex` };
const NSFW_KEY = "NSFW";

const PREFIX_STORAGE_KEY = "promptgen_fixed_prefix_v1";
const PREFIX_REMEMBER_KEY = "promptgen_remember_prefix_v1";

const CACHE = new Map(); // category -> string[]
let lastOutput = "";

function fileUrl(category){ return `data/${encodeURIComponent(category)}.txt`; }
function parseLines(text){
  return text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !s.startsWith("#"));
}
function randPick(arr){ return (!arr||arr.length===0) ? "" : arr[Math.floor(Math.random()*arr.length)]; }
function formatTerm(category, term){ const f = FORMATTERS[category]; return f ? f(term) : term; }
function parsePrefixInput(raw){
  return (raw||"").split(/[\n,]/g).map(s=>s.trim()).filter(Boolean);
}
async function loadCategory(category){
  if (CACHE.has(category)) return CACHE.get(category);
  const url = fileUrl(category);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`讀取失敗：${url}（HTTP ${res.status}）`);
  const items = parseLines(await res.text());
  CACHE.set(category, items);
  return items;
}

function renderGroup(root, containerId, categories){
  const box = root.querySelector(`#${containerId}`);
  box.innerHTML = "";
  for (const c of categories){
    const el = document.createElement("label");
    el.className = "pill";
    el.innerHTML = `<input type="checkbox" checked data-cat="${c}"> <span>${c}</span>`;
    box.appendChild(el);
  }
}
function getSelectedCategories(root){
  return Array.from(root.querySelectorAll('input[type="checkbox"][data-cat]'))
    .filter(cb=>cb.checked).map(cb=>cb.dataset.cat);
}

function loadPrefixSettings(root){
  const remember = (()=>{try{return localStorage.getItem(PREFIX_REMEMBER_KEY);}catch(e){return null;}})();
  const rememberOn = remember === null ? true : (remember === "1");
  const rememberCb = root.querySelector("#optRememberPrefix");
  const input = root.querySelector("#fixedPrefix");
  if (!rememberCb || !input) return;
  rememberCb.checked = rememberOn;
  if (rememberOn){
    input.value = (()=>{try{return localStorage.getItem(PREFIX_STORAGE_KEY);}catch(e){return null;}})() || "";
  }
}
function wirePrefixSettings(root){
  const rememberCb = root.querySelector("#optRememberPrefix");
  const input = root.querySelector("#fixedPrefix");
  if (!rememberCb || !input) return;

  rememberCb.addEventListener("change", () => {
    try { localStorage.setItem(PREFIX_REMEMBER_KEY, rememberCb.checked ? "1" : "0"); } catch (e) {}
    if (!rememberCb.checked) {
      try { localStorage.removeItem(PREFIX_STORAGE_KEY); } catch (e) {}
    } else {
      try { localStorage.setItem(PREFIX_STORAGE_KEY, input.value || ""); } catch (e) {}
    }
  });

  input.addEventListener("input", () => {
    if (rememberCb.checked) {
      try { localStorage.setItem(PREFIX_STORAGE_KEY, input.value || ""); } catch (e) {}
    }
  });
}

async function generatePrompt(root){
  const selected = new Set(getSelectedCategories(root));
  const useNsfw = root.querySelector("#optNsfw").checked;
  const useNewline = root.querySelector("#optNewline").checked;

  const parts = [];
  const report = [];

  const prefixRaw = root.querySelector("#fixedPrefix")?.value || "";
  for (const p of parsePrefixInput(prefixRaw)) parts.push(p);

  for (const cat of OUTPUT_ORDER){
    if (!selected.has(cat)) continue;
    const items = await loadCategory(cat);
    report.push(`${cat}: ${items.length}`);
    const picked = randPick(items);
    if (picked) parts.push(formatTerm(cat, picked));
  }

  if (useNsfw){
    const items = await loadCategory(NSFW_KEY);
    report.push(`${NSFW_KEY}: ${items.length}`);
    const picked = randPick(items);
    if (picked) parts.push(picked);
  }

  const sep = useNewline ? "\n" : ", ";
  return { text: parts.join(sep), report: report.join(" | ") };
}

export function mountPromptGen(mountEl){
  mountEl.innerHTML = `
    <div class="row">
      <div>
        <div class="hint" style="margin-bottom:8px;font-weight:700">服裝區</div>
        <div id="boxClothes" style="display:flex;flex-wrap:wrap;gap:8px"></div>
      </div>
      <div>
        <div class="hint" style="margin-bottom:8px;font-weight:700">場景區</div>
        <div id="boxScene" style="display:flex;flex-wrap:wrap;gap:8px"></div>

        <div class="sep"></div>
        <div class="hint" style="font-weight:700">選項</div>
        <label class="pill"><input type="checkbox" id="optNsfw"><span>添加 NSFW</span></label>
        <label class="pill"><input type="checkbox" id="optNewline"><span>用換行分隔</span></label>

        <div class="sep"></div>
        <div class="hint" style="font-weight:700">固定詞（永遠放最前面）</div>
        <input id="fixedPrefix" placeholder="每行或逗號分隔，例如：masterpiece, best quality" />
        <label class="pill"><input type="checkbox" id="optRememberPrefix" checked><span>記住固定詞</span></label>
      </div>
    </div>

    <div class="btnbar" style="margin-top:10px">
      <button class="ghost" id="btnAll">全選</button>
      <button class="ghost" id="btnNone">全不選</button>
      <button id="btnGeneratePG">Generate</button>
      <button class="ghost" id="btnCopyPG">Copy</button>
    </div>
    <div class="status" id="pgStatus"></div>
    <pre id="pgOutput" style="margin-top:10px"></pre>
  `;

  renderGroup(mountEl, "boxClothes", GROUPS.clothes);
  renderGroup(mountEl, "boxScene", GROUPS.scene);
  loadPrefixSettings(mountEl);
  wirePrefixSettings(mountEl);

  mountEl.querySelector("#btnGeneratePG").addEventListener("click", async () => {
    try{
      mountEl.querySelector("#pgOutput").textContent = "Generating...";
      const { text, report } = await generatePrompt(mountEl);
      lastOutput = text || "";
      mountEl.querySelector("#pgOutput").textContent = text || "(空)";
      mountEl.querySelector("#pgStatus").textContent = report;
    }catch(e){
      mountEl.querySelector("#pgOutput").textContent = "";
      mountEl.querySelector("#pgStatus").textContent = "";
      alert(e.message || String(e));
    }
  });

  mountEl.querySelector("#btnCopyPG").addEventListener("click", async () => {
    const t = (mountEl.querySelector("#pgOutput").textContent || "").trim();
    if (!t) return;
    await navigator.clipboard.writeText(t);
    alert("Copied ✅");
  });

  mountEl.querySelector("#btnAll").addEventListener("click", () => {
    mountEl.querySelectorAll('input[type="checkbox"][data-cat]').forEach(cb => cb.checked = true);
  });
  mountEl.querySelector("#btnNone").addEventListener("click", () => {
    mountEl.querySelectorAll('input[type="checkbox"][data-cat]').forEach(cb => cb.checked = false);
  });
}

export function getPromptGenOutput(){ return lastOutput; }
