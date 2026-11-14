"use client";

import { useRef, useState } from "react";
import { FileText, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_ACCEPT = ".pdf,.png,.jpg,.jpeg";
const ALLOWED = ["application/pdf", "image/png", "image/jpeg"];

export function FileUpload({
  onFile,
  label = "Upload document",
  hint = "PDF, PNG or JPG · up to 5 MB · DEMO stores metadata only",
  maxSizeMB = 5,
  className,
}: {
  onFile?: (file: File | null) => void;
  label?: string;
  hint?: string;
  maxSizeMB?: number;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const acceptFile = (candidate: File | null) => {
    setError(null);
    if (!candidate) {
      setFile(null);
      onFile?.(null);
      return;
    }
    if (!ALLOWED.includes(candidate.type)) {
      setError("Only PDF, PNG and JPG files are permitted.");
      return;
    }
    if (candidate.size > maxSizeMB * 1024 * 1024) {
      setError(`File must be smaller than ${maxSizeMB} MB.`);
      return;
    }
    setFile(candidate);
    onFile?.(candidate);
  };

  if (file) {
    return (
      <div className={cn("flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3", className)}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink-900">{file.name}</p>
          <p className="text-[11px] text-ink-500">{(file.size / 1024).toFixed(0)} KB · selected for demo upload</p>
        </div>
        <button
          type="button"
          aria-label="Remove file"
          onClick={() => acceptFile(null)}
          className="rounded-md p-1.5 text-ink-500 hover:bg-white hover:text-rose-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          acceptFile(event.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition",
          dragging
            ? "border-brand-500 bg-brand-50"
            : "border-ink-200 bg-ink-50/40 hover:border-brand-300 hover:bg-brand-50/40",
        )}
      >
        <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm">
          <UploadCloud className="h-4 w-4" />
        </span>
        <span className="text-[13px] font-medium text-ink-800">{label}</span>
        <span className="mt-0.5 text-[11px] text-ink-500">{hint}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={DEFAULT_ACCEPT}
        className="sr-only"
        onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
      />
      {error ? <p className="mt-1.5 text-[11px] text-rose-600">{error}</p> : null}
    </div>
  );
}
