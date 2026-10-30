/* Lilypad Hopper — page chrome (bitwrench).
   Leapfrog-branded shell around the SVG game: header, HUD stat cards, how-to-play,
   touch D-pad, overlays (title / paused / game over) and footer. All UI is TACO.
   The game publishes 'hopper:hud' and 'hopper:state'; this file subscribes and patches. */
(function (root) {
  var bw = root.bw || require('../vendor/bitwrench.umd.min.js');
  var A = root.HopperAudio, Game = root.HopperGame;

  // Leapfrog palette from lftechnology.com — see public/assets/brand.md
  var THEME = {
    primary: '#038E43', secondary: '#102B7B', tertiary: '#05572B',
    success: '#179B53', danger: '#EF5350', warning: '#B38600', info: '#102B7B',
    background: '#F7F8FB', surface: '#FFFFFF',
    spacing: 'normal', radius: 'lg', elevation: 'sm', typeRatio: 'normal', harmonize: 0.1
  };
  var theme = bw.makeStyles(THEME), P = theme.palette;
  var FONT = '"Tomato Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var LOGO = root.__LF_LOGO || 'assets/lf-logo.svg';
  var LOGO_WHITE = root.__LF_LOGO_WHITE || 'assets/lf-logo-white.svg';
  var VERSION = bw.version || '';

  // Only what the library has no utility for: page frame, the game stage, overlay, D-pad.
  function customCss() {
    return bw.css({
      'html, body': { margin: 0, padding: 0 },
      'body': { background: P.background, color: '#111111', fontFamily: FONT, WebkitFontSmoothing: 'antialiased' },
      'body.bw_theme_alt': { background: '#0C183A', color: P.light.base },
      '.bw_text_muted': { color: '#55606e !important' },
      'body.bw_theme_alt .bw_text_muted': { color: '#9aa6bf !important' },
      '.hop_page': { maxWidth: '1120px', margin: '0 auto', padding: '20px 24px 32px', minWidth: 0 },
      '.hop_layout > *': { minWidth: 0 },
      '.hop_top': { display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap', paddingBottom: '16px', borderBottom: '1px solid ' + P.light.border, marginBottom: '20px' },
      '.hop_top img.logo': { height: '30px', width: 'auto', display: 'block' },
      'body.bw_theme_alt .hop_top': { borderBottomColor: 'rgba(255,255,255,.12)' },
      '.hop_title': { display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' },
      '.hop_title h1': { margin: 0, fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-.01em' },
      '.hop_title h1 span': { color: P.primary.base },
      '.hop_actions': { marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' },
      '.hop_menu': { marginLeft: '10px' },
      '.hop_menu .bw_nav': { margin: 0, padding: 0, gap: '4px' },
      '.hop_menu .bw_nav_link': { color: P.secondary.base, fontWeight: 600, padding: '6px 12px', borderRadius: '20px', textDecoration: 'none', cursor: 'pointer', transition: 'background .15s, color .15s' },
      '.hop_menu .bw_nav_link:hover': { background: P.primary.light, color: P.primary.darkText },
      'body.bw_theme_alt .hop_menu .bw_nav_link': { color: '#D4F479' },
      'body.bw_theme_alt .hop_menu .bw_nav_link:hover': { background: 'rgba(212,244,121,.12)' },
      '.hop_layout': { display: 'grid', gridTemplateColumns: 'minmax(280px, 460px) minmax(260px, 1fr)', gap: '24px', alignItems: 'start' },
      '@media (max-width: 760px)': { '.hop_layout': { gridTemplateColumns: '1fr' }, '.hop_page': { padding: '12px 12px 24px' }, '#hop_svg': { maxHeight: '70vh' } },
      '.hop_stage': { position: 'relative', background: '#0C183A', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 14px 40px rgba(12,24,58,.28)', border: '1px solid rgba(255,255,255,.06)' },
      '#hop_svg': { display: 'block', width: '100%', height: 'auto', maxHeight: '82vh', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer', fontFamily: FONT },
      // full-window play: the stage takes the whole viewport; header, side column and footer hide
      'body.hop_full': { overflow: 'hidden' },
      'body.hop_full .hop_top, body.hop_full .hop_layout > aside, body.hop_full .hop_foot': { display: 'none' },
      'body.hop_full .hop_stage': { position: 'fixed', inset: 0, zIndex: 50, borderRadius: 0, border: 0, boxShadow: 'none' },
      'body.hop_full #hop_board, body.hop_full #hop_svg': { width: '100vw', height: '100vh', maxHeight: 'none' },
      'body.hop_full .hop_overlay': { background: 'rgba(12,24,58,.72)' },
      '.hop_exit': { position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'none', font: 'inherit', fontSize: '.8rem', fontWeight: 600, color: '#F7F8FB', background: 'rgba(12,24,58,.55)', border: '1px solid rgba(255,255,255,.25)', borderRadius: '20px', padding: '5px 12px', cursor: 'pointer' },
      '.hop_exit:hover': { background: 'rgba(12,24,58,.85)' },
      'body.hop_full .hop_exit': { display: 'block' },
      '.hop_lives': { display: 'inline-flex', gap: '6px', justifyContent: 'center', margin: '4px 0 12px' },
      '.hop_lives svg': { width: '26px', height: '26px' },
      '.hop_tag': { margin: '14px 0 0', fontWeight: 700, color: P.primary.base },
      '.hop_tag a': { color: P.primary.base, textDecoration: 'none' }, '.hop_tag a:hover': { textDecoration: 'underline' },
      '.hop_about': { textAlign: 'center' }, '.hop_about a': { color: P.primary.base, fontWeight: 600, textDecoration: 'none' }, '.hop_about a:hover': { textDecoration: 'underline' },
      '.hop_lfcard a': { color: P.primary.base, fontWeight: 600, textDecoration: 'none' }, '.hop_lfcard a:hover': { textDecoration: 'underline' },
      '.hop_link': { color: P.secondary.base, fontSize: '.85rem', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 0, font: 'inherit', padding: 0 },
      '.hop_overlay': { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px', background: 'rgba(12,24,58,.58)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', cursor: 'pointer', transition: 'opacity .25s' },
      '.hop_overlay.hop_hidden': { opacity: 0, pointerEvents: 'none' },
      '.hop_sheet': { background: P.surface, color: '#111111', borderRadius: '14px', padding: '24px 22px', maxWidth: '330px', width: '100%', boxSizing: 'border-box', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.35)' },
      '.hop_sheet h2': { margin: '0 0 6px', fontSize: '1.6rem', letterSpacing: '-.01em' },
      '.hop_sheet h2 span': { color: P.primary.base },
      '.hop_sheet p': { margin: '0 0 14px', lineHeight: 1.45 },
      '.hop_big': { fontSize: '3rem', fontWeight: 800, lineHeight: 1, color: P.secondary.base, margin: '6px 0 2px' },
      '.hop_frog_icon': { width: '64px', height: '64px', margin: '0 auto 8px', display: 'block' },
      '.hop_stats': { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' },
      '@media (max-width: 420px)': { '.hop_stats': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } },
      '.hop_stats .bw_stat_value': { fontVariantNumeric: 'tabular-nums', color: P.secondary.base },
      'body.bw_theme_alt .hop_stats .bw_stat_value': { color: '#D4F479' },
      'body.bw_theme_alt .hop_dpad button': { background: '#0C183A', color: '#D4F479', borderColor: 'rgba(255,255,255,.18)' },
      '.hop_stats .bw_stat_card': { padding: '12px 14px', minWidth: 0 },
      '.hop_dpad': { display: 'grid', gridTemplateColumns: 'repeat(3, 56px)', gridTemplateRows: 'repeat(2, 48px)', gap: '6px', justifyContent: 'center' },
      '.hop_dpad button': { font: 'inherit', fontSize: '1.2rem', fontWeight: 700, border: '1px solid ' + P.light.border, borderRadius: '10px', background: P.surface, color: P.secondary.base, cursor: 'pointer', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none' },
      '.hop_dpad button:active': { background: P.primary.light, borderColor: P.primary.base },
      '.hop_dpad .up': { gridColumn: 2, gridRow: 1 }, '.hop_dpad .left': { gridColumn: 1, gridRow: 2 }, '.hop_dpad .down': { gridColumn: 2, gridRow: 2 }, '.hop_dpad .right': { gridColumn: 3, gridRow: 2 },
      'kbd.hop_key': { display: 'inline-block', font: 'inherit', fontSize: '.78rem', fontWeight: 600, padding: '1px 7px', borderRadius: '5px', border: '1px solid ' + P.light.border, borderBottomWidth: '2px', background: P.background, color: '#111111', margin: '0 1px' },
      '.hop_how li': { margin: '5px 0' }, '.hop_how ul': { margin: '0', paddingLeft: '18px' },
      '.hop_foot': { marginTop: '28px', paddingTop: '14px', borderTop: '1px solid ' + P.light.border, display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', fontSize: '.85rem' },
      '.hop_foot img': { height: '18px', width: 'auto', verticalAlign: 'middle' },
      'body.bw_theme_alt .hop_foot': { borderTopColor: 'rgba(255,255,255,.12)' },
      '.hop_foot a': { color: P.primary.base, textDecoration: 'none' }, '.hop_foot a:hover': { textDecoration: 'underline' }
    });
  }

  // --- small TACO helpers ---
  function key(k) { return { t: 'kbd', a: { class: 'hop_key' }, c: k }; }
  function logoImg(cls) { return { t: 'img', a: { class: cls || 'logo', src: LOGO, alt: 'Leapfrog Technology' } }; }
  function frogIcon() {
    var C = Game ? Game.colors : { pad: '#038E43', frogBelly: '#D4F479', eye: '#F7F8FB', pupil: '#0C183A', frogDark: '#05572B', water: '#102B7B' };
    return { t: 'svg', a: { class: 'hop_frog_icon', viewBox: '0 0 64 64', 'aria-hidden': 'true' }, c: [
      { t: 'circle', a: { cx: 32, cy: 34, r: 24, fill: C.pad } },
      { t: 'path', a: { d: 'M32,34 L52,18 A24,24 0 0 1 56,34 Z', fill: C.water } },
      { t: 'ellipse', a: { cx: 32, cy: 36, rx: 14, ry: 12, fill: C.frogDark } },
      { t: 'ellipse', a: { cx: 32, cy: 40, rx: 8, ry: 6, fill: C.frogBelly } },
      { t: 'circle', a: { cx: 25, cy: 27, r: 5, fill: C.eye } }, { t: 'circle', a: { cx: 39, cy: 27, r: 5, fill: C.eye } },
      { t: 'circle', a: { cx: 25, cy: 27, r: 2.4, fill: C.pupil } }, { t: 'circle', a: { cx: 39, cy: 27, r: 2.4, fill: C.pupil } }
    ] };
  }

  // --- overlays (title / paused / game over) ---
  function enterFull() { bw.addClass(root.document.body, 'hop_full'); }
  function exitFull() {
    bw.removeClass(root.document.body, 'hop_full');
    var G = Game.state(); if (G.state === 'playing' && !G.paused) Game.input('pause');
  }
  function lifeIcon(on) {
    var C = Game.colors;
    return { t: 'svg', a: { viewBox: '-12 -12 24 24', opacity: on ? 1 : 0.22, 'aria-hidden': 'true' }, c: [
      { t: 'circle', a: { r: 10, fill: C.frog, stroke: C.frogDark, 'stroke-width': 1.5 } },
      { t: 'circle', a: { cx: -4, cy: -4, r: 3.2, fill: C.eye } }, { t: 'circle', a: { cx: 4, cy: -4, r: 3.2, fill: C.eye } },
      { t: 'circle', a: { cx: -4, cy: -4.5, r: 1.6, fill: C.pupil } }, { t: 'circle', a: { cx: 4, cy: -4.5, r: 1.6, fill: C.pupil } },
      { t: 'path', a: { d: 'M-4,3 Q0,6 4,3', stroke: C.frogDark, 'stroke-width': 1.2, fill: 'none' } }
    ] };
  }
  function livesRow(n) { var a = []; for (var i = 0; i < Game.LIVES; i++) a.push(lifeIcon(i < n)); return { t: 'div', a: { class: 'hop_lives' }, c: a }; }
  var CAUSE = { splash: ['Splash!', 'That was water, not a lily pad.'], swept: ['Swept away!', 'The pad carried you off the edge.'], behind: ['Left behind!', 'The pond moved on without you.'] };
  function lostSheet(d) {
    var c = CAUSE[d.cause] || ['Oops', ''];
    return { t: 'div', a: { class: 'hop_sheet' }, c: [
      { t: 'h2', c: c[0] },
      { t: 'p', a: { class: 'bw_text_muted', style: 'margin-bottom:4px' }, c: c[1] },
      livesRow(d.lives),
      { t: 'p', a: { style: 'margin:0 0 12px' }, c: d.lives === 1 ? 'Last life.' : d.lives + ' lives left.' },
      bw.makeButton({ text: 'Keep hopping', variant: 'primary', size: 'lg', onclick: function (e) { e.stopPropagation(); Game.input('start'); } }),
      { t: 'p', a: { class: 'bw_text_muted bw_fs_sm', style: 'margin:12px 0 0' }, c: [key('Space'), ' or tap'] }
    ] };
  }
  function titleSheet() {
    return { t: 'div', a: { class: 'hop_sheet' }, c: [
      frogIcon(),
      { t: 'h2', c: ['Lilypad ', { t: 'span', c: 'Hopper' }] },
      { t: 'p', c: 'Hop up the pond, pad to pad. Land on the lily pads, not the water. Snack on flies. And keep moving: the pond scrolls, and it gets faster.' },
      bw.makeButton({ text: 'Hop in', variant: 'primary', size: 'lg', onclick: function (e) { e.stopPropagation(); Game.input('start'); } }),
      { t: 'p', a: { class: 'bw_text_muted bw_fs_sm', style: 'margin:12px 0 0' }, c: [key('Space'), ' or tap to start'] }
    ] };
  }
  function pausedSheet() {
    return { t: 'div', a: { class: 'hop_sheet' }, c: [
      { t: 'h2', c: 'Paused' },
      { t: 'p', a: { class: 'bw_text_muted' }, c: 'Press any key or tap to keep hopping.' },
      { t: 'button', a: { class: 'hop_link', type: 'button', onclick: function (e) { e.stopPropagation(); exitFull(); } }, c: 'Back to the page' }
    ] };
  }
  function deadSheet(d) {
    var c = CAUSE[d.cause] || ['Game over', ''];
    return { t: 'div', a: { class: 'hop_sheet' }, c: [
      { t: 'h2', c: c[0] },
      { t: 'p', a: { class: 'bw_text_muted', style: 'margin-bottom:4px' }, c: c[1] + ' Out of lives.' },
      livesRow(0),
      { t: 'div', a: { class: 'bw_text_muted bw_fs_sm', style: 'letter-spacing:.08em;text-transform:uppercase' }, c: 'Final score' },
      { t: 'div', a: { class: 'hop_big' }, c: String(d.score) },
      { t: 'p', a: { class: 'bw_text_muted bw_fs_sm' }, c: d.newBest ? [bw.makeBadge({ text: 'New best!', variant: 'primary', pill: true })] : ['Best ' + d.best] },
      bw.makeButton({ text: 'Hop again', variant: 'primary', size: 'lg', onclick: function (e) { e.stopPropagation(); Game.input('start'); } }),
      { t: 'p', a: { class: 'bw_text_muted bw_fs_sm', style: 'margin:12px 0 0' }, c: [key('Space'), ' or tap'] },
      { t: 'p', a: { class: 'hop_tag' }, c: [{ t: 'a', a: { href: 'https://www.lftechnology.com', target: '_blank', rel: 'noopener' }, c: 'Hop on with Leapfrog!' }] }
    ] };
  }

  // --- the page ---
  function dpadButton(cls, label, action, title) {
    return { t: 'button', a: { class: cls, type: 'button', 'aria-label': title, title: title,
      onpointerdown: function (e) { e.preventDefault(); A && A.init(); Game.input(action); } }, c: label };
  }
  function pageTaco() {
    return { t: 'div', a: { class: 'hop_page' }, c: [
      { t: 'header', a: { class: 'hop_top' }, c: [
        logoImg(),
        { t: 'div', a: { class: 'hop_title' }, c: [
          { t: 'h1', c: ['Lilypad ', { t: 'span', c: 'Hopper' }] },
          bw.makeBadge({ text: 'Lilypad concept demo', variant: 'secondary', pill: true })
        ] },
        menu(),
        { t: 'div', a: { class: 'hop_actions' }, c: [
          { t: 'span', a: { id: 'hop_mute_host' }, c: bw.makeButton({ text: (A && A.muted) ? 'Sound: off' : 'Sound: on', variant: 'outline-secondary', size: 'sm', onclick: function () { toggleMute(); } }) },
          bw.makeButton({ text: 'Theme', variant: 'outline-secondary', size: 'sm', onclick: function () { bw.toggleThemeMode(); } })
        ] }
      ] },
      { t: 'div', a: { class: 'hop_layout' }, c: [
        { t: 'div', a: { class: 'hop_stage', id: 'hop_stage' }, c: [
          { t: 'div', a: { id: 'hop_board' } },
          { t: 'div', a: { id: 'hop_overlay', class: 'hop_overlay', onclick: function () { Game.input('tap'); } }, c: titleSheet() },
          { t: 'button', a: { class: 'hop_exit', type: 'button', title: 'Pause and go back to the page', onclick: function () { exitFull(); } }, c: 'Esc \u00b7 back to page' }
        ] },
        { t: 'aside', a: { class: 'bw_d_flex', style: 'flex-direction:column; gap:14px' }, c: [
          { t: 'div', a: { class: 'hop_stats' }, c: [
            { t: 'div', a: { id: 'hud_score' }, c: bw.makeStatCard({ value: '0', label: 'Score' }) },
            { t: 'div', a: { id: 'hud_best' }, c: bw.makeStatCard({ value: '0', label: 'Best' }) },
            { t: 'div', a: { id: 'hud_streak' }, c: bw.makeStatCard({ value: '0', label: 'Streak' }) },
            { t: 'div', a: { id: 'hud_lives' }, c: bw.makeStatCard({ value: String(Game.LIVES), label: 'Lives' }) }
          ] },
          bw.makeCard({ title: 'How to play', content: howToTaco() }),
                    { t: 'div', a: { class: 'hop_dpad', 'aria-label': 'Touch controls' }, c: [
            dpadButton('up', '▲', 'up', 'Hop forward'),
            dpadButton('left', '◀', 'left', 'Sidestep left'),
            dpadButton('down', '▼', 'down', 'Hop back'),
            dpadButton('right', '▶', 'right', 'Sidestep right')
          ] },
          bw.makeCard({ title: 'About Leapfrog and Lilypad', content: { t: 'div', a: { class: 'hop_lfcard' }, c: leapfrogCopy(true).concat([
            { t: 'p', a: { class: 'hop_tag', style: 'margin:4px 0 0' }, c: [lfLink('Hop on with Leapfrog! \u2192 lftechnology.com')] }
          ]) } })
        ] }
      ] },
      { t: 'div', a: { id: 'hop_about_host' } },
      { t: 'div', a: { id: 'hop_howto_host' } },
      { t: 'footer', a: { class: 'hop_foot bw_text_muted' }, c: [
        { t: 'span', c: ['Built by ', { t: 'a', a: { href: 'https://www.lftechnology.com', target: '_blank', rel: 'noopener' }, c: 'Leapfrog Technology' }] },
        { t: 'span', c: '·' },
        { t: 'span', c: ['Built with Lilypad and ', { t: 'a', a: { href: 'https://github.com/deftio/bitwrench', target: '_blank', rel: 'noopener' }, c: 'bitwrench.js' }] },
        { t: 'span', a: { style: 'margin-left:auto' }, c: logoImg('') }
      ] }
    ] };
  }

  function howToTaco() {
    return { t: 'div', a: { class: 'hop_how' }, c: [
      { t: 'ul', c: [
        { t: 'li', c: [key('Space'), ' / ', key('↑'), ' / tap — hop forward'] },
        { t: 'li', c: [key('←'), ' ', key('→'), ' / swipe — sidestep to a drifting pad'] },
        { t: 'li', c: [key('↓'), ' — hop back (once in a while it saves you)'] },
        { t: 'li', c: 'Each new row is +1. A fly is +5. Five new rows in quick succession: ribbit, +3.' },
        { t: 'li', c: 'The pond scrolls down and speeds up. Pads carry you sideways; off the edge is out.' },
        { t: 'li', c: 'Three lives. Lose one and you restart on the row you fell from; the score keeps.' },
        { t: 'li', c: [key('P'), ' pause · ', key('M'), ' mute · ', key('Esc'), ' pause and leave full screen'] }
      ] }
    ] };
  }
  function howToModal() {
    return bw.makeModal({ title: 'How to play', size: 'md', content: howToTaco() });
  }
  function openModal(hostId, make) {
    var G = Game && Game.state && Game.state();
    if (G && G.state === 'playing' && !G.paused) Game.input('pause');
    var host = bw.el(hostId);
    if (!host.firstChild) bw.mount(host, make());
    var m = host.firstChild; if (m && m.bw && m.bw.open) m.bw.open();
  }
  var LF_URL = 'https://www.lftechnology.com', BW_URL = 'https://github.com/deftio/bitwrench';
  function lfLink(text) { return { t: 'a', a: { href: LF_URL, target: '_blank', rel: 'noopener' }, c: text || 'Leapfrog' }; }
  function bwLink() { return { t: 'a', a: { href: BW_URL, target: '_blank', rel: 'noopener' }, c: 'bitwrench.js' }; }
  // Leapfrog + Lilypad copy, shared by the About modal and the home-page card
  function leapfrogCopy(short) {
    var out = [
      { t: 'p', a: { style: 'margin:0 0 10px' }, c: [lfLink('Leapfrog Technology'), ' is a software and AI engineering partner. Teams at Leapfrog build custom software, AI, data and cloud products for companies that want to move faster from idea to working product.'] },
      { t: 'p', a: { style: 'margin:0 0 10px' }, c: [{ t: 'b', c: 'Lilypad' }, ' is Leapfrog\u2019s fast-prototype tool. An idea becomes a real, clickable demo in days, not months: built, packaged and deployed to its own private link with one command, so a client can try the thing before anyone commits to a full build. This game is a Lilypad demo.'] }
    ];
    return out;
  }
  function aboutModal() {
    var lf = { t: 'a', a: { href: 'https://www.lftechnology.com', target: '_blank', rel: 'noopener' }, c: 'Leapfrog' };
    var bwl = { t: 'a', a: { href: 'https://github.com/deftio/bitwrench', target: '_blank', rel: 'noopener' }, c: 'bitwrench.js' };
    return bw.makeModal({ title: 'About Lilypad Hopper', size: 'md', content: { t: 'div', a: { class: 'hop_about' }, c: [
      frogIcon(),
      { t: 'p', a: { class: 'bw_fs_lg', style: 'margin:0 0 14px;font-weight:700;text-align:center' }, c: ['Lilypad Hopper by ', lfLink(), '. Built with Lilypad.'] },
      { t: 'div', a: { style: 'text-align:left' }, c: leapfrogCopy(false) },
      { t: 'p', a: { class: 'hop_tag', style: 'margin-top:14px;text-align:center' }, c: [lfLink('Hop on with Leapfrog!')] },
      { t: 'p', a: { class: 'bw_text_muted bw_fs_sm', style: 'margin:6px 0 0;text-align:center' }, c: 'www.lftechnology.com' }
    ] } });
  }
  function openAbout() { openModal('hop_about_host', aboutModal); }
  function openHowTo() { openModal('hop_howto_host', howToModal); }
  function playNow() {
    var G = Game.state(); if (G.state !== 'playing') Game.input('start'); else if (G.paused) Game.input('pause');
    var st = bw.el('hop_stage'); if (st && st.scrollIntoView) st.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function menuItem(text, fn, href) {
    return { t: 'li', a: { class: 'bw_nav_item' }, c: { t: 'a', a: { class: 'bw_nav_link', href: href, onclick: function (e) { e.preventDefault(); fn(); } }, c: text } };
  }
  function menu() {
    return { t: 'nav', a: { class: 'hop_menu', 'aria-label': 'Main' }, c: { t: 'ul', a: { class: 'bw_nav bw_nav_pills' }, c: [
      menuItem('Play', playNow, '#play'),
      menuItem('How to play', openHowTo, '#how'),
      menuItem('About', openAbout, '#about')
    ] } };
  }

  function toggleMute() {
    if (!A) return;
    A.init();
    var m = A.toggle();
    bw.patch('hop_mute_host', bw.makeButton({ text: m ? 'Sound: off' : 'Sound: on', variant: 'outline-secondary', size: 'sm', onclick: function () { toggleMute(); } }));
  }

  function mountApp() {
    bw.loadStyles();            // structural + utility CSS first (never skip)
    bw.loadStyles(THEME);       // then the Leapfrog palette
    bw.injectCSS(customCss(), { id: 'hop_css' });
    bw.mount('#app', pageTaco());

    var cards = { score: bw.el('hud_score').firstChild, best: bw.el('hud_best').firstChild, streak: bw.el('hud_streak').firstChild, lives: bw.el('hud_lives').firstChild };
    var last = {};
    bw.sub('hopper:hud', function (d) {
      ['score', 'best', 'streak', 'lives'].forEach(function (k) {
        if (last[k] !== d[k]) { last[k] = d[k]; var el = cards[k]; if (el && el.bw && el.bw.setValue) el.bw.setValue(String(d[k])); else bw.patch(el.querySelector('.bw_stat_value'), String(d[k])); }
      });
    });
    bw.sub('hopper:state', function (d) {
      var ov = bw.el('hop_overlay');
      if (d.state === 'playing' && !d.paused) { enterFull(); bw.toggleClass(ov, 'hop_hidden', true); return; }
      if (d.state === 'dead') { bw.removeClass(root.document.body, 'hop_full'); var st = bw.el('hop_stage'); if (st && st.scrollIntoView) st.scrollIntoView({ block: 'nearest' }); }
      bw.patch(ov, d.state === 'dead' ? deadSheet(d) : d.state === 'lost' ? lostSheet(d) : d.paused ? pausedSheet() : titleSheet());
      bw.toggleClass(ov, 'hop_hidden', false);
    });
    bw.sub('hopper:mute', toggleMute);

    Game.mount('hop_board');
    var hash = root.location && root.location.hash || '', search = root.location && root.location.search || '';
    if (/#play/.test(hash)) Game.input('start');
    if (/#about/.test(hash)) openAbout();
    if (/#how/.test(hash)) openHowTo();
    // Debugging with bwcli: open the page with ?attach (or ?attach=<port>) while `bwcli attach` is running
    // and the page connects to its REPL (/tree, /listen, /render, /patch, /screenshot).
    var att = /[?&#]attach(?:=(\d+))?/.exec(search + hash);
    if (att) bw.append(root.document.head, { t: 'script', a: { src: 'http://localhost:' + (att[1] || 7902) + '/bw/attach.js' } });
  }

  root.Hopper = { mountApp: mountApp, pageTaco: pageTaco, customCss: customCss, THEME: THEME };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
