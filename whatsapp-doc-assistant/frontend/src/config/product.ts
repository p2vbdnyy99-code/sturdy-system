// Single source of truth for the visible product name. Every page/component
// imports PRODUCT_NAME rather than hardcoding "Tenderlytic" — the internal
// bidpilot code namespace (routes, cookies, repo/module names) is a separate,
// deliberately unchanged thing; see BIDPILOT_ARCHITECTURE.md's Milestone 5a
// entry on why the two are not the same decision.
export const PRODUCT_NAME = 'Tenderlytic';
export const PRODUCT_TAGLINE = 'AI-powered tender intelligence';
