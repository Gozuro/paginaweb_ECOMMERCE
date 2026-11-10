/* Estudio de personalización: corte, color, arte, texto, talla y cantidad, con vista 3D y precio en vivo */
const q = new URLSearchParams(location.search), saved = readDesign();
const st = {
  cut: CUTS[q.get('cut')] ? q.get('cut') : (CUTS[saved.cut] ? saved.cut : 'regular'),
  color: /^[0-9a-f]{6}$/i.test(q.get('color') || '') ? '#' + q.get('color') : (saved.color || '#2F4BFF'),
  img: saved.img || null,
  fileName: saved.fileName || '',
  presetKey: saved.img ? null : (saved.presetKey || 'ninguno'),
  text: saved.text || '',
  fontId: FONTS.some(f => f.id === saved.fontId) ? saved.fontId : FONTS[0].id,
  textColor: saved.textColor || TEXT_COLORS[0].hex,
  side: 'front',
  size: SIZES.includes(saved.size) ? saved.size : 'M',
  qty: saved.qty || 1,
  imgScale: saved.imgScale != null ? +saved.imgScale : 1,
  imgX: saved.imgX != null ? +saved.imgX : 0,
  imgY: saved.imgY != null ? +saved.imgY : 0,
  textScale: saved.textScale != null ? +saved.textScale : 1,
  textX: saved.textX != null ? +saved.textX : 0,
  textY: saved.textY != null ? +saved.textY : 0
};
const $ = id => document.getElementById(id), status = $('status');

/* Vista 3D; si no hay WebGL o Three.js no cargó, se usa la vista plana (SVG) */
$('stage').hidden = false;
const viewer = createShirtViewer($('stage'));
$('stage').hidden = !viewer;
$('viewer-tools').hidden = !viewer;
$('preview').hidden = !!viewer;

if (viewer) {
  viewer.onDecalDrag = ({ imgX, imgY, side }) => {
    st.imgX = imgX;
    st.imgY = imgY;
    if (side && side !== st.side) {
      st.side = side;
      markSide();
    }
    if ($('img-x')) {
      $('img-x').value = imgX;
      $('img-x-val').textContent = imgX === 0 ? 'Centro (0)' : `${imgX > 0 ? '+' : ''}${imgX} px`;
    }
    if ($('img-y')) {
      $('img-y').value = imgY;
      $('img-y-val').textContent = imgY === 0 ? 'Centro (0)' : `${imgY > 0 ? '+' : ''}${imgY} px`;
    }
  };

  viewer.onDecalDragEnd = ({ imgX, imgY, side }) => {
    st.imgX = imgX;
    st.imgY = imgY;
    if (side && side !== st.side) st.side = side;
    render();
  };

  viewer.onSideChange = newSide => {
    if (newSide !== st.side) {
      st.side = newSide;
      render();
      toast(newSide === 'back' ? 'Diseño colocado en la espalda.' : 'Diseño colocado al frente.');
    }
  };
}

const currentFont = () => FONTS.find(f => f.id === st.fontId) || FONTS[0];
const unitPrice = () => CUTS[st.cut].price + PRINT_FEE;
const hasImageArt = () => !!st.img || (st.presetKey && st.presetKey !== 'ninguno' && PRESETS[st.presetKey] && PRESETS[st.presetKey].inner);
const hasCustomText = () => (st.text || '').trim().length > 0;
const hasArt = () => hasImageArt() || hasCustomText();

function markSide() { $('sides').querySelectorAll('[data-side]').forEach(b => b.setAttribute('aria-pressed', b.dataset.side === st.side)); }

/* Regenera el diseño 3D solo cuando cambian el arte, el texto o sus ajustes de tamaño/posición */
let printKey = null;
function syncPrint() {
  const key = [st.img, st.presetKey, st.text, st.fontId, st.textColor, st.imgScale, st.imgX, st.imgY, st.textScale, st.textX, st.textY];
  if (printKey && key.every((v, i) => v === printKey[i])) return;
  printKey = key;
  viewer.setPrint({
    img: st.img, preset: st.img ? null : st.presetKey,
    text: st.text, font: currentFont(), textColor: st.textColor,
    imgScale: st.imgScale, imgX: st.imgX, imgY: st.imgY,
    textScale: st.textScale, textX: st.textX, textY: st.textY
  }).catch(err => { status.className = 'status err'; status.textContent = typeof err === 'string' ? err : 'No se pudo generar el diseño.'; });
}

function render() {
  if (viewer) {
    viewer.setModel(st.cut, st.color);
    viewer.setSide(st.side);
    syncPrint();
  } else {
    $('preview').innerHTML = shirtSVG(st.color, st.cut, {
      img: st.img, presetKey: st.img ? null : st.presetKey, side: st.side,
      text: st.text, font: currentFont(), textColor: st.textColor,
      imgScale: st.imgScale, imgX: st.imgX, imgY: st.imgY,
      textScale: st.textScale, textX: st.textX, textY: st.textY
    });
  }
  $('preview-note').textContent = hasArt() ? 'Vista previa de tu playera personalizada.' : 'Elige corte y color. Tu diseño aparecerá aquí.';
  markSide();

  $('cuts').innerHTML = cutsHTML(st.cut);
  $('swatches').innerHTML = swatchesHTML(st.color);
  $('color-note').innerHTML = `Color seleccionado: <strong>${(COLORS.find(c => c.hex.toLowerCase() === st.color.toLowerCase()) || {}).name || st.color}</strong>`;
  $('presets').innerHTML = presetsHTML(st.img ? null : st.presetKey);
  $('fonts').innerHTML = fontsHTML(st.fontId, st.text);
  $('text-colors').innerHTML = textColorsHTML(st.textColor);
  $('sizes').innerHTML = sizePillsHTML(st.size);
  $('qty-val').textContent = st.qty;
  const cutPrice = CUTS[st.cut] ? CUTS[st.cut].price : 0;
  if ($('price-breakdown')) {
    $('price-breakdown').textContent = PRINT_FEE > 0
      ? `Playera $${cutPrice} + Personalizado $${PRINT_FEE}`
      : `Playera $${cutPrice}`;
  }
  $('price-total').textContent = `$${unitPrice() * st.qty}`;

  // Actualización de controles de imagen (tamaño y posición)
  const showImgAdj = hasImageArt();
  if ($('img-adjust')) {
    $('img-adjust').hidden = !showImgAdj;
    if (showImgAdj) {
      if (document.activeElement !== $('img-scale')) $('img-scale').value = st.imgScale;
      $('img-scale-val').textContent = Math.round(st.imgScale * 100) + '%';
      if (document.activeElement !== $('img-x')) $('img-x').value = st.imgX;
      $('img-x-val').textContent = st.imgX === 0 ? 'Centro (0)' : `${st.imgX > 0 ? '+' : ''}${st.imgX} px`;
      if (document.activeElement !== $('img-y')) $('img-y').value = st.imgY;
      $('img-y-val').textContent = st.imgY === 0 ? 'Centro (0)' : `${st.imgY > 0 ? '+' : ''}${st.imgY} px`;
    }
  }

  // Actualización de controles de caligrafía (tamaño y posición)
  const showTxtAdj = hasCustomText();
  if ($('text-adjust')) {
    $('text-adjust').hidden = !showTxtAdj;
    if (showTxtAdj) {
      if (document.activeElement !== $('text-scale')) $('text-scale').value = st.textScale;
      $('text-scale-val').textContent = Math.round(st.textScale * 100) + '%';
      if ($('text-x') && document.activeElement !== $('text-x')) $('text-x').value = st.textX;
      if ($('text-x-val')) $('text-x-val').textContent = st.textX === 0 ? 'Centro (0)' : `${st.textX > 0 ? '+' : ''}${st.textX} px`;
      if (document.activeElement !== $('text-y')) $('text-y').value = st.textY;
      $('text-y-val').textContent = st.textY === 0 ? '0 px' : `${st.textY > 0 ? '+' : ''}${st.textY} px`;
      $('text-scale-pills').querySelectorAll('[data-text-scale]').forEach(b => {
        b.setAttribute('aria-pressed', Math.abs(+b.dataset.textScale - st.textScale) < 0.08);
      });
    }
  }

  saveDesign(st);
}

$('sides').addEventListener('click', e => { const b = e.target.closest('[data-side]'); if (b) { st.side = b.dataset.side; render(); } });
$('cuts').addEventListener('click', e => { const b = e.target.closest('[data-cut]'); if (b) { st.cut = b.dataset.cut; render(); } });
$('swatches').addEventListener('click', e => { const b = e.target.closest('[data-color]'); if (b) { st.color = b.dataset.color; render(); } });

$('file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    status.className = 'status'; status.textContent = '';
    st.img = await loadDesign(file);
    st.fileName = file.name;
    st.presetKey = null;
    st.imgScale = 1; st.imgX = 0; st.imgY = 0;
    $('file-name').textContent = file.name;
    $('file-loaded').hidden = false;
    render();
    toast('Diseño cargado.');
  } catch (err) { status.className = 'status err'; status.textContent = err; }
});
$('file-remove').addEventListener('click', () => {
  st.img = null; st.fileName = ''; st.presetKey = 'ninguno';
  st.imgScale = 1; st.imgX = 0; st.imgY = 0;
  $('file').value = ''; $('file-loaded').hidden = true;
  render();
});

$('presets').addEventListener('click', e => {
  const b = e.target.closest('[data-preset]'); if (!b) return;
  st.presetKey = b.dataset.preset; st.img = null; st.fileName = '';
  $('file').value = ''; $('file-loaded').hidden = true;
  render();
});

// Controles de ajuste de imagen: escala, X y Y
if ($('img-scale')) {
  $('img-scale').addEventListener('input', e => { st.imgScale = +e.target.value; render(); });
  $('img-scale-minus').addEventListener('click', () => { st.imgScale = Math.max(0.4, +(st.imgScale - 0.1).toFixed(2)); render(); });
  $('img-scale-plus').addEventListener('click', () => { st.imgScale = Math.min(1.8, +(st.imgScale + 0.1).toFixed(2)); render(); });
  $('img-x').addEventListener('input', e => { st.imgX = +e.target.value; render(); });
  $('img-x-minus').addEventListener('click', () => { st.imgX = Math.max(-160, st.imgX - 10); render(); });
  $('img-x-plus').addEventListener('click', () => { st.imgX = Math.min(160, st.imgX + 10); render(); });
  $('img-y').addEventListener('input', e => { st.imgY = +e.target.value; render(); });
  $('img-y-minus').addEventListener('click', () => { st.imgY = Math.max(-160, st.imgY - 10); render(); });
  $('img-y-plus').addEventListener('click', () => { st.imgY = Math.min(160, st.imgY + 10); render(); });

  $('img-pos-pills').addEventListener('click', e => {
    const b = e.target.closest('[data-img-pos]'); if (!b) return;
    const pos = b.dataset.imgPos;
    if (pos === 'center') { st.imgX = 0; st.imgY = 0; }
    else if (pos === 'chest-left') { st.imgX = -110; st.imgY = -80; st.imgScale = 0.6; }
    else if (pos === 'chest-high') { st.imgX = 0; st.imgY = -110; }
    else if (pos === 'abdomen') { st.imgX = 0; st.imgY = 70; }
    else if (pos === 'hem') { st.imgX = 0; st.imgY = 130; }
    render();
  });

  $('img-reset-ctrls').addEventListener('click', () => {
    st.imgScale = 1; st.imgX = 0; st.imgY = 0;
    render();
    toast('Posición y tamaño de imagen restablecidos.');
  });
}

$('text-input').value = st.text;
$('text-input').addEventListener('input', e => { st.text = e.target.value; render(); });
$('fonts').addEventListener('click', e => { const b = e.target.closest('[data-font]'); if (b) { st.fontId = b.dataset.font; render(); } });
$('text-colors').addEventListener('click', e => { const b = e.target.closest('[data-textcolor]'); if (b) { st.textColor = b.dataset.textcolor; render(); } });

// Controles de ajuste de caligrafía: tamaño, posición horizontal (X) y vertical (Y)
if ($('text-scale')) {
  $('text-scale').addEventListener('input', e => { st.textScale = +e.target.value; render(); });
  $('text-scale-minus').addEventListener('click', () => { st.textScale = Math.max(0.5, +(st.textScale - 0.1).toFixed(2)); render(); });
  $('text-scale-plus').addEventListener('click', () => { st.textScale = Math.min(1.8, +(st.textScale + 0.1).toFixed(2)); render(); });
  $('text-scale-pills').addEventListener('click', e => {
    const b = e.target.closest('[data-text-scale]'); if (!b) return;
    st.textScale = +b.dataset.textScale;
    render();
  });
  if ($('text-x')) {
    $('text-x').addEventListener('input', e => { st.textX = +e.target.value; render(); });
    $('text-x-minus').addEventListener('click', () => { st.textX = Math.max(-160, st.textX - 10); render(); });
    $('text-x-plus').addEventListener('click', () => { st.textX = Math.min(160, st.textX + 10); render(); });
  }
  $('text-y').addEventListener('input', e => { st.textY = +e.target.value; render(); });
  $('text-y-minus').addEventListener('click', () => { st.textY = Math.max(-160, st.textY - 10); render(); });
  $('text-y-plus').addEventListener('click', () => { st.textY = Math.min(160, st.textY + 10); render(); });

  if ($('text-pos-pills')) {
    $('text-pos-pills').addEventListener('click', e => {
      const b = e.target.closest('[data-text-pos]'); if (!b) return;
      const pos = b.dataset.textPos;
      if (pos === 'center') { st.textX = 0; st.textY = 0; }
      else if (pos === 'chest-high') { st.textX = 0; st.textY = -110; }
      else if (pos === 'chest-left') { st.textX = -110; st.textY = -80; st.textScale = 0.7; }
      else if (pos === 'bottom') { st.textX = 0; st.textY = 120; }
      render();
    });
  }

  $('text-reset-ctrls').addEventListener('click', () => {
    st.textScale = 1; st.textX = 0; st.textY = 0;
    render();
    toast('Caligrafía restablecida.');
  });
}

$('sizes').addEventListener('click', e => { const b = e.target.closest('[data-size]'); if (b) { st.size = b.dataset.size; render(); } });
$('qty-minus').addEventListener('click', () => { if (st.qty > 1) { st.qty--; render(); } });
$('qty-plus').addEventListener('click', () => { if (st.qty < 20) { st.qty++; render(); } else toast('Máximo 20 piezas por pedido. Escríbenos para mayoreo.'); });

/* Herramientas de la vista 3D: giro, fondo, vista previa y descarga */
if (viewer) {
  $('views').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'spin') { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); viewer.setSpin(on); }
    else if (b.dataset.view) viewer.turnTo(+b.dataset.view);
  });
  $('bgs').addEventListener('click', e => {
    const b = e.target.closest('[data-bg]'); if (!b) return;
    viewer.setBackground(b.dataset.bg);
    $('bgs').querySelectorAll('[data-bg]').forEach(s => s.setAttribute('aria-pressed', s === b));
  });
  $('shot').addEventListener('click', () => {
    const a = document.createElement('a'); a.download = 'mi-playera-3d.png'; a.href = viewer.capture(); a.click();
  });
  const dlg = $('preview-dlg');
  $('open-preview').addEventListener('click', () => {
    const url = viewer.capture(); $('preview-img').src = url; $('preview-dl').href = url; dlg.showModal();
  });
  $('preview-x').addEventListener('click', () => dlg.close());
}

$('reset').addEventListener('click', () => {
  Object.assign(st, {
    cut: 'regular', color: '#2F4BFF', img: null, fileName: '', presetKey: 'ninguno',
    text: '', fontId: FONTS[0].id, textColor: TEXT_COLORS[0].hex, side: 'front', size: 'M', qty: 1,
    imgScale: 1, imgX: 0, imgY: 0, textScale: 1, textX: 0, textY: 0
  });
  $('text-input').value = ''; $('file').value = ''; $('file-loaded').hidden = true; $('notas').value = '';
  status.className = 'status'; status.textContent = '';
  render();
  toast('Opciones reiniciadas.');
});

$('form').addEventListener('submit', async e => {
  e.preventDefault();
  status.className = 'status'; status.textContent = '';

  const thumbSrc = st.img ? await thumb(st.img, 160) : null;
  const cutName = CUTS[st.cut].name;
  const colorName = (COLORS.find(c => c.hex.toLowerCase() === st.color.toLowerCase()) || {}).name || st.color;

  Cart.add({
    key: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    kind: 'custom',
    name: `Playera ${cutName} personalizada`,
    cut: st.cut, color: st.color, colorName,
    size: st.size, qty: st.qty,
    price: unitPrice(),
    text: st.text || '',
    fontId: st.fontId,
    textColor: st.textColor,
    presetKey: st.img ? null : st.presetKey,
    thumb: thumbSrc,
    side: st.side,
    notes: $('notas').value.trim(),
    imgScale: st.imgScale,
    imgX: st.imgX,
    imgY: st.imgY,
    textScale: st.textScale,
    textX: st.textX,
    textY: st.textY
  });

  status.textContent = 'Agregada al carrito. Puedes seguir personalizando o ir a pagar.';
  toast('Playera agregada al carrito.');
  Cart.open();
});

if (st.img) { $('file-name').textContent = st.fileName || 'Imagen cargada'; $('file-loaded').hidden = false; }
render();
