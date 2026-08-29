// Same fast model as apps/api/src/ai/anthropic-models.ts's PRESCREEN_MODEL
// constant — duplicated because the worker can't import across the app
// boundary (see the worker's package.json comment / PLAN.md deploy notes).
export const PRESCREEN_MODEL = 'claude-haiku-4-5-20251001';
