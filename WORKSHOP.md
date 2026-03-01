# Workshop: API Explorer

**Goal:** Build a Pokemon Explorer app that fetches data from the PokeAPI, displays it with proper loading/error/empty states, supports debounced search, type filtering, sorting, pagination, and shareable URL state.

**Duration:** ~4-5 hours (with breaks)

---

## Prerequisites

- Basic HTML, CSS, JavaScript (variables, functions, arrays, objects)
- A code editor (VS Code recommended)
- A modern browser: Chrome 80+, Firefox 75+, Safari 14+, or Edge 80+
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
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="page-header">
    <div class="container">
      <h1 class="page-title">Pokemon Explorer</h1>
    </div>
  </header>

  <main id="app" class="container">
    <!-- We will build this up piece by piece -->
  </main>
  <script src="app.js"></script>
</body>
</html>
```

> **Note:** The `<link rel="icon" href="data:,">` line prevents a 404 error for `/favicon.ico` in the Network tab. Browsers automatically request a favicon, and without this line you will see a harmless but confusing 404 error in DevTools.

**How to run it:**
1. Open the folder in VS Code
2. Right-click `index.html` > "Open with Live Server"
3. Or simply open the file in your browser (some features like modules require a server)

**Checkpoint:** You should see a blank page with a red header. Open DevTools (`F12`) and confirm there are no errors in the Console tab.

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

> **API etiquette:** The PokeAPI is free and has no authentication, but it does have rate limits. Avoid hammering it with rapid refreshes during development. If you are reloading frequently, consider increasing the delay between reloads or using the browser cache.

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

// Number of Pokemon to fetch per page
const PAGE_SIZE = 12

async function fetchPokemonPage(limit = PAGE_SIZE, offset = 0) {
  const url = `${API_BASE}/pokemon?limit=${limit}&offset=${offset}`
  const response = await fetch(url)

  // IMPORTANT: fetch does NOT throw on 404/500 errors.
  // You must check response.ok yourself.
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`)
  }

  return response.json()
}

// Test it -- open the Console tab in DevTools to see the output
fetchPokemonPage().then(data => console.log(data))
```

**Checkpoint:** Open DevTools Console. You should see an object with `count`, `next`, `previous`, and `results`.

### Task 2: Fetch detailed data for each Pokemon

The list endpoint only gives us names. We need images and types, which require a second fetch for each Pokemon. This is a common API pattern.

**First, remove the test line from Task 1.** Delete the `fetchPokemonPage().then(...)` line -- we no longer need it.

```js
async function fetchPokemonDetail(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch Pokemon detail: ${response.status}`)
  }
  return response.json()
}

async function fetchPokemonWithDetails(limit = PAGE_SIZE, offset = 0) {
  // Step 1: Get the list of Pokemon (names and URLs)
  const listData = await fetchPokemonPage(limit, offset)

  // Step 2: Fetch details for each Pokemon in parallel using Promise.all
  // This is MUCH faster than fetching them one by one
  const detailPromises = listData.results.map(pokemon =>
    fetchPokemonDetail(pokemon.url)
  )
  const details = await Promise.all(detailPromises)

  // Step 3: Extract only the data we need
  const pokemon = details.map(raw => ({
    id: raw.id,
    name: raw.name,
    image: raw.sprites.other?.['official-artwork']?.front_default
           ?? raw.sprites.front_default
           ?? '',
    types: raw.types.map(typeSlot => typeSlot.type.name),
    height: raw.height,
    weight: raw.weight,
  }))

  return {
    pokemon,
    totalCount: listData.count,
    nextPageUrl: listData.next,
  }
}

// Test it
fetchPokemonWithDetails().then(data => console.log(data))
```

**Discussion point:** Why `Promise.all` instead of a `for` loop with `await`? Because each fetch is independent -- they can all run at the same time. `Promise.all` fires all requests simultaneously and waits for all of them to finish. A `for` loop with `await` would fetch them one after another, which is much slower.

```
Sequential (slow):  ----[fetch1]----[fetch2]----[fetch3]----  (3 seconds)
Parallel (fast):    ----[fetch1]----
                    ----[fetch2]----                          (1 second)
                    ----[fetch3]----
```

> **Caveat:** If ANY single fetch fails, `Promise.all` rejects immediately and you lose ALL results -- even the ones that succeeded. For partial failure tolerance, see `Promise.allSettled()`, which always resolves with an array of `{status, value}` or `{status, reason}` objects for each promise.

### How to see this in DevTools

Open the **Network tab** in DevTools before loading the page:

1. **Open DevTools** (`F12` or `Cmd+Option+I` on Mac)
2. **Click the "Network" tab**
3. **Reload the page**
4. You will see requests appear. The columns to pay attention to:
   - **Name**: the URL being requested
   - **Status**: the HTTP status code (200 = success)
   - **Type**: `fetch` for our API calls, `script` for our JS file, etc.
   - **Time**: how long each request took
   - **Waterfall**: a visual timeline showing when each request started and finished
5. Notice how the 12 detail requests all start at roughly the same time -- that is `Promise.all` in action. If they were sequential, you would see them start one after another.

### Task 3: Render cards to the DOM

**First, remove the test line from Task 2.** Delete the `fetchPokemonWithDetails().then(...)` line.

Now add the `escapeHTML` helper and the rendering function. We will explain `escapeHTML` in detail shortly.

```js
/**
 * Escape HTML special characters to prevent XSS.
 *
 * When you insert data into innerHTML, any HTML in that data will be
 * parsed and executed. If the data contains <script>alert('hacked')</script>,
 * it will run. This function converts special characters to their safe
 * HTML entity equivalents.
 */
function escapeHTML(str) {
  if (typeof str !== 'string') return ''
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function buildGridHTML(pokemonList) {
  if (pokemonList.length === 0) {
    return '<div class="status-message"><p>No Pokemon found.</p></div>'
  }

  const cardsHTML = pokemonList.map(pokemon => {
    const typeBadges = pokemon.types.map(type =>
      `<span class="type-badge type-badge--${escapeHTML(type)}">${escapeHTML(type)}</span>`
    ).join('')

    return `
      <li class="card">
        <img
          src="${escapeHTML(pokemon.image)}"
          alt="${escapeHTML(pokemon.name)} artwork"
          class="card__image"
          width="96"
          height="96"
          loading="lazy"
        >
        <span class="card__number">#${String(pokemon.id).padStart(3, '0')}</span>
        <h2 class="card__name">${escapeHTML(pokemon.name)}</h2>
        <div class="card__types">${typeBadges}</div>
      </li>
    `
  }).join('')

  return `
    <ul class="pokemon-grid" role="list" aria-label="Pokemon list">
      ${cardsHTML}
    </ul>
  `
}

// Wire it up
async function init() {
  const app = document.getElementById('app')
  const data = await fetchPokemonWithDetails()
  app.innerHTML = buildGridHTML(data.pokemon)
}

init()
```

> **Security teaching moment: Why `escapeHTML`?**
>
> We are using `innerHTML` to build our UI, which means any string we insert is parsed as HTML. If the API ever returned a Pokemon name like `<img src=x onerror=alert('hacked')>`, it would execute that JavaScript. This is called a **Cross-Site Scripting (XSS)** attack.
>
> The `escapeHTML` function converts characters like `<`, `>`, `&`, and `"` into their safe HTML entity equivalents (`&lt;`, `&gt;`, etc.). This means they display as text instead of being interpreted as HTML.
>
> In practice, the PokeAPI is safe, but you should **always** escape user-provided or API-provided data before inserting it into `innerHTML`. This is one of the most important security habits in web development.

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
  background: #f0f0f5;
  color: #1a1a2e;
  line-height: 1.5;
  min-height: 100vh;
}

.container {
  max-width: 1200px;
  margin-inline: auto;
  padding-inline: 1.5rem;
}

.page-header {
  background: linear-gradient(135deg, #e63946 0%, #d62839 100%);
  color: white;
  padding: 2rem 0;
  margin-bottom: 2rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.page-title {
  font-size: clamp(1.5rem, 3vw, 2.25rem);
  font-weight: 700;
}

.pokemon-grid {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.25rem;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem 1rem;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.card__image {
  width: 96px;
  height: 96px;
  margin: 0 auto 0.75rem;
  display: block;
  object-fit: contain;
  background: #f8f8f8;
  border-radius: 50%;
}

.card__number {
  display: block;
  font-size: 0.75rem;
  color: #aaa;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.card__name {
  font-size: 1.05rem;
  font-weight: 600;
  text-transform: capitalize;
  margin-bottom: 0.5rem;
}

.card__types {
  display: flex;
  gap: 0.375rem;
  justify-content: center;
  flex-wrap: wrap;
}

/* Base type badge styling */
.type-badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.2;
  background: #999;
  color: white;
}
```

**Checkpoint:** You should now see a responsive grid of styled Pokemon cards with a red header.

### Discussion points for Part 1

1. What happens if the API URL is wrong? (Try changing it and check the Console.)
2. What does the user see while data is loading? (Nothing -- we will fix this next.)
3. Open the Network tab in DevTools. How many requests were made? How long did they take? Can you see the `Promise.all` parallelism in the waterfall view?

### Troubleshooting -- Part 1

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| Console says `Uncaught SyntaxError` | Typo in your JavaScript, often a missing backtick or bracket | Check the line number in the error and compare your code character-by-character |
| Console says `fetch is not defined` | You are running the file directly from the filesystem in an old browser | Use Live Server or upgrade your browser |
| Cards appear but images are broken | The image URL is incorrect or the API changed | Check `pokemon.image` in the console -- it should be a URL starting with `https://` |
| Page is completely blank with no errors | The `init()` call is missing, or `#app` element ID does not match | Make sure your HTML has `id="app"` and your JS calls `init()` |

---

## Part 2 -- Loading, Error & Empty States (45 min)

**Concept:** Real applications are never instant. Users need feedback about what is happening.

There are five states the UI can be in:
1. **Idle** -- app just loaded, nothing has happened yet
2. **Loading** -- data is being fetched (show a spinner)
3. **Error** -- something went wrong (show a message and a retry button)
4. **Success** -- data is loaded and ready to display
5. **Loading-more** -- pagination is fetching additional data (show spinner at bottom)

Here is the state machine for our app:

```
              init()
               |
               v
  +--------> idle
  |            |
  |       load data
  |            |
  |            v
  |         loading ---------> error
  |            |                 |
  |        success <-- retry ----+
  |            |
  |       load more
  |            |
  |            v
  |      loading-more -------> error
  |            |                 |
  +-------  success <-- retry ---+
```

### Task 1: Build a state manager

Replace the bottom of your `app.js` (everything from `async function init()` onward) with:

```js
// ----- State Management -----

// This object holds ALL of our application state in one place.
// This is a pattern you will see in every frontend framework.
//
// We use `const` here: this prevents reassigning the variable itself
// (e.g., `state = {}` would error), but it does NOT prevent changing
// properties inside the object (e.g., `state.status = 'loading'` is fine).
// This is a common source of confusion -- `const` means "constant binding,"
// not "immutable value."
const state = {
  allPokemon: [],
  filteredPokemon: [],
  totalCount: 0,
  nextPageUrl: null,
  status: 'idle',   // 'idle' | 'loading' | 'error' | 'success' | 'loading-more'
  errorMessage: '',
  searchQuery: '',
  typeFilter: 'all',
  sortOrder: 'id-asc', // 'id-asc' | 'name-asc' | 'name-desc'
}

function render() {
  const app = document.getElementById('app')

  switch (state.status) {
    case 'loading':
      app.innerHTML = `
        <div class="status-message" role="status">
          <div class="spinner" aria-hidden="true"></div>
          <p>Loading Pokemon...</p>
        </div>
      `
      break

    case 'error':
      app.innerHTML = `
        <div class="status-message" role="alert">
          <p class="error-text">${escapeHTML(state.errorMessage)}</p>
          <button class="btn btn--primary" id="retry-btn">Try Again</button>
        </div>
      `
      document.getElementById('retry-btn')
        ?.addEventListener('click', init)
      break

    case 'success':
      if (state.filteredPokemon.length === 0) {
        app.innerHTML = `
          <div class="status-message" role="status" aria-live="polite">
            <p>No Pokemon match your search.</p>
          </div>
        `
      } else {
        app.innerHTML = buildGridHTML(state.filteredPokemon)
      }
      break

    default:
      // 'idle' -- do nothing
      break
  }
}
```

> **Why not `onclick="init()"`?** Inline event handlers (`onclick="..."`) work, but they have downsides: they run in the global scope, they only allow one handler per event, and they mix HTML with JavaScript. Using `addEventListener` is the standard best practice. We attach the click handler right after creating the button element.

### Task 2: Update `init()` to use state

```js
async function init() {
  state.status = 'loading'
  state.errorMessage = ''
  render()

  try {
    const data = await fetchPokemonWithDetails()
    state.allPokemon = data.pokemon
    state.filteredPokemon = data.pokemon
    state.totalCount = data.totalCount
    state.nextPageUrl = data.nextPageUrl
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
  max-width: 420px;
  margin: 2rem auto;
}

.status-message p {
  font-size: 1rem;
  color: #666;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e0e0e0;
  border-top-color: #e63946;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1.25rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-text {
  color: #e63946;
  font-weight: 500;
  margin-bottom: 1rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.6rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.1s ease;
}

.btn:active {
  transform: scale(0.98);
}

.btn--primary {
  background-color: #e63946;
  color: white;
}

.btn--primary:hover {
  background-color: #c1121f;
}

.btn--primary:focus-visible {
  outline: 2px solid #e63946;
  outline-offset: 3px;
}

.btn--secondary {
  background-color: #e8e8ee;
  color: #1a1a2e;
}

.btn--secondary:hover {
  background-color: #d8d8e0;
}

.btn--secondary:focus-visible {
  outline: 2px solid #666;
  outline-offset: 3px;
}
```

**Exercise:** Deliberately break the API URL (change "pokemon" to "pokemonxyz"). Confirm:
1. The loading spinner appears
2. The error message appears with the HTTP status
3. The "Try Again" button works when you fix the URL back

**Checkpoint:** You should now see a loading spinner briefly before the cards appear. If you break the URL, you should see an error message with a retry button.

### Task 4: Add `AbortController` for cancellable requests

```js
// At the top of your app.js, after the PAGE_SIZE constant, add:
let currentAbortController = null

// Update fetchPokemonPage to accept a signal:
async function fetchPokemonPage(limit = PAGE_SIZE, offset = 0, signal) {
  const url = `${API_BASE}/pokemon?limit=${limit}&offset=${offset}`
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`)
  }
  return response.json()
}

// Update fetchPokemonDetail to accept a signal:
async function fetchPokemonDetail(url, signal) {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Failed to fetch Pokemon detail: ${response.status}`)
  }
  return response.json()
}

// Update fetchPokemonWithDetails to pass the signal through:
async function fetchPokemonWithDetails(limit = PAGE_SIZE, offset = 0, signal) {
  const listData = await fetchPokemonPage(limit, offset, signal)

  const detailPromises = listData.results.map(pokemon =>
    fetchPokemonDetail(pokemon.url, signal)
  )
  const details = await Promise.all(detailPromises)

  const pokemon = details.map(raw => ({
    id: raw.id,
    name: raw.name,
    image: raw.sprites.other?.['official-artwork']?.front_default
           ?? raw.sprites.front_default
           ?? '',
    types: raw.types.map(typeSlot => typeSlot.type.name),
    height: raw.height,
    weight: raw.weight,
  }))

  return {
    pokemon,
    totalCount: listData.count,
    nextPageUrl: listData.next,
  }
}
```

Now update `init()` to use the AbortController:

```js
async function init() {
  // Cancel any in-flight request
  if (currentAbortController) {
    currentAbortController.abort()
  }
  currentAbortController = new AbortController()

  state.status = 'loading'
  state.errorMessage = ''
  render()

  try {
    const data = await fetchPokemonWithDetails(
      PAGE_SIZE,
      0,
      currentAbortController.signal
    )
    state.allPokemon = data.pokemon
    state.filteredPokemon = data.pokemon
    state.totalCount = data.totalCount
    state.nextPageUrl = data.nextPageUrl
    state.status = 'success'
  } catch (error) {
    // Ignore AbortError -- it means we deliberately cancelled
    if (error.name === 'AbortError') return

    state.status = 'error'
    state.errorMessage = error.message
  }

  render()
}

init()
```

**Teaching moment: Why AbortController?** Imagine a user clicks "Load More," then immediately clicks it again. Without AbortController, the first request might finish AFTER the second one, replacing fresh data with stale data. AbortController lets you cancel the first request so it never completes. When a fetch is aborted, it throws an `AbortError` -- that is why we check `error.name === 'AbortError'` and silently ignore it.

### Troubleshooting -- Part 2

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| Spinner never goes away | The `state.status` is never set to `'success'` or `'error'` | Make sure your `try/catch` in `init()` sets the status in both branches |
| "Try Again" button does nothing | The button's click listener is not attached | Make sure `addEventListener` is called right after setting `innerHTML` in the error case |
| `escapeHTML is not defined` | You forgot to add the `escapeHTML` function from Task 3 of Part 1 | Add it above `render()` |
| Console says `Cannot read properties of null` | `document.getElementById('app')` returned null | Make sure your HTML has `<main id="app">` and the script tag is at the end of `<body>` |

---

## Part 3 -- Search, Filter & Sort (75 min)

**Concept:** Let users narrow down results without making new API calls.

We already fetched the data -- now we filter the in-memory array and re-render. This is called **client-side filtering**.

### Task 1: Build the toolbar

We need search, filter, and sort controls. Add these helper functions:

```js
// Add this helper function
function getUniqueTypes() {
  const allTypes = state.allPokemon.flatMap(p => p.types)
  return [...new Set(allTypes)].sort()
}

function buildToolbarHTML() {
  const types = getUniqueTypes()
  const typesOptionsHTML = types.map(type => {
    const selected = state.typeFilter === type ? 'selected' : ''
    const label = type.charAt(0).toUpperCase() + type.slice(1)
    return `<option value="${type}" ${selected}>${label}</option>`
  }).join('')

  return `
    <div class="toolbar">
      <div class="search-group">
        <label for="search-input" class="visually-hidden">Search Pokemon by name</label>
        <input
          type="search"
          id="search-input"
          class="search-input"
          placeholder="Search Pokemon..."
          value="${escapeHTML(state.searchQuery)}"
          aria-describedby="result-count"
          autocomplete="off"
        >
      </div>

      <div class="filter-group">
        <label for="type-filter" class="visually-hidden">Filter by type</label>
        <select id="type-filter" class="select-input">
          <option value="all" ${state.typeFilter === 'all' ? 'selected' : ''}>All Types</option>
          ${typesOptionsHTML}
        </select>

        <label for="sort-order" class="visually-hidden">Sort order</label>
        <select id="sort-order" class="select-input">
          <option value="id-asc" ${state.sortOrder === 'id-asc' ? 'selected' : ''}>Sort: # Number</option>
          <option value="name-asc" ${state.sortOrder === 'name-asc' ? 'selected' : ''}>Sort: A &rarr; Z</option>
          <option value="name-desc" ${state.sortOrder === 'name-desc' ? 'selected' : ''}>Sort: Z &rarr; A</option>
        </select>
      </div>

      <p class="result-count" id="result-count" aria-live="polite">
        Showing ${state.filteredPokemon.length} of ${state.allPokemon.length} Pokemon
      </p>
    </div>
  `
}
```

Now update the `render()` function's success case to show the toolbar above the grid:

```js
    case 'success':
      if (state.filteredPokemon.length === 0) {
        app.innerHTML = `
          ${buildToolbarHTML()}
          <div class="status-message" role="status" aria-live="polite">
            <p>No Pokemon match your current filters.</p>
          </div>
        `
      } else {
        app.innerHTML = `
          ${buildToolbarHTML()}
          ${buildGridHTML(state.filteredPokemon)}
        `
      }
      attachToolbarListeners()
      restoreSearchFocus()
      break
```

We have not defined `attachToolbarListeners` or `restoreSearchFocus` yet -- those come in Task 4. We also need a stub for `writeStateToURL` since the event handlers will call it:

```js
// Stub -- we will implement this fully in Part 4
function writeStateToURL() {}
```

### Task 2: Add toolbar CSS

Add to `styles.css`:
```css
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1.5rem;
  padding: 1.25rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.search-group {
  flex: 1 1 250px;
}

.search-input {
  width: 100%;
  padding: 0.625rem 1rem;
  padding-left: 2.5rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 0.95rem;
  font: inherit;
  background-color: #fafafa;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: 0.75rem center;
  background-size: 1rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-input:focus {
  outline: none;
  border-color: #e63946;
  box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.15);
  background-color: white;
}

.filter-group {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.select-input {
  padding: 0.625rem 2rem 0.625rem 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 0.9rem;
  font: inherit;
  background-color: #fafafa;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
  background-size: 1rem;
  transition: border-color 0.2s ease;
}

.select-input:focus {
  outline: none;
  border-color: #e63946;
  box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.15);
}

.result-count {
  font-size: 0.85rem;
  color: #777;
  margin-left: auto;
  white-space: nowrap;
}

/* Visually hidden but still accessible to screen readers */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

### Task 3: Implement the filter/sort pipeline

This is where array methods shine. We chain `.filter()` and `.sort()` to transform data without mutating the original.

```js
function applyFiltersAndSort() {
  let result = [...state.allPokemon] // shallow copy -- never mutate the original

  // Step 1: Filter by search query
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase().trim()
    result = result.filter(pokemon =>
      pokemon.name.toLowerCase().includes(query)
    )
  }

  // Step 2: Filter by type
  if (state.typeFilter !== 'all') {
    result = result.filter(pokemon =>
      pokemon.types.includes(state.typeFilter)
    )
  }

  // Step 3: Sort
  // localeCompare() is the correct way to sort strings -- it handles
  // accents, case, and locale-specific ordering rules properly.
  switch (state.sortOrder) {
    case 'name-asc':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'name-desc':
      result.sort((a, b) => b.name.localeCompare(a.name))
      break
    case 'id-asc':
    default:
      result.sort((a, b) => a.id - b.id)
      break
  }

  state.filteredPokemon = result
}
```

### Task 4: Debounce the search input

**What is debounce, and why do you need it?**

Imagine typing "pikachu" into a search box. Without debounce, the filter function runs 7 times -- once for "p", "pi", "pik", "pika", "pikac", "pikach", "pikachu". That is wasteful.

Debounce says: "Wait until the user STOPS typing for 300ms, then run the function once." It works like a reset timer:
- User types "p" --> start a 300ms timer
- User types "i" (100ms later) --> cancel the old timer, start a new 300ms timer
- User types "k" (80ms later) --> cancel the old timer, start a new 300ms timer
- ...user keeps typing "a", "c", "h", "u" -- each keystroke resets the timer...
- User stops typing --> 300ms passes --> NOW run the function once with "pikachu"

In code:
```js
function debounce(fn, delay = 300) {
  let timerId = null

  return function debounced(...args) {
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

Learning the pattern here, where the stakes are low (filtering 50 items is nearly instant), prepares you for when it matters in real applications -- for API search-as-you-type, form validation, window resize handlers, and more.

### Task 5: Attach event listeners

**Important -- create the debounced handler once.** If we create it inside `attachToolbarListeners`, a new debounce closure is created on every render, which resets the timer. By defining it outside, the same closure is reused.

```js
// Create the debounced search handler ONCE, outside of attachToolbarListeners
const debouncedSearchHandler = debounce(function handleSearchInput(event) {
  state.searchQuery = event.target.value
  writeStateToURL()
  applyFiltersAndSort()
  render()
}, 300)

function attachToolbarListeners() {
  const searchInput = document.getElementById('search-input')
  const typeFilter = document.getElementById('type-filter')
  const sortOrder = document.getElementById('sort-order')

  if (searchInput) {
    searchInput.addEventListener('input', debouncedSearchHandler)
  }

  if (typeFilter) {
    typeFilter.addEventListener('change', (e) => {
      state.typeFilter = e.target.value
      writeStateToURL()
      applyFiltersAndSort()
      render()
    })
  }

  if (sortOrder) {
    sortOrder.addEventListener('change', (e) => {
      state.sortOrder = e.target.value
      writeStateToURL()
      applyFiltersAndSort()
      render()
    })
  }
}

/**
 * Restore focus to the search input after a re-render, if the user
 * was previously typing in it.
 */
function restoreSearchFocus() {
  if (!state.searchQuery) return

  const searchInput = document.getElementById('search-input')
  if (!searchInput) return

  requestAnimationFrame(() => {
    searchInput.focus()
    const len = searchInput.value.length
    searchInput.setSelectionRange(len, len)
  })
}
```

> **Why does `innerHTML` destroy event listeners?**
>
> When you set `element.innerHTML = '...'`, the browser does three things:
> 1. **Destroys** all existing child elements (and their event listeners)
> 2. **Parses** the new HTML string
> 3. **Creates** brand new DOM elements
>
> The new `<input>` element is a completely different object in memory than the old one. The event listener was attached to the old object, which no longer exists. This is why we must call `attachToolbarListeners()` after every `render()`.
>
> This is a real limitation of the `innerHTML` approach. Frameworks like React, Vue, and Svelte solve this with a "virtual DOM" or compiler that only updates what actually changed, preserving event listeners on elements that did not change.

**Checkpoint:** You should now be able to:
- Type in the search box and see results filter
- Select a type from the dropdown to see only that type
- Sort by number, A-Z, or Z-A
- See the result count update
- All three controls should work together (search + type + sort)

**Exercise (15 min):** Test edge cases:
1. Search for something that matches nothing -- does the empty state appear?
2. Set a type filter, then search -- do both filters apply together?
3. Clear the search box -- do all results return?

### Troubleshooting -- Part 3

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| Search input loses focus after every keystroke | `render()` is called on every input event, destroying the input | Make sure `restoreSearchFocus()` is called after rendering, and the debounced handler is created ONCE outside `attachToolbarListeners` |
| Dropdown resets to first option on every render | The `selected` attribute is not being set on the correct `<option>` | Check that your template uses `${state.sortOrder === 'name-asc' ? 'selected' : ''}` |
| `writeStateToURL is not defined` | You have not added the stub or the full implementation yet | Add `function writeStateToURL() {}` as a placeholder |
| Filter works but sort does nothing | The `sortOrder` state value does not match the `<option value>` | Make sure your `<option value="id-asc">` matches what `applyFiltersAndSort()` checks |

---

## Part 4 -- URL State & Pagination (60 min)

**Concept:** Make the app state shareable. If you search for "char" and filter by "fire," someone should be able to copy the URL and see the same results.

### Task 1: Sync state to URL parameters

The `URLSearchParams` API makes this easy. Replace the `writeStateToURL` stub with the full implementation, and add `readStateFromURL`:

```js
function writeStateToURL() {
  const params = new URLSearchParams()

  // Only add params that differ from defaults (keeps the URL clean)
  if (state.searchQuery) params.set('q', state.searchQuery)
  if (state.typeFilter !== 'all') params.set('type', state.typeFilter)
  if (state.sortOrder !== 'id-asc') params.set('sort', state.sortOrder)

  const queryString = params.toString()
  const newURL = queryString
    ? `${window.location.pathname}?${queryString}`
    : window.location.pathname

  // replaceState updates the URL without adding a history entry
  window.history.replaceState(null, '', newURL)
}

function readStateFromURL() {
  const params = new URLSearchParams(window.location.search)
  state.searchQuery = params.get('q') ?? ''
  state.typeFilter = params.get('type') ?? 'all'
  state.sortOrder = params.get('sort') ?? 'id-asc'
}
```

Now update the bottom of your file to call `readStateFromURL()` before `init()`, and update `init()` to apply filters after loading:

```js
async function init() {
  if (currentAbortController) {
    currentAbortController.abort()
  }
  currentAbortController = new AbortController()

  state.status = 'loading'
  state.errorMessage = ''
  render()

  try {
    const data = await fetchPokemonWithDetails(
      PAGE_SIZE,
      0,
      currentAbortController.signal
    )
    state.allPokemon = data.pokemon
    state.totalCount = data.totalCount
    state.nextPageUrl = data.nextPageUrl
    state.status = 'success'

    // Apply any filters that were read from the URL
    applyFiltersAndSort()
  } catch (error) {
    if (error.name === 'AbortError') return

    state.status = 'error'
    state.errorMessage = error.message
  }

  render()
}

// Step 1: Read any saved state from the URL (e.g., ?q=pikachu&type=fire)
readStateFromURL()

// Step 2: Fetch data and render
init()
```

### Task 2: Pagination with "Load More"

The PokeAPI paginates: each response includes a `next` URL for the next page. We can use this to load more Pokemon.

First, add a function to build the Load More HTML:

```js
function buildLoadMoreHTML() {
  if (!state.nextPageUrl) {
    if (state.allPokemon.length > 0) {
      return `
        <div class="load-more-container">
          <p class="load-more-done">All ${state.allPokemon.length} loaded Pokemon shown.</p>
        </div>
      `
    }
    return ''
  }

  if (state.status === 'loading-more') {
    return `
      <div class="load-more-container">
        <div class="loading-more-text" role="status">
          <div class="spinner spinner--small" aria-hidden="true"></div>
          Loading more Pokemon...
        </div>
      </div>
    `
  }

  return `
    <div class="load-more-container">
      <button class="btn btn--secondary" id="load-more-btn">
        Load More Pokemon
      </button>
    </div>
  `
}
```

Now add the Load More handler:

```js
async function handleLoadMore() {
  if (!state.nextPageUrl || state.status === 'loading-more') return

  // Parse the next URL to get offset and limit values
  const nextURL = new URL(state.nextPageUrl)
  const offset = parseInt(nextURL.searchParams.get('offset'), 10)
  const limit = parseInt(nextURL.searchParams.get('limit'), 10) || PAGE_SIZE

  state.status = 'loading-more'
  state.errorMessage = ''
  render()

  // Cancel any in-flight request
  if (currentAbortController) {
    currentAbortController.abort()
  }
  currentAbortController = new AbortController()

  try {
    const data = await fetchPokemonWithDetails(
      limit,
      offset,
      currentAbortController.signal
    )

    // Append new Pokemon to our existing list (do not replace!)
    state.allPokemon = [...state.allPokemon, ...data.pokemon]
    state.nextPageUrl = data.nextPageUrl
    state.status = 'success'

    // Re-apply filters so new Pokemon are sorted/filtered correctly
    applyFiltersAndSort()
    render()
  } catch (error) {
    if (error.name === 'AbortError') return

    state.status = 'error'
    state.errorMessage = error.message
    render()
  }
}
```

Finally, update the `render()` function's success case to include the Load More section and wire up the button:

```js
    case 'success':
    case 'loading-more':
      if (state.filteredPokemon.length === 0 && state.status !== 'loading-more') {
        app.innerHTML = `
          ${buildToolbarHTML()}
          <div class="status-message" role="status" aria-live="polite">
            <p>No Pokemon match your current filters.</p>
          </div>
          ${buildLoadMoreHTML()}
        `
      } else {
        app.innerHTML = `
          ${buildToolbarHTML()}
          ${buildGridHTML(state.filteredPokemon)}
          ${buildLoadMoreHTML()}
        `
      }
      attachToolbarListeners()

      // Wire up Load More button
      document.getElementById('load-more-btn')
        ?.addEventListener('click', handleLoadMore)

      restoreSearchFocus()
      break
```

Add the CSS for Load More to `styles.css`:
```css
.load-more-container {
  text-align: center;
  margin-top: 2rem;
  margin-bottom: 3rem;
}

.load-more-done {
  color: #999;
  font-size: 0.85rem;
}

.loading-more-text {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: #777;
  font-size: 0.9rem;
  padding: 1rem;
}

.spinner--small {
  width: 24px;
  height: 24px;
  border-width: 3px;
}
```

**Checkpoint:** You should be able to:
1. Click "Load More" to fetch 12 more Pokemon
2. See the grid grow each time
3. Search and filter still work across all loaded Pokemon
4. Copy the URL, open a new tab, paste it -- same search/filter state appears

### Troubleshooting -- Part 4

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| URL does not update when you search | `writeStateToURL()` is still the empty stub | Replace the stub with the full implementation |
| "Load More" button does nothing | The click listener is not attached | Make sure `document.getElementById('load-more-btn')?.addEventListener(...)` is in the `render()` success case |
| New Pokemon replace old ones instead of appending | You used `=` instead of spread `[...state.allPokemon, ...data.pokemon]` | Use the spread operator to merge old and new arrays |
| URL shows `?sort=default` | The default check does not match | Make sure `writeStateToURL` checks `state.sortOrder !== 'id-asc'` |

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
.type-badge--normal   { background: #a8a878; color: #fff; }
.type-badge--fire     { background: #f08030; color: #fff; }
.type-badge--water    { background: #6890f0; color: #fff; }
.type-badge--electric { background: #f8d030; color: #333; }
.type-badge--grass    { background: #78c850; color: #fff; }
.type-badge--ice      { background: #98d8d8; color: #333; }
.type-badge--fighting { background: #c03028; color: #fff; }
.type-badge--poison   { background: #a040a0; color: #fff; }
.type-badge--ground   { background: #e0c068; color: #333; }
.type-badge--flying   { background: #a890f0; color: #fff; }
.type-badge--psychic  { background: #f85888; color: #fff; }
.type-badge--bug      { background: #a8b820; color: #fff; }
.type-badge--rock     { background: #b8a038; color: #fff; }
.type-badge--ghost    { background: #705898; color: #fff; }
.type-badge--dragon   { background: #7038f8; color: #fff; }
.type-badge--dark     { background: #705848; color: #fff; }
.type-badge--steel    { background: #b8b8d0; color: #333; }
.type-badge--fairy    { background: #ee99ac; color: #333; }

/* Card entrance animation */
.card {
  animation: fadeInUp 0.4s ease both;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Respect user preferences for reduced motion */
@media (prefers-reduced-motion: reduce) {
  /*
    We use 0.01ms instead of 0s because some browsers treat 0s as
    "no animation at all" and skip the animationend event entirely,
    which can break JavaScript that listens for it.
  */
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Responsive adjustments */
@media (max-width: 640px) {
  .container {
    padding-inline: 1rem;
  }

  .page-header {
    padding: 1.5rem 0;
    margin-bottom: 1.5rem;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
    padding: 1rem;
  }

  .search-group {
    flex: 1 1 auto;
  }

  .filter-group {
    flex-direction: column;
  }

  .select-input {
    width: 100%;
  }

  .result-count {
    margin-left: 0;
    text-align: center;
  }

  .pokemon-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.75rem;
  }

  .card {
    padding: 1rem 0.75rem;
  }

  .card__image {
    width: 72px;
    height: 72px;
  }

  .card__name {
    font-size: 0.9rem;
  }
}
```

---

## Key Takeaways

1. **Always check `response.ok`** -- `fetch` does not throw on HTTP errors (404, 500). This is the #1 mistake developers make with fetch.
2. **Always handle loading, error, and empty states** -- users need to know what is happening at all times.
3. **Debounce user input** before triggering expensive operations. Understand the closure that makes it work.
4. **Keep data and UI separate** -- store data in a state object, render from that state. Never parse the DOM to find out what data you have.
5. **Use `Promise.all`** when you have multiple independent async operations. Be aware that it fails fast -- one rejection rejects everything.
6. **Use `URLSearchParams`** for reading and writing URL state.
7. **The Network tab in DevTools is your best friend** for debugging API issues.
8. **Accessibility is not optional** -- always label your inputs, announce dynamic changes, and provide text alternatives.
9. **Always escape data before inserting into `innerHTML`** -- XSS prevention is a fundamental security practice.
10. **`innerHTML` destroys event listeners** -- if you rebuild the DOM, you must re-attach listeners. Frameworks solve this problem, which is one reason they exist.

---

## What to Learn Next

Now that you understand the fundamentals of fetching data, managing state, and rendering UI, here are paths to explore:

- **Frameworks (React, Vue, Svelte):** They solve the problems you hit in this workshop -- re-attaching event listeners, efficiently updating the DOM, managing complex state. Everything you learned here (state, rendering, async data) transfers directly.
- **TypeScript:** Adds type safety to your JavaScript. Catches bugs like typos in state property names (`state.pokemon` vs `state.allPokemon`) at compile time instead of at runtime.
- **Testing:** Learn to write automated tests for your fetch functions and filter logic using tools like Vitest or Jest. If you can call `applyFiltersAndSort()` and check `state.filteredPokemon`, you can test it.
- **Accessibility (a11y):** Dive deeper with tools like axe-core and the WAVE browser extension. Learn about ARIA roles, keyboard navigation, and screen reader testing.
- **Performance:** Learn about virtualized lists (for rendering thousands of items), lazy loading, caching strategies, and Service Workers.

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
