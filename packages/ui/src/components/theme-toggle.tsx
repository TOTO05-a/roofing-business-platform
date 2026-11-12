import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '../hooks/use-theme';
import { cn } from '../lib/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './overlays';

export interface ThemeToggleProps {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
  labels: { label: string; light: string; dark: string; system: string };
  className?: string;
}

const icons = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeToggle({ value, onChange, labels, className }: ThemeToggleProps) {
  const Icon = icons[value];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${labels.label}: ${labels[value]}`}
        className={cn(
          'inline-flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface-alt',
          className,
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as ThemePreference)}
          aria-label={labels.label}
        >
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden="true" className="size-4" /> {labels.light}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden="true" className="size-4" /> {labels.dark}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden="true" className="size-4" /> {labels.system}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
