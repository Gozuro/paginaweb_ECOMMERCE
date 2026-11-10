/* Vista 3D de la playera (Three.js): luz de estudio, tela con textura de algodón realista,
   sin gancho (estilo flotante), arrastre interactivo directo del estampado y rotación libre 360°.
   createShirtViewer(stage) devuelve null si no hay WebGL o Three.js no cargó. */
function createShirtViewer(stage) {
  if (typeof THREE === 'undefined' || typeof shirtModel !== 'function') return null;

  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { cut: null, color: null, side: 'front' };
  const currentPrintOpts = { imgX: 0, imgY: 0 };
  const callbacks = { onDecalDrag: null, onDecalDragEnd: null, onSideChange: null };

  let renderer, scene, cam, group, fabric;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    scene = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(30, 1, .1, 50);
    cam.position.set(0, 0, 5.8);

    /* Ambiente de estudio fotográfico */
    const env = new THREE.Scene();
    env.background = new THREE.Color(.22, .24, .3);
    [[0, 6, 2, 8, 4, 6], [-6, 1, 3, 3, 5, 3.5], [6, 2, -2, 3, 5, 2.5], [0, 1, 7, 5, 4, 1.6]].forEach(([x, y, z, w, h, i]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(i, i, i * 1.05), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    });
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(env, .03).texture;

    /* Iluminación de estudio: luz principal cálida, luz de relleno fría y contraluz de silueta */
    const key = new THREE.DirectionalLight(0xfff5e6, .85);
    key.position.set(2.8, 3.6, 4.2);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xdbe7ff, .45);
    fill.position.set(-3.0, 1.6, 3.5);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, .6);
    rim.position.set(-1.0, 3.4, -4.5);
    scene.add(rim);

    const ambient = new THREE.AmbientLight(0xf2f4f8, .38);
    scene.add(ambient);

    group = new THREE.Group();
    scene.add(group);

    /* Micro-textura procedural de algodón jersey */
    fabric = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const g = c.getContext('2d');
      g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 512);

      const id = g.getImageData(0, 0, 512, 512), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const noise = (Math.random() - 0.5) * 28;
        const v = Math.min(255, Math.max(0, 128 + noise));
        d[i] = v; d[i + 1] = v; d[i + 2] = v;
      }
      g.putImageData(id, 0, 0);

      // Líneas de tejido de punto (verticales y horizontales)
      for (let x = 0; x < 512; x += 4) {
        g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x, 0, 1.5, 512);
        g.fillStyle = 'rgba(255,255,255,.11)'; g.fillRect(x + 2, 0, 1.5, 512);
      }
      for (let y = 0; y < 512; y += 4) {
        g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, y, 512, 1);
        g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, y + 2, 512, 1);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(24, 20);
      return t;
    })();
  } catch (e) {
    if (renderer) renderer.dispose();
    return null;
  }
  stage.prepend(renderer.domElement);

  let shirt, dmesh, tex, model;
  let decalBaseCoords = null, decalParams = null;

  const tube = (pts, r, m) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), true), pts.length * 3, r, 12, true), m);
  const sheet = d => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.setIndex(d.idx);
    g.computeVertexNormals();
    return g;
  };

  function build() {
    if (shirt) { group.remove(shirt); shirt.traverse(m => m.geometry && m.geometry.dispose()); shirt = null; }
    if (dmesh) { dmesh.material.dispose(); dmesh = null; }
    model = shirtModel(CUTS[st.cut]);
    const col = new THREE.Color(st.color).convertSRGBToLinear();

    // Material de tela de algodón suave con relieve y respuesta a la luz
    const mat = new THREE.MeshStandardMaterial({
      color: col,
      roughness: .90,
      metalness: .02,
      bumpMap: fabric,
      bumpScale: .018,
      side: THREE.DoubleSide,
      envMapIntensity: .75
    });
    const trim = new THREE.MeshStandardMaterial({
      color: col.clone().multiplyScalar(.88),
      roughness: .98,
      bumpMap: fabric,
      bumpScale: .025,
      envMapIntensity: .6
    });

    shirt = new THREE.Group();
    shirt.add(new THREE.Mesh(sheet(model.front), mat), new THREE.Mesh(sheet(model.back), mat));
    shirt.add(tube(model.collar, .030, trim), tube(model.hemLoop, .020, trim));
    model.cuffs.forEach(c => shirt.add(tube(c, .022, trim)));

    // Centrado de la playera flotante en el espacio 3D (sin gancho)
    shirt.position.y = -(1 + model.hem) / 2;
    group.add(shirt);
    decal();
  }

  /* Malla del diseño estampada sobre la tela del pecho o espalda: fija al torso de la playera */
  function decal() {
    if (dmesh) { shirt.remove(dmesh); dmesh.geometry.dispose(); dmesh.material.dispose(); dmesh = null; }
    if (!tex || !shirt) return;

    const back = st.side === 'back';
    const top = 0.74;
    const hh = 0.92;
    const ww = 0.74;
    const yc = top - hh / 2;

    const g = new THREE.PlaneGeometry(ww, hh, 32, 36);
    const p = g.attributes.position;

    for (let n = 0; n < p.count; n++) {
      const baseX = p.getX(n);
      const baseY = yc + p.getY(n);
      const X = back ? -baseX : baseX;
      const z = (back ? -1 : 1) * (model.height(X, baseY) + .008);
      p.setXYZ(n, X, baseY, z);
    }
    g.computeVertexNormals();

    dmesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: .85,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    }));

    shirt.add(dmesh);
  }

  function setTexture(t) {
    const old = tex; tex = t; decal();
    if (old && old !== t) old.dispose();
  }

  let seq = 0;
  function setPrint(opts) {
    const n = ++seq;
    currentPrintOpts.imgX = opts && opts.imgX != null ? opts.imgX : 0;
    currentPrintOpts.imgY = opts && opts.imgY != null ? opts.imgY : 0;

    return composePrint(opts).then(src => new Promise((ok, fail) => {
      if (n !== seq) return ok();
      if (!src) { setTexture(null); return ok(); }
      new THREE.TextureLoader().load(src, t => {
        if (n !== seq) { t.dispose(); return ok(); }
        t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 8;
        t.wrapS = THREE.ClampToEdgeWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        setTexture(t);
        ok();
      }, undefined, () => fail('No se pudo generar el diseño.'));
    }));
  }

  /* Raycaster e interacción: arrastrar el estampado directamente o rotar 360° la prenda */
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function isBackFacing() {
    const normY = ((group.rotation.y % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return normY > Math.PI * 0.45 && normY < Math.PI * 1.55;
  }

  function testDecalHit(e) {
    if (!dmesh) return false;
    const rect = stage.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, cam);
    const hits = raycaster.intersectObject(dmesh);
    return hits.length > 0;
  }

  function testShirtHit(e) {
    if (!shirt) return false;
    const rect = stage.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, cam);
    const hits = raycaster.intersectObjects(shirt.children);
    return hits.length > 0;
  }

  let dragMode = null; // 'decal' o 'orbit'
  let lx = 0, ly = 0, velX = 0, velY = 0;
  let dragStartMouse = { x: 0, y: 0 };
  let dragStartImgX = 0, dragStartImgY = 0;
  let idle = 0, target = null, spin = false, baseZ = 5.8;

  const turnTo = t => {
    const c = group.rotation.y;
    target = Math.round((c - t) / (2 * Math.PI)) * 2 * Math.PI + t;
  };

  stage.addEventListener('pointerdown', e => {
    target = null;
    velX = 0; velY = 0;
    lx = e.clientX; ly = e.clientY;
    dragStartMouse = { x: e.clientX, y: e.clientY };

    const facing = isBackFacing() ? 'back' : 'front';
    const decalHit = testDecalHit(e);

    if (decalHit) {
      dragMode = 'decal';
      dragStartImgX = currentPrintOpts.imgX || 0;
      dragStartImgY = currentPrintOpts.imgY || 0;
      stage.style.cursor = 'grabbing';
    } else {
      const shirtHit = testShirtHit(e);
      // Si toca la playera viendo la cara contraria a la actual, se transfiere automáticamente a esa cara
      if (shirtHit && facing !== st.side && tex) {
        st.side = facing;
        decal();
        dragMode = 'decal';
        dragStartImgX = currentPrintOpts.imgX || 0;
        dragStartImgY = currentPrintOpts.imgY || 0;
        stage.style.cursor = 'grabbing';
        if (callbacks.onSideChange) callbacks.onSideChange(facing);
      } else {
        dragMode = 'orbit';
        stage.style.cursor = 'grabbing';
      }
    }
    stage.setPointerCapture(e.pointerId);
  });

  const endDrag = () => {
    if (tex) {
      tex.offset.set(0, 0);
    }
    if (dragMode === 'decal' && callbacks.onDecalDragEnd) {
      callbacks.onDecalDragEnd({
        imgX: currentPrintOpts.imgX,
        imgY: currentPrintOpts.imgY,
        side: st.side
      });
    }
    dragMode = null;
    idle = performance.now();
    stage.style.cursor = testDecalHit({ clientX: lx, clientY: ly }) ? 'grab' : 'default';
  };

  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('pointermove', e => {
    if (!dragMode) {
      stage.style.cursor = testDecalHit(e) ? 'grab' : 'default';
      return;
    }

    if (dragMode === 'decal') {
      const dx = e.clientX - dragStartMouse.x;
      const dy = e.clientY - dragStartMouse.y;
      // Dirección natural consistente: derecha del ratón mueve a la derecha de la pantalla (tanto en frente como en espalda)
      const curImgX = cl(Math.round(dragStartImgX + dx * 0.75), -160, 160);
      const curImgY = cl(Math.round(dragStartImgY + dy * 0.75), -160, 160);

      currentPrintOpts.imgX = curImgX;
      currentPrintOpts.imgY = curImgY;

      if (tex) {
        tex.offset.x = -(curImgX - dragStartImgX) / 640;
        tex.offset.y = (curImgY - dragStartImgY) / 800;
      }

      if (callbacks.onDecalDrag) {
        callbacks.onDecalDrag({ imgX: curImgX, imgY: curImgY, side: st.side });
      }
    } else if (dragMode === 'orbit') {
      const dX = (e.clientX - lx) * 0.009;
      const dY = (e.clientY - ly) * 0.006;
      group.rotation.y += dX;
      // Rotación libre en 360° con inclinación vertical amplia
      group.rotation.x = cl(group.rotation.x + dY, -1.25, 1.25);
      velY = dX;
      velX = dY;
      lx = e.clientX; ly = e.clientY;
    }
  });

  stage.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    baseZ = cl(baseZ + e.deltaY * .004, 3.2, 9);
    cam.position.z = baseZ;
  }, { passive: false });

  new ResizeObserver(() => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    baseZ = w / h < .9 ? 5.8 / (w / h) * .8 : 5.8;
    cam.position.z = baseZ;
    cam.updateProjectionMatrix();
  }).observe(stage);

  (function loop() {
    if (target !== null) {
      const d = target - group.rotation.y;
      group.rotation.y += d * .12;
      group.rotation.x *= .9;
      if (Math.abs(d) < .003) target = null;
    } else if (!dragMode) {
      // Inercia fluida al soltar el ratón
      velY *= 0.90;
      velX *= 0.90;
      if (Math.abs(velY) > 0.0001) group.rotation.y += velY;
      if (Math.abs(velX) > 0.0001) group.rotation.x = cl(group.rotation.x + velX, -1.25, 1.25);

      if (spin && !still && performance.now() - idle > 2500) {
        group.rotation.y += .005;
      }
    }
    // Suave flotación orgánica en el aire
    group.position.y = Math.sin(performance.now() / 1500) * (still ? 0 : .018);
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  })();

  return {
    setModel(cut, color) {
      if (shirt && cut === st.cut && color === st.color) return;
      st.cut = cut; st.color = color; build();
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
    set onDecalDrag(fn) { callbacks.onDecalDrag = fn; },
    set onDecalDragEnd(fn) { callbacks.onDecalDragEnd = fn; },
    set onSideChange(fn) { callbacks.onSideChange = fn; }
  };
}
