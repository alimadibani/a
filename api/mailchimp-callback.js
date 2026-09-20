// يستقبل العميل هنا تلقائيًا بعد موافقته على ربط حسابه من صفحة Mailchimp نفسها
import { kvGet, kvSet } from './_db.js';
import { exchangeCodeForToken, fetchMetadata, fetchFirstList, verifyOAuthState } from './_mailchimp.js';
import { checkDeliverability } from './_deliverability.js';

function htmlResponse(res, title, message, ok) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(ok ? 200 : 400).send(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
    <title>${title}</title>
    <style>body{font-family:sans-serif; background:#F5F6F2; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;}
    .box{background:#fff; border:1px solid #DEE1DA; border-radius:14px; padding:32px; text-align:center; max-width:380px;}
    h1{color:#14213D; font-size:18px;} p{color:#5B6470; font-size:14px;}</style></head>
    <body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>
  `);
}

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    return htmlResponse(res, 'تم إلغاء الربط', 'لم تتم الموافقة على ربط الحساب.', false);
  }
  if (!code || !state) {
    return htmlResponse(res, 'رابط غير صالح', 'تعذر إتمام عملية الربط.', false);
  }

  try {
    const stateData = verifyOAuthState(state);
    if (!stateData) return htmlResponse(res, 'رابط ربط منتهي', 'تعذر التحقق من رابط الربط، اطلب رابطًا جديدًا من الوكالة.', false);
    const clientEmail = stateData.email;
    const accessToken = await exchangeCodeForToken(code, req);
    const metadata = await fetchMetadata(accessToken);
    const listId = await fetchFirstList(metadata.api_endpoint, accessToken);

    const clientKey = `client:${clientEmail.toLowerCase()}`;
    const client = (await kvGet(clientKey)) || { email: clientEmail.toLowerCase(), draftIds: [] };
    client.mailchimp = {
      accessToken,
      apiEndpoint: metadata.api_endpoint,
      accountName: metadata.accountname || metadata.login?.email || 'حساب Mailchimp',
      listId,
      connectedAt: Date.now()
    };
    await kvSet(clientKey, client);

    // فحص ضمان الوصول تلقائيًا فور الربط (إلزامي قبل أول إرسال فعلي)
    const domain = clientEmail.split('@')[1];
    let deliverabilityMsg = '';
    if (domain) {
      const result = await checkDeliverability(domain);
      client.deliverability = result;
      await kvSet(clientKey, client);
      deliverabilityMsg = result.passed
        ? ' فحص ضمان الوصول (SPF/DMARC) اجتاز بنجاح ✅'
        : ' ⚠️ ملاحظة: فحص ضمان الوصول (SPF/DMARC) لم يجتز بالكامل — راجع لوحة التحكم لمزيد من التفاصيل قبل أول إرسال فعلي.';
    }

    return htmlResponse(res, 'تم الربط بنجاح ✅', `حسابك على Mailchimp مرتبط الآن بوكالة InboxLoops.${deliverabilityMsg} تقدر تلغي الربط بأي وقت من إعدادات حسابك على Mailchimp.`, true);
  } catch (err) {
    console.error('mailchimp-callback error:', err);
    return htmlResponse(res, 'حدث خطأ', 'تعذر إتمام ربط الحساب، حاول مرة أخرى أو تواصل معنا.', false);
  }
}
