import type { UserRole } from '@/context/AppDataContext';

export const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  staff: 'Personal',
  rider: 'Ryttare',
  farrier: 'Hovslagare',
  vet: 'Veterinär',
  trainer: 'Tränare',
  therapist: 'Terapeut',
  guest: 'Gäst',
};

export const roleOrder: UserRole[] = ['admin', 'staff', 'rider', 'farrier', 'vet', 'trainer', 'therapist', 'guest'];

export const accessLabels: Record<string, string> = {
  owner: 'Ägare',
  edit: 'Redigera',
  view: 'Läsa',
};
