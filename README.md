# Pokédex

**Live: https://apurboabir17.github.io/Pokedex/**

A Pokémon search app in plain HTML, CSS and JavaScript with a liquid-glass design. No build step, no dependencies, no framework. To run it locally, open `index.html` in a browser (internet needed for PokéAPI).

## Hosting

GitHub Pages, deployed from the root of `main`. Pushing to `main` is all it takes to update the site — there is no build or bundler, so the repository is served exactly as it sits on disk.

## Endpoints used (PokéAPI, no key needed)

| Endpoint | Used for |
| --- | --- |
| `GET /api/v2/pokemon/{name or number}` | name, id, types, height, weight, stats, abilities, pictures, cry sound |
| `GET data.species.url` (`/pokemon-species/{id}`) | National Dex number, Japanese name, generation, category, description |
| `GET species.evolution_chain.url` | evolution line |
| `GET /api/v2/pokemon?limit=1025` | all names (for suggestions and the grid) |
| `GET /api/v2/type/{name}` | which Pokémon belong to a type, for the encounter filter |

Base URL: `https://pokeapi.co/api/v2/`

## Fields

- Name / number: `name`, `id`, species `id` (National Dex number)
- Japanese name: species `names[]` where `language.name` is `ja`
- Pictures: `sprites.other["official-artwork"]`, `sprites.other.home`, `sprites.other.dream_world`, `sprites.versions[generation][game]` (front and shiny)
- Sound: `cries.latest`
- Stats and total: `stats[].base_stat` (total = sum of the six)
- Abilities: `abilities[].ability.name`, `is_hidden`
- Evolution: `chain.species.name`, `chain.evolves_to[]` — walked into one group per stage, so branching families such as Eevee show as rows instead of one straight line

## States

- **Loading**: spinning Poké Ball message
- **Success**: card, page colour follows the first type
- **Error**: `response.ok` false (404) or network failure shows a message with "Did you mean"
- **Empty**: blank input shows a hint

## Features

Search by name or number, suggestions, recent searches, cache (localStorage), shiny + artwork styles, cry sound, previous/next (buttons or arrow keys), endless random encounter grid, a type filter on that grid, responsive layout.

## The encounter type filter

19 chips (All + the 18 types) sit under the section heading. Picking one narrows the grid to that type; **New encounters** reshuffles within the current filter rather than resetting it.

- `GET /api/v2/type/{name}` returns every Pokémon of that type in one request, so filtering costs **one** call, not one per Pokémon.
- A name's position in `allNames` *is* its National Dex number, so no second request is needed to turn names into ids.
- That endpoint also lists forms like `zeraora-mega`, which are not in the 1025-name National Dex list. `indexOf` returns `-1` for those and they are filtered out — otherwise they would render as cards with a broken sprite.
- The pool is held in a `Set` and cached per type in memory for the visit, so switching back and forth costs nothing.
- Dual types appear under both, which is correct: Bulbasaur is in the grass *and* poison pools.
- The sentinel stays **below** the grid. `IntersectionObserver` watches it scroll into view, so moving it above the grid would make it fire forever without the user scrolling.

## Design notes

Everything is driven by the token block at the top of `style.css`: one spacing scale, four corner radii, three ink levels and three motion durations. A few decisions worth keeping:

- **Backdrop blur is reserved for the four large panels.** Grid cards, chips and list items use flat translucent surfaces. A blur on 100+ small elements is the most expensive thing this page could do.
- **One shared container width.** The header and the page body use the same `--shell` and the same side padding, so the brand mark, the card edges and the section heading all sit on one invisible left edge — including after the mobile breakpoint.
- **The chart and the bars share a scale.** Both normalise against `MAX_STAT` (255), and both use the same stat names, so the hexagon and the list below it never disagree.
- **The page is left-aligned inside the card.** The image centres in the space left over; every piece of text shares one edge.
- **Type colours never carry text.** Buttons and the "you are here" marker use ink, because seven of the eighteen type colours are too light for white text or for a visible ring.
- **The card carries two marks of the Pokémon itself.** The artwork panel ghosts the Pokémon's own official artwork into its top corner behind the name (`.watermark`, at 15% with a soft mask), and the sprite drifts on a 4.5s loop with a shadow that tightens as it rises (`.float`). The watermark always uses the official artwork even when a 96px pixel sprite is chosen for the main picture, so the mark never turns to mush.
- **The watermark is a `div` with a background image, not an `<img>`.** A failed load then shows nothing, instead of a broken-image icon inside the card. `.art` sets `isolation: isolate` so its negative `z-index` stays inside the panel.
- **Motion is one system.** Three durations (`--dur-h` 120ms press, `--dur` 200ms state change, `--dur-s` 400ms content change) on a single easing curve. Nothing bounces, nothing loops except the loading spinner and the artwork's slow drift.
- **`--c1` and `--c2` are registered with `@property`**, which is what lets the page ease from one type colour to the next when the class on `<body>` changes. Without registration the swap is instant.
- **The stat chart is tweened in JavaScript** (`morphRadar`), because SVG geometry cannot be CSS-transitioned. It eases the six corners from the old shape to the new one and cancels any in-flight tween, so fast clicking cannot leave a stale shape behind.
- **Entrances are tied to visibility, not to JavaScript.** `[hidden]` sets `display: none`, so rebuilding the box replays the animation — the card rises in on first reveal and never again, because prev/next does not touch `hidden`.
- **Every animation and transition delay is clamped in the reduced-motion block.** Clamping duration alone would leave a staggered element blank for the length of its delay.

## Files

`index.html`, `style.css`, `script.js`, `favicon.svg`

## Screenshots

Add `screenshot-success.png` and `screenshot-error.png` (search `pikachuu`) before submitting.
