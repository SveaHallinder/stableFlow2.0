import { supabase, supabaseConfig } from '@/lib/supabase';

export type PrivateImageReference = { bucket: 'avatars' | 'paddocks'; path: string };
export const PRIVATE_IMAGE_TTL_SECONDS = 60 * 60;
export const PRIVATE_IMAGE_DEADLINE_MS = 15_000;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATH = new RegExp(`^${UUID}/${UUID}\\.[a-zA-Z0-9]+$`);

// The persisted public URL is a reference only. Never sign another project's URL.
export function parsePrivateImageReference(uri: string): PrivateImageReference | null {
  if (!supabaseConfig.url) return null;
  let url: URL;
  let project: URL;
  try {
    url = new URL(uri);
    project = new URL(supabaseConfig.url);
  } catch {
    return null;
  }
  if (url.origin !== project.origin) return null;
  const match = url.pathname.match(/^\/storage\/v1\/object\/public\/(avatars|paddocks)\/(.*)$/);
  if (!match) {
    if (['avatars', 'paddocks'].some((bucket) => {
      const prefix = `${project.origin}/storage/v1/object/public/${bucket}`;
      return uri === prefix || uri.startsWith(prefix + '/');
    })) {
      throw new Error('Bildreferensen är ogiltig.');
    }
    return null;
  }
  if (url.username || url.password || url.search || url.hash || !PATH.test(match[2])) {
    throw new Error('Bildreferensen är ogiltig.');
  }
  if (uri !== `${project.origin}${url.pathname}`) throw new Error('Bildreferensen är ogiltig.');
  return { bucket: match[1] as PrivateImageReference['bucket'], path: match[2] };
}

export async function getPrivateImageUrl(
  reference: PrivateImageReference,
  expectedUserId: string,
  isCurrent: () => boolean,
): Promise<string | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  const current = () => active && isCurrent();
  try {
    return await Promise.race([
      (async () => {
        if (!current()) return null;
        const { data, error } = await supabase.auth.getSession();
        if (!current() || error || data.session?.user.id !== expectedUserId) return null;
        const result = await supabase.storage.from(reference.bucket)
          .createSignedUrl(reference.path, PRIVATE_IMAGE_TTL_SECONDS);
        if (!current()) return null;
        if (result.error || typeof result.data?.signedUrl !== 'string') {
          console.warn('[private image] signing failed');
          return null;
        }
        const signed = new URL(result.data.signedUrl);
        const project = new URL(supabaseConfig.url);
        const keys = [...signed.searchParams.keys()];
        if (signed.href !== result.data.signedUrl || signed.origin !== project.origin || signed.username || signed.password
          || signed.pathname !== `/storage/v1/object/sign/${reference.bucket}/${reference.path}`
          || keys.length !== 1 || keys[0] !== 'token' || !signed.searchParams.get('token')?.trim() || signed.hash) {
          console.warn('[private image] invalid signing response');
          return null;
        }
        return result.data.signedUrl;
      })(),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
          if (current()) console.warn('[private image] signing timed out');
          active = false;
          resolve(null);
        }, PRIVATE_IMAGE_DEADLINE_MS);
      }),
    ]);
  } catch {
    if (current()) console.warn('[private image] signing failed');
    return null;
  } finally {
    active = false;
    if (timeout) clearTimeout(timeout);
  }
}
