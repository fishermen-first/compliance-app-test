'use client';
// components/admin/customers-list.tsx
// Wraps the whole customer-workspaces panel: search input, optional drawer
// trigger, and the list of <CustomerCard>s with single-expanded state.

import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { CustomerCard } from './customer-card';
import { AddCustomerDrawer } from './add-customer-drawer';
import type { CompanyIndexRow } from '@/lib/admin/customer-readiness';
import { stageFromChecks, buildChecks } from '@/lib/admin/customer-readiness';

type Props = { rows: CompanyIndexRow[] };

export function CustomersList({ rows }: Props) {
  const multi = rows.length > 1;
  const drawerMode = rows.length > 2;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Default-expand the first row that still needs work, falling back to the
  // first row. Reset when the rows themselves change.
  const defaultExpandedId = useMemo(() => {
    if (rows.length === 0) return null;
    if (rows.length === 1) return rows[0].id;
    const needs = rows.find((r) => stageFromChecks(buildChecks(r), r) !== 'ready');
    return (needs ?? rows[0]).id;
  }, [rows]);
  const [expandedId, setExpandedId] = useState<string | null>(defaultExpandedId);
  useEffect(() => { setExpandedId(defaultExpandedId); }, [defaultExpandedId]);

  const visible = query.trim()
    ? rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
    : rows;

  return (
    <>
      <section className="panel admin-panel" id="customers">
        <div className="admin-panel-heading">
          <div>
            <span>All customers</span>
            <h2>Customer workspaces</h2>
          </div>
          <div className="customers-head-actions">
            {multi && (
              <label className="customers-search">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search customers"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search customers"
                />
              </label>
            )}
            {drawerMode && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setDrawerOpen(true)}
              >
                <Plus aria-hidden="true" /> Add customer
              </button>
            )}
          </div>
        </div>

        <div className="customer-list">
          {visible.map((c, idx) => (
            <CustomerCard
              key={c.id}
              company={c}
              multi={multi}
              expanded={!multi || c.id === expandedId}
              isLast={idx === visible.length - 1}
              onToggle={() => setExpandedId(c.id === expandedId ? null : c.id)}
            />
          ))}
          {visible.length === 0 && (
            <p className="customer-list-empty">No customers match &quot;{query}&quot;.</p>
          )}
        </div>
      </section>

      {drawerMode && (
        <AddCustomerDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}
