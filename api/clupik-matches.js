const { apiGet, paginate, utcToMadrid } = require('./_clupik');
function sendJson(res, status, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(obj));
}


function pick(attrs, enKey, esKey) {
  if (!attrs) return null;
  if (attrs[enKey] !== undefined && attrs[enKey] !== null) return attrs[enKey];
  if (attrs[esKey] !== undefined && attrs[esKey] !== null) return attrs[esKey];
  return null;
}

module.exports = async (req, res) => {
  const tid = req.query.tournament_id;
  if (!tid) return sendJson(res, 400, { error: 'Falta query param tournament_id' });

  try {
    const t = await apiGet(`/tournaments/${tid}`);
    if (t.status !== 200) return sendJson(res, t.status, t.body || { error: 'Torneo no accesible' });
    const tournamentName = pick(t.body?.data?.attributes, 'name', 'nombre') || '';

    const teamsArr = await paginate('/teams', { filter: `registrable_id:${tid}` });
    const teamById = new Map();
    for (const team of teamsArr) {
      teamById.set(team.id, pick(team.attributes, 'name', 'nombre') || `#${team.id}`);
    }

    const groupsArr = await paginate('/groups', { filter: `tournament.id:${tid}` });
    const groupById = new Map();
    for (const g of groupsArr) {
      groupById.set(g.id, pick(g.attributes, 'name', 'nombre') || g.id);
    }

    const roundsArr = await paginate('/rounds', {
      filter: `group.tournament.id:${tid}`,
    });
    const roundById = new Map();
    for (const r of roundsArr) {
      const number = pick(r.attributes, 'number', 'numero');
      const name = pick(r.attributes, 'name', 'nombre');
      const roundName = name || (number != null ? `Jornada ${number}` : r.id);
      const groupId = r.relationships?.group?.data?.id || null;
      roundById.set(r.id, { name: roundName, groupId });
    }

    const matchesArr = await paginate('/matches', {
      filter: `round.group.tournament.id:${tid}`,
    });

    const facIds = new Set();
    for (const m of matchesArr) {
      const fid = m.relationships?.facility?.data?.id;
      if (fid) facIds.add(fid);
    }
    const facById = new Map();
    for (const fid of facIds) {
      try {
        const r = await apiGet(`/facilities/${fid}`);
        if (r.status === 200) {
          facById.set(fid, pick(r.body?.data?.attributes, 'name', 'nombre') || '');
        }
      } catch (_) {}
    }

    const partidos = matchesArr
      .filter((m) => !(pick(m.attributes, 'rest', 'descanso')))
      .map((m) => {
        const datetimeUtc = pick(m.attributes, 'datetime', 'fecha_hora')
          || pick(m.attributes, 'datetime', 'fechahora')
          || '';
        const { fecha, hora } = utcToMadrid(datetimeUtc);

        const homeId = m.meta?.home_team || m.meta?.equipo_local;
        const awayId = m.meta?.away_team || m.meta?.equipo_visitante;
        const roundId = m.relationships?.round?.data?.id;
        const round = roundId ? roundById.get(roundId) : null;
        const groupId = round?.groupId || null;
        const facilityId = m.relationships?.facility?.data?.id || null;

        return {
          match_id: m.id,
          eq1: homeId ? teamById.get(homeId) || `#${homeId}` : '',
          eq2: awayId ? teamById.get(awayId) || `#${awayId}` : '',
          fecha,
          hora,
          datetime_utc_original: datetimeUtc || null,
          lugar: facilityId ? facById.get(facilityId) || '' : '',
          jornada: round?.name || '',
          comp: tournamentName,
          grupo: groupId ? groupById.get(groupId) || '' : '',
          finished: !!(pick(m.attributes, 'finished', 'terminado') || pick(m.attributes, 'finished', 'finalizado')),
          canceled: !!(pick(m.attributes, 'canceled', 'cancelado')),
          postponed: !!(pick(m.attributes, 'postponed', 'aplazado')),
        };
      })
      .filter((p) => p.eq1 && p.eq2);

    return sendJson(res, 200, {
      tournament_id: tid,
      tournament_name: tournamentName,
      count: partidos.length,
      partidos,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e.message });
  }
};
