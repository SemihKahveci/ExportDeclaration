import type { EvraklarCondition, EvraklarConditionField, EvraklarConditionOperator } from '../../types';

const FIELD_LABELS: Record<EvraklarConditionField, string> = {
  mensei:           'Menşei',
  teslim_ulkesi:    'Teslim ülkesi',
  gonderici_ulkesi: 'Gönderici ülkesi',
  gtip_no:          'GTİP numarası',
};

interface ConditionRowProps {
  condition: EvraklarCondition;
  countries: string[];
  onChange: (updated: EvraklarCondition) => void;
}

export default function ConditionRow({ condition, countries, onChange }: ConditionRowProps) {
  const isCountry = condition.field !== 'gtip_no';
  const isValid   = condition.enabled && condition.value.trim() !== '';

  function toggle() {
    onChange({ ...condition, enabled: !condition.enabled, value: condition.enabled ? '' : condition.value });
  }

  function setOperator(op: EvraklarConditionOperator) {
    onChange({ ...condition, operator: op });
  }

  function setValue(val: string) {
    onChange({ ...condition, value: val });
  }

  return (
    <div
      className={[
        'rounded-[9px] border px-4 py-3 transition-colors',
        condition.enabled
          ? isValid
            ? 'border-accent bg-accent-tint/30'
            : 'border-warn/50 bg-warn-tint/30'
          : 'border-line bg-surface-2',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={condition.enabled}
          onChange={toggle}
          className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer shrink-0"
        />

        {/* Label */}
        <span
          className={[
            'text-[13px] font-semibold w-40 shrink-0',
            condition.enabled ? 'text-text-strong' : 'text-muted',
          ].join(' ')}
        >
          {FIELD_LABELS[condition.field]}
        </span>

        {/* Value inputs — shown only when enabled */}
        {condition.enabled && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* GTİP: operator selector + text input */}
            {!isCountry && (
              <>
                <select
                  value={condition.operator}
                  onChange={(e) => setOperator(e.target.value as EvraklarConditionOperator)}
                  className="border border-line-strong rounded-[7px] px-2.5 py-1.5 text-[12.5px] text-text bg-surface font-[inherit] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint shrink-0"
                >
                  <option value="equals">eşittir</option>
                  <option value="starts_with">ile başlar</option>
                </select>
                <input
                  type="text"
                  value={condition.value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="GTİP kodu girin…"
                  className="flex-1 min-w-0 border border-line-strong rounded-[7px] px-2.5 py-1.5 text-[12.5px] text-text font-[inherit] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
                />
              </>
            )}

            {/* Country: single select */}
            {isCountry && (
              <select
                value={condition.value}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1 min-w-0 border border-line-strong rounded-[7px] px-2.5 py-1.5 text-[12.5px] text-text bg-surface font-[inherit] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
              >
                <option value="">Ülke / grup seçin…</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
