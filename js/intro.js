// intro.js — 16-bit arcade-style intro cut scene + first-run tutorial.
//
// Flow: TAP TO START -> cut scene (7 scenes) -> title screen -> tutorial -> game.
//
// ART: every scene draws a placeholder pixel-art SVG. To drop in real art,
// save a PNG at the scene's `img` path (e.g. img/cutscene/01-closing.png).
// If the file exists it replaces the placeholder automatically; if not,
// the placeholder stays. Target 320x168 (or any 40:21 multiple) and it
// will be scaled up with crisp pixels.

(function () {
  "use strict";

  const SEEN_KEY = "tcgscalper.seenIntro";
  const MUTE_KEY = "tcgscalper.muted";

  // ---------------------------------------------------------------------------
  // Script
  // ---------------------------------------------------------------------------
  // who: speaker tag (omit for narration). fx: "shake" | "flash".
  // sfx: "rip" | "ding" | "bulb" played when the line starts.
  const SCENES = [
    {
      art: "closing",
      img: "img/cutscene/01-closing.png",
      lines: [
        { t: "TUESDAY. 11:47 PM." },
        { t: "HEAT KICKS — the last sneaker spot on the block — is closing for good." },
        { who: "YOU", t: "Now that sneaker resale is dead... how will I pay my bills?" }
      ]
    },
    {
      art: "acrossStreet",
      img: "img/cutscene/02-across-street.png",
      lines: [
        { t: "Across the street, a neon sign buzzes to life..." },
        { who: "YOU", t: "\"Trading cards for sale\"...? Huh." }
      ]
    },
    {
      art: "shopInside",
      img: "img/cutscene/03-card-shop.png",
      lines: [
        { who: "SHOP OWNER", t: "Welcome in! Packs are five bucks. Feeling lucky?" },
        { who: "YOU", t: "Eh... why not. Gimme one." }
      ]
    },
    {
      art: "rip",
      img: "img/cutscene/04-rip.png",
      lines: [
        { t: "*RIIIIIP*", fx: "shake", sfx: "rip" }
      ]
    },
    {
      art: "hit",
      img: "img/cutscene/05-the-hit.png",
      lines: [
        { t: "A foil glint flashes through the pack...", fx: "flash", sfx: "ding" },
        { who: "YOU", t: "Whoa. Is that... a hit?" }
      ]
    },
    {
      art: "counter",
      img: "img/cutscene/06-counter.png",
      lines: [
        { who: "SHOP OWNER", t: "Nice pull! We sell that exact card for $100 in the case." },
        { who: "YOU", t: "A HUNDRED?! I paid five bucks for the pack!" }
      ]
    },
    {
      art: "bulb",
      img: "img/cutscene/07-light-bulb.png",
      lines: [
        { t: "*DING*", sfx: "bulb" },
        { who: "YOU", t: "Buy low. Sell high. I already know this game..." }
      ]
    }
  ];

  // ---------------------------------------------------------------------------
  // Placeholder pixel art (viewBox 160x84, 1 unit = 1 "pixel")
  // ---------------------------------------------------------------------------
  const r = (x, y, w, h, c, extra = "") =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" ${extra}/>`;
  const txt = (x, y, s, c, t, extra = "") =>
    `<text x="${x}" y="${y}" font-size="${s}" fill="${c}" font-family="'Press Start 2P',monospace" text-anchor="middle" ${extra}>${t}</text>`;

  // Tiny pixel person. x,y = top-left of head. s = scale.
  function person(x, y, o = {}, s = 1) {
    const skin = o.skin || "#c98b5a", hair = o.hair || "#2b1b12",
      shirt = o.shirt || "#c0392b", pants = o.pants || "#23304f";
    const p = (px, py, w, h, c) => r(x + px * s, y + py * s, w * s, h * s, c);
    let out = "";
    out += p(1, 0, 6, 2, hair) + p(1, 2, 6, 5, skin) + p(0, 1, 1, 3, hair);
    out += p(2, 3, 1, 1, "#111") + p(5, 3, 1, 1, "#111");
    if (o.glasses) out += p(1, 3, 3, 1, "#222") + p(4, 3, 3, 1, "#222");
    if (o.cap) out += p(0, 0, 8, 2, o.cap) + p(6, 1, 3, 1, o.cap);
    out += p(0, 7, 8, 9, shirt) + p(-2, 8, 2, 7, shirt) + p(8, 8, 2, 7, shirt);
    out += p(-2, 15, 2, 2, skin) + p(8, 15, 2, 2, skin);
    if (o.apron) out += p(2, 9, 4, 7, o.apron);
    out += p(1, 16, 3, 7, pants) + p(4, 16, 3, 7, pants);
    out += p(0, 23, 4, 2, "#111") + p(4, 23, 4, 2, "#111");
    return out;
  }
  const YOU = { shirt: "#c0392b", hair: "#1d140e", skin: "#c98b5a" };
  const OWNER = { shirt: "#e8e1c9", hair: "#8a8a8a", skin: "#e0b08a", apron: "#2e7d4f", glasses: true };

  function rain() {
    let d = "";
    for (let i = 0; i < 40; i++) {
      const x = (i * 37) % 160, y = (i * 23) % 84;
      d += r(x, y, 1, 4, "#6d7bd6", 'opacity=".55"');
    }
    return `<g class="px-rain">${d}</g>`;
  }
  function stars() {
    let d = "";
    for (let i = 0; i < 18; i++) d += r((i * 53) % 160, (i * 11) % 18, 1, 1, "#cfd6ff");
    return d;
  }
  function packs(x, y, cols, rows) {
    const colors = ["#e06666", "#ffe27a", "#6fa8dc", "#93c47d", "#c27ba0", "#f6b26b"];
    let d = "";
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const c = colors[(i + j * 2) % colors.length];
        d += r(x + i * 7, y + j * 11, 5, 8, c) + r(x + i * 7, y + j * 11, 5, 1, "#fff", 'opacity=".6"');
      }
    return d;
  }

  const ART = {
    closing: () => `
      ${r(0, 0, 160, 84, "#0b0f2a")}${stars()}
      ${r(14, 8, 132, 66, "#3a2f4a")}${r(14, 8, 132, 3, "#241c30")}
      ${r(30, 12, 100, 12, "#1a1422")}${txt(80, 21, 7, "#e06666", "HEAT KICKS", 'class="px-flicker"')}
      ${r(22, 30, 84, 36, "#10131f")}${r(22, 30, 84, 2, "#5a4c6e")}
      ${r(28, 44, 72, 2, "#5a4c6e")}${r(28, 56, 72, 2, "#5a4c6e")}
      ${r(34, 40, 8, 4, "#777")}
      ${r(30, 34, 68, 8, "#ffe27a", 'transform="rotate(-6 64 38)"')}
      ${txt(64, 40.5, 4.6, "#c0392b", "STORE CLOSING", 'transform="rotate(-6 64 38)"')}
      ${r(112, 36, 24, 38, "#1a1422")}${r(114, 38, 20, 36, "#0a0c14")}
      ${person(119, 46, YOU)}
      ${r(0, 74, 160, 10, "#4a4a58")}${r(0, 74, 160, 1, "#6b6b7a")}
      ${r(100, 70, 10, 4, "#b98a4a")}${r(100, 70, 10, 1, "#d8a95a")}
      ${rain()}`,

    acrossStreet: () => `
      ${r(0, 0, 160, 84, "#0b0f2a")}${stars()}
      ${r(30, 6, 100, 50, "#1f4f5a")}${r(30, 6, 100, 3, "#153840")}
      <g class="px-flicker">${r(38, 10, 84, 16, "#07121a")}
        ${txt(80, 17, 4.6, "#ff5fa2", "TRADING CARDS")}${txt(80, 24, 4.6, "#6ff0ff", "FOR SALE")}</g>
      ${r(38, 30, 56, 24, "#ffd98a")}${packs(41, 32, 7, 2)}
      ${r(100, 30, 22, 26, "#0f2a30")}${r(102, 32, 18, 24, "#ffcf70")}
      ${r(0, 56, 160, 6, "#4a4a58")}${r(0, 62, 160, 22, "#1b1b24")}
      ${r(8, 72, 14, 2, "#e0d060")}${r(40, 72, 14, 2, "#e0d060")}${r(72, 72, 14, 2, "#e0d060")}${r(104, 72, 14, 2, "#e0d060")}${r(136, 72, 14, 2, "#e0d060")}
      <g>${r(10, 58, 8, 2, YOU.hair)}${r(10, 60, 8, 5, YOU.hair)}${r(8, 65, 12, 19, YOU.shirt)}</g>
      ${rain()}`,

    shopInside: () => `
      ${r(0, 0, 160, 84, "#f3e2b8")}${r(0, 0, 160, 4, "#d9c08a")}
      ${r(6, 8, 64, 36, "#8b5a2b")}${packs(10, 11, 8, 3)}
      ${r(90, 8, 64, 36, "#8b5a2b")}${packs(94, 11, 8, 3)}
      ${r(0, 44, 160, 40, "#c9a36a")}
      ${person(70, 30, OWNER)}
      ${r(20, 56, 120, 28, "#5b3a1e")}${r(20, 56, 120, 3, "#7a4f2a")}
      ${r(28, 62, 104, 16, "#9fe6ff", 'opacity=".55"')}${r(34, 66, 6, 8, "#ffe27a")}${r(46, 66, 6, 8, "#e06666")}${r(58, 66, 6, 8, "#6fa8dc")}
      ${r(96, 50, 8, 6, "#e06666")}${txt(100, 54.5, 3, "#fff", "$5")}`,

    rip: () => `
      ${r(0, 0, 160, 84, "#1c2a8c")}
      ${[...Array(12)].map((_, i) => r(80 - 1, 42 - 1, 90, 2, "#2a3ab0", `transform="rotate(${i * 30} 80 42)"`)).join("")}
      ${r(64, 18, 32, 56, "#e06666")}${r(64, 18, 32, 4, "#fff", 'opacity=".4"')}
      ${r(68, 30, 24, 24, "#ffe27a")}${r(72, 34, 16, 16, "#c0392b")}
      ${txt(80, 64, 3.6, "#fff", "BOOSTER")}
      ${r(60, 12, 42, 4, "#1c2a8c", 'transform="rotate(-8 80 14)"')}
      ${r(56, 22, 8, 16, YOU.skin)}${r(96, 22, 8, 16, YOU.skin)}
      ${txt(80, 10, 8, "#ffe27a", "RIIIP!", 'stroke="#000" stroke-width="1" paint-order="stroke"')}`,

    hit: () => `
      ${r(0, 0, 160, 84, "#0b0f2a")}
      ${[...Array(16)].map((_, i) => r(79, 41, 100, 2, i % 2 ? "#ffe27a" : "#fff", `opacity=".35" transform="rotate(${i * 22.5} 80 42)"`)).join("")}
      ${r(62, 10, 36, 50, "#ffe27a")}${r(64, 12, 32, 46, "#fff8d0")}
      ${r(66, 14, 28, 20, "#ff5fa2")}${r(66, 18, 28, 4, "#ffe27a")}${r(66, 24, 28, 4, "#6ff0ff")}${r(66, 30, 28, 4, "#93c47d")}
      ${r(74, 18, 12, 12, "#fff", 'opacity=".7"')}
      ${r(66, 38, 28, 3, "#888")}${r(66, 44, 20, 2, "#aaa")}${r(66, 48, 24, 2, "#aaa")}
      <g class="px-sparkle">${r(54, 12, 3, 3, "#fff")}${r(102, 20, 3, 3, "#fff")}${r(56, 50, 2, 2, "#fff")}${r(100, 54, 2, 2, "#fff")}${r(80, 4, 2, 2, "#fff")}</g>
      ${r(56, 60, 10, 8, YOU.skin)}${r(94, 60, 10, 8, YOU.skin)}
      ${txt(80, 76, 5, "#ffe27a", "★ HOLO ★")}`,

    counter: () => `
      ${r(0, 0, 160, 84, "#f3e2b8")}${r(0, 0, 160, 4, "#d9c08a")}
      ${r(6, 8, 50, 30, "#8b5a2b")}${packs(10, 11, 6, 2)}
      ${person(106, 32, OWNER)}
      ${person(30, 38, YOU)}
      ${r(88, 36, 10, 14, "#ffe27a")}${r(89, 37, 8, 6, "#ff5fa2")}
      ${r(70, 56, 90, 28, "#5b3a1e")}${r(70, 56, 90, 3, "#7a4f2a")}
      ${r(74, 60, 34, 14, "#fff")}${r(74, 60, 34, 3, "#e06666")}
      ${txt(91, 71.5, 7, "#c0392b", "$100")}
      ${r(0, 72, 70, 12, "#c9a36a")}`,

    bulb: () => `
      ${r(0, 0, 160, 84, "#1c2a8c")}
      ${[...Array(12)].map((_, i) => r(80, 20, 70, 2, "#ffe27a", `opacity=".35" transform="rotate(${i * 30} 80 21)"`)).join("")}
      <g class="px-bob">${r(72, 6, 16, 16, "#fff3a0")}${r(70, 8, 20, 12, "#fff3a0")}${r(76, 10, 6, 6, "#fff")}
        ${r(74, 22, 12, 3, "#aaa")}${r(75, 25, 10, 2, "#888")}</g>
      ${r(58, 32, 44, 10, YOU.hair)}${r(58, 40, 44, 34, YOU.skin)}${r(54, 38, 4, 14, YOU.hair)}${r(102, 38, 4, 14, YOU.hair)}
      ${r(66, 50, 8, 6, "#fff")}${r(86, 50, 8, 6, "#fff")}${r(69, 52, 4, 4, "#111")}${r(89, 52, 4, 4, "#111")}
      ${r(70, 64, 20, 3, "#7a3a2a")}${r(68, 62, 3, 3, "#7a3a2a")}${r(89, 62, 3, 3, "#7a3a2a")}
      ${r(50, 74, 60, 10, YOU.shirt)}`
  };

  function svgFor(name) {
    return `<svg viewBox="0 0 160 84" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${ART[name]()}</svg>`;
  }

  // ---------------------------------------------------------------------------
  // Chiptune-ish sound (WebAudio, no files)
  // ---------------------------------------------------------------------------
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) {}

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type = "square", vol = 0.05, when = 0) {
    if (muted || !audio()) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur);
  }
  function noise(dur, vol = 0.12) {
    if (muted || !audio()) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; g.gain.value = vol;
    src.connect(g).connect(ctx.destination); src.start();
  }
  const SFX = {
    blip: () => tone(660, 0.04, "square", 0.025),
    rip: () => noise(0.5),
    ding: () => { tone(988, 0.15); tone(1319, 0.3, "square", 0.05, 0.12); },
    bulb: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "square", 0.05, i * 0.09)),
    start: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, "square", 0.05, i * 0.07)),
    select: () => tone(880, 0.06, "square", 0.04)
  };

  // ---------------------------------------------------------------------------
  // Cut scene engine
  // ---------------------------------------------------------------------------
  function el(tag, attrs = {}, html = "") {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    e.innerHTML = html;
    return e;
  }

  function runCutscene() {
    return new Promise(resolve => {
      const overlay = el("div", { id: "intro-overlay", role: "dialog", "aria-label": "Intro" });
      const stage = el("div", { id: "intro-stage" });
      const art = el("div", { id: "intro-art" });
      const dialog = el("div", { id: "intro-dialog" },
        '<div id="intro-speaker"></div><div id="intro-text"></div><div id="intro-next">▼</div>');
      const fader = el("div", { id: "intro-fader" });
      const skip = el("button", { id: "intro-skip", class: "intro-ctrl", type: "button" }, "SKIP ▶▶");
      const mute = el("button", { id: "intro-mute", class: "intro-ctrl", type: "button" }, muted ? "♪ OFF" : "♪ ON");
      stage.append(art, dialog, fader, skip, mute);
      overlay.append(stage);
      document.body.append(overlay);
      document.body.style.overflow = "hidden";

      const speakerEl = dialog.querySelector("#intro-speaker");
      const textEl = dialog.querySelector("#intro-text");
      const nextEl = dialog.querySelector("#intro-next");

      let mode = "attract"; // attract -> scene -> title -> done
      let sceneIdx = 0, lineIdx = 0;
      let typing = null, fullText = "", busy = false;

      function showScreen(html) {
        stage.querySelectorAll(".intro-screen").forEach(n => n.remove());
        const s = el("div", { class: "intro-screen" }, html);
        stage.append(s);
        return s;
      }

      function attract() {
        dialog.style.display = "none";
        art.innerHTML = "";
        showScreen(`
          <div class="intro-sub">JAWNPACK PRESENTS</div>
          <div class="intro-press blink">TAP TO START</div>
          <div class="intro-small">© 2026</div>`);
      }

      function loadScene(i) {
        const sc = SCENES[i];
        art.innerHTML = svgFor(sc.art);
        if (sc.img) {
          const probe = new Image();
          probe.onload = () => { if (sceneIdx === i && mode === "scene") art.innerHTML = `<img src="${sc.img}" alt="">`; };
          probe.src = sc.img;
        }
      }

      function typeLine() {
        const line = SCENES[sceneIdx].lines[lineIdx];
        speakerEl.textContent = line.who || "";
        textEl.className = line.who ? "" : "narration";
        fullText = line.t;
        textEl.textContent = "";
        nextEl.style.visibility = "hidden";
        if (line.fx) {
          stage.classList.remove("fx-shake", "fx-flash");
          void stage.offsetWidth; // restart animation
          stage.classList.add("fx-" + line.fx);
        }
        if (line.sfx) SFX[line.sfx]();
        let n = 0;
        clearInterval(typing);
        typing = setInterval(() => {
          n++;
          textEl.textContent = fullText.slice(0, n);
          if (n % 2 === 0 && fullText[n - 1] !== " ") SFX.blip();
          if (n >= fullText.length) finishTyping();
        }, 32);
      }
      function finishTyping() {
        clearInterval(typing); typing = null;
        textEl.textContent = fullText;
        nextEl.style.visibility = "visible";
      }

      function fadeThen(fn) {
        busy = true;
        fader.classList.add("on");
        setTimeout(() => { fn(); fader.classList.remove("on"); setTimeout(() => (busy = false), 350); }, 380);
      }

      function startScenes() {
        mode = "scene";
        SFX.start();
        fadeThen(() => {
          stage.querySelectorAll(".intro-screen").forEach(n => n.remove());
          dialog.style.display = "";
          sceneIdx = 0; lineIdx = 0;
          loadScene(0);
          typeLine();
        });
      }

      function title() {
        mode = "title";
        clearInterval(typing);
        fadeThen(() => {
          dialog.style.display = "none";
          art.innerHTML = "";
          stage.classList.remove("fx-shake", "fx-flash");
          skip.style.display = "none";
          const s = showScreen(`
            <div class="intro-title">TCG<br>SCALPER</div>
            <div class="intro-sub">30 DAYS. $1,000. BUY LOW. SELL HIGH.</div>
            <div class="intro-menu">
              <button type="button" data-choice="tutorial">HOW TO PLAY</button>
              <button type="button" data-choice="play">JUMP RIGHT IN</button>
            </div>`);
          SFX.bulb();
          const first = s.querySelector("button");
          setTimeout(() => first && first.focus(), 850);
          s.querySelectorAll("button").forEach(b =>
            b.addEventListener("click", ev => {
              ev.stopPropagation();
              SFX.select();
              finish(b.dataset.choice === "tutorial");
            }));
        });
      }

      function advance() {
        if (busy) return;
        if (mode === "attract") return startScenes();
        if (mode !== "scene") return;
        if (typing) return finishTyping();
        const sc = SCENES[sceneIdx];
        if (lineIdx < sc.lines.length - 1) { lineIdx++; return typeLine(); }
        if (sceneIdx < SCENES.length - 1) {
          fadeThen(() => { sceneIdx++; lineIdx = 0; loadScene(sceneIdx); typeLine(); });
          return;
        }
        title();
      }

      function onKey(e) {
        if (mode === "title") return; // menu buttons handle their own keys
        if (e.key === "Escape") { e.preventDefault(); if (mode === "scene") title(); return; }
        if ([" ", "Enter", "ArrowRight"].includes(e.key)) { e.preventDefault(); advance(); }
      }

      function finish(wantsTutorial) {
        mode = "done";
        clearInterval(typing);
        document.removeEventListener("keydown", onKey);
        try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) {}
        fader.classList.add("on");
        setTimeout(() => {
          overlay.remove();
          document.body.style.overflow = "";
          resolve({ tutorial: wantsTutorial });
        }, 400);
      }

      overlay.addEventListener("click", advance);
      document.addEventListener("keydown", onKey);
      skip.addEventListener("click", e => { e.stopPropagation(); audio(); title(); });
      mute.addEventListener("click", e => {
        e.stopPropagation();
        muted = !muted;
        mute.textContent = muted ? "♪ OFF" : "♪ ON";
        try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (err) {}
      });

      attract();
    });
  }

  // ---------------------------------------------------------------------------
  // Tutorial (coach marks over the real game UI)
  // ---------------------------------------------------------------------------
  const TUTORIAL = [
    { target: null,
      t: "Listen up, rookie. You've got 30 days and $1,000. When day 30 ends, CASH is your score. Unsold product counts for nothing." },
    { target: ".stats-inventory",
      t: "Your wallet, where you're standing, and your stash. Online orders show up here with an arrival countdown." },
    { target: () => document.querySelectorAll(".locations")[0],
      t: "BUY spots. Game Store = steady stock. Cost-Mart = thin shelves. eCommerce = wild prices, and it ships in 3 days." },
    { target: ".market-locations",
      t: "Today's prices where you're standing. Tap BUY to grab one box at a time. Every store's price is different." },
    { target: () => document.querySelectorAll(".locations")[1],
      t: "SELL spots. Head to The Marketplace or a TCG Convention to flip what you're holding." },
    { target: () => { const e = document.getElementById("rumor"); return e && e.parentElement; },
      t: "Rumors from your favorite creator. Low stock, a big reprint, no more printing... whatever it is, it hits the market the NEXT day." },
    { target: ".online-store",
      t: "Or list online at your own price. It can sell while you do other things. Get too greedy and it'll just sit there." },
    { target: ".next-day",
      t: "Done for the day? Hit NEXT DAY. Heads up: a clock is always ticking. Every 2 minutes, shelves sell out. Move fast." },
    { target: null, last: true,
      t: "That's the game. Buy low. Sell high. Don't go broke. Let's see what you've got." }
  ];

  function runTutorial() {
    return new Promise(resolve => {
      const shield = el("div", { id: "tut-shield" });
      const spot = el("div", { id: "tut-spot" });
      const box = el("div", { id: "tut-box", role: "dialog", "aria-live": "polite" });
      document.body.append(shield, spot, box);
      let i = 0;

      function resolveTarget(t) {
        if (!t) return null;
        return typeof t === "function" ? t() : document.querySelector(t);
      }

      function show() {
        const step = TUTORIAL[i];
        const target = resolveTarget(step.target);
        box.innerHTML = `
          <div class="tut-who">SHOP OWNER</div>
          <div class="tut-step">${i + 1} / ${TUTORIAL.length}</div>
          <div>${step.t}</div>
          <div class="tut-row">
            <button type="button" data-a="skip">${step.last ? "" : "SKIP"}</button>
            <button type="button" class="primary" data-a="next">${step.last ? "LET'S GO ▶" : "NEXT ▶"}</button>
          </div>`;
        const skipBtn = box.querySelector('[data-a="skip"]');
        if (step.last) skipBtn.style.visibility = "hidden";
        skipBtn.onclick = done;
        box.querySelector('[data-a="next"]').onclick = () => { SFX.select(); i++; i < TUTORIAL.length ? show() : done(); };

        if (target) {
          target.scrollIntoView({ block: "center" });
          requestAnimationFrame(() => {
            const b = target.getBoundingClientRect(), pad = 6;
            Object.assign(spot.style, {
              display: "block", left: b.left - pad + "px", top: b.top - pad + "px",
              width: b.width + pad * 2 + "px", height: b.height + pad * 2 + "px"
            });
            const targetInTopHalf = b.top + b.height / 2 < window.innerHeight / 2;
            box.style.top = targetInTopHalf ? "" : "16px";
            box.style.bottom = targetInTopHalf ? "16px" : "";
          });
        } else {
          Object.assign(spot.style, { display: "block", left: "50%", top: "50%", width: "0px", height: "0px" });
          box.style.top = "50%"; box.style.bottom = "";
          box.style.transform = "translate(-50%, -50%)";
          return;
        }
        box.style.transform = "translateX(-50%)";
      }

      function done() {
        shield.remove(); spot.remove(); box.remove();
        window.scrollTo(0, 0);
        resolve();
      }

      show();
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  function shouldPlay() {
    try {
      if (new URLSearchParams(location.search).has("intro")) return true;
      return localStorage.getItem(SEEN_KEY) !== "1";
    } catch (e) { return true; }
  }

  // renderBoard: draws the game UI so the tutorial has something to point at.
  async function run(renderBoard) {
    const { tutorial } = await runCutscene();
    if (tutorial) {
      if (typeof renderBoard === "function") renderBoard();
      await runTutorial();
    }
  }

  function addReplayButton() {
    const b = el("button", { class: "replay-intro", type: "button" }, "▶ Replay intro & tutorial");
    b.addEventListener("click", () => {
      if (confirm("Replaying the intro restarts your current run. Continue?")) {
        location.href = location.pathname + "?intro=1";
      }
    });
    document.body.append(b);
  }

  window.Intro = { run, shouldPlay, runCutscene, runTutorial, addReplayButton, SCENES };
})();
