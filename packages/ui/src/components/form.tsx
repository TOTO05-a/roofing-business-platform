import { AlertCircle, Check, ChevronDown } from 'lucide-react';
import { Checkbox as CheckboxPrimitive, Label as LabelPrimitive, Select as SelectPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn';

const fieldBase =
  'w-full rounded-md border border-border-strong bg-surface px-3.5 text-fg placeholder:text-fg-muted ' +
  'transition-[border-color,box-shadow] duration-[var(--duration-fast)] ' +
  'hover:border-fg focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-ring ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:border-2 disabled:cursor-not-allowed disabled:opacity-60';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(fieldBase, 'min-h-11 py-2', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldBase, 'min-h-28 py-2.5', className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('font-display text-sm leading-snug font-semibold text-fg', className)}
      {...props}
    />
  );
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'relative inline-flex size-6 shrink-0 items-center justify-center rounded-sm border-2 border-border-strong bg-surface text-primary-fg',
        'after:absolute after:-inset-2.5 after:content-[""]', // objetivo táctil de 44 px
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        'aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check aria-hidden="true" className="size-4" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  'aria-required': true | undefined;
}

export interface FormFieldProps {
  label: ReactNode;
  /** Mensaje de error ya traducido; si existe, el campo se marca como inválido. */
  error?: string | undefined;
  hint?: ReactNode;
  required?: boolean;
  /** Texto accesible para el asterisco de "obligatorio". */
  requiredLabel?: string;
  className?: string;
  /** Recibe los atributos de accesibilidad que hay que pasar al control. */
  children: (control: FieldControlProps) => ReactNode;
}

/** Etiqueta + control + pista + mensaje de error, correctamente asociados con ARIA. */
export function FormField({
  label,
  error,
  hint,
  required,
  requiredLabel,
  className,
  children,
}: FormFieldProps) {
  const uid = useId();
  const id = `field-${uid}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="ms-0.5 text-danger">
              *
            </span>
            {requiredLabel ? <span className="sr-only"> ({requiredLabel})</span> : null}
          </>
        )}
      </Label>
      {hint ? (
        <p id={hintId} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
      })}
      <p
        id={errorId}
        aria-live="polite"
        className={cn(
          'flex items-start gap-1.5 text-sm font-medium text-danger',
          !error && 'hidden',
        )}
      >
        {error ? (
          <>
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  id?: string | undefined;
  options: SelectOption[];
  value?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  name?: string | undefined;
  className?: string | undefined;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean | undefined;
  'aria-required'?: boolean | undefined;
}

export function Select({
  options,
  value,
  onValueChange,
  placeholder,
  disabled,
  name,
  className,
  id,
  ...aria
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      {...(value !== undefined ? { value } : {})}
      {...(onValueChange ? { onValueChange } : {})}
      {...(disabled !== undefined ? { disabled } : {})}
      {...(name ? { name } : {})}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          fieldBase,
          'inline-flex min-h-11 items-center justify-between gap-2 py-2 text-start data-[placeholder]:text-fg-muted',
          className,
        )}
        {...aria}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden="true" className="size-4 text-fg-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-surface text-fg shadow-lg"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex min-h-11 cursor-pointer items-center rounded-sm ps-9 pe-3 outline-none select-none data-[highlighted]:bg-surface-alt data-[state=checked]:font-semibold"
              >
                <SelectPrimitive.ItemIndicator className="absolute start-2.5">
                  <Check aria-hidden="true" className="size-4 text-primary" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
