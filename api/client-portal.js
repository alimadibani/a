// يعرض كل نشرات عميل معيّن (سابقة وحالية) عبر رمز دخول دائم خاص به
import { kvGet, getIndex } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { email, token } = req.query;
  if (!email || !token) return res.status(400).json({ error: 'رابط غير صالح' });

  const client = await kvGet(`client:${email.toLowerCase()}`);
  if (!client || client.portalToken !== token) {
    return res.status(401).json({ error: 'رابط غير صالح' });
  }

  const draftIds = await getIndex(`client:${email.toLowerCase()}:drafts`);
  const drafts = await Promise.all(draftIds.map(id => kvGet(`draft:${id}`)));
  const list = drafts
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(d => ({
      id: d.id,
      status: d.status,
      createdAt: d.createdAt,
      snippet: (d.draftText || '').slice(0, 90),
      magicToken: d.magicToken // يُستخدم لفتح review.html لأي نشرة من الأرشيف للقراءة
    }));

  return res.status(200).json(list);
}
