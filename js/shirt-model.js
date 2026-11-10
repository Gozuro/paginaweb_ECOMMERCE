/* Modelo de playera: silueta tridimensional con caída natural y pliegues realistas.
   Dos paneles (frente y espalda) unidos por costuras; cuello, dobladillo y puños abiertos. */
function shirtModel(c) {
  const { w, L, s } = c, sx = w + .04, ex = sx + s * 1.1, bx = ex - .17, hem = 1 - L, R = .28, HM = .165, dx = .022;
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const half = [[.28, 1], [sx, .92], [ex, .60], [bx, .36], [w, .42], [w, hem]], seam = [1, 1, 0, 1, 1];
  const E = [], add = (a, b, sm) => E.push({ a, b, sm }), Lf = half.map(p => [-p[0], p[1]]);
  for (let i = 0; i < 5; i++) add(Lf[i], Lf[i + 1], seam[i]);
  add(Lf[5], half[5], 0);
  for (let i = 5; i > 0; i--) add(half[i], half[i - 1], seam[i - 1]);

  /* Escote del cuello redondeado con curvatura natural */
  const nk = [];
  for (let i = 0; i <= 16; i++) {
    const x = .28 - .56 * i / 16;
    nk.push([x, 1 - .105 * (1 - (x / .28) ** 2)]);
  }
  for (let i = 0; i < 16; i++) add(nk[i], nk[i + 1], 0);
  const poly = E.map(e => e.a);

  const proj = (x, y, a, b) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], t = cl(((x - a[0]) * ux + (y - a[1]) * uy) / (ux * ux + uy * uy), 0, 1);
    return [a[0] + t * ux, a[1] + t * uy];
  };
  const near = (x, y, onlySeam) => {
    let best = 1e9, bp = null;
    for (const e of E) {
      if (onlySeam && !e.sm) continue;
      const p = proj(x, y, e.a, e.b), d = Math.hypot(x - p[0], y - p[1]);
      if (d < best) { best = d; bp = p; }
    }
    return [best, bp];
  };
  const inside = (x, y) => {
    let r = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) r = !r;
    }
    return r;
  };

  /* Caída orgánica y arrugas de tela: tensión bajo axilas, ondulación vertical de torso y dobladillo */
  const height = (x, y) => {
    const dSeam = near(x, y, true)[0];
    const t = Math.min(dSeam / R, 1);
    const base = HM * Math.sin(t * Math.PI * 0.5);
    const ax = Math.abs(x);

    // Pliegues diagonales de tensión desde la costura de las axilas
    const dxArm = ax - (w * 0.92), dyArm = y - 0.42;
    const dArm = Math.hypot(dxArm, dyArm);
    const armFold = Math.sin(ax * 13.5 - y * 9.0) * Math.exp(-dArm * 2.6) * 0.016 * t;

    // Caída vertical de la tela por gravedad a lo largo del torso
    const drape = (
      Math.sin(x * 9.5 + 0.4) * 0.0075 +
      Math.sin(x * 19.0 - 0.8) * 0.0035 +
      Math.sin(x * 4.8 + y * 2.8) * 0.0055
    ) * Math.sin(t * Math.PI) * (y < 0.65 ? Math.max(0.35, 1 - (y - hem) / (1 - hem) * 0.45) : 0.25);

    // Ondulación natural en las mangas
    const sleeve = (ax > w * 0.8) ? Math.sin((ax - w) * 15.0 + y * 7.5) * 0.008 * Math.exp(-Math.abs(y - 0.5) * 2.0) : 0;

    // Ondulaciones del dobladillo inferior
    const dHem = Math.max(0, 1 - (y - hem) / 0.18);
    const hemRipple = Math.sin(x * 13.0) * 0.0065 * dHem;

    // Micro-relieve sutil del tejido
    const micro = (Math.sin(x * 24.0 + y * 18.0) * 0.002 + Math.cos(x * 32.0 - y * 26.0) * 0.0015) * t;

    return Math.max(0.005, base + armFold + drape + sleeve + hemRipple + micro);
  };

  const x0 = -ex - dx, y0 = hem - dx, nx = Math.ceil(2 * (ex + dx) / dx), ny = Math.ceil((1 - hem + 2 * dx) / dx);
  const V = [], ok = [];
  for (let i = 0; i <= ny; i++) for (let j = 0; j <= nx; j++) {
    const x = x0 + j * dx, y = y0 + i * dx, ins = inside(x, y);
    V.push(ins ? [x, y] : near(x, y, false)[1]); ok.push(ins);
  }
  const map = new Int32Array(V.length).fill(-1), front = { pos: [], uv: [], idx: [] }, back = { pos: [], uv: [], idx: [] };
  const use = k => {
    if (map[k] < 0) {
      map[k] = front.pos.length / 3; const [x, y] = V[k], h = height(x, y), u = x / 2.6 + .5, v = y / 2 + .5;
      front.pos.push(x, y, h); back.pos.push(x, y, -h); front.uv.push(u, v); back.uv.push(u, v);
    }
    return map[k];
  };
  for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) {
    const a = i * (nx + 1) + j, b = a + 1, c = a + nx + 1, d = c + 1;
    if (ok[a] + ok[b] + ok[c] + ok[d] < 2) continue;
    const A = use(a), B = use(b), C = use(c), D = use(d);
    front.idx.push(A, B, C, B, D, C); back.idx.push(A, C, B, B, C, D);
  }

  /* Orillas (cuello, dobladillo, puños) como lazos cerrados en 3D */
  const loop = pts => {
    const f = pts.map(p => [p[0], p[1], height(p[0], p[1])]);
    const bk = pts.slice(1, -1).reverse().map(p => [p[0], p[1], -height(p[0], p[1])]);
    return f.concat(bk);
  };
  const line = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  return {
    front, back, height, hem, sx,
    collar: loop(nk),
    hemLoop: loop(line([-w, hem], [w, hem], 36)),
    cuffs: [loop(line([-ex, .60], [-bx, .36], 14)), loop(line([ex, .60], [bx, .36], 14))]
  };
}
if (typeof module !== 'undefined') module.exports = { shirtModel };
