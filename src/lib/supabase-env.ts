import { isSelfHosted, parseConfiguredOrigin } from './runtime-env';

/** Browser-facing origin is mandatory in self-hosted mode to avoid leaking gateway DNS. */
export function getSupabasePublicUrl(): string {
    if (!isSelfHosted()) return getSupabaseUrl();
    return parseConfiguredOrigin(process.env.SUPABASE_PUBLIC_URL, 'SUPABASE_PUBLIC_URL').origin;
}

/** Rewrite only URLs owned by this configured Supabase storage service; never proxy arbitrary URLs. */
export function toPublicStorageUrl(value: string): string {
    const internal = new URL(getSupabaseUrl());
    const generated = new URL(value);
    const prefix = `${internal.pathname.replace(/\/$/, '')}/storage/v1/object/public/`;
    if (generated.origin !== internal.origin || generated.username || generated.password
        || !generated.pathname.startsWith(prefix)) {
        throw new Error('Storage URL does not belong to the configured Supabase service');
    }
    if (!isSelfHosted()) return value;
    // pathname remains URL-encoded; decoding/re-encoding could change object keys.
    return `${getSupabasePublicUrl()}/storage/v1/object/public/${generated.pathname.slice(prefix.length)}${generated.search}${generated.hash}`;
}

export function getSupabaseUrl(): string {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null;
    if (!url) {
        throw new Error('Missing Supabase URL configuration (SUPABASE_URL)');
    }
    return url;
}

export function getSupabaseAnonKey(): string {
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
    if (!anonKey) {
        throw new Error('Missing Supabase anon key configuration (SUPABASE_ANON_KEY)');
    }
    return anonKey;
}

export function getSupabaseAuthAdminKey(): string | null {
    return process.env.SUPABASE_SECRET_KEY || null;
}
