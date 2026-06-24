'use client';

import { FormEvent, type ReactNode, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2, FileUp, Loader2, ShieldCheck, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/AuthContext';
import { fileApi, vehiclesApi, type VehicleDocumentPayload, type VehiclePayload } from '@/lib/api';

const requiredDocuments = [
  { type: 'RC', label: 'Registration certificate' },
  { type: 'INSURANCE', label: 'Insurance certificate' },
  { type: 'FITNESS_CERTIFICATE', label: 'Fitness certificate' },
  { type: 'POLLUTION_CERTIFICATE', label: 'Pollution certificate' },
  { type: 'PERMIT', label: 'Commercial permit' },
];

type DocumentForm = VehicleDocumentPayload & { file?: File; uploaded?: boolean; uploading?: boolean; error?: string };

const initialVehicle: VehiclePayload = {
  vehicleNumber: '',
  vehicleType: '',
  fuelType: '',
  make: '',
  model: '',
  variant: '',
  registrationState: '',
  chassisNumber: '',
  engineNumber: '',
  color: '',
  totalSeats: 4,
  frontSeats: 1,
  backSeats: 3,
  luggageCapacityKg: 0,
  ownershipType: 'ORGANIZATION',
  ownerName: '',
  ownerPhone: '',
  ownerAddress: '',
  commercialPermitNumber: '',
  fitnessCertificateNumber: '',
  pollutionCertificateNumber: '',
  insurancePolicyNumber: '',
};

export default function NewVehiclePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [vehicle, setVehicle] = useState<VehiclePayload>(initialVehicle);
  const [vehicleId, setVehicleId] = useState('');
  const [documents, setDocuments] = useState<DocumentForm[]>(requiredDocuments.map((doc) => ({ type: doc.type, documentNo: '', expiresAt: '' })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const uploadedCount = documents.filter((doc) => doc.uploaded).length;
  const canSubmitKyc = vehicleId && uploadedCount === requiredDocuments.length;

  const steps = useMemo(() => [
    { title: 'Vehicle details', done: Boolean(vehicleId) },
    { title: 'Upload documents', done: uploadedCount === requiredDocuments.length },
    { title: 'Submit KYC', done: false },
  ], [uploadedCount, vehicleId]);

  if (user?.role !== 'ORG_ADMIN') {
    return (
      <div className="p-5">
        <Card className="border border-red-200">
          <CardContent className="flex items-center gap-2 p-6 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" /> Only organization admins can add vehicles.
          </CardContent>
        </Card>
      </div>
    );
  }

  const updateVehicle = (key: keyof VehiclePayload, value: string) => {
    const numeric = ['manufacturingYear', 'totalSeats', 'frontSeats', 'backSeats', 'luggageCapacityKg'].includes(key);
    setVehicle((current) => ({ ...current, [key]: numeric ? Number(value || 0) : value }));
  };

  const createVehicle = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!vehicle.vehicleNumber.trim() || !vehicle.vehicleType.trim()) {
      setError('Vehicle number and vehicle type are required.');
      return;
    }
    if (!vehicle.totalSeats || vehicle.frontSeats + vehicle.backSeats > vehicle.totalSeats) {
      setError('Seat capacity is invalid.');
      return;
    }
    setBusy(true);
    try {
      const res = await vehiclesApi.createOrgVehicle(cleanVehicle(vehicle));
      setVehicleId(res.data.vehicle.id);
      setStep(1);
      toast.success('Vehicle created. Upload required documents next.');
    } catch (err: any) {
      setError(err?.message ?? 'Could not create vehicle');
    } finally {
      setBusy(false);
    }
  };

  const uploadDocument = async (index: number) => {
    if (!vehicleId) return;
    const doc = documents[index];
    if (!doc.file && !doc.url && !doc.fileUuid) {
      updateDocument(index, { error: 'Select a file, URL, or file UUID.' });
      return;
    }
    updateDocument(index, { uploading: true, error: '' });
    try {
      let payload: VehicleDocumentPayload = {
        type: doc.type,
        documentNo: doc.documentNo || undefined,
        expiresAt: doc.expiresAt || undefined,
      };
      if (doc.file) {
        const upload = await fileApi.upload('vehicle', vehicleId, doc.type, doc.file);
        payload = { ...payload, url: upload.data.upload.fileUrl, fileUuid: upload.data.upload.fileUuid };
      } else {
        payload = { ...payload, url: doc.url || undefined, fileUuid: doc.fileUuid || undefined };
      }
      await vehiclesApi.uploadVehicleDocument(vehicleId, payload);
      updateDocument(index, { uploaded: true, uploading: false });
      toast.success(`${labelFor(doc.type)} uploaded`);
    } catch (err: any) {
      updateDocument(index, { uploading: false, error: err?.message ?? 'Upload failed' });
    }
  };

  const uploadAll = async () => {
    for (let index = 0; index < documents.length; index += 1) {
      if (!documents[index].uploaded) {
        await uploadDocument(index);
      }
    }
  };

  const submitKyc = async () => {
    if (!canSubmitKyc) return;
    setBusy(true);
    try {
      await vehiclesApi.submitVehicleKyc(vehicleId);
      toast.success('Vehicle KYC submitted for review');
      router.push('/dashboard/vehicles');
    } catch (err: any) {
      setError(err?.message ?? 'Could not submit KYC');
    } finally {
      setBusy(false);
    }
  };

  function updateDocument(index: number, patch: Partial<DocumentForm>) {
    setDocuments((current) => current.map((doc, itemIndex) => itemIndex === index ? { ...doc, ...patch } : doc));
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-5 py-4 pb-6 md:px-6 md:py-5">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2 text-slate-600" onClick={() => router.push('/dashboard/vehicles')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Vehicles
          </Button>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Truck className="h-5 w-5 text-blue-600" /> Add Vehicle</h1>
          <p className="mt-0.5 text-sm text-slate-500">Create the vehicle, upload compliance documents, then submit KYC for super-admin review.</p>
        </div>
      </div>

      {error ? <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div> : null}

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {steps.map((item, index) => (
          <button key={item.title} type="button" onClick={() => vehicleId || index === 0 ? setStep(index) : undefined} className={`rounded-lg border p-4 text-left ${step === index ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              {item.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Badge variant="outline">{index + 1}</Badge>}
            </div>
          </button>
        ))}
      </div>

      {step === 0 ? (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Vehicle details</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={createVehicle}>
              <FormSection title="Basic details">
                <Field label="Vehicle number" value={vehicle.vehicleNumber} onChange={(value) => updateVehicle('vehicleNumber', value)} required />
                <Field label="Vehicle type" value={vehicle.vehicleType} onChange={(value) => updateVehicle('vehicleType', value)} required />
                <Field label="Fuel type" value={vehicle.fuelType} onChange={(value) => updateVehicle('fuelType', value)} />
                <Field label="Make" value={vehicle.make} onChange={(value) => updateVehicle('make', value)} />
                <Field label="Model" value={vehicle.model} onChange={(value) => updateVehicle('model', value)} />
                <Field label="Variant" value={vehicle.variant} onChange={(value) => updateVehicle('variant', value)} />
                <Field label="Manufacturing year" type="number" value={vehicle.manufacturingYear ?? ''} onChange={(value) => updateVehicle('manufacturingYear', value)} />
                <Field label="Color" value={vehicle.color} onChange={(value) => updateVehicle('color', value)} />
              </FormSection>
              <FormSection title="Capacity">
                <Field label="Total seats" type="number" value={vehicle.totalSeats} onChange={(value) => updateVehicle('totalSeats', value)} required />
                <Field label="Front seats" type="number" value={vehicle.frontSeats} onChange={(value) => updateVehicle('frontSeats', value)} required />
                <Field label="Back seats" type="number" value={vehicle.backSeats} onChange={(value) => updateVehicle('backSeats', value)} required />
                <Field label="Luggage capacity kg" type="number" value={vehicle.luggageCapacityKg ?? 0} onChange={(value) => updateVehicle('luggageCapacityKg', value)} />
              </FormSection>
              <FormSection title="Ownership">
                <div className="space-y-1">
                  <Label>Ownership type</Label>
                  <Select value={vehicle.ownershipType} onValueChange={(value) => updateVehicle('ownershipType', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['ORGANIZATION', 'INDIVIDUAL', 'LEASED', 'THIRD_PARTY'].map((item) => <SelectItem key={item} value={item}>{item.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Field label="Owner name" value={vehicle.ownerName} onChange={(value) => updateVehicle('ownerName', value)} />
                <Field label="Owner phone" value={vehicle.ownerPhone} onChange={(value) => updateVehicle('ownerPhone', value)} />
                <div className="space-y-1 md:col-span-2"><Label>Owner address</Label><Textarea value={vehicle.ownerAddress ?? ''} onChange={(event) => updateVehicle('ownerAddress', event.target.value)} /></div>
              </FormSection>
              <FormSection title="Registration and permits">
                <Field label="Registration date" type="date" value={vehicle.registrationDate ?? ''} onChange={(value) => updateVehicle('registrationDate', value)} />
                <Field label="Registration state" value={vehicle.registrationState} onChange={(value) => updateVehicle('registrationState', value)} />
                <Field label="Chassis number" value={vehicle.chassisNumber} onChange={(value) => updateVehicle('chassisNumber', value)} />
                <Field label="Engine number" value={vehicle.engineNumber} onChange={(value) => updateVehicle('engineNumber', value)} />
                <Field label="Permit number" value={vehicle.commercialPermitNumber} onChange={(value) => updateVehicle('commercialPermitNumber', value)} />
                <Field label="Permit valid from" type="date" value={vehicle.permitValidFrom ?? ''} onChange={(value) => updateVehicle('permitValidFrom', value)} />
                <Field label="Permit valid till" type="date" value={vehicle.permitValidTill ?? ''} onChange={(value) => updateVehicle('permitValidTill', value)} />
              </FormSection>
              <FormSection title="Insurance / fitness / pollution">
                <Field label="Insurance policy number" value={vehicle.insurancePolicyNumber} onChange={(value) => updateVehicle('insurancePolicyNumber', value)} />
                <Field label="Insurance valid till" type="date" value={vehicle.insuranceValidTill ?? ''} onChange={(value) => updateVehicle('insuranceValidTill', value)} />
                <Field label="Fitness certificate number" value={vehicle.fitnessCertificateNumber} onChange={(value) => updateVehicle('fitnessCertificateNumber', value)} />
                <Field label="Fitness valid till" type="date" value={vehicle.fitnessValidTill ?? ''} onChange={(value) => updateVehicle('fitnessValidTill', value)} />
                <Field label="Pollution certificate number" value={vehicle.pollutionCertificateNumber} onChange={(value) => updateVehicle('pollutionCertificateNumber', value)} />
                <Field label="Pollution valid till" type="date" value={vehicle.pollutionValidTill ?? ''} onChange={(value) => updateVehicle('pollutionValidTill', value)} />
              </FormSection>
              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create and continue</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Required vehicle documents</CardTitle>
            <Button size="sm" variant="outline" onClick={() => void uploadAll()} disabled={!vehicleId}>Upload all ready files</Button>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            {documents.map((doc, index) => (
              <div key={doc.type} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{labelFor(doc.type)}</p>
                    <p className="text-xs text-slate-500">PDF or image file accepted.</p>
                  </div>
                  <Badge className={doc.uploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>{doc.uploaded ? 'Uploaded' : 'Required'}</Badge>
                </div>
                <div className="grid gap-3">
                  <div className="space-y-1"><Label>File</Label><Input type="file" accept="image/*,.pdf" onChange={(event) => updateDocument(index, { file: event.target.files?.[0], uploaded: false })} /></div>
                  <Field label="Document number" value={doc.documentNo} onChange={(value) => updateDocument(index, { documentNo: value, uploaded: false })} />
                  <Field label="Expiry date" type="date" value={doc.expiresAt ?? ''} onChange={(value) => updateDocument(index, { expiresAt: value, uploaded: false })} />
                  {doc.error ? <p className="text-sm text-red-600">{doc.error}</p> : null}
                  <Button type="button" variant="outline" disabled={doc.uploading || doc.uploaded} onClick={() => void uploadDocument(index)}>
                    {doc.uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                    Upload document
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-2 lg:col-span-2">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={() => setStep(2)} disabled={!canSubmitKyc}>Continue to KYC</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-50 p-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /></div>
              <div>
                <p className="font-semibold text-slate-900">Ready for KYC review</p>
                <p className="text-sm text-slate-500">The vehicle remains inactive until super admin approval.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button disabled={busy || !canSubmitKyc} onClick={() => void submitKyc()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Submit KYC</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function cleanVehicle(form: VehiclePayload): VehiclePayload {
  const payload: Record<string, unknown> = {};
  Object.entries(form).forEach(([key, value]) => {
    if (value === '' || value === undefined || value === null) return;
    payload[key] = value;
  });
  return payload as VehiclePayload;
}

function labelFor(type: string) {
  return requiredDocuments.find((doc) => doc.type === type)?.label ?? type.replace(/_/g, ' ');
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, type = 'text', required }: { label: string; value: string | number | undefined; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input required={required} type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
