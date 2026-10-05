<template>
  <div class="responsive-table">
    <div class="responsive-table__desktop"><slot name="table" /></div>
    <div class="responsive-table__mobile"><slot name="cards" /></div>
  </div>
</template>

<style scoped>
.responsive-table__mobile { display: none; }
@media (max-width: 760px) {
  .responsive-table__desktop { display: none; }
  .responsive-table__mobile { display: grid; gap: 0.75rem; }
}
</style>
