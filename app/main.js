import { createClient } from '@supabase/supabase-js'
import Hls from 'hls.js'

const SUPABASE_URL = 'COLOQUE_SUA_URL_DO_SUPABASE'
const SUPABASE_ANON_KEY = 'COLOQUE_SUA_ANON_KEY_DO_SUPABASE'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const app = document.getElementById('app')

app.innerHTML = `
  <div class="app">
    <h1>StreamPlay IPTV</h1>
    <p>Carregando...</p>
  </div>
`

async function loadData() {
  const { data, error } = await supabase
    .from('playlists')
    .select('*')

  if (error) {
    console.error(error)
    app.innerHTML = `
      <div class="app">
        <h1>StreamPlay IPTV</h1>
        <p>Erro ao carregar os dados.</p>
      </div>
    `
    return
  }

  console.log('Playlists:', data)

  app.innerHTML = `
    <div class="app">
      <h1>StreamPlay IPTV</h1>
      <p>Aplicativo carregado com sucesso!</p>
    </div>
  `
}

loadData()
