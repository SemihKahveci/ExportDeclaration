import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Upload, FileCheck } from 'lucide-react';

interface UploadBoxProps {
  title?: string;
  hint?: string;
  multiple?: boolean;
  accept?: string;
  /** Keep earlier picks and add new ones, up to maxFiles. */
  accumulate?: boolean;
  maxFiles?: number;
  onFiles: (files: File[]) => void;
}

export default function UploadBox({
  title = 'Dosya yüklemek için tıklayın veya sürükleyin',
  hint = 'PDF, DOCX, XLSX — maks. 20 MB',
  multiple = false,
  accept,
  accumulate = false,
  maxFiles,
  onFiles,
}: UploadBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<File[]>([]);

  function sameFile(left: File, right: File) {
    return left.name === right.name && left.size === right.size && left.lastModified === right.lastModified;
  }

  function commit(next: File[]) {
    const limited = maxFiles ? next.slice(0, maxFiles) : next;
    setSelected(limited);
    onFiles(limited);
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const base = accumulate ? selected : [];
    const next = [...base];
    for (const file of incoming) {
      if (maxFiles && next.length >= maxFiles) break;
      if (!next.some((item) => sameFile(item, file))) next.push(file);
    }
    commit(next);
    if (inputRef.current) inputRef.current.value = '';
  }

  function removeFile(file: File) {
    commit(selected.filter((item) => !sameFile(item, file)));
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave() {
    setDragging(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
  }

  const hasFiles = selected.length > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={[
        'flex flex-col items-center justify-center gap-3 px-6 py-8 rounded border-2 border-dashed cursor-pointer transition-colors select-none',
        dragging
          ? 'border-accent bg-accent-tint'
          : hasFiles
          ? 'border-accent bg-accent-tint/50'
          : 'border-line bg-surface-2 hover:border-accent hover:bg-accent-tint/40',
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={onChange}
      />

      {hasFiles ? (
        <>
          <FileCheck size={24} className="text-accent" strokeWidth={1.75} />
          <div className="text-center space-y-1">
            {selected.map((file) => (
              <p key={`${file.name}-${file.size}-${file.lastModified}`} className="text-[12px] font-medium text-text-strong truncate max-w-[260px]">
                {file.name}
                {accumulate && (
                  <button
                    type="button"
                    className="ml-2 text-[11px] text-muted underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFile(file);
                    }}
                  >
                    çıkar
                  </button>
                )}
              </p>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            {accumulate
              ? `${selected.length}${maxFiles ? ` / ${maxFiles}` : ''} dosya · eklemek için tıklayın`
              : 'Değiştirmek için tıklayın'}
          </p>
        </>
      ) : (
        <>
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: dragging ? 'var(--accent-tint)' : 'var(--line)' }}
          >
            <Upload size={18} className={dragging ? 'text-accent' : 'text-muted'} strokeWidth={1.75} />
          </div>
          <div className="text-center">
            <p className="text-[13px] font-medium text-text-strong">{title}</p>
            <p className="text-[11px] text-muted mt-0.5">{hint}</p>
          </div>
        </>
      )}
    </div>
  );
}
