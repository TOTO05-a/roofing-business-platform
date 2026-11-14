/** Tipos de las respuestas de la API del CRM (`apps/api/src/routes`). Las fechas llegan en ISO. */

export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'APPOINTMENT_SET',
  'INSPECTED',
  'QUOTED',
  'WON',
  'LOST',
  'SPAM',
  'DUPLICATE',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const MANUAL_LEAD_SOURCES = ['PHONE', 'REFERRAL', 'DOOR_KNOCK', 'OTHER'] as const;
export const LEAD_SOURCES = ['WEB_FORM', ...MANUAL_LEAD_SOURCES] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface Lead {
  id: string;
  status: LeadStatus;
  source: LeadSource;
  sourceDetail: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  message: string | null;
  spamReason: string | null;
  assignedToId: string | null;
  customerId: string | null;
  propertyId: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredContact: 'EMAIL' | 'PHONE' | 'SMS' | null;
  marketingOptIn: boolean;
  createdAt: string;
}

export interface Property {
  id: string;
  customerId: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  yearBuilt: number | null;
  /** No llega al rol cliente. */
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  userId: string;
  isActive: boolean;
  phone: string | null;
  user: { name: string; email: string };
}

export const APPOINTMENT_TYPES = ['INSPECTION', 'FOLLOW_UP', 'ESTIMATE_PRESENTATION'] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];
export const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELED',
  'NO_SHOW',
  'RESCHEDULED',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface Appointment {
  id: string;
  propertyId: string;
  customerId: string;
  leadId: string | null;
  assigneeId: string;
  type: AppointmentType;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  /** No llegan al rol cliente. */
  cancelReason?: string | null;
  notes?: string | null;
  rescheduledFromId: string | null;
}

export const ROOF_TYPES = [
  'ASPHALT_SHINGLE',
  'METAL',
  'CLAY_TILE',
  'CONCRETE_TILE',
  'FLAT',
  'OTHER',
] as const;
export type RoofType = (typeof ROOF_TYPES)[number];

export interface InspectionSection {
  id: string;
  inspectionId: string;
  name: string;
  areaSqft: number;
  pitchRise: number;
  ridgeFt: number | null;
  eaveFt: number | null;
  hipFt: number | null;
  valleyFt: number | null;
  gutterFt: number | null;
  sortOrder: number;
  notes: string | null;
}

export interface InspectionPhoto {
  id: string;
  sectionId: string | null;
  fileId: string;
  caption: string | null;
  takenAt: string | null;
}

export interface Inspection {
  id: string;
  appointmentId: string;
  propertyId: string;
  inspectorId: string;
  status: 'DRAFT' | 'COMPLETED';
  completedAt: string | null;
  roofType: RoofType | null;
  roofAgeYears: number | null;
  findings: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionDetail extends Inspection {
  sections: InspectionSection[];
  photos: InspectionPhoto[];
}

export interface Page {
  page: number;
  pageSize: number;
  total: number;
}

export interface PresignedUpload {
  url: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
}
