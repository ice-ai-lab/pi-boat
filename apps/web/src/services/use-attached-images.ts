import type { ImageContent } from '@ice-ai/protocol';
import { useCallback, useRef, useState } from 'react';

/**
 * 图片附件（T2-2）：按设计规范 `lib/image-attachments.ts` + `ChatInput.processImageFiles` 移植。
 *
 * 客户端先压缩（>1MB 且非 GIF → canvas 缩到最长边 1024 / JPEG 0.85），把 `ImageContent`
 * （`{data, mimeType}`）交给 `prompt` / `steer` / `follow_up` 命令的 `images` 字段；
 * 输入卡的文件名芯片与 hover 预览用 object URL。
 */
export const MAX_ATTACHED_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHED_IMAGES = 10;

const COMPRESSION_THRESHOLD_BYTES = 1024 * 1024;
const MAX_IMAGE_SIDE = 1024;
const JPEG_QUALITY = 0.85;

export interface AttachedImage extends ImageContent {
  /** object URL（输入卡附件芯片与 hover 预览用） */
  previewUrl: string;
  /** 原文件名（芯片显示用；粘贴件是浏览器默认名，如 image.png） */
  name: string;
}

export function attachedImageToContent(image: AttachedImage): ImageContent {
  return { type: 'image', data: image.data, mimeType: image.mimeType };
}

export function shouldCompressImageFile(file: Pick<File, 'size' | 'type'>): boolean {
  return file.size > COMPRESSION_THRESHOLD_BYTES && file.type !== 'image/gif';
}

function readImageFile(file: Blob, mimeType: string): Promise<ImageContent> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result.split(',')[1] : undefined;
      if (!data) {
        reject(new Error('Failed to read image'));
        return;
      }
      resolve({ type: 'image', data, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function compressImageFile(file: File): Promise<ImageContent> {
  const original = () => readImageFile(file, file.type);
  if (!shouldCompressImageFile(file) || typeof createImageBitmap !== 'function') return original();

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return original();

  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return original();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1];
    return data && data.length < Math.ceil(file.size / 3) * 4
      ? { type: 'image', data, mimeType: 'image/jpeg' }
      : original();
  } catch {
    return original();
  } finally {
    bitmap.close();
  }
}

function revokeImage(image: AttachedImage): void {
  if (image.previewUrl.startsWith('blob:')) URL.revokeObjectURL(image.previewUrl);
}

export interface AttachedImagesController {
  images: AttachedImage[];
  /** 剪贴板 / 文件选择 / 拖拽的入口：过滤非图与超限 → 压缩 → 追加 */
  addFiles(files: File[]): void;
  remove(index: number): void;
  clear(): void;
}

export function useAttachedImages(): AttachedImagesController {
  const [images, setImages] = useState<AttachedImage[]>([]);
  const imagesRef = useRef<AttachedImage[]>([]);
  const pendingRef = useRef(0);

  const addFiles = useCallback((files: File[]) => {
    const remaining = Math.max(
      0,
      MAX_ATTACHED_IMAGES - imagesRef.current.length - pendingRef.current,
    );
    const accepted = files
      .filter((file) => file.type.startsWith('image/') && file.size <= MAX_ATTACHED_IMAGE_BYTES)
      .slice(0, remaining);
    if (accepted.length === 0) return;
    pendingRef.current += accepted.length;
    void Promise.all(
      accepted.map(async (file) => ({
        ...(await compressImageFile(file)),
        previewUrl: URL.createObjectURL(file),
        name: file.name,
      })),
    )
      .then((loaded) => {
        setImages((previous) => {
          const kept = loaded.slice(0, Math.max(0, MAX_ATTACHED_IMAGES - previous.length));
          for (const dropped of loaded.slice(kept.length)) revokeImage(dropped);
          const next = [...previous, ...kept];
          imagesRef.current = next;
          return next;
        });
      })
      .finally(() => {
        pendingRef.current -= accepted.length;
      });
  }, []);

  const remove = useCallback((index: number) => {
    setImages((previous) => {
      const next = [...previous];
      const [removed] = next.splice(index, 1);
      if (removed) revokeImage(removed);
      imagesRef.current = next;
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    imagesRef.current = [];
    setImages((previous) => {
      for (const image of previous) revokeImage(image);
      return [];
    });
  }, []);

  return { images, addFiles, remove, clear };
}
