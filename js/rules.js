// rules.js — rent, debt, shop goal, ripping and Grail odds.
// Shared by the game (js/game.js) and the balance simulator (tools/simulate.js).
// Every number a designer might tune lives in RULES.

(function (root) {
  "use strict";

  const RULES = {
    startCash: 1500,
    mainDays: 30,          // the main game: open your shop before this ends
    maxDays: 120,          // hard stop for the post-game Grail hunt

    // Rent is due every 7 days. Can't cover it? The shortfall becomes debt.
    rentEvery: 7,
    rent: [450],           // flat $450 every 7 days (sim: casual players break even, skilled shop day unchanged)
    rentStepAfter: 0,

    // Debt / loan shark
    debtRate: 0.05,        // 5% per day, compounding
    borrowLimit: 5000,     // max you can voluntarily borrow (total debt)
    evictAt: 10000,        // debt past this = evicted, run over

    // Shop goal
    lease: 12000,          // cash needed to open your card shop (sim: strong players ~Day 20, flip-only ~Day 27)
    shopIncome: [40, 120],  // daily walk-in sales (singles, sleeves) once open; rent stops once you own the shop
    // Your shop's shelves: boxes you stock and price yourself. No platform fee,
    // better odds than online. Chance per box per day = atValue at/below value,
    // minus perTenPctOver for every 10% your price is above value.
    shelf: { fee: 0, atValue: 0.8, perTenPctOver: 0.2, min: 0.02 },

    // Ripping sealed boxes you own. Cash back comes from selling the singles.
    // Each row: [chance, minMultiple, maxMultiple] of what you paid.
    rip: [
      [0.60, 0.20, 0.55],   // bricked
      [0.28, 0.60, 1.10],   // decent
      [0.10, 1.10, 2.20],   // nice hits
      [0.02, 3.00, 6.00]    // monster box
    ],
    grailDollarsPerPercent: 500, // Grail odds per box = box value / (this x 100). $200 box ≈ 1 in 250
    godPackChance: 1 / 50,       // per box ripped
    godPackCashBack: [3, 5],     // god pack pays this multiple of the box
    godPackGrailBoost: 15,       // and multiplies that box's Grail odds

    // Mystery boxes: sometimes a store has one unlabeled box.
    mysteryChancePerDay: 0.35,   // chance a given buy store has one today
    mysteryPrice: [120, 220],
    mystery: [
      // [chance, outcome, minMultiple, maxMultiple]
      [0.60, "junk",   0.15, 0.50],
      [0.30, "decent", 0.80, 1.60],
      [0.08, "big",    3.00, 6.00],
      [0.019, "god",   0, 0],     // a god pack: big cash back + boosted Grail odds
      [0.001, "grail", 0, 0]      // THE GRAIL, straight out of the box
    ],

    grailName: "THE GRAIL"
  };

  function rentForWeek(week) {
    if (week <= RULES.rent.length) return RULES.rent[week - 1];
    return RULES.rent[RULES.rent.length - 1] + (week - RULES.rent.length) * RULES.rentStepAfter;
  }
  function rentDue(day) {
    return day % RULES.rentEvery === 0 ? rentForWeek(day / RULES.rentEvery) : 0;
  }
  function nextRent(day) {
    const d = Math.floor(day / RULES.rentEvery + 1) * RULES.rentEvery;
    return { day: d, amount: rentForWeek(d / RULES.rentEvery) };
  }

  const pickRow = (rows, r) => {
    let acc = 0;
    for (const row of rows) { acc += row[0]; if (r < acc) return row; }
    return rows[rows.length - 1];
  };

  // Rip one box. value = what the box is worth today (drives cash back + odds).
  // rand() should be per-player (Math.random), not the market seed.
  function ripBox(value, rand = Math.random, grailBoost = 1) {
    const god = rand() < RULES.godPackChance;
    let cashBack;
    if (god) {
      cashBack = value * (RULES.godPackCashBack[0] + rand() * (RULES.godPackCashBack[1] - RULES.godPackCashBack[0]));
    } else {
      const row = pickRow(RULES.rip, rand());
      cashBack = value * (row[1] + rand() * (row[2] - row[1]));
    }
    const odds = Math.min(0.5, (value / (RULES.grailDollarsPerPercent * 100)) * (god ? RULES.godPackGrailBoost : 1) * grailBoost);
    const grail = rand() < odds;
    return { cashBack: Math.round(cashBack), god, grail, odds };
  }

  function openMystery(price, rand = Math.random) {
    const row = pickRow(RULES.mystery, rand());
    const outcome = row[1];
    if (outcome === "grail") return { outcome, cashBack: 0, grail: true, god: false };
    if (outcome === "god") {
      const g = RULES.godPackCashBack;
      const odds = Math.min(0.5, (price / (RULES.grailDollarsPerPercent * 100)) * RULES.godPackGrailBoost);
      return { outcome, cashBack: Math.round(price * (g[0] + rand() * (g[1] - g[0]))), grail: rand() < odds, god: true };
    }
    return { outcome, cashBack: Math.round(price * (row[2] + rand() * (row[3] - row[2]))), grail: false, god: false };
  }

  function rankFor(r) {
    // r: { evicted, shopDay, grailBox, netWorth }
    if (r.evicted) return "EVICTED";
    if (r.shopDay && r.grailBox) return "GRAIL KEEPER";
    if (r.shopDay) return "CARD SHOP OWNER";
    if (r.netWorth >= RULES.lease * 0.6) return "TABLE VENDOR";
    if (r.netWorth >= RULES.startCash * 2) return "WEEKEND FLIPPER";
    return "COUCH FLIPPER";
  }

  const api = { RULES, rentDue, nextRent, rentForWeek, ripBox, openMystery, rankFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TCGRules = api;
})(typeof window !== "undefined" ? window : globalThis);
