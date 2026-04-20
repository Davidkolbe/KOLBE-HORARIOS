// Módulo compartido: autenticación y llamadas a la API de Clupik/Leverade
// Todas las Netlify Functions de clupik-* usan estos helpers.
//
// Variables de entorno requeridas (configuradas en el panel de Netlify):
//   CLUPIK_CLIENT_ID       (por defecto "53")
//   CLUPIK_CLIENT_SECRET   (secreto - NUNCA en el repo)
//   CLUPIK_MANAGER_ID      (por defecto "229546" - CD Kolbe / Deporte Infantil)

const API_URL = 'https://api.leverade.com';
const TOKEN_URL = 'https://api.leverade.com/oauth/token';

// Caché en memoria del token. Persiste entre invocaciones "calientes" de la
// misma función, pero no entre cold starts.
let cachedToken = null;
let cachedExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedExpiry > now + 60_000) return cachedToken;

  const clientId = process.env.CLUPIK_CLIENT_ID || '53';
  const clientSecret = process.env.CLUPIK_CLIENT_SECRET;
  if (!clientSecret) {
    throw new Error('Falta CLUPIK_CLIENT_SECRET en variables de entorno.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Auth Clupik falló (${r.status}): ${text.slice(0, 300)}`);
  }
  const data = await r.json();
  cachedToken = data.access_token;
  cachedExpiry = now + (data.expires_in - 60) * 1000;
  return cachedToken;
}

function buildUrl(path, params) {
  const url = new URL(API_URL + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
    }
  }
  return url;
}

async function apiGet(path, params) {
  const token = await getAccessToken();
  const url = buildUrl(path, params);
  const r = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
    },
  });
  let body = null;
  try { body = await r.json(); } catch (_) {}
  return { status: r.status, body };
}

async function apiPatch(path, payload) {
  const token = await getAccessToken();
  const r = await fetch(API_URL + path, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
    },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await r.json(); } catch (_) {}
  return { status: r.status, body };
}

// Pagina un endpoint devolviendo todos los items (hasta un límite duro).
async function paginate(path, baseParams, maxPages = 50) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const { status, body } = await apiGet(path, {
      ...baseParams,
      'page[size]': 100,
      'page[number]': page,
    });
    if (status !== 200) {
      throw new Error(
        `${path} HTTP ${status}: ${JSON.stringify(body).slice(0, 240)}`
      );
    }
    const items = (body && body.data) || [];
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

// ===== Helpers de zona horaria =====
// La API trabaja en UTC. El app trabaja en hora local Madrid (Europe/Madrid).

// "YYYY-MM-DD HH:MM:SS" UTC → { fecha: "DD/MM/YYYY", hora: "HH:MM" } en Madrid
function utcToMadrid(utcStr) {
  if (!utcStr) return { fecha: '', hora: '00:00' };
  const d = new Date(utcStr.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return { fecha: '', hora: '00:00' };
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const o = {};
  for (const p of parts) o[p.type] = p.value;
  return {
    fecha: `${o.day}/${o.month}/${o.year}`,
    hora: `${o.hour}:${o.minute}`,
  };
}

// { fecha: "DD/MM/YYYY", hora: "HH:MM" } en Madrid → "YYYY-MM-DD HH:MM:SS" UTC
function madridToUtc(fecha, hora) {
  const mf = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha);
  const mh = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!mf || !mh) throw new Error(`Formato inválido: fecha "${fecha}" / hora "${hora}"`);
  const [_, day, month, year] = mf;
  const [__, hh, mm] = mh;

  // Madrid es UTC+1 en invierno y UTC+2 en verano (DST).
  // Probamos ambos offsets y nos quedamos con el que, al formatearse
  // en zona Madrid, coincide con la entrada.
  for (const offset of [1, 2]) {
    const utc = new Date(Date.UTC(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      parseInt(hh) - offset, parseInt(mm), 0,
    ));
    const madridStr = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Madrid',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(utc);
    if (madridStr === `${year}-${month}-${day} ${hh}:${mm}`) {
      const iso = utc.toISOString();
      return iso.slice(0, 10) + ' ' + iso.slice(11, 19);
    }
  }
  // Fallback: invierno
  const fb = new Date(Date.UTC(
    parseInt(year), parseInt(month) - 1, parseInt(day),
    parseInt(hh) - 1, parseInt(mm), 0,
  ));
  const iso = fb.toISOString();
  return iso.slice(0, 10) + ' ' + iso.slice(11, 19);
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(obj),
  };
}

module.exports = {
  API_URL,
  getAccessToken,
  apiGet,
  apiPatch,
  paginate,
  utcToMadrid,
  madridToUtc,
  json,
};
