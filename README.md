# Glass Pokédex

A Pokémon search app in plain HTML, CSS and JavaScript with a liquid-glass design. Open `index.html` in a browser (internet needed).

## Endpoints used (PokéAPI, no key needed)

| Endpoint | Used for |
| --- | --- |
| `GET /api/v2/pokemon/{name or number}` | name, id, types, height, weight, stats, abilities, pictures, cry sound |
| `GET data.species.url` (`/pokemon-species/{id}`) | National Dex number, Japanese name, generation, category, description |
| `GET species.evolution_chain.url` | evolution line |
| `GET /api/v2/pokemon?limit=1025` | all names (for suggestions and the grid) |

Base URL: `https://pokeapi.co/api/v2/`

## Fields

- Name / number: `name`, `id`, species `id` (National Dex number)
- Japanese name: species `names[]` where `language.name` is `ja`
- Pictures: `sprites.other["official-artwork"]`, `sprites.other.home`, `sprites.other.dream_world`, `sprites.versions[generation][game]` (front and shiny)
- Sound: `cries.latest`
- Stats and total power: `stats[].base_stat` (total = sum of the six)
- Abilities: `abilities[].ability.name`, `is_hidden`
- Evolution: `chain.species.name`, `chain.evolves_to[]`

## States

- **Loading**: spinning Poké Ball message
- **Success**: card, page colour follows the first type
- **Error**: `response.ok` false (404) or network failure shows a message with "Did you mean"
- **Empty**: blank input shows a hint

## Features

Search by name or number, suggestions, recent searches, cache (localStorage), shiny + artwork styles, cry sound, previous/next (buttons or arrow keys), endless random encounter grid, responsive layout.

## Files

`index.html`, `style.css`, `script.js`, `favicon.svg`

## Screenshots

Add `screenshot-success.png` and `screenshot-error.png` (search `pikachuu`) before submitting.
