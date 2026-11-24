'use client';

import { useState, useEffect, useId, useRef, type ReactNode } from 'react';
import { Sparkles, AlertCircle, CheckCircle2, TriangleAlert } from 'lucide-react';
import { Button, Dialog, ErrorState, Note } from '@/components/ui';
import { cn } from '@/lib/utils';
import { MaterialListing, Organization } from '@/lib/types';
import {
  MATERIAL_FAMILIES,
  MATERIAL_SPECIFICATIONS,
  MATERIAL_CONDITIONS,
  MaterialFamily,
  MaterialCondition,
  DEMO_ORGANIZATIONS,
  BANGLADESH_CITIES,
} from '@/lib/constants';
import { MaterialExtractionResult } from '@/lib/ai/schemas';
import { useExtractMaterial, useSaveListing } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import { ListingImageField } from './ListingImageField';
import { VoiceInputControl } from './VoiceInputControl';
import { useIdentity } from '@/lib/auth/AuthProvider';

const SUCCESS_MESSAGE_MS = 2500;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: MaterialListing | null;
  selectedOrgId?: string;
  organizations: Organization[];
}

export function ListingFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  selectedOrgId,
  organizations,
}: Props) {
  const identity = useIdentity();
  const isEditing = Boolean(initialData);
  const saveListing = useSaveListing();
  const extractMaterial = useExtractMaterial();
  const uid = useId();
  const formId = `${uid}-form`;
  const formRef = useRef<HTMLFormElement>(null);

  // Form State
  const [organizationId, setOrganizationId] = useState(
    initialData?.organization_id || selectedOrgId || DEMO_ORGANIZATIONS[0].id
  );
  const [materialFamily, setMaterialFamily] = useState<MaterialFamily>(
    initialData?.material_family || 'STAINLESS_STEEL_SHEET'
  );
  const [materialSpecification, setMaterialSpecification] = useState<string>(
    initialData?.material_specification || 'SS304'
  );
  const [lengthMm, setLengthMm] = useState<string>(initialData ? String(initialData.length_mm) : '');
  const [widthMm, setWidthMm] = useState<string>(initialData ? String(initialData.width_mm) : '');
  const [thicknessMm, setThicknessMm] = useState<string>(
    initialData ? String(initialData.thickness_mm) : ''
  );
  const [totalQuantity, setTotalQuantity] = useState<string>(
    initialData ? String(initialData.total_quantity) : ''
  );
  const [condition, setCondition] = useState<MaterialCondition>(
    initialData?.condition || 'UNUSED'
  );
  const [unitPriceBdt, setUnitPriceBdt] = useState<string>(
    initialData ? String(initialData.unit_price_bdt) : ''
  );
  const [city, setCity] = useState<string>(initialData?.city || 'Gazipur');
  const [description, setDescription] = useState<string>(initialData?.description || '');
  const [imageUrl, setImageUrl] = useState<string>(initialData?.image_url || '');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // AI Extraction State
  const [aiPrompt, setAiPrompt] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiMessageType, setAiMessageType] = useState<'error' | 'success' | 'warning'>('success');
  const aiMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Show a status line; success lines clear themselves after a moment. */
  const showAiMessage = (type: 'error' | 'success' | 'warning', message: string | null) => {
    if (aiMessageTimer.current) clearTimeout(aiMessageTimer.current);
    aiMessageTimer.current = null;
    setAiMessageType(type);
    setAiMessage(message);
    if (type === 'success' && message) {
      aiMessageTimer.current = setTimeout(() => setAiMessage(null), SUCCESS_MESSAGE_MS);
    }
  };
  useEffect(() => () => {
    if (aiMessageTimer.current) clearTimeout(aiMessageTimer.current);
  }, []);

  // Submission & Validation State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // After a failed validation, move focus to the first field that needs attention.
  useEffect(() => {
    if (Object.keys(formErrors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [formErrors]);

  // Sync state when editing or reopening
  useEffect(() => {
    if (initialData) {
      setOrganizationId(initialData.organization_id);
      setMaterialFamily(initialData.material_family);
      setMaterialSpecification(initialData.material_specification);
      setLengthMm(String(initialData.length_mm));
      setWidthMm(String(initialData.width_mm));
      setThicknessMm(String(initialData.thickness_mm));
      setTotalQuantity(String(initialData.total_quantity));
      setCondition(initialData.condition);
      setUnitPriceBdt(String(initialData.unit_price_bdt));
      setCity(initialData.city);
      setDescription(initialData.description || '');
      setImageUrl(initialData.image_url || '');
    } else {
      setOrganizationId(selectedOrgId || DEMO_ORGANIZATIONS[0].id);
      setMaterialFamily('STAINLESS_STEEL_SHEET');
      setMaterialSpecification('SS304');
      setLengthMm('');
      setWidthMm('');
      setThicknessMm('');
      setTotalQuantity('');
      setCondition('UNUSED');
      setUnitPriceBdt('');
      setCity('Gazipur');
      setDescription('');
      setImageUrl('');
      setAiPrompt('');
      showAiMessage('success', null);
    }
    setFormErrors({});
    setGeneralError(null);
  }, [initialData, selectedOrgId, isOpen]);

  // Handle material family switch & update valid specifications
  const handleFamilyChange = (fam: MaterialFamily) => {
    setMaterialFamily(fam);
    const validSpecs = MATERIAL_SPECIFICATIONS[fam];
    if (!validSpecs.includes(materialSpecification as unknown as never)) {
      setMaterialSpecification(validSpecs[0]);
    }
  };

  // AI Assistant: extract, then fill the form directly for the supplier to review.
  const handleAiExtract = async (useMock = false) => {
    if (!aiPrompt.trim() || aiPrompt.trim().length < 5) {
      showAiMessage('error', 'Please enter a descriptive prompt of at least 5 characters.');
      return;
    }

    setIsExtracting(true);
    showAiMessage('success', null);

    try {
      const data = await extractMaterial.mutateAsync({ prompt: aiPrompt, mock: useMock });
      applyExtraction(data);
      if (data.source === 'heuristic' && !useMock) {
        showAiMessage(
          'warning',
          'The AI service is busy, so the offline parser filled what it could. Please check every field carefully.'
        );
      } else {
        showAiMessage('success', 'Extracted values applied to form! Please review and verify all fields.');
      }
    } catch (error) {
      showAiMessage(
        'error',
        errorMessage(error, 'AI extraction could not be completed. You can fill out the form manually below.')
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const applyExtraction = (result: MaterialExtractionResult) => {
    if (result.material_family) {
      setMaterialFamily(result.material_family);
      const specs: readonly string[] = MATERIAL_SPECIFICATIONS[result.material_family];
      if (result.material_specification && specs.includes(result.material_specification)) {
        setMaterialSpecification(result.material_specification);
      } else if (!specs.includes(materialSpecification)) {
        setMaterialSpecification(specs[0]);
      }
    }
    if (result.length_mm !== null) setLengthMm(String(result.length_mm));
    if (result.width_mm !== null) setWidthMm(String(result.width_mm));
    if (result.thickness_mm !== null) setThicknessMm(String(result.thickness_mm));
    if (result.total_quantity !== null) setTotalQuantity(String(result.total_quantity));
    if (result.condition !== null) setCondition(result.condition);
    if (result.unit_price_bdt !== null) setUnitPriceBdt(String(result.unit_price_bdt));
    if (result.city !== null) setCity(result.city);
    if (!description) setDescription(aiPrompt);
  };

  // Voice input: append each finished piece of speech to the prompt for review before extraction.
  const appendTranscript = (text: string) => {
    setAiPrompt((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text).slice(0, 2000));
    showAiMessage('success', null);
  };


  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploadingImage) return;
    setFormErrors({});
    setGeneralError(null);

    // Client-side validation
    const errors: Record<string, string> = {};

    const len = parseFloat(lengthMm);
    const wid = parseFloat(widthMm);
    const thk = parseFloat(thicknessMm);
    const qty = parseInt(totalQuantity, 10);
    const price = parseFloat(unitPriceBdt);

    if (isNaN(len) || len <= 0) errors.length_mm = 'Length must be greater than 0 mm';
    if (isNaN(wid) || wid <= 0) errors.width_mm = 'Width must be greater than 0 mm';
    if (isNaN(thk) || thk <= 0) errors.thickness_mm = 'Thickness must be greater than 0 mm';
    if (isNaN(qty) || qty <= 0) errors.total_quantity = 'Quantity must be at least 1 piece';
    if (isNaN(price) || price < 0) errors.unit_price_bdt = 'Price cannot be negative';
    if (!city.trim()) errors.city = 'City/Location is required';

    if (isEditing && initialData) {
      if (qty < initialData.reserved_quantity) {
        errors.total_quantity = `Cannot reduce total quantity below currently reserved stock (${initialData.reserved_quantity} pcs).`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        organization_id: organizationId,
        material_family: materialFamily,
        material_specification: materialSpecification,
        length_mm: len,
        width_mm: wid,
        thickness_mm: thk,
        total_quantity: qty,
        condition,
        unit_price_bdt: price,
        city: city.trim(),
        description: description.trim() || null,
        image_url: imageUrl.trim() || null,
      };

      await saveListing.mutateAsync({
        id: isEditing ? initialData!.id : undefined,
        body: payload,
        organizationId,
      });
      onSuccess();
      onClose();
    } catch (error) {
      setGeneralError(errorMessage(error, 'Failed to save listing.'));
    } finally {
      setIsSubmitting(false);
    }
  };


  const cityOptions = BANGLADESH_CITIES as readonly string[];
  const steps = isEditing
    ? { assist: '', material: '01', dimensions: '02', quantity: '03', location: '04' }
    : { assist: '01', material: '02', dimensions: '03', quantity: '04', location: '05' };
  const fieldId = (name: string) => `${uid}-${name}`;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="lg"
      dismissible={!isSubmitting}
      eyebrow={isEditing ? 'Supply · Edit listing' : 'Supply · New listing'}
      title={isEditing ? 'Edit Surplus Material Listing' : 'Publish New Surplus Material Listing'}
      description={
        isEditing
          ? 'Update specifications or available stock. Reserved stock is strictly protected.'
          : 'Offer industrial surplus to connected manufacturers. All specifications require verification.'
      }
      footer={
        <>
          {Object.keys(formErrors).length > 0 && (
            <p className="mr-auto text-xs font-medium text-brick-700">Check the highlighted fields before saving.</p>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form={formId} busy={isSubmitting} disabled={isUploadingImage}>
            {isSubmitting ? 'Saving Listing...' : isUploadingImage ? 'Uploading photo…' : isEditing ? 'Save Changes' : 'Publish Listing'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* AI-assisted description (create mode only) */}
        {!isEditing && (
          <FormSection id={fieldId('s-assist')} step={steps.assist} title="Describe it">
            <div className="col-span-12 space-y-4 rounded-sm border border-graphite/10 bg-sand-50 p-4 sm:p-5">
              <div className="space-y-1.5">
                <p className="t-eyebrow flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-copper-600" aria-hidden />
                  Assist · AI Smart Material Listing Assistant
                </p>
                <p className="text-sm leading-relaxed text-slate-700">
                  Describe your excess inventory in plain language (dimensions, grade, quantity, price, location),
                  typed or spoken in English, Bangla or Japanese. Our server-side LLM extracts structured attributes
                  for your review.
                </p>
                <p className="text-xs text-slate-600">
                  Extracted values are suggestions, not verified data. They fill the form below and must be checked
                  field by field before you publish.
                </p>
              </div>

              <div>
                <label htmlFor={fieldId('ai-prompt')} className="field-label">
                  Plain-language description
                </label>
                <textarea
                  id={fieldId('ai-prompt')}
                  data-autofocus
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. We have 40 unused stainless steel sheets, grade SS304, 2mm thick, 1000 by 500 mm, leftover from production. Price is 450 taka per sheet in Gazipur."
                  className="field mt-1.5 resize-y leading-relaxed"
                />
              </div>

              <VoiceInputControl onTranscript={appendTranscript} disabled={isExtracting} />

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t rule pt-4">
                <Button
                  variant="ink"
                  size="sm"
                  busy={isExtracting}
                  onClick={() => handleAiExtract(false)}
                  leading={<Sparkles className="size-4" aria-hidden />}
                >
                  {isExtracting ? 'Analyzing Prompt...' : 'Extract with AI'}
                </Button>
                <Button
                  variant="link"
                  size="sm"
                  disabled={isExtracting}
                  onClick={() => handleAiExtract(true)}
                  title="Run with deterministic heuristic simulation without external API key"
                >
                  Test with Mock Parser
                </Button>
              </div>

              {/* AI status: success fades after a moment; warnings and errors stay */}
              {aiMessage && (
                <div role={aiMessageType === 'error' ? 'alert' : 'status'}>
                  <Note tone={aiMessageType === 'error' ? 'danger' : aiMessageType === 'warning' ? 'warning' : 'neutral'}>
                    <span className="flex items-start gap-2">
                      {aiMessageType === 'error' ? (
                        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      ) : aiMessageType === 'warning' ? (
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      ) : (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-copper-700" aria-hidden />
                      )}
                      <span>{aiMessage}</span>
                    </span>
                  </Note>
                </div>
              )}
            </div>
          </FormSection>
        )}

        <form id={formId} ref={formRef} onSubmit={handleSubmit} className={cn('space-y-6', !isEditing && 'border-t rule pt-6')}>
          {/* Material */}
          <FormSection id={fieldId('s-material')} step={steps.material} title="Material">
            <Field id={fieldId('org')} label="Supplier organization" hint="Demo profile." className="col-span-12">
              <select
                {...controlProps(fieldId('org'), undefined, true)}
                disabled={isEditing || identity.locked}
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="field"
              >
                {organizations
                  .filter((o) => (identity.locked ? o.id === identity.organizationId : o.organization_type === 'SUPPLIER'))
                  .map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.city})
                    </option>
                  ))}
              </select>
            </Field>

            <Field id={fieldId('family')} label="Material family" required className="col-span-12 sm:col-span-6">
              <select
                {...controlProps(fieldId('family'))}
                data-autofocus={isEditing || undefined}
                value={materialFamily}
                onChange={(e) => handleFamilyChange(e.target.value as MaterialFamily)}
                className="field"
              >
                {MATERIAL_FAMILIES.map((fam) => (
                  <option key={fam} value={fam}>
                    {fam === 'STAINLESS_STEEL_SHEET' ? 'Stainless Steel Sheet' : 'Plywood Panel'}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              id={fieldId('spec')}
              label="Grade / technical specification"
              required
              error={formErrors.material_specification}
              className="col-span-12 sm:col-span-6"
            >
              <select
                {...controlProps(fieldId('spec'), formErrors.material_specification)}
                value={materialSpecification}
                onChange={(e) => setMaterialSpecification(e.target.value)}
                className={cn('field', formErrors.material_specification && 'field-invalid')}
              >
                {MATERIAL_SPECIFICATIONS[materialFamily].map((spec) => (
                  <option key={spec} value={spec}>
                    {spec}
                  </option>
                ))}
              </select>
            </Field>
          </FormSection>

          {/* Dimensions */}
          <FormSection id={fieldId('s-dimensions')} step={steps.dimensions} title="Dimensions" description="Millimetres, per piece.">
            {(
              [
                ['length', 'Length', 'length_mm', lengthMm, setLengthMm, 'e.g. 2400'],
                ['width', 'Width', 'width_mm', widthMm, setWidthMm, 'e.g. 1200'],
                ['thickness', 'Thickness', 'thickness_mm', thicknessMm, setThicknessMm, 'e.g. 2.0'],
              ] as const
            ).map(([name, label, key, value, setValue, placeholder]) => (
              <Field
                key={name}
                id={fieldId(name)}
                label={label}
                unit="mm"
                required
                error={formErrors[key]}
                className="col-span-12 sm:col-span-4"
              >
                <input
                  {...controlProps(fieldId(name), formErrors[key])}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  placeholder={placeholder}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className={cn('field pr-11 tabular-nums', NO_SPIN, formErrors[key] && 'field-invalid')}
                />
              </Field>
            ))}
          </FormSection>

          {/* Quantity & price */}
          <FormSection id={fieldId('s-quantity')} step={steps.quantity} title="Quantity & price">
            <Field
              id={fieldId('qty')}
              label="Total quantity"
              unit="pcs"
              required
              error={formErrors.total_quantity}
              className="col-span-12 sm:col-span-6 lg:col-span-4"
            >
              <input
                {...controlProps(fieldId('qty'), formErrors.total_quantity)}
                type="number"
                inputMode="numeric"
                step="1"
                placeholder="e.g. 50"
                value={totalQuantity}
                onChange={(e) => setTotalQuantity(e.target.value)}
                className={cn('field pr-12 tabular-nums', NO_SPIN, formErrors.total_quantity && 'field-invalid')}
              />
            </Field>

            <Field
              id={fieldId('price')}
              label="Unit price"
              unit="BDT"
              required
              hint="Per piece."
              error={formErrors.unit_price_bdt}
              className="col-span-12 sm:col-span-6 lg:col-span-4"
            >
              <input
                {...controlProps(fieldId('price'), formErrors.unit_price_bdt, true)}
                type="number"
                inputMode="decimal"
                step="any"
                placeholder="e.g. 4200"
                value={unitPriceBdt}
                onChange={(e) => setUnitPriceBdt(e.target.value)}
                className={cn('field pr-12 tabular-nums', NO_SPIN, formErrors.unit_price_bdt && 'field-invalid')}
              />
            </Field>

            <Field id={fieldId('condition')} label="Condition" required className="col-span-12 lg:col-span-4">
              <select
                {...controlProps(fieldId('condition'))}
                value={condition}
                onChange={(e) => setCondition(e.target.value as MaterialCondition)}
                className="field"
              >
                {MATERIAL_CONDITIONS.map((cond) => (
                  <option key={cond} value={cond}>
                    {cond === 'UNUSED' ? 'UNUSED (Prime excess)' : cond === 'LEFTOVER' ? 'LEFTOVER (Batch surplus)' : 'OFFCUT (Factory cut piece)'}
                  </option>
                ))}
              </select>
            </Field>

            {/* Reserved quantity indicator (edit mode) */}
            {isEditing && initialData && (
              <div className="col-span-12">
                <Note tone="warning">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <span>
                      Currently Reserved Stock: <strong className="t-num font-medium">{initialData.reserved_quantity} pieces</strong>
                    </span>
                    <span>
                      Available: <span className="t-num">{initialData.available_quantity} pieces</span>
                    </span>
                  </span>
                </Note>
              </div>
            )}
          </FormSection>

          {/* Location & notes */}
          <FormSection id={fieldId('s-location')} step={steps.location} title="Location & notes">
            <Field id={fieldId('city')} label="City / location" required error={formErrors.city} className="col-span-12 sm:col-span-6">
              <select
                {...controlProps(fieldId('city'), formErrors.city)}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={cn('field', formErrors.city && 'field-invalid')}
              >
                {cityOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <Field id={fieldId('description')} label="Description / storage condition" className="col-span-12">
              <textarea
                {...controlProps(fieldId('description'))}
                rows={2}
                placeholder="e.g. Stored indoors on pallets, clean edges, factory wrapped."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="field resize-y leading-relaxed"
              />
            </Field>

            <div className="col-span-12 min-w-0">
              <p className="field-label">
                Photo <span className="ml-1 font-normal text-slate-600">Optional</span>
              </p>
              <ListingImageField
                id={fieldId('image')}
                value={imageUrl}
                onChange={setImageUrl}
                organizationId={organizationId}
                onBusyChange={setIsUploadingImage}
              />
              <p id={`${fieldId('image')}-hint`} className="field-hint mt-2">
                Optional human inspection reference. Photographs support visual check only; technical specifications are
                certified by numeric fields above.
              </p>
            </div>
          </FormSection>

          {/* Save failure: next to the actions so it is seen after submitting */}
          {generalError && <ErrorState title="Listing not saved" message={generalError} />}
        </form>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ layout helpers */

/** Hides the native number spinners so unit suffixes sit cleanly (arrow keys still step). */
const NO_SPIN =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** Accessible wiring for a control rendered inside <Field>. */
function controlProps(id: string, error?: string, hasHint = false) {
  const describedBy = [hasHint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  };
}

function FormSection({
  id,
  step,
  title,
  description,
  children,
}: {
  id: string;
  step: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4 border-t rule pt-6 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs tabular-nums text-copper-700" aria-hidden>
          {step}
        </span>
        <div className="min-w-0">
          <h3 id={id} className="text-[15px] font-medium tracking-[-0.01em] text-graphite">
            {title}
          </h3>
          {description && <p className="mt-0.5 text-xs text-slate-600">{description}</p>}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-x-4 gap-y-5">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  required,
  optional,
  unit,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  unit?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="field-label">
        {label}
        {unit && <span className="sr-only"> ({unit})</span>}
        {required && (
          <>
            <span className="ml-0.5 text-copper-700" aria-hidden>
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
        {optional && <span className="ml-1.5 font-normal text-slate-600">Optional</span>}
      </label>
      <div className="relative mt-1.5">
        {children}
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-slate-600" aria-hidden>
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
