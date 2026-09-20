import { verifyPassword, createSessionToken, isLockedOut, recordFailedAttempt, clearFailedAttempts } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

  if (isLockedOut(ip)) {
    return res.status(429).json({ error: 'محاولات كثيرة فاشلة، حاول بعد 15 دقيقة.' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'الإيميل وكلمة المرور مطلوبان' });

  const validEmail = email.trim().toLowerCase() === (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const validPassword = validEmail && verifyPassword(password, process.env.ADMIN_PASSWORD_HASH);

  if (!validEmail || !validPassword) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  clearFailedAttempts(ip);
  try {
    const token = createSessionToken(email);
    return res.status(200).json({ token });
  } catch (err) {
    console.error('auth.js error:', err.message);
    return res.status(500).json({ error: 'إعداد الخادم غير مكتمل (SESSION_SECRET مفقود) — راجع README' });
  }
}
