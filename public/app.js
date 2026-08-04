// ═══════════════════════════════════════════════════════════════════════════
// METRIC CONTAB v3.0 — Frontend Multiempresa (Fase 1 + Fase 2 + Fase 3 Integración POS)
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const API = '';
let TOKEN    = localStorage.getItem('mc_token');
let USER     = JSON.parse(localStorage.getItem('mc_user')||'null');
let EMPRESA  = JSON.parse(localStorage.getItem('mc_empresa')||'null');
let PERIODO  = JSON.parse(localStorage.getItem('mc_periodo')||'null');

// Cache de datos
let cuentas_cache   = [];
let periodos_cache  = [];
let cuentas_idx     = {};   // id → cuenta

// ─── API HELPER ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + '/api' + path, opts);
  const d = await r.json().catch(()=>({}));
  if (r.status === 401) {
    // Sesión expirada — limpiar y redirigir al login
    TOKEN=null; USER=null; EMPRESA=null; PERIODO=null;
    localStorage.removeItem('mc_token'); localStorage.removeItem('mc_user');
    localStorage.removeItem('mc_empresa'); localStorage.removeItem('mc_periodo');
    alert('⚠️ Tu sesión expiró. Por favor vuelve a iniciar sesión.');
    location.reload();
    return;
  }
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
}
const GET    = (p,q='') => api('GET', p + (q?'?'+q:''));
const POST   = (p,b)    => api('POST',p,b);
const PUT    = (p,b)    => api('PUT', p,b);
const DELETE = (p)      => api('DELETE',p);

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fL  = n => 'L. ' + (parseFloat(n)||0).toFixed(2);
const fN  = n => (parseFloat(n)||0).toFixed(2);
const today = () => { const d=new Date(); return new Date(d.getTime()-6*3600000).toISOString().split('T')[0]; };
const closeModal = id => document.getElementById(id).classList.remove('open');
const openModal  = id => document.getElementById(id).classList.add('open');

function eid() { return EMPRESA?.id || ''; }

function fmt(v){ return new Intl.NumberFormat('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(parseFloat(v)||0); }

const TIPO_LABELS = {activo:'Activo',pasivo:'Pasivo',capital:'Capital',ingreso:'Ingreso',costo:'Costo',gasto:'Gasto'};
const TIPO_COLORS = {activo:'ct-activo',pasivo:'ct-pasivo',capital:'ct-capital',ingreso:'ct-ingreso',costo:'ct-costo',gasto:'ct-gasto'};

// ─── NAV ─────────────────────────────────────────────────────────────────────
const NAV = [
  {view:'dashboard',  label:'📈 Dashboard',         roles:['superadmin','admin','contador','supervisor']},
  {view:'diario',     label:'📝 Diario General',     roles:['superadmin','admin','contador','supervisor']},
  {view:'mayor',      label:'📖 Mayor General',      roles:['superadmin','admin','contador','supervisor']},
  {view:'balcomp',    label:'⚖️ Bal. Comprobación',  roles:['superadmin','admin','contador','supervisor']},
  {view:'resultados', label:'📊 Estado Resultados',  roles:['superadmin','admin','contador','supervisor']},
  {view:'balgen',     label:'🏛️ Balance General',    roles:['superadmin','admin','contador','supervisor']},
  {view:'cuentas',    label:'📋 Plan de Cuentas',    roles:['superadmin','admin','contador']},
  {view:'periodos',   label:'📅 Períodos',           roles:['superadmin','admin','contador']},
  {view:'centros',    label:'🏷️ Centros de Costo',   roles:['superadmin','admin','contador']},
  {view:'empresas',   label:'🏢 Empresas',           roles:['superadmin','admin']},
  {view:'usuarios',   label:'👤 Usuarios',           roles:['superadmin','admin']},
  {view:'activos',    label:'🏭 Activos Fijos',       roles:['superadmin','admin','contador']},
  {view:'cierre',     label:'🔒 Cierre Contable',      roles:['superadmin','admin','contador']},
  {view:'reportes',    label:'📑 Reportes',            roles:['superadmin','admin','contador','supervisor']},
  {view:'sar',        label:'📋 Reportes SAR',         roles:['superadmin','admin','contador','supervisor']},
  {view:'config-sar', label:'⚙️ Config SAR',           roles:['superadmin','admin']},
  {view:'pos',        label:'🔗 Integración POS',     roles:['superadmin','admin','contador']},
];

let currentView = 'dashboard';
function buildNav() {
  const nav = document.getElementById('nav-menu');
  const items = NAV.filter(n => n.roles.includes(USER.rol));
  nav.innerHTML = items.map(n => `<button class="nav-item" data-view="${n.view}">${n.label}</button>`).join('');
  nav.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.view)));
}
function navigateTo(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(view+'-view');
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view===view));
  renderView(view);
}
function renderView(v) {
  switch(v) {
    case 'dashboard':  renderDashboard(); break;
    case 'cuentas':    renderCuentas(); break;
    case 'diario':     renderDiario(); break;
    case 'mayor':      renderMayor(); renderMayorCuentas(); break;
    case 'balcomp':    renderBalComp(); break;
    case 'resultados': renderEstadoResultados(); break;
    case 'balgen':     renderBalanceGeneral(); break;
    case 'periodos':   renderPeriodos(); break;
    case 'empresas':   renderEmpresas(); break;
    case 'usuarios':   renderUsuarios(); break;
    case 'centros':    renderCentros(); break;
    case 'activos':    renderActivos(); break;
    case 'cierre':     renderCierre(); break;
    case 'reportes':   renderReportes(); break;
    case 'sar':        renderSAR(); break;
    case 'config-sar': renderConfigSAR(); break;
    case 'pos':        renderPOS_Integracion(); break;
  }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-btn').onclick = doLogin;
  document.getElementById('login-pass').onkeydown = e => { if(e.key==='Enter') doLogin(); };
  document.getElementById('login-user').onkeydown = e => { if(e.key==='Enter') doLogin(); };
  setupForms();

  if (TOKEN && USER) {
    showApp();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }
});

async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';
  if (!username||!password) { errEl.textContent='Ingresa usuario y contraseña'; return; }
  try {
    const r = await POST('/auth/login',{username,password});
    TOKEN = r.token;
    USER  = r.user;
    localStorage.setItem('mc_token', TOKEN);
    localStorage.setItem('mc_user',  JSON.stringify(USER));
    // Si tiene empresas, seleccionar
    if (r.empresas && r.empresas.length > 0) {
      if (r.empresas.length === 1) {
        await seleccionarEmpresa(r.empresas[0]);
        showApp();
      } else {
        document.getElementById('login-screen').style.display = 'none';
        mostrarSelectorEmpresa(r.empresas);
      }
    } else {
      showApp();
    }
  } catch(e) {
    errEl.textContent = e.message || 'Error al iniciar sesión';
  }
}

function doLogout() {
  TOKEN=null; USER=null; EMPRESA=null; PERIODO=null;
  localStorage.removeItem('mc_token'); localStorage.removeItem('mc_user');
  localStorage.removeItem('mc_empresa'); localStorage.removeItem('mc_periodo');
  location.reload();
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'flex';
  document.getElementById('top-user').textContent = USER?.nombre || '';
  document.getElementById('top-role').textContent = USER?.rol || '';
  buildNav();
  if (EMPRESA) {
    actualizarTopbarEmpresa();
    cargarDatosEmpresa().then(() => navigateTo('dashboard'));
  } else {
    // Si no hay empresa seleccionada, traer lista y mostrar selector
    GET('/empresas').then(lista => {
      if (lista.length===1) seleccionarEmpresa(lista[0]).then(()=>{ actualizarTopbarEmpresa(); cargarDatosEmpresa().then(()=>navigateTo('dashboard')); });
      else if (lista.length>1) mostrarSelectorEmpresa(lista);
      else navigateTo('dashboard');
    });
  }
}

// ─── SELECTOR DE EMPRESA ──────────────────────────────────────────────────────
function mostrarSelectorEmpresa(empresas) {
  const lista = document.getElementById('empresa-lista');
  lista.innerHTML = empresas.map(e => `
    <div class="empresa-card ${EMPRESA?.id===e.id?'active':''}" onclick="elegirEmpresa('${e.id}')">
      <div style="font-weight:700;color:#1e3a5f">${e.nombre}</div>
      ${e.nombre_comercial?`<div style="font-size:12px;color:#64748b">${e.nombre_comercial}</div>`:''}
      <div style="font-size:11px;color:#94a3b8;font-family:monospace;margin-top:4px">RTN: ${e.rtn||'—'}</div>
    </div>
  `).join('');
  openModal('empresa-modal');
  // Guardar lista para uso posterior
  window._empresasLista = empresas;
}

async function elegirEmpresa(id) {
  await cambiarEmpresa(id);
}

/**
 * Cambio de empresa dinámico — SIN window.location.reload()
 * Actualiza localStorage, recarga cachés y refresca la vista activa.
 */
async function cambiarEmpresa(empresaId) {
  if (!empresaId) return;
  // 1. Obtener datos de la empresa
  const lista = window._empresasLista || await GET('/empresas');
  window._empresasLista = lista;
  const e = lista.find(x=>x.id===empresaId);
  if (!e) return alert('Empresa no encontrada.');
  // 2. Cerrar modal si estaba abierto
  closeModal('empresa-modal');
  // 3. Persistir en localStorage
  EMPRESA = e;
  PERIODO = null;
  localStorage.setItem('mc_empresa', JSON.stringify(e));
  localStorage.removeItem('mc_periodo');
  // 4. Actualizar topbar inmediatamente
  actualizarTopbarEmpresa();
  // 5. Recargar todos los datos de la empresa nueva
  await cargarDatosEmpresa();
  // 6. Redirigir al dashboard con datos frescos
  navigateTo('dashboard');
  // 7. Marcar empresa activa en el selector visual
  document.querySelectorAll('.empresa-card').forEach(card => {
    card.classList.toggle('active', card.getAttribute('onclick')?.includes(empresaId));
  });
}

async function seleccionarEmpresa(e) {
  EMPRESA = e;
  localStorage.setItem('mc_empresa', JSON.stringify(e));
  PERIODO = null;
  localStorage.removeItem('mc_periodo');
}

function abrirSelectorEmpresa() {
  GET('/empresas').then(lista => {
    window._empresasLista = lista;
    mostrarSelectorEmpresa(lista);
  });
}

function actualizarTopbarEmpresa() {
  if (!EMPRESA) return;
  document.getElementById('top-empresa-nombre').textContent = EMPRESA.nombre_comercial || EMPRESA.nombre;
  document.getElementById('top-empresa-rtn').textContent = EMPRESA.rtn ? 'RTN: '+EMPRESA.rtn : '';
  document.getElementById('empresa-topbar').style.display = 'flex';
}

async function cargarDatosEmpresa() {
  if (!eid()) return;
  try {
    [cuentas_cache, periodos_cache] = await Promise.all([
      GET(`/empresas/${eid()}/cuentas`),
      GET(`/empresas/${eid()}/periodos`),
    ]);
    cuentas_idx = {};
    cuentas_cache.forEach(c => cuentas_idx[c.id] = c);
    // Período activo por defecto: el más reciente abierto
    if (!PERIODO) {
      const abierto = periodos_cache.find(p=>p.estado==='abierto');
      if (abierto) { PERIODO=abierto; localStorage.setItem('mc_periodo',JSON.stringify(abierto)); }
    }
    actualizarTopbarPeriodo();
  } catch(e) { console.error('cargarDatosEmpresa:', e.message); }
}

function actualizarTopbarPeriodo() {
  const pb = document.getElementById('periodo-topbar');
  const badge = document.getElementById('top-periodo-badge');
  if (PERIODO) {
    pb.style.display = 'block';
    badge.textContent = PERIODO.nombre;
    badge.className = 'periodo-badge' + (PERIODO.estado==='cerrado'?' cerrado':'');
  } else {
    pb.style.display = 'none';
  }
}

function poblarSelectPeriodos(selectId, onchangeFn) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = periodos_cache.map(p =>
    `<option value="${p.id}" ${PERIODO?.id===p.id?'selected':''}>${p.nombre}${p.estado==='cerrado'?' (cerrado)':''}</option>`
  ).join('');
  if (prev) sel.value = prev;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  if (!eid()) { document.getElementById('dash-kpis').innerHTML='<div style="color:#94a3b8">Selecciona una empresa primero.</div>'; return; }
  document.getElementById('dash-empresa-sub').textContent = EMPRESA?.nombre || '';
  poblarSelectPeriodos('dash-periodo');
  document.getElementById('dash-periodo-sel').style.display = 'flex';

  const pid = document.getElementById('dash-periodo').value || PERIODO?.id || '';
  if (!pid) return;

  try {
    const [result,asientos] = await Promise.all([
      GET(`/empresas/${eid()}/estado_resultados`, `periodo_id=${pid}`),
      GET(`/empresas/${eid()}/asientos`, `periodo_id=${pid}&limite=6`),
    ]);

    // KPIs
    const tot = result.totales;
    document.getElementById('dash-kpis').innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Ingresos</div><div class="kpi-val" style="color:#15803d">${fL(tot.ingresos)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Costos</div><div class="kpi-val" style="color:#d97706">${fL(tot.costos)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Gastos</div><div class="kpi-val" style="color:#dc2626">${fL(tot.gastos)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Utilidad Bruta</div><div class="kpi-val" style="color:${tot.utilidad_bruta>=0?'#15803d':'#dc2626'}">${fL(tot.utilidad_bruta)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Utilidad Neta</div><div class="kpi-val" style="color:${tot.utilidad_neta>=0?'#15803d':'#dc2626'}">${fL(tot.utilidad_neta)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Asientos</div><div class="kpi-val">${asientos.length}</div></div>
    `;

    // PyG resumen
    document.getElementById('dash-pyg-body').innerHTML = `
      <div class="reporte-fila"><span>Ingresos totales</span><span class="reporte-monto" style="color:#15803d">${fL(tot.ingresos)}</span></div>
      <div class="reporte-fila"><span>(-) Costos de ventas</span><span class="reporte-monto" style="color:#d97706">(${fL(tot.costos)})</span></div>
      <div class="reporte-fila total"><span>= Utilidad Bruta</span><span class="reporte-monto">${fL(tot.utilidad_bruta)}</span></div>
      <div class="reporte-fila"><span>(-) Gastos operativos</span><span class="reporte-monto" style="color:#dc2626">(${fL(tot.gastos)})</span></div>
      <div class="reporte-fila total ${tot.utilidad_neta>=0?'utilidad-pos':'utilidad-neg'}">
        <span>= Utilidad Neta</span><span class="reporte-monto">${fL(tot.utilidad_neta)}</span>
      </div>
    `;

    // Últimos asientos
    document.getElementById('dash-ultimos-body').innerHTML = asientos.length
      ? asientos.map(a => `
        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
          <div>
            <span style="font-family:monospace;font-weight:700;color:#2563eb">#${a.numero}</span>
            <span style="color:#64748b;margin-left:8px">${a.fecha}</span>
            <div style="color:#1e293b;margin-top:2px">${a.concepto}</div>
          </div>
          <span class="badge ${a.estado==='contabilizado'?'badge-green':a.estado==='anulado'?'badge-red':'badge-amber'}">${a.estado}</span>
        </div>`).join('')
      : '<div style="color:#94a3b8;font-size:13px">Sin asientos en este período</div>';
  } catch(e) { console.error('Dashboard:', e.message); }
}

// ─── PLAN DE CUENTAS ──────────────────────────────────────────────────────────
async function renderCuentas() {
  if (!eid()) return;
  const q    = (document.getElementById('cuentas-search')||{}).value?.toLowerCase()||'';
  const tipo = (document.getElementById('cuentas-tipo-filter')||{}).value||'';
  cuentas_cache = await GET(`/empresas/${eid()}/cuentas`);
  cuentas_idx = {};
  cuentas_cache.forEach(c => cuentas_idx[c.id] = c);

  let f = cuentas_cache.filter(c =>
    (!q || c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q)) &&
    (!tipo || c.tipo===tipo)
  );

  document.getElementById('cuentas-body').innerHTML = f.map(c => `
    <div class="cuenta-row cuenta-nivel-${Math.min(c.nivel,3)}">
      <span class="cuenta-codigo">${c.codigo}</span>
      <span class="cuenta-nombre" style="font-weight:${c.nivel<=2?700:400}">${c.nombre}</span>
      <span class="cuenta-tipo ${TIPO_COLORS[c.tipo]}">${TIPO_LABELS[c.tipo]}</span>
      <span class="${c.naturaleza==='deudora'?'ct-deudora':'ct-acreedora'}">${c.naturaleza}</span>
      ${c.permite_movimiento?'<span class="badge badge-gray" style="font-size:10px">Mov.</span>':'<span style="font-size:10px;color:#94a3b8">Grupo</span>'}
      ${c.nivel>=3?`<button class="action-btn edit" title="Editar" onclick="editarCuenta('${c.id}')">✏️</button>`:''}
    </div>
  `).join('') || '<div style="padding:20px;color:#94a3b8;text-align:center">Sin cuentas encontradas</div>';

  // Poblar select de padre en el modal
  const padre = document.getElementById('c-padre');
  if (padre) {
    padre.innerHTML = '<option value="">— Sin padre (cuenta raíz) —</option>' +
      cuentas_cache.filter(c=>!c.permite_movimiento||c.nivel<3).map(c =>
        `<option value="${c.id}">${c.codigo} — ${c.nombre}</option>`).join('');
  }
}

function editarCuenta(id) {
  const c = cuentas_cache.find(x=>x.id===id);
  if (!c) return;
  document.getElementById('c-codigo').value = c.codigo;
  document.getElementById('c-codigo').readOnly = true;
  document.getElementById('c-nombre').value = c.nombre;
  document.getElementById('c-tipo').value = c.tipo;
  document.getElementById('c-naturaleza').value = c.naturaleza;
  document.getElementById('c-nivel').value = c.nivel;
  document.getElementById('c-padre').value = c.padre_id||'';
  document.getElementById('c-permite-mov').checked = !!c.permite_movimiento;
  document.getElementById('c-codigo').dataset.editId = id;
  openModal('cuenta-modal');
}

// ─── DIARIO GENERAL ───────────────────────────────────────────────────────────
async function renderDiario() {
  if (!eid()) return;
  poblarSelectPeriodos('diario-periodo');
  const pid    = document.getElementById('diario-periodo').value || PERIODO?.id || '';
  const estado = document.getElementById('diario-estado').value || '';
  if (PERIODO) {
    const periodo = periodos_cache.find(p=>p.id===pid);
    document.getElementById('diario-subtitle').textContent =
      `Período: ${periodo?.nombre||'—'} — Estado: ${periodo?.estado||'—'}`;
  }

  const params = (pid?`periodo_id=${pid}&`:'') + (estado?`estado=${estado}&`:'') + 'limite=300';
  const asientos = await GET(`/empresas/${eid()}/asientos`, params);

  const tbody = document.getElementById('diario-body');
  if (!asientos.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">Sin asientos en este período</td></tr>`;
    return;
  }
  tbody.innerHTML = asientos.map(a => {
    const stColor = a.estado==='contabilizado'?'badge-green':a.estado==='anulado'?'badge-red':'badge-amber';
    return `<tr>
      <td style="font-family:monospace;font-weight:700;color:#2563eb">#${a.numero}</td>
      <td>${a.fecha}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.concepto}</td>
      <td style="font-family:monospace;font-size:12px;color:#64748b">${a.referencia||'—'}</td>
      <td><span class="badge badge-blue">${a.tipo}</span></td>
      <td style="font-family:monospace;font-weight:600">—</td>
      <td><span class="badge ${stColor}">${a.estado}</span></td>
      <td style="white-space:nowrap">
        <button class="action-btn edit" onclick="verAsiento('${a.id}')" title="Ver">👁️</button>
        ${a.estado==='borrador'?`
          <button class="action-btn" style="background:#eff6ff;color:#2563eb" onclick="editarAsiento('${a.id}')" title="Modificar">✏️</button>
          <button class="action-btn" style="background:#f0fdf4;color:#15803d" onclick="contabilizarAsiento('${a.id}')" title="Contabilizar">✅</button>
          <button class="action-btn delete" onclick="eliminarAsiento('${a.id}','${a.numero}')" title="Eliminar">🗑️</button>
        `:''}
        ${a.estado==='contabilizado'?`<button class="action-btn delete" onclick="anularAsiento('${a.id}')" title="Anular">🚫</button>`:''}
      </td>
    </tr>`;
  }).join('');
}

async function verAsiento(id) {
  try {
    const a = await GET(`/empresas/${eid()}/asientos/${id}`);
    document.getElementById('ver-asiento-titulo').textContent = `Asiento N° ${a.numero} — ${a.concepto}`;
    const totalDebe  = a.partidas.reduce((s,p)=>s+(parseFloat(p.debe)||0),0);
    const totalHaber = a.partidas.reduce((s,p)=>s+(parseFloat(p.haber)||0),0);
    document.getElementById('ver-asiento-body').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;font-size:13px">
        <div><span style="color:#64748b">Fecha:</span> <strong>${a.fecha}</strong></div>
        <div><span style="color:#64748b">Período:</span> <strong>${a.periodo_nombre||'—'}</strong></div>
        <div><span style="color:#64748b">Tipo:</span> <strong>${a.tipo}</strong></div>
        <div><span style="color:#64748b">Referencia:</span> ${a.referencia||'—'}</div>
        <div><span style="color:#64748b">Usuario:</span> ${a.usuario_nombre||'—'}</div>
        <div><span style="color:#64748b">Estado:</span>
          <span class="badge ${a.estado==='contabilizado'?'badge-green':a.estado==='anulado'?'badge-red':'badge-amber'}">${a.estado}</span>
        </div>
      </div>
      <table class="partidas-table" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:12px">
        <thead><tr><th>Cuenta</th><th>Descripción</th><th style="text-align:right">Debe</th><th style="text-align:right">Haber</th></tr></thead>
        <tbody>
          ${a.partidas.map(p=>`<tr>
            <td style="font-family:monospace;font-size:12px">${p.cuenta_codigo} — ${p.cuenta_nombre}</td>
            <td style="font-size:12px;color:#64748b">${p.descripcion||''}</td>
            <td style="text-align:right;font-weight:${p.debe>0?'600':'400'};color:${p.debe>0?'#1d4ed8':'#94a3b8'}">${p.debe>0?fL(p.debe):'—'}</td>
            <td style="text-align:right;font-weight:${p.haber>0?'600':'400'};color:${p.haber>0?'#dc2626':'#94a3b8'}">${p.haber>0?fL(p.haber):'—'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr>
          <td colspan="2" style="text-align:right;font-weight:700;background:#f8fafc;padding:8px 10px">TOTALES</td>
          <td style="text-align:right;font-weight:700;color:#1d4ed8;background:#f8fafc;padding:8px 10px">${fL(totalDebe)}</td>
          <td style="text-align:right;font-weight:700;color:#dc2626;background:#f8fafc;padding:8px 10px">${fL(totalHaber)}</td>
        </tr></tfoot>
      </table>
      ${a.estado==='borrador'?`<div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-primary" style="background:#059669" onclick="contabilizarAsiento('${id}');closeModal('ver-asiento-modal')">✅ Contabilizar</button>
        <button class="btn-cancel" style="background:#fef2f2;color:#dc2626;border-color:#fecaca" onclick="anularAsiento('${id}');closeModal('ver-asiento-modal')">🚫 Anular</button>
      </div>`:''}
    `;
    openModal('ver-asiento-modal');
  } catch(e) { alert('Error: '+e.message); }
}

async function contabilizarAsiento(id) {
  if (!confirm('¿Contabilizar este asiento? No se podrá editar después.')) return;
  try {
    await PUT(`/empresas/${eid()}/asientos/${id}/contabilizar`);
    renderDiario();
  } catch(e) { alert(e.message); }
}

async function anularAsiento(id) {
  if (!confirm('¿Anular este asiento?')) return;
  try {
    await PUT(`/empresas/${eid()}/asientos/${id}/anular`);
    renderDiario();
  } catch(e) { alert(e.message); }
}

// ─── NUEVO ASIENTO ────────────────────────────────────────────────────────────
let partidas_rows = [];

function initAsientoModal() {
  document.getElementById('a-fecha').value = today();
  document.getElementById('a-tipo').value  = 'manual';
  document.getElementById('a-ref').value   = '';
  document.getElementById('a-concepto').value = '';
  partidas_rows = [];
  addPartida(); addPartida(); // empezar con 2 líneas
  renderPartidasTable();
}

function addPartida() {
  partidas_rows.push({cuenta_id:'',descripcion:'',debe:'',haber:'',centro_costo:''});
  renderPartidasTable();
}

function renderPartidasTable() {
  const tbody = document.getElementById('partidas-body');
  tbody.innerHTML = partidas_rows.map((p,i) => `
    <tr>
      <td>
        <select onchange="partidas_rows[${i}].cuenta_id=this.value" style="border:1px solid #e2e8f0;border-radius:6px;padding:5px 6px;font-size:11px;font-family:monospace;width:100%;outline:none">
          <option value="">— Seleccionar —</option>
          ${cuentas_cache.filter(c=>c.permite_movimiento&&c.activa).map(c=>
            `<option value="${c.id}" ${p.cuenta_id===c.id?'selected':''}>${c.codigo} — ${c.nombre}</option>`).join('')}
        </select>
      </td>
      <td><input type="text" value="${p.descripcion||''}" placeholder="Descripción..."
        oninput="partidas_rows[${i}].descripcion=this.value"
        style="border:1px solid #e2e8f0;border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit;width:100%;outline:none"></td>
      <td><input type="number" step="0.01" min="0" value="${p.debe||''}" placeholder="0.00"
        oninput="partidas_rows[${i}].debe=this.value;if(this.value&&parseFloat(this.value)>0)partidas_rows[${i}].haber='';actualizarTotales()"
        style="border:1px solid #e2e8f0;border-radius:6px;padding:5px 8px;font-size:12px;font-family:monospace;width:100%;text-align:right;outline:none"></td>
      <td><input type="number" step="0.01" min="0" value="${p.haber||''}" placeholder="0.00"
        oninput="partidas_rows[${i}].haber=this.value;if(this.value&&parseFloat(this.value)>0)partidas_rows[${i}].debe='';actualizarTotales()"
        style="border:1px solid #e2e8f0;border-radius:6px;padding:5px 8px;font-size:12px;font-family:monospace;width:100%;text-align:right;outline:none"></td>
      <td><button type="button" onclick="eliminarPartida(${i})"
        style="background:#fef2f2;color:#dc2626;border:none;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:13px">✕</button></td>
    </tr>
  `).join('');
  actualizarTotales();
}

function eliminarPartida(i) {
  if (partidas_rows.length<=2) { alert('Mínimo 2 partidas'); return; }
  partidas_rows.splice(i,1);
  renderPartidasTable();
}

function actualizarTotales() {
  const debe  = partidas_rows.reduce((s,p)=>s+(parseFloat(p.debe)||0),0);
  const haber = partidas_rows.reduce((s,p)=>s+(parseFloat(p.haber)||0),0);
  const diff  = Math.abs(debe-haber);
  const ok    = diff < 0.01;
  document.getElementById('total-debe').textContent  = fL(debe);
  document.getElementById('total-haber').textContent = fL(haber);
  document.getElementById('total-debe').className    = ok?'cuadre-ok':'cuadre-mal';
  document.getElementById('total-haber').className   = ok?'cuadre-ok':'cuadre-mal';
  document.getElementById('cuadre-status').innerHTML = ok
    ? `<span class="cuadre-ok">✓ Partida doble cuadra correctamente</span>`
    : `<span class="cuadre-mal">⚠ Diferencia: L. ${diff.toFixed(2)} — Debe = Haber para continuar</span>`;
}

async function guardarAsiento(contabilizar) {
  const fecha    = document.getElementById('a-fecha').value;
  const concepto = document.getElementById('a-concepto').value.trim();
  const tipo     = document.getElementById('a-tipo').value;
  const ref      = document.getElementById('a-ref').value.trim();
  if (!fecha||!concepto) { alert('Fecha y concepto son requeridos'); return; }

  // Leer valores actuales del DOM
  const inputs = document.getElementById('partidas-body').querySelectorAll('tr');
  inputs.forEach((tr,i) => {
    const sels = tr.querySelectorAll('select,input');
    if (partidas_rows[i]) {
      partidas_rows[i].cuenta_id   = sels[0].value;
      partidas_rows[i].descripcion = sels[1].value;
      partidas_rows[i].debe        = sels[2].value;
      partidas_rows[i].haber       = sels[3].value;
    }
  });

  const partidas = partidas_rows.filter(p=>p.cuenta_id).map(p=>({
    cuenta_id: p.cuenta_id,
    descripcion: p.descripcion||'',
    debe: parseFloat(p.debe)||0,
    haber: parseFloat(p.haber)||0,
    centro_costo: p.centro_costo||'',
  }));

  if (partidas.length<2) { alert('Agrega al menos 2 partidas con cuenta seleccionada'); return; }
  const debe  = partidas.reduce((s,p)=>s+p.debe,0);
  const haber = partidas.reduce((s,p)=>s+p.haber,0);
  if (Math.abs(debe-haber)>0.01) { alert(`La partida doble no cuadra.\nDebe: L. ${debe.toFixed(2)}\nHaber: L. ${haber.toFixed(2)}`); return; }

  try {
    const r = await POST(`/empresas/${eid()}/asientos`,{fecha,concepto,referencia:ref,tipo,partidas});
    if (contabilizar) await PUT(`/empresas/${eid()}/asientos/${r.id}/contabilizar`);
    closeModal('asiento-modal');
    renderDiario();
    alert(`Asiento N° ${r.numero} guardado${contabilizar?' y contabilizado':' como borrador'}`);
  } catch(e) { alert('Error: '+e.message); }
}

// ─── MAYOR GENERAL ────────────────────────────────────────────────────────────
let _mayorCuentaSelId = null;

function renderMayorCuentas() {
  const q = (document.getElementById('mayor-cuenta-search')||{}).value?.toLowerCase()||'';
  const lista = document.getElementById('mayor-cuentas-lista');
  const f = cuentas_cache.filter(c => c.permite_movimiento && c.activa &&
    (!q || c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q)));
  lista.innerHTML = f.map(c => `
    <div class="cuenta-row ${_mayorCuentaSelId===c.id?'activa':''}" onclick="seleccionarCuentaMayor('${c.id}')">
      <span class="cuenta-codigo" style="font-size:11px">${c.codigo}</span>
      <span style="font-size:12px;flex:1">${c.nombre}</span>
    </div>
  `).join('') || '<div style="padding:12px;color:#94a3b8;font-size:12px">Sin cuentas</div>';

  poblarSelectPeriodos('mayor-periodo');
}

async function seleccionarCuentaMayor(id) {
  _mayorCuentaSelId = id;
  renderMayorCuentas();
  document.getElementById('mayor-filtros').style.display = 'flex';
  await renderMayor();
}

async function renderMayor() {
  if (!_mayorCuentaSelId||!eid()) return;
  const pid = document.getElementById('mayor-periodo').value || PERIODO?.id || '';
  try {
    const data = await GET(`/empresas/${eid()}/mayor`, `cuenta_id=${_mayorCuentaSelId}&periodo_id=${pid}`);
    const c = data.cuenta;
    const body = document.getElementById('mayor-body');
    if (!data.partidas.length) {
      body.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8">Sin movimientos para esta cuenta en el período seleccionado</div>`;
      return;
    }
    body.innerHTML = `
      <div style="padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:20px;align-items:center">
        <div><span class="cuenta-codigo">${c.codigo}</span> <strong>${c.nombre}</strong></div>
        <span class="cuenta-tipo ${TIPO_COLORS[c.tipo]}">${TIPO_LABELS[c.tipo]}</span>
        <span class="${c.naturaleza==='deudora'?'ct-deudora':'ct-acreedora'}">${c.naturaleza}</span>
      </div>
      <table class="mayor-tabla">
        <thead><tr><th>N° Asiento</th><th>Fecha</th><th>Concepto</th><th>Referencia</th><th style="text-align:right">Debe</th><th style="text-align:right">Haber</th><th style="text-align:right">Saldo</th></tr></thead>
        <tbody>
          ${data.partidas.map(p=>`<tr>
            <td style="font-family:monospace;font-weight:700;color:#2563eb">#${p.numero}</td>
            <td>${p.fecha}</td>
            <td>${p.concepto}</td>
            <td style="font-family:monospace;font-size:11px;color:#64748b">${p.referencia||'—'}</td>
            <td style="text-align:right;color:${p.debe>0?'#1d4ed8':'#94a3b8'};font-weight:${p.debe>0?'600':'400'}">${p.debe>0?fL(p.debe):'—'}</td>
            <td style="text-align:right;color:${p.haber>0?'#dc2626':'#94a3b8'};font-weight:${p.haber>0?'600':'400'}">${p.haber>0?fL(p.haber):'—'}</td>
            <td style="text-align:right;font-weight:700" class="${p.saldo>=0?'saldo-deudor':'saldo-acreedor'}">${fL(Math.abs(p.saldo))} ${p.saldo>=0?'D':'A'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr style="background:#f8fafc">
          <td colspan="4" style="text-align:right;font-weight:700;padding:8px 12px;font-size:12px">TOTALES</td>
          <td style="text-align:right;font-weight:700;color:#1d4ed8;padding:8px 12px">${fL(data.total_debe)}</td>
          <td style="text-align:right;font-weight:700;color:#dc2626;padding:8px 12px">${fL(data.total_haber)}</td>
          <td style="text-align:right;font-weight:700;padding:8px 12px" class="${(data.total_debe-data.total_haber)>=0?'saldo-deudor':'saldo-acreedor'}">${fL(Math.abs(data.total_debe-data.total_haber))}</td>
        </tr></tfoot>
      </table>
    `;
  } catch(e) { document.getElementById('mayor-body').innerHTML = `<div style="padding:20px;color:#dc2626">${e.message}</div>`; }
}

// ─── BALANCE DE COMPROBACIÓN ──────────────────────────────────────────────────
async function renderBalComp() {
  if (!eid()) return;
  poblarSelectPeriodos('balcomp-periodo');
  const pid = document.getElementById('balcomp-periodo').value || PERIODO?.id || '';
  try {
    const data = await GET(`/empresas/${eid()}/balance_comprobacion`, pid?`periodo_id=${pid}`:'');
    let tdebe=0,thaber=0,tdeud=0,tacre=0;
    document.getElementById('balcomp-body').innerHTML = data.map(f => {
      tdebe+=parseFloat(f.total_debe)||0; thaber+=parseFloat(f.total_haber)||0;
      tdeud+=parseFloat(f.saldo_deudor)||0; tacre+=parseFloat(f.saldo_acreedor)||0;
      return `<tr>
        <td style="font-family:monospace;font-weight:600">${f.codigo}</td>
        <td>${f.nombre}</td>
        <td><span class="cuenta-tipo ${TIPO_COLORS[f.tipo]}">${TIPO_LABELS[f.tipo]}</span></td>
        <td style="text-align:right;font-family:monospace">${fL(f.total_debe)}</td>
        <td style="text-align:right;font-family:monospace">${fL(f.total_haber)}</td>
        <td style="text-align:right;font-family:monospace;color:#1d4ed8">${f.saldo_deudor>0?fL(f.saldo_deudor):'—'}</td>
        <td style="text-align:right;font-family:monospace;color:#dc2626">${f.saldo_acreedor>0?fL(f.saldo_acreedor):'—'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8">Sin movimientos contabilizados</td></tr>';

    document.getElementById('balcomp-foot').innerHTML = `<tr style="background:#1e3a5f;color:#fff">
      <td colspan="3" style="padding:10px 14px;font-weight:700;font-size:12px">TOTALES</td>
      <td style="text-align:right;font-family:monospace;padding:10px 14px;font-weight:700">${fL(tdebe)}</td>
      <td style="text-align:right;font-family:monospace;padding:10px 14px;font-weight:700">${fL(thaber)}</td>
      <td style="text-align:right;font-family:monospace;padding:10px 14px;font-weight:700">${fL(tdeud)}</td>
      <td style="text-align:right;font-family:monospace;padding:10px 14px;font-weight:700">${fL(tacre)}</td>
    </tr>
    <tr style="background:#f0fdf4">
      <td colspan="7" style="text-align:center;padding:8px;font-size:12px;font-weight:700;color:${Math.abs(tdeud-tacre)<0.01?'#15803d':'#dc2626'}">
        ${Math.abs(tdeud-tacre)<0.01?'✓ Balance correcto — Saldos Deudores = Saldos Acreedores':'⚠ Diferencia: L. '+(Math.abs(tdeud-tacre).toFixed(2))+' — Revisar asientos'}
      </td>
    </tr>`;
  } catch(e) { console.error(e); }
}

// ─── ESTADO DE RESULTADOS ─────────────────────────────────────────────────────
async function renderEstadoResultados() {
  if (!eid()) return;
  poblarSelectPeriodos('result-periodo');
  const pid = document.getElementById('result-periodo').value || PERIODO?.id || '';
  try {
    const data = await GET(`/empresas/${eid()}/estado_resultados`, pid?`periodo_id=${pid}`:'');
    const {totales:t, detalle:d} = data;
    const seccion = (titulo,items,color) => `
      <div class="reporte-seccion">
        <div class="reporte-titulo">${titulo}</div>
        ${items.map(f=>`<div class="reporte-fila" style="padding-left:${f.codigo?.split('.').length>2?'16px':'0'}">
          <span style="font-size:12px">${f.codigo} — ${f.nombre}</span>
          <span class="reporte-monto" style="color:${color}">${fL(f.monto)}</span>
        </div>`).join('')}
      </div>`;
    document.getElementById('resultados-body').innerHTML = `
      <div class="reporte-contable">
        <div style="background:#1e3a5f;color:#fff;padding:14px 20px;text-align:center">
          <div style="font-size:16px;font-weight:700">${EMPRESA?.nombre||''}</div>
          <div style="font-size:13px;margin-top:2px">Estado de Resultados</div>
          <div style="font-size:11px;opacity:.8;margin-top:2px">${periodos_cache.find(p=>p.id===pid)?.nombre||''}</div>
        </div>
        ${seccion('INGRESOS',d.ingreso,'#15803d')}
        <div class="reporte-seccion">
          <div class="reporte-fila total"><span>Total Ingresos</span><span class="reporte-monto" style="color:#15803d">${fL(t.ingresos)}</span></div>
        </div>
        ${seccion('COSTOS',d.costo,'#d97706')}
        <div class="reporte-seccion">
          <div class="reporte-fila total"><span>Utilidad Bruta</span><span class="reporte-monto">${fL(t.utilidad_bruta)}</span></div>
        </div>
        ${seccion('GASTOS',d.gasto,'#7c3aed')}
        <div class="reporte-seccion">
          <div class="reporte-fila total ${t.utilidad_neta>=0?'utilidad-pos':'utilidad-neg'}">
            <span>UTILIDAD NETA DEL PERÍODO</span>
            <span class="reporte-monto" style="font-size:16px">${fL(t.utilidad_neta)}</span>
          </div>
        </div>
      </div>`;
  } catch(e) { console.error(e); }
}

// ─── BALANCE GENERAL ──────────────────────────────────────────────────────────
async function renderBalanceGeneral() {
  if (!eid()) return;
  poblarSelectPeriodos('balgen-periodo');
  const pid = document.getElementById('balgen-periodo').value || PERIODO?.id || '';
  try {
    const data = await GET(`/empresas/${eid()}/balance_general`, pid?`periodo_id=${pid}`:'');
    const {totales:t, detalle:d} = data;
    const grupo = (titulo, items, color) => `
      <div class="reporte-seccion">
        <div class="reporte-titulo">${titulo}</div>
        ${items.map(f=>`<div class="reporte-fila">
          <span style="font-size:12px">${f.codigo} — ${f.nombre}</span>
          <span class="reporte-monto" style="color:${color}">${fL(f.monto)}</span>
        </div>`).join('')}
      </div>`;
    document.getElementById('balgen-body').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="reporte-contable">
          <div style="background:#1e3a5f;color:#fff;padding:14px 20px;text-align:center;font-weight:700">ACTIVO</div>
          ${grupo('ACTIVO',d.activo,'#1d4ed8')}
          <div class="reporte-seccion">
            <div class="reporte-fila total"><span>TOTAL ACTIVO</span><span class="reporte-monto">${fL(t.activo)}</span></div>
          </div>
        </div>
        <div class="reporte-contable">
          <div style="background:#1e3a5f;color:#fff;padding:14px 20px;text-align:center;font-weight:700">PASIVO + CAPITAL</div>
          ${grupo('PASIVO',d.pasivo,'#dc2626')}
          ${grupo('CAPITAL',d.capital,'#15803d')}
          <div class="reporte-seccion">
            <div class="reporte-fila total"><span>TOTAL PASIVO + CAPITAL</span><span class="reporte-monto">${fL(t.pasivo_capital)}</span></div>
          </div>
        </div>
      </div>
      <div style="margin-top:12px;padding:12px 16px;border-radius:10px;text-align:center;font-weight:700;font-size:13px;${Math.abs(t.activo-t.pasivo_capital)<0.01?'background:#f0fdf4;color:#15803d':'background:#fef2f2;color:#dc2626'}">
        ${Math.abs(t.activo-t.pasivo_capital)<0.01?'✓ Balance cuadra — Activo = Pasivo + Capital':'⚠ Diferencia: L. '+Math.abs(t.activo-t.pasivo_capital).toFixed(2)}
      </div>`;
  } catch(e) { console.error(e); }
}

// ─── PERÍODOS ─────────────────────────────────────────────────────────────────
async function renderPeriodos() {
  if (!eid()) return;
  periodos_cache = await GET(`/empresas/${eid()}/periodos`);
  document.getElementById('periodos-body').innerHTML = periodos_cache.map(p => `
    <tr>
      <td style="font-weight:700">${p.nombre}</td>
      <td>${p.anio}</td>
      <td>${['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][p.mes]}</td>
      <td><span class="badge ${p.estado==='abierto'?'badge-green':'badge-red'}">${p.estado}</span></td>
      <td style="font-size:12px;color:#64748b">${p.fecha_cierre||'—'}</td>
      <td style="white-space:nowrap">
        ${p.estado==='abierto'
          ?`<button class="btn-primary" style="font-size:11px;padding:4px 10px;background:#dc2626" onclick="cerrarPeriodo('${p.id}','${p.nombre}')">Cerrar</button>
            <button class="btn-primary" style="font-size:11px;padding:4px 10px;background:#059669;margin-left:4px" onclick="usarPeriodo(${JSON.stringify(p).replace(/"/g,'&quot;')})">Usar</button>`
          :`<button class="btn-cancel" style="font-size:11px;padding:4px 10px" onclick="reabrirPeriodo('${p.id}','${p.nombre}')">Reabrir</button>`}
      </td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8">Sin períodos</td></tr>';
}

function usarPeriodo(p) {
  PERIODO = p;
  localStorage.setItem('mc_periodo', JSON.stringify(p));
  actualizarTopbarPeriodo();
  alert(`Período activo: ${p.nombre}`);
}

async function cerrarPeriodo(id, nombre) {
  if (!confirm(`¿Cerrar el período "${nombre}"? No se podrán crear asientos en él.`)) return;
  try { await PUT(`/empresas/${eid()}/periodos/${id}/cerrar`); renderPeriodos(); } catch(e) { alert(e.message); }
}
async function reabrirPeriodo(id, nombre) {
  if (!confirm(`¿Reabrir el período "${nombre}"?`)) return;
  try { await PUT(`/empresas/${eid()}/periodos/${id}/abrir`); renderPeriodos(); } catch(e) { alert(e.message); }
}

// ─── EMPRESAS ─────────────────────────────────────────────────────────────────
async function renderEmpresas() {
  const data = await GET('/empresas');
  document.getElementById('empresas-body').innerHTML = data.map(e => `
    <tr>
      <td>
        <div style="font-weight:700">${e.nombre}</div>
        ${e.nombre_comercial?`<div style="font-size:11px;color:#64748b">${e.nombre_comercial}</div>`:''}
      </td>
      <td style="font-family:monospace;font-size:12px">${e.rtn||'—'}</td>
      <td style="font-size:12px;color:#64748b">${e.direccion||'—'}</td>
      <td><span class="badge badge-blue">${e.regimen||'mercantil'}</span></td>
      <td><span class="badge ${e.activa?'badge-green':'badge-red'}">${e.activa?'Activa':'Inactiva'}</span></td>
      <td style="white-space:nowrap">
        <button class="action-btn edit" onclick="editarEmpresa('${e.id}')" title="Editar">✏️</button>
        <button class="btn-primary" style="font-size:11px;padding:4px 10px;margin-left:4px;background:#059669" onclick="activarEmpresa('${e.id}')">Seleccionar</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8">Sin empresas</td></tr>';
}

async function activarEmpresa(id) {
  const lista = await GET('/empresas');
  window._empresasLista = lista;
  await elegirEmpresa(id);
}

async function editarEmpresa(id) {
  const data = await GET('/empresas');
  const e = data.find(x=>x.id===id);
  if (!e) return;
  document.getElementById('ef-id').value        = e.id;
  document.getElementById('ef-nombre').value    = e.nombre;
  document.getElementById('ef-comercial').value = e.nombre_comercial||'';
  document.getElementById('ef-rtn').value       = e.rtn||'';
  document.getElementById('ef-regimen').value   = e.regimen||'mercantil';
  document.getElementById('ef-direccion').value = e.direccion||'';
  document.getElementById('ef-telefono').value  = e.telefono||'';
  document.getElementById('ef-email').value     = e.email||'';
  document.getElementById('empresa-form-titulo').textContent = 'Editar Empresa';
  openModal('empresa-form-modal');
}

// ─── USUARIOS ─────────────────────────────────────────────────────────────────
async function renderUsuarios() {
  const data = await GET('/usuarios');
  document.getElementById('usuarios-body').innerHTML = data.map(u => `
    <tr>
      <td style="font-weight:600">${u.nombre}</td>
      <td style="font-family:monospace;font-size:12px">${u.username}</td>
      <td><span class="badge badge-blue">${u.rol}</span></td>
      <td><span class="badge ${u.activo?'badge-green':'badge-red'}">${u.activo?'Activo':'Inactivo'}</span></td>
      <td><button class="action-btn edit" onclick="editarUsuario('${u.id}','${u.nombre}','${u.username}','${u.rol}',${u.activo})">✏️</button></td>
    </tr>`).join('');
}

function editarUsuario(id,nombre,username,rol,activo) {
  document.getElementById('u-id').value       = id;
  document.getElementById('u-nombre').value   = nombre;
  document.getElementById('u-username').value = username;
  document.getElementById('u-username').readOnly = true;
  document.getElementById('u-password').value = '';
  document.getElementById('u-rol').value      = rol;
  document.getElementById('user-modal-titulo').textContent = 'Editar Usuario';
  openModal('usuario-modal');
}

// ─── CENTROS DE COSTO ─────────────────────────────────────────────────────────
async function renderCentros() {
  if (!eid()) return;
  const data = await GET(`/empresas/${eid()}/centros`);
  document.getElementById('centros-body').innerHTML = data.map(c => `
    <tr>
      <td style="font-family:monospace;font-weight:700">${c.codigo}</td>
      <td>${c.nombre}</td>
      <td><span class="badge badge-green">Activo</span></td>
    </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;padding:20px;color:#94a3b8">Sin centros de costo</td></tr>';
}

// ─── EXPORTAR EXCEL ───────────────────────────────────────────────────────────
async function exportarBalCompExcel() {
  const pid = document.getElementById('balcomp-periodo')?.value || PERIODO?.id || '';
  const data = await GET(`/empresas/${eid()}/balance_comprobacion`, pid?`periodo_id=${pid}`:'');
  const rows = [['Código','Cuenta','Tipo','Total Debe','Total Haber','Saldo Deudor','Saldo Acreedor']];
  data.forEach(f => rows.push([f.codigo,f.nombre,f.tipo,parseFloat(f.total_debe)||0,parseFloat(f.total_haber)||0,parseFloat(f.saldo_deudor)||0,parseFloat(f.saldo_acreedor)||0]));
  xlsxDownload(rows, 'Balance_Comprobacion');
}
async function exportarResultadosExcel() {
  const pid = document.getElementById('result-periodo')?.value || PERIODO?.id || '';
  const data = await GET(`/empresas/${eid()}/estado_resultados`, pid?`periodo_id=${pid}`:'');
  const rows = [['Tipo','Código','Cuenta','Monto']];
  for (const tipo of ['ingreso','costo','gasto']) data.detalle[tipo]?.forEach(f=>rows.push([tipo,f.codigo,f.nombre,parseFloat(f.monto)||0]));
  rows.push(['','','UTILIDAD NETA',parseFloat(data.totales.utilidad_neta)||0]);
  xlsxDownload(rows,'Estado_Resultados');
}
async function exportarBalGenExcel() {
  const pid = document.getElementById('balgen-periodo')?.value || PERIODO?.id || '';
  const data = await GET(`/empresas/${eid()}/balance_general`, pid?`periodo_id=${pid}`:'');
  const rows = [['Tipo','Código','Cuenta','Monto']];
  for (const tipo of ['activo','pasivo','capital']) data.detalle[tipo]?.forEach(f=>rows.push([tipo,f.codigo,f.nombre,parseFloat(f.monto)||0]));
  xlsxDownload(rows,'Balance_General');
}
async function exportarMayorExcel() {
  const pid = document.getElementById('mayor-periodo')?.value || PERIODO?.id || '';
  if (!_mayorCuentaSelId) return;
  const data = await GET(`/empresas/${eid()}/mayor`, `cuenta_id=${_mayorCuentaSelId}&periodo_id=${pid}`);
  const rows = [['N° Asiento','Fecha','Concepto','Referencia','Debe','Haber','Saldo']];
  data.partidas.forEach(p=>rows.push([p.numero,p.fecha,p.concepto,p.referencia,parseFloat(p.debe)||0,parseFloat(p.haber)||0,parseFloat(p.saldo)||0]));
  xlsxDownload(rows,'Mayor_General');
}
function xlsxDownload(rows, nombre) {
  if (typeof XLSX==='undefined') { alert('Librería Excel no disponible'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map((h,i)=>({wch:Math.max(h.length+2,rows.reduce((m,r)=>Math.max(m,String(r[i]||'').length),0)+2)}));
  XLSX.utils.book_append_sheet(wb,ws,'Datos');
  XLSX.writeFile(wb, nombre+'_'+new Date().toISOString().substring(0,10).replace(/-/g,'')+'.xlsx');
}

// ─── IMPRIMIR REPORTES ────────────────────────────────────────────────────────
function imprimirBalComp()     { _imprimir('balcomp-body', 'Balance de Comprobación'); }
function imprimirResultados()  { _imprimir('resultados-body', 'Estado de Resultados'); }
function imprimirBalGen()      { _imprimir('balgen-body', 'Balance General'); }
function imprimirMayor()       { _imprimir('mayor-body', 'Mayor General'); }
function _imprimir(id, titulo) {
  const html = document.getElementById(id)?.innerHTML || '';
  const w = window.open('','_blank','width=900,height=700,scrollbars=yes');
  if (!w) { alert('Permite las ventanas emergentes'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title>
    <style>*{box-sizing:border-box;font-family:Arial,sans-serif;font-size:12px}body{padding:20px}
    table{width:100%;border-collapse:collapse}th{background:#1e3a5f;color:#fff;padding:7px 10px;text-align:left}
    td{padding:6px 10px;border-bottom:1px solid #f1f5f9}.total{font-weight:700;border-top:2px solid #e2e8f0}
    @media print{@page{size:letter;margin:10mm}}</style></head><body>
    <h2 style="color:#1e3a5f;text-align:center">${EMPRESA?.nombre||''}</h2>
    <h3 style="text-align:center;color:#64748b">${titulo}</h3>${html}
    <script>window.print();<\/script></body></html>`);
  w.document.close();
}

// ─── SETUP FORMS ─────────────────────────────────────────────────────────────
function setupForms() {
  // Cuenta
  document.getElementById('cuenta-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const editId = document.getElementById('c-codigo').dataset.editId;
      const body = {
        codigo: document.getElementById('c-codigo').value.trim(),
        nombre: document.getElementById('c-nombre').value.trim(),
        tipo: document.getElementById('c-tipo').value,
        naturaleza: document.getElementById('c-naturaleza').value,
        nivel: parseInt(document.getElementById('c-nivel').value),
        padre_id: document.getElementById('c-padre').value || null,
        permite_movimiento: document.getElementById('c-permite-mov').checked,
      };
      if (editId) await PUT(`/empresas/${eid()}/cuentas/${editId}`, {nombre:body.nombre,permite_movimiento:body.permite_movimiento,activa:true});
      else await POST(`/empresas/${eid()}/cuentas`, body);
      closeModal('cuenta-modal');
      document.getElementById('c-codigo').readOnly = false;
      document.getElementById('c-codigo').dataset.editId = '';
      await cargarDatosEmpresa();
      renderCuentas();
    } catch(e2) { alert(e2.message); }
  });

  // Período
  document.getElementById('periodo-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await POST(`/empresas/${eid()}/periodos`, {
        anio: parseInt(document.getElementById('p-anio').value),
        mes:  parseInt(document.getElementById('p-mes').value),
      });
      closeModal('periodo-modal');
      periodos_cache = await GET(`/empresas/${eid()}/periodos`);
      renderPeriodos();
    } catch(e2) { alert(e2.message); }
  });

  // Empresa
  document.getElementById('empresa-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const id = document.getElementById('ef-id').value;
      const body = {
        nombre:          document.getElementById('ef-nombre').value.trim(),
        nombre_comercial:document.getElementById('ef-comercial').value.trim(),
        rtn:             document.getElementById('ef-rtn').value.trim(),
        regimen:         document.getElementById('ef-regimen').value,
        direccion:       document.getElementById('ef-direccion').value.trim(),
        telefono:        document.getElementById('ef-telefono').value.trim(),
        email:           document.getElementById('ef-email').value.trim(),
      };
      if (id) await PUT(`/empresas/${id}`, body);
      else await POST('/empresas', body);
      closeModal('empresa-form-modal');
      document.getElementById('ef-id').value = '';
      document.getElementById('empresa-form-titulo').textContent = 'Nueva Empresa';
      renderEmpresas();
    } catch(e2) { alert(e2.message); }
  });

  // Usuario
  document.getElementById('usuario-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const id = document.getElementById('u-id').value;
      const body = {
        nombre:   document.getElementById('u-nombre').value.trim(),
        username: document.getElementById('u-username').value.trim(),
        password: document.getElementById('u-password').value,
        rol:      document.getElementById('u-rol').value,
        activo:   1,
      };
      if (id) await PUT(`/usuarios/${id}`, body);
      else await POST('/usuarios', body);
      closeModal('usuario-modal');
      document.getElementById('u-id').value = '';
      document.getElementById('u-username').readOnly = false;
      document.getElementById('user-modal-titulo').textContent = 'Nuevo Usuario';
      renderUsuarios();
    } catch(e2) { alert(e2.message); }
  });

  // Centro de costo
  document.getElementById('centro-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await POST(`/empresas/${eid()}/centros`, {
        codigo: document.getElementById('cc-codigo').value.trim(),
        nombre: document.getElementById('cc-nombre').value.trim(),
      });
      closeModal('centro-modal');
      document.getElementById('centro-form').reset();
      renderCentros();
    } catch(e2) { alert(e2.message); }
  });

  // Inicializar fecha del período
  const hoy = today();
  const anioEl = document.getElementById('p-anio');
  const mesEl  = document.getElementById('p-mes');
  if (anioEl) anioEl.value = hoy.substring(0,4);
  if (mesEl)  mesEl.value  = parseInt(hoy.substring(5,7));
}

// ════════════════════════════════════════════════════════════════════════════
// FASE 2 — ACTIVOS FIJOS
// ════════════════════════════════════════════════════════════════════════════

const CAT_LABELS = {
  edificio:'Edificio', equipo_computo:'Equipo Cómputo',
  mobiliario:'Mobiliario', vehiculo:'Vehículo',
  maquinaria:'Maquinaria', otro:'Otro'
};
const CAT_COLORS = {
  edificio:'badge-blue', equipo_computo:'badge-blue',
  mobiliario:'badge-amber', vehiculo:'badge-green',
  maquinaria:'badge-gray', otro:'badge-gray'
};

async function renderActivos() {
  if (!eid()) return;
  const activos = await GET(`/empresas/${eid()}/activos`);

  // KPIs
  const totalCompra = activos.reduce((s,a)=>s+(parseFloat(a.valor_compra)||0),0);
  const totalDep    = activos.reduce((s,a)=>s+(parseFloat(a.dep_acumulada)||0),0);
  const totalNeto   = activos.reduce((s,a)=>s+(parseFloat(a.valor_neto)||0),0);
  document.getElementById('activos-kpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Total Activos</div><div class="kpi-val">${activos.length}</div></div>
    <div class="kpi-card"><div class="kpi-label">Valor de Compra</div><div class="kpi-val" style="font-size:18px;color:#1d4ed8">${fL(totalCompra)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Dep. Acumulada</div><div class="kpi-val" style="font-size:18px;color:#dc2626">${fL(totalDep)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Valor Neto Libros</div><div class="kpi-val" style="font-size:18px;color:#15803d">${fL(totalNeto)}</div></div>
  `;

  const tbody = document.getElementById('activos-body');
  if (!activos.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:#94a3b8">Sin activos fijos registrados</td></tr>`;
    return;
  }
  tbody.innerHTML = activos.map(a => {
    const pctDep = a.valor_compra > 0 ? ((parseFloat(a.dep_acumulada)||0)/(parseFloat(a.valor_compra)||1)*100).toFixed(1) : '0.0';
    return `<tr>
      <td style="font-family:monospace;font-weight:700;color:#2563eb">${a.codigo}</td>
      <td style="font-weight:600">${a.nombre}</td>
      <td><span class="badge ${CAT_COLORS[a.categoria]||'badge-gray'}">${CAT_LABELS[a.categoria]||a.categoria}</span></td>
      <td style="font-size:12px;color:#64748b">${a.metodo==='linea_recta'?'Línea Recta':'Saldo Decr.'} / ${a.vida_util_anios}a</td>
      <td style="text-align:right;font-family:monospace">${fL(a.valor_compra)}</td>
      <td style="text-align:right;font-family:monospace;color:#dc2626">${fL(a.dep_acumulada)} <span style="font-size:10px;color:#94a3b8">(${pctDep}%)</span></td>
      <td style="text-align:right;font-family:monospace;font-weight:700;color:#15803d">${fL(a.valor_neto)}</td>
      <td><span class="badge ${a.estado==='activo'?'badge-green':a.estado==='vendido'?'badge-amber':'badge-red'}">${a.estado}</span></td>
      <td style="white-space:nowrap">
        <button class="action-btn edit" onclick="editarActivo('${a.id}')" title="Editar">✏️</button>
        <button class="action-btn" style="background:#eff6ff;color:#2563eb" onclick="verDepHistorial('${a.id}','${a.nombre}')" title="Historial dep.">📊</button>
      </td>
    </tr>`;
  }).join('');
}

function initActivoModal() {
  document.getElementById('af-id').value = '';
  document.getElementById('af-codigo').readOnly = false;
  document.getElementById('activo-modal-titulo').textContent = 'Nuevo Activo Fijo';
  document.getElementById('activo-form').reset();
  document.getElementById('af-fecha-compra').value = today();
  document.getElementById('af-fecha-inicio-dep').value = today();
  _poblarCuentasActivo();
}

function _poblarCuentasActivo() {
  const todasCuentas = cuentas_cache.filter(c=>c.permite_movimiento && c.activa);
  const cActivo    = todasCuentas.filter(c=>c.tipo==='activo');
  const cGasto     = todasCuentas.filter(c=>c.tipo==='gasto');
  const opts = ctas => '<option value="">— Seleccionar —</option>' +
    ctas.map(c=>`<option value="${c.id}">${c.codigo} — ${c.nombre}</option>`).join('');
  document.getElementById('af-cta-activo').innerHTML    = opts(cActivo);
  document.getElementById('af-cta-dep-acum').innerHTML  = opts(cActivo);
  document.getElementById('af-cta-gasto-dep').innerHTML = opts(cGasto);
  // Preseleccionar cuentas comunes
  const dep1206 = cuentas_cache.find(c=>c.codigo==='1.2.06');
  const dep1207 = cuentas_cache.find(c=>c.codigo==='1.2.07');
  const gas6107 = cuentas_cache.find(c=>c.codigo==='6.1.07');
  if (dep1207) document.getElementById('af-cta-dep-acum').value = dep1207.id;
  if (gas6107) document.getElementById('af-cta-gasto-dep').value = gas6107.id;
}

async function editarActivo(id) {
  const activos = await GET(`/empresas/${eid()}/activos`);
  const a = activos.find(x=>x.id===id);
  if (!a) return;
  document.getElementById('af-id').value             = a.id;
  document.getElementById('af-codigo').value         = a.codigo;
  document.getElementById('af-codigo').readOnly      = true;
  document.getElementById('af-nombre').value         = a.nombre;
  document.getElementById('af-categoria').value      = a.categoria;
  document.getElementById('af-valor-compra').value   = a.valor_compra;
  document.getElementById('af-valor-residual').value = a.valor_residual;
  document.getElementById('af-vida-util').value      = a.vida_util_anios;
  document.getElementById('af-metodo').value         = a.metodo;
  document.getElementById('af-fecha-compra').value   = a.fecha_compra;
  document.getElementById('af-fecha-inicio-dep').value = a.fecha_inicio_dep||a.fecha_compra;
  document.getElementById('activo-modal-titulo').textContent = 'Editar Activo Fijo';
  _poblarCuentasActivo();
  if (a.cuenta_activo_id)   document.getElementById('af-cta-activo').value    = a.cuenta_activo_id;
  if (a.cuenta_dep_acum_id) document.getElementById('af-cta-dep-acum').value  = a.cuenta_dep_acum_id;
  if (a.cuenta_gasto_dep_id)document.getElementById('af-cta-gasto-dep').value = a.cuenta_gasto_dep_id;
  openModal('activo-modal');
}

async function verDepHistorial(activoId, nombre) {
  document.getElementById('dep-historial-titulo').textContent = `Depreciaciones — ${nombre}`;
  try {
    const data = await GET(`/empresas/${eid()}/activos/${activoId}/depreciaciones`);
    document.getElementById('dep-historial-body').innerHTML = data.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f8fafc">
            <th style="padding:8px 12px;text-align:left;border-bottom:1px solid #e2e8f0">Período</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0">Monto</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0">Dep. Acum.</th>
          </tr></thead>
          <tbody>
            ${data.map(d=>`<tr style="border-bottom:1px solid #f1f5f9">
              <td style="padding:8px 12px">${d.periodo_nombre}</td>
              <td style="padding:8px 12px;text-align:right;font-family:monospace;color:#dc2626">${fL(d.monto)}</td>
              <td style="padding:8px 12px;text-align:right;font-family:monospace">${fL(d.dep_acum_al_periodo)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr style="background:#f8fafc;font-weight:700">
            <td style="padding:8px 12px">Total</td>
            <td style="padding:8px 12px;text-align:right;font-family:monospace;color:#dc2626">${fL(data.reduce((s,d)=>s+(parseFloat(d.monto)||0),0))}</td>
            <td></td>
          </tr></tfoot>
        </table>`
      : '<div style="text-align:center;padding:20px;color:#94a3b8">Sin depreciaciones registradas</div>';
    openModal('dep-historial-modal');
  } catch(e) { alert(e.message); }
}

function openDepreciarModal() {
  const sel = document.getElementById('dep-periodo-sel');
  sel.innerHTML = periodos_cache.filter(p=>p.estado==='abierto').map(p=>
    `<option value="${p.id}">${p.nombre}</option>`).join('');
  document.getElementById('dep-resultado').style.display = 'none';
  openModal('depreciar-modal');
}

async function ejecutarDepreciacion() {
  const pid      = document.getElementById('dep-periodo-sel').value;
  const genAsiento = document.getElementById('dep-generar-asiento').checked;
  if (!pid) { alert('Selecciona un período'); return; }
  try {
    const r = await POST(`/empresas/${eid()}/activos/depreciar`, {periodo_id:pid, generar_asiento:genAsiento});
    const resEl = document.getElementById('dep-resultado');
    resEl.style.display = 'block';
    resEl.style.background = '#f0fdf4';
    resEl.style.borderColor = '#bbf7d0';
    resEl.innerHTML = `
      <div style="font-weight:700;color:#15803d;margin-bottom:6px">✅ Depreciación ejecutada</div>
      <div style="font-size:12px;color:#475569">Total depreciado: <strong>${fL(r.total)}</strong></div>
      <div style="font-size:12px;color:#475569">Activos procesados: <strong>${r.procesados}</strong></div>
      ${r.asiento_id?`<div style="font-size:12px;color:#2563eb;margin-top:4px">Asiento contable generado automáticamente ✓</div>`:''}
    `;
    renderActivos();
  } catch(e) {
    const resEl = document.getElementById('dep-resultado');
    resEl.style.display = 'block';
    resEl.style.background = '#fef2f2';
    resEl.style.borderColor = '#fecaca';
    resEl.innerHTML = `<div style="color:#dc2626;font-weight:600">❌ ${e.message}</div>`;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FASE 2 — CIERRE CONTABLE
// ════════════════════════════════════════════════════════════════════════════

async function renderCierre() {
  if (!eid()) return;
  // Poblar selector de períodos abiertos
  const sel = document.getElementById('cierre-periodo-sel');
  const abiertos = periodos_cache.filter(p=>p.estado==='abierto');
  sel.innerHTML = abiertos.length
    ? abiertos.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('')
    : '<option value="">Sin períodos abiertos</option>';

  // Cargar historial de cierres
  await renderHistorialCierres();
  document.getElementById('cierre-preview').style.display = 'none';
}

async function renderHistorialCierres() {
  try {
    const cierres = await GET(`/empresas/${eid()}/cierres`);
    const lista = document.getElementById('cierres-lista');
    if (!cierres.length) {
      lista.innerHTML = '<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px">Sin cierres registrados</div>';
      return;
    }
    lista.innerHTML = cierres.map(c => `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700;font-size:13px">${c.periodo_nombre}</div>
            <div style="font-size:11px;color:#64748b">${c.tipo} · ${c.creado?.substring(0,10)||''} · ${c.usuario_nombre||'—'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:monospace;font-weight:700;color:${(parseFloat(c.utilidad_neta)||0)>=0?'#15803d':'#dc2626'}">${fL(c.utilidad_neta)}</div>
            <div style="font-size:10px;color:#94a3b8">Utilidad Neta</div>
          </div>
        </div>
      </div>`).join('');
  } catch(e) { console.error(e); }
}

async function previewCierre() {
  const pid = document.getElementById('cierre-periodo-sel').value;
  if (!pid) { alert('Selecciona un período'); return; }
  try {
    const data = await GET(`/empresas/${eid()}/estado_resultados`, `periodo_id=${pid}`);
    const t = data.totales;
    const prev = document.getElementById('cierre-preview');
    prev.style.display = 'block';
    document.getElementById('cierre-preview-body').innerHTML = `
      <div style="font-size:12px;display:flex;flex-direction:column;gap:4px">
        <div style="display:flex;justify-content:space-between"><span>Ingresos</span><span style="font-family:monospace;color:#15803d">${fL(t.ingresos)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>(-) Costos</span><span style="font-family:monospace;color:#d97706">(${fL(t.costos)})</span></div>
        <div style="display:flex;justify-content:space-between"><span>(-) Gastos</span><span style="font-family:monospace;color:#7c3aed">(${fL(t.gastos)})</span></div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:6px;font-weight:700">
          <span>Utilidad Neta</span>
          <span style="font-family:monospace;color:${t.utilidad_neta>=0?'#15803d':'#dc2626'}">${fL(t.utilidad_neta)}</span>
        </div>
      </div>`;
  } catch(e) { alert(e.message); }
}

async function ejecutarCierre() {
  const pid  = document.getElementById('cierre-periodo-sel').value;
  const tipo = document.getElementById('cierre-tipo').value;
  if (!pid) { alert('Selecciona un período'); return; }
  const periodo = periodos_cache.find(p=>p.id===pid);
  if (!confirm(`¿Ejecutar cierre ${tipo} del período "${periodo?.nombre}"?\n\nEsta acción generará el asiento de cierre automático y cerrará el período. No se podrá deshacer.`)) return;
  try {
    const r = await POST(`/empresas/${eid()}/cierre`, {periodo_id:pid, tipo});
    alert(`✅ Cierre ejecutado exitosamente\n\nAsiento de cierre N° ${r.asiento_num}\nUtilidad Neta: ${fL(r.utilidad_neta)}\nIngresos: ${fL(r.ingresos)}\nCostos: ${fL(r.costos)}\nGastos: ${fL(r.gastos)}`);
    periodos_cache = await GET(`/empresas/${eid()}/periodos`);
    actualizarTopbarPeriodo();
    renderCierre();
  } catch(e) { alert('Error: ' + e.message); }
}

// ════════════════════════════════════════════════════════════════════════════
// FASE 2 — REPORTES SAR
// ════════════════════════════════════════════════════════════════════════════

async function renderSAR() {
  if (!eid()) return;
  poblarSelectPeriodos('sar-periodo');
  // Poblar años disponibles
  const anios = [...new Set(periodos_cache.map(p=>p.anio))].sort((a,b)=>b-a);
  const selAnio = document.getElementById('sar-anio');
  selAnio.innerHTML = '<option value="">Todos los años</option>' +
    anios.map(a=>`<option value="${a}">${a}</option>`).join('');
}

async function reporteLibroVentas() {
  const pid = document.getElementById('sar-periodo').value || PERIODO?.id || '';
  try {
    const data = await GET(`/empresas/${eid()}/reportes/libro_ventas`, pid?`periodo_id=${pid}`:'');
    const periodo = periodos_cache.find(p=>p.id===pid);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Libro de Ventas ISV</title>
      <style>*{font-family:Arial,sans-serif;font-size:11px}body{padding:20px}
      h2,h3{color:#1e3a5f;text-align:center}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:left}
      td{padding:6px 8px;border-bottom:1px solid #f1f5f9}
      .total{background:#f0fdf4;font-weight:bold}
      @media print{@page{size:letter landscape;margin:10mm}}</style>
      </head><body>
      <h2>${EMPRESA?.nombre||''}</h2>
      <h3>Libro de Ventas ISV — ${periodo?.nombre||'Todos los períodos'}</h3>
      <table><thead><tr><th>N° Asiento</th><th>Fecha</th><th>Concepto</th><th>Referencia</th>
        <th>Cuenta</th><th style="text-align:right">Debe</th><th style="text-align:right">Haber</th></tr></thead>
      <tbody>
        ${data.movimientos.map(m=>`<tr>
          <td style="font-family:monospace">#${m.numero}</td><td>${m.fecha}</td>
          <td>${m.concepto}</td><td style="font-family:monospace">${m.referencia||'—'}</td>
          <td>${m.cta_codigo} — ${m.cta_nombre}</td>
          <td style="text-align:right">${m.debe>0?fL(m.debe):'—'}</td>
          <td style="text-align:right">${m.haber>0?fL(m.haber):'—'}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr class="total">
        <td colspan="4">RESUMEN TOTAL</td>
        <td>ISV 15%: ${fL(data.resumen.isv15)} | ISV 18%: ${fL(data.resumen.isv18)}</td>
        <td colspan="2" style="text-align:right;font-weight:bold">TOTAL ISV: ${fL(data.resumen.total)}</td>
      </tr></tfoot></table>
      <script>window.print();<\/script></body></html>`;
    const w=window.open('','_blank','width=900,height=700');
    if(w){w.document.write(html);w.document.close();}
  } catch(e) { alert(e.message); }
}

async function reporteLibroVentasExcel() {
  const pid = document.getElementById('sar-periodo').value || PERIODO?.id || '';
  try {
    const data = await GET(`/empresas/${eid()}/reportes/libro_ventas`, pid?`periodo_id=${pid}`:'');
    const rows = [['N° Asiento','Fecha','Concepto','Referencia','Cuenta','Debe','Haber']];
    data.movimientos.forEach(m=>rows.push([m.numero,m.fecha,m.concepto,m.referencia||'',
      m.cta_codigo+' — '+m.cta_nombre,parseFloat(m.debe)||0,parseFloat(m.haber)||0]));
    rows.push([]);
    rows.push(['','','','','ISV 15%',data.resumen.isv15,'']);
    rows.push(['','','','','ISV 18%',data.resumen.isv18,'']);
    rows.push(['','','','','TOTAL ISV',data.resumen.total,'']);
    xlsxDownload(rows,'Libro_Ventas_ISV');
  } catch(e) { alert(e.message); }
}

async function reporteLibroCompras() {
  const pid = document.getElementById('sar-periodo').value || PERIODO?.id || '';
  try {
    const periodo = periodos_cache.find(p=>p.id===pid);
    let params = '';
    if (pid && periodo) {
      params = `mes=${periodo.mes}&anio=${periodo.anio}`;
    }
    const data = await GET(`/empresas/${eid()}/compras`, params);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Libro de Compras ISV</title>
      <style>*{font-family:Arial,sans-serif;font-size:11px}body{padding:20px}
      h2,h3{color:#1e3a5f;text-align:center}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:left}
      td{padding:6px 8px;border-bottom:1px solid #f1f5f9}
      .total{background:#f0fdf4;font-weight:bold}
      @media print{@page{size:letter landscape;margin:10mm}}</style>
      </head><body>
      <h2>${EMPRESA?.nombre||''}</h2>
      <h3>Libro de Compras ISV — ${periodo?.nombre||'Todos los períodos'}</h3>
      <table><thead><tr>
        <th>Fecha</th><th>RTN Proveedor</th><th>Nombre / Razón Social</th>
        <th>No. Documento</th><th style="text-align:right">Monto Total</th>
        <th style="text-align:right">Cps. Exentas</th>
        <th style="text-align:right">Base 15%</th><th style="text-align:right">ISV 15%</th>
        <th style="text-align:right">Base 18%</th><th style="text-align:right">ISV 18%</th>
      </tr></thead>
      <tbody>
        ${data.filas.map(f=>`<tr>
          <td>${f.fecha}</td>
          <td style="font-family:monospace">${f.proveedor_rtn||'—'}</td>
          <td>${f.proveedor_nombre}</td>
          <td style="font-family:monospace">${f.numero_documento||'—'}</td>
          <td style="text-align:right">${fL(f.monto_total)}</td>
          <td style="text-align:right">${fL(f.compras_exentas)}</td>
          <td style="text-align:right">${fL(f.base_gravada_15)}</td>
          <td style="text-align:right">${fL(f.isv_15)}</td>
          <td style="text-align:right">${fL(f.base_gravada_18)}</td>
          <td style="text-align:right">${fL(f.isv_18)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr class="total">
        <td colspan="4">TOTALES</td>
        <td style="text-align:right">${fL(data.totales.monto_total)}</td>
        <td style="text-align:right">${fL(data.totales.compras_exentas)}</td>
        <td style="text-align:right">${fL(data.totales.base_gravada_15)}</td>
        <td style="text-align:right">${fL(data.totales.isv_15)}</td>
        <td style="text-align:right">${fL(data.totales.base_gravada_18)}</td>
        <td style="text-align:right">${fL(data.totales.isv_18)}</td>
      </tr></tfoot></table>
      <script>window.print();<\/script></body></html>`;
    const w=window.open('','_blank','width=1100,height=700');
    if(w){w.document.write(html);w.document.close();}
  } catch(e) { alert(e.message); }
}

async function reporteLibroComprasExcel() {
  const pid = document.getElementById('sar-periodo').value || PERIODO?.id || '';
  try {
    const periodo = periodos_cache.find(p=>p.id===pid);
    let params = '';
    if (pid && periodo) {
      params = `mes=${periodo.mes}&anio=${periodo.anio}`;
    }
    const data = await GET(`/empresas/${eid()}/compras`, params);
    const rows = [['Fecha','RTN Proveedor','Nombre / Razon Social','No. Documento',
      'Monto Total','Cps. Exentas','Base 15%','ISV 15%','Base 18%','ISV 18%']];
    data.filas.forEach(f=>rows.push([
      f.fecha, f.proveedor_rtn||'', f.proveedor_nombre, f.numero_documento||'',
      parseFloat(f.monto_total)||0, parseFloat(f.compras_exentas)||0,
      parseFloat(f.base_gravada_15)||0, parseFloat(f.isv_15)||0,
      parseFloat(f.base_gravada_18)||0, parseFloat(f.isv_18)||0
    ]));
    rows.push([]);
    rows.push(['','','','','Monto Total',data.totales.monto_total,'','','','']);
    rows.push(['','','','','Cps. Exentas',data.totales.compras_exentas,'','','','']);
    rows.push(['','','','','Base 15%',data.totales.base_gravada_15,'ISV 15%',data.totales.isv_15,'','']);
    rows.push(['','','','','Base 18%',data.totales.base_gravada_18,'ISV 18%',data.totales.isv_18,'','']);
    xlsxDownload(rows,'Libro_Compras_ISV');
  } catch(e) { alert(e.message); }
}

async function reporteSarPyG() {
  const anio = document.getElementById('sar-anio').value || '';
  try {
    const data = await GET(`/empresas/${eid()}/reportes/sar_pyg`, anio?`anio=${anio}`:'');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>PyG SAR Honduras</title>
      <style>*{font-family:Arial,sans-serif;font-size:11px}body{padding:20px}
      h2,h3{color:#1e3a5f;text-align:center}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:right}
      th:first-child{text-align:left}
      td{padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;font-family:monospace}
      td:first-child{text-align:left;font-family:Arial}
      .total-row{background:#1e3a5f;color:#fff;font-weight:bold}
      @media print{@page{size:letter landscape;margin:10mm}}</style>
      </head><body>
      <h2>${EMPRESA?.nombre||''}</h2>
      <h3>Estado de PyG Mensual para SAR — ${data.anio}</h3>
      <table><thead><tr><th>Período</th><th>Ingresos</th><th>Costos</th><th>Gastos</th><th>Utilidad Neta</th></tr></thead>
      <tbody>
        ${data.periodos.map(p=>`<tr>
          <td>${p.periodo}</td>
          <td>${fL(p.ingresos)}</td>
          <td>(${fL(p.costos)})</td>
          <td>(${fL(p.gastos)})</td>
          <td style="color:${p.utilidad>=0?'#15803d':'#dc2626'};font-weight:bold">${fL(p.utilidad)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr class="total-row">
        <td>TOTALES</td>
        <td>${fL(data.totales.ingresos)}</td>
        <td>(${fL(data.totales.costos)})</td>
        <td>(${fL(data.totales.gastos)})</td>
        <td>${fL(data.totales.utilidad)}</td>
      </tr></tfoot></table>
      <script>window.print();<\/script></body></html>`;
    const w=window.open('','_blank','width=900,height=700');
    if(w){w.document.write(html);w.document.close();}
  } catch(e) { alert(e.message); }
}

async function reporteSarPyGExcel() {
  const anio = document.getElementById('sar-anio').value || '';
  try {
    const data = await GET(`/empresas/${eid()}/reportes/sar_pyg`, anio?`anio=${anio}`:'');
    const rows = [['Período','Ingresos','Costos','Gastos','Utilidad Neta']];
    data.periodos.forEach(p=>rows.push([p.periodo,p.ingresos,p.costos,p.gastos,p.utilidad]));
    rows.push(['TOTALES',data.totales.ingresos,data.totales.costos,data.totales.gastos,data.totales.utilidad]);
    xlsxDownload(rows,'SAR_PyG_Mensual');
  } catch(e) { alert(e.message); }
}

async function reporteActivosSAR() {
  try {
    const data = await GET(`/empresas/${eid()}/reportes/activos_fijos`);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Activos Fijos SAR</title>
      <style>*{font-family:Arial,sans-serif;font-size:10px}body{padding:20px}
      h2,h3{color:#1e3a5f;text-align:center}
      table{width:100%;border-collapse:collapse;margin-top:12px;margin-bottom:20px}
      th{background:#1e3a5f;color:#fff;padding:5px 7px;text-align:left}
      td{padding:5px 7px;border-bottom:1px solid #f1f5f9}
      .seccion{background:#f8fafc;font-weight:bold;font-size:11px}
      .total-row{background:#e2e8f0;font-weight:bold}
      @media print{@page{size:letter landscape;margin:10mm}}</style>
      </head><body>
      <h2>${EMPRESA?.nombre||''}</h2>
      <h3>Reporte de Activos Fijos — SAR Honduras</h3>
      <table><thead><tr>
        <th>Código</th><th>Nombre</th><th>Categoría</th><th>Método</th>
        <th>V. Útil</th><th>F. Compra</th>
        <th style="text-align:right">Valor Compra</th>
        <th style="text-align:right">Dep. Acumulada</th>
        <th style="text-align:right">Valor Neto</th>
        <th>Estado</th>
      </tr></thead><tbody>
        ${Object.entries(data.por_categoria).map(([cat,info])=>`
          <tr class="seccion"><td colspan="10">${CAT_LABELS[cat]||cat}</td></tr>
          ${info.activos.map(a=>`<tr>
            <td style="font-family:monospace">${a.codigo}</td>
            <td>${a.nombre}</td>
            <td>${CAT_LABELS[a.categoria]||a.categoria}</td>
            <td>${a.metodo==='linea_recta'?'L. Recta':'S. Decr.'}</td>
            <td style="text-align:center">${a.vida_util_anios}a</td>
            <td>${a.fecha_compra}</td>
            <td style="text-align:right;font-family:monospace">${fL(a.valor_compra)}</td>
            <td style="text-align:right;font-family:monospace;color:#dc2626">${fL(a.dep_acumulada)}</td>
            <td style="text-align:right;font-family:monospace;font-weight:bold;color:#15803d">${fL(a.valor_neto)}</td>
            <td>${a.estado}</td>
          </tr>`).join('')}
          <tr class="total-row">
            <td colspan="6" style="text-align:right">Subtotal ${CAT_LABELS[cat]||cat}</td>
            <td style="text-align:right;font-family:monospace">${fL(info.t_compra)}</td>
            <td style="text-align:right;font-family:monospace">${fL(info.t_dep)}</td>
            <td style="text-align:right;font-family:monospace">${fL(info.t_neto)}</td>
            <td></td>
          </tr>`).join('')}
        <tr style="background:#1e3a5f;color:#fff;font-weight:bold">
          <td colspan="6" style="text-align:right">TOTAL GENERAL</td>
          <td style="text-align:right;font-family:monospace">${fL(data.totales.compra)}</td>
          <td style="text-align:right;font-family:monospace">${fL(data.totales.dep_acum)}</td>
          <td style="text-align:right;font-family:monospace">${fL(data.totales.valor_neto)}</td>
          <td></td>
        </tr>
      </tbody></table>
      <script>window.print();<\/script></body></html>`;
    const w=window.open('','_blank','width=900,height=700');
    if(w){w.document.write(html);w.document.close();}
  } catch(e) { alert(e.message); }
}

async function reporteActivosSARExcel() {
  try {
    const data = await GET(`/empresas/${eid()}/reportes/activos_fijos`);
    const rows=[['Código','Nombre','Categoría','Método','Vida Útil (años)','Fecha Compra','Valor Compra','Dep. Acumulada','Valor Neto','Estado']];
    data.activos.forEach(a=>rows.push([a.codigo,a.nombre,CAT_LABELS[a.categoria]||a.categoria,
      a.metodo==='linea_recta'?'Línea Recta':'Saldo Decr.',a.vida_util_anios,a.fecha_compra,
      parseFloat(a.valor_compra)||0,parseFloat(a.dep_acumulada)||0,parseFloat(a.valor_neto)||0,a.estado]));
    rows.push([]);
    rows.push(['TOTALES','','','','','',data.totales.compra,data.totales.dep_acum,data.totales.valor_neto,'']);
    xlsxDownload(rows,'Activos_Fijos_SAR');
  } catch(e) { alert(e.message); }
}

// ════════════════════════════════════════════════════════════════════════════
// FASE 2 — CONFIG SAR
// ════════════════════════════════════════════════════════════════════════════

async function renderConfigSAR() {
  if (!eid()) return;
  try {
    const cfg = await GET(`/empresas/${eid()}/config_sar`);
    document.getElementById('sar-regimen').value        = cfg.regimen||'mercantil';
    document.getElementById('sar-tasa-isv').value       = cfg.tasa_isv||15;
    document.getElementById('sar-tasa-isr').value       = cfg.tasa_isr||25;
    document.getElementById('sar-declara-isv').checked  = !!cfg.declara_isv;
    document.getElementById('sar-declara-isr').checked  = !!cfg.declara_isr;
    document.getElementById('sar-inicio-fiscal').value  = cfg.inicio_fiscal||1;
  } catch(e) { console.error(e); }
}

// ════════════════════════════════════════════════════════════════════════════
// FASE 2 — FORMULARIOS ADICIONALES (setupForms extensión)
// ════════════════════════════════════════════════════════════════════════════

// Activo fijo form
document.addEventListener('DOMContentLoaded', () => {
  const afForm = document.getElementById('activo-form');
  if (afForm) afForm.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const id = document.getElementById('af-id').value;
      const body = {
        codigo:          document.getElementById('af-codigo').value.trim(),
        nombre:          document.getElementById('af-nombre').value.trim(),
        categoria:       document.getElementById('af-categoria').value,
        cuenta_activo_id:   document.getElementById('af-cta-activo').value||null,
        cuenta_dep_acum_id: document.getElementById('af-cta-dep-acum').value||null,
        cuenta_gasto_dep_id:document.getElementById('af-cta-gasto-dep').value||null,
        valor_compra:    parseFloat(document.getElementById('af-valor-compra').value)||0,
        valor_residual:  parseFloat(document.getElementById('af-valor-residual').value)||0,
        vida_util_anios: parseInt(document.getElementById('af-vida-util').value)||5,
        metodo:          document.getElementById('af-metodo').value,
        fecha_compra:    document.getElementById('af-fecha-compra').value,
        fecha_inicio_dep:document.getElementById('af-fecha-inicio-dep').value,
        estado:          'activo',
      };
      if (id) await PUT(`/empresas/${eid()}/activos/${id}`, body);
      else await POST(`/empresas/${eid()}/activos`, body);
      closeModal('activo-modal');
      renderActivos();
    } catch(e2) { alert(e2.message); }
  });

  // Config SAR form
  const sarForm = document.getElementById('config-sar-form');
  if (sarForm) sarForm.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await PUT(`/empresas/${eid()}/config_sar`, {
        regimen:        document.getElementById('sar-regimen').value,
        tasa_isv:       parseFloat(document.getElementById('sar-tasa-isv').value)||15,
        tasa_isr:       parseFloat(document.getElementById('sar-tasa-isr').value)||25,
        declara_isv:    document.getElementById('sar-declara-isv').checked,
        declara_isr:    document.getElementById('sar-declara-isr').checked,
        inicio_fiscal:  parseInt(document.getElementById('sar-inicio-fiscal').value)||1,
      });
      const ok = document.getElementById('sar-config-ok');
      if (ok) { ok.style.display='flex'; setTimeout(()=>ok.style.display='none',2500); }
    } catch(e2) { alert(e2.message); }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FASE 3 — INTEGRACIÓN CON METRIC POS
// ════════════════════════════════════════════════════════════════════════════

let _posConexiones = [];
let _posReglas     = [];
let _posTabActual  = 'conexiones';

const EVENTO_LABELS = {
  venta_efectivo:      { label:'💵 Venta — Efectivo',      desc:'Cliente paga en efectivo en caja' },
  venta_tarjeta:       { label:'💳 Venta — Tarjeta',       desc:'Cliente paga con tarjeta de crédito/débito' },
  venta_transferencia: { label:'🏦 Venta — Transferencia', desc:'Cliente paga por transferencia bancaria' },
  venta_credito:       { label:'📋 Venta — Crédito',       desc:'Venta a crédito → genera CxC Clientes' },
  cobro_cxc:           { label:'💵 Cobro CxC',             desc:'Pago recibido de cliente en cuenta pendiente' },
  pago_cxp:            { label:'🏧 Pago a Proveedor',      desc:'Pago realizado a proveedor (CxP)' },
  devolucion:          { label:'↩️ Devolución de Venta',   desc:'Mercancía devuelta por cliente' },
  compra_inventario:   { label:'📦 Compra Inventario',     desc:'Recepción de mercancía de proveedor' },
};

async function renderPOS_Integracion() {
  if (!eid()) return;
  await cargarDatosPOS();
  renderPOS_Dashboard();
  renderPOS_Conexiones();
  actualizarWebhookInfo();
  const hoy = today();
  const ini = document.getElementById('sync-fecha-ini');
  const fin = document.getElementById('sync-fecha-fin');
  if (ini && !ini.value) ini.value = hoy.substring(0,8)+'01';
  if (fin && !fin.value) fin.value = hoy;
}

async function cargarDatosPOS() {
  [_posConexiones, _posReglas] = await Promise.all([
    GET(`/empresas/${eid()}/pos/conexiones`).catch(()=>[]),
    GET(`/empresas/${eid()}/pos/reglas`).catch(()=>[]),
  ]);
  // Poblar selector de conexiones en sync
  const sel = document.getElementById('sync-conexion');
  if (sel) {
    sel.innerHTML = _posConexiones.length
      ? _posConexiones.filter(c=>c.activa).map(c=>`<option value="${c.id}">${c.nombre} — ${c.pos_url}</option>`).join('')
      : '<option value="">Sin conexiones configuradas</option>';
  }
}

async function renderPOS_Dashboard() {
  try {
    const dash = await GET(`/empresas/${eid()}/pos/dashboard`);
    const t = dash.totales || {};
    const h = dash.hoy     || {};
    document.getElementById('pos-kpis').innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Conexiones</div><div class="kpi-val">${dash.conexiones?.length||0}</div></div>
      <div class="kpi-card"><div class="kpi-label">Sync OK Total</div><div class="kpi-val" style="color:#15803d">${t.ok||0}</div></div>
      <div class="kpi-card"><div class="kpi-label">Errores Total</div><div class="kpi-val" style="color:#dc2626">${t.errores||0}</div></div>
      <div class="kpi-card"><div class="kpi-label">Sync Hoy</div><div class="kpi-val" style="color:#2563eb">${h.ok||0}</div></div>
      <div class="kpi-card"><div class="kpi-label">Ignorados</div><div class="kpi-val" style="color:#d97706">${t.ignorados||0}</div></div>
    `;
  } catch(e) { document.getElementById('pos-kpis').innerHTML = ''; }
}

function renderPOS_Conexiones() {
  const lista = document.getElementById('pos-conexiones-lista');
  if (!lista) return;
  if (!_posConexiones.length) {
    lista.innerHTML = `
      <div style="text-align:center;padding:40px;background:#f8fafc;border:2px dashed #e2e8f0;border-radius:12px">
        <div style="font-size:32px;margin-bottom:10px">🔌</div>
        <div style="font-weight:700;color:#1e3a5f;margin-bottom:6px">Sin conexiones configuradas</div>
        <div style="font-size:13px;color:#64748b;margin-bottom:16px">Agrega la URL de tu Metric POS para comenzar la sincronización</div>
        <button class="btn-primary" onclick="openModal('conexion-modal');initConexionModal()">+ Conectar Metric POS</button>
      </div>`;
    return;
  }
  lista.innerHTML = _posConexiones.map(c => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:16px">
      <div style="width:44px;height:44px;border-radius:12px;background:${c.activa?'#f0fdf4':'#f8fafc'};border:1px solid ${c.activa?'#bbf7d0':'#e2e8f0'};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">
        ${c.activa?'🟢':'⚫'}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;color:#1e3a5f">${c.nombre}</div>
        <div style="font-size:12px;color:#2563eb;font-family:monospace;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.pos_url}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px">
          Último sync: ${c.ultima_sync ? c.ultima_sync.substring(0,16) : 'Nunca'}
          ${c.sucursal_pos_id ? ' · Sucursal: '+c.sucursal_pos_id : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn-primary" style="font-size:12px;padding:6px 12px;background:#7c3aed" onclick="probarConexionById('${c.id}','${c.pos_url}')">🔌 Probar</button>
        <button class="action-btn edit" onclick="editarConexion('${c.id}')" title="Editar">✏️</button>
        <button class="action-btn delete" onclick="eliminarConexion('${c.id}','${c.nombre}')" title="Eliminar">🗑️</button>
      </div>
    </div>
  `).join('');
}

function renderPOS_Reglas() {
  const cont = document.getElementById('pos-reglas-tabla');
  if (!cont) return;
  const cuentasOpts = '<option value="">— Sin cuenta —</option>' +
    cuentas_cache.filter(c=>c.permite_movimiento&&c.activa).map(c=>
      `<option value="${c.id}">${c.codigo} — ${c.nombre}</option>`).join('');

  cont.innerHTML = Object.entries(EVENTO_LABELS).map(([evento, info]) => {
    const regla = _posReglas.find(r=>r.evento===evento) || {};
    return `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:8px;display:flex;align-items:center;gap:16px">
        <div style="flex:0 0 220px">
          <div style="font-weight:700;font-size:13px;color:#1e3a5f">${info.label}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">${info.desc}</div>
          <span class="badge ${regla.activa?'badge-green':'badge-red'}" style="margin-top:6px;display:inline-block">
            ${regla.cta_debito_id?'Configurada':'Sin configurar'}
          </span>
        </div>
        <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
          <div>
            <div style="font-size:10px;font-weight:700;color:#1d4ed8;text-transform:uppercase;margin-bottom:2px">Débito</div>
            <div style="color:#1e293b">${regla.deb_cod ? regla.deb_cod+' — '+regla.deb_nom : '—'}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;color:#dc2626;text-transform:uppercase;margin-bottom:2px">Crédito</div>
            <div style="color:#1e293b">${regla.cred_cod ? regla.cred_cod+' — '+regla.cred_nom : '—'}</div>
          </div>
        </div>
        <button class="action-btn edit" onclick="editarRegla('${evento}')" title="Configurar regla" style="flex-shrink:0">✏️</button>
      </div>
    `;
  }).join('');
}

async function renderPosLog() {
  const estado = document.getElementById('log-estado-filter')?.value || '';
  try {
    const logs = await GET(`/empresas/${eid()}/pos/sync_log`, `limite=300${estado?'&estado='+estado:''}`);
    const tbody = document.getElementById('pos-log-body');
    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8">Sin registros de sincronización</td></tr>`;
      return;
    }
    tbody.innerHTML = logs.map(l => {
      const info = EVENTO_LABELS[l.tipo] || {label:l.tipo};
      const stColor = l.estado==='ok'?'badge-green':l.estado==='error'?'badge-red':'badge-amber';
      return `<tr>
        <td style="font-size:12px;color:#64748b">${(l.fecha||'').substring(0,16)}</td>
        <td style="font-size:12px">${info.label||l.tipo}</td>
        <td style="font-family:monospace;font-size:12px;color:#2563eb">${l.pos_id}</td>
        <td style="font-family:monospace;font-weight:700">${l.asiento_numero ? '#'+l.asiento_numero : '—'}</td>
        <td><span class="badge ${stColor}">${l.estado}</span></td>
        <td style="font-size:11px;color:#64748b;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${l.detalle||''}">${l.detalle||'—'}</td>
      </tr>`;
    }).join('');
  } catch(e) { console.error(e); }
}

function switchPosTab(tab) {
  _posTabActual = tab;
  document.querySelectorAll('.pos-tab').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.pos-tab-content').forEach(c => c.style.display='none');
  const el = document.getElementById('pos-tab-'+tab);
  if (el) el.style.display = '';
  if (tab==='reglas') renderPOS_Reglas();
  if (tab==='log')    renderPosLog();
  if (tab==='sync')   actualizarWebhookInfo();
}

function actualizarWebhookInfo() {
  const base = window.location.origin;
  const whUrl = document.getElementById('webhook-url');
  const whTok = document.getElementById('webhook-token');
  if (whUrl) whUrl.textContent = `${base}/api/empresas/${eid()}/pos/webhook`;
  const selConn = document.getElementById('sync-conexion');
  if (whTok && selConn && selConn.value) {
    const conn = _posConexiones.find(c=>c.id===selConn.value);
    if (whTok) whTok.textContent = conn?.pos_token || '(sin token configurado)';
  }
}

// ── CRUD Conexiones ────────────────────────────────────────────────────────
function initConexionModal() {
  document.getElementById('con-id').value      = '';
  document.getElementById('con-nombre').value  = '';
  document.getElementById('con-url').value     = 'http://localhost:3000';
  document.getElementById('con-token').value   = '';
  document.getElementById('con-suc-id').value  = '';
  document.getElementById('con-activa').checked = true;
  document.getElementById('conexion-modal-titulo').textContent = 'Conectar Metric POS';
  document.getElementById('con-test-result').style.display = 'none';
}

async function editarConexion(id) {
  const c = _posConexiones.find(x=>x.id===id);
  if (!c) return;
  document.getElementById('con-id').value      = c.id;
  document.getElementById('con-nombre').value  = c.nombre;
  document.getElementById('con-url').value     = c.pos_url;
  document.getElementById('con-token').value   = c.pos_token||'';
  document.getElementById('con-suc-id').value  = c.sucursal_pos_id||'';
  document.getElementById('con-activa').checked = !!c.activa;
  document.getElementById('conexion-modal-titulo').textContent = 'Editar Conexión POS';
  document.getElementById('con-test-result').style.display = 'none';
  openModal('conexion-modal');
}

async function eliminarConexion(id, nombre) {
  if (!confirm(`¿Eliminar la conexión "${nombre}"?`)) return;
  await DELETE(`/empresas/${eid()}/pos/conexiones/${id}`);
  await cargarDatosPOS();
  renderPOS_Conexiones();
}

async function probarConexion() {
  const id = document.getElementById('con-id').value;
  if (!id) { alert('Guarda la conexión primero antes de probarla'); return; }
  await probarConexionById(id, document.getElementById('con-url').value);
}

async function probarConexionById(id, url) {
  const resEl = document.getElementById('con-test-result');
  if (resEl) { resEl.style.display='block'; resEl.innerHTML='🔄 Probando conexión...'; resEl.style.cssText='display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;margin-top:8px'; }
  try {
    const r = await POST(`/empresas/${eid()}/pos/conexiones/${id}/probar`, {});
    const msg = r.ok
      ? `✅ Conexión exitosa con ${url}`
      : `❌ Error: ${r.mensaje}`;
    if (resEl) { resEl.style.background=r.ok?'#f0fdf4':'#fef2f2'; resEl.style.borderColor=r.ok?'#bbf7d0':'#fecaca'; resEl.style.color=r.ok?'#15803d':'#dc2626'; resEl.innerHTML=msg; }
    else alert(msg);
  } catch(e) {
    const msg = '❌ Error: '+e.message;
    if (resEl) { resEl.style.background='#fef2f2'; resEl.style.borderColor='#fecaca'; resEl.style.color='#dc2626'; resEl.innerHTML=msg; }
    else alert(msg);
  }
}

// ── CRUD Reglas ────────────────────────────────────────────────────────────
function editarRegla(evento) {
  const regla = _posReglas.find(r=>r.evento===evento) || {};
  const info  = EVENTO_LABELS[evento] || {label:evento, desc:''};
  document.getElementById('regla-evento').value          = evento;
  document.getElementById('regla-modal-titulo').textContent = 'Configurar: '+info.label;
  document.getElementById('regla-evento-label').textContent = info.label;
  document.getElementById('regla-descripcion').textContent  = info.desc;

  const cuentasSel = (idSel) => {
    const opts = '<option value="">— Sin cuenta —</option>' +
      cuentas_cache.filter(c=>c.permite_movimiento&&c.activa).map(c=>
        `<option value="${c.id}" ${c.id===idSel?'selected':''}>${c.codigo} — ${c.nombre}</option>`).join('');
    return opts;
  };
  document.getElementById('regla-debito').innerHTML    = cuentasSel(regla.cta_debito_id||'');
  document.getElementById('regla-credito').innerHTML   = cuentasSel(regla.cta_credito_id||'');
  document.getElementById('regla-isv15').innerHTML     = cuentasSel(regla.cta_isv15_id||'');
  document.getElementById('regla-isv18').innerHTML     = cuentasSel(regla.cta_isv18_id||'');
  document.getElementById('regla-descuento').innerHTML = cuentasSel(regla.cta_descuento_id||'');
  document.getElementById('regla-activa').checked      = regla.activa!==0;
  openModal('regla-modal');
}

// ── Sincronización ─────────────────────────────────────────────────────────
async function ejecutarSync() {
  const conexion_id = document.getElementById('sync-conexion').value;
  const fecha_ini   = document.getElementById('sync-fecha-ini').value;
  const fecha_fin   = document.getElementById('sync-fecha-fin').value;
  if (!conexion_id) { alert('Selecciona una conexión POS'); return; }

  const resEl = document.getElementById('sync-resultado');
  resEl.style.display = 'block';
  resEl.innerHTML = '<div style="color:#2563eb">🔄 Sincronizando con Metric POS...</div>';

  try {
    const r = await POST(`/empresas/${eid()}/pos/sync`, {conexion_id, fecha_ini, fecha_fin});
    const colorOk    = r.ok > 0 ? '#15803d' : '#64748b';
    const colorErr   = r.errores > 0 ? '#dc2626' : '#64748b';
    resEl.innerHTML = `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px">
        <div style="font-weight:700;color:#15803d;font-size:14px;margin-bottom:10px">✅ Sincronización completada — ${r.conexion}</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px">
          <div style="background:#fff;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:22px;font-weight:800;color:${colorOk}">${r.ok}</div>
            <div style="font-size:11px;color:#64748b">Asientos generados</div>
          </div>
          <div style="background:#fff;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:22px;font-weight:800;color:${colorErr}">${r.errores}</div>
            <div style="font-size:11px;color:#64748b">Errores</div>
          </div>
          <div style="background:#fff;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:22px;font-weight:800;color:#d97706">${r.ignorados}</div>
            <div style="font-size:11px;color:#64748b">Ignorados / Ya sync</div>
          </div>
        </div>
        ${r.asientos.length ? `<div style="font-size:12px;color:#475569;margin-top:6px"><strong>Asientos creados:</strong> ${r.asientos.slice(0,10).join(', ')}${r.asientos.length>10?'...':''}</div>` : ''}
        ${r._errores_detalle?.length ? `<div style="margin-top:8px;background:#fef2f2;border-radius:6px;padding:8px 10px;font-size:12px;color:#dc2626"><strong>Detalle de errores:</strong><br>${r._errores_detalle.join('<br>')}</div>` : ''}
      </div>`;
    // Actualizar dashboard y log
    renderPOS_Dashboard();
  } catch(e) {
    resEl.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;color:#dc2626;font-weight:600">❌ Error: ${e.message}</div>`;
  }
}

async function exportarLogExcel() {
  try {
    const logs = await GET(`/empresas/${eid()}/pos/sync_log`, 'limite=1000');
    const rows = [['Fecha','Tipo Evento','POS ID','N° Asiento','Estado','Detalle']];
    logs.forEach(l => rows.push([
      l.fecha?.substring(0,16)||'',
      EVENTO_LABELS[l.tipo]?.label||l.tipo,
      l.pos_id,
      l.asiento_numero?'#'+l.asiento_numero:'',
      l.estado,
      l.detalle||''
    ]));
    xlsxDownload(rows,'Sync_Log_POS');
  } catch(e) { alert(e.message); }
}

// ── Setup forms Fase 3 ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Form conexión POS
  const conForm = document.getElementById('conexion-form');
  if (conForm) conForm.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const id = document.getElementById('con-id').value;
      const body = {
        nombre:         document.getElementById('con-nombre').value.trim(),
        pos_url:        document.getElementById('con-url').value.trim(),
        pos_token:      document.getElementById('con-token').value.trim(),
        sucursal_pos_id:document.getElementById('con-suc-id').value.trim(),
        activa:         document.getElementById('con-activa').checked,
      };
      if (id) await PUT(`/empresas/${eid()}/pos/conexiones/${id}`, body);
      else await POST(`/empresas/${eid()}/pos/conexiones`, body);
      closeModal('conexion-modal');
      await cargarDatosPOS();
      renderPOS_Conexiones();
    } catch(e2) { alert(e2.message); }
  });

  // Form regla de mapeo
  const reglaForm = document.getElementById('regla-form');
  if (reglaForm) reglaForm.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const evento = document.getElementById('regla-evento').value;
      await PUT(`/empresas/${eid()}/pos/reglas/${evento}`, {
        cta_debito_id:    document.getElementById('regla-debito').value||null,
        cta_credito_id:   document.getElementById('regla-credito').value||null,
        cta_isv15_id:     document.getElementById('regla-isv15').value||null,
        cta_isv18_id:     document.getElementById('regla-isv18').value||null,
        cta_descuento_id: document.getElementById('regla-descuento').value||null,
        activa:           document.getElementById('regla-activa').checked,
      });
      closeModal('regla-modal');
      _posReglas = await GET(`/empresas/${eid()}/pos/reglas`);
      renderPOS_Reglas();
    } catch(e2) { alert(e2.message); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO 1: DIARIO — MODIFICAR Y ELIMINAR ASIENTOS
// ═══════════════════════════════════════════════════════════════════════════

let _editPartidas = [];

async function editarAsiento(id) {
  try {
    const a = await GET(`/empresas/${eid()}/asientos/${id}`);
    if (a.estado === 'anulado')
      return alert('No se puede modificar un asiento anulado.');
    if (a.estado === 'contabilizado')
      return alert('No se puede modificar un asiento contabilizado. Anúlelo primero.');
    document.getElementById('edit-a-id').value        = id;
    document.getElementById('edit-asiento-titulo').textContent = `Modificar Asiento #${a.numero} — ${a.concepto}`;
    document.getElementById('edit-a-fecha').value     = a.fecha;
    document.getElementById('edit-a-concepto').value  = a.concepto;
    document.getElementById('edit-a-referencia').value= a.referencia||'';
    document.getElementById('edit-a-tipo').value      = a.tipo;
    _editPartidas = a.partidas.map(p => ({
      cuenta_id:    p.cuenta_id,
      cuenta_codigo:p.cuenta_codigo,
      cuenta_nombre:p.cuenta_nombre,
      debe:         parseFloat(p.debe)||0,
      haber:        parseFloat(p.haber)||0,
      descripcion:  p.descripcion||'',
      centro_costo: p.centro_costo||''
    }));
    renderPartidasEdit();
    openModal('edit-asiento-modal');
  } catch(e) { alert('Error al cargar asiento: '+e.message); }
}

function renderPartidasEdit() {
  const td = _editPartidas.reduce((s,p)=>s+p.debe,0);
  const th = _editPartidas.reduce((s,p)=>s+p.haber,0);
  const cuadra = Math.abs(td-th)<0.01;
  document.getElementById('edit-a-cuadre-alert').style.display = cuadra?'none':'block';
  document.getElementById('edit-a-partidas-body').innerHTML =
    _editPartidas.map((p,i)=>`
      <tr>
        <td style="padding:6px 8px;font-family:monospace;font-size:11px">
          ${p.cuenta_codigo} — ${p.cuenta_nombre}
        </td>
        <td style="padding:4px 6px">
          <input type="text" value="${p.descripcion}"
            onchange="_editPartidas[${i}].descripcion=this.value"
            style="width:100%;border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;font-size:12px">
        </td>
        <td style="padding:4px 6px">
          <input type="number" step="0.01" min="0" value="${p.debe||''}"
            onchange="_editPartidas[${i}].debe=parseFloat(this.value)||0;_editPartidas[${i}].haber=0;renderPartidasEdit()"
            style="width:100%;border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;font-size:12px;text-align:right">
        </td>
        <td style="padding:4px 6px">
          <input type="number" step="0.01" min="0" value="${p.haber||''}"
            onchange="_editPartidas[${i}].haber=parseFloat(this.value)||0;_editPartidas[${i}].debe=0;renderPartidasEdit()"
            style="width:100%;border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;font-size:12px;text-align:right">
        </td>
        <td style="padding:4px 6px;text-align:center">
          <button onclick="_editPartidas.splice(${i},1);renderPartidasEdit()"
            style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:12px">✕</button>
        </td>
      </tr>`).join('') +
    `<tr style="background:#f8fafc;font-weight:700">
      <td colspan="2" style="padding:8px 10px;text-align:right">TOTALES</td>
      <td style="padding:8px 10px;text-align:right;color:#1d4ed8">${fL(td)}</td>
      <td style="padding:8px 10px;text-align:right;color:#dc2626">${fL(th)}</td>
      <td style="padding:8px 10px;text-align:center;font-size:16px">${cuadra?'✅':'❌'}</td>
    </tr>`;
}

function agregarPartidaEdit() {
  document.getElementById('edit-buscar-q').value='';
  document.getElementById('edit-buscar-resultados').innerHTML='';
  openModal('edit-buscar-cuenta-modal');
}

function filtrarCuentasEdit(q) {
  const res = (cuentas_cache||[]).filter(c=>
    c.permite_movimiento &&
    (c.codigo.toLowerCase().includes(q.toLowerCase()) ||
     c.nombre.toLowerCase().includes(q.toLowerCase()))
  ).slice(0,12);
  document.getElementById('edit-buscar-resultados').innerHTML =
    res.map(c=>`
      <div onclick="seleccionarCuentaEdit('${c.id}','${c.codigo}','${c.nombre.replace(/'/g,"\\'")}')"
        style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:13px;
               display:flex;gap:8px"
        onmouseover="this.style.background='#eff6ff'"
        onmouseout="this.style.background=''">
        <span style="font-family:monospace;color:#2563eb;font-size:11px;min-width:60px">${c.codigo}</span>
        <span>${c.nombre}</span>
      </div>`).join('') || '<div style="padding:16px;color:#94a3b8;text-align:center">Sin resultados</div>';
}

function seleccionarCuentaEdit(id, codigo, nombre) {
  _editPartidas.push({cuenta_id:id,cuenta_codigo:codigo,cuenta_nombre:nombre,debe:0,haber:0,descripcion:'',centro_costo:''});
  renderPartidasEdit();
  closeModal('edit-buscar-cuenta-modal');
}

async function guardarEdicionAsiento() {
  const id        = document.getElementById('edit-a-id').value;
  const fecha     = document.getElementById('edit-a-fecha').value;
  const concepto  = document.getElementById('edit-a-concepto').value.trim();
  const referencia= document.getElementById('edit-a-referencia').value.trim();
  const tipo      = document.getElementById('edit-a-tipo').value;
  if (!fecha||!concepto) return alert('Fecha y concepto son requeridos.');
  if (_editPartidas.length < 2) return alert('Mínimo 2 partidas requeridas.');
  const td = _editPartidas.reduce((s,p)=>s+p.debe,0);
  const th = _editPartidas.reduce((s,p)=>s+p.haber,0);
  if (Math.abs(td-th)>0.01)
    return alert(`El asiento no cuadra.\nDebe: ${fL(td)}\nHaber: ${fL(th)}`);
  try {
    await PUT(`/empresas/${eid()}/asientos/${id}`, {fecha,concepto,referencia,tipo,
      partidas: _editPartidas.map(p=>({
        cuenta_id:p.cuenta_id, debe:p.debe, haber:p.haber,
        descripcion:p.descripcion, centro_costo:p.centro_costo
      }))
    });
    closeModal('edit-asiento-modal');
    showToastMsg('✅ Asiento actualizado correctamente');
    renderDiario();
  } catch(e) { alert('Error: '+e.message); }
}

async function eliminarAsiento(id, numero) {
  if (!confirm(`¿Eliminar el Asiento #${numero}?\n\n• Se marcará como ANULADO (borrado lógico)\n• No se podrá deshacer\n\n¿Confirma?`)) return;
  try {
    const r = await fetch(`/api/empresas/${eid()}/asientos/${id}`, {
      method:'DELETE',
      headers:{'Authorization':'Bearer '+TOKEN}
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error||r.statusText);
    showToastMsg('🗑️ Asiento eliminado');
    renderDiario();
  } catch(e) { alert('Error: '+e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO 2: PLAN DE CUENTAS — PLANTILLA / EXPORTAR / IMPORTAR
// ═══════════════════════════════════════════════════════════════════════════

function descargarPlantillaCuentas() {
  const rows = [
    ['codigo_cuenta','nombre','tipo','nivel','cuenta_padre'],
    ['1','ACTIVO','activo',1,''],
    ['1.1','Activo Corriente','activo',2,'1'],
    ['1.1.01','Caja General','activo',3,'1.1'],
    ['2','PASIVO','pasivo',1,''],
    ['2.1','Pasivo Corriente','pasivo',2,'2'],
    ['2.1.01','Cuentas por Pagar','pasivo',3,'2.1'],
  ];
  xlsxDownload(rows,'plantilla_plan_cuentas');
}

async function exportarPlanCuentas() {
  try {
    const r = await fetch(`/api/empresas/${eid()}/cuentas/exportar`,
      {headers:{'Authorization':'Bearer '+TOKEN}});
    if (!r.ok) throw new Error(await r.text());
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href=url; a.download='plan_cuentas.csv'; a.click();
    URL.revokeObjectURL(url);
    showToastMsg('📥 Plan de cuentas exportado');
  } catch(e) { alert('Error al exportar: '+e.message); }
}

async function importarPlanCuentas(input) {
  if (!input?.files?.[0]) return;
  const text = await input.files[0].text();
  const lineas = text.replace(/\r/g,'').split('\n').filter(l=>l.trim());
  if (lineas.length < 2) return alert('El archivo está vacío o no tiene datos.');
  const header = lineas[0].split(',').map(h=>h.trim().replace(/^"|"$/g,'').toLowerCase());
  const cuentas = [];
  for (let i=1;i<lineas.length;i++) {
    const cols = lineas[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g)||[];
    const row  = {};
    header.forEach((h,ci)=>{ row[h]=(cols[ci]||'').replace(/^"|"$/g,'').trim(); });
    if (row.codigo_cuenta) cuentas.push(row);
  }
  if (!cuentas.length) return alert('No se encontraron filas válidas en el CSV.');

  // Preguntar si reemplazar cuando ya existen cuentas
  let reemplazar = false;
  const precheck = await POST(`/empresas/${eid()}/cuentas/importar`, {cuentas, reemplazar: false});
  if (precheck.omitidas > 0) {
    const resp = confirm(
      `⚠️ Se encontraron ${precheck.omitidas} cuentas que ya existen en el plan de cuentas.\n\n` +
      `¿Deseas actualizar (reemplazar) las cuentas existentes con los datos del archivo?\n\n` +
      `• Aceptar → Actualiza las ${precheck.omitidas} existentes y crea las ${precheck.creadas} nuevas\n` +
      `• Cancelar → Solo crea las ${precheck.creadas} nuevas (omite las existentes)`
    );
    if (resp) {
      // Hacer la importación real con reemplazar=true
      try {
        const r2 = await POST(`/empresas/${eid()}/cuentas/importar`, {cuentas, reemplazar: true});
        let msg = `✅ Importación completada:\n• Creadas: ${r2.creadas}\n• Actualizadas: ${r2.actualizadas}\n• Omitidas: ${r2.omitidas}`;
        if (r2.errores?.length) msg += `\n⚠️ Errores (${r2.errores.length}):\n` + r2.errores.slice(0,5).join('\n');
        alert(msg);
        renderCuentas();
      } catch(e) { alert('Error al importar: '+e.message); }
      input.value=''; return;
    }
  }
  // Mostrar resultado del precheck (solo nuevas)
  let msg = `✅ Importación completada:\n• Creadas: ${precheck.creadas}\n• Actualizadas: ${precheck.actualizadas||0}\n• Omitidas (ya existen): ${precheck.omitidas}`;
  if (precheck.errores?.length) msg += `\n⚠️ Errores (${precheck.errores.length}):\n` + precheck.errores.slice(0,5).join('\n');
  alert(msg);
  if (precheck.creadas > 0) renderCuentas();
  input.value='';
}

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO 4: LIBRO DE COMPRAS ISV — HONDURAS
// ═══════════════════════════════════════════════════════════════════════════

async function renderLibroCompras() {
  if (!eid()) return;
  const mes  = (document.getElementById('lc-mes')||{}).value||'';
  const anio = (document.getElementById('lc-anio')||{}).value||'';
  const fi   = (document.getElementById('lc-fecha-ini')||{}).value||'';
  const ff   = (document.getElementById('lc-fecha-fin')||{}).value||'';
  let params = '';
  if (mes&&anio)    params=`mes=${mes}&anio=${anio}`;
  else if (fi||ff)  params=`fecha_ini=${fi}&fecha_fin=${ff}`;
  try {
    const {filas,totales} = await GET(`/empresas/${eid()}/compras`,params);
    const sub = document.getElementById('lc-subtitle');
    if (sub) sub.textContent=`${filas.length} factura(s) — Total: ${fL(totales.monto_total)}`;
    const tbody = document.getElementById('lc-body');
    if (!tbody) return;
    if (!filas.length) {
      tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:20px;color:#94a3b8">Sin registros en el período seleccionado</td></tr>';
      return;
    }
    tbody.innerHTML = filas.map(f=>`<tr>
      <td style="padding:8px 7px">${f.fecha}</td>
      <td style="padding:8px 7px;font-family:monospace;font-size:11px">${f.proveedor_rtn||'—'}</td>
      <td style="padding:8px 7px">${f.proveedor_nombre}</td>
      <td style="padding:8px 7px;font-family:monospace;font-size:11px">${f.numero_documento||'—'}</td>
      <td style="padding:8px 7px;text-align:right;font-weight:600">${fL(f.monto_total)}</td>
      <td style="padding:8px 7px;text-align:right">${fL(f.compras_exentas)}</td>
      <td style="padding:8px 7px;text-align:right">${fL(f.base_gravada_15)}</td>
      <td style="padding:8px 7px;text-align:right;color:#1d4ed8;font-weight:600">${fL(f.isv_15)}</td>
      <td style="padding:8px 7px;text-align:right">${fL(f.base_gravada_18)}</td>
      <td style="padding:8px 7px;text-align:right;color:#7c3aed;font-weight:600">${fL(f.isv_18)}</td>
    </tr>`).join('') +
    `<tr style="background:#1e3a5f;color:#fff;font-weight:700">
      <td colspan="4" style="padding:9px 10px;text-align:right">TOTALES</td>
      <td style="padding:9px 10px;text-align:right">${fL(totales.monto_total)}</td>
      <td style="padding:9px 10px;text-align:right">${fL(totales.compras_exentas)}</td>
      <td style="padding:9px 10px;text-align:right">${fL(totales.base_gravada_15)}</td>
      <td style="padding:9px 10px;text-align:right;color:#93c5fd">${fL(totales.isv_15)}</td>
      <td style="padding:9px 10px;text-align:right">${fL(totales.base_gravada_18)}</td>
      <td style="padding:9px 10px;text-align:right;color:#c4b5fd">${fL(totales.isv_18)}</td>
    </tr>`;
  } catch(e) { console.error('Libro Compras:',e.message); }
}

async function exportarLibroCompras() {
  const mes  = (document.getElementById('lc-mes')||{}).value||'';
  const anio = (document.getElementById('lc-anio')||{}).value||'';
  const fi   = (document.getElementById('lc-fecha-ini')||{}).value||'';
  const ff   = (document.getElementById('lc-fecha-fin')||{}).value||'';
  let params='';
  if (mes&&anio) params=`mes=${mes}&anio=${anio}`;
  else if (fi||ff) params=`fecha_ini=${fi}&fecha_fin=${ff}`;
  try {
    const {filas,totales} = await GET(`/empresas/${eid()}/compras`,params);
    const header='Fecha,RTN Proveedor,Nombre/Razon Social,No. Documento,Monto Total,Cps. Exentas,Base 15%,ISV 15%,Base 18%,ISV 18%';
    const rows=filas.map(f=>`${f.fecha},"${f.proveedor_rtn||''}","${f.proveedor_nombre}","${f.numero_documento||''}",${f.monto_total},${f.compras_exentas},${f.base_gravada_15},${f.isv_15},${f.base_gravada_18},${f.isv_18}`);
    const total=`TOTALES,,,,${totales.monto_total},${totales.compras_exentas},${totales.base_gravada_15},${totales.isv_15},${totales.base_gravada_18},${totales.isv_18}`;
    const csv='\uFEFF'+[header,...rows,'',total].join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`libro_compras_${mes||fi||'todos'}_${anio||''}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToastMsg('📥 Libro de Compras exportado');
  } catch(e) { alert('Error: '+e.message); }
}

function calcTotalCompra(form) {
  const b15  = parseFloat(form.base15?.value)||0;
  const b18  = parseFloat(form.base18?.value)||0;
  const exen = parseFloat(form.exenta?.value)||0;
  const i15  = +(b15*0.15).toFixed(2);
  const i18  = +(b18*0.18).toFixed(2);
  const tot  = +(b15+i15+b18+i18+exen).toFixed(2);
  const t15El= document.getElementById('lc-isv15-preview');
  const t18El= document.getElementById('lc-isv18-preview');
  const totEl= document.getElementById('lc-total-preview');
  if (t15El) t15El.textContent=fL(i15);
  if (t18El) t18El.textContent=fL(i18);
  if (totEl) totEl.textContent=fL(tot);
}

async function guardarCompra(e) {
  e.preventDefault();
  const form=e.target;
  const b15  = parseFloat(form.base15.value)||0;
  const b18  = parseFloat(form.base18.value)||0;
  const exen = parseFloat(form.exenta.value)||0;
  const i15  = +(b15*0.15).toFixed(2);
  const i18  = +(b18*0.18).toFixed(2);
  const tot  = +(b15+i15+b18+i18+exen).toFixed(2);
  try {
    await POST(`/empresas/${eid()}/compras`,{
      fecha:form.fecha.value, proveedor_rtn:form.rtn.value.trim(),
      proveedor_nombre:form.proveedor.value.trim(),
      numero_documento:form.nodoc.value.trim(), cai:form.cai.value.trim(),
      monto_total:tot, compras_exentas:exen,
      base_gravada_15:b15, isv_15:i15, base_gravada_18:b18, isv_18:i18
    });
    closeModal('lc-nueva-modal');
    showToastMsg('✅ Compra registrada');
    form.reset(); calcTotalCompra(form);
    renderLibroCompras();
  } catch(err) { alert('Error: '+err.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO: REPORTES CONTABLES
// ═══════════════════════════════════════════════════════════════════════════

// CSS responsive inyectado una sola vez
(function injectRepCSS(){
  if(document.getElementById('rep-style')) return;
  const s=document.createElement('style');
  s.id='rep-style';
  s.textContent=`
    @media print{
      @page{margin:12mm}
      .rep-no-print{display:none!important}
      body{font-size:11px}
      .rep-table th,.rep-table td{padding:5px 6px!important}
    }
    .rep-wrap{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1e293b;max-width:100%}
    .rep-header{background:#1e3a5f;color:#fff;padding:16px 20px;text-align:center;border-radius:8px 8px 0 0}
    .rep-header h2{margin:0;font-size:17px}
    .rep-header p{margin:4px 0 0;font-size:12px;opacity:.8}
    .rep-table{width:100%;border-collapse:collapse;font-size:12px}
    .rep-table th{background:#1e3a5f;color:#fff;padding:8px 10px;text-align:left;white-space:nowrap}
    .rep-table th.r,.rep-table td.r{text-align:right}
    .rep-table td{padding:7px 10px;border-bottom:1px solid #f1f5f9}
    .rep-table tr:nth-child(even) td{background:#f8fafc}
    .rep-total td{background:#1e3a5f!important;color:#fff;font-weight:700;padding:8px 10px}
    .rep-subtotal td{background:#ecfdf5!important;font-weight:700;color:#15803d}
    .rep-seccion{background:#f0f4ff;font-weight:700;color:#1e3a5f}
    .rep-seccion td{padding:9px 10px!important}
    .rep-cuadre-ok{background:#f0fdf4;color:#15803d;text-align:center;padding:8px;font-weight:700;font-size:12px;border-top:2px solid #86efac}
    .rep-cuadre-err{background:#fef2f2;color:#dc2626;text-align:center;padding:8px;font-weight:700;font-size:12px;border-top:2px solid #fca5a5}
    .rep-comprobante{border:1px solid #e2e8f0;border-radius:8px;margin-bottom:14px;overflow:hidden}
    .rep-comp-header{background:#f8fafc;padding:10px 14px;border-bottom:1px solid #e2e8f0}
    @media(max-width:600px){
      .rep-table th,.rep-table td{padding:6px 7px;font-size:11px}
      .rep-header h2{font-size:14px}
      .rep-wrap{font-size:12px}
    }`;
  document.head.appendChild(s);
})();

// ── Helpers comunes ───────────────────────────────────────────────────────────
function _repParams() {
  const fi  = (document.getElementById('rep-fecha-ini')||{}).value||'';
  const ff  = (document.getElementById('rep-fecha-fin')||{}).value||'';
  const pid = (document.getElementById('rep-periodo')||{}).value||PERIODO?.id||'';
  let p='';
  if (pid)  p+=`periodo_id=${pid}`;
  if (fi)   p+=(p?'&':'')+`fecha_ini=${fi}`;
  if (ff)   p+=(p?'&':'')+`fecha_fin=${ff}`;
  return p;
}
function _repFiltroLabel() {
  const fi  = (document.getElementById('rep-fecha-ini')||{}).value||'';
  const ff  = (document.getElementById('rep-fecha-fin')||{}).value||'';
  const pid = (document.getElementById('rep-periodo')||{}).value||'';
  const pNom = periodos_cache.find(p=>p.id===pid)?.nombre||'';
  if (pNom)  return pNom;
  if (fi&&ff) return `Del ${fi} al ${ff}`;
  if (fi)    return `Desde ${fi}`;
  if (ff)    return `Hasta ${ff}`;
  return 'Todos los períodos';
}
function _abrirVentana(html) {
  const w=window.open('','_blank','width=960,height=720');
  if(w){ w.document.write(html); w.document.close(); }
}

// ── Inicializar la vista de reportes ─────────────────────────────────────────
async function renderReportes() {
  poblarSelectPeriodos('rep-periodo');
  // Poblar cuentas en el selector del Mayor
  const sel = document.getElementById('rep-mayor-cuenta');
  if (sel && eid()) {
    const cuentas = await GET(`/empresas/${eid()}/cuentas`);
    sel.innerHTML = '<option value="">— Todas las cuentas —</option>' +
      cuentas.filter(c=>c.permite_movimiento)
        .map(c=>`<option value="${c.id}">${c.codigo} — ${c.nombre}</option>`).join('');
  }
}

// ══ 1. PLAN DE CUENTAS ═══════════════════════════════════════════════════════
async function imprimirRepPlanCuentas() {
  if (!eid()) return;
  try {
    const cuentas = await GET(`/empresas/${eid()}/cuentas`);
    const filas = cuentas.map(c=>`<tr>
      <td style="font-family:monospace">${c.codigo}</td>
      <td style="padding-left:${(c.nivel-1)*14}px">${c.nombre}</td>
      <td>${TIPO_LABELS[c.tipo]||c.tipo}</td>
      <td>${c.naturaleza==='deudora'?'Deudora':'Acreedora'}</td>
      <td style="text-align:center">${c.permite_movimiento?'✓':'—'}</td>
    </tr>`).join('');
    _abrirVentana(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Plan de Cuentas</title>
      <style>*{font-family:Arial,sans-serif;font-size:12px}body{padding:20px}
      h2,h3{color:#1e3a5f;text-align:center;margin:4px 0}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      th{background:#1e3a5f;color:#fff;padding:7px 9px;text-align:left}
      td{padding:6px 9px;border-bottom:1px solid #f1f5f9}
      tr:nth-child(even) td{background:#f8fafc}
      @media print{@page{margin:12mm}}</style>
      </head><body>
      <h2>${EMPRESA?.nombre||''}</h2>
      <h3>Plan de Cuentas Contables</h3>
      <p style="text-align:center;color:#64748b;font-size:11px">${_repFiltroLabel()}</p>
      <table>
        <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Naturaleza</th><th style="text-align:center">Mov.</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr style="background:#1e3a5f;color:#fff;font-weight:700">
          <td colspan="5" style="padding:8px 9px">Total cuentas: ${cuentas.length}</td>
        </tr></tfoot>
      </table>
      <script>window.print();<\/script></body></html>`);
  } catch(e){ alert(e.message); }
}

async function excelRepPlanCuentas() {
  if (!eid()) return;
  try {
    const cuentas = await GET(`/empresas/${eid()}/cuentas`);
    const rows=[['Código','Nombre','Tipo','Naturaleza','Permite Movimiento']];
    cuentas.forEach(c=>rows.push([c.codigo,c.nombre,c.tipo,c.naturaleza,c.permite_movimiento?'Sí':'No']));
    xlsxDownload(rows,'Plan_de_Cuentas');
  } catch(e){ alert(e.message); }
}

// ══ 2. MAYOR GENERAL / ANALÍTICO ═════════════════════════════════════════════
async function imprimirRepMayor() {
  if (!eid()) return;
  const cuentaId = (document.getElementById('rep-mayor-cuenta')||{}).value||'';
  const p = _repParams();
  try {
    // Si hay cuenta específica
    if (cuentaId) {
      const data = await GET(`/empresas/${eid()}/mayor`, p+`${p?'&':''}cuenta_id=${cuentaId}`);
      const c = data.cuenta;
      const filas = data.partidas.map(r=>`<tr>
        <td>${r.fecha}</td><td>${r.numero}</td>
        <td>${r.concepto}</td><td>${r.descripcion||'—'}</td>
        <td class="r">${r.debe>0?fL(r.debe):'—'}</td>
        <td class="r">${r.haber>0?fL(r.haber):'—'}</td>
        <td class="r" style="font-weight:700">${fL(r.saldo)}</td>
      </tr>`).join('');
      _abrirVentana(_htmlMayorCuenta(c, filas, data.total_debe, data.total_haber));
    } else {
      // Todas las cuentas
      const cuentas = await GET(`/empresas/${eid()}/cuentas`);
      const movs = cuentas.filter(c=>c.permite_movimiento);
      let bloques='';
      for (const c of movs) {
        const data = await GET(`/empresas/${eid()}/mayor`, p+`${p?'&':''}cuenta_id=${c.id}`);
        if (!data.partidas?.length) continue;
        const filas = data.partidas.map(r=>`<tr>
          <td>${r.fecha}</td><td>${r.numero}</td>
          <td>${r.concepto}</td><td>${r.descripcion||'—'}</td>
          <td class="r">${r.debe>0?fL(r.debe):'—'}</td>
          <td class="r">${r.haber>0?fL(r.haber):'—'}</td>
          <td class="r" style="font-weight:700">${fL(r.saldo)}</td>
        </tr>`).join('');
        bloques += _htmlMayorCuenta(c, filas, data.total_debe, data.total_haber, true);
      }
      _abrirVentana(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Mayor General</title>
        <style>*{font-family:Arial,sans-serif;font-size:12px}body{padding:20px}
        h2,h3{color:#1e3a5f;text-align:center;margin:4px 0}
        table{width:100%;border-collapse:collapse;margin-bottom:20px}
        th{background:#1e3a5f;color:#fff;padding:7px 9px;text-align:left}
        td{padding:6px 9px;border-bottom:1px solid #f1f5f9}
        .r{text-align:right}.tf td{background:#f0fdf4;font-weight:700}
        tr:nth-child(even) td{background:#f8fafc}
        .cta-titulo{background:#e0f2fe;font-weight:700;padding:8px 10px;color:#0369a1;margin-top:12px;border-radius:4px}
        @media print{@page{margin:12mm}.cta-titulo{page-break-before:auto}}</style>
        </head><body>
        <h2>${EMPRESA?.nombre||''}</h2>
        <h3>Mayor General / Analítico</h3>
        <p style="text-align:center;color:#64748b;font-size:11px">${_repFiltroLabel()}</p>
        ${bloques}
        <script>window.print();<\/script></body></html>`);
    }
  } catch(e){ alert(e.message); }
}

function _htmlMayorCuenta(c, filas, tdebe, thaber, soloTabla=false) {
  const tabla=`<div class="cta-titulo">${c.codigo} — ${c.nombre} &nbsp;|&nbsp; ${c.tipo} &nbsp;|&nbsp; ${c.naturaleza}</div>
    <table>
      <thead><tr>
        <th>Fecha</th><th>Asiento</th><th>Concepto</th><th>Descripción</th>
        <th class="r">Debe</th><th class="r">Haber</th><th class="r">Saldo</th>
      </tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr class="tf">
        <td colspan="4" style="padding:7px 9px;text-align:right">TOTALES</td>
        <td class="r" style="padding:7px 9px">${fL(tdebe)}</td>
        <td class="r" style="padding:7px 9px">${fL(thaber)}</td>
        <td class="r" style="padding:7px 9px"></td>
      </tr></tfoot>
    </table>`;
  if(soloTabla) return tabla;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Mayor — ${c.codigo}</title>
    <style>*{font-family:Arial,sans-serif;font-size:12px}body{padding:20px}
    h2,h3{color:#1e3a5f;text-align:center;margin:4px 0}
    table{width:100%;border-collapse:collapse;margin-top:14px}
    th{background:#1e3a5f;color:#fff;padding:7px 9px;text-align:left}
    td{padding:6px 9px;border-bottom:1px solid #f1f5f9}
    .r{text-align:right}.tf td{background:#f0fdf4;font-weight:700}
    tr:nth-child(even) td{background:#f8fafc}
    .cta-titulo{background:#e0f2fe;font-weight:700;padding:8px 10px;color:#0369a1;border-radius:4px;margin-bottom:4px}
    @media print{@page{margin:12mm}}</style></head><body>
    <h2>${EMPRESA?.nombre||''}</h2>
    <h3>Mayor General</h3>
    <p style="text-align:center;color:#64748b;font-size:11px">${_repFiltroLabel()}</p>
    ${tabla}
    <script>window.print();<\/script></body></html>`;
}

async function excelRepMayor() {
  if (!eid()) return;
  const cuentaId = (document.getElementById('rep-mayor-cuenta')||{}).value||'';
  const p = _repParams();
  try {
    const cuentas = cuentaId
      ? [await GET(`/empresas/${eid()}/cuentas`).then(l=>l.find(c=>c.id===cuentaId))]
      : (await GET(`/empresas/${eid()}/cuentas`)).filter(c=>c.permite_movimiento);
    const rows=[['Cuenta','Fecha','Asiento','Concepto','Descripción','Debe','Haber','Saldo']];
    for (const c of cuentas) {
      if (!c) continue;
      const data = await GET(`/empresas/${eid()}/mayor`, p+`${p?'&':''}cuenta_id=${c.id}`);
      if (!data.partidas?.length) continue;
      data.partidas.forEach(r=>rows.push([
        `${c.codigo} — ${c.nombre}`, r.fecha, r.numero,
        r.concepto, r.descripcion||'',
        parseFloat(r.debe)||0, parseFloat(r.haber)||0, parseFloat(r.saldo)||0
      ]));
      rows.push(['','','','TOTAL','',data.total_debe,data.total_haber,'']);
      rows.push([]);
    }
    xlsxDownload(rows,'Mayor_General');
  } catch(e){ alert(e.message); }
}

// ══ 3. BALANCE DE COMPROBACIÓN ════════════════════════════════════════════════
async function imprimirRepBalComp() {
  if (!eid()) return;
  try {
    const data = await GET(`/empresas/${eid()}/balance_comprobacion`, _repParams());
    let tdebe=0,thaber=0,tdeud=0,tacre=0;
    const filas = data.map(f=>{
      tdebe+=parseFloat(f.total_debe)||0; thaber+=parseFloat(f.total_haber)||0;
      tdeud+=parseFloat(f.saldo_deudor)||0; tacre+=parseFloat(f.saldo_acreedor)||0;
      return `<tr>
        <td style="font-family:monospace;font-weight:600">${f.codigo}</td>
        <td>${f.nombre}</td>
        <td>${TIPO_LABELS[f.tipo]||f.tipo}</td>
        <td class="r">${fL(f.total_debe)}</td>
        <td class="r">${fL(f.total_haber)}</td>
        <td class="r" style="color:#1d4ed8">${f.saldo_deudor>0?fL(f.saldo_deudor):'—'}</td>
        <td class="r" style="color:#dc2626">${f.saldo_acreedor>0?fL(f.saldo_acreedor):'—'}</td>
      </tr>`;
    }).join('');
    const cuadra = Math.abs(tdeud-tacre)<0.01;
    _abrirVentana(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Balance de Comprobación</title>
      <style>*{font-family:Arial,sans-serif;font-size:12px}body{padding:20px}
      h2,h3{color:#1e3a5f;text-align:center;margin:4px 0}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      th{background:#1e3a5f;color:#fff;padding:7px 9px;text-align:left}
      td{padding:6px 9px;border-bottom:1px solid #f1f5f9}
      .r{text-align:right}
      tr:nth-child(even) td{background:#f8fafc}
      .tf td{background:#1e3a5f;color:#fff;font-weight:700;padding:8px 9px}
      .cuadre{text-align:center;padding:8px;font-weight:700;font-size:12px;margin-top:6px;border-radius:4px}
      @media print{@page{size:letter landscape;margin:12mm}}</style>
      </head><body>
      <h2>${EMPRESA?.nombre||''}</h2>
      <h3>Balance de Comprobación</h3>
      <p style="text-align:center;color:#64748b;font-size:11px">${_repFiltroLabel()}</p>
      <table>
        <thead><tr>
          <th>Código</th><th>Cuenta</th><th>Tipo</th>
          <th class="r">Total Debe</th><th class="r">Total Haber</th>
          <th class="r">Saldo Deudor</th><th class="r">Saldo Acreedor</th>
        </tr></thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr class="tf">
            <td colspan="3">TOTALES</td>
            <td class="r">${fL(tdebe)}</td>
            <td class="r">${fL(thaber)}</td>
            <td class="r">${fL(tdeud)}</td>
            <td class="r">${fL(tacre)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="cuadre" style="background:${cuadra?'#f0fdf4':'#fef2f2'};color:${cuadra?'#15803d':'#dc2626'}">
        ${cuadra?'✓ Balance correcto — Saldos Deudores = Saldos Acreedores':'⚠ Diferencia: L. '+Math.abs(tdeud-tacre).toFixed(2)+' — Revisar asientos'}
      </div>
      <script>window.print();<\/script></body></html>`);
  } catch(e){ alert(e.message); }
}

async function excelRepBalComp() {
  if (!eid()) return;
  try {
    const data = await GET(`/empresas/${eid()}/balance_comprobacion`, _repParams());
    let tdebe=0,thaber=0,tdeud=0,tacre=0;
    const rows=[['Código','Cuenta','Tipo','Total Debe','Total Haber','Saldo Deudor','Saldo Acreedor']];
    data.forEach(f=>{
      tdebe+=parseFloat(f.total_debe)||0; thaber+=parseFloat(f.total_haber)||0;
      tdeud+=parseFloat(f.saldo_deudor)||0; tacre+=parseFloat(f.saldo_acreedor)||0;
      rows.push([f.codigo,f.nombre,f.tipo,parseFloat(f.total_debe)||0,parseFloat(f.total_haber)||0,
        parseFloat(f.saldo_deudor)||0,parseFloat(f.saldo_acreedor)||0]);
    });
    rows.push([]);
    rows.push(['','TOTALES','',tdebe,thaber,tdeud,tacre]);
    xlsxDownload(rows,'Balance_Comprobacion');
  } catch(e){ alert(e.message); }
}

// ══ 4. ESTADO DE RESULTADOS ═══════════════════════════════════════════════════
async function imprimirRepResultados() {
  if (!eid()) return;
  try {
    const {detalle:d,totales:t} = await GET(`/empresas/${eid()}/estado_resultados`, _repParams());
    const seccion=(titulo,items,color)=> items.length ? `
      <tr><td colspan="2" style="background:#f0f4ff;font-weight:700;color:#1e3a5f;padding:8px 10px">${titulo}</td></tr>
      ${items.map(f=>`<tr>
        <td style="padding-left:${f.codigo?.split('.').length>2?'22px':'10px'};font-size:12px">${f.codigo} — ${f.nombre}</td>
        <td class="r" style="color:${color}">${fL(f.monto)}</td>
      </tr>`).join('')}` : '';
    _abrirVentana(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Estado de Resultados</title>
      <style>*{font-family:Arial,sans-serif;font-size:12px}body{padding:20px;max-width:700px;margin:0 auto}
      h2,h3{color:#1e3a5f;text-align:center;margin:4px 0}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      td{padding:7px 10px;border-bottom:1px solid #f1f5f9}
      .r{text-align:right}.tot td{background:#1e3a5f;color:#fff;font-weight:700;padding:9px 10px}
      .sub td{background:#ecfdf5;font-weight:700;color:#15803d;padding:9px 10px}
      @media print{@page{margin:14mm}}</style>
      </head><body>
      <h2>${EMPRESA?.nombre||''}</h2>
      <h3>Estado de Resultados</h3>
      <p style="text-align:center;color:#64748b;font-size:11px">${_repFiltroLabel()}</p>
      <table>
        ${seccion('INGRESOS',d.ingreso,'#15803d')}
        <tr class="sub"><td>Total Ingresos</td><td class="r">${fL(t.ingresos)}</td></tr>
        ${seccion('COSTOS',d.costo,'#d97706')}
        <tr class="sub"><td>Total Costos</td><td class="r">${fL(t.costos)}</td></tr>
        <tr style="background:#fef9c3"><td style="padding:8px 10px;font-weight:700">Utilidad Bruta</td>
          <td class="r" style="padding:8px 10px;font-weight:700">${fL(t.utilidad_bruta)}</td></tr>
        ${seccion('GASTOS',d.gasto,'#7c3aed')}
        <tr class="sub"><td>Total Gastos</td><td class="r">${fL(t.gastos)}</td></tr>
        <tr class="tot"><td style="font-size:13px">UTILIDAD NETA DEL PERÍODO</td>
          <td class="r" style="font-size:14px">${fL(t.utilidad_neta)}</td></tr>
      </table>
      <script>window.print();<\/script></body></html>`);
  } catch(e){ alert(e.message); }
}

async function excelRepResultados() {
  if (!eid()) return;
  try {
    const {detalle:d,totales:t} = await GET(`/empresas/${eid()}/estado_resultados`, _repParams());
    const rows=[['Sección','Código','Cuenta','Monto']];
    ['ingreso','costo','gasto'].forEach(tipo=>{
      d[tipo].forEach(f=>rows.push([tipo.toUpperCase(),f.codigo,f.nombre,parseFloat(f.monto)||0]));
    });
    rows.push([]);
    rows.push(['','','Total Ingresos',t.ingresos]);
    rows.push(['','','Total Costos',t.costos]);
    rows.push(['','','Utilidad Bruta',t.utilidad_bruta]);
    rows.push(['','','Total Gastos',t.gastos]);
    rows.push(['','','UTILIDAD NETA',t.utilidad_neta]);
    xlsxDownload(rows,'Estado_Resultados');
  } catch(e){ alert(e.message); }
}

// ══ 5. BALANCE GENERAL ════════════════════════════════════════════════════════
async function imprimirRepBalGen() {
  if (!eid()) return;
  try {
    const {detalle:d,totales:t} = await GET(`/empresas/${eid()}/balance_general`, _repParams());
    const seccion=(titulo,items,color)=> items.length ? `
      <tr><td colspan="2" style="background:#f0f4ff;font-weight:700;color:#1e3a5f;padding:8px 10px">${titulo}</td></tr>
      ${items.map(f=>`<tr>
        <td style="padding-left:${f.codigo?.split('.').length>2?'22px':'10px'};font-size:12px">${f.codigo} — ${f.nombre}</td>
        <td class="r" style="color:${color}">${fL(f.monto)}</td>
      </tr>`).join('')}` : '';
    const cuadra=Math.abs(t.activo-t.pasivo_capital)<0.01;
    _abrirVentana(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Balance General</title>
      <style>*{font-family:Arial,sans-serif;font-size:12px}body{padding:20px;max-width:700px;margin:0 auto}
      h2,h3{color:#1e3a5f;text-align:center;margin:4px 0}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      td{padding:7px 10px;border-bottom:1px solid #f1f5f9}
      .r{text-align:right}.tot td{background:#1e3a5f;color:#fff;font-weight:700;padding:9px 10px}
      .sub td{background:#ecfdf5;font-weight:700;color:#15803d;padding:9px 10px}
      .cuadre{text-align:center;padding:8px;font-weight:700;margin-top:6px;border-radius:4px;font-size:12px}
      @media print{@page{margin:14mm}}</style>
      </head><body>
      <h2>${EMPRESA?.nombre||''}</h2>
      <h3>Balance General</h3>
      <p style="text-align:center;color:#64748b;font-size:11px">${_repFiltroLabel()}</p>
      <table>
        ${seccion('ACTIVO',d.activo,'#1d4ed8')}
        <tr class="sub"><td>TOTAL ACTIVO</td><td class="r">${fL(t.activo)}</td></tr>
        ${seccion('PASIVO',d.pasivo,'#dc2626')}
        <tr class="sub"><td>Total Pasivo</td><td class="r">${fL(t.pasivo)}</td></tr>
        ${seccion('CAPITAL',d.capital,'#7c3aed')}
        <tr class="sub"><td>Total Capital</td><td class="r">${fL(t.capital)}</td></tr>
        <tr class="tot"><td>TOTAL PASIVO + CAPITAL</td><td class="r">${fL(t.pasivo_capital)}</td></tr>
      </table>
      <div class="cuadre" style="background:${cuadra?'#f0fdf4':'#fef2f2'};color:${cuadra?'#15803d':'#dc2626'}">
        ${cuadra?'✓ Balance cuadra correctamente':'⚠ Diferencia: L. '+Math.abs(t.activo-t.pasivo_capital).toFixed(2)}
      </div>
      <script>window.print();<\/script></body></html>`);
  } catch(e){ alert(e.message); }
}

async function excelRepBalGen() {
  if (!eid()) return;
  try {
    const {detalle:d,totales:t} = await GET(`/empresas/${eid()}/balance_general`, _repParams());
    const rows=[['Sección','Código','Cuenta','Monto']];
    ['activo','pasivo','capital'].forEach(tipo=>{
      d[tipo].forEach(f=>rows.push([tipo.toUpperCase(),f.codigo,f.nombre,parseFloat(f.monto)||0]));
      rows.push(['','','Total '+tipo.charAt(0).toUpperCase()+tipo.slice(1),
        tipo==='activo'?t.activo:tipo==='pasivo'?t.pasivo:t.capital]);
      rows.push([]);
    });
    rows.push(['','','TOTAL PASIVO + CAPITAL',t.pasivo_capital]);
    xlsxDownload(rows,'Balance_General');
  } catch(e){ alert(e.message); }
}

// ══ 6. ESTADO DE GANANCIAS Y PÉRDIDAS (acumulado multi-período) ══════════════
async function imprimirRepGanPerd() {
  if (!eid()) return;
  try {
    // Usa el mismo endpoint de estado_resultados con filtro de fechas libre
    const {detalle:d,totales:t} = await GET(`/empresas/${eid()}/estado_resultados`, _repParams());
    const seccion=(titulo,items,color)=> items.length ? `
      <tr><td colspan="2" style="background:#f0f4ff;font-weight:700;color:#1e3a5f;padding:8px 10px">${titulo}</td></tr>
      ${items.map(f=>`<tr>
        <td style="padding-left:${f.codigo?.split('.').length>2?'22px':'10px'}">${f.codigo} — ${f.nombre}</td>
        <td class="r" style="color:${color}">${fL(f.monto)}</td>
      </tr>`).join('')}` : '';
    _abrirVentana(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Estado de Ganancias y Pérdidas</title>
      <style>*{font-family:Arial,sans-serif;font-size:12px}body{padding:20px;max-width:700px;margin:0 auto}
      h2,h3{color:#1e3a5f;text-align:center;margin:4px 0}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      td{padding:7px 10px;border-bottom:1px solid #f1f5f9}
      .r{text-align:right}
      .tot td{background:${t.utilidad_neta>=0?'#1e3a5f':'#991b1b'};color:#fff;font-weight:700;padding:11px 10px}
      .sub td{background:#ecfdf5;font-weight:700;color:#15803d;padding:9px 10px}
      @media print{@page{margin:14mm}}</style>
      </head><body>
      <h2>${EMPRESA?.nombre||''}</h2>
      <h3>Estado de Ganancias y Pérdidas</h3>
      <p style="text-align:center;color:#64748b;font-size:11px">${_repFiltroLabel()}</p>
      <table>
        ${seccion('INGRESOS',d.ingreso,'#15803d')}
        <tr class="sub"><td>Total Ingresos</td><td class="r">${fL(t.ingresos)}</td></tr>
        ${seccion('COSTOS',d.costo,'#d97706')}
        <tr class="sub"><td>Total Costos</td><td class="r">${fL(t.costos)}</td></tr>
        <tr style="background:#fef9c3"><td style="padding:8px 10px;font-weight:700">Utilidad Bruta</td>
          <td class="r" style="padding:8px 10px;font-weight:700">${fL(t.utilidad_bruta)}</td></tr>
        ${seccion('GASTOS',d.gasto,'#7c3aed')}
        <tr class="sub"><td>Total Gastos</td><td class="r">${fL(t.gastos)}</td></tr>
        <tr class="tot">
          <td style="font-size:14px">${t.utilidad_neta>=0?'🟢 GANANCIA NETA DEL PERÍODO':'🔴 PÉRDIDA NETA DEL PERÍODO'}</td>
          <td class="r" style="font-size:15px">${fL(Math.abs(t.utilidad_neta))}</td>
        </tr>
      </table>
      <script>window.print();<\/script></body></html>`);
  } catch(e){ alert(e.message); }
}

async function excelRepGanPerd() {
  if (!eid()) return;
  try {
    const {detalle:d,totales:t} = await GET(`/empresas/${eid()}/estado_resultados`, _repParams());
    const rows=[['Sección','Código','Cuenta','Monto']];
    ['ingreso','costo','gasto'].forEach(tipo=>{
      d[tipo].forEach(f=>rows.push([tipo.toUpperCase(),f.codigo,f.nombre,parseFloat(f.monto)||0]));
    });
    rows.push([]);
    rows.push(['','','Total Ingresos',t.ingresos]);
    rows.push(['','','Total Costos',t.costos]);
    rows.push(['','','Utilidad Bruta',t.utilidad_bruta]);
    rows.push(['','','Total Gastos',t.gastos]);
    rows.push(['','',t.utilidad_neta>=0?'GANANCIA NETA':'PÉRDIDA NETA',t.utilidad_neta]);
    xlsxDownload(rows,'Ganancias_y_Perdidas');
  } catch(e){ alert(e.message); }
}

// ══ 7. COMPROBANTES / DIARIO GENERAL ═════════════════════════════════════════
async function imprimirRepComprobantes() {
  if (!eid()) return;
  try {
    const asientos = await GET(`/empresas/${eid()}/asientos`, _repParams()+((_repParams()?'&':'')+'estado=contabilizado&limit=500'));
    const bloques = asientos.map(a=>{
      let tdebe=0, thaber=0;
      const partidas = (a.partidas||[]).map(p=>{
        tdebe+=parseFloat(p.debe)||0; thaber+=parseFloat(p.haber)||0;
        return `<tr>
          <td style="padding-left:14px;font-family:monospace;font-size:11px">${p.cuenta_codigo||''}</td>
          <td style="padding-left:14px">${p.cuenta_nombre||''}</td>
          <td style="padding-left:14px;color:#64748b">${p.descripcion||''}</td>
          <td class="r" style="color:#1d4ed8">${p.debe>0?fL(p.debe):''}</td>
          <td class="r" style="color:#dc2626">${p.haber>0?fL(p.haber):''}</td>
        </tr>`;
      }).join('');
      return `<div style="border:1px solid #e2e8f0;border-radius:6px;margin-bottom:14px;overflow:hidden;page-break-inside:avoid">
        <div style="background:#f8fafc;padding:9px 12px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <div><span style="font-weight:700;color:#1e3a5f">Asiento #${a.numero}</span>
            &nbsp;—&nbsp;<span style="color:#64748b">${a.fecha}</span>
            &nbsp;—&nbsp;<span>${a.concepto}</span>
            ${a.referencia?`&nbsp;|&nbsp;<span style="color:#64748b;font-size:11px">${a.referencia}</span>`:''}
          </div>
          <div style="font-size:11px;color:#059669;font-weight:600">${a.tipo}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f0f4ff">
            <th style="padding:6px 10px;text-align:left;width:90px">Código</th>
            <th style="padding:6px 10px;text-align:left">Cuenta</th>
            <th style="padding:6px 10px;text-align:left">Descripción</th>
            <th style="padding:6px 10px;text-align:right;width:110px;color:#1d4ed8">Debe</th>
            <th style="padding:6px 10px;text-align:right;width:110px;color:#dc2626">Haber</th>
          </tr></thead>
          <tbody>${partidas}</tbody>
          <tfoot><tr style="background:#1e3a5f;color:#fff">
            <td colspan="3" style="padding:7px 10px;font-weight:700;text-align:right">TOTALES</td>
            <td class="r" style="padding:7px 10px;font-weight:700">${fL(tdebe)}</td>
            <td class="r" style="padding:7px 10px;font-weight:700">${fL(thaber)}</td>
          </tr></tfoot>
        </table>
      </div>`;
    }).join('');
    _abrirVentana(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Comprobantes — Diario General</title>
      <style>*{font-family:Arial,sans-serif;font-size:12px}body{padding:20px}
      h2,h3{color:#1e3a5f;text-align:center;margin:4px 0}
      .r{text-align:right}
      @media print{@page{margin:12mm}.page-break{page-break-before:always}}</style>
      </head><body>
      <h2>${EMPRESA?.nombre||''}</h2>
      <h3>Comprobantes — Diario General</h3>
      <p style="text-align:center;color:#64748b;font-size:11px;margin-bottom:18px">${_repFiltroLabel()}</p>
      ${bloques||'<p style="text-align:center;color:#94a3b8">Sin comprobantes en el período seleccionado</p>'}
      <script>window.print();<\/script></body></html>`);
  } catch(e){ alert(e.message); }
}

async function excelRepComprobantes() {
  if (!eid()) return;
  try {
    const asientos = await GET(`/empresas/${eid()}/asientos`, _repParams()+((_repParams()?'&':'')+'estado=contabilizado&limit=500'));
    const rows=[['Asiento','Fecha','Concepto','Referencia','Tipo','Cuenta Código','Cuenta Nombre','Descripción Partida','Debe','Haber']];
    asientos.forEach(a=>{
      (a.partidas||[]).forEach(p=>{
        rows.push([a.numero,a.fecha,a.concepto,a.referencia||'',a.tipo,
          p.cuenta_codigo||'',p.cuenta_nombre||'',p.descripcion||'',
          parseFloat(p.debe)||0,parseFloat(p.haber)||0]);
      });
      rows.push([]);
    });
    xlsxDownload(rows,'Comprobantes_Diario');
  } catch(e){ alert(e.message); }
}
