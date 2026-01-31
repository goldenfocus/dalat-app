/**
 * Supabase Storage Provider
 *
 * Wrapper around Supabase Storage that implements the StorageProvider interface.
 * This maintains backward compatibility during the R2 migration.
 */

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type {
  StorageProvider,
  UploadOptions,
  PresignedUrlOptions,
} from './index';

const DEFAULT_CACHE_CONTROL = '3600'; // 1 hour (Supabase format)

/**
 * Create admin Supabase client with service role key (bypasses RLS)
 */
function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export class SupabaseStorageProvider implements StorageProvider {
  private useAdmin: boolean;

  /**
   * @param useAdmin Use admin client to bypass RLS (for server-side uploads)
   */
  constructor(useAdmin = false) {
    this.useAdmin = useAdmin;
  }

  private async getClient() {
    if (this.useAdmin) {
      return getSupabaseAdmin();
    }
    return createClient();
  }

  /**
   * Upload a file to Supabase Storage
   */
  async upload(
    bucket: string,
    path: string,
    file: Buffer | Blob,
    options?: UploadOptions
  ): Promise<string> {
    const supabase = await this.getClient();

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        contentType: options?.contentType,
        cacheControl: options?.cacheControl || DEFAULT_CACHE_CONTROL,
        upsert: options?.upsert ?? true,
      });

    if (uploadError) {
      throw new Error(`Supabase upload failed: ${uploadError.message}`);
    }

    return this.getPublicUrl(bucket, path);
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(bucket: string, path: string): string {
    // Supabase public URL format
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  }

  /**
   * Delete a file from Supabase Storage
   */
  async delete(bucket: string, path: string): Promise<void> {
    const supabase = await this.getClient();

    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) {
      throw new Error(`Supabase delete failed: ${error.message}`);
    }
  }

  /**
   * Create a signed upload URL
   * Note: Supabase uses signed URLs differently - this creates a URL
   * that the client can use to upload directly.
   */
  async createPresignedUploadUrl(
    bucket: string,
    path: string,
    _options?: PresignedUrlOptions
  ): Promise<string> {
    const supabase = await this.getClient();

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error || !data) {
      throw new Error(
        `Supabase presigned URL failed: ${error?.message || 'Unknown error'}`
      );
    }

    return data.signedUrl;
  }
}

/**
 * Create a Supabase storage provider with admin privileges
 * Use this for server-side uploads that need to bypass RLS
 */
export function createAdminStorageProvider(): SupabaseStorageProvider {
  return new SupabaseStorageProvider(true);
}
