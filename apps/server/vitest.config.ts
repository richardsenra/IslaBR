import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Cada arquivo de teste sobe um servidor de verdade na mesma porta, então
    // eles não podem correr em paralelo.
    fileParallelism: false,
  },
});
