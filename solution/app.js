/* ==========================================================================
   Pokemon Explorer -- Application JavaScript
   ==========================================================================

   Architecture Overview:
   ----------------------
   This app follows a simple "state -> render" pattern:
   1. All data lives in a single `state` object
   2. When state changes, we call `render()` to update the DOM
   3. User interactions update state, then trigger a re-render

   This is the same mental model used by React, Vue, and every modern
   framework. Understanding it here makes learning frameworks much easier.

   File Sections:
   1. Constants & Configuration
   2. State
   3. API Functions (data fetching)
   4. Utility Functions (debounce, URL params)
   5. Render Functions (DOM updates)
   6. Event Handlers
   7. Initialization

   ========================================================================== */


/* --------------------------------------------------------------------------
   1. Constants & Configuration
   -------------------------------------------------------------------------- */

/** Base URL for all PokeAPI requests */
const API_BASE = 'https://pokeapi.co/api/v2'

/** Number of Pokemon to fetch per page */
const PAGE_SIZE = 24

/**
 * AbortController for the current fetch operation.
 * This lets us cancel in-flight requests if the user triggers a new one
 * before the previous one completes. Without this, a slow first request
 * could resolve AFTER a fast second request, overwriting fresh data
 * with stale data.
 */
let currentAbortController = null


/* --------------------------------------------------------------------------
   2. State
   --------------------------------------------------------------------------
   All application state lives in one object. This is the "single source
   of truth" -- we never store state in the DOM. When we need to know what
   Pokemon are loaded or what the user searched for, we look here, not at
   the HTML.
   -------------------------------------------------------------------------- */

const state = {
  /** All Pokemon we have fetched so far (grows with Load More) */
  allPokemon: [],

  /** The filtered/sorted subset currently being displayed */
  filteredPokemon: [],

  /** Total number of Pokemon available in the API */
  totalCount: 0,

  /** URL for the next page of results (null when no more pages) */
  nextPageUrl: null,

  /**
   * Current UI status. Determines what the user sees.
   * Values: 'idle' | 'loading' | 'error' | 'success' | 'loading-more'
   */
  status: 'idle',

  /** Error message to display when status is 'error' */
  errorMessage: '',

  /** Current search query (from the search input) */
  searchQuery: '',

  /** Current type filter value ('all' or a specific type like 'fire') */
  typeFilter: 'all',

  /** Current sort order: 'id-asc' (default), 'name-asc', or 'name-desc' */
  sortOrder: 'id-asc',
}


/* --------------------------------------------------------------------------
   3. API Functions
   --------------------------------------------------------------------------
   These functions handle all communication with the PokeAPI.
   They are pure data-fetching functions -- they do not touch the DOM.
   -------------------------------------------------------------------------- */

/**
 * Fetch a page of Pokemon from the PokeAPI list endpoint.
 *
 * The list endpoint returns minimal data (just name + URL), so we need
 * to make a second request for each Pokemon to get their full details.
 *
 * @param {number} limit - How many Pokemon to fetch
 * @param {number} offset - How many Pokemon to skip (for pagination)
 * @param {AbortSignal} [signal] - Optional AbortController signal for cancellation
 * @returns {Promise<Object>} Raw API response with count, next, previous, results
 */
async function fetchPokemonPage(limit = PAGE_SIZE, offset = 0, signal) {
  const url = `${API_BASE}/pokemon?limit=${limit}&offset=${offset}`
  const response = await fetch(url, { signal })

  /*
   * CRITICAL: fetch() does NOT throw an error for HTTP error responses
   * like 404 or 500. It only throws on network failures (no internet,
   * DNS failure, etc.).
   *
   * If you skip this check, your app will try to parse a 404 error page
   * as JSON and crash with a confusing error message.
   *
   * Always check response.ok (which is true for status 200-299).
   */
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`)
  }

  return response.json()
}


/**
 * Fetch detailed data for a single Pokemon.
 *
 * The detail endpoint has everything: sprites, types, stats, abilities, etc.
 * We extract only what we need to keep our state object lean.
 *
 * @param {string} url - The full URL to the Pokemon detail endpoint
 * @param {AbortSignal} [signal] - Optional AbortController signal
 * @returns {Promise<Object>} The full Pokemon detail object
 */
async function fetchPokemonDetail(url, signal) {
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Failed to fetch Pokemon detail: ${response.status}`)
  }

  return response.json()
}


/**
 * Fetch a page of Pokemon with full details.
 *
 * This is the main data-fetching function. It:
 * 1. Fetches the list page to get Pokemon names and detail URLs
 * 2. Fetches ALL detail pages in parallel using Promise.all
 * 3. Extracts only the fields we need into a clean object shape
 *
 * @param {number} limit - How many Pokemon to fetch
 * @param {number} offset - How many to skip
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<Object>} { pokemon: Array, totalCount: number, nextPageUrl: string|null }
 */
async function fetchPokemonWithDetails(limit = PAGE_SIZE, offset = 0, signal) {
  // Step 1: Get the list
  const listData = await fetchPokemonPage(limit, offset, signal)

  // Step 2: Fetch details for every Pokemon in the list, IN PARALLEL.
  //
  // Promise.all takes an array of promises and returns a single promise
  // that resolves when ALL of them resolve. This is much faster than
  // awaiting each one sequentially in a for loop:
  //
  //   Sequential (slow):  ----[fetch1]----[fetch2]----[fetch3]----  (3 seconds)
  //   Parallel (fast):    ----[fetch1]----
  //                       ----[fetch2]----                          (1 second)
  //                       ----[fetch3]----
  //
  // If ANY promise rejects, Promise.all rejects immediately.
  const detailPromises = listData.results.map(pokemon =>
    fetchPokemonDetail(pokemon.url, signal)
  )
  const details = await Promise.all(detailPromises)

  // Step 3: Transform the raw API data into the shape we want.
  // This is called "data normalization" -- we take messy API data
  // and make it clean and consistent for our app to use.
  const pokemon = details.map(raw => ({
    id: raw.id,
    name: raw.name,
    // Try to get the official artwork first; fall back to the basic sprite
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


/* --------------------------------------------------------------------------
   4. Utility Functions
   -------------------------------------------------------------------------- */

/**
 * Debounce: delays execution until the user stops triggering the function.
 *
 * HOW IT WORKS (mental model):
 * Imagine you have an egg timer that you reset every time you press a key.
 *   - You type "p" --> set a 300ms timer
 *   - You type "i" (100ms later) --> cancel old timer, set new 300ms timer
 *   - You type "k" (80ms later) --> cancel old timer, set new 300ms timer
 *   - You stop typing --> 300ms passes --> timer fires! --> function runs once
 *
 * WHY IT WORKS (the closure):
 * The variable `timerId` is declared in the outer function but used in the
 * inner function. This is a "closure" -- the inner function "closes over"
 * the outer variable, keeping it alive between calls. Each call to the
 * returned function can read and modify the SAME `timerId`, which is how
 * we can cancel the previous timer.
 *
 * @param {Function} fn - The function to debounce
 * @param {number} delay - Milliseconds to wait after the last call
 * @returns {Function} A debounced version of the function
 */
function debounce(fn, delay = 300) {
  let timerId = null

  return function debounced(...args) {
    // Cancel any previously scheduled call
    clearTimeout(timerId)

    // Schedule a new call after `delay` milliseconds
    timerId = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}


/**
 * Read filter/search state from the URL query parameters.
 *
 * This is called on page load so that if someone shares a URL like
 * ?q=pikachu&type=electric, the app starts with those filters active.
 *
 * Uses the URLSearchParams API -- a built-in browser API for working
 * with query strings. Much cleaner than parsing the URL string manually.
 */
function readStateFromURL() {
  const params = new URLSearchParams(window.location.search)

  state.searchQuery = params.get('q') ?? ''
  state.typeFilter = params.get('type') ?? 'all'
  state.sortOrder = params.get('sort') ?? 'id-asc'
}


/**
 * Write the current filter/search state to the URL query parameters.
 *
 * We use replaceState instead of pushState so the user's Back button
 * is not cluttered with every keystroke of their search.
 */
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

  window.history.replaceState(null, '', newURL)
}


/**
 * Extract all unique Pokemon types from the currently loaded data.
 * Used to populate the type filter dropdown.
 *
 * @returns {string[]} Sorted array of unique type names
 */
function getUniqueTypes() {
  // flatMap: maps each item to an array, then flattens all arrays into one.
  //   [{types:['fire','flying']}, {types:['water']}]
  //   --> flatMap --> ['fire', 'flying', 'water']
  const allTypes = state.allPokemon.flatMap(p => p.types)

  // new Set() removes duplicates, [...set] converts back to an array
  return [...new Set(allTypes)].sort()
}


/**
 * Apply search, type filter, and sort to the full Pokemon list.
 *
 * This is a "pipeline" pattern: data flows through a series of
 * transformations. Each step takes the output of the previous step
 * as its input.
 *
 * IMPORTANT: We create a copy with [...state.allPokemon] so we never
 * mutate the original data. If we sorted the original array, we could
 * never get back to the original order.
 */
function applyFiltersAndSort() {
  let result = [...state.allPokemon]

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


/* --------------------------------------------------------------------------
   5. Render Functions
   --------------------------------------------------------------------------
   These functions take the current state and produce HTML.
   They are the only functions that touch the DOM.
   -------------------------------------------------------------------------- */

/**
 * Main render function. Called whenever state changes.
 *
 * Reads state.status to determine which UI to show:
 *   - 'loading': spinner
 *   - 'error': error message with retry button
 *   - 'success': toolbar + pokemon grid + load more
 *   - 'loading-more': toolbar + pokemon grid + loading indicator at bottom
 */
function render() {
  const app = document.getElementById('app')

  switch (state.status) {
    case 'loading':
      // Set aria-busy so screen readers know content is loading
      app.setAttribute('aria-busy', 'true')
      app.innerHTML = `
        <div class="status-message" role="status">
          <div class="spinner" aria-hidden="true"></div>
          <p>Loading Pokemon...</p>
        </div>
      `
      break

    case 'error':
      app.setAttribute('aria-busy', 'false')
      app.innerHTML = `
        <div class="status-message" role="alert">
          <p class="error-text">${escapeHTML(state.errorMessage)}</p>
          <button class="btn btn--primary" id="retry-btn">
            Try Again
          </button>
        </div>
      `
      // Attach retry handler
      document.getElementById('retry-btn')
        ?.addEventListener('click', loadInitialData)
      break

    case 'success':
    case 'loading-more':
      app.setAttribute('aria-busy', state.status === 'loading-more' ? 'true' : 'false')
      app.innerHTML = buildSuccessHTML()
      attachToolbarListeners()
      restoreSearchFocus()
      break

    default:
      // 'idle' -- initial state, nothing to render
      break
  }
}


/**
 * Build the complete HTML for the success state.
 * Includes: toolbar, pokemon grid (or empty state), and load more button.
 *
 * @returns {string} Complete HTML string
 */
function buildSuccessHTML() {
  const toolbarHTML = buildToolbarHTML()
  const gridHTML = buildGridHTML()
  const loadMoreHTML = buildLoadMoreHTML()

  return `${toolbarHTML}${gridHTML}${loadMoreHTML}`
}


/**
 * Build the toolbar with search, filter, sort, and result count.
 *
 * Accessibility notes:
 * - Each input has an associated <label> (visually hidden for compact design)
 * - The result count uses aria-live="polite" so screen readers announce
 *   changes without interrupting the user
 * - aria-describedby links the search input to the result count
 *
 * @returns {string} Toolbar HTML
 */
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


/**
 * Build the Pokemon card grid, or an empty state message.
 *
 * Security note: We use escapeHTML() on any data that came from the API
 * before inserting it into innerHTML. This prevents XSS attacks if the
 * API ever returned malicious content. In practice the PokeAPI is safe,
 * but this is a habit you should always follow.
 *
 * @returns {string} Grid HTML or empty state HTML
 */
function buildGridHTML() {
  if (state.filteredPokemon.length === 0) {
    return `
      <div class="status-message" role="status" aria-live="polite">
        <p>No Pokemon match your current filters.</p>
        <button class="btn btn--secondary" id="clear-filters-btn" style="margin-top: 1rem;">
          Clear Filters
        </button>
      </div>
    `
  }

  const cardsHTML = state.filteredPokemon.map((pokemon, index) => {
    const typeBadges = pokemon.types.map(type =>
      `<span class="type-badge type-badge--${escapeHTML(type)}">${escapeHTML(type)}</span>`
    ).join('')

    // Stagger card animations -- each card appears slightly after the previous one.
    // We cap at 0.5s so that later cards do not take too long.
    const delay = Math.min(index * 0.03, 0.5)

    return `
      <li class="card" style="animation-delay: ${delay}s">
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


/**
 * Build the "Load More" button or "Loading more..." indicator.
 *
 * @returns {string} Load more section HTML
 */
function buildLoadMoreHTML() {
  // No more pages to load
  if (!state.nextPageUrl) {
    if (state.allPokemon.length > 0) {
      return `
        <div class="load-more-container">
          <p style="color: #999; font-size: 0.85rem;">
            All ${state.allPokemon.length} loaded Pokemon shown.
          </p>
        </div>
      `
    }
    return ''
  }

  // Currently loading more
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

  // Ready to load more
  return `
    <div class="load-more-container">
      <button class="btn btn--secondary" id="load-more-btn">
        Load More Pokemon
      </button>
    </div>
  `
}


/**
 * Escape HTML special characters to prevent XSS.
 *
 * When you insert data into innerHTML, any HTML in that data will be
 * parsed and executed. If the data contains <script>alert('hacked')</script>,
 * it will run. This function converts special characters to their safe
 * HTML entity equivalents.
 *
 * @param {string} str - The string to escape
 * @returns {string} The escaped string, safe for innerHTML
 */
function escapeHTML(str) {
  if (typeof str !== 'string') return ''
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}


/* --------------------------------------------------------------------------
   6. Event Handlers
   -------------------------------------------------------------------------- */

/**
 * Attach event listeners to toolbar controls.
 *
 * Because we rebuild the entire DOM on each render (via innerHTML),
 * we must re-attach event listeners each time. This is a trade-off:
 * innerHTML is simple but destroys event listeners. Frameworks like React
 * solve this with a virtual DOM that only updates what changed.
 */
function attachToolbarListeners() {
  const searchInput = document.getElementById('search-input')
  const typeFilter = document.getElementById('type-filter')
  const sortOrder = document.getElementById('sort-order')
  const loadMoreBtn = document.getElementById('load-more-btn')
  const clearFiltersBtn = document.getElementById('clear-filters-btn')

  // Search: debounced so we do not re-render on every keystroke
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleSearchInput, 300))
  }

  // Type filter: immediate response (no debounce needed for select changes)
  if (typeFilter) {
    typeFilter.addEventListener('change', handleTypeFilterChange)
  }

  // Sort order: immediate response
  if (sortOrder) {
    sortOrder.addEventListener('change', handleSortOrderChange)
  }

  // Load more
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', handleLoadMore)
  }

  // Clear filters
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', handleClearFilters)
  }
}


/**
 * Handle search input changes.
 *
 * @param {Event} event - The input event from the search field
 */
function handleSearchInput(event) {
  state.searchQuery = event.target.value
  writeStateToURL()
  applyFiltersAndSort()
  render()
}


/**
 * Handle type filter dropdown changes.
 *
 * @param {Event} event - The change event from the select element
 */
function handleTypeFilterChange(event) {
  state.typeFilter = event.target.value
  writeStateToURL()
  applyFiltersAndSort()
  render()
}


/**
 * Handle sort order dropdown changes.
 *
 * @param {Event} event - The change event from the select element
 */
function handleSortOrderChange(event) {
  state.sortOrder = event.target.value
  writeStateToURL()
  applyFiltersAndSort()
  render()
}


/**
 * Handle the "Load More" button click.
 *
 * Fetches the next page of Pokemon and appends them to the existing list.
 * The filters and sort are re-applied so new Pokemon appear in the correct
 * position.
 */
async function handleLoadMore() {
  if (!state.nextPageUrl || state.status === 'loading-more') return

  // Parse the next URL to get offset and limit values
  const nextURL = new URL(state.nextPageUrl)
  const offset = parseInt(nextURL.searchParams.get('offset'), 10)
  const limit = parseInt(nextURL.searchParams.get('limit'), 10) || PAGE_SIZE

  state.status = 'loading-more'
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
    // Ignore AbortError -- it means we deliberately cancelled
    if (error.name === 'AbortError') return

    state.status = 'error'
    state.errorMessage = error.message
    render()
  }
}


/**
 * Clear all filters and return to the default view.
 */
function handleClearFilters() {
  state.searchQuery = ''
  state.typeFilter = 'all'
  state.sortOrder = 'id-asc'
  writeStateToURL()
  applyFiltersAndSort()
  render()
}


/**
 * Restore focus to the search input after a re-render, if the user
 * was previously typing in it. Without this, each re-render would
 * move focus to the <body>, which is jarring.
 */
function restoreSearchFocus() {
  // Only restore focus if the user had been interacting with search
  if (!state.searchQuery) return

  const searchInput = document.getElementById('search-input')
  if (!searchInput) return

  // requestAnimationFrame ensures the DOM is painted before we focus
  requestAnimationFrame(() => {
    searchInput.focus()
    // Place the cursor at the end of the text
    const len = searchInput.value.length
    searchInput.setSelectionRange(len, len)
  })
}


/* --------------------------------------------------------------------------
   7. Initialization
   -------------------------------------------------------------------------- */

/**
 * Load the initial page of Pokemon data.
 *
 * This is the entry point for the app. It:
 * 1. Reads any filter state from the URL
 * 2. Sets status to 'loading' and renders the spinner
 * 3. Fetches the first page of Pokemon
 * 4. Applies any URL-provided filters
 * 5. Renders the result
 */
async function loadInitialData() {
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
    state.totalCount = data.totalCount
    state.nextPageUrl = data.nextPageUrl
    state.status = 'success'

    // Apply any filters that were read from the URL
    applyFiltersAndSort()
    render()
  } catch (error) {
    // Ignore AbortError -- it means we deliberately cancelled
    if (error.name === 'AbortError') return

    state.status = 'error'
    state.errorMessage = error.message
    render()
  }
}

// --- Start the app! ---

// Step 1: Read any saved state from the URL (e.g., ?q=pikachu&type=fire)
readStateFromURL()

// Step 2: Fetch data and render
loadInitialData()
