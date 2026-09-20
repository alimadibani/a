// إدارة دورة حياة المسودة: إنشاء ← مراجعة الوكالة ← مراجعة العميل ← جاهزة للجدولة
import { kvGet, kvSet, addToIndex, getIndex } from './_db.js';
import { verifySessionToken } from './_auth.js';
import { randomUUID, randomBytes } from 'crypto';
import { createAndSendCampaign } from './_mailchimp.js';
import { notifyTelegram } from './_notify.js';

const DRAFTS_INDEX = 'drafts:index';
const MAGIC_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 يومًا

function isAuthorized(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  return !!verifySessionToken(token);
}

function generateSecureToken() {
  return randomBytes(24).toString('base64url'); // رمز طويل وعشوائي، يصعب تخمينه
}

// يزيل علامات {{flag:...}}...{{/flag}} قبل وصول النص للعميل نهائيًا
function stripFlags(text) {
  return (text || '').replace(/\{\{flag:.*?\}\}(.*?)\{\{\/flag\}\}/g, '$1');
}

function isMagicTokenValid(draft, suppliedToken) {
  if (!draft.magicToken || draft.magicToken !== suppliedToken) return false;
  if (draft.magicTokenExpiry && Date.now() > draft.magicTokenExpiry) return false;
  return true;
}

function isValidStatusTransition(status, action) {
  const allowed = {
    agency_approve: ['pending_agency_review', 'needs_agency_recheck'],
    agency_edit: ['pending_agency_review', 'needs_agency_recheck'],
    agency_resend_link: ['pending_client_review'],
    client_approve: ['pending_client_review'],
    client_request_edit: ['pending_client_review'],
    mark_sent: ['ready_to_schedule']
  };
  return allowed[action]?.includes(status) || false;
}

async function ensureClientRecord(email) {
  if (!email) return null;
  const key = `client:${email.toLowerCase()}`;
  let client = await kvGet(key);
  if (!client) {
    client = { email: email.toLowerCase(), portalToken: generateSecureToken() };
    await kvSet(key, client);
  }
  return client;
}

// فهرس مسودات كل عميل بمفتاح Set منفصل وآمن للتزامن (بدل مصفوفة داخل سجل العميل)
async function addDraftToClientRecord(email, draftId) {
  if (!email) return;
  await ensureClientRecord(email);
  await addToIndex(`client:${email.toLowerCase()}:drafts`, draftId);
}

// منطق إنشاء المسودة الأساسي — مُصدَّر ليُستدعى مباشرة من chat.js
// بدل عمل طلب HTTP كامل لنفس الخادم (كان يضيف دورة شبكة كاملة غير ضرورية بكل رسالة)
export async function createDraft({ clientName, clientEmail, rawContent, draftText }) {
  if (!draftText) throw new Error('لا يوجد نص مسودة');

  const id = randomUUID();
  const now = Date.now();
  const draft = {
    id,
    clientName: clientName || 'غير معروف',
    clientEmail: clientEmail || '',
    rawContent: rawContent || '',
    draftText,
    status: 'pending_agency_review',
    magicToken: null,
    magicTokenExpiry: null,
    createdAt: now,
    updatedAt: now
  };
  await kvSet(`draft:${id}`, draft);
  await addToIndex(DRAFTS_INDEX, id);
  if (clientEmail) await addDraftToClientRecord(clientEmail, id);
  return draft;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // عرض مسودة واحدة عبر id (تُستخدم من صفحة مراجعة العميل والوكالة، ومن الأرشيف للقراءة)
      if (req.query.id) {
        const draft = await kvGet(`draft:${req.query.id}`);
        if (!draft) return res.status(404).json({ error: 'المسودة غير موجودة' });
        // القراءة تتطلب: إما جلسة وكالة صالحة، أو الرمز السري الصحيح لهذه المسودة تحديدًا
        const suppliedToken = req.query.token;
        const hasValidMagicToken = isMagicTokenValid(draft, suppliedToken);
        if (!isAuthorized(req) && !hasValidMagicToken) {
          return res.status(401).json({ error: 'غير مصرح بالوصول لهذه المسودة' });
        }
        return res.status(200).json(draft);
      }
      // عرض كل المسودات (تحتاج جلسة دخول صالحة) — لوحة التحكم
      if (!isAuthorized(req)) {
        return res.status(401).json({ error: 'غير مصرح' });
      }
      const ids = await getIndex(DRAFTS_INDEX);
      const drafts = await Promise.all(ids.map(id => kvGet(`draft:${id}`)));
      const filtered = drafts.filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
      return res.status(200).json(filtered);
    }

    if (req.method === 'POST') {
      // الإنشاء الداخلي يتم مباشرة عبر createDraft من chat.js، ولا نعرضه كواجهة عامة.
      return res.status(405).json({ error: 'إنشاء المسودات متاح عبر المحادثة فقط' });
    }

    if (req.method === 'PATCH') {
      // تحديث حالة المسودة (اعتماد الوكالة / تعديل / رد العميل)
      const { id, action, updatedText, magicToken } = req.body || {};
      const draft = await kvGet(`draft:${id}`);
      if (!draft) return res.status(404).json({ error: 'المسودة غير موجودة' });

      const agencyActions = ['agency_approve', 'agency_edit', 'mark_sent', 'agency_resend_link'];
      const clientActions = ['client_approve', 'client_request_edit'];

      if (!isValidStatusTransition(draft.status, action)) {
        return res.status(409).json({ error: 'لا يمكن تنفيذ هذا الإجراء في حالة المسودة الحالية' });
      }

      if (agencyActions.includes(action) && !isAuthorized(req)) {
        return res.status(401).json({ error: 'غير مصرح' });
      }
      // أمان مهم: إجراءات العميل يجب أن تتحقق من الرمز السري وصلاحيته، وليس فقط عرض الصفحة
      if (clientActions.includes(action) && !isMagicTokenValid(draft, magicToken)) {
        return res.status(401).json({ error: 'الرابط غير صالح أو منتهي الصلاحية' });
      }

      if (action === 'agency_approve') {
        draft.status = 'pending_client_review';
        draft.draftText = stripFlags(updatedText || draft.draftText);
        // توليد رابط مراجعة جديد وآمن عند كل إرسال فعلي للعميل
        draft.magicToken = generateSecureToken();
        draft.magicTokenExpiry = Date.now() + MAGIC_LINK_TTL_MS;
      } else if (action === 'agency_edit') {
        draft.draftText = updatedText;
        // تبقى بحالة بانتظار مراجعة الوكالة حتى يضغط اعتماد صراحة
      } else if (action === 'agency_resend_link') {
        // لو انتهت صلاحية الرابط قبل ما يرد العميل، تولّد رابطًا جديدًا بنفس المسودة
        draft.magicToken = generateSecureToken();
        draft.magicTokenExpiry = Date.now() + MAGIC_LINK_TTL_MS;
        draft.status = 'pending_client_review';
      } else if (action === 'client_approve') {
        draft.status = 'ready_to_schedule';
      } else if (action === 'client_request_edit') {
        draft.status = 'needs_agency_recheck';
        draft.clientNote = req.body.note || '';
        await notifyTelegram(
          `⚠️ <b>العميل طلب تعديلًا</b>\nالعميل: ${draft.clientName || 'غير معروف'}\nالملاحظة: ${draft.clientNote}`
        );
      } else if (action === 'mark_sent') {
        // لو العميل مربوط حسابه بـMailchimp، نرسل الحملة فعليًا؛ وإلا نكتفي بتحديث الحالة يدويًا
        const client = draft.clientEmail ? await kvGet(`client:${draft.clientEmail.toLowerCase()}`) : null;
        if (client?.mailchimp) {
          const deliverabilityOk = client.deliverability?.passed;
          const forceOverride = req.body.forceOverride === true;
          if (!deliverabilityOk && !forceOverride) {
            return res.status(409).json({
              error: 'فحص ضمان الوصول (SPF/DMARC) لم يجتز لهذا العميل. أعد الفحص أو أكّد الإرسال رغم ذلك.',
              deliverability: client.deliverability || null,
              requiresOverride: true
            });
          }
          try {
            const result = await createAndSendCampaign(client.mailchimp, draft);
            draft.mailchimpCampaignId = result.campaignId;
            draft.sentVia = 'mailchimp_auto';
          } catch (sendErr) {
            console.error('فشل الإرسال التلقائي عبر Mailchimp:', sendErr);
            return res.status(502).json({ error: 'فشل الإرسال الفعلي عبر Mailchimp، تحقق من الحساب المربوط أو أرسلها يدويًا' });
          }
        } else {
          draft.sentVia = 'manual';
        }
        draft.status = 'sent';
      } else {
        return res.status(400).json({ error: 'إجراء غير معروف' });
      }

      draft.updatedAt = Date.now();
      await kvSet(`draft:${id}`, draft);
      return res.status(200).json(draft);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('drafts.js error:', err);
    return res.status(500).json({ error: err.message || 'حدث خطأ غير متوقع' });
  }
}
