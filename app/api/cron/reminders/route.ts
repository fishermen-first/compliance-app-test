import { NextResponse } from 'next/server';
import { sendQueuedRemindersForCompany } from '@/lib/reminder-sender';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();

  return Boolean(secret && token && token === secret);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: queuedCount, error: scheduleError } = await admin.rpc('schedule_due_reminders_all_companies', {});

  if (scheduleError) {
    return NextResponse.json({ error: scheduleError.message }, { status: 500 });
  }

  const { data: companies, error: companiesError } = await admin
    .from('companies')
    .select('id')
    .order('created_at', { ascending: true });

  if (companiesError) {
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  const results = [];

  for (const company of companies ?? []) {
    try {
      const result = await sendQueuedRemindersForCompany(company.id);
      results.push({ companyId: company.id, ...result });
    } catch (error) {
      results.push({
        companyId: company.id,
        claimedCount: 0,
        sentCount: 0,
        failedCount: 0,
        error: error instanceof Error ? error.message : 'Unknown reminder failure'
      });
    }
  }

  return NextResponse.json({ queuedCount: queuedCount ?? 0, results });
}
