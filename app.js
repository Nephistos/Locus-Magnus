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
  status: document.getElementById("status"),
};

let pool = [];      // toutes les entrées, mantras et quotes mélangés
let deck = [];      // ordre aléatoire des prochaines entrées
let current = null;

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

function next() {
  if (pool.length > 1) show(drawNext());
}

/* ---------- Interactions ---------- */

els.next.addEventListener("click", next);

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" && document.activeElement !== els.next) next();
});

// Balayage vers la gauche pour passer au texte suivant.
let touchX = null;
document.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
document.addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (dx < -60) next();
}, { passive: true });

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

  show(entryOfTheDay(), true);
  els.next.disabled = pool.length < 2;
  updateOnlineStatus();
}

start();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker non enregistré :", err);
    });
  });
}
