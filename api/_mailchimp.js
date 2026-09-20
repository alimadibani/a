// وحدة مساعدة للاتصال بـ Mailchimp عبر OAuth 2.0 (Connected Accounts)
// تحتاج تسجيل تطبيق على Mailchimp أولًا — التفاصيل بملف README
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const CLIENT_ID = process.env.MAILCHIMP_CLIENT_ID;
const CLIENT_SECRET = process.env.MAILCHIMP_CLIENT_SECRET;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getStateSecret() {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET مفقود');
  return process.env.SESSION_SECRET;
}

export function createOAuthState(email) {
  const payload = JSON.stringify({
    email: email.toLowerCase(),
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    nonce: randomBytes(16).toString('hex')
  });
  const encodedPayload = Buffer.from(payload).toString('base64url');
  const signature = createHmac('sha256', getStateSecret()).update(encodedPayload).digest('hex');
  return `${encodedPayload}.${signature}`;
}

export function verifyOAuthState(state) {
  try {
    const [encodedPayload, signature] = state.split('.');
    if (!encodedPayload || !signature) return null;
    const expected = createHmac('sha256', getStateSecret()).update(encodedPayload).digest('hex');
    const suppliedBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload.email || !payload.expiresAt || Date.now() > payload.expiresAt) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function getRedirectUri(req) {
  return `https://${req.headers.host}/api/mailchimp-callback`;
}

// رابط التفويض الذي يفتحه العميل من حسابه هو
export function getAuthUrl(req, state) {
  const redirectUri = encodeURIComponent(getRedirectUri(req));
  return `https://login.mailchimp.com/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${redirectUri}&state=${encodeURIComponent(state)}`;
}

// تبديل رمز التفويض المؤقت برمز وصول دائم (Access Token)
export async function exchangeCodeForToken(code, req) {
  const res = await fetch('https://login.mailchimp.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: getRedirectUri(req),
      code
    })
  });
  if (!res.ok) throw new Error('فشل تبديل رمز التفويض');
  const data = await res.json();
  return data.access_token;
}

// جلب معلومات الحساب (يشمل رابط الـAPI الخاص بمركز بيانات هذا الحساب تحديدًا)
export async function fetchMetadata(accessToken) {
  const res = await fetch('https://login.mailchimp.com/oauth2/metadata', {
    headers: { Authorization: `OAuth ${accessToken}` }
  });
  if (!res.ok) throw new Error('فشل جلب بيانات الحساب');
  return res.json(); // يحتوي api_endpoint و account name و dc
}

// جلب أول قائمة بريدية بحساب العميل (تبسيط: نستخدم أول قائمة تلقائيًا)
export async function fetchFirstList(apiEndpoint, accessToken) {
  const res = await fetch(`${apiEndpoint}/3.0/lists?count=1`, {
    headers: { Authorization: `OAuth ${accessToken}` }
  });
  if (!res.ok) throw new Error('فشل جلب القوائم البريدية');
  const data = await res.json();
  return data.lists?.[0]?.id || null;
}

// إنشاء حملة (نشرة) وجدولتها للإرسال الفوري داخل حساب العميل نفسه
export async function createAndSendCampaign(mailchimpAccount, draft) {
  const { accessToken, apiEndpoint, listId } = mailchimpAccount;
  const headers = { Authorization: `OAuth ${accessToken}`, 'Content-Type': 'application/json' };

  // أول سطر بالمسودة يُستخدم كعنوان الحملة، والباقي محتوى الرسالة
  const lines = draft.draftText.split('\n').filter(Boolean);
  const subject = lines[0] || 'نشرتك الأسبوعية';
  const bodyHtml = draft.draftText.replace(/\n/g, '<br>');

  const createRes = await fetch(`${apiEndpoint}/3.0/campaigns`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'regular',
      recipients: { list_id: listId },
      settings: { subject_line: subject, title: `InboxLoops — ${new Date().toLocaleDateString('ar')}`, from_name: mailchimpAccount.accountName || 'النشرة', reply_to: draft.clientEmail || 'noreply@inboxloops.com' }
    })
  });
  if (!createRes.ok) throw new Error('فشل إنشاء الحملة بـMailchimp');
  const campaign = await createRes.json();

  const contentRes = await fetch(`${apiEndpoint}/3.0/campaigns/${campaign.id}/content`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ html: `<div style="font-family:sans-serif; direction:rtl;">${bodyHtml}</div>` })
  });
  if (!contentRes.ok) throw new Error('فشل تعيين محتوى الحملة');

  const sendRes = await fetch(`${apiEndpoint}/3.0/campaigns/${campaign.id}/actions/send`, {
    method: 'POST',
    headers
  });
  if (!sendRes.ok) throw new Error('فشل إرسال الحملة فعليًا');

  return { campaignId: campaign.id };
}
