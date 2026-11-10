/* Vista 3D de la playera estilo BlankBuilder (Three.js):
   - Modelo 3D real libre de derechos con pliegues y relieve de algodón (assets/models/shirt.glb).
   - Luz de estudio cinematográfica y prenda flotando sin gancho.
   - Diseño proyectado exclusivamente sobre el torso frontal o trasero (DecalGeometry), sin invadir mangas
     ni flotar fuera de la tela.
   - Arrastrar sobre el diseño lo mueve a 60 FPS (sincronizado con los controles deslizantes y con dirección
     natural tanto al frente como en la espalda); arrastrar fuera del diseño gira la playera en 360°. */
function createShirtViewer(stage) {
  if (typeof THREE === 'undefined' || !THREE.GLTFLoader || !THREE.DecalGeometry) return null;

  const MODEL_URL = 'assets/models/shirt.glb';
  const K = 3.2;            // escala base del modelo 3D
  const CW = 640, CH = 768; // dimensiones del lienzo de impresión (proporción 5:6 de torso)
  const HW = 160, HH = 192; // lienzo reducido para detectar clics sobre el diseño

  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { cut: null, color: null, side: 'front' };
  const api = {};

  let renderer, scene, cam, group;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.localClippingEnabled = true;
    scene = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(30, 1, .1, 50);
    cam.position.set(0, .05, 6);

    /* Iluminación de estudio suave para resaltar las arrugas naturales del algodón */
    const env = new THREE.Scene();
    env.background = new THREE.Color(.2, .21, .2);
    [[0, 6, 2, 8, 4, 5], [-6, 2, 3, 3, 5, 2.6], [6, 2, -2, 3, 5, 2], [0, 1, 7, 5, 4, 1.4]].forEach(([x, y, z, w, h, i]) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(i, i, i), side: THREE.DoubleSide })
      );
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    });
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(env, .04).texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f86, .38));
    const key = new THREE.DirectionalLight(0xfff6ea, 1.08); key.position.set(-3, 4, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xe6eeff, .36); fill.position.set(4, 1, 3); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, .45); rim.position.set(0, 3, -5); scene.add(rim);
    group = new THREE.Group(); scene.add(group);
  } catch (e) {
    if (renderer) renderer.dispose();
    return null;
  }
  stage.prepend(renderer.domElement);

  /* ---------- Prenda 3D ---------- */
  let shirt = null, mesh = null, mat = null, dmesh = null, tex = null;
  let lastOpts = { hasImg: false, imgX: 0, imgY: 0, textY: 0 };
  const clipLocal = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e3), clipWorld = new THREE.Plane();

  /* Lienzo auxiliar para saber si el usuario hizo clic sobre los píxeles del diseño o sobre tela vacía */
  const hitCanvas = document.createElement('canvas');
  hitCanvas.width = HW; hitCanvas.height = HH;
  const hitCtx = hitCanvas.getContext('2d', { willReadFrequently: true });
  let hasHitPixels = false;

  new THREE.GLTFLoader().load(MODEL_URL, gltf => {
    shirt = new THREE.Group();
    const root = gltf.scene;
    root.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) { if (api.onFail) api.onFail(); return; }
    const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3());
    root.position.sub(c);
    shirt.add(root); shirt.scale.setScalar(K); group.add(shirt);

    mat = mesh.material;
    mat.side = THREE.DoubleSide; mat.metalness = 0; mat.roughness = .92; mat.envMapIntensity = .7;
    mat.clippingPlanes = [clipWorld]; mat.clipShadows = true;
    if (mat.normalMap) mat.normalScale.set(1.4, 1.4);
    mat.needsUpdate = true;
    applyModel();
  }, undefined, err => {
    console.error('No se pudo cargar el modelo 3D', err);
    if (api.onFail) api.onFail();
  });

  function applyModel() {
    if (!shirt || !st.cut) return;
    const c = CUTS[st.cut] || CUTS.regular, crop = st.cut === 'crop';
    const sx = 1 + (c.w / .60 - 1) * .6, sy = crop ? 1 : c.L / 1.80;
    shirt.scale.set(K * sx, K * sy, K * (1 + (sx - 1) * .5));
    clipLocal.constant = crop ? .5 : 1e3;
    mat.color.set(st.color).convertSRGBToLinear();
    group.updateMatrixWorld(true);
    decal();
  }

  /* ---------- Proyección del diseño sobre el torso (sin invadir mangas ni cuello) ---------- */
  function inGroupFrame(fn) {
    const r = group.rotation.clone(), y = group.position.y;
    group.rotation.set(0, 0, 0); group.position.y = 0; group.updateMatrixWorld(true);
    try { return fn(); } finally { group.rotation.copy(r); group.position.y = y; group.updateMatrixWorld(true); }
  }

  function decal() {
    if (dmesh) { group.remove(dmesh); dmesh.geometry.dispose(); dmesh.material.dispose(); dmesh = null; }
    if (!tex || !mesh || !shirt) return;

    const back = st.side === 'back', crop = st.cut === 'crop';
    const sx = shirt.scale.x / K, sy = shirt.scale.y / K, sz = shirt.scale.z / K;
    /* Ancho 0.88 * sx se mantiene estrictamente dentro del torso (-0.44 a +0.44), sin tocar las mangas (|x| > 0.47) */
    const w = .88 * sx, h = (crop ? .86 : 1.056) * sy, depth = .46 * sz;
    const cy = (crop ? .18 : .11) * sy, cz = (back ? -.26 : .26) * sz;

    const geo = inGroupFrame(() => {
      const pos = new THREE.Vector3(0, cy, cz);
      const rot = new THREE.Euler(0, back ? Math.PI : 0, 0);
      return new THREE.DecalGeometry(mesh, pos, rot, new THREE.Vector3(w, h, depth));
    });

    dmesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: .82, metalness: 0, envMapIntensity: .6,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      clippingPlanes: [clipWorld]
    }));
    dmesh.renderOrder = 2;
    group.add(dmesh);
  }

  function setTexture(t) {
    const old = tex; tex = t;
    hitCtx.clearRect(0, 0, HW, HH);
    hasHitPixels = false;
    if (t && t.image) {
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      hitCtx.drawImage(t.image, 0, 0, HW, HH);
      hasHitPixels = true;
    }
    decal();
    if (old && old !== t) old.dispose();
  }

  let seq = 0;
  function setPrint(opts) {
    lastOpts = {
      hasImg: !!(opts && (opts.img || (opts.preset && opts.preset !== 'ninguno'))),
      imgX: (opts && opts.imgX) || 0,
      imgY: (opts && opts.imgY) || 0,
      textY: (opts && opts.textY) || 0
    };
    const n = ++seq;
    return composePrint(opts).then(src => new Promise((ok, fail) => {
      if (n !== seq) return ok();
      if (!src) { setTexture(null); return ok(); }
      new THREE.TextureLoader().load(src, t => {
        if (n !== seq) { t.dispose(); return ok(); }
        t.encoding = THREE.sRGBEncoding;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        setTexture(t);
        ok();
      }, undefined, () => fail('No se pudo generar el diseño.'));
    }));
  }

  /* ---------- Interacción: arrastrar diseño o girar 360° ---------- */
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  function pickDecal(e) {
    if (!dmesh || !hasHitPixels) return null;
    const r = renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, cam);
    const hit = ray.intersectObject(dmesh, false)[0];
    if (!hit || !hit.uv) return null;
    const ux = hit.uv.x + (tex ? tex.offset.x : 0);
    const uy = hit.uv.y + (tex ? tex.offset.y : 0);
    if (ux < 0 || ux > 1 || uy < 0 || uy > 1) return null;
    const x0 = cl(Math.round(ux * HW) - 8, 0, HW - 1);
    const y0 = cl(Math.round((1 - uy) * HH) - 8, 0, HH - 1);
    const sw = Math.min(17, HW - x0), sh = Math.min(17, HH - y0);
    const data = hitCtx.getImageData(x0, y0, sw, sh).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 15) return hit;
    }
    return null;
  }

  let mode = null, lx = 0, ly = 0, startX = 0, startY = 0, idle = 0, target = null, spin = false, baseZ = 6;
  let dragMoved = false;
  const turnTo = t => { const c = group.rotation.y; target = Math.round((c - t) / (2 * Math.PI)) * 2 * Math.PI + t; };

  stage.addEventListener('pointerdown', e => {
    target = null; lx = startX = e.clientX; ly = startY = e.clientY; dragMoved = false;
    mode = pickDecal(e) ? 'decal' : 'turn';
    stage.classList.toggle('moving', mode === 'decal');
    stage.setPointerCapture(e.pointerId);
  });

  const endDrag = () => {
    const wasDecal = mode === 'decal' && dragMoved;
    mode = null; dragMoved = false; idle = performance.now();
    stage.classList.remove('moving');
    if (wasDecal && api.onDecalDragEnd) api.onDecalDragEnd();
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('pointermove', e => {
    if (mode === 'decal') {
      if (!tex) return;
      dragMoved = true;
      const dX = Math.round((e.clientX - startX) * 1.45);
      const dY = Math.round((e.clientY - startY) * 1.45);
      if (lastOpts.hasImg) {
        const nx = cl(lastOpts.imgX + dX, -150, 150);
        const ny = cl(lastOpts.imgY + dY, -140, 140);
        tex.offset.x = -(nx - lastOpts.imgX) / CW;
        tex.offset.y = (ny - lastOpts.imgY) / CH;
        if (api.onDecalDrag) api.onDecalDrag({ imgX: nx, imgY: ny });
      } else {
        const ny = cl(lastOpts.textY + dY, -120, 120);
        tex.offset.y = (ny - lastOpts.textY) / CH;
        if (api.onDecalDrag) api.onDecalDrag({ textY: ny });
      }
      return;
    }
    if (mode === 'turn') {
      group.rotation.y += (e.clientX - lx) * .01;
      group.rotation.x = cl(group.rotation.x + (e.clientY - ly) * .006, -.6, .6);
      lx = e.clientX; ly = e.clientY;
      return;
    }
    if (e.pointerType === 'mouse') stage.classList.toggle('over-print', !!pickDecal(e));
  });

  stage.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault(); baseZ = cl(baseZ + e.deltaY * .004, 3, 9); cam.position.z = baseZ;
  }, { passive: false });

  new ResizeObserver(() => {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h;
    baseZ = w / h < .9 ? 6 / (w / h) * .8 : 6; cam.position.z = baseZ; cam.updateProjectionMatrix();
  }).observe(stage);

  (function loop() {
    if (target !== null) {
      const d = target - group.rotation.y;
      group.rotation.y += d * .12; group.rotation.x *= .9;
      if (Math.abs(d) < .003) target = null;
    } else if (!mode && spin && !still && performance.now() - idle > 2500) {
      group.rotation.y += .005;
    }
    group.position.y = Math.sin(performance.now() / 1400) * (still ? 0 : .02);
    group.updateMatrixWorld(true);
    clipWorld.copy(clipLocal).applyMatrix4(group.matrixWorld);
    renderer.render(scene, cam); requestAnimationFrame(loop);
  })();

  return Object.assign(api, {
    setModel(cut, color) {
      if (cut === st.cut && color === st.color) return;
      const cutChanged = cut !== st.cut;
      st.cut = cut; st.color = color;
      if (!shirt) return;
      if (cutChanged) applyModel(); else mat.color.set(color).convertSRGBToLinear();
    },
    setPrint,
    setSide(side) {
      if (side === st.side) return;
      st.side = side; decal(); turnTo(side === 'back' ? Math.PI : 0);
    },
    setBackground(name) { stage.dataset.bg = name; },
    setSpin(on) { spin = !!on; },
    turnTo,
    capture() { renderer.render(scene, cam); return renderer.domElement.toDataURL('image/png'); },
    onDecalDrag: null,
    onDecalDragEnd: null,
    onSideChange: null,
    onFail: null
  });
}
