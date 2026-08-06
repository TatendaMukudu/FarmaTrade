// Aliased in vitest.config.mts in place of the real "server-only" package.
// The real package unconditionally throws on import — Next's own bundler
// swaps it for a no-op when compiling for the server target, which is
// exactly what a test representing server-side code needs too. Without
// this, every module gated by `import "server-only"` (auth.ts, matching.ts,
// reputation.ts, ...) would be unreachable from any test runner.
export {};
