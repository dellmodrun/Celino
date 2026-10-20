'use strict';
/**
 * Nacreum note engine — `note = f(serial)`.
 *
 * A pure, deterministic function: the same serial yields the same note on any machine,
 * forever. Nothing is stored; anyone can recompute (and thus verify) a note from its serial.
 * This is the exact engine the nacreum.xyz site runs in the browser.
 */

var SUPPLY = 1000000000;
var DENOMS_LADDER = [1, 5, 10, 20, 50, 100, 500, 1000, 5000, 10000, 100000, 1000000];

function rng(seed) {
  seed = seed >>> 0;
  return function () {
    seed = (seed + 0x6d2b79f5) >>> 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(r, a) { return a[Math.floor(r() * a.length)]; }

var PRE = ['Nac','Vel','Mar','Sol','Ith','Or','Cal','Ser','Aur','Bre','Pel','Tor','Yl','Zan','Cor','Fen','Dal','Rho','Ulm','Kes'];
var MID = ['a','o','e','i','u','ae','ia','or','en','ael'];
var SUF = ['reum','land','ova','ska','dor','mar','nia','gard','stan','essa','wyn','tia','holm','mere'];
var DENOMS = [1,1,1,1,1,5,5,5,10,10,10,20,20,50,50,100,100,500,1000,5000,10000,100000,1000000];
var PALS = [
  ['Verdigris', ['#e9f2ec','#1f5c46','#2e7d5b']], ['Sienna', ['#f6ede1','#7a3b18','#a85a2a']],
  ['Indigo', ['#e9ecf6','#26306e','#3b4aa0']], ['Vermilion', ['#f7ebe6','#8a2f14','#c0492a']],
  ['Slate', ['#eceef0','#2c3540','#4a5866']], ['Amethyst', ['#f0eaf4','#4a2a6e','#6f47a0']],
  ['Ochre', ['#f6f0df','#6b5310','#9a7a1e']], ['Teal', ['#e6f1f2','#0f4f56','#1f7d86']]
];
var SERIES = ['A','B','C','D','E','F','H','K','M','R','S','T','W','Z'];

function fmt(id) { var s = String(id); while (s.length < 8) s = '0' + s; return s; }

function fancy(id) {
  var s = fmt(id);
  if (id <= 100) return 'low serial';
  if (/^(\d)\1{7}$/.test(s)) return 'solid serial';
  if (s === s.split('').reverse().join('')) return 'radar serial';
  if ('01234567' === s || '12345678' === s || '23456789' === s) return 'ladder serial';
  return null;
}

/**
 * Compute the full deterministic descriptor for a note.
 * @param {number} id serial, 1..1_000_000_000
 * @returns {{id:number,nation:string,denom:number,palette:string,colors:string[],series:string,rarity:string,special:string,isError:boolean,serial:string,grid:number[][]}}
 */
function generate(id) {
  id = Math.max(1, Math.min(SUPPLY, id | 0));
  var r = rng((id * 2654435761) >>> 0);
  var nation = pick(r, PRE) + pick(r, MID) + pick(r, SUF);
  var denom = pick(r, DENOMS), pal = pick(r, PALS), series = pick(r, SERIES);
  var roll = r(), fan = fancy(id), isError = r() < 0.004;
  var rarity, special = fan ? fan : 'standard';
  if (isError) { rarity = 'error'; special = pick(r, ['inverted seal','wrong-colour pass','offset print','double serial']); }
  else if (denom === 1000000) rarity = 'legendary';
  else if (denom >= 1000 || fan) rarity = 'rare';
  else if (denom >= 50 || roll > 0.94) rarity = 'uncommon';
  else rarity = 'common';
  var er = rng((id ^ 0x85ebca6b) >>> 0), grid = [];
  for (var y = 0; y < 8; y++) {
    grid[y] = [];
    for (var x = 0; x < 4; x++) grid[y][x] = er() < 0.5 ? 1 : 0;
    grid[y][4] = grid[y][3]; grid[y][5] = grid[y][2]; grid[y][6] = grid[y][1]; grid[y][7] = grid[y][0];
  }
  return {
    id: id, nation: nation.charAt(0).toUpperCase() + nation.slice(1), denom: denom,
    palette: pal[0], colors: pal[1], series: series, rarity: rarity, special: special,
    isError: isError, serial: series + '-' + fmt(id), grid: grid
  };
}

/** Render a note descriptor as an SVG string (face value may be overridden, e.g. after break/fuse). */
function svg(g, opts) {
  opts = opts || {};
  var denom = (opts.denom != null) ? opts.denom : g.denom;
  var bg = g.colors[0], ink = g.colors[1], accent = g.colors[2];
  var r = rng((g.id ^ 0x9e3779b9) >>> 0), guil = '';
  for (var i = 0; i < 7; i++) {
    var cx = 40 + r() * 260, cy = 30 + r() * 90, rx = 20 + r() * 60, ry = 8 + r() * 30, rot = Math.floor(r() * 180);
    guil += '<ellipse cx="' + cx.toFixed(0) + '" cy="' + cy.toFixed(0) + '" rx="' + rx.toFixed(0) + '" ry="' + ry.toFixed(0) + '" transform="rotate(' + rot + ' ' + cx.toFixed(0) + ' ' + cy.toFixed(0) + ')" fill="none" stroke="' + accent + '" stroke-opacity="0.28" stroke-width="0.7"/>';
  }
  var d = Number(denom).toLocaleString('en-US');
  return '<svg viewBox="0 0 400 176" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="banknote ' + d + '">'
    + '<rect width="400" height="176" fill="' + bg + '"/>'
    + '<rect x="6" y="6" width="388" height="164" fill="none" stroke="' + ink + '" stroke-width="1.5"/>'
    + guil
    + '<text x="24" y="34" font-family="Georgia,serif" font-size="15" fill="' + ink + '" font-weight="bold">BANK OF ' + g.nation.toUpperCase() + '</text>'
    + '<text x="330" y="52" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="' + ink + '" font-weight="bold">' + d + '</text>'
    + '<text x="24" y="150" font-family="monospace" font-size="12" fill="' + ink + '">' + g.serial + '</text>'
    + '<text x="376" y="150" text-anchor="end" font-family="monospace" font-size="9" fill="' + ink + '">' + g.rarity.toUpperCase() + '</text>'
    + '</svg>';
}

module.exports = { SUPPLY: SUPPLY, DENOMS: DENOMS_LADDER, generate: generate, svg: svg };
