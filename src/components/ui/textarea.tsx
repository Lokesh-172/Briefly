import * as React from "react";
import TextareaAutosize from "react-textarea-autosize";

// Utility function to conditionally join class names
function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

interface TextareaProps extends React.ComponentPropsWithoutRef<typeof TextareaAutosize> {
  className?: string;
}

function Textarea({ className, ...props }: TextareaProps) {
  return (
    <TextareaAutosize
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base",
        "shadow-xs transition-[color,box-shadow] outline-none",
        "focus-visible:ring-[3px] focus-visible:border-blue-500 focus-visible:ring-blue-500/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "placeholder:text-gray-500",
        "dark:bg-gray-800/30",
        "aria-invalid:border-red-500 aria-invalid:ring-red-500/20",
        "dark:aria-invalid:ring-red-500/40",
        "md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };