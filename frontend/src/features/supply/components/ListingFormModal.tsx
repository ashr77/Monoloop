'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  TriangleAlert,
} from 'lucide-react';
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
import { VoiceInputControl } from './VoiceInputControl';

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
  const isEditing = Boolean(initialData);
  const saveListing = useSaveListing();
  const extractMaterial = useExtractMaterial();

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {isEditing ? 'Edit Surplus Material Listing' : 'Publish New Surplus Material Listing'}
            </h2>
            <p className="text-sm text-slate-500">
              {isEditing
                ? 'Update specifications or available stock. Reserved stock is strictly protected.'
                : 'Offer industrial surplus to connected manufacturers. All specifications require verification.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-7 max-h-[82vh] overflow-y-auto">
          {/* General Error Banner */}
          {generalError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {/* AI SMART LISTING ASSISTANT (Only in Create Mode) */}
          {!isEditing && (
            <div className="border border-blue-200 bg-gradient-to-br from-blue-50/70 to-indigo-50/40 p-5 rounded-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-blue-900 font-semibold text-base">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <span>AI Smart Material Listing Assistant</span>
                </div>
              </div>

              <p className="text-sm text-slate-600">
                Describe your excess inventory in plain language (dimensions, grade, quantity, price, location),
                typed or spoken in English, Bangla or Japanese. Our server-side LLM extracts structured attributes
                for your review.
              </p>

              <div className="space-y-2">
                <textarea
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. We have 40 unused stainless steel sheets, grade SS304, 2mm thick, 1000 by 500 mm, leftover from production. Price is 450 taka per sheet in Gazipur."
                  className="w-full text-base p-3 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />

                <VoiceInputControl onTranscript={appendTranscript} disabled={isExtracting} />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isExtracting}
                      onClick={() => handleAiExtract(false)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm transition"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{isExtracting ? 'Analyzing Prompt...' : 'Extract with AI'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isExtracting}
                      onClick={() => handleAiExtract(true)}
                      className="text-sm text-blue-700 hover:underline px-2 py-1"
                      title="Run with deterministic heuristic simulation without external API key"
                    >
                      (Test with Mock Parser)
                    </button>
                  </div>
                </div>
              </div>

              {/* AI status: success fades after a moment; warnings and errors stay */}
              {aiMessage && (
                <div
                  role={aiMessageType === 'error' ? 'alert' : 'status'}
                  className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                    aiMessageType === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : aiMessageType === 'warning'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {aiMessageType === 'error' ? (
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  ) : aiMessageType === 'warning' ? (
                    <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
                  )}
                  <p className="flex-1">{aiMessage}</p>
                </div>
              )}
            </div>
          )}

          {/* MANUAL SPECIFICATION FORM */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Supplier Organization */}
            <div>
              <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Supplier Organization (Demo Profile)
              </label>
              <select
                disabled={isEditing}
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="w-full text-base p-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {organizations
                  .filter((o) => o.organization_type === 'SUPPLIER')
                  .map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.city})
                    </option>
                  ))}
              </select>
            </div>

            {/* Material Family & Specification */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Material Family <span className="text-red-500">*</span>
                </label>
                <select
                  value={materialFamily}
                  onChange={(e) => handleFamilyChange(e.target.value as MaterialFamily)}
                  className="w-full text-base p-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {MATERIAL_FAMILIES.map((fam) => (
                    <option key={fam} value={fam}>
                      {fam === 'STAINLESS_STEEL_SHEET' ? 'Stainless Steel Sheet' : 'Plywood Panel'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Grade / Technical Specification <span className="text-red-500">*</span>
                </label>
                <select
                  value={materialSpecification}
                  onChange={(e) => setMaterialSpecification(e.target.value)}
                  className="w-full text-base p-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {MATERIAL_SPECIFICATIONS[materialFamily].map((spec) => (
                    <option key={spec} value={spec}>
                      {spec}
                    </option>
                  ))}
                </select>
                {formErrors.material_specification && (
                  <p className="text-sm text-red-600 mt-1">{formErrors.material_specification}</p>
                )}
              </div>
            </div>

            {/* Dimensions (Length, Width, Thickness) */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Length (mm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 2400"
                  value={lengthMm}
                  onChange={(e) => setLengthMm(e.target.value)}
                  className={`w-full text-base p-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    formErrors.length_mm ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                  }`}
                />
                {formErrors.length_mm && (
                  <p className="text-sm text-red-600 mt-1">{formErrors.length_mm}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Width (mm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 1200"
                  value={widthMm}
                  onChange={(e) => setWidthMm(e.target.value)}
                  className={`w-full text-base p-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    formErrors.width_mm ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                  }`}
                />
                {formErrors.width_mm && (
                  <p className="text-sm text-red-600 mt-1">{formErrors.width_mm}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Thickness (mm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 2.0"
                  value={thicknessMm}
                  onChange={(e) => setThicknessMm(e.target.value)}
                  className={`w-full text-base p-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    formErrors.thickness_mm ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                  }`}
                />
                {formErrors.thickness_mm && (
                  <p className="text-sm text-red-600 mt-1">{formErrors.thickness_mm}</p>
                )}
              </div>
            </div>

            {/* Quantity & Reserved Stock Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Total Quantity (Pieces) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="e.g. 50"
                  value={totalQuantity}
                  onChange={(e) => setTotalQuantity(e.target.value)}
                  className={`w-full text-base p-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    formErrors.total_quantity ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                  }`}
                />
                {formErrors.total_quantity && (
                  <p className="text-sm text-red-600 mt-1">{formErrors.total_quantity}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Condition <span className="text-red-500">*</span>
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as MaterialCondition)}
                  className="w-full text-base p-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {MATERIAL_CONDITIONS.map((cond) => (
                    <option key={cond} value={cond}>
                      {cond === 'UNUSED' ? 'UNUSED (Prime excess)' : cond === 'LEFTOVER' ? 'LEFTOVER (Batch surplus)' : 'OFFCUT (Factory cut piece)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reserved Quantity Indicator (For Edit mode) */}
            {isEditing && initialData && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center justify-between">
                <span>
                  Currently Reserved Stock: <strong>{initialData.reserved_quantity} pieces</strong>
                </span>
                <span className="text-amber-600">
                  Available: {initialData.available_quantity} pieces
                </span>
              </div>
            )}

            {/* Price & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Unit Price (BDT / piece) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 4200"
                  value={unitPriceBdt}
                  onChange={(e) => setUnitPriceBdt(e.target.value)}
                  className={`w-full text-base p-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    formErrors.unit_price_bdt ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                  }`}
                />
                {formErrors.unit_price_bdt && (
                  <p className="text-sm text-red-600 mt-1">{formErrors.unit_price_bdt}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  City / Location <span className="text-red-500">*</span>
                </label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full text-base p-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {BANGLADESH_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {formErrors.city && <p className="text-sm text-red-600 mt-1">{formErrors.city}</p>}
              </div>
            </div>

            {/* Description & Optional Image URL */}
            <div>
              <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Description / Storage Condition
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Stored indoors on pallets, clean edges, factory wrapped."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-base p-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Photo URL (Optional human inspection reference)
              </label>
              <input
                type="url"
                placeholder="https://example.com/images/metal-sheet.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full text-base p-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-sm text-slate-400 mt-1">
                Photographs support visual check only; technical specifications are certified by numeric fields above.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-base font-medium hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-7 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-base font-bold shadow-sm transition flex items-center gap-2"
              >
                {isSubmitting ? 'Saving Listing...' : isEditing ? 'Save Changes' : 'Publish Listing'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
