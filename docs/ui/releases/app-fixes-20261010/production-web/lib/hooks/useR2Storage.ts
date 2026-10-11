"use client";

import { useState, useCallback } from "react";
import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  StorageCategory,
} from "@/app/actions/storage";

export interface UploadOptions {
  file: File;
  category: StorageCategory;
  onProgress?: (percent: number) => void;
}

export interface UploadResult {
  success: boolean;
  objectKey?: string;
  error?: string;
}

/**
 * Reusable client-side hook for interacting with Cloudflare R2 object storage.
 * Enforces ZERO VERCEL BANDWIDTH by streaming file bytes directly between
 * the browser and R2 using presigned URLs.
 */
export function useR2Storage() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /**
   * Uploads a file directly to Cloudflare R2 with progress tracking.
   */
  const uploadFile = useCallback(
    async ({ file, category, onProgress }: UploadOptions): Promise<UploadResult> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);

      try {
        // 1. Request presigned upload URL from Server Action (Control Plane)
        const presigned = await getPresignedUploadUrl({
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          category,
        });

        if (!presigned.success || !presigned.uploadUrl || !presigned.objectKey) {
          throw new Error(presigned.error || "Failed to generate upload link.");
        }

        const { uploadUrl, objectKey } = presigned;

        // 2. Direct browser-to-R2 upload (Data Plane)
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl, true);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              setProgress(percentComplete);
              if (onProgress) {
                onProgress(percentComplete);
              }
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setProgress(100);
              if (onProgress) onProgress(100);
              resolve();
            } else {
              reject(new Error(`Storage upload failed with HTTP status ${xhr.status}.`));
            }
          };

          xhr.onerror = () => {
            reject(new Error("Network error during file upload to Cloudflare R2. Please check CORS settings."));
          };

          xhr.send(file);
        });

        setIsUploading(false);
        return {
          success: true,
          objectKey,
        };
      } catch (err) {
        const errorMsg = (err instanceof Error ? err.message : "Unexpected error") || "File upload failed.";
        setError(errorMsg);
        setIsUploading(false);
        return {
          success: false,
          error: errorMsg,
        };
      }
    },
    []
  );

  /**
   * Requests a temporary presigned GET URL for viewing or downloading a file.
   */
  const getFileUrl = useCallback(async (objectKey: string): Promise<string | null> => {
    try {
      const res = await getPresignedDownloadUrl(objectKey);
      if (res.success && res.downloadUrl) {
        return res.downloadUrl;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  return {
    uploadFile,
    getFileUrl,
    isUploading,
    progress,
    error,
  };
}
