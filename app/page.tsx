import { AppSidebar } from '@/components/app-sidebar';
import { AuthScreen } from '@/components/auth-screen';
import { Dashboard, type DashboardEvent, type DashboardVessel } from '@/components/dashboard';
import { WorkspaceSetup } from '@/components/workspace-setup';
import { createClient } from '@/lib/supabase/server';

type HomeProps = {
  searchParams?: { message?: string };
};

const vesselColors = ['#12786d', '#132b3a', '#376f9f', '#8263c7', '#c45570'];

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function daysAway(value: string) {
  const due = new Date(value);
  const now = new Date();
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const target = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.ceil((target - start) / 86_400_000);
}

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function Home({ searchParams }: HomeProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return <AuthScreen message={searchParams?.message} />;
  }

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return <WorkspaceSetup step="company" email={userData.user.email} />;
  }

  const [{ data: company }, { data: profile }, { data: vessels }, { data: rawEvents }, { data: auditLog }] = await Promise.all([
    supabase.from('companies').select('name').eq('id', membership.company_id).single(),
    supabase.from('profiles').select('full_name').eq('id', userData.user.id).maybeSingle(),
    supabase.from('vessels').select('id, name').eq('company_id', membership.company_id).eq('active', true).order('name'),
    supabase
      .from('compliance_events')
      .select('id, title, vessel_id, owner_id, due_at, status, priority, category')
      .eq('company_id', membership.company_id)
      .neq('status', 'archived')
      .order('due_at', { ascending: true }),
    supabase
      .from('audit_log')
      .select('action, metadata, created_at')
      .eq('company_id', membership.company_id)
      .order('created_at', { ascending: false })
      .limit(5)
  ]);

  const currentUserName = profile?.full_name ?? userData.user.email ?? 'User';
  const vesselList = vessels ?? [];
  const events = rawEvents ?? [];
  const eventCountsByVessel = new Map<string, number>();

  events.forEach((event) => {
    if (event.vessel_id) {
      eventCountsByVessel.set(event.vessel_id, (eventCountsByVessel.get(event.vessel_id) ?? 0) + 1);
    }
  });

  const dashboardVessels: DashboardVessel[] = vesselList.map((vessel, index) => ({
    id: vessel.id,
    name: vessel.name,
    activeEvents: eventCountsByVessel.get(vessel.id) ?? 0,
    color: vesselColors[index % vesselColors.length]
  }));

  const vesselNameById = new Map(vesselList.map((vessel) => [vessel.id, vessel.name]));
  const dashboardEvents: DashboardEvent[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    vessel: event.vessel_id ? vesselNameById.get(event.vessel_id) ?? 'Company-wide' : 'Company-wide',
    owner: event.owner_id === userData.user.id ? currentUserName : 'Office',
    dueDate: formatDueDate(event.due_at),
    daysAway: daysAway(event.due_at),
    status: event.status,
    priority: event.priority,
    category: titleCase(event.category)
  }));

  const activity = (auditLog ?? []).map((item) => {
    const title = typeof item.metadata === 'object' && item.metadata && 'title' in item.metadata ? String(item.metadata.title) : '';
    return title ? `${titleCase(item.action)}: ${title}` : titleCase(item.action);
  });

  return (
    <div className="app-shell">
      <AppSidebar companyName={company?.name ?? 'FF Compliance'} />
      <Dashboard events={dashboardEvents} vessels={dashboardVessels} currentUserName={currentUserName} activity={activity} />
    </div>
  );
}
