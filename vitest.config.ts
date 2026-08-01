import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['libs/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'libs/config/project-dir.ts',
        'libs/proposal/*.ts',
        'libs/vendor-memory/migrate.ts',
        'libs/memory/*.ts',
        'libs/hallucination/*.ts',
        'libs/doctor/*.ts',
        'libs/install/paths.ts',
        'libs/install/skills.ts',
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 85,
        statements: 95,
      },
    },
  },
});
