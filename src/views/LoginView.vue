<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import { useAuthStore } from '@/stores/auth'

const session = useAuthStore()
const route = useRoute()
const loading = ref(false)
const error = ref<string | null>(null)

async function login(selectAccount = false): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const requestedRedirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    const redirect = requestedRedirect.startsWith('/') && !requestedRedirect.startsWith('//')
      ? requestedRedirect
      : '/'
    await session.login(selectAccount, new URL(redirect, window.location.origin).toString())
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
      <div class="brand-logo" aria-label="Soluciones Radicales">
        <img class="brand-logo__image brand-logo__image--light" src="/logo-light.png" alt="" aria-hidden="true" />
        <img class="brand-logo__image brand-logo__image--dark" src="/logo-dark.png" alt="" aria-hidden="true" />
      </div>
      <h1>Gestión MIP en un solo lugar</h1>
      <p class="intro">Programa servicios, coordina técnicos y conserva el histórico operativo con seguridad.</p>
      <BaseButton :loading="loading" @click="login(false)">Continuar con Google</BaseButton>
      <BaseButton variant="ghost" :disabled="loading" @click="login(true)">Elegir otra cuenta</BaseButton>
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

.brand-logo {
  display: grid;
  width: min(18rem, 88%);
  margin: 0 auto 0.25rem;
}

.brand-logo__image {
  grid-area: 1 / 1;
  width: 100%;
  height: auto;
}

.brand-logo__image--dark {
  display: none;
}

:global(:root[data-theme='dark']) .brand-logo__image--light {
  display: none;
}

:global(:root[data-theme='dark']) .brand-logo__image--dark {
  display: block;
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
