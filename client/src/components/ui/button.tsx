import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
  " hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        // Primary: burnt orange bg, white text
        default:
          "bg-primary text-primary-foreground border border-primary hover:opacity-90",
        // Secondary: white bg, dark text, light border
        secondary:
          "bg-secondary text-secondary-foreground border border-[#EBEBEB] hover:bg-[#F7F7F4]",
        // Tertiary (outline): transparent bg, dark text, light border
        outline:
          "bg-transparent text-[#3C3C3C] border border-[#EBEBEB] hover:bg-[#F7F7F4]",
        // Text only (ghost): no bg, dark text, no border
        ghost:
          "bg-transparent text-[#3C3C3C] border border-transparent hover:bg-[#F7F7F4]",
        // Destructive: kept for error states
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive hover:opacity-90",
      },
      // Heights are set as "min" heights, because sometimes Ai will place large amount of content
      // inside buttons. With a min-height they will look appropriate with small amounts of content,
      // but will expand to fit large amounts of content.
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
