/** Small inline icons for the tray. They are drawn here so that the game loads no image file. */
export const ICONS: Record<string, string> = {
  salt: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 15c2-5 5-8 7-8s5 3 7 8z" fill="#e9e4d8"/><circle cx="6" cy="16.5" r="1" fill="#e9e4d8"/><circle cx="14.5" cy="17" r=".8" fill="#e9e4d8"/></svg>',
  bell: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3c-3 0-5 2.5-5 6v3l-2 3h14l-2-3V9c0-3.5-2-6-5-6z" fill="#e8b85a"/><circle cx="10" cy="16.5" r="1.6" fill="#9c7024"/></svg>',
  candle: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="8" width="6" height="10" fill="#efe3c4"/><path d="M10 2c2 3 2 5 0 6-2-1-2-3 0-6z" fill="#f2a541"/></svg>',
};

export const ITEM_LABEL: Record<string, string> = { salt: 'Salt', bell: 'Bell', candle: 'Candle' };
