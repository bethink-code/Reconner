import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: "draft" | "in_progress" | "complete" | "matched" | "unmatched" | "partial" | "unmatchable";
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const variants: Record<string, { label: string; className: string }> = {
    draft: { 
      label: "Draft", 
      className: "bg-muted text-muted-foreground border-muted-border" 
    },
    in_progress: { 
      label: "In Progress", 
      className: "bg-chart-4/10 text-chart-4 border-chart-4/20" 
    },
    complete: { 
      label: "Complete", 
      className: "bg-chart-2/10 text-chart-2 border-chart-2/20" 
    },
    matched: { 
      label: "Matched", 
      className: "bg-chart-2/10 text-chart-2 border-chart-2/20" 
    },
    unmatched: { 
      label: "Unmatched", 
      className: "bg-destructive/10 text-destructive border-destructive/20" 
    },
    partial: { 
      label: "Partial Match", 
      className: "bg-chart-4/10 text-chart-4 border-chart-4/20" 
    },
    unmatchable: { 
      label: "Unmatchable", 
      className: "bg-muted text-muted-foreground border-muted-border" 
    },
  };

  const { label, className: variantClass } = variants[status];

  return (
    <Badge 
      variant="outline" 
      className={`${variantClass} ${className || ''}`}
      data-testid={`badge-status-${status}`}
    >
      {label}
    </Badge>
  );
}
