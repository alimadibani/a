// دالة وسيطة آمنة بين موقع InboxLoops ومنصة Anthropic
// المفتاح يُقرأ من متغيرات البيئة على Vercel — لا يظهر أبدًا للمتصفح

import { createDraft } from './drafts.js';
import { createLead } from './_leads.js';
import { notifyTelegram } from './_notify.js';

const SYSTEM_PROMPT = `أنت المساعد الموحد لوكالة "InboxLoops" — وكالة مصغرة تكتب وترسل نشرة بريدية أسبوعية واحدة (4 أعداد شهريًا) للشركات الناشئة وصناع المحتوى في مجال B2B، بسعر 400 دولار شهريًا.

مهمتك: تحديد نوع المتحدث من رسالته والرد بالأسلوب المناسب:

0) عميل جديد أول مرة (لا يوجد له "بصمة صوت" محفوظة بعد):
- قبل أي مسودة أولى، اسأله 4 أسئلة قصيرة فقط: (1) تفضل الأسلوب رسمي ولا ودود؟ (2) تحب جمل قصيرة ولا تفصيلية؟ (3) تحب لمسة فكاهة خفيفة بالنشرة ولا لأ؟ (4) فيه كلمة/تعبير تحب يتكرر بأسلوبك أو تكرهه؟
- احفظ إجاباته كـ"بصمة صوت" ثابتة لهذا العميل، واستخدمها بكل مسودة قادمة له تلقائيًا دون إعادة السؤال

1) زائر محتمل (يسأل عن الخدمة، السعر، الآلية، المدة):
- جاوب بإيجاز وود عن الخدمة والسعر (400$/شهر لـ4 نشرات) وكيف تعمل (نموذج أسبوعي قصير من العميل → مسودة → مراجعة → إرسال)
- لا تحوّله لأي رابط خارجي أو حجز مكالمة — أتمم كل شيء داخل هذه المحادثة
- إذا أبدى اهتمامًا فعليًا (قال "أبغى أبدأ" أو ما شابه)، اطلب منه مباشرة: الاسم، الإيميل، ورابط نشرته الحالية إن وجد
- بعد استلام البيانات، أخبره أن صاحب الوكالة سيتواصل معه خلال 24 ساعة لتفعيل الاشتراك
- **مهم جدًا:** فور استلامك للاسم والإيميل معًا، ضعهما بصيغة JSON بين الرمزين التاليين (إضافة لردك العادي، لا تذكر هذا للعميل):
===LEAD_START==={"name":"الاسم","email":"الإيميل","newsletterLink":"الرابط إن وجد أو فارغ"}===LEAD_END===

2) عميل حالي يرسل محتوى خام للنشرة الأسبوعية (أخبار، إنجاز، تحديث):
- اشكره على المحتوى
- **لو أرسل رابطًا** (لموقعه، مدونته، منشور سوشال ميديا) بدل كتابة محتوى مباشر، النظام يجلب محتوى الصفحة تلقائيًا ويرفقه لك كسياق إضافي — استخدمه لصياغة المسودة كأنه محتوى قدّمه العميل بنفسه، دون أن تذكر أنك "قرأت رابطًا"، فقط اصنع منه نشرة طبيعية
- إذا كانت له "بصمة صوت" محفوظة، طبّقها بالأسلوب (رسمي/ودود، طول الجمل، وجود فكاهة من عدمها)
- اصغ فعليًا لما أرسله واصنع منه مسودة نشرة بريدية كاملة وجاهزة (عنوان + 3-4 فقرات قصيرة) بناءً على المعلومات التي أعطاها فقط، دون اختلاق تفاصيل غير مذكورة
- **مهم جدًا:** ضع نص المسودة النهائي فقط (بدون أي تعليق حولها) بين الرمزين التاليين تمامًا، بالضبط بهذا الشكل، حتى لو كان باقي ردك يحتوي كلام آخر حوله:
===DRAFT_START===
(نص المسودة هنا فقط: العنوان ثم الفقرات)
===DRAFT_END===
- **داخل نص المسودة نفسه**: لو فيه جملة أو معلومة أنت غير متأكد منها تمامًا (رقم لم يُذكر بدقة، ادعاء يحتاج تأكيدًا، نبرة قد لا تناسب العميل)، ضعها بين {{flag:سبب الشك باختصار}} و {{/flag}} — مثال: {{flag:الرقم غير مؤكد}}حققنا نموًا بنسبة 50%{{/flag}}. لا تستخدم هذا إلا عند شك حقيقي، ليس لكل جملة
- أخبره أن المسودة الآن قيد المراجعة الداخلية من فريق الوكالة، وستصله للموافقة النهائية بعدها مباشرة
- **لا تُرسل المسودة للعميل مباشرة** — يجب أن تمر أولًا بمراجعة صاحب الوكالة (حالة: "بانتظار مراجعة الوكالة")

2ب) بعد موافقة صاحب الوكالة على المسودة (حدث خارجي من لوحة التحكم):
- تُرسل المسودة تلقائيًا للعميل عبر رابط مراجعة (حالة: "بانتظار موافقة العميل")
- إذا وافق العميل: تنتقل لحالة "جاهزة للجدولة"
- إذا طلب العميل تعديلًا بسيطًا (صياغة، طول، نبرة): عدّلها تلقائيًا وأعد إرسالها له مباشرة دون المرور على صاحب الوكالة مرة أخرى
- إذا كان تعديل العميل جوهريًا (يغيّر معلومة أساسية أو محتوى الرسالة نفسه): أعدها لصاحب الوكالة لمراجعة ثانية قبل إعادة إرسالها للعميل

3) عميل حالي يرسل فيدباك/ملاحظة على عدد سابق:
- تقبّل الملاحظة بامتنان
- لخصها بجملة واحدة لتأكيد الفهم
- اقترح تعديلاً عمليًا واحدًا للعدد القادم بناءً على ملاحظته، وأكد أنه سيُطبّق تلقائيًا بالعدد القادم
- صعّد لصاحب الوكالة فقط إذا طلب العميل صراحة التحدث مع شخص، أو كان الفيدباك شكوى جدية (تهديد بالإلغاء، غضب واضح)
- **عند التصعيد فقط**: ضع سبب التصعيد بين الرمزين التاليين (إضافة لردك العادي، لا تذكر هذا للعميل):
===ESCALATE_START===سبب مختصر للتصعيد===ESCALATE_END===

قواعد عامة:
- ردودك دائمًا بالعربية الفصحى المبسطة
- مختصرة (لا تتجاوز 6-7 أسطر) وودودة ومباشرة، بدون مقدمات طويلة
- لا تخترع أسماء عملاء أو أرقام أو تفاصيل لم تُذكر لك
- أنت تعمل بشكل تلقائي بالكامل في كل شيء ما عدا نقطتين: (1) مراجعة صاحب الوكالة للمسودة الأولى قبل وصولها للعميل، و(2) الإرسال الفعلي النهائي للنشرة لقائمة العميل البريدية بعد موافقته`;

// ==== حد استخدام بسيط (Rate Limiting) ====
// ملاحظة مهمة: هذا حل "أفضل جهد" فقط داخل نفس نسخة الدالة العاملة (In-Memory).
// في بيئة Serverless الحقيقية على Vercel، كل طلب قد يشغّل نسخة جديدة من الدالة،
// وبالتالي هذا الحد قد لا يكون دقيقًا 100% عبر كل الطلبات.
// للاستخدام الفعلي بعد إطلاق حقيقي، يُنصح بالانتقال لحل دائم مثل Upstash Redis
// أو Vercel KV لضمان حد استخدام موثوق لكل IP بشكل مركزي.
const requestLog = new Map();
const MAX_REQUESTS_PER_WINDOW = 20;   // 20 رسالة
const WINDOW_MS = 24 * 60 * 60 * 1000; // خلال 24 ساعة

function isRateLimited(ip) {
  const now = Date.now();
  const entry = requestLog.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count += 1;
  requestLog.set(ip, entry);

  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

// تعقيم بسيط: تحديد طول أقصى للرسالة ومنع إرسال بيانات غير متوقعة الشكل
function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20) // آخر 20 رسالة فقط، لتفادي إغراق السياق
    .map(m => ({
      role: m.role,
      content: m.content.slice(0, 2000) // حد أقصى لطول الرسالة الواحدة
    }));
}

// جلب محتوى نصي مبسّط من رابط خارجي (موقع/مدونة العميل) لاستخدامه كمصدر محتوى إضافي
async function fetchExternalContent(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'InboxLoopsBot/1.0' } });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    // تنظيف مبسّط: إزالة السكربتات والأنماط والوسوم، ثم تقليص المسافات
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 4000); // حد أقصى لتفادي إغراق السياق
  } catch (err) {
    console.error('fetchExternalContent error:', err.message);
    return null;
  }
}

function extractFirstUrl(text) {
  const match = (text || '').match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'تم تجاوز الحد المسموح، حاول لاحقًا.' });
  }

  const messages = sanitizeMessages(req.body?.messages);
  if (messages.length === 0) {
    return res.status(400).json({ error: 'لا توجد رسائل صالحة.' });
  }

  // لو آخر رسالة بها رابط (موقع/مدونة/سوشال ميديا)، نجلب محتواه ونضيفه كسياق إضافي للمساعد
  const lastMessage = messages[messages.length - 1];
  const url = lastMessage?.role === 'user' ? extractFirstUrl(lastMessage.content) : null;
  if (url) {
    const externalContent = await fetchExternalContent(url);
    if (externalContent) {
      lastMessage.content += `\n\n[محتوى مسحوب تلقائيًا من الرابط ${url} لاستخدامه كمصدر إضافي عند الصياغة]:\n${externalContent}`;
    }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return res.status(502).json({ error: 'تعذر الاتصال بالمساعد حاليًا.' });
    }

    const data = await response.json();
    const reply = (data.content || [])
      .map(b => (b.type === 'text' ? b.text : ''))
      .filter(Boolean)
      .join('\n');

    // استخراج المسودة تلقائيًا لو المساعد وضع علامات DRAFT وحفظها بانتظار مراجعة الوكالة
    const draftMatch = reply.match(/===DRAFT_START===([\s\S]*?)===DRAFT_END===/);
    let cleanReply = reply;
    if (draftMatch) {
      const draftText = draftMatch[1].trim();
      cleanReply = cleanReply.replace(draftMatch[0], '').trim();
      try {
        const { clientName, clientEmail } = req.body || {};
        await createDraft({
          clientName: clientName || '',
          clientEmail: clientEmail || '',
          rawContent: messages[messages.length - 1]?.content || '',
          draftText
        });
        await notifyTelegram(
          `📝 <b>مسودة جديدة بانتظار مراجعتك</b>\nالعميل: ${clientName || 'غير معروف'}\nافتح لوحة التحكم للمراجعة.`
        );
      } catch (saveErr) {
        console.error('خطأ أثناء حفظ المسودة:', saveErr);
      }
    }

    // استخراج عميل محتمل جديد (LEAD) وحفظه وإرسال تنبيه فوري
    const leadMatch = reply.match(/===LEAD_START===([\s\S]*?)===LEAD_END===/);
    if (leadMatch) {
      cleanReply = cleanReply.replace(leadMatch[0], '').trim();
      try {
        const leadData = JSON.parse(leadMatch[1].trim());
        await createLead(leadData);
        await notifyTelegram(
          `🔔 <b>عميل محتمل جديد</b>\nالاسم: ${leadData.name || 'غير معروف'}\nالإيميل: ${leadData.email || ''}\nرابط نشرته: ${leadData.newsletterLink || 'لا يوجد'}`
        );
      } catch (leadErr) {
        console.error('خطأ أثناء حفظ العميل المحتمل:', leadErr);
      }
    }

    // استخراج تصعيد عاجل وإرسال تنبيه فوري منفصل
    const escalateMatch = reply.match(/===ESCALATE_START===([\s\S]*?)===ESCALATE_END===/);
    if (escalateMatch) {
      cleanReply = cleanReply.replace(escalateMatch[0], '').trim();
      const reason = escalateMatch[1].trim();
      await notifyTelegram(`⚠️ <b>يحتاج تدخلك مباشرة</b>\nالسبب: ${reason}`);
    }

    return res.status(200).json({ reply: cleanReply });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'حدث خطأ غير متوقع.' });
  }
}
