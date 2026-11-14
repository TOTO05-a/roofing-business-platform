import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Escena cinematográfica de la portada (T32, T33).
 *
 * - Un `<canvas>` fijo pinta una secuencia de fotogramas WebP según el progreso del scroll.
 * - Las escenas de texto (sticky) entran y salen con una línea de tiempo de GSAP ligada al scroll.
 * - La carga es progresiva: primero fotogramas espaciados y luego los intermedios.
 * - La versión estática (sin JS, «reducir movimiento» o ahorro de datos) es solo CSS.
 */

const FRAMES = 158;
/** Ventanas de cada escena como fracción del progreso de la pista: [entra, empieza a salir, sale]. */
const SCENES = {
  hero: { enter: 0, hold: 0.12, exit: 0.18, target: 0 },
  services: { enter: 0.2, hold: 0.45, exit: 0.5, target: 0.3 },
  process: { enter: 0.52, hold: 0.7, exit: 0.75, target: 0.62 },
  about: { enter: 0.78, hold: 1.1, exit: 1.2, target: 0.9 },
} as const;
type SceneName = keyof typeof SCENES;

let cleanup: (() => void) | null = null;

function frameUrl(set: 'd' | 'm', i: number): string {
  return `/cine/${set}/f${String(i + 1).padStart(3, '0')}.webp`;
}

function pickSet(): 'd' | 'm' {
  return window.innerWidth / window.innerHeight < 0.9 ? 'm' : 'd';
}

export function initCine(): void {
  try {
    setup();
  } catch {
    // Si algo falla, se deja la versión estática (los bloques con aparición no quedan ocultos).
    cleanup?.();
    cleanup = null;
    document.documentElement.dataset.cine = 'off';
  }
}

function setup(): void {
  cleanup?.();
  cleanup = null;

  const root = document.documentElement;
  const track = document.querySelector<HTMLElement>('[data-cine-track]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-cine-canvas]');
  const warm = document.querySelector<HTMLElement>('[data-cine-warm]');
  const scrim = document.querySelector<HTMLElement>('[data-cine-scrim]');
  const after = document.querySelector<HTMLElement>('[data-cine-after]');
  const ctx = canvas?.getContext('2d', { alpha: false });
  if (root.dataset.cine !== 'on' || !track || !canvas || !ctx) {
    root.dataset.cine = 'off';
    return;
  }

  const abort = new AbortController();
  const { signal } = abort;
  let disposed = false;

  /* ---------- Secuencia de fotogramas ---------- */
  let set = pickSet();
  let frames: (HTMLImageElement | undefined)[] = new Array(FRAMES);
  let loadId = 0;
  let pos = 0; // posición decimal en la secuencia (0 … FRAMES-1)
  let zoom = 1;
  let dirty = true;
  let raf = 0;
  const requestPaint = () => {
    dirty = true;
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const load = async () => {
    const id = ++loadId;
    const mine = set;
    const order: number[] = [];
    const seen = new Set<number>();
    for (const stride of [32, 8, 4, 2, 1]) {
      for (let i = 0; i < FRAMES; i += stride) {
        if (!seen.has(i)) {
          seen.add(i);
          order.push(i);
        }
      }
    }
    if (!seen.has(FRAMES - 1)) order.splice(3, 0, FRAMES - 1);
    let next = 0;
    const worker = async () => {
      while (next < order.length && id === loadId && !disposed) {
        const i = order[next++]!;
        const img = new Image();
        img.decoding = 'async';
        img.src = frameUrl(mine, i);
        try {
          await img.decode();
        } catch {
          continue;
        }
        if (id !== loadId) return;
        frames[i] = img;
        requestPaint();
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  };

  const nearest = (i: number): HTMLImageElement | undefined => {
    for (let d = 0; d < FRAMES; d++) {
      const a = frames[i - d];
      if (a) return a;
      const b = frames[i + d];
      if (b) return b;
    }
    return undefined;
  };

  let cw = 0;
  let ch = 0;
  let lastW = 0;
  let lastH = 0;
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // En móvil la barra del navegador cambia la altura al hacer scroll: se ignora si es poco.
    if (w === lastW && Math.abs(h - lastH) < 150) return;
    lastW = w;
    lastH = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    cw = Math.round(w * dpr);
    ch = Math.round(h * dpr);
    canvas.width = cw;
    canvas.height = ch;
    const wanted = pickSet();
    if (wanted !== set) {
      set = wanted;
      frames = new Array(FRAMES);
      void load();
    }
    requestPaint();
  };

  const paint = (img: HTMLImageElement, alpha: number) => {
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  };

  const frame = () => {
    raf = 0;
    if (!dirty || !cw) return;
    const i0 = Math.min(FRAMES - 1, Math.floor(pos));
    const t = pos - i0;
    const a = frames[i0];
    const b = frames[Math.min(FRAMES - 1, i0 + 1)];
    if (a && b && a !== b) {
      paint(a, 1);
      if (t > 0.02) paint(b, t);
    } else {
      const img = a ?? b ?? nearest(i0);
      if (!img) return;
      paint(img, 1);
    }
    dirty = false;
  };

  /* ---------- Línea de tiempo ligada al scroll ---------- */
  const state = { p: 0 };
  const gctx = gsap.context(() => {
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: track,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.8,
      },
    });
    tl.to(
      state,
      {
        p: 1,
        duration: 1,
        onUpdate: () => {
          pos = state.p * (FRAMES - 1);
          zoom = 1 + 0.06 * state.p;
          requestPaint();
        },
      },
      0,
    );
    if (warm) tl.to(warm, { opacity: 0.7, duration: 0.7, ease: 'power1.in' }, 0.25);

    const hint = track.querySelector<HTMLElement>('[data-cine-hint]');
    if (hint) tl.to(hint, { opacity: 0, duration: 0.03 }, 0);

    (Object.keys(SCENES) as SceneName[]).forEach((name) => {
      const w = SCENES[name];
      const scene = track.querySelector<HTMLElement>(`[data-scene="${name}"]`);
      if (!scene) return;
      const items = Array.from(scene.querySelectorAll<HTMLElement>('[data-reveal]'));
      if (name !== 'hero') {
        tl.fromTo(scene, { opacity: 0 }, { opacity: 1, duration: 0.02 }, w.enter);
        const span = Math.min(w.hold, 0.99) - w.enter;
        items.forEach((el, i) => {
          const at = w.enter + 0.005 + (i / Math.max(items.length, 1)) * span * 0.5;
          tl.fromTo(
            el,
            { opacity: 0, y: 34 },
            { opacity: 1, y: 0, duration: 0.035, ease: 'power2.out' },
            at,
          );
        });
      }
      if (w.exit <= 1) {
        tl.to(scene, { opacity: 0, y: -36, scale: 1.03, duration: w.exit - w.hold }, w.hold);
      }
    });
    // Rellena la duración de la línea de tiempo hasta 1 para que el progreso coincida con la pista.
    tl.to({}, { duration: 0 }, 1);

    // Entrada de la portada al cargar (tras la animación de entrada D3, si se está mostrando).
    const heroItems = gsap.utils.toArray<HTMLElement>('[data-scene="hero"] [data-reveal]');
    const introPlaying = root.dataset.intro === 'play';
    gsap.from(heroItems, {
      opacity: 0,
      y: 34,
      duration: 1.1,
      ease: 'power3.out',
      stagger: 0.12,
      delay: introPlaying ? 1.2 : 0.15,
    });

    // Oscurece el fondo al pasar del recorrido al contenido denso (visualizador, proyectos, contacto).
    if (after && scrim) {
      gsap.fromTo(
        scrim,
        { opacity: 0 },
        {
          opacity: 0.8,
          ease: 'none',
          scrollTrigger: { trigger: after, start: 'top bottom', end: 'top 30%', scrub: true },
        },
      );
    }

    // Aparición suave del contenido posterior.
    const fades = gsap.utils.toArray<HTMLElement>('[data-fade]');
    if (fades.length) {
      ScrollTrigger.batch(fades, {
        start: 'top 90%',
        once: true,
        onEnter: (els) =>
          gsap.to(els, { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', stagger: 0.08 }),
      });
    }
  });

  /* ---------- Anclas y foco con escenas fijas ---------- */
  const scrollToScene = (name: SceneName, smooth: boolean) => {
    const range = track.offsetHeight - window.innerHeight;
    const top = track.getBoundingClientRect().top + window.scrollY + range * SCENES[name].target;
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  };
  const anchors: Record<string, SceneName> = { '#servicios': 'services', '#nosotros': 'about' };
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href*="#"]');
      if (!a) return;
      const hash = a.hash;
      const name = anchors[hash];
      if (name && a.pathname === location.pathname) {
        e.preventDefault();
        history.replaceState(null, '', hash);
        scrollToScene(name, true);
      }
    },
    { signal },
  );
  const fromHash = anchors[location.hash];
  if (fromHash) requestAnimationFrame(() => scrollToScene(fromHash, false));

  // Un control invisible que recibe el foco lleva el scroll a su escena.
  track.addEventListener(
    'focusin',
    (e) => {
      const scene = (e.target as Element).closest<HTMLElement>('[data-scene]');
      const name = scene?.dataset.scene as SceneName | undefined;
      if (!name) return;
      const w = SCENES[name];
      const range = track.offsetHeight - window.innerHeight;
      const real = (window.scrollY - (track.getBoundingClientRect().top + window.scrollY)) / range;
      if (real < w.enter - 0.005 || real > Math.min(w.exit, 1)) scrollToScene(name, false);
    },
    { signal },
  );

  /* ---------- Arranque ---------- */
  window.addEventListener('resize', resize, { signal });
  resize();
  void load();
  requestAnimationFrame(() => ScrollTrigger.refresh());

  cleanup = () => {
    disposed = true;
    loadId++;
    cancelAnimationFrame(raf);
    raf = 0;
    abort.abort();
    gctx.revert();
  };
  document.addEventListener('astro:before-swap', () => cleanup?.(), { once: true });
}
