import { useNavigate } from 'react-router-dom';
import { store, useAuth } from '@/lib/store';
import { Badge, Card, PageHead } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { fmtStamp } from '@/lib/util';
import type { Notification } from '@/lib/types';

export default function Notifications() {
  const { db, user } = useAuth();
  const nav = useNavigate();
  const rows = db.notifications.filter((n) => !n.deleted_at && user && n.for_roles.includes(user.role));
  const sevOrder = { critical: 0, warn: 1, info: 2 };
  rows.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  return (
    <>
      <PageHead title="Notifications & automations" sub="In-app alerts generated from live data. External channels are queued per Admin settings (email / SMS / WhatsApp-ready).">
        <button className="btn" onClick={() => store.markRead(rows.map((n) => n.id))}>Mark all read</button>
      </PageHead>
      <Card flush>
        <DataTable<Notification>
          rows={rows} rowKey={(n) => n.id} exportTitle="Notifications" pageSize={15} initialSort={undefined}
          onRow={(n) => { store.markRead([n.id]); if (n.link) nav(n.link.replace(/\?.*/, '')); }}
          cols={[
            { key: 'severity', header: 'Severity', value: (n) => n.severity, render: (n) => <Badge tone={n.severity === 'critical' ? 'red' : n.severity === 'warn' ? 'amber' : 'teal'}>{n.severity}</Badge> },
            { key: 'type', header: 'Type', value: (n) => n.type },
            { key: 'title', header: 'Alert', value: (n) => n.title, render: (n) => <b style={{ fontWeight: user && n.read_by.includes(user.id) ? 500 : 700 }}>{n.title}</b> },
            { key: 'body', header: 'Details', value: (n) => n.body },
            { key: 'ch', header: 'Queued channels', value: (n) => n.channels_queued.join(', ') || '—' },
            { key: 'at', header: 'Raised', value: (n) => fmtStamp(n.created_at) },
          ]}
        />
      </Card>
    </>
  );
}
