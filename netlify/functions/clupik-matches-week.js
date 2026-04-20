const { apiGet, paginate, utcToMadrid, json } = require('./_clupik');

function pick(attrs, enKey, esKey) {
  if (!attrs) return null;
  if (attrs[enKey] !== undefined && attrs[enKey] !== null) return attrs[enKey];
  if (attrs[esKey] !== undefined && attrs[esKey] !== null) return attrs[esKey];
  return null;
}

// Status que consideramos "activo"
const ACTIVE_STATUSES = new Set([
  'setting_up', 'running', 'public', 'active', 'in_progress',
  'configurando', 'en_progreso',
]);

// Convierte "DD/MM/YYYY" a Date (UTC midnight del día Madrid - UTC-1)
// Simplificación: tratamos la fecha como día calendario Madrid.
function parseDDMMYYYY(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || '');
  if (!m) return null;
  return { year: parseInt(m[3]), month: parseInt(m[2]), day: parseInt(m[1]) };
}

// Devuelve true si fechaMadrid ("DD/MM/YYYY") está entre from y to (inclusive)
function dateInRange(fechaMadrid, from, to) {
  if (!fechaMadrid) return false;
  const d = parseDDMMYYYY(fechaMadrid);
  if (!d) return false;
  const fromD = parseDDMMYYYY(from);
  const toD = parseDDMMYYYY(to);
  const keyD = d.year * 10000 + d.month * 100 + d.day;
  const keyFrom = fromD ? fromD.year * 10000 + fromD.month * 100 + fromD.day : 0;
  const keyTo = toD ? toD.year * 10000 + toD.month * 100 + toD.day : 99999999;
  return keyD >= keyFrom && keyD <= keyTo;
}

exports.handler = async (event) => {
  const from = event.queryStringParameters?.from;
  const to = event.queryStringParameters?.to;
  if (!from || !to) {
    return json(400, { error: 'Faltan query params from/to (formato DD/MM/YYYY)' });
  }

  const managerId = process.env.CLUPIK_MANAGER_ID || '229546';

  try {
    // 1) Torneos activos del manager
    const tournaments = await paginate('/tournaments', {
      filter: `manager.id:${managerId}`,
    });
    const active = tournaments.filter((t) => {
      const status = (pick(t.attributes, 'status', 'estado') || '').toLowerCase();
      return ACTIVE_STATUSES.has(status);
    });

    // Para cada torneo activo, bajamos sus partidos y mapeamos al formato del planificador
    const allPartidos = [];
    const tournamentsSeen = [];

    for (const t of active) {
      const tid = t.id;
      const tname = pick(t.attributes, 'name', 'nombre') || '';

      // Equipos del torneo
      let teamsArr;
      try {
        teamsArr = await paginate('/teams', { filter: `registrable_id:${tid}` });
      } catch (_) { teamsArr = []; }
      const teamById = new Map();
      for (const team of teamsArr) {
        teamById.set(team.id, pick(team.attributes, 'name', 'nombre') || `#${team.id}`);
      }

      // Grupos
      let groupsArr;
      try {
        groupsArr = await paginate('/groups', { filter: `tournament.id:${tid}` });
      } catch (_) { groupsArr = []; }
      const groupById = new Map();
      for (const g of groupsArr) {
        groupById.set(g.id, pick(g.attributes, 'name', 'nombre') || g.id);
      }

      // Rounds
      let roundsArr;
      try {
        roundsArr = await paginate('/rounds', { filter: `group.tournament.id:${tid}` });
      } catch (_) { roundsArr = []; }
      const roundById = new Map();
      for (const r of roundsArr) {
        const number = pick(r.attributes, 'number', 'numero');
        const name = pick(r.attributes, 'name', 'nombre');
        const roundName = name || (number != null ? `Jornada ${number}` : r.id);
        const groupId = r.relationships?.group?.data?.id || null;
        roundById.set(r.id, { name: roundName, groupId });
      }

      // Partidos
      let matchesArr;
      try {
        matchesArr = await paginate('/matches', {
          filter: `round.group.tournament.id:${tid}`,
        });
      } catch (_) { matchesArr = []; }

      // Facilities referenciadas (cacheadas solo para los partidos que nos quedan)
      const facIdsForThis = new Set();

      const candidatos = [];
      for (const m of matchesArr) {
        if (pick(m.attributes, 'rest', 'descanso')) continue;
        const dt = pick(m.attributes, 'datetime', 'fecha_hora') || '';
        const { fecha, hora } = utcToMadrid(dt);
        if (!dateInRange(fecha, from, to)) continue;

        candidatos.push({ m, dt, fecha, hora });
        const fid = m.relationships?.facility?.data?.id;
        if (fid) facIdsForThis.add(fid);
      }
      if (!candidatos.length) continue;

      // Resolver facilities solo para los partidos que se quedan
      const facById = new Map();
      for (const fid of facIdsForThis) {
        try {
          const r = await apiGet(`/facilities/${fid}`);
          if (r.status === 200) {
            facById.set(fid, pick(r.body?.data?.attributes, 'name', 'nombre') || '');
          }
        } catch (_) {}
      }

      for (const { m, dt, fecha, hora } of candidatos) {
        const homeId = m.meta?.home_team || m.meta?.equipo_local;
        const awayId = m.meta?.away_team || m.meta?.equipo_visitante;
        const roundId = m.relationships?.round?.data?.id;
        const round = roundId ? roundById.get(roundId) : null;
        const groupId = round?.groupId || null;
        const facilityId = m.relationships?.facility?.data?.id || null;

        const eq1 = homeId ? teamById.get(homeId) || `#${homeId}` : '';
        const eq2 = awayId ? teamById.get(awayId) || `#${awayId}` : '';
        if (!eq1 || !eq2) continue;

        allPartidos.push({
          match_id: m.id,
          eq1, eq2, fecha, hora,
          datetime_utc_original: dt || null,
          lugar: facilityId ? facById.get(facilityId) || '' : '',
          jornada: round?.name || '',
          comp: tname,
          grupo: groupId ? groupById.get(groupId) || '' : '',
          finished: !!(pick(m.attributes, 'finished', 'terminado') || pick(m.attributes, 'finished', 'finalizado')),
          canceled: !!(pick(m.attributes, 'canceled', 'cancelado')),
          postponed: !!(pick(m.attributes, 'postponed', 'aplazado')),
        });
      }
      tournamentsSeen.push({ id: tid, name: tname, matches: candidatos.length });
    }

    // Ordenar por fecha+hora
    allPartidos.sort((a, b) => {
      const ka = (a.datetime_utc_original || '') + a.eq1;
      const kb = (b.datetime_utc_original || '') + b.eq1;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    return json(200, {
      from, to,
      tournaments_checked: active.length,
      tournaments_with_matches: tournamentsSeen,
      count: allPartidos.length,
      partidos: allPartidos,
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
