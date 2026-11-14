import type { RlsTx } from '../lib/rls.js';

/**
 * Proyectos de la demo (N17). Etapas fijas en código (plantilla de V1, modelo §2.7).
 * Los nombres se guardan en español porque son datos de la empresa ficticia.
 */
export const STAGE_TEMPLATE = [
  'Contrato y permisos',
  'Pedido de materiales',
  'Retiro del techo anterior',
  'Instalación del nuevo techo',
  'Limpieza e inspección final',
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEPOSIT_DUE_DAYS = 7;
const START_AFTER_DAYS = 14;
const DURATION_DAYS = 5;
const BALANCE_DUE_AFTER_END_DAYS = 10;

export interface ApprovedOption {
  id: string;
  title: string;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
}

/**
 * Crea el proyecto de una versión aceptada: etapas, y las facturas SIMULADAS de anticipo y saldo
 * (solo registros: no hay pasarela de pago). Se llama dentro de la transacción de la aceptación.
 */
export async function projectFromApproval(
  tx: RlsTx,
  input: {
    quoteId: string;
    versionId: string;
    customerId: string;
    propertyId: string;
    address: string;
    option: ApprovedOption;
    now: Date;
    startsAt?: Date;
  },
) {
  const { option, now } = input;
  const start = input.startsAt ?? new Date(now.getTime() + START_AFTER_DAYS * DAY_MS);
  const end = new Date(start.getTime() + DURATION_DAYS * DAY_MS);
  const project = await tx.project.create({
    data: {
      quoteId: input.quoteId,
      quoteVersionId: input.versionId,
      optionId: option.id,
      customerId: input.customerId,
      propertyId: input.propertyId,
      title: `${option.title} · ${input.address}`.slice(0, 200),
      scheduledStart: start,
      scheduledEnd: end,
      contractTotalCents: option.totalCents,
      acceptedAt: now,
    },
    select: { id: true, number: true },
  });
  await tx.projectStage.createMany({
    data: STAGE_TEMPLATE.map((name, index) => ({
      projectId: project.id,
      name,
      sortOrder: index + 1,
    })),
  });
  const invoices = [
    {
      kind: 'DEPOSIT' as const,
      totalCents: option.depositCents,
      dueAt: new Date(now.getTime() + DEPOSIT_DUE_DAYS * DAY_MS),
    },
    {
      kind: 'BALANCE' as const,
      totalCents: option.balanceCents,
      dueAt: new Date(end.getTime() + BALANCE_DUE_AFTER_END_DAYS * DAY_MS),
    },
  ].filter((invoice) => invoice.totalCents > 0);
  await tx.invoice.createMany({
    data: invoices.map((invoice) => ({
      ...invoice,
      projectId: project.id,
      customerId: input.customerId,
      issuedAt: now,
    })),
  });
  return project;
}
