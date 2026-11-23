/* sudoku-hint.js — hint engine for the Sudoku photo-hint companion.
 *
 * A plain-JavaScript port of hidden_files/technique_solver.py (same
 * technique ladder, same greedy lowest-tier-first order):
 *   Tier 1 — Easy:   naked single, hidden single
 *   Tier 2 — Medium: naked pair, hidden pair, pointing (box -> line)
 *   Tier 3 — Hard:   naked triple, hidden triple, box-line reduction
 *                    (line -> box), X-wing
 * Anything needing more (chains, guessing) is beyond this book and the
 * engine says so honestly instead of guessing.
 *
 * The engine NEVER reveals the full solution. It returns ONE next
 * logical step: the cell, the digit, the technique name, and a plain-
 * English explanation of the thinking behind it.
 *
 * Usable in the browser (window.SudokuHint) and in Node for tests
 * (module.exports). No dependencies.
 */
(function (root) {
  "use strict";
  var FULL = 0x3fe; // bits 1..9

  var UNITS = [], UNIT_NAME = [];
  var r, c, br, bc;
  for (r = 0; r < 9; r++) { UNITS.push(rowUnit(r)); UNIT_NAME.push(["row", r]); }
  for (c = 0; c < 9; c++) { UNITS.push(colUnit(c)); UNIT_NAME.push(["column", c]); }
  for (br = 0; br < 9; br += 3) for (bc = 0; bc < 9; bc += 3) {
    UNITS.push(boxUnit(br, bc)); UNIT_NAME.push(["box", (br / 3) * 3 + bc / 3]);
  }
  function rowUnit(r) { var u = []; for (var c = 0; c < 9; c++) u.push(r * 9 + c); return u; }
  function colUnit(c) { var u = []; for (var r = 0; r < 9; r++) u.push(r * 9 + c); return u; }
  function boxUnit(br, bc) { var u = []; for (var dr = 0; dr < 3; dr++) for (var dc = 0; dc < 3; dc++) u.push((br + dr) * 9 + bc + dc); return u; }

  var ROW_OF = [], COL_OF = [], BOX_OF = [], PEERS = [], CELL_NAME = [];
  var i, j;
  for (i = 0; i < 81; i++) {
    ROW_OF.push(Math.floor(i / 9)); COL_OF.push(i % 9);
    BOX_OF.push(Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3));
    CELL_NAME.push("row " + (Math.floor(i / 9) + 1) + ", column " + ((i % 9) + 1));
  }
  for (i = 0; i < 81; i++) {
    var s = {};
    for (var u = 0; u < UNITS.length; u++) {
      if (UNITS[u].indexOf(i) >= 0) for (var k = 0; k < 9; k++) s[UNITS[u][k]] = 1;
    }
    delete s[i];
    PEERS.push(Object.keys(s).map(Number).sort(function (a, b) { return a - b; }));
  }

  function bits(mask) { var out = []; for (var d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d); return out; }
  function popcount(n) { var c = 0; while (n) { n &= n - 1; c++; } return c; }
  function combos(arr, k) {
    var out = [];
    (function rec(start, cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (var x = start; x < arr.length; x++) { cur.push(arr[x]); rec(x + 1, cur); cur.pop(); }
    })(0, []);
    return out;
  }

  function Solver(puzzle, maxTier) {
    this.grid = puzzle.slice();
    this.maxTier = maxTier || 3;
    this.hardest = 0;
    this.steps = [];   // placements, in order
    this.elims = [];   // supporting eliminations
    this.cand = new Array(81).fill(0);
    for (var i = 0; i < 81; i++) if (this.grid[i]) this.cand[i] = 1 << this.grid[i];
    for (i = 0; i < 81; i++) {
      if (this.grid[i]) continue;
      var used = 0;
      for (var p = 0; p < PEERS[i].length; p++) if (this.grid[PEERS[i][p]]) used |= 1 << this.grid[PEERS[i][p]];
      this.cand[i] = FULL & ~used;
      if (this.cand[i] === 0) throw new Error("contradiction");
    }
  }
  Solver.prototype.place = function (i, d, technique, tier, why) {
    if (this.grid[i]) return;
    this.grid[i] = d; this.cand[i] = 1 << d;
    this.hardest = Math.max(this.hardest, tier);
    this.steps.push({ cell: i, digit: d, technique: technique, tier: tier, why: why });
    for (var p = 0; p < PEERS[i].length; p++) {
      var j = PEERS[i][p];
      if (!this.grid[j] && (this.cand[j] & (1 << d))) {
        this.cand[j] &= ~(1 << d);
        if (this.cand[j] === 0) throw new Error("contradiction");
      }
    }
  };
  Solver.prototype.eliminate = function (i, d, technique, tier, why) {
    if (this.grid[i] || !(this.cand[i] & (1 << d))) return false;
    this.cand[i] &= ~(1 << d);
    if (this.cand[i] === 0) throw new Error("contradiction");
    this.hardest = Math.max(this.hardest, tier);
    this.elims.push({ cell: i, digit: d, technique: technique, tier: tier, why: why });
    return true;
  };
  Solver.prototype.solved = function () { return this.grid.every(function (v) { return v !== 0; }); };

  Solver.prototype.findSingle = function () {
    var i, d;
    for (i = 0; i < 81; i++) {
      if (!this.grid[i] && this.cand[i] && (this.cand[i] & (this.cand[i] - 1)) === 0) {
        d = 31 - Math.clz32(this.cand[i]);
        this.place(i, d, "Naked single", 1,
          "This cell can only be " + d + " — every other number is already in its row, column or box.");
        return true;
      }
    }
    for (var ui = 0; ui < UNITS.length; ui++) {
      var unit = UNITS[ui], kind = UNIT_NAME[ui][0], n = UNIT_NAME[ui][1];
      for (d = 1; d <= 9; d++) {
        var homes = unit.filter(function (x) { return !this.grid[x] && (this.cand[x] & (1 << d)); }, this);
        if (homes.length === 1) {
          i = homes[0];
          this.place(i, d, "Hidden single", 1,
            "Only one cell in " + kind + " " + (n + 1) + " can be " + d + " — all the other cells in that " + kind +
            " already rule it out. So " + CELL_NAME[i] + " must be " + d + ".");
          return true;
        }
      }
    }
    return false;
  };

  Solver.prototype.tier2Pass = function () {
    var changed = false, self = this;
    for (var ui = 0; ui < UNITS.length; ui++) {
      var unit = UNITS[ui], kind = UNIT_NAME[ui][0], n = UNIT_NAME[ui][1];
      var empties = unit.filter(function (x) { return !self.grid[x]; });
      // naked pair
      var byMask = {};
      empties.forEach(function (x) { if (popcount(self.cand[x]) === 2) (byMask[self.cand[x]] = byMask[self.cand[x]] || []).push(x); });
      Object.keys(byMask).forEach(function (maskStr) {
        var cells = byMask[maskStr];
        if (cells.length !== 2) return;
        var ds = bits(+maskStr);
        empties.forEach(function (x) {
          if (cells.indexOf(x) >= 0) return;
          ds.forEach(function (d) {
            if (self.eliminate(x, d, "Naked pair", 2,
              "Two cells in " + kind + " " + (n + 1) + " can only be " + ds.join(" or ") +
              ", so no other cell in that " + kind + " can be " + ds.join(" or ") + ".")) changed = true;
          });
        });
      });
      // hidden pair: two digits living in exactly the same two cells.
      // BOTH digits must actually occur in the unit (same fix as the
      // Python solver: a digit already placed elsewhere is not a pair).
      combos([1, 2, 3, 4, 5, 6, 7, 8, 9], 2).forEach(function (pair) {
        var d1 = pair[0], d2 = pair[1];
        var only = unit.filter(function (x) {
          return !self.grid[x] && ((self.cand[x] & (1 << d1)) || (self.cand[x] & (1 << d2)));
        });
        if (only.length === 2 &&
            only.some(function (x) { return self.cand[x] & (1 << d1); }) &&
            only.some(function (x) { return self.cand[x] & (1 << d2); })) {
          only.forEach(function (x) {
            bits(self.cand[x]).forEach(function (d) {
              if (d !== d1 && d !== d2) {
                if (self.eliminate(x, d, "Hidden pair", 2,
                  "In " + kind + " " + (n + 1) + ", " + d1 + " and " + d2 +
                  " can only go in two cells, so those cells cannot be anything else.")) changed = true;
              }
            });
          });
        }
      });
      // pointing (box -> line)
      if (ui >= 18) {
        var box = unit;
        for (var d = 1; d <= 9; d++) {
          var homes = box.filter(function (x) { return !self.grid[x] && (self.cand[x] & (1 << d)); });
          if (homes.length < 2) continue;
          var rows = {}, cols = {};
          homes.forEach(function (x) { rows[ROW_OF[x]] = 1; cols[COL_OF[x]] = 1; });
          var rowKeys = Object.keys(rows), colKeys = Object.keys(cols);
          if (rowKeys.length === 1) {
            var rr = +rowKeys[0];
            for (var cc = 0; cc < 9; cc++) {
              var cell = rr * 9 + cc;
              if (box.indexOf(cell) < 0 && !self.grid[cell]) {
                if (self.eliminate(cell, d, "Pointing", 2,
                  "In this box, " + d + " can only go in row " + (rr + 1) +
                  ", so no other cell in row " + (rr + 1) + " can be " + d + ".")) changed = true;
              }
            }
          } else if (colKeys.length === 1) {
            var ccc = +colKeys[0];
            for (var rrr = 0; rrr < 9; rrr++) {
              var cell2 = rrr * 9 + ccc;
              if (box.indexOf(cell2) < 0 && !self.grid[cell2]) {
                if (self.eliminate(cell2, d, "Pointing", 2,
                  "In this box, " + d + " can only go in column " + (ccc + 1) +
                  ", so no other cell in column " + (ccc + 1) + " can be " + d + ".")) changed = true;
              }
            }
          }
        }
      }
    }
    return changed;
  };

  Solver.prototype.tier3Pass = function () {
    var changed = false, self = this;
    for (var ui = 0; ui < UNITS.length; ui++) {
      var unit = UNITS[ui], kind = UNIT_NAME[ui][0], n = UNIT_NAME[ui][1];
      var empties = unit.filter(function (x) { return !self.grid[x]; });
      // naked triple
      combos(empties, 3).forEach(function (trio) {
        var union = 0; trio.forEach(function (x) { union |= self.cand[x]; });
        if (popcount(union) !== 3) return;
        var ds = bits(union);
        empties.forEach(function (x) {
          if (trio.indexOf(x) >= 0) return;
          ds.forEach(function (d) {
            if (self.eliminate(x, d, "Naked triple", 3,
              "Three cells in " + kind + " " + (n + 1) + " can only be " + ds.join(", ") +
              " between them, so no other cell in that " + kind + " can be " + ds.join(", ") + ".")) changed = true;
          });
        });
      });
      // hidden triple
      combos([1, 2, 3, 4, 5, 6, 7, 8, 9], 3).forEach(function (dset) {
        var mask = 0; dset.forEach(function (d) { mask |= 1 << d; });
        var homes = unit.filter(function (x) { return !self.grid[x] && (self.cand[x] & mask); });
        if (homes.length !== 3) return;
        if (!dset.every(function (d) { return homes.some(function (x) { return self.cand[x] & (1 << d); }); })) return;
        homes.forEach(function (x) {
          bits(self.cand[x]).forEach(function (d) {
            if (dset.indexOf(d) < 0) {
              if (self.eliminate(x, d, "Hidden triple", 3,
                "In " + kind + " " + (n + 1) + ", " + dset.join(", ") +
                " can only go in three cells, so those cells cannot be anything else.")) changed = true;
            }
          });
        });
      });
      // box-line reduction (line -> box)
      if (ui < 18) {
        for (var d = 1; d <= 9; d++) {
          var homes2 = unit.filter(function (x) { return !self.grid[x] && (self.cand[x] & (1 << d)); });
          if (homes2.length < 2) continue;
          var boxes = {}; homes2.forEach(function (x) { boxes[BOX_OF[x]] = 1; });
          var boxKeys = Object.keys(boxes);
          if (boxKeys.length === 1) {
            var b = +boxKeys[0], brr = Math.floor(b / 3) * 3, bcc = (b % 3) * 3;
            for (var rrr = brr; rrr < brr + 3; rrr++) for (var ccc = bcc; ccc < bcc + 3; ccc++) {
              var cell = rrr * 9 + ccc;
              if (unit.indexOf(cell) < 0 && !self.grid[cell]) {
                if (self.eliminate(cell, d, "Box-line reduction", 3,
                  "In " + kind + " " + (n + 1) + ", " + d + " can only go in one box, so no other cell in that box can be " + d + ".")) changed = true;
              }
            }
          }
        }
      }
    }
    // X-wing (rows and columns)
    for (var d = 1; d <= 9; d++) {
      var rowHomes = {};
      for (var r = 0; r < 9; r++) {
        var h = [];
        for (var c = 0; c < 9; c++) if (!this.grid[r * 9 + c] && (this.cand[r * 9 + c] & (1 << d))) h.push(c);
        if (h.length === 2) rowHomes[r] = h;
      }
      var rows = Object.keys(rowHomes).map(Number);
      combos(rows, 2).forEach(function (pair) {
        if (rowHomes[pair[0]].join() !== rowHomes[pair[1]].join()) return;
        var c1 = rowHomes[pair[0]][0], c2 = rowHomes[pair[0]][1];
        for (var r = 0; r < 9; r++) {
          if (r === pair[0] || r === pair[1]) continue;
          [c1, c2].forEach(function (cc) {
            if (self.eliminate(r * 9 + cc, d, "X-wing", 3,
              "Look at " + d + ": it can only go in columns " + (c1 + 1) + " and " + (c2 + 1) +
              " in rows " + (pair[0] + 1) + " and " + (pair[1] + 1) +
              ", forming a rectangle. So " + d + " cannot go anywhere else in those two columns.")) changed = true;
          });
        }
      });
      var colHomes = {};
      for (var c = 0; c < 9; c++) {
        var h2 = [];
        for (var r = 0; r < 9; r++) if (!this.grid[r * 9 + c] && (this.cand[r * 9 + c] & (1 << d))) h2.push(r);
        if (h2.length === 2) colHomes[c] = h2;
      }
      var cols = Object.keys(colHomes).map(Number);
      combos(cols, 2).forEach(function (pair) {
        if (colHomes[pair[0]].join() !== colHomes[pair[1]].join()) return;
        var r1 = colHomes[pair[0]][0], r2 = colHomes[pair[0]][1];
        for (var c = 0; c < 9; c++) {
          if (c === pair[0] || c === pair[1]) continue;
          [r1, r2].forEach(function (rr) {
            if (self.eliminate(rr * 9 + c, d, "X-wing", 3,
              "Look at " + d + ": it can only go in rows " + (r1 + 1) + " and " + (r2 + 1) +
              " in columns " + (pair[0] + 1) + " and " + (pair[1] + 1) +
              ", forming a rectangle. So " + d + " cannot go anywhere else in those two rows.")) changed = true;
          });
        }
      });
    }
    return changed;
  };

  Solver.prototype.run = function () {
    try {
      while (!this.solved()) {
        if (this.findSingle()) continue;
        if (this.maxTier >= 2 && this.tier2Pass()) continue;
        if (this.maxTier >= 3 && this.tier3Pass()) continue;
        return false;
      }
      return true;
    } catch (e) { return false; }
  };

  function solve(puzzle, maxTier) {
    var s;
    try { s = new Solver(puzzle, maxTier || 3); } catch (e) { return { solved: false, hardest: 0, steps: [] }; }
    var ok = s.run();
    return { solved: ok, hardest: s.hardest, steps: s.steps };
  }
  function grade(puzzle) {
    var r = solve(puzzle, 3);
    return r.solved ? (r.hardest || 1) : null;
  }
  function nextHint(puzzle) {
    var r = solve(puzzle, 3);
    if (!r.solved || r.steps.length === 0) return null;
    return r.steps[0];
  }
  // Find cells that break Sudoku rules (same digit twice in a row/col/box).
  function findConflicts(grid) {
    var bad = {};
    UNITS.forEach(function (unit) {
      var seen = {};
      unit.forEach(function (x) {
        var v = grid[x];
        if (!v) return;
        if (seen[v] !== undefined) { bad[x] = 1; bad[seen[v]] = 1; }
        else seen[v] = x;
      });
    });
    return Object.keys(bad).map(Number);
  }

  var api = { solve: solve, grade: grade, nextHint: nextHint, findConflicts: findConflicts, CELL_NAME: CELL_NAME };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SudokuHint = api;
})(typeof window !== "undefined" ? window : globalThis);
