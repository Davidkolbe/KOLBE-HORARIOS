// POST /api/clupik-update-match
// Body (opción A - recomendada):
//   { "match_id": "12345", "fecha": "25/04/2026", "hora": "10:30" }
//   (fecha y hora en hora local Madrid; la función convierte a UTC)
// Body (opción B - datetime UTC directo):
//   { "match_id": "12345", "datetime_utc": "2026-04-25 08:30:00" }

const { apiPatch, madridToUtc, json } = require('./_clupik');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método no permitido, usa POST' });
  }

  let input;
  try {
    input = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Body inválido: debe ser JSON' });
  }

  const { match_id, fecha, hora, datetime_utc: dtDirect } = input;
  if (!match_id) return json(400, { error: 'Falta match_id' });

  let datetimeUtc;
  try {
    if (dtDirect) {
      datetimeUtc = dtDirect;
    } else if (fecha && hora) {
      datetimeUtc = madridToUtc(fecha, hora);
    } else {
      return json(400, {
        error: 'Faltan fecha+hora (Madrid) o datetime_utc',
      });
    }
  } catch (e) {
    return json(400, { error: e.message });
  }

  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(datetimeUtc)) {
    return json(400, {
      error: 'datetime_utc debe tener formato "YYYY-MM-DD HH:MM:SS"',
    });
  }

  const payload = {
    data: {
      type: 'match',
      id: String(match_id),
      attributes: { datetime: datetimeUtc },
    },
  };

  try {
    const { status, body } = await apiPatch(`/matches/${match_id}`, payload);
    if (status >= 200 && status < 300) {
      return json(200, {
        ok: true,
        match_id,
        datetime_utc: datetimeUtc,
        match: body?.data || null,
      });
    }
    return json(status, { ok: false, match_id, error: body });
  } catch (e) {
    return json(500, { ok: false, match_id, error: e.message });
  }
};
