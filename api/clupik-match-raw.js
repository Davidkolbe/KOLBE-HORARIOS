// Endpoint de DIAGNÓSTICO para descubrir qué campos contiene la API de Clupik/Leverade
// para los marcadores de un partido. Uso:
//   GET /api/clupik-match-raw?match_id=12345
//   GET /api/clupik-match-raw?tournament_id=678  (devuelve el primer partido finalizado)
//
// Devuelve el JSON crudo de la API (con todos los attributes) para poder identificar
// los nombres reales de los campos de marcador y planificar la integración del
// "Camino B" (auto-fetch de resultados).
//
// SEGURO: solo lee, no escribe. Pero al ser información sensible del torneo, conviene
// borrar este archivo cuando hayamos terminado la investigación.

const { apiGet, paginate } = require('./_clupik');

function sendJson(res, status, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  const matchId = req.query.match_id;
  const tournamentId = req.query.tournament_id;

  try {
    // Caso 1: match_id directo
    if (matchId) {
      const r = await apiGet(`/matches/${matchId}`);
      return sendJson(res, r.status, {
        debug_note: 'Raw response from /matches/{id}. Busca en attributes y meta los campos que contengan goles/sets/marcador.',
        match_id: matchId,
        response: r.body,
      });
    }

    // Caso 2: tournament_id → buscar primer partido finalizado y devolverlo en bruto
    if (tournamentId) {
      const matchesArr = await paginate('/matches', {
        filter: `round.group.tournament.id:${tournamentId}`,
      });

      // Ordenar por fecha descendente para coger el más reciente (probablemente finalizado)
      const sorted = [...matchesArr].sort((a, b) => {
        const da = a.attributes?.datetime || a.attributes?.fecha_hora || '';
        const db = b.attributes?.datetime || b.attributes?.fecha_hora || '';
        return db.localeCompare(da);
      });

      // Buscar el primero con finished:true / terminado:true
      const finished = sorted.find((m) => {
        const a = m.attributes || {};
        return a.finished === true || a.terminado === true || a.finalizado === true;
      });

      const sample = finished || sorted[0] || null;
      if (!sample) return sendJson(res, 404, { error: 'No hay partidos en este torneo.' });

      // Lista de claves que aparecen en attributes para inspección rápida
      const keys = Object.keys(sample.attributes || {});

      return sendJson(res, 200, {
        debug_note: 'Primer partido encontrado. \'finished\' indica si terminó. Mira las claves de attributes en attribute_keys.',
        tournament_id: tournamentId,
        total_matches: matchesArr.length,
        finished_count: matchesArr.filter((m) => {
          const a = m.attributes || {};
          return a.finished === true || a.terminado === true || a.finalizado === true;
        }).length,
        attribute_keys: keys,
        sample_match: sample,
      });
    }

    return sendJson(res, 400, {
      error: 'Falta query param: usa ?match_id=XXX o ?tournament_id=YYY',
      usage: {
        single_match: '/api/clupik-match-raw?match_id=12345',
        first_finished_in_tournament: '/api/clupik-match-raw?tournament_id=67890',
      },
    });
  } catch (e) {
    return sendJson(res, 500, { error: e.message || String(e) });
  }
};
