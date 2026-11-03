// Configuración pública compartida por la web y el notch de escritorio.
// (La clave publishable es pública por diseño; la seguridad la da RLS.)
export const SUPABASE_URL = "https://ljesyblxcbknstsyeohu.supabase.co";
export const SUPABASE_KEY = "sb_publishable_47G66BOEIKVHQ8ALrQ6Prg_Z9ofcqHn";
export const VAPID_PUBLIC_KEY = "BJ7VXFygOLC1C8YDLymAHB-0rh-6BhBCtZzPEWewrW_qLa8cgLgsR8mqulkf66c2Z9a8OCdO6uzj9i8n9Gcg7b4";
/** Los usuarios entran con nombre de usuario; internamente se mapea a un correo ficticio. */
export const EMAIL_DOMAIN = "users.idynotch.app";
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
