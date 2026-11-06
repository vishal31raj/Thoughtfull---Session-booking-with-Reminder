import { prisma } from '../lib/prisma';
import { assertNoOverlappingWindows } from '../domain/scheduling';
import { weekdayLabel } from '../domain/time';

export interface AvailabilityInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

export async function getMyAvailability(professionalId: string) {
  const rows = await prisma.availability.findMany({
    where: { professionalId },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
  return rows.map(toAvailabilityDto);
}

export async function replaceAvailability(professionalId: string, windows: AvailabilityInput[]) {
  assertNoOverlappingWindows(windows);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = CAST(${professionalId} AS uuid) FOR UPDATE`;
    await tx.availability.deleteMany({ where: { professionalId } });
    if (windows.length > 0) {
      await tx.availability.createMany({
        data: windows.map((window) => ({
          professionalId,
          dayOfWeek: window.dayOfWeek,
          startTime: window.startTime,
          endTime: window.endTime,
          enabled: window.enabled,
        })),
      });
    }
  });
  return getMyAvailability(professionalId);
}

export function toAvailabilityDto(window: {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
}) {
  return {
    id: window.id,
    dayOfWeek: window.dayOfWeek,
    label: weekdayLabel(window.dayOfWeek),
    startTime: window.startTime,
    endTime: window.endTime,
    enabled: window.enabled,
  };
}
