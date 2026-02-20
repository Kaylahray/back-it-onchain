"use client";

import React, { useState } from 'react';

const MOCK = [
  { id: 'u1', name: 'Alice', handle: '@alice', avatar: 'A' },
  { id: 'u2', name: 'Bob', handle: '@bob', avatar: 'B' },
  { id: 'u3', name: 'Cara', handle: '@cara', avatar: 'C' },
  { id: 'u4', name: 'Dex', handle: '@dex', avatar: 'D' },
];

export default function RecommendedUsers() {
  const [items, setItems] = useState(MOCK.map(u => ({ ...u, following: false })));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold">Recommended Users</div>
          <div className="text-xs text-muted-foreground">Follow people to see their calls in your Following tab</div>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto py-2">
        {items.map((u) => (
          <div key={u.id} className="flex-shrink-0 w-40 p-3 bg-card border border-border rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-bold text-white">{u.avatar}</div>
              <div>
                <div className="font-bold text-sm">{u.name}</div>
                <div className="text-xs text-muted-foreground">{u.handle}</div>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setItems(items.map(it => it.id === u.id ? { ...it, following: !it.following } : it))} className={`px-3 py-1 rounded-md text-sm ${u.following ? 'bg-secondary' : 'bg-primary text-white'}`}>
                {u.following ? 'Following' : 'Follow'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
