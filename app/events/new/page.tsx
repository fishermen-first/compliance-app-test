import { redirect } from 'next/navigation';
import { EventForm } from '@/components/event-form';
import { createClient } from '@/lib/supabase/server';

export default async function NewEventPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/');
  }

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    redirect('/');
  }

  const { data: vessels } = await supabase
    .from('vessels')
    .select('id, name')
    .eq('company_id', membership.company_id)
    .eq('active', true)
    .order('name');

  return <EventForm vessels={vessels ?? []} />;
}
