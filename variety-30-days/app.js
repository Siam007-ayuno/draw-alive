/* app.js — QR hub for "Large Print Variety Puzzle Book for Seniors".
   One static page + data/puzzles.json. No server, no account.
   Scan a puzzle's code -> pick Hint / Check my answer / Show solution
   for THAT puzzle only. The hub never shows another puzzle's answer
   on screen (the JSON file does contain all answers, as it must for a
   static checker — the promise is about what the page SHOWS).
   Audio: the phone's built-in speech (speechSynthesis) reads word
   lists and quotes aloud. No audio files, nothing to record.
   Pure logic functions are exported for node testing; DOM code only
   runs in a browser.
*/
"use strict";

function wsCells(puzzle, word) {
  var pl = puzzle.placements[word];
  if (pl) return cellsFromPlacement(pl, word.length);
  if (word === puzzle.hidden) return cellsFromPlacement(puzzle.hidden_placement, word.length);
  return null;
}
function cellsFromPlacement(pl, len) {
  var out = [];
  for (var k = 0; k < len; k++) out.push([pl[0] + pl[2] * k, pl[1] + pl[3] * k]);
  return out;
}

function sudokuCheck(givens, solution, entered) {
  // entered: 81-char string, '0' = empty. Returns per-cell state.
  var out = [];
  for (var i = 0; i < 81; i++) {
    if (givens[i] !== "0") out.push("given");
    else if (entered[i] === "0") out.push("empty");
    else out.push(entered[i] === solution[i] ? "right" : "wrong");
  }
  return out;
}
function sudokuNextHint(givens, solution, entered) {
  // First cell the solver has wrong or empty, in reading order.
  for (var i = 0; i < 81; i++) {
    if (givens[i] === "0" && entered[i] !== solution[i])
      return { cell: i, digit: solution[i] };
  }
  return null;
}

function xwAnswer(puzzle, num, dir) {
  var list = dir === "A" ? puzzle.across : puzzle.down;
  for (var i = 0; i < list.length; i++) if (list[i].num === num) return list[i];
  return null;
}
function xwCells(entry, dir) {
  var out = [];
  for (var k = 0; k < entry.word.length; k++)
    out.push(dir === "A" ? [entry.row, entry.col + k] : [entry.row + k, entry.col]);
  return out;
}
function xwNextLetter(entry, dir, revealed) {
  // revealed: Set of "r,c" already shown. Returns next unrevealed cell or null.
  var cells = xwCells(entry, dir);
  for (var k = 0; k < cells.length; k++) {
    var key = cells[k][0] + "," + cells[k][1];
    if (!revealed.has(key))
      return { cell: cells[k], letter: entry.word[k], index: k };
  }
  return null;
}

var FREQ_ORDER = "ETAOINSHRDLUCMFWYPVBGKQJXZ";
function cryptoFreqLetters(quote) {
  var counts = {};
  for (var i = 0; i < quote.length; i++) {
    var ch = quote[i].toUpperCase();
    if (/[A-Z]/.test(ch)) counts[ch] = (counts[ch] || 0) + 1;
  }
  return Object.keys(counts).sort(function (a, b) {
    return counts[b] - counts[a] || FREQ_ORDER.indexOf(a) - FREQ_ORDER.indexOf(b);
  });
}
function cryptoDecode(cipher, mapping, revealedPlain) {
  // revealedPlain: Set of plain letters the solver may see.
  var inv = {};
  Object.keys(mapping).forEach(function (p) { inv[mapping[p]] = p; });
  var out = "";
  for (var i = 0; i < cipher.length; i++) {
    var ch = cipher[i];
    if (/[A-Z]/.test(ch)) {
      var plain = inv[ch];
      out += revealedPlain.has(plain) ? plain : "_";
    } else out += ch;
  }
  return out;
}

if (typeof module !== "undefined") {
  module.exports = {
    wsCells: wsCells, sudokuCheck: sudokuCheck,
    sudokuNextHint: sudokuNextHint, xwAnswer: xwAnswer,
    xwCells: xwCells, xwNextLetter: xwNextLetter,
    cryptoFreqLetters: cryptoFreqLetters, cryptoDecode: cryptoDecode
  };
}
