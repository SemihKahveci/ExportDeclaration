import { FileCheck } from 'lucide-react';

interface DocumentPickerProps {
  docTypes: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function DocumentPicker({ docTypes, selected, onChange }: DocumentPickerProps) {
  function toggle(doc: string) {
    if (selected.includes(doc)) {
      onChange(selected.filter((d) => d !== doc));
    } else {
      onChange([...selected, doc]);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {docTypes.map((doc) => {
        const checked = selected.includes(doc);
        return (
          <label
            key={doc}
            className={[
              'flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] border cursor-pointer transition-colors select-none',
              checked
                ? 'border-accent bg-accent-tint text-accent'
                : 'border-line bg-surface-2 text-text hover:border-line-strong hover:bg-surface',
            ].join(' ')}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(doc)}
              className="sr-only"
            />
            <span
              className={[
                'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                checked ? 'border-accent bg-accent' : 'border-line-strong bg-surface',
              ].join(' ')}
            >
              {checked && <FileCheck size={10} strokeWidth={2.5} className="text-white" />}
            </span>
            <span className="text-[12.5px] font-medium leading-snug">{doc}</span>
          </label>
        );
      })}
    </div>
  );
}
