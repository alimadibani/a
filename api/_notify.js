// تنبيهات فورية لصاحب الوكالة عبر بوت تيليجرام
// تحتاج متغيرَي بيئة: TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID
// لو غير مُعدَّين، الدالة لا تفعل شيئًا بصمت (لا تُفشل أي عملية أخرى بسببها)

export async function notifyTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // التنبيهات غير مُفعَّلة بعد، لا خطأ يُرمى

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
  } catch (err) {
    // فشل التنبيه لا يجب أن يُسقط العملية الأساسية (حفظ مسودة، إلخ)
    console.error('فشل إرسال تنبيه تيليجرام:', err.message);
  }
}
