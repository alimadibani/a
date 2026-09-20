// سكربت مساعد يُشغَّل مرة واحدة فقط على جهازك (ليس على السيرفر)
// لتوليد كلمة المرور المشفّرة قبل وضعها بمتغيرات بيئة Vercel
//
// طريقة الاستخدام:
//   node scripts/hash-password.js "كلمة_المرور_التي_تريدها"
//
// انسخ الناتج وضعه بمتغير البيئة ADMIN_PASSWORD_HASH على Vercel

import { scryptSync, randomBytes } from 'crypto';

const password = process.argv[2];
if (!password) {
  console.error('استخدم: node scripts/hash-password.js "كلمة_المرور"');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');
console.log('\nضع القيمة التالية بمتغير البيئة ADMIN_PASSWORD_HASH على Vercel:\n');
console.log(`${salt}:${hash}`);
console.log('');
