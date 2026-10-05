<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import { useAuthStore } from '@/stores/auth'

const session = useAuthStore()
const route = useRoute()
const loading = ref(false)
const error = ref<string | null>(null)

async function login(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const requestedRedirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    const redirect = requestedRedirect.startsWith('/') && !requestedRedirect.startsWith('//')
      ? requestedRedirect
      : '/'
    await session.login(false, new URL(redirect, window.location.origin).toString())
  } catch (loginError) {
    error.value = loginError instanceof Error ? loginError.message : 'No fue posible iniciar sesión'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-card">
      <div class="brand-mark">SR</div>
      <p class="eyebrow">SOLUCIONES RADICALES</p>
      <h1>Gestión MIP en un solo lugar</h1>
      <p class="intro">Programa servicios, coordina técnicos y conserva el histórico operativo con seguridad.</p>
      <BaseButton :loading="loading" @click="login">Continuar con Google</BaseButton>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <small>El acceso requiere una cuenta Google autorizada y activa.</small>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 1.25rem;
  background:
    radial-gradient(circle at 15% 20%, var(--accent-subtle), transparent 32rem),
    var(--background);
}

.auth-card {
  display: grid;
  width: min(30rem, 100%);
  gap: 1rem;
  border: 1px solid var(--border);
  border-radius: 1.25rem;
  background: var(--surface-raised);
  padding: clamp(1.5rem, 5vw, 2.75rem);
  box-shadow: var(--shadow-lg);
  text-align: center;
}

.brand-mark {
  display: grid;
  width: 64px;
  height: 64px;
  margin: 0 auto;
  place-items: center;
  border-radius: 18px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 1.35rem;
  font-weight: 850;
}

.eyebrow {
  margin: 0;
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

h1,
.intro {
  margin: 0;
}

.intro,
small {
  color: var(--text-secondary);
}

.error {
  margin: 0;
  border-radius: var(--radius);
  background: var(--danger-subtle);
  padding: 0.75rem;
  color: var(--danger);
}
</style>
