import { createRequire } from 'node:module';
import { createElement as h, type ReactElement } from 'react';
import {
  Document,
  Font,
  type DocumentProps,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';

/**
 * PDF de un presupuesto (decisión T30): `@react-pdf/renderer`, sin navegador. Marca provisional
 * «Cresta Roofing» (D1): pizarra #1E2A38 y cobre #B45309; Manrope (títulos) y Source Sans 3
 * (texto), incrustadas desde @fontsource (woff estático: react-pdf no lee woff2 ni variables).
 * Bilingüe es/en según el idioma de la versión.
 */

export type PdfLocale = 'es' | 'en';

export interface QuotePdfLine {
  name: string;
  kind: 'MATERIAL' | 'LABOR';
  unit: string;
  quantity: number;
  purchaseQuantity: number;
  purchaseUnitName: string | null;
  colorName: string | null;
  lineTotalCents: number;
}

export interface QuotePdfOption {
  title: string;
  tier: 'BASIC' | 'BETTER' | 'PREMIUM';
  warrantyText: string;
  warrantyYears: number;
  lines: QuotePdfLine[];
  materialSubtotalCents: number;
  laborSubtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
}

export interface QuotePdfData {
  number: string;
  versionNumber: number;
  locale: PdfLocale;
  sentAt: Date;
  validUntil: Date | null;
  customerName: string;
  propertyAddress: string;
  roofSquares: number;
  roofAreaSqFt: number;
  taxBps: number;
  taxAppliesToLabor: boolean;
  discountBps: number;
  depositBps: number;
  notes: string | null;
  options: QuotePdfOption[];
}

const SLATE = '#1E2A38';
const COPPER = '#B45309';
const GRAY = '#5B6573';
const LIGHT = '#F3F4F6';

const require = createRequire(import.meta.url);
const fontFile = (pkg: string, file: string) => require.resolve(`${pkg}/files/${file}`);

let fontsRegistered = false;
function registerFonts(): void {
  if (fontsRegistered) return;
  Font.register({
    family: 'Manrope',
    fonts: [
      { src: fontFile('@fontsource/manrope', 'manrope-latin-400-normal.woff'), fontWeight: 400 },
      { src: fontFile('@fontsource/manrope', 'manrope-latin-700-normal.woff'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'Source Sans 3',
    fonts: [
      {
        src: fontFile('@fontsource/source-sans-3', 'source-sans-3-latin-400-normal.woff'),
        fontWeight: 400,
      },
      {
        src: fontFile('@fontsource/source-sans-3', 'source-sans-3-latin-600-normal.woff'),
        fontWeight: 600,
      },
      {
        src: fontFile('@fontsource/source-sans-3', 'source-sans-3-latin-700-normal.woff'),
        fontWeight: 700,
      },
    ],
  });
  // Sin guiones automáticos en palabras partidas.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const TEXT = {
  es: {
    title: 'Presupuesto',
    version: 'Versión',
    customer: 'Cliente',
    property: 'Propiedad',
    date: 'Fecha',
    valid: 'Válido hasta',
    roof: 'Techo',
    roofValue: (sq: number, area: number) =>
      `${sq.toFixed(2)} squares (${Math.round(area).toLocaleString('en-US')} ft²)`,
    description: 'Concepto',
    quantity: 'Cantidad',
    amount: 'Importe',
    material: 'Materiales',
    labor: 'Mano de obra',
    discount: (bps: number) => `Descuento (${pct(bps)})`,
    tax: (bps: number, labor: boolean) =>
      `Impuesto (${pct(bps)} sobre ${labor ? 'materiales y mano de obra' : 'materiales'})`,
    total: 'Total',
    deposit: (bps: number) => `Anticipo (${pct(bps)})`,
    balance: 'Saldo al terminar',
    warranty: 'Garantía',
    years: 'años',
    notes: 'Notas',
    tier: { BASIC: 'Básico', BETTER: 'Mejor', PREMIUM: 'Premium' },
    unit: { SQUARE: 'square', LINEAR_FT: 'pie lineal', UNIT: 'unidad', BUNDLE: 'paquete' },
    demo: 'Documento de demostración: empresa, precios y datos ficticios. No es una oferta real.',
    page: 'Página',
  },
  en: {
    title: 'Quote',
    version: 'Version',
    customer: 'Customer',
    property: 'Property',
    date: 'Date',
    valid: 'Valid until',
    roof: 'Roof',
    roofValue: (sq: number, area: number) =>
      `${sq.toFixed(2)} squares (${Math.round(area).toLocaleString('en-US')} sq ft)`,
    description: 'Item',
    quantity: 'Quantity',
    amount: 'Amount',
    material: 'Materials',
    labor: 'Labor',
    discount: (bps: number) => `Discount (${pct(bps)})`,
    tax: (bps: number, labor: boolean) =>
      `Tax (${pct(bps)} on ${labor ? 'materials and labor' : 'materials'})`,
    total: 'Total',
    deposit: (bps: number) => `Deposit (${pct(bps)})`,
    balance: 'Balance due on completion',
    warranty: 'Warranty',
    years: 'years',
    notes: 'Notes',
    tier: { BASIC: 'Basic', BETTER: 'Better', PREMIUM: 'Premium' },
    unit: { SQUARE: 'square', LINEAR_FT: 'linear ft', UNIT: 'unit', BUNDLE: 'bundle' },
    demo: 'Demonstration document: fictional company, prices and data. Not a real offer.',
    page: 'Page',
  },
} as const;

function pct(bps: number): string {
  return `${(bps / 100)
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1')} %`;
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(date: Date, locale: PdfLocale): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    dateStyle: 'long',
    timeZone: 'America/New_York',
  }).format(date);
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Source Sans 3', fontSize: 10, color: SLATE, padding: 40, paddingBottom: 56 },
  band: { backgroundColor: SLATE, color: '#FFFFFF', padding: 16, marginBottom: 16 },
  brand: { fontFamily: 'Manrope', fontWeight: 700, fontSize: 18 },
  accent: { color: COPPER },
  docTitle: { fontFamily: 'Manrope', fontWeight: 700, fontSize: 13, marginTop: 4 },
  metaRow: { flexDirection: 'row', marginBottom: 12 },
  metaCell: { flex: 1, paddingRight: 8 },
  label: { fontSize: 8, color: GRAY, textTransform: 'uppercase', marginBottom: 2 },
  value: { fontSize: 10, fontWeight: 600 },
  optionHead: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  optionTitle: { fontFamily: 'Manrope', fontWeight: 700, fontSize: 12 },
  tier: { color: COPPER, fontWeight: 700, fontSize: 9 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: LIGHT,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginTop: 6,
    fontWeight: 700,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottom: `0.5pt solid ${LIGHT}`,
  },
  colName: { flex: 5 },
  colQty: { flex: 2, textAlign: 'right' },
  colAmt: { flex: 2, textAlign: 'right' },
  totals: { marginTop: 6, marginLeft: 'auto', width: '55%' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalStrong: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginTop: 2,
    borderTop: `1pt solid ${COPPER}`,
    fontWeight: 700,
    fontSize: 12,
  },
  small: { fontSize: 9, color: GRAY, marginTop: 6 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: GRAY,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

function option(data: QuotePdfData, opt: QuotePdfOption): ReactElement {
  const t = TEXT[data.locale];
  const quantity = (line: QuotePdfLine) => {
    const unit = t.unit[line.unit as keyof typeof t.unit] ?? line.unit;
    return line.purchaseUnitName
      ? `${line.purchaseQuantity} ${line.purchaseUnitName}`
      : `${line.quantity} ${unit}`;
  };
  const total = (label: string, cents: number, strong = false) =>
    h(
      View,
      { style: strong ? styles.totalStrong : styles.totalRow, key: label },
      h(Text, null, label),
      h(Text, null, formatMoney(cents)),
    );
  return h(
    View,
    { key: `${opt.title}-${opt.tier}`, wrap: false },
    h(
      View,
      { style: styles.optionHead },
      h(Text, { style: styles.optionTitle }, opt.title),
      h(Text, { style: styles.tier }, t.tier[opt.tier].toUpperCase()),
    ),
    h(
      Text,
      { style: styles.small },
      `${t.warranty}: ${opt.warrantyText} (${opt.warrantyYears} ${t.years})`,
    ),
    h(
      View,
      { style: styles.tableHead },
      h(Text, { style: styles.colName }, t.description),
      h(Text, { style: styles.colQty }, t.quantity),
      h(Text, { style: styles.colAmt }, t.amount),
    ),
    ...opt.lines.map((line, index) =>
      h(
        View,
        { style: styles.row, key: index },
        h(
          Text,
          { style: styles.colName },
          line.colorName ? `${line.name} · ${line.colorName}` : line.name,
        ),
        h(Text, { style: styles.colQty }, quantity(line)),
        h(Text, { style: styles.colAmt }, formatMoney(line.lineTotalCents)),
      ),
    ),
    h(
      View,
      { style: styles.totals },
      total(t.material, opt.materialSubtotalCents),
      total(t.labor, opt.laborSubtotalCents),
      ...(opt.discountCents > 0 ? [total(t.discount(data.discountBps), -opt.discountCents)] : []),
      total(t.tax(data.taxBps, data.taxAppliesToLabor), opt.taxCents),
      total(t.total, opt.totalCents, true),
      total(t.deposit(data.depositBps), opt.depositCents),
      total(t.balance, opt.balanceCents),
    ),
  );
}

export function buildQuoteDocument(data: QuotePdfData): ReactElement<DocumentProps> {
  registerFonts();
  const t = TEXT[data.locale];
  const meta = (label: string, value: string) =>
    h(
      View,
      { style: styles.metaCell, key: label },
      h(Text, { style: styles.label }, label),
      h(Text, { style: styles.value }, value),
    );
  return h(
    Document,
    { title: `${t.title} ${data.number}`, author: 'Cresta Roofing (demo)', language: data.locale },
    h(
      Page,
      { size: 'LETTER', style: styles.page },
      h(
        View,
        { style: styles.band },
        h(Text, { style: styles.brand }, 'Cresta ', h(Text, { style: styles.accent }, 'Roofing')),
        h(
          Text,
          { style: styles.docTitle },
          `${t.title} ${data.number} · ${t.version} ${data.versionNumber}`,
        ),
      ),
      h(
        View,
        { style: styles.metaRow },
        meta(t.customer, data.customerName),
        meta(t.property, data.propertyAddress),
      ),
      h(
        View,
        { style: styles.metaRow },
        meta(t.date, formatDate(data.sentAt, data.locale)),
        meta(t.valid, data.validUntil ? formatDate(data.validUntil, data.locale) : '—'),
        meta(t.roof, t.roofValue(data.roofSquares, data.roofAreaSqFt)),
      ),
      ...data.options.map((opt) => option(data, opt)),
      ...(data.notes
        ? [h(Text, { style: styles.small, key: 'notes' }, `${t.notes}: ${data.notes}`)]
        : []),
      h(
        View,
        { style: styles.footer, fixed: true },
        h(Text, null, t.demo),
        h(Text, {
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `${t.page} ${pageNumber}/${totalPages}`,
        }),
      ),
    ),
  );
}

/** Renderiza el PDF a bytes. Sin fechas variables dentro del archivo salvo las de los datos. */
export async function renderQuotePdf(data: QuotePdfData): Promise<Uint8Array> {
  return renderToBuffer(buildQuoteDocument(data));
}
