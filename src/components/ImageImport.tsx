import React, { useCallback, useRef, useState } from 'react';
import { Upload, Image as ImageIcon, X } from 'lucide-react';

interface ImageImportProps {
  onImageLoaded: (file: File, imageData: ImageData) => void;
  sourceFile: File | null;
  imageData: ImageData | null;
  onReset: () => void;
}

const ACCEPTED = '.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif';

export default function ImageImport({ onImageLoaded, sourceFile, imageData, onReset }: ImageImportProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      onImageLoaded(file, data);
    };
    img.src = URL.createObjectURL(file);
  }, [onImageLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) processFile(file);
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  if (sourceFile && imageData) {
    const thumbUrl = URL.createObjectURL(sourceFile);
    return (
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ImageIcon className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">{sourceFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {imageData.width} × {imageData.height}
              </p>
            </div>
          </div>
          <button
            onClick={onReset}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-secondary"
            aria-label="Change image"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="checkerboard rounded-lg overflow-hidden flex items-center justify-center p-4 max-h-48">
          <img
            src={thumbUrl}
            alt={sourceFile.name}
            className="max-h-40 object-contain rounded"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Import image — drag and drop or click to upload"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      className={`
        bg-card rounded-xl border-2 border-dashed transition-colors cursor-pointer
        flex flex-col items-center justify-center gap-3 py-16 px-6
        ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'}
      `}
    >
      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
        <Upload className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Drop an image here</p>
        <p className="text-xs text-muted-foreground mt-1">
          or click to browse · PNG, JPG, WebP, GIF, BMP, AVIF
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
