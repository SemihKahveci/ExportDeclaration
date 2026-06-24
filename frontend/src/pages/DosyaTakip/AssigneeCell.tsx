import type { Assignee } from '../../types';

export default function AssigneeCell({ assignee }: { assignee: Assignee | null }) {
  if (!assignee) {
    return <span className="text-muted-2 text-[12px]">Atanmadı</span>;
  }
  return <span className="text-[13px] text-text">{assignee.name}</span>;
}
