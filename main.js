import './style.css'
import Hls from 'hls.js'

const STORAGE_KEY = 'streamplay.connection'
const FAVORITES_KEY = 'streamplay.favorites'
const HISTORY_KEY = 'streamplay.history'
const IMPORTED_KEY = 'streamplay.imported'
const THEME_KEY = 'streamplay.dark'

let connection = loadJson(STORAGE_KEY, null)
let channels = []
let categories = []
let favorites = loadJson(FAVORITES_KEY, [])
let history = loadJson(HISTORY_KEY, [])
let darkMode = localStorage.getItem(THEME_KEY) === 'true'
let hls = null
let currentChannel = null

const app = document.getElementById('app')

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]))
}

function normalizeServerUrl(value) {
  let url = String(value || '').trim()

  if (!url) return ''

  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`
  }

  return url.replace(/\/+$/, '')
}

function buildApiUrl(action = '', params = {}) {
  if (!connection) return ''

  const url = new URL(`${connection.server}/player_api.php`)

  url.searchParams.set('username', connection.username)
  url.searchParams.set('password', connection.password)

  if (action) {
    url.searchParams.set('action', action)
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  })

  return url.toString()
}

async function apiRequest(action = '', params = {}) {
  const response = await fetch(buildApiUrl(action, params), {
    cache: 'no-store'
  })

  if (!response.ok) {
    throw new Error(`Servidor respondeu ${response.status}`)
  }

  return response.json()
}

/* =========================
   LOGIN
========================= */

function renderLogin(error = '') {
  stopPlayer()

  app.innerHTML = `
    <div class="streamplay ${darkMode ? 'dark' : 'light'}">

      <div
        class="container"
        style="
          max-width:620px;
          margin:auto;
          min-height:100vh;
          display:flex;
          align-items:center;
        "
      >

        <div
          class="setting-item"
          style="
            width:100%;
            box-sizing:border-box;
          "
        >

          <div style="text-align:center;margin-bottom:25px">

            <div style="font-size:60px">
              🎬
            </div>

            <h1 style="color:var(--primary)">
              StreamPlay IPTV
            </h1>

            <p>
              Entre com os dados da sua assinatura
            </p>

          </div>

          ${
            error
              ? `
                <div
                  style="
                    background:#fee2e2;
                    color:#991b1b;
                    padding:12px;
                    border-radius:8px;
                    margin-bottom:15px;
                  "
                >
                  ${escapeHtml(error)}
                </div>
              `
              : ''
          }

          <form id="login-form">

            <label>
              URL do servidor
            </label>

            <input
              id="server"
              class="setting-input"
              type="text"
              placeholder="http://servidor:porta"
              autocomplete="url"
              required
            >

            <label>
              Usuário
            </label>

            <input
              id="username"
              class="setting-input"
              type="text"
              placeholder="Seu usuário"
              autocomplete="username"
              required
            >

            <label>
              Senha
            </label>

            <input
              id="password"
              class="setting-input"
              type="password"
              placeholder="Sua senha"
              autocomplete="current-password"
              required
            >

            <button
              class="btn btn-primary"
              type="submit"
              style="width:100%;margin-top:15px"
            >
              🔐 Entrar
            </button>

          </form>

          <div style="text-align:center;margin-top:20px">

            <button
              id="theme-login"
              class="theme-btn"
              type="button"
            >
              ${darkMode ? '☀️' : '🌙'}
            </button>

          </div>

        </div>

      </div>

    </div>
  `

  document
    .getElementById('login-form')
    .addEventListener('submit', login)

  document
    .getElementById('theme-login')
    .addEventListener('click', toggleTheme)

  if (connection) {
    document.getElementById('server').value = connection.server
    document.getElementById('username').value = connection.username
  }
}

async function login(event) {
  event.preventDefault()

  const button = event.currentTarget.querySelector(
    'button[type="submit"]'
  )

  button.disabled = true
  button.textContent = '⏳ Conectando...'

  const candidate = {
    server: normalizeServerUrl(
      document.getElementById('server').value
    ),

    username:
      document.getElementById('username').value.trim(),

    password:
      document.getElementById('password').value
  }

  if (
    !candidate.server ||
    !candidate.username ||
    !candidate.password
  ) {
    renderLogin('Preencha URL, usuário e senha.')
    return
  }

  connection = candidate

  try {

    const data = await apiRequest()

    if (!data || !data.user_info) {
      throw new Error(
        'O servidor não retornou uma resposta válida.'
      )
    }

    const status =
      String(data.user_info.status || '').toLowerCase()

    if (
      status &&
      !['active', 'enabled'].includes(status)
    ) {
      throw new Error(
        `A conta está com status: ${data.user_info.status}.`
      )
    }

    saveJson(STORAGE_KEY, connection)

    await loadPortal()

  } catch (error) {

    connection = null

    localStorage.removeItem(STORAGE_KEY)

    renderLogin(
      `Não foi possível conectar. ${
        error.message ||
        'Verifique URL, usuário e senha.'
      }`
    )
  }
}

/* =========================
   CARREGAR CONTA
========================= */

async function loadPortal() {

  renderLoading('Carregando sua lista...')

  try {

    const [
      liveCategories,
      liveChannels
    ] = await Promise.all([

      apiRequest('get_live_categories'),

      apiRequest('get_live_streams')

    ])

    categories =
      Array.isArray(liveCategories)
        ? liveCategories
        : []

    channels =
      Array.isArray(liveChannels)
        ? liveChannels.map(normalizeChannel)
        : []

    const imported =
      loadJson(IMPORTED_KEY, [])

    if (Array.isArray(imported)) {
      channels = [
        ...channels,
        ...imported
      ]
    }

    renderApp()

  } catch (error) {

    renderLogin(
      `Login realizado, mas não consegui carregar os canais. ${
        error.message || ''
      }`
    )
  }
}

function normalizeChannel(item) {

  const id =
    Number(item.stream_id ?? item.id)

  const extension =
    item.container_extension || 'm3u8'

  return {

    id:
      Number.isFinite(id)
        ? id
        : `channel-${Math.random()}`,

    name:
      item.name || 'Canal sem nome',

    category:
      item.category_name ||
      findCategoryName(item.category_id) ||
      'Sem categoria',

    categoryId:
      String(item.category_id ?? ''),

    logo:
      item.stream_icon || '',

    url:
      `${connection.server}/live/` +
      `${encodeURIComponent(connection.username)}/` +
      `${encodeURIComponent(connection.password)}/` +
      `${encodeURIComponent(id)}.${extension}`
  }
}

function findCategoryName(id) {

  const category =
    categories.find(
      item =>
        String(item.category_id) === String(id)
    )

  return category?.category_name || ''
}

function renderLoading(message) {

  app.innerHTML = `
    <div class="streamplay ${darkMode ? 'dark' : 'light'}">

      <div class="container">

        <p class="empty-message">
          ⏳ ${escapeHtml(message)}
        </p>

      </div>

    </div>
  `
}

/* =========================
   APLICAÇÃO
========================= */

function renderApp() {

  app.innerHTML = `

    <div class="streamplay ${darkMode ? 'dark' : 'light'}">

      <nav class="navbar">

        <div class="navbar-container">

          <div class="navbar-brand">

            <span class="logo">
              🎬 StreamPlay IPTV
            </span>

          </div>

          <div class="navbar-menu">

            <button
              id="btn-home"
              class="nav-btn active"
            >
              🏠 Início
            </button>

            <button
              id="btn-favorites"
              class="nav-btn"
            >
              ⭐ Favoritos
            </button>

            <button
              id="btn-history"
              class="nav-btn"
            >
              📺 Histórico
            </button>

            <button
              id="btn-settings"
              class="nav-btn"
            >
              ⚙️ Configurações
            </button>

          </div>

          <button
            id="btn-theme"
            class="theme-btn"
          >
            ${darkMode ? '☀️' : '🌙'}
          </button>

        </div>

      </nav>

      <div class="container">

        <section
          id="home-section"
          class="section active"
        >

          <div class="player-container">

            <div
              id="player"
              class="video-player"
            >
              <span>
                ▶️
              </span>
            </div>

            <div class="player-info">

              <h2 id="current-channel">
                Selecione um canal
              </h2>

              <p id="current-category">
                -
              </p>

            </div>

          </div>

          <div class="search-box">

            <input
              id="search-input"
              class="search-input"
              type="search"
              placeholder="🔍 Buscar canal..."
            >

            <select
              id="category-filter"
              class="category-filter"
            >

              <option value="">
                Todas as categorias
              </option>

              ${categories.map(category => `

                <option
                  value="${escapeHtml(category.category_id)}"
                >
                  ${escapeHtml(category.category_name)}
                </option>

              `).join('')}

            </select>

          </div>

          <div
            class="channels-grid"
            id="channels-grid"
          ></div>

        </section>

        <section
          id="favorites-section"
          class="section"
        >

          <h2>
            ⭐ Meus Favoritos
          </h2>

          <div
            class="channels-grid"
            id="favorites-grid"
          ></div>

        </section>

        <section
          id="history-section"
          class="section"
        >

          <h2>
            📺 Histórico de Visualizações
          </h2>

          <div
            class="history-list"
            id="history-list"
          ></div>

        </section>

        <section
          id="settings-section"
          class="section"
        >

          <h2>
            ⚙️ Configurações
          </h2>

          <div class="settings-container">

            <div class="setting-item">

              <h3>
                Conta conectada
              </h3>

              <p>
                ${escapeHtml(connection.username)}
              </p>

              <p
                style="
                  word-break:break-all;
                  opacity:.7;
                "
              >
                ${escapeHtml(connection.server)}
              </p>

              <button
                id="logout"
                class="btn btn-danger"
              >
                🚪 Sair da conta
              </button>

            </div>

            <div class="setting-item">

              <h3>
                Playlist M3U local
              </h3>

              <input
                type="file"
                id="m3u-file"
                accept=".m3u,.m3u8"
                class="setting-input"
              >

              <button
                id="btn-import-m3u"
                class="btn btn-primary"
              >
                📥 Importar M3U
              </button>

            </div>

            <div class="setting-item">

              <h3>
                Dados locais
              </h3>

              <button
                id="btn-clear-favorites"
                class="btn btn-danger"
              >
                🗑️ Limpar Favoritos
              </button>

              <button
                id="btn-clear-history"
                class="btn btn-danger"
              >
                🗑️ Limpar Histórico
              </button>

            </div>

            <div class="setting-item">

              <p class="version">
                StreamPlay IPTV v2.0
              </p>

            </div>

          </div>

        </section>

      </div>

    </div>
  `

  bindEvents()

  renderChannels()
}

function bindEvents() {

  document.getElementById('btn-home').onclick =
    () => switchSection(
      'home',
      document.getElementById('btn-home')
    )

  document.getElementById('btn-favorites').onclick =
    () => switchSection(
      'favorites',
      document.getElementById('btn-favorites')
    )

  document.getElementById('btn-history').onclick =
    () => switchSection(
      'history',
      document.getElementById('btn-history')
    )

  document.getElementById('btn-settings').onclick =
    () => switchSection(
      'settings',
      document.getElementById('btn-settings')
    )

  document.getElementById('btn-theme').onclick =
    toggleTheme

  document.getElementById('search-input').oninput =
    renderChannels

  document.getElementById('category-filter').onchange =
    renderChannels

  document.getElementById('btn-import-m3u').onclick =
    importM3U

  document.getElementById('btn-clear-favorites').onclick =
    clearFavorites

  document.getElementById('btn-clear-history').onclick =
    clearHistory

  document.getElementById('logout').onclick =
    logout
}

/* =========================
   NAVEGAÇÃO
========================= */

function switchSection(section, button) {

  document
    .querySelectorAll('.section')
    .forEach(sectionElement =>
      sectionElement.classList.remove('active')
    )

  const target =
    document.getElementById(
      `${section}-section`
    )

  if (target) {
    target.classList.add('active')
  }

  document
    .querySelectorAll('.nav-btn')
    .forEach(btn =>
      btn.classList.remove('active')
    )

  if (button) {
    button.classList.add('active')
  }

  if (section === 'favorites') {
    renderFavorites()
  }

  if (section === 'history') {
    renderHistory()
  }
}

/* =========================
   CANAIS
========================= */

function channelCard(channel) {

  const favorite =
    favorites.includes(channel.id)

  const logo =
    channel.logo
      ? `
        <img
          src="${escapeHtml(channel.logo)}"
          alt=""
          loading="lazy"
          style="
            width:56px;
            height:56px;
            object-fit:contain;
            border-radius:8px;
          "
        >
      `
      : `
        <div style="font-size:2rem">
          📺
        </div>
      `

  return `

    <div class="channel-card">

      <div class="channel-header">

        <div
          style="
            display:flex;
            align-items:center;
            gap:.75rem;
            min-width:0;
          "
        >

          ${logo}

          <h3>
            ${escapeHtml(channel.name)}
          </h3>

        </div>

        <button
          class="favorite-btn ${favorite ? 'active' : ''}"
          data-favorite="${channel.id}"
        >
          ${favorite ? '⭐' : '☆'}
        </button>

      </div>

      <p class="channel-category">
        ${escapeHtml(channel.category)}
      </p>

      <button
        class="btn btn-play"
        data-play="${channel.id}"
      >
        ▶️ Assistir
      </button>

    </div>
  `
}

function renderChannels() {

  const grid =
    document.getElementById('channels-grid')

  if (!grid) return

  const search =
    document
      .getElementById('search-input')
      ?.value
      .trim()
      .toLowerCase() || ''

  const category =
    document
      .getElementById('category-filter')
      ?.value || ''

  const filtered =
    channels.filter(channel => {

      const matchesSearch =
        !search ||
        channel.name
          .toLowerCase()
          .includes(search)

      const matchesCategory =
        !category ||
        channel.categoryId === category

      return (
        matchesSearch &&
        matchesCategory
      )
    })

  grid.innerHTML =
    filtered.length
      ? filtered.map(channelCard).join('')
      : `
        <p class="empty-message">
          Nenhum canal encontrado.
        </p>
      `

  bindChannelButtons(grid)
}

function bindChannelButtons(container) {

  container
    .querySelectorAll('[data-play]')
    .forEach(button => {

      button.onclick =
        () =>
          playChannel(
            button.dataset.play
          )

    })

  container
    .querySelectorAll('[data-favorite]')
    .forEach(button => {

      button.onclick =
        () =>
          toggleFavorite(
            button.dataset.favorite
          )

    })
}

/* =========================
   FAVORITOS
========================= */

function renderFavorites() {

  const grid =
    document.getElementById(
      'favorites-grid'
    )

  if (!grid) return

  const items =
    channels.filter(channel =>
      favorites.some(
        favorite =>
          String(favorite) ===
          String(channel.id)
      )
    )

  grid.innerHTML =
    items.length
      ? items.map(channelCard).join('')
      : `
        <p class="empty-message">
          Nenhum favorito ainda! ⭐
        </p>
      `

  bindChannelButtons(grid)
}

function toggleFavorite(id) {

  const normalized =
    String(id)

  const exists =
    favorites.some(
      favorite =>
        String(favorite) === normalized
    )

  if (exists) {

    favorites =
      favorites.filter(
        favorite =>
          String(favorite) !== normalized
      )

  } else {

    favorites.push(id)

  }

  saveJson(
    FAVORITES_KEY,
    favorites
  )

  renderChannels()
  renderFavorites()
}

/* =========================
   HISTÓRICO
========================= */

function renderHistory() {

  const list =
    document.getElementById(
      'history-list'
    )

  if (!list) return

  const items =
    [...history]
      .sort(
        (a, b) =>
          new Date(b.timestamp) -
          new Date(a.timestamp)
      )

  list.innerHTML =
    items.length
      ? items.map(item => `

        <div class="history-item">

          <div class="history-info">

            <h4>
              ${escapeHtml(item.name)}
            </h4>

            <p>
              ${new Date(
                item.timestamp
              ).toLocaleString('pt-BR')}
            </p>

          </div>

          <button
            class="btn btn-small"
            data-history-play="${item.id}"
          >
            ▶️ Assistir
          </button>

        </div>

      `).join('')
      : `
        <p class="empty-message">
          Nenhum histórico ainda! 📺
        </p>
      `

  list
    .querySelectorAll('[data-history-play]')
    .forEach(button => {

      button.onclick =
        () =>
          playChannel(
            button.dataset.historyPlay
          )

    })
}

/* =========================
   PLAYER
========================= */

function playChannel(id) {

  const channel =
    channels.find(
      item =>
        String(item.id) === String(id)
    )

  if (!channel) return

  currentChannel = channel

  const title =
    document.getElementById(
      'current-channel'
    )

  const category =
    document.getElementById(
      'current-category'
    )

  const player =
    document.getElementById('player')

  if (!title || !category || !player) {
    return
  }

  title.textContent =
    channel.name

  category.textContent =
    `📂 ${channel.category}`

  player.innerHTML = `
    <video
      id="hls-video"
      controls
      playsinline
      autoplay
      style="
        width:100%;
        height:100%;
        background:#000;
      "
    ></video>
  `

  const video =
    document.getElementById(
      'hls-video'
    )

  stopHls()

  if (Hls.isSupported()) {

    hls =
      new Hls({
        enableWorker: true
      })

    hls.on(
      Hls.Events.ERROR,
      (_event, data) => {

        if (!data?.fatal) return

        if (
          data.type ===
          Hls.ErrorTypes.NETWORK_ERROR
        ) {

          title.textContent =
            `${channel.name} — Erro de conexão`

        } else {

          title.textContent =
            `${channel.name} — Erro na reprodução`

        }

        stopHls()
      }
    )

    hls.loadSource(channel.url)

    hls.attachMedia(video)

  } else if (
    video.canPlayType(
      'application/vnd.apple.mpegurl'
    )
  ) {

    video.src =
      channel.url

  } else {

    title.textContent =
      'Seu navegador não suporta HLS.'
  }

  history =
    history.filter(
      item =>
        String(item.id) !==
        String(channel.id)
    )

  history.push({
    id: channel.id,
    name: channel.name,
    timestamp:
      new Date().toISOString()
  })

  history =
    history.slice(-50)

  saveJson(
    HISTORY_KEY,
    history
  )
}

function stopHls() {

  if (hls) {

    hls.destroy()

    hls = null
  }
}

function stopPlayer() {

  stopHls()

  const video =
    document.getElementById(
      'hls-video'
    )

  if (video) {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
}

/* =========================
   M3U
========================= */

function importM3U() {

  const file =
    document.getElementById(
      'm3u-file'
    )?.files?.[0]

  if (!file) {

    alert(
      'Selecione um arquivo M3U ou M3U8.'
    )

    return
  }

  const reader =
    new FileReader()

  reader.onload =
    event => {

      const lines =
        String(
          event.target.result || ''
        ).split(/\r?\n/)

      const imported = []

      for (
        let i = 0;
        i < lines.length;
        i++
      ) {

        const line =
          lines[i].trim()

        if (
          !line.startsWith('#EXTINF')
        ) {
          continue
        }

        const url =
          lines[i + 1]?.trim()

        if (
          !/^https?:\/\//i.test(
            url || ''
          )
        ) {
          continue
        }

        const name =
          line
            .split(',')
            .slice(1)
            .join(',')
            .trim() ||
          'Canal'

        const groupMatch =
          line.match(
            /group-title="([^"]*)"/i
          )

        imported.push({

          id:
            `m3u-${Date.now()}-${i}`,

          name,

          category:
            groupMatch?.[1] ||
            'Importado',

          categoryId:
            `m3u-${i}`,

          logo: '',

          url

        })
      }

      saveJson(
        IMPORTED_KEY,
        imported
      )

      channels =
        channels.filter(
          channel =>
            !String(channel.id)
              .startsWith('m3u-')
        )

      channels = [
        ...channels,
        ...imported
      ]

      renderChannels()

      alert(
        `✅ ${imported.length} canal(is) importado(s).`
      )
    }

  reader.readAsText(file)
}

/* =========================
   CONFIGURAÇÕES
========================= */

function clearFavorites() {

  if (
    !confirm(
      'Tem certeza que quer limpar todos os favoritos?'
    )
  ) {
    return
  }

  favorites = []

  saveJson(
    FAVORITES_KEY,
    favorites
  )

  renderChannels()
  renderFavorites()
}

function clearHistory() {

  if (
    !confirm(
      'Tem certeza que quer limpar o histórico?'
    )
  ) {
    return
  }

  history = []

  saveJson(
    HISTORY_KEY,
    history
  )

  renderHistory()
}

function logout() {

  if (
    !confirm(
      'Sair desta conta? Os favoritos e o histórico permanecerão neste aparelho.'
    )
  ) {
    return
  }

  stopPlayer()

  connection = null
  channels = []
  categories = []
  currentChannel = null

  localStorage.removeItem(
    STORAGE_KEY
  )

  renderLogin()
}

function toggleTheme() {

  darkMode = !darkMode

  localStorage.setItem(
    THEME_KEY,
    String(darkMode)
  )

  if (connection) {
    renderApp()
  } else {
    renderLogin()
  }
}

/* =========================
   INICIALIZAÇÃO
========================= */

async function init() {

  if (!connection) {

    renderLogin()

    return
  }

  await loadPortal()
}

init()

console.log(
  '🎬 StreamPlay IPTV iniciado!'
)
