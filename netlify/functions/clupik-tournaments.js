// GET /api/clupik-tournaments
// Devuelve la lista de torneos gestionados por el manager del CD Kolbe,
// ordenados por ID descendente (los más recientes primero).

const { apiGet, paginate, json } = require('./_clupik');

exports.handler = async () => {
  const managerId = process.env.CLUPIK_MANAGER_ID || '229546';
  try {
    const items = await paginate('/tournaments', {
      filter: `manager.id:${managerId}`,
    });
    items.sort((a, b) => Number(b.id) - Number(a.id));
    const tournaments = items.map((t) => ({
      id: t.id,
      name: t.attributes?.name || '',
      status: t.attributes?.status || '',
      modality: t.attributes?.modality || '',
      created_at: t.attributes?.created_at || null,
      updated_at: t.attributes?.updated_at || null,
    }));
    return json(200, { manager_id: managerId, tournaments });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
