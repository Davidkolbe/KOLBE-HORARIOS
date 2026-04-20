// POST /api/clupik-update-match
// Body acepta cualquier combinación de:
//   { "match_id": "12345", "fecha": "25/04/2026", "hora": "10:30" }
//   { "match_id": "12345", "datetime_utc": "2026-04-25 08:30:00" }
//   { "match_id": "12345", "postponed": true }
//   { "match_id": "12345", "facility_id": "9876" }
//
// Al menos uno de los campos de cambio (fecha+hora / datetime_utc / postponed / facility_id)
// es obligatorio.

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

  const { match_id, fecha, hora, datetime_utc: dtDirect, postponed, facility_id } = input;
  if (!match_id) return json(400, { error: 'Falta match_id' });

  const attributes = {};
  const relationships = {};

  // Fecha/hora o datetime UTC
  if (dtDirect) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dtDirect)) {
      return json(400, { error: 'datetime_utc debe tener formato "YYYY-MM-DD HH:MM:SS"' });
    }
    attributes.datetime = dtDirect;
  } else if (fecha && hora) {
    try {
      attributes.datetime = madridToUtc(fecha, hora);
    } catch (e) {
      return json(400, { error: e.message });
    }
  }

  // Aplazado
  if (typeof postponed === 'boolean') {
    attributes.postponed = postponed;
  }

  // Cambio de campo
  if (facility_id) {
    relationships.facility = { data: { type: 'facility', id: String(facility_id) } };
  }

  if (!Object.keys(attributes).length && !Object.keys(relationships).length) {
    return json(400, { error: 'Nada que cambiar: falta fecha+hora / datetime_utc / postponed / facility_id' });
  }

  const payload = {
    data: {
      type: 'match',
      id: String(match_id),
      attributes: attributes,
    },
  };
  if (Object.keys(relationships).length) payload.data.relationships = relationships;

  try {
    const { status, body } = await apiPatch(`/matches/${match_id}`, payload);
    if (status >= 200 && status < 300) {
      return json(200, {
        ok: true,
        match_id,
        datetime_utc: attributes.datetime || null,
        postponed: attributes.postponed,
        facility_id: facility_id || null,
        match: body && body.data || null,
      });
    }
    return json(status, { ok: false, match_id, error: body });
  } catch (e) {
    return json(500, { ok: false, match_id, error: e.message });
  }
};
