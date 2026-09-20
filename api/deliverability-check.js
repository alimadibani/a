import { kvGet, kvSet } from './_db.js';
import { verifySessionToken } from './_auth.js';
import { checkDeliverability } from './_deliverability.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  if (!verifySessionToken(token)) return res.status(401).json({ error: 'غير مصرح' });

  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'الإيميل مطلوب' });

  const domain = email.split('@')[1];
  if (!domain) return res.status(400).json({ error: 'إيميل غير صالح' });

  const result = await checkDeliverability(domain);

  const clientKey = `client:${email.toLowerCase()}`;
  const client = await kvGet(clientKey);
  if (client) {
    client.deliverability = result;
    await kvSet(clientKey, client);
  }

  return res.status(200).json(result);
}
