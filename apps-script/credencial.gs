/**
 * API de la Credencial Digital — GLOBECO SMART
 * ------------------------------------------------------------
 * Devuelve SOLO los datos públicos de la credencial de UNA persona.
 * Reemplaza al CSV publicado de la hoja, que exponía cédulas, PIN,
 * tokens, valores quincenales, etc. de todo el equipo.
 *
 * INSTALACIÓN (una sola vez):
 *  ⚠ NO pegar en el proyecto "PORTAL" de la hoja: ese proyecto ya tiene
 *    doGet/doPost (el inicio de sesión del portal) y chocaría.
 *  1. script.google.com → Nuevo proyecto "CREDENCIAL API" (independiente).
 *  2. Pega este código en Código.gs.
 *  3. Implementar → Nueva implementación → tipo "Aplicación web".
 *       Ejecutar como: Yo        Quién tiene acceso: Cualquier persona
 *  4. Copia la URL que termina en /exec y pégala en index.html
 *     (constante CREDENCIAL_API_URL).
 *
 * USO:
 *  GET  …/exec?id=GL001
 *  POST …/exec   body: {"id":"GL001","t":"<token de sesión del portal>"}
 *       (con "t" y sin "id" devuelve la credencial de quien tiene esa sesión)
 */

// Hoja "BASE DE IDENTIFICACIONES" y su pestaña USUARIOS (gid=0)
var CRED_SPREADSHEET_ID = '1m_iQrfb63NkGJwS4DHthb2M8DsyxzWl3XRxJzXctSqU';
var CRED_SHEET_GID = 0;

// Encabezados de la fila 1 que se usan (se buscan por nombre, no por posición)
var CRED_COLS = {
  ID: 'ID',
  NOMBRES: 'Nombres',
  ALIAS: 'Alias',
  NUMERO: 'Numero',
  CORREO: 'Correo',
  PROYECTO: 'Proyecto empresa',
  CIUDAD: 'Ciudad',
  CARGO: 'Cargo',
  ESTADO: 'Estado',
  REQUIERE_QR: 'REQUIERE QR',
  FOTO: 'FOTO CREDENCIAL',
  TOKEN: 'token'
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  return credResponder_(credBuscar_(p.id, ''));
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  return credResponder_(credBuscar_(body.id, body.t));
}

function credBuscar_(idRaw, tokenRaw) {
  var id = String(idRaw || '').trim().toUpperCase();
  var token = String(tokenRaw || '').trim();
  if (!/^[A-Z0-9_-]{1,20}$/.test(id)) id = '';
  if (!id && !token) return { ok: false, error: 'sin_id' };

  var datos = credLeerHoja_();
  var c = datos.cols;
  var fila = null;

  if (id) {
    fila = datos.filas.find(function (r) { return String(r[c.ID] || '').trim().toUpperCase() === id; }) || null;
  } else if (token && c.TOKEN >= 0) {
    fila = datos.filas.find(function (r) { return String(r[c.TOKEN] || '').trim() === token; }) || null;
  }
  if (!fila) return { ok: false, error: 'no_encontrado' };

  var val = function (k) { return c[k] >= 0 ? String(fila[c[k]] == null ? '' : fila[c[k]]).trim() : ''; };

  if (val('REQUIERE_QR').toUpperCase() === 'NO') {
    return { ok: false, error: 'desactivada', nombre: val('ALIAS') };
  }

  var tokenFila = val('TOKEN');
  return {
    ok: true,
    esDueno: !!(token && tokenFila && token === tokenFila),
    persona: {
      id: val('ID'),
      nombre: (val('NOMBRES') || val('ALIAS')).split(/\s+/)[0] || '',
      alias: val('ALIAS'),
      cargo: val('CARGO'),
      proyecto: val('PROYECTO'),
      ciudad: val('CIUDAD'),
      email: val('CORREO'),
      telefono: val('NUMERO'),
      estado: val('ESTADO'),
      foto: val('FOTO')
    }
  };
}

// Lee la hoja una vez por minuto como máximo (caché) para responder rápido
function credLeerHoja_() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('cred_hoja_v1');
  if (guardado) {
    try { return JSON.parse(guardado); } catch (e) {}
  }
  var hoja = SpreadsheetApp.openById(CRED_SPREADSHEET_ID).getSheets().filter(function (s) {
    return s.getSheetId() === CRED_SHEET_GID;
  })[0];
  var valores = hoja.getDataRange().getDisplayValues();
  var enc = valores[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var cols = {};
  Object.keys(CRED_COLS).forEach(function (k) { cols[k] = enc.indexOf(CRED_COLS[k].toLowerCase()); });

  // Solo se guardan en caché las columnas necesarias (nunca cédula, PIN, sueldos…)
  var usadas = Object.keys(cols).filter(function (k) { return cols[k] >= 0; });
  var filas = valores.slice(1).map(function (r) {
    var o = [];
    usadas.forEach(function (k, i) { o[i] = r[cols[k]]; });
    return o;
  });
  var colsCompactas = {};
  Object.keys(cols).forEach(function (k) { colsCompactas[k] = usadas.indexOf(k); });

  var datos = { cols: colsCompactas, filas: filas };
  try { cache.put('cred_hoja_v1', JSON.stringify(datos), 60); } catch (e) { /* demasiado grande: sin caché */ }
  return datos;
}

function credResponder_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
