import { useQuery } from '@tanstack/react-query';
import { http } from '../api/client';
import type { Slot } from '../api/types';
import { dayKey, formatShortDate, formatTime, groupSlots, upcomingDays } from '../lib/time';

export function SlotPicker({
  professionalId,
  timezone,
  selected,
  onSelect,
  excludeSessionId,
}: {
  professionalId: string;
  timezone: string;
  selected?: string;
  onSelect: (slot: Slot) => void;
  excludeSessionId?: string;
}) {
  const slots = useQuery({
    queryKey: ['slots', professionalId, timezone, excludeSessionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (excludeSessionId) params.set('excludeSessionId', excludeSessionId);
      const response = await http.get(`/professionals/${professionalId}/slots?${params.toString()}`);
      return response.data.data as { slots: Slot[]; durationMinutes: number };
    },
  });

  if (slots.isLoading) return <p className="text-sm text-muted">Loading available times…</p>;
  if (slots.isError) return <p className="text-sm text-clay">Could not load availability.</p>;

  const grouped = groupSlots(slots.data?.slots ?? [], timezone);
  const days = upcomingDays(timezone);
  const selectedDay = selected ? dayKey(selected, timezone) : days.find((day) => grouped.get(day)?.some((slot) => slot.available));
  const daySlots = selectedDay ? grouped.get(selectedDay) ?? [] : [];

  return (
    <div>
      <p className="mb-3 text-sm text-muted">Times shown in {timezone}.</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {days.map((day) => {
          const available = (grouped.get(day) ?? []).some((slot) => slot.available);
          const active = day === selectedDay;
          return (
            <button
              key={day}
              type="button"
              data-testid="day-button"
              data-has-slots={available ? 'true' : 'false'}
              disabled={!available && !grouped.has(day)}
              onClick={() => {
                const first = (grouped.get(day) ?? []).find((slot) => slot.available);
                if (first) onSelect(first);
              }}
              className={`rounded-xl border px-2 py-3 text-sm ${active ? 'border-moss bg-moss text-white' : available ? 'border-line bg-white hover:border-moss' : 'border-transparent bg-paper text-muted'}`}
            >
              {formatShortDate(day)}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {daySlots.length === 0 ? <p className="text-sm text-muted">No times on this day.</p> : null}
        {daySlots.map((slot) => (
          <button
            key={slot.startAt}
            type="button"
            data-testid="slot-button"
            disabled={!slot.available}
            onClick={() => onSelect(slot)}
            className={`rounded-full border px-4 py-2 text-sm ${selected === slot.startAt ? 'border-moss bg-mist text-mossdeep' : 'border-line bg-white'} disabled:cursor-not-allowed disabled:text-muted disabled:line-through`}
          >
            {slot.available ? formatTime(slot.startAt, timezone) : `${formatTime(slot.startAt, timezone)} unavailable`}
          </button>
        ))}
      </div>
    </div>
  );
}
