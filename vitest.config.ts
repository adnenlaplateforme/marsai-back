import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Crée la base de test + charge le schéma une fois avant toute la suite.
    globalSetup: ['./vitest.global-setup.ts'],
    // Charge .env.test (base de test + secrets) avant chaque fichier de test.
    setupFiles: ['./vitest.setup.ts'],
    // Les tests d'intégration partagent une seule base et la vident entre chaque
    // test (resetDatabase). Deux fichiers en parallèle se videraient la base
    // l'un sous l'autre : on les exécute donc l'un après l'autre.
    fileParallelism: false,
  },
});
