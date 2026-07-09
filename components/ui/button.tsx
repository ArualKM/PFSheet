import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // `transition` (not just colors) + `active:scale` gives a tactile press. The motion system collapses
  // the transition to instant when motion is off, so this respects the preference automatically.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
        secondary:
          "bg-surface-raised text-foreground border border-border hover:bg-surface-raised/70",
        outline: "border border-border bg-transparent hover:bg-surface-raised text-foreground",
        ghost: "hover:bg-surface-raised text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        rune: "bg-rune/15 text-rune border border-rune/40 hover:bg-rune/25",
        link: "text-rune underline-offset-4 hover:underline",
      },
      size: {
        // Touch-first: >= 44px (the --pf-tap baseline) on phones, the original tighter size at sm+ (desktop),
        // so dense in-row controls (steppers / trash / Add) are tappable without bloating the desktop layout.
        sm: "h-11 px-3 text-xs sm:h-8",
        default: "h-11 px-4 py-2 sm:h-10",
        lg: "h-11 px-6 text-base",
        icon: "size-11 sm:size-10",
        // Always touch-comfortable (>= 44px) regardless of breakpoint — for mobile nav/drawer/sheet controls.
        touch: "h-11 min-w-11 px-4",
        "icon-touch": "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
