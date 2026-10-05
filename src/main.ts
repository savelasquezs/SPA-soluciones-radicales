import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import './assets/theme.css'

const savedTheme = localStorage.getItem('theme')
if (savedTheme === 'light' || savedTheme === 'dark') {
  document.documentElement.dataset.theme = savedTheme
}

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
