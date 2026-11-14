-- Estado APPROVED de las versiones de presupuesto (aceptación simple de la demo, N17).
-- Va en su propia migración: un valor nuevo de un enum no se puede usar en la transacción que lo crea.
ALTER TYPE "QuoteStatus" ADD VALUE 'APPROVED';
