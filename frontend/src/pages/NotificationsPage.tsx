import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../api/client';
import type { AppNotification } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Empty, Spinner } from '../components/ui';
import { formatDate, formatTime } from '../lib/time';

export function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await http.get('/notifications')).data.data as AppNotification[],
  });
  const markRead = useMutation({
    mutationFn: async (id: string) => http.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });
  const markAll = useMutation({
    mutationFn: async () => http.patch('/notifications/read-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });
  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-4xl">Notifications</h1>
        <button type="button" className="btn-secondary" onClick={() => markAll.mutate()}>Mark all read</button>
      </div>
      {notifications.isLoading ? <Spinner /> : null}
      {notifications.data?.length === 0 ? <Empty title="No notifications yet" body="Reminders appear here 24 hours and 1 hour before a session." /> : null}
      <ul className="space-y-3">
        {notifications.data?.map((notification) => (
          <li key={notification.id} className={`card p-4 ${notification.readAt ? 'opacity-70' : ''}`}>
            <p>{notification.message}</p>
            <p className="mt-1 text-xs text-muted">{formatDate(notification.createdAt, user.timezone)} · {formatTime(notification.createdAt, user.timezone)}</p>
            {!notification.readAt ? (
              <button type="button" className="mt-3 text-sm text-moss" onClick={() => markRead.mutate(notification.id)}>Mark as read</button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
