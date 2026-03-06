import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['tests/**/*.test.js'],
        globals: true,
        coverage: {
            provider: 'v8',
            all: true,
            include: ['js/**/*.js'],
            exclude: [
                'js/abi/**',
                'js/local-dev.deployment.js'
            ],
            reporter: ['text', 'html', 'json-summary', 'lcov'],
            reportsDirectory: './coverage'
        }
    }
});
