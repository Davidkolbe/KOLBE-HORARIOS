const { apiGet, paginate } = require('./_clupik');

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
  const managerId = process.env.CLUPIK_MANAGER_ID || '229546';
  try {
    const items = await paginate('/tournaments', {
      filter: `manager.id:${managerId}`,
    });
    items.sort((a, b) => Number(b.id) - Number(a.id));
    const tournaments = items.map((t) => ({
      id: t.id,
      name: pick(t.attributes, 'name', 'nombre') || '',
      status: pick(t.attributes, 'status', 'estado') || '',
      modality: pick(t.attributes, 'modality', 'modalidad') || '',
      created_at: pick(t.attributes, 'created_at', 'creado_en'),
      updated_at: pick(t.attributes, 'updated_at', 'actualizado_en'),
    }));
    sendJson(res, 200, { manager_id: managerId, tournaments });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
};
