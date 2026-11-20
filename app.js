'use strict';
/* Rutina Gera — app de entrenamiento (PWA, sin dependencias). Datos guardados en el dispositivo. */

const LS_KEY = 'rutinaGera.v1';
const DRAFT_KEY = 'rutinaGera.draft';
const REST_KEY = 'rutinaGera.rest';

// ---------- Utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => parseISO(s).toLocaleDateString('es', opts);
const fmtShort = (s) => parseISO(s).toLocaleDateString('es', { day: 'numeric', month: 'short' });
const fmtTime = (sec) => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${pad(sec % 60)}`; };
const round05 = (x) => Math.round(x * 2) / 2;
const fmtKg = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toString().replace('.', ','));

// ---------- Datos ----------
function defaultData() {
  return {
    settings: {
      name: '', age: 36, sex: 'F', weight: 55, height: 157,
      fcMode: 'tanaka', fcManual: null, variant: '4', startDate: todayISO(), weakSide: 'izq', deloadUntil: null,
    },
    sessions: [], measures: [], rmTests: [], vo2Tests: [], lastPhotoDate: null,
  };
}
function loadDB() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const def = defaultData();
      return Object.assign(def, d, { settings: Object.assign(def.settings, d.settings || {}) });
    }
  } catch (e) { /* datos dañados o almacenamiento bloqueado */ }
  return defaultData();
}
let DB = loadDB();
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); } catch (e) { toast('No se pudo guardar en el dispositivo'); }
}
let draft = null;
try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { draft = null; }
function saveDraft() { try { draft ? localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) : localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- Fotos (IndexedDB) ----------
const PhotoDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('rutinaGeraFotos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async all() {
    const db = await this.open();
    return new Promise((res, rej) => {
      const r = db.transaction('photos').objectStore('photos').getAll();
      r.onsuccess = () => res(r.result.sort((a, b) => (a.date < b.date ? 1 : -1)));
      r.onerror = () => rej(r.error);
    });
  },
  async put(p) {
    const db = await this.open();
    return new Promise((res, rej) => { const t = db.transaction('photos', 'readwrite'); t.objectStore('photos').put(p); t.oncomplete = res; t.onerror = () => rej(t.error); });
  },
  async del(id) {
    const db = await this.open();
    return new Promise((res, rej) => { const t = db.transaction('photos', 'readwrite'); t.objectStore('photos').delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); });
  },
};

// ---------- Lógica del programa ----------
const S = () => DB.settings;
const fcMax = () => (S().fcMode === 'manual' && num(S().fcManual)) ? Math.round(num(S().fcManual)) : Math.round(208 - 0.7 * (num(S().age) || 36));
const zone = (a, b) => `${Math.round(fcMax() * a)}–${Math.round(fcMax() * b)} lpm`;
const blockWeek = (date = todayISO()) => Math.floor(daysBetween(S().startDate, date) / 7) + 1;
function phaseText(w) {
  if (w < 1) return 'El bloque aún no empieza';
  if (w <= 3) return 'Semanas 1-3: adaptación a los ejercicios';
  if (w <= 8) return 'Semanas 4-8: cambios claros en fuerza';
  if (w <= 12) return 'Semanas 8-12: cambio visible en glúteo y femoral';
  return 'Bloque de 3 meses completado';
}
const getDays = (v = S().variant) => PROGRAM[v].days;
const findDay = (variant, dayId) => PROGRAM[variant].days.find((d) => d.id === dayId);
const sortedSessions = () => [...DB.sessions].sort((a, b) => (a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1));

function nextDay(variant = S().variant) {
  const days = getDays(variant);
  const list = sortedSessions().filter((s) => s.variant === variant);
  if (!list.length) return days[0];
  const last = list[list.length - 1];
  const i = days.findIndex((d) => d.id === last.dayId);
  return days[(i + 1) % days.length];
}
function weekStartISO(d = new Date()) {
  const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}
function plannedSets(item, d = draft) {
  let n = item.sets;
  if (d && d.deload) n = Math.ceil(n / 2);
  else if (d && d.reduce) n = Math.max(1, n - 1);
  return n;
}
const repsOf = (ex, s) => (ex.uni ? Math.min(num(s.rL) ?? 0, num(s.rR) ?? 0) : num(s.r) ?? 0);

function history(exId) {
  const out = [];
  for (const s of sortedSessions()) {
    const e = s.exercises.find((x) => x.exId === exId && x.sets && x.sets.length);
    if (e) out.push({ session: s, ex: e });
  }
  return out;
}
function lastPerf(exId, excludeId) {
  const h = history(exId).filter((x) => x.session.id !== excludeId);
  const normal = h.filter((x) => !x.session.deload);
  return (normal.length ? normal : h).pop() || null;
}
function suggestion(exId, plannedNormal, excludeId) {
  const ex = EX[exId];
  const last = lastPerf(exId, excludeId);
  const [lo, hi] = ex.reps;
  const u = ex.unit === 'sec' ? 's' : 'reps';
  if (!last) return { keep: true, text: `Primera vez: elige un peso que te deje 2-3 ${ex.unit === 'sec' ? 'segundos' : 'repeticiones'} en reserva (RPE 7-8).` };
  const sets = last.ex.sets;
  const allTop = sets.length >= plannedNormal && sets.every((s) => repsOf(ex, s) >= hi);
  const ws = sets.map((s) => num(s.w)).filter((w) => w != null && w > 0);
  const w = ws.length ? Math.max(...ws) : null;
  if (ex.unit === 'sec') {
    const best = Math.max(...sets.map((s) => repsOf(ex, s)));
    if (allTop) return { text: `¡Completaste ${hi} s! Sube 5 s por lado → objetivo ${best + 5} s. Si ya lo haces con rodilla apoyada y buena técnica, pasa al pie apoyado.` };
    return { keep: true, text: `Mantén y busca llegar a ${hi} s por lado en todas las series (mejor: ${best} s).` };
  }
  if (allTop) {
    if (w == null) return { text: `¡Tope del rango en todas las series! Añade carga o haz la bajada más lenta y vuelve a ${lo} ${u}.` };
    const [p1, p2] = ex.lower ? [0.05, 0.10] : [0.025, 0.05];
    const a = round05(w * (1 + p1)), b = round05(w * (1 + p2));
    return { up: true, text: `¡Tope del rango en todas las series! Sube a ${fmtKg(a === w ? w + 0.5 : a)}–${fmtKg(b === w ? w + 1 : b)} kg (+${ex.lower ? '5-10' : '2.5-5'}%) y vuelve a ${lo} ${u}.` };
  }
  return { keep: true, text: `Mantén ${w != null ? fmtKg(w) + ' kg' : 'la carga'} y busca ${hi} ${u} en todas las series.` };
}
function fmtSet(ex, s) {
  const w = num(s.w);
  const wTxt = w != null && w > 0 ? `${fmtKg(w)}×` : '';
  const sfx = ex.unit === 'sec' ? 's' : '';
  if (ex.uni) {
    const [a, b] = S().weakSide === 'der' ? [s.rR, s.rL] : [s.rL, s.rR];
    return `${wTxt}${a ?? '–'}/${b ?? '–'}${sfx}`;
  }
  return `${wTxt}${s.r ?? '–'}${sfx}`;
}
const sideLabels = () => (S().weakSide === 'der' ? [['rR', 'Der (débil)'], ['rL', 'Izq']] : [['rL', 'Izq (débil)'], ['rR', 'Der']]);

function vo2Category(v) {
  if (v < 25) return 'Muy bajo';
  if (v < 31) return 'Bajo';
  if (v < 35) return 'Regular';
  if (v <= 40.99) return 'Bueno';
  return 'Excelente';
}
function calcVO2(type, inp) {
  if (type === 'cooper') { const d = num(inp.dist); return d ? (d - 504.9) / 44.73 : null; }
  if (type === 'rockport') {
    const t = num(inp.min) != null ? num(inp.min) + (num(inp.sec) || 0) / 60 : null;
    const hr = num(inp.hr), kg = num(inp.weight) || num(S().weight), age = num(S().age);
    if (!t || !hr || !kg) return null;
    const sex = S().sex === 'M' ? 1 : 0;
    return 132.853 - 0.0769 * kg * 2.20462 - 0.3877 * age + 6.315 * sex - 3.2649 * t - 0.1565 * hr;
  }
  if (type === 'watch') return num(inp.value);
  return null;
}
const VO2_TYPES = { cooper: 'Test de Cooper (12 min)', rockport: 'Test de Rockport (1 milla)', watch: 'Smartwatch / pulsómetro' };

// ---------- Estado de la UI ----------
const state = { view: 'hoy', progSub: 'fuerza', progEx: 'rdl', bodyMetric: 'weight', entVariant: S().variant, photoSel: [] };

function go(view) {
  state.view = view;
  if (view === 'entrenar') state.entVariant = S().variant;
  render();
  window.scrollTo(0, 0);
}

// ---------- Render principal ----------
function render() {
  const v = state.view;
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === (v === 'sesion' ? 'entrenar' : v)));
  const views = { hoy: viewHoy, entrenar: viewEntrenar, sesion: viewSesion, progreso: viewProgreso, guia: viewGuia, ajustes: viewAjustes };
  const { top, body } = views[v]();
  $('#topbar').innerHTML = top;
  $('#main').innerHTML = body;
  if (v === 'progreso' && state.progSub === 'cuerpo') loadPhotos();
  updateRestPill();
}

// ---------- HOY ----------
function reminders() {
  const r = [];
  const t = todayISO();
  const w = blockWeek();
  if (w > 12) r.push(['ok', '🏁', 'Bloque de 3 meses completado', 'Haz tus tests (5RM, VO2max, medidas y fotos) y compara con el inicio. Ajusta la fecha de inicio en Perfil para empezar un nuevo bloque.']);

  // Descarga
  const deloads = DB.sessions.filter((s) => s.deload).map((s) => s.date).sort();
  const ref = deloads.length ? deloads[deloads.length - 1] : S().startDate;
  const wSince = Math.floor(daysBetween(ref, t) / 7);
  const inDeload = S().deloadUntil && t <= S().deloadUntil;
  if (inDeload) r.push(['info', '🧘', 'Semana de descarga activa', `Hasta el ${fmtShort(S().deloadUntil)}: la mitad de las series con el mismo peso.`]);
  else if (wSince >= 8) r.push(['warn', '⚠️', 'Toca semana de descarga', `Llevas ${wSince} semanas sin descarga. Haz la mitad de las series con el mismo peso.`, 'deload']);
  else if (wSince >= 6) r.push(['info', '🧘', 'Considera una semana de descarga', `Llevas ${wSince} semanas. Se recomienda cada 6-8 semanas (antes si la fuerza se estanca).`, 'deload']);

  // Estancamiento
  if (!inDeload) {
    const stuck = [];
    for (const id of ['rdl', 'hip_thrust', 'hack', 'prensa']) {
      const h = history(id).filter((x) => !x.session.deload).slice(-3);
      if (h.length < 3) continue;
      const score = (x) => { const ws = x.ex.sets.map((s) => num(s.w) || 0); return Math.max(...ws) * 1000 + x.ex.sets.reduce((a, s) => a + repsOf(EX[id], s), 0); };
      const sc = h.map(score);
      if (sc[2] <= sc[0] && sc[1] <= sc[0]) stuck.push(EX[id].name);
    }
    if (stuck.length) r.push(['warn', '📉', 'Fuerza estancada', `${stuck.join(', ')}: sin mejora en 3 sesiones. Valora adelantar la semana de descarga.`]);
  }

  // VO2max
  const vo2 = [...DB.vo2Tests].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!vo2.length) r.push(['info', '🫁', 'Test de VO2max de línea base', 'Haz un test (Cooper a pie o Rockport) durante tu primera semana, antes de empezar los intervalos.', 'vo2']);
  else {
    const d = daysBetween(vo2[vo2.length - 1].date, t);
    if (d >= 42) r.push(['info', '🫁', 'Repite tu test de VO2max', `Han pasado ${Math.floor(d / 7)} semanas. Usa el mismo test (${VO2_TYPES[vo2[0].type]}).`, 'vo2']);
    if (S().variant === '3' && vo2.length >= 2 && w >= 6) {
      const a = vo2[vo2.length - 2], b = vo2[vo2.length - 1];
      if (b.value <= a.value) r.push(['warn', '🔁', 'Sin avance en VO2max con 3 días', 'Con un solo 4x4 semanal el VO2max mejora más lento. Lo recomendado es volver al programa de 4 días.']);
    }
  }
  // 5RM
  const rm = [...DB.rmTests].sort((a, b) => (a.date < b.date ? -1 : 1));
  const rmRef = rm.length ? rm[rm.length - 1].date : S().startDate;
  if (daysBetween(rmRef, t) >= 42) r.push(['info', '🏋️', 'Evalúa tu 5RM', 'Cada 6-8 semanas: peso para 5 repeticiones en peso muerto rumano y hip thrust.', 'rm']);
  // Medidas
  const ms = [...DB.measures].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!ms.length) r.push(['info', '📏', 'Registra tus medidas iniciales', 'Peso y circunferencias de muslo, cadera, brazo y hombros.', 'measure']);
  else if (daysBetween(ms[ms.length - 1].date, t) >= 28) r.push(['info', '📏', 'Toca medir circunferencias', 'Cada 4 semanas: muslo, cadera, brazo y hombros.', 'measure']);
  // Fotos
  if (!DB.lastPhotoDate) r.push(['info', '📸', 'Foto de progreso inicial', 'Misma luz, pose y hora del día cada mes.', 'photo']);
  else if (daysBetween(DB.lastPhotoDate, t) >= 30) r.push(['info', '📸', 'Foto de progreso mensual', 'Misma luz, pose y hora del día.', 'photo']);
  return r;
}

function viewHoy() {
  const w = blockWeek();
  const variant = S().variant;
  const days = getDays(variant);
  const nd = nextDay();
  const ws = weekStartISO();
  const thisWeek = DB.sessions.filter((s) => s.date >= ws && s.variant === variant);
  const doneIds = new Set(thisWeek.map((s) => s.dayId));
  const hello = S().name ? `Hola, ${esc(S().name)}` : 'Hola';
  const vo2 = [...DB.vo2Tests].sort((a, b) => (a.date < b.date ? -1 : 1)).pop();

  let draftCard = '';
  if (draft) {
    const dd = findDay(draft.variant, draft.dayId);
    draftCard = `<div class="card hero"><div class="kicker">Sesión en curso</div><h2>${dd.short} — ${dd.name}</h2>
      <button class="btn primary block mt" data-a="resume">Continuar sesión</button></div>`;
  }
  const rem = reminders().map(([cls, ico, title, txt, act]) => `
    <div class="alert ${cls}"><div class="ico">${ico}</div><div class="grow"><b>${title}</b><span class="small">${txt}</span>
    ${act ? `<div class="mt"><button class="btn sm" data-a="rem-${act}">${{ deload: 'Activar descarga 7 días', vo2: 'Registrar test', rm: 'Registrar 5RM', measure: 'Registrar medidas', photo: 'Añadir foto' }[act]}</button></div>` : ''}</div></div>`).join('');

  return {
    top: `<div class="grow"><h1>${hello}</h1><div class="sub">${PROGRAM[variant].label}</div></div>`,
    body: `
      <div class="card">
        <div class="row spread"><div><div class="kicker">Bloque de 3 meses</div><div class="big">Semana ${Math.max(1, Math.min(w, 12))}<span class="muted" style="font-size:16px;font-weight:600"> / 12</span></div></div>
        ${w > 12 ? '<span class="tag ok">Completado</span>' : ''}</div>
        <div class="progress mt"><i style="width:${Math.min(100, Math.max(0, (w - 1) / 12 * 100 + 100 / 12 * Math.min(1, (daysBetween(S().startDate, todayISO()) % 7 + 1) / 7)))}%"></i></div>
        <p class="small muted mt" style="margin-bottom:0">${phaseText(w)}</p>
      </div>
      ${draftCard}
      ${draft ? '' : `<div class="card ${nd.cardio ? 'cardio' : 'hero'}">
        <div class="kicker">Siguiente entrenamiento · sugerido ${nd.weekday.toLowerCase()}</div>
        <h2>${nd.short} — ${nd.name}</h2>
        <p class="small muted">${nd.focus}</p>
        <div class="row wrap">${nd.cardio ? '<span class="tag cardio">+ 4x4 VO2max</span>' : '<span class="tag accent">Tren inferior</span>'}<span class="tag">${nd.items.length} ejercicios</span><span class="tag">RPE 7-8</span></div>
        <button class="btn ${nd.cardio ? 'cardio' : 'primary'} block mt" data-a="start" data-day="${nd.id}" data-variant="${variant}">Empezar ${nd.short}</button>
      </div>`}
      <div class="section-title">Esta semana</div>
      <div class="card"><div class="week-dots">${days.map((d) => `<div class="${doneIds.has(d.id) ? 'done' : (d.id === nd.id && !draft ? 'next' : '')}">${d.short}<br><span class="tiny">${doneIds.has(d.id) ? '✓' : d.weekday.slice(0, 3)}</span></div>`).join('')}</div>
        <p class="small muted mt" style="margin-bottom:0">${thisWeek.length} de ${days.length} sesiones · Distribución sugerida: ${days.map((d) => d.weekday.toLowerCase()).join(', ')}.</p></div>
      ${rem ? `<div class="section-title">Avisos</div>${rem}` : ''}
      <div class="section-title">Tus números</div>
      <div class="stat-grid">
        <div class="stat"><div class="v">${fcMax()}</div><div class="l">FCmax (lpm)</div></div>
        <div class="stat"><div class="v">${vo2 ? vo2.value.toFixed(1) : '—'}</div><div class="l">VO2max ${vo2 ? '· ' + vo2Category(vo2.value) : ''}</div></div>
        <div class="stat"><div class="v">${DB.sessions.length}</div><div class="l">Sesiones</div></div>
      </div>
      <div class="card mt"><div class="small"><b>Zona 4x4 (85-95%):</b> ${zone(0.85, 0.95)}<br><b>Recuperación (60-70%):</b> ${zone(0.6, 0.7)}</div></div>`,
  };
}

// ---------- ENTRENAR ----------
function viewEntrenar() {
  const v = state.entVariant;
  const nd = nextDay(v);
  const cards = PROGRAM[v].days.map((d) => {
    const groups = [];
    d.items.forEach((it) => {
      const ex = EX[it.id];
      const reps = ex.unit === 'sec' ? `${ex.reps[0]}-${ex.reps[1]} s` : ex.reps[0] === ex.reps[1] ? ex.reps[0] : `${ex.reps[0]}-${ex.reps[1]}`;
      groups.push(`<li><span>${it.ss ? '<b style="color:var(--warn)">SS</b> ' : ''}${ex.name}${it.alt ? ` <span class="tiny">(o ${EX[it.alt].name.toLowerCase()})</span>` : ''}</span><span>${it.sets} × ${reps}${ex.uni ? ' c/lado' : ''}</span></li>`);
    });
    return `<div class="card day-card ${d.cardio ? 'cardio' : ''}" data-a="start" data-day="${d.id}" data-variant="${v}">
      <div class="row spread"><div><div class="kicker">${d.short} · ${d.weekday}</div><h2 style="margin:0">${d.name}</h2></div>
      ${d.id === nd.id ? '<span class="tag accent">Siguiente</span>' : ''}</div>
      <p class="small muted" style="margin:4px 0 0">${d.focus}</p>
      <ul class="ex-list">${groups.join('')}${d.cardio ? '<li><span><b style="color:var(--cardio)">4x4</b> Intervalos en bicicleta</span><span>~40 min</span></li>' : ''}</ul>
    </div>`;
  }).join('');
  return {
    top: `<div class="grow"><h1>Entrenar</h1><div class="sub">Elige tu sesión</div></div>`,
    body: `
      <div class="seg"><button class="${v === '4' ? 'on' : ''}" data-a="variant" data-v="4">4 días</button><button class="${v === '3' ? 'on' : ''}" data-a="variant" data-v="3">3 días (Anexo A)</button></div>
      ${v !== S().variant ? `<div class="alert warn"><div class="ico">ℹ️</div><div class="grow small">Estás viendo la variante de ${v} días. Tu programa activo es de ${S().variant} días.<div class="mt"><button class="btn sm" data-a="set-variant" data-v="${v}">Usar ${v} días como programa activo</button></div></div></div>` : ''}
      ${v === '3' ? '<p class="small muted">Para semanas en que solo puedas ir 3 días. Glúteo, femoral y aductor mantienen todo su volumen; el 4x4 va solo el miércoles. Si te falta tiempo, la superserie final de los días de pierna es lo primero que puedes saltarte.</p>' : '<p class="small muted">VO2max solo en los días de tren superior (nunca junto a pierna). Todo a RPE 7-8.</p>'}
      ${draft ? `<div class="alert info"><div class="ico">⏱️</div><div class="grow"><b>Tienes una sesión en curso</b><div class="mt"><button class="btn sm cardio" data-a="resume">Continuar</button></div></div></div>` : ''}
      ${cards}`,
  };
}

function newDraft(variant, dayId) {
  const day = findDay(variant, dayId);
  const inDeload = S().deloadUntil && todayISO() <= S().deloadUntil;
  return {
    id: uid(), date: todayISO(), variant, dayId, deload: !!inDeload, reduce: false, discomfort: null, startedAt: Date.now(), editing: null,
    items: day.items.map((it) => ({ base: it.id, exId: it.id, sets: [], rpe: null, skipped: false })),
    cardio: day.cardio ? { intervals: [0, 1, 2, 3].map(() => ({ peak: '', rec: '' })), power: '', avgHr: '', done: false, notes: '' } : null,
    notes: '',
  };
}
function startSession(variant, dayId) {
  if (draft && !(draft.variant === variant && draft.dayId === dayId)) {
    const dd = findDay(draft.variant, draft.dayId);
    confirmModal('Sesión en curso', `Tienes sin terminar «${dd.short} — ${dd.name}». ¿Descartarla y empezar otra?`, 'Descartar y empezar', () => {
      draft = newDraft(variant, dayId); saveDraft(); go('sesion');
    });
    return;
  }
  if (!draft) { draft = newDraft(variant, dayId); saveDraft(); }
  go('sesion');
}

// ---------- SESIÓN ----------
function ensureSets(it, n) {
  while (it.sets.length < n) it.sets.push({ w: '', r: '', rL: '', rR: '', done: false });
}
function viewSesion() {
  if (!draft) { state.view = 'entrenar'; return viewEntrenar(); }
  const day = findDay(draft.variant, draft.dayId);
  const isLower = day.type === 'lower';

  let html = `
    <div class="card">
      <div class="grid2">
        <label class="field" style="margin:0"><span>Fecha</span><input class="input" type="date" value="${draft.date}" data-in="date"></label>
        <div><span class="small muted" style="font-weight:600">Semana del bloque</span><div class="big" style="font-size:24px;margin-top:6px">${blockWeek(draft.date)}</div></div>
      </div>
      <div class="switch"><div><b>Semana de descarga</b><div class="tiny muted">La mitad de las series con el mismo peso</div></div><input type="checkbox" data-in="deload" ${draft.deload ? 'checked' : ''}></div>
      ${isLower ? `<div style="border-top:1px solid var(--line);padding-top:10px">
        <div class="small"><b>¿Aún sientes molestia del último día de pierna?</b></div>
        <div class="chips mt"><button class="chip ${draft.discomfort === false ? 'on' : ''}" data-a="discomfort" data-v="0">No</button><button class="chip ${draft.discomfort === true ? 'on' : ''}" data-a="discomfort" data-v="1">Sí</button></div>
        ${draft.discomfort ? `<div class="alert warn mt"><div class="ico">⚠️</div><div class="grow small">Baja una serie por ejercicio o espera un día extra.
          <div class="switch" style="padding-bottom:0"><span>Quitar 1 serie a cada ejercicio</span><input type="checkbox" data-in="reduce" ${draft.reduce ? 'checked' : ''} ${draft.deload ? 'disabled' : ''}></div></div></div>` : ''}
      </div>` : ''}
    </div>
    <p class="small muted">Todo a <b>RPE 7-8</b>: deja 2-3 repeticiones en reserva. Toca ✓ al terminar cada serie para iniciar el descanso. Los valores grises son los de tu última sesión.</p>`;

  let i = 0;
  const items = day.items;
  while (i < items.length) {
    const it = items[i];
    if (it.ss) {
      const grp = [];
      while (i < items.length && items[i].ss === it.ss) { grp.push(i); i++; }
      const opt = items[grp[0]].optional;
      html += `<div class="ss-wrap"><div class="ss-title">Superserie${it.ss !== 'S' ? ' ' + it.ss : ''} · sin descanso entre ejercicios · 60 seg al terminar el par${opt ? ' · <span style="color:var(--muted)">opcional si te falta tiempo</span>' : ''}</div>
        ${grp.map((k) => exCard(day, k)).join('')}</div>`;
    } else { html += exCard(day, i); i++; }
  }

  if (draft.cardio) html += cardioCard();

  html += `
    <label class="field mt"><span>Notas de la sesión</span><textarea class="input" data-in="notes" placeholder="Sensaciones, técnica, energía tras el turno...">${esc(draft.notes)}</textarea></label>
    <button class="btn ok block" data-a="finish">✓ Terminar y guardar sesión</button>
    <button class="btn danger block mt" data-a="discard">${draft.editing ? 'Cancelar edición' : 'Descartar sesión'}</button>`;

  return {
    top: `<button class="back" data-a="back">‹</button><div class="grow"><h1 style="font-size:19px">${day.short} — ${day.name}</h1><div class="sub">${draft.editing ? 'Editando sesión guardada' : PROGRAM[draft.variant].label}${draft.deload ? ' · descarga' : ''}</div></div>`,
    body: html,
  };
}

function exCard(day, idx) {
  const it = day.items[idx];
  const d = draft.items[idx];
  const exId = d.exId;
  const ex = EX[exId];
  const restLabel = it.restLabel || ex.restLabel;
  const n = plannedSets(it);
  ensureSets(d, n);
  const last = lastPerf(exId, draft.editing);
  const lastSets = last ? last.ex.sets : [];
  const sug = suggestion(exId, it.sets, draft.editing);
  const reps = ex.unit === 'sec' ? `${ex.reps[0]}-${ex.reps[1]} seg` : ex.reps[0] === ex.reps[1] ? `${ex.reps[0]} reps` : `${ex.reps[0]}-${ex.reps[1]} reps`;
  const sides = sideLabels();
  const repHdr = ex.unit === 'sec' ? 'Seg' : 'Reps';
  const rangeTxt = ex.reps[0] === ex.reps[1] ? ex.reps[0] : `${ex.reps[0]}-${ex.reps[1]}`;

  let rows = `<div class="set-row ${ex.uni ? 'uni' : ''} head"><span class="n">#</span><span class="center">Kg</span>${ex.uni ? `<span class="center">${sides[0][1]}</span><span class="center">${sides[1][1]}</span>` : `<span class="center">${repHdr}</span>`}<span></span></div>`;
  for (let s = 0; s < n; s++) {
    const st = d.sets[s];
    const p = lastSets[s] || lastSets[lastSets.length - 1] || {};
    const ph = (k) => (p[k] != null && p[k] !== '' ? p[k] : '');
    rows += `<div class="set-row ${ex.uni ? 'uni' : ''} ${st.done ? 'done' : ''}">
      <span class="n">${s + 1}</span>
      <input inputmode="decimal" data-in="set" data-i="${idx}" data-s="${s}" data-k="w" value="${esc(st.w)}" data-prev="${ph('w')}" placeholder="${ph('w') || (ex.bodyweight ? 'PC' : 'kg')}">
      ${(ex.uni ? sides.map(([k]) => k) : ['r']).map((k) => `<input inputmode="numeric" data-in="set" data-i="${idx}" data-s="${s}" data-k="${k}" value="${esc(st[k])}" data-prev="${ph(k)}" placeholder="${ph(k) || rangeTxt}">`).join('')}
      <button class="chk" data-a="setdone" data-i="${idx}" data-s="${s}">✓</button>
    </div>`;
  }

  const altBtn = it.alt ? `<div class="alt-toggle chips"><button class="chip ${exId === it.id ? 'on' : ''}" data-a="alt" data-i="${idx}" data-v="${it.id}">${EX[it.id].name}</button><button class="chip ${exId === it.alt ? 'on' : ''}" data-a="alt" data-i="${idx}" data-v="${it.alt}">${EX[it.alt].name}</button></div>` : '';
  const sets = exId === it.alt && it.alt ? it.sets : it.sets;

  return `<div class="card ex-card ${d.skipped ? 'skipped' : ''}">
    <div class="ex-head">
      <div class="name">${ex.name}${ex.sub ? ` <span class="muted" style="font-weight:500;font-size:13px">· ${ex.sub}</span>` : ''}</div>
      <div class="ex-meta"><span class="tag ${ex.lower ? 'accent' : ''}">${n}${n !== sets ? ` de ${sets}` : ''} × ${reps}${ex.uni ? ' c/lado' : ''}</span><span class="tag">⏱ ${restLabel}</span><span class="tag">${ex.focus}</span></div>
      ${altBtn}
    </div>
    ${ex.note ? `<div class="ex-note">${ex.note}</div>` : ''}
    ${last ? `<div class="ex-prev">Última vez (${fmtShort(last.session.date)}): <b>${last.ex.sets.map((s) => fmtSet(ex, s)).join(' · ')}</b>${last.ex.rpe ? ` · RPE ${last.ex.rpe}` : ''}</div>` : ''}
    <div class="suggest ${sug.keep ? 'keep' : ''}">${sug.up ? '⬆️ ' : ''}${sug.text}</div>
    <div class="sets">${rows}</div>
    <div class="ex-foot"><span class="tiny muted">RPE</span><div class="rpe-chips">${[6, 7, 7.5, 8, 9, 10].map((r) => `<button class="${d.rpe === r ? 'on' : ''}" data-a="rpe" data-i="${idx}" data-v="${r}">${String(r).replace('.', ',')}</button>`).join('')}</div>
      <span class="grow"></span><button class="btn sm ghost" data-a="skip" data-i="${idx}">${d.skipped ? 'Incluir' : 'Saltar'}</button></div>
  </div>`;
}

function cardioCard() {
  const c = draft.cardio;
  const prev = sortedSessions().filter((s) => s.cardio && s.cardio.intervals && s.id !== draft.editing).pop();
  return `<div class="card cardio">
    <div class="kicker">Bloque de intervalos</div>
    <h2>Protocolo 4x4 en bicicleta</h2>
    <p class="small">10 min calentamiento · 4 × (4 min alta + 3 min recuperación activa) · 5 min enfriamiento. ~40 min.</p>
    <div class="row wrap"><span class="tag warn">Alta: ${zone(0.85, 0.95)}</span><span class="tag cardio">Recuperación: ${zone(0.6, 0.7)}</span></div>
    <button class="btn cardio block mt" data-a="timer">▶ Iniciar temporizador 4x4</button>
    <div class="section-title" style="margin-top:16px">Registro por intervalo</div>
    <div class="set-row uni head" style="grid-template-columns:70px 1fr 1fr"><span>Intervalo</span><span class="center">FC pico (lpm)</span><span class="center">Bajada (seg)</span></div>
    ${c.intervals.map((iv, k) => `<div class="set-row" style="grid-template-columns:70px 1fr 1fr"><span class="small"><b>#${k + 1}</b></span>
      <input inputmode="numeric" data-in="iv" data-k="${k}" data-f="peak" value="${esc(iv.peak)}" placeholder="${prev && prev.cardio.intervals[k] && prev.cardio.intervals[k].peak || 'lpm'}">
      <input inputmode="numeric" data-in="iv" data-k="${k}" data-f="rec" value="${esc(iv.rec)}" placeholder="${prev && prev.cardio.intervals[k] && prev.cardio.intervals[k].rec || 'seg'}"></div>`).join('')}
    <p class="tiny muted">"Bajada": segundos que tarda tu FC en bajar a zona de recuperación (${zone(0.6, 0.7)}). Debería acortarse con las semanas.</p>
    <div class="grid2 mt">
      <label class="field"><span>Potencia / nivel bici</span><input class="input" inputmode="decimal" data-in="cardio" data-f="power" value="${esc(c.power)}" placeholder="${prev && prev.cardio.power || 'W o nivel'}"></label>
      <label class="field"><span>FC media intervalos</span><input class="input" inputmode="numeric" data-in="cardio" data-f="avgHr" value="${esc(c.avgHr)}" placeholder="${prev && prev.cardio.avgHr || 'lpm'}"></label>
    </div>
    <div class="switch" style="padding-top:0"><span>Completé los 4 intervalos a la intensidad objetivo</span><input type="checkbox" data-in="cardio-done" ${c.done ? 'checked' : ''}></div>
    <p class="tiny muted" style="margin:0">Si las primeras semanas no logras los 4 min a la intensidad objetivo, hazlo con la que puedas sostener y ajusta semana a semana.</p>
  </div>`;
}

function finishSession() {
  const day = findDay(draft.variant, draft.dayId);
  const exercises = [];
  draft.items.forEach((d, idx) => {
    if (d.skipped) return;
    const it = day.items[idx];
    const ex = EX[d.exId];
    const n = plannedSets(it);
    const sets = d.sets.slice(0, n).filter((s) => s.done || (ex.uni ? (s.rL !== '' || s.rR !== '') : s.r !== '')).map((s) => {
      const o = { w: num(s.w) };
      if (ex.uni) { o.rL = num(s.rL); o.rR = num(s.rR); } else o.r = num(s.r);
      return o;
    });
    if (sets.length) exercises.push({ exId: d.exId, sets, rpe: d.rpe });
  });
  let cardio = null;
  if (draft.cardio) {
    const c = draft.cardio;
    const intervals = c.intervals.map((iv) => ({ peak: num(iv.peak), rec: num(iv.rec) }));
    if (intervals.some((iv) => iv.peak || iv.rec) || c.done || c.power || c.avgHr) cardio = { intervals, power: num(c.power), avgHr: num(c.avgHr), done: c.done, notes: c.notes };
  }
  if (!exercises.length && !cardio) { toast('Registra al menos una serie antes de guardar'); return; }
  const sess = {
    id: draft.editing || draft.id, date: draft.date, variant: draft.variant, dayId: draft.dayId,
    week: blockWeek(draft.date), deload: draft.deload, reduce: draft.reduce, discomfort: draft.discomfort,
    durationMin: draft.editing ? (DB.sessions.find((s) => s.id === draft.editing) || {}).durationMin : Math.round((Date.now() - draft.startedAt) / 60000),
    exercises, cardio, notes: draft.notes, createdAt: draft.editing ? (DB.sessions.find((s) => s.id === draft.editing) || {}).createdAt : Date.now(),
  };
  DB.sessions = DB.sessions.filter((s) => s.id !== sess.id).concat(sess);
  save();
  draft = null; saveDraft(); stopRest();
  const plannedOf = (exId) => { const it = day.items.find((x) => x.id === exId || x.alt === exId); return it ? it.sets : 0; };
  const ups = exercises.filter((e) => suggestion(e.exId, plannedOf(e.exId), null).up).map((e) => EX[e.exId].name);
  go('hoy');
  showModal(`<h2>¡Sesión guardada! 💪</h2>
    <p>${day.short} — ${day.name} · ${exercises.length} ejercicios${cardio ? ' + 4x4' : ''}${sess.durationMin ? ` · ${sess.durationMin} min` : ''}</p>
    ${ups.length ? `<div class="alert ok"><div class="ico">⬆️</div><div class="grow small"><b>Próxima vez sube el peso en:</b>${ups.join(', ')}</div></div>` : ''}
    <button class="btn primary block mt" data-a="close-modal">Listo</button>`);
}

// ---------- Temporizador de descanso ----------
let rest = null; // { end, total }
try { rest = JSON.parse(localStorage.getItem(REST_KEY) || 'null'); } catch (e) { rest = null; }
let restTick = null;
let restBeeped = false;
function startRest(sec) {
  rest = { end: Date.now() + sec * 1000, total: sec }; restBeeped = false;
  try { localStorage.setItem(REST_KEY, JSON.stringify(rest)); } catch (e) {}
  updateRestPill();
}
function stopRest() { rest = null; try { localStorage.removeItem(REST_KEY); } catch (e) {} updateRestPill(); }
function updateRestPill() {
  const el = $('#restPill');
  clearInterval(restTick);
  if (!rest || state.view !== 'sesion') { el.classList.add('hidden'); if (!rest) return; }
  const tick = () => {
    if (!rest) { el.classList.add('hidden'); clearInterval(restTick); return; }
    const left = (rest.end - Date.now()) / 1000;
    if (left <= 0 && !restBeeped) { restBeeped = true; beep(880, 0.25); setTimeout(() => beep(880, 0.25), 350); vibrate([200, 100, 200]); }
    if (left < -60) { stopRest(); return; }
    if (state.view !== 'sesion') return;
    el.classList.remove('hidden');
    el.classList.toggle('over', left <= 0);
    el.innerHTML = `<span class="small">${left > 0 ? 'Descanso' : '¡A por la siguiente!'}</span><span class="t">${left > 0 ? fmtTime(left) : '0:00'}</span>
      <button data-a="rest-add">+15</button><button data-a="rest-stop">✕</button>`;
  };
  tick();
  restTick = setInterval(tick, 500);
}

// ---------- Sonido / vibración / pantalla ----------
let actx = null;
function beep(freq = 660, dur = 0.18) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; o.type = 'sine';
    g.gain.setValueAtTime(0.25, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) {}
}

// ---------- Temporizador 4x4 ----------
let T = null; // { idx, end, paused, remain, recStart }
let tTick = null;
function openTimer() {
  T = { idx: 0, end: null, paused: true, remain: PROTOCOL_4X4[0].min * 60 };
  renderTimer();
  tTick = setInterval(timerLoop, 250);
}
function closeTimer() {
  clearInterval(tTick); T = null; keepAwake(false);
  $('#overlay').innerHTML = '';
  saveDraft(); render();
}
function timerLoop() {
  if (!T || T.paused) return;
  const left = (T.end - Date.now()) / 1000;
  if (left <= 0) {
    if (T.idx >= PROTOCOL_4X4.length - 1) { T.paused = true; T.remain = 0; T.finished = true; beep(1000, 0.6); vibrate([300, 150, 300, 150, 300]); draft.cardio.done = true; saveDraft(); renderTimer(); return; }
    nextPhase(true);
    return;
  }
  if (left <= 3.2 && left > 0 && Math.ceil(left) !== T.lastCount) { T.lastCount = Math.ceil(left); beep(520, 0.1); }
  const c = $('#tclock'); if (c) c.textContent = fmtTime(left);
  const b = $('#tbar'); if (b) b.style.width = `${100 - (left / (PROTOCOL_4X4[T.idx].min * 60)) * 100}%`;
  const rs = $('#trec'); if (rs && T.recStart && !T.recDone) rs.textContent = `${Math.round((Date.now() - T.recStart) / 1000)} s`;
}
function nextPhase(auto) { goPhase(T.idx + 1, auto); }
function goPhase(k, auto) {
  T.idx = Math.max(0, Math.min(k, PROTOCOL_4X4.length - 1));
  const ph = PROTOCOL_4X4[T.idx];
  T.remain = ph.min * 60; T.lastCount = null; T.finished = false;
  // En automático se encadena con el final de la fase anterior (preciso aunque la pantalla se apague)
  const start = auto && T.end ? T.end : Date.now();
  if (!T.paused) T.end = start + T.remain * 1000;
  T.recStart = ph.zone === 'rec' && !T.paused ? start : null; T.recDone = false;
  if (auto) { beep(ph.zone === 'high' ? 990 : 660, 0.35); vibrate(ph.zone === 'high' ? [400, 100, 400] : [250]); }
  renderTimer();
}
function renderTimer() {
  if (!T) return;
  const ph = PROTOCOL_4X4[T.idx];
  const left = T.paused ? T.remain : (T.end - Date.now()) / 1000;
  const zoneTxt = ph.zone === 'high' ? `Alta · 85-95% · ${zone(0.85, 0.95)}` : ph.zone === 'rec' ? `Recuperación activa · 60-70% · ${zone(0.6, 0.7)}` : ph.desc;
  const tips = ph.zone === 'high' ? 'Duro pero sostenible los 4 minutos: solo podrías responder con 2-3 palabras. No es un sprint.'
    : ph.zone === 'rec' ? 'No te detengas: sigue pedaleando casi sin resistencia.' : '';
  const ivN = ph.zone === 'rec' ? ph.n : ph.zone === 'high' ? ph.n : (ph.key === 'cool' ? 4 : null);
  let log = '';
  if (ph.zone === 'rec' || ph.key === 'cool') {
    const k = ivN - 1; const iv = draft.cardio.intervals[k];
    log = `<div class="hr-log mt"><div class="small"><b>Intervalo ${ivN}</b></div>
      <div class="grid2 mt"><label class="field" style="margin:0"><span>FC pico (lpm)</span><input class="input" inputmode="numeric" data-in="iv" data-k="${k}" data-f="peak" value="${esc(iv.peak)}"></label>
      <label class="field" style="margin:0"><span>Bajada (seg)</span><input class="input" inputmode="numeric" data-in="iv" data-k="${k}" data-f="rec" value="${esc(iv.rec)}"></label></div>
      ${ph.zone === 'rec' && T.recStart ? `<button class="btn cardio block mt" data-a="rec-mark">Mi FC ya bajó a ${Math.round(fcMax() * 0.7)} lpm · <span id="trec">${T.recDone ? iv.rec + ' s' : Math.round((Date.now() - T.recStart) / 1000) + ' s'}</span></button>` : ''}
    </div>`;
  }
  const total = PROTOCOL_4X4.reduce((a, p) => a + p.min, 0);
  $('#overlay').innerHTML = `<div class="overlay ${ph.zone}">
    <div class="row spread txt"><button class="back" data-a="timer-close">✕</button><span class="small muted">Protocolo 4x4 · ${T.idx + 1}/${PROTOCOL_4X4.length}</span><span style="width:38px"></span></div>
    <div class="timeline">${PROTOCOL_4X4.map((p, k) => `<div class="${p.zone} ${k === T.idx ? 'cur' : ''} ${k < T.idx ? 'past' : ''}" style="flex:${p.min / total}"></div>`).join('')}</div>
    <div class="timer-phase"><div class="lbl">${T.finished ? '¡Completado!' : ph.label}</div></div>
    <div class="timer-clock" id="tclock">${fmtTime(left)}</div>
    <div class="timer-zone">${T.finished ? 'Buen trabajo. Revisa tus datos y guarda la sesión.' : zoneTxt}</div>
    <div class="timer-bar"><i id="tbar" style="width:${100 - (left / (ph.min * 60)) * 100}%"></i></div>
    <p class="small center txt" style="opacity:.8">${tips}</p>
    ${log}
    <div class="timer-ctrls">
      <button class="btn" data-a="timer-prev" ${T.idx === 0 ? 'disabled' : ''}>⏮</button>
      <button class="btn ${ph.zone === 'high' ? 'primary' : 'cardio'}" data-a="timer-toggle" ${T.finished ? 'disabled' : ''}>${T.paused ? '▶ ' + (T.end ? 'Seguir' : 'Empezar') : '⏸ Pausa'}</button>
      <button class="btn" data-a="timer-next" ${T.idx >= PROTOCOL_4X4.length - 1 ? 'disabled' : ''}>⏭</button>
    </div>
    ${T.finished ? '<button class="btn ok block mt" data-a="timer-close">Volver a la sesión</button>' : ''}
  </div>`;
}

// ---------- Gráficos (SVG) ----------
const COLORS = ['var(--accent)', 'var(--cardio)', 'var(--ok)', 'var(--warn)'];
function lineChart(series, { unit = '', h = 170, zeroBase = false } = {}) {
  const pts = series.flatMap((s) => s.pts);
  if (!pts.length) return '<div class="empty">Aún no hay datos suficientes.</div>';
  const W = 340, H = h, L = 36, R = 10, Tp = 10, B = 22;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 86400000 * 3; x1 += 86400000 * 3; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (zeroBase) y0 = Math.min(0, y0);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const padY = (y1 - y0) * 0.12; y0 -= zeroBase && y0 === 0 ? 0 : padY; y1 += padY;
  const X = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const Y = (y) => Tp + (1 - (y - y0) / (y1 - y0)) * (H - Tp - B);
  let g = '';
  for (let k = 0; k <= 3; k++) {
    const yv = y0 + ((y1 - y0) * k) / 3;
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(yv)}" y2="${Y(yv)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 5}" y="${Y(yv) + 3}" text-anchor="end">${y1 - y0 >= 20 ? Math.round(yv) : Math.round(yv * 10) / 10}</text>`;
  }
  const dl = (t) => { const d = new Date(t); return d.toLocaleDateString('es', { day: 'numeric', month: 'short' }); };
  g += `<text x="${L}" y="${H - 5}">${dl(Math.min(...xs))}</text><text x="${W - R}" y="${H - 5}" text-anchor="end">${dl(Math.max(...xs))}</text>`;
  series.forEach((s, i) => {
    const c = s.color || COLORS[i % COLORS.length];
    const sp = [...s.pts].sort((a, b) => a[0] - b[0]);
    if (sp.length > 1) g += `<polyline fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${sp.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}"/>`;
    sp.forEach((p) => { g += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.5" fill="${c}"/>`; });
  });
  const legend = series.length > 1 || unit ? `<div class="legend">${series.map((s, i) => `<span><i style="background:${s.color || COLORS[i % COLORS.length]}"></i>${s.name}</span>`).join('')}${unit ? `<span>${unit}</span>` : ''}</div>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>${legend}`;
}
const tms = (iso) => parseISO(iso).getTime();

// ---------- PROGRESO ----------
function viewProgreso() {
  const sub = state.progSub;
  const tabs = [['fuerza', 'Fuerza'], ['cardio', 'VO2max'], ['cuerpo', 'Cuerpo'], ['historial', 'Historial']];
  const body = { fuerza: progFuerza, cardio: progCardio, cuerpo: progCuerpo, historial: progHistorial }[sub]();
  return {
    top: `<div class="grow"><h1>Progreso</h1><div class="sub">Semana ${Math.max(1, blockWeek())} del bloque</div></div>`,
    body: `<div class="seg">${tabs.map(([k, l]) => `<button class="${sub === k ? 'on' : ''}" data-a="psub" data-v="${k}">${l}</button>`).join('')}</div>${body}`,
  };
}

function progFuerza() {
  const used = new Set(DB.sessions.flatMap((s) => s.exercises.map((e) => e.exId)));
  const order = Object.keys(EX);
  const opts = order.map((id) => `<option value="${id}" ${state.progEx === id ? 'selected' : ''}>${EX[id].name}${EX[id].sub ? ' · ' + EX[id].sub : ''}${used.has(id) ? '' : ' (sin datos)'}</option>`).join('');
  const id = state.progEx; const ex = EX[id];
  const h = history(id);
  let charts = '';
  if (h.length) {
    const hasW = h.some((x) => x.ex.sets.some((s) => num(s.w)));
    if (hasW) {
      charts += `<h3>Peso máximo por sesión</h3>${lineChart([{ name: 'Peso máx.', pts: h.map((x) => [tms(x.session.date), Math.max(...x.ex.sets.map((s) => num(s.w) || 0))]) }], { unit: 'kg' })}`;
      charts += `<h3 class="mt">Volumen (kg × ${ex.unit === 'sec' ? 'seg' : 'reps'})</h3>${lineChart([{ name: 'Volumen', color: 'var(--cardio)', pts: h.map((x) => [tms(x.session.date), x.ex.sets.reduce((a, s) => a + (num(s.w) || 0) * (ex.uni ? (num(s.rL) || 0) + (num(s.rR) || 0) : num(s.r) || 0), 0)]) }])}`;
    }
    if (ex.uni) {
      const sides = sideLabels();
      charts += `<h3 class="mt">${ex.unit === 'sec' ? 'Segundos' : 'Repeticiones'} totales por lado</h3>${lineChart(sides.map(([k, l], i) => ({ name: l, color: i ? 'var(--cardio)' : 'var(--accent)', pts: h.map((x) => [tms(x.session.date), x.ex.sets.reduce((a, s) => a + (num(s[k]) || 0), 0)]) })))}`;
      const gap = (x) => Math.abs(x.ex.sets.reduce((a, s) => a + (num(s.rL) || 0) - (num(s.rR) || 0), 0));
      const g0 = gap(h[0]), g1 = gap(h[h.length - 1]);
      charts += `<div class="alert ${g1 <= g0 ? 'ok' : 'warn'} mt"><div class="ico">⚖️</div><div class="grow small"><b>Diferencia entre piernas: ${g1} ${ex.unit === 'sec' ? 's' : 'reps'}</b>Al inicio: ${g0}. ${g1 < g0 ? 'Se está cerrando 👍' : g1 === g0 ? 'Sin cambios aún.' : 'Ha aumentado: empieza por la pierna débil y que la fuerte copie sus repeticiones.'}</div></div>`;
    } else if (!h.some((x) => x.ex.sets.some((s) => num(s.w)))) {
      charts += `<h3>Repeticiones totales</h3>${lineChart([{ name: 'Reps', pts: h.map((x) => [tms(x.session.date), x.ex.sets.reduce((a, s) => a + (num(s.r) || 0), 0)]) }])}`;
    }
  }
  const table = h.length ? `<table class="tbl mt"><tr><th>Fecha</th><th>Series</th></tr>${[...h].reverse().slice(0, 12).map((x) => `<tr><td>${fmtShort(x.session.date)}${x.session.deload ? ' <span class="tag">desc.</span>' : ''}</td><td>${x.ex.sets.map((s) => fmtSet(ex, s)).join(' · ')}${x.ex.rpe ? ` <span class="muted">RPE ${x.ex.rpe}</span>` : ''}</td></tr>`).join('')}</table>` : '<div class="empty">Aún no registras este ejercicio.</div>';

  const rm = [...DB.rmTests].sort((a, b) => (a.date < b.date ? -1 : 1));
  const rmSeries = ['rdl', 'hip_thrust'].map((k, i) => ({ name: EX[k].name, color: COLORS[i], pts: rm.filter((t) => t.exId === k).map((t) => [tms(t.date), t.w]) })).filter((s) => s.pts.length);
  return `
    <div class="card"><label class="field" style="margin:0"><span>Ejercicio</span><select class="input" data-in="progEx">${opts}</select></label></div>
    <div class="card">${charts || ''}${table}</div>
    <div class="section-title">Test 5RM · cada 6-8 semanas</div>
    <div class="card">
      <p class="small muted">Peso de referencia para 5 repeticiones en tus movimientos clave de glúteo/femoral.</p>
      ${rmSeries.length ? lineChart(rmSeries, { unit: 'kg' }) : ''}
      ${rm.length ? `<table class="tbl mt"><tr><th>Fecha</th><th>Ejercicio</th><th>5RM</th><th></th></tr>${[...rm].reverse().map((t) => `<tr><td>${fmtShort(t.date)}</td><td>${EX[t.exId].name}</td><td><b>${fmtKg(t.w)} kg</b></td><td><button class="btn sm ghost" data-a="del-rm" data-id="${t.id}">✕</button></td></tr>`).join('')}</table>` : ''}
      <button class="btn primary block mt" data-a="add-rm">+ Registrar 5RM</button>
    </div>`;
}

function progCardio() {
  const tests = [...DB.vo2Tests].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = tests[0];
  const mixed = tests.some((t) => t.type !== (first && first.type));
  const cs = sortedSessions().filter((s) => s.cardio);
  const avg = (arr) => { const v = arr.filter((x) => x != null && x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const peakPts = cs.map((s) => [tms(s.date), avg(s.cardio.intervals.map((i) => i.peak))]).filter((p) => p[1] != null);
  const recPts = cs.map((s) => [tms(s.date), avg(s.cardio.intervals.map((i) => i.rec))]).filter((p) => p[1] != null);
  const powPts = cs.map((s) => [tms(s.date), s.cardio.power]).filter((p) => p[1] != null);
  const hrPts = cs.map((s) => [tms(s.date), s.cardio.avgHr]).filter((p) => p[1] != null);
  return `
    <div class="card">
      <div class="kicker">Frecuencia cardíaca máxima</div>
      <div class="row spread"><div class="big">${fcMax()} <span class="muted" style="font-size:15px">lpm</span></div><span class="tag">${S().fcMode === 'manual' ? 'Medida' : 'Tanaka: 208 − 0.7 × edad'}</span></div>
      <table class="tbl mt"><tr><th>Zona</th><th>%</th><th>lpm</th></tr>
        <tr><td>Intervalo 4x4</td><td>85-95%</td><td><b>${zone(0.85, 0.95)}</b></td></tr>
        <tr><td>Recuperación activa</td><td>60-70%</td><td><b>${zone(0.6, 0.7)}</b></td></tr></table>
      <p class="tiny muted" style="margin:0">La fórmula es una estimación (±10-12 lpm). Si mides tu FCmax con un test, ponla en Perfil.</p>
    </div>
    <div class="section-title">VO2max · tests de campo</div>
    <div class="card">
      ${tests.length ? lineChart([{ name: 'VO2max', color: 'var(--cardio)', pts: tests.map((t) => [tms(t.date), Math.round(t.value * 10) / 10]) }], { unit: 'ml/kg/min' }) : '<div class="empty">Haz tu test de línea base en la primera semana, antes de empezar los intervalos.</div>'}
      ${mixed ? '<div class="alert warn mt"><div class="ico">⚠️</div><div class="grow small">Has mezclado tipos de test. No cambies de test entre mediciones para que los resultados sean comparables.</div></div>' : ''}
      ${tests.length ? `<table class="tbl mt"><tr><th>Fecha</th><th>Test</th><th>VO2max</th><th></th></tr>${[...tests].reverse().map((t) => `<tr><td>${fmtShort(t.date)}</td><td class="small">${VO2_TYPES[t.type].split(' (')[0]}</td><td><b>${t.value.toFixed(1)}</b><br><span class="tiny muted">${vo2Category(t.value)}</span></td><td><button class="btn sm ghost" data-a="del-vo2" data-id="${t.id}">✕</button></td></tr>`).join('')}</table>` : ''}
      <button class="btn cardio block mt" data-a="add-vo2">+ Registrar test de VO2max</button>
      <p class="tiny muted mt" style="margin-bottom:0">Referencia mujeres 30-39: &lt;25 muy bajo · 25-30 bajo · 31-34 regular · 35-40 bueno · &gt;40 excelente. Repite el mismo test cada 6-8 semanas.</p>
    </div>
    <div class="section-title">Sesiones 4x4 (${cs.length})</div>
    <div class="card">
      ${cs.length ? `
        <h3>FC pico media por intervalo</h3>${lineChart([{ name: 'FC pico', color: 'var(--accent)', pts: peakPts }], { unit: 'lpm' })}
        <h3 class="mt">Tiempo de bajada en recuperación</h3>${lineChart([{ name: 'Bajada', color: 'var(--cardio)', pts: recPts }], { unit: 'seg · debería acortarse' })}
        ${powPts.length && hrPts.length ? `<h3 class="mt">Potencia vs FC media</h3>${lineChart([{ name: 'Potencia/nivel', color: 'var(--ok)', pts: powPts }, { name: 'FC media', color: 'var(--accent)', pts: hrPts }])}<p class="tiny muted">Señal de mejora: misma potencia con FC más baja.</p>` : ''}
      ` : '<div class="empty">Registra tus intervalos en los días de tren superior.</div>'}
    </div>`;
}

const METRICS = [['weight', 'Peso', 'kg'], ['thigh', 'Muslo', 'cm'], ['hip', 'Cadera', 'cm'], ['arm', 'Brazo', 'cm'], ['shoulders', 'Hombros', 'cm'], ['waist', 'Cintura', 'cm'], ['fat', 'Grasa', '%']];
function progCuerpo() {
  const ms = [...DB.measures].sort((a, b) => (a.date < b.date ? -1 : 1));
  const m = METRICS.find((x) => x[0] === state.bodyMetric);
  const pts = ms.filter((x) => num(x[m[0]]) != null).map((x) => [tms(x.date), num(x[m[0]])]);
  const firstV = pts.length ? pts[0][1] : null, lastV = pts.length ? pts[pts.length - 1][1] : null;
  return `
    <div class="card">
      <div class="chips mb">${METRICS.map(([k, l]) => `<button class="chip ${state.bodyMetric === k ? 'on' : ''}" data-a="metric" data-v="${k}">${l}</button>`).join('')}</div>
      ${pts.length ? `<div class="row spread mb"><div><div class="kicker">${m[1]}</div><div class="big">${fmtKg(lastV)} <span class="muted" style="font-size:15px">${m[2]}</span></div></div>
        ${pts.length > 1 ? `<span class="tag ${lastV - firstV >= 0 ? 'ok' : 'warn'}">${lastV - firstV >= 0 ? '+' : ''}${fmtKg(lastV - firstV)} ${m[2]} desde el inicio</span>` : ''}</div>` : ''}
      ${lineChart([{ name: m[1], pts }], { unit: m[2] })}
      <button class="btn primary block mt" data-a="add-measure">+ Registrar medidas</button>
      <p class="tiny muted mt" style="margin-bottom:0">Cada 4 semanas. La ganancia muscular no siempre se refleja de inmediato en la balanza.</p>
    </div>
    ${ms.length ? `<div class="card" style="overflow-x:auto"><table class="tbl"><tr><th>Fecha</th>${METRICS.map((x) => `<th>${x[1]}</th>`).join('')}<th></th></tr>
      ${[...ms].reverse().map((x) => `<tr><td>${fmtShort(x.date)}</td>${METRICS.map(([k]) => `<td>${x[k] != null && x[k] !== '' ? fmtKg(num(x[k])) : '—'}</td>`).join('')}<td><button class="btn sm ghost" data-a="del-measure" data-id="${x.id}">✕</button></td></tr>`).join('')}</table></div>` : ''}
    <div class="section-title">Fotos de progreso · mensuales</div>
    <div class="card">
      <p class="small muted">Misma luz, pose y hora del día. Las fotos se guardan solo en este dispositivo. Toca dos fotos para compararlas.</p>
      <div id="photoArea"><div class="empty">Cargando…</div></div>
      <label class="btn primary block mt">+ Añadir foto<input type="file" accept="image/*" data-in="photo" hidden></label>
    </div>`;
}
async function loadPhotos() {
  const area = $('#photoArea'); if (!area) return;
  let photos = [];
  try { photos = await PhotoDB.all(); } catch (e) { area.innerHTML = '<div class="empty">No se pueden guardar fotos en este navegador.</div>'; return; }
  if (!$('#photoArea')) return;
  state.photoSel = state.photoSel.filter((id) => photos.some((p) => p.id === id));
  let cmp = '';
  if (state.photoSel.length === 2) {
    const [a, b] = state.photoSel.map((id) => photos.find((p) => p.id === id)).sort((x, y) => (x.date < y.date ? -1 : 1));
    cmp = `<div class="compare mb">${[a, b].map((p) => `<div><img src="${p.data}" alt=""><div class="tiny center muted mt">${fmtDate(p.date, { day: 'numeric', month: 'short', year: 'numeric' })}${p.pose ? ' · ' + esc(p.pose) : ''}</div></div>`).join('')}</div>
      <button class="btn sm ghost mb" data-a="photo-clear">Quitar comparación</button>`;
  }
  area.innerHTML = photos.length ? `${cmp}<div class="photo-grid">${photos.map((p) => `<figure class="${state.photoSel.includes(p.id) ? 'sel' : ''}" data-a="photo-sel" data-id="${p.id}"><img src="${p.data}" alt="" loading="lazy"><figcaption>${fmtShort(p.date)}${p.pose ? ' · ' + esc(p.pose) : ''}</figcaption></figure>`).join('')}</div>
    ${state.photoSel.length === 1 ? `<button class="btn sm danger mt" data-a="photo-del" data-id="${state.photoSel[0]}">Borrar foto seleccionada</button>` : ''}` : '<div class="empty">Aún no hay fotos.</div>';
}
function addPhoto(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 1000; const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', 0.82);
      showModal(`<h2>Nueva foto de progreso</h2><img src="${data}" style="width:100%;border-radius:12px;max-height:45vh;object-fit:contain" alt="">
        <div class="grid2 mt"><label class="field"><span>Fecha</span><input class="input" type="date" id="pDate" value="${todayISO()}"></label>
        <label class="field"><span>Pose</span><select class="input" id="pPose"><option>Frente</option><option>Perfil</option><option>Espalda</option><option value="">Otra</option></select></label></div>
        <button class="btn primary block" id="pSave">Guardar foto</button>`);
      $('#pSave').onclick = async () => {
        const date = $('#pDate').value || todayISO();
        try { await PhotoDB.put({ id: uid(), date, pose: $('#pPose').value, data }); } catch (e) { toast('No se pudo guardar la foto'); return; }
        if (!DB.lastPhotoDate || date > DB.lastPhotoDate) { DB.lastPhotoDate = date; save(); }
        closeModal(); toast('Foto guardada'); render();
      };
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function progHistorial() {
  const list = sortedSessions().reverse();
  if (!list.length) return '<div class="card"><div class="empty">Todavía no hay sesiones guardadas.</div></div>';
  let lastWeek = null; let html = '';
  for (const s of list) {
    const d = findDay(s.variant, s.dayId);
    const wk = blockWeek(s.date);
    if (wk !== lastWeek) { html += `<div class="section-title">Semana ${wk}</div>`; lastWeek = wk; }
    const sets = s.exercises.reduce((a, e) => a + e.sets.length, 0);
    html += `<div class="card list-item" style="padding:12px 14px;margin-bottom:8px" data-a="sess" data-id="${s.id}">
      <div class="grow"><b>${d ? d.short + ' — ' + d.name : s.dayId}</b><div class="small muted">${fmtDate(s.date)} · ${s.exercises.length} ejercicios · ${sets} series${s.durationMin ? ` · ${s.durationMin} min` : ''}</div></div>
      ${s.cardio ? '<span class="tag cardio">4x4</span>' : ''}${s.deload ? '<span class="tag">Descarga</span>' : ''}${s.variant === '3' ? '<span class="tag">3d</span>' : ''}</div>`;
  }
  return html;
}
function sessionDetail(id) {
  const s = DB.sessions.find((x) => x.id === id); if (!s) return;
  const d = findDay(s.variant, s.dayId);
  showModal(`<h2>${d.short} — ${d.name}</h2>
    <p class="small muted">${fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Semana ${blockWeek(s.date)}${s.deload ? ' · descarga' : ''}${s.durationMin ? ` · ${s.durationMin} min` : ''}</p>
    <table class="tbl">${s.exercises.map((e) => `<tr><td><b>${EX[e.exId].name}</b>${e.rpe ? `<br><span class="tiny muted">RPE ${e.rpe}</span>` : ''}</td><td>${e.sets.map((x) => fmtSet(EX[e.exId], x)).join('<br>')}</td></tr>`).join('')}</table>
    ${s.cardio ? `<h3 class="mt">4x4</h3><table class="tbl"><tr><th>#</th><th>FC pico</th><th>Bajada</th></tr>${s.cardio.intervals.map((i, k) => `<tr><td>${k + 1}</td><td>${i.peak ?? '—'}</td><td>${i.rec != null ? i.rec + ' s' : '—'}</td></tr>`).join('')}</table>
      <p class="small">Potencia/nivel: ${s.cardio.power ?? '—'} · FC media: ${s.cardio.avgHr ?? '—'} · ${s.cardio.done ? 'Completado ✓' : 'Incompleto'}</p>` : ''}
    ${s.notes ? `<p class="small"><b>Notas:</b> ${esc(s.notes)}</p>` : ''}
    <div class="grid2 mt"><button class="btn" data-a="sess-edit" data-id="${s.id}">Editar</button><button class="btn danger" data-a="sess-del" data-id="${s.id}">Borrar</button></div>`);
}
function editSession(id) {
  const s = DB.sessions.find((x) => x.id === id); if (!s) return;
  const go2 = () => {
    const day = findDay(s.variant, s.dayId);
    const dr = newDraft(s.variant, s.dayId);
    Object.assign(dr, { id: s.id, editing: s.id, date: s.date, deload: !!s.deload, reduce: !!s.reduce, discomfort: s.discomfort ?? null, notes: s.notes || '' });
    const used = new Set();
    day.items.forEach((it, idx) => {
      const k = s.exercises.findIndex((e, j) => !used.has(j) && (e.exId === it.id || e.exId === it.alt));
      if (k < 0) { dr.items[idx].skipped = s.exercises.length > 0 ? true : false; return; }
      used.add(k);
      const e = s.exercises[k];
      dr.items[idx].exId = e.exId; dr.items[idx].rpe = e.rpe;
      dr.items[idx].sets = e.sets.map((x) => ({ w: x.w ?? '', r: x.r ?? '', rL: x.rL ?? '', rR: x.rR ?? '', done: true }));
    });
    if (s.cardio && dr.cardio) dr.cardio = { intervals: s.cardio.intervals.map((i) => ({ peak: i.peak ?? '', rec: i.rec ?? '' })), power: s.cardio.power ?? '', avgHr: s.cardio.avgHr ?? '', done: !!s.cardio.done, notes: s.cardio.notes || '' };
    draft = dr; saveDraft(); closeModal(); go('sesion');
  };
  if (draft && draft.id !== s.id) confirmModal('Sesión en curso', 'Editar esta sesión descartará la sesión en curso sin guardar. ¿Continuar?', 'Continuar', go2);
  else go2();
}

// ---------- GUÍA ----------
function viewGuia() {
  const volume = `<table class="tbl"><tr><th>Músculo</th><th>4 días</th><th>3 días</th></tr>${VOLUME.map((r) => `<tr><td><b>${r[0]}</b><br><span class="tiny muted">${r[3]}</span></td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table>
    <p class="small muted">Por debajo de ~5 series semanales por músculo hay poco cambio; desde ~10 series efectivas los resultados mejoran de forma clara.</p>`;
  return {
    top: `<div class="grow"><h1>Guía</h1><div class="sub">Programa de entrenamiento — Versión 3</div></div>`,
    body: GUIDE.map((g, i) => `<details class="acc" ${i === 0 ? 'open' : ''}><summary>${g.t}</summary><div class="body">${g.h === '__VOLUME__' ? volume : g.h}</div></details>`).join(''),
  };
}

// ---------- PERFIL / AJUSTES ----------
function viewAjustes() {
  const s = S();
  return {
    top: `<div class="grow"><h1>Perfil</h1><div class="sub">Datos y configuración</div></div>`,
    body: `
      <div class="card">
        <h2>Tus datos</h2>
        <label class="field"><span>Nombre (opcional)</span><input class="input" data-in="set-name" value="${esc(s.name)}" placeholder="Tu nombre"></label>
        <div class="grid3">
          <label class="field"><span>Edad</span><input class="input" inputmode="numeric" data-in="set-age" value="${esc(s.age)}"></label>
          <label class="field"><span>Peso (kg)</span><input class="input" inputmode="decimal" data-in="set-weight" value="${esc(s.weight)}"></label>
          <label class="field"><span>Altura (cm)</span><input class="input" inputmode="numeric" data-in="set-height" value="${esc(s.height)}"></label>
        </div>
        <div class="grid2">
          <label class="field"><span>Sexo (para Rockport)</span><select class="input" data-in="set-sex"><option value="F" ${s.sex === 'F' ? 'selected' : ''}>Mujer</option><option value="M" ${s.sex === 'M' ? 'selected' : ''}>Hombre</option></select></label>
          <label class="field"><span>Pierna / lado más débil</span><select class="input" data-in="set-weakSide"><option value="izq" ${s.weakSide === 'izq' ? 'selected' : ''}>Izquierdo</option><option value="der" ${s.weakSide === 'der' ? 'selected' : ''}>Derecho</option></select></label>
        </div>
      </div>
      <div class="card">
        <h2>Programa</h2>
        <div class="seg"><button class="${s.variant === '4' ? 'on' : ''}" data-a="set-variant" data-v="4">4 días</button><button class="${s.variant === '3' ? 'on' : ''}" data-a="set-variant" data-v="3">3 días</button></div>
        <label class="field"><span>Inicio del bloque de 3 meses</span><input class="input" type="date" data-in="set-startDate" value="${s.startDate}"></label>
        <div class="switch"><div><b>Semana de descarga</b><div class="tiny muted">${s.deloadUntil && todayISO() <= s.deloadUntil ? `Activa hasta el ${fmtShort(s.deloadUntil)}` : 'Activa durante 7 días: la mitad de las series'}</div></div><input type="checkbox" data-in="set-deload" ${s.deloadUntil && todayISO() <= s.deloadUntil ? 'checked' : ''}></div>
      </div>
      <div class="card">
        <h2>Frecuencia cardíaca máxima</h2>
        <div class="seg"><button class="${s.fcMode !== 'manual' ? 'on' : ''}" data-a="fcmode" data-v="tanaka">Fórmula Tanaka</button><button class="${s.fcMode === 'manual' ? 'on' : ''}" data-a="fcmode" data-v="manual">Valor medido</button></div>
        ${s.fcMode === 'manual' ? `<label class="field"><span>FCmax medida (lpm)</span><input class="input" inputmode="numeric" data-in="set-fcManual" value="${esc(s.fcManual ?? '')}" placeholder="Del test de campo o de laboratorio"></label>` : `<p class="small muted">208 − 0.7 × ${esc(s.age)} = <b>${Math.round(208 - 0.7 * (num(s.age) || 36))} lpm</b></p>`}
        <p class="small">Zona 4x4: <b id="z1">${zone(0.85, 0.95)}</b> · Recuperación: <b id="z2">${zone(0.6, 0.7)}</b></p>
      </div>
      <div class="card">
        <h2>Copia de seguridad</h2>
        <p class="small muted">Tus datos se guardan solo en este dispositivo. Exporta una copia de vez en cuando (las fotos no se incluyen).</p>
        <div class="grid2"><button class="btn" data-a="export">Exportar datos</button><label class="btn">Importar<input type="file" accept="application/json,.json" data-in="import" hidden></label></div>
        <button class="btn danger block mt" data-a="reset">Borrar todos los datos</button>
      </div>
      <div class="card">
        <h2>Instalar en el móvil</h2>
        <p class="small muted" style="margin:0"><b>Android (Chrome):</b> menú ⋮ → «Instalar aplicación».<br><b>iPhone (Safari):</b> botón Compartir → «Añadir a pantalla de inicio».<br>Funciona sin conexión una vez instalada.</p>
      </div>
      <p class="tiny muted center">Guía educativa de entrenamiento general. No reemplaza la evaluación de un médico, nutricionista o entrenador certificado.</p>`,
  };
}

// ---------- Modales ----------
function showModal(html) {
  $('#modal').innerHTML = `<div class="modal-bg" data-a="modal-bg"><div class="modal">${html}</div></div>`;
}
function closeModal() { $('#modal').innerHTML = ''; }
function confirmModal(title, text, okLabel, onOk) {
  showModal(`<h2>${title}</h2><p>${text}</p><div class="grid2 mt"><button class="btn" data-a="close-modal">Cancelar</button><button class="btn primary" id="cOk">${okLabel}</button></div>`);
  $('#cOk').onclick = () => { closeModal(); onOk(); };
}
let toastT = null;
function toast(msg) {
  let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 2400);
}

function modalVO2() {
  const tests = [...DB.vo2Tests].sort((a, b) => (a.date < b.date ? -1 : 1));
  const def = tests.length ? tests[0].type : 'cooper';
  showModal(`<h2>Test de VO2max</h2>
    <label class="field"><span>Fecha</span><input class="input" type="date" id="vDate" value="${todayISO()}"></label>
    <label class="field"><span>Tipo de test</span><select class="input" id="vType">${Object.entries(VO2_TYPES).map(([k, l]) => `<option value="${k}" ${k === def ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div id="vFields"></div>
    <div class="alert info"><div class="ico">🫁</div><div class="grow"><b id="vOut">—</b><span class="small" id="vCat"></span></div></div>
    <div id="vWarn"></div>
    <button class="btn cardio block" id="vSave">Guardar test</button>`);
  const fields = {
    cooper: `<label class="field"><span>Distancia recorrida en 12 min (metros)</span><input class="input" inputmode="numeric" id="v_dist" placeholder="ej. 1800"></label><p class="tiny muted">Corriendo o caminando, en pista o cinta. <b>No vale en bicicleta.</b></p>`,
    rockport: `<p class="tiny muted">Camina 1 milla (1609 m) lo más rápido posible.</p><div class="grid3"><label class="field"><span>Minutos</span><input class="input" inputmode="numeric" id="v_min"></label><label class="field"><span>Segundos</span><input class="input" inputmode="numeric" id="v_sec"></label><label class="field"><span>FC final</span><input class="input" inputmode="numeric" id="v_hr"></label></div>
      <label class="field"><span>Peso (kg)</span><input class="input" inputmode="decimal" id="v_weight" value="${esc(S().weight)}"></label>`,
    watch: `<label class="field"><span>VO2max estimado por el reloj (ml/kg/min)</span><input class="input" inputmode="decimal" id="v_value"></label>`,
  };
  const read = () => ({ dist: $('#v_dist')?.value, min: $('#v_min')?.value, sec: $('#v_sec')?.value, hr: $('#v_hr')?.value, weight: $('#v_weight')?.value, value: $('#v_value')?.value });
  const upd = () => {
    const t = $('#vType').value; const v = calcVO2(t, read());
    $('#vOut').textContent = v ? `${v.toFixed(1)} ml/kg/min` : 'Completa los datos';
    $('#vCat').textContent = v ? `Categoría: ${vo2Category(v)} (referencia mujeres 30-39)` : '';
    $('#vWarn').innerHTML = tests.length && t !== tests[0].type ? `<div class="alert warn"><div class="ico">⚠️</div><div class="grow small">Tu primer test fue «${VO2_TYPES[tests[0].type]}». No cambies de test entre mediciones para que los resultados sean comparables.</div></div>` : '';
  };
  const setType = () => { $('#vFields').innerHTML = fields[$('#vType').value]; $('#vFields').oninput = upd; upd(); };
  $('#vType').onchange = setType; setType();
  $('#vSave').onclick = () => {
    const t = $('#vType').value; const inp = read(); const v = calcVO2(t, inp);
    if (!v || v <= 0 || v > 90) { toast('Revisa los datos del test'); return; }
    DB.vo2Tests.push({ id: uid(), date: $('#vDate').value || todayISO(), type: t, input: inp, value: Math.round(v * 10) / 10 });
    save(); closeModal(); toast('Test guardado'); render();
  };
}
function modalRM() {
  showModal(`<h2>Test 5RM</h2>
    <p class="small muted">El peso máximo con el que logras 5 repeticiones con buena técnica.</p>
    <label class="field"><span>Fecha</span><input class="input" type="date" id="rDate" value="${todayISO()}"></label>
    <label class="field"><span>Ejercicio</span><select class="input" id="rEx"><option value="rdl">Peso muerto rumano</option><option value="hip_thrust">Hip thrust</option></select></label>
    <label class="field"><span>Peso (kg)</span><input class="input" inputmode="decimal" id="rW"></label>
    <button class="btn primary block" id="rSave">Guardar</button>`);
  $('#rSave').onclick = () => {
    const w = num($('#rW').value); if (!w) { toast('Indica el peso'); return; }
    DB.rmTests.push({ id: uid(), date: $('#rDate').value || todayISO(), exId: $('#rEx').value, w }); save(); closeModal(); toast('5RM guardado'); render();
  };
}
function modalMeasure() {
  const last = [...DB.measures].sort((a, b) => (a.date < b.date ? -1 : 1)).pop() || {};
  showModal(`<h2>Medidas corporales</h2>
    <label class="field"><span>Fecha</span><input class="input" type="date" id="mDate" value="${todayISO()}"></label>
    <div class="grid2">${METRICS.map(([k, l, u]) => `<label class="field"><span>${l} (${u})</span><input class="input" inputmode="decimal" id="m_${k}" placeholder="${last[k] ?? (k === 'weight' ? S().weight : '')}"></label>`).join('')}</div>
    <p class="tiny muted">Mide siempre en el mismo punto, a la misma hora y en condiciones similares.</p>
    <button class="btn primary block" id="mSave">Guardar</button>`);
  $('#mSave').onclick = () => {
    const rec = { id: uid(), date: $('#mDate').value || todayISO() };
    let any = false;
    METRICS.forEach(([k]) => { const v = num($('#m_' + k).value); if (v != null) { rec[k] = v; any = true; } });
    if (!any) { toast('Introduce al menos una medida'); return; }
    DB.measures.push(rec);
    if (rec.weight) DB.settings.weight = rec.weight;
    save(); closeModal(); toast('Medidas guardadas'); render();
  };
}

// ---------- Eventos ----------
document.addEventListener('click', (e) => {
  const navB = e.target.closest('[data-nav]');
  if (navB) { go(navB.dataset.nav); return; }
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const a = el.dataset.a;
  const i = el.dataset.i != null ? +el.dataset.i : null;
  switch (a) {
    case 'modal-bg': if (e.target === el) closeModal(); break;
    case 'close-modal': closeModal(); break;
    case 'start': startSession(el.dataset.variant, el.dataset.day); break;
    case 'resume': go('sesion'); break;
    case 'back': go('entrenar'); break;
    case 'variant': state.entVariant = el.dataset.v; render(); break;
    case 'set-variant': DB.settings.variant = el.dataset.v; state.entVariant = el.dataset.v; save(); toast(`Programa activo: ${el.dataset.v} días`); render(); break;
    case 'discomfort': draft.discomfort = el.dataset.v === '1'; if (!draft.discomfort) draft.reduce = false; saveDraft(); render(); break;
    case 'alt': {
      const it = draft.items[i];
      if (it.exId !== el.dataset.v) { it.exId = el.dataset.v; it.sets = []; it.rpe = null; saveDraft(); render(); }
      break;
    }
    case 'rpe': { const it = draft.items[i]; const v = +el.dataset.v; it.rpe = it.rpe === v ? null : v; saveDraft(); el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === it.rpe)); break; }
    case 'skip': draft.items[i].skipped = !draft.items[i].skipped; saveDraft(); render(); break;
    case 'setdone': {
      const it = draft.items[i]; const s = +el.dataset.s; const st = it.sets[s];
      const row = el.closest('.set-row');
      if (!st.done) {
        // Rellena con los valores sugeridos (placeholder) si están vacíos
        row.querySelectorAll('input').forEach((inp) => {
          if (inp.value === '' && inp.dataset.prev) { inp.value = inp.dataset.prev; st[inp.dataset.k] = inp.dataset.prev; }
        });
        const ex = EX[it.exId];
        const hasReps = ex.uni ? (st.rL !== '' || st.rR !== '') : st.r !== '';
        if (!hasReps) { toast('Indica las repeticiones'); return; }
        st.done = true; row.classList.add('done');
        const day = findDay(draft.variant, draft.dayId);
        const cur = day.items[i]; const nxt = day.items[i + 1];
        const firstOfPair = cur.ss && nxt && nxt.ss === cur.ss;
        if (!firstOfPair) startRest(cur.rest || ex.rest);
        else toast('Sin descanso: pasa al siguiente ejercicio del par');
      } else { st.done = false; row.classList.remove('done'); }
      saveDraft();
      break;
    }
    case 'finish': finishSession(); break;
    case 'discard':
      confirmModal(draft.editing ? 'Cancelar edición' : 'Descartar sesión', draft.editing ? 'Los cambios no se guardarán.' : 'Se perderán los datos de esta sesión.', draft.editing ? 'Salir sin guardar' : 'Descartar', () => { draft = null; saveDraft(); stopRest(); go('entrenar'); });
      break;
    case 'rest-add': if (rest) { rest.end = Math.max(rest.end, Date.now()) + 15000; restBeeped = false; try { localStorage.setItem(REST_KEY, JSON.stringify(rest)); } catch (er) {} updateRestPill(); } break;
    case 'rest-stop': stopRest(); break;
    case 'timer': beep(440, 0.01); keepAwake(true); openTimer(); break;
    case 'timer-close': closeTimer(); break;
    case 'timer-toggle':
      if (T.paused) { T.paused = false; T.end = Date.now() + T.remain * 1000; if (PROTOCOL_4X4[T.idx].zone === 'rec' && !T.recStart) T.recStart = Date.now(); keepAwake(true); }
      else { T.paused = true; T.remain = (T.end - Date.now()) / 1000; }
      renderTimer(); break;
    case 'timer-next': nextPhase(false); break;
    case 'timer-prev': goPhase(T.idx - 1, false); break;
    case 'rec-mark': {
      const ph = PROTOCOL_4X4[T.idx]; if (!T.recStart || T.recDone) break;
      const secs = Math.round((Date.now() - T.recStart) / 1000);
      draft.cardio.intervals[ph.n - 1].rec = String(secs); T.recDone = true; saveDraft(); renderTimer(); toast(`Bajada registrada: ${secs} s`);
      break;
    }
    case 'psub': state.progSub = el.dataset.v; render(); break;
    case 'metric': state.bodyMetric = el.dataset.v; render(); break;
    case 'add-rm': case 'rem-rm': modalRM(); break;
    case 'add-vo2': case 'rem-vo2': modalVO2(); break;
    case 'add-measure': case 'rem-measure': modalMeasure(); break;
    case 'rem-photo': state.view = 'progreso'; state.progSub = 'cuerpo'; render(); setTimeout(() => { const f = $('[data-in="photo"]'); f && f.click(); }, 50); break;
    case 'rem-deload': {
      const d = new Date(); d.setDate(d.getDate() + 6);
      DB.settings.deloadUntil = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; save(); toast('Semana de descarga activada'); render(); break;
    }
    case 'del-rm': confirmModal('Borrar 5RM', '¿Borrar este registro?', 'Borrar', () => { DB.rmTests = DB.rmTests.filter((x) => x.id !== el.dataset.id); save(); render(); }); break;
    case 'del-vo2': confirmModal('Borrar test', '¿Borrar este test de VO2max?', 'Borrar', () => { DB.vo2Tests = DB.vo2Tests.filter((x) => x.id !== el.dataset.id); save(); render(); }); break;
    case 'del-measure': confirmModal('Borrar medidas', '¿Borrar este registro de medidas?', 'Borrar', () => { DB.measures = DB.measures.filter((x) => x.id !== el.dataset.id); save(); render(); }); break;
    case 'photo-sel': {
      const id = el.dataset.id;
      state.photoSel = state.photoSel.includes(id) ? state.photoSel.filter((x) => x !== id) : [...state.photoSel, id].slice(-2);
      loadPhotos(); break;
    }
    case 'photo-clear': state.photoSel = []; loadPhotos(); break;
    case 'photo-del': confirmModal('Borrar foto', 'La foto se borrará de este dispositivo.', 'Borrar', async () => { await PhotoDB.del(el.dataset.id); state.photoSel = []; loadPhotos(); }); break;
    case 'sess': sessionDetail(el.dataset.id); break;
    case 'sess-edit': editSession(el.dataset.id); break;
    case 'sess-del': confirmModal('Borrar sesión', 'Esta sesión se borrará del historial.', 'Borrar', () => { DB.sessions = DB.sessions.filter((x) => x.id !== el.dataset.id); save(); render(); }); break;
    case 'fcmode': DB.settings.fcMode = el.dataset.v; save(); render(); break;
    case 'export': {
      const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `rutina-gera-${todayISO()}.json`; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000); toast('Copia exportada'); break;
    }
    case 'reset': confirmModal('Borrar todo', 'Se eliminarán sesiones, tests, medidas y ajustes de este dispositivo. No se puede deshacer.', 'Borrar todo', () => { DB = defaultData(); draft = null; saveDraft(); save(); go('hoy'); toast('Datos borrados'); }); break;
  }
});

document.addEventListener('input', (e) => {
  const el = e.target; const k = el.dataset.in; if (!k) return;
  if (k === 'set') { const st = draft.items[+el.dataset.i].sets[+el.dataset.s]; st[el.dataset.k] = el.value; saveDraft(); return; }
  if (k === 'iv') { draft.cardio.intervals[+el.dataset.k][el.dataset.f] = el.value; saveDraft(); return; }
  if (k === 'cardio') { draft.cardio[el.dataset.f] = el.value; saveDraft(); return; }
  if (k === 'notes') { draft.notes = el.value; saveDraft(); return; }
  if (k.startsWith('set-') && el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'date') {
    DB.settings[k.slice(4)] = el.value; save();
    const z1 = $('#z1'), z2 = $('#z2'); if (z1) { z1.textContent = zone(0.85, 0.95); z2.textContent = zone(0.6, 0.7); }
  }
});
document.addEventListener('change', (e) => {
  const el = e.target; const k = el.dataset.in; if (!k) return;
  if (k === 'date') { draft.date = el.value || todayISO(); saveDraft(); render(); return; }
  if (k === 'deload') { draft.deload = el.checked; saveDraft(); render(); return; }
  if (k === 'reduce') { draft.reduce = el.checked; saveDraft(); render(); return; }
  if (k === 'cardio-done') { draft.cardio.done = el.checked; saveDraft(); return; }
  if (k === 'progEx') { state.progEx = el.value; render(); return; }
  if (k === 'photo') { if (el.files[0]) addPhoto(el.files[0]); el.value = ''; return; }
  if (k === 'set-deload') {
    if (el.checked) { const d = new Date(); d.setDate(d.getDate() + 6); DB.settings.deloadUntil = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    else DB.settings.deloadUntil = null;
    save(); render(); return;
  }
  if (k === 'import') {
    const f = el.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.sessions) || !d.settings) throw new Error('formato');
        confirmModal('Importar copia', `Se reemplazarán los datos actuales por la copia (${d.sessions.length} sesiones).`, 'Importar', () => {
          const def = defaultData(); DB = Object.assign(def, d, { settings: Object.assign(def.settings, d.settings) }); save(); state.entVariant = S().variant; go('hoy'); toast('Datos importados');
        });
      } catch (er) { toast('El archivo no es una copia válida'); }
    };
    r.readAsText(f); el.value = ''; return;
  }
  if (k.startsWith('set-')) { DB.settings[k.slice(4)] = el.value; save(); render(); }
});

// Al volver a la app, refresca temporizadores
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { updateRestPill(); if (T && !T.paused) { timerLoop(); keepAwake(true); } }
});

// ---------- Arranque ----------
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
