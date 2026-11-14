/** Utilidades de fechas de la agenda. Todo en hora local del navegador; la API recibe ISO con zona. */

export const GRID_START_HOUR = 7;
export const GRID_END_HOUR = 19;
export const SNAP_MINUTES = 15;
export const MAX_DURATION_MINUTES = 12 * 60;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    date.getHours(),
    date.getMinutes(),
  );
}

/** Lunes de la semana de `date`. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function snap(minutes: number, step = SNAP_MINUTES): number {
  return Math.round(minutes / step) * step;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` local, para `<input type="date">`. */
export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `HH:MM` local, para `<input type="time">`. */
export function toTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Une fecha y hora locales (`YYYY-MM-DD`, `HH:MM`) en un `Date`; `null` si no son válidas. */
export function fromInputs(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const result = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  return Number.isNaN(result.getTime()) ? null : result;
}

/** Valida el rango como la API: fin posterior al inicio y 12 horas como máximo. */
export function validRange(start: Date, end: Date): boolean {
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  return minutes > 0 && minutes <= MAX_DURATION_MINUTES;
}

export interface Positioned<T> {
  item: T;
  /** Minutos desde `GRID_START_HOUR`. */
  top: number;
  height: number;
  column: number;
  columns: number;
}

/** Coloca en columnas los bloques de un día que se solapan (citas de distintos empleados). */
export function layoutDay<T extends { startsAt: string; endsAt: string }>(
  items: T[],
): Positioned<T>[] {
  const base = GRID_START_HOUR * 60;
  const sorted = [...items].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const result: Positioned<T>[] = [];
  let group: Positioned<T>[] = [];
  let groupEnd = -Infinity;
  const flush = () => {
    const columns = Math.max(1, ...group.map((p) => p.column + 1));
    for (const p of group) p.columns = columns;
    result.push(...group);
    group = [];
  };
  for (const item of sorted) {
    const start = minutesOfDay(new Date(item.startsAt));
    const length = (new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60_000;
    const end = start + Math.max(SNAP_MINUTES, length);
    if (start >= groupEnd) flush();
    const taken = new Set(
      group.filter((p) => base + p.top + p.height > start).map((p) => p.column),
    );
    let column = 0;
    while (taken.has(column)) column += 1;
    group.push({ item, top: start - base, height: end - start, column, columns: 1 });
    groupEnd = Math.max(groupEnd, end);
  }
  flush();
  return result;
}
