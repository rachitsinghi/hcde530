import { useCallback, useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

// Lazy CDN import for MediaPipe Tasks Vision (HandLandmarker)
type MpVision = {
  FilesetResolver: { forVisionTasks: (wasmPath: string) => Promise<unknown> };
  HandLandmarker: {
    createFromOptions: (
      resolver: unknown,
      opts: Record<string, unknown>,
    ) => Promise<MpHandLandmarker>;
  };
};
type MpLandmark = { x: number; y: number; z: number };
type MpHandLandmarker = {
  detectForVideo: (video: HTMLVideoElement, ts: number) => { landmarks: MpLandmark[][] };
  close?: () => void;
};

let mpVisionPromise: Promise<MpVision> | null = null;
function loadMpVision(): Promise<MpVision> {
  if (!mpVisionPromise) {
    const url =
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
    mpVisionPromise = (new Function("u", "return import(u)")(url) as Promise<MpVision>);
  }
  return mpVisionPromise;
}

interface Point {
  x: number;
  y: number;
}

interface SketchHUDProps {
  onMapToStars?: (vertices: Point[]) => void;
  status?: string | null;
  matchedStarNames?: string[];
  onSheetExpandedChange?: (expanded: boolean) => void;
  onCameraOpenChange?: (open: boolean) => void;
}

const CANVAS_SIZE = 280;
const GRID_SPACING = 20;
const GRID_OFFSET = 10;
const VERTEX_HIT_RADIUS = 10;

function snapToGrid(x: number, y: number): Point {
  const sx = Math.round((x - GRID_OFFSET) / GRID_SPACING) * GRID_SPACING + GRID_OFFSET;
  const sy = Math.round((y - GRID_OFFSET) / GRID_SPACING) * GRID_SPACING + GRID_OFFSET;
  return {
    x: Math.max(GRID_OFFSET, Math.min(CANVAS_SIZE - GRID_OFFSET, sx)),
    y: Math.max(GRID_OFFSET, Math.min(CANVAS_SIZE - GRID_OFFSET, sy)),
  };
}

type NameState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; name: string }
  | { kind: "error"; message: string };

type ImagineState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

const MAX_IMAGINE_POINTS = 24;

function parseSvgPathPoints(d: string): [number, number][] {
  const pts: [number, number][] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  const segments = d.match(/[a-zA-Z][^a-zA-Z]*/g) ?? [];
  for (const seg of segments) {
    const cmd = seg[0];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const nums = (seg.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    let i = 0;
    if (C === "M") {
      let first = true;
      while (i + 1 < nums.length) {
        let x = nums[i++];
        let y = nums[i++];
        if (rel) { x += cx; y += cy; }
        cx = x; cy = y;
        if (first) { startX = x; startY = y; first = false; }
        pts.push([x, y]);
      }
    } else if (C === "L") {
      while (i + 1 < nums.length) {
        let x = nums[i++];
        let y = nums[i++];
        if (rel) { x += cx; y += cy; }
        cx = x; cy = y;
        pts.push([x, y]);
      }
    } else if (C === "H") {
      while (i < nums.length) {
        let x = nums[i++];
        if (rel) x += cx;
        cx = x;
        pts.push([cx, cy]);
      }
    } else if (C === "V") {
      while (i < nums.length) {
        let y = nums[i++];
        if (rel) y += cy;
        cy = y;
        pts.push([cx, cy]);
      }
    } else if (C === "Z") {
      pts.push([startX, startY]);
      cx = startX;
      cy = startY;
    }
    // ignore curve commands (C, S, Q, T, A) entirely
  }
  return pts;
}

function downsamplePoints<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

export function SketchHUD({ onMapToStars, status, matchedStarNames = [], onSheetExpandedChange, onCameraOpenChange }: SketchHUDProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [vertices, setVertices] = useState<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [description, setDescription] = useState("");
  const [nameState, setNameState] = useState<NameState>({ kind: "idle" });
  const [imagineText, setImagineText] = useState("");
  const [imagineState, setImagineState] = useState<ImagineState>({ kind: "idle" });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fingerDrawing, setFingerDrawing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<MpHandLandmarker | null>(null);
  const fingerRafRef = useRef<number | null>(null);
  const lastVertexRef = useRef<Point | null>(null);
  const lastVertexTimeRef = useRef<number>(0);
  const wasExtendedRef = useRef(false);
  const trailRef = useRef<Point[]>([]);
  const smoothedRef = useRef<Point | null>(null);
  const dwellRef = useRef<{ x: number; y: number; startedAt: number; armed: boolean } | null>(null);

  const placedDotsRef = useRef<Point[]>([]);
  const calibrationRef = useRef<{
    phase: "calibrating" | "complete" | "ready";
    startedAt: number;
    samples: number[];
    threshold: number;
    message: string;
  }>({ phase: "calibrating", startedAt: 0, samples: [], threshold: 55, message: "" });
  const [calibrationMsg, setCalibrationMsg] = useState<string>("");
  const dragRef = useRef<{ index: number; moved: boolean } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const isMobile = useIsMobile();
  const [sheetExpanded, setSheetExpanded] = useState(true);
  useEffect(() => { onSheetExpandedChange?.(sheetExpanded); }, [sheetExpanded, onSheetExpandedChange]);
  useEffect(() => { onCameraOpenChange?.(cameraOpen); }, [cameraOpen, onCameraOpenChange]);

  const [hasMapped, setHasMapped] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = "#000814";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    ctx.fillStyle = "rgba(74, 158, 255, 0.22)";
    for (let x = GRID_OFFSET; x <= CANVAS_SIZE - GRID_OFFSET; x += GRID_SPACING) {
      for (let y = GRID_OFFSET; y <= CANVAS_SIZE - GRID_OFFSET; y += GRID_SPACING) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (mousePos && !dragRef.current && !editMode) {
      const snapped = snapToGrid(mousePos.x, mousePos.y);
      ctx.beginPath();
      ctx.fillStyle = "rgba(74, 158, 255, 0.55)";
      ctx.arc(snapped.x, snapped.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (vertices.length > 1) {
      ctx.strokeStyle = "#4a9eff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
      }
      ctx.stroke();
    }

    if (vertices.length > 0 && mousePos && !dragRef.current && !editMode) {
      const last = vertices[vertices.length - 1];
      ctx.save();
      ctx.strokeStyle = "rgba(74, 158, 255, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(mousePos.x, mousePos.y);
      ctx.stroke();
      ctx.restore();
    }

    for (const v of vertices) {
      ctx.beginPath();
      ctx.fillStyle = editMode ? "rgba(255, 122, 122, 0.22)" : "rgba(74, 158, 255, 0.25)";
      ctx.arc(v.x, v.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = editMode ? "#ff7a7a" : "#4a9eff";
      ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
      ctx.fill();

      if (editMode) {
        ctx.save();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        const s = 3;
        ctx.beginPath();
        ctx.moveTo(v.x - s, v.y - s);
        ctx.lineTo(v.x + s, v.y + s);
        ctx.moveTo(v.x + s, v.y - s);
        ctx.lineTo(v.x - s, v.y + s);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [vertices, mousePos, editMode]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const findVertexAt = (pos: Point): number => {
    for (let i = 0; i < vertices.length; i++) {
      const dx = vertices[i].x - pos.x;
      const dy = vertices[i].y - pos.y;
      if (dx * dx + dy * dy <= VERTEX_HIT_RADIUS * VERTEX_HIT_RADIUS) return i;
    }
    return -1;
  };

  // Min spacing (in canvas px) between consecutive stars while finger-swiping.
  const TOUCH_STROKE_SPACING = GRID_SPACING * 3;
  const touchStrokeRef = useRef<{ active: boolean; lastSnapped: Point | null } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (editMode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = getPos(e);

    if (e.pointerType === "touch" || e.pointerType === "pen") {
      // Swipe-to-draw: drop the first star immediately, then keep dropping
      // as the finger moves far enough.
      const idx = findVertexAt(pos);
      if (idx >= 0) {
        // Tap on existing vertex closes/loops back to it.
        dragRef.current = { index: idx, moved: false };
        return;
      }
      const snapped = snapToGrid(pos.x, pos.y);
      touchStrokeRef.current = { active: true, lastSnapped: snapped };
      setVertices((v) => {
        const last = v[v.length - 1];
        if (last && last.x === snapped.x && last.y === snapped.y) return v;
        return [...v, snapped];
      });
      return;
    }

    const idx = findVertexAt(pos);
    if (idx >= 0) {
      dragRef.current = { index: idx, moved: false };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    if (editMode) {
      setMousePos(pos);
      return;
    }
    if (touchStrokeRef.current?.active) {
      const snapped = snapToGrid(pos.x, pos.y);
      const last = touchStrokeRef.current.lastSnapped;
      const dx = last ? snapped.x - last.x : Infinity;
      const dy = last ? snapped.y - last.y : Infinity;
      if (dx * dx + dy * dy >= TOUCH_STROKE_SPACING * TOUCH_STROKE_SPACING) {
        touchStrokeRef.current.lastSnapped = snapped;
        setVertices((v) => {
          const l = v[v.length - 1];
          if (l && l.x === snapped.x && l.y === snapped.y) return v;
          return [...v, snapped];
        });
      }
      return;
    }
    if (dragRef.current) {
      const snapped = snapToGrid(pos.x, pos.y);
      const { index } = dragRef.current;
      dragRef.current.moved = true;
      setVertices((vs) => {
        if (index >= vs.length) return vs;
        const next = vs.slice();
        next[index] = snapped;
        return next;
      });
    } else {
      setMousePos(snapToGrid(pos.x, pos.y));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    if (editMode) {
      const idx = findVertexAt(pos);
      if (idx >= 0) {
        setVertices((vs) => vs.filter((_, i) => i !== idx));
      } else {
        setEditMode(false);
      }
      return;
    }
    if (touchStrokeRef.current?.active) {
      touchStrokeRef.current = null;
      dragRef.current = null;
      return;
    }
    const wasDragging = dragRef.current;
    dragRef.current = null;
    if (wasDragging && wasDragging.moved) return;
    if (wasDragging && !wasDragging.moved) {
      setVertices((v) => {
        if (wasDragging.index >= v.length) return v;
        const target = v[wasDragging.index];
        const last = v[v.length - 1];
        if (last && last.x === target.x && last.y === target.y) return v;
        return [...v, { x: target.x, y: target.y }];
      });
      return;
    }
    if (e.pointerType === "mouse") {
      const snapped = snapToGrid(pos.x, pos.y);
      setVertices((v) => [...v, snapped]);
    }
  };

  const handlePointerLeave = () => {
    setMousePos(null);
    dragRef.current = null;
    touchStrokeRef.current = null;
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (vertices.length < 2) return;
    const closed = [...vertices, vertices[0]];
    setVertices(closed);
    setMousePos(null);
    onMapToStars?.(closed);
  };

  const handleClear = () => {
    setEditMode(false);
    setVertices([]);
    setMousePos(null);
    setNameState({ kind: "idle" });
    setHasMapped(false);
    placedDotsRef.current = [];
    dwellRef.current = null;
    onMapToStars?.([]);
  };

  const handleMapToStars = () => {
    onMapToStars?.(vertices);
    if (vertices.length > 0) {
      setHasMapped(true);
      setSheetExpanded(false);
    }
  };

  const handleImagine = async () => {
    const desc = imagineText.trim();
    if (!desc) return;
    setImagineState({ kind: "loading" });
    try {
      const searchUrl = `https://api.iconify.design/search?query=${encodeURIComponent(desc)}&limit=1&pretty=1`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) {
        setImagineState({ kind: "error", message: "COULDN'T FIND THAT SHAPE — TRY DIFFERENT WORDS" });
        return;
      }
      const searchData = (await searchRes.json()) as { icons?: string[] };
      const first = searchData.icons?.[0];
      if (!first || !first.includes(":")) {
        setImagineState({ kind: "error", message: "COULDN'T FIND THAT SHAPE — TRY DIFFERENT WORDS" });
        return;
      }
      const [prefix, name] = first.split(":");
      const svgRes = await fetch(`https://api.iconify.design/${prefix}/${name}.svg`);
      if (!svgRes.ok) {
        setImagineState({ kind: "error", message: "COULDN'T FIND THAT SHAPE — TRY DIFFERENT WORDS" });
        return;
      }
      const svgText = await svgRes.text();
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svgEl = doc.querySelector("svg");
      const vb = (svgEl?.getAttribute("viewBox") ?? "0 0 24 24").split(/[\s,]+/).map(Number);
      const vbW = vb[2] || 24;
      const vbH = vb[3] || 24;

      const paths = Array.from(doc.querySelectorAll("path"));
      let rawPoints: [number, number][] = [];
      for (const p of paths) {
        const d = p.getAttribute("d");
        if (!d) continue;
        rawPoints = rawPoints.concat(parseSvgPathPoints(d));
      }

      // Fall back to the icon's bounding box (or viewBox) if no straight-line vertices were found.
      if (rawPoints.length < 2) {
        rawPoints = [
          [0, 0],
          [vbW, 0],
          [vbW, vbH],
          [0, vbH],
          [0, 0],
        ];
      }

      const sampled = downsamplePoints(rawPoints, MAX_IMAGINE_POINTS);
      const inner = CANVAS_SIZE - GRID_OFFSET * 2;
      const next: Point[] = sampled.map(([x, y]) =>
        snapToGrid(
          GRID_OFFSET + (x / vbW) * inner,
          GRID_OFFSET + (y / vbH) * inner,
        ),
      );
      setVertices(next);
      setImagineState({ kind: "idle" });
    } catch {
      setImagineState({ kind: "error", message: "COULDN'T FIND THAT SHAPE — TRY DIFFERENT WORDS" });
    }
  };

  const handleGetName = async () => {
    const desc = description.trim();
    if (!desc) {
      setNameState({ kind: "error", message: "ADD A DESCRIPTION FIRST" });
      return;
    }
    setNameState({ kind: "loading" });
    try {
      const res = await fetch("/api/name-constellation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc, matchedStarNames }),
      });
      if (!res.ok) {
        setNameState({ kind: "error", message: "NAMING FAILED — TRY AGAIN" });
        return;
      }
      const data = (await res.json()) as { name?: string; error?: string };
      if (data.name) {
        setNameState({ kind: "success", name: data.name });
      } else {
        setNameState({ kind: "error", message: "NAMING FAILED — TRY AGAIN" });
      }
    } catch {
      setNameState({ kind: "error", message: "NAMING FAILED — TRY AGAIN" });
    }
  };

  const stopCamera = useCallback(() => {
    if (fingerRafRef.current != null) {
      cancelAnimationFrame(fingerRafRef.current);
      fingerRafRef.current = null;
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    try {
      landmarkerRef.current?.close?.();
    } catch {
      /* noop */
    }
    landmarkerRef.current = null;
    lastVertexRef.current = null;
    lastVertexTimeRef.current = 0;
    wasExtendedRef.current = false;
    trailRef.current = [];
    smoothedRef.current = null;
    dwellRef.current = null;

    placedDotsRef.current = [];
    calibrationRef.current = { phase: "calibrating", startedAt: 0, samples: [], threshold: 55, message: "" };
    setCalibrationMsg("");
    setFingerDrawing(false);
  }, []);


  const closeCamera = () => {
    stopCamera();
    setCameraOpen(false);
    setCameraError(null);
  };

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    setCameraError(null);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const vision = await loadMpVision();
        if (cancelled) return;
        const resolver = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
        );
        if (cancelled) return;
        const landmarker = await vision.HandLandmarker.createFromOptions(resolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
        });
        if (cancelled) {
          landmarker.close?.();
          return;
        }
        landmarkerRef.current = landmarker;

        const inner = CANVAS_SIZE - GRID_OFFSET * 2;
        calibrationRef.current = {
          phase: "calibrating",
          startedAt: performance.now(),
          samples: [],
          threshold: 55,
          message: "HOLD YOUR HAND UP — CALIBRATING",
        };
        setCalibrationMsg("HOLD YOUR HAND UP — CALIBRATING");

        const drawOverlayText = (octx: CanvasRenderingContext2D, ov: HTMLCanvasElement, text: string) => {
          if (!text) return;

          let line1 = text;
          let line2 = "";
          const dashIdx = text.indexOf(" — ");
          if (dashIdx >= 0) {
            line1 = text.slice(0, dashIdx);
            line2 = text.slice(dashIdx + 3);
          }

          const fontSize = 10;
          const lineHeight = 13;
          const padX = 10;
          const padY = 7;

          octx.save();
          octx.font = `600 ${fontSize}px 'Roboto Mono', monospace`;
          octx.textAlign = "center";
          octx.textBaseline = "middle";

          const m1 = octx.measureText(line1);
          const m2 = line2 ? octx.measureText(line2) : { width: 0 };
          const maxTextWidth = Math.max(m1.width, m2.width);

          const boxW = Math.min(ov.width - 20, maxTextWidth + padX * 2);
          const boxH = padY * 2 + fontSize + (line2 ? lineHeight : 0);
          const boxX = (ov.width - boxW) / 2;
          const boxY = 10;

          octx.fillStyle = "rgba(0, 8, 20, 0.92)";
          octx.fillRect(boxX, boxY, boxW, boxH);

          octx.strokeStyle = "#1a3a5c";
          octx.lineWidth = 1;
          octx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

          octx.fillStyle = "#e8f0ff";
          octx.shadowColor = "transparent";
          octx.shadowBlur = 0;

          const centerX = ov.width / 2;
          const baseY = boxY + padY + fontSize / 2;

          octx.fillText(line1, centerX, baseY);
          if (line2) {
            octx.fillText(line2, centerX, baseY + lineHeight);
          }

          octx.restore();
        };


        const tick = () => {
          fingerRafRef.current = requestAnimationFrame(tick);
          const v = videoRef.current;
          const ov = overlayRef.current;
          if (!v || !ov || v.readyState < 2 || !landmarkerRef.current) return;
          const result = landmarkerRef.current.detectForVideo(v, performance.now());
          const octx = ov.getContext("2d");
          if (!octx) return;
          octx.clearRect(0, 0, ov.width, ov.height);

          const hand = result.landmarks?.[0];
          const cal = calibrationRef.current;
          const now = performance.now();

          // Calibration phase
          if (cal.phase === "calibrating") {
            if (hand) {
              const wrist = hand[0];
              const mid = hand[9];
              const dx = (wrist.x - mid.x) * ov.width;
              const dy = (wrist.y - mid.y) * ov.height;
              cal.samples.push(Math.hypot(dx, dy));
            }
            const elapsed = now - cal.startedAt;
            if (elapsed >= 3000) {
              if (cal.samples.length === 0) {
                cal.threshold = 55;
                cal.message = "NO HAND DETECTED — USING DEFAULT SENSITIVITY";
              } else {
                const avg = cal.samples.reduce((a, b) => a + b, 0) / cal.samples.length;
                cal.threshold = 55 * (avg / 80);
                cal.message = "CALIBRATION COMPLETE — START DRAWING";
              }
              cal.phase = "complete";
              cal.startedAt = now;
              setCalibrationMsg(cal.message);
            }
            drawOverlayText(octx, ov, cal.message);
            setFingerDrawing(false);
            return;
          }
          if (cal.phase === "complete") {
            drawOverlayText(octx, ov, cal.message);
            if (now - cal.startedAt >= 1000) {
              cal.phase = "ready";
              setCalibrationMsg("");
            }
            setFingerDrawing(false);
            return;
          }

          if (!hand) {
            setFingerDrawing(false);
            // keep placed dots visible, but clear trail
            trailRef.current = [];
            dwellRef.current = null;
            // redraw placed dots
            for (const p of placedDotsRef.current) {
              octx.beginPath();
              octx.fillStyle = "#4a9eff";
              octx.arc(p.x, p.y, 5, 0, Math.PI * 2);
              octx.fill();
            }
            return;
          }
          const tip = hand[8];
          const pip = hand[6];
          const extended = tip.y < pip.y - 0.04;
          const rawFx = 1 - tip.x; // video is mirrored
          const rawFy = tip.y;
          // Exponential smoothing to reduce jitter
          const prev = smoothedRef.current;
          const alpha = 0.16;
          const fx = prev ? prev.x + (rawFx - prev.x) * alpha : rawFx;
          const fy = prev ? prev.y + (rawFy - prev.y) * alpha : rawFy;
          smoothedRef.current = { x: fx, y: fy };
          const ox = fx * ov.width;
          const oy = fy * ov.height;


          // On pen-up (was extended, now not), clear the trail
          if (!extended && wasExtendedRef.current) {
            trailRef.current = [];
            dwellRef.current = null;
          }

          // Draw lines between placed dots (mirrors the drawing pad)
          if (placedDotsRef.current.length > 1) {
            octx.save();
            octx.strokeStyle = "rgba(74, 158, 255, 0.7)";
            octx.lineWidth = 2;
            octx.lineCap = "round";
            octx.lineJoin = "round";
            octx.beginPath();
            octx.moveTo(placedDotsRef.current[0].x, placedDotsRef.current[0].y);
            for (let i = 1; i < placedDotsRef.current.length; i++) {
              octx.lineTo(placedDotsRef.current[i].x, placedDotsRef.current[i].y);
            }
            octx.stroke();
            octx.restore();
          }

          // Draw placed dots
          for (const p of placedDotsRef.current) {
            octx.beginPath();
            octx.fillStyle = "#4a9eff";
            octx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            octx.fill();
          }


          // Fingertip marker
          octx.beginPath();
          octx.fillStyle = extended ? "rgba(74, 158, 255, 0.95)" : "rgba(150, 160, 170, 0.7)";
          octx.shadowColor = extended ? "rgba(74, 158, 255, 0.9)" : "transparent";
          octx.shadowBlur = extended ? 14 : 0;
          octx.arc(ox, oy, 8, 0, Math.PI * 2);
          octx.fill();
          octx.shadowBlur = 0;

          setFingerDrawing(extended);

          if (extended) {
            const padX = GRID_OFFSET + Math.max(0, Math.min(1, fx)) * inner;
            const padY = GRID_OFFSET + Math.max(0, Math.min(1, fy)) * inner;
            const snapped = snapToGrid(padX, padY);
            const last = lastVertexRef.current;

            if (!dwellRef.current) {
              dwellRef.current = { x: ox, y: oy, startedAt: now, armed: true };
            } else {
              const movement = Math.hypot(ox - dwellRef.current.x, oy - dwellRef.current.y);
              if (movement > 14) {
                dwellRef.current = { x: ox, y: oy, startedAt: now, armed: true };
              }
            }

            const dwell = dwellRef.current;
            const dist = last ? Math.hypot(snapped.x - last.x, snapped.y - last.y) : Infinity;
            const hasPaused = !!dwell && now - dwell.startedAt >= 140;

            const distOk = !last || dist >= cal.threshold;

            if (dwell?.armed && hasPaused) {
              dwell.armed = false;

              if (distOk) {
                lastVertexRef.current = snapped;
                lastVertexTimeRef.current = now;
                placedDotsRef.current.push({ x: ox, y: oy });
                if (placedDotsRef.current.length > 100) placedDotsRef.current.shift();
                setVertices((vs) => {
                  if (vs.length > 0) {
                    const tail = vs[vs.length - 1];
                    if (tail.x === snapped.x && tail.y === snapped.y) return vs;
                  }
                  return [...vs, snapped];
                });
              }
            }
          } else {
            dwellRef.current = null;
          }
          wasExtendedRef.current = extended;
        };
        fingerRafRef.current = requestAnimationFrame(tick);

      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error && /permission|denied|notallowed/i.test(err.message + err.name)
            ? "CAMERA ACCESS NEEDED — CHECK BROWSER SETTINGS"
            : "CAMERA UNAVAILABLE — CHECK BROWSER SETTINGS";
        setCameraError(msg);
        stopCamera();
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraOpen, stopCamera]);

  const isLoading = nameState.kind === "loading";
  const isImagining = imagineState.kind === "loading";

  const handleDownloadPng = () => {
    const canvases = Array.from(
      document.querySelectorAll("canvas"),
    ) as HTMLCanvasElement[];
    const canvas = canvases
      .filter((c) => c !== canvasRef.current)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!canvas) return;
    const displayName =
      nameState.kind === "success" ? nameState.name : "";
    const slug =
      (displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")) || "my-constellation";
    try {
      const out = document.createElement("canvas");
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(canvas, 0, 0);

      if (displayName) {
        // Match the on-screen overlay style: Roboto Mono, light weight, wide
        // tracking, uppercase, soft cool-white, near the top of the canvas.
        const text = displayName.toUpperCase();
        const fontSize = Math.max(18, Math.round(out.width * 0.022));
        const trackingEm = 0.32;
        ctx.font = `300 ${fontSize}px 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        // Manually space glyphs to emulate CSS letter-spacing: 0.32em.
        const trackingPx = fontSize * trackingEm;
        const chars = Array.from(text);
        const widths = chars.map((c) => ctx.measureText(c).width);
        const totalWidth =
          widths.reduce((a, b) => a + b, 0) + trackingPx * Math.max(0, chars.length - 1);
        const startX = (out.width - totalWidth) / 2;
        const y = Math.round(out.height * 0.04);

        const drawTracked = (fill: string, offsetY: number) => {
          ctx.fillStyle = fill;
          let cx = startX;
          for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], cx, y + offsetY);
            cx += widths[i] + trackingPx;
          }
        };

        // Subtle 1px drop shadow underneath (matches textShadow on the web overlay).
        drawTracked("rgba(0, 8, 20, 0.9)", 1);
        // Main glyphs in the same cool off-white used on screen.
        drawTracked("rgba(230, 240, 255, 0.85)", 0);
      }

      const url = out.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // ignore
    }
  };

  const heading = (
    <div
      style={{
        color: "#4a9eff",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        fontWeight: 600,
        textShadow: "0 1px 0 rgba(0, 8, 20, 0.9)",
      }}
    >
      // DRAW CONSTELLATION
    </div>
  );

  const imagineRow = (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        value={imagineText}
        onChange={(e) => {
          setImagineText(e.target.value);
          if (imagineState.kind === "error") setImagineState({ kind: "idle" });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isImagining) handleImagine();
        }}
        placeholder="imagine a shape… e.g. cat face, crown"
        className="flex-1 px-2 py-1 text-[11px] outline-none focus:border-[#4a9eff]"
        style={{
          background: "#000814",
          color: "#e5e7eb",
          border: "1px solid #1a3a5c",
          borderRadius: 4,
          fontFamily: "'Roboto Mono', monospace",
          minWidth: 0,
        }}
      />
      <button
        onClick={handleImagine}
        disabled={isImagining}
        className="px-2 py-1 text-[11px]"
        style={{
          background: "transparent",
          color: "#4a9eff",
          border: "1px solid #4a9eff",
          borderRadius: 4,
          fontFamily: "'Roboto Mono', monospace",
          whiteSpace: "nowrap",
          animation: isImagining ? "tt-pulse 1.2s ease-in-out infinite" : undefined,
        }}
      >
        {isImagining ? "IMAGINING…" : "IMAGINE →"}
      </button>
    </div>
  );

  const imagineError = imagineState.kind === "error" && (
    <div style={{ color: "#ff7a7a", fontSize: 10, letterSpacing: "0.05em" }}>
      {imagineState.message}
    </div>
  );

  const sectionLabelStyle: React.CSSProperties = {
    color: "#6b8eb8",
    fontSize: 9,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    fontFamily: "'Roboto Mono', monospace",
  };

  const typeLabel = <div style={sectionLabelStyle}>Type a shape</div>;

  const orDivider = (
    <div className="flex items-center gap-2" aria-hidden>
      <div style={{ flex: 1, height: 1, background: "#1a3a5c" }} />
      <span
        style={{
          color: "#6b8eb8",
          fontSize: 9,
          letterSpacing: "0.2em",
          fontFamily: "'Roboto Mono', monospace",
        }}
      >
        OR
      </span>
      <div style={{ flex: 1, height: 1, background: "#1a3a5c" }} />
    </div>
  );

  const drawLabel = <div style={sectionLabelStyle}>Draw it yourself</div>;

  const hint = (
    <div
      style={{
        color: "#4a9eff",
        opacity: 0.7,
        fontSize: 9,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      {editMode
        ? "CLICK A DOT TO REMOVE · CLICK EMPTY SPACE TO EXIT"
        : vertices.length === 0
          ? "CLICK TO BEGIN"
          : vertices.length === 1
            ? "CLICK TO ADD · DRAG DOTS TO ADJUST"
            : "CLICK · DRAG DOTS · RIGHT-CLICK TO FINISH"}
    </div>
  );

  const canvasEl = (
    <div style={{ position: "relative", width: CANVAS_SIZE, maxWidth: "100%", margin: isMobile ? "0 auto" : undefined }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onContextMenu={handleContextMenu}
        style={{
          width: CANVAS_SIZE,
          height: CANVAS_SIZE,
          maxWidth: "100%",
          background: "#000814",
          border: `1px solid ${editMode ? "#ff7a7a" : "#1a3a5c"}`,
          cursor: "crosshair",
          display: "block",
          touchAction: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 8,
          color: "#4a9eff",
          fontSize: 10,
          letterSpacing: "0.08em",
          fontFamily: "'Roboto Mono', monospace",
          pointerEvents: "none",
          textShadow: "0 1px 2px rgba(0,8,20,0.9)",
        }}
      >
        VERTICES: {vertices.length}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setEditMode((m) => !m);
        }}
        disabled={vertices.length === 0 && !editMode}
        style={{
          position: "absolute",
          left: 6,
          bottom: 6,
          padding: "3px 8px",
          fontSize: 9,
          letterSpacing: "0.15em",
          fontFamily: "'Roboto Mono', monospace",
          background: editMode ? "#ff7a7a" : "rgba(0, 8, 20, 0.8)",
          color: editMode ? "#000" : "#9ca3af",
          border: `1px solid ${editMode ? "#ff7a7a" : "#4b5563"}`,
          borderRadius: 3,
          cursor: vertices.length === 0 && !editMode ? "not-allowed" : "pointer",
          opacity: vertices.length === 0 && !editMode ? 0.4 : 1,
        }}
      >
        {editMode ? "DONE" : "EDIT"}
      </button>
    </div>
  );



  const statusLabel = status && (
    <div style={{ color: "#4a9eff", fontSize: 10, letterSpacing: "0.08em" }}>{status}</div>
  );

  const clearBtn = (
    <button
      onClick={handleClear}
      className="flex-1 py-1.5 text-xs"
      style={{
        background: "transparent",
        color: "#9ca3af",
        border: "1px solid #4b5563",
        borderRadius: 6,
        fontFamily: "'Roboto Mono', monospace",
      }}
    >
      CLEAR
    </button>
  );

  const mapBtn = (
    <button
      onClick={handleMapToStars}
      className="flex-1 py-1.5 text-xs font-medium"
      style={{
        background: "#4a9eff",
        color: "#000",
        border: "none",
        borderRadius: 6,
        fontFamily: "'Roboto Mono', monospace",
      }}
    >
      MAP TO STARS →
    </button>
  );

  const descInput = (
    <input
      type="text"
      value={description}
      onChange={(e) => {
        setDescription(e.target.value);
        if (nameState.kind === "error") setNameState({ kind: "idle" });
      }}
      placeholder="describe your constellation…"
      className="w-full px-2.5 py-1.5 text-xs outline-none focus:border-[#4a9eff]"
      style={{
        background: "#000814",
        color: "#e5e7eb",
        border: "1px solid #1a3a5c",
        borderRadius: 6,
        fontFamily: "'Roboto Mono', monospace",
      }}
    />
  );

  const getNameBtn = (
    <button
      onClick={handleGetName}
      disabled={isLoading}
      className="w-full py-1.5 text-xs"
      style={{
        background: "transparent",
        color: "#4a9eff",
        border: "1px solid #4a9eff",
        borderRadius: 6,
        fontFamily: "'Roboto Mono', monospace",
        opacity: isLoading ? 0.85 : 1,
        animation: isLoading ? "tt-pulse 1.2s ease-in-out infinite" : undefined,
      }}
    >
      {isLoading ? "GENERATING…" : "GET NAME"}
    </button>
  );

  const downloadBtn = (
    <button
      onClick={handleDownloadPng}
      className="w-full py-1.5 text-xs"
      style={{
        background: "transparent",
        color: "#4a9eff",
        border: "1px solid #4a9eff",
        borderRadius: 6,
        fontFamily: "'Roboto Mono', monospace",
      }}
    >
      DOWNLOAD PNG
    </button>
  );

  const nameError = nameState.kind === "error" && (
    <div
      style={{
        color: "#ff5555",
        fontSize: 10,
        letterSpacing: "0.05em",
        textAlign: "center",
      }}
    >
      {nameState.message}
    </div>
  );

  const fingerCameraPanel = (panelWidth: number | string) => (
    <div
      className="p-3 flex flex-col gap-2"
      style={{
        width: panelWidth,
        background: "rgba(0, 8, 20, 0.95)",
        border: "1px solid #1a3a5c",
        borderRadius: 12,
        fontFamily: "'Roboto Mono', monospace",
      }}
    >
      <div
        style={{
          color: "#4a9eff",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        // FINGER DRAW
      </div>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          maxWidth: CANVAS_SIZE,
          margin: "0 auto",
          background: "#000814",
          border: "1px solid #1a3a5c",
          overflow: "hidden",
          borderRadius: 6,
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)",
          }}
        />
        <canvas
          ref={overlayRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />
        {cameraError && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 16,
              color: "#ff7a7a",
              fontSize: 11,
              letterSpacing: "0.06em",
              background: "rgba(0,8,20,0.92)",
            }}
          >
            {cameraError}
          </div>
        )}
      </div>
      <div
        style={{
          color: fingerDrawing ? "#4a9eff" : "#9ca3af",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {cameraError ? "—" : fingerDrawing ? "DRAWING" : "PEN UP"}
      </div>
      <button
        onClick={closeCamera}
        className="w-full py-1.5 text-xs"
        style={{
          background: "#4a9eff",
          color: "#000",
          border: "none",
          borderRadius: 6,
          fontFamily: "'Roboto Mono', monospace",
        }}
      >
        ✓ DONE
      </button>
    </div>
  );

  const fingerTriggerBtn = (compact: boolean) => (
    <button
      onClick={() => setCameraOpen(true)}
      style={{
        background: compact ? "transparent" : "rgba(0, 8, 20, 0.85)",
        color: "#4a9eff",
        border: "1px solid #4a9eff",
        borderRadius: 8,
        fontFamily: "'Roboto Mono', monospace",
        letterSpacing: "0.08em",
        padding: compact ? "6px 10px" : "8px 12px",
        fontSize: 11,
        whiteSpace: "nowrap",
      }}
      aria-label="Draw with finger"
    >
      {compact ? "✦" : "✦ DRAW WITH FINGER"}
    </button>
  );

  const successName = nameState.kind === "success" && (
    <div
      className="absolute left-1/2 pointer-events-none"
      style={{
        top: 28,
        transform: "translateX(-50%)",
        fontFamily: "'Roboto Mono', monospace",
        color: "rgba(230, 240, 255, 0.85)",
        fontSize: 18,
        fontWeight: 300,
        letterSpacing: "0.32em",
        textTransform: "uppercase",
        textShadow: "0 1px 0 rgba(0, 8, 20, 0.9)",
        whiteSpace: "nowrap",
      }}
    >
      {(nameState as { kind: "success"; name: string }).name}
    </div>
  );

  const animationStyles = (
    <style>{`
      @keyframes tt-pulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
      }
    `}</style>
  );

  if (isMobile) {
    const sheetHeight = sheetExpanded ? "55vh" : 64;
    return (
      <>
        {successName}
        <div
          className="fixed left-0 right-0 bottom-0 flex flex-col"
          style={{
            height: sheetHeight,
            background: "rgba(0, 8, 20, 0.95)",
            borderTop: "1px solid #1a3a5c",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            fontFamily: "'Roboto Mono', monospace",
            transition: "height 220ms ease",
            zIndex: 40,
            boxShadow: "0 -8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {/* Drag handle / toggle */}
          <button
            onClick={() => setSheetExpanded((v) => !v)}
            aria-label={sheetExpanded ? "Collapse panel" : "Expand panel"}
            style={{
              background: "transparent",
              border: "none",
              padding: "8px 0 4px",
              display: "flex",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                display: "block",
                width: 40,
                height: 4,
                borderRadius: 2,
                background: "#6b7280",
              }}
            />
          </button>

          {!sheetExpanded && (() => {
            // State 3: mapped
            if (hasMapped) {
              return (
                <div className="px-4 pb-3 flex flex-col gap-2 relative">
                  <button
                    onClick={() => setSheetExpanded(true)}
                    style={{
                      position: "absolute",
                      top: -2,
                      right: 12,
                      background: "transparent",
                      border: "none",
                      color: "#9ca3af",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      fontFamily: "'Roboto Mono', monospace",
                      padding: 4,
                      cursor: "pointer",
                    }}
                  >
                    EDIT
                  </button>
                  <div
                    style={{
                      textAlign: "center",
                      color: "rgba(230, 240, 255, 0.9)",
                      fontSize: 13,
                      fontWeight: 300,
                      letterSpacing: "0.28em",
                      textTransform: "uppercase",
                      textShadow: "0 1px 0 rgba(0, 8, 20, 0.9)",
                      fontFamily: "'Roboto Mono', monospace",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      paddingInline: 48,
                    }}
                  >
                    {nameState.kind === "success" ? nameState.name : "✦ CONSTELLATION MAPPED"}
                  </div>
                  {downloadBtn}
                </div>
              );
            }
            // State 2: drawn, not mapped
            if (vertices.length > 0) {
              return (
                <div className="px-4 pb-3 flex flex-col gap-1.5">
                  <div
                    style={{
                      color: "#4a9eff",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textAlign: "center",
                    }}
                  >
                    VERTICES: {vertices.length}
                  </div>
                  <div className="flex items-center gap-2">
                    {clearBtn}
                    {mapBtn}
                  </div>
                </div>
              );
            }
            // State 1: empty
            return (
              <button
                onClick={() => setSheetExpanded(true)}
                className="w-full pb-3 pt-1"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(220, 235, 255, 0.85)",
                  fontSize: 11,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  fontFamily: "'Roboto Mono', monospace",
                  textShadow: "0 1px 0 rgba(0, 8, 20, 0.85)",
                  cursor: "pointer",
                }}
              >
                ✦ TAP TO DRAW YOUR CONSTELLATION
              </button>
            );
          })()}

          {sheetExpanded && (
            <div
              className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3"
              style={{ overscrollBehavior: "contain" }}
            >
              {heading}
              {typeLabel}
              {imagineRow}
              {imagineError}
              {orDivider}
              {drawLabel}
              {hint}
              {canvasEl}

              {statusLabel}
              <div className="flex gap-2">
                {clearBtn}
                {mapBtn}
              </div>
              {descInput}
              {getNameBtn}
              {downloadBtn}
              {!cameraOpen && (
                <button
                  onClick={() => setCameraOpen(true)}
                  className="w-full py-1.5 text-xs"
                  style={{
                    background: "transparent",
                    color: "#4a9eff",
                    border: "1px solid #4a9eff",
                    borderRadius: 6,
                    fontFamily: "'Roboto Mono', monospace",
                    letterSpacing: "0.08em",
                  }}
                >
                  ✦ DRAW WITH FINGER
                </button>
              )}
              {nameError}
            </div>
          )}
        </div>

        {cameraOpen && (
          <div
            className="fixed left-2 right-2 bottom-2"
            style={{ zIndex: 50 }}
          >
            {fingerCameraPanel("100%")}
          </div>
        )}

        {animationStyles}
      </>
    );
  }

  // Desktop layout
  return (
    <>
      {successName}

      <div
        className="absolute bottom-4 right-4 p-4 flex flex-col gap-3 overflow-hidden"
        style={{
          width: 320,
          background: "rgba(0, 8, 20, 0.85)",
          border: "1px solid #1a3a5c",
          borderRadius: 12,
          fontFamily: "'Roboto Mono', monospace",
          position: "absolute",
        }}
      >
        {heading}
        {typeLabel}
        {imagineRow}
        {imagineError}
        {orDivider}
        {drawLabel}
        {hint}
        {canvasEl}
        {statusLabel}
        <div className="flex gap-2">
          {clearBtn}
          {mapBtn}
        </div>
        {descInput}
        {getNameBtn}
        {downloadBtn}
        {nameError}
      </div>

      {!cameraOpen && (
        <div className="absolute bottom-4 left-4">{fingerTriggerBtn(false)}</div>
      )}

      {cameraOpen && (
        <div className="absolute bottom-4 left-4">
          {fingerCameraPanel(CANVAS_SIZE + 24)}
        </div>
      )}

      {animationStyles}
    </>
  );
}
