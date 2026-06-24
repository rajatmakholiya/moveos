'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Checkbox,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { useAuth } from '../../../../lib/AuthContext';
import { api, type ApiError } from '../../../../lib/api';
import { Button } from '../../../../components/ui/Button';
import { DriverAuthLoading, DriverAuthRequired } from '../../../../components/DriverAuthState';

// ─── Inline SVG icons ─────────────────────────────────────────────────────────
function Ico({ d, className }: { d: string; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  );
}
const CheckCircle = ({ className }: { className?: string }) =>
  <Ico d='<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' className={className} />;
const Upload = ({ className }: { className?: string }) =>
  <Ico d='<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>' className={className} />;
const AlertCircle = ({ className }: { className?: string }) =>
  <Ico d='<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/>' className={className} />;
const Clock = ({ className }: { className?: string }) =>
  <Ico d='<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' className={className} />;

// ─── Types ────────────────────────────────────────────────────────────────────
type AddressForm = { line1: string; line2: string; city: string; state: string; pincode: string };
type ProfileForm = {
  fullName: string; dob: string; gender: string; email: string; alternatePhone: string;
  currentAddress: AddressForm; permanentAddress: AddressForm; sameAsCurrentAddress: boolean;
  emergencyContactName: string; emergencyContactPhone: string; bloodGroup: string;
  preferredLanguage: string; profilePhotoFileId: string; profilePhotoUrl: string;
};
type DocRecord = {
  id: string; documentType: string; status: string; rejectionReason: string | null;
  frontFileId: string | null; backFileId: string | null; expiresAt: string | null;
  documentNo: string | null;
};
type OnboardingState = {
  driverId: string; organizationDriverId: string | null; organizationId: string | null; organizationName: string | null;
  status: string | null; profile: Record<string, unknown>; documents: DocRecord[];
  missingRequiredFields: string[]; missingRequiredDocuments: string[]; nextStep: string;
};

const EMPTY_ADDRESS: AddressForm = { line1: '', line2: '', city: '', state: '', pincode: '' };
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const LANGUAGES = [{ value: 'hi', label: 'हिंदी' }, { value: 'en', label: 'English' }, { value: 'pa', label: 'ਪੰਜਾਬੀ' }];

type DocSpec = {
  type: string;
  label: string;
  mandatory: boolean;
  hasFrontBack: boolean;
  hasExpiry: boolean;
  hasDocNo: boolean;
  helper?: string;
  requiredWhen?: (profile: ProfileForm) => boolean;
};
const DOC_SPECS: DocSpec[] = [
  { type: 'DRIVING_LICENSE', label: 'Driving License', mandatory: true, hasFrontBack: true, hasExpiry: true, hasDocNo: true },
  { type: 'AADHAAR', label: 'Aadhaar Card', mandatory: false, hasFrontBack: true, hasExpiry: false, hasDocNo: true, helper: 'Optional identity proof.' },
  { type: 'PAN_CARD', label: 'PAN Card', mandatory: false, hasFrontBack: false, hasExpiry: false, hasDocNo: true, helper: 'Optional tax identity proof.' },
];

const MUI_FIELD_SX = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '12px',
    backgroundColor: 'var(--surface)',
  },
  '& .MuiInputLabel-root': {
    fontSize: '0.875rem',
  },
};

function emptyProfile(): ProfileForm {
  return {
    fullName: '', dob: '', gender: '', email: '', alternatePhone: '',
    currentAddress: { ...EMPTY_ADDRESS }, permanentAddress: { ...EMPTY_ADDRESS },
    sameAsCurrentAddress: false,
    emergencyContactName: '', emergencyContactPhone: '', bloodGroup: '', preferredLanguage: '',
    profilePhotoFileId: '', profilePhotoUrl: '',
  };
}

function driverAge(dob: string) {
  if (!dob) return 0;
  const birthDate = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed = today.getMonth() > birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasBirthdayPassed) age -= 1;
  return age;
}

function isDocRequired(spec: DocSpec, profile: ProfileForm) {
  return spec.mandatory || Boolean(spec.requiredWhen?.(profile));
}

function normalizeDocumentNumber(value: string) {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

function validateDocumentNumber(documentType: string, value: string) {
  const normalized = normalizeDocumentNumber(value);
  if (documentType === 'DRIVING_LICENSE') {
    if (!normalized) return 'Driving license number is required.';
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,13}$/.test(normalized)) return 'Enter a valid driving license number, for example UK1420110012345.';
  }
  if (documentType === 'AADHAAR' && normalized && !/^\d{12}$/.test(normalized)) return 'Aadhaar must be exactly 12 digits.';
  if (documentType === 'PAN_CARD' && normalized && !/^[A-Z]{5}\d{4}[A-Z]$/.test(normalized)) return 'PAN must look like ABCDE1234F.';
  return '';
}

function validateFile(file: File, allowPdf: boolean) {
  const allowed = allowPdf
    ? ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    : ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) return allowPdf ? 'Only JPG, PNG, WebP, or PDF files are allowed.' : 'Only camera images are allowed.';
  if (file.size > 8 * 1024 * 1024) return 'File must be 8 MB or smaller.';
  return '';
}

function validateAddress(address: AddressForm, prefix: string, errors: Record<string, string>) {
  if (!address.line1.trim()) errors[`${prefix}.line1`] = 'Street address is required.';
  if (!address.city.trim()) errors[`${prefix}.city`] = 'City is required.';
  if (!address.state.trim()) errors[`${prefix}.state`] = 'State is required.';
  if (!/^\d{6}$/.test(address.pincode.trim())) errors[`${prefix}.pincode`] = 'Enter a valid 6-digit PIN code.';
}

// ─── Stepper ──────────────────────────────────────────────────────────────────
const STEPS = ['Profile', 'Documents', 'Review', 'Submitted'];

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div className={[
              'h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors',
              i < current ? 'bg-[var(--brand)] border-[var(--brand)] text-white' :
              i === current ? 'bg-white border-[var(--brand)] text-[var(--brand)]' :
              'bg-white border-[var(--border)] text-[var(--text-tertiary)]',
            ].join(' ')}>
              {i < current ? '✓' : i + 1}
            </div>
            <span className={[
              'text-[10px] font-medium whitespace-nowrap',
              i === current ? 'text-[var(--brand)]' : 'text-[var(--text-tertiary)]',
            ].join(' ')}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={['flex-1 h-px mx-1 mt-[-1.25rem] transition-colors', i < current ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'].join(' ')} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Address section ──────────────────────────────────────────────────────────
function AddressSection({ title, value, onChange, errors }: {
  title: string; value: AddressForm;
  onChange: (field: keyof AddressForm, val: string) => void;
  errors?: Partial<Record<keyof AddressForm, string>>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-small font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{title}</p>
      <TextField label="House / Flat No, Street" value={value.line1} onChange={(e) => onChange('line1', e.target.value)} error={Boolean(errors?.line1)} helperText={errors?.line1} fullWidth size="small" sx={MUI_FIELD_SX} />
      <TextField label="Area / Locality (optional)" value={value.line2} onChange={(e) => onChange('line2', e.target.value)} fullWidth size="small" sx={MUI_FIELD_SX} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="City" value={value.city} onChange={(e) => onChange('city', e.target.value)} error={Boolean(errors?.city)} helperText={errors?.city} fullWidth size="small" sx={MUI_FIELD_SX} />
        <TextField label="State" value={value.state} onChange={(e) => onChange('state', e.target.value)} error={Boolean(errors?.state)} helperText={errors?.state} fullWidth size="small" sx={MUI_FIELD_SX} />
      </div>
      <TextField label="PIN Code" value={value.pincode} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }} onChange={(e) => onChange('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} error={Boolean(errors?.pincode)} helperText={errors?.pincode} fullWidth size="small" sx={MUI_FIELD_SX} />
    </div>
  );
}

// ─── File uploader (authenticated multipart POST) ─────────────────────────────
type FileUploadResult = { fileUrl: string };
function useFileUpload(driverId: string, token: string | null) {
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const upload = useCallback(async (key: string, file: File, documentType: string): Promise<string | null> => {
    setUploading((p) => ({ ...p, [key]: true }));
    setErrors((p) => { const n = { ...p }; delete n[key]; return n; });
    try {
      const form = new FormData();
      form.append('file', file);
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api'}/files/upload/driver/${driverId}/${documentType}`.replace(/\/api\/api\//, '/api/'),
        { method: 'POST', headers, body: form },
      );
      if (!res.ok) throw new Error('Upload failed');
      const json = await res.json() as { data?: { upload?: FileUploadResult } };
      return json.data?.upload?.fileUrl ?? null;
    } catch {
      setErrors((p) => ({ ...p, [key]: 'Upload failed. Please try again.' }));
      return null;
    } finally {
      setUploading((p) => ({ ...p, [key]: false }));
    }
  }, [driverId, token]);

  return { upload, uploading, errors };
}

// ─── File upload widget: camera + gallery dual-option ─────────────────────────
function FileUploadWidget({
  label, fileKey, driverId, token, documentType, currentUrl, onUploaded,
  cameraFacing = 'environment',
}: {
  label: string; fileKey: string; driverId: string; token: string | null;
  documentType: string; currentUrl: string | null; onUploaded: (url: string) => void;
  cameraFacing?: 'user' | 'environment';
}) {
  const { upload, uploading, errors } = useFileUpload(driverId, token);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File, allowPdf: boolean) => {
    const fileError = validateFile(file, allowPdf);
    if (fileError) {
      alert(fileError);
      return;
    }
    const url = await upload(fileKey, file, documentType);
    if (url) onUploaded(url);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>, allowPdf: boolean) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f, allowPdf);
    e.target.value = '';
  };

  const isUploading = uploading[fileKey];

  return (
    <div>
      <p className="text-small text-[var(--text-secondary)] mb-1.5">{label}</p>

      {currentUrl ? (
        <div className="rounded-xl border-2 border-[var(--brand)] bg-[var(--teal-50)] px-4 py-3 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-[var(--brand)] shrink-0" />
          <span className="text-small text-[var(--text-primary)] flex-1">Uploaded ✓</span>
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="text-small font-semibold text-[var(--brand)]">Replace</button>
        </div>
      ) : isUploading ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] px-4 py-4 flex items-center gap-3">
          <span className="pahadi-spinner text-[var(--brand)]" />
          <span className="text-small text-[var(--text-secondary)]">Uploading…</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {/* Camera capture button */}
          <button type="button" onClick={() => cameraInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-inset)] py-4 flex flex-col items-center gap-2 hover:border-[var(--brand)] active:bg-[var(--teal-50)] transition-colors">
            <span className="text-2xl leading-none">📷</span>
            <span className="text-xs font-medium text-[var(--text-secondary)]">Take photo</span>
          </button>
          {/* Gallery / file picker button */}
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-inset)] py-4 flex flex-col items-center gap-2 hover:border-[var(--brand)] active:bg-[var(--teal-50)] transition-colors">
            <Upload className="h-6 w-6 text-[var(--text-tertiary)]" />
            <span className="text-xs font-medium text-[var(--text-secondary)]">Upload file</span>
          </button>
        </div>
      )}

      {errors[fileKey] && <p className="mt-1 text-small text-red-500">{errors[fileKey]}</p>}

      {/* Hidden file picker — no capture */}
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => onChange(event, true)} />
      {/* Hidden camera input — capture attribute triggers native camera */}
      <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture={cameraFacing} className="hidden" onChange={(event) => onChange(event, false)} />
    </div>
  );
}

// ─── Document card ────────────────────────────────────────────────────────────
type DocFormState = {
  documentNumber: string; expiryDate: string; issueDate: string; issuingAuthority: string;
  frontFileId: string; backFileId: string; fileId: string;
  accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string;
};

function emptyDocForm(): DocFormState {
  return { documentNumber: '', expiryDate: '', issueDate: '', issuingAuthority: '', frontFileId: '', backFileId: '', fileId: '', accountHolderName: '', bankName: '', accountNumber: '', ifscCode: '' };
}

function DocCard({
  spec, existing, driverId, token, profile, onSaved,
}: {
  spec: DocSpec; existing: DocRecord | undefined; driverId: string; token: string | null; profile: ProfileForm; onSaved: () => void;
}) {
  const [form, setForm] = useState<DocFormState>(() => {
    if (!existing) return emptyDocForm();
    return {
      ...emptyDocForm(),
      documentNumber: existing.documentNo ?? '',
      expiryDate: existing.expiresAt ? existing.expiresAt.split('T')[0] : '',
      frontFileId: existing.frontFileId ?? '',
      backFileId: existing.backFileId ?? '',
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const required = isDocRequired(spec, profile);

  const set = (k: keyof DocFormState, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const numberError = spec.hasDocNo ? validateDocumentNumber(spec.type, form.documentNumber) : '';
      if (numberError) throw new Error(numberError);
      if (spec.hasFrontBack && (!form.frontFileId || !form.backFileId)) throw new Error(`${spec.label} front and back images are required.`);
      if (!spec.hasFrontBack && !form.fileId) throw new Error(`${spec.label} file is required.`);
      if (spec.type === 'DRIVING_LICENSE' && !form.expiryDate) throw new Error('Driving license expiry date is required.');
      if (spec.type === 'DRIVING_LICENSE' && form.expiryDate && new Date(form.expiryDate).getTime() < Date.now()) throw new Error('Driving license is expired.');
      const body: Record<string, unknown> = { documentType: spec.type };
      if (form.documentNumber) body.documentNumber = normalizeDocumentNumber(form.documentNumber);
      if (form.frontFileId) body.frontFileId = form.frontFileId;
      if (form.backFileId) body.backFileId = form.backFileId;
      if (form.fileId) body.fileId = form.fileId;
      if (form.expiryDate) body.expiryDate = form.expiryDate;
      if (form.issueDate) body.issueDate = form.issueDate;
      if (form.issuingAuthority) body.issuingAuthority = form.issuingAuthority;
      if (form.accountHolderName) body.accountHolderName = form.accountHolderName;
      if (form.bankName) body.bankName = form.bankName;
      if (form.accountNumber) body.accountNumber = form.accountNumber;
      if (form.ifscCode) body.ifscCode = form.ifscCode;

      await api.post('/driver/onboarding/documents', body, token ?? undefined);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError((err as ApiError)?.message ?? 'Failed to save document');
    } finally {
      setSaving(false);
    }
  };

  const statusColor = existing?.status === 'APPROVED' ? 'text-green-600' : existing?.status === 'REJECTED' ? 'text-red-500' : 'text-amber-600';
  const statusLabel = existing?.status === 'APPROVED' ? 'Approved' : existing?.status === 'REJECTED' ? 'Rejected' : existing ? 'Pending review' : '';

  return (
    <div className={[
      'rounded-2xl border p-4 space-y-3',
      existing?.status === 'APPROVED' ? 'border-green-200 bg-green-50' :
      existing?.status === 'REJECTED' ? 'border-red-200 bg-red-50' :
      existing ? 'border-amber-200 bg-amber-50' : 'border-[var(--border)] bg-[var(--surface)]',
    ].join(' ')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-medium text-[var(--text-primary)]">{spec.label}</p>
          {required && <span className="text-[10px] font-bold text-red-500 uppercase">Required</span>}
          {!required && <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase">Optional</span>}
        </div>
        {existing && <span className={`text-xs font-semibold ${statusColor}`}>{statusLabel}</span>}
      </div>
      {spec.helper && <p className="text-xs text-[var(--text-secondary)]">{spec.helper}</p>}

      {existing?.status === 'REJECTED' && existing.rejectionReason && (
        <div className="flex items-start gap-2 rounded-lg bg-red-100 p-2.5">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-small text-red-700">{existing.rejectionReason}</p>
        </div>
      )}

      {/* A document type can be submitted only once. */}
      {existing ? (
        <div className={[
          'flex items-center gap-2 rounded-lg px-3 py-2',
          existing.status === 'APPROVED' ? 'bg-green-100' : existing.status === 'REJECTED' ? 'bg-red-100' : 'bg-amber-100',
        ].join(' ')}>
          {existing.status === 'APPROVED' && <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />}
          <p className={[
            'text-small font-medium',
            existing.status === 'APPROVED' ? 'text-green-700' : existing.status === 'REJECTED' ? 'text-red-700' : 'text-amber-700',
          ].join(' ')}>
            {existing.status === 'APPROVED' ? 'Verified and approved.' : existing.status === 'REJECTED' ? 'Submitted document was rejected.' : 'Submitted for review.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {spec.hasDocNo && (
            <TextField label="Document Number" value={form.documentNumber} onChange={(e) => set('documentNumber', e.target.value.toUpperCase())} fullWidth size="small" sx={MUI_FIELD_SX} helperText={spec.type === 'DRIVING_LICENSE' ? 'Required. Example: UK1420110012345' : spec.type === 'AADHAAR' ? 'Optional. 12 digits only.' : spec.type === 'PAN_CARD' ? 'Optional. Example: ABCDE1234F' : undefined} />
          )}
          {spec.hasFrontBack ? (
            <>
              <FileUploadWidget label="Front side" fileKey={`${spec.type}_front`} driverId={driverId} token={token}
                documentType={`${spec.type}_FRONT`} currentUrl={form.frontFileId || null}
                onUploaded={(url) => set('frontFileId', url)} />
              <FileUploadWidget label="Back side" fileKey={`${spec.type}_back`} driverId={driverId} token={token}
                documentType={`${spec.type}_BACK`} currentUrl={form.backFileId || null}
                onUploaded={(url) => set('backFileId', url)} />
            </>
          ) : spec.type === 'BANK_ACCOUNT' ? (
            <div className="space-y-3">
              <TextField label="Account Holder Name" value={form.accountHolderName} onChange={(e) => set('accountHolderName', e.target.value)} fullWidth size="small" sx={MUI_FIELD_SX} />
              <TextField label="Bank Name" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} fullWidth size="small" sx={MUI_FIELD_SX} />
              <TextField label="Account Number" value={form.accountNumber} inputMode="numeric" onChange={(e) => set('accountNumber', e.target.value.replace(/\D/g, ''))} fullWidth size="small" sx={MUI_FIELD_SX} />
              <TextField label="IFSC Code" value={form.ifscCode} onChange={(e) => set('ifscCode', e.target.value.toUpperCase())} fullWidth size="small" sx={MUI_FIELD_SX} />
              <FileUploadWidget label="Cancelled Cheque" fileKey={`${spec.type}_cheque`} driverId={driverId} token={token}
                documentType="CANCELLED_CHEQUE" currentUrl={form.fileId || null}
                onUploaded={(url) => set('fileId', url)} />
            </div>
          ) : (
            <FileUploadWidget label="Document file" fileKey={`${spec.type}_file`} driverId={driverId} token={token}
              documentType={spec.type} currentUrl={form.fileId || null}
              onUploaded={(url) => set('fileId', url)} />
          )}
          {spec.hasExpiry && (
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Issue Date" type="date" value={form.issueDate} onChange={(e) => set('issueDate', e.target.value)} fullWidth size="small" sx={MUI_FIELD_SX} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="Expiry Date" type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} fullWidth size="small" sx={MUI_FIELD_SX} slotProps={{ inputLabel: { shrink: true } }} />
            </div>
          )}
          {spec.hasExpiry && (
            <TextField label="Issuing Authority (optional)" value={form.issuingAuthority} onChange={(e) => set('issuingAuthority', e.target.value)} fullWidth size="small" sx={MUI_FIELD_SX} />
          )}

          {error && <p className="text-small text-red-500">{error}</p>}
          {saved && !error && <p className="text-small text-green-600">Saved successfully.</p>}

          <Button variant="secondary" size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save document'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DriverOnboardingPage() {
  const router = useRouter();
  const { user, token, isReady } = useAuth();
  const routerRef = useRef(router);
  const loadSeqRef = useRef(0);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState('');
  const [state, setState] = useState<OnboardingState | null>(null);
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile());
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileFieldErrors, setProfileFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const driverId = user?.driverId ?? '';

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const loadState = useCallback(async (options?: { preserveStep?: boolean; showLoading?: boolean }) => {
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    const showLoading = options?.showLoading ?? true;
    if (showLoading) {
      setLoading(true);
    }
    setGlobalError('');
    try {
      const res = await api.get<{ data: OnboardingState }>('/driver/onboarding/me', token ?? undefined);
      if (loadSeqRef.current !== seq) return;
      const s = res.data;
      setState(s);
      const hasIncomplete = s.missingRequiredFields.length > 0 || s.missingRequiredDocuments.length > 0;

      // ACTIVE drivers can enter the dashboard only after all required details are present.
      // Org-created drivers may be ACTIVE before they finish their self-entered profile fields.
      if ((s.status === 'ACTIVE' || s.nextStep === 'ACTIVE') && !hasIncomplete) {
        routerRef.current.replace('/driver');
        return;
      }

      // Independent driver: waiting for admin verification after submission
      if (s.nextStep === 'WAIT_FOR_VERIFICATION') {
        if (!options?.preserveStep) setStep(3);
        return;
      }

      // Independent driver: vehicle registration required — redirect to vehicle page
      if (s.nextStep === 'REGISTER_VEHICLE' && !options?.preserveStep) {
        routerRef.current.replace('/driver/onboarding/vehicle');
        return;
      }

      // Submitted and awaiting review: show status screen only when profile is actually complete
      if (!options?.preserveStep && s.status === 'PENDING_COMPLIANCE') {
        if (!hasIncomplete) {
          setStep(3);
        } else {
          // Status was set externally but profile/docs are incomplete — land on whichever step needs work
          setStep(s.missingRequiredFields.length > 0 ? 0 : 1);
        }
      } else if (!options?.preserveStep && hasIncomplete) {
        setStep(s.missingRequiredFields.length > 0 ? 0 : 1);
      }

      // Pre-fill profile form from existing data
      const p = s.profile;
      const addr = (v: unknown): AddressForm => {
        if (!v || typeof v !== 'object') return { ...EMPTY_ADDRESS };
        const r = v as Record<string, unknown>;
        return { line1: String(r.line1 ?? ''), line2: String(r.line2 ?? ''), city: String(r.city ?? ''), state: String(r.state ?? ''), pincode: String(r.pincode ?? '') };
      };
      setProfile({
        fullName: String(p.fullName ?? ''),
        dob: p.dob ? String(p.dob).split('T')[0] : '',
        gender: String(p.gender ?? ''),
        email: String(p.email ?? ''),
        alternatePhone: String(p.alternatePhone ?? ''),
        currentAddress: addr(p.currentAddress),
        permanentAddress: addr(p.permanentAddress),
        sameAsCurrentAddress: false,
        emergencyContactName: String(p.emergencyContactName ?? ''),
        emergencyContactPhone: String(p.emergencyContactPhone ?? ''),
        bloodGroup: String(p.bloodGroup ?? ''),
        preferredLanguage: String(p.preferredLanguage ?? ''),
        profilePhotoFileId: String(p.profilePhotoFileId ?? ''),
        profilePhotoUrl: String(p.profilePhotoFileId ?? ''),
      });
      setDocs(s.documents ?? []);
    } catch (err) {
      if (loadSeqRef.current !== seq) return;
      setGlobalError((err as ApiError)?.message ?? 'Failed to load onboarding state');
    } finally {
      if (loadSeqRef.current === seq && showLoading) {
        setLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    if (isReady && token && user?.role === 'DRIVER') {
      void loadState();
    } else if (isReady && (!token || user?.role !== 'DRIVER')) {
      setLoading(false);
    }
  }, [isReady, token, user?.role, loadState]);

  // Auto-skip documents step if ALL mandatory docs are already approved (e.g., uploaded by org admin)
  useEffect(() => {
    if (step !== 1 || !state) return;
    const allMandatoryApproved = DOC_SPECS
      .filter((s) => isDocRequired(s, profile))
      .every((s) => docs.find((d) => d.documentType === s.type)?.status === 'APPROVED');
    if (allMandatoryApproved) {
      setStep(2);
    }
  }, [step, state, docs, profile]);

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileError('');
    const nextErrors: Record<string, string> = {};
    if (!profile.fullName.trim()) nextErrors.fullName = 'Full name is required.';
    if (!profile.dob) nextErrors.dob = 'Date of birth is required.';
    else if (new Date(`${profile.dob}T00:00:00`).getTime() > Date.now()) nextErrors.dob = 'Date of birth cannot be in the future.';
    else if (driverAge(profile.dob) < 18) nextErrors.dob = 'Driver must be at least 18 years old.';
    if (!profile.gender) nextErrors.gender = 'Gender is required.';
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) nextErrors.email = 'Enter a valid email address.';
    if (profile.alternatePhone && !/^[6-9]\d{9}$/.test(profile.alternatePhone.replace(/\D/g, ''))) nextErrors.alternatePhone = 'Enter a valid 10-digit alternate phone.';
    validateAddress(profile.currentAddress, 'currentAddress', nextErrors);
    if (!profile.sameAsCurrentAddress) validateAddress(profile.permanentAddress, 'permanentAddress', nextErrors);
    if (!profile.emergencyContactName.trim()) nextErrors.emergencyContactName = 'Emergency contact name is required.';
    if (!/^[6-9]\d{9}$/.test(profile.emergencyContactPhone.replace(/\D/g, ''))) nextErrors.emergencyContactPhone = 'Enter a valid 10-digit emergency phone.';
    if (!profile.profilePhotoFileId) nextErrors.profilePhotoFileId = 'A profile selfie is required.';
    setProfileFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setProfileError('Please fix the highlighted fields before continuing.');
      setProfileSaving(false);
      return;
    }
    try {
      const body: Record<string, unknown> = {};
      if (profile.fullName) body.fullName = profile.fullName;
      if (profile.dob) body.dob = profile.dob;
      if (profile.gender) body.gender = profile.gender;
      if (profile.email) body.email = profile.email;
      if (profile.alternatePhone) body.alternatePhone = profile.alternatePhone;
      if (profile.currentAddress.line1) body.currentAddress = profile.currentAddress;
      body.sameAsCurrentAddress = profile.sameAsCurrentAddress;
      if (!profile.sameAsCurrentAddress && profile.permanentAddress.line1) {
        body.permanentAddress = profile.permanentAddress;
      }
      if (profile.emergencyContactName) body.emergencyContactName = profile.emergencyContactName;
      if (profile.emergencyContactPhone) body.emergencyContactPhone = profile.emergencyContactPhone;
      if (profile.bloodGroup) body.bloodGroup = profile.bloodGroup;
      if (profile.preferredLanguage) body.preferredLanguage = profile.preferredLanguage;
      if (profile.profilePhotoFileId) body.profilePhotoFileId = profile.profilePhotoFileId;

      await api.put('/driver/onboarding/profile', body, token ?? undefined);
      await loadState();
      setStep(1);
    } catch (err) {
      setProfileError((err as ApiError)?.message ?? 'Failed to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const [submitNeedsVehicle, setSubmitNeedsVehicle] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    setSubmitNeedsVehicle(false);
    try {
      await api.post('/driver/onboarding/submit', {}, token ?? undefined);
      await loadState();
      setStep(3);
    } catch (err) {
      const e = err as ApiError;
      const errorCode = (e?.details as any)?.error_code ?? e?.code;
      // Already submitted — treat as success
      if (errorCode === 'already_submitted') {
        await loadState();
        setStep(3);
        return;
      }
      // Independent driver needs to register a vehicle first
      if (errorCode === 'vehicle_required') {
        setSubmitNeedsVehicle(true);
        setSubmitError(e?.message ?? 'Please register a vehicle before submitting for verification.');
        return;
      }
      setSubmitError(e?.message ?? 'Failed to submit onboarding');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isReady) return <DriverAuthLoading />;
  if (!user || user.role !== 'DRIVER') return <DriverAuthRequired />;

  if (loading) return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pt-5">
      <div className="h-2 w-24 bg-[var(--surface-inset)] rounded animate-pulse mb-6" />
      <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-[var(--surface-inset)] animate-pulse" />)}</div>
    </main>
  );

  if (globalError) return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pt-12 flex flex-col items-center">
      <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
      <p className="text-body text-[var(--text-secondary)] text-center">{globalError}</p>
      <Button className="mt-6" onClick={() => void loadState()}>Retry</Button>
    </main>
  );

  const missingFields = state?.missingRequiredFields ?? [];
  const missingDocs = state?.missingRequiredDocuments ?? [];
  const canSubmit = missingFields.length === 0 && missingDocs.length === 0;
  const orgName = state?.organizationName ?? 'your organization';

  // ── Step 0: Profile ──────────────────────────────────────────────────────
  if (step === 0) return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-24 pt-5">
      <header className="mb-5">
        <h1 className="font-display text-title text-[var(--text-primary)]">Complete Your Driver Profile</h1>
        <p className="text-small text-[var(--text-secondary)] mt-1">
          Submit your details so <span className="font-medium text-[var(--text-primary)]">{orgName}</span> can activate you after verification.
        </p>
      </header>
      <Stepper current={0} />

      <div className="space-y-4">
        <TextField label="Full Name" value={profile.fullName} onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))} error={Boolean(profileFieldErrors.fullName)} helperText={profileFieldErrors.fullName} fullWidth size="small" sx={MUI_FIELD_SX} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Date of Birth" type="date" value={profile.dob} onChange={(e) => setProfile((p) => ({ ...p, dob: e.target.value }))} error={Boolean(profileFieldErrors.dob)} helperText={profileFieldErrors.dob} fullWidth size="small" sx={MUI_FIELD_SX} slotProps={{ inputLabel: { shrink: true } }} />
          <FormControl fullWidth size="small" error={Boolean(profileFieldErrors.gender)} sx={MUI_FIELD_SX}>
            <InputLabel>Gender</InputLabel>
            <Select label="Gender" value={profile.gender} onChange={(e) => setProfile((p) => ({ ...p, gender: e.target.value }))}>
              <MenuItem value="">Select</MenuItem>
              <MenuItem value="MALE">Male</MenuItem>
              <MenuItem value="FEMALE">Female</MenuItem>
              <MenuItem value="OTHER">Other</MenuItem>
            </Select>
            {profileFieldErrors.gender && <FormHelperText>{profileFieldErrors.gender}</FormHelperText>}
          </FormControl>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] px-4 py-3">
          <p className="text-small text-[var(--text-secondary)]">Phone number is locked to your invite — it cannot be changed here.</p>
          <p className="text-body font-medium text-[var(--text-primary)] mt-0.5">{state?.profile?.phone as string ?? ''}</p>
        </div>

        <TextField label="Email (optional)" type="email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} error={Boolean(profileFieldErrors.email)} helperText={profileFieldErrors.email} fullWidth size="small" sx={MUI_FIELD_SX} />
        <TextField label="Alternate Phone (optional)" type="tel" value={profile.alternatePhone} onChange={(e) => setProfile((p) => ({ ...p, alternatePhone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} error={Boolean(profileFieldErrors.alternatePhone)} helperText={profileFieldErrors.alternatePhone} fullWidth size="small" sx={MUI_FIELD_SX} />

        <div className="pt-2">
          <AddressSection title="Current Address" value={profile.currentAddress}
            errors={{
              line1: profileFieldErrors['currentAddress.line1'],
              city: profileFieldErrors['currentAddress.city'],
              state: profileFieldErrors['currentAddress.state'],
              pincode: profileFieldErrors['currentAddress.pincode'],
            }}
            onChange={(f, v) => setProfile((p) => ({ ...p, currentAddress: { ...p.currentAddress, [f]: v } }))} />
        </div>

        <FormControlLabel
          control={<Checkbox checked={profile.sameAsCurrentAddress} onChange={(e) => setProfile((p) => ({ ...p, sameAsCurrentAddress: e.target.checked }))} />}
          label={<span className="text-small text-[var(--text-primary)]">Permanent address same as current</span>}
        />

        {!profile.sameAsCurrentAddress && (
          <div className="pt-1">
            <AddressSection title="Permanent Address" value={profile.permanentAddress}
              errors={{
                line1: profileFieldErrors['permanentAddress.line1'],
                city: profileFieldErrors['permanentAddress.city'],
                state: profileFieldErrors['permanentAddress.state'],
                pincode: profileFieldErrors['permanentAddress.pincode'],
              }}
              onChange={(f, v) => setProfile((p) => ({ ...p, permanentAddress: { ...p.permanentAddress, [f]: v } }))} />
          </div>
        )}

        <div className="pt-1 space-y-3">
          <p className="text-small font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Emergency Contact</p>
          <TextField label="Contact Name" value={profile.emergencyContactName} onChange={(e) => setProfile((p) => ({ ...p, emergencyContactName: e.target.value }))} error={Boolean(profileFieldErrors.emergencyContactName)} helperText={profileFieldErrors.emergencyContactName} fullWidth size="small" sx={MUI_FIELD_SX} />
          <TextField label="Contact Phone" type="tel" value={profile.emergencyContactPhone} onChange={(e) => setProfile((p) => ({ ...p, emergencyContactPhone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} error={Boolean(profileFieldErrors.emergencyContactPhone)} helperText={profileFieldErrors.emergencyContactPhone} fullWidth size="small" sx={MUI_FIELD_SX} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormControl fullWidth size="small" sx={MUI_FIELD_SX}>
            <InputLabel>Blood Group (optional)</InputLabel>
            <Select label="Blood Group (optional)" value={profile.bloodGroup} onChange={(e) => setProfile((p) => ({ ...p, bloodGroup: e.target.value }))}>
              <MenuItem value="">Select</MenuItem>
              {BLOOD_GROUPS.map((bg) => <MenuItem key={bg} value={bg}>{bg}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small" sx={MUI_FIELD_SX}>
            <InputLabel>Language (optional)</InputLabel>
            <Select label="Language (optional)" value={profile.preferredLanguage} onChange={(e) => setProfile((p) => ({ ...p, preferredLanguage: e.target.value }))}>
              <MenuItem value="">Select</MenuItem>
              {LANGUAGES.map((l) => <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>)}
            </Select>
          </FormControl>
        </div>

        {/* Profile photo — selfie first (front camera) */}
        <div>
          <p className="text-small font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">Profile Photo (Selfie)</p>
          <FileUploadWidget
            label="Take a clear selfie or upload a photo"
            fileKey="profile_photo"
            driverId={driverId}
            token={token}
            documentType="PROFILE_PHOTO"
            currentUrl={profile.profilePhotoUrl || null}
            cameraFacing="user"
            onUploaded={(url) => setProfile((p) => ({ ...p, profilePhotoFileId: url, profilePhotoUrl: url }))}
          />
          {profileFieldErrors.profilePhotoFileId && <p className="mt-1 text-small text-red-500">{profileFieldErrors.profilePhotoFileId}</p>}
        </div>

        {profileError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-small text-red-600">{profileError}</p>
          </div>
        )}

        <Button fullWidth onClick={() => void handleSaveProfile()} disabled={profileSaving}>
          {profileSaving ? 'Saving…' : 'Save & Continue to Documents →'}
        </Button>
      </div>
    </main>
  );

  // ── Step 1: Documents ────────────────────────────────────────────────────
  if (step === 1) return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-24 pt-5">
      <header className="mb-5">
        <h1 className="font-display text-title text-[var(--text-primary)]">Upload Documents</h1>
        <p className="text-small text-[var(--text-secondary)] mt-1">
          Use camera to scan documents directly. Already approved documents are pre-filled by your organization.
        </p>
      </header>
      <Stepper current={1} />

      <div className="space-y-4">
        {DOC_SPECS.map((spec) => (
          <DocCard
            key={spec.type}
            spec={spec}
            existing={docs.find((d) => d.documentType === spec.type)}
            driverId={driverId}
            token={token}
            profile={profile}
            onSaved={() => void loadState({ preserveStep: true, showLoading: false })}
          />
        ))}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" fullWidth onClick={() => setStep(0)}>← Back</Button>
          <Button fullWidth onClick={() => { void loadState({ preserveStep: true, showLoading: false }); setStep(2); }}>Review →</Button>
        </div>
      </div>
    </main>
  );

  // ── Step 2: Review ───────────────────────────────────────────────────────
  if (step === 2) return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-24 pt-5">
      <header className="mb-5">
        <h1 className="font-display text-title text-[var(--text-primary)]">Review & Submit</h1>
        <p className="text-small text-[var(--text-secondary)] mt-1">Check your details before submitting for verification.</p>
      </header>
      <Stepper current={2} />

      <div className="space-y-4">
        {/* Profile summary */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
          <p className="font-semibold text-[var(--text-primary)]">Profile</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-small">
            <span className="text-[var(--text-secondary)]">Name</span><span className="text-[var(--text-primary)]">{profile.fullName || '—'}</span>
            <span className="text-[var(--text-secondary)]">DOB</span><span className="text-[var(--text-primary)]">{profile.dob || '—'}</span>
            <span className="text-[var(--text-secondary)]">Gender</span><span className="text-[var(--text-primary)]">{profile.gender || '—'}</span>
            <span className="text-[var(--text-secondary)]">Blood Group</span><span className="text-[var(--text-primary)]">{profile.bloodGroup || '—'}</span>
            <span className="text-[var(--text-secondary)]">Emergency</span><span className="text-[var(--text-primary)] truncate">{profile.emergencyContactName || '—'}</span>
            <span className="text-[var(--text-secondary)]">Photo</span><span className="text-[var(--text-primary)]">{profile.profilePhotoFileId ? '✓ Uploaded' : '—'}</span>
          </div>
          {missingFields.length > 0 && (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-small text-amber-700 font-medium">Missing: {missingFields.join(', ')}</p>
            </div>
          )}
        </div>

        {/* Document checklist */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
          <p className="font-semibold text-[var(--text-primary)]">Documents</p>
          {DOC_SPECS.map((spec) => {
            const uploaded = docs.find((d) => d.documentType === spec.type);
            const isMissing = missingDocs.includes(spec.type);
            return (
              <div key={spec.type} className="flex items-center gap-2 py-0.5">
                {uploaded ? (
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                ) : isMissing ? (
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-[var(--border)] shrink-0" />
                )}
                <span className={['text-small', isMissing ? 'text-red-500' : 'text-[var(--text-primary)]'].join(' ')}>
                  {spec.label}{isDocRequired(spec, profile) ? ' *' : ''}
                  {uploaded?.status === 'REJECTED' ? ' — Rejected' : uploaded ? ` — ${uploaded.status}` : isMissing ? ' — Missing' : ' — Not provided'}
                </span>
              </div>
            );
          })}
        </div>

        {!canSubmit && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-small text-amber-700">Please complete all required fields and documents before submitting.</p>
          </div>
        )}

        {submitError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-small text-red-600">{submitError}</p>
          </div>
        )}

        {submitNeedsVehicle && (
          <Button fullWidth variant="secondary" onClick={() => router.push('/driver/onboarding/vehicle')}>
            Register Vehicle →
          </Button>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={() => setStep(1)}>← Back</Button>
          <Button fullWidth disabled={!canSubmit || submitting} onClick={() => void handleSubmit()}>
            {submitting ? 'Submitting…' : 'Submit for Verification'}
          </Button>
        </div>
      </div>
    </main>
  );

  // ── Step 3: Submitted / Status ────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-24 pt-5 flex flex-col">
      <Stepper current={3} />
      <div className="flex flex-col items-center text-center mt-8 mb-8">
        <div className="h-16 w-16 rounded-2xl bg-[var(--teal-50)] flex items-center justify-center mb-4">
          <Clock className="h-8 w-8 text-[var(--brand)]" />
        </div>
        <h1 className="font-display text-title text-[var(--text-primary)]">Verification Pending</h1>
        <p className="text-body text-[var(--text-secondary)] mt-2 max-w-xs">
          Your profile and documents have been submitted. Super admin verification is pending.
        </p>
        {orgName && (
          <p className="text-small text-[var(--text-secondary)] mt-1">
            Organization: <span className="font-medium text-[var(--text-primary)]">{orgName}</span>
          </p>
        )}
      </div>

      {/* Document status summary */}
      {docs.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2 mb-4">
          <p className="font-semibold text-[var(--text-primary)]">Document Status</p>
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 py-0.5">
              {doc.status === 'APPROVED' ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" /> :
               doc.status === 'REJECTED' ? <AlertCircle className="h-4 w-4 text-red-400 shrink-0" /> :
               <Clock className="h-4 w-4 text-amber-500 shrink-0" />}
              <span className="text-small text-[var(--text-primary)]">{DOC_SPECS.find((s) => s.type === doc.documentType)?.label ?? doc.documentType}</span>
              <span className={['text-small ml-auto', doc.status === 'APPROVED' ? 'text-green-600' : doc.status === 'REJECTED' ? 'text-red-500' : 'text-amber-600'].join(' ')}>
                {doc.status === 'APPROVED' ? 'Approved' : doc.status === 'REJECTED' ? 'Rejected' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <Button variant="secondary" fullWidth onClick={() => router.push(state?.organizationId ? `/driver/organizations/${state.organizationId}` : '/driver/organizations')}>
          View My Organizations
        </Button>
      </div>
    </main>
  );
}
