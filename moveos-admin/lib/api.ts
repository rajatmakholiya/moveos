export type ApiError = { message: string; status?: number; code?: string; details?: unknown };

type ApiSuccessEnvelope = { ok: true; data: unknown };
type RefreshHandler = () => Promise<string | null>;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token');
}

function authHeaders(token?: string | null): Record<string, string> {
  const t = token ?? getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

let refreshHandler: RefreshHandler | null = null;
let isRefreshing = false;

export function setRefreshHandler(handler: RefreshHandler | null) {
  refreshHandler = handler;
}

// Handles three legacy error shapes so no UI ever shows [object Object]:
//   1. string  → pass through
//   2. array   → join with ", "
//   3. object  → extract nested .message (string or array) or fall back
function normalizeApiMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object' && value !== null) {
    const rec = value as Record<string, unknown>;
    if (typeof rec.message === 'string' && rec.message.trim()) return rec.message;
    if (Array.isArray(rec.message)) return rec.message.map(String).join(', ');
  }
  return fallback;
}

function toApiError(json: Record<string, unknown>, httpStatus: number): ApiError {
  return {
    message: normalizeApiMessage(json.message, `HTTP ${httpStatus}`),
    status: typeof json.statusCode === 'number' ? json.statusCode : httpStatus,
    code: (json.errorCode ?? json.error_code ?? json.error) as string | undefined,
    details: json.details ?? json,
  };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
  _hasRefreshed = false,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    if (res.status === 401) {
      if (!_hasRefreshed && !isRefreshing && refreshHandler) {
        isRefreshing = true;
        const newToken = await refreshHandler();
        isRefreshing = false;
        if (newToken) {
          return request<T>(method, path, body, newToken, true);
        }
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('admin:session-expired'));
      }
    }
    throw toApiError(json, res.status);
  }

  if (isApiSuccessEnvelope(json)) {
    return { status: 'ok', data: json.data } as T;
  }

  return json as T;
}

function isApiSuccessEnvelope(value: unknown): value is ApiSuccessEnvelope {
  return typeof value === 'object' && value !== null && (value as ApiSuccessEnvelope).ok === true && 'data' in value;
}

export const api = {
  get: <T>(path: string, token?: string | null) => request<T>('GET', path, undefined, token),
  post: <T>(path: string, body: unknown, token?: string | null) => request<T>('POST', path, body, token),
  patch: <T>(path: string, body: unknown, token?: string | null) => request<T>('PATCH', path, body, token),
  del: <T>(path: string, body?: unknown, token?: string | null) => request<T>('DELETE', path, body, token),
};

export async function uploadFile<T>(path: string, file: File, token?: string | null): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw toApiError(json, res.status);
  if (isApiSuccessEnvelope(json)) return { status: 'ok', data: json.data } as T;
  return json as T;
}

// ─── Typed org API calls ─────────────────────────────────────────────────────

export type OrgStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
export type OrgPlanTier = 'SOLO' | 'GROWTH' | 'ENTERPRISE';
export type DocStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type VehicleStatus = 'INACTIVE' | 'ACTIVE' | 'OUT_OF_SERVICE';
export type DriverStatus = 'OFFLINE' | 'ONLINE' | 'BUSY';
export type KycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type VehicleDocumentStatus = 'MISSING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type ComplianceStatus = 'CLEAR' | 'BLOCKED';
export type AssignmentStatus = 'PENDING_COMPLIANCE' | 'ACTIVE' | 'SUSPENDED' | 'ENDED';
export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
export type TripStatus = 'DRAFT' | 'OPEN' | 'DEPARTED' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'INITIATED' | 'AUTHORIZED' | 'SETTLED' | 'FAILED' | 'PENDING' | 'PAID' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'CARD' | 'WALLET' | 'UPI';
export type SeatType = 'FRONT' | 'BACK';
export type OrgDriverStatus =
  | 'INVITED'
  | 'PENDING_DRIVER_ACCEPTANCE'
  | 'PENDING_COMPLIANCE'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REMOVED';
export type VehicleOwnershipType = 'INDIVIDUAL' | 'ORGANIZATION' | 'LEASED' | 'THIRD_PARTY';
export type KycDocumentType =
  | 'GST_CERTIFICATE' | 'PAN_CARD' | 'AADHAAR' | 'TRADE_LICENSE'
  | 'VEHICLE_REGISTRATION' | 'VEHICLE_INSURANCE' | 'POLLUTION_CERTIFICATE'
  | 'DRIVING_LICENSE' | 'BANK_ACCOUNT' | 'CANCELLED_CHEQUE'
  | 'INCORPORATION_CERTIFICATE' | 'OTHER';

export interface Organization {
  id: string;
  legalName: string;
  tradeName?: string;
  status: OrgStatus;
  planTier: OrgPlanTier;
  gstin?: string;
  pan?: string;
  taxId?: string;
  registrationNo?: string;
  primaryPhone?: string;
  primaryEmail?: string;
  addressJson?: Record<string, unknown>;
  operatingRegions?: unknown[];
  rejectionReason?: string;
  reviewedAt?: string;
  reviewedById?: string;
  createdAt: string;
  updatedAt: string;
  _count?: { drivers: number; vehicles: number; documents: number };
  members?: OrgMember[];
  drivers?: OrgDriverLink[];
  vehicles?: OrgVehicleLink[];
  documents?: OrgDocument[];
  auditEvents?: AuditEvent[];
}

export interface OrgMember {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface OrgDriverLink {
  id: string;
  organizationId?: string;
  driverId: string;
  status: OrgDriverStatus;
  acceptedAt?: string;
  startedAt?: string;
  endedAt?: string;
  metadataJson?: Record<string, unknown>;
  driver?: DriverProfile;
}

export interface UserProfile {
  id?: string;
  phone: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  createdAt?: string;
}

export interface DriverDocument {
  id: string;
  driverId?: string;
  type: string;
  url: string;
  status: DocStatus;
  documentNo?: string;
  expiresAt?: string;
  createdAt?: string;
}

export interface VehicleDocument {
  id: string;
  vehicleId?: string;
  type: string;
  url: string;
  status: DocStatus;
  documentNo?: string;
  expiresAt?: string;
  createdAt?: string;
}

export interface DriverVehicleAssignment {
  id: string;
  driverId: string;
  vehicleId: string;
  organizationId?: string | null;
  assignedByUserId?: string | null;
  status: AssignmentStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  source?: string | null;
  policyJson?: Record<string, unknown> | null;
  active: boolean;
  driver?: DriverProfile;
  vehicle?: VehicleProfile;
}

export interface DriverProfile {
  id: string;
  userId?: string;
  name: string;
  rating?: number | null;
  kycStatus: KycStatus;
  complianceStatus: ComplianceStatus;
  status: DriverStatus;
  user: UserProfile;
  documents?: DriverDocument[];
  vehicles?: DriverVehicleAssignment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface VehicleProfile {
  id: string;
  plate: string;
  type: string;
  vehicleNumber?: string | null;
  vehicleType?: string | null;
  fuelType?: string | null;
  make?: string | null;
  model?: string | null;
  variant?: string | null;
  manufacturingYear?: number | null;
  registrationDate?: string | null;
  registrationState?: string | null;
  chassisNumber?: string | null;
  engineNumber?: string | null;
  color?: string | null;
  totalSeats?: number | null;
  frontSeats?: number | null;
  backSeats?: number | null;
  luggageCapacityKg?: number | null;
  ownerDriverId?: string | null;
  ownershipType: VehicleOwnershipType;
  ownerName?: string | null;
  ownerPhone?: string | null;
  ownerAddress?: string | null;
  commercialPermitNumber?: string | null;
  permitValidFrom?: string | null;
  permitValidTill?: string | null;
  fitnessCertificateNumber?: string | null;
  fitnessValidTill?: string | null;
  pollutionCertificateNumber?: string | null;
  pollutionValidTill?: string | null;
  insurancePolicyNumber?: string | null;
  insuranceValidTill?: string | null;
  status: VehicleStatus;
  documentStatus?: VehicleDocumentStatus;
  kycStatus?: KycStatus;
  complianceStatus: ComplianceStatus;
  documents?: VehicleDocument[];
  assignments?: DriverVehicleAssignment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface OrgVehicleLink {
  id: string;
  organizationId?: string;
  vehicleId: string;
  status: string;
  ownershipType?: VehicleOwnershipType;
  startedAt?: string;
  endedAt?: string;
  metadataJson?: Record<string, unknown>;
  vehicle?: VehicleProfile;
}

export interface AdminVehicleRow {
  id: string;
  organizationId: string;
  vehicleId: string;
  vehicleNumber: string;
  type: string;
  capacity?: number | string | null;
  ownerOrganization?: { id: string; name: string } | null;
  assignedDriver?: {
    id: string;
    name?: string | null;
    phone?: string | null;
    assignmentId: string;
    assignmentStatus: AssignmentStatus;
  } | null;
  documentStatus: VehicleDocumentStatus;
  kycStatus: KycStatus;
  status: VehicleStatus;
  complianceStatus: ComplianceStatus;
  ownershipType?: VehicleOwnershipType;
  frontSeats?: number | null;
  backSeats?: number | null;
  luggageCapacityKg?: number | null;
  createdAt?: string;
  organizationLinkCreatedAt?: string;
  vehicle?: VehicleProfile;
  documents?: VehicleDocument[];
  kycRecords?: KycRecord[];
}

export interface OrgDocument {
  id: string;
  type: string;
  url: string;
  documentNo?: string;
  status: DocStatus;
  expiresAt?: string;
  reviewedAt?: string;
  rejectionNote?: string;
  createdAt?: string;
}

export interface KycRecord {
  id: string;
  entityType: string;
  entityId: string;
  documentType: KycDocumentType;
  documentUrl: string;
  documentNo?: string;
  status: DocStatus;
  expiresAt?: string;
  reviewedAt?: string;
  reviewedById?: string;
  rejectionReason?: string;
  metadataJson?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  reason?: string;
  createdAt: string;
}

export interface OrgInvitation {
  id: string;
  phone: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface RouteRecord {
  id: string;
  name: string;
  originLabel: string;
  destinationLabel: string;
  distanceKm: number;
  estimatedHours: number;
  baseFrontPrice: number;
  baseBackPrice: number;
  fromCity?: string;
  toCity?: string;
  routeName?: string;
  baseFarePaise?: number;
  estimatedDurationMinutes?: number;
  status?: 'ACTIVE' | 'INACTIVE';
  metadataJson?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export type AdminRoute = Required<Pick<RouteRecord, 'id' | 'distanceKm'>> & {
  fromCity: string;
  toCity: string;
  routeName: string;
  baseFarePaise: number;
  estimatedDurationMinutes: number;
  status: 'ACTIVE' | 'INACTIVE';
  metadataJson?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type FileUploadResult = {
  fileUuid: string;
  bucket: string;
  objectKey: string;
  uploadUrl: string;
  fileUrl: string;
  expiresInSeconds: number;
  mimeType?: string;
};

export const fileApi = {
  upload: (scope: 'driver' | 'vehicle' | 'organization', ownerId: string, documentType: string, file: File) =>
    uploadFile<{ status: string; data: { upload: FileUploadResult } }>(
      `/files/upload/${scope}/${encodeURIComponent(ownerId)}/${encodeURIComponent(documentType)}`,
      file,
    ),
};

export type AdminRoutePayload = {
  fromCity: string;
  toCity: string;
  routeName: string;
  distanceKm: number;
  baseFarePaise: number;
  estimatedDurationMinutes: number;
  metadataJson?: Record<string, unknown> | null;
};

export type GeoPlace = {
  id: string;
  label: string;
  address: string;
  city: string;
  lat?: number;
  lng?: number;
  placeId?: string;
};

async function locationRequest<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw toApiError(json, res.status);
  return isApiSuccessEnvelope(json) ? json.data as T : json as T;
}

export const locationApi = {
  async searchPlaces(query: string) {
    const fallback = await locationRequest<{ places: GeoPlace[] }>(`/geo/search?q=${encodeURIComponent(query)}`);
    return fallback.places ?? [];
  },

  async resolvePlace(place: GeoPlace) {
    if (typeof place.lat === 'number' && typeof place.lng === 'number') return place;
    const query = [place.label, place.address, place.city].filter(Boolean).join(', ');
    const results = await this.searchPlaces(query);
    return { ...place, ...results[0] };
  },

  // Ola Maps route optimizer (via gateway). Returns the raw OSRM-style response
  // ({ waypoints: [{ waypoint_index }], trips }); caller derives the optimized order.
  optimizeRoute: (
    locations: Array<{ lat: number; lng: number }>,
    opts?: { source?: 'first' | 'any'; destination?: 'last' | 'any' },
  ) =>
    api.post<any>('/location/route-optimizer', {
      locations,
      source: opts?.source ?? 'first',
      destination: opts?.destination ?? 'any',
      roundTrip: false,
      mode: 'driving',
      steps: false,
      overview: 'simplified',
      language: 'en',
    }),
};

export const routeApi = {
  list: () => api.get<{ status: string; data: { routes: AdminRoute[] } }>('/admin/routes'),
  create: (body: AdminRoutePayload) => api.post<{ status: string; data: { route: AdminRoute } }>('/admin/routes', body),
  update: (id: string, body: Partial<AdminRoutePayload>) => api.patch<{ status: string; data: { route: AdminRoute } }>(`/admin/routes/${id}`, body),
  updateStatus: (id: string, status: AdminRoute['status']) => api.patch<{ status: string; data: { route: AdminRoute } }>(`/admin/routes/${id}/status`, { status }),
};

export type VehiclePayload = {
  vehicleNumber: string;
  vehicleType: string;
  fuelType?: string;
  make?: string;
  model?: string;
  variant?: string;
  manufacturingYear?: number;
  registrationDate?: string;
  registrationState?: string;
  chassisNumber?: string;
  engineNumber?: string;
  color?: string;
  totalSeats: number;
  frontSeats: number;
  backSeats: number;
  luggageCapacityKg?: number;
  ownershipType?: VehicleOwnershipType;
  ownerName?: string;
  ownerPhone?: string;
  ownerAddress?: string;
  commercialPermitNumber?: string;
  permitValidFrom?: string;
  permitValidTill?: string;
  fitnessCertificateNumber?: string;
  fitnessValidTill?: string;
  pollutionCertificateNumber?: string;
  pollutionValidTill?: string;
  insurancePolicyNumber?: string;
  insuranceValidTill?: string;
};

export type VehicleDocumentPayload = {
  type: string;
  url?: string;
  fileUuid?: string;
  documentNo?: string;
  expiresAt?: string;
  metadataJson?: Record<string, unknown>;
};

export const vehiclesApi = {
  listOrgVehicles: () =>
    api.get<{ status: string; data: { vehicles: OrgVehicleLink[] } }>('/organizations/me/vehicles'),

  getOrgVehicle: (vehicleId: string) =>
    api.get<{ status: string; data: { ownership: OrgVehicleLink; kycRecords: KycRecord[] } }>(`/organizations/me/vehicles/${vehicleId}`),

  createOrgVehicle: (body: VehiclePayload) =>
    api.post<{ status: string; data: { vehicle: VehicleProfile; ownership: OrgVehicleLink } }>('/organizations/me/vehicles', body),

  updateOrgVehicle: (vehicleId: string, body: Partial<VehiclePayload>) =>
    api.patch<{ status: string; data: { vehicle: VehicleProfile } }>(`/organizations/me/vehicles/${vehicleId}`, body),

  uploadVehicleDocument: (vehicleId: string, body: VehicleDocumentPayload) =>
    api.post<{ status: string; data: { document: VehicleDocument } }>(`/organizations/me/vehicles/${vehicleId}/documents`, body),

  submitVehicleKyc: (vehicleId: string, body: { metadataJson?: Record<string, unknown> } = {}) =>
    api.post<{ status: string; data: { kycRecord: KycRecord } }>(`/organizations/me/vehicles/${vehicleId}/kyc/submit`, body),

  assignVehicleDriver: (vehicleId: string, body: { driverId: string }) =>
    api.post<{ status: string; data: { assignment: DriverVehicleAssignment } }>(`/organizations/me/vehicles/${vehicleId}/assign-driver`, body),
};

export const adminVehiclesApi = {
  list: (params?: { organizationId?: string; status?: VehicleStatus; documentStatus?: DocStatus | 'MISSING'; type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.organizationId) qs.set('organizationId', params.organizationId);
    if (params?.status) qs.set('status', params.status);
    if (params?.documentStatus) qs.set('documentStatus', params.documentStatus);
    if (params?.type) qs.set('type', params.type);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return api.get<{ status: string; data: { vehicles: AdminVehicleRow[] } }>(`/admin/vehicles${suffix}`);
  },
  get: (vehicleId: string, organizationId?: string) => {
    const suffix = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    return api.get<{ status: string; data: { vehicle: AdminVehicleRow; ownership: OrgVehicleLink; kycRecords: KycRecord[] } }>(`/admin/vehicles/${vehicleId}${suffix}`);
  },
  reviewKyc: (vehicleId: string, body: { status: DocStatus; rejectionReason?: string }) =>
    api.patch<{ status: string; data: { vehicle: VehicleProfile; kycRecord: KycRecord } }>(`/admin/vehicles/${vehicleId}/kyc/review`, body),
};

export const adminVehicleApi = adminVehiclesApi;

export interface ScheduledTrip {
  id: string;
  routeId: string;
  driverId: string;
  vehicleId?: string;
  departureAt: string;
  frontSeatsTotal: number;
  backSeatsTotal: number;
  frontSeatsBooked: number;
  backSeatsBooked: number;
  status: string;
  departurePoint: string;
  route?: RouteRecord;
  driver?: { id: string; name: string; user?: { phone: string; name?: string } };
  vehicle?: { id: string; plate: string; type: string; status: string };
  bookings?: SeatBooking[];
}

export interface SeatBooking {
  id: string;
  tripId?: string;
  passengerId?: string | null;
  passengerName: string;
  passengerPhone: string;
  seatType: SeatType;
  baseFare?: number;
  totalFare: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: BookingStatus;
  emergencyContact?: string | null;
  createdAt: string;
  trip?: ScheduledTrip;
}

// ─── Org API helpers ──────────────────────────────────────────────────────────

export const orgApi = {
  list: (params?: { status?: OrgStatus }) => {
    const qs = params?.status ? `?status=${params.status}` : '';
    return api.get<{ status: string; data: { organizations: Organization[] } }>(`/admin/organizations${qs}`);
  },

  create: (body: {
    legalName: string;
    tradeName?: string;
    ownerPhone: string;
    ownerEmail?: string;
    ownerName?: string;
    gstin?: string;
    pan?: string;
    taxId?: string;
    registrationNo?: string;
    planTier?: OrgPlanTier;
  }) => api.post<{ status: string; data: { organization: Organization } }>('/admin/organizations', body),

  get: (id: string) =>
    api.get<{ status: string; data: { organization: Organization; kycRecords: KycRecord[] } }>(`/admin/organizations/${id}`),

  myOrganizations: () =>
    api.get<{ status: string; data: { organizations: Organization[]; memberships: OrgMember[] } }>('/organizations/me'),

  getScoped: (id: string) =>
    api.get<{ status: string; data: { organization: Organization } }>(`/organizations/${id}`),

  listMembers: (orgId: string) =>
    api.get<{ status: string; data: { members: OrgMember[]; users: Array<{ id: string; phone: string; name?: string; email?: string; role: string }> } }>(`/organizations/${orgId}/members`),

  listDrivers: (orgId: string) =>
    api.get<{ status: string; data: { links: OrgDriverLink[]; driverKyc: KycRecord[] } }>(`/organizations/${orgId}/drivers`),

  getDriver: (orgId: string, driverId: string) =>
    api.get<{ status: string; data: { link: OrgDriverLink; kycRecords: KycRecord[] } }>(`/organizations/${orgId}/drivers/${driverId}`),

  createDriver: (orgId: string, body: { phone: string; name: string; email?: string }) =>
    api.post<{ status: string; data: { driver: { id: string; name: string }; link: OrgDriverLink } }>(`/organizations/${orgId}/drivers`, body),

  updateDriver: (orgId: string, driverId: string, body: Partial<Pick<DriverProfile, 'name' | 'status' | 'kycStatus' | 'complianceStatus'>> & { email?: string }) =>
    api.patch<{ status: string; data: { driver: DriverProfile } }>(`/organizations/${orgId}/drivers/${driverId}`, body),

  createDriverDocument: (orgId: string, driverId: string, body: { type: string; url?: string; expiresAt?: string }) =>
    api.post<{ status: string; data: { document: DriverDocument } }>(`/organizations/${orgId}/drivers/${driverId}/documents`, body),

  submitDriverKyc: (orgId: string, driverId: string, body: { documentType: KycDocumentType; documentUrl: string; documentNo?: string; expiresAt?: string }) =>
    api.post<{ status: string; data: { kycRecord: KycRecord } }>(`/organizations/${orgId}/drivers/${driverId}/kyc`, body),

  listVehicles: (orgId: string) =>
    api.get<{ status: string; data: { vehicles: OrgVehicleLink[] } }>(`/organizations/${orgId}/vehicles`),

  getVehicle: (orgId: string, vehicleId: string) =>
    api.get<{ status: string; data: { ownership: OrgVehicleLink; kycRecords: KycRecord[] } }>(`/organizations/${orgId}/vehicles/${vehicleId}`),

  createVehicle: (orgId: string, body: { plate: string; type: string; ownershipType?: VehicleOwnershipType }) =>
    api.post<{ status: string; data: { vehicle: { id: string; plate: string; type: string }; ownership: OrgVehicleLink } }>(`/organizations/${orgId}/vehicles`, body),

  updateVehicle: (orgId: string, vehicleId: string, body: Partial<Pick<VehicleProfile, 'plate' | 'type' | 'ownershipType' | 'status' | 'complianceStatus'>>) =>
    api.patch<{ status: string; data: { vehicle: VehicleProfile } }>(`/organizations/${orgId}/vehicles/${vehicleId}`, body),

  createVehicleDocument: (orgId: string, vehicleId: string, body: { type: string; url?: string; expiresAt?: string }) =>
    api.post<{ status: string; data: { document: VehicleDocument } }>(`/organizations/${orgId}/vehicles/${vehicleId}/documents`, body),

  submitVehicleKyc: (orgId: string, vehicleId: string, body: { documentType: KycDocumentType; documentUrl: string; documentNo?: string; expiresAt?: string }) =>
    api.post<{ status: string; data: { kycRecord: KycRecord } }>(`/organizations/${orgId}/vehicles/${vehicleId}/kyc`, body),

  listKyc: (orgId: string) =>
    api.get<{ status: string; data: { kycRecords: KycRecord[] } }>(`/organizations/${orgId}/kyc`),

  listRoutes: (orgId: string) =>
    api.get<{ status: string; data: { routes: RouteRecord[] } }>(`/organizations/${orgId}/routes`),

  listScheduledTrips: (orgId: string) =>
    api.get<{ status: string; data: { trips: ScheduledTrip[] } }>(`/organizations/${orgId}/scheduled-trips`),

  createScheduledTrip: (orgId: string, body: {
    routeId: string;
    driverId: string;
    vehicleId: string;
    departureAt: string;
    departurePoint: string;
    frontSeatsTotal?: number;
    backSeatsTotal?: number;
    luggagePolicy?: string;
    notes?: string;
  }) => api.post<{ status: string; data: { trip: ScheduledTrip } }>(`/organizations/${orgId}/scheduled-trips`, body),

  createAssignment: (orgId: string, body: { driverId: string; vehicleId: string; policy?: string; startsAt?: string; endsAt?: string }) =>
    api.post<{ status: string; data: { assignment: DriverVehicleAssignment } }>(`/organizations/${orgId}/assignments`, body),

  updateAssignment: (orgId: string, assignmentId: string, body: { status: AssignmentStatus; reason?: string }) =>
    api.patch<{ status: string; data: { assignment: DriverVehicleAssignment } }>(`/organizations/${orgId}/assignments/${assignmentId}`, body),

  listBookings: (orgId: string) =>
    api.get<{ status: string; data: { trips: ScheduledTrip[]; bookings: SeatBooking[] } }>(`/organizations/${orgId}/bookings`),

  listClusters: (orgId: string) =>
    api.get<{ status: string; data: { clusters: Array<{ id: string; name: string; status: string }> } }>(`/organizations/${orgId}/clusters`),

  listChallans: (orgId: string) =>
    api.get<{ status: string; data: { challans: Array<{ id: string; vehicleId?: string; status: string; amount?: number }> } }>(`/organizations/${orgId}/challans`),

  liveTracking: (orgId: string) =>
    api.get<{ status: string; data: { drivers: Array<{ driverId: string; name: string; phone: string; status: string; activeVehicle?: any; lastLocation?: any }> } }>(`/organizations/${orgId}/live-tracking`),

  documentCenter: (orgId: string) =>
    api.get<{
      status: string;
      data: {
        organizationDocuments: OrgDocument[];
        driverDocuments: DriverDocument[];
        vehicleDocuments: VehicleDocument[];
        kycRecords: KycRecord[];
      };
    }>(`/organizations/${orgId}/documents`),

  submitKyc: (orgId: string, body: { documentType: KycDocumentType; documentUrl: string; documentNo?: string; expiresAt?: string }) =>
    api.post<{ status: string; data: { kycRecord: KycRecord } }>(`/organizations/${orgId}/kyc`, body),

  updateDetails: (orgId: string, body: Partial<Pick<Organization, 'legalName' | 'tradeName' | 'gstin' | 'pan' | 'taxId' | 'registrationNo' | 'primaryPhone' | 'primaryEmail' | 'addressJson' | 'operatingRegions' | 'planTier'>>) =>
    api.patch<{ status: string; data: { organization: Organization } }>(`/organizations/${orgId}`, body),

  updateStatus: (id: string, body: { status: OrgStatus; reason?: string }) =>
    api.patch<{ status: string; data: { organization: Organization } }>(`/admin/organizations/${id}/status`, body),

  reviewDocument: (orgId: string, docId: string, body: { status: DocStatus; rejectionNote?: string }) =>
    api.patch(`/admin/organizations/${orgId}/documents/${docId}/review`, body),

  reviewVehicleDocument: (docId: string, body: { status: DocStatus; rejectionNote?: string }) =>
    api.patch(`/admin/vehicle-documents/${docId}/review`, body),

  reviewDriverDocument: (docId: string, body: { status: DocStatus; rejectionNote?: string }) =>
    api.patch(`/admin/driver-documents/${docId}/review`, body),

  updateVehicleDocument: (docId: string, body: { documentNo?: string; expiresAt?: string; url?: string }) =>
    api.patch(`/organizations/me/vehicle-documents/${docId}`, body),

  updateDriverDocument: (docId: string, body: { documentNo?: string; expiresAt?: string; url?: string }) =>
    api.patch(`/organizations/me/driver-documents/${docId}`, body),

  reviewKyc: (kycId: string, body: { status: DocStatus; rejectionReason?: string }) =>
    api.patch(`/admin/kyc/${kycId}/review`, body),

  reviewDriverCompliance: (orgId: string, driverId: string, body: { status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED'; reason?: string }) =>
    api.patch(`/admin/organizations/${orgId}/drivers/${driverId}/compliance`, body),

  listInvitations: (orgId: string) =>
    api.get<{ status: string; data: { invitations: OrgInvitation[] } }>(`/organizations/${orgId}/invitations`),

  createInvitation: (orgId: string, body: { phone: string; role?: string }) =>
    api.post<{ status: string; data: { invitation: OrgInvitation; inviteToken: string } }>(`/organizations/${orgId}/invitations`, body),

  refreshInviteLink: (orgId: string, invitationId: string) =>
    api.post<{ status: string; data: { inviteToken: string; inviteUrl: string; expiresAt: string } }>(`/organizations/${orgId}/invitations/${invitationId}/refresh-link`, {}),

  auditLog: (orgId: string) =>
    api.get<{ status: string; data: { events: AuditEvent[] } }>(`/organizations/${orgId}/audit-log`),
};

// ─── Admin driver types and API ───────────────────────────────────────────────

export interface AdminDriverOrgLink {
  id: string;
  organizationId: string;
  status: OrgDriverStatus;
  organization: { id: string; legalName: string; tradeName?: string; status: string };
}

export interface AdminDriverRow {
  id: string;
  name: string;
  kycStatus: KycStatus;
  complianceStatus: ComplianceStatus;
  status: DriverStatus;
  createdAt: string;
  user: { id?: string; phone: string; email?: string; name?: string; createdAt?: string };
  organizationLinks: AdminDriverOrgLink[];
  _count: { vehicles: number; scheduledTrips: number };
}

export type AdminDriverFilters = {
  search?: string;
  kycStatus?: KycStatus | '';
  driverStatus?: DriverStatus | '';
  orgLinkStatus?: OrgDriverStatus | '';
  organizationId?: string;
};

export const adminDriverApi = {
  list: (filters?: AdminDriverFilters) => {
    const qs = new URLSearchParams();
    if (filters?.search) qs.set('search', filters.search);
    if (filters?.kycStatus) qs.set('kycStatus', filters.kycStatus);
    if (filters?.driverStatus) qs.set('driverStatus', filters.driverStatus);
    if (filters?.orgLinkStatus) qs.set('orgLinkStatus', filters.orgLinkStatus);
    if (filters?.organizationId) qs.set('organizationId', filters.organizationId);
    const suffix = qs.toString() ? `?${qs}` : '';
    return api.get<{ status: string; data: { drivers: AdminDriverRow[] } }>(`/admin/drivers${suffix}`);
  },

  advanceLinkStatus: (orgId: string, driverId: string, status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED', reason?: string) =>
    api.patch<{ status: string; data: { link: OrgDriverLink } }>(
      `/admin/organizations/${orgId}/drivers/${driverId}/compliance`,
      { status, reason },
    ),

  approveIndependentKyc: (driverId: string, status: 'APPROVED' | 'REJECTED', reason?: string) =>
    api.patch<{ status: string; data: { driverId: string; approvalStatus: string } }>(
      `/admin/drivers/${driverId}/compliance`,
      { status, reason },
    ),
};

// ─── Admin booking types and API ──────────────────────────────────────────────

export interface AdminBookingRow {
  id: string;
  tripId: string;
  passengerId?: string | null;
  passengerName: string;
  passengerPhone: string;
  seatType: SeatType;
  baseFare: number;
  totalFare: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: BookingStatus;
  emergencyContact?: string | null;
  createdAt: string;
  pickupJson?: Record<string, unknown> | null;
  dropoffJson?: Record<string, unknown> | null;
  trip: {
    id: string;
    departureAt: string;
    status: TripStatus;
    departurePoint: string;
    frontSeatsTotal?: number;
    backSeatsTotal?: number;
    frontSeatsBooked?: number;
    backSeatsBooked?: number;
    route?: { id: string; name: string; originLabel: string; destinationLabel: string } | null;
    driver?: { id: string; name: string; user?: { id?: string; phone: string; name?: string } } | null;
    vehicle?: { id: string; plate: string; type: string } | null;
    bookings?: Array<{ id: string; seatType: string; status: string; passengerName: string; totalFare: number }>;
  };
  organization?: { id: string; legalName: string; tradeName?: string | null } | null;
  invoice?: { id: string; invoiceNo: string; pdfUrl?: string | null; issuedAt: string } | null;
}

export type AdminBookingFilters = {
  search?: string;
  status?: BookingStatus | '';
  tripStatus?: TripStatus | '';
  paymentStatus?: PaymentStatus | '';
  paymentMethod?: PaymentMethod | '';
  routeId?: string;
  driverId?: string;
  vehicleId?: string;
  organizationId?: string;
  dateFrom?: string;
  dateTo?: string;
  tripId?: string;
};

export type UserFeatureFlags = {
  userId: string | null;
  flags: Record<string, boolean>;
  assignmentCount: number;
};

export const featureFlagsApi = {
  getByUserId: (userId: string) =>
    api.get<UserFeatureFlags>(`/admin/feature-flags?userId=${encodeURIComponent(userId)}`),
};

// ─── Passenger clustering (DBSCAN cluster groups) ─────────────────────────────

export interface ClusterGroupView {
  id: string;
  status: 'OPEN' | 'ASSIGNED' | 'DEPARTED' | 'EXPIRED' | 'CANCELLED';
  centroidLat: number;
  centroidLng: number;
  radiusKm: number;
  destination: string;
  departureWindowStart: string;
  departureWindowEnd: string;
  passengerCount: number;
  estimatedFareMin: number;
  assignedDriverId: string | null;
  assignedTripId: string | null;
  expiresAt: string;
  requests: Array<{ requestId: string; status: string }>;
}

export const clusterApi = {
  // Super admin: every cluster group (latest 100)
  listAll: () => api.get<{ clusters: ClusterGroupView[] }>('/admin/clusters'),
  // Super admin: trigger an on-demand clustering sweep
  run: () => api.post<{ created: number; openRequests: number }>('/admin/clusters/run', {}),
  // Org admin: open clusters + those assigned to the org's fleet
  listForOrg: (organizationId: string) =>
    api.get<{ status: string; data: { clusters: ClusterGroupView[] } }>(`/organizations/${organizationId}/clusters`),
};

// ─── Driver Verification types and API (Step 4) ───────────────────────────────

export type OrgDriverVerificationStatus = 'PENDING_COMPLIANCE' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

export interface DriverDocSummary {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  missingMandatory: string[];
}

export interface VerificationListItem {
  organizationDriverId: string;
  driverId: string;
  userId: string;
  organizationId: string;
  organizationName: string;
  fullName: string;
  phone: string;
  status: OrgDriverVerificationStatus;
  onboardingSubmittedAt: string | null;
  activatedAt: string | null;
  documentSummary: DriverDocSummary;
}

export interface VerificationDocument {
  id: string;
  documentType: string;
  documentNumberMasked: string | null;
  status: DocStatus;
  expiresAt: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  frontFileId: string | null;
  backFileId: string | null;
  metadata: {
    issueDate: string | null;
    issuingAuthority: string | null;
    accountHolderName: string | null;
    bankName: string | null;
    ifscCode: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface VerificationDetail {
  driver: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    dob: string | null;
    gender: string | null;
    currentAddress: Record<string, unknown> | null;
    permanentAddress: Record<string, unknown> | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    bloodGroup: string | null;
    preferredLanguage: string | null;
    profilePhotoFileId: string | null;
    kycStatus: KycStatus;
    complianceStatus: ComplianceStatus;
  };
  organizationDriver: {
    id: string;
    organizationId: string;
    organizationName: string;
    status: OrgDriverVerificationStatus;
    onboardingSubmittedAt: string | null;
    activatedAt: string | null;
    approvedBySuperAdminId: string | null;
    complianceApprovedAt: string | null;
    complianceRejectedAt: string | null;
    complianceRejectionReason: string | null;
  } | null;
  documents: VerificationDocument[];
  missingRequiredFields: string[];
  missingRequiredDocuments: string[];
  canApproveProfile: boolean;
  blockReasons: string[];
}

export interface VerificationHistoryEvent {
  id: string;
  action: string;
  performedByUserId: string | null;
  reason: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export const driverVerificationApi = {
  list: (filters?: { status?: string; organizationId?: string; search?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.organizationId) qs.set('organizationId', filters.organizationId);
    if (filters?.search) qs.set('search', filters.search);
    if (filters?.page) qs.set('page', String(filters.page));
    if (filters?.limit) qs.set('limit', String(filters.limit));
    const suffix = qs.toString() ? `?${qs}` : '';
    return api.get<{ status: string; data: { items: VerificationListItem[]; pagination: { page: number; limit: number; total: number } } }>(`/super-admin/drivers/verifications${suffix}`);
  },

  getDetail: (driverId: string) =>
    api.get<{ status: string; data: VerificationDetail }>(`/super-admin/drivers/${driverId}/verification`),

  approveDocument: (driverId: string, kycRecordId: string, body: { remarks?: string }) =>
    api.post<{ status: string; data: { document: VerificationDocument } }>(`/super-admin/drivers/${driverId}/documents/${kycRecordId}/approve`, body),

  rejectDocument: (driverId: string, kycRecordId: string, body: { reason: string; remarks?: string }) =>
    api.post<{ status: string; data: { document: VerificationDocument } }>(`/super-admin/drivers/${driverId}/documents/${kycRecordId}/reject`, body),

  approveDriver: (driverId: string, body: { organizationDriverId: string; remarks?: string }) =>
    api.post<{ status: string; data: { organizationDriverId: string; status: string; activatedAt: string; message: string } }>(`/super-admin/drivers/${driverId}/approve`, body),

  rejectDriver: (driverId: string, body: { organizationDriverId: string; reason: string; remarks?: string }) =>
    api.post<{ status: string; data: { organizationDriverId: string; status: string; nextStep: string; message: string } }>(`/super-admin/drivers/${driverId}/reject`, body),

  getHistory: (driverId: string) =>
    api.get<{ status: string; data: { history: VerificationHistoryEvent[] } }>(`/super-admin/drivers/${driverId}/verification-history`),
};

export const adminRidesApi = {
  list: (filters?: AdminBookingFilters) => {
    const qs = new URLSearchParams();
    if (filters?.search) qs.set('search', filters.search);
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.tripStatus) qs.set('tripStatus', filters.tripStatus);
    if (filters?.paymentStatus) qs.set('paymentStatus', filters.paymentStatus);
    if (filters?.paymentMethod) qs.set('paymentMethod', filters.paymentMethod);
    if (filters?.routeId) qs.set('routeId', filters.routeId);
    if (filters?.driverId) qs.set('driverId', filters.driverId);
    if (filters?.vehicleId) qs.set('vehicleId', filters.vehicleId);
    if (filters?.organizationId) qs.set('organizationId', filters.organizationId);
    if (filters?.dateFrom) qs.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) qs.set('dateTo', filters.dateTo);
    if (filters?.tripId) qs.set('tripId', filters.tripId);
    const suffix = qs.toString() ? `?${qs}` : '';
    return api.get<{ status: string; data: { bookings: AdminBookingRow[]; total: number } }>(`/admin/bookings${suffix}`);
  },
  get: (bookingId: string) =>
    api.get<{ status: string; data: { booking: AdminBookingRow } }>(`/admin/bookings/${bookingId}`),
};

// ─── Admin passengers API ─────────────────────────────────────────────────────

export interface AdminPassengerRow {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email?: string | null;
  userStatus?: string | null;
  registeredAt: string;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  confirmedBookings: number;
  totalSpendPaise: number;
  firstBookingAt: string | null;
  lastBookingAt: string | null;
}

export interface AdminPassengerBooking {
  id: string;
  tripId: string;
  passengerId?: string | null;
  passengerName: string;
  passengerPhone: string;
  seatType: SeatType;
  baseFare: number;
  totalFare: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: BookingStatus;
  emergencyContact?: string | null;
  createdAt: string;
  trip: {
    id: string;
    departureAt: string;
    status: TripStatus;
    departurePoint: string;
    route?: { id: string; name: string; originLabel: string; destinationLabel: string } | null;
    driver?: { id: string; name: string; user?: { phone: string } } | null;
    vehicle?: { id: string; plate: string; type: string } | null;
  };
  invoice?: { id: string; invoiceNo: string; pdfUrl?: string | null; issuedAt: string } | null;
}

export interface AdminPassengerDetail {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email?: string | null;
  userStatus?: string | null;
  registeredAt: string;
}

export const adminPassengersApi = {
  list: (search?: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return api.get<{ status: string; data: { passengers: AdminPassengerRow[]; total: number } }>(`/admin/passengers${qs}`);
  },
  get: (passengerId: string) =>
    api.get<{ status: string; data: { passenger: AdminPassengerDetail; bookings: AdminPassengerBooking[] } }>(`/admin/passengers/${passengerId}`),
};

// ─── Trips monitoring API ─────────────────────────────────────────────────────

export interface TripEvent {
  id: string;
  tripId: string;
  type: string;
  payloadJson: Record<string, unknown>;
  createdAt: string;
}

export const adminTripsApi = {
  getTimeline: (tripId: string) =>
    api.get<{ trip: ScheduledTrip; events: TripEvent[] }>(`/trips/${tripId}/timeline`),
  getTrip: (tripId: string) =>
    api.get<{ trip: ScheduledTrip }>(`/trips/${tripId}`),
};

// ─── Step 5: Vehicle-driver assignment API ────────────────────────────────────

export type AssignmentType = 'PRIMARY' | 'SECONDARY';
export type AssignmentStatusType = 'ACTIVE' | 'SUSPENDED' | 'ENDED' | 'PENDING_COMPLIANCE';

export interface AssignmentDriverSummary {
  id: string;
  name: string;
  phone: string | null;
}

export interface AssignmentVehicleSummary {
  id: string;
  plate: string;
  vehicleNumber: string | null;
  vehicleType: string;
  status: string;
}

export interface VehicleDriverAssignmentRow {
  id: string;
  driverId: string;
  vehicleId: string;
  organizationId: string | null;
  assignmentType: AssignmentType;
  status: AssignmentStatusType;
  note: string | null;
  removalReason: string | null;
  active: boolean;
  assignedAt: string | null;
  endedAt: string | null;
  assignedByUserId: string | null;
  driver?: AssignmentDriverSummary;
  vehicle?: AssignmentVehicleSummary;
}

export interface EligibleDriverItem {
  driverId: string;
  organizationDriverId: string;
  fullName: string | null;
  phone: string | null;
  organizationDriverStatus: string;
  currentAssignments: Array<{ id: string; vehicleId: string; assignmentType: AssignmentType; status: AssignmentStatusType }>;
  eligible: boolean;
  blockReasons: string[];
}

export const vehicleDriverAssignmentApi = {
  list: (orgId: string, filters?: {
    vehicleId?: string;
    driverId?: string;
    status?: string;
    assignmentType?: string;
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (filters?.vehicleId) qs.set('vehicleId', filters.vehicleId);
    if (filters?.driverId) qs.set('driverId', filters.driverId);
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.assignmentType) qs.set('assignmentType', filters.assignmentType);
    if (filters?.page) qs.set('page', String(filters.page));
    if (filters?.limit) qs.set('limit', String(filters.limit));
    const suffix = qs.toString() ? `?${qs}` : '';
    return api.get<{ status: string; data: { items: VehicleDriverAssignmentRow[]; pagination: { page: number; limit: number; total: number } } }>(
      `/admin/organizations/${orgId}/vehicle-driver-assignments${suffix}`,
    );
  },

  getVehicleAssignments: (orgId: string, vehicleId: string) =>
    api.get<{ status: string; data: { activePrimary: VehicleDriverAssignmentRow | null; activeSecondary: VehicleDriverAssignmentRow[]; history: VehicleDriverAssignmentRow[]; all: VehicleDriverAssignmentRow[] } }>(
      `/admin/organizations/${orgId}/vehicles/${vehicleId}/assignments`,
    ),

  assignDriver: (orgId: string, vehicleId: string, body: {
    driverId: string;
    assignmentType: AssignmentType;
    note?: string;
    replaceExistingPrimary?: boolean;
    replaceExistingVehicle?: boolean;
    replacementReason?: string;
  }) =>
    api.post<{ status: string; data: { assignment: VehicleDriverAssignmentRow } }>(
      `/admin/organizations/${orgId}/vehicles/${vehicleId}/drivers`,
      body,
    ),

  suspend: (orgId: string, assignmentId: string, reason: string) =>
    api.patch<{ status: string; data: { assignment: VehicleDriverAssignmentRow } }>(
      `/admin/organizations/${orgId}/vehicle-driver-assignments/${assignmentId}/suspend`,
      { reason },
    ),

  restore: (orgId: string, assignmentId: string) =>
    api.patch<{ status: string; data: { assignment: VehicleDriverAssignmentRow } }>(
      `/admin/organizations/${orgId}/vehicle-driver-assignments/${assignmentId}/restore`,
      {},
    ),

  remove: (orgId: string, assignmentId: string, reason?: string) =>
    api.del<{ status: string; data: { assignment: VehicleDriverAssignmentRow } }>(
      `/admin/organizations/${orgId}/vehicle-driver-assignments/${assignmentId}`,
      reason ? { reason } : undefined,
    ),

  eligibleDrivers: (orgId: string, filters?: { vehicleId?: string; assignmentType?: string; search?: string; includeIneligible?: boolean }) => {
    const qs = new URLSearchParams();
    if (filters?.vehicleId) qs.set('vehicleId', filters.vehicleId);
    if (filters?.assignmentType) qs.set('assignmentType', filters.assignmentType);
    if (filters?.search) qs.set('search', filters.search);
    if (filters?.includeIneligible) qs.set('includeIneligible', 'true');
    const suffix = qs.toString() ? `?${qs}` : '';
    return api.get<{ status: string; data: { items: EligibleDriverItem[] } }>(
      `/admin/organizations/${orgId}/drivers/eligible-for-assignment${suffix}`,
    );
  },
};

export type AdminTransportRequest = {
  id: string;
  type: string;
  status: string;
  from: string;
  to: string;
  routeId: string;
  requestedFor: string;
  seats: number;
  budgetPaise?: number;
  note?: string;
  parcelDetails?: string;
  passengerName?: string;
  passengerPhone?: string;
  acceptedByDriverId?: string;
  bookingId?: string;
  createdAt: string;
  driver?: { id?: string; name?: string; phone?: string } | null;
  vehicle?: { id?: string; plate?: string; vehicleNumber?: string; type?: string; vehicleType?: string } | null;
};

export const adminTransportRequestsApi = {
  list: (params?: { type?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.status) qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs}` : '';
    return api.get<{ status: string; data: { requests: AdminTransportRequest[] } }>(`/admin/transport-requests${suffix}`);
  },
};

// ─── Live Tracking API ────────────────────────────────────────────────────────

export type TrackingStopKind = 'PICKUP' | 'DROPOFF';
export type TrackingStopStatus = 'PENDING' | 'ARRIVED' | 'DONE';

export interface TrackingStop {
  bookingId: string;
  kind: TrackingStopKind;
  label: string | null;
  lat: number | null;
  lng: number | null;
  passengerName: string;
  passengerPhone: string;
  seatType: string;
  status: TrackingStopStatus;
}

export interface TrackedTrip {
  tripId: string;
  status: string;
  departureAt: string;
  departedAt: string | null;
  departurePoint: string;
  route: { from: string; to: string; name: string };
  driver: { id: string; name: string; phone: string | null };
  vehicle: { id: string | null; plate: string | null; type: string | null; vehicleNumber: string | null };
  organization: { id: string; name: string } | null;
  location: { lat: number; lng: number; updatedAt: string } | null;
  progress: { totalPassengers: number; pickedUp: number; droppedOff: number };
  phase: 'PICKUP' | 'DROPOFF';
  stops: TrackingStop[];
}

export const trackingApi = {
  // Super admin: all active trips, optionally filtered by org and/or vehicle.
  adminActive: (params?: { organizationId?: string; vehicleId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.organizationId) qs.set('organizationId', params.organizationId);
    if (params?.vehicleId) qs.set('vehicleId', params.vehicleId);
    const suffix = qs.toString() ? `?${qs}` : '';
    return api.get<{ status: string; data: { trips: TrackedTrip[] } }>(`/admin/live-tracking${suffix}`);
  },

  // Org admin: active trips scoped to a specific organization.
  orgActive: (organizationId: string, params?: { vehicleId?: string }) => {
    const qs = params?.vehicleId ? `?vehicleId=${encodeURIComponent(params.vehicleId)}` : '';
    return api.get<{ status: string; data: { trips: TrackedTrip[] } }>(
      `/organizations/${organizationId}/live-tracking${qs}`,
    );
  },

  // Single-trip detail (full-map view).
  adminTripDetail: (tripId: string) =>
    api.get<{ status: string; data: { trip: TrackedTrip } }>(`/admin/live-tracking/trips/${tripId}`),

  orgTripDetail: (organizationId: string, tripId: string) =>
    api.get<{ status: string; data: { trip: TrackedTrip } }>(
      `/organizations/${organizationId}/live-tracking/trips/${tripId}`,
    ),

  // Schedule tracking — trips for a day (default today) with stops + last-known driver position.
  adminSchedule: (params?: { date?: string; organizationId?: string; vehicleId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.date) qs.set('date', params.date);
    if (params?.organizationId) qs.set('organizationId', params.organizationId);
    if (params?.vehicleId) qs.set('vehicleId', params.vehicleId);
    const suffix = qs.toString() ? `?${qs}` : '';
    return api.get<{ status: string; data: { date: string; trips: TrackedTrip[] } }>(`/admin/schedule-tracking${suffix}`);
  },

  orgSchedule: (organizationId: string, params?: { date?: string; vehicleId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.date) qs.set('date', params.date);
    if (params?.vehicleId) qs.set('vehicleId', params.vehicleId);
    const suffix = qs.toString() ? `?${qs}` : '';
    return api.get<{ status: string; data: { date: string; trips: TrackedTrip[] } }>(
      `/organizations/${organizationId}/schedule-tracking${suffix}`,
    );
  },
};

// WebSocket base for the live-location stream (gateway namespace `/ws`).
export const WS_BASE = (process.env.NEXT_PUBLIC_WS_URL
  ?? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/api\/?$/, ''));
