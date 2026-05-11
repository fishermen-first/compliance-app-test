'use client';

import { Search, UserPlus } from 'lucide-react';

type UserFilter = 'all' | 'active' | 'pending' | 'attention';

type UserFilterBarProps = {
  filter: UserFilter;
  setFilter: (filter: UserFilter) => void;
  search: string;
  setSearch: (search: string) => void;
  counts: Record<UserFilter, number>;
};

export function UserFilterBar({ filter, setFilter, search, setSearch, counts }: UserFilterBarProps) {
  const tabs = [
    { id: 'all' as const, label: 'All', count: counts.all },
    { id: 'active' as const, label: 'Active', count: counts.active },
    { id: 'pending' as const, label: 'Pending', count: counts.pending },
    { id: 'attention' as const, label: 'Needs attention', count: counts.attention }
  ];

  return (
    <div className="cd-filter">
      <div className="search">
        <Search aria-hidden="true" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="pills" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            className={filter === tab.id ? 'active' : ''}
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}<span className="count">{tab.count}</span>
          </button>
        ))}
      </div>
      <button className="cd-add-user" type="button" title="Add user">
        <UserPlus aria-hidden="true" /> Add user
      </button>
    </div>
  );
}

export type { UserFilter };
