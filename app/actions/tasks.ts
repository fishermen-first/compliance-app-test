'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const priorities = new Set(['low', 'normal', 'high']);

function optionalString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  return value || null;
}

function requiredString(formData: FormData, name: string) {
  const value = optionalString(formData, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validDate(formData: FormData, name: string) {
  const value = optionalString(formData, name);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} must be a date`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a valid date`);
  }
  return value;
}

async function taskActor() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect('/login');

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect('/');

  return {
    supabase,
    userId: userData.user.id,
    membership,
    canManageAll: membership.role === 'owner' || membership.role === 'office_admin'
  };
}

async function permittedAssignee(
  actor: Awaited<ReturnType<typeof taskActor>>,
  requestedAssignee: string | null
) {
  if (!actor.canManageAll) return actor.userId;

  const assignee = requestedAssignee ?? actor.userId;
  const { data: membership } = await actor.supabase
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', actor.membership.company_id)
    .eq('user_id', assignee)
    .maybeSingle();

  if (!membership) throw new Error('Choose an active user in this workspace');
  return assignee;
}

function taskPriority(formData: FormData) {
  const priority = optionalString(formData, 'priority') ?? 'normal';
  if (!priorities.has(priority)) throw new Error('priority is invalid');
  return priority;
}

function refreshTasks() {
  revalidatePath('/tasks');
}

export async function createWorkspaceTask(formData: FormData) {
  const actor = await taskActor();
  const assignee = await permittedAssignee(actor, optionalString(formData, 'assignedTo'));
  const title = requiredString(formData, 'title');
  if (title.length > 240) throw new Error('Task title must be 240 characters or fewer');

  const details = optionalString(formData, 'details');
  if (details && details.length > 5000) throw new Error('Task details must be 5,000 characters or fewer');

  const { error } = await (actor.supabase as any).from('workspace_tasks').insert({
    company_id: actor.membership.company_id,
    title,
    details,
    assigned_to: assignee,
    created_by: actor.userId,
    priority: taskPriority(formData),
    due_date: validDate(formData, 'dueDate')
  });

  if (error) throw new Error(error.message);
  refreshTasks();
}

export async function updateWorkspaceTask(formData: FormData) {
  const actor = await taskActor();
  const taskId = requiredString(formData, 'taskId');
  const assignee = await permittedAssignee(actor, optionalString(formData, 'assignedTo'));
  const title = requiredString(formData, 'title');
  if (title.length > 240) throw new Error('Task title must be 240 characters or fewer');

  const details = optionalString(formData, 'details');
  if (details && details.length > 5000) throw new Error('Task details must be 5,000 characters or fewer');

  const { error } = await (actor.supabase as any)
    .from('workspace_tasks')
    .update({
      title,
      details,
      assigned_to: assignee,
      priority: taskPriority(formData),
      due_date: validDate(formData, 'dueDate')
    })
    .eq('id', taskId)
    .eq('company_id', actor.membership.company_id);

  if (error) throw new Error(error.message);
  refreshTasks();
}

export async function setWorkspaceTaskCompletion(formData: FormData) {
  const actor = await taskActor();
  const taskId = requiredString(formData, 'taskId');
  const complete = optionalString(formData, 'complete') === 'true';
  const { error } = await (actor.supabase as any)
    .from('workspace_tasks')
    .update(complete
      ? { status: 'completed', completed_at: new Date().toISOString(), completed_by: actor.userId }
      : { status: 'open', completed_at: null, completed_by: null })
    .eq('id', taskId)
    .eq('company_id', actor.membership.company_id);

  if (error) throw new Error(error.message);
  refreshTasks();
}

export async function setWorkspaceTaskArchived(formData: FormData) {
  const actor = await taskActor();
  const taskId = requiredString(formData, 'taskId');
  const archive = optionalString(formData, 'archive') === 'true';
  const { error } = await (actor.supabase as any)
    .from('workspace_tasks')
    .update(archive
      ? { archived_at: new Date().toISOString(), archived_by: actor.userId }
      : { archived_at: null, archived_by: null })
    .eq('id', taskId)
    .eq('company_id', actor.membership.company_id);

  if (error) throw new Error(error.message);
  refreshTasks();
}
