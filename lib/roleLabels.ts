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
