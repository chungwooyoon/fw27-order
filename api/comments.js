// 코멘트 저장/조회 API (Vercel Blob 사용)
// GET  /api/comments        -> 코멘트 전체 목록
// POST /api/comments        -> 코멘트 한 건 저장(같은 사람+같은 항목이면 덮어씀)
import { put, list } from '@vercel/blob';

const FILE = 'fw27-comments.json';

async function readAll() {
  try {
    const { blobs } = await list({ prefix: FILE });
    const b = blobs.find(x => x.pathname === FILE);
    if (!b) return [];
    const res = await fetch(b.url, { cache: 'no-store' });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [];
  }
}

async function writeAll(rows) {
  await put(FILE, JSON.stringify(rows), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await readAll());
    }
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const key = String(b.item_key || '').slice(0, 200);
      const uid = String(b.author_id || '').slice(0, 64);
      if (!key || !uid) return res.status(400).json({ error: 'item_key, author_id 필요' });
      const row = {
        item_key: key,
        author_id: uid,
        author_name: String(b.author_name || '익명').slice(0, 40),
        body: String(b.body || '').slice(0, 2000),
        updated_at: Date.now(),
      };
      const rows = (await readAll()).filter(r => !(r.item_key === key && r.author_id === uid));
      if (row.body.trim()) rows.push(row);
      await writeAll(rows);
      return res.status(200).json({ ok: true, count: rows.length });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'GET, POST만 지원' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
