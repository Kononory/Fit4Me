// ── UI chrome layout constants ─────────────────────────────────────────────
// Mirror of the CSS custom properties in :root (style.css).
// Use these in TS/TSX files instead of hardcoding raw numbers.

export const SIDEBAR_W           = 148; // --sidebar-w
export const SIDEBAR_COLLAPSED_W = 40;  // --sidebar-collapsed-w
export const RIGHT_SIDEBAR_W     = 320; // --right-sidebar-w
export const CANVAS_LEFT         = 156; // --canvas-left (sidebar + 8px gap)
export const EVM_TOP             = 48;  // --evm-top
export const EVM_SIDE_W          = 220; // --evm-side-w

// ── EdgePicker popup dimensions ────────────────────────────────────────────
export const EP_MAIN_W      = 180; // main edge annotation picker width
export const EP_MAIN_H      = 40;  // main picker height estimate
export const EP_STATUS_W    = 160; // status sub-picker width
export const EP_STATUS_H    = 36;  // status picker height estimate
export const EP_CROSS_W     = 200; // cross-edge picker width
export const EP_CROSS_H     = 40;  // cross-edge picker height estimate
export const EP_ANALYTICS_W = 220; // analytics popup width

// EdgePicker position clamping
export const EP_CLAMP_X_MIN     = CANVAS_LEFT; // minimum left (avoids sidebar)
export const EP_CLAMP_X_PAD     = 8;           // right-edge padding
export const EP_CLAMP_Y_PAD     = 10;          // above-cursor gap
export const EP_CLAMP_Y_MIN     = 38;          // minimum top (avoids toolbar)
export const EP_ANALYTICS_Y_BOT = 300;         // bottom clearance for analytics

// ── EventsMap layout ───────────────────────────────────────────────────────
export const EVM_PAD          = 40;  // canvas outer padding
export const EVM_CARD_GAP     = 80;  // horizontal gap between cards
export const EVM_ROW_H        = 420; // vertical spacing between card rows
export const EVM_MIN_CANVAS_W = 800;
export const EVM_MIN_CANVAS_H = 600;
export const EVM_DEFAULT_IMG_H = 300; // fallback image height when not measured
export const EVM_IMG_BOTTOM_PAD = 60; // padding below image in canvas height calc
