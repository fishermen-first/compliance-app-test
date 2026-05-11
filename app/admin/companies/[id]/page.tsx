import { redirect } from 'next/navigation';

type CompanyAdminPageProps = {
  params: { id: string };
};

export default function CompanyAdminPage({ params }: CompanyAdminPageProps) {
  redirect(`/admin/customers/${params.id}/overview`);
}
