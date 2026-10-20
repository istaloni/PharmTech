// Shared flashcard engine for the PharmTech site.
// Used from any post's {ojs} cell:
//
//   fc = import(new URL("../../flashcards.js?v=2026-10-20b", document.baseURI).href)   // then use fc.flashcards, fc.esc
//   flashcards({ cards, modes, storageKey, idField, groupField, searchFields, invalidation })
//
// cards        array of row objects (e.g. from FileAttachment(...).csv())
// modes        { key: { label, front: d => html, back: d => html, hideGroupOnFront } }  (first is the default)
//              the current group (e.g. drug class) shows as a banner on each card; set
//              hideGroupOnFront: true when the group is the answer being quizzed
// storageKey   localStorage key for "Got it" progress (one per deck)
// idField      column that uniquely identifies a card (default "id" or the row index)
// groupField   optional column to filter by (e.g. "group" or "category")
// groupLabel   label for that filter (default "Group")
// groupings    optional list of ways to group the deck, first is the default:
//              [{ label: "Drug class", field: "pharm_class", orderField: "class_order" }, ...]
//              adds a "Group by" menu; orderField (optional) sets card and group order
// searchFields columns the search box looks through
// invalidation pass Observable's `invalidation` so keyboard shortcuts are cleaned up

// Styles travel with the engine (not styles.css) so a browser can never pair new card
// code with a cached old stylesheet. Bump the ?v= in each page's import after editing.
const FLASHCARD_CSS = `
.fc-app { max-width: 560px; margin: 1.5rem auto; font-family: inherit; }

.fc-controls { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem .8rem; margin-bottom: 1rem; font-size: .85rem; }
.fc-controls label { display: flex; flex-direction: column; gap: .25rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: .7rem; color: #555; }
.fc-controls select, .fc-controls input[type=search] {
  font: inherit; font-size: .9rem; text-transform: none; letter-spacing: 0; font-weight: 400;
  padding: .45rem .6rem; border: 1px solid #ccc; border-radius: 8px; background: #fff; color: #222; width: 100%;
}
.fc-controls .fc-check { flex-direction: row; align-items: center; gap: .45rem; align-self: end; padding-bottom: .5rem; }

.fc-scene { perspective: 1200px; height: 340px; cursor: pointer; outline: none; }
.fc-scene:focus-visible .fc-card { box-shadow: 0 0 0 3px #1a73e8; }
.fc-card {
  position: relative; width: 100%; height: 100%; border-radius: 16px;
  transform-style: preserve-3d; transition: transform .6s cubic-bezier(.4, 0, .2, 1);
  box-shadow: 0 8px 20px rgba(0, 0, 0, .12); border: 1px solid #e3e3e3;
}
.fc-card.is-flipped { transform: rotateY(180deg); }
.fc-face {
  position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden;
  border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column;
  align-items: center; justify-content: flex-start; text-align: center; background: #fff; overflow: auto;
}
.fc-back { transform: rotateY(180deg); background: #f6f8fb; }
/* class banner pinned to the top; card content centered below it (long content scrolls) */
.fc-face { padding-top: 0; }
.fc-classbar {
  flex: none; align-self: stretch; margin: 0 -1.5rem 0; padding: .55rem 1rem;
  background: #1d3557; color: #fff; font-weight: 700; font-size: 1.05rem; letter-spacing: .02em;
  border-radius: 16px 16px 0 0; text-align: center;
}
.fc-body { margin: auto 0; padding-top: 1.25rem; display: flex; flex-direction: column; align-items: center; width: 100%; }

.fc-kicker { font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; color: #888; margin-bottom: .4rem; }
.fc-big { font-size: 1.7rem; font-weight: 700; line-height: 1.2; color: #1d2433; }
.fc-big.fc-mid { font-size: 1.3rem; }
.fc-row { margin-top: .6rem; font-size: 1rem; color: #333; }
.fc-dl { display: grid; grid-template-columns: auto 1fr; gap: .35rem .9rem; margin: 1rem 0 0; text-align: left; font-size: .95rem; }
.fc-dl dt { font-weight: 600; color: #666; }
.fc-dl dd { margin: 0; color: #222; }

.fc-badge { display: inline-block; padding: .1rem .55rem; border-radius: 999px; font-size: .8rem; font-weight: 600; }
.fc-rx   { background: #e7f0fd; color: #1a4fa0; }
.fc-otc  { background: #e6f6ea; color: #1e6b34; }
.fc-ctrl { background: #fdeaea; color: #a32020; }
.fc-answer { font-size: 1.1rem; line-height: 1.5; color: #1d2433; max-width: 30rem; }
.fc-dl dd.fc-note { color: #8a4b00; font-size: .88rem; }

.fc-meta { text-align: center; font-size: .85rem; color: #666; margin-top: .6rem; min-height: 1.2em; }
.fc-known { color: #1e6b34; }

.fc-nav { display: flex; justify-content: center; align-items: center; gap: .6rem; flex-wrap: wrap; margin-top: .8rem; }
.fc-nav button {
  font: inherit; font-size: .85rem; padding: .5rem 1rem; border-radius: 999px;
  border: 1px solid #ccc; background: #fff; color: #222; cursor: pointer;
}
.fc-nav button:hover { background: #f2f2f2; }
.fc-nav .fc-know { background: #1e6b34; border-color: #1e6b34; color: #fff; }
.fc-nav .fc-know:hover { background: #185a2b; }
.fc-nav .fc-learn { border-color: #c77700; color: #8a5300; }
.fc-nav .fc-reset { border: none; color: #888; text-decoration: underline; padding: .5rem .4rem; }
.fc-count { font-weight: 700; min-width: 5.5rem; text-align: center; }

.fc-progress { height: 6px; background: #eee; border-radius: 999px; overflow: hidden; margin-top: 1rem; }
.fc-bar { height: 100%; width: 0; background: #1e6b34; transition: width .3s; }
.fc-progress-text { text-align: center; font-size: .8rem; color: #666; margin-top: .35rem; }

@media (max-width: 520px) {
  .fc-controls { grid-template-columns: 1fr; }
  .fc-scene { height: 400px; }
  .fc-big { font-size: 1.4rem; }
}
`;
function injectStyles() {
  if (document.getElementById("fc-styles")) return;
  const style = document.createElement("style");
  style.id = "fc-styles";
  style.textContent = FLASHCARD_CSS;
  document.head.appendChild(style);
}

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function flashcards({
  cards, modes, storageKey, idField, groupField, groupLabel = "Group", groupings,
  subgroupField, searchFields, invalidation, placeholder = "Search"
}) {
  injectStyles();
  if (!groupings && groupField) groupings = [{ label: groupLabel, field: groupField }];
  groupings = groupings || [];
  const idOf = (d, k) => idField ? d[idField] : (d.id ?? String(k));
  cards.forEach((d, k) => { d.__id = idOf(d, k); });

  const load = () => { try { return new Set(JSON.parse(localStorage.getItem(storageKey) || "[]")); } catch { return new Set(); } };
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify([...known])); } catch {} };
  const known = load();

  const fields = searchFields || Object.keys(cards[0] || {}).filter(k => k !== "__id");
  const modeKeys = Object.keys(modes);

  const ui = document.createElement("div");
  ui.className = "fc-app";
  ui.innerHTML = `
    <div class="fc-controls">
      ${modeKeys.length > 1 ? `<label>Mode <select class="fc-mode">${modeKeys.map(k => `<option value="${k}">${esc(modes[k].label)}</option>`).join("")}</select></label>` : ""}
      ${groupings.length > 1 ? `<label>Group by <select class="fc-groupby">${groupings.map((g, k) => `<option value="${k}">${esc(g.label)}</option>`).join("")}</select></label>` : ""}
      ${groupings.length ? `<label class="fc-grouplab"><span class="fc-grouplabel"></span> <select class="fc-group"></select></label>` : ""}
      <label class="fc-searchlab">Search <input class="fc-search" type="search" placeholder="${esc(placeholder)}"></label>
      <label class="fc-check"><input type="checkbox" class="fc-learning"> Only still learning</label>
    </div>
    <div class="fc-scene" tabindex="0" role="button" aria-label="Flashcard. Press space to flip.">
      <div class="fc-card"><div class="fc-face fc-front"></div><div class="fc-face fc-back"></div></div>
    </div>
    <div class="fc-meta"><span class="fc-tag"></span></div>
    <div class="fc-nav">
      <button class="fc-prev" type="button">← Previous</button>
      <span class="fc-count"></span>
      <button class="fc-next" type="button">Next →</button>
    </div>
    <div class="fc-nav">
      <button class="fc-learn" type="button">Still learning</button>
      <button class="fc-know" type="button">Got it ✓</button>
      <button class="fc-shuffle" type="button">Shuffle</button>
      <button class="fc-reset" type="button">Reset progress</button>
    </div>
    <div class="fc-progress"><div class="fc-bar"></div></div>
    <div class="fc-progress-text"></div>`;

  const $ = s => ui.querySelector(s);
  const mode = () => modes[$(".fc-mode")?.value || modeKeys[0]];
  let deck = [], i = 0, flipped = false;
  let order = cards.map((_, k) => k);
  const grouping = () => groupings[+($(".fc-groupby")?.value || 0)];

  // Fill the group menu for the current grouping, in that grouping's order
  function setGrouping() {
    const g = grouping();
    if (!g) return;
    const key = d => g.orderField ? d[g.orderField] : "";
    order = cards.map((_, k) => k).sort((a, b) => String(key(cards[a])).localeCompare(String(key(cards[b]))) || a - b);
    const values = [...new Set(order.map(k => cards[k][g.field]).filter(Boolean))];
    $(".fc-grouplabel").textContent = groupings.length > 1 ? g.label : (g.label || "Group");
    $(".fc-group").innerHTML = `<option value="">All</option>` + values.map(v => `<option>${esc(v)}</option>`).join("");
  }

  function build() {
    const q = $(".fc-search").value.trim().toLowerCase();
    const g = $(".fc-group")?.value || "";
    const gf = grouping()?.field;
    const onlyLearning = $(".fc-learning").checked;
    deck = order.map(k => cards[k]).filter(d =>
      (!g || d[gf] === g) &&
      (!onlyLearning || !known.has(d.__id)) &&
      (!q || fields.map(f => d[f]).join(" ").toLowerCase().includes(q)));
    i = 0; flipped = false; render();
  }

  function render() {
    $(".fc-card").classList.toggle("is-flipped", flipped);
    if (!deck.length) {
      $(".fc-front").innerHTML = `<div class="fc-row">No cards match. ${$(".fc-learning").checked ? "You've got them all! 🎉" : "Try clearing the search or filter."}</div>`;
      $(".fc-back").innerHTML = "";
      $(".fc-count").textContent = "0 / 0";
      $(".fc-tag").textContent = "";
    } else {
      const d = deck[i], m = mode();
      const cur = grouping();
      const banner = cur && d[cur.field] ? `<div class="fc-classbar">${esc(d[cur.field])}</div>` : "";
      $(".fc-front").innerHTML = (m.hideGroupOnFront ? "" : banner) + `<div class="fc-body">${m.front(d)}</div>`;
      $(".fc-back").innerHTML = banner + `<div class="fc-body">${m.back(d)}</div>`;
      $(".fc-count").textContent = `${i + 1} / ${deck.length}`;
      const tagFields = cur ? groupings.filter(x => x !== cur).map(x => x.field) : [];
      if (subgroupField) tagFields.push(subgroupField);
      const tag = [...new Set(tagFields.map(f => d[f]).filter(Boolean))].map(esc).join(" · ");
      $(".fc-tag").innerHTML = tag + (known.has(d.__id) ? `${tag ? " · " : ""}<strong class="fc-known">Got it ✓</strong>` : "");
    }
    const pct = cards.length ? Math.round(100 * known.size / cards.length) : 0;
    $(".fc-bar").style.width = pct + "%";
    $(".fc-progress-text").textContent = `${known.size} of ${cards.length} cards mastered (${pct}%)`;
  }

  const go = step => { if (!deck.length) return; i = (i + step + deck.length) % deck.length; flipped = false; render(); };
  const flip = () => { if (!deck.length) return; flipped = !flipped; render(); };
  const mark = isKnown => {
    if (!deck.length) return;
    const d = deck[i];
    isKnown ? known.add(d.__id) : known.delete(d.__id);
    save();
    if ($(".fc-learning").checked && isKnown) {        // drop it from the drill deck
      deck.splice(i, 1);
      if (i >= deck.length) i = 0;
      flipped = false; render();
    } else go(1);
  };
  const shuffle = () => {
    for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
    build();
  };

  $(".fc-scene").onclick = flip;
  $(".fc-prev").onclick = () => go(-1);
  $(".fc-next").onclick = () => go(1);
  $(".fc-know").onclick = () => mark(true);
  $(".fc-learn").onclick = () => mark(false);
  $(".fc-shuffle").onclick = shuffle;
  $(".fc-reset").onclick = () => { if (confirm("Clear all saved progress for this deck?")) { known.clear(); save(); build(); } };
  if ($(".fc-mode")) $(".fc-mode").onchange = () => { flipped = false; render(); };
  if ($(".fc-group")) $(".fc-group").onchange = build;
  if ($(".fc-groupby")) $(".fc-groupby").onchange = () => { setGrouping(); build(); };
  $(".fc-learning").onchange = build;
  $(".fc-search").oninput = build;

  // Keyboard shortcuts act on the deck the page was last scrolled to / clicked in
  const onKey = e => {
    if (e.target.closest?.("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    const active = document.querySelector(".fc-app.fc-active") || document.querySelector(".fc-app");
    if (active !== ui) return;
    if (e.key === " ") { e.preventDefault(); flip(); }
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "k" || e.key === "K") mark(true);
    else if (e.key === "l" || e.key === "L") mark(false);
  };
  ui.addEventListener("pointerdown", () => {
    document.querySelectorAll(".fc-app.fc-active").forEach(el => el.classList.remove("fc-active"));
    ui.classList.add("fc-active");
  });
  document.addEventListener("keydown", onKey);
  invalidation?.then(() => document.removeEventListener("keydown", onKey));

  setGrouping();
  build();
  return ui;
}
