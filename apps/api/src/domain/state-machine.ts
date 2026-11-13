import { HttpError } from '../lib/http-error.js';

/** Tabla de transiciones válidas: estado actual -> estados a los que puede pasar. */
export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

/** Lanza 409 INVALID_TRANSITION si `from` -> `to` no está en la tabla. */
export function assertTransition<S extends string>(
  entity: string,
  map: TransitionMap<S>,
  from: S,
  to: S,
): void {
  if (!map[from].includes(to)) {
    throw new HttpError(
      409,
      'INVALID_TRANSITION',
      `No se puede pasar ${entity} de ${from} a ${to}`,
      { from, to, allowed: [...map[from]] },
    );
  }
}
