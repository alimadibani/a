// يُستخدم من لوحة تحكم الوكالة فقط لجلب رابط الأرشيف الدائم لعميل معيّن (لإرساله له يدويًا)
import { kvGet } from './_db.js';
import { verifySessionToken } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  if (!verifySessionToken(token)) return res.status(401).json({ error: 'غير مصرح' });

  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'الإيميل مطلوب' });

  const client = await kvGet(`client:${email.toLowerCase()}`);
  if (!client) return res.status(404).json({ error: 'لا يوجد سجل لهذا العميل' });

  return res.status(200).json({ portalToken: client.portalToken });
}
