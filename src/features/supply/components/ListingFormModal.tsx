'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
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
  const [aiResult, setAiResult] = useState<MaterialExtractionResult | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiMessageType, setAiMessageType] = useState<'info' | 'error' | 'success'>('info');

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
      setAiResult(null);
      setAiPrompt('');
      setAiMessage(null);
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

  // AI Assistant Extraction Handler
  const handleAiExtract = async (useMock = false) => {
    if (!aiPrompt.trim() || aiPrompt.trim().length < 5) {
      setAiMessage('Please enter a descriptive prompt of at least 5 characters.');
      setAiMessageType('error');
      return;
    }

    setIsExtracting(true);
    setAiMessage(null);
    setAiResult(null);

    try {
      const res = await fetch('/api/ai/extract-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, mock: useMock }),
      });

      const json = await res.json();

      if (!json.success || !json.data) {
        setAiMessageType('error');
        setAiMessage(
          json.error?.message ||
            'AI extraction could not be completed. You can fill out the form manually below.'
        );
      } else {
        setAiResult(json.data);
        setAiMessageType('success');
        setAiMessage(
          `Extracted specifications with AI. Missing ${json.data.missing_fields.length} unstated fields. Review and click "Apply to Form" below.`
        );
      }
    } catch {
      setAiMessageType('error');
      setAiMessage('Network error while reaching AI service. Please fill form manually.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Apply AI Extracted Values to Manual Form
  const handleApplyAiData = () => {
    if (!aiResult) return;

    if (aiResult.material_family) {
      setMaterialFamily(aiResult.material_family);
      if (aiResult.material_specification) {
        setMaterialSpecification(aiResult.material_specification);
      }
    }
    if (aiResult.length_mm !== null) setLengthMm(String(aiResult.length_mm));
    if (aiResult.width_mm !== null) setWidthMm(String(aiResult.width_mm));
    if (aiResult.thickness_mm !== null) setThicknessMm(String(aiResult.thickness_mm));
    if (aiResult.total_quantity !== null) setTotalQuantity(String(aiResult.total_quantity));
    if (aiResult.condition !== null) setCondition(aiResult.condition);
    if (aiResult.unit_price_bdt !== null) setUnitPriceBdt(String(aiResult.unit_price_bdt));
    if (aiResult.city !== null) setCity(aiResult.city);
    if (aiResult.raw_notes && !description) setDescription(aiPrompt);

    setAiMessage('Extracted values applied to form! Please review and verify all fields.');
    setAiMessageType('info');
  };

  // Pre-fill sample prompts for instant demoing
  const loadSamplePrompt = (type: 'steel' | 'plywood') => {
    if (type === 'steel') {
      setAiPrompt(
        'We have 40 unused stainless steel sheets, grade SS304, 2mm thick, 1000 by 500 mm, leftover from production. Price is 450 taka per sheet, available in Gazipur.'
      );
    } else {
      setAiPrompt(
        'Surplus 50 pieces commercial plywood panels, 2440x1220 mm, 18mm thickness, 1850 taka each, brand new condition in Dhaka.'
      );
    }
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

      const url = isEditing ? `/api/listings/${initialData!.id}` : '/api/listings';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': organizationId,
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!result.success) {
        setGeneralError(result.error?.message || 'Failed to save listing.');
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setGeneralError('Network error while saving listing.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isEditing ? 'Edit Surplus Material Listing' : 'Publish New Surplus Material Listing'}
            </h2>
            <p className="text-xs text-slate-500">
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

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* General Error Banner */}
          {generalError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {/* AI SMART LISTING ASSISTANT (Only in Create Mode) */}
          {!isEditing && (
            <div className="border border-blue-200 bg-gradient-to-br from-blue-50/70 to-indigo-50/40 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-900 font-semibold text-sm">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>AI Smart Material Listing Assistant</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-blue-700 font-medium">Quick Sample:</span>
                  <button
                    type="button"
                    onClick={() => loadSamplePrompt('steel')}
                    className="text-xs px-2 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 transition"
                  >
                    SS304 Sheet
                  </button>
                  <button
                    type="button"
                    onClick={() => loadSamplePrompt('plywood')}
                    className="text-xs px-2 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 transition"
                  >
                    Plywood
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-600">
                Describe your excess inventory in plain language (dimensions, grade, quantity, price, location).
                Our server-side LLM extracts structured attributes for your review.
              </p>

              <div className="space-y-2">
                <textarea
                  rows={2}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. We have 40 unused stainless steel sheets, grade SS304, 2mm thick, 1000 by 500 mm, leftover from production. Price is 450 taka per sheet in Gazipur."
                  className="w-full text-xs p-2.5 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isExtracting}
                      onClick={() => handleAiExtract(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isExtracting ? 'Analyzing Prompt...' : 'Extract with AI'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isExtracting}
                      onClick={() => handleAiExtract(true)}
                      className="text-xs text-blue-700 hover:underline px-2 py-1"
                      title="Run with deterministic heuristic simulation without external API key"
                    >
                      (Test with Mock Parser)
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Status / Result Preview */}
              {aiMessage && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                    aiMessageType === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : aiMessageType === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-blue-100/70 text-blue-800 border border-blue-200'
                  }`}
                >
                  {aiMessageType === 'error' ? (
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
                  )}
                  <div className="flex-1">
                    <p>{aiMessage}</p>
                    {aiResult && (
                      <div className="mt-2 pt-2 border-t border-emerald-200 flex flex-wrap gap-2 items-center">
                        <button
                          type="button"
                          onClick={handleApplyAiData}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-sm transition flex items-center gap-1"
                        >
                          <span>Apply to Form</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] text-slate-500">
                          Extracted: {aiResult.material_family} ({aiResult.material_specification || 'No spec'}),{' '}
                          {aiResult.length_mm}x{aiResult.width_mm}x{aiResult.thickness_mm} mm,{' '}
                          {aiResult.total_quantity} pcs @ {aiResult.unit_price_bdt} BDT
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MANUAL SPECIFICATION FORM */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Supplier Organization */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Supplier Organization (Demo Profile)
              </label>
              <select
                disabled={isEditing}
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="w-full text-sm p-2.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Material Family <span className="text-red-500">*</span>
                </label>
                <select
                  value={materialFamily}
                  onChange={(e) => handleFamilyChange(e.target.value as MaterialFamily)}
                  className="w-full text-sm p-2.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {MATERIAL_FAMILIES.map((fam) => (
                    <option key={fam} value={fam}>
                      {fam === 'STAINLESS_STEEL_SHEET' ? 'Stainless Steel Sheet' : 'Plywood Panel'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Grade / Technical Specification <span className="text-red-500">*</span>
                </label>
                <select
                  value={materialSpecification}
                  onChange={(e) => setMaterialSpecification(e.target.value)}
                  className="w-full text-sm p-2.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {MATERIAL_SPECIFICATIONS[materialFamily].map((spec) => (
                    <option key={spec} value={spec}>
                      {spec}
                    </option>
                  ))}
                </select>
                {formErrors.material_specification && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.material_specification}</p>
                )}
              </div>
            </div>

            {/* Dimensions (Length, Width, Thickness) */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Length (mm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 2400"
                  value={lengthMm}
                  onChange={(e) => setLengthMm(e.target.value)}
                  className={`w-full text-sm p-2.5 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    formErrors.length_mm ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                  }`}
                />
                {formErrors.length_mm && (
                  <p className="text-[11px] text-red-600 mt-1">{formErrors.length_mm}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Width (mm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 1200"
                  value={widthMm}
                  onChange={(e) => setWidthMm(e.target.value)}
                  className={`w-full text-sm p-2.5 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    formErrors.width_mm ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                  }`}
                />
                {formErrors.width_mm && (
                  <p className="text-[11px] text-red-600 mt-1">{formErrors.width_mm}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Thickness (mm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 2.0"
                  value={thicknessMm}
                  onChange={(e) => setThicknessMm(e.target.value)}
                  className={`w-full text-sm p-2.5 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    formErrors.thickness_mm ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                  }`}
                />
                {formErrors.thickness_mm && (
                  <p className="text-[11px] text-red-600 mt-1">{formErrors.thickness_mm}</p>
                )}
              </div>
            </div>

            {/* Quantity & Reserved Stock Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Total Quantity (Pieces) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="e.g. 50"
                  value={totalQuantity}
                  onChange={(e) => setTotalQuantity(e.target.value)}
                  className={`w-full text-sm p-2.5 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    formErrors.total_quantity ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                  }`}
                />
                {formErrors.total_quantity && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.total_quantity}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Condition <span className="text-red-500">*</span>
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as MaterialCondition)}
                  className="w-full text-sm p-2.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between">
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
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Unit Price (BDT / piece) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 4200"
                  value={unitPriceBdt}
                  onChange={(e) => setUnitPriceBdt(e.target.value)}
                  className={`w-full text-sm p-2.5 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    formErrors.unit_price_bdt ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                  }`}
                />
                {formErrors.unit_price_bdt && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.unit_price_bdt}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  City / Location <span className="text-red-500">*</span>
                </label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full text-sm p-2.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {BANGLADESH_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {formErrors.city && <p className="text-xs text-red-600 mt-1">{formErrors.city}</p>}
              </div>
            </div>

            {/* Description & Optional Image URL */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Description / Storage Condition
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Stored indoors on pallets, clean edges, factory wrapped."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-sm p-2.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Photo URL (Optional human inspection reference)
              </label>
              <input
                type="url"
                placeholder="https://example.com/images/metal-sheet.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full text-sm p-2.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Photographs support visual check only; technical specifications are certified by numeric fields above.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold shadow-sm transition flex items-center gap-2"
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
