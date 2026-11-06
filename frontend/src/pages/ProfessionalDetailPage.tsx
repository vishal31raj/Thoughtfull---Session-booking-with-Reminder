import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage, http } from '../api/client';
import type { Professional, Session, Slot } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { SlotPicker } from '../components/SlotPicker';
import { Alert, Spinner, initials } from '../components/ui';
import { DAY_NAMES, formatDate, formatTime } from '../lib/time';

export function ProfessionalDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Slot | null>(null);
  const professional = useQuery({
    queryKey: ['professional', id],
    queryFn: async () => (await http.get(`/professionals/${id}`)).data.data as Professional,
  });
  const book = useMutation({
    mutationFn: async (slot: Slot) =>
      (await http.post('/sessions', { professionalId: id, startAt: slot.startAt })).data.data as Session,
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      navigate(`/sessions/${session.id}`, { state: { justBooked: true } });
    },
  });

  if (professional.isLoading || !user) return <Spinner />;
  if (professional.isError || !professional.data) return <Alert>That professional could not be found.</Alert>;
  const profile = professional.data;

  return (
    <div className="space-y-8">
      <Link className="text-sm text-moss" to="/professionals">Back to professionals</Link>
      <header className="flex gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-mist text-lg font-medium text-mossdeep">{initials(profile.name)}</div>
        <div>
          <h1 className="font-serif text-4xl">{profile.name}</h1>
          <p className="text-muted">{profile.title} · {profile.focusAreas}</p>
          <p className="mt-3 max-w-2xl text-sm">{profile.bio}</p>
        </div>
      </header>
      <section className="card p-5">
        <h2 className="font-serif text-2xl">Weekly hours</h2>
        <p className="mb-3 text-sm text-muted">Shown in {profile.timezone}, then converted to your timezone below.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {DAY_NAMES.map((label, index) => {
            const windows = profile.availability.filter((window) => window.dayOfWeek === index + 1 && window.enabled);
            return <li key={label} className="flex justify-between rounded-xl bg-paper px-3 py-2 text-sm"><span>{label}</span><span>{windows.length ? windows.map((window) => `${window.startTime}–${window.endTime}`).join(', ') : 'Unavailable'}</span></li>;
          })}
        </ul>
      </section>
      <section className="card p-5">
        <h2 className="font-serif text-2xl">Next four weeks</h2>
        <div className="mt-4">
          <SlotPicker professionalId={id} timezone={user.timezone} selected={selected?.startAt} onSelect={setSelected} />
        </div>
        {selected ? (
          <div className="mt-6 rounded-2xl bg-mist p-4">
            <p className="font-medium">{profile.name}</p>
            <p className="text-sm text-muted">{formatDate(selected.startAt, user.timezone)}</p>
            <p className="text-sm">{formatTime(selected.startAt, user.timezone)} – {formatTime(selected.endAt, user.timezone)} · 50 minutes</p>
            {book.isError ? <div className="mt-3"><Alert>{errorMessage(book.error)}</Alert></div> : null}
            <button className="btn-primary mt-4" type="button" data-testid="confirm-booking" disabled={book.isPending} onClick={() => book.mutate(selected)}>
              Confirm booking
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
