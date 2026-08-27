import './style.css'
import { createClient } from '@supabase/supabase-js'
import Hls from 'hls.js'

// ============ CONFIGURAÇÃO SUPABASE ============
const SUPABASE_URL = 'https://sua-url.supabase.co' // Altere para sua URL
const SUPABASE_KEY = 'sua-anon-key' // Altere para sua chave
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ============ ESTADO GLOBAL ============
let currentUser = null
let currentChannel = null
let hls = null
let channels = [
  { id: 1, name: '🎬 HBO', url: 'https://exemplo.com/hbo.m3u8', category: 'Cinema' },
  { id: 2, name: '⚽ ESPN', url: 'https://exemplo.com/espn.m3u8', category: 'Esportes' },
  { id: 3, name: '🎭 Globo', url: 'https://exemplo.com/globo.m3u8', category: 'Geral' },
  { id: 4, name: '🎪 Discovery', url: 'https://exemplo.com/discovery.m3u8', category: 'Documentário' },
  { id: 5, name: '🎮 Cartoon', url: 'https://exemplo.com/cartoon.m3u8', category: 'Infantil' }
]
let favorites = JSON.parse(localStorage.getItem('favorites')) || []
let history = JSON.parse(localStorage.getItem('history')) || []
let darkMode = localStorage.getItem('darkMode') === 'true'

// ============ DOM ELEMENTS ============
const app = document.getElementById('app')

// ============ RENDERIZAR APP ============
function render() {
  app.innerHTML = `
    <div class="streamplay ${darkMode ? 'dark' : 'light'}">
      <!-- NAVBAR -->
      <nav class="navbar">
        <div class="navbar-container">
          <div class="navbar-brand">
            <span class="logo">🎬 StreamPlay IPTV</span>
          </div>
          <div class="navbar-menu">
            <button id="btn-home" class="nav-btn active">🏠 Início</button>
            <button id="btn-favorites" class="nav-btn">⭐ Favoritos</button>
            <button id="btn-history" class="nav-btn">📺 Histórico</button>
            <button id="btn-settings" class="nav-btn">⚙️ Configurações</button>
          </div>
          <button id="btn-theme" class="theme-btn">${darkMode ? '☀️' : '🌙'}</button>
        </div>
      </navbar>

      <!-- CONTEÚDO PRINCIPAL -->
      <div class="container">
        <!-- SEÇÃO INICIAL -->
        <section id="home-section" class="section active">
          <!-- PLAYER -->
          <div class="player-container">
            <div id="player" class="video-player"></div>
            <div class="player-info">
              <h2 id="current-channel">Selecione um canal</h2>
              <p id="current-category">-</p>
            </div>
          </div>

          <!-- BUSCA E FILTROS -->
          <div class="search-box">
            <input type="text" id="search-input" placeholder="🔍 Buscar canal..." class="search-input">
            <select id="category-filter" class="category-filter">
              <option value="">Todas as categorias</option>
              <option value="Cinema">🎬 Cinema</option>
              <option value="Esportes">⚽ Esportes</option>
              <option value="Geral">📺 Geral</option>
              <option value="Documentário">📚 Documentário</option>
              <option value="Infantil">🎮 Infantil</option>
            </select>
          </div>

          <!-- LISTA DE CANAIS -->
          <div class="channels-grid" id="channels-grid"></div>
        </section>

        <!-- SEÇÃO FAVORITOS -->
        <section id="favorites-section" class="section">
          <h2>⭐ Meus Favoritos</h2>
          <div class="channels-grid" id="favorites-grid"></div>
        </section>

        <!-- SEÇÃO HISTÓRICO -->
        <section id="history-section" class="section">
          <h2>📺 Histórico de Visualizações</h2>
          <div class="history-list" id="history-list"></div>
        </section>

        <!-- SEÇÃO CONFIGURAÇÕES -->
        <section id="settings-section" class="section">
          <h2>⚙️ Configurações</h2>
          <div class="settings-container">
            <div class="setting-item">
              <h3>Supabase URL</h3>
              <input type="text" id="supabase-url" placeholder="URL do Supabase" class="setting-input">
            </div>
            <div class="setting-item">
              <h3>Supabase Key</h3>
              <input type="password" id="supabase-key" placeholder="Chave Anon do Supabase" class="setting-input">
            </div>
            <div class="setting-item">
              <h3>Importar M3U</h3>
              <input type="file" id="m3u-file" accept=".m3u,.m3u8" class="setting-input">
              <button id="btn-import-m3u" class="btn btn-primary">📥 Importar</button>
            </div>
            <div class="setting-item">
              <h3>Limpar Dados</h3>
              <button id="btn-clear-favorites" class="btn btn-danger">🗑️ Limpar Favoritos</button>
              <button id="btn-clear-history" class="btn btn-danger">🗑️ Limpar Histórico</button>
            </div>
            <div class="setting-item">
              <p class="version">StreamPlay IPTV v2.0 | Desenvolvido com ❤️</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  `

  // ============ EVENT LISTENERS ============
  document.getElementById('btn-home').addEventListener('click', () => switchSection('home'))
  document.getElementById('btn-favorites').addEventListener('click', () => switchSection('favorites'))
  document.getElementById('btn-history').addEventListener('click', () => switchSection('history'))
  document.getElementById('btn-settings').addEventListener('click', () => switchSection('settings'))
  document.getElementById('btn-theme').addEventListener('click', toggleTheme)

  document.getElementById('search-input').addEventListener('input', filterChannels)
  document.getElementById('category-filter').addEventListener('change', filterChannels)

  document.getElementById('btn-import-m3u').addEventListener('click', importM3U)
  document.getElementById('btn-clear-favorites').addEventListener('click', clearFavorites)
  document.getElementById('btn-clear-history').addEventListener('click', clearHistory)

  renderChannels()
}

// ============ FUNÇÕES ============
function switchSection(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'))
  document.getElementById(section + '-section').classList.add('active')

  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'))
  event.target.classList.add('active')

  if (section === 'favorites') renderFavorites()
  if (section === 'history') renderHistory()
}

function toggleTheme() {
  darkMode = !darkMode
  localStorage.setItem('darkMode', darkMode)
  document.getElementById('btn-theme').textContent = darkMode ? '☀️' : '🌙'
  document.querySelector('.streamplay').classList.toggle('dark')
}

function renderChannels() {
  const grid = document.getElementById('channels-grid')
  grid.innerHTML = channels.map(channel => `
    <div class="channel-card">
      <div class="channel-header">
        <h3>${channel.name}</h3>
        <button class="favorite-btn ${favorites.includes(channel.id) ? 'active' : ''}" 
                onclick="toggleFavorite(${channel.id})">
          ${favorites.includes(channel.id) ? '⭐' : '☆'}
        </button>
      </div>
      <p class="channel-category">${channel.category}</p>
      <button class="btn btn-play" onclick="playChannel(${channel.id})">▶️ Assistir</button>
    </div>
  `).join('')
}

function renderFavorites() {
  const grid = document.getElementById('favorites-grid')
  const favChannels = channels.filter(c => favorites.includes(c.id))
  
  if (favChannels.length === 0) {
    grid.innerHTML = '<p class="empty-message">Nenhum favorito ainda! ⭐</p>'
    return
  }

  grid.innerHTML = favChannels.map(channel => `
    <div class="channel-card">
      <div class="channel-header">
        <h3>${channel.name}</h3>
        <button class="favorite-btn active" onclick="toggleFavorite(${channel.id})">⭐</button>
      </div>
      <p class="channel-category">${channel.category}</p>
      <button class="btn btn-play" onclick="playChannel(${channel.id})">▶️ Assistir</button>
    </div>
  `).join('')
}

function renderHistory() {
  const list = document.getElementById('history-list')
  
  if (history.length === 0) {
    list.innerHTML = '<p class="empty-message">Nenhum histórico ainda! 📺</p>'
    return
  }

  list.innerHTML = history.reverse().map(item => `
    <div class="history-item">
      <div class="history-info">
        <h4>${item.name}</h4>
        <p>${new Date(item.timestamp).toLocaleString('pt-BR')}</p>
      </div>
      <button class="btn btn-small" onclick="playChannel(${item.id})">▶️ Assistir</button>
    </div>
  `).join('')
}

function filterChannels() {
  const search = document.getElementById('search-input').value.toLowerCase()
  const category = document.getElementById('category-filter').value

  const filtered = channels.filter(c => 
    c.name.toLowerCase().includes(search) &&
    (category === '' || c.category === category)
  )

  const grid = document.getElementById('channels-grid')
  grid.innerHTML = filtered.map(channel => `
    <div class="channel-card">
      <div class="channel-header">
        <h3>${channel.name}</h3>
        <button class="favorite-btn ${favorites.includes(channel.id) ? 'active' : ''}" 
                onclick="toggleFavorite(${channel.id})">
          ${favorites.includes(channel.id) ? '⭐' : '☆'}
        </button>
      </div>
      <p class="channel-category">${channel.category}</p>
      <button class="btn btn-play" onclick="playChannel(${channel.id})">▶️ Assistir</button>
    </div>
  `).join('')
}

function playChannel(channelId) {
  const channel = channels.find(c => c.id === channelId)
  if (!channel) return

  currentChannel = channel
  document.getElementById('current-channel').textContent = channel.name
  document.getElementById('current-category').textContent = `📂 ${channel.category}`

  // Adicionar ao histórico
  const now = new Date().toISOString()
  history = history.filter(h => h.id !== channelId)
  history.push({ id: channelId, name: channel.name, timestamp: now })
  localStorage.setItem('history', JSON.stringify(history))

  // Reproduzir com HLS.js
  const video = document.getElementById('player')
  if (!video.querySelector('video')) {
    video.innerHTML = '<video id="hls-video" width="100%" height="100%" controls></video>'
  }

  const videoElement = document.getElementById('hls-video')
  
  if (Hls.isSupported()) {
    if (hls) hls.destroy()
    hls = new Hls()
    hls.loadSource(channel.url)
    hls.attachMedia(videoElement)
  } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
    videoElement.src = channel.url
  }
}

function toggleFavorite(channelId) {
  const index = favorites.indexOf(channelId)
  if (index > -1) {
    favorites.splice(index, 1)
  } else {
    favorites.push(channelId)
  }
  localStorage.setItem('favorites', JSON.stringify(favorites))
  renderChannels()
}

function importM3U() {
  const file = document.getElementById('m3u-file').files[0]
  if (!file) {
    alert('Selecione um arquivo M3U!')
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target.result
    const lines = content.split('\n')
    
    lines.forEach((line, i) => {
      if (line.includes('#EXTINF')) {
        const name = line.split(',')[1]?.trim() || 'Canal'
        const url = lines[i + 1]?.trim()
        if (url && url.startsWith('http')) {
          channels.push({
            id: channels.length + 1,
            name: name,
            url: url,
            category: 'Importado'
          })
        }
      }
    })

    localStorage.setItem('channels', JSON.stringify(channels))
    renderChannels()
    alert('✅ M3U importado com sucesso!')
  }

  reader.readAsText(file)
}

function clearFavorites() {
  if (confirm('Tem certeza que quer limpar todos os favoritos?')) {
    favorites = []
    localStorage.setItem('favorites', JSON.stringify(favorites))
    renderChannels()
    alert('✅ Favoritos limpos!')
  }
}

function clearHistory() {
  if (confirm('Tem certeza que quer limpar o histórico?')) {
    history = []
    localStorage.setItem('history', JSON.stringify(history))
    alert('✅ Histórico limpo!')
  }
}

// ============ INICIALIZAR ============
if (darkMode) {
  document.documentElement.style.colorScheme = 'dark'
}

render()
console.log('🎬 StreamPlay IPTV iniciado!')
