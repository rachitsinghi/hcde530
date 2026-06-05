import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Papa from "papaparse";
import { SketchHUD } from "./SketchHUD";
import { StarMap3D } from "./StarMap3D";
import { ARSkyView } from "./ARSkyView";

interface Star {
  id: string;
  ra_deg: number;
  dec: number;
  mag: number;
  ci: number | null;
  proper: string;
  x: number;
  y: number;
  z: number;
}

// Desaturated, nearly-white tints — like real stars to the human eye
function colorForCI(ci: number | null): string {
  if (ci === null || Number.isNaN(ci)) return "#ffffff";
  if (ci < -0.2) return "#dde4ff"; // hot, faint blue tint
  if (ci < 0.0) return "#e3e8ff";
  if (ci < 0.3) return "#ecefff";
  if (ci < 0.6) return "#ffffff";
  if (ci < 1.0) return "#fff8ee";
  if (ci < 1.5) return "#ffeed8";
  return "#ffe0c0"; // cool, faint warm tint
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Star radius in screen pixels (before /scale). Clamped so brightest ≈ 4px.
function starRadius(mag: number): number {
  const r = (6.5 - mag) * 0.55;
  return Math.max(0.5, Math.min(4, r));
}

const MIN_ZOOM = 1; // any less and the edges of the star rectangle become visible
const MAX_ZOOM = 50;
const SKETCH_SIZE = 280;
const DEFAULT_SCALE = 3; // start zoomed in, not the whole sky

// Keep the view inside the [0,w]×[0,h] world so edges never show
function clampView(
  view: { scale: number; tx: number; ty: number },
  w: number,
  h: number,
) {
  const minTx = w - w * view.scale; // ≤ 0
  const minTy = h - h * view.scale;
  view.tx = Math.min(0, Math.max(minTx, view.tx));
  view.ty = Math.min(0, Math.max(minTy, view.ty));
}

function makeDefaultView(w: number, h: number) {
  const v = {
    scale: DEFAULT_SCALE,
    tx: w / 2 - (w / 2) * DEFAULT_SCALE,
    ty: h / 2 - (h / 2) * DEFAULT_SCALE,
  };
  clampView(v, w, h);
  return v;
}


export function StarMap() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const dimThresholdRef = useRef<number>(Infinity);
  const parallaxRef = useRef({ x: 0, y: 0 });
  const viewRef = useRef({ scale: DEFAULT_SCALE, tx: 0, ty: 0 });
  const viewInitedRef = useRef(false);
  const zoomAnimRef = useRef<number | null>(null);

  const constellationRef = useRef<Star[]>([]);
  const usedClustersRef = useRef<{ ra: number; dec: number; radius: number }[]>([]);
  const rafRef = useRef<number | null>(null);
  const pulseRafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 });
  const [count, setCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [matchedStarNames, setMatchedStarNames] = useState<string[]>([]);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [constellationIds, setConstellationIds] = useState<string[]>([]);
  const [arOpen, setArOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const [canAR, setCanAR] = useState(false);
  const [currentScale, setCurrentScale] = useState(DEFAULT_SCALE);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth >= 768 && window.innerWidth < 992);
      setIsPhone(window.innerWidth < 768);
      setCanAR(navigator.maxTouchPoints > 0);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const zoomBy = (factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = viewRef.current;
    const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale * factor));
    if (newScale === view.scale) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const target = {
      scale: newScale,
      tx: cx - (cx - view.tx) * (newScale / view.scale),
      ty: cy - (cy - view.ty) * (newScale / view.scale),
    };
    clampView(target, w, h);
    animateView(target, 250);
    setCurrentScale(newScale);
  };

  const constellationStars = useMemo(
    () => constellationRef.current,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [constellationIds],
  );

  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, []);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const { scale, tx, ty } = viewRef.current;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(scale, 0, 0, scale, tx, ty);

    const stars = starsRef.current;
    const dimThreshold = dimThresholdRef.current;
    const px = parallaxRef.current.x;
    const py = parallaxRef.current.y;

    const drawStar = (s: Star) => {
      const x = (s.ra_deg / 360) * w;
      const y = (1 - (s.dec + 90) / 180) * h;
      const r = starRadius(s.mag) / scale;
      const color = colorForCI(s.ci);
      // soft glow (every star)
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(color, 0.18);
      ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
      ctx.fill();
      // brightest stars get an additional wider halo
      if (s.mag < 2.0) {
        ctx.beginPath();
        ctx.fillStyle = hexToRgba(color, 0.1);
        ctx.arc(x, y, r * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // core
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    // Dim background stars with parallax
    if (px !== 0 || py !== 0) {
      ctx.save();
      ctx.translate(px / scale, py / scale);
    }
    for (const s of stars) {
      if (s.mag < dimThreshold) continue;
      drawStar(s);
    }
    if (px !== 0 || py !== 0) ctx.restore();

    // Brighter stars (no parallax)
    for (const s of stars) {
      if (s.mag >= dimThreshold) continue;
      drawStar(s);
    }

    // Radial atmosphere overlay (screen space)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    grad.addColorStop(0, "rgba(0, 8, 20, 0)");
    grad.addColorStop(0.6, "rgba(0, 8, 20, 0.05)");
    grad.addColorStop(1, "rgba(0, 8, 20, 0.15)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Constellation overlay — drawn in screen space so glow/line widths are crisp
    const con = constellationRef.current;
    if (con.length > 0) {
      const pts = con.map((s) => {
        const wx = (s.ra_deg / 360) * w;
        const wy = (1 - (s.dec + 90) / 180) * h;
        return { sx: wx * scale + tx, sy: wy * scale + ty, s };
      });

      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 600);

      // connecting lines — bright white with blue-white glow
      if (pts.length > 1) {
        ctx.save();
        ctx.shadowColor = "rgba(170, 210, 255, 0.9)";
        ctx.shadowBlur = 12;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(pts[0].sx, pts[0].sy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
        ctx.stroke();
        ctx.restore();
      }

      // pulsing anchor stars — white core + glowing halo
      for (const p of pts) {
        const baseR = Math.max(2.5, starRadius(p.s.mag) * 1.4);
        ctx.save();
        ctx.shadowColor = "rgba(170, 210, 255, 0.9)";
        ctx.shadowBlur = 18 * pulse + 6;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * pulse + 0.15})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, baseR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // outer ring
        ctx.beginPath();
        ctx.strokeStyle = `rgba(170, 210, 255, ${0.35 * pulse + 0.2})`;
        ctx.lineWidth = 1;
        ctx.arc(p.sx, p.sy, baseR * 2.4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // labels
      ctx.fillStyle = "#ffffff";
      ctx.font = "10px 'Roboto Mono', monospace";
      ctx.textBaseline = "middle";
      for (const p of pts) {
        const label = p.s.proper || p.s.id;
        const baseR = Math.max(2.5, starRadius(p.s.mag) * 1.4);
        ctx.fillText(label, p.sx + baseR * 2.5 + 6, p.sy);
      }
    }
  };

  // Pulse animation loop — runs only while a constellation is mapped
  useEffect(() => {
    if (constellationIds.length === 0) {
      if (pulseRafRef.current != null) {
        cancelAnimationFrame(pulseRafRef.current);
        pulseRafRef.current = null;
      }
      return;
    }
    const tick = () => {
      scheduleDraw();
      pulseRafRef.current = requestAnimationFrame(tick);
    };
    pulseRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (pulseRafRef.current != null) {
        cancelAnimationFrame(pulseRafRef.current);
        pulseRafRef.current = null;
      }
    };
  }, [constellationIds, scheduleDraw]);

  useEffect(() => {
    let cancelled = false;
    fetch("/stars_visible.csv")
      .then((r) => r.text())
      .then((text) => {
        if (cancelled) return;
        const totalLines = Math.max(0, text.split("\n").filter((l) => l.trim()).length - 1);
        setLoadProgress({ loaded: 0, total: totalLines });

        const stars: Star[] = [];
        let sinceUpdate = 0;
        Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
          step: (results) => {
            const row = results.data;
            const ra = parseFloat(row.ra_deg);
            const dec = parseFloat(row.dec);
            const mag = parseFloat(row.mag);
            if (!Number.isNaN(ra) && !Number.isNaN(dec) && !Number.isNaN(mag)) {
              const ciRaw = row.ci?.trim();
              const ciNum = ciRaw === "" || ciRaw === undefined ? null : parseFloat(ciRaw);
              stars.push({
                id: row.id,
                ra_deg: ra,
                dec,
                mag,
                ci: ciNum !== null && Number.isNaN(ciNum) ? null : ciNum,
                proper: (row.proper ?? "").trim(),
                x: parseFloat(row.x) || 0,
                y: parseFloat(row.y) || 0,
                z: parseFloat(row.z) || 0,
              });
            }
            sinceUpdate++;
            if (sinceUpdate >= 200) {
              sinceUpdate = 0;
              setLoadProgress({ loaded: stars.length, total: totalLines });
            }
          },
          complete: () => {
            if (cancelled) return;
            const mags = stars.map((s) => s.mag).sort((a, b) => a - b);
            const idx = Math.floor(mags.length * 0.7);
            dimThresholdRef.current = mags[idx] ?? Infinity;

            starsRef.current = stars;
            setCount(stars.length);
            setLoadProgress({ loaded: stars.length, total: totalLines });
            setLoading(false);
            scheduleDraw();
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [scheduleDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (!viewInitedRef.current) {
        viewRef.current = makeDefaultView(canvas.width, canvas.height);
        viewInitedRef.current = true;
      } else {
        clampView(viewRef.current, canvas.width, canvas.height);
      }
      scheduleDraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [scheduleDraw]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const view = viewRef.current;
      const factor = Math.exp(-e.deltaY * 0.001);
      const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale * factor));
      const k = newScale / view.scale;
      view.tx = mx - (mx - view.tx) * k;
      view.ty = my - (my - view.ty) * k;
      view.scale = newScale;
      clampView(view, canvas.width, canvas.height);
      setCurrentScale(newScale);
      scheduleDraw();
    };

    const onPointerDown = (e: PointerEvent) => {
      draggingRef.current = true;
      movedRef.current = false;
      setIsDragging(true);
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (draggingRef.current) {
        const dx = e.clientX - lastPosRef.current.x;
        const dy = e.clientY - lastPosRef.current.y;
        if (dx !== 0 || dy !== 0) movedRef.current = true;
        lastPosRef.current = { x: e.clientX, y: e.clientY };
        viewRef.current.tx += dx;
        viewRef.current.ty += dy;
        clampView(viewRef.current, canvas.width, canvas.height);
        scheduleDraw();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      parallaxRef.current = { x: -nx * 6, y: -ny * 6 };
      scheduleDraw();
    };
    const onPointerUp = (e: PointerEvent) => {
      draggingRef.current = false;
      setIsDragging(false);
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, [scheduleDraw]);

  useEffect(() => {
    if (!loading) scheduleDraw();
  }, [loading, scheduleDraw]);

  const animateView = (
    target: { scale: number; tx: number; ty: number },
    duration = 750,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const from = { ...viewRef.current };
    const start = performance.now();
    if (zoomAnimRef.current != null) cancelAnimationFrame(zoomAnimRef.current);
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / duration);
      // easeInOutCubic
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      viewRef.current = {
        scale: from.scale + (target.scale - from.scale) * e,
        tx: from.tx + (target.tx - from.tx) * e,
        ty: from.ty + (target.ty - from.ty) * e,
      };
      clampView(viewRef.current, canvas.width, canvas.height);
      scheduleDraw();
      if (t < 1) zoomAnimRef.current = requestAnimationFrame(step);
      else zoomAnimRef.current = null;
    };
    zoomAnimRef.current = requestAnimationFrame(step);
  };

  const resetView = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      viewRef.current = { scale: DEFAULT_SCALE, tx: 0, ty: 0 };
      return;
    }
    animateView(makeDefaultView(canvas.width, canvas.height), 500);
  };

  const handleMapToStars = (vertices: { x: number; y: number }[]) => {
    if (vertices.length < 2) {
      constellationRef.current = [];
      setConstellationIds([]);
      setMatchedStarNames([]);
      setStatus(vertices.length === 0 ? null : "ADD AT LEAST 2 POINTS");
      scheduleDraw();
      return;
    }


    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const { scale, tx, ty } = viewRef.current;

    // Current viewport in world / RA-Dec space
    const worldXMin = -tx / scale;
    const worldXMax = (w - tx) / scale;
    const worldYMin = -ty / scale;
    const worldYMax = (h - ty) / scale;

    const raMin = (worldXMin / w) * 360;
    const raMax = (worldXMax / w) * 360;
    const decMax = 90 - (worldYMin / h) * 180;
    const decMin = 90 - (worldYMax / h) * 180;

    // Pick a tight cluster region. If we've already mapped constellations
    // before, jump to a NEW area of the sky that's far from previously used
    // clusters so we don't keep snapping into the same stars.
    const stars = starsRef.current;
    const raCenter = (raMin + raMax) / 2;
    const decCenter = (decMin + decMax) / 2;
    const viewRaExt = raMax - raMin;
    const viewDecExt = decMax - decMin;
    const clusterRadius = Math.min(viewRaExt, viewDecExt) * 0.32;

    let clusterCenterRa = raCenter;
    let clusterCenterDec = decCenter;

    const usedHistory = usedClustersRef.current;
    const farFromUsed = (ra: number, dec: number) => {
      for (const u of usedHistory) {
        const dr = ra - u.ra;
        const dd = dec - u.dec;
        const minDist = (u.radius + clusterRadius) * 2.2;
        if (dr * dr + dd * dd < minDist * minDist) return false;
      }
      return true;
    };

    if (usedHistory.length > 0) {
      // Search the entire sky for a dense pocket far from previously used clusters.
      const pool = stars.filter((s) => farFromUsed(s.ra_deg, s.dec));
      const candidatePool = pool.length > 0 ? pool : stars;
      const step = Math.max(1, Math.floor(candidatePool.length / 400));
      let bestScore = -1;
      for (let i = 0; i < candidatePool.length; i += step) {
        const c = candidatePool[i];
        let count = 0;
        for (let j = 0; j < candidatePool.length; j += step) {
          const s = candidatePool[j];
          const dRa = s.ra_deg - c.ra_deg;
          const dDec = s.dec - c.dec;
          if (dRa * dRa + dDec * dDec <= clusterRadius * clusterRadius) count++;
        }
        const score = count - c.mag * 0.05;
        if (score > bestScore) {
          bestScore = score;
          clusterCenterRa = c.ra_deg;
          clusterCenterDec = c.dec;
        }
      }
    } else {
      // First mapping: pick the densest pocket inside the current viewport.
      const searchHalfRa = viewRaExt * 0.2;
      const searchHalfDec = viewDecExt * 0.2;
      const candidates = stars.filter(
        (s) =>
          Math.abs(s.ra_deg - raCenter) <= searchHalfRa &&
          Math.abs(s.dec - decCenter) <= searchHalfDec,
      );
      if (candidates.length > 0) {
        let bestScore = -1;
        for (const c of candidates) {
          let count = 0;
          for (const s of candidates) {
            const dRa = s.ra_deg - c.ra_deg;
            const dDec = s.dec - c.dec;
            if (dRa * dRa + dDec * dDec <= clusterRadius * clusterRadius) count++;
          }
          const score = count - c.mag * 0.05;
          if (score > bestScore) {
            bestScore = score;
            clusterCenterRa = c.ra_deg;
            clusterCenterDec = c.dec;
          }
        }
      }
    }

    usedClustersRef.current.push({
      ra: clusterCenterRa,
      dec: clusterCenterDec,
      radius: clusterRadius,
    });
    if (usedClustersRef.current.length > 12) usedClustersRef.current.shift();

    // Restrict snap candidates to the cluster only
    const cluster = stars.filter((s) => {
      const dRa = s.ra_deg - clusterCenterRa;
      const dDec = s.dec - clusterCenterDec;
      return dRa * dRa + dDec * dDec <= clusterRadius * clusterRadius;
    });

    // Map vertices into the cluster's RA/Dec bounding box
    const cRaMin = clusterCenterRa - clusterRadius;
    const cRaMax = clusterCenterRa + clusterRadius;
    const cDecMax = clusterCenterDec + clusterRadius;
    const cDecMin = clusterCenterDec - clusterRadius;

    const used = new Set<string>();
    const snapped: Star[] = [];
    const snapPool = cluster.length >= vertices.length ? cluster : stars;

    for (const v of vertices) {
      const nx = v.x / SKETCH_SIZE;
      const ny = v.y / SKETCH_SIZE;
      const targetRa = cRaMin + nx * (cRaMax - cRaMin);
      const targetDec = cDecMax - ny * (cDecMax - cDecMin);

      let best: Star | null = null;
      let bestD = Infinity;
      for (const s of snapPool) {
        if (used.has(s.id)) continue;
        const dRa = s.ra_deg - targetRa;
        const dDec = s.dec - targetDec;
        const d = Math.sqrt(dRa * dRa + dDec * dDec);
        if (d < bestD - 0.5) {
          best = s;
          bestD = d;
        } else if (d < bestD + 0.5) {
          if (!best || s.mag < best.mag) {
            best = s;
            bestD = Math.min(bestD, d);
          }
        }
      }

      if (best) {
        used.add(best.id);
        snapped.push(best);
      }
    }

    constellationRef.current = snapped;
    setConstellationIds(snapped.map((s) => s.id));
    setMatchedStarNames(snapped.map((s) => s.proper).filter((n) => n.length > 0));
    setStatus(`MAPPED TO ${snapped.length} STARS`);

    // Smooth zoom into the constellation so it fills ~60% of the screen
    if (snapped.length > 0) {
      let minWX = Infinity, maxWX = -Infinity, minWY = Infinity, maxWY = -Infinity;
      for (const s of snapped) {
        const wx = (s.ra_deg / 360) * w;
        const wy = (1 - (s.dec + 90) / 180) * h;
        if (wx < minWX) minWX = wx;
        if (wx > maxWX) maxWX = wx;
        if (wy < minWY) minWY = wy;
        if (wy > maxWY) maxWY = wy;
      }
      const bbW = Math.max(1, maxWX - minWX);
      const bbH = Math.max(1, maxWY - minWY);
      const cxW = (minWX + maxWX) / 2;
      const cyW = (minWY + maxWY) / 2;
      const targetScale = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Math.min((w * 0.6) / bbW, (h * 0.6) / bbH)),
      );
      const target = {
        scale: targetScale,
        tx: w / 2 - cxW * targetScale,
        ty: h / 2 - cyW * targetScale,
      };
      clampView(target, w, h);
      animateView(target, 850);
    } else {
      scheduleDraw();
    }
  };


  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-black"
      style={{ fontFamily: "'Roboto Mono', monospace" }}
    >
      <canvas
        id="star-map-canvas"
        ref={canvasRef}
        className="absolute inset-0 block"
        style={{
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "none",
          display: mode === "2d" ? "block" : "none",
        }}
      />

      {mode === "3d" && !loading && (
        <StarMap3D stars={starsRef.current} constellationIds={constellationIds} />
      )}

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white pointer-events-none">
          <div
            className="relative"
            style={{
              width: 64,
              height: 64,
              animation: "tt-rotate 4s linear infinite",
            }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 6,
                  height: 6,
                  marginLeft: -3,
                  marginTop: -3,
                  borderRadius: "50%",
                  background: "#4a9eff",
                  opacity: 0.2 + (i / 11) * 0.8,
                  transform: `rotate(${i * 30}deg) translateY(-26px)`,
                  boxShadow: "0 0 6px #4a9eff",
                }}
              />
            ))}
          </div>
          <div className="mt-6 text-xs" style={{ letterSpacing: "0.15em" }}>
            LOADING STAR CATALOG
          </div>
          <div className="mt-2 text-[10px] text-neutral-400">
            LOADING {loadProgress.loaded.toLocaleString()} /{" "}
            {loadProgress.total.toLocaleString()}…
          </div>
        </div>
      )}

      {!loading && (
        <div className="absolute top-3 left-3 text-xs text-neutral-500 pointer-events-none">
          {count.toLocaleString()} stars
        </div>
      )}

      <div
        className="absolute top-3 right-3 flex flex-col items-end gap-2"
        style={{ fontFamily: "'Roboto Mono', monospace" }}
      >
        {(() => {
          const arDisabled = !canAR || constellationIds.length === 0;
          const arTitle = !canAR
            ? "Open on a phone to view in the real sky"
            : constellationIds.length === 0
              ? "Map a constellation first"
              : "View in real sky";
          const arBtn = (
            <button
              onClick={() => !arDisabled && setArOpen(true)}
              disabled={arDisabled}
              title={arTitle}
              className="text-xs px-3 py-1.5 rounded-md border whitespace-nowrap"
              style={{
                background: "rgba(0, 8, 20, 0.85)",
                borderColor: "#1a3a5c",
                color: arDisabled ? "#4a5a6e" : "#fff",
                opacity: arDisabled ? 0.5 : 1,
                letterSpacing: "0.12em",
                cursor: arDisabled ? "not-allowed" : "pointer",
              }}
            >
              ◎ VIEW IN AR
            </button>
          );
          const toggleAndReset = (
            <>
              <div
                className="flex text-xs rounded-md border overflow-hidden"
                style={{ background: "rgba(0, 8, 20, 0.85)", borderColor: "#1a3a5c" }}
              >
                <button
                  onClick={() => setMode("2d")}
                  className="px-3 py-1.5"
                  style={{
                    background: mode === "2d" ? "#4a9eff" : "transparent",
                    color: mode === "2d" ? "#000" : "#fff",
                  }}
                >
                  2D
                </button>
                <button
                  onClick={() => setMode("3d")}
                  className="px-3 py-1.5"
                  style={{
                    background: mode === "3d" ? "#4a9eff" : "transparent",
                    color: mode === "3d" ? "#000" : "#fff",
                  }}
                >
                  3D
                </button>
              </div>
              <button
                onClick={resetView}
                className="text-xs text-white px-3 py-1.5 rounded-md border whitespace-nowrap"
                style={{
                  background: "rgba(0, 8, 20, 0.85)",
                  borderColor: "#1a3a5c",
                }}
              >
                Reset View
              </button>
            </>
          );
          if (isPhone) {
            return (
              <>
                <div className="flex items-center gap-2">{toggleAndReset}</div>
                {arBtn}
              </>
            );
          }
          if (isMobile) {
            // Tablet
            return (
              <div className="flex items-center gap-2">
                {arBtn}
                {toggleAndReset}
              </div>
            );
          }
          // Desktop / laptop without touch — inline hint left of the toggle
          return (
            <div className="flex items-center gap-2">
              <div
                className="text-[10px] text-neutral-500"
                style={{ letterSpacing: "0.05em", maxWidth: 260, textAlign: "right" }}
              >
                ✦ Open on a phone to view your constellation in the real night sky
              </div>
              {toggleAndReset}
            </div>
          );
        })()}
      </div>

      {(() => {
        const atMin = currentScale <= MIN_ZOOM + 1e-6;
        const atMax = currentScale >= MAX_ZOOM - 1e-6;
        const phoneBottom = sheetExpanded ? "calc(55vh + 16px)" : 80;
        // Finger-camera panel ≈ 384px tall + 16px bottom offset; add 16px gap above it.
        const desktopBottom = cameraOpen ? 420 : 64;
        const pillStyle: React.CSSProperties = isPhone
          ? { position: "fixed", left: 16, bottom: phoneBottom, transition: "bottom 220ms ease" }
          : { position: "fixed", left: 16, bottom: desktopBottom, transition: "bottom 220ms ease" };
        const btnStyle = (disabled: boolean): React.CSSProperties => ({
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          color: "#fff",
          fontFamily: "'Roboto Mono', monospace",
          fontSize: 18,
          lineHeight: 1,
          opacity: disabled ? 0.3 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        });
        return (
          <div
            style={{
              ...pillStyle,
              width: 36,
              background: "rgba(0, 8, 20, 0.85)",
              border: "1px solid #1a3a5c",
              borderRadius: 12,
              overflow: "hidden",
              zIndex: 30,
            }}
            aria-label="Zoom controls"
          >
            <button
              onClick={() => zoomBy(1.5)}
              disabled={atMax}
              style={btnStyle(atMax)}
              aria-label="Zoom in"
            >
              +
            </button>
            <div style={{ height: 1, background: "#1a3a5c" }} />
            <button
              onClick={() => zoomBy(1 / 1.5)}
              disabled={atMin}
              style={btnStyle(atMin)}
              aria-label="Zoom out"
            >
              −
            </button>
          </div>
        );
      })()}


      <SketchHUD
        onMapToStars={handleMapToStars}
        status={status}
        matchedStarNames={matchedStarNames}
        onSheetExpandedChange={setSheetExpanded}
        onCameraOpenChange={setCameraOpen}
      />

      {arOpen && canAR && (
        <ARSkyView
          stars={starsRef.current}
          constellation={constellationStars}
          onClose={() => setArOpen(false)}
        />
      )}
    </div>
  );
}
