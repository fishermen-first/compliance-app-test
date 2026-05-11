import { redirect } from 'next/navigation';

type CustomerScaffoldPageProps = {
  params: { customerId: string };
};

export default function CustomerScaffoldPage({ params }: CustomerScaffoldPageProps) {
  redirect(`/admin/customers/${params.customerId}/users`);
}
