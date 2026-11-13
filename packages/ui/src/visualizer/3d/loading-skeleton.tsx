/**
 * Esqueleto de carga del lienzo 3D: sin animación con "reducir movimiento" y con porcentaje
 * accesible (`role="progressbar"`). Sin `progress`, la barra es indeterminada.
 */
export function LoadingSkeleton({
  label,
  progress,
}: {
  label: string;
  progress?: number | undefined;
}) {
  const pct = progress === undefined ? undefined : Math.round(progress);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={pct === undefined ? label : `${label} ${pct} %`}
      className="absolute inset-0 grid place-items-center bg-surface-alt"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-pulse bg-gradient-to-b from-border/40 to-border/10 motion-reduce:animate-none"
      />
      <div className="relative grid w-3/4 max-w-xs justify-items-center gap-3 text-center">
        <div className="h-2 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-[var(--duration-base)] motion-reduce:transition-none"
            style={{ width: `${pct ?? 15}%` }}
          />
        </div>
        <p className="text-sm font-semibold text-fg">
          {label}
          {pct === undefined ? '' : ` ${pct} %`}
        </p>
      </div>
    </div>
  );
}
