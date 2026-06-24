type EventState = 'done' | 'wait' | 'default';

interface TimelineEvent {
  title: string;
  meta: string;
  state?: EventState;
}

interface TimelineProps {
  events: TimelineEvent[];
}

const DOT_STYLES: Record<EventState, { dot: string; line: string }> = {
  done:    { dot: 'bg-ok border-ok',         line: 'bg-ok/30' },
  wait:    { dot: 'bg-warn-tint border-warn', line: 'bg-line' },
  default: { dot: 'bg-surface border-line-strong', line: 'bg-line' },
};

const TEXT_STYLES: Record<EventState, string> = {
  done:    'text-text-strong font-medium',
  wait:    'text-text',
  default: 'text-muted',
};

export default function Timeline({ events }: TimelineProps) {
  return (
    <ol className="space-y-0">
      {events.map((ev, i) => {
        const state: EventState = ev.state ?? 'default';
        const cfg = DOT_STYLES[state];
        const isLast = i === events.length - 1;

        return (
          <li key={i} className="flex gap-3">
            {/* Track */}
            <div className="flex flex-col items-center">
              <span
                className={`w-3 h-3 rounded-full border-2 shrink-0 mt-1 ${cfg.dot}`}
              />
              {!isLast && (
                <span className={`w-px flex-1 mt-1 mb-0 min-h-[16px] ${cfg.line}`} />
              )}
            </div>

            {/* Content */}
            <div className={`pb-4 min-w-0 ${isLast ? '' : ''}`}>
              <p className={`text-[13px] leading-snug ${TEXT_STYLES[state]}`}>{ev.title}</p>
              <p className="text-[11px] text-muted mt-0.5">{ev.meta}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
