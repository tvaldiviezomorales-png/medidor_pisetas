// ===== CONSTANTES =====
const SHELVES = ['superior', 'medio', 'inferior'];
const SHELF_LABEL = { superior: '🔼 Superior', medio: '➡️ Medio', inferior: '🔽 Inferior' };

// Tara configurable — se carga de localStorage
let CONTAINER_TARE = { blanco: 32.50, dorado: 32.60 };

function loadTares() {
  const saved = localStorage.getItem('container_tare');
  if (saved) CONTAINER_TARE = JSON.parse(saved);
  // Actualizar labels en el form
  const lb = document.getElementById('tare-label-blanco');
  const ld = document.getElementById('tare-label-dorado');
  if (lb) lb.textContent = `−${CONTAINER_TARE.blanco.toFixed(2)} g`;
  if (ld) ld.textContent = `−${CONTAINER_TARE.dorado.toFixed(2)} g`;
  // Actualizar inputs del panel
  const ib = document.getElementById('tare-blanco');
  const id = document.getElementById('tare-dorado');
  if (ib) ib.value = CONTAINER_TARE.blanco;
  if (id) id.value = CONTAINER_TARE.dorado;
}

function saveTares() {
  const vb = parseFloat(document.getElementById('tare-blanco').value);
  const vd = parseFloat(document.getElementById('tare-dorado').value);
  if (isNaN(vb) || vb < 0 || isNaN(vd) || vd < 0) { alert('Valores de tara inválidos.'); return; }
  CONTAINER_TARE.blanco = vb;
  CONTAINER_TARE.dorado = vd;
  localStorage.setItem('container_tare', JSON.stringify(CONTAINER_TARE));
  loadTares();
  // Recalcular todos los pesos netos con la nueva tara
  inventory.forEach(b => { b.weightNet = calcNet(b.weightGross, b.container); });
  save();
  renderAll();
  alert('✅ Taras actualizadas. Pesos netos recalculados.');
}

// ===== JSONBIN CONFIG =====
const BIN_KEY   = '$2a$10$CepQntPMjjpIwP8UFoBcOujDD9fCzTWAaG0Cu2RHonNpRIcSssQVq';
const BIN_URL   = 'https://api.jsonbin.io/v3/b';
let   BIN_ID    = '6a21dd0bf5f4af5e29ba2223'; // ID fijo — todos los dispositivos usan este

// ===== ESTADO =====
let inventory = [];
let history   = [];
let modalCallback = null;
let saveTimer = null;

// ===== INDICADOR DE SYNC =====
function setSyncStatus(status) {
  // status: 'saving' | 'ok' | 'error' | 'loading'
  const el = document.getElementById('sync-status');
  if (!el) return;
  const icons = { saving: '🔄 Guardando...', ok: '✅ Sincronizado', error: '⚠️ Sin conexión', loading: '🔄 Cargando...' };
  el.textContent  = icons[status] || '';
  el.className    = `sync-status sync-${status}`;
}

// ===== JSONBIN: CREAR BIN INICIAL =====
async function createBin(data) {
  const res = await fetch(BIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': BIN_KEY,
      'X-Bin-Name':   'inventario-pisetas',
      'X-Bin-Private': 'false'
    },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  return json.metadata?.id || null;
}
async function readBin() {
  if (!BIN_ID) return null;
  const res = await fetch(`${BIN_URL}/${BIN_ID}/latest`, {
    headers: { 'X-Master-Key': BIN_KEY }
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.record || null;
}

// ===== JSONBIN: GUARDAR =====
async function writeBin(data) {
  const res = await fetch(`${BIN_URL}/${BIN_ID}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': BIN_KEY
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) setSyncStatus('error');
}

// ===== PERSISTENCIA =====
function save() {
  // Guardar local inmediatamente
  localStorage.setItem('inv_bottles', JSON.stringify(inventory));
  localStorage.setItem('inv_history', JSON.stringify(history));
  // Guardar en la nube con debounce de 800ms para no hacer muchas peticiones
  setSyncStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await writeBin({ inventory, history });
      setSyncStatus('ok');
    } catch { setSyncStatus('error'); }
  }, 800);
}

async function load() {
  setSyncStatus('loading');
  try {
    // Intentar cargar desde la nube primero
    const cloud = await readBin();
    if (cloud && cloud.inventory) {
      inventory = cloud.inventory;
      history   = cloud.history || [];
    } else {
      // Si no hay nube, cargar de localStorage
      inventory = JSON.parse(localStorage.getItem('inv_bottles')) || [];
      history   = JSON.parse(localStorage.getItem('inv_history')) || [];
    }
  } catch {
    // Si falla la red, usar localStorage
    inventory = JSON.parse(localStorage.getItem('inv_bottles')) || [];
    history   = JSON.parse(localStorage.getItem('inv_history')) || [];
    setSyncStatus('error');
  }

  // Migrar datos antiguos
  inventory.forEach(b => {
    if (!b.shelf)     b.shelf     = 'medio';
    if (!b.name)      b.name      = '';
    if (!b.color)     b.color     = '#4f8ef7';
    if (!b.container) b.container = 'blanco';
    if (b.weightGross === undefined) {
      b.weightGross = b.weight || 0;
      b.weightNet   = Math.max(0, b.weightGross - CONTAINER_TARE[b.container]);
      delete b.weight;
    }
  });

  setSyncStatus('ok');
}

// ===== ID ÚNICO =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ===== PESO NETO =====
function calcNet(gross, container) {
  return Math.max(0, gross - (CONTAINER_TARE[container] || 0));
}

function getSelectedContainer(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || 'blanco';
}

// ===== PREVIEW PESO NETO (form agregar) =====
function updateNetPreview() {
  const gross     = parseFloat(document.getElementById('input-weight').value);
  const container = getSelectedContainer('input-container');
  const el        = document.getElementById('net-preview');
  if (isNaN(gross) || gross <= 0) { el.textContent = '— g'; el.className = 'net-preview'; return; }
  const net = calcNet(gross, container);
  el.textContent = `${net.toFixed(3)} g`;
  el.className   = 'net-preview net-ok';
}

// Actualizar preview cuando cambia el radio de envase
document.querySelectorAll('input[name="input-container"]').forEach(r =>
  r.addEventListener('change', () => {
    updateNetPreview();
    syncContainerHighlight('input-container', 'opt-blanco', 'opt-dorado');
  })
);

// ===== PREVIEW PESO NETO (modal editar) =====
function updateEditNetPreview() {
  const gross     = parseFloat(document.getElementById('edit-weight').value);
  const container = getSelectedContainer('edit-container');
  const el        = document.getElementById('edit-net-preview');
  if (isNaN(gross) || gross <= 0) { el.textContent = '— g'; el.className = 'net-preview'; return; }
  const net = calcNet(gross, container);
  el.textContent = `${net.toFixed(3)} g`;
  el.className   = 'net-preview net-ok';
}

document.querySelectorAll('input[name="edit-container"]').forEach(r =>
  r.addEventListener('change', () => {
    updateEditNetPreview();
    syncContainerHighlight('edit-container', 'edit-opt-blanco', 'edit-opt-dorado');
  })
);

// Resaltar opción seleccionada
function syncContainerHighlight(radioName, idBlanco, idDorado) {
  const val = getSelectedContainer(radioName);
  document.getElementById(idBlanco).classList.toggle('selected', val === 'blanco');
  document.getElementById(idDorado).classList.toggle('selected', val === 'dorado');
}

// ===== ORDENAR CÓDIGOS =====
function codeSort(a, b) {
  const parse = s => {
    const m = s.match(/^([A-Za-z]*)(\d*)(.*)$/);
    return [m[1].toUpperCase(), parseInt(m[2] || '0', 10), m[3]];
  };
  const [al, an, ar] = parse(a);
  const [bl, bn, br] = parse(b);
  if (al !== bl) return al < bl ? -1 : 1;
  if (an !== bn) return an - bn;
  return ar < br ? -1 : ar > br ? 1 : 0;
}

// ===== COLOR PREVIEW =====
document.getElementById('input-color').addEventListener('input', function () {
  document.getElementById('color-preview').style.background = this.value;
});
document.getElementById('edit-color').addEventListener('input', function () {
  document.getElementById('edit-color-preview').style.background = this.value;
});

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('color-preview').style.background =
    document.getElementById('input-color').value;
  syncContainerHighlight('input-container', 'opt-blanco', 'opt-dorado');
});

// ===== AGREGAR BOTELLAS =====
function addBottles() {
  const code      = document.getElementById('input-code').value.trim().toUpperCase();
  const name      = document.getElementById('input-name').value.trim();
  const color     = document.getElementById('input-color').value;
  const shelf     = document.getElementById('input-shelf').value;
  const container = getSelectedContainer('input-container');
  const gross     = parseFloat(document.getElementById('input-weight').value);
  const qty       = parseInt(document.getElementById('input-qty').value, 10);

  if (!code)                       { alert('Ingresa un código.'); return; }
  if (isNaN(gross) || gross <= 0)  { alert('Ingresa un peso bruto válido.'); return; }
  if (isNaN(qty)   || qty < 1)     { alert('Cantidad mínima: 1.'); return; }

  const net = calcNet(gross, container);

  for (let i = 0; i < qty; i++) {
    inventory.push({
      id: uid(), code, name, color, shelf, container,
      weightGross: gross, weightNet: net,
      addedAt: new Date().toISOString()
    });
  }

  history.unshift({
    type: 'entrada', code, name, color, shelf, container,
    weightGross: gross, weightNet: net, qty,
    timestamp: new Date().toISOString()
  });

  save();
  renderAll();
  updateStats();

  document.getElementById('input-code').value  = '';
  document.getElementById('input-name').value  = '';
  document.getElementById('input-weight').value = '';
  document.getElementById('input-qty').value   = '1';
  document.getElementById('net-preview').textContent = '— g';
  document.getElementById('net-preview').className   = 'net-preview';
  document.getElementById('code-suggestions').innerHTML = '';
}

// ===== USAR (ELIMINAR) BOTELLA =====
function useBottle(id) {
  const b = inventory.find(x => x.id === id);
  if (!b) return;

  const nameHtml = b.name ? `<em>${b.name}</em><br>` : '';
  const contIcon = b.container === 'dorado' ? '🟨' : '⬜';
  openModal(
    `¿Usar botella <strong>${b.code}</strong>?<br>${nameHtml}` +
    `Envase: ${contIcon} ${b.container}<br>` +
    `Peso neto: <strong>${b.weightNet.toFixed(3)} g</strong><br><br>` +
    `Desaparecerá del inventario.`,
    () => {
      inventory = inventory.filter(x => x.id !== id);
      history.unshift({
        type: 'salida', code: b.code, name: b.name, color: b.color,
        shelf: b.shelf, container: b.container,
        weightGross: b.weightGross, weightNet: b.weightNet, qty: 1,
        timestamp: new Date().toISOString()
      });
      save();
      renderAll();
      updateStats();
    }
  );
}

// ===== EDITAR BOTELLA =====
function openEditModal(id) {
  const b = inventory.find(x => x.id === id);
  if (!b) return;

  document.getElementById('edit-id').value    = id;
  document.getElementById('edit-name').value  = b.name  || '';
  document.getElementById('edit-color').value = b.color || '#4f8ef7';
  document.getElementById('edit-color-preview').style.background = b.color || '#4f8ef7';
  document.getElementById('edit-weight').value = b.weightGross;
  document.getElementById('edit-shelf').value  = b.shelf || 'medio';

  // Seleccionar radio de envase
  const cont = b.container || 'blanco';
  document.querySelector(`input[name="edit-container"][value="${cont}"]`).checked = true;
  syncContainerHighlight('edit-container', 'edit-opt-blanco', 'edit-opt-dorado');
  updateEditNetPreview();

  document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
}

function saveEdit() {
  const id    = document.getElementById('edit-id').value;
  const b     = inventory.find(x => x.id === id);
  if (!b) return;

  const gross = parseFloat(document.getElementById('edit-weight').value);
  if (isNaN(gross) || gross <= 0) { alert('Peso inválido.'); return; }

  b.name        = document.getElementById('edit-name').value.trim();
  b.color       = document.getElementById('edit-color').value;
  b.shelf       = document.getElementById('edit-shelf').value;
  b.container   = getSelectedContainer('edit-container');
  b.weightGross = gross;
  b.weightNet   = calcNet(gross, b.container);

  save();
  closeEditModal();
  renderAll();
}

// ===== RENDER PRINCIPAL =====
function renderAll() {
  const search  = document.getElementById('search-input').value.trim().toUpperCase();
  const sort    = document.getElementById('sort-select').value;
  const grouped = document.getElementById('group-toggle').checked;

  SHELVES.forEach(shelf => {
    const grid     = document.getElementById(`grid-${shelf}`);
    const emptyMsg = document.getElementById(`empty-${shelf}`);
    const countEl  = document.getElementById(`count-${shelf}`);

    let items = inventory.filter(b =>
      b.shelf === shelf &&
      (b.code.includes(search) || (b.name || '').toUpperCase().includes(search))
    );

    // Ordenar — siempre de menor a mayor para respetar el orden de derecha a izquierda
    items = [...items].sort((a, b) => {
      if (sort === 'code-asc')    return codeSort(a.code, b.code);
      if (sort === 'code-desc')   return codeSort(b.code, a.code);
      if (sort === 'weight-asc')  return a.weightNet - b.weightNet;
      if (sort === 'weight-desc') return b.weightNet - a.weightNet;
      return 0;
    });

    countEl.textContent = `${items.length} ud${items.length !== 1 ? 's' : ''}`;
    grid.innerHTML = '';

    if (items.length === 0) {
      emptyMsg.style.display = 'block';
      return;
    }
    emptyMsg.style.display = 'none';

    if (grouped) {
      renderGrouped(grid, items);
    } else {
      renderIndividual(grid, items);
    }
  });

  renderHistory();
}

// ===== RENDER INDIVIDUAL =====
// El grid usa direction: rtl para que el código menor quede a la derecha
function renderIndividual(grid, items) {
  // Contar cuántas unidades hay por código
  const codeCounters = {};
  items.forEach(b => { codeCounters[b.code] = (codeCounters[b.code] || 0) + 1; });

  const codeIndex = {};
  // items ya viene ordenado de menor a mayor; con RTL el primero (menor) queda a la derecha
  items.forEach(b => {
    if (!codeIndex[b.code]) codeIndex[b.code] = 1;
    const serial = codeCounters[b.code] > 1 ? `#${codeIndex[b.code]}` : '';
    codeIndex[b.code]++;

    const card = document.createElement('div');
    card.className = 'bottle-card';
    card.style.borderTopColor = b.color || 'var(--accent)';

    const contIcon = b.container === 'dorado' ? '🟨' : '⬜';
    const tare     = CONTAINER_TARE[b.container] || 0;
    const colorDot = `<span class="color-dot" style="background:${b.color || '#4f8ef7'}"></span>`;
    const nameHtml = b.name
      ? `<div class="bottle-name">${colorDot}${b.name}</div>`
      : `<div class="bottle-name">${colorDot}<span style="opacity:.4">Sin nombre</span></div>`;

    card.innerHTML = `
      <div class="bottle-code">
        ${b.code}${serial ? `<span class="serial-badge">${serial}</span>` : ''}
      </div>
      ${nameHtml}
      <div class="bottle-container">${contIcon} <span>${b.container}</span> <span class="tare-tag">−${tare} g</span></div>
      <div class="bottle-weight-block">
        <div class="weight-row gross">Bruto: <span>${b.weightGross.toFixed(3)} g</span></div>
        <div class="weight-row net">Neto: <span>${b.weightNet.toFixed(3)} g</span></div>
      </div>
      <div class="bottle-actions">
        <button class="btn btn-edit" onclick="openEditModal('${b.id}')">✏️</button>
        <button class="btn btn-use"  onclick="useBottle('${b.id}')">✅ Usar</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ===== RENDER AGRUPADO =====
function renderGrouped(grid, items) {
  const groups = {};
  items.forEach(b => {
    if (!groups[b.code]) groups[b.code] = [];
    groups[b.code].push(b);
  });

  Object.keys(groups).sort(codeSort).forEach(code => {
    const bottles      = groups[code];
    const totalNet     = bottles.reduce((s, b) => s + b.weightNet, 0);
    const avgNet       = totalNet / bottles.length;
    const repColor     = bottles[0].color     || '#4f8ef7';
    const repName      = bottles[0].name      || '';

    const card = document.createElement('div');
    card.className = 'group-card';
    card.style.borderTopColor = repColor;

    const miniBottles = bottles.map((b, i) => {
      const contIcon = b.container === 'dorado' ? '🟨' : '⬜';
      return `
        <div class="mini-bottle">
          <span class="color-dot" style="background:${b.color || '#4f8ef7'}"></span>
          ${bottles.length > 1 ? `<span class="mini-serial">#${i + 1}</span>` : ''}
          ${contIcon}
          <span class="mini-weight">${b.weightNet.toFixed(3)} g</span>
          <button class="mini-use-btn" onclick="useBottle('${b.id}')">Usar</button>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <div class="group-header">
        <span class="group-code">
          <span class="color-dot" style="background:${repColor}"></span>
          ${code}
        </span>
        <span class="group-badge">${bottles.length} uds</span>
      </div>
      ${repName ? `<div class="group-name">${repName}</div>` : ''}
      <div class="group-info">
        Neto total: <strong>${totalNet.toFixed(3)} g</strong>
        &nbsp;·&nbsp; Prom neto: <strong>${avgNet.toFixed(1)} g</strong>
      </div>
      <div class="group-bottles">${miniBottles}</div>
    `;
    grid.appendChild(card);
  });
}

// ===== HISTORIAL =====
function renderHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (history.length === 0) {
    list.innerHTML = '<div class="empty-msg">Sin movimientos aún.</div>';
    return;
  }

  const shelfLabel = { superior: '🔼 Sup', medio: '➡️ Med', inferior: '🔽 Inf' };

  history.slice(0, 80).forEach(h => {
    const item = document.createElement('div');
    item.className = `history-item ${h.type}`;
    const icon      = h.type === 'entrada' ? '📥' : '📤';
    const label     = h.type === 'entrada' ? 'Entrada' : 'Salida';
    const contIcon  = h.container === 'dorado' ? '🟨' : '⬜';
    const netStr    = h.weightNet !== undefined ? `${h.weightNet.toFixed(3)} g neto` : `${h.weightGross} g`;
    const detail    = h.type === 'entrada'
      ? `${label} · ${h.qty} ud${h.qty > 1 ? 's' : ''} · ${netStr} · ${contIcon} · ${shelfLabel[h.shelf] || ''}`
      : `${label} · ${netStr} · ${contIcon} · ${shelfLabel[h.shelf] || ''}`;
    const dot = h.color ? `<span class="color-dot" style="background:${h.color}"></span>` : '';

    item.innerHTML = `
      <span class="history-icon">${icon}</span>
      ${dot}
      <span class="history-code">${h.code}</span>
      ${h.name ? `<span class="history-name">${h.name}</span>` : ''}
      <span class="history-detail">${detail}</span>
      <span class="history-time">${formatTime(h.timestamp)}</span>
    `;
    list.appendChild(item);
  });
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'2-digit' })
    + ' ' + d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
}

// ===== STATS =====
function updateStats() {
  const total = inventory.length;
  const codes = new Set(inventory.map(b => b.code)).size;
  document.getElementById('total-bottles').textContent = `${total} botella${total !== 1 ? 's' : ''} en stock`;
  document.getElementById('total-codes').textContent   = `${codes} código${codes !== 1 ? 's' : ''} distintos`;
}

// ===== AUTOCOMPLETE =====
document.getElementById('input-code').addEventListener('input', function () {
  const val = this.value.trim().toUpperCase();
  const box = document.getElementById('code-suggestions');
  if (!val) { box.innerHTML = ''; return; }

  const known   = [...new Set(inventory.map(b => b.code))].sort(codeSort);
  const matches = known.filter(c => c.includes(val));
  if (matches.length === 0) { box.innerHTML = ''; return; }

  box.innerHTML = matches.slice(0, 8).map(c => {
    const b   = inventory.find(x => x.code === c);
    const dot = b?.color ? `<span class="color-dot" style="background:${b.color}"></span>` : '';
    const nm  = b?.name  ? `<span style="color:var(--text-muted);font-size:.8rem"> — ${b.name}</span>` : '';
    return `<div class="suggestion-item" onclick="selectCode('${c}')">${dot}${c}${nm}</div>`;
  }).join('');
});

function selectCode(code) {
  document.getElementById('input-code').value = code;
  document.getElementById('code-suggestions').innerHTML = '';

  const bottles = inventory.filter(b => b.code === code);
  if (bottles.length > 0) {
    const avgGross = bottles.reduce((s, b) => s + b.weightGross, 0) / bottles.length;
    document.getElementById('input-weight').value = avgGross.toFixed(3);
    if (bottles[0].name)  document.getElementById('input-name').value  = bottles[0].name;
    if (bottles[0].color) {
      document.getElementById('input-color').value = bottles[0].color;
      document.getElementById('color-preview').style.background = bottles[0].color;
    }
    if (bottles[0].shelf)     document.getElementById('input-shelf').value = bottles[0].shelf;
    if (bottles[0].container) {
      document.querySelector(`input[name="input-container"][value="${bottles[0].container}"]`).checked = true;
      syncContainerHighlight('input-container', 'opt-blanco', 'opt-dorado');
    }
    updateNetPreview();
  }
}

document.addEventListener('click', e => {
  if (!e.target.closest('.form-group')) {
    document.getElementById('code-suggestions').innerHTML = '';
  }
});

// Enter en el form
document.getElementById('input-code').addEventListener('keydown',   e => { if (e.key === 'Enter') document.getElementById('input-name').focus(); });
document.getElementById('input-name').addEventListener('keydown',   e => { if (e.key === 'Enter') document.getElementById('input-weight').focus(); });
document.getElementById('input-weight').addEventListener('keydown', e => { if (e.key === 'Enter') addBottles(); });

// ===== MODAL CONFIRMACIÓN =====
function openModal(msg, onConfirm) {
  document.getElementById('modal-msg').innerHTML = msg;
  document.getElementById('modal').style.display = 'flex';
  modalCallback = onConfirm;
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  modalCallback = null;
}

document.getElementById('modal-confirm').addEventListener('click', () => {
  if (modalCallback) modalCallback();
  closeModal();
});

document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});

document.getElementById('edit-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-modal')) closeEditModal();
});

// ===== EXCEL: IMPORTAR =====
function importExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (rows.length === 0) { alert('El archivo está vacío.'); return; }

      let added = 0;
      rows.forEach(row => {
        // Aceptar columnas en español o inglés, mayúsculas o minúsculas
        const code      = String(row['Código'] || row['Codigo'] || row['code'] || '').trim().toUpperCase();
        const name      = String(row['Nombre'] || row['name'] || '').trim();
        const color     = String(row['Color']  || row['color'] || '#4f8ef7').trim();
        const container = String(row['Envase'] || row['Piseta'] || row['container'] || 'blanco').trim().toLowerCase();
        const shelf     = String(row['Gabineta'] || row['shelf'] || 'medio').trim().toLowerCase();
        const gross     = parseFloat(row['Peso Bruto'] || row['Peso'] || row['weight'] || 0);

        if (!code || isNaN(gross) || gross <= 0) return; // saltar filas incompletas

        const cont  = ['blanco','dorado'].includes(container) ? container : 'blanco';
        const shf   = ['superior','medio','inferior'].includes(shelf) ? shelf : 'medio';
        const net   = calcNet(gross, cont);

        inventory.push({
          id: uid(), code, name,
          color: /^#[0-9a-fA-F]{3,6}$/.test(color) ? color : '#4f8ef7',
          shelf: shf, container: cont,
          weightGross: gross, weightNet: net,
          addedAt: new Date().toISOString()
        });
        added++;
      });

      if (added === 0) { alert('No se encontraron filas válidas. Revisa que el archivo tenga las columnas correctas.'); return; }

      history.unshift({
        type: 'entrada', code: `IMPORTACIÓN EXCEL (${added} botellas)`,
        name: '', color: '#4f8ef7', shelf: 'varios', container: 'varios',
        weightGross: 0, weightNet: 0, qty: added,
        timestamp: new Date().toISOString()
      });

      save();
      renderAll();
      updateStats();
      alert(`✅ Se importaron ${added} botellas correctamente.`);
      event.target.value = ''; // reset input
    } catch(err) {
      alert('Error al leer el archivo. Asegúrate de que sea un .xlsx válido.');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ===== EXCEL: EXPORTAR =====
function exportExcel() {
  if (inventory.length === 0) { alert('No hay botellas en el inventario.'); return; }

  const rows = [...inventory]
    .sort((a, b) => codeSort(a.code, b.code))
    .map((b, i) => ({
      'N°':          i + 1,
      'Código':      b.code,
      'Nombre':      b.name      || '',
      'Color (hex)': b.color     || '',
      'Envase':      b.container || '',
      'Gabineta':    SHELF_LABEL[b.shelf] || b.shelf,
      'Peso Bruto (g)': b.weightGross,
      'Tara (g)':    CONTAINER_TARE[b.container] || 0,
      'Peso Neto (g)':  parseFloat(b.weightNet.toFixed(3)),
      'Fecha entrada': b.addedAt ? new Date(b.addedAt).toLocaleDateString('es-MX') : ''
    }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Ancho de columnas
  ws['!cols'] = [
    {wch:5},{wch:16},{wch:28},{wch:12},{wch:10},{wch:16},
    {wch:16},{wch:10},{wch:16},{wch:14}
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

  // Hoja de historial
  if (history.length > 0) {
    const hRows = history.map(h => ({
      'Tipo':    h.type === 'entrada' ? 'Entrada' : 'Salida',
      'Código':  h.code,
      'Nombre':  h.name || '',
      'Envase':  h.container || '',
      'Gabineta': SHELF_LABEL[h.shelf] || h.shelf || '',
      'Cantidad': h.qty || 1,
      'Peso Neto (g)': h.weightNet !== undefined ? parseFloat(h.weightNet.toFixed(3)) : '',
      'Fecha':   formatTime(h.timestamp)
    }));
    const wsH = XLSX.utils.json_to_sheet(hRows);
    wsH['!cols'] = [{wch:10},{wch:16},{wch:28},{wch:10},{wch:16},{wch:10},{wch:16},{wch:18}];
    XLSX.utils.book_append_sheet(wb, wsH, 'Historial');
  }

  const fecha = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `inventario_pisetas_${fecha}.xlsx`);
}

// ===== EXCEL: PLANTILLA =====
function downloadTemplate() {
  const ejemplo = [
    { 'Código':'F1178-250', 'Nombre':'Amarillo Oro', 'Color (hex)':'#f39c12', 'Envase':'blanco', 'Gabineta':'superior', 'Peso Bruto':282.50 },
    { 'Código':'M1146',     'Nombre':'Cobre Metálico','Color (hex)':'#b87333','Envase':'dorado', 'Gabineta':'medio',    'Peso Bruto':292.60 },
    { 'Código':'M7502',     'Nombre':'Rosa Nude',     'Color (hex)':'#e8b4b8','Envase':'blanco', 'Gabineta':'inferior', 'Peso Bruto':278.00 },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(ejemplo);
  ws['!cols'] = [{wch:16},{wch:28},{wch:12},{wch:10},{wch:12},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
  XLSX.writeFile(wb, 'plantilla_inventario.xlsx');
}

// ===== INIT =====
load().then(() => {
  loadTares();
  renderAll();
  updateStats();
});
