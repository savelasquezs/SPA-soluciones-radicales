import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { handleVitePreloadError } from './helpers/staleChunkRecovery'
import router from './router'
import { useAppStore } from './stores/app'
import './assets/theme.css'

const app = createApp(App)
const pinia = createPinia()

window.addEventListener('vite:preloadError', handleVitePreloadError)

app.use(pinia)
app.use(router)

useAppStore(pinia).initializeTheme()

app.mount('#app')
