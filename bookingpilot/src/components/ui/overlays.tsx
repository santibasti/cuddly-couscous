import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---- Dialog / Sheet
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, title, description, side, wide, hideClose, ...p }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; description?: string; side?: boolean; wide?: boolean; hideClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-950/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col bg-white shadow-2xl outline-none',
          side
            ? 'inset-y-0 right-0 w-full max-w-xl border-l border-line'
            : cn('left-1/2 top-1/2 max-h-[92dvh] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl', wide ? 'max-w-3xl' : 'max-w-lg'),
          className,
        )}
        {...p}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <DialogPrimitive.Title className="font-display text-lg font-bold text-ink">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-0.5 text-sm text-ink-soft">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
          </div>
          {!hideClose && <DialogPrimitive.Close className="rounded-lg p-1.5 text-ink-mute hover:bg-black/5" aria-label="Close"><X className="size-5" /></DialogPrimitive.Close>}
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export const DialogBody = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex-1 overflow-y-auto px-5 py-4 scroll-thin', className)} {...p} />;
export const DialogFooter = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3', className)} {...p} />
);

// ---- Dropdown
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuContent = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content sideOffset={8} align="end" className={cn('z-[60] min-w-52 overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-xl', className)} {...p} />
  </DropdownPrimitive.Portal>
);
export const DropdownMenuItem = ({ className, danger, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { danger?: boolean }) => (
  <DropdownPrimitive.Item className={cn('flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-brand-50 data-[disabled]:opacity-40 [&_svg]:size-4', danger && 'text-coral-700 data-[highlighted]:bg-coral-50', className)} {...p} />
);
export const DropdownMenuLabel = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) => (
  <DropdownPrimitive.Label className={cn('px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-mute', className)} {...p} />
);
export const DropdownMenuSeparator = () => <DropdownPrimitive.Separator className="my-1 h-px bg-line" />;

// ---- Popover
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverContent = ({ className, align = 'end', ...p }: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content align={align} sideOffset={8} className={cn('z-[60] w-80 rounded-2xl border border-line bg-white p-0 shadow-xl outline-none', className)} {...p} />
  </PopoverPrimitive.Portal>
);

// ---- Tabs
export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-line scroll-thin', className)} {...p} />
);
export const TabsTrigger = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger className={cn('whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold text-ink-soft transition-colors data-[state=active]:bg-navy-900 data-[state=active]:text-white', className)} {...p} />
);
export const TabsContent = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn('mt-4 outline-none', className)} {...p} />
);

// ---- Tooltip
export const TooltipProvider = TooltipPrimitive.Provider;
export function Tip({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-[70] max-w-xs rounded-lg bg-navy-900 px-2.5 py-1.5 text-xs text-white shadow-lg">{label}</TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
