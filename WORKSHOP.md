# Workshop: API Explorer

**Goal:** Build a Pokemon Explorer app that fetches data from the PokeAPI, displays it with proper loading/error/empty states, supports debounced search, type filtering, sorting, pagination, and shareable URL state.

**Duration:** ~4-5 hours (with breaks)

---

## Prerequisites

- Basic HTML, CSS, JavaScript (variables, functions, arrays, objects)
- A code editor (VS Code recommended)
- A modern browser (Chrome or Firefox)
- The Live Server VS Code extension (or any local server)

---

## What You'll Learn

- How the HTTP request/response cycle works
- `fetch`, `async/await`, and Promises
- Proper error handling (including the `response.ok` footgun)
- Managing UI state (loading, error, empty, success)
- Debouncing user input (with a full mental model explanation)
- Array methods: `.filter()`, `.sort()`, `.map()`
- DOM manipulation with `innerHTML` and template literals
- URL parameters with the `URLSearchParams` API
- Basic accessibility for dynamic content
- Debugging with DevTools (Console and Network tabs)
- Paginated data fetching

---

## Getting Started

**Final product:** A responsive Pokemon Explorer with search, type filter, sort, result count, Load More pagination, and shareable URLs.

### Setup (15 min)

**File structure:**
```
pokemon-explorer/
  index.html
  styles.css
  app.js
```

Create these three files. We will keep everything simple -- no build tools, no npm, no frameworks.

**Starting `index.html`:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pokemon Explorer</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main id="app">
    <!-- We will build this up piece by piece -->
  </main>
  <script src="app.js"></script>
</body>
</html>
```

**How to run it:**
1. Open the folder in VS Code
2. Right-click `index.html` > "Open with Live Server"
3. Or simply open the file in your browser (some features like modules require a server)

**Checkpoint:** You should see a blank page. Open DevTools (`F12`) and confirm there are no errors in the Console tab.

---

## Part 1 -- Fetch & Render (60 min)

**Concept:** Make your first API call and get data on screen.

### Before you code -- understand what you are calling

1. Open your browser and go to: `https://pokeapi.co/api/v2/pokemon?limit=12`
2. Look at the JSON response. Notice:
   - The response has a `count` (total number of Pokemon), `next` (URL for the next page), `previous`, and `results` (array of Pokemon)
   - Each result only has `name` and `url` -- to get images and types, you need to fetch each Pokemon's individual URL
3. Click on one of the individual URLs (e.g., `https://pokeapi.co/api/v2/pokemon/1/`). Notice:
   - This has MUCH more data: `sprites.front_default` (image URL), `types` (array of type objects), `stats`, `height`, `weight`, etc.

### Key concept -- HTTP basics

- `fetch()` makes an HTTP GET request by default
- The server responds with a status code:
  - `200` = OK (success)
  - `404` = Not Found
  - `500` = Server Error
- `fetch()` only throws an error on network failure (DNS failure, no internet). It does NOT throw on 404 or 500. You must check `response.ok` yourself.

### Task 1: Fetch the Pokemon list

In `app.js`:

```js
// The base URL for the PokeAPI
const API_BASE = 'https://pokeapi.co/api/v2'

async function fetchPokemonList(limit = 12, offset = 0) {
  const url = `${API_BASE}/pokemon?limit=${limit}&offset=${offset}`
  const response = await fetch(url)

  // IMPORTANT: fetch does NOT throw on 404/500 errors.
  // You must check response.ok yourself.
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }

  const data = await response.json()
  return data
}

// Test it -- open the Console tab in DevTools to see the output
fetchPokemonList().then(data => console.log(data))
```

**Checkpoint:** Open DevTools Console. You should see an object with `count`, `next`, `previous`, and `results`.

### Task 2: Fetch detailed data for each Pokemon

The list endpoint only gives us names. We need images and types, which require a second fetch for each Pokemon. This is a common API pattern.

```js
async function fetchPokemonDetails(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

async function fetchAllPokemon(limit = 12, offset = 0) {
  // Step 1: Get the list of Pokemon (names and URLs)
  const listData = await fetchPokemonList(limit, offset)

  // Step 2: Fetch details for each Pokemon in parallel using Promise.all
  // This is MUCH faster than fetching them one by one
  const detailPromises = listData.results.map(pokemon =>
    fetchPokemonDetails(pokemon.url)
  )
  const details = await Promise.all(detailPromises)

  // Step 3: Extract only the data we need
  const pokemon = details.map(p => ({
    id: p.id,
    name: p.name,
    image: p.sprites.other['official-artwork'].front_default
           || p.sprites.front_default,
    types: p.types.map(t => t.type.name),
    height: p.height,
    weight: p.weight,
  }))

  return {
    pokemon,
    totalCount: listData.count,
    nextUrl: listData.next,
  }
}

// Test it
fetchAllPokemon().then(data => console.log(data))
```

**Discussion point:** Why `Promise.all` instead of a `for` loop with `await`? Because each fetch is independent -- they can all run at the same time. `Promise.all` fires all requests simultaneously and waits for all of them to finish. A `for` loop with `await` would fetch them one after another, which is much slower.

### Task 3: Render cards to the DOM

```js
function renderCards(pokemonList) {
  const app = document.getElementById('app')

  if (pokemonList.length === 0) {
    app.innerHTML = '<p class="empty-state">No Pokemon found.</p>'
    return
  }

  app.innerHTML = `
    <ul class="pokemon-grid" role="list">
      ${pokemonList.map(pokemon => `
        <li class="card">
          <img
            src="${pokemon.image}"
            alt="${pokemon.name}"
            class="card__image"
            width="120"
            height="120"
            loading="lazy"
          >
          <h2 class="card__name">${pokemon.name}</h2>
          <div class="card__types">
            ${pokemon.types.map(type =>
              `<span class="type-badge type-badge--${type}">${type}</span>`
            ).join('')}
          </div>
          <p class="card__meta">
            #${String(pokemon.id).padStart(3, '0')}
          </p>
        </li>
      `).join('')}
    </ul>
  `
}

// Wire it up
async function init() {
  const data = await fetchAllPokemon()
  renderCards(data.pokemon)
}

init()
```

**Checkpoint:** You should see 12 Pokemon cards with names, images, and type badges. They will be unstyled -- we will add CSS next.

### Task 4: Add basic styles

In `styles.css`:
```css
/* We will build this up throughout the workshop.
   For now, just enough to see the cards. */

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #f5f5f5;
  color: #1a1a1a;
  line-height: 1.5;
  min-height: 100vh;
  padding: 2rem;
}

.pokemon-grid {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.card__image {
  width: 120px;
  height: 120px;
  margin: 0 auto 0.75rem;
  display: block;
}

.card__name {
  font-size: 1.1rem;
  font-weight: 600;
  text-transform: capitalize;
  margin-bottom: 0.5rem;
}

.card__types {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  flex-wrap: wrap;
}

.card__meta {
  color: #999;
  font-size: 0.85rem;
  margin-top: 0.5rem;
}
```

**Checkpoint:** You should now see a responsive grid of styled Pokemon cards.

### Discussion points for Part 1

1. What happens if the API URL is wrong? (Try changing it and check the Console.)
2. What does the user see while data is loading? (Nothing -- we will fix this next.)
3. Open the Network tab in DevTools. How many requests were made? How long did they take?

---

## Part 2 -- Loading, Error & Empty States (45 min)

**Concept:** Real applications are never instant. Users need feedback about what is happening.

There are four states the UI can be in:
1. **Loading** -- data is being fetched (show a spinner or skeleton)
2. **Error** -- something went wrong (show a message and a retry button)
3. **Empty** -- the request succeeded but returned no results (show a friendly message)
4. **Success** -- data is loaded and ready to display

### Task 1: Build a state manager

Replace the bottom of your `app.js` with:

```js
// ----- State Management -----

// This object holds ALL of our application state in one place.
// This is a pattern you will see in every frontend framework.
let state = {
  pokemon: [],
  filtered: [],
  totalCount: 0,
  nextUrl: null,
  status: 'idle',   // 'idle' | 'loading' | 'error' | 'success'
  errorMessage: '',
  searchQuery: '',
  typeFilter: 'all',
  sortOrder: 'default', // 'default' | 'az' | 'za'
}

function render() {
  const app = document.getElementById('app')

  switch (state.status) {
    case 'loading':
      app.innerHTML = `
        <div class="status-message" role="status" aria-live="polite">
          <div class="spinner" aria-hidden="true"></div>
          <p>Loading Pokemon...</p>
        </div>
      `
      break

    case 'error':
      app.innerHTML = `
        <div class="status-message" role="alert">
          <p class="error-text">Something went wrong: ${state.errorMessage}</p>
          <button class="btn" onclick="init()">Try Again</button>
        </div>
      `
      break

    case 'success':
      if (state.filtered.length === 0) {
        app.innerHTML = `
          <div class="status-message" role="status" aria-live="polite">
            <p>No Pokemon match your search.</p>
          </div>
        `
      } else {
        renderCards(state.filtered)
      }
      break

    default:
      // 'idle' -- do nothing
      break
  }
}
```

### Task 2: Update `init()` to use state

```js
async function init() {
  state.status = 'loading'
  render()

  try {
    const data = await fetchAllPokemon()
    state.pokemon = data.pokemon
    state.filtered = data.pokemon
    state.totalCount = data.totalCount
    state.nextUrl = data.nextUrl
    state.status = 'success'
  } catch (error) {
    state.status = 'error'
    state.errorMessage = error.message
  }

  render()
}

init()
```

### Task 3: Add CSS for loading and error states

Add to `styles.css`:
```css
.status-message {
  text-align: center;
  padding: 4rem 2rem;
  max-width: 400px;
  margin: 0 auto;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e0e0e0;
  border-top-color: #e63946;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-text {
  color: #e63946;
  margin-bottom: 1rem;
}

.btn {
  display: inline-block;
  padding: 0.5rem 1.25rem;
  background: #e63946;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
}

.btn:hover {
  background: #c1121f;
}

.btn:focus-visible {
  outline: 2px solid #e63946;
  outline-offset: 2px;
}
```

**Exercise:** Deliberately break the API URL (change "pokemon" to "pokemonxyz"). Confirm:
1. The loading spinner appears
2. The error message appears with the HTTP status
3. The "Try Again" button works when you fix the URL back

**Checkpoint:** You should now see a loading spinner briefly before the cards appear. If you break the URL, you should see an error message with a retry button.

### Task 4: Add `AbortController` for cancellable requests

```js
// At the top of your app.js, add:
let currentAbortController = null

// Update fetchPokemonList:
async function fetchPokemonList(limit = 12, offset = 0, signal) {
  const url = `${API_BASE}/pokemon?limit=${limit}&offset=${offset}`
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

// Update fetchPokemonDetails:
async function fetchPokemonDetails(url, signal) {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}
```

**Teaching moment: Why AbortController?** Imagine a user clicks "Load More," then immediately clicks it again. Without AbortController, the first request might finish AFTER the second one, replacing fresh data with stale data. AbortController lets you cancel the first request so it never completes.

---

## Part 3 -- Search, Filter & Sort (75 min)

**Concept:** Let users narrow down results without making new API calls.

We already fetched the data -- now we filter the in-memory array and re-render. This is called **client-side filtering**.

### Task 1: Update the HTML structure

We need to add search, filter, and sort controls. Update the `render()` function's success case to include a toolbar:

```js
// Add this helper function
function getUniqueTypes() {
  const allTypes = state.pokemon.flatMap(p => p.types)
  return [...new Set(allTypes)].sort()
}

function renderToolbar() {
  return `
    <div class="toolbar">
      <div class="search-group">
        <label for="search" class="visually-hidden">Search Pokemon</label>
        <input
          type="search"
          id="search"
          class="search-input"
          placeholder="Search Pokemon..."
          value="${state.searchQuery}"
          aria-describedby="result-count"
        >
      </div>

      <div class="filter-group">
        <label for="type-filter" class="visually-hidden">Filter by type</label>
        <select id="type-filter" class="select-input">
          <option value="all">All Types</option>
          ${getUniqueTypes().map(type =>
            `<option value="${type}" ${state.typeFilter === type ? 'selected' : ''}>
              ${type.charAt(0).toUpperCase() + type.slice(1)}
            </option>`
          ).join('')}
        </select>

        <label for="sort-order" class="visually-hidden">Sort order</label>
        <select id="sort-order" class="select-input">
          <option value="default" ${state.sortOrder === 'default' ? 'selected' : ''}>Sort: #Number</option>
          <option value="az" ${state.sortOrder === 'az' ? 'selected' : ''}>Sort: A-Z</option>
          <option value="za" ${state.sortOrder === 'za' ? 'selected' : ''}>Sort: Z-A</option>
        </select>
      </div>

      <p class="result-count" id="result-count" aria-live="polite">
        Showing ${state.filtered.length} of ${state.pokemon.length} Pokemon
      </p>
    </div>
  `
}
```

### Task 2: Implement the filter/sort pipeline

This is where array methods shine. We chain `.filter()` and `.sort()` to transform data without mutating the original.

```js
function applyFilters() {
  let result = [...state.pokemon] // shallow copy -- never mutate the original

  // Step 1: Filter by search query
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase()
    result = result.filter(p => p.name.toLowerCase().includes(query))
  }

  // Step 2: Filter by type
  if (state.typeFilter !== 'all') {
    result = result.filter(p => p.types.includes(state.typeFilter))
  }

  // Step 3: Sort
  switch (state.sortOrder) {
    case 'az':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'za':
      result.sort((a, b) => b.name.localeCompare(a.name))
      break
    case 'default':
      result.sort((a, b) => a.id - b.id)
      break
  }

  state.filtered = result
  render()
}
```

### Task 3: Debounce the search input

**What is debounce, and why do you need it?**

Imagine typing "pikachu" into a search box. Without debounce, the filter function runs 7 times -- once for "p", "pi", "pik", "pika", "pikac", "pikach", "pikachu". That is wasteful.

Debounce says: "Wait until the user STOPS typing for 300ms, then run the function once." It works like a reset timer:
- User types "p" --> start a 300ms timer
- User types "i" (100ms later) --> cancel the old timer, start a new 300ms timer
- User types "k" (80ms later) --> cancel the old timer, start a new 300ms timer
- User stops typing --> 300ms passes --> NOW run the function once with "pik"

In code:
```js
function debounce(fn, delay = 300) {
  let timerId = null

  return function (...args) {
    // Cancel any previously scheduled execution
    clearTimeout(timerId)

    // Schedule a new execution after the delay
    timerId = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}
```

Why does this work? Because `timerId` lives in the **closure** -- it persists between function calls. Each call can access and modify the same `timerId` variable. This is one of the most practical uses of closures in JavaScript.

For our client-side filtering, debounce is not strictly necessary (filtering 50 items is nearly instant), but it IS essential to learn because you will need it constantly in real applications -- for API search-as-you-type, form validation, window resize handlers, and more.

### Task 4: Attach event listeners

```js
function attachEventListeners() {
  const searchInput = document.getElementById('search')
  const typeFilter = document.getElementById('type-filter')
  const sortOrder = document.getElementById('sort-order')

  if (searchInput) {
    const debouncedSearch = debounce((e) => {
      state.searchQuery = e.target.value
      updateURL()
      applyFilters()
    }, 300)

    searchInput.addEventListener('input', debouncedSearch)
  }

  if (typeFilter) {
    typeFilter.addEventListener('change', (e) => {
      state.typeFilter = e.target.value
      updateURL()
      applyFilters()
    })
  }

  if (sortOrder) {
    sortOrder.addEventListener('change', (e) => {
      state.sortOrder = e.target.value
      updateURL()
      applyFilters()
    })
  }
}
```

**Important:** Because we replace `innerHTML` on every render, we destroy and recreate our input elements. That means we need to re-attach event listeners after each render. Update the `render()` function to call `attachEventListeners()` at the end.

Add this at the bottom of the `render()` function:
```js
// Re-attach event listeners after DOM update
if (state.status === 'success') {
  attachEventListeners()
  // Restore focus to search input if user was typing
  if (document.activeElement === document.body && state.searchQuery) {
    const searchInput = document.getElementById('search')
    if (searchInput) {
      searchInput.focus()
      searchInput.setSelectionRange(
        searchInput.value.length,
        searchInput.value.length
      )
    }
  }
}
```

**Checkpoint:** You should now be able to:
- Type in the search box and see results filter
- Select a type from the dropdown to see only that type
- Sort A-Z, Z-A, or by number
- See the result count update
- All three controls should work together (search + type + sort)

**Exercise (15 min):** Test edge cases:
1. Search for something that matches nothing -- does the empty state appear?
2. Set a type filter, then search -- do both filters apply together?
3. Clear the search box -- do all results return?

---

## Part 4 -- URL State & Pagination (60 min)

**Concept:** Make the app state shareable. If you search for "char" and filter by "fire," someone should be able to copy the URL and see the same results.

### Task 1: Sync state to URL parameters

The `URLSearchParams` API makes this easy:

```js
function updateURL() {
  const params = new URLSearchParams()

  if (state.searchQuery) params.set('q', state.searchQuery)
  if (state.typeFilter !== 'all') params.set('type', state.typeFilter)
  if (state.sortOrder !== 'default') params.set('sort', state.sortOrder)

  const newURL = params.toString()
    ? `${window.location.pathname}?${params}`
    : window.location.pathname

  // replaceState updates the URL without adding a history entry
  window.history.replaceState(null, '', newURL)
}

function readURL() {
  const params = new URLSearchParams(window.location.search)
  state.searchQuery = params.get('q') || ''
  state.typeFilter = params.get('type') || 'all'
  state.sortOrder = params.get('sort') || 'default'
}
```

Call `readURL()` before `init()` and call `applyFilters()` after data loads to apply any URL-provided state.

### Task 2: Pagination with "Load More"

The PokeAPI paginates: each response includes a `next` URL for the next page. We can use this to load more Pokemon.

```js
async function loadMore() {
  if (!state.nextUrl || state.status === 'loading') return

  // Parse offset from the next URL
  const nextParams = new URL(state.nextUrl).searchParams
  const offset = parseInt(nextParams.get('offset'), 10)
  const limit = parseInt(nextParams.get('limit'), 10)

  state.status = 'loading-more'
  render()

  try {
    const data = await fetchAllPokemon(limit, offset)
    state.pokemon = [...state.pokemon, ...data.pokemon]
    state.nextUrl = data.nextUrl
    state.status = 'success'
    applyFilters()
  } catch (error) {
    state.status = 'error'
    state.errorMessage = error.message
    render()
  }
}
```

Update `render()` to show a "Load More" button when `state.nextUrl` exists, and a "Loading more..." indicator for the `loading-more` state.

**Checkpoint:** You should be able to:
1. Click "Load More" to fetch 12 more Pokemon
2. See the grid grow each time
3. Search and filter still work across all loaded Pokemon
4. Copy the URL, open a new tab, paste it -- same search/filter state appears

---

## Part 5 -- Polish (30 min)

**Tasks:**

1. **Add type badge colors** -- each Pokemon type gets its own color (fire = orange, water = blue, etc.)
2. **Add a fade-in animation** when cards appear
3. **Improve responsiveness** -- ensure the toolbar stacks properly on mobile
4. **Add keyboard shortcuts** (optional) -- e.g., `/` focuses the search box

**Add to `styles.css`:**
```css
/* Type badge colors */
.type-badge--fire { background: #f08030; color: white; }
.type-badge--water { background: #6890f0; color: white; }
.type-badge--grass { background: #78c850; color: white; }
.type-badge--electric { background: #f8d030; color: #333; }
.type-badge--psychic { background: #f85888; color: white; }
.type-badge--ice { background: #98d8d8; color: #333; }
.type-badge--dragon { background: #7038f8; color: white; }
.type-badge--dark { background: #705848; color: white; }
.type-badge--fairy { background: #ee99ac; color: #333; }
.type-badge--normal { background: #a8a878; color: white; }
.type-badge--fighting { background: #c03028; color: white; }
.type-badge--flying { background: #a890f0; color: #333; }
.type-badge--poison { background: #a040a0; color: white; }
.type-badge--ground { background: #e0c068; color: #333; }
.type-badge--rock { background: #b8a038; color: white; }
.type-badge--bug { background: #a8b820; color: white; }
.type-badge--ghost { background: #705898; color: white; }
.type-badge--steel { background: #b8b8d0; color: #333; }

/* Card entrance animation */
.card {
  animation: fadeInUp 0.3s ease both;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
```

---

## Key Takeaways

1. **Always check `response.ok`** -- `fetch` does not throw on HTTP errors (404, 500). This is the #1 mistake developers make with fetch.
2. **Always handle loading, error, and empty states** -- users need to know what is happening at all times.
3. **Debounce user input** before triggering expensive operations. Understand the closure that makes it work.
4. **Keep data and UI separate** -- store data in a state object, render from that state. Never parse the DOM to find out what data you have.
5. **Use `Promise.all`** when you have multiple independent async operations.
6. **Use `URLSearchParams`** for reading and writing URL state.
7. **The Network tab in DevTools is your best friend** for debugging API issues.
8. **Accessibility is not optional** -- always label your inputs, announce dynamic changes, and provide text alternatives.

---

## Stretch Goals

These are genuinely challenging extensions:

1. **Favorites with localStorage** -- Click a heart icon on a card to save it. Persist favorites across page reloads using `localStorage`. Add a "Show Favorites" toggle.
2. **Server-side search** -- Instead of filtering client-side, use the PokeAPI's `https://pokeapi.co/api/v2/pokemon/{name}` endpoint. Handle partial matches by fetching `pokemon-species` and searching across names.
3. **Infinite scroll** -- Replace "Load More" with automatic loading when the user scrolls near the bottom. Use `IntersectionObserver`.
4. **Detail modal** -- Click a card to open a modal showing full Pokemon stats, abilities, and evolution chain. Use the native `<dialog>` element.
5. **Compare mode** -- Select two Pokemon and show their stats side by side.

---

## Final Solution

A complete working solution is available in the `solution/` directory. Open `solution/index.html` in your browser to see the finished app. Compare your code against the solution files to check your understanding.
