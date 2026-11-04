/* ------------------------------------------------------------
   Locus Magnus — logique de l'application
   ------------------------------------------------------------ */

// Les fichiers de contenu. Pour ajouter une source, ajoutez son chemin ici.
const SOURCES = ["data/mantras.json", "data/quotes.json"];

const LABELS = {
  mantra: { today: "Mantra of the day", other: "Mantra" },
  quote:  { today: "Quote of the day",  other: "Quote" },
};

const els = {
  entry:  document.querySelector(".entry"),
  kind:   document.getElementById("kind"),
  text:   document.getElementById("text"),
  author: document.getElementById("author"),
  next:   document.getElementById("next"),
  prev:   document.getElementById("prev"),
  share:  document.getElementById("share"),
  status: document.getElementById("status"),
};

let pool = [];      // toutes les entrées, mantras et quotes mélangés
let deck = [];      // ordre aléatoire des prochaines entrées
let current = null;
let seen = [];   // textes déjà affichés, pour revenir en arrière
let pos = -1;       // position dans cet historique

/* ---------- Accès aux données ----------
   Toute la lecture du contenu passe par cette fonction.
   Le jour où le contenu viendra d'une API, seul ce bloc changera. */
async function getEntries() {
  const results = await Promise.allSettled(
    SOURCES.map((url) => fetch(url, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`${url} : ${r.status}`);
      return r.json();
    }))
  );

  const entries = results
    .filter((r) => r.status === "fulfilled" && Array.isArray(r.value))
    .flatMap((r) => r.value)
    .filter((e) => e && typeof e.id === "string" && typeof e.text === "string" && e.text.trim());

  results
    .filter((r) => r.status === "rejected")
    .forEach((r) => console.warn("Source non chargée :", r.reason));

  // Tri par identifiant : le « texte du jour » reste stable quel que soit l'ordre des fichiers.
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

/* ---------- Tirage ---------- */

// Petit hachage déterministe d'une chaîne (FNV-1a).
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Le même texte pour toute la journée, basé sur la date du téléphone.
function entryOfTheDay() {
  return pool[hash(todayKey()) % pool.length];
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// On parcourt tout le pool avant de revoir un texte.
function drawNext() {
  if (deck.length === 0) {
    deck = shuffle(pool.filter((e) => e !== current));
  }
  return deck.pop() ?? current;
}

/* ---------- Affichage ---------- */

function render(entry, isToday) {
  const labels = LABELS[entry.type] ?? { today: "For today", other: "" };
  els.kind.textContent = isToday ? labels.today : labels.other;

  const p = document.createElement("p");
  p.textContent = entry.text;
  els.text.replaceChildren(p);
  els.text.classList.toggle("is-long", entry.text.length > 150);

  els.author.textContent = entry.author ? entry.author : "";
  current = entry;
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function show(entry, isToday = false) {
  if (reducedMotion.matches || !current) {
    render(entry, isToday);
    return;
  }
  els.entry.classList.add("is-changing");
  setTimeout(() => {
    render(entry, isToday);
    els.entry.classList.remove("is-changing");
  }, 320);
}

function updateButtons() {
  els.prev.disabled = pos <= 0;
  els.next.disabled = pool.length < 2;
  els.share.disabled = !current;
}

function showAt(index) {
  pos = index;
  const item = seen[pos];
  show(item.entry, item.isToday);
  updateButtons();
}

function next() {
  if (pool.length < 2) return;
  if (pos < seen.length - 1) {
    showAt(pos + 1);          // on revient vers un texte déjà vu
  } else {
    seen.push({ entry: drawNext(), isToday: false });
    showAt(seen.length - 1);
  }
}

function prev() {
  if (pos > 0) showAt(pos - 1);
}

/* ---------- Messages brefs ---------- */

let flashTimer = null;
function flash(message) {
  els.status.textContent = message;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(updateOnlineStatus, 2200);
}

/* ---------- Copier ---------- */

function plainText(entry) {
  return entry.author ? `“${entry.text}” — ${entry.author}` : entry.text;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (err) {}
    area.remove();
    return ok;
  }
}

async function copyCurrent() {
  if (!current) return;
  if (await copyText(plainText(current))) {
    navigator.vibrate?.(12);
    flash("Copied.");
  }
}

/* ---------- Partager ----------
   Partage une image du texte (format story, idéale pour Instagram)
   accompagnée du texte, via la fenêtre de partage du téléphone.
   Sans partage natif (ordinateur), le texte est copié. */

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Même couleur, totalement transparente : évite un halo gris dans le dégradé.
function transparent(color) {
  const hex = color.replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const n = parseInt(hex, 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, 0)`;
  }
  return "rgba(0, 0, 0, 0)";
}

// Lignes équilibrées : on resserre la largeur tant que le nombre de lignes ne change pas.
function balancedLines(ctx, text, maxWidth) {
  const base = wrapLines(ctx, text, maxWidth);
  let best = base;
  for (let w = maxWidth - 20; w >= maxWidth * 0.6; w -= 20) {
    const candidate = wrapLines(ctx, text, w);
    if (candidate.length !== base.length) break;
    best = candidate;
  }
  return best;
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function makeShareImage(entry) {
  const W = 1080, H = 1920, horizonY = Math.round(H * 0.72);
  const serif = '"Cormorant Garamond", Georgia, serif';
  try {
    await Promise.all([
      document.fonts.load(`300 80px "Cormorant Garamond"`),
      document.fonts.load(`italic 300 48px "Cormorant Garamond"`),
    ]);
  } catch (e) {}

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Ciel
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, cssVar("--sky-top"));
  sky.addColorStop(1, cssVar("--sky-low"));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizonY);

  // Lueur sur l'horizon
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, horizonY);
  ctx.clip();
  ctx.translate(W / 2, horizonY);
  ctx.scale(1, 0.62);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 760);
  const glowColor = cssVar("--glow");
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, transparent(glowColor));
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = glow;
  ctx.fillRect(-W, -1300, W * 2, 1300);
  ctx.restore();

  // Sol et horizon
  ctx.fillStyle = cssVar("--ground");
  ctx.fillRect(0, horizonY, W, H - horizonY);
  ctx.fillStyle = cssVar("--line");
  ctx.fillRect(0, horizonY, W, 2);

  // Texte, avec une taille qui s'adapte à sa longueur
  const ink = cssVar("--ink"), soft = cssVar("--ink-soft");
  const maxWidth = 860;
  let size = 96, lines, lineHeight;
  do {
    ctx.font = `300 ${size}px ${serif}`;
    lines = balancedLines(ctx, entry.text, maxWidth);
    lineHeight = size * 1.2;
    size -= 4;
  } while (lines.length * lineHeight > 860 && size > 40);

  const blockHeight = lines.length * lineHeight + (entry.author ? 110 : 0);
  let y = (horizonY - blockHeight) / 2 + lineHeight * 0.8;
  ctx.textAlign = "center";
  ctx.fillStyle = ink;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lineHeight;
  }
  if (entry.author) {
    ctx.font = `italic 300 52px ${serif}`;
    ctx.fillStyle = soft;
    ctx.fillText(entry.author, W / 2, y + 50);
  }

  // Signature, posée sur le sol
  const groundMid = horizonY + (H - horizonY) / 2;
  ctx.fillStyle = ink;
  ctx.font = `300 50px ${serif}`;
  ctx.fillText("Locus Magnus", W / 2, groundMid - 6);
  ctx.fillStyle = soft;
  ctx.font = `italic 300 36px ${serif}`;
  ctx.fillText("A big place for small days.", W / 2, groundMid + 46);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? new File([blob], "locus-magnus.png", { type: "image/png" }) : null;
}

async function shareCurrent() {
  if (!current) return;
  const entry = current;
  const text = plainText(entry);

  if (!navigator.share) {
    if (await copyText(text)) flash("Copied. Paste it wherever you like.");
    return;
  }

  const data = { text };
  try {
    const file = await makeShareImage(entry);
    if (file && navigator.canShare?.({ files: [file] })) data.files = [file];
  } catch (e) {
    console.warn("Image non générée :", e);
  }

  try {
    await navigator.share(data);
  } catch (e) {
    if (e.name !== "AbortError" && await copyText(text)) flash("Copied.");
  }
}

/* ---------- Interactions ---------- */

els.next.addEventListener("click", next);
els.prev.addEventListener("click", prev);
els.share.addEventListener("click", shareCurrent);

document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("button, a")) return;
  if (e.key === "ArrowRight") next();
  if (e.key === "ArrowLeft") prev();
});

// Balayage : vers la gauche pour le texte suivant, vers la droite pour le précédent.
let touchX = null, touchY = null;
document.addEventListener("touchstart", (e) => {
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  touchX = touchY = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
  if (dx < 0) next(); else prev();
}, { passive: true });

// Appui long sur le texte pour le copier.
let pressTimer = null;
function cancelPress() { clearTimeout(pressTimer); pressTimer = null; }
els.text.addEventListener("pointerdown", () => {
  cancelPress();
  pressTimer = setTimeout(() => { pressTimer = null; copyCurrent(); }, 550);
});
["pointerup", "pointerleave", "pointercancel", "pointermove"].forEach((type) => {
  els.text.addEventListener(type, (e) => {
    if (type === "pointermove" && Math.abs(e.movementX) + Math.abs(e.movementY) < 4) return;
    cancelPress();
  });
});
els.text.addEventListener("contextmenu", (e) => e.preventDefault());

function updateOnlineStatus() {
  els.status.textContent = navigator.onLine ? "" : "Offline. Texts already loaded are still available.";
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

/* ---------- Thème clair / sombre ---------- */

const themeToggle = document.getElementById("theme-toggle");
const themeMeta = document.getElementById("theme-color");
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function savedTheme() {
  try { return localStorage.getItem("theme"); } catch (e) { return null; }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeMeta?.setAttribute("content", theme === "dark" ? "#0f1529" : "#b9c7d8");
  themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("theme", next); } catch (e) {}
});

// Sans choix manuel, l'application suit le réglage du téléphone.
systemDark.addEventListener("change", (e) => {
  if (!savedTheme()) applyTheme(e.matches ? "dark" : "light");
});

applyTheme(document.documentElement.getAttribute("data-theme") || (systemDark.matches ? "dark" : "light"));

/* ---------- Démarrage ---------- */

async function start() {
  try {
    pool = await getEntries();
  } catch (err) {
    console.error(err);
    pool = [];
  }

  if (pool.length === 0) {
    els.kind.textContent = "";
    els.text.replaceChildren(Object.assign(document.createElement("p"), {
      textContent: "Nothing to show yet.",
    }));
    els.status.textContent = "Check your connection, then reopen the app.";
    return;
  }

  seen = [{ entry: entryOfTheDay(), isToday: true }];
  showAt(0);
  updateOnlineStatus();
}

start();

/* ---------- Mise à jour automatique ----------
   Quand une nouvelle version du code est en ligne, le service worker
   prend la main et la page se recharge d'elle-même, une seule fois. */

if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || refreshing) return;   // première installation : rien à recharger
    refreshing = true;
    location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((registration) => {
      // Vérifie les mises à jour à chaque retour dans l'application.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update().catch(() => {});
      });
    }).catch((err) => {
      console.warn("Service worker non enregistré :", err);
    });
  });
}
