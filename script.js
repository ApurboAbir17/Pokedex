// =========================================================
// GLASS POKÉDEX - script.js
// Flow: user types -> we fetch from PokéAPI -> we draw the card.
// Extra: cache (saves data), suggestions, recent searches,
// sound, next/previous, and an endless grid of random Pokémon.
// =========================================================

// ---------- 1. Grab the HTML elements ----------
const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const searchButton = document.querySelector("#search-button");
const suggestionsEl = document.querySelector("#suggestions");
const recentEl = document.querySelector("#recent");
const statusBox = document.querySelector("#status");
const card = document.querySelector("#card");

const nameEl = document.querySelector("#poke-name");
const jpEl = document.querySelector("#poke-jp");
const idEl = document.querySelector("#poke-id");
const genEl = document.querySelector("#poke-gen");
const genusEl = document.querySelector("#poke-genus");
const imgEl = document.querySelector("#poke-img");
const watermarkEl = document.querySelector("#poke-watermark");
const artSelect = document.querySelector("#art-select");
const shinyBtn = document.querySelector("#shiny-btn");
const cryBtn = document.querySelector("#cry-btn");
const prevBtn = document.querySelector("#prev-btn");
const nextBtn = document.querySelector("#next-btn");
const prevName = document.querySelector("#prev-name");
const nextName = document.querySelector("#next-name");

const heightEl = document.querySelector("#poke-height");
const weightEl = document.querySelector("#poke-weight");
const totalEl = document.querySelector("#poke-total");
const typesEl = document.querySelector("#types");
const abilitiesEl = document.querySelector("#abilities");
const statsEl = document.querySelector("#stats");
const radarShape = document.querySelector("#radar-shape");
const descEl = document.querySelector("#poke-desc");
const evolutionEl = document.querySelector("#evolution");

const grid = document.querySelector("#grid");
const sentinel = document.querySelector("#sentinel");
const typebar = document.querySelector("#typebar");
const filterNote = document.querySelector("#filter-note");

// ---------- 2. Settings and memory ----------
const API = "https://pokeapi.co/api/v2/";
const SPRITE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";
const MAX_POKEMON = 1025; // how many Pokémon have a national number

// Ask the OS every time, so turning the setting on mid-visit still works
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
function reduceMotion() {
  return motionQuery.matches;
}

let allNames = [];      // every Pokémon name (used for suggestions and the grid)
let current = null;     // the Pokémon shown on the card
let showingShiny = false;
let latestRequest = 0;  // used to ignore old answers if you click fast
let queue = [];         // shuffled numbers for the endless grid

// The cache: name/number -> Pokémon data. Saved in localStorage so it
// is still there after you close the browser.
const cache = new Map();
let recent = readLocal("pokedexRecent", []);

// Stats in the order the hexagon uses (top, then clockwise).
// The chart and the list below share these words on purpose.
const STAT_ORDER = [
  { key: "hp", label: "HP" },
  { key: "attack", label: "Attack" },
  { key: "defense", label: "Defense" },
  { key: "speed", label: "Speed" },
  { key: "special-defense", label: "Sp. Def" },
  { key: "special-attack", label: "Sp. Atk" },
];

// The chart is a 300x220 box with the hexagon centred on 150,110
const RADAR = { cx: 150, cy: 110, r: 75 };
const MAX_STAT = 255;   // the same ceiling for the bars, so both agree
const MORPH_MS = 400;   // matches --dur-s, so the two never disagree

// The hexagon has to be moved by hand: SVG geometry cannot be
// CSS-transitioned. This tweens the six corners so the chart shows
// how the stats changed instead of just jumping to a new shape.
let radarFrom = null;   // the six [x, y] pairs we are leaving
let radarFrame = 0;     // the frame in flight, so a new tween can cancel it

function drawRadar(points) {
  radarShape.setAttribute("points", points.map(function (p) {
    return p[0].toFixed(1) + "," + p[1].toFixed(1);
  }).join(" "));
}

function morphRadar(to) {
  cancelAnimationFrame(radarFrame);

  // Nothing to move from: the first Pokémon of a visit draws instantly,
  // which also keeps the tween from running while the card is hidden.
  if (reduceMotion() || !radarFrom) {
    drawRadar(to);
    radarFrom = to;
    return;
  }

  const from = radarFrom;
  const started = performance.now();

  const step = function (now) {
    const t = Math.min((now - started) / MORPH_MS, 1);
    const eased = 1 - Math.pow(1 - t, 3);   // ease-out, like the CSS curve
    drawRadar(from.map(function (p, i) {
      return [p[0] + (to[i][0] - p[0]) * eased, p[1] + (to[i][1] - p[1]) * eased];
    }));
    if (t < 1) {
      radarFrame = requestAnimationFrame(step);
    } else {
      radarFrom = to;   // the shape we finished on is the next starting point
    }
  };

  radarFrame = requestAnimationFrame(step);
}

// Old-game pictures: [label, generation key, game key] from the API
const GEN_SPRITES = [
  ["Gen I sprite", "generation-i", "red-blue"],
  ["Gen II sprite", "generation-ii", "crystal"],
  ["Gen III sprite", "generation-iii", "emerald"],
  ["Gen IV sprite", "generation-iv", "platinum"],
  ["Gen V sprite", "generation-v", "black-white"],
  ["Gen VI sprite", "generation-vi", "x-y"],
  ["Gen VII sprite", "generation-vii", "ultra-sun-ultra-moon"],
  ["Gen VIII icon", "generation-viii", "icons"],
];

// Canonical type order, so the filter always reads the same way
const TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy",
];

let activeType = "";           // "" means no filter
let typePool = null;           // Set of national numbers, when filtering
const typeCache = new Map();   // type name -> array of national numbers

// ---------- 3. Small helper functions ----------

// Save / read from the browser's storage (try/catch = don't crash if blocked)
function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}
function readLocal(key, fallback) {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : fallback;
  } catch (e) {
    return fallback;
  }
}

// Fetch a URL and return the JSON. Throws an error if response.ok is false.
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error("HTTP " + response.status);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function prettyName(name) {
  return name.replace(/-/g, " ");
}

// Number 0 -> 1025 wraps around, so "next" after the last goes to #1
function wrapId(id) {
  if (id < 1) return MAX_POKEMON;
  if (id > MAX_POKEMON) return 1;
  return id;
}

// Load the cache saved from last time
readLocal("pokedexCache-v1", []).forEach(function (pokemon) {
  cache.set(pokemon.name, pokemon);
  cache.set(String(pokemon.id), pokemon);
});

function saveToCache(pokemon) {
  cache.set(pokemon.name, pokemon);
  cache.set(String(pokemon.id), pokemon);
  // Keep only the last 40 Pokémon so storage does not get too big
  saveLocal("pokedexCache-v1", [...new Set(cache.values())].slice(-40));
}

// ---------- 4. Status messages ----------
function showLoading() {
  statusBox.textContent = "Loading Pokémon…";
  statusBox.className = "status loading";
  searchButton.disabled = true;
}
function showError(message) {
  statusBox.textContent = message;
  statusBox.className = "status error";
  card.hidden = true;
}
function clearStatus() {
  statusBox.textContent = "";
  statusBox.className = "status";
  searchButton.disabled = false;
}

// ---------- 5. Ask the API ----------

// The list of all names, saved after the first visit
async function loadNames() {
  allNames = readLocal("pokedexNames", []);
  if (allNames.length > 0) return;
  try {
    const data = await fetchJson(API + "pokemon?limit=" + MAX_POKEMON);
    allNames = data.results.map(function (p) { return p.name; });
    saveLocal("pokedexNames", allNames);
  } catch (error) {
    console.log("Could not load the name list", error);
  }
}

// Walk the evolution tree and collect it one stage at a time, so a
// branching family (Eevee) is not drawn as one impossible straight line.
function chainStages(node, depth, stages) {
  stages[depth] = stages[depth] || [];
  stages[depth].push({
    name: node.species.name,
    id: Number(node.species.url.split("/")[6]), // .../pokemon-species/25/ -> 25
  });
  node.evolves_to.forEach(function (next) { chainStages(next, depth + 1, stages); });
  return stages;
}

// Make the list of picture styles. "?." means "if it exists, go deeper".
function buildArts(s) {
  const other = s.other || {};
  const animated = s.versions?.["generation-v"]?.["black-white"]?.animated;
  const arts = [
    { label: "Official artwork", normal: other["official-artwork"]?.front_default, shiny: other["official-artwork"]?.front_shiny },
    { label: "Pokémon HOME", normal: other.home?.front_default, shiny: other.home?.front_shiny },
    { label: "Dream World", normal: other.dream_world?.front_default, shiny: null },
    { label: "Animated (Gen V)", normal: animated?.front_default, shiny: animated?.front_shiny, pixel: true },
    { label: "Pixel sprite", normal: s.front_default, shiny: s.front_shiny, pixel: true },
  ];
  GEN_SPRITES.forEach(function (item) {
    const game = s.versions?.[item[1]]?.[item[2]];
    arts.push({ label: item[0], normal: game?.front_default, shiny: game?.front_shiny, pixel: true });
  });
  return arts.filter(function (art) { return art.normal; }); // remove missing ones
}

// Get ONE Pokémon (from the cache, or from 3 API calls)
async function fetchPokemon(query) {
  if (cache.has(query)) return cache.get(query); // cache hit = instant!

  // Call 1: the Pokémon itself  ->  /pokemon/{name or number}
  const data = await fetchJson(API + "pokemon/" + query);
  // Call 2: the species (Japanese name, description, generation)
  const species = await fetchJson(data.species.url);
  // Call 3: the evolution chain (if this fails we just show no evolutions)
  let evolution = [];
  try {
    const chain = await fetchJson(species.evolution_chain.url);
    evolution = chainStages(chain.chain, 0, []);
  } catch (e) { /* ignore */ }

  // Pick the English and Japanese texts out of the lists
  const jp = species.names.find(function (n) { return n.language.name === "ja"; })
          || species.names.find(function (n) { return n.language.name === "ja-Hrkt"; });
  const genus = species.genera.find(function (g) { return g.language.name === "en"; });
  const flavor = species.flavor_text_entries.find(function (f) { return f.language.name === "en"; });

  // Put the six stats in a simple object: { hp: 35, attack: 55, ... }
  const stats = {};
  data.stats.forEach(function (s) { stats[s.stat.name] = s.base_stat; });

  // Keep only what we need (small = fast to save)
  const pokemon = {
    id: data.id,
    name: data.name,
    speciesId: species.id,        // the universal (National Dex) number
    speciesName: species.name,
    japanese: jp ? jp.name : "",
    genus: genus ? genus.genus : "",
    text: flavor ? flavor.flavor_text.replace(/[\n\f]/g, " ") : "",
    generation: species.generation.name.replace("generation-", "").toUpperCase(),
    height: data.height / 10,   // decimetres -> metres
    weight: data.weight / 10,   // hectograms -> kg
    types: data.types.map(function (t) { return t.type.name; }),
    abilities: data.abilities.map(function (a) { return { name: a.ability.name, hidden: a.is_hidden }; }),
    stats: stats,
    cry: data.cries?.latest || data.cries?.legacy || "",
    arts: buildArts(data.sprites),
    evolution: evolution,
  };

  cache.set(query, pokemon);
  saveToCache(pokemon);
  return pokemon;
}

// Main function: search by name OR number
async function getPokemon(text, isStartup) {
  // "Pikachu ", "#25", "025" -> "pikachu", "25", "25"
  let clean = text.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
  if (/^\d+$/.test(clean)) clean = String(Number(clean)); // remove leading zeros

  if (clean === "") {
    showError("Type a Pokémon name or number first, like pikachu or 25.");
    return;
  }

  hideSuggestions();
  showLoading();
  const myRequest = ++latestRequest; // if you click again, the old answer is ignored

  try {
    const pokemon = await fetchPokemon(clean);
    if (myRequest !== latestRequest) return;
    showPokemon(pokemon);
    if (!isStartup) addRecent(pokemon.name); // the first Pikachu is not a real search
    clearStatus();
    revealCard();
  } catch (error) {
    if (myRequest !== latestRequest) return;
    if (error.status === 404) {
      showError('No Pokémon found for "' + text.trim() + '".' + didYouMean(clean));
    } else if (error instanceof TypeError) {
      showError("Could not reach PokéAPI. Check your internet connection.");
    } else {
      showError("Something went wrong (" + error.message + "). Please try again.");
    }
    searchButton.disabled = false;
  }
}

// Helpful hint for spelling mistakes
function didYouMean(text) {
  if (text.length < 3) return "";
  const start = text.slice(0, 4);
  const matches = allNames.filter(function (n) { return n.startsWith(start); }).slice(0, 3);
  return matches.length ? " Did you mean: " + matches.map(prettyName).join(", ") + "?" : "";
}

// Bring the card into view, but only when it is actually off screen,
// so pressing "next" while the card is visible never moves the page.
function revealCard() {
  const box = card.getBoundingClientRect();
  if (box.top >= 0 && box.bottom <= window.innerHeight) return;
  card.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
}

// ---------- 6. Draw the card ----------
function showPokemon(p) {
  current = p;

  // Name card
  nameEl.textContent = prettyName(p.name);
  jpEl.textContent = p.japanese;
  idEl.textContent = "№ " + String(p.speciesId).padStart(3, "0");
  genEl.textContent = "Gen " + p.generation;
  genusEl.textContent = p.genus;
  document.title = prettyName(p.name) + " #" + p.speciesId + " | Pokédex";

  // Size
  heightEl.textContent = p.height + " m";
  weightEl.textContent = p.weight + " kg";

  // Types + page colour
  typesEl.innerHTML = "";
  p.types.forEach(function (type) {
    const li = document.createElement("li");
    li.textContent = type;
    li.className = "t-" + type;
    typesEl.appendChild(li);
  });
  document.body.className = "t-" + p.types[0];

  // Abilities: the hidden marker is its own tag, not part of the name
  abilitiesEl.innerHTML = "";
  p.abilities.forEach(function (a) {
    const li = document.createElement("li");
    li.appendChild(document.createTextNode(prettyName(a.name)));
    if (a.hidden) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Hidden";
      li.appendChild(tag);
    }
    abilitiesEl.appendChild(li);
  });

  showStats(p.stats);

  // Art style dropdown
  artSelect.innerHTML = "";
  p.arts.forEach(function (art, index) {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = art.label;
    artSelect.appendChild(option);
  });
  showingShiny = false;
  updateArt(true);

  // Ghost this Pokémon's own artwork into the corner of the card.
  // Always the official artwork, so the mark never turns to mush
  // when a 96px pixel sprite is chosen for the main picture.
  watermarkEl.style.backgroundImage =
    'url("' + SPRITE + "other/official-artwork/" + p.speciesId + '.png")';
  if (!reduceMotion()) {
    // 0 -> 1 lands on the 0.15 the CSS sets, so the ghost fades up
    // in step with the radar morph rather than popping in
    watermarkEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "cubic-bezier(0.2, 0, 0, 1)" });
  }

  cryBtn.hidden = !p.cry;
  descEl.textContent = p.text;
  showEvolution(p);
  updateNeighbours();
  card.hidden = false;
}

function showStats(stats) {
  statsEl.innerHTML = "";
  const points = [];
  let total = 0;

  STAT_ORDER.forEach(function (stat, index) {
    const value = stats[stat.key] || 0;
    total += value;
    const share = Math.min(value / MAX_STAT, 1);   // bars and chart share this scale

    // List row: label, number, bar
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = stat.label;
    const number = document.createElement("strong");
    number.textContent = value;
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("span");
    bar.appendChild(fill);
    li.append(label, number, bar);
    statsEl.appendChild(li);
    // Fill once the row is on screen, so the CSS transition has something to animate.
    // --d staggers the rows; the reduced-motion CSS zeroes the delay.
    li.style.setProperty("--d", index * 25 + "ms");
    requestAnimationFrame(function () { fill.style.width = share * 100 + "%"; });

    // Hexagon corner (60 degrees apart, first one at the top)
    const angle = ((-90 + index * 60) * Math.PI) / 180;
    const distance = RADAR.r * share;
    points.push([
      RADAR.cx + distance * Math.cos(angle),
      RADAR.cy + distance * Math.sin(angle),
    ]);
  });

  morphRadar(points);
  totalEl.textContent = total; // total = all six stats added up
}

// Show the chosen picture (normal or shiny)
function updateArt(playAnimation) {
  const art = current.arts[artSelect.value || 0];
  const useShiny = showingShiny && art.shiny;

  imgEl.src = useShiny ? art.shiny : art.normal;
  imgEl.alt = (useShiny ? "Shiny " : "") + prettyName(current.name) + ", " + art.label;
  imgEl.classList.toggle("pixel", Boolean(art.pixel));

  shinyBtn.disabled = !art.shiny; // some styles have no shiny picture
  shinyBtn.textContent = useShiny ? "Normal" : "Shiny";
  shinyBtn.setAttribute("aria-pressed", String(Boolean(useShiny)));

  // A short fade and a touch of scale, so the swap reads as a change
  // of form rather than a dissolve
  if (playAnimation && !reduceMotion()) {
    imgEl.animate(
      [{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }],
      { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" }
    );
  }
}

function showEvolution(p) {
  evolutionEl.innerHTML = "";

  if (p.evolution.length < 2) {
    const note = document.createElement("li");
    note.className = "evo-note";
    note.textContent = "This Pokémon does not evolve.";
    evolutionEl.appendChild(note);
    return;
  }

  p.evolution.forEach(function (stage) {
    const stageEl = document.createElement("li");
    stageEl.className = "evo-stage";

    const row = document.createElement("ul");
    row.className = "evo-row";

    stage.forEach(function (evo) {
      const cell = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "evo-card";
      if (evo.name === p.speciesName) button.setAttribute("aria-current", "true");

      const img = document.createElement("img");
      img.src = SPRITE + evo.id + ".png";
      img.alt = "";
      const label = document.createElement("span");
      label.textContent = prettyName(evo.name);

      button.append(img, label);
      button.addEventListener("click", function () { getPokemon(String(evo.id)); });
      cell.appendChild(button);
      row.appendChild(cell);
    });

    stageEl.appendChild(row);
    evolutionEl.appendChild(stageEl);
  });
}

// Previous / Next buttons show the neighbour's name
function updateNeighbours() {
  if (!current) return;
  const prevId = wrapId(current.speciesId - 1);
  const nextId = wrapId(current.speciesId + 1);
  prevBtn.dataset.id = prevId;
  nextBtn.dataset.id = nextId;
  prevName.textContent = prettyName(allNames[prevId - 1] || "Previous");
  nextName.textContent = prettyName(allNames[nextId - 1] || "Next");
}

// ---------- 7. Recent searches ----------
function addRecent(name) {
  recent = [name].concat(recent.filter(function (n) { return n !== name; })).slice(0, 6);
  saveLocal("pokedexRecent", recent);
  showRecent();
}

function showRecent() {
  recentEl.innerHTML = "";
  recentEl.hidden = recent.length === 0;
  if (recent.length === 0) return;

  const title = document.createElement("span");
  title.className = "group-label";
  title.textContent = "Recent";
  recentEl.appendChild(title);
  recent.forEach(function (name) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-btn";
    button.textContent = prettyName(name);
    button.addEventListener("click", function () { input.value = name; getPokemon(name); });
    recentEl.appendChild(button);
  });
}

// ---------- 8. Suggestions ----------
function showSuggestions() {
  const text = input.value.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
  let items = [];
  suggestionsEl.innerHTML = "";

  if (text === "") {
    items = recent; // empty box -> show recent searches
    if (items.length) addTitle("Recent searches");
  } else if (/^\d+$/.test(text)) {
    // A number: suggest that national number
    const id = Number(text);
    if (id >= 1 && id <= allNames.length) items = [allNames[id - 1]];
  } else {
    const starts = allNames.filter(function (n) { return n.startsWith(text); });
    const contains = allNames.filter(function (n) { return !n.startsWith(text) && n.includes(text); });
    items = starts.concat(contains).slice(0, 6);
  }

  if (items.length === 0) { hideSuggestions(); return; }

  items.forEach(function (name) {
    const id = allNames.indexOf(name) + 1; // position in the list = national number
    const li = document.createElement("li");
    li.setAttribute("role", "presentation");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    button.setAttribute("role", "option");
    if (id > 0) {
      const img = document.createElement("img");
      img.src = SPRITE + id + ".png";
      img.alt = "";
      button.appendChild(img);
    }
    const label = document.createElement("span");
    label.textContent = prettyName(name);
    button.appendChild(label);
    if (id > 0) {
      const num = document.createElement("span");
      num.className = "sug-id";
      num.textContent = "#" + String(id).padStart(3, "0");
      button.appendChild(num);
    }
    button.addEventListener("click", function () { input.value = name; getPokemon(name); });
    li.appendChild(button);
    suggestionsEl.appendChild(li);
  });
  suggestionsEl.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function addTitle(text) {
  const li = document.createElement("li");
  li.className = "sug-title";
  li.textContent = text;
  suggestionsEl.appendChild(li);
}

function hideSuggestions() {
  suggestionsEl.hidden = true;
  input.setAttribute("aria-expanded", "false");
}

// ---------- 9. Endless grid of random Pokémon ----------

// Shuffle the numbers 1..1025 so every Pokémon appears once, in random order
function shuffleIds() {
  const ids = [];
  for (let i = 1; i <= MAX_POKEMON; i++) ids.push(i);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

function makeMiniCard(id) {
  const name = allNames[id - 1] || String(id);
  const button = document.createElement("button");
  button.type = "button";
  // No .glass here: a backdrop blur on 100+ small cards is the single
  // most expensive thing this page could do, and it buys very little.
  button.className = "mini";

  const img = document.createElement("img");
  img.src = SPRITE + "other/official-artwork/" + id + ".png";
  img.alt = "";
  img.width = 96;
  img.height = 96;
  img.loading = "lazy"; // only download the picture when it is near the screen
  img.decoding = "async";

  const label = document.createElement("span");
  label.textContent = prettyName(name);
  const num = document.createElement("span");
  num.className = "mini-id";
  num.textContent = "#" + String(id).padStart(3, "0");

  button.append(img, label, num);
  button.addEventListener("click", function () {
    input.value = "";
    getPokemon(String(id));
  });
  return button;
}

// Add 12 more cards
function loadMore() {
  // --i is the card's place in this batch, so a batch arrives in order
  queue.splice(0, 12).forEach(function (id, index) {
    const card = makeMiniCard(id);
    card.style.setProperty("--i", index);
    grid.appendChild(card);
  });

  if (queue.length === 0) {
    sentinel.textContent = typePool
      ? "You met every " + typeLabel() + " type!"
      : "You met every Pokémon!";
    observer.disconnect();
    return;
  }
  // Watch again, so it fires again if the bottom is still on screen
  observer.unobserve(sentinel);
  observer.observe(sentinel);
}

// ---------- 9b. Type filter ----------

// The type endpoint lists every Pokémon of that type in a single request.
// A name's position in allNames is its national number, so nothing else
// needs fetching. Forms like "zeraora-mega" are not in the National Dex
// list, so they drop out here rather than showing a card with no sprite.
async function loadType(type) {
  if (typeCache.has(type)) return typeCache.get(type);
  const data = await fetchJson(API + "type/" + type);
  const ids = data.pokemon
    .map(function (entry) { return allNames.indexOf(entry.pokemon.name) + 1; })
    .filter(function (id) { return id > 0; });
  typeCache.set(type, ids);
  return ids;
}

function typeLabel() {
  return activeType.charAt(0).toUpperCase() + activeType.slice(1);
}

function buildTypeChips() {
  typebar.innerHTML = "";

  const label = document.createElement("span");
  label.className = "group-label";
  label.textContent = "Type";
  typebar.appendChild(label);

  [""].concat(TYPES).forEach(function (type) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "type-chip" + (type ? " t-" + type : "");
    button.dataset.type = type;
    button.textContent = type || "all";
    button.setAttribute("aria-pressed", String(type === activeType));
    button.addEventListener("click", function () { setType(type); });
    typebar.appendChild(button);
  });
}

async function setType(type) {
  if (type === activeType) return;
  activeType = type;
  buildTypeChips();   // repaint which chip is pressed

  if (!type) {
    typePool = null;
    startGrid();
    return;
  }

  filterNote.textContent = "Loading " + type + " encounters…";
  try {
    const ids = await loadType(type);
    if (activeType !== type) return;   // a different chip was picked meanwhile
    typePool = new Set(ids);
  } catch (error) {
    if (activeType !== type) return;
    typePool = null;
    startGrid();
    filterNote.textContent = "Could not load that type. Showing all encounters.";
    return;
  }
  startGrid();
}

// IntersectionObserver tells us when the "Loading more..." line comes into view
const observer = new IntersectionObserver(function (entries) {
  if (entries[0].isIntersecting) loadMore();
}, { rootMargin: "400px" });

function startGrid() {
  grid.innerHTML = "";
  sentinel.textContent = "Loading more…";
  queue = typePool
    ? shuffleIds().filter(function (id) { return typePool.has(id); })
    : shuffleIds();
  observer.disconnect();

  filterNote.textContent = typePool
    ? queue.length + " " + typeLabel() + " encounters"
    : queue.length + " encounters, every type";

  if (queue.length === 0) {
    sentinel.textContent = "No encounters for that type.";
    return;
  }
  observer.observe(sentinel);
}

// ---------- 10. Sound ----------
cryBtn.addEventListener("click", function () {
  if (!current || !current.cry) return;
  const audio = new Audio(current.cry);
  audio.volume = 0.5;
  cryBtn.classList.add("playing");
  // Whatever happens, the button has to go back to its resting state
  const reset = function () { cryBtn.classList.remove("playing"); };
  audio.addEventListener("ended", reset);
  audio.addEventListener("error", reset);
  audio.play().catch(reset);
});

// ---------- 11. Listen for clicks and typing ----------
form.addEventListener("submit", function (event) {
  event.preventDefault();
  getPokemon(input.value);
});

input.addEventListener("input", showSuggestions);
input.addEventListener("focus", showSuggestions);

// Click outside the search box -> close the suggestions
document.addEventListener("click", function (event) {
  if (!event.target.closest(".search-wrap")) hideSuggestions();
});

// Keyboard in the suggestion list: arrows move, Escape closes
input.addEventListener("keydown", function (event) {
  if (event.key === "ArrowDown") {
    const first = suggestionsEl.querySelector(".suggestion");
    if (first) { event.preventDefault(); first.focus(); }
  }
  if (event.key === "Escape") hideSuggestions();
});
suggestionsEl.addEventListener("keydown", function (event) {
  const buttons = [...suggestionsEl.querySelectorAll(".suggestion")];
  const index = buttons.indexOf(document.activeElement);
  if (event.key === "ArrowDown" && buttons[index + 1]) { event.preventDefault(); buttons[index + 1].focus(); }
  if (event.key === "ArrowUp") { event.preventDefault(); (buttons[index - 1] || input).focus(); }
  if (event.key === "Escape") { hideSuggestions(); input.focus(); }
});

// Quick buttons (data-name="pikachu")
document.querySelectorAll(".quick-btn[data-name]").forEach(function (button) {
  button.addEventListener("click", function () {
    input.value = button.dataset.name;
    getPokemon(button.dataset.name);
  });
});

document.querySelector("#random-btn").addEventListener("click", function () {
  input.value = "";
  getPokemon(String(Math.floor(Math.random() * MAX_POKEMON) + 1));
});

document.querySelector("#shuffle-btn").addEventListener("click", startGrid);

// Next / Previous
prevBtn.addEventListener("click", function () { getPokemon(prevBtn.dataset.id); });
nextBtn.addEventListener("click", function () { getPokemon(nextBtn.dataset.id); });

// Left / Right arrow keys also go previous / next
document.addEventListener("keydown", function (event) {
  if (card.hidden) return;
  if (!(event.target instanceof Element)) return;
  // ←/→ belong to text fields and to the artwork select, not to us
  if (event.target.closest("input, select, textarea, [contenteditable]")) return;
  if (event.key === "ArrowLeft") prevBtn.click();
  if (event.key === "ArrowRight") nextBtn.click();
});

// Art style + shiny
artSelect.addEventListener("change", function () { updateArt(true); });
shinyBtn.addEventListener("click", function () {
  showingShiny = !showingShiny;
  updateArt(true);
});

// ---------- 12. Start ----------
showRecent();
buildTypeChips();
getPokemon("pikachu", true);
loadNames().then(function () {
  updateNeighbours(); // now we know the neighbours' names
  startGrid();
});
