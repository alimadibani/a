// تخزين العملاء المحتملين (Leads) الذين يبدون اهتمامًا بالخدمة عبر الشات
import { kvGet, kvSet, addToIndex, getIndex } from './_db.js';
import { randomUUID } from 'crypto';

const LEADS_INDEX = 'leads:index';

export async function createLead({ name, email, newsletterLink }) {
  if (!email) throw new Error('الإيميل مطلوب لتسجيل عميل محتمل');
  const id = randomUUID();
  const lead = {
    id,
    name: name || 'غير معروف',
    email,
    newsletterLink: newsletterLink || '',
    status: 'new',
    createdAt: Date.now()
  };
  await kvSet(`lead:${id}`, lead);
  await addToIndex(LEADS_INDEX, id);
  return lead;
}

export async function listLeads() {
  const ids = await getIndex(LEADS_INDEX);
  const leads = await Promise.all(ids.map(id => kvGet(`lead:${id}`)));
  return leads.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}
