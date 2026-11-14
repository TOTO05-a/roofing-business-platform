import type { QuotePdfData } from '../pdf/quote-pdf.js';
import { measurementsSnapshotSchema } from './quote-calc.js';

interface DecimalLike {
  toNumber(): number;
}

export interface PdfQuoteRow {
  number: string;
  customer: { firstName: string; lastName: string };
  property: {
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    zip: string;
  };
}

export interface PdfVersionRow {
  versionNumber: number;
  locale: string;
  taxBps: number;
  taxAppliesToLabor: boolean;
  discountBps: number;
  depositBps: number;
  notes: string | null;
  measurementsSnapshot: unknown;
  options: {
    title: string;
    tier: 'BASIC' | 'BETTER' | 'PREMIUM';
    warrantyText: string;
    warrantyYears: number;
    materialSubtotalCents: number;
    laborSubtotalCents: number;
    discountCents: number;
    taxCents: number;
    totalCents: number;
    depositCents: number;
    balanceCents: number;
    lines: {
      name: string;
      kind: 'MATERIAL' | 'LABOR';
      unit: string;
      quantity: DecimalLike;
      purchaseQuantity: DecimalLike;
      purchaseUnitName: string | null;
      colorName: string | null;
      lineTotalCents: number;
    }[];
  }[];
}

/** Datos del PDF a partir de las filas de la base (la misma función en la API y en el seed). */
export function toPdfData(
  quote: PdfQuoteRow,
  version: PdfVersionRow,
  sentAt: Date,
  validUntil: Date | null,
): QuotePdfData {
  const snapshot = measurementsSnapshotSchema.parse(version.measurementsSnapshot);
  const address = [quote.property.addressLine1, quote.property.addressLine2]
    .filter(Boolean)
    .join(', ');
  return {
    number: quote.number,
    versionNumber: version.versionNumber,
    locale: version.locale === 'en' ? 'en' : 'es',
    sentAt,
    validUntil,
    customerName: `${quote.customer.firstName} ${quote.customer.lastName}`,
    propertyAddress: `${address}, ${quote.property.city}, ${quote.property.state} ${quote.property.zip}`,
    roofSquares: snapshot.roof.squares,
    roofAreaSqFt: snapshot.roof.surfaceAreaSqFt,
    taxBps: version.taxBps,
    taxAppliesToLabor: version.taxAppliesToLabor,
    discountBps: version.discountBps,
    depositBps: version.depositBps,
    notes: version.notes,
    options: version.options.map((o) => ({
      ...o,
      lines: o.lines.map((l) => ({
        name: l.name,
        kind: l.kind,
        unit: l.unit,
        quantity: l.quantity.toNumber(),
        purchaseQuantity: l.purchaseQuantity.toNumber(),
        purchaseUnitName: l.purchaseUnitName,
        colorName: l.colorName,
        lineTotalCents: l.lineTotalCents,
      })),
    })),
  };
}
