// Utility helpers
const undesirableDrifters = [
  "Astral Magus",
  "Blade",
  "Draknor",
  "Illusarch",
  "Mole",
  "Revelation",
  "Sanguor"
];

const drifterFiles = [
  "data/drifters/str_drifter.json",
  "data/drifters/dex_drifter.json",
  "data/drifters/int_drifter.json",
  "data/drifters/gather_drifter.json"
];
const companionsFile = "data/companions_planner.json";

const nameAliases = {
  ShadowSeer: "Shadowseer"
};

let rawDrifters = [];
let drifters = [];
let companions = [];

let currentDrifterEffects = [];
let currentActiveCompanions = [];
let drifterSortMode = "name";
let slotEffects = {};
let useMaximizedDefault = true;

const cleanStr = (s) => (s || "").replace(/\s+/g, " ").trim();

function buildBuffText(bonus, value) {
  const b = cleanStr(bonus);
  const v = cleanStr(value);
  if (!b || b.toUpperCase() === "N/A") return "";
  return `${b} ${v}`.trim();
}

function hasSupportData(obj) {
  if (!obj) return false;
  const fields = [
    obj.supportBonus,
    obj.supportMalus,
    obj.supportBonusValue,
    obj.supportMalusValue
  ];
  return fields.some((v) => Boolean(cleanStr(v)));
}

function drifterFromJson(d) {
  if (d.show === false) return null;
  const normal = d.supportStationBonus;
  const maximized = d.maximizedSupportStationBonus;
  const normalHas = hasSupportData(normal);
  const maxHas = hasSupportData(maximized);
  const preferMax =
    d.useMaximizedSupport === true ||
    (d.useMaximizedSupport == null && useMaximizedDefault);

  let src = preferMax ? maximized : normal;

  if (!hasSupportData(src)) {
    if (!preferMax && maxHas) {
      src = maximized;
    } else if (preferMax && normalHas) {
      src = normal;
    }
  }

  if (!hasSupportData(src)) return null;

  const usingMax = src === maximized && hasSupportData(maximized);
  const name = nameAliases[d.name] || d.name;
  const buff = buildBuffText(src.supportBonus, src.supportBonusValue);
  const debuff = buildBuffText(src.supportMalus, src.supportMalusValue);
  if (!buff && !debuff) return null;

  const tier = usingMax
    ? d.maxSupportTier || "XI"
    : d.supportTier || "I";
  const level = usingMax
    ? (d.maxSupportLevel != null ? d.maxSupportLevel : 50)
    : (d.supportLevel != null ? d.supportLevel : 1);

  return {
    name,
    buff: buff || "—",
    debuff: debuff || "",
    tier: tier || "?",
    level: level != null ? level : null,
    maxed: usingMax || (!normalHas && maxHas)
  };
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao carregar ${url}: ${resp.status}`);
  return resp.json();
}

async function loadExternalData() {
  const rawLoaded = [];
  for (const file of drifterFiles) {
    const data = await fetchJson(file);
    const objs = Object.values(data.drifters || {});
    for (const obj of objs) {
      rawLoaded.push(obj);
    }
  }

  if (!rawLoaded.length) {
    throw new Error("Nenhum Drifter carregado dos arquivos JSON.");
  }
  rawDrifters = rawLoaded;
  drifters = rawDrifters
    .map((d) => drifterFromJson(d))
    .filter(Boolean);

  const compData = await fetchJson(companionsFile);
  if (!compData.companions || !compData.companions.length) {
    throw new Error("Nenhum Companion carregado do arquivo JSON.");
  }
  companions = compData.companions.map((c) => ({
    name: c.name,
    bonus: c.bonus,
    required: Number(c.required || c.driftersNeeded || 0),
    members: c.drifters,
    category: c.category || "N/A"
  }));
}

function parseEffectStr(effectStr) {
  if (!effectStr || effectStr === "—") return null;
  const m = effectStr.match(/^(.*)\s([+-]?\d+(?:\.\d+)?)(%?)$/);
  if (!m) return null;
  const label = m[1].trim();
  const value = parseFloat(m[2]);
  if (!Number.isFinite(value)) return null;
  const unit = m[3] || "";
  const key = `${label} ${unit}`;
  return { key, value, label, unit };
}

function initDrifterSelects() {
  const selects = [];
  const sortedByName = [...drifters].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (let i = 1; i <= 5; i++) {
    const sel = document.getElementById(`slot-${i}`);
    selects.push(sel);
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "—";
    sel.appendChild(empty);
    for (const d of sortedByName) {
      const opt = document.createElement("option");
      opt.value = d.name;
      opt.textContent = d.name;
      if (undesirableDrifters.includes(d.name)) {
        opt.classList.add("undesirable-name");
        opt.style.color = "#f87171";
      }
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      updateSelectOptions();
      updateBuffs();
      updateCompanions();
    });
  }
}

function updateSelectOptions() {
  const selects = [];
  const selectedByIndex = {};

  for (let i = 1; i <= 5; i++) {
    const sel = document.getElementById(`slot-${i}`);
    selects.push(sel);
    selectedByIndex[i] = sel.value || "";
  }

  const used = new Set(
    Object.values(selectedByIndex).filter((v) => v && v.length > 0)
  );

  selects.forEach((sel, idx) => {
    const ownValue = selectedByIndex[idx + 1];
    for (const opt of sel.options) {
      if (!opt.value) {
        opt.disabled = false;
        continue;
      }
      opt.disabled = used.has(opt.value) && opt.value !== ownValue;
    }
  });
}

function updateBuffs() {
  currentDrifterEffects = [];
  slotEffects = {};

  for (let i = 1; i <= 5; i++) {
    const sel = document.getElementById(`slot-${i}`);
    const buffCell = document.getElementById(`buff-${i}`);
    const debuffCell = document.getElementById(`debuff-${i}`);

    const name = sel.value;
    const drifter = drifters.find(d => d.name === name);

    if (!drifter) {
      buffCell.textContent = "–";
      debuffCell.textContent = "–";
      buffCell.classList.add("muted");
      debuffCell.classList.add("muted");
      continue;
    }

    buffCell.textContent = drifter.buff || "—";
    debuffCell.textContent = drifter.debuff || "—";

    buffCell.classList.toggle("muted", !drifter.buff);
    debuffCell.classList.toggle("muted", !drifter.debuff);

    currentDrifterEffects.push({
      slot: i,
      name: drifter.name,
      buff: drifter.buff,
      debuff: drifter.debuff
    });

    const effectsForSlot = [];
    const effBuff = parseEffectStr(drifter.buff);
    if (effBuff) effectsForSlot.push(effBuff);
    const effDebuff = parseEffectStr(drifter.debuff);
    if (effDebuff) effectsForSlot.push(effDebuff);
    slotEffects[i] = effectsForSlot;
  }

  updateIncompatibilities();
}

function buildCompanionTable() {
  const tbody = document.querySelector("#companion-table tbody");
  tbody.innerHTML = "";

  for (const comp of companions) {
    const tr = document.createElement("tr");
    tr.dataset.name = comp.name;

    const bonusTd = document.createElement("td");
    bonusTd.textContent = comp.bonus;

    const qtyTd = document.createElement("td");
    const qtyPill = document.createElement("span");
    qtyPill.className = "pill pill-qty";
    qtyPill.textContent = comp.required;
    qtyTd.appendChild(qtyPill);

    const membersTd = document.createElement("td");
    for (const name of comp.members) {
      const span = document.createElement("span");
      span.className = "comp-member";
      span.dataset.name = name;
      span.textContent = name;
      membersTd.appendChild(span);
    }

    const catTd = document.createElement("td");
    const catPill = document.createElement("span");
    catPill.className = "pill pill-cat";
    catPill.textContent = comp.category;
    catTd.appendChild(catPill);

    const statusTd = document.createElement("td");
    const statusPill = document.createElement("span");
    statusPill.className = "pill inactive";
    statusPill.textContent = "NO";
    statusTd.appendChild(statusPill);

    tr.appendChild(bonusTd);
    tr.appendChild(qtyTd);
    tr.appendChild(membersTd);
    tr.appendChild(catTd);
    tr.appendChild(statusTd);

    tbody.appendChild(tr);
  }

  updateCompanions();
}

function buildDrifterTable() {
  const tbody = document.querySelector("#drifter-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const sorted = [...drifters];

  if (drifterSortMode === "status") {
    const weight = (d) => {
      if (d.maxed) return 2;
      if (d.buff || d.debuff) return 1;
      return 0;
    };
    sorted.sort((a, b) => {
      const wa = weight(a);
      const wb = weight(b);
      if (wa !== wb) return wa - wb;
      return a.name.localeCompare(b.name);
    });
  } else {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  }

  for (const d of sorted) {
    const tr = document.createElement("tr");
    tr.dataset.name = d.name;
    tr.classList.add("drifter-table-row");

    const tdName = document.createElement("td");
    tdName.textContent = d.name;
    if (undesirableDrifters.includes(d.name)) {
      tdName.classList.add("undesirable-name");
    }

    const tdTier = document.createElement("td");
    tdTier.textContent = d.tier || "?";

    const tdLv = document.createElement("td");
    tdLv.textContent = d.level != null ? String(d.level) : "?";

    const tdBuff = document.createElement("td");
    tdBuff.textContent = d.buff || "—";

    const tdDebuff = document.createElement("td");
    tdDebuff.textContent = d.debuff || "—";

    const tdStatus = document.createElement("td");
    const badge = document.createElement("span");
    badge.classList.add("badge");
    if (d.maxed) {
      badge.classList.add("badge-max");
      badge.textContent = "MAX LV/TIER";
    } else if (d.buff || d.debuff) {
      badge.classList.add("badge-partial");
      badge.textContent = "PARCIAL";
    } else {
      badge.classList.add("badge-unknown");
      badge.textContent = "FALTA INFO";
    }
    tdStatus.appendChild(badge);

    tr.appendChild(tdName);
    tr.appendChild(tdTier);
    tr.appendChild(tdLv);
    tr.appendChild(tdBuff);
    tr.appendChild(tdDebuff);
    tr.appendChild(tdStatus);

    tbody.appendChild(tr);
  }

  updateDrifterTableHighlight();
}

function updateCompanions() {
  const selected = new Set();
  for (let i = 1; i <= 5; i++) {
    const name = document.getElementById(`slot-${i}`).value;
    if (name) selected.add(name);
  }

  currentActiveCompanions = [];

  const tbody = document.querySelector("#companion-table tbody");
  const rows = tbody.querySelectorAll("tr");

  rows.forEach((tr, index) => {
    const comp = companions[index];
    if (!comp) return;

    let count = 0;
    for (const m of comp.members) {
      if (selected.has(m)) count++;
    }

    const active = count >= comp.required;
    const statusPill = tr.querySelectorAll(".pill")[2];

    if (statusPill) {
      statusPill.textContent = active ? "ON" : "OFF";
      statusPill.className = "pill " + (active ? "active" : "inactive");
    }

    tr.classList.toggle("companion-row-active", active);

    const memberSpans = tr.querySelectorAll(".comp-member");
    memberSpans.forEach((span) => {
      const name = span.dataset.name;
      span.classList.toggle("selected", selected.has(name));
    });

    if (active) {
      currentActiveCompanions.push(comp);
    }
  });

  updateSummary();
  updateDrifterTableHighlight();
}

function updateDrifterTableHighlight() {
  const tbody = document.querySelector("#drifter-table tbody");
  if (!tbody) return;

  const selected = new Set();
  for (let i = 1; i <= 5; i++) {
    const name = document.getElementById(`slot-${i}`).value;
    if (name) selected.add(name);
  }

  tbody.querySelectorAll(".drifter-table-row").forEach((tr) => {
    const name = tr.dataset.name;
    tr.classList.toggle("active", selected.has(name));
  });
}

function updateSummary() {
  const dList = document.getElementById("summary-drifters");
  const cList = document.getElementById("summary-companions");
  const tList = document.getElementById("summary-totals");

  dList.innerHTML = "";
  cList.innerHTML = "";
  tList.innerHTML = "";

  if (currentDrifterEffects.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Nenhum Drifter selecionado.";
    dList.appendChild(li);
  } else {
    for (const eff of currentDrifterEffects) {
      const li = document.createElement("li");
      const parts = [];
      if (eff.buff) parts.push(eff.buff);
      if (eff.debuff) parts.push(eff.debuff);
      li.textContent = `${eff.name}: ${parts.join(" / ") || "—"}`;
      dList.appendChild(li);
    }
  }

  if (currentActiveCompanions.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Nenhum Companion ativo.";
    cList.appendChild(li);
  } else {
    for (const comp of currentActiveCompanions) {
      const li = document.createElement("li");
      li.textContent = `${comp.name}: ${comp.bonus} (${comp.category})`;
      cList.appendChild(li);
    }
  }

  const totals = {};
  const effects = currentDrifterEffects || [];

  function accumulate(effectStr) {
    const eff = parseEffectStr(effectStr);
    if (!eff) return;
    totals[eff.key] = (totals[eff.key] || 0) + eff.value;
  }

  for (const eff of effects) {
    if (eff.buff) accumulate(eff.buff);
    if (eff.debuff) accumulate(eff.debuff);
  }

  const activeComps = currentActiveCompanions || [];
  for (const comp of activeComps) {
    if (comp.bonus) accumulate(comp.bonus);
  }

  const totalEntries = Object.entries(totals).filter(
    ([, value]) => Math.abs(value) > 1e-6
  );

  if (totalEntries.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Nenhum efeito combinado.";
    tList.appendChild(li);
  } else {
    totalEntries
      .sort(([kA, vA], [kB, vB]) => {
        const signA = vA >= 0 ? 0 : 1;
        const signB = vB >= 0 ? 0 : 1;
        if (signA !== signB) return signA - signB;
        return kA.localeCompare(kB);
      })
      .forEach(([key, value]) => {
        const li = document.createElement("li");
        const hasPercent = key.endsWith("%");
        const label = hasPercent ? key.slice(0, -1).trim() : key.trim();
        const formatted =
          (value >= 0 ? "+" : "") +
          (hasPercent ? value.toFixed(2) + "%" : value.toFixed(2));
        li.textContent = `${label}: ${formatted}`;
        if (value > 0) {
          li.classList.add("buff");
        } else if (value < 0) {
          li.classList.add("debuff");
        }
        tList.appendChild(li);
      });
  }
}

function updateMaxToggleButton() {
  const btn = document.getElementById("toggle-max-btn");
  if (!btn) return;
  btn.classList.toggle("active", useMaximizedDefault);
  btn.textContent = useMaximizedDefault ? "Maximized ON" : "Maximized OFF";
}

function rebuildDriftersFromRaw() {
  drifters = rawDrifters
    .map((d) => drifterFromJson(d))
    .filter(Boolean);
}

function toggleMaximizedMode() {
  useMaximizedDefault = !useMaximizedDefault;
  rebuildDriftersFromRaw();
  updateMaxToggleButton();
  updateBuffs();
  buildDrifterTable();
  updateCompanions();
  updateSummary();
}

function showDataLoadError(error) {
  const layout = document.querySelector(".layout");
  if (!layout) return;
  const message =
    (error && error.message) ||
    "Não foi possível carregar os arquivos JSON.";
  layout.innerHTML = `
        <div class="card">
          <h2>Erro ao carregar dados</h2>
          <p>${message}</p>
          <p class="footer-note">
            Os dados são obtidos dos arquivos em <code>data/drifters</code> e <code>data/companions_planner.json</code>.
          </p>
        </div>
      `;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadExternalData();
  } catch (err) {
    console.error(err);
    showDataLoadError(err);
    return;
  }
  initDrifterSelects();
  updateSelectOptions();
  buildDrifterTable();
  updateBuffs();
  buildCompanionTable();
  updateSummary();
  updateMaxToggleButton();
});

document.addEventListener("click", (evt) => {
  const btn = evt.target.closest("#toggle-max-btn");
  if (btn) {
    toggleMaximizedMode();
    return;
  }

  const sortBtn = evt.target.closest(".sort-button");
  if (sortBtn) {
    const mode = sortBtn.dataset.sort;
    if (!mode || mode === drifterSortMode) return;
    drifterSortMode = mode;
    document
      .querySelectorAll(".sort-button")
      .forEach((b) => b.classList.toggle("active", b.dataset.sort === mode));
    buildDrifterTable();
    updateDrifterTableHighlight();
  }
});

function clearAllSelections() {
  for (let i = 1; i <= 5; i++) {
    const sel = document.getElementById(`slot-${i}`);
    sel.value = "";
  }
  updateSelectOptions();
  updateBuffs();
  updateCompanions();
}

function clearSlot(index) {
  const sel = document.getElementById(`slot-${index}`);
  if (!sel) return;
  sel.value = "";
  updateSelectOptions();
  updateBuffs();
  updateCompanions();
}

function updateIncompatibilities() {
  const conflictSlots = new Set();
  const sumsBySlot = {};

  for (let i = 1; i <= 5; i++) {
    const effects = slotEffects[i] || [];
    const map = {};
    for (const eff of effects) {
      map[eff.key] = (map[eff.key] || 0) + eff.value;
    }
    sumsBySlot[i] = map;
  }

  for (let a = 1; a <= 5; a++) {
    for (let b = a + 1; b <= 5; b++) {
      const mapA = sumsBySlot[a];
      const mapB = sumsBySlot[b];
      if (!mapA || !mapB) continue;

      const keys = new Set([
        ...Object.keys(mapA),
        ...Object.keys(mapB),
      ]);
      let incompatible = false;
      for (const key of keys) {
        const va = mapA[key] || 0;
        const vb = mapB[key] || 0;
        if ((va > 0 && vb < 0) || (va < 0 && vb > 0)) {
          incompatible = true;
          break;
        }
      }
      if (incompatible) {
        conflictSlots.add(a);
        conflictSlots.add(b);
      }
    }
  }

  for (let i = 1; i <= 5; i++) {
    const incompatible = conflictSlots.has(i);
    const sel = document.getElementById(`slot-${i}`);
    const selCell = sel ? sel.closest("td") : null;
    const buffCell = document.getElementById(`buff-${i}`);
    const debuffCell = document.getElementById(`debuff-${i}`);

    [selCell, buffCell, debuffCell].forEach((cell) => {
      if (!cell) return;
      cell.classList.toggle("incompatible-column", incompatible);
    });
  }
}
