// intro.js — 16-bit arcade-style intro cut scene + first-run tutorial.
//
// Flow: TAP TO START -> cut scene (7 scenes) -> title screen -> tutorial -> game.
//
// Text only: each scene has a short "place" slug shown above the dialog
// instead of artwork. Edit the SCENES array to change any line.

(function () {
  "use strict";

  const SEEN_KEY = "tcgscalper.seenIntro";
  const MUTE_KEY = "tcgscalper.muted";

  // ---------------------------------------------------------------------------
  // Script
  // ---------------------------------------------------------------------------
  // who: speaker tag (omit for narration).
  // sfx: "rip" | "ding" | "bulb" sound played when the line starts.
  const SCENES = [
    {
      place: "HEAT KICKS SNEAKERS — 11:47 PM",
      lines: [
        { t: "HEAT KICKS — the last sneaker spot on the block — is closing for good." },
        { who: "YOU", t: "Now that sneaker resale is dead... how will I pay my bills?" }
      ]
    },
    {
      place: "THE STREET OUTSIDE",
      lines: [
        { t: "Across the street, a neon sign buzzes to life..." },
        { who: "YOU", t: "\"Trading cards for sale\"...? Huh." }
      ]
    },
    {
      place: "THE CARD SHOP",
      lines: [
        { who: "SHOP OWNER", t: "Welcome in! Packs are five bucks. Feeling lucky?" },
        { who: "YOU", t: "Eh... why not. Gimme one." }
      ]
    },
    {
      place: "THE CARD SHOP",
      lines: [
        { t: "*RIIIIIP*", sfx: "rip" }
      ]
    },
    {
      place: "THE CARD SHOP",
      lines: [
        { t: "A foil glint flashes through the pack...", sfx: "ding" },
        { who: "YOU", t: "Whoa. Is that... a hit?" }
      ]
    },
    {
      place: "THE CARD SHOP — COUNTER",
      lines: [
        { who: "SHOP OWNER", t: "Nice pull! We sell that exact card for $100 in the case." },
        { who: "YOU", t: "A HUNDRED?! I paid five bucks for the pack!" }
      ]
    },
    {
      place: "THE CARD SHOP — COUNTER",
      lines: [
        { t: "*DING*", sfx: "bulb" },
        { who: "YOU", t: "Buy low. Sell high. I already know this game..." }
      ]
    }
  ];

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
      const place = el("div", { id: "intro-place" });
      const dialog = el("div", { id: "intro-dialog" },
        '<div id="intro-speaker"></div><div id="intro-text"></div><div id="intro-next">▼</div>');
      const fader = el("div", { id: "intro-fader" });
      const skip = el("button", { id: "intro-skip", class: "intro-ctrl", type: "button" }, "SKIP ▶▶");
      const mute = el("button", { id: "intro-mute", class: "intro-ctrl", type: "button" }, muted ? "♪ OFF" : "♪ ON");
      stage.append(place, dialog, fader, skip, mute);
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
        place.textContent = "";
        showScreen(`
          <div class="intro-sub">JAWNPACK PRESENTS</div>
          <div class="intro-press blink">TAP TO START</div>
          <div class="intro-small">© 2026</div>`);
      }

      function loadScene(i) {
        place.textContent = SCENES[i].place || "";
      }

      function typeLine() {
        const line = SCENES[sceneIdx].lines[lineIdx];
        speakerEl.textContent = line.who || "";
        textEl.className = line.who ? "" : "narration";
        fullText = line.t;
        textEl.textContent = "";
        nextEl.style.visibility = "hidden";
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
          place.textContent = "";
          skip.style.display = "none";
          const s = showScreen(`
            <div class="intro-title">THE CARDBOARD<br>FLIP</div>
            <div class="intro-sub">$1,500. 30 DAYS. OPEN YOUR SHOP.</div>
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
      t: "Listen up, rookie. You've got $1,500 and 30 days to raise $12,000 and open your OWN card shop. Do it fast. The day you open is your score." },
    { target: "#topbar",
      t: "The day and your cash. Every day you can visit as many places as you like. Nothing moves until you hit NEXT DAY." },
    { target: "#tb-more",
      t: "Tap MORE for everything else: your boxes, debt, rent and the shop goal. RIP a box there for a shot at THE GRAIL." },
    { target: () => document.querySelectorAll(".places-group")[0],
      t: "BUY spots. Tap one to go there. Game Store = steady. Cost-Mart = cheaper, thin shelves. eComm = wild prices, ships in 3 days." },
    { target: "#counter",
      t: "The counter shows where you're standing. BUY one or MAX. At sell spots it's SELL or ALL. Mystery boxes show up here too." },
    { target: () => document.querySelectorAll(".places-group")[1],
      t: "SELL spots. Marketplace pays every day. The Convention (Sat & Sun) swings the hardest: the crowd goes wild on out-of-print and reprint news, even rumors. Online lets you set your own price. Your Shop unlocks when you open it." },
    { target: "#feed",
      t: "The Feed. Rumors hit a day or three before the market moves. LEAKERS are usually right. CREATORS... are creators. Some rumors are pure cap." },
    { target: "#tb-more",
      t: "Rent is $450, due every 7 days. Come up short and the loan shark covers it at 5% a DAY. You can borrow on purpose to go big on a hot tip. Owe $10K and you're evicted." },
    { target: "#next-day",
      t: "Done for the day? Hit NEXT DAY." },
    { target: null,
      t: "Open your shop and the game keeps going: rent stops, you stock your own shelves, and you hunt THE GRAIL. Watch for mystery boxes and god packs." },
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
