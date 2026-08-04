'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const helmet   = require('helmet');
const path     = require('path');
const fs       = require('fs');
const { v4: uuid } = require('uuid');

function nowHN()   { const d=new Date(); d.setHours(d.getHours()-6); return d.toISOString().replace('T',' ').substring(0,19); }
function todayHN() { const d=new Date(); d.setHours(d.getHours()-6); return d.toISOString().substring(0,10); }

const initSqlJs = require('sql.js');
const app  = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'metric_contab_2026_hn';
// Ruta de BD: usa variable de entorno del volumen Railway si existe
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
               || process.env.DATA_DIR
               || path.join(__dirname,'data');
const DB_FILE  = path.join(DATA_DIR,'contab.db');
console.log('📁 DB path:', DB_FILE);

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit:'10mb' }));
app.use(express.static(path.join(__dirname,'public')));

let db; let SQL;

async function initDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive:true});
  SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) { db=new SQL.Database(fs.readFileSync(DB_FILE)); console.log('📂 DB cargada'); }
  else { db=new SQL.Database(); console.log('🆕 DB nueva'); }
  createSchema(); seedData(); saveDB();
}
function saveDB() { fs.writeFileSync(DB_FILE, Buffer.from(db.export())); }
setInterval(saveDB, 30000);
function run(sql,p=[]){ db.run(sql,p); }
function all(sql,p=[]){ const s=db.prepare(sql),r=[]; s.bind(p); while(s.step()) r.push(s.getAsObject()); s.free(); return r; }
function get(sql,p=[]){ return all(sql,p)[0]||null; }

// ── SCHEMA ────────────────────────────────────────────────────────────────────
function createSchema() {
  run(`PRAGMA foreign_keys=ON`);

  // Empresas (multiempresa — el núcleo)
  run(`CREATE TABLE IF NOT EXISTS empresas(
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    nombre_comercial TEXT,
    rtn TEXT,
    direccion TEXT,
    telefono TEXT,
    email TEXT,
    regimen TEXT DEFAULT 'mercantil',
    moneda TEXT DEFAULT 'HNL',
    logo TEXT,
    activa INTEGER DEFAULT 1,
    creado TEXT DEFAULT(datetime('now','-6 hours'))
  )`);

  // Usuarios del sistema (globales, con acceso por empresa)
  run(`CREATE TABLE IF NOT EXISTS usuarios(
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN('superadmin','admin','contador','supervisor')),
    activo INTEGER DEFAULT 1,
    creado TEXT DEFAULT(datetime('now','-6 hours'))
  )`);

  // Acceso usuario↔empresa (un usuario puede acceder a varias empresas)
  run(`CREATE TABLE IF NOT EXISTS usuario_empresas(
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id),
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    rol_empresa TEXT DEFAULT 'contador' CHECK(rol_empresa IN('admin','contador','supervisor')),
    UNIQUE(usuario_id, empresa_id)
  )`);

  // Plan de cuentas (por empresa)
  run(`CREATE TABLE IF NOT EXISTS cuentas(
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN('activo','pasivo','capital','ingreso','costo','gasto')),
    naturaleza TEXT NOT NULL CHECK(naturaleza IN('deudora','acreedora')),
    nivel INTEGER NOT NULL DEFAULT 1,
    padre_id TEXT REFERENCES cuentas(id),
    permite_movimiento INTEGER DEFAULT 1,
    activa INTEGER DEFAULT 1,
    creado TEXT DEFAULT(datetime('now','-6 hours')),
    UNIQUE(empresa_id, codigo)
  )`);

  // Períodos contables (por empresa)
  run(`CREATE TABLE IF NOT EXISTS periodos(
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    anio INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    estado TEXT DEFAULT 'abierto' CHECK(estado IN('abierto','cerrado')),
    fecha_cierre TEXT,
    UNIQUE(empresa_id, anio, mes)
  )`);

  // Asientos contables encabezado (por empresa)
  run(`CREATE TABLE IF NOT EXISTS asientos(
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    periodo_id TEXT NOT NULL REFERENCES periodos(id),
    numero INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    concepto TEXT NOT NULL,
    referencia TEXT,
    tipo TEXT DEFAULT 'manual' CHECK(tipo IN('manual','automatico','apertura','cierre','ajuste')),
    estado TEXT DEFAULT 'borrador' CHECK(estado IN('borrador','contabilizado','anulado')),
    usuario_id TEXT REFERENCES usuarios(id),
    creado TEXT DEFAULT(datetime('now','-6 hours')),
    UNIQUE(empresa_id, numero)
  )`);

  // Partidas del asiento (partida doble — por empresa implícito via asiento)
  run(`CREATE TABLE IF NOT EXISTS asiento_partidas(
    id TEXT PRIMARY KEY,
    asiento_id TEXT NOT NULL REFERENCES asientos(id) ON DELETE CASCADE,
    cuenta_id TEXT NOT NULL REFERENCES cuentas(id),
    debe REAL DEFAULT 0,
    haber REAL DEFAULT 0,
    descripcion TEXT,
    centro_costo TEXT
  )`);

  // Centros de costo (por empresa)
  run(`CREATE TABLE IF NOT EXISTS centros_costo(
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    activo INTEGER DEFAULT 1,
    UNIQUE(empresa_id, codigo)
  )`);

  // Contador de asientos por empresa
  run(`CREATE TABLE IF NOT EXISTS contadores_asiento(
    empresa_id TEXT PRIMARY KEY REFERENCES empresas(id),
    valor INTEGER DEFAULT 0
  )`);

  // ── FASE 2: Activos Fijos ──────────────────────────────────────────────────
  run(`CREATE TABLE IF NOT EXISTS activos_fijos(
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL CHECK(categoria IN('edificio','equipo_computo','mobiliario','vehiculo','maquinaria','otro')),
    cuenta_activo_id TEXT REFERENCES cuentas(id),
    cuenta_dep_acum_id TEXT REFERENCES cuentas(id),
    cuenta_gasto_dep_id TEXT REFERENCES cuentas(id),
    valor_compra REAL DEFAULT 0,
    valor_residual REAL DEFAULT 0,
    vida_util_anios INTEGER DEFAULT 5,
    metodo TEXT DEFAULT 'linea_recta' CHECK(metodo IN('linea_recta','saldo_decreciente')),
    fecha_compra TEXT NOT NULL,
    fecha_inicio_dep TEXT,
    dep_acumulada REAL DEFAULT 0,
    valor_neto REAL DEFAULT 0,
    estado TEXT DEFAULT 'activo' CHECK(estado IN('activo','vendido','desechado')),
    activo INTEGER DEFAULT 1,
    creado TEXT DEFAULT(datetime('now','-6 hours')),
    UNIQUE(empresa_id, codigo)
  )`);

  run(`CREATE TABLE IF NOT EXISTS depreciaciones(
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    activo_id TEXT NOT NULL REFERENCES activos_fijos(id),
    periodo_id TEXT NOT NULL REFERENCES periodos(id),
    asiento_id TEXT REFERENCES asientos(id),
    monto REAL DEFAULT 0,
    dep_acum_al_periodo REAL DEFAULT 0,
    creado TEXT DEFAULT(datetime('now','-6 hours')),
    UNIQUE(activo_id, periodo_id)
  )`);

  // ── FASE 2: Cierre Contable ─────────────────────────────────────────────────
  run(`CREATE TABLE IF NOT EXISTS cierres(
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    periodo_id TEXT NOT NULL REFERENCES periodos(id),
    tipo TEXT DEFAULT 'mensual' CHECK(tipo IN('mensual','anual')),
    asiento_cierre_id TEXT REFERENCES asientos(id),
    utilidad_neta REAL DEFAULT 0,
    ingresos REAL DEFAULT 0,
    costos REAL DEFAULT 0,
    gastos REAL DEFAULT 0,
    usuario_id TEXT REFERENCES usuarios(id),
    creado TEXT DEFAULT(datetime('now','-6 hours')),
    UNIQUE(empresa_id, periodo_id, tipo)
  )`);

  // ── FASE 2: Config SAR por empresa ──────────────────────────────────────────
  run(`CREATE TABLE IF NOT EXISTS config_sar(
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL UNIQUE REFERENCES empresas(id),
    regimen TEXT DEFAULT 'mercantil',
    tasa_isv REAL DEFAULT 15,
    tasa_isr REAL DEFAULT 25,
    declara_isv INTEGER DEFAULT 1,
    declara_isr INTEGER DEFAULT 1,
    inicio_fiscal INTEGER DEFAULT 1,
    actualizado TEXT DEFAULT(datetime('now','-6 hours'))
  )`);

  // ── FASE 3: Integración Metric POS ─────────────────────────────────────────
  // Conexiones POS configuradas por empresa
  run(`CREATE TABLE IF NOT EXISTS pos_conexiones(
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    nombre TEXT NOT NULL,
    pos_url TEXT NOT NULL,
    pos_token TEXT,
    sucursal_pos_id TEXT,
    activa INTEGER DEFAULT 1,
    ultima_sync TEXT,
    creado TEXT DEFAULT(datetime('now','-6 hours')),
    UNIQUE(empresa_id, pos_url)
  )`);

  // Reglas de mapeo: evento POS → cuentas contables
  run(`CREATE TABLE IF NOT EXISTS pos_reglas(
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    evento TEXT NOT NULL CHECK(evento IN(
      'venta_efectivo','venta_tarjeta','venta_transferencia','venta_credito',
      'cobro_cxc','pago_cxp','devolucion','compra_inventario'
    )),
    cta_debito_id TEXT REFERENCES cuentas(id),
    cta_credito_id TEXT REFERENCES cuentas(id),
    cta_isv15_id TEXT REFERENCES cuentas(id),
    cta_isv18_id TEXT REFERENCES cuentas(id),
    cta_descuento_id TEXT REFERENCES cuentas(id),
    cta_costo_id TEXT REFERENCES cuentas(id),
    cta_inventario_id TEXT REFERENCES cuentas(id),
    descripcion TEXT,
    activa INTEGER DEFAULT 1,
    UNIQUE(empresa_id, evento)
  )`);

  // Log de transacciones sincronizadas (evita duplicados)
  run(`CREATE TABLE IF NOT EXISTS pos_sync_log(
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    conexion_id TEXT REFERENCES pos_conexiones(id),
    pos_id TEXT NOT NULL,
    tipo TEXT NOT NULL,
    asiento_id TEXT REFERENCES asientos(id),
    estado TEXT DEFAULT 'ok' CHECK(estado IN('ok','error','ignorado')),
    detalle TEXT,
    fecha TEXT DEFAULT(datetime('now','-6 hours')),
    UNIQUE(empresa_id, pos_id, tipo)
  )`);

  // Licencias (sistema global)
  // Libro de Compras ISV Honduras
  run(`CREATE TABLE IF NOT EXISTS compras(
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    fecha TEXT NOT NULL,
    proveedor_rtn TEXT DEFAULT '',
    proveedor_nombre TEXT NOT NULL,
    numero_documento TEXT DEFAULT '',
    cai TEXT DEFAULT '',
    monto_total REAL DEFAULT 0,
    compras_exentas REAL DEFAULT 0,
    base_gravada_15 REAL DEFAULT 0,
    isv_15 REAL DEFAULT 0,
    base_gravada_18 REAL DEFAULT 0,
    isv_18 REAL DEFAULT 0,
    asiento_id TEXT REFERENCES asientos(id),
    estado TEXT DEFAULT 'activa' CHECK(estado IN('activa','anulada')),
    creado TEXT DEFAULT(datetime('now','-6 hours'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS licencias(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clave TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL,
    fecha_activacion TEXT,
    fecha_vencimiento TEXT,
    activa INTEGER DEFAULT 1,
    creado TEXT DEFAULT(datetime('now','-6 hours'))
  )`);

  // Asegurar período del mes actual para cada empresa existente
  const empresasExist = all(`SELECT id FROM empresas`);
  const hoy = todayHN();
  for (const e of empresasExist) _asegurarPeriodo(e.id, hoy);

  console.log('✅ Esquema OK');
}

function _asegurarPeriodo(empresa_id, fecha) {
  const anio = parseInt(fecha.substring(0,4));
  const mes  = parseInt(fecha.substring(5,7));
  const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const existe = get(`SELECT id FROM periodos WHERE empresa_id=? AND anio=? AND mes=?`,[empresa_id,anio,mes]);
  if (!existe) {
    const pid = uuid();
    run(`INSERT INTO periodos(id,empresa_id,anio,mes,nombre,estado) VALUES(?,?,?,?,?,?)`,
      [pid,empresa_id,anio,mes,`${meses[mes]} ${anio}`,'abierto']);
    return pid;
  }
  return existe.id;
}

function _nextNumAsiento(empresa_id) {
  run(`INSERT OR IGNORE INTO contadores_asiento(empresa_id,valor) VALUES(?,0)`,[empresa_id]);
  run(`UPDATE contadores_asiento SET valor=valor+1 WHERE empresa_id=?`,[empresa_id]);
  return get(`SELECT valor FROM contadores_asiento WHERE empresa_id=?`,[empresa_id]).valor;
}

// ── PLAN DE CUENTAS CCPH HONDURAS (seed por empresa) ─────────────────────────
const PLAN_BASE = [
  // [codigo, nombre, tipo, naturaleza, nivel, cod_padre, permite_mov]
  ['1',      'ACTIVO',                        'activo',  'deudora',   1, null,  0],
  ['1.1',    'Activo Corriente',              'activo',  'deudora',   2, '1',   0],
  ['1.1.01', 'Caja General',                 'activo',  'deudora',   3, '1.1', 1],
  ['1.1.02', 'Caja Chica',                   'activo',  'deudora',   3, '1.1', 1],
  ['1.1.03', 'Banco Corriente',              'activo',  'deudora',   3, '1.1', 1],
  ['1.1.04', 'Banco Ahorro',                 'activo',  'deudora',   3, '1.1', 1],
  ['1.1.05', 'Cuentas por Cobrar Clientes',  'activo',  'deudora',   3, '1.1', 1],
  ['1.1.06', 'Inventario de Mercancías',     'activo',  'deudora',   3, '1.1', 1],
  ['1.1.07', 'ISV Acreditable (Compras)',    'activo',  'deudora',   3, '1.1', 1],
  ['1.1.08', 'Anticipo a Proveedores',       'activo',  'deudora',   3, '1.1', 1],
  ['1.1.09', 'Gastos Pagados por Adelantado','activo',  'deudora',   3, '1.1', 1],
  ['1.2',    'Activo No Corriente',           'activo',  'deudora',   2, '1',   0],
  ['1.2.01', 'Terrenos',                      'activo',  'deudora',   3, '1.2', 1],
  ['1.2.02', 'Edificios',                     'activo',  'deudora',   3, '1.2', 1],
  ['1.2.03', 'Equipo de Cómputo',            'activo',  'deudora',   3, '1.2', 1],
  ['1.2.04', 'Mobiliario y Equipo',          'activo',  'deudora',   3, '1.2', 1],
  ['1.2.05', 'Vehículos',                    'activo',  'deudora',   3, '1.2', 1],
  ['1.2.06', 'Dep. Acum. Equipo Cómputo',   'activo',  'acreedora', 3, '1.2', 1],
  ['1.2.07', 'Dep. Acum. Mobiliario',        'activo',  'acreedora', 3, '1.2', 1],
  ['1.2.08', 'Dep. Acum. Vehículos',         'activo',  'acreedora', 3, '1.2', 1],
  ['2',      'PASIVO',                        'pasivo',  'acreedora', 1, null,  0],
  ['2.1',    'Pasivo Corriente',              'pasivo',  'acreedora', 2, '2',   0],
  ['2.1.01', 'Cuentas por Pagar Proveedores','pasivo',  'acreedora', 3, '2.1', 1],
  ['2.1.02', 'ISV por Pagar 15%',            'pasivo',  'acreedora', 3, '2.1', 1],
  ['2.1.03', 'ISV por Pagar 18%',            'pasivo',  'acreedora', 3, '2.1', 1],
  ['2.1.04', 'Sueldos por Pagar',            'pasivo',  'acreedora', 3, '2.1', 1],
  ['2.1.05', 'Retenciones ISR por Pagar',    'pasivo',  'acreedora', 3, '2.1', 1],
  ['2.1.06', 'RAP por Pagar',                'pasivo',  'acreedora', 3, '2.1', 1],
  ['2.1.07', 'IHSS por Pagar',               'pasivo',  'acreedora', 3, '2.1', 1],
  ['2.1.08', 'Préstamos Bancarios C.P.',     'pasivo',  'acreedora', 3, '2.1', 1],
  ['2.1.09', 'Anticipo de Clientes',         'pasivo',  'acreedora', 3, '2.1', 1],
  ['2.2',    'Pasivo No Corriente',           'pasivo',  'acreedora', 2, '2',   0],
  ['2.2.01', 'Préstamos Bancarios L.P.',     'pasivo',  'acreedora', 3, '2.2', 1],
  ['2.2.02', 'Hipotecas por Pagar',          'pasivo',  'acreedora', 3, '2.2', 1],
  ['3',      'CAPITAL',                       'capital', 'acreedora', 1, null,  0],
  ['3.1',    'Capital Contable',              'capital', 'acreedora', 2, '3',   0],
  ['3.1.01', 'Capital Social',               'capital', 'acreedora', 3, '3.1', 1],
  ['3.1.02', 'Reserva Legal',                'capital', 'acreedora', 3, '3.1', 1],
  ['3.1.03', 'Utilidades Retenidas',         'capital', 'acreedora', 3, '3.1', 1],
  ['3.1.04', 'Utilidad del Ejercicio',       'capital', 'acreedora', 3, '3.1', 1],
  ['3.1.05', 'Pérdida del Ejercicio',        'capital', 'deudora',   3, '3.1', 1],
  ['4',      'INGRESOS',                      'ingreso', 'acreedora', 1, null,  0],
  ['4.1',    'Ingresos Operacionales',        'ingreso', 'acreedora', 2, '4',   0],
  ['4.1.01', 'Ventas de Mercancías',         'ingreso', 'acreedora', 3, '4.1', 1],
  ['4.1.02', 'Ventas de Servicios',          'ingreso', 'acreedora', 3, '4.1', 1],
  ['4.1.03', 'Devoluciones en Ventas',       'ingreso', 'deudora',   3, '4.1', 1],
  ['4.1.04', 'Descuentos en Ventas',         'ingreso', 'deudora',   3, '4.1', 1],
  ['4.2',    'Ingresos No Operacionales',     'ingreso', 'acreedora', 2, '4',   0],
  ['4.2.01', 'Ingresos Financieros',         'ingreso', 'acreedora', 3, '4.2', 1],
  ['4.2.02', 'Otros Ingresos',               'ingreso', 'acreedora', 3, '4.2', 1],
  ['5',      'COSTOS',                        'costo',   'deudora',   1, null,  0],
  ['5.1',    'Costo de Ventas',              'costo',   'deudora',   2, '5',   0],
  ['5.1.01', 'Costo de Mercancías Vendidas', 'costo',   'deudora',   3, '5.1', 1],
  ['5.1.02', 'Costo de Servicios Prestados', 'costo',   'deudora',   3, '5.1', 1],
  ['6',      'GASTOS',                        'gasto',   'deudora',   1, null,  0],
  ['6.1',    'Gastos de Operación',           'gasto',   'deudora',   2, '6',   0],
  ['6.1.01', 'Sueldos y Salarios',           'gasto',   'deudora',   3, '6.1', 1],
  ['6.1.02', 'Beneficios Sociales',          'gasto',   'deudora',   3, '6.1', 1],
  ['6.1.03', 'Alquiler de Local',            'gasto',   'deudora',   3, '6.1', 1],
  ['6.1.04', 'Servicios Públicos',           'gasto',   'deudora',   3, '6.1', 1],
  ['6.1.05', 'Publicidad y Mercadeo',        'gasto',   'deudora',   3, '6.1', 1],
  ['6.1.06', 'Gastos de Transporte',         'gasto',   'deudora',   3, '6.1', 1],
  ['6.1.07', 'Depreciaciones',               'gasto',   'deudora',   3, '6.1', 1],
  ['6.1.08', 'Amortizaciones',               'gasto',   'deudora',   3, '6.1', 1],
  ['6.1.09', 'Mantenimiento y Reparaciones', 'gasto',   'deudora',   3, '6.1', 1],
  ['6.1.10', 'Papelería y Útiles de Oficina','gasto',   'deudora',   3, '6.1', 1],
  ['6.2',    'Gastos Financieros',           'gasto',   'deudora',   2, '6',   0],
  ['6.2.01', 'Intereses Bancarios',          'gasto',   'deudora',   3, '6.2', 1],
  ['6.2.02', 'Comisiones Bancarias',         'gasto',   'deudora',   3, '6.2', 1],
  ['6.3',    'Gastos No Operacionales',       'gasto',   'deudora',   2, '6',   0],
  ['6.3.01', 'Pérdidas en Venta de Activos', 'gasto',   'deudora',   3, '6.3', 1],
  ['6.3.02', 'Multas y Recargos',            'gasto',   'deudora',   3, '6.3', 1],
  // Cierre contable
  ['3.1.06', 'Resumen de Rentas y Gastos',   'capital', 'acreedora', 3, '3.1', 1],
];

function _seedPlanCuentas(empresa_id) {
  // Mapa código→id para armar jerarquía
  const idMap = {};
  for (const [cod,nom,tipo,nat,nivel,codPadre,perMov] of PLAN_BASE) {
    const id = uuid();
    idMap[cod] = id;
    const padre_id = codPadre ? idMap[codPadre] : null;
    run(`INSERT OR IGNORE INTO cuentas(id,empresa_id,codigo,nombre,tipo,naturaleza,nivel,padre_id,permite_movimiento)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      [id,empresa_id,cod,nom,tipo,nat,nivel,padre_id,perMov]);
  }
}

function seedData() {
  if (get(`SELECT id FROM usuarios LIMIT 1`)) return;

  // Superadmin
  const uid = uuid();
  run(`INSERT INTO usuarios(id,nombre,username,password,rol) VALUES(?,?,?,?,?)`,
    [uid,'Super Administrador','admin',bcrypt.hashSync('admin123',10),'superadmin']);

  // Empresa demo
  const eid = uuid();
  run(`INSERT INTO empresas(id,nombre,nombre_comercial,rtn,direccion,telefono) VALUES(?,?,?,?,?,?)`,
    [eid,'MI EMPRESA S. DE R.L.','Mi Empresa','08011985024566','Tegucigalpa, Honduras','2234-5678']);

  // Acceso del admin a la empresa
  run(`INSERT INTO usuario_empresas(id,usuario_id,empresa_id,rol_empresa) VALUES(?,?,?,?)`,
    [uuid(),uid,eid,'admin']);

  // Contador de asientos
  run(`INSERT OR IGNORE INTO contadores_asiento(empresa_id,valor) VALUES(?,0)`,[eid]);

  // Plan de cuentas CCPH
  _seedPlanCuentas(eid);

  // Período actual
  _asegurarPeriodo(eid, todayHN());

  // Reglas de mapeo POS por defecto para empresa demo
  _seedReglasPOS(eid);

  saveDB();
  console.log('✅ Datos iniciales — admin/admin123');
}

function _seedReglasPOS(empresa_id) {
  if (get(`SELECT id FROM pos_reglas WHERE empresa_id=? LIMIT 1`, [empresa_id])) return;
  // Obtener IDs de cuentas clave del plan CCPH
  const ctas = {};
  const claves = {
    caja:'1.1.01', banco:'1.1.03', cxc:'1.1.05', inv:'1.1.06',
    isv15:'2.1.02', isv18:'2.1.03', cxp:'2.1.01',
    ventas:'4.1.01', devoluciones:'4.1.03', costo:'5.1.01',
    descuento:'4.1.04'
  };
  for (const [k, cod] of Object.entries(claves)) {
    const c = get(`SELECT id FROM cuentas WHERE empresa_id=? AND codigo=?`, [empresa_id, cod]);
    if (c) ctas[k] = c.id;
  }
  const reglas = [
    ['venta_efectivo',     ctas.caja,    ctas.ventas,     '🏪 Venta contado efectivo → Caja / Ventas + ISV'],
    ['venta_tarjeta',      ctas.banco,   ctas.ventas,     '💳 Venta tarjeta → Banco / Ventas + ISV'],
    ['venta_transferencia',ctas.banco,   ctas.ventas,     '🏦 Venta transferencia → Banco / Ventas + ISV'],
    ['venta_credito',      ctas.cxc,     ctas.ventas,     '📋 Venta crédito → CxC / Ventas + ISV'],
    ['cobro_cxc',          ctas.caja,    ctas.cxc,        '💵 Cobro CxC → Caja / CxC Clientes'],
    ['pago_cxp',           ctas.cxp,    ctas.banco,      '🏧 Pago a proveedor → CxP / Banco'],
    ['devolucion',         ctas.devoluciones, ctas.caja,  '↩️ Devolución → Devoluciones / Caja'],
    ['compra_inventario',  ctas.inv,     ctas.cxp,       '📦 Compra inventario → Inventario / CxP'],
  ];
  for (const [evento, deb, cred, desc] of reglas) {
    if (!deb || !cred) continue;
    run(`INSERT OR IGNORE INTO pos_reglas(id,empresa_id,evento,cta_debito_id,cta_credito_id,
         cta_isv15_id,cta_isv18_id,cta_descuento_id,cta_costo_id,cta_inventario_id,descripcion)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [uuid(),empresa_id,evento,deb,cred,
       ctas.isv15||null, ctas.isv18||null,
       ctas.descuento||null, ctas.costo||null, ctas.inv||null, desc]);
  }
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function auth(roles=[]) {
  return (req,res,next) => {
    const t = req.headers.authorization?.split(' ')[1];
    if (!t) return res.status(401).json({error:'Token requerido'});
    try {
      const p = jwt.verify(t, JWT_SECRET);
      req.user = p;
      if (roles.length && !roles.includes(p.rol)) return res.status(403).json({error:'Sin permiso'});
      next();
    } catch(e) { return res.status(401).json({error: e.name==='TokenExpiredError'?'Sesión expirada — vuelve a iniciar sesión':'Token inválido'}); }
  };
}

// Middleware: verifica que el usuario tenga acceso a la empresa del request
function authEmpresa() {
  return (req,res,next) => {
    const t = req.headers.authorization?.split(' ')[1];
    if (!t) return res.status(401).json({error:'Token requerido'});
    try {
      const p = jwt.verify(t, JWT_SECRET);
      req.user = p;
      const eid = req.params.empresa_id || req.query.empresa_id || req.body?.empresa_id;
      if (!eid) return res.status(400).json({error:'empresa_id requerido'});
      // Superadmin tiene acceso a todo
      if (p.rol === 'superadmin') { req.empresa_id = eid; return next(); }
      const acceso = get(`SELECT rol_empresa FROM usuario_empresas WHERE usuario_id=? AND empresa_id=?`,[p.id,eid]);
      if (!acceso) return res.status(403).json({error:'Sin acceso a esta empresa'});
      req.empresa_id = eid;
      req.rol_empresa = acceso.rol_empresa;
      next();
    } catch(e) { return res.status(401).json({error: e.name==='TokenExpiredError'?'Sesión expirada — vuelve a iniciar sesión':'Token inválido'}); }
  };
}

// ── ENDPOINTS ─────────────────────────────────────────────────────────────────

// Licencia
app.get('/api/licencia/estado', (req,res) => {
  const lic = get(`SELECT * FROM licencias WHERE activa=1 AND date(fecha_vencimiento)>=date('now') ORDER BY id DESC`);
  if (lic) {
    const dias = Math.ceil((new Date(lic.fecha_vencimiento)-new Date())/(1000*60*60*24));
    res.json({activa:true,tipo:lic.tipo,vencimiento:lic.fecha_vencimiento,diasRestantes:dias});
  } else res.json({activa:false});
});

// Auth
app.post('/api/auth/login', (req,res) => {
  const {username,password} = req.body;
  if (!username||!password) return res.status(400).json({error:'Credenciales requeridas'});
  const u = get(`SELECT * FROM usuarios WHERE username=? AND activo=1`,[username]);
  if (!u||!bcrypt.compareSync(password,u.password)) return res.status(401).json({error:'Usuario o contraseña incorrectos'});
  // Empresas accesibles por el usuario
  let empresas;
  if (u.rol==='superadmin') {
    empresas = all(`SELECT e.* FROM empresas e WHERE e.activa=1 ORDER BY e.nombre`);
  } else {
    empresas = all(`SELECT e.*, ue.rol_empresa FROM empresas e
      JOIN usuario_empresas ue ON ue.empresa_id=e.id
      WHERE ue.usuario_id=? AND e.activa=1 ORDER BY e.nombre`,[u.id]);
  }
  const token = jwt.sign({id:u.id,nombre:u.nombre,username:u.username,rol:u.rol},JWT_SECRET,{expiresIn:'24h'});
  res.json({token,user:{id:u.id,nombre:u.nombre,username:u.username,rol:u.rol},empresas});
});

app.get('/api/auth/me', auth(), (req,res) => {
  const u = get(`SELECT id,nombre,username,rol FROM usuarios WHERE id=?`,[req.user.id]);
  let empresas;
  if (u.rol==='superadmin') empresas = all(`SELECT * FROM empresas WHERE activa=1 ORDER BY nombre`);
  else empresas = all(`SELECT e.*,ue.rol_empresa FROM empresas e JOIN usuario_empresas ue ON ue.empresa_id=e.id WHERE ue.usuario_id=? AND e.activa=1`,[u.id]);
  res.json({...u,empresas});
});

// Empresas
app.get('/api/empresas', auth(), (req,res) => {
  if (req.user.rol==='superadmin') return res.json(all(`SELECT * FROM empresas ORDER BY nombre`));
  res.json(all(`SELECT e.* FROM empresas e JOIN usuario_empresas ue ON ue.empresa_id=e.id WHERE ue.usuario_id=? AND e.activa=1 ORDER BY e.nombre`,[req.user.id]));
});

app.post('/api/empresas', auth(['superadmin','admin']), (req,res) => {
  try {
    const {nombre,nombre_comercial,rtn,direccion,telefono,email,regimen} = req.body;
    const id = uuid();
    run(`INSERT INTO empresas(id,nombre,nombre_comercial,rtn,direccion,telefono,email,regimen) VALUES(?,?,?,?,?,?,?,?)`,
      [id,nombre,nombre_comercial||'',rtn||'',direccion||'',telefono||'',email||'',regimen||'mercantil']);
    run(`INSERT OR IGNORE INTO contadores_asiento(empresa_id,valor) VALUES(?,0)`,[id]);
    // Plan de cuentas CCPH para la nueva empresa
    _seedPlanCuentas(id);
    // Período actual
    _asegurarPeriodo(id, todayHN());
    // Reglas de mapeo POS por defecto
    _seedReglasPOS(id);
    // Dar acceso al usuario que la crea (si no es superadmin ya tiene todo)
    if (req.user.rol !== 'superadmin') {
      run(`INSERT OR IGNORE INTO usuario_empresas(id,usuario_id,empresa_id,rol_empresa) VALUES(?,?,?,?)`,
        [uuid(),req.user.id,id,'admin']);
    }
    saveDB();
    res.json({id});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.put('/api/empresas/:id', auth(['superadmin','admin']), (req,res) => {
  try {
    const {nombre,nombre_comercial,rtn,direccion,telefono,email,regimen} = req.body;
    run(`UPDATE empresas SET nombre=?,nombre_comercial=?,rtn=?,direccion=?,telefono=?,email=?,regimen=? WHERE id=?`,
      [nombre,nombre_comercial||'',rtn||'',direccion||'',telefono||'',email||'',regimen||'mercantil',req.params.id]);
    saveDB(); res.json({ok:1});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.delete('/api/empresas/:id', auth(['superadmin']), (req,res) => {
  run(`UPDATE empresas SET activa=0 WHERE id=?`,[req.params.id]);
  saveDB(); res.json({ok:1});
});

// Acceso usuario↔empresa
app.get('/api/empresas/:empresa_id/usuarios', authEmpresa(), (req,res) => {
  res.json(all(`SELECT u.id,u.nombre,u.username,u.rol,ue.rol_empresa FROM usuarios u
    JOIN usuario_empresas ue ON ue.usuario_id=u.id WHERE ue.empresa_id=?`,[req.params.empresa_id]));
});
app.post('/api/empresas/:empresa_id/usuarios', authEmpresa(), (req,res) => {
  try {
    const {usuario_id,rol_empresa} = req.body;
    run(`INSERT OR REPLACE INTO usuario_empresas(id,usuario_id,empresa_id,rol_empresa) VALUES(?,?,?,?)`,
      [uuid(),usuario_id,req.params.empresa_id,rol_empresa||'contador']);
    saveDB(); res.json({ok:1});
  } catch(e) { res.status(500).json({error:e.message}); }
});
app.delete('/api/empresas/:empresa_id/usuarios/:uid', authEmpresa(), (req,res) => {
  run(`DELETE FROM usuario_empresas WHERE usuario_id=? AND empresa_id=?`,[req.params.uid,req.params.empresa_id]);
  saveDB(); res.json({ok:1});
});

// Usuarios del sistema
app.get('/api/usuarios', auth(['superadmin','admin']), (req,res) => {
  res.json(all(`SELECT id,nombre,username,rol,activo,creado FROM usuarios ORDER BY nombre`));
});
app.post('/api/usuarios', auth(['superadmin','admin']), (req,res) => {
  try {
    const {nombre,username,password,rol} = req.body;
    if (get(`SELECT id FROM usuarios WHERE username=?`,[username])) return res.status(400).json({error:'Username ya existe'});
    const id = uuid();
    run(`INSERT INTO usuarios(id,nombre,username,password,rol) VALUES(?,?,?,?,?)`,
      [id,nombre,username,bcrypt.hashSync(password,10),rol||'contador']);
    saveDB(); res.json({id});
  } catch(e) { res.status(500).json({error:e.message}); }
});
app.put('/api/usuarios/:id', auth(['superadmin','admin']), (req,res) => {
  try {
    const {nombre,rol,activo,password} = req.body;
    if (password) run(`UPDATE usuarios SET nombre=?,rol=?,activo=?,password=? WHERE id=?`,[nombre,rol,activo,bcrypt.hashSync(password,10),req.params.id]);
    else run(`UPDATE usuarios SET nombre=?,rol=?,activo=? WHERE id=?`,[nombre,rol,activo,req.params.id]);
    saveDB(); res.json({ok:1});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Plan de cuentas (por empresa)
app.get('/api/empresas/:empresa_id/cuentas', authEmpresa(), (req,res) => {
  res.json(all(`SELECT c.*,p.codigo as padre_codigo FROM cuentas c LEFT JOIN cuentas p ON p.id=c.padre_id WHERE c.empresa_id=? ORDER BY c.codigo`,[req.params.empresa_id]));
});
app.post('/api/empresas/:empresa_id/cuentas', authEmpresa(), (req,res) => {
  try {
    const {codigo,nombre,tipo,naturaleza,nivel,padre_id,permite_movimiento} = req.body;
    if (get(`SELECT id FROM cuentas WHERE empresa_id=? AND codigo=?`,[req.params.empresa_id,codigo]))
      return res.status(400).json({error:'Código ya existe en esta empresa'});
    const id = uuid();
    run(`INSERT INTO cuentas(id,empresa_id,codigo,nombre,tipo,naturaleza,nivel,padre_id,permite_movimiento) VALUES(?,?,?,?,?,?,?,?,?)`,
      [id,req.params.empresa_id,codigo,nombre,tipo,naturaleza,nivel||1,padre_id||null,permite_movimiento!==false?1:0]);
    saveDB(); res.json({id});
  } catch(e) { res.status(500).json({error:e.message}); }
});
app.put('/api/empresas/:empresa_id/cuentas/:id', authEmpresa(), (req,res) => {
  try {
    const {nombre,permite_movimiento,activa} = req.body;
    run(`UPDATE cuentas SET nombre=?,permite_movimiento=?,activa=? WHERE id=? AND empresa_id=?`,
      [nombre,permite_movimiento!==false?1:0,activa!==false?1:0,req.params.id,req.params.empresa_id]);
    saveDB(); res.json({ok:1});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Períodos (por empresa)
app.get('/api/empresas/:empresa_id/periodos', authEmpresa(), (req,res) => {
  res.json(all(`SELECT * FROM periodos WHERE empresa_id=? ORDER BY anio DESC,mes DESC`,[req.params.empresa_id]));
});
app.post('/api/empresas/:empresa_id/periodos', authEmpresa(), (req,res) => {
  try {
    const {anio,mes} = req.body;
    const fecha = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const pid = _asegurarPeriodo(req.params.empresa_id, fecha);
    saveDB(); res.json({id:pid});
  } catch(e) { res.status(500).json({error:e.message}); }
});
app.put('/api/empresas/:empresa_id/periodos/:id/cerrar', authEmpresa(), (req,res) => {
  try {
    run(`UPDATE periodos SET estado='cerrado',fecha_cierre=? WHERE id=? AND empresa_id=?`,
      [todayHN(),req.params.id,req.params.empresa_id]);
    saveDB(); res.json({ok:1});
  } catch(e) { res.status(500).json({error:e.message}); }
});
app.put('/api/empresas/:empresa_id/periodos/:id/abrir', authEmpresa(), (req,res) => {
  try {
    run(`UPDATE periodos SET estado='abierto',fecha_cierre=null WHERE id=? AND empresa_id=?`,
      [req.params.id,req.params.empresa_id]);
    saveDB(); res.json({ok:1});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Centros de costo
app.get('/api/empresas/:empresa_id/centros', authEmpresa(), (req,res) => {
  res.json(all(`SELECT * FROM centros_costo WHERE empresa_id=? AND activo=1 ORDER BY codigo`,[req.params.empresa_id]));
});
app.post('/api/empresas/:empresa_id/centros', authEmpresa(), (req,res) => {
  try {
    const {codigo,nombre} = req.body;
    const id = uuid();
    run(`INSERT INTO centros_costo(id,empresa_id,codigo,nombre) VALUES(?,?,?,?)`,[id,req.params.empresa_id,codigo,nombre]);
    saveDB(); res.json({id});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Asientos contables
app.get('/api/empresas/:empresa_id/asientos', authEmpresa(), (req,res) => {
  const {fecha_ini,fecha_fin,periodo_id,estado,limite} = req.query;
  let sql = `SELECT a.*,u.nombre as usuario_nombre,p.nombre as periodo_nombre
    FROM asientos a LEFT JOIN usuarios u ON u.id=a.usuario_id
    LEFT JOIN periodos p ON p.id=a.periodo_id WHERE a.empresa_id=?`;
  const params = [req.params.empresa_id];
  if (fecha_ini)   { sql+=` AND a.fecha>=?`;   params.push(fecha_ini); }
  if (fecha_fin)   { sql+=` AND a.fecha<=?`;   params.push(fecha_fin); }
  if (periodo_id)  { sql+=` AND a.periodo_id=?`; params.push(periodo_id); }
  if (estado)      { sql+=` AND a.estado=?`;   params.push(estado); }
  sql += ` ORDER BY a.numero DESC LIMIT ?`;
  params.push(parseInt(limite)||500);
  res.json(all(sql,params));
});

app.get('/api/empresas/:empresa_id/asientos/:id', authEmpresa(), (req,res) => {
  const a = get(`SELECT a.*,u.nombre as usuario_nombre,p.nombre as periodo_nombre
    FROM asientos a LEFT JOIN usuarios u ON u.id=a.usuario_id
    LEFT JOIN periodos p ON p.id=a.periodo_id WHERE a.id=? AND a.empresa_id=?`,
    [req.params.id,req.params.empresa_id]);
  if (!a) return res.status(404).json({error:'No encontrado'});
  const partidas = all(`SELECT ap.*,c.codigo as cuenta_codigo,c.nombre as cuenta_nombre,c.tipo as cuenta_tipo
    FROM asiento_partidas ap JOIN cuentas c ON c.id=ap.cuenta_id WHERE ap.asiento_id=? ORDER BY ap.rowid`,
    [req.params.id]);
  res.json({...a,partidas});
});

app.post('/api/empresas/:empresa_id/asientos', authEmpresa(), (req,res) => {
  try {
    const {fecha,concepto,referencia,tipo,partidas} = req.body;
    if (!partidas || partidas.length < 2) return res.status(400).json({error:'Mínimo 2 partidas requeridas'});

    // Validar partida doble
    const totalDebe  = partidas.reduce((s,p)=>s+(parseFloat(p.debe)||0),0);
    const totalHaber = partidas.reduce((s,p)=>s+(parseFloat(p.haber)||0),0);
    if (Math.abs(totalDebe-totalHaber)>0.01)
      return res.status(400).json({error:`Partida doble no cuadra: Debe=${totalDebe.toFixed(2)} Haber=${totalHaber.toFixed(2)}`});

    // Verificar período abierto
    const periodo = _getPeriodoActivo(req.params.empresa_id, fecha);
    if (!periodo) return res.status(400).json({error:'No existe período abierto para esta fecha'});

    const num = _nextNumAsiento(req.params.empresa_id);
    const id  = uuid();
    run(`INSERT INTO asientos(id,empresa_id,periodo_id,numero,fecha,concepto,referencia,tipo,estado,usuario_id) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [id,req.params.empresa_id,periodo.id,num,fecha,concepto,referencia||'',tipo||'manual','borrador',req.user.id]);

    for (const p of partidas) {
      run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion,centro_costo) VALUES(?,?,?,?,?,?,?)`,
        [uuid(),id,p.cuenta_id,parseFloat(p.debe)||0,parseFloat(p.haber)||0,p.descripcion||'',p.centro_costo||'']);
    }
    saveDB();
    res.json({id,numero:num});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.put('/api/empresas/:empresa_id/asientos/:id', authEmpresa(), (req,res) => {
  const {id, empresa_id} = req.params;
  const {fecha, concepto, referencia, tipo, partidas} = req.body;
  try {
    const a = get(`SELECT * FROM asientos WHERE id=? AND empresa_id=?`,[id,empresa_id]);
    if (!a) return res.status(404).json({error:'Asiento no encontrado'});
    if (a.estado==='anulado')       return res.status(400).json({error:'No se puede modificar un asiento anulado'});
    if (a.estado==='contabilizado') return res.status(400).json({error:'No se puede modificar un asiento contabilizado. Anúlelo primero.'});
    // Verificar período abierto
    const periodo = get(`SELECT * FROM periodos WHERE id=? AND estado='abierto'`,[a.periodo_id]);
    if (!periodo) return res.status(400).json({error:'El período contable está cerrado. No se puede modificar el asiento.'});
    // Validar partida doble
    if (!partidas || partidas.length < 2)
      return res.status(400).json({error:'Mínimo 2 partidas requeridas'});
    const td = partidas.reduce((s,p)=>s+(parseFloat(p.debe)||0),0);
    const th = partidas.reduce((s,p)=>s+(parseFloat(p.haber)||0),0);
    if (Math.abs(td-th)>0.01)
      return res.status(400).json({error:`Asiento no cuadra: Debe ${td.toFixed(2)} ≠ Haber ${th.toFixed(2)}`});
    // TRANSACCIÓN ATÓMICA
    run(`BEGIN TRANSACTION`);
    try {
      run(`UPDATE asientos SET fecha=?,concepto=?,referencia=?,tipo=? WHERE id=?`,
        [fecha, concepto, referencia||'', tipo||'manual', id]);
      run(`DELETE FROM asiento_partidas WHERE asiento_id=?`,[id]);
      for (const p of partidas) {
        run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion,centro_costo) VALUES(?,?,?,?,?,?,?)`,
          [uuid(),id,p.cuenta_id,parseFloat(p.debe)||0,parseFloat(p.haber)||0,p.descripcion||'',p.centro_costo||'']);
      }
      run(`COMMIT`);
      saveDB();
      res.json({ok:1,message:'Asiento actualizado correctamente'});
    } catch(err) {
      run(`ROLLBACK`);
      res.status(500).json({error:'Error en transacción: '+err.message});
    }
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.put('/api/empresas/:empresa_id/asientos/:id/contabilizar', authEmpresa(), (req,res) => {
  try {
    const a = get(`SELECT * FROM asientos WHERE id=? AND empresa_id=?`,[req.params.id,req.params.empresa_id]);
    if (!a) return res.status(404).json({error:'No encontrado'});
    if (a.estado==='contabilizado') return res.status(400).json({error:'Ya contabilizado'});
    if (a.estado==='anulado') return res.status(400).json({error:'Asiento anulado'});
    run(`UPDATE asientos SET estado='contabilizado' WHERE id=?`,[req.params.id]);
    saveDB(); res.json({ok:1});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.put('/api/empresas/:empresa_id/asientos/:id/anular', authEmpresa(), (req,res) => {
  try {
    const a = get(`SELECT * FROM asientos WHERE id=? AND empresa_id=?`,[req.params.id,req.params.empresa_id]);
    if (!a) return res.status(404).json({error:'No encontrado'});
    if (a.estado==='anulado') return res.status(400).json({error:'Ya anulado'});
    run(`UPDATE asientos SET estado='anulado' WHERE id=?`,[req.params.id]);
    saveDB(); res.json({ok:1});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.delete('/api/empresas/:empresa_id/asientos/:id', authEmpresa(), (req,res) => {
  const {id, empresa_id} = req.params;
  try {
    const a = get(`SELECT * FROM asientos WHERE id=? AND empresa_id=?`,[id,empresa_id]);
    if (!a) return res.status(404).json({error:'Asiento no encontrado'});
    if (a.estado==='anulado') return res.status(400).json({error:'El asiento ya está anulado'});
    // Verificar período abierto
    const periodo = get(`SELECT * FROM periodos WHERE id=? AND estado='abierto'`,[a.periodo_id]);
    if (!periodo) return res.status(400).json({error:'El período contable está cerrado. No se puede eliminar el asiento.'});
    // TRANSACCIÓN ATÓMICA — borrado lógico
    run(`BEGIN TRANSACTION`);
    try {
      run(`UPDATE asientos SET estado='anulado' WHERE id=?`,[id]);
      run(`COMMIT`);
      saveDB();
      res.json({ok:1,message:'Asiento anulado correctamente'});
    } catch(err) {
      run(`ROLLBACK`);
      res.status(500).json({error:'Error en transacción: '+err.message});
    }
  } catch(e) { res.status(500).json({error:e.message}); }
});

function _getPeriodoActivo(empresa_id, fecha) {
  const anio = parseInt(fecha.substring(0,4));
  const mes  = parseInt(fecha.substring(5,7));
  return get(`SELECT * FROM periodos WHERE empresa_id=? AND anio=? AND mes=? AND estado='abierto'`,[empresa_id,anio,mes]);
}

// ── PLAN DE CUENTAS: EXPORTAR CSV ───────────────────────────────────────────
app.get('/api/empresas/:empresa_id/cuentas/exportar', authEmpresa(), (req,res) => {
  try {
    const filas = all(
      `SELECT c.codigo, c.nombre, c.tipo, c.nivel, p.codigo AS codigo_padre
       FROM cuentas c
       LEFT JOIN cuentas p ON p.id=c.padre_id
       WHERE c.empresa_id=? AND c.activa=1
       ORDER BY c.codigo`,
      [req.params.empresa_id]
    );
    const lineas = ['codigo_cuenta,nombre,tipo,nivel,cuenta_padre',
      ...filas.map(c =>
        `${c.codigo},"${(c.nombre||'').replace(/"/g,'""')}",${c.tipo},${c.nivel},${c.codigo_padre||''}`
      )];
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="plan_cuentas.csv"');
    res.send('\uFEFF' + lineas.join('\n'));
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ── PLAN DE CUENTAS: IMPORTAR CSV ────────────────────────────────────────────
app.post('/api/empresas/:empresa_id/cuentas/importar', authEmpresa(), (req,res) => {
  const {cuentas, reemplazar} = req.body;
  const eid = req.params.empresa_id;
  if (!Array.isArray(cuentas)||!cuentas.length)
    return res.status(400).json({error:'No se recibieron cuentas'});
  const errores=[], creadas_ids=[];
  let creadas=0, actualizadas=0, omitidas=0;
  run(`BEGIN TRANSACTION`);
  try {
    for (const c of cuentas) {
      const {codigo_cuenta,nombre,tipo,nivel,cuenta_padre} = c;
      if (!codigo_cuenta||!nombre||!tipo) { errores.push(`Fila incompleta: ${codigo_cuenta||'?'}`); continue; }
      const tiposOK = ['activo','pasivo','capital','ingreso','costo','gasto'];
      const tipoNorm = (tipo||'').toLowerCase().trim();
      if (!tiposOK.includes(tipoNorm)) { errores.push(`Tipo inválido en ${codigo_cuenta}: ${tipo}`); continue; }
      const existe = get(`SELECT id FROM cuentas WHERE empresa_id=? AND codigo=?`,[eid,codigo_cuenta]);
      let padre_id = null;
      if (cuenta_padre) {
        const padre = get(`SELECT id FROM cuentas WHERE empresa_id=? AND codigo=?`,[eid,cuenta_padre]);
        if (padre) padre_id = padre.id;
        // Si no encuentra el padre, continúa sin padre (no bloquear importación)
      }
      const nat = ['activo','costo','gasto'].includes(tipoNorm) ? 'deudora' : 'acreedora';
      if (existe) {
        if (reemplazar) {
          // Actualizar la cuenta existente
          run(`UPDATE cuentas SET nombre=?,tipo=?,naturaleza=?,nivel=?,padre_id=? WHERE id=?`,
            [nombre, tipoNorm, nat, parseInt(nivel)||1, padre_id, existe.id]);
          actualizadas++;
        } else {
          omitidas++;
        }
        continue;
      }
      const cid = uuid();
      run(`INSERT INTO cuentas(id,empresa_id,codigo,nombre,tipo,naturaleza,nivel,padre_id,permite_movimiento,activa)
           VALUES(?,?,?,?,?,?,?,?,1,1)`,
        [cid,eid,codigo_cuenta,nombre,tipoNorm,nat,parseInt(nivel)||1,padre_id]);
      creadas++; creadas_ids.push(cid);
    }
    run(`COMMIT`);
    saveDB();
    res.json({creadas,actualizadas,omitidas,errores,total:cuentas.length});
  } catch(err) {
    run(`ROLLBACK`);
    res.status(500).json({error:'Error en transacción: '+err.message});
  }
});

// Mayor General
app.get('/api/empresas/:empresa_id/mayor', authEmpresa(), (req,res) => {
  const {cuenta_id,fecha_ini,fecha_fin,periodo_id} = req.query;
  if (!cuenta_id) return res.status(400).json({error:'cuenta_id requerido'});
  let w = `WHERE ap.cuenta_id=? AND a.empresa_id=? AND a.estado='contabilizado'`;
  const p = [cuenta_id,req.params.empresa_id];
  if (periodo_id) { w+=` AND a.periodo_id=?`; p.push(periodo_id); }
  if (fecha_ini)  { w+=` AND a.fecha>=?`;    p.push(fecha_ini); }
  if (fecha_fin)  { w+=` AND a.fecha<=?`;    p.push(fecha_fin); }
  const partidas = all(
    `SELECT a.numero,a.fecha,a.concepto,a.referencia,ap.debe,ap.haber,ap.descripcion,ap.centro_costo
     FROM asiento_partidas ap JOIN asientos a ON a.id=ap.asiento_id ${w} ORDER BY a.fecha,a.numero`,p);
  // Calcular saldo progresivo
  const cuenta = get(`SELECT * FROM cuentas WHERE id=?`,[cuenta_id]);
  let saldo = 0;
  const filas = partidas.map(row => {
    const debe = parseFloat(row.debe)||0;
    const haber = parseFloat(row.haber)||0;
    if (cuenta && cuenta.naturaleza==='deudora') saldo += debe - haber;
    else saldo += haber - debe;
    return {...row,saldo};
  });
  res.json({cuenta,partidas:filas,
    total_debe:partidas.reduce((s,r)=>s+(parseFloat(r.debe)||0),0),
    total_haber:partidas.reduce((s,r)=>s+(parseFloat(r.haber)||0),0)});
});

// Balance de comprobación
app.get('/api/empresas/:empresa_id/balance_comprobacion', authEmpresa(), (req,res) => {
  const {fecha_ini,fecha_fin,periodo_id} = req.query;
  let w = `WHERE a.empresa_id=? AND a.estado='contabilizado' AND c.permite_movimiento=1`;
  const p = [req.params.empresa_id];
  if (periodo_id) { w+=` AND a.periodo_id=?`; p.push(periodo_id); }
  if (fecha_ini)  { w+=` AND a.fecha>=?`;     p.push(fecha_ini); }
  if (fecha_fin)  { w+=` AND a.fecha<=?`;     p.push(fecha_fin); }
  const filas = all(
    `SELECT c.codigo,c.nombre,c.tipo,c.naturaleza,
     SUM(ap.debe) as total_debe,SUM(ap.haber) as total_haber,
     SUM(ap.debe)-SUM(ap.haber) as diferencia
     FROM asiento_partidas ap
     JOIN asientos a ON a.id=ap.asiento_id
     JOIN cuentas c ON c.id=ap.cuenta_id
     ${w}
     GROUP BY c.id HAVING total_debe>0 OR total_haber>0
     ORDER BY c.codigo`,p);
  const saldos = filas.map(f => {
    const debe  = parseFloat(f.total_debe)||0;
    const haber = parseFloat(f.total_haber)||0;
    // El Balance de Comprobación compara debe vs. haber directamente,
    // sin reclasificar según la naturaleza de la cuenta. Voltear el signo
    // aquí rompe la identidad debe=haber cuando una cuenta tiene saldo
    // "contra su naturaleza" (ej. un pasivo con saldo deudor).
    const neto  = debe-haber;
    return {...f, saldo_deudor: neto>0?neto:0, saldo_acreedor: neto<0?Math.abs(neto):0};
  });
  res.json(saldos);
});

// Estado de Resultados
app.get('/api/empresas/:empresa_id/estado_resultados', authEmpresa(), (req,res) => {
  const {fecha_ini,fecha_fin,periodo_id} = req.query;
  let w = `WHERE a.empresa_id=? AND a.estado='contabilizado' AND c.tipo IN('ingreso','costo','gasto') AND c.permite_movimiento=1`;
  const p = [req.params.empresa_id];
  if (periodo_id) { w+=` AND a.periodo_id=?`; p.push(periodo_id); }
  if (fecha_ini)  { w+=` AND a.fecha>=?`;     p.push(fecha_ini); }
  if (fecha_fin)  { w+=` AND a.fecha<=?`;     p.push(fecha_fin); }
  const datos = all(
    `SELECT c.codigo,c.nombre,c.tipo,c.naturaleza,SUM(ap.debe) as debe,SUM(ap.haber) as haber
     FROM asiento_partidas ap JOIN asientos a ON a.id=ap.asiento_id JOIN cuentas c ON c.id=ap.cuenta_id
     ${w} GROUP BY c.id ORDER BY c.codigo`,p);
  let ingresos=0,costos=0,gastos=0;
  const detalle={ingreso:[],costo:[],gasto:[]};
  for (const d of datos) {
    const debe=parseFloat(d.debe)||0, haber=parseFloat(d.haber)||0;
    const monto = d.naturaleza==='acreedora' ? haber-debe : debe-haber;
    detalle[d.tipo].push({...d,monto});
    if (d.tipo==='ingreso') ingresos+=monto;
    else if (d.tipo==='costo') costos+=monto;
    else if (d.tipo==='gasto') gastos+=monto;
  }
  const utilidad_bruta = ingresos-costos;
  const utilidad_neta  = utilidad_bruta-gastos;
  res.json({detalle,totales:{ingresos,costos,gastos,utilidad_bruta,utilidad_neta}});
});

// Balance General
app.get('/api/empresas/:empresa_id/balance_general', authEmpresa(), (req,res) => {
  const {fecha,periodo_id} = req.query;
  let w = `WHERE a.empresa_id=? AND a.estado='contabilizado' AND c.tipo IN('activo','pasivo','capital') AND c.permite_movimiento=1`;
  const p = [req.params.empresa_id];
  if (periodo_id) { w+=` AND a.periodo_id=?`; p.push(periodo_id); }
  if (fecha)      { w+=` AND a.fecha<=?`;     p.push(fecha); }
  const datos = all(
    `SELECT c.codigo,c.nombre,c.tipo,c.naturaleza,SUM(ap.debe) as debe,SUM(ap.haber) as haber
     FROM asiento_partidas ap JOIN asientos a ON a.id=ap.asiento_id JOIN cuentas c ON c.id=ap.cuenta_id
     ${w} GROUP BY c.id ORDER BY c.codigo`,p);
  let activo=0,pasivo=0,capital=0;
  const detalle={activo:[],pasivo:[],capital:[]};
  for (const d of datos) {
    const debe=parseFloat(d.debe)||0, haber=parseFloat(d.haber)||0;
    const monto = d.naturaleza==='deudora' ? debe-haber : haber-debe;
    if (monto===0) continue;
    detalle[d.tipo].push({...d,monto});
    if (d.tipo==='activo') activo+=monto;
    else if (d.tipo==='pasivo') pasivo+=monto;
    else if (d.tipo==='capital') capital+=monto;
  }
  res.json({detalle,totales:{activo,pasivo,capital,pasivo_capital:pasivo+capital}});
});

// ════════════════════════════════════════════════════════════════════════════
// FASE 2 — ACTIVOS FIJOS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/empresas/:empresa_id/activos', authEmpresa(), (req,res) => {
  res.json(all(
    `SELECT af.*,ca.codigo as cta_activo_cod,cd.codigo as cta_dep_cod,cg.codigo as cta_gasto_cod,
     ca.nombre as cta_activo_nom,cd.nombre as cta_dep_nom,cg.nombre as cta_gasto_nom
     FROM activos_fijos af
     LEFT JOIN cuentas ca ON ca.id=af.cuenta_activo_id
     LEFT JOIN cuentas cd ON cd.id=af.cuenta_dep_acum_id
     LEFT JOIN cuentas cg ON cg.id=af.cuenta_gasto_dep_id
     WHERE af.empresa_id=? AND af.activo=1 ORDER BY af.categoria,af.codigo`,
    [req.params.empresa_id]));
});

app.post('/api/empresas/:empresa_id/activos', authEmpresa(), (req,res) => {
  try {
    const {codigo,nombre,categoria,cuenta_activo_id,cuenta_dep_acum_id,cuenta_gasto_dep_id,
           valor_compra,valor_residual,vida_util_anios,metodo,fecha_compra,fecha_inicio_dep} = req.body;
    if (get(`SELECT id FROM activos_fijos WHERE empresa_id=? AND codigo=?`,[req.params.empresa_id,codigo]))
      return res.status(400).json({error:'Código de activo ya existe en esta empresa'});
    const id = uuid();
    const vc = parseFloat(valor_compra)||0;
    run(`INSERT INTO activos_fijos(id,empresa_id,codigo,nombre,categoria,
         cuenta_activo_id,cuenta_dep_acum_id,cuenta_gasto_dep_id,
         valor_compra,valor_residual,vida_util_anios,metodo,
         fecha_compra,fecha_inicio_dep,dep_acumulada,valor_neto)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
      [id,req.params.empresa_id,codigo,nombre,categoria,
       cuenta_activo_id||null,cuenta_dep_acum_id||null,cuenta_gasto_dep_id||null,
       vc,parseFloat(valor_residual)||0,parseInt(vida_util_anios)||5,
       metodo||'linea_recta',fecha_compra,fecha_inicio_dep||fecha_compra,vc]);
    saveDB();
    res.json({id});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.put('/api/empresas/:empresa_id/activos/:id', authEmpresa(), (req,res) => {
  try {
    const {nombre,valor_residual,vida_util_anios,metodo,estado,
           cuenta_activo_id,cuenta_dep_acum_id,cuenta_gasto_dep_id} = req.body;
    run(`UPDATE activos_fijos SET nombre=?,valor_residual=?,vida_util_anios=?,metodo=?,estado=?,
         cuenta_activo_id=?,cuenta_dep_acum_id=?,cuenta_gasto_dep_id=? WHERE id=? AND empresa_id=?`,
      [nombre,parseFloat(valor_residual)||0,parseInt(vida_util_anios)||5,
       metodo||'linea_recta',estado||'activo',
       cuenta_activo_id||null,cuenta_dep_acum_id||null,cuenta_gasto_dep_id||null,
       req.params.id,req.params.empresa_id]);
    saveDB(); res.json({ok:1});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// Calcular y registrar depreciación mensual de todos los activos de un período
app.post('/api/empresas/:empresa_id/activos/depreciar', authEmpresa(), (req,res) => {
  try {
    const {periodo_id, generar_asiento} = req.body;
    if (!periodo_id) return res.status(400).json({error:'periodo_id requerido'});
    const periodo = get(`SELECT * FROM periodos WHERE id=? AND empresa_id=?`,
      [periodo_id, req.params.empresa_id]);
    if (!periodo) return res.status(404).json({error:'Período no encontrado'});
    if (periodo.estado==='cerrado') return res.status(400).json({error:'El período está cerrado'});

    const activos = all(`SELECT * FROM activos_fijos WHERE empresa_id=? AND estado='activo' AND activo=1`,
      [req.params.empresa_id]);

    const resultados = [];
    let totalDep = 0;

    for (const af of activos) {
      const yaExiste = get(`SELECT id FROM depreciaciones WHERE activo_id=? AND periodo_id=?`,
        [af.id, periodo_id]);
      if (yaExiste) { resultados.push({...af, monto:0, skip:'ya_depreciado'}); continue; }

      const vc = parseFloat(af.valor_compra)||0;
      const vr = parseFloat(af.valor_residual)||0;
      const vn = parseFloat(af.valor_neto)||vc;
      const base = vc - vr;
      const mesesVida = (parseInt(af.vida_util_anios)||5) * 12;

      let depMes = 0;
      if (af.metodo === 'linea_recta') {
        depMes = base / mesesVida;
      } else {
        // Saldo decreciente doble
        const tasaAnual = 2 / (parseInt(af.vida_util_anios)||5);
        depMes = (vn * tasaAnual) / 12;
      }
      // Limitar al valor neto disponible menos residual
      depMes = Math.max(0, Math.min(depMes, vn - vr));
      depMes = parseFloat(depMes.toFixed(2));
      if (depMes <= 0) { resultados.push({...af, monto:0, skip:'agotado'}); continue; }

      const depAcum = parseFloat((parseFloat(af.dep_acumulada)||0) + depMes).toFixed(2);
      const nuevoVN  = parseFloat((vc - parseFloat(depAcum)).toFixed(2));

      run(`UPDATE activos_fijos SET dep_acumulada=?,valor_neto=? WHERE id=?`,
        [depAcum, Math.max(vr, nuevoVN), af.id]);

      const did = uuid();
      run(`INSERT INTO depreciaciones(id,empresa_id,activo_id,periodo_id,monto,dep_acum_al_periodo)
           VALUES(?,?,?,?,?,?)`,
        [did, req.params.empresa_id, af.id, periodo_id, depMes, depAcum]);

      totalDep += depMes;
      resultados.push({...af, monto:depMes, dep_id:did});
    }

    // Asiento automático de depreciación
    let asiento_id = null;
    if (generar_asiento && totalDep > 0) {
      const conCuentas = resultados.filter(r=>r.monto>0&&r.cuenta_gasto_dep_id&&r.cuenta_dep_acum_id);
      if (conCuentas.length > 0) {
        const num = _nextNumAsiento(req.params.empresa_id);
        const aid = uuid();
        run(`INSERT INTO asientos(id,empresa_id,periodo_id,numero,fecha,concepto,tipo,estado,usuario_id)
             VALUES(?,?,?,?,?,?,?,?,?)`,
          [aid,req.params.empresa_id,periodo_id,num,todayHN(),
           `Depreciación activos fijos — ${periodo.nombre}`,'automatico','contabilizado',req.user.id]);
        for (const af of conCuentas) {
          run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion) VALUES(?,?,?,?,?,?)`,
            [uuid(),aid,af.cuenta_gasto_dep_id,af.monto,0,`Dep. ${af.nombre}`]);
          run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion) VALUES(?,?,?,?,?,?)`,
            [uuid(),aid,af.cuenta_dep_acum_id,0,af.monto,`Dep. Acum. ${af.nombre}`]);
          run(`UPDATE depreciaciones SET asiento_id=? WHERE activo_id=? AND periodo_id=?`,
            [aid,af.id,periodo_id]);
        }
        asiento_id = aid;
      }
    }
    saveDB();
    res.json({total:totalDep, procesados:resultados.length, resultados, asiento_id});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/empresas/:empresa_id/activos/:id/depreciaciones', authEmpresa(), (req,res) => {
  res.json(all(
    `SELECT d.*,p.nombre as periodo_nombre FROM depreciaciones d
     JOIN periodos p ON p.id=d.periodo_id WHERE d.activo_id=? AND d.empresa_id=?
     ORDER BY p.anio DESC,p.mes DESC`,
    [req.params.id, req.params.empresa_id]));
});

// ════════════════════════════════════════════════════════════════════════════
// FASE 2 — CIERRE CONTABLE
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/empresas/:empresa_id/cierre', authEmpresa(), (req,res) => {
  try {
    const {periodo_id, tipo} = req.body;
    const periodo = get(`SELECT * FROM periodos WHERE id=? AND empresa_id=?`,
      [periodo_id, req.params.empresa_id]);
    if (!periodo) return res.status(404).json({error:'Período no encontrado'});
    if (periodo.estado==='cerrado') return res.status(400).json({error:'El período ya está cerrado'});
    const yaCierre = get(`SELECT id FROM cierres WHERE empresa_id=? AND periodo_id=? AND tipo=?`,
      [req.params.empresa_id, periodo_id, tipo||'mensual']);
    if (yaCierre) return res.status(400).json({error:'Ya existe un cierre para este período y tipo'});

    // Calcular PyG del período
    const datos = all(
      `SELECT c.id,c.codigo,c.nombre,c.tipo,c.naturaleza,SUM(ap.debe) as debe,SUM(ap.haber) as haber
       FROM asiento_partidas ap JOIN asientos a ON a.id=ap.asiento_id JOIN cuentas c ON c.id=ap.cuenta_id
       WHERE a.empresa_id=? AND a.estado='contabilizado' AND a.periodo_id=?
       AND c.tipo IN('ingreso','costo','gasto') AND c.permite_movimiento=1
       GROUP BY c.id`,
      [req.params.empresa_id, periodo_id]);

    let ingresos=0, costos=0, gastos=0;
    const ctasIngreso=[], ctasCG=[];
    for (const d of datos) {
      const db=parseFloat(d.debe)||0, hb=parseFloat(d.haber)||0;
      const saldo = d.naturaleza==='acreedora' ? hb-db : db-hb;
      if (d.tipo==='ingreso') { ingresos+=saldo; ctasIngreso.push({...d,saldo}); }
      else if (d.tipo==='costo') { costos+=saldo; ctasCG.push({...d,saldo}); }
      else { gastos+=saldo; ctasCG.push({...d,saldo}); }
    }
    const utilidad_neta = ingresos - costos - gastos;

    // Cuenta resumen 3.1.06
    const cResumen  = get(`SELECT id FROM cuentas WHERE empresa_id=? AND codigo='3.1.06'`,[req.params.empresa_id]);
    const cUtilidad = get(`SELECT id FROM cuentas WHERE empresa_id=? AND codigo='3.1.04'`,[req.params.empresa_id]);
    const cPerdida  = get(`SELECT id FROM cuentas WHERE empresa_id=? AND codigo='3.1.05'`,[req.params.empresa_id]);

    // Crear asiento de cierre
    const numC = _nextNumAsiento(req.params.empresa_id);
    const aidC = uuid();
    run(`INSERT INTO asientos(id,empresa_id,periodo_id,numero,fecha,concepto,tipo,estado,usuario_id)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      [aidC,req.params.empresa_id,periodo_id,numC,todayHN(),
       `Cierre contable — ${periodo.nombre}`,'cierre','contabilizado',req.user.id]);

    // Cerrar cuentas de ingreso → débitar ingreso, acreditar resumen
    for (const d of ctasIngreso) {
      if (Math.abs(d.saldo)<0.01) continue;
      run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion) VALUES(?,?,?,?,?,?)`,
        [uuid(),aidC,d.id,d.saldo,0,'Cierre ingreso']);
      if (cResumen) run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion) VALUES(?,?,?,?,?,?)`,
        [uuid(),aidC,cResumen.id,0,d.saldo,'Cierre ingreso → resumen']);
    }
    // Cerrar cuentas de costo y gasto → acreditar costo/gasto, débitar resumen
    for (const d of ctasCG) {
      if (Math.abs(d.saldo)<0.01) continue;
      run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion) VALUES(?,?,?,?,?,?)`,
        [uuid(),aidC,d.id,0,d.saldo,'Cierre gasto/costo']);
      if (cResumen) run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion) VALUES(?,?,?,?,?,?)`,
        [uuid(),aidC,cResumen.id,d.saldo,0,'Cierre gasto/costo → resumen']);
    }
    // Trasladar resultado a utilidades/pérdida
    if (cResumen && Math.abs(utilidad_neta)>0.01) {
      if (utilidad_neta>0 && cUtilidad) {
        run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion) VALUES(?,?,?,?,?,?)`,
          [uuid(),aidC,cResumen.id,utilidad_neta,0,'Traslado utilidad']);
        run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion) VALUES(?,?,?,?,?,?)`,
          [uuid(),aidC,cUtilidad.id,0,utilidad_neta,'Utilidad del ejercicio']);
      } else if (utilidad_neta<0 && cPerdida) {
        run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion) VALUES(?,?,?,?,?,?)`,
          [uuid(),aidC,cResumen.id,0,Math.abs(utilidad_neta),'Traslado pérdida']);
        run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion) VALUES(?,?,?,?,?,?)`,
          [uuid(),aidC,cPerdida.id,Math.abs(utilidad_neta),0,'Pérdida del ejercicio']);
      }
    }

    // Registrar cierre y cerrar período
    const cid = uuid();
    run(`INSERT INTO cierres(id,empresa_id,periodo_id,tipo,asiento_cierre_id,
         utilidad_neta,ingresos,costos,gastos,usuario_id) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [cid,req.params.empresa_id,periodo_id,tipo||'mensual',aidC,
       utilidad_neta,ingresos,costos,gastos,req.user.id]);
    run(`UPDATE periodos SET estado='cerrado',fecha_cierre=? WHERE id=?`,[todayHN(),periodo_id]);
    saveDB();
    res.json({ok:1,cierre_id:cid,asiento_num:numC,utilidad_neta,ingresos,costos,gastos});
  } catch(e){ console.error('Cierre:',e.message); res.status(500).json({error:e.message}); }
});

app.get('/api/empresas/:empresa_id/cierres', authEmpresa(), (req,res) => {
  res.json(all(
    `SELECT ci.*,p.nombre as periodo_nombre,u.nombre as usuario_nombre
     FROM cierres ci JOIN periodos p ON p.id=ci.periodo_id
     LEFT JOIN usuarios u ON u.id=ci.usuario_id
     WHERE ci.empresa_id=? ORDER BY p.anio DESC,p.mes DESC`,
    [req.params.empresa_id]));
});

// ════════════════════════════════════════════════════════════════════════════
// FASE 2 — REPORTES SAR HONDURAS
// ════════════════════════════════════════════════════════════════════════════

// Config SAR por empresa
app.get('/api/empresas/:empresa_id/config_sar', authEmpresa(), (req,res) => {
  res.json(get(`SELECT * FROM config_sar WHERE empresa_id=?`,[req.params.empresa_id])
    || {empresa_id:req.params.empresa_id,regimen:'mercantil',tasa_isv:15,tasa_isr:25,declara_isv:1,declara_isr:1,inicio_fiscal:1});
});
app.put('/api/empresas/:empresa_id/config_sar', authEmpresa(), (req,res) => {
  try {
    const {regimen,tasa_isv,tasa_isr,declara_isv,declara_isr,inicio_fiscal} = req.body;
    const existe = get(`SELECT id FROM config_sar WHERE empresa_id=?`,[req.params.empresa_id]);
    if (existe) {
      run(`UPDATE config_sar SET regimen=?,tasa_isv=?,tasa_isr=?,declara_isv=?,declara_isr=?,inicio_fiscal=?,actualizado=?
           WHERE empresa_id=?`,
        [regimen||'mercantil',tasa_isv||15,tasa_isr||25,declara_isv?1:0,declara_isr?1:0,
         inicio_fiscal||1,nowHN(),req.params.empresa_id]);
    } else {
      run(`INSERT INTO config_sar(id,empresa_id,regimen,tasa_isv,tasa_isr,declara_isv,declara_isr,inicio_fiscal)
           VALUES(?,?,?,?,?,?,?,?)`,
        [uuid(),req.params.empresa_id,regimen||'mercantil',tasa_isv||15,tasa_isr||25,
         declara_isv?1:0,declara_isr?1:0,inicio_fiscal||1]);
    }
    saveDB(); res.json({ok:1});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// Libro de Ventas ISV (movimientos en cuentas ISV por período)
app.get('/api/empresas/:empresa_id/reportes/libro_ventas', authEmpresa(), (req,res) => {
  const {periodo_id,fecha_ini,fecha_fin} = req.query;
  let w=`WHERE a.empresa_id=? AND a.estado='contabilizado' AND c.codigo IN('2.1.02','2.1.03') AND c.permite_movimiento=1`;
  const p=[req.params.empresa_id];
  if (periodo_id){w+=` AND a.periodo_id=?`;p.push(periodo_id);}
  if (fecha_ini) {w+=` AND a.fecha>=?`;p.push(fecha_ini);}
  if (fecha_fin) {w+=` AND a.fecha<=?`;p.push(fecha_fin);}
  const rows = all(
    `SELECT a.numero,a.fecha,a.concepto,a.referencia,c.codigo as cta_codigo,
     c.nombre as cta_nombre,ap.debe,ap.haber
     FROM asiento_partidas ap JOIN asientos a ON a.id=ap.asiento_id JOIN cuentas c ON c.id=ap.cuenta_id
     ${w} ORDER BY a.fecha,a.numero`,p);
  const isv15 = rows.filter(r=>r.cta_codigo==='2.1.02').reduce((s,r)=>s+(parseFloat(r.haber)||0)-(parseFloat(r.debe)||0),0);
  const isv18 = rows.filter(r=>r.cta_codigo==='2.1.03').reduce((s,r)=>s+(parseFloat(r.haber)||0)-(parseFloat(r.debe)||0),0);
  res.json({movimientos:rows,resumen:{isv15,isv18,total:isv15+isv18}});
});

// PyG por mes para declaración SAR
app.get('/api/empresas/:empresa_id/reportes/sar_pyg', authEmpresa(), (req,res) => {
  const {anio} = req.query;
  const periodosSAR = anio
    ? all(`SELECT id,nombre,mes FROM periodos WHERE empresa_id=? AND anio=? ORDER BY mes`,[req.params.empresa_id,anio])
    : all(`SELECT id,nombre,mes FROM periodos WHERE empresa_id=? ORDER BY anio,mes`,[req.params.empresa_id]);
  const resultado=[];
  for (const per of periodosSAR) {
    const datos=all(
      `SELECT c.tipo,c.naturaleza,SUM(ap.debe) as debe,SUM(ap.haber) as haber
       FROM asiento_partidas ap JOIN asientos a ON a.id=ap.asiento_id JOIN cuentas c ON c.id=ap.cuenta_id
       WHERE a.empresa_id=? AND a.estado='contabilizado' AND a.periodo_id=?
       AND c.tipo IN('ingreso','costo','gasto') AND c.permite_movimiento=1
       GROUP BY c.tipo`,
      [req.params.empresa_id,per.id]);
    let ingresos=0,costos=0,gastos=0;
    for (const d of datos){
      const db=parseFloat(d.debe)||0,hb=parseFloat(d.haber)||0;
      const m=d.naturaleza==='acreedora'?hb-db:db-hb;
      if(d.tipo==='ingreso')ingresos+=m;else if(d.tipo==='costo')costos+=m;else gastos+=m;
    }
    resultado.push({periodo:per.nombre,mes:per.mes,ingresos,costos,gastos,utilidad:ingresos-costos-gastos});
  }
  const tot=resultado.reduce((a,r)=>({
    ingresos:a.ingresos+r.ingresos,costos:a.costos+r.costos,
    gastos:a.gastos+r.gastos,utilidad:a.utilidad+r.utilidad
  }),{ingresos:0,costos:0,gastos:0,utilidad:0});
  res.json({periodos:resultado,totales:tot,anio:anio||'Todos'});
});

// Reporte activos fijos SAR
app.get('/api/empresas/:empresa_id/reportes/activos_fijos', authEmpresa(), (req,res) => {
  const activos=all(
    `SELECT af.* FROM activos_fijos af WHERE af.empresa_id=? AND af.activo=1
     ORDER BY af.categoria,af.codigo`,
    [req.params.empresa_id]);
  const poCat={};
  for(const af of activos){
    if(!poCat[af.categoria])poCat[af.categoria]={activos:[],t_compra:0,t_dep:0,t_neto:0};
    poCat[af.categoria].activos.push(af);
    poCat[af.categoria].t_compra+=(parseFloat(af.valor_compra)||0);
    poCat[af.categoria].t_dep+=(parseFloat(af.dep_acumulada)||0);
    poCat[af.categoria].t_neto+=(parseFloat(af.valor_neto)||0);
  }
  res.json({activos,por_categoria:poCat,
    totales:{compra:activos.reduce((s,a)=>s+(parseFloat(a.valor_compra)||0),0),
             dep_acum:activos.reduce((s,a)=>s+(parseFloat(a.dep_acumulada)||0),0),
             valor_neto:activos.reduce((s,a)=>s+(parseFloat(a.valor_neto)||0),0)}});
});

// ════════════════════════════════════════════════════════════════════════════
// FASE 3 — INTEGRACIÓN CON METRIC POS
// ════════════════════════════════════════════════════════════════════════════

// ── Conexiones POS ──────────────────────────────────────────────────────────
app.get('/api/empresas/:empresa_id/pos/conexiones', authEmpresa(), (req,res) => {
  res.json(all(`SELECT * FROM pos_conexiones WHERE empresa_id=? ORDER BY nombre`,[req.params.empresa_id]));
});

app.post('/api/empresas/:empresa_id/pos/conexiones', authEmpresa(), (req,res) => {
  try {
    const {nombre, pos_url, pos_token, sucursal_pos_id} = req.body;
    if (!nombre || !pos_url) return res.status(400).json({error:'Nombre y URL son requeridos'});
    const id = uuid();
    run(`INSERT INTO pos_conexiones(id,empresa_id,nombre,pos_url,pos_token,sucursal_pos_id)
         VALUES(?,?,?,?,?,?)`,
      [id,req.params.empresa_id,nombre,pos_url.replace(/\/+$/,''),pos_token||'',sucursal_pos_id||'']);
    saveDB(); res.json({id});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.put('/api/empresas/:empresa_id/pos/conexiones/:id', authEmpresa(), (req,res) => {
  try {
    const {nombre, pos_url, pos_token, sucursal_pos_id, activa} = req.body;
    run(`UPDATE pos_conexiones SET nombre=?,pos_url=?,pos_token=?,sucursal_pos_id=?,activa=? WHERE id=? AND empresa_id=?`,
      [nombre,pos_url.replace(/\/+$/,''),pos_token||'',sucursal_pos_id||'',activa?1:0,req.params.id,req.params.empresa_id]);
    saveDB(); res.json({ok:1});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.delete('/api/empresas/:empresa_id/pos/conexiones/:id', authEmpresa(), (req,res) => {
  run(`DELETE FROM pos_conexiones WHERE id=? AND empresa_id=?`,[req.params.id,req.params.empresa_id]);
  saveDB(); res.json({ok:1});
});

// Probar conexión con el POS
app.post('/api/empresas/:empresa_id/pos/conexiones/:id/probar', authEmpresa(), async (req,res) => {
  const conn = get(`SELECT * FROM pos_conexiones WHERE id=? AND empresa_id=?`,[req.params.id,req.params.empresa_id]);
  if (!conn) return res.status(404).json({error:'Conexión no encontrada'});
  try {
    const http = require('http'), https = require('https');
    const url = new URL(conn.pos_url + '/api/licencia/estado');
    const client = url.protocol==='https:'?https:http;
    const result = await new Promise((resolve,reject) => {
      const r = client.get(url.toString(),{timeout:5000},(response) => {
        let data='';
        response.on('data',d=>data+=d);
        response.on('end',()=>{ try{resolve({ok:true,status:response.statusCode,data:JSON.parse(data)});}catch(e){resolve({ok:true,status:response.statusCode});} });
      });
      r.on('error',reject);
      r.on('timeout',()=>{ r.destroy(); reject(new Error('Timeout — el POS no responde en 5 segundos')); });
    });
    run(`UPDATE pos_conexiones SET ultima_sync=? WHERE id=?`,[nowHN(),conn.id]);
    saveDB();
    res.json({ok:true,mensaje:'Conexión exitosa con Metric POS',detalle:result});
  } catch(e){
    res.json({ok:false,mensaje:'No se pudo conectar: '+e.message});
  }
});

// ── Reglas de mapeo POS ─────────────────────────────────────────────────────
app.get('/api/empresas/:empresa_id/pos/reglas', authEmpresa(), (req,res) => {
  res.json(all(
    `SELECT r.*,
     cd.codigo as deb_cod, cd.nombre as deb_nom,
     cc.codigo as cred_cod, cc.nombre as cred_nom,
     c15.codigo as isv15_cod, c15.nombre as isv15_nom,
     c18.codigo as isv18_cod, c18.nombre as isv18_nom,
     cdes.codigo as desc_cod, cdes.nombre as desc_nom,
     cco.codigo as costo_cod, cco.nombre as costo_nom,
     cinv.codigo as inv_cod, cinv.nombre as inv_nom
     FROM pos_reglas r
     LEFT JOIN cuentas cd   ON cd.id=r.cta_debito_id
     LEFT JOIN cuentas cc   ON cc.id=r.cta_credito_id
     LEFT JOIN cuentas c15  ON c15.id=r.cta_isv15_id
     LEFT JOIN cuentas c18  ON c18.id=r.cta_isv18_id
     LEFT JOIN cuentas cdes ON cdes.id=r.cta_descuento_id
     LEFT JOIN cuentas cco  ON cco.id=r.cta_costo_id
     LEFT JOIN cuentas cinv ON cinv.id=r.cta_inventario_id
     WHERE r.empresa_id=? ORDER BY r.evento`,
    [req.params.empresa_id]));
});

app.put('/api/empresas/:empresa_id/pos/reglas/:evento', authEmpresa(), (req,res) => {
  try {
    const {cta_debito_id,cta_credito_id,cta_isv15_id,cta_isv18_id,
           cta_descuento_id,cta_costo_id,cta_inventario_id,descripcion,activa} = req.body;
    const existe = get(`SELECT id FROM pos_reglas WHERE empresa_id=? AND evento=?`,
      [req.params.empresa_id,req.params.evento]);
    if (existe) {
      run(`UPDATE pos_reglas SET cta_debito_id=?,cta_credito_id=?,cta_isv15_id=?,cta_isv18_id=?,
           cta_descuento_id=?,cta_costo_id=?,cta_inventario_id=?,descripcion=?,activa=?
           WHERE empresa_id=? AND evento=?`,
        [cta_debito_id||null,cta_credito_id||null,cta_isv15_id||null,cta_isv18_id||null,
         cta_descuento_id||null,cta_costo_id||null,cta_inventario_id||null,
         descripcion||'',activa!==false?1:0,req.params.empresa_id,req.params.evento]);
    } else {
      run(`INSERT INTO pos_reglas(id,empresa_id,evento,cta_debito_id,cta_credito_id,
           cta_isv15_id,cta_isv18_id,cta_descuento_id,cta_costo_id,cta_inventario_id,descripcion,activa)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uuid(),req.params.empresa_id,req.params.evento,
         cta_debito_id||null,cta_credito_id||null,cta_isv15_id||null,cta_isv18_id||null,
         cta_descuento_id||null,cta_costo_id||null,cta_inventario_id||null,
         descripcion||'',activa!==false?1:0]);
    }
    saveDB(); res.json({ok:1});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── Motor de asientos automáticos ──────────────────────────────────────────
function _generarAsientoDesdeTransaccion(empresa_id, periodo_id, tx, regla, usuario_id) {
  const num   = _nextNumAsiento(empresa_id);
  const aid   = uuid();
  const fecha = (tx.fecha||nowHN()).substring(0,10);

  // Calcular importes
  const total      = parseFloat(tx.total)||0;
  const isv15      = parseFloat(tx.isv15)||0;
  const isv18      = parseFloat(tx.isv18)||0;
  const descuento  = parseFloat(tx.descuento)||0;
  const subtotalSinIsv = total - isv15 - isv18;
  const baseVentas = subtotalSinIsv + descuento;

  run(`INSERT INTO asientos(id,empresa_id,periodo_id,numero,fecha,concepto,referencia,tipo,estado,usuario_id)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [aid,empresa_id,periodo_id,num,fecha,
     tx.concepto||`Sync POS — ${tx.referencia||tx.pos_id}`,
     tx.referencia||'',
     'automatico','contabilizado',usuario_id]);

  const lineas = [];

  if (tx.tipo_evento === 'venta_efectivo' || tx.tipo_evento === 'venta_tarjeta' ||
      tx.tipo_evento === 'venta_transferencia') {
    // Débito: Caja o Banco por el total
    lineas.push([regla.cta_debito_id,     total, 0,    `${tx.referencia} — Cobro ${tx.tipo_evento.replace('venta_','')}`]);
    // Crédito: Descuentos si aplica
    if (descuento > 0 && regla.cta_descuento_id) {
      lineas.push([regla.cta_descuento_id, 0, descuento, `Descuento — ${tx.referencia}`]);
    }
    // Crédito: Ventas (base sin ISV)
    lineas.push([regla.cta_credito_id,    0, baseVentas, `Venta — ${tx.referencia}`]);
    // Crédito: ISV 15%
    if (isv15 > 0 && regla.cta_isv15_id) {
      lineas.push([regla.cta_isv15_id,    0, isv15, `ISV 15% — ${tx.referencia}`]);
    }
    // Crédito: ISV 18%
    if (isv18 > 0 && regla.cta_isv18_id) {
      lineas.push([regla.cta_isv18_id,    0, isv18, `ISV 18% — ${tx.referencia}`]);
    }
  } else if (tx.tipo_evento === 'venta_credito') {
    // Débito: CxC Clientes por el total
    lineas.push([regla.cta_debito_id,     total, 0,    `CxC — ${tx.referencia}`]);
    if (descuento > 0 && regla.cta_descuento_id) {
      lineas.push([regla.cta_descuento_id, 0, descuento, `Descuento — ${tx.referencia}`]);
    }
    lineas.push([regla.cta_credito_id,    0, baseVentas, `Venta crédito — ${tx.referencia}`]);
    if (isv15 > 0 && regla.cta_isv15_id)
      lineas.push([regla.cta_isv15_id,    0, isv15, `ISV 15% — ${tx.referencia}`]);
    if (isv18 > 0 && regla.cta_isv18_id)
      lineas.push([regla.cta_isv18_id,    0, isv18, `ISV 18% — ${tx.referencia}`]);
  } else if (tx.tipo_evento === 'cobro_cxc') {
    // Débito: Caja por el monto cobrado
    lineas.push([regla.cta_debito_id,     total, 0,    `Cobro CxC — ${tx.referencia}`]);
    // Crédito: CxC Clientes
    lineas.push([regla.cta_credito_id,    0, total,    `Abono — ${tx.referencia}`]);
  } else if (tx.tipo_evento === 'pago_cxp') {
    // Débito: CxP Proveedores
    lineas.push([regla.cta_debito_id,     total, 0,    `Pago CxP — ${tx.referencia}`]);
    // Crédito: Banco
    lineas.push([regla.cta_credito_id,    0, total,    `Pago proveedor — ${tx.referencia}`]);
  } else if (tx.tipo_evento === 'devolucion') {
    // Débito: Devoluciones en Ventas
    lineas.push([regla.cta_debito_id,     total, 0,    `Devolución — ${tx.referencia}`]);
    // Crédito: Caja (devolvemos dinero)
    lineas.push([regla.cta_credito_id,    0, total,    `Devolución — ${tx.referencia}`]);
  } else if (tx.tipo_evento === 'compra_inventario') {
    // Débito: Inventario de Mercancías
    lineas.push([regla.cta_inventario_id||regla.cta_debito_id, total, 0, `Compra — ${tx.referencia}`]);
    // Crédito: CxP Proveedores
    lineas.push([regla.cta_credito_id,    0, total,    `Compra a crédito — ${tx.referencia}`]);
  }

  // Insertar todas las partidas
  for (const [cta_id, debe, haber, desc] of lineas) {
    if (!cta_id || (debe === 0 && haber === 0)) continue;
    run(`INSERT INTO asiento_partidas(id,asiento_id,cuenta_id,debe,haber,descripcion)
         VALUES(?,?,?,?,?,?)`,
      [uuid(),aid,cta_id,parseFloat(debe.toFixed(2)),parseFloat(haber.toFixed(2)),desc]);
  }

  return {asiento_id:aid, numero:num};
}

// ── Sincronización manual desde el Contab ──────────────────────────────────
app.post('/api/empresas/:empresa_id/pos/sync', authEmpresa(), async (req,res) => {
  const {conexion_id, fecha_ini, fecha_fin} = req.body;
  if (!conexion_id) return res.status(400).json({error:'conexion_id requerido'});

  const conn = get(`SELECT * FROM pos_conexiones WHERE id=? AND empresa_id=?`,
    [conexion_id,req.params.empresa_id]);
  if (!conn) return res.status(404).json({error:'Conexión no encontrada'});
  if (!conn.activa) return res.status(400).json({error:'Conexión inactiva'});

  const reglas = {};
  all(`SELECT * FROM pos_reglas WHERE empresa_id=? AND activa=1`,[req.params.empresa_id])
    .forEach(r => reglas[r.evento] = r);

  const hoy     = todayHN();
  const fIni    = fecha_ini || hoy;
  const fFin    = fecha_fin || hoy;
  const baseURL = conn.pos_url;
  const headers_pos = conn.pos_token ? {'Authorization':'Bearer '+conn.pos_token} : {};

  const resultados = {ok:0, errores:0, ignorados:0, asientos:[]};

  // Helper fetch sincrónico via http/https nativo
  const fetchPOS = (path) => new Promise((resolve,reject) => {
    const http = require('http'), https = require('https');
    const fullURL = baseURL + path;
    const url = new URL(fullURL);
    const client = url.protocol==='https:'?https:http;
    const port = url.port ? parseInt(url.port) : (url.protocol==='https:' ? 443 : 80);
    const opts = { hostname:url.hostname, port,
                   path:url.pathname+url.search, headers:headers_pos, timeout:10000 };
    const r = client.get(opts, (response) => {
      let data='';
      response.on('data',d=>data+=d);
      response.on('end',()=>{
        if (response.statusCode===401) { reject(new Error('POS rechazó el token (401) — verifica que el token no haya expirado')); return; }
        if (response.statusCode===403) { reject(new Error('Sin permiso en el POS (403)')); return; }
        if (response.statusCode>=400)  { reject(new Error(`Error del POS: HTTP ${response.statusCode}`)); return; }
        try{resolve(JSON.parse(data));}catch(e){resolve(null);}
      });
    });
    r.on('error',reject);
    r.on('timeout',()=>{ r.destroy(); reject(new Error('Timeout')); });
  });

  // ── 1. Sincronizar VENTAS ─────────────────────────────────────────────────
  try {
    const ventas = await fetchPOS(`/api/ventas?fecha_ini=${fIni}&fecha_fin=${fFin}&limite=500`);
    if (Array.isArray(ventas)) {
      for (const v of ventas) {
        if (v.estado === 'anulada') { resultados.ignorados++; continue; }
        const tipo_evento = 'venta_' + (v.forma_pago||'efectivo');
        const pos_id = v.id;

        const yaSync = get(`SELECT id FROM pos_sync_log WHERE empresa_id=? AND pos_id=? AND tipo=?`,
          [req.params.empresa_id, pos_id, tipo_evento]);
        if (yaSync) { resultados.ignorados++; continue; }

        const regla = reglas[tipo_evento] || reglas['venta_efectivo'];
        if (!regla || !regla.cta_debito_id || !regla.cta_credito_id) {
          run(`INSERT OR IGNORE INTO pos_sync_log(id,empresa_id,conexion_id,pos_id,tipo,estado,detalle)
               VALUES(?,?,?,?,?,?,?)`,
            [uuid(),req.params.empresa_id,conn.id,pos_id,tipo_evento,'error','Sin regla de mapeo configurada']);
          resultados.errores++; continue;
        }

        const periodo = _asegurarPeriodo(req.params.empresa_id, (v.fecha||hoy).substring(0,10));
        const per = get(`SELECT estado FROM periodos WHERE id=?`,[periodo]);
        if (per?.estado === 'cerrado') { resultados.ignorados++; continue; }

        try {
          const tx = {
            tipo_evento, pos_id,
            total:     parseFloat(v.total)||0,
            subtotal:  parseFloat(v.subtotal)||0,
            isv15:     parseFloat(v.isv15)||0,
            isv18:     parseFloat(v.isv18)||0,
            descuento: parseFloat(v.descuento)||0,
            referencia: v.numero_factura||v.id,
            fecha: (v.fecha||hoy).substring(0,10),
            concepto: `Venta ${v.numero_factura} — ${v.cliente_nombre||'Consumidor Final'}`,
          };
          const r = _generarAsientoDesdeTransaccion(req.params.empresa_id, periodo, tx, regla, req.user.id);
          run(`INSERT OR IGNORE INTO pos_sync_log(id,empresa_id,conexion_id,pos_id,tipo,asiento_id,estado,detalle)
               VALUES(?,?,?,?,?,?,?,?)`,
            [uuid(),req.params.empresa_id,conn.id,pos_id,tipo_evento,r.asiento_id,'ok',
             `Asiento #${r.numero} — ${v.numero_factura}`]);
          resultados.ok++;
          resultados.asientos.push(`#${r.numero} — ${v.numero_factura}`);
        } catch(e){
          run(`INSERT OR IGNORE INTO pos_sync_log(id,empresa_id,conexion_id,pos_id,tipo,estado,detalle)
               VALUES(?,?,?,?,?,?,?,?)`,
            [uuid(),req.params.empresa_id,conn.id,pos_id,tipo_evento,null,'error',e.message]);
          resultados.errores++;
        }
      }
    }
  } catch(e){
    resultados.errores++;
    resultados._errores_detalle = resultados._errores_detalle||[];
    resultados._errores_detalle.push('Ventas: '+e.message);
  }

  // ── 2. Sincronizar COBROS CxC ─────────────────────────────────────────────
  try {
    const cxcList = await fetchPOS(`/api/cxc?sucursal_id=${conn.sucursal_pos_id||''}`);
    if (Array.isArray(cxcList)) {
      const regla = reglas['cobro_cxc'];
      if (regla?.cta_debito_id && regla?.cta_credito_id) {
        for (const cxc of cxcList) {
          if (cxc.estado !== 'pagado') continue;
          const pos_id = 'cxc_' + cxc.id;
          const yaSync = get(`SELECT id FROM pos_sync_log WHERE empresa_id=? AND pos_id=? AND tipo=?`,
            [req.params.empresa_id, pos_id, 'cobro_cxc']);
          if (yaSync) { resultados.ignorados++; continue; }
          const monto = parseFloat(cxc.monto)||0;
          if (monto <= 0) continue;
          const periodo = _asegurarPeriodo(req.params.empresa_id, (cxc.fecha||hoy).substring(0,10));
          const per = get(`SELECT estado FROM periodos WHERE id=?`,[periodo]);
          if (per?.estado === 'cerrado') { resultados.ignorados++; continue; }
          try {
            const tx = {tipo_evento:'cobro_cxc',pos_id,total:monto,subtotal:monto,
                        isv15:0,isv18:0,descuento:0,referencia:cxc.referencia||cxc.id,
                        fecha:(cxc.fecha||hoy).substring(0,10),
                        concepto:`Cobro CxC — ${cxc.cliente_nombre||''} — ${cxc.referencia||cxc.id}`};
            const r = _generarAsientoDesdeTransaccion(req.params.empresa_id,periodo,tx,regla,req.user.id);
            run(`INSERT OR IGNORE INTO pos_sync_log(id,empresa_id,conexion_id,pos_id,tipo,asiento_id,estado,detalle)
                 VALUES(?,?,?,?,?,?,?,?)`,
              [uuid(),req.params.empresa_id,conn.id,pos_id,'cobro_cxc',r.asiento_id,'ok',
               `Asiento #${r.numero}`]);
            resultados.ok++;
            resultados.asientos.push(`#${r.numero} — CxC ${cxc.referencia||cxc.id}`);
          } catch(e){
            run(`INSERT OR IGNORE INTO pos_sync_log(id,empresa_id,conexion_id,pos_id,tipo,estado,detalle)
                 VALUES(?,?,?,?,?,?,?,?)`,
              [uuid(),req.params.empresa_id,conn.id,pos_id,'cobro_cxc',null,'error',e.message]);
            resultados.errores++;
          }
        }
      }
    }
  } catch(e){
    resultados.errores++;
    resultados._errores_detalle = resultados._errores_detalle||[];
    resultados._errores_detalle.push('CxC: '+e.message);
  }

  // ── 3. Sincronizar DEVOLUCIONES ──────────────────────────────────────────
  try {
    const devs = await fetchPOS(`/api/devoluciones?fecha_ini=${fIni}&fecha_fin=${fFin}`);
    if (Array.isArray(devs)) {
      const regla = reglas['devolucion'];
      if (regla?.cta_debito_id && regla?.cta_credito_id) {
        for (const dev of devs) {
          const pos_id = 'dev_' + dev.id;
          const yaSync = get(`SELECT id FROM pos_sync_log WHERE empresa_id=? AND pos_id=? AND tipo=?`,
            [req.params.empresa_id, pos_id, 'devolucion']);
          if (yaSync) { resultados.ignorados++; continue; }
          const monto = parseFloat(dev.total)||0;
          if (monto <= 0) continue;
          const periodo = _asegurarPeriodo(req.params.empresa_id,(dev.fecha||hoy).substring(0,10));
          const per = get(`SELECT estado FROM periodos WHERE id=?`,[periodo]);
          if (per?.estado === 'cerrado') { resultados.ignorados++; continue; }
          try {
            const tx = {tipo_evento:'devolucion',pos_id,total:monto,subtotal:monto,
                        isv15:0,isv18:0,descuento:0,referencia:dev.id,
                        fecha:(dev.fecha||hoy).substring(0,10),
                        concepto:`Devolución venta — ${dev.motivo||dev.id}`};
            const r = _generarAsientoDesdeTransaccion(req.params.empresa_id,periodo,tx,regla,req.user.id);
            run(`INSERT OR IGNORE INTO pos_sync_log(id,empresa_id,conexion_id,pos_id,tipo,asiento_id,estado,detalle)
                 VALUES(?,?,?,?,?,?,?,?)`,
              [uuid(),req.params.empresa_id,conn.id,pos_id,'devolucion',r.asiento_id,'ok',`Asiento #${r.numero}`]);
            resultados.ok++; resultados.asientos.push(`#${r.numero} — Dev.`);
          } catch(e){
            run(`INSERT OR IGNORE INTO pos_sync_log(id,empresa_id,conexion_id,pos_id,tipo,estado,detalle)
                 VALUES(?,?,?,?,?,?,?,?)`,
              [uuid(),req.params.empresa_id,conn.id,pos_id,'devolucion',null,'error',e.message]);
            resultados.errores++;
          }
        }
      }
    }
  } catch(e){
    resultados.errores++;
    resultados._errores_detalle = resultados._errores_detalle||[];
    resultados._errores_detalle.push('Devoluciones: '+e.message);
  }

  // ── 4. Sincronizar COMPRAS recibidas ────────────────────────────────────
  try {
    const compras = await fetchPOS(`/api/compras?fecha_ini=${fIni}&fecha_fin=${fFin}`);
    if (Array.isArray(compras)) {
      const regla = reglas['compra_inventario'];
      if (regla) {
        for (const comp of compras) {
          if (comp.estado !== 'recibida') continue;
          const pos_id = 'comp_' + comp.id;
          const yaSync = get(`SELECT id FROM pos_sync_log WHERE empresa_id=? AND pos_id=? AND tipo=?`,
            [req.params.empresa_id, pos_id, 'compra_inventario']);
          if (yaSync) { resultados.ignorados++; continue; }
          const monto = parseFloat(comp.total)||0;
          if (monto <= 0) continue;
          const periodo = _asegurarPeriodo(req.params.empresa_id,(comp.fecha||hoy).substring(0,10));
          const per = get(`SELECT estado FROM periodos WHERE id=?`,[periodo]);
          if (per?.estado === 'cerrado') { resultados.ignorados++; continue; }
          try {
            const tx = {tipo_evento:'compra_inventario',pos_id,total:monto,subtotal:monto,
                        isv15:0,isv18:0,descuento:0,referencia:comp.numero_doc||comp.id,
                        fecha:(comp.fecha||hoy).substring(0,10),
                        concepto:`Compra proveedor — ${comp.numero_doc||comp.id}`};
            const r = _generarAsientoDesdeTransaccion(req.params.empresa_id,periodo,tx,regla,req.user.id);
            run(`INSERT OR IGNORE INTO pos_sync_log(id,empresa_id,conexion_id,pos_id,tipo,asiento_id,estado,detalle)
                 VALUES(?,?,?,?,?,?,?,?)`,
              [uuid(),req.params.empresa_id,conn.id,pos_id,'compra_inventario',r.asiento_id,'ok',`Asiento #${r.numero}`]);
            resultados.ok++; resultados.asientos.push(`#${r.numero} — Compra`);
          } catch(e){
            run(`INSERT OR IGNORE INTO pos_sync_log(id,empresa_id,conexion_id,pos_id,tipo,estado,detalle)
                 VALUES(?,?,?,?,?,?,?,?)`,
              [uuid(),req.params.empresa_id,conn.id,pos_id,'compra_inventario',null,'error',e.message]);
            resultados.errores++;
          }
        }
      }
    }
  } catch(e){
    resultados.errores++;
    resultados._errores_detalle = resultados._errores_detalle||[];
    resultados._errores_detalle.push('Compras: '+e.message);
  }

  // Actualizar última sincronización
  run(`UPDATE pos_conexiones SET ultima_sync=? WHERE id=?`,[nowHN(),conn.id]);
  saveDB();
  res.json({...resultados, conexion:conn.nombre, fecha_ini:fIni, fecha_fin:fFin});
});

// Webhook: recibir transacciones en tiempo real desde Metric POS
app.post('/api/empresas/:empresa_id/pos/webhook', async (req,res) => {
  // Autenticación por token de conexión (no JWT, viene del POS)
  const token_header = req.headers['x-pos-token']||req.headers['authorization']?.split(' ')[1]||'';
  const conn = get(`SELECT * FROM pos_conexiones WHERE empresa_id=? AND pos_token=? AND activa=1`,
    [req.params.empresa_id, token_header]);
  if (!conn && token_header !== 'dev') return res.status(401).json({error:'Token inválido'});

  const empresa_id = req.params.empresa_id;
  const {tipo_evento, datos} = req.body;
  if (!tipo_evento || !datos) return res.status(400).json({error:'tipo_evento y datos requeridos'});

  const regla = get(`SELECT * FROM pos_reglas WHERE empresa_id=? AND evento=? AND activa=1`,
    [empresa_id, tipo_evento]);
  if (!regla) return res.json({ok:false,mensaje:`Sin regla para evento: ${tipo_evento}`});

  const pos_id = datos.id || datos.pos_id;
  if (!pos_id) return res.status(400).json({error:'datos.id requerido'});

  const yaSync = get(`SELECT id FROM pos_sync_log WHERE empresa_id=? AND pos_id=? AND tipo=?`,
    [empresa_id, pos_id, tipo_evento]);
  if (yaSync) return res.json({ok:true,mensaje:'Ya procesado anteriormente'});

  const hoy = todayHN();
  const fecha = (datos.fecha||hoy).substring(0,10);
  const periodo = _asegurarPeriodo(empresa_id, fecha);
  const per = get(`SELECT estado FROM periodos WHERE id=?`,[periodo]);
  if (per?.estado === 'cerrado') return res.json({ok:false,mensaje:'El período contable está cerrado'});

  try {
    const tx = {
      tipo_evento,
      pos_id,
      total:     parseFloat(datos.total)||0,
      isv15:     parseFloat(datos.isv15)||0,
      isv18:     parseFloat(datos.isv18)||0,
      descuento: parseFloat(datos.descuento)||0,
      subtotal:  parseFloat(datos.subtotal)||0,
      referencia: datos.numero_factura||datos.referencia||pos_id,
      fecha,
      concepto: datos.concepto||`Webhook ${tipo_evento} — ${datos.numero_factura||pos_id}`,
    };
    // superadmin como usuario para webhooks
    const adminId = get(`SELECT id FROM usuarios WHERE rol='superadmin' LIMIT 1`)?.id;
    const r = _generarAsientoDesdeTransaccion(empresa_id, periodo, tx, regla, adminId);
    run(`INSERT OR IGNORE INTO pos_sync_log(id,empresa_id,conexion_id,pos_id,tipo,asiento_id,estado,detalle)
         VALUES(?,?,?,?,?,?,?,?)`,
      [uuid(),empresa_id,conn?.id||null,pos_id,tipo_evento,r.asiento_id,'ok',`Asiento #${r.numero}`]);
    saveDB();
    res.json({ok:true,asiento_id:r.asiento_id,numero:r.numero});
  } catch(e){
    run(`INSERT OR IGNORE INTO pos_sync_log(id,empresa_id,conexion_id,pos_id,tipo,estado,detalle)
         VALUES(?,?,?,?,?,?,?,?)`,
      [uuid(),empresa_id,conn?.id||null,pos_id,tipo_evento,null,'error',e.message]);
    saveDB();
    res.status(500).json({ok:false,error:e.message});
  }
});

// Log de sincronización
app.get('/api/empresas/:empresa_id/pos/sync_log', authEmpresa(), (req,res) => {
  const {limite,estado} = req.query;
  let sql = `SELECT l.*,a.numero as asiento_numero FROM pos_sync_log l
    LEFT JOIN asientos a ON a.id=l.asiento_id WHERE l.empresa_id=?`;
  const p = [req.params.empresa_id];
  if (estado) { sql+=` AND l.estado=?`; p.push(estado); }
  sql += ` ORDER BY l.fecha DESC LIMIT ?`;
  p.push(parseInt(limite)||200);
  res.json(all(sql,p));
});

// Dashboard POS: estadísticas de sincronización
app.get('/api/empresas/:empresa_id/pos/dashboard', authEmpresa(), (req,res) => {
  const eid = req.params.empresa_id;
  const hoy = todayHN();
  const totales = get(`SELECT COUNT(*) as total, SUM(CASE WHEN estado='ok' THEN 1 ELSE 0 END) as ok,
    SUM(CASE WHEN estado='error' THEN 1 ELSE 0 END) as errores,
    SUM(CASE WHEN estado='ignorado' THEN 1 ELSE 0 END) as ignorados
    FROM pos_sync_log WHERE empresa_id=?`,[eid]);
  const hoy_stats = get(`SELECT COUNT(*) as total,SUM(CASE WHEN estado='ok' THEN 1 ELSE 0 END) as ok
    FROM pos_sync_log WHERE empresa_id=? AND date(fecha)=?`,[eid,hoy]);
  const por_tipo = all(`SELECT tipo, COUNT(*) as cantidad FROM pos_sync_log
    WHERE empresa_id=? AND estado='ok' GROUP BY tipo ORDER BY cantidad DESC`,[eid]);
  const conexiones = all(`SELECT * FROM pos_conexiones WHERE empresa_id=? ORDER BY nombre`,[eid]);
  res.json({totales,hoy:hoy_stats,por_tipo,conexiones});
});

// SPA fallback
// ── LIBRO DE COMPRAS ISV ─────────────────────────────────────────────────────
app.get('/api/empresas/:empresa_id/compras', authEmpresa(), (req,res) => {
  const {mes,anio,fecha_ini,fecha_fin} = req.query;
  let w = `WHERE empresa_id=? AND estado='activa'`;
  const p = [req.params.empresa_id];
  if (mes&&anio) {
    const ini = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const ult = new Date(parseInt(anio),parseInt(mes),0).toISOString().substring(0,10);
    w+=` AND fecha>=? AND fecha<=?`; p.push(ini,ult);
  } else {
    if (fecha_ini) { w+=` AND fecha>=?`; p.push(fecha_ini); }
    if (fecha_fin) { w+=` AND fecha<=?`; p.push(fecha_fin); }
  }
  const filas = all(`SELECT fecha,proveedor_rtn,proveedor_nombre,numero_documento,cai,
    monto_total,compras_exentas,base_gravada_15,isv_15,base_gravada_18,isv_18
    FROM compras ${w} ORDER BY fecha ASC`,p);
  const totales = filas.reduce((t,r)=>({
    monto_total:     t.monto_total    +(r.monto_total||0),
    compras_exentas: t.compras_exentas+(r.compras_exentas||0),
    base_gravada_15: t.base_gravada_15+(r.base_gravada_15||0),
    isv_15:          t.isv_15         +(r.isv_15||0),
    base_gravada_18: t.base_gravada_18+(r.base_gravada_18||0),
    isv_18:          t.isv_18         +(r.isv_18||0),
  }),{monto_total:0,compras_exentas:0,base_gravada_15:0,isv_15:0,base_gravada_18:0,isv_18:0});
  res.json({filas,totales});
});

app.post('/api/empresas/:empresa_id/compras', authEmpresa(), (req,res) => {
  const {fecha,proveedor_rtn,proveedor_nombre,numero_documento,cai,
         monto_total,compras_exentas,base_gravada_15,isv_15,base_gravada_18,isv_18} = req.body;
  if (!fecha||!proveedor_nombre) return res.status(400).json({error:'Fecha y proveedor requeridos'});
  run(`INSERT INTO compras(id,empresa_id,fecha,proveedor_rtn,proveedor_nombre,numero_documento,
       cai,monto_total,compras_exentas,base_gravada_15,isv_15,base_gravada_18,isv_18)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [uuid(),req.params.empresa_id,fecha,proveedor_rtn||'',proveedor_nombre,
     numero_documento||'',cai||'',monto_total||0,compras_exentas||0,
     base_gravada_15||0,isv_15||0,base_gravada_18||0,isv_18||0]);
  saveDB(); res.json({ok:1});
});

app.delete('/api/empresas/:empresa_id/compras/:id', authEmpresa(), (req,res) => {
  run(`UPDATE compras SET estado='anulada' WHERE id=? AND empresa_id=?`,
    [req.params.id,req.params.empresa_id]);
  saveDB(); res.json({ok:1});
});

app.get('/{*path}', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));

initDB().then(() => {
  app.listen(PORT,'0.0.0.0',() => {
    console.log(`\n📊 Metric Contab v3.0 (Integración POS) → http://localhost:${PORT}`);
    console.log(`   Login: admin / admin123\n`);
  });
}).catch(err => { console.error(err); process.exit(1); });
