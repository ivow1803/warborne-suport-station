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

const statTypeMap = {
  "Armor": "armor",
  "Magic Resistance": "magic_resist",
  "Attack Speed Bonus": "attack_speed",
  "Skill Cooldown Rate Bonus": "skill_cdr",
  "Physical Damage Bonus": "physical_dmg_bonus",
  "Magic Damage Bonus": "magic_dmg_bonus",
  "Healing Bonus": "healing_bonus",
  "Damage Bonus (PvE)": "dmg_bonus_pve",
  "Critical Rate": "crit_rate",
  "Max HP Bonus": "max_hp_bonus",
  "Max MP Bonus": "max_mp_bonus",
  "Control Resistance": "control_resist_base",
  "Base Control Resistance": "control_resist_base"
};

let rawDrifters = [];
let drifters = [];
let companions = [];
let driftersById = {};
let rawDriftersById = {};

let currentDrifterEffects = [];
let currentActiveCompanions = [];
let drifterSortMode = "name";
let slotEffects = {};
let useMaximizedDefault = true;
let drifterNameById = {};
let mainDrifterId = "";
let mainStatsSortMode = "alpha";
let currentTotalsByType = {};
let mainDrifterLevel = 1;
let mainDrifterMaxLevel = 50;
let customAttrs = {
  STR: null,
  DEX: null,
  INT: null
};

const cleanStr = (s) => (s || "").replace(/\s+/g, " ").trim();

function buildBuffText(bonus, value) {
  const b = cleanStr(bonus);
  const v = cleanStr(value);
  if (!b || b.toUpperCase() === "N/A") return "";
  return `${b} ${v}`.trim();
}

function parseStatValue(raw) {
  if (raw == null) return { raw };
  const s = String(raw).trim();
  if (!s) return { raw };
  const hasPercent = s.includes("%");
  const num = parseFloat(s.replace("%", "").trim());
  if (!Number.isFinite(num)) return { raw };
  return { value: num, unit: hasPercent ? "%" : "", raw };
}

function drifterFromJson(d) {
  if (d.show === false) return null;
  const name = nameAliases[d.name] || d.name;
  const preferMax =
    d.useMaximizedSupport === true ||
    (d.useMaximizedSupport == null && useMaximizedDefault);
  const src = preferMax ? d.maximizedSupportStationBonus : d.supportStationBonus;
  const buff = buildBuffText(src.supportBonus, src.supportBonusValue);
  const debuff = buildBuffText(src.supportMalus, src.supportMalusValue);
  const typeBuff = src.type_buff || null;
  const typeDebuff = src.type_debuff || null;
  const tier = preferMax ? d.maxSupportTier || "XI" : d.supportTier || "I";
  const level = preferMax
    ? (d.maxSupportLevel != null ? d.maxSupportLevel : 50)
    : (d.supportLevel != null ? d.supportLevel : 1);

  return {
    id: d.gameId,
    name,
    buff: buff || "—",
    debuff: debuff || "—",
    typeBuff,
    typeDebuff,
    tier,
    level,
    maxed: preferMax
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
  rawDriftersById = Object.fromEntries(rawDrifters.map((r) => [r.gameId, r]));
  drifters = rawDrifters.map((d) => drifterFromJson(d)).filter(Boolean);
  driftersById = Object.fromEntries(drifters.map((d) => [d.id, d]));
  drifterNameById = Object.fromEntries(drifters.map((d) => [d.id, d.name]));

  const compData = await fetchJson(companionsFile);
  if (!compData.companions || !compData.companions.length) {
    throw new Error("Nenhum Companion carregado do arquivo JSON.");
  }
  companions = compData.companions.map((c) => ({
    name: c.name,
    bonus: c.bonus,
    required: Number(c.required || c.driftersNeeded || 0),
    memberIds: c.drifterIds || [],
    type_bonus: c.type_bonus,
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
  return { value, label, unit };
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
      opt.value = d.id;
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

  const mainSel = document.getElementById("main-drifter");
  if (mainSel && !mainSel.dataset.initialized) {
    mainSel.addEventListener("change", () => {
      mainDrifterId = mainSel.value || "";
      resetMainDrifterLevel();
      resetCustomAttrs();
      renderMainDrifterStats();
    });
    mainSel.dataset.initialized = "1";
  }
  populateMainDrifterSelect();

  const levelControls = document.getElementById("main-level-controls");
  if (levelControls && !levelControls.dataset.initialized) {
    levelControls.addEventListener("click", (e) => {
      const btn = e.target.closest(".lvl-btn");
      if (!btn) return;
      const step = Number(btn.dataset.step || 0);
      if (!Number.isFinite(step) || !mainDrifterId) return;
      setMainDrifterLevel(mainDrifterLevel + step);
      renderMainDrifterStats();
    });
    levelControls.dataset.initialized = "1";
  }
  updateMainLevelLabel();
}

function populateMainDrifterSelect() {
  const sel = document.getElementById("main-drifter");
  if (!sel) return;
  const current = sel.value || mainDrifterId || "";
  sel.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "—";
  sel.appendChild(empty);
  const sorted = [...drifters].sort((a, b) => a.name.localeCompare(b.name));
  for (const d of sorted) {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.name;
    sel.appendChild(opt);
  }
  const nextValue = sorted.find((d) => d.id === current) ? current : "";
  sel.value = nextValue;
  mainDrifterId = nextValue;
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

    const drifterId = sel.value;
    const drifter = driftersById[drifterId];

    if (!drifter) {
      buffCell.textContent = "–";
      debuffCell.textContent = "–";
      buffCell.classList.add("muted");
      debuffCell.classList.add("muted");
      slotEffects[i] = [];
      continue;
    }

    buffCell.textContent = drifter.buff || "—";
    debuffCell.textContent = drifter.debuff || "—";

    buffCell.classList.remove("muted");
    debuffCell.classList.remove("muted");

    currentDrifterEffects.push({
      slot: i,
      id: drifter.id,
      name: drifter.name,
      buff: drifter.buff,
      debuff: drifter.debuff,
      typeBuff: drifter.typeBuff,
      typeDebuff: drifter.typeDebuff
    });

    const effectsForSlot = [];
    const effBuff = parseEffectStr(drifter.buff);
    if (effBuff) effectsForSlot.push({ ...effBuff, type: drifter.typeBuff });
    const effDebuff = parseEffectStr(drifter.debuff);
    if (effDebuff) effectsForSlot.push({ ...effDebuff, type: drifter.typeDebuff });
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
    const members = comp.memberIds;
    for (const id of members) {
      const span = document.createElement("span");
      span.className = "comp-member";
      span.dataset.id = id;
      span.textContent = drifterNameById[id];
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
    tr.dataset.id = d.id;
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
    const id = document.getElementById(`slot-${i}`).value;
    if (id) selected.add(id);
  }

  currentActiveCompanions = [];

  const tbody = document.querySelector("#companion-table tbody");
  const rows = tbody.querySelectorAll("tr");

  rows.forEach((tr, index) => {
    const comp = companions[index];
    if (!comp) return;

    let count = 0;
    for (const m of comp.memberIds) {
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
      const id = span.dataset.id || span.dataset.name;
      span.classList.toggle("selected", selected.has(id));
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
    const id = document.getElementById(`slot-${i}`).value;
    if (id) selected.add(id);
  }

  tbody.querySelectorAll(".drifter-table-row").forEach((tr) => {
    const id = tr.dataset.id;
    tr.classList.toggle("active", selected.has(id));
  });
}

function updateSummary() {
  const dList = document.getElementById("summary-drifters");
  const cList = document.getElementById("summary-companions");
  const tList = document.getElementById("summary-totals");
  const mainList = document.getElementById("summary-main-stats");

  dList.innerHTML = "";
  cList.innerHTML = "";
  tList.innerHTML = "";
  if (mainList) mainList.innerHTML = "";

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

  function accumulateFrom(effectStr, type) {
    if (!type) return;
    const eff = parseEffectStr(effectStr);
    if (!eff) return;
    const entry = totals[type] || { value: 0, label: eff.label, unit: eff.unit };
    entry.value += eff.value;
    totals[type] = entry;
  }

  for (const eff of effects) {
    if (eff.buff) accumulateFrom(eff.buff, eff.typeBuff);
    if (eff.debuff) accumulateFrom(eff.debuff, eff.typeDebuff);
  }

  const activeComps = currentActiveCompanions || [];
  for (const comp of activeComps) {
    if (comp.bonus) accumulateFrom(comp.bonus, comp.type_bonus);
  }

  const totalEntries = Object.entries(totals).filter(
    ([, data]) => Math.abs(data.value) > 1e-6
  );
  currentTotalsByType = totals;

  const buckets = {
    ataque: [],
    defesa: [],
    cura: [],
    outros: []
  };

  function categorize(label) {
    const l = label.toLowerCase();
    if (l.includes("damage") || l.includes("attack") || l.includes("critical") || l.includes("melee") || l.includes("ranged") || l.includes("skill")) {
      return "ataque";
    }
    if (l.includes("resistance") || l.includes("armor") || l.includes("hp") || l.includes("def")) {
      return "defesa";
    }
    if (l.includes("healing") || l.includes("heal")) {
      return "cura";
    }
    return "outros";
  }

  function renderBucket(key, entries) {
    if (!entries.length) return;
    const title = {
      ataque: "Ataque",
      defesa: "Defesa",
      cura: "Cura/Suporte",
      outros: "Outros"
    }[key] || key;

    const header = document.createElement("li");
    header.className = "muted";
    header.textContent = title;
    tList.appendChild(header);

    entries
      .sort(([, , , vA], [, , , vB]) => {
        const sA = vA > 0 ? -1 : vA < 0 ? 1 : 0; // buff first, then debuff
        const sB = vB > 0 ? -1 : vB < 0 ? 1 : 0;
        if (sA !== sB) return sA - sB;
        return 0;
      })
      .forEach(([label, value, cls]) => {
        const li = document.createElement("li");
        li.textContent = `${label}: ${value}`;
        if (cls) li.classList.add(cls);
        tList.appendChild(li);
      });
  }

  if (totalEntries.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Nenhum efeito combinado.";
    tList.appendChild(li);
  } else {
    totalEntries.forEach(([type, data]) => {
      const label = data.label || type;
      const hasPercent = (data.unit || "").includes("%");
      const formatted =
        (data.value >= 0 ? "+" : "") +
        (hasPercent ? data.value.toFixed(2) + "%" : data.value.toFixed(2));
      const cls = data.value > 0 ? "buff" : data.value < 0 ? "debuff" : "";
      buckets[categorize(label)].push([label, formatted, cls, data.value]);
    });

    renderBucket("ataque", buckets.ataque);
    renderBucket("defesa", buckets.defesa);
    renderBucket("cura", buckets.cura);
    renderBucket("outros", buckets.outros);
  }

  renderMainDrifterStats(mainList);
}

function renderMainDrifterStats(targetList) {
  initAttrInputs();
  const list = targetList || document.getElementById("summary-main-stats");
  if (!list) return;
  list.innerHTML = "";
  if (!mainDrifterId) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Nenhum Main Drifter selecionado.";
    list.appendChild(li);
    return;
  }
  const raw = rawDriftersById[mainDrifterId];
  if (!raw) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Stats não encontrados para o Main Drifter.";
    list.appendChild(li);
    return;
  }
  const entries = raw.stats
    ? Object.entries(raw.stats).filter(([, v]) => v != null && String(v).trim().length > 0)
    : [];

  const preferMax =
    raw.useMaximizedSupport === true ||
    (raw.useMaximizedSupport == null && useMaximizedDefault);
  const supportSrc = preferMax
    ? raw.maximizedSupportStationBonus || raw.supportStationBonus
    : raw.supportStationBonus;

  const addHeader = (text) => {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = text;
    list.appendChild(li);
  };

  const addLine = (text, cls) => {
    const li = document.createElement("li");
    li.textContent = text;
    if (cls) li.classList.add(cls);
    list.appendChild(li);
  };

  // Base attributes
  const baseAttrs = [
    ["Strength", raw.baseStr, raw.strBonus],
    ["Dexterity", raw.baseDex, raw.dexBonus],
    ["Intelligence", raw.baseInt, raw.intBonus]
  ].filter(([, base]) => base != null);

  // Attribute gains per level (n-1 levels)
  const attrPerLevel = {
    STR: parseFloat(raw.strBonus || 0) || 0,
    DEX: parseFloat(raw.dexBonus || 0) || 0,
    INT: parseFloat(raw.intBonus || 0) || 0
  };
  const gainedAttrs = {
    STR: attrPerLevel.STR * Math.max(0, mainDrifterLevel - 1),
    DEX: attrPerLevel.DEX * Math.max(0, mainDrifterLevel - 1),
    INT: attrPerLevel.INT * Math.max(0, mainDrifterLevel - 1)
  };

  // Attribute-derived stat bonuses per point
  const attrBonusMap = {
    STR: [
      ["Max HP Bonus", 0.25, "%"],
      ["Base Damage and Healing Bonus", 0.05, "%"],
      ["Damage Bonus (PvE)", 0.1, "%"],
      ["Block", 0.5, ""],
      ["Control Resistance", 0.1, ""]
    ],
    DEX: [
      ["Attack Speed Bonus", 0.18, "%"],
      ["Critical Rate", 0.05, "%"],
      ["Physical Damage Bonus", 0.25, "%"],
      ["Tenacity Penetration", 0.15, ""],
      ["Armor", 0.15, ""]
    ],
    INT: [
      ["MP", 0.5, ""],
      ["Casting Speed Bonus", 0.3, "%"],
      ["Skill Cooldown Rate Bonus", 0.06, "%"],
      ["Magic Damage Bonus", 0.25, "%"],
      ["Healing Bonus", 0.25, "%"],
      ["Magic Resistance", 0.15, ""]
    ]
  };

  const actualAttrs = {
    STR:
      customAttrs.STR != null
        ? customAttrs.STR
        : baseAttrs.find(([lbl]) => lbl === "Strength")
        ? parseFloat(baseAttrs.find(([lbl]) => lbl === "Strength")[1]) +
          attrPerLevel.STR * Math.max(0, mainDrifterLevel - 1)
        : null,
    DEX:
      customAttrs.DEX != null
        ? customAttrs.DEX
        : baseAttrs.find(([lbl]) => lbl === "Dexterity")
        ? parseFloat(baseAttrs.find(([lbl]) => lbl === "Dexterity")[1]) +
          attrPerLevel.DEX * Math.max(0, mainDrifterLevel - 1)
        : null,
    INT:
      customAttrs.INT != null
        ? customAttrs.INT
        : baseAttrs.find(([lbl]) => lbl === "Intelligence")
        ? parseFloat(baseAttrs.find(([lbl]) => lbl === "Intelligence")[1]) +
          attrPerLevel.INT * Math.max(0, mainDrifterLevel - 1)
        : null
  };

  const attrAdjust = {};
  for (const [attr, rows] of Object.entries(attrBonusMap)) {
    const baseVal =
      attr === "STR"
        ? parseFloat(raw.baseStr || 0) || 0
        : attr === "DEX"
        ? parseFloat(raw.baseDex || 0) || 0
        : parseFloat(raw.baseInt || 0) || 0;
    const actual = actualAttrs[attr];
    const gain =
      actual != null && Number.isFinite(actual)
        ? actual - baseVal
        : gainedAttrs[attr] || 0;
    for (const [statKey, perPoint, unit] of rows) {
      const inc = gain * perPoint;
      if (!attrAdjust[statKey]) attrAdjust[statKey] = { value: 0, unit };
      attrAdjust[statKey].value += inc;
    }
  }

  if (baseAttrs.length) {
    addHeader("Atributos base (+ por nível)");
    baseAttrs.forEach(([label, base, per]) => {
      const baseNum = parseFloat(base);
      const perNum = parseFloat(per);
      const attrKey =
        label === "Strength" ? "STR" : label === "Dexterity" ? "DEX" : "INT";
      const custom = actualAttrs[attrKey];
      const scaled =
        custom != null && Number.isFinite(custom)
          ? custom
          : Number.isFinite(baseNum) && Number.isFinite(perNum)
          ? baseNum + perNum * Math.max(0, mainDrifterLevel - 1)
          : null;
      const perText = per != null && String(per).trim() !== "" ? ` (+${per} por nível)` : "";
      const baseText = scaled != null ? scaled.toFixed(2) : base;
      addLine(`${label}: ${baseText}${perText}`);
    });
  }

  // Update inputs shown in UI
  updateAttrInputs(actualAttrs);

  // Support station bonus/malus
  if (supportSrc && (supportSrc.supportBonus || supportSrc.supportMalus)) {
    addHeader("Support Station");
    const buff = buildBuffText(supportSrc.supportBonus, supportSrc.supportBonusValue);
    const debuff = buildBuffText(supportSrc.supportMalus, supportSrc.supportMalusValue);
    addLine(buff || "Buff: —", buff ? "buff" : "muted");
    if (debuff) addLine(debuff, "debuff");
  }

  if (!entries.length) {
    addHeader("Stats");
    addLine("Nenhum stat disponível.", "muted");
    // Still render skill/passive below if present
  }

  const statMap = new Map(entries);
  // Add stats that only come from attribute-derived bonuses (start base at 0)
  for (const [k, adj] of Object.entries(attrAdjust)) {
    if (!statMap.has(k)) {
      const baseVal = adj.unit ? `0${adj.unit}` : "0";
      statMap.set(k, baseVal);
    }
  }

  const enriched = Array.from(statMap.entries()).map(([key, value]) => {
    const parsed = parseStatValue(value);
    const type = statTypeMap[key] || null;
    const total = type ? currentTotalsByType[type] : null;
    const delta = total ? total.value : 0;
    const deltaUnit = total ? total.unit : "";
    const attrDelta = attrAdjust[key] ? attrAdjust[key].value : 0;
    const attrUnit = attrAdjust[key] ? attrAdjust[key].unit : "";
    return { key, rawValue: value, parsed, type, delta, deltaUnit, attrDelta, attrUnit };
  });

  const sorter =
    mainStatsSortMode === "buff"
      ? (a, b) => {
          const sA = a.delta > 0 ? -1 : a.delta < 0 ? 1 : 0;
          const sB = b.delta > 0 ? -1 : b.delta < 0 ? 1 : 0;
          if (sA !== sB) return sA - sB;
          return a.key.localeCompare(b.key);
        }
      : (a, b) => a.key.localeCompare(b.key);

  if (enriched.length) addHeader("Stats (base + efeitos)");

  enriched.sort(sorter).forEach((item) => {
    const base = item.parsed;
    const usePercent =
      (base.unit === "%") ||
      (item.deltaUnit && item.deltaUnit.includes("%")) ||
      (item.attrUnit && item.attrUnit.includes("%"));
    const baseVal = Number.isFinite(base.value) ? base.value : null;
    const deltaVal = item.delta;
    const attrVal = item.attrDelta || 0;
    let finalVal = baseVal;
    if (baseVal != null) {
      finalVal = baseVal + attrVal + deltaVal;
    }

    const baseStr = baseVal != null
      ? (usePercent ? baseVal.toFixed(2) + "%" : baseVal.toFixed(2))
      : item.rawValue;
    const finalStr = finalVal != null
      ? (usePercent ? finalVal.toFixed(2) + "%" : finalVal.toFixed(2))
      : item.rawValue;

    const fmtDelta = (val) =>
      (val > 0 ? "+" : "") +
      (usePercent ? val.toFixed(2) + "%" : val.toFixed(2));

    const deltaStr =
      (deltaVal && Math.abs(deltaVal) > 1e-6) ? fmtDelta(deltaVal) : null;
    const attrStr =
      (attrVal && Math.abs(attrVal) > 1e-6) ? fmtDelta(attrVal) : null;

    const li = document.createElement("li");
    const parts = [];
    if (attrStr) parts.push(`attr ${attrStr}`);
    if (deltaStr) parts.push(`buffs ${deltaStr}`);
    const detail = parts.length ? ` (base ${baseStr}; ${parts.join("; ")})` : "";
    li.textContent = `${item.key}: ${finalStr}${detail}`;
    // Color only for external buffs/debuffs (support station + companions)
    if (deltaVal > 0) li.classList.add("buff");
    if (deltaVal < 0) li.classList.add("debuff");
    list.appendChild(li);
  });

  // Skills
  const skill = raw.skill;
  const passive = raw.passive;
  if (skill || passive) addHeader("Skills");
  function fmtSkill(s, label) {
    if (!s || !s.skillName) return;
    const parts = [];
    if (s.cooldown) parts.push(`CD ${s.cooldown}`);
    if (s.manaCost) parts.push(`MP ${s.manaCost}`);
    if (s.castingRange) parts.push(`Range ${s.castingRange}`);
    const suffix = parts.length ? ` (${parts.join(", ")})` : "";
    addLine(`${label}: ${s.skillName}${suffix}`);
  }
  fmtSkill(skill, "Active");
  fmtSkill(passive, "Passive");
}

function updateMaxToggleButton() {
  const btn = document.getElementById("toggle-max-btn");
  if (!btn) return;
  btn.classList.toggle("active", useMaximizedDefault);
  btn.textContent = useMaximizedDefault ? "Maximized ON" : "Maximized OFF";
}

function resetMainDrifterLevel() {
  const raw = rawDriftersById[mainDrifterId];
  const defaultLevel =
    (raw && raw.supportLevel != null ? Number(raw.supportLevel) : 1) || 1;
  const maxLevel =
    (raw && raw.maxSupportLevel != null ? Number(raw.maxSupportLevel) : 50) || 50;
  mainDrifterMaxLevel = Math.max(1, maxLevel);
  setMainDrifterLevel(defaultLevel);
}

function setMainDrifterLevel(level) {
  const clamped = Math.min(Math.max(1, Math.round(level)), mainDrifterMaxLevel || 50);
  mainDrifterLevel = clamped;
  updateMainLevelLabel();
}

function updateMainLevelLabel() {
  const label = document.getElementById("main-level-label");
  if (label) label.textContent = `Level: ${mainDrifterLevel}`;
}

function resetCustomAttrs() {
  customAttrs = { STR: null, DEX: null, INT: null };
  updateAttrInputs();
}

function rebuildDriftersFromRaw() {
  drifters = rawDrifters.map((d) => drifterFromJson(d)).filter(Boolean);
  driftersById = Object.fromEntries(drifters.map((d) => [d.id, d]));
  drifterNameById = Object.fromEntries(drifters.map((d) => [d.id, d.name]));
  rawDriftersById = Object.fromEntries(rawDrifters.map((r) => [r.gameId, r]));
  populateMainDrifterSelect();
}

function toggleMaximizedMode() {
  useMaximizedDefault = !useMaximizedDefault;
  rebuildDriftersFromRaw();
  resetMainDrifterLevel();
  resetCustomAttrs();
  updateMaxToggleButton();
  updateBuffs();
  buildDrifterTable();
  updateCompanions();
  updateSummary();
  renderMainDrifterStats();
}

function initAttrInputs() {
  const inputs = document.querySelectorAll(".attr-input");
  inputs.forEach((inp) => {
    if (inp.dataset.initialized) return;
    inp.addEventListener("input", () => {
      const attr = inp.dataset.attr;
      if (!attr) return;
      const val = parseFloat(inp.value);
      customAttrs[attr] = Number.isFinite(val) ? val : null;
      renderMainDrifterStats();
    });
    inp.dataset.initialized = "1";
  });
}

function updateAttrInputs(actualAttrs) {
  const inputs = document.querySelectorAll(".attr-input");
  inputs.forEach((inp) => {
    const attr = inp.dataset.attr;
    if (!attr) return;
    const val =
      customAttrs[attr] != null && Number.isFinite(customAttrs[attr])
        ? customAttrs[attr]
        : actualAttrs && Number.isFinite(actualAttrs[attr])
        ? actualAttrs[attr]
        : "";
    inp.value = val === "" ? "" : String(val);
  });
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
  renderMainDrifterStats();
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

  const mainSortBtn = evt.target.closest("#main-stats-sort");
  if (mainSortBtn) {
    if (mainStatsSortMode === "alpha") {
      mainStatsSortMode = "buff";
      mainSortBtn.textContent = "Ordenar alfabeticamente";
    } else {
      mainStatsSortMode = "alpha";
      mainSortBtn.textContent = "Ordenar por buff/debuff";
    }
    renderMainDrifterStats();
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
      if (!eff.type) continue;
      map[eff.type] = (map[eff.type] || 0) + eff.value;
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
