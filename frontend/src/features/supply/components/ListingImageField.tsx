'use client';

// ============================================================================
// Listing photo: drag and drop, browse or paste an image (uploaded to the
// backend, which returns a public URL), or paste a link as before. Either way
// the form only ever stores a URL in `image_url`.
// ============================================================================

import { ImagePlus, Link2, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_INPUT_BYTES = 20 * 1024 * 1024; // what we accept from the user's disk
const MAX_UPLOAD_BYTES = 1_500_000; // above this (or very large dimensions) we resize first
const MAX_EDGE = 1600;

type Accepted = (typeof ACCEPTED)[number];

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(blob);
  });
}

/** Downscale big photos (phone cameras) so uploads stay small; small files are sent as they are. */
async function prepare(file: File): Promise<{ blob: Blob; type: Accepted }> {
  const type = file.type as Accepted;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This file is not a readable image.');
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  if (file.size <= MAX_UPLOAD_BYTES && longest <= MAX_EDGE * 1.25) {
    bitmap.close();
    return { blob: file, type };
  }
  const scale = Math.min(1, MAX_EDGE / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process this image.');
  ctx.fillStyle = '#ffffff'; // transparent PNG areas become white in the JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Your browser could not process this image.');
  return { blob, type: 'image/jpeg' };
}

export function ListingImageField({
  id,
  value,
  onChange,
  organizationId,
  onBusyChange,
}: {
  id: string;
  value: string;
  onChange: (url: string) => void;
  organizationId: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const busyRef = useRef(onBusyChange);
  busyRef.current = onBusyChange;

  useEffect(() => setPreviewFailed(false), [value]);
  useEffect(() => busyRef.current?.(uploading), [uploading]);

  const upload = async (file: File | undefined | null) => {
    if (!file || uploading) return;
    setError(null);
    if (!ACCEPTED.includes(file.type as Accepted)) {
      setError('Use a JPEG, PNG or WebP photo.');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError('That file is over 20 MB. Choose a smaller photo.');
      return;
    }
    if (!organizationId) {
      setError('Choose the supplier company first.');
      return;
    }
    setUploading(true);
    try {
      const { blob, type } = await prepare(file);
      const image_base64 = await readAsBase64(blob);
      const uploaded = await api.uploads.listingImage({ image_base64, mime_type: type }, organizationId);
      onChange(uploaded.url);
      setShowLink(false);
    } catch (err) {
      setError(errorMessage(err, 'The photo could not be uploaded.'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void upload(e.dataTransfer.files?.[0]);
  };
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragging) setDragging(true);
  };
  const onPaste = (e: ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      void upload(file);
    }
  };

  const hasImage = Boolean(value.trim());

  const applyLink = () => {
    const url = linkDraft.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setError('Enter a full link starting with https://');
      return;
    }
    setError(null);
    onChange(url);
    setLinkDraft('');
    setShowLink(false);
  };

  return (
    <div className="space-y-2.5" onPaste={onPaste}>
      <input
        ref={inputRef}
        id={`${id}-file`}
        type="file"
        accept={ACCEPTED.join(',')}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void upload(e.target.files?.[0])}
      />

      {hasImage ? (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDragging(false)}
          className={cn(
            'flex flex-col gap-3 rounded-sm border bg-cream-paper p-3 transition-colors sm:flex-row sm:items-center',
            dragging ? 'border-copper ring-2 ring-copper/20' : 'border-graphite/15'
          )}
        >
          <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xs bg-graphite/[0.05] sm:w-40">
            {previewFailed ? (
              <p className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-600">Preview unavailable</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL on any host
              <img src={value} alt="Listing photo preview" className="h-full w-full object-cover" onError={() => setPreviewFailed(true)} />
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-cream/70">
                <Loader2 className="size-5 animate-spin text-copper-700" aria-hidden />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="truncate font-mono text-xs text-slate-600" title={value}>
              {value}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-graphite/20 px-3 text-[13px] font-medium text-graphite hover:border-graphite/45 disabled:opacity-50"
              >
                <RefreshCw className="size-3.5" aria-hidden /> Replace
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setError(null);
                }}
                disabled={uploading}
                className="inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-[13px] font-medium text-brick-700 hover:bg-brick-50 disabled:opacity-50"
              >
                <Trash2 className="size-3.5" aria-hidden /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          id={id}
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDragging(false)}
          disabled={uploading}
          aria-describedby={`${id}-hint`}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed px-4 py-7 text-center transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30',
            dragging ? 'border-copper bg-copper-50' : 'border-graphite/25 bg-cream-paper hover:border-graphite/45 hover:bg-graphite/[0.02]',
            uploading && 'cursor-wait opacity-80'
          )}
        >
          {uploading ? (
            <Loader2 className="size-6 animate-spin text-copper-700" aria-hidden />
          ) : (
            <ImagePlus className={cn('size-6', dragging ? 'text-copper-700' : 'text-slate-500')} aria-hidden />
          )}
          <span className="text-sm font-medium text-graphite">
            {uploading ? 'Uploading photo…' : dragging ? 'Drop to upload' : 'Drag a photo here, or click to browse'}
          </span>
          <span className="font-mono text-[11px] text-slate-600">JPEG, PNG or WebP · up to 20 MB · you can also paste an image</span>
        </button>
      )}

      <div aria-live="polite">{error && <p className="text-xs font-medium text-brick-700">{error}</p>}</div>

      {!hasImage &&
        (showLink ? (
          <div className="space-y-1">
            <label htmlFor={`${id}-url`} className="t-label">
              Or paste a photo link
            </label>
            <div className="flex gap-2">
              <input
                id={`${id}-url`}
                type="url"
                placeholder="https://example.com/images/metal-sheet.jpg"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyLink();
                  }
                }}
                className="field min-w-0 flex-1"
                autoFocus
              />
              <button
                type="button"
                onClick={applyLink}
                className="inline-flex h-10 shrink-0 items-center rounded-sm border border-graphite/20 px-3 text-sm font-medium text-graphite hover:border-graphite/45"
              >
                Use link
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowLink(true)} className="link inline-flex items-center gap-1.5 text-xs">
            <Link2 className="size-3.5" aria-hidden /> Paste a link instead
          </button>
        ))}
    </div>
  );
}
