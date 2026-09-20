// وحدة مساعدة بسيطة للتخزين الدائم عبر Upstash Redis (REST API)
// تحتاج متغيرَي بيئة على Vercel: UPSTASH_REDIS_REST_URL و UPSTASH_REDIS_REST_TOKEN
// احصل عليهما مجانًا من upstash.com (قاعدة بيانات Redis واحدة كافية لهذا المشروع)

const BASE_URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCommand(command) {
  if (!BASE_URL || !TOKEN) {
    throw new Error('قاعدة البيانات غير مُعدّة بعد — أضف UPSTASH_REDIS_REST_URL و UPSTASH_REDIS_REST_TOKEN بمتغيرات البيئة');
  }
  const res = await fetch(`${BASE_URL}/${command.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

export async function kvGet(key) {
  const raw = await redisCommand(['get', key]);
  return raw ? JSON.parse(raw) : null;
}

export async function kvSet(key, value) {
  return redisCommand(['set', key, JSON.stringify(value)]);
}

// فهرس آمن للتزامن: يستخدم Redis Set (SADD ذرّية على مستوى قاعدة البيانات نفسها)
// بدل قراءة/تعديل/كتابة قائمة JSON بالذاكرة — كانت هذي الطريقة السابقة تفقد بيانات
// فعليًا عند وصول طلبين بنفس اللحظة تقريبًا (تأكّد ذلك باختبار تزامن محلي حقيقي)
export async function addToIndex(indexKey, id) {
  return redisCommand(['sadd', indexKey, id]);
}

export async function getIndex(indexKey) {
  const result = await redisCommand(['smembers', indexKey]);
  return Array.isArray(result) ? result : [];
}
