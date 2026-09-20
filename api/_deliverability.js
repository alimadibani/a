// فحص إعدادات ضمان الوصول (Deliverability) الأساسية عبر سجلات DNS العامة
// يفحص SPF و DMARC تلقائيًا. DKIM يعتمد على "selector" خاص بكل منصة إرسال
// (Mailchimp يولّد سجلات CNAME خاصة بها عند تفعيل Domain Authentication)
// لذا DKIM يبقى تحققًا يدويًا من داخل إعدادات Mailchimp نفسها — موضح بالنتيجة

import { resolveTxt } from 'dns/promises';

async function checkTxtRecord(hostname, expectedPrefix) {
  try {
    const records = await resolveTxt(hostname);
    const flat = records.map(r => r.join(''));
    const found = flat.find(r => r.toLowerCase().startsWith(expectedPrefix));
    return { found: !!found, record: found || null };
  } catch (_) {
    return { found: false, record: null }; // النطاق غير موجود أو لا يحتوي السجل
  }
}

export async function checkDeliverability(domain) {
  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const spf = await checkTxtRecord(cleanDomain, 'v=spf1');
  const dmarc = await checkTxtRecord(`_dmarc.${cleanDomain}`, 'v=dmarc1');

  return {
    domain: cleanDomain,
    spf,
    dmarc,
    dkimNote: 'DKIM يحتاج تفعيل "Domain Authentication" من داخل إعدادات Mailchimp نفسها للعميل (يولّد سجلات CNAME خاصة) — تحقق يدوي مطلوب',
    passed: spf.found && dmarc.found, // تقييم مبسّط: لا يشمل DKIM آليًا
    checkedAt: Date.now()
  };
}
