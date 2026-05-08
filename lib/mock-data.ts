export type ComplianceStatus = 'draft' | 'active' | 'waiting_on_vessel' | 'office_review' | 'complete';

export type Vessel = {
  id: string;
  name: string;
  activeEvents: number;
  color: string;
};

export type ComplianceEvent = {
  id: string;
  title: string;
  vessel: string;
  owner: string;
  dueDate: string;
  daysAway: number;
  status: ComplianceStatus;
  priority: 'low' | 'medium' | 'high';
  category: 'Inspection' | 'Report' | 'Audit' | 'Permit' | 'Training';
};

export const company = {
  name: 'Arctic Storm Management Group',
  product: 'FF Compliance'
};

export const vessels: Vessel[] = [
  { id: 'arctic-storm', name: 'F/V Arctic Storm', activeEvents: 5, color: '#12786d' },
  { id: 'arctic-fjord', name: 'F/V Arctic Fjord', activeEvents: 2, color: '#132b3a' },
  { id: 'sea-storm', name: 'F/V Sea Storm', activeEvents: 1, color: '#376f9f' }
];

export const events: ComplianceEvent[] = [
  { id: 'uscg-safety-inspection', title: 'USCG Safety Inspection', vessel: 'F/V Arctic Fjord', owner: 'Emma Scalisi', dueDate: 'May 6', daysAway: 10, status: 'waiting_on_vessel', priority: 'high', category: 'Inspection' },
  { id: 'noaa-monthly-landing-report', title: 'NOAA Monthly Landing Report', vessel: 'F/V Arctic Storm', owner: 'Sarah Nayani', dueDate: 'May 10', daysAway: 14, status: 'office_review', priority: 'medium', category: 'Report' },
  { id: 'msc-chain-of-custody-audit', title: 'MSC Chain of Custody Audit', vessel: 'F/V Arctic Storm', owner: 'Meagan Anderson', dueDate: 'May 18', daysAway: 22, status: 'active', priority: 'high', category: 'Audit' },
  { id: 'observer-program-renewal', title: 'Observer Program Registration Renewal', vessel: 'F/V Arctic Storm', owner: 'Sarah Nayani', dueDate: 'May 22', daysAway: 26, status: 'draft', priority: 'medium', category: 'Permit' },
  { id: 'crew-haccp-refresher', title: 'Crew HACCP Refresher', vessel: 'F/V Arctic Storm', owner: 'Meagan Anderson', dueDate: 'Jun 2', daysAway: 37, status: 'active', priority: 'medium', category: 'Training' }
];

export const activity = [
  'Emma Scalisi added inspection prep SharePoint link',
  'Sarah Nayani marked landing report ready for review',
  'System queued 3 reminder emails',
  'Meagan Anderson updated audit owner'
];

export const statusLabels: Record<ComplianceStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  waiting_on_vessel: 'Waiting on Vessel',
  office_review: 'Office Review',
  complete: 'Complete'
};
