// يُستخدم من لوحة تحكم الوكالة لتوليد رابط تفويض Mailchimp، تُرسله للعميل ليربط حسابه بنفسه
import { verifySessionToken } from './_auth.js';
import { createOAuthState, getAuthUrl } from './_mailchimp.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  if (!verifySessionToken(token)) return res.status(401).json({ error: 'غير مصرح' });

  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'الإيميل مطلوب' });

  // state موقّع ومؤقت حتى لا يمكن تبديل العميل المرتبط أثناء OAuth.
  const state = createOAuthState(email);
  const authUrl = getAuthUrl(req, state);

  return res.status(200).json({ authUrl });
}
