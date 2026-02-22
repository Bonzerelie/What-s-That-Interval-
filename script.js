/* /script.js
   Identifying Musical Intervals
   Shared template behaviours: iframe auto-height, scroll forwarding, modal template, unified pulse timing.
   Interval options: m2 → P8 (no unison).
   Audio samples (optional): audio/{stem}{octave}.mp3 (C3..C5).
*/
(() => {
  "use strict";

  // ---------------- constants ----------------
  const AUDIO_DIR = "audio";

  // Notes are limited to C3..C5 (inclusive)
  const MIN_PITCH = pitchFromPcOct(0, 3); // C3
  const MAX_PITCH = pitchFromPcOct(0, 5); // C5

  // Interval playback timings
  const NOTE_PLAY_SEC = 1.15;
  const GAP_SEC = 0.18;
  const ROUND_START_DELAY_SEC = 0.25;

  // Feedback UI sounds (optional)
  const SND_CORRECT = "correct1.mp3";
  const SND_INCORRECT = "incorrect1.mp3";
  const SND_BACK = "back1.mp3";

  const PC_TO_STEM = {
    0: "c",
    1: "csharp",
    2: "d",
    3: "dsharp",
    4: "e",
    5: "f",
    6: "fsharp",
    7: "g",
    8: "gsharp",
    9: "a",
    10: "asharp",
    11: "b",
  };

  const PC_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const PC_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  // Interval options: m2 → P8 (12 types)
  const IVL_ALL = [
    { code: "m2", name: "minor second", semitones: 1 },
    { code: "M2", name: "major second", semitones: 2 },
    { code: "m3", name: "minor third", semitones: 3 },
    { code: "M3", name: "major third", semitones: 4 },
    { code: "P4", name: "perfect fourth", semitones: 5 },
    { code: "A4/d5", name: "tritone", semitones: 6 },
    { code: "P5", name: "perfect fifth", semitones: 7 },
    { code: "m6", name: "minor sixth", semitones: 8 },
    { code: "M6", name: "major sixth", semitones: 9 },
    { code: "m7", name: "minor seventh", semitones: 10 },
    { code: "M7", name: "major seventh", semitones: 11 },
    { code: "P8", name: "perfect octave", semitones: 12 },
  ];

  // ---------------- DOM ----------------
  const $ = (id) => document.getElementById(id);

  const titleWrap = $("titleWrap");
  const titleImgWide = $("titleImgWide");
  const titleImgWrapped = $("titleImgWrapped");

  const settingsBtn = $("settingsBtn");
  const infoBtn = $("infoBtn");
  const resetBtn = $("restartBtn");

  const replayBtn = $("replayBtn");
  const nextBtn = $("nextBtn");
  const downloadScoreBtn = $("downloadScoreBtn");

  const answerButtons = $("answerButtons");
  const feedbackOut = $("feedbackOut");
  const scoreOut = $("scoreOut");

  const keyboardWrap = $("keyboardWrap");
  const miniMount = $("miniMount");

  const settingsModal = $("settingsModal");
  const settingsClose = $("settingsClose");
  const settingsApply = $("settingsApply");
  const intervalCountSel = $("intervalCountSel");
  const rootModeSel = $("rootModeSel");
  const rootNoteSel = $("rootNoteSel");

  const infoModal = $("infoModal");
  const modalBody = $("modalBody");
  const modalClose = $("modalClose");

  const SND_SELECT = "select1.mp3";

  const required = [
    settingsBtn, infoBtn, resetBtn,
    replayBtn, nextBtn, downloadScoreBtn,
    answerButtons, feedbackOut, scoreOut,
    keyboardWrap, miniMount,
    settingsModal, settingsClose, settingsApply, intervalCountSel, rootModeSel, rootNoteSel,
    infoModal, modalBody, modalClose,
  ];
  if (required.some((x) => !x)) {
    alert("UI mismatch: required elements missing. Ensure index.html ids match script.js.");
    return;
  }

  // ---------------- title image wide/wrapped (match other games) ----------------
  function setTitleMode(mode) {
    if (!titleWrap) return;
    titleWrap.classList.toggle("titleModeWide", mode === "wide");
    titleWrap.classList.toggle("titleModeWrapped", mode === "wrapped");
  }

  function refreshTitleMode() {
    if (!titleImgWide || !titleImgWrapped) return;
    const wideOk = titleImgWide.naturalWidth > 0;
    const wrapOk = titleImgWrapped.naturalWidth > 0;
    if (!wideOk && wrapOk) setTitleMode("wrapped");
    else setTitleMode("wide");
  }

  if (titleImgWide) titleImgWide.addEventListener("load", refreshTitleMode);
  if (titleImgWrapped) titleImgWrapped.addEventListener("load", refreshTitleMode);
  window.addEventListener("resize", refreshTitleMode);

  // ---------------- iframe sizing (template) ----------------
  let lastHeight = 0;
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const h = Math.ceil(entry.contentRect.height);
      if (h !== lastHeight) {
        parent.postMessage({ iframeHeight: h }, "*");
        lastHeight = h;
      }
    }
  });
  ro.observe(document.documentElement);

  function postHeightNow() {
    try {
      const h = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      parent.postMessage({ iframeHeight: h }, "*");
    } catch {}
  }

  window.addEventListener("load", () => {
    postHeightNow();
    setTimeout(postHeightNow, 250);
    setTimeout(postHeightNow, 1000);
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(postHeightNow, 100);
    setTimeout(postHeightNow, 500);
  });

  function enableScrollForwardingToParent() {
    const SCROLL_GAIN = 6.0;
    const isVerticallyScrollable = () =>
      document.documentElement.scrollHeight > window.innerHeight + 2;

    const isInteractiveTarget = (t) =>
      t instanceof Element && !!t.closest("button, a, input, select, textarea, label");

    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lockedMode = null;

    let lastMoveTs = 0;
    let vScrollTop = 0;

    window.addEventListener(
      "touchstart",
      (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        const t = e.target;

        lockedMode = null;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        lastY = startY;

        lastMoveTs = e.timeStamp || performance.now();
        vScrollTop = 0;

        if (isInteractiveTarget(t)) lockedMode = "x";
      },
      { passive: true }
    );

    window.addEventListener(
      "touchmove",
      (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        if (isVerticallyScrollable()) return;

        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;

        const dx = x - startX;
        const dy = y - startY;

        if (!lockedMode) {
          if (Math.abs(dy) > Math.abs(dx) + 4) lockedMode = "y";
          else if (Math.abs(dx) > Math.abs(dy) + 4) lockedMode = "x";
          else return;
        }
        if (lockedMode !== "y") return;

        const nowTs = e.timeStamp || performance.now();
        const dt = Math.max(8, nowTs - lastMoveTs);
        lastMoveTs = nowTs;

        const fingerStep = (y - lastY) * SCROLL_GAIN;
        lastY = y;

        const scrollTopDelta = -fingerStep;
        const instV = scrollTopDelta / dt;
        vScrollTop = vScrollTop * 0.75 + instV * 0.25;

        e.preventDefault();
        parent.postMessage({ scrollTopDelta }, "*");
      },
      { passive: false }
    );

    function endGesture() {
      if (lockedMode === "y" && Math.abs(vScrollTop) > 0.05) {
        const capped = Math.max(-5.5, Math.min(5.5, vScrollTop));
        parent.postMessage({ scrollTopVelocity: capped }, "*");
      }
      lockedMode = null;
      vScrollTop = 0;
    }

    window.addEventListener("touchend", endGesture, { passive: true });
    window.addEventListener("touchcancel", endGesture, { passive: true });

    window.addEventListener(
      "wheel",
      (e) => {
        if (isVerticallyScrollable()) return;
        parent.postMessage({ scrollTopDelta: e.deltaY }, "*");
      },
      { passive: true }
    );
  }
  enableScrollForwardingToParent();

  // ---------------- audio (WebAudio) ----------------
  let audioCtx = null;
  let masterGain = null;

  const bufferPromiseCache = new Map();
  const activeVoices = new Set();
  let lastPlayToken = 0;

  let synthFallbackWarned = false;

  const activeUiAudios = new Set();

  function ensureAudioGraph() {
    if (audioCtx) return audioCtx;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      alert("Your browser doesn’t support Web Audio (required for playback).");
      return null;
    }

    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.95;
    masterGain.connect(audioCtx.destination);

    return audioCtx;
  }

  async function resumeAudioIfNeeded() {
    const ctx = ensureAudioGraph();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {}
    }
  }

  function trackVoice(src, gainNode, startTime) {
    const voice = { src, gain: gainNode, startTime };
    activeVoices.add(voice);
    src.onended = () => activeVoices.delete(voice);
    return voice;
  }

  function stopAllNotes(fadeSec = 0.06) {
    const ctx = ensureAudioGraph();
    if (!ctx) return;
    const now = ctx.currentTime;

    const fade = Math.max(0.02, Number.isFinite(fadeSec) ? fadeSec : 0.06);

    for (const v of Array.from(activeVoices)) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, fade / 6);
        const stopAt = Math.max(now + fade, (v.startTime || now) + 0.001);
        v.src.stop(stopAt + 0.02);
      } catch {}
    }
  }

  function stopUiSounds() {
    for (const a of Array.from(activeUiAudios)) {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {}
      activeUiAudios.delete(a);
    }
  }

  function stopAllAudio(fadeSec = 0.06) {
    stopUiSounds();
    stopAllNotes(fadeSec);
  }

  function noteUrl(stem, octaveNum) {
    return `${AUDIO_DIR}/${stem}${octaveNum}.mp3`;
  }

  function loadBuffer(url) {
    if (bufferPromiseCache.has(url)) return bufferPromiseCache.get(url);

    const p = (async () => {
      const ctx = ensureAudioGraph();
      if (!ctx) return null;

      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        return await ctx.decodeAudioData(ab);
      } catch {
        return null;
      }
    })();

    bufferPromiseCache.set(url, p);
    return p;
  }

  function playBufferWindowed(buffer, whenSec, playSec, fadeOutSec, gain = 1) {
    const ctx = ensureAudioGraph();
    if (!ctx || !masterGain) return null;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const g = ctx.createGain();
    const safeGain = Math.max(0, Number.isFinite(gain) ? gain : 1);

    const fadeIn = 0.01;
    const endAt = whenSec + Math.max(0.05, playSec);

    g.gain.setValueAtTime(0, whenSec);
    g.gain.linearRampToValueAtTime(safeGain, whenSec + fadeIn);

    const fadeStart = Math.max(whenSec + 0.02, endAt - Math.max(0.06, fadeOutSec));
    g.gain.setValueAtTime(safeGain, fadeStart);
    g.gain.linearRampToValueAtTime(0, endAt);

    src.connect(g);
    g.connect(masterGain);

    trackVoice(src, g, whenSec);
    src.start(whenSec);
    src.stop(endAt + 0.03);
    return src;
  }

  function pitchToFrequency(pitch) {
    const midi = Number(pitch) + 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function playSynthToneWindowed(pitch, whenSec, playSec, fadeOutSec, gain = 1) {
    const ctx = ensureAudioGraph();
    if (!ctx || !masterGain) return null;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitchToFrequency(pitch), whenSec);

    const g = ctx.createGain();
    const safeGain = Math.max(0, Number.isFinite(gain) ? gain : 1);

    const fadeIn = 0.01;
    const endAt = whenSec + Math.max(0.05, playSec);

    g.gain.setValueAtTime(0, whenSec);
    g.gain.linearRampToValueAtTime(safeGain, whenSec + fadeIn);

    const fadeStart = Math.max(whenSec + 0.02, endAt - Math.max(0.06, fadeOutSec));
    g.gain.setValueAtTime(safeGain, fadeStart);
    g.gain.linearRampToValueAtTime(0, endAt);

    osc.connect(g);
    g.connect(masterGain);

    trackVoice(osc, g, whenSec);
    osc.start(whenSec);
    osc.stop(endAt + 0.03);
    return osc;
  }

  function maybeWarnSynthFallback(missingUrl) {
    if (synthFallbackWarned) return;
    synthFallbackWarned = true;
    console.warn("Audio sample(s) missing; using synthesized tones instead:", missingUrl);
    setFeedback(
      `Audio samples not found; using synthesized tones.<br/><small>Missing: <code>${missingUrl}</code></small>`
    );
  }

  function pcFromPitch(p) {
    return ((p % 12) + 12) % 12;
  }
  function octFromPitch(p) {
    return Math.floor(p / 12);
  }
  function pitchFromPcOct(pc, oct) {
    return oct * 12 + pc;
  }

  function getStemForPc(pc) {
    return PC_TO_STEM[(pc + 12) % 12] || null;
  }

  function pitchLabel(pitch) {
    const pc = pcFromPitch(pitch);
    const oct = octFromPitch(pitch);
    const isAcc = [1, 3, 6, 8, 10].includes(pc);
    if (!isAcc) return `${PC_NAMES_SHARP[pc]}${oct}`;
    return `${PC_NAMES_SHARP[pc]}${oct} / ${PC_NAMES_FLAT[pc]}${oct}`;
  }

  async function loadPitchBuffer(pitch) {
    const pc = pcFromPitch(pitch);
    const oct = octFromPitch(pitch);
    const stem = getStemForPc(pc);
    if (!stem) return { missingUrl: "(unknown)", buffer: null, pitch };

    const url = noteUrl(stem, oct);
    const buf = await loadBuffer(url);
    if (!buf) return { missingUrl: url, buffer: null, pitch };
    return { missingUrl: null, buffer: buf, pitch };
  }

  function playUiSound(filename) {
    try {
      const a = new Audio(`${AUDIO_DIR}/${filename}`);
      activeUiAudios.add(a);
      a.onended = () => activeUiAudios.delete(a);
      a.play();
    } catch {}
  }

  // ---------------- mini keyboard SVG ----------------
  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs = {}, children = []) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    for (const c of children) n.appendChild(c);
    return n;
  }

  function isBlackPc(pc) {
    return [1, 3, 6, 8, 10].includes(pc);
  }

  function whiteIndexInOctave(pc) {
    const m = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
    return m[pc] ?? null;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function computeTwoOctaveWindowForSet(pitches) {
    const minP = Math.min(...pitches);
    const maxP = Math.max(...pitches);

    let startC = pitchFromPcOct(0, octFromPitch(minP));
    let endC = startC + 24;

    if (maxP > endC) {
      startC += 12;
      endC = startC + 24;
    }

    const hardLo = pitchFromPcOct(0, 3); // C3
    const hardHi = pitchFromPcOct(0, 5) + 12; // headroom

    startC = clamp(startC, hardLo, hardHi);
    endC = clamp(endC, hardLo, hardHi);
    return { lo: startC, hi: endC };
  }

  function buildMiniKeyboard(pitches, highlightFirstPitch, highlightSecondPitch) {
    miniMount.innerHTML = "";

    if (!pitches?.length) {
      const s = el("svg", {
        width: 780,
        height: 128,
        viewBox: "0 0 780 128",
        preserveAspectRatio: "xMidYMid meet",
      });
      miniMount.appendChild(s);
      return;
    }

    const { lo, hi } = computeTwoOctaveWindowForSet(pitches);

    const all = [];
    for (let p = lo; p <= hi; p++) all.push(p);

    const WHITE_W = 26;
    const WHITE_H = 92;
    const BLACK_W = 16;
    const BLACK_H = 58;
    const BORDER = 8;
    const RADIUS = 14;

    const whitePitches = all.filter((p) => whiteIndexInOctave(pcFromPitch(p)) != null);
    if (!whitePitches.length) {
      const s = el("svg", { width: 780, height: 128, viewBox: "0 0 780 128" });
      miniMount.appendChild(s);
      return;
    }

    const totalWhite = whitePitches.length;
    const innerW = totalWhite * WHITE_W;
    const outerW = innerW + BORDER * 2;
    const outerH = WHITE_H + BORDER * 2;

    const s = el("svg", {
      width: 780,
      height: 128,
      viewBox: `0 0 ${outerW} ${outerH}`,
      preserveAspectRatio: "xMidYMid meet",
    });

    const style = el("style", {}, []);
    style.textContent =
      `.bg{fill:#f3f3f3}
       .frame{fill:#ffffff;stroke:rgba(0,0,0,.18);stroke-width:2}
       .w rect{fill:#ffffff;stroke:rgba(0,0,0,.18);stroke-width:1}
       .b rect{fill:#111111;stroke:rgba(0,0,0,.25);stroke-width:1}
       .first rect{fill: var(--firstNote, #4da3ff) !important;}
       .second rect{fill: var(--secondNote, #34c759) !important;}
       .lbl{font: 900 12px Arial; fill: rgba(0,0,0,.55); user-select:none}
      `;
    s.appendChild(style);

    s.appendChild(
      el("rect", { class: "bg", x: 0, y: 0, width: outerW, height: outerH, rx: RADIUS, ry: RADIUS })
    );
    s.appendChild(
      el("rect", { class: "frame", x: 1, y: 1, width: outerW - 2, height: outerH - 2, rx: RADIUS, ry: RADIUS })
    );

    const gW = el("g", {});
    const gB = el("g", {});
    s.appendChild(gW);
    s.appendChild(gB);

    const startX = BORDER;
    const startY = BORDER;

    const whiteIndexByPitch = new Map();
    let wi = 0;
    for (const p of whitePitches) whiteIndexByPitch.set(p, wi++);

    for (const p of whitePitches) {
      const pc = pcFromPitch(p);
      const oct = octFromPitch(p);
      const name = `${PC_NAMES_SHARP[pc]}${oct}`;

      const x = startX + (whiteIndexByPitch.get(p) || 0) * WHITE_W;

      const grp = el("g", { class: "w" });
      grp.appendChild(el("rect", { x, y: startY, width: WHITE_W, height: WHITE_H }));

      const text = el("text", {
        x: x + WHITE_W / 2,
        y: startY + WHITE_H - 12,
        "text-anchor": "middle",
        class: "lbl",
      });
      text.textContent = pc === 0 ? name : "";
      grp.appendChild(text);

      if (p === highlightFirstPitch) grp.classList.add("first");
      if (p === highlightSecondPitch) grp.classList.add("second");
      gW.appendChild(grp);
    }

    for (let p = lo; p <= hi; p++) {
      const pc = pcFromPitch(p);
      if (!isBlackPc(pc)) continue;

      const leftPcByBlack = { 1: 0, 3: 2, 6: 5, 8: 7, 10: 9 };
      const leftPc = leftPcByBlack[pc];
      if (leftPc == null) continue;

      const oct = octFromPitch(p);
      const leftWhitePitch = pitchFromPcOct(leftPc, oct);

      const wIndex = whiteIndexByPitch.get(leftWhitePitch);
      if (wIndex == null) continue;

      const leftX = startX + wIndex * WHITE_W;
      const x = leftX + WHITE_W - BLACK_W / 2;

      const grp = el("g", { class: "b" });
      grp.appendChild(el("rect", { x, y: startY, width: BLACK_W, height: BLACK_H }));

      if (p === highlightFirstPitch) grp.classList.add("first");
      if (p === highlightSecondPitch) grp.classList.add("second");
      gB.appendChild(grp);
    }

    miniMount.appendChild(s);
  }

  // ---------------- state ----------------
  const score = {
    asked: 0,
    correct: 0,
    incorrect: 0,
    streak: 0,
    longest: 0,
    history: [],
  };

  const settings = {
    intervalCount: 12,
    rootMode: "random",
    fixedRootPitch: pitchFromPcOct(0, 4),
  };

    let settingsModalLocked = false;
let started = false;
  let canAnswer = false;
  let awaitingNext = false;
  let question = null;

  // ---------------- UI helpers ----------------
  function setFeedback(html) {
    feedbackOut.innerHTML = html || "";
  }

  function setKeyboardVisible(visible) {
    keyboardWrap.classList.toggle("hidden", !visible);
    if (!visible) miniMount.innerHTML = "";
  }

  function scorePercent() {
    if (score.asked <= 0) return 0;
    return Math.round((score.correct / score.asked) * 1000) / 10;
  }

  function renderScore() {
    const items = [
      ["Questions asked", score.asked],
      ["Answers correct", score.correct],
      ["Answers incorrect", score.incorrect],
      ["Correct in a row", score.streak],
      ["Longest correct streak", Math.max(score.longest, score.streak)],
      ["Percentage correct", `${scorePercent()}%`],
    ];

    scoreOut.innerHTML =
      `<div class="scoreGrid scoreGridVertical">` +
      items
        .map(
          ([k, v]) =>
            `<div class="scoreItem"><span class="scoreK">${k}</span><span class="scoreV">${v}</span></div>`
        )
        .join("") +
      `</div>`;
  }

  function clampInt(v, lo, hi) {
    const n = Number.parseInt(String(v), 10);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }

  function activeIntervals() {
    const n = clampInt(settings.intervalCount, 2, IVL_ALL.length);
    return IVL_ALL.slice(0, n);
  }

  function updateControls() {
    replayBtn.disabled = !started || !question;
    replayBtn.classList.toggle("pulse", started && !!question && !awaitingNext);

    const answersDisabled = !started || awaitingNext || !canAnswer || !question;
    answerButtons.querySelectorAll("button").forEach((b) => (b.disabled = answersDisabled));

    nextBtn.disabled = !started || !awaitingNext;
    nextBtn.classList.toggle("nextReady", started && awaitingNext);

    downloadScoreBtn.disabled = !started;
  }

  function clearAnswerMarks() {
    answerButtons.querySelectorAll("button").forEach((b) => {
      b.classList.remove("correct", "incorrect");
    });
  }

  function lockAfterAnswer() {
    canAnswer = false;
    awaitingNext = true;
    updateControls();
  }

  // ---------------- settings UI ----------------
  function titleCase(s) {
    return String(s)
      .split(/\s+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ");
  }

  function populateIntervalCountOptions() {
    intervalCountSel.innerHTML = "";
    for (let n = 2; n <= IVL_ALL.length; n++) {
      const last = IVL_ALL[n - 1];
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = `Intervals: ${n} (m2 → ${last.code})`;
      intervalCountSel.appendChild(opt);
    }
  }

  function maxIntervalSemitonesForCount(count) {
    const n = clampInt(count, 2, IVL_ALL.length);
    return IVL_ALL[n - 1].semitones;
  }

  function buildRootOptions() {
    const count = clampInt(intervalCountSel.value, 2, IVL_ALL.length);
    const maxSemi = maxIntervalSemitonesForCount(count);
    const maxRoot = MAX_PITCH - maxSemi;

    rootNoteSel.innerHTML = "";
    for (let p = MIN_PITCH; p <= maxRoot; p++) {
      const opt = document.createElement("option");
      opt.value = String(p);
      opt.textContent = pitchLabel(p);
      rootNoteSel.appendChild(opt);
    }

    const desired = settings.fixedRootPitch;
    const desiredStr = String(desired);
    const exists = [...rootNoteSel.options].some((o) => o.value === desiredStr);
    if (exists) rootNoteSel.value = desiredStr;
    else rootNoteSel.selectedIndex = 0;
  }

  function syncRootModeUi() {
    rootNoteSel.disabled = rootModeSel.value !== "fixed";
  }

  function showSettingsModal({ purpose } = { purpose: "begin" }) {
    stopAllAudio(0.06);
    if (purpose === "settings") playUiSound(SND_SELECT);

    // Lock the initial settings screen (cannot close via overlay/Escape).
    settingsModalLocked = (purpose === "begin" && !started);

    settingsModal.classList.remove("hidden");
    // Ensure the card starts at the top if it needs internal scrolling.
    const card = settingsModal.querySelector('.modalCard');
    if (card) card.scrollTop = 0;

    intervalCountSel.value = String(settings.intervalCount);
    rootModeSel.value = settings.rootMode;
    buildRootOptions();
    rootNoteSel.value = String(settings.fixedRootPitch);
    syncRootModeUi();

    const isBegin = purpose === "begin" || !started;
    settingsApply.textContent = isBegin ? "Begin Game" : "Apply & Restart";
    settingsApply.classList.toggle("pulse", isBegin);
    // Hide Close on the initial locked modal.
    settingsClose.classList.toggle("hidden", settingsModalLocked);
    // Make overlay click behavior explicit.
    settingsModal.dataset.locked = settingsModalLocked ? "1" : "0";
    settingsApply.focus();
  }

  function hideSettingsModal() {
    if (settingsModalLocked && !started) return;
    settingsModalLocked = false;
    settingsModal.classList.add("hidden");
  }

  // ---------------- question generation ----------------
  function randIntInclusive(lo, hi) {
    const a = Math.ceil(lo);
    const b = Math.floor(hi);
    if (b < a) return a;
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function pickQuestion() {
    const list = activeIntervals();
    const interval = list[Math.floor(Math.random() * list.length)];
    const d = interval.semitones;

    let rootPitch = settings.fixedRootPitch;

    if (settings.rootMode === "random") {
      const maxRoot = MAX_PITCH - d;
      rootPitch = randIntInclusive(MIN_PITCH, maxRoot);
    }

    const highPitch = rootPitch + d;

    if (rootPitch < MIN_PITCH || rootPitch > MAX_PITCH) return null;
    if (highPitch < MIN_PITCH || highPitch > MAX_PITCH) return null;

    return { rootPitch, highPitch, interval };
  }

  async function playCurrentInterval({ allowAnswerAfter = true, delaySec = 0 } = {}) {
    if (!started || !question) return;

    const token = ++lastPlayToken;

    if (allowAnswerAfter) {
      canAnswer = false;
      awaitingNext = false;
    } else {
      canAnswer = false;
    }
    updateControls();

    // Requirement: note playback stops any other sounds (including UI correct/incorrect sounds).
    stopAllAudio(0.08);
    await resumeAudioIfNeeded();

    const ctx = ensureAudioGraph();
    if (!ctx) return;

    const safeDelay = Math.max(0, Number.isFinite(delaySec) ? delaySec : 0);
    const t0 = ctx.currentTime + 0.03 + safeDelay;

    const [a1, a2] = await Promise.all([
      loadPitchBuffer(question.rootPitch),
      loadPitchBuffer(question.highPitch),
    ]);

    const missing = [a1, a2].find((r) => r && r.missingUrl);
    if (missing?.missingUrl) maybeWarnSynthFallback(missing.missingUrl);

    if (allowAnswerAfter) {
      const startInMs = Math.max(0, Math.round((t0 - ctx.currentTime) * 1000));
      window.setTimeout(() => {
        if (token !== lastPlayToken) return;
        if (!awaitingNext) {
          canAnswer = true;
          updateControls();
        }
      }, startInMs);
    }

    if (a1.buffer) playBufferWindowed(a1.buffer, t0, NOTE_PLAY_SEC, 0.08, 0.85);
    else playSynthToneWindowed(question.rootPitch, t0, NOTE_PLAY_SEC, 0.08, 0.25);

    if (a2.buffer) playBufferWindowed(a2.buffer, t0 + NOTE_PLAY_SEC + GAP_SEC, NOTE_PLAY_SEC, 0.08, 0.85);
    else playSynthToneWindowed(question.highPitch, t0 + NOTE_PLAY_SEC + GAP_SEC, NOTE_PLAY_SEC, 0.08, 0.25);
  }

  async function startNewRound({ autoplay = true } = {}) {
    if (!started) return;

    awaitingNext = false;
    canAnswer = false;
    clearAnswerMarks();
    setKeyboardVisible(false);
    updateControls();

    question = pickQuestion();
    setFeedback("Listen carefully…");

    if (autoplay) {
      await new Promise(requestAnimationFrame);
      setFeedback("Choose the interval you hear.");
      await playCurrentInterval({ allowAnswerAfter: true, delaySec: ROUND_START_DELAY_SEC });
    } else {
      setFeedback("Press <strong>Replay Interval</strong> to hear the notes.");
    }
  }

  // ---------------- answers ----------------
  function buildAnswerButtons() {
    answerButtons.innerHTML = "";

    IVL_ALL.forEach((itv, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "intervalBtn";
      b.dataset.index = String(idx);
      b.innerHTML = `${itv.code} <small>${titleCase(itv.name)}</small>`;
      b.addEventListener("click", () => onAnswer(idx));
      answerButtons.appendChild(b);
    });

    refreshAnswerVisibility();
  }

  function refreshAnswerVisibility() {
    const n = clampInt(settings.intervalCount, 2, IVL_ALL.length);
    answerButtons.querySelectorAll("button").forEach((b, i) => {
      b.style.display = i < n ? "" : "none";
    });
  }

  function markCorrectButton(intervalCode) {
    const idx = IVL_ALL.findIndex((x) => x.code === intervalCode);
    const btn = answerButtons.querySelector(`button[data-index="${idx}"]`);
    if (btn) btn.classList.add("correct");
  }

  function onAnswer(intervalIndex) {
    if (!started || !question || !canAnswer || awaitingNext) return;

    const chosen = IVL_ALL[intervalIndex];
    const correct = question.interval;

    score.asked += 1;

    const isCorrect = chosen.code === correct.code;
    const rootLbl = pitchLabel(question.rootPitch);
    const highLbl = pitchLabel(question.highPitch);

    if (isCorrect) {
      score.correct += 1;
      score.streak += 1;
      score.longest = Math.max(score.longest, score.streak);

      const btn = answerButtons.querySelector(`button[data-index="${intervalIndex}"]`);
      if (btn) btn.classList.add("correct");

      setFeedback(
        `Correct! ✅<br/>` +
          `Notes: <strong>${rootLbl}</strong> → <strong>${highLbl}</strong><br/>` +
          `Interval: <strong>${titleCase(correct.name)}</strong> (<strong>${correct.code}</strong>).`
      );

      playUiSound(SND_CORRECT);
    } else {
      score.incorrect += 1;
      score.streak = 0;

      const btn = answerButtons.querySelector(`button[data-index="${intervalIndex}"]`);
      if (btn) btn.classList.add("incorrect");
      markCorrectButton(correct.code);

      setFeedback(
        `Incorrect ❌ (You chose <strong>${chosen.code}</strong>.)<br/>` +
          `Notes: <strong>${rootLbl}</strong> → <strong>${highLbl}</strong><br/>` +
          `Answer: <strong>${titleCase(correct.name)}</strong> (<strong>${correct.code}</strong>).`
      );

      playUiSound(SND_INCORRECT);
    }

    score.history.push({
      ts: new Date().toISOString(),
      root: rootLbl,
      high: highLbl,
      interval: correct.code,
      guess: chosen.code,
      correct: isCorrect,
      mode: settings.rootMode,
      intervalCount: settings.intervalCount,
    });

    renderScore();

    setKeyboardVisible(true);
    buildMiniKeyboard([question.rootPitch, question.highPitch], question.rootPitch, question.highPitch);

    lockAfterAnswer();
  }

  // ---------------- downloads (PNG scorecard) ----------------
  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  }

  function drawCardBase(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fbfbfc";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    ctx.fillStyle = "#111";
    ctx.fillRect(8, 8, w - 16, 74);
  }

  function getPlayerName() {
    const prev = localStorage.getItem("ivl_player_name") || "";
    const name = window.prompt("Enter your name for the scorecard:", prev) ?? "";
    const trimmed = String(name).trim();
    if (trimmed) localStorage.setItem("ivl_player_name", trimmed);
    return trimmed || "Player";
  }

  async function downloadScoreCardPng(playerName) {
    const w = 640;
    const h = 560;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawCardBase(ctx, w, h);

    ctx.fillStyle = "#fff";
    ctx.font = "900 28px Arial";
    ctx.fillText("Identifying Musical Intervals — Scorecard", 28, 54);

    const bodyX = 28;
    const bodyY = 125;

    ctx.fillStyle = "#111";
    ctx.font = "900 22px Arial";
    ctx.fillText("Summary", bodyX, bodyY);

    const settingsLine =
      `Mode: ${settings.rootMode === "random" ? "Random root" : `Fixed root (${pitchLabel(settings.fixedRootPitch)})`} • ` +
      `Intervals included: ${settings.intervalCount} (m2 → ${IVL_ALL[settings.intervalCount - 1].code})`;

    ctx.font = "700 16px Arial";
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillText(settingsLine, bodyX, bodyY + 28);

    ctx.fillStyle = "#111";
    ctx.font = "700 20px Arial";

    const lines = [
      `Name: ${playerName}`,
      `Questions asked: ${score.asked}`,
      `Answers correct: ${score.correct}`,
      `Answers incorrect: ${score.incorrect}`,
      `Correct in a row: ${score.streak}`,
      `Longest correct streak: ${Math.max(score.longest, score.streak)}`,
      `Percentage correct: ${scorePercent()}%`,
    ];

    let y = bodyY + 76;
    for (const ln of lines) {
      ctx.fillText(ln, bodyX, y);
      y += 32;
    }

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.font = "700 15px Arial";
    ctx.fillText("Downloaded from www.eartraininglab.com 🎶", bodyX, h - 34);

    const blob = await canvasToPngBlob(canvas);
    if (blob) downloadBlob(blob, "Intervals Scorecard.png");
  }

  async function onDownloadScoreCard() {
    const name = getPlayerName();
    await downloadScoreCardPng(name);
  }

  // ---------------- info modal ----------------
  function showInfo() {
    stopAllAudio(0.06);
    playUiSound(SND_SELECT);
    infoModal.classList.remove("hidden");
    modalClose.focus();
  }

  function hideInfo() {
    infoModal.classList.add("hidden");
    playUiSound(SND_BACK);
  }

  // ---------------- apply settings / start / reset ----------------
  function resetScore() {
    score.asked = 0;
    score.correct = 0;
    score.incorrect = 0;
    score.streak = 0;
    score.longest = 0;
    score.history = [];
  }

  async function applySettingsAndRestart() {
    settings.intervalCount = clampInt(intervalCountSel.value, 2, IVL_ALL.length);
    settings.rootMode = rootModeSel.value === "fixed" ? "fixed" : "random";
    settings.fixedRootPitch = Number.parseInt(rootNoteSel.value, 10);

    refreshAnswerVisibility();

    resetScore();
    renderScore();

    started = true;
    awaitingNext = false;
    canAnswer = false;
    question = null;

    setKeyboardVisible(false);
    setFeedback("Starting…");
    hideSettingsModal();

    await startNewRound({ autoplay: true });
  }

  function stopAndResetToNotStarted() {
    stopAllAudio(0.08);

    started = false;
    canAnswer = false;
    awaitingNext = false;
    question = null;

    resetScore();
    renderScore();
    clearAnswerMarks();
    setKeyboardVisible(false);

    setFeedback("Open <strong>Game Settings</strong> to start.");
    updateControls();
  }

  // ---------------- modals init content ----------------
  function renderInfoText() {
    // If you wrote content in index.html, don't overwrite it.
    if (modalBody.innerHTML.trim().length > 0) return;
  
    modalBody.textContent = IVL_ALL
      .map((i) => `${i.code} — ${titleCase(i.name)} (${i.semitones})`)
      .join("\n");
  }

  // ---------------- events ----------------
  function bind() {
    settingsBtn.addEventListener("click", () => showSettingsModal({ purpose: "settings" }));

    settingsClose.addEventListener("click", () => {
      if (settingsModalLocked && !started) return;
      playUiSound(SND_BACK);
      hideSettingsModal();
    });

    settingsApply.addEventListener("click", async () => {
      await applySettingsAndRestart();
    });

    intervalCountSel.addEventListener("change", () => {
      buildRootOptions();
    });

    rootModeSel.addEventListener("change", () => {
      syncRootModeUi();
    });

    infoBtn.addEventListener("click", showInfo);
    modalClose.addEventListener("click", hideInfo);

    infoModal.addEventListener("click", (e) => {
      if (e.target === infoModal) hideInfo();
    });

    settingsModal.addEventListener("click", (e) => {
      if (e.target !== settingsModal) return;
      if (settingsModalLocked && !started) return;
      hideSettingsModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!infoModal.classList.contains("hidden")) hideInfo();
        if (!settingsModal.classList.contains("hidden") && !(settingsModalLocked && !started)) hideSettingsModal();
      }
      if (e.key === "r" || e.key === "R") replayBtn.click();
      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        nextBtn.click();
      }
    });

    resetBtn.addEventListener("click", () => {
      stopAndResetToNotStarted();
      showSettingsModal({ purpose: "begin" });
    });

    replayBtn.addEventListener("click", async () => {
      if (!started || !question) return;
      const allowAnswerAfter = !awaitingNext;
      await playCurrentInterval({ allowAnswerAfter, delaySec: 0 });
    });

    nextBtn.addEventListener("click", async () => {
      if (!started || !awaitingNext) return;
      await startNewRound({ autoplay: true });
    });

    downloadScoreBtn.addEventListener("click", onDownloadScoreCard);
  }

  function init() {
    populateIntervalCountOptions();
    buildAnswerButtons();
    buildRootOptions();
    syncRootModeUi();
    renderInfoText();

    renderScore();
    setKeyboardVisible(false);
    updateControls();

    // Show begin popup on load (Reset Game covers it later too)
    showSettingsModal({ purpose: "begin" });
  }

  bind();
  init();
})();
