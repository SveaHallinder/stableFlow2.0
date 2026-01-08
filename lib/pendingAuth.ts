import * as SecureStore from 'expo-secure-store';

const PENDING_JOIN_CODE_KEY = 'pending_join_code';
const PENDING_OWNER_STABLE_KEY = 'pending_owner_stable';

export async function savePendingJoinCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  try {
    await SecureStore.setItemAsync(PENDING_JOIN_CODE_KEY, trimmed);
  } catch {
    return;
  }
}

export async function loadPendingJoinCode(): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(PENDING_JOIN_CODE_KEY);
    const trimmed = stored?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export async function clearPendingJoinCode() {
  try {
    await SecureStore.deleteItemAsync(PENDING_JOIN_CODE_KEY);
  } catch {
    return;
  }
}

export type PendingOwnerStable = {
  id: string;
  name: string;
};

export async function savePendingOwnerStable(input: PendingOwnerStable) {
  const id = input.id.trim();
  const name = input.name.trim();
  if (!id || !name) {
    return;
  }
  try {
    await SecureStore.setItemAsync(
      PENDING_OWNER_STABLE_KEY,
      JSON.stringify({ id, name }),
    );
  } catch {
    return;
  }
}

export async function loadPendingOwnerStable(): Promise<PendingOwnerStable | null> {
  try {
    const stored = await SecureStore.getItemAsync(PENDING_OWNER_STABLE_KEY);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as Partial<PendingOwnerStable> | null;
    const id = typeof parsed?.id === 'string' ? parsed.id.trim() : '';
    const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
    if (!id || !name) {
      return null;
    }
    return { id, name };
  } catch {
    return null;
  }
}

export async function clearPendingOwnerStable() {
  try {
    await SecureStore.deleteItemAsync(PENDING_OWNER_STABLE_KEY);
  } catch {
    return;
  }
}
