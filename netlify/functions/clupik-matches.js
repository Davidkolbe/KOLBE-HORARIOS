// GET /api/clupik-matches?tournament_id=XXXXX
// Devuelve los partidos de un torneo en formato compatible con el
// planificador. fecha/hora vienen en hora local Madrid; guardamos también
// el UTC original para detectar cambios luego.

const { apiGet, paginate, utcToMadrid, json } = require('./_clupik');

exports.handler = async (event) => {
  const tid = event.queryStringParameters?.tournament_id;
  if (!tid) return json(400, { error: 'Falta query param tournament_id' });

  try {
    // Info del torneo
    const t = await apiGet(`/tournaments/${tid}`);
    if (t.status !== 200) return json(t.status, t.body || { error: 'Torneo no accesible' });
    const tournamentName = t.body?.data?.attributes?.name || '';

    // Equipos (polymorfica -> filter=registrable_id)
    const teamsArr = await paginate('/teams', { filter: `registrable_id:${tid}` });
    const teamById = new Map();
    for (const team of teamsArr) {
      teamById.set(team.id, team.attributes?.name || `#${team.id}`);
    }

    // Grupos
    const groupsArr = await paginate('/groups', { filter: `tournament.id:${tid}` });
    const groupById = new Map();
    for (const g of groupsArr) {
      groupById.set(g.id, g.attributes?.name || g.id);
    }

    // Rounds (jornadas)
    const roundsArr = await paginate('/rounds', {
      filter: `group.tournament.id:${tid}`,
    });
    const roundById = new Map();
    for (const r of roundsArr) {
      const name = r.attributes?.name
        || (r.attributes?.number != null ? `Jornada ${r.attributes.number}` : r.id);
      const groupId = r.relationships?.group?.data?.id || null;
      roundById.set(r.id, { name, groupId });
    }

    // Partidos
    const matchesArr = await paginate('/matches', {
      filter: `round.group.tournament.id:${tid}`,
    });

    // Resolver instalaciones (facilities) que aparezcan
    const facIds = new Set();
    for (const m of matchesArr) {
      const fid = m.relationships?.facility?.data?.id;
      if (fid) facIds.add(fid);
    }
    const facById = new Map();
    for (const fid of facIds) {
      try {
        const r = await apiGet(`/facilities/${fid}`);
        if (r.status === 200) facById.set(fid, r.body?.data?.attributes?.name || '');
      } catch (_) {}
    }

    // Mapear al formato que el planificador entiende
    const partidos = matchesArr
      .filter((m) => !m.attributes?.rest)
      .map((m) => {
        const datetimeUtc = m.attributes?.datetime || '';
        const { fecha, hora } = utcToMadrid(datetimeUtc);

        const homeId = m.meta?.home_team;
        const awayId = m.meta?.away_team;
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
          finished: !!m.attributes?.finished,
          canceled: !!m.attributes?.canceled,
          postponed: !!m.attributes?.postponed,
        };
      })
      .filter((p) => p.eq1 && p.eq2);

    return json(200, {
      tournament_id: tid,
      tournament_name: tournamentName,
      count: partidos.length,
      partidos,
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
