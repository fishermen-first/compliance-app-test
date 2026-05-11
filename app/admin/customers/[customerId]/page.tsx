import { redirect } from 'next/navigation';

type CustomerIndexPageProps = {
  params: { customerId: string };
};

export default function CustomerIndexPage({ params }: CustomerIndexPageProps) {
  redirect(`/admin/customers/${params.customerId}/users`);
}
