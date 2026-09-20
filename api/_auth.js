// وحدة مصادقة بسيطة وآمنة — بدون مكتبات خارجية (تعتمد على crypto المدمجة بـNode.js)
import { scryptSync, timingSafeEqual, randomBytes, createHmac } from 'crypto';

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // نرفض العمل بدل استخدام قيمة افتراضية معروفة يمكن لأي شخص يشوف الكود العام تزويرها
    throw new Error('SESSION_SECRET غير مُعدّ بمتغيرات البيئة — لا يمكن إصدار أو التحقق من الجلسات بدونه');
  }
  return secret;
}

// ==== تشفير كلمة المرور (scrypt) ====
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const hashBuffer = Buffer.from(hash, 'hex');
  const suppliedHash = scryptSync(password, salt, 64);
  // طول متساوٍ دائمًا هنا (64 بايت)، الاستخدام آمن
  return hashBuffer.length === suppliedHash.length && timingSafeEqual(hashBuffer, suppliedHash);
}

// ==== جلسات الدخول (Session Token موقّع، صالح 7 أيام) ====
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createSessionToken(email) {
  const expiry = Date.now() + SESSION_TTL_MS;
  const payload = `${email}.${expiry}`;
  const signature = createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export function verifySessionToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    // الإيميل نفسه قد يحتوي نقاطًا (مثل owner@inboxloops.com)، لذا نأخذ آخر جزأين
    // كـ(انتهاء الصلاحية، التوقيع) ونعيد تجميع الباقي كإيميل، بدل تقسيم ثابت بـ3 أجزاء
    const parts = decoded.split('.');
    if (parts.length < 3) return null;
    const signature = parts.pop();
    const expiryStr = parts.pop();
    const email = parts.join('.');
    const expiry = Number(expiryStr);
    if (!email || !Number.isFinite(expiry)) return null;
    const expectedSignature = createHmac('sha256', getSessionSecret())
      .update(`${email}.${expiry}`)
      .digest('hex');
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const validSig = sigBuffer.length === expectedBuffer.length && timingSafeEqual(sigBuffer, expectedBuffer);
    if (!validSig) return null;
    if (Date.now() > expiry) return null; // انتهت صلاحية الجلسة
    return { email };
  } catch (_) {
    return null;
  }
}

// ==== حماية من محاولات الدخول المتكررة (Brute-Force) — أفضل جهد داخل الذاكرة ====
const failedAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 دقيقة

export function isLockedOut(ip) {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAttempt > LOCKOUT_MS) {
    failedAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(ip) {
  const entry = failedAttempts.get(ip) || { count: 0, firstAttempt: Date.now() };
  entry.count += 1;
  failedAttempts.set(ip, entry);
}

export function clearFailedAttempts(ip) {
  failedAttempts.delete(ip);
}
