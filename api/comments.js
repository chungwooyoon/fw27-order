// 코멘트 저장/조회 API (Vercel Blob · 비공개 저장소)
// GET  /api/comments -> 코멘트 전체 목록
// POST /api/comments -> 내 코멘트 한 건 저장 (내용이 비어 있으면 삭제)
//
// 저장 구조: 사람마다 파일 하나 (comments/<author_id>.json)
//   { author_name, items: { "<item_key>": { body, updated_at } } }
// 각자 자기 파일만 고치므로, 여러 명이 동시에 써도 서로 덮어쓰지 않는다.
// Vercel에 배포되면 인증은 자동(OIDC)으로 처리되어 별도 키가 필요 없다.
import { put, get, list } from '@vercel/blob';

const DIR = 'comments/';
const pathFor = uid => DIR + uid + '.json';

async function readOne(pathname) {
  try {
    const res = await get(pathname, { access: 'private' });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const doc = JSON.parse(await new Response(res.stream).text());
    return doc && typeof doc === 'object' ? doc : null;
  } catch (e) {
    if (e && (e.name === 'BlobNotFoundError' || /not found/i.test(String(e.message || e)))) return null;
    throw e;
  }
}

async function readAll() {
  const { blobs } = await list({ prefix: DIR, limit: 1000 });
  const rows = [];
  await Promise.all(blobs.map(async b => {
    const uid = b.pathname.slice(DIR.length).replace(/\.json$/, '');
    const doc = await readOne(b.pathname);
    if (!doc || !doc.items) return;
    for (const [item_key, v] of Object.entries(doc.items)) {
      if (!v || !v.body) continue;
      rows.push({
        item_key,
        author_id: uid,
        author_name: doc.author_name || '익명',
        body: v.body,
        updated_at: v.updated_at || 0,
      });
    }
  }));
  return rows;
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
      const uid = String(b.author_id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
      if (!key || !uid) return res.status(400).json({ error: 'item_key, author_id 필요' });
      const body = String(b.body || '').slice(0, 2000);

      const doc = (await readOne(pathFor(uid))) || { items: {} };
      doc.author_name = String(b.author_name || doc.author_name || '익명').slice(0, 40);
      doc.items = doc.items || {};
      if (body.trim()) doc.items[key] = { body, updated_at: Date.now() };
      else delete doc.items[key];

      await put(pathFor(uid), JSON.stringify(doc), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      });
      return res.status(200).json({ ok: true, count: Object.keys(doc.items).length });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'GET, POST만 지원' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
