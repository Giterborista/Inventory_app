"use client";

import { useEffect, useRef, useState } from "react";

type SupportiveInformationDialogProps = {
  isExporting?: boolean;
  onClose: () => void;
  onSubmit: (files: File[]) => void;
  open: boolean;
};

const ACCEPTED_SUPPORTIVE_FILE_TYPES = ".pdf,application/pdf";

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isAcceptedSupportiveFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return lowerName.endsWith(".pdf") || file.type === "application/pdf";
}

export function SupportiveInformationDialog({
  isExporting = false,
  onClose,
  onSubmit,
  open,
}: SupportiveInformationDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setError("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) {
      return;
    }

    const nextFiles = Array.from(fileList);
    const rejected = nextFiles.filter((file) => !isAcceptedSupportiveFile(file));
    if (rejected.length > 0) {
      setError("Only PDF files can be attached to the dossier.");
      return;
    }

    setError("");
    setFiles((current) => {
      const seen = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const uniqueNext = nextFiles.filter((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      return [...current, ...uniqueNext];
    });
  };

  const pdfCount = files.length;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/35 px-4 py-6 backdrop-blur-sm">
      <div
        aria-labelledby="project-report-title"
        aria-modal="true"
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/70 bg-white p-6 shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="section-title">Project dossier</div>
            <h2 className="mt-2 text-2xl font-semibold text-ink" id="project-report-title">Add supporting documents?</h2>
            <p className="mt-2 text-sm leading-6 text-slate">
              Upload optional PDF supporting documents before the dossier is generated. Each PDF is listed in the
              dossier, then appended after a separator page with its file name.
            </p>
          </div>
          <button
            className="rounded-md border border-mist/80 px-4 py-2 text-sm font-medium text-slate transition hover:text-ink"
            disabled={isExporting}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-accent/40 bg-accent/5 p-5">
          <input
            ref={fileInputRef}
            accept={ACCEPTED_SUPPORTIVE_FILE_TYPES}
            className="hidden"
            multiple
            onChange={(event) => addFiles(event.target.files)}
            type="file"
          />
          <button
            className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1f4b87]"
            disabled={isExporting}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            Choose supportive files
          </button>
          <p className="mt-3 text-xs leading-5 text-slate">
            Accepted: .pdf only. Uploaded PDFs are used only for this export and are not saved in the JSON.
          </p>
          {error ? <p className="mt-3 text-sm font-medium text-alert">{error}</p> : null}
        </div>

        <div className="mt-5 rounded-lg border border-mist/80 bg-white/80">
          <div className="flex items-center justify-between border-b border-mist/70 px-4 py-3">
            <div className="text-sm font-semibold text-ink">Selected files</div>
            <div className="text-xs text-slate">
              {pdfCount} PDF{pdfCount === 1 ? "" : "s"} selected
            </div>
          </div>
          {files.length === 0 ? (
            <p className="px-4 py-5 text-sm text-slate">No supportive files selected.</p>
          ) : (
            <ul className="divide-y divide-mist/70">
              {files.map((file, index) => (
                <li className="flex items-center justify-between gap-4 px-4 py-3" key={`${file.name}-${file.size}-${index}`}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{file.name}</div>
                    <div className="mt-1 text-xs text-slate">
                      {formatFileSize(file.size)} / PDF will be appended after a separator page
                    </div>
                  </div>
                  <button
                    className="rounded-md border border-mist/80 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-alert hover:text-alert"
                    disabled={isExporting}
                    onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                    type="button"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="rounded-md border border-mist/80 px-5 py-3 text-sm font-semibold text-slate transition hover:text-ink"
            disabled={isExporting}
            onClick={() => {
              setFiles([]);
              setError("");
              onSubmit([]);
            }}
            type="button"
          >
            Export without attachments
          </button>
          <button
            className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f4b87] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isExporting}
            onClick={() => onSubmit(files)}
            type="button"
          >
            {isExporting ? "Building dossier..." : "Export dossier"}
          </button>
        </div>
      </div>
    </div>
  );
}
