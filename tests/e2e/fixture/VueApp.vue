<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { createBackGuard, type BackAttempt, type BackGuard } from "@guard";

const route = useRoute();
const router = useRouter();
const guard = shallowRef<BackGuard>();
const attempt = shallowRef<BackAttempt>();
const attempts = shallowRef(0);
const routeChanges = shallowRef(0);
const page = computed(() => route.path === "/protected" ? "Protected" : "Origin");

router.afterEach(() => {
  routeChanges.value += 1;
});

async function enter(): Promise<void> {
  await router.push("/protected");
  guard.value = createBackGuard({
    onBack(value) {
      attempt.value = value;
      attempts.value += 1;
    },
  });
}

function leave(): void {
  attempt.value?.leave();
}

function reset(): void {
  attempt.value?.reset();
}

onBeforeUnmount(() => guard.value?.dispose());
</script>

<template>
  <main>
    <h1 data-testid="page">
      {{ page }}
    </h1>
    <RouterView />
    <button
      v-if="page === 'Origin'"
      data-testid="enter"
      @click="enter"
    >
      Enter protected page
    </button>
    <template v-else>
      <button
        data-testid="back"
        @click="$router.back()"
      >
        router.back()
      </button>
      <button
        data-testid="leave"
        @click="leave"
      >
        Leave
      </button>
      <button
        data-testid="reset"
        @click="reset"
      >
        Reset
      </button>
    </template>
    <output data-testid="attempts">{{ attempts }}</output>
    <output data-testid="route-changes">{{ routeChanges }}</output>
  </main>
</template>
