import StatusBadge from '../StatusBadge';

export default function StatusBadgeExample() {
  return (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="draft" />
      <StatusBadge status="in_progress" />
      <StatusBadge status="complete" />
      <StatusBadge status="matched" />
      <StatusBadge status="unmatched" />
      <StatusBadge status="partial" />
    </div>
  );
}
