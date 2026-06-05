import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface Star3D {
  id: string;
  mag: number;
  ci: number | null;
  proper: string;
  x: number;
  y: number;
  z: number;
}

// Desaturated tints — match 2D look exactly
function colorForCI(ci: number | null): THREE.Color {
  if (ci === null || Number.isNaN(ci)) return new THREE.Color(0xffffff);
  if (ci < -0.2) return new THREE.Color(0xdde4ff);
  if (ci < 0.0) return new THREE.Color(0xe3e8ff);
  if (ci < 0.3) return new THREE.Color(0xecefff);
  if (ci < 0.6) return new THREE.Color(0xffffff);
  if (ci < 1.0) return new THREE.Color(0xfff8ee);
  if (ci < 1.5) return new THREE.Color(0xffeed8);
  return new THREE.Color(0xffe0c0);
}

// Match the 2D starRadius() formula exactly so size scaling feels identical
function starRadius(mag: number): number {
  const r = (6.5 - mag) * 0.55;
  return Math.max(0.5, Math.min(4, r));
}

// Sprite texture that mirrors the 2D look:
//   - bright solid core occupying the inner ~20% (radius r)
//   - soft halo plateau at ~18% alpha out to ~50% (the 2D r*2.5 glow)
//   - faint outer halo to the sprite edge (the 2D r*5 halo for bright stars)
function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  // outer faint halo (matches 2D's r*5 @ 0.10 alpha for brightest stars)
  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  // mid halo (matches 2D's r*2.5 @ 0.18 alpha)
  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.arc(cx, cy, size * 0.25, 0, Math.PI * 2);
  ctx.fill();
  // bright solid core (matches 2D's r solid disc)
  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}


interface Props {
  stars: Star3D[];
  constellationIds: string[];
}

export function StarMap3D({ stars, constellationIds }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    camera.position.set(0, 0, 17);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const glowTex = makeGlowTexture();

    // Position lookup for constellation lines + labels
    const starMap = new Map<string, { pos: THREE.Vector3; proper: string; mag: number }>();

    // Render all stars as a single THREE.Points cloud
    const positions = new Float32Array(stars.length * 3);
    const colors = new Float32Array(stars.length * 3);
    const sizes = new Float32Array(stars.length);
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      positions[i * 3] = s.x;
      positions[i * 3 + 1] = s.y;
      positions[i * 3 + 2] = s.z;
      const col = colorForCI(s.ci);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
      // Use the SAME radius curve as 2D. The shader multiplies by a pixel
      // factor so the visible point size mirrors 2D's pixel radius * glow.
      sizes[i] = starRadius(s.mag);
      starMap.set(s.id, {
        pos: new THREE.Vector3(s.x, s.y, s.z),
        proper: s.proper,
        mag: s.mag,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: glowTex },
        uPixelRatio: { value: renderer.getPixelRatio() },
        // Sprite full diameter ≈ uSizeScale * size px. With the texture's
        // bright core occupying 20% of diameter, that core reads as
        // ~size*uSizeScale*0.2 px — matched to 2D where the solid core is
        // ~size*2 px (diameter), so uSizeScale ≈ 10.
        uSizeScale: { value: 10.0 },
      },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      // NormalBlending mirrors the 2D canvas (per-pixel alpha compositing).
      // Additive blending makes overlapping stars look hotter than 2D.
      blending: THREE.NormalBlending,
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float uPixelRatio;
        uniform float uSizeScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uSizeScale * uPixelRatio;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTex;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          if (t.a < 0.01) discard;
          gl_FragColor = vec4(vColor, t.a);
        }
      `,
    });


    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // Constellation: glowing white lines + anchor halos + labels
    const labelSprites: THREE.Sprite[] = [];
    const anchorSprites: THREE.Sprite[] = [];
    const lineObjs: THREE.Line[] = [];

    if (constellationIds.length > 0) {
      const pts: THREE.Vector3[] = [];
      for (const id of constellationIds) {
        const entry = starMap.get(id);
        if (!entry) continue;
        pts.push(entry.pos);

        // Bright white anchor halo (mirrors 2D's pulsing white core + glow)
        const haloMat = new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xffffff,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const halo = new THREE.Sprite(haloMat);
        const haloSize = Math.max(2.0, starRadius(entry.mag) * 1.2);
        halo.scale.set(haloSize, haloSize, 1);
        halo.position.copy(entry.pos);
        scene.add(halo);
        anchorSprites.push(halo);

        // Label sprite — proper name or id
        const label = entry.proper || id;
        const cnv = document.createElement("canvas");
        const ctx = cnv.getContext("2d")!;
        const font = "20px 'Roboto Mono', monospace";
        ctx.font = font;
        const metrics = ctx.measureText(label);
        const padX = 8;
        cnv.width = Math.ceil(metrics.width) + padX * 2;
        cnv.height = 28;
        ctx.font = font;
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.fillText(label, padX, cnv.height / 2);
        const tex = new THREE.CanvasTexture(cnv);
        tex.needsUpdate = true;
        const sMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(sMat);
        const scaleY = 1.2;
        const scaleX = scaleY * (cnv.width / cnv.height);
        sprite.scale.set(scaleX, scaleY, 1);
        sprite.position.copy(entry.pos).add(new THREE.Vector3(scaleX / 2 + 0.6, 0, 0));
        scene.add(sprite);
        labelSprites.push(sprite);
      }

      if (pts.length > 1) {
        const lGeo = new THREE.BufferGeometry().setFromPoints(pts);
        // Soft blue-white glow underlay
        const glowMat = new THREE.LineBasicMaterial({
          color: 0xaad2ff,
          transparent: true,
          opacity: 0.35,
          linewidth: 3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const glowLine = new THREE.Line(lGeo, glowMat);
        scene.add(glowLine);
        lineObjs.push(glowLine);

        // Crisp white core line
        const coreMat = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        });
        const coreLine = new THREE.Line(lGeo, coreMat);
        scene.add(coreLine);
        lineObjs.push(coreLine);
      }
    }

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      mat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      geo.dispose();
      mat.dispose();
      glowTex.dispose();
      for (const sp of labelSprites) {
        sp.material.map?.dispose();
        sp.material.dispose();
      }
      for (const sp of anchorSprites) {
        sp.material.dispose();
      }
      for (const ln of lineObjs) {
        ln.geometry.dispose();
        (ln.material as THREE.Material).dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [stars, constellationIds]);

  return <div ref={mountRef} className="absolute inset-0" />;
}
