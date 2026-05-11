import { redirect } from 'next/navigation';
import { getAppAdminClassification } from '@/lib/app-admins';
import { getCustomerDetail } from '@/lib/customer-detail';
import { createClient } from '@/lib/supabase/server';
import { CustomerNav } from './_components/customer-nav';
import { GlobalRail } from './_components/global-rail';
import { StatusBar } from './_components/status-bar';

type CustomerLayoutProps = {
  children: React.ReactNode;
  params: { customerId: string };
};

async function requireFfAdminViewer() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const classification = await getAppAdminClassification();
  const email = userData.user.email?.trim().toLowerCase();

  if (classification.status === 'unverified' || !email || !classification.appAdminEmails.has(email)) {
    redirect('/');
  }

  return userData.user;
}

export default async function CustomerLayout({ children, params }: CustomerLayoutProps) {
  const user = await requireFfAdminViewer();
  const customer = await getCustomerDetail(params.customerId);

  return (
    <div className="cd-shell">
      <GlobalRail userEmail={user.email ?? null} />
      <CustomerNav customer={customer} />
      <main className="cd-main" data-screen-label="01 Customer Detail · Users">
        <StatusBar customer={customer} />
        {children}
      </main>
    </div>
  );
}
