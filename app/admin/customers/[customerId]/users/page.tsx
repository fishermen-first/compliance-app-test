import { getCustomerDetail, getCustomerUsers } from '@/lib/customer-detail';
import { UsersTable } from '../_components/users-table';

type CustomerUsersPageProps = {
  params: { customerId: string };
};

export default async function CustomerUsersPage({ params }: CustomerUsersPageProps) {
  const [customer, users] = await Promise.all([
    getCustomerDetail(params.customerId),
    getCustomerUsers(params.customerId)
  ]);

  return (
    <>
      <header className="cd-tabhead">
        <div>
          <p className="eyebrow">Users &amp; access</p>
          <h1>Customer users</h1>
          <p className="desc">
            Everyone who can log into <strong>{customer.name}</strong>&apos;s workspace. Owner codes limit which records each person sees. Click any row to edit.
          </p>
        </div>
      </header>

      <section className="cd-body">
        <UsersTable customerId={customer.id} ownerCodes={customer.ownerCodes} users={users} />
      </section>
    </>
  );
}
