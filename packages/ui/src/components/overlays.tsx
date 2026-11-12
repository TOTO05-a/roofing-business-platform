import { Check, Circle, X } from 'lucide-react';
import {
  Dialog as DialogPrimitive,
  DropdownMenu as MenuPrimitive,
  Tabs as TabsPrimitive,
  Tooltip as TooltipPrimitive,
} from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { Toaster as SonnerToaster, toast } from 'sonner';
import { cn } from '../lib/cn';

/* ---------- Dialog ---------- */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  /** Texto accesible del botón de cierre. */
  closeLabel: string;
  /** Variante lateral (drawer) para menús móviles. */
  side?: 'center' | 'start';
}
export function DialogContent({
  className,
  children,
  closeLabel,
  side = 'center',
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/60" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 bg-surface text-fg shadow-lg animate-fade-in focus:outline-none',
          side === 'center' &&
            'start-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border p-6 rtl:translate-x-1/2',
          side === 'start' && 'inset-y-0 start-0 w-[min(20rem,calc(100%-3rem))] overflow-y-auto',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute end-2 top-2 grid size-11 place-items-center rounded-md text-fg hover:bg-surface-alt"
        >
          <X aria-hidden="true" className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn('pe-10 font-display text-xl font-bold', className)} {...props} />
  );
}
export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('mt-1.5 text-fg-muted', className)} {...props} />;
}
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-6 flex flex-wrap justify-end gap-3', className)} {...props} />;
}

/* ---------- DropdownMenu ---------- */
export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

const menuItem =
  'relative flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-3 outline-none select-none data-[highlighted]:bg-surface-alt data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 animate-fade-in rounded-md border border-border bg-surface p-1 text-fg shadow-lg',
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.Item>) {
  return <MenuPrimitive.Item className={cn(menuItem, className)} {...props} />;
}
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label className={cn('px-3 py-2 text-sm font-semibold text-fg-muted', className)} {...props} />
  );
}
export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}
export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem className={cn(menuItem, 'ps-9', className)} {...props}>
      <span className="absolute start-3 grid size-4 place-items-center">
        <MenuPrimitive.ItemIndicator>
          <Circle aria-hidden="true" className="size-2.5 fill-current" />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}
export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem className={cn(menuItem, 'ps-9', className)} {...props}>
      <span className="absolute start-3 grid size-4 place-items-center">
        <MenuPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="size-4" />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

/* ---------- Tabs ---------- */
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex flex-wrap gap-1 rounded-lg bg-surface-alt p-1', className)}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-md px-4 font-display font-semibold text-fg-muted',
        'transition-colors duration-[var(--duration-fast)] hover:text-fg',
        'data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('mt-4 focus-visible:outline-offset-4', className)} {...props} />;
}

/* ---------- Tooltip ---------- */
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 animate-fade-in rounded-md bg-surface-brand px-3 py-1.5 text-sm font-medium text-on-brand shadow-md',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

/* ---------- Toast (sonner) ---------- */
export { toast };
export interface ToasterProps {
  theme?: 'light' | 'dark' | 'system';
  /** Nombre accesible de la región de notificaciones. */
  label: string;
  closeLabel?: string;
}
/**
 * Región de notificaciones. Sonner renderiza una región `aria-live="polite"`
 * donde se anuncian los mensajes nuevos.
 */
export function Toaster({ theme = 'system', label, closeLabel }: ToasterProps): ReactNode {
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      closeButton
      containerAriaLabel={label}
      {...(closeLabel ? { closeButtonAriaLabel: closeLabel } : {})}
      toastOptions={{
        classNames: {
          toast:
            '!rounded-md !border !border-border !bg-surface !text-fg !shadow-lg !font-body !text-base',
          title: '!font-display !font-semibold',
          description: '!text-fg-muted',
        },
      }}
    />
  );
}
