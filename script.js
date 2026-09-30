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
const artBox = document.querySelector(".art");

// ---------- 2. Settings and memory ----------
const API = "https://pokeapi.co/api/v2/";
const SPRITE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";
const MAX_POKEMON = 1025; // how many Pokémon have a national number

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let allNames = [];      // every Pokémon name (used for suggestions and the grid)
let current = null;     // the Pokémon shown on the card
let showingShiny = false;
let latestRequest = 0;  // used to ignore old answers if you click fast
let queue = [];         // shuffled numbers for the endless grid

// The cache: name/number -> Pokémon data. Saved in localStorage so it
// is still there after you close the browser.
const cache = new Map();
let recent = readLocal("pokedexRecent", []);

// Stats in the order the hexagon uses (top, then clockwise)
const STAT_ORDER = [
  { key: "hp", label: "HP" },
  { key: "attack", label: "Attack" },
  { key: "defense", label: "Defense" },
  { key: "speed", label: "Speed" },
  { key: "special-defense", label: "Sp. Def" },
  { key: "special-attack", label: "Sp. Atk" },
];

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
  statusBox.textContent = "Loading Pokémon...";
  statusBox.className = "status glass loading";
  searchButton.disabled = true;
}
function showError(message) {
  statusBox.textContent = message;
  statusBox.className = "status glass error";
  card.hidden = true;
}
function clearStatus() {
  statusBox.textContent = "";
  statusBox.className = "status glass";
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

// Walk through the evolution chain and make one simple list
function flattenChain(node, list) {
  list.push({
    name: node.species.name,
    id: Number(node.species.url.split("/")[6]), // .../pokemon-species/25/ -> 25
  });
  node.evolves_to.forEach(function (next) { flattenChain(next, list); });
  return list;
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
    evolution = flattenChain(chain.chain, []);
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
  return matches.length ? " Did you mean: " + matches.join(", ") + "?" : "";
}

// ---------- 6. Draw the card ----------
function showPokemon(p) {
  current = p;

  // Name card
  nameEl.textContent = prettyName(p.name);
  jpEl.textContent = p.japanese;
  idEl.textContent = "National № " + String(p.speciesId).padStart(3, "0");
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

  // Abilities
  abilitiesEl.innerHTML = "";
  p.abilities.forEach(function (a) {
    const li = document.createElement("li");
    li.textContent = prettyName(a.name) + (a.hidden ? " (hidden)" : "");
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

    // List row: label, number, bar
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = stat.label;
    const number = document.createElement("strong");
    number.textContent = value;
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("span");
    fill.style.width = "0%";
    bar.appendChild(fill);
    li.append(label, number, bar);
    statsEl.appendChild(li);
    // Grow the bar a moment later so the CSS transition can animate it
    setTimeout(function () { fill.style.width = Math.min(value / 255, 1) * 100 + "%"; }, 50);

    // Hexagon corner (60 degrees apart, first one at the top)
    const angle = ((-90 + index * 60) * Math.PI) / 180;
    const distance = 75 * Math.min(value / 180, 1);
    points.push((120 + distance * Math.cos(angle)).toFixed(1) + "," + (110 + distance * Math.sin(angle)).toFixed(1));
  });

  radarShape.setAttribute("points", points.join(" "));
  totalEl.textContent = total; // total power = all six stats added up
}

// Show the chosen picture (normal or shiny)
function updateArt(playAnimation) {
  const art = current.arts[artSelect.value || 0];
  const useShiny = showingShiny && art.shiny;

  imgEl.src = useShiny ? art.shiny : art.normal;
  imgEl.alt = (useShiny ? "Shiny " : "") + prettyName(current.name) + ", " + art.label;
  imgEl.classList.toggle("pixel", Boolean(art.pixel));

  shinyBtn.disabled = !art.shiny; // some styles have no shiny picture
  shinyBtn.textContent = useShiny ? "Normal colours" : "Shiny version";
  shinyBtn.setAttribute("aria-pressed", String(Boolean(useShiny)));

  // A little pop when the picture changes
  if (playAnimation && !reduceMotion) {
    imgEl.animate(
      [{ opacity: 0, scale: "0.85" }, { opacity: 1, scale: "1" }],
      { duration: 400, easing: "ease-out" }
    );
  }
}

function showEvolution(p) {
  evolutionEl.innerHTML = "";
  if (p.evolution.length < 2) {
    const li = document.createElement("li");
    li.className = "evo-note";
    li.textContent = "This Pokémon does not evolve.";
    evolutionEl.appendChild(li);
    return;
  }
  p.evolution.forEach(function (evo) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "evo" + (evo.name === p.speciesName ? " current" : "");

    const img = document.createElement("img");
    img.src = SPRITE + evo.id + ".png";
    img.alt = "";
    const label = document.createElement("span");
    label.textContent = prettyName(evo.name);

    button.append(img, label);
    button.addEventListener("click", function () { getPokemon(String(evo.id)); });
    li.appendChild(button);
    evolutionEl.appendChild(li);
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
  title.textContent = "Recent:";
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
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
}

function addTitle(text) {
  const li = document.createElement("li");
  li.className = "sug-title";
  li.textContent = text;
  suggestionsEl.appendChild(li);
}

function hideSuggestions() {
  suggestionsEl.hidden = true;
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
  button.className = "mini glass";

  const img = document.createElement("img");
  img.src = SPRITE + "other/official-artwork/" + id + ".png";
  img.alt = "";
  img.width = 110;
  img.height = 110;
  img.loading = "lazy"; // only download the picture when it is near the screen

  const label = document.createElement("span");
  label.textContent = prettyName(name);
  const num = document.createElement("span");
  num.className = "mini-id";
  num.textContent = "#" + String(id).padStart(3, "0");

  button.append(img, label, num);
  button.addEventListener("click", function () {
    input.value = "";
    getPokemon(String(id));
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });
  return button;
}

// Add 12 more cards
function loadMore() {
  queue.splice(0, 12).forEach(function (id) { grid.appendChild(makeMiniCard(id)); });

  if (queue.length === 0) {
    sentinel.textContent = "You met every Pokémon!";
    observer.disconnect();
    return;
  }
  // Watch again, so it fires again if the bottom is still on screen
  observer.unobserve(sentinel);
  observer.observe(sentinel);
}

// IntersectionObserver tells us when the "Loading more..." line comes into view
const observer = new IntersectionObserver(function (entries) {
  if (entries[0].isIntersecting) loadMore();
}, { rootMargin: "400px" });

function startGrid() {
  grid.innerHTML = "";
  sentinel.textContent = "Loading more...";
  queue = shuffleIds();
  observer.disconnect();
  observer.observe(sentinel);
}

// ---------- 10. Sound ----------
cryBtn.addEventListener("click", function () {
  if (!current || !current.cry) return;
  const audio = new Audio(current.cry);
  audio.volume = 0.5;
  cryBtn.classList.add("playing");
  audio.addEventListener("ended", function () { cryBtn.classList.remove("playing"); });
  audio.play().catch(function () { cryBtn.classList.remove("playing"); });
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
  if (card.hidden || event.target.closest(".search-wrap")) return;
  if (event.key === "ArrowLeft") prevBtn.click();
  if (event.key === "ArrowRight") nextBtn.click();
});

// Art style + shiny
artSelect.addEventListener("change", function () { updateArt(true); });
shinyBtn.addEventListener("click", function () {
  showingShiny = !showingShiny;
  updateArt(true);
});

// ---------- 12. Fun effects ----------

// Shiny light that follows the mouse on every glass panel
document.addEventListener("pointermove", function (event) {
  const panel = event.target.closest(".glass");
  if (!panel) return;
  const box = panel.getBoundingClientRect();
  panel.style.setProperty("--mx", event.clientX - box.left + "px");
  panel.style.setProperty("--my", event.clientY - box.top + "px");
});

// The picture tilts a little toward the mouse
artBox.addEventListener("pointermove", function (event) {
  if (reduceMotion) return;
  const box = artBox.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width - 0.5;
  const y = (event.clientY - box.top) / box.height - 0.5;
  imgEl.style.transform = "perspective(600px) rotateY(" + x * 16 + "deg) rotateX(" + -y * 16 + "deg)";
});
artBox.addEventListener("pointerleave", function () { imgEl.style.transform = ""; });

// ---------- 13. Start ----------
showRecent();
getPokemon("pikachu", true);
loadNames().then(function () {
  updateNeighbours(); // now we know the neighbours' names
  startGrid();
});
