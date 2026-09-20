import { verifySessionToken } from './_auth.js';
import { listLeads } from './_leads.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  if (!verifySessionToken(token)) return res.status(401).json({ error: 'غير مصرح' });

  const leads = await listLeads();
  return res.status(200).json(leads);
}
