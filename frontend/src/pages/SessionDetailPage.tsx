import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { errorMessage, http } from '../api/client';
import type { Session, Slot } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { BookingSummary } from '../components/BookingSummary';
import { SlotPicker } from '../components/SlotPicker';
import { Alert, ConfirmDialog, Spinner } from '../components/ui';
import { formatDate, formatTime } from '../lib/time';

export function SessionDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const justBooked = Boolean((location.state as { justBooked?: boolean } | null)?.justBooked);
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [reschedule, setReschedule] = useState(false);
  const [nextSlot, setNextSlot] = useState<Slot | null>(null);
  const session = useQuery({
    queryKey: ['session', id],
    queryFn: async () => (await http.get(`/sessions/${id}`)).data.data as Session,
  });
  const cancel = useMutation({
    mutationFn: async () => (await http.patch(`/sessions/${id}/cancel`)).data.data as Session,
    onSuccess: (data) => {
      queryClient.setQueryData(['session', id], data);
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
  const move = useMutation({
    mutationFn: async (slot: Slot) => (await http.patch(`/sessions/${id}/reschedule`, { startAt: slot.startAt })).data.data as Session,
    onSuccess: (data) => {
      queryClient.setQueryData(['session', id], data);
      setReschedule(false);
      setNextSlot(null);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  if (!user || session.isLoading) return <Spinner />;
  if (session.isError || !session.data) return <Alert>That session is not available.</Alert>;
  const current = session.data;

  return (
    <div className="space-y-6">
      <Link className="text-sm text-moss" to="/sessions">Back to sessions</Link>
      {justBooked ? <Alert tone="success">Your session is booked.</Alert> : null}
      <div className="card p-6">
        <h1 className="mb-5 font-serif text-4xl">Session details</h1>
        <BookingSummary session={current} timezone={user.timezone} />
        {user.role === 'PROFESSIONAL' ? <p className="mt-4 text-sm text-muted">Member: {current.member.name}</p> : null}
        {current.permissions.cancelBlockedReason && current.status === 'BOOKED' ? (
          <p className="mt-4 text-sm text-muted">{current.permissions.cancelBlockedReason}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {current.permissions.cancel ? (
            <button type="button" className="btn-danger" onClick={() => setConfirming(true)}>Cancel session</button>
          ) : null}
          {current.permissions.reschedule ? (
            <button type="button" className="btn-secondary" onClick={() => setReschedule((value) => !value)}>Reschedule</button>
          ) : null}
        </div>
        {cancel.isError ? <div className="mt-4"><Alert>{errorMessage(cancel.error)}</Alert></div> : null}
      </div>
      {reschedule ? (
        <section className="card p-6">
          <h2 className="font-serif text-2xl">Choose a new time</h2>
          <div className="mt-4">
            <SlotPicker
              professionalId={current.professional.id}
              timezone={user.timezone}
              excludeSessionId={current.id}
              selected={nextSlot?.startAt}
              onSelect={setNextSlot}
            />
          </div>
          {nextSlot ? (
            <div className="mt-4">
              <p className="text-sm">{formatDate(nextSlot.startAt, user.timezone)} · {formatTime(nextSlot.startAt, user.timezone)} – {formatTime(nextSlot.endAt, user.timezone)}</p>
              {move.isError ? <div className="mt-3"><Alert>{errorMessage(move.error)}</Alert></div> : null}
              <button type="button" className="btn-primary mt-3" disabled={move.isPending} onClick={() => move.mutate(nextSlot)}>Confirm new time</button>
            </div>
          ) : null}
        </section>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Cancel this session?"
        body="Pending reminders will be withdrawn. This cannot be undone from the app."
        confirmLabel={cancel.isPending ? 'Cancelling…' : 'Cancel session'}
        pending={cancel.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => cancel.mutate()}
      />
    </div>
  );
}
