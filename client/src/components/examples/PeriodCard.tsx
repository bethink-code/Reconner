import PeriodCard from '../PeriodCard';

export default function PeriodCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <PeriodCard title="Total Periods" value={24} icon="total" />
      <PeriodCard title="Completed" value={18} icon="complete" subtitle="75% completion rate" />
      <PeriodCard title="In Progress" value={4} icon="inProgress" />
      <PeriodCard title="Draft" value={2} icon="draft" />
    </div>
  );
}
