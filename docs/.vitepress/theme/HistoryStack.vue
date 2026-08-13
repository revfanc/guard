<script setup lang="ts">
const entries = [
  { label: "previous page", kind: "base" },
  { label: "current page", kind: "current" },
  { label: "guard sentinel", kind: "guard" },
];
</script>

<template>
  <div
    class="history-stack"
    aria-label="Three browser history entries"
  >
    <div
      v-for="(entry, index) in entries"
      :key="entry.label"
      class="history-entry"
      :class="`history-entry--${entry.kind}`"
    >
      <span class="history-entry__index">0{{ index + 1 }}</span>
      <span class="history-entry__label">{{ entry.label }}</span>
      <span
        v-if="entry.kind === 'guard'"
        class="history-entry__status"
      >armed</span>
    </div>
    <div
      class="history-return"
      aria-hidden="true"
    >
      <span>back</span>
      <svg viewBox="0 0 72 26">
        <path d="M70 13H4m0 0 10-10M4 13l10 10" />
      </svg>
    </div>
  </div>
</template>
