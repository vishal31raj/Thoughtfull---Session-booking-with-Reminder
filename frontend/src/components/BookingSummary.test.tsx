import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookingSummary } from './BookingSummary';
import type { Session } from '../api/types';

const session: Session = {
  id: '1',
  startAt: '2026-11-09T01:00:00.000Z',
  endAt: '2026-11-09T01:50:00.000Z',
  durationMinutes: 50,
  status: 'BOOKED',
  displayStatus: 'upcoming',
  member: { id: 'm', name: 'Anika Sharma' },
  professional: { id: 'p', name: 'Sarah Chen', title: 'Clinical Psychologist' },
  cancelledAt: null,
  permissions: { cancel: true, reschedule: true, cancelBlockedReason: null },
};

describe('BookingSummary', () => {
  it('shows the confirmation details in the member timezone', () => {
    render(<BookingSummary session={session} timezone="America/New_York" />);
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    expect(screen.getByText('Sunday, November 8, 2026')).toBeInTheDocument();
    expect(screen.getByText('8:00 PM – 8:50 PM')).toBeInTheDocument();
    expect(screen.getByText('50 minutes')).toBeInTheDocument();
    expect(screen.getByText('upcoming')).toBeInTheDocument();
  });
});
