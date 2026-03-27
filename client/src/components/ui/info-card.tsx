import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * InfoCard — the standard card pattern for displaying segmented information.
 *
 * 3-slot layout:
 *   Header  — label/title (required)
 *   Content — stats, numbers, any content (required)
 *   Action  — link/button (optional)
 *
 * Renders as bg-card on bg-section surfaces.
 */

interface InfoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

function InfoCard({ className, children, ...props }: InfoCardProps) {
  return (
    <div
      className={cn("bg-card rounded-xl p-4", className)}
      {...props}
    >
      {children}
    </div>
  )
}

function InfoCardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mb-2", className)} {...props}>
      {children}
    </div>
  )
}

function InfoCardLabel({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70", className)}
      {...props}
    >
      {children}
    </p>
  )
}

function InfoCardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(className)} {...props}>
      {children}
    </div>
  )
}

function InfoCardAction({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mt-3 text-xs font-medium text-muted-foreground flex items-center gap-1", className)} {...props}>
      {children}
    </div>
  )
}

export { InfoCard, InfoCardHeader, InfoCardLabel, InfoCardContent, InfoCardAction }
