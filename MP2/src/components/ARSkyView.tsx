import { useEffect, useRef, useState } from "react";

interface Star {
  id: string;
  ra_deg: number;
  dec: number;
  mag: number;
  ci: number | null;
  proper: string;
}

interface Props {
  stars: Star[];
  constellation: Star[];
  onClose: () => void;
}

function colorForCI(ci: number | null): string {
  if (ci === null || Number.isNaN(ci)) return "#ffffff";
  if (ci < -0.2) return "#dde4ff";
  if (ci < 0.0) return "#e3e8ff";
  if (ci < 0.3) return "#ecefff";
  if (ci < 0.6) return "#ffffff";
  if (ci < 1.0) return "#fff8ee";
  if (ci < 1.5) return "#ffeed8";
  return "#ffe0c0";
}
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function starRadius(mag: number): number {
  const r = (6.5 - mag) * 0.55;
  return Math.max(0.5, Math.min(4, r));
}

const FOV_H = 60;
const FOV_V = 45;

export function ARSkyView({ stars, constellation, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const orientRef = useRef({ alpha: 0, beta: 0 });
  const smoothRef = useRef<{ alpha: number; beta: number } | null>(null);
  const lastDrawRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pulseStartRef = useRef<number | null>(null);
  const wasVisibleRef = useRef(false);

  const [heading, setHeading] = useState(0);
  const [nearby, setNearby] = useState(false);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // iOS orientation permission
        const DOE = (window as unknown as {
          DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
        }).DeviceOrientationEvent;
        if (DOE && typeof DOE.requestPermission === "function") {
          const res = await DOE.requestPermission();
          if (res !== "granted") throw new Error("orientation denied");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("CAMERA OR MOTION ACCESS NEEDED — CHECK YOUR BROWSER SETTINGS");
      }
    };
    init();

    const onOrient = (e: DeviceOrientationEvent) => {
      const a = e.alpha ?? 0;
      const b = e.beta ?? 0;
      orientRef.current = { alpha: a, beta: b };
    };
    window.addEventListener("deviceorientationabsolute", onOrient as EventListener);
    window.addEventListener("deviceorientation", onOrient);

    return () => {
      cancelled = true;
      window.removeEventListener("deviceorientationabsolute", onOrient as EventListener);
      window.removeEventListener("deviceorientation", onOrient);
      const s = streamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const conIds = new Set(constellation.map((s) => s.id));

    const tick = (t: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (t - lastDrawRef.current < 33) return;
      lastDrawRef.current = t;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;

      const raw = orientRef.current;
      // Low-pass smoothing with angle wrap on alpha
      if (!smoothRef.current) {
        smoothRef.current = { alpha: raw.alpha, beta: raw.beta };
      } else {
        const k = 0.12;
        let da = raw.alpha - smoothRef.current.alpha;
        if (da > 180) da -= 360;
        if (da < -180) da += 360;
        smoothRef.current.alpha = (smoothRef.current.alpha + da * k + 360) % 360;
        smoothRef.current.beta = smoothRef.current.beta + (raw.beta - smoothRef.current.beta) * k;
      }
      const alpha = smoothRef.current.alpha;
      const beta = smoothRef.current.beta;
      const centerRa = (360 - alpha + 180 + 360) % 360;
      const centerDec = Math.max(-90, Math.min(90, 90 - beta));
      setHeading(Math.round(alpha));


      ctx.clearRect(0, 0, w, h);

      const project = (ra: number, dec: number) => {
        let dRa = ra - centerRa;
        if (dRa > 180) dRa -= 360;
        if (dRa < -180) dRa += 360;
        const dDec = dec - centerDec;
        const sx = (dRa / FOV_H) * w + w / 2;
        const sy = (-dDec / FOV_V) * h + h / 2;
        return { sx, sy, dRa, dDec };
      };

      // background stars
      for (const s of stars) {
        const dDec = s.dec - centerDec;
        if (Math.abs(dDec) > FOV_V / 2 + 2) continue;
        let dRa = s.ra_deg - centerRa;
        if (dRa > 180) dRa -= 360;
        if (dRa < -180) dRa += 360;
        if (Math.abs(dRa) > FOV_H / 2 + 2) continue;
        if (conIds.has(s.id)) continue;
        const sx = (dRa / FOV_H) * w + w / 2;
        const sy = (-dDec / FOV_V) * h + h / 2;
        const r = starRadius(s.mag);
        const color = colorForCI(s.ci);
        ctx.beginPath();
        ctx.fillStyle = hexToRgba(color, 0.25);
        ctx.arc(sx, sy, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // constellation
      const pts = constellation
        .map((s) => ({ s, ...project(s.ra_deg, s.dec) }))
        .filter((p) => Math.abs(p.dRa) < 180 && Math.abs(p.dDec) < 180);

      const anyVisible = pts.some(
        (p) => Math.abs(p.dRa) <= FOV_H / 2 && Math.abs(p.dDec) <= FOV_V / 2,
      );

      if (anyVisible && !wasVisibleRef.current) {
        pulseStartRef.current = t;
      }
      wasVisibleRef.current = anyVisible;

      let pulseBoost = 0;
      if (pulseStartRef.current != null) {
        const dt = t - pulseStartRef.current;
        if (dt < 1500) pulseBoost = (1 - dt / 1500) * 0.8;
        else pulseStartRef.current = null;
      }

      if (pts.length > 1) {
        const pulse = 0.6 + 0.4 * Math.sin(t / 600) + pulseBoost;
        ctx.save();
        ctx.shadowColor = "rgba(170, 210, 255, 0.95)";
        ctx.shadowBlur = 14 + pulseBoost * 20;
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, 0.85 + pulseBoost)})`;
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(pts[0].sx, pts[0].sy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
        ctx.stroke();
        ctx.restore();

        for (const p of pts) {
          const baseR = Math.max(3, starRadius(p.s.mag) * 1.5);
          ctx.save();
          ctx.shadowColor = "rgba(170, 210, 255, 0.95)";
          ctx.shadowBlur = 18 * pulse + 8;
          ctx.fillStyle = `rgba(255,255,255,${0.85 * Math.min(1, pulse) + 0.15})`;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, baseR, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.beginPath();
          ctx.strokeStyle = `rgba(170,210,255,${0.35 * Math.min(1, pulse) + 0.25})`;
          ctx.lineWidth = 1;
          ctx.arc(p.sx, p.sy, baseR * 2.4, 0, Math.PI * 2);
          ctx.stroke();

          if (p.s.proper) {
            ctx.fillStyle = "#ffffff";
            ctx.font = "11px 'Roboto Mono', monospace";
            ctx.textBaseline = "middle";
            ctx.fillText(p.s.proper, p.sx + baseR * 2.5 + 6, p.sy);
          }
        }
      }

      // reticle
      const cx = w / 2;
      const cy = h / 2;
      ctx.strokeStyle = "rgba(74,158,255,0.8)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 10, cy);
      ctx.moveTo(cx + 10, cy); ctx.lineTo(cx + 30, cy);
      ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy - 10);
      ctx.moveTo(cx, cy + 10); ctx.lineTo(cx, cy + 30);
      ctx.stroke();

      // direction indicator toward constellation center
      if (constellation.length > 0) {
        const avgRa = constellation.reduce((a, s) => a + s.ra_deg, 0) / constellation.length;
        const avgDec = constellation.reduce((a, s) => a + s.dec, 0) / constellation.length;
        let dRa = avgRa - centerRa;
        if (dRa > 180) dRa -= 360;
        if (dRa < -180) dRa += 360;
        const dDec = avgDec - centerDec;
        const dist = Math.sqrt(dRa * dRa + dDec * dDec);

        if (!anyVisible) {
          // angle: +dRa means target is to the right, +dDec means up
          const ang = Math.atan2(-dDec, dRa);
          const ringR = 22;
          const arrowR = ringR + 14;
          const ax = cx + Math.cos(ang) * arrowR;
          const ay = cy + Math.sin(ang) * arrowR;
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(ang);
          ctx.fillStyle = "rgba(170,210,255,0.95)";
          ctx.shadowColor = "rgba(170,210,255,0.9)";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(-6, -6);
          ctx.lineTo(-6, 6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // distance label below reticle
          const deg = Math.round(dist);
          ctx.fillStyle = "rgba(170,210,255,0.95)";
          ctx.font = "10px 'Roboto Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const dir =
            Math.abs(dRa) > Math.abs(dDec)
              ? dRa > 0 ? "RIGHT" : "LEFT"
              : dDec > 0 ? "UP" : "DOWN";
          ctx.fillText(`${dir} ${deg}°`, cx, cy + ringR + 30);
          ctx.textAlign = "start";
        }

        setNearby(dist <= 10 && !anyVisible);
      }

    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [stars, constellation]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      style={{ fontFamily: "'Roboto Mono', monospace" }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {error && (
        <div className="absolute inset-0 z-10 bg-black/95 flex flex-col items-center justify-center text-center px-6">
          <div className="text-xs text-white mb-6" style={{ letterSpacing: "0.15em" }}>
            {error}
          </div>
          <button
            onClick={onClose}
            className="text-xs text-white px-4 py-2 rounded-md border"
            style={{ background: "rgba(0,8,20,0.85)", borderColor: "#1a3a5c" }}
          >
            CLOSE
          </button>
        </div>
      )}

      {!error && (
        <>
          <div
            className="absolute top-3 left-3 text-[11px] text-white px-3 py-2 rounded-md border"
            style={{
              background: "rgba(0,8,20,0.7)",
              borderColor: "#1a3a5c",
              letterSpacing: "0.12em",
            }}
          >
            <div>◎ AR MODE</div>
            <div className="text-neutral-400 mt-1">HEADING: {heading}°</div>
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-xs text-white px-3 py-1.5 rounded-md border"
            style={{
              background: "rgba(0,8,20,0.85)",
              borderColor: "#1a3a5c",
              letterSpacing: "0.15em",
            }}
          >
            ✕ EXIT
          </button>
          {nearby && (
            <div
              className="absolute left-1/2 -translate-x-1/2 text-[11px] text-white px-3 py-1.5 rounded-md"
              style={{
                top: "calc(50% + 40px)",
                background: "rgba(0,8,20,0.7)",
                letterSpacing: "0.15em",
                color: "#aad2ff",
              }}
            >
              ◎ CONSTELLATION NEARBY
            </div>
          )}
        </>
      )}
    </div>
  );
}
