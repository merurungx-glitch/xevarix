/* XEVARIX — アイコン（24×24 の線画。外のフォントや画像に頼らず、ここ1本で完結）
   icon('search') → <svg> 要素 ／ iconHTML('search') → 文字列 */

const P = {
  /* 窓・移動 */
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  min: '<path d="M6 12h12"/>',
  max: '<rect x="5.5" y="5.5" width="13" height="13" rx="2.5"/>',
  restore: '<rect x="8.5" y="4.5" width="11" height="11" rx="2"/><path d="M15.5 15.5v2a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  cards: '<rect x="3.5" y="6" width="11" height="12" rx="2"/><path d="M17.5 8.5h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1"/>',
  home: '<path d="M4 11.5L12 4.5l8 7"/><path d="M6.5 10v8.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  bellOff: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0M4 4l16 16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevL: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  chevR: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  chevU: '<path d="M5.5 14.5L12 8l6.5 6.5"/>',
  chevD: '<path d="M5.5 9.5L12 16l6.5-6.5"/>',
  arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowU: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowD: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  more: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="2.6"/>',
  menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
  external: '<path d="M13.5 4.5h6v6M19.5 4.5L11 13"/><path d="M17.5 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8A1.5 1.5 0 0 1 6 6.5h4.5"/>',
  expand: '<path d="M4.5 9.5v-5h5M19.5 9.5v-5h-5M4.5 14.5v5h5M19.5 14.5v5h-5"/>',
  shrink: '<path d="M9.5 4.5v5h-5M14.5 4.5v5h5M9.5 19.5v-5h-5M14.5 19.5v-5h5"/>',
  sidebar: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M9.5 5v14"/>',
  columns: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M12 5v14"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11"/><path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke-width="2.4"/>',

  /* アプリ・もの */
  settings: '<circle cx="12" cy="12" r="7.4" stroke-width="3" stroke-dasharray="2.9 2.9"/><circle cx="12" cy="12" r="5.6"/><circle cx="12" cy="12" r="2.2"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  file: '<path d="M7 3.5h6.5l5 5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M13.5 3.5v5h5"/>',
  fileText: '<path d="M7 3.5h6.5l5 5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M13.5 3.5v5h5M9 13h6M9 16.5h4"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l4.5-4 3.5 3 3-2.5 5 4"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  video: '<rect x="3.5" y="6" width="12.5" height="12" rx="2"/><path d="M16 10.5l4.5-2.5v8L16 13.5"/>',
  note: '<path d="M6.5 3.5h11A1.5 1.5 0 0 1 19 5v10l-5 5.5H6.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M19 15h-3.5a1.5 1.5 0 0 0-1.5 1.5v4M8.5 8.5h7M8.5 12h5"/>',
  calc: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 7.5h7"/><path d="M8.6 12h.01M12 12h.01M15.4 12h.01M8.6 16h.01M12 16h.01M15.4 16h.01" stroke-width="2.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  calendar: '<rect x="4" y="5" width="16" height="15.5" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
  activity: '<path d="M3 12.5h3.5l2.5-7 4.5 13 2.5-6H21"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7 9.5l3 2.5-3 2.5M12.5 14.5H17"/>',
  store: '<path d="M5.5 8.5h13l-.9 10.2a1.5 1.5 0 0 1-1.5 1.3H7.9a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 8.5v-1a3 3 0 0 1 6 0v1"/>',
  sparkle: '<path d="M11 4l1.7 4.8 4.8 1.7-4.8 1.7L11 17l-1.7-4.8-4.8-1.7 4.8-1.7z"/><path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  shield: '<path d="M12 3.5l7 2.6v5.4c0 4.3-2.8 7.7-7 9-4.2-1.3-7-4.7-7-9V6.1z"/>',
  shieldCheck: '<path d="M12 3.5l7 2.6v5.4c0 4.3-2.8 7.7-7 9-4.2-1.3-7-4.7-7-9V6.1z"/><path d="M9 12l2.2 2.2 4-4.2"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  unlock: '<rect x="5.5" y="10.5" width="13" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.7-1.4"/>',
  key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.6 12.4L19 4M15.5 7.5l2.5 2.5M13 10l2 2"/>',
  fingerprint: '<path d="M7 19c1-2 1.5-4 1.5-6.5a3.5 3.5 0 0 1 7 0c0 3-.4 5.3-1.3 7.5"/><path d="M5 15.5c.4-1.2.5-2.2.5-3.5a6.5 6.5 0 0 1 12.6-2.2M18.5 13c0 2-.2 3.6-.6 5M12 12.5c0 3-.6 5.6-1.8 8"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M4 4l16 16M9.5 5.9A8.6 8.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.7M6.3 7.8A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.3 0 2.5-.3 3.6-.8"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  users: '<circle cx="9" cy="9" r="3.3"/><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0M15.5 5.9a3.3 3.3 0 0 1 0 6.2M17.5 14.2a6.2 6.2 0 0 1 3.7 5.3"/>',
  box: '<path d="M12 3.5l8 4.2v8.6l-8 4.2-8-4.2V7.7z"/><path d="M4 7.7l8 4.3 8-4.3M12 12v8.5"/>',
  book: '<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H12v15H6.5A1.5 1.5 0 0 0 5 20.5zM19 5.5A1.5 1.5 0 0 0 17.5 4H12v15h5.5a1.5 1.5 0 0 1 1.5 1.5z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5S9.5 6.1 12 3.5z"/>',
  gamepad: '<path d="M7.5 7.5h9a5 5 0 0 1 4.9 6l-.6 3a2.4 2.4 0 0 1-4.3.9L15 15.5H9l-1.5 1.9a2.4 2.4 0 0 1-4.3-.9l-.6-3a5 5 0 0 1 4.9-6z"/><path d="M8 10.2v3M6.5 11.7h3"/><path d="M15.5 10.8h.01M17.4 12.7h.01" stroke-width="2.4"/>',
  message: '<path d="M5.5 5h13A1.5 1.5 0 0 1 20 6.5v8a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3.5V16h-1A1.5 1.5 0 0 1 4 14.5v-8A1.5 1.5 0 0 1 5.5 5z"/>',
  orbit: '<circle cx="12" cy="12" r="4.6"/><ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-24 12 12)"/>',

  /* 状態・電力 */
  bolt: '<path d="M13 3L5.5 13.5H11L10 21l7.5-10.5H12z"/>',
  leaf: '<path d="M6 18.5C6 10 11 5.5 19.5 5c.5 8.5-4 13.5-12 13.5H6z"/><path d="M6 18.5c2.3-3.8 5-6.2 8.5-8"/>',
  gauge: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 13l3.5-4.5"/><circle cx="12" cy="13.5" r="1.3"/>',
  battery: '<rect x="3" y="8" width="16" height="9" rx="2.2"/><path d="M21 11v3"/>',
  plug: '<path d="M9 3.5v4M15 3.5v4M7 7.5h10V11a5 5 0 0 1-10 0zM12 16v4.5"/>',
  wifi: '<path d="M3.5 9.5a12.5 12.5 0 0 1 17 0M6.5 13a8.2 8.2 0 0 1 11 0M9.4 16.3a4 4 0 0 1 5.2 0"/><path d="M12 19.5h.01" stroke-width="2.4"/>',
  wifiOff: '<path d="M4 4l16 16M6.5 13a8.2 8.2 0 0 1 3-1.9M14.5 11.2A8.2 8.2 0 0 1 17.5 13M3.5 9.5a12.5 12.5 0 0 1 3.3-2.3M10.5 5.7a12.5 12.5 0 0 1 10 3.8M9.4 16.3a4 4 0 0 1 5.2 0"/><path d="M12 19.5h.01" stroke-width="2.4"/>',
  moon: '<path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7z"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-1.4-1.2-1.7-1.2-3 0-1 .8-1.7 1.9-1.7h2.1c2 0 3.7-1.4 3.7-3.6 0-3.9-3.8-6.9-8.5-6.9z"/><path d="M8 13h.01M8.5 9h.01M12 7.2h.01M15.6 9h.01" stroke-width="2.4"/>',
  text: '<path d="M4.5 18.5l5-13 5 13M6.3 14h6.4M16 12.5a2.6 2.6 0 0 1 4.5 1.8v4.2M20.5 16.2c-2.5-.6-4.5.2-4.5 1.6 0 1.6 3 1.7 4.5-.3"/>',
  volume: '<path d="M4 10v4h3.5l4.5 4V6l-4.5 4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 10v4h3.5l4.5 4V6l-4.5 4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  brightness: '<circle cx="12" cy="12" r="3.2"/><path d="M12 4v1.5M12 18.5V20M4 12h1.5M18.5 12H20M6.3 6.3l1.1 1.1M16.6 16.6l1.1 1.1M6.3 17.7l1.1-1.1M16.6 7.4l1.1-1.1"/>',
  power: '<path d="M12 3.5v8M7 6.5a7.5 7.5 0 1 0 10 0"/>',
  cpu: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><rect x="10" y="10" width="4" height="4" rx=".8"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
  chip: '<rect x="3.5" y="7.5" width="17" height="9" rx="1.5"/><path d="M7.5 7.5v9M12 7.5v9M16.5 7.5v9M6 19.5v-3M10 19.5v-3M14 19.5v-3M18 19.5v-3"/>',
  database: '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  cloud: '<path d="M7.5 18.5a4.5 4.5 0 0 1-.6-9 5.5 5.5 0 0 1 10.6 1.3 3.9 3.9 0 0 1-.5 7.7z"/>',
  cloudOff: '<path d="M7.5 18.5a4.5 4.5 0 0 1-.6-9 5.5 5.5 0 0 1 10.6 1.3 3.9 3.9 0 0 1-.5 7.7zM4 4l16 16"/>',
  sleep: '<path d="M5.5 6.5h5.5l-5.5 6.5H11M13.5 11.5H18l-4.5 5.5H18"/>',

  /* 操作 */
  trash: '<path d="M5 7h14M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M7 7l.8 11.6a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7M10.2 11v5M13.8 11v5"/>',
  edit: '<path d="M4.5 19.5l1-4L16 5a1.8 1.8 0 0 1 2.5 0l.5.5a1.8 1.8 0 0 1 0 2.5L8.5 18.5zM14 7l3 3"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M5.5 15.5H5A1.5 1.5 0 0 1 3.5 14V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v.5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M5 19.5h14"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  undo: '<path d="M8.5 5.5l-4 4 4 4"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11H9"/>',
  redo: '<path d="M15.5 5.5l4 4-4 4"/><path d="M19.5 9.5H10a5.5 5.5 0 0 0 0 11h5"/>',
  play: '<path d="M7.5 5v14l11-7z"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  send: '<path d="M4 12l16-7.5-5.5 16-3.2-6.3z"/><path d="M11.3 14.2L20 4.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.8h.01" stroke-width="2.4"/>',
  warn: '<path d="M12 4.5l8.5 14.5h-17z"/><path d="M12 10v4.5"/><path d="M12 16.8h.01" stroke-width="2.4"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.6 2.6 0 0 1 5 .7c0 1.8-2.5 2-2.5 3.8"/><path d="M12 16.8h.01" stroke-width="2.4"/>',
  star: '<path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z"/>',
  heart: '<path d="M12 19.5s-7.2-4.4-7.2-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.2 2.3c0 5.2-7.2 9.6-7.2 9.6z"/>',
  pin: '<path d="M9 4.5h6l-.8 5.5 3.3 3.5h-11l3.3-3.5zM12 13.5V20"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5z"/><path d="M20 14.2h.01M14.2 20h.01" stroke-width="2.2"/>',
  wand: '<path d="M5 19L15.5 8.5M13.5 6.5l4 4M18 3.5V6M16.8 4.8h2.5M8 4v2M7 5h2M19 13v2M18 14h2"/>',
  history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4"/><path d="M4.5 4.5v4h4M12 8v4.2l2.8 1.8"/>',
  filter: '<path d="M4.5 5.5h15l-5.8 7v5.5l-3.4 1.5v-7z"/>',
  tag: '<path d="M4 12.5v-7A1.5 1.5 0 0 1 5.5 4h7l7.5 7.5a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0z"/><path d="M8.5 8.5h.01" stroke-width="2.4"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01" stroke-width="2.6"/>',
  hourglass: '<path d="M7 4h10M7 20h10M8 4c0 4 4 5.5 4 8s-4 4-4 8M16 4c0 4-4 5.5-4 8s4 4 4 8"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.5M10 3.5h4M12 3.5v3M17.5 7.5l1.2-1.2"/>',
  alarm: '<circle cx="12" cy="13" r="6.8"/><path d="M12 9.5V13l2.3 1.5M4.5 6.5l3-2.5M19.5 6.5l-3-2.5"/>',
  layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5"/>',
  repeat: '<path d="M17 3.5l3 3-3 3M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5l-3-3 3-3M20 12.5v1a4 4 0 0 1-4 4H4"/>',
  save: '<path d="M5.5 4H16l4 4v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  code: '<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14"/>',
};

const NS = 'http://www.w3.org/2000/svg';
export const hasIcon = n => Object.prototype.hasOwnProperty.call(P, n);
export const iconNames = () => Object.keys(P);
export function iconHTML(name, cls = '') {
  return '<svg class="xi ' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[name] || P.box) + '</svg>';
}
export function icon(name, cls = '') {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', 'xi ' + cls); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name] || P.box;
  return s;
}

/* 電池（残量で中身の長さが変わる） */
export function batteryIcon(level, charging) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', 'xi xi-batt'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  const w = level == null ? 0 : Math.max(1.2, 12.4 * Math.min(1, Math.max(0, level)));
  s.innerHTML = '<rect x="3" y="8" width="16" height="9" rx="2.2"/><path d="M21 11v3"/>' +
    (level == null ? '<path d="M9.5 11.2a1.6 1.6 0 0 1 3 .6c0 1-1.5 1.1-1.5 2.2" stroke-width="1.4"/>'
      : '<rect class="lv" x="4.8" y="9.8" width="' + w.toFixed(1) + '" height="5.4" rx="1" fill="currentColor" stroke="none"/>') +
    (charging ? '<path class="ch" d="M12 8.6l-2.6 4h2.4l-.8 3 2.8-4.2h-2.4z" fill="var(--bg)" stroke="var(--bg)" stroke-width=".6"/>' : '');
  return s;
}

/* 画像の場所は、XEVARIX の置き場所（このファイルの1つ上）から数える。
   窓の中（apps/app.html）でタイルを作ると、そのページから数えて1段ずれ、絵が見つからなくなるため */
const ROOT_URL = new URL('../', import.meta.url);
const fromRoot = u => { try { return /^([a-z][a-z0-9+.-]*:|\/)/i.test(u) ? u : new URL(u, ROOT_URL).href; } catch { return u; } };

/* アプリのタイル（かど丸の地＋記号、または画像） */
export function appTile(app, cls = '') {
  const el = document.createElement('span');
  el.className = 'xa-tile ' + cls;
  const ic = (app && app.icon) || {};
  if (ic.img) {
    const im = document.createElement('img');
    im.src = fromRoot(ic.img); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.draggable = false;
    im.onerror = () => { im.remove(); el.classList.add('noimg'); el.append(icon('box')); };
    el.append(im);
  } else {
    const t = ic.tint || ['#3a4a7a', '#1a2450'];
    el.style.setProperty('--t1', t[0]); el.style.setProperty('--t2', t[1]);
    if (ic.ink) el.style.setProperty('--ti', ic.ink);
    if (ic.letter) { const s = document.createElement('b'); s.textContent = ic.letter; el.append(s); }
    else el.append(icon(ic.glyph || 'box'));
  }
  return el;
}
