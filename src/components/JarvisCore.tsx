// The Jarvis core: a canvas that breathes when idle, listens (green-teal), thinks (fast, amber sparks) and speaks (bright, reacting to the voice).
// Rings with tick marks, a radar sweep, orbiting particles and a ring of sound bars. Real audio drives the bars when an analyser is given; otherwise a soft speech-like pattern plays.
import { useEffect, useRef } from 'react';

export type CoreMode = 'idle' | 'listening' | 'thinking' | 'speaking';
const TAU = Math.PI * 2;
const HUE: Record<CoreMode, number> = { idle: 190, listening: 158, thinking: 196, speaking: 186 };

export function JarvisCore({ mode, analyser }: { mode: CoreMode; analyser: React.MutableRefObject<AnalyserNode | null> }) {
  const cv = useRef<HTMLCanvasElement>(null); const modeRef = useRef<CoreMode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const canvas = cv.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let size = 320, dpr = 1, raf = 0, last = performance.now(); let hue = HUE.idle, spin = 0, level = 0, sweep = 0, amp = 0;
    const bins = new Uint8Array(128); const BARS = 84;
    const parts = Array.from({ length: 34 }, (_, i) => ({ r: 0.5 + ((i * 37) % 100) / 100 * 0.46, a: (i * 2.399) % TAU, s: (0.12 + ((i * 53) % 100) / 100 * 0.4) * (i % 2 ? 1 : -1), z: 0.8 + ((i * 29) % 100) / 100 * 1.8 }));
    const ripples: { t: number }[] = []; let lastRipple = 0;
    const fit = () => { const r = canvas.getBoundingClientRect(); size = Math.max(160, Math.round(r.width)); dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = size * dpr; canvas.height = size * dpr; };
    fit(); const ro = new ResizeObserver(fit); ro.observe(canvas);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000; const m = modeRef.current;
      // easing towards the mood of the current mode
      hue += (HUE[m] - hue) * Math.min(1, dt * 4);
      spin += dt * (m === 'thinking' ? 2.6 : m === 'speaking' ? 0.7 : m === 'listening' ? 0.5 : 0.18);
      sweep += dt * (m === 'thinking' ? 5 : 1.1);
      // sound level: real audio when available, else a soft speech-like envelope
      let target = 0;
      const an = analyser.current;
      if (an && (m === 'speaking' || m === 'listening')) { an.getByteFrequencyData(bins); let s = 0; for (let i = 0; i < 40; i++) s += bins[i]; target = Math.min(1, s / 40 / 150); }
      else if (m === 'speaking') target = 0.35 + 0.3 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.1)) + 0.15 * Math.sin(t * 13);
      else if (m === 'listening') target = 0.18 + 0.12 * Math.abs(Math.sin(t * 4.1));
      level += (target - level) * Math.min(1, dt * 14); amp += ((m === 'idle' ? 0.12 : m === 'thinking' ? 0.3 : 0.6) - amp) * Math.min(1, dt * 3);
      const breath = 0.5 + 0.5 * Math.sin(t * 1.15);

      const W = size * dpr; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, W); ctx.translate(W / 2, W / 2); ctx.scale(W / 2, W / 2);   // unit circle: radius 1 = the edge
      const col = (l: number, a = 1) => `hsla(${hue},100%,${l}%,${a})`;
      ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';

      // outer ripples when the voice peaks
      if (m === 'speaking' && level > 0.5 && now - lastRipple > 260) { ripples.push({ t: now }); lastRipple = now; }
      for (let i = ripples.length - 1; i >= 0; i--) { const k = (now - ripples[i].t) / 1100; if (k >= 1) { ripples.splice(i, 1); continue; } ctx.strokeStyle = col(70, (1 - k) * 0.35); ctx.lineWidth = 0.006; ctx.beginPath(); ctx.arc(0, 0, 0.62 + k * 0.38, 0, TAU); ctx.stroke(); }

      // glow
      const gr = 0.46 + 0.05 * breath + 0.3 * level;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, gr); g.addColorStop(0, col(96, 0.95)); g.addColorStop(0.22, col(70, 0.75)); g.addColorStop(0.6, col(48, 0.22)); g.addColorStop(1, col(40, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, gr, 0, TAU); ctx.fill();

      // ring A: fine tick marks
      ctx.save(); ctx.rotate(spin * 0.35);
      for (let i = 0; i < 120; i++) { const a = (i / 120) * TAU, big = i % 10 === 0, r0 = big ? 0.9 : 0.925, r1 = 0.96; ctx.strokeStyle = col(big ? 78 : 58, big ? 0.9 : 0.45); ctx.lineWidth = big ? 0.01 : 0.005; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke(); }
      ctx.restore();

      // ring B: bold arc segments, counter-rotating
      ctx.save(); ctx.rotate(-spin * 0.9); ctx.shadowColor = col(60, 0.9); ctx.shadowBlur = 14 * dpr;
      const segs = [[0, 0.9], [1.15, 0.5], [2.0, 1.1], [3.4, 0.35], [4.1, 0.95], [5.4, 0.5]];
      ctx.strokeStyle = col(62, 0.95); ctx.lineWidth = 0.022 + 0.01 * level; for (const [a0, len] of segs) { ctx.beginPath(); ctx.arc(0, 0, 0.82, a0, a0 + len); ctx.stroke(); }
      ctx.restore();

      // ring C: sound bars
      ctx.save(); ctx.rotate(spin * 0.15); ctx.shadowColor = col(70, 0.8); ctx.shadowBlur = 8 * dpr;
      for (let i = 0; i < BARS; i++) {
        const a = (i / BARS) * TAU; const bi = Math.floor((i < BARS / 2 ? i : BARS - 1 - i) * 1.3);
        const real = an && (m === 'speaking' || m === 'listening') ? bins[Math.min(127, bi)] / 255 : 0;
        const synth = (0.5 + 0.5 * Math.sin(t * 2.2 + i * 0.7)) * 0.5 + (0.5 + 0.5 * Math.sin(t * 5.1 - i * 0.37)) * 0.5;
        const v = (real > 0 ? real * 1.2 : synth * (m === 'idle' ? 0.35 : 0.8) * (0.4 + level)) * amp + 0.04;
        const r0 = 0.62, r1 = r0 + 0.04 + v * 0.16; ctx.strokeStyle = col(55 + v * 40, 0.55 + v * 0.45); ctx.lineWidth = 0.011;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
      }
      ctx.restore();

      // inner segmented ring
      ctx.save(); ctx.rotate(spin * 1.4); ctx.strokeStyle = col(80, 0.85); ctx.lineWidth = 0.012; ctx.shadowColor = col(70, 1); ctx.shadowBlur = 10 * dpr;
      for (let i = 0; i < 6; i++) { const a0 = (i / 6) * TAU; ctx.beginPath(); ctx.arc(0, 0, 0.5, a0, a0 + 0.62); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = col(70, 0.5); ctx.lineWidth = 0.004; ctx.setLineDash([0.01, 0.02]); ctx.beginPath(); ctx.arc(0, 0, 0.42 + 0.01 * breath, 0, TAU); ctx.stroke(); ctx.setLineDash([]);

      // radar sweep
      ctx.save(); ctx.rotate(sweep);
      for (let i = 0; i < 22; i++) { const a = -i * 0.035; ctx.strokeStyle = col(70, (1 - i / 22) * (m === 'thinking' ? 0.55 : 0.28)); ctx.lineWidth = 0.02; ctx.beginPath(); ctx.arc(0, 0, 0.74, a - 0.035, a); ctx.stroke(); }
      ctx.restore();

      // orbiting particles (amber sparks while thinking)
      for (const p of parts) {
        p.a += dt * p.s * (m === 'thinking' ? 4 : 1 + level * 2); const x = Math.cos(p.a) * p.r, y = Math.sin(p.a) * p.r * 0.96;
        const sp = m === 'thinking' && p.z > 1.8; ctx.fillStyle = sp ? 'hsla(42,100%,70%,0.95)' : col(78, 0.8); ctx.shadowColor = sp ? 'hsla(42,100%,60%,1)' : col(70, 1); ctx.shadowBlur = 8 * dpr;
        ctx.beginPath(); ctx.arc(x, y, 0.006 * p.z * (1 + level), 0, TAU); ctx.fill();
      }
      ctx.shadowBlur = 0;

      // white-hot centre
      const cr = 0.06 + 0.012 * breath + 0.05 * level; const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, cr * 2.2); cg.addColorStop(0, 'rgba(255,255,255,1)'); cg.addColorStop(0.4, col(85, 0.9)); cg.addColorStop(1, col(60, 0));
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, cr * 2.2, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    };
    if (reduce) { frame(performance.now()); cancelAnimationFrame(raf); } else raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [analyser]);

  return <canvas ref={cv} className="jv-canvas" aria-hidden />;
}

/** Slowly drifting light particles behind everything. */
export function JarvisBackdrop() {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d'); if (!ctx) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let w = 0, h = 0, raf = 0, last = performance.now();
    const dots = Array.from({ length: 70 }, (_, i) => ({ x: (i * 97) % 1000 / 1000, y: (i * 389) % 1000 / 1000, v: 0.004 + ((i * 41) % 100) / 100 * 0.012, r: 0.6 + ((i * 17) % 100) / 100 * 1.6, p: i }));
    const fit = () => { const b = c.getBoundingClientRect(); w = c.width = Math.round(b.width); h = c.height = Math.round(b.height); }; fit(); const ro = new ResizeObserver(fit); ro.observe(c);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick); if (document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now; ctx.clearRect(0, 0, w, h);
      for (const d of dots) { d.y -= d.v * dt * 10; if (d.y < -0.02) { d.y = 1.02; } const tw = 0.4 + 0.6 * Math.abs(Math.sin(now / 1000 * 0.8 + d.p)); ctx.fillStyle = `rgba(110,225,255,${0.12 + 0.35 * tw})`; ctx.beginPath(); ctx.arc(d.x * w, d.y * h, d.r, 0, TAU); ctx.fill(); }
    };
    raf = requestAnimationFrame(tick); return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={cv} className="jv-backdrop" aria-hidden />;
}
