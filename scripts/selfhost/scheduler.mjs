import { setTimeout } from 'node:timers/promises';
// One in-flight run; server route remains responsible for task authorization and idempotency.
if (!process.env.CRON_SECRET) throw new Error('缺少调度密钥');
while (true) {
  await setTimeout(3_600_000 - Date.now() % 3_600_000);
  try {
    const response = await fetch('http://web:3000/api/cron/process-reminders', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(240_000),
    });
    await response.body?.cancel();
    if (!response.ok) console.error('提醒调度失败');
  } catch { console.error('提醒调度连接失败'); }
}
