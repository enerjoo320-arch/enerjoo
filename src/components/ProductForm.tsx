import React, { useRef, useState, useEffect } from 'react';
import { Upload, Image as ImageIcon, Loader2, AlertCircle, Plus, Trash2, Sparkles, CheckCircle2, Ruler, Maximize2, Calculator, Zap, Droplets } from 'lucide-react';
import { translations } from '../translations';
import { uploadProductImage } from '../services/uploadService';
import { autoCompressImage, formatFileSize, MAX_FINAL_IMAGE_SIZE_BYTES } from '../utils/imageCompression';
import { Product } from '../types';
import { parseDimensionsString } from '../services/firestoreService';
import { classifyInverterType, classifyInverterPhase, classifyInverter } from '../utils/inverterClassification';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { SUPPLIER_CONTACT_PHONE_DISPLAY } from '../constants/contact';
import { isRawUidOrId } from '../utils/supplierUtils';
import { formatCleanNumber, cleanDecimal, calculateMetricArea } from '../utils/dimensionUtils';
import {
  parseAndValidateNumericField,
  stripLegacyUnitFromNumericInput,
} from '../utils/productNumericValidation';

export const STANDARD_PUMP_HP_OPTIONS = [1, 2, 3, 5.5, 7.5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

export const HP_TO_KW_MAP: Record<string, string> = {
  '1': '0.75',
  '1.5': '1.1',
  '2': '1.5',
  '3': '2.2',
  '4': '3',
  '5': '3.7',
  '5.5': '4',
  '7.5': '5.5',
  '10': '7.5',
  '15': '11',
  '20': '15',
  '25': '18.5',
  '30': '22',
  '40': '30',
  '50': '37',
  '60': '45',
  '75': '55',
  '100': '75'
};

export const KW_TO_HP_MAP: Record<string, string> = {
  '0.75': '1',
  '1.1': '1.5',
  '1.5': '2',
  '2.2': '3',
  '3': '4',
  '3.7': '5',
  '4': '5.5',
  '5.5': '7.5',
  '7.5': '10',
  '11': '15',
  '15': '20',
  '18.5': '25',
  '22': '30',
  '30': '40',
  '37': '50',
  '45': '60',
  '55': '75',
  '75': '100'
};

const normalizeCategory = (cat?: string): string => {
  if (!cat) return 'panels';
  const c = cat.toLowerCase();
  if (c.includes('panel')) return 'panels';
  if (c.includes('invert')) return 'inverters';
  if (c.includes('batter')) return 'batteries';
  if (c.includes('pump') || c.includes('مضخ') || c.includes('طلمب')) return 'pumps';
  if (c.includes('mount') || c.includes('structur')) return 'mounting';
  if (c.includes('protect')) return 'protection';
  if (c.includes('combin')) return 'combiner';
  if (c.includes('cable')) return 'cables';
  if (c.includes('mc4')) return 'mc4';
  if (c.includes('seal')) return 'sealings';
  if (c.includes('clamp')) return 'clamps';
  return c;
};

const extractInitialFormData = (data?: Product | null) => {
  if (!data) {
    return {
      name: '',
      brand: '',
      category: 'panels',
      price: '',
      phone: SUPPLIER_CONTACT_PHONE_DISPLAY,
      description: '',
      power: '',
      powerKw: '',
      hp: '',
      efficiency: '',
      warranty: '',
      type: '',
      voltage: '',
      voc: '',
      current: '',
      isc: '',
      weight: '',
      mppt: '',
      mpptCount: '',
      maxPvVoltage: '',
      phase: 'Three Phase',
      batterySupport: false,
      capacity: '',
      crossSection: '',
      length: '',
      material: '',
      maxWind: '',
      ipRating: '',
      poles: '',
      quantity: '',
      color: '',
      status: 'available' as 'available' | 'limited' | 'out_of_stock',
      dimLength: '',
      dimWidth: '',
      dimThickness: '',
      dimensionUnit: 'mm' as 'mm' | 'cm' | 'm',
      area: '',
    };
  }

  const category = normalizeCategory(data.category as string);
  const specs = data.specs || {};

  // Extract power in Watts or kW
  let power = '';
  let powerKw = '';
  if (data.power !== undefined && data.power !== null && data.power > 0) {
    power = stripLegacyUnitFromNumericInput(data.power);
    powerKw = stripLegacyUnitFromNumericInput(data.power / 1000);
  }
  if (specs.power !== undefined && specs.power !== null && specs.power !== '' && Number(specs.power) > 0) {
    power = stripLegacyUnitFromNumericInput(specs.power);
  }
  if (specs.powerKw !== undefined && specs.powerKw !== null && specs.powerKw !== '') {
    powerKw = stripLegacyUnitFromNumericInput(specs.powerKw);
    if (!power && !isNaN(parseFloat(powerKw))) power = (parseFloat(powerKw) * 1000).toString();
  }
  if (specs.ratedPowerKw !== undefined && specs.ratedPowerKw !== null && specs.ratedPowerKw !== '') {
    powerKw = stripLegacyUnitFromNumericInput(specs.ratedPowerKw);
    if (!power && !isNaN(parseFloat(powerKw))) power = (parseFloat(powerKw) * 1000).toString();
  }

  // Extract horsepower for pump inverters and motors
  let hp = '';
  if ((data as any).hp !== undefined && (data as any).hp !== null && (data as any).hp !== '') {
    hp = stripLegacyUnitFromNumericInput((data as any).hp);
  } else if (specs.hp !== undefined && specs.hp !== null && specs.hp !== '') {
    hp = stripLegacyUnitFromNumericInput(specs.hp);
  } else if (specs.horsepower !== undefined && specs.horsepower !== null && specs.horsepower !== '') {
    hp = stripLegacyUnitFromNumericInput(specs.horsepower);
  } else if (specs.horsePower !== undefined && specs.horsePower !== null && specs.horsePower !== '') {
    hp = stripLegacyUnitFromNumericInput(specs.horsePower);
  } else if (specs.pumpHorsepower !== undefined && specs.pumpHorsepower !== null && specs.pumpHorsepower !== '') {
    hp = stripLegacyUnitFromNumericInput(specs.pumpHorsepower);
  } else if (specs.motorHp !== undefined && specs.motorHp !== null && specs.motorHp !== '') {
    hp = stripLegacyUnitFromNumericInput(specs.motorHp);
  } else if (specs.motorPowerRange && typeof specs.motorPowerRange === 'string') {
    const m = specs.motorPowerRange.match(/(\d+(?:\.\d+)?)\s*(?:hp|حصان)/i);
    if (m) hp = m[1];
  }

  // If hp is found but powerKw is missing, calculate powerKw & power
  if (hp && !powerKw) {
    const numHp = parseFloat(hp);
    if (!isNaN(numHp)) {
      powerKw = HP_TO_KW_MAP[hp.trim()] || (numHp * 0.7457).toFixed(1);
      if (!power) power = Math.round(parseFloat(powerKw) * 1000).toString();
    }
  }

  // Extract voltage (for inverters keep AC voltage string like "380/400", for panels/batteries strip legacy unit suffix)
  const rawVoltage = (
    (category === 'inverters'
      ? (specs.acVoltageV || (data as any).ac_voltage_v || specs.voltage)
      : (specs.vmpV || (data as any).vmp_v || specs.nominalVoltage || (data as any).nominal_voltage_v || (data as any).battery_voltage_v || specs.voltage)) ||
    ''
  ).toString();
  const voltage = category === 'inverters' || category === 'cables' || category === 'protection' || category === 'combiner'
    ? rawVoltage
    : stripLegacyUnitFromNumericInput(rawVoltage);

  // Extract Voc
  const voc = stripLegacyUnitFromNumericInput(
    specs.vocV ?? (data as any).voc_v ?? specs.Voc ?? (data as any).Voc ?? ''
  );

  // Extract current
  const rawCurrent = (
    specs.impA ||
    (data as any).imp_a ||
    specs.current ||
    specs.maxContinuousDischargeCurrentA ||
    (data as any).max_continuous_discharge_current_a ||
    ''
  ).toString();
  const current = category === 'panels' || category === 'batteries' || category === 'pumps'
    ? stripLegacyUnitFromNumericInput(rawCurrent)
    : rawCurrent;

  // Extract Isc
  const isc = stripLegacyUnitFromNumericInput(
    specs.iscA ?? (data as any).isc_a ?? specs.Isc ?? (data as any).Isc ?? ''
  );

  // Extract weight
  const weight = stripLegacyUnitFromNumericInput(
    specs.weightKg ?? (data as any).weight_kg ?? specs.weight ?? ''
  );

  // Extract capacity
  const capacity = stripLegacyUnitFromNumericInput(
    specs.capacityAh ?? (data as any).capacity_ah ?? specs.capacity ?? ''
  );

  // Extract type
  const type = (
    specs.type ||
    specs.productType ||
    specs.technology ||
    specs.cellType ||
    (data as any).product_type ||
    (data as any).technology ||
    ''
  ).toString();

  // Extract MPPT voltage range
  const mppt = (
    specs.pvMpptVoltageRangeV ||
    specs.mppt ||
    specs.mpptVoltageRange ||
    (data as any).pv_mppt_voltage_range_v ||
    (data as any).mppt ||
    ''
  ).toString();

  // Extract description
  const description = (
    data.description ||
    data.notes ||
    specs.description ||
    specs.notes ||
    (data as any).notes ||
    (data as any).description ||
    ''
  ).toString();

  // Extract efficiency
  let efficiency = '';
  if (data.efficiency !== undefined && data.efficiency !== null && data.efficiency > 0) {
    efficiency = stripLegacyUnitFromNumericInput(data.efficiency);
  } else if (specs.efficiency !== undefined && specs.efficiency !== null && specs.efficiency !== '') {
    efficiency = stripLegacyUnitFromNumericInput(specs.efficiency);
  } else if (specs.peakEfficiency !== undefined && specs.peakEfficiency !== null && specs.peakEfficiency !== '') {
    efficiency = stripLegacyUnitFromNumericInput(specs.peakEfficiency);
  } else if ((data as any).efficiency_percent !== undefined && (data as any).efficiency_percent !== null) {
    efficiency = stripLegacyUnitFromNumericInput((data as any).efficiency_percent);
  }

  // Extract warranty
  let warranty = '';
  if (data.warranty !== undefined && data.warranty !== null && data.warranty > 0) {
    warranty = stripLegacyUnitFromNumericInput(data.warranty);
  } else if (specs.warranty !== undefined && specs.warranty !== null && specs.warranty !== '') {
    warranty = stripLegacyUnitFromNumericInput(specs.warranty);
  } else if ((data as any).warranty_years !== undefined && (data as any).warranty_years !== null) {
    warranty = stripLegacyUnitFromNumericInput((data as any).warranty_years);
  }

  // Dimensions
  let dimLength = data.length !== undefined && data.length !== null
    ? formatCleanNumber(data.length)
    : (specs.length && category !== 'cables' ? formatCleanNumber(specs.length) : '');
  let dimWidth = data.width !== undefined && data.width !== null
    ? formatCleanNumber(data.width)
    : (specs.width ? formatCleanNumber(specs.width) : '');
  let dimThickness = data.thickness !== undefined && data.thickness !== null
    ? formatCleanNumber(data.thickness)
    : (specs.thickness ? formatCleanNumber(specs.thickness) : '');
  let dimensionUnit = ((data.dimensionUnit || specs.dimensionUnit || 'mm') as 'mm' | 'cm' | 'm');
  let area = data.area !== undefined && data.area !== null && data.area > 0
    ? formatCleanNumber(data.area, 3)
    : (specs.area && Number(specs.area) > 0 ? formatCleanNumber(specs.area, 3) : '');

  // Fallback parsing for dimensions string if length/width are missing
  if (!dimLength || !dimWidth) {
    const rawDimStr = (data as any).dimensions_mm || specs.dimensionsMm || (data as any).dimensions;
    if (rawDimStr) {
      const parsed = parseDimensionsString(rawDimStr);
      if (parsed.length && !dimLength) dimLength = formatCleanNumber(parsed.length);
      if (parsed.width && !dimWidth) dimWidth = formatCleanNumber(parsed.width);
      if (parsed.thickness && !dimThickness) dimThickness = formatCleanNumber(parsed.thickness);
      if (parsed.dimensionUnit) dimensionUnit = parsed.dimensionUnit;
      if (parsed.area && !area) area = formatCleanNumber(parsed.area, 3);
    }
  }

  // Heuristic auto-fallback for known models if technical specs were empty
  let finalType = type;
  let finalVoltage = voltage;
  let finalCurrent = current;
  let finalWeight = weight;
  let finalMppt = mppt;
  let finalDescription = description;

  const prodNameLower = ((data.name || '') + ' ' + (data.nameAr || '') + ' ' + ((data as any).model || '') + ' ' + (data.brand || '')).toLowerCase();
  if (category === 'panels' && (prodNameLower.includes('620') || prodNameLower.includes('66hl4m') || prodNameLower.includes('jinco') || prodNameLower.includes('jinko'))) {
    if (!finalType) finalType = 'Monocrystalline N-type';
    if (!finalVoltage) finalVoltage = '41.5';
    if (!finalCurrent) finalCurrent = '14.94';
    if (!finalWeight) finalWeight = '28';
    if (!dimLength) dimLength = '2384';
    if (!dimWidth) dimWidth = '1303';
    if (!dimThickness) dimThickness = '35';
    if (!area) area = '3.106';
    if (!finalDescription) finalDescription = 'لوح شمسي عالي الكفاءة بقدرة 620 واط بتقنية N-type TOPCon مناسب للمشاريع السكنية والتجارية ومحطات الطاقة الشمسية.';
  } else if (category === 'inverters' && (prodNameLower.includes('sun2000') || prodNameLower.includes('huawei'))) {
    if (!finalType) finalType = 'Three Phase On-Grid Inverter';
    if (!finalVoltage) finalVoltage = '380/400';
    if (!finalCurrent) finalCurrent = '8.5';
    if (!finalWeight) finalWeight = '17';
    if (!dimLength) dimLength = '525';
    if (!dimWidth) dimWidth = '470';
    if (!dimThickness) dimThickness = '146';
    if (!finalMppt) finalMppt = '160 - 950 V (2 MPPT)';
    if (!finalDescription) finalDescription = 'محول طاقة شمسية ذكي ثلاثي الأوجه بقدرة 5 كيلوواط من هواوي بكفاءة عالية وحماية مدمجة مع 2 متتبع MPPT.';
  }

  const rawMpptCount =
    specs.mpptCount ??
    specs.numberOfMppt ??
    (data as any)?.mppt_count ??
    (data && category === 'inverters' && classifyInverter(data).mppt_count !== 'Unknown'
      ? classifyInverter(data).mppt_count
      : '');
  const rawMaxPvVoltage =
    specs.maxPvVoltage ??
    specs.maxPvOpenCircuitVoltageV ??
    (data as any)?.max_pv_open_circuit_voltage_v ??
    (data && category === 'inverters' && classifyInverter(data).max_pv_voltage_v !== 'Unknown'
      ? classifyInverter(data).max_pv_voltage_v
      : '');

  return {
    name: data.nameAr || data.name || (data as any).model || '',
    brand: data.brand || '',
    category,
    price: data.price !== undefined && data.price !== null ? stripLegacyUnitFromNumericInput(data.price) : '',
    phone: data.suppliers?.[0]?.phone || SUPPLIER_CONTACT_PHONE_DISPLAY,
    description: finalDescription,
    power,
    powerKw,
    hp,
    efficiency,
    warranty,
    type: finalType,
    voltage: finalVoltage,
    voc,
    current: finalCurrent,
    isc,
    weight: finalWeight,
    mppt: finalMppt,
    capacity,
    crossSection: (specs.crossSection || '').toString(),
    length: (specs.cableLength || (category === 'cables' ? specs.length : '') || '').toString(),
    material: (specs.material || '').toString(),
    maxWind: (specs.maxWind || '').toString(),
    ipRating: (specs.ipRating || '').toString(),
    poles: (specs.poles || '').toString(),
    quantity: (specs.quantity || '').toString(),
    color: (specs.color || '').toString(),
    status: (data.status || 'available') as 'available' | 'limited' | 'out_of_stock',
    phase: (specs.phase || (data as any).phase || (category === 'inverters' ? classifyInverterPhase(data) : 'Three Phase')).toString(),
    batterySupport: specs.batterySupport !== undefined ? Boolean(specs.batterySupport) : (category === 'inverters' ? (finalType === 'Hybrid' || finalType === 'Off-Grid') : false),
    mpptCount: stripLegacyUnitFromNumericInput(rawMpptCount),
    maxPvVoltage: stripLegacyUnitFromNumericInput(rawMaxPvVoltage),
    dimLength,
    dimWidth,
    dimThickness,
    dimensionUnit,
    area,
  };
};

export const ProductForm: React.FC<{ 
  lang: 'ar' | 'en'; 
  onSave: (product: Omit<Product, 'id'>) => void | Promise<void>; 
  onCancel: () => void;
  initialData?: Product | null;
}> = ({ lang, onSave, onCancel, initialData }) => {
  const t = translations[lang];
  const isAr = lang === 'ar';
  const { user } = useAuth();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const draftProductIdRef = useRef<string>(
    initialData?.id
      ? String(initialData.id)
      : `PROD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase()
  );
  
  const [formData, setFormData] = useState(() => extractInitialFormData(initialData));
  const [uploadedMainImageUrl, setUploadedMainImageUrl] = useState<string | null>(null);

  // Sync state whenever initialData changes (e.g. user selects another product or switches views)
  useEffect(() => {
    setFormData(extractInitialFormData(initialData));
    setImagePreview(initialData?.image || null);
    setUploadedMainImageUrl(null);
    setExistingAdditionalUrls(initialData?.additionalImages || []);
    draftProductIdRef.current = initialData?.id
      ? String(initialData.id)
      : `PROD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();
  }, [initialData]);

  const handleHpChange = (rawHp: string) => {
    setFormData(prev => {
      const clean = rawHp.trim();
      const num = parseFloat(clean);
      let calcKw = prev.powerKw;
      let calcPower = prev.power;
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(clean) && !isNaN(num) && num > 0) {
        calcKw = HP_TO_KW_MAP[clean] || (num * 0.7457).toFixed(1);
        calcPower = Math.round(parseFloat(calcKw) * 1000).toString();
      }
      return {
        ...prev,
        hp: rawHp,
        powerKw: calcKw,
        power: calcPower,
        // If type was On-Grid and user enters HP for pump, auto-switch type to Pump Inverter for clarity
        type: (prev.category === 'inverters' && prev.type === 'On-Grid' && !prev.hp && rawHp) ? 'Pump Inverter' : prev.type
      };
    });
  };

  const handlePowerKwChange = (rawKw: string) => {
    setFormData(prev => {
      const trimmed = rawKw.trim();
      const num = parseFloat(trimmed);
      let calcHp = prev.hp;
      let calcPower = prev.power;
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed) && !isNaN(num) && num > 0) {
        calcPower = Math.round(num * 1000).toString();
        if (prev.category === 'pumps' || prev.type === 'Pump Inverter' || prev.hp) {
          calcHp = KW_TO_HP_MAP[trimmed] || (num / 0.7457).toFixed(1);
        }
      }
      return {
        ...prev,
        powerKw: rawKw,
        power: calcPower,
        hp: calcHp
      };
    });
  };

  const getFieldsForCategory = (cat: string) => {
    const common = ['price', 'warranty'];
    switch (cat) {
      case 'panels':
        return [...common, 'power', 'efficiency', 'type', 'voltage', 'voc', 'current', 'isc', 'weight'];
      case 'inverters':
        return [...common, 'powerKw', 'hp', 'efficiency', 'type', 'mppt', 'maxPvVoltage', 'mpptCount', 'voltage', 'current', 'weight'];
      case 'batteries':
        return [...common, 'capacity', 'voltage', 'type', 'weight'];
      case 'pumps':
        return [...common, 'hp', 'powerKw', 'voltage', 'current', 'type', 'weight'];
      case 'cables':
        return ['price', 'crossSection', 'length', 'voltage', 'material', 'color'];
      case 'mounting':
        return ['price', 'material', 'maxWind', 'warranty'];
      case 'protection':
        return ['price', 'poles', 'current', 'voltage', 'type'];
      case 'combiner':
        return ['price', 'ipRating', 'poles', 'voltage', 'current'];
      case 'mc4':
      case 'sealings':
      case 'clamps':
        return ['price', 'quantity', 'material', 'type'];
      default:
        return [...common, 'power', 'efficiency', 'type'];
    }
  };

  const fields = getFieldsForCategory(formData.category);

  // Real-time calculation of area based on length, width, and unit
  const lengthNum = parseFloat(formData.dimLength);
  const widthNum = parseFloat(formData.dimWidth);
  const hasDimensions = !isNaN(lengthNum) && !isNaN(widthNum) && lengthNum > 0 && widthNum > 0;

  const metricResult = hasDimensions 
    ? calculateMetricArea(lengthNum, widthNum, formData.dimensionUnit)
    : null;

  const calculatedAreaInM2 = metricResult ? metricResult.areaInM2 : 0;
  const conversionText = metricResult ? metricResult.conversionText : '';

  // Fallback to preserved area for existing products if dimensions are not specified
  const currentSavedAreaNum = cleanDecimal(formData.area, 4);
  const effectiveArea = hasDimensions ? calculatedAreaInM2 : currentSavedAreaNum;

  // Main product image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(initialData?.image || null);
  const [isCompressingMain, setIsCompressingMain] = useState(false);
  const [compressionStatus, setCompressionStatus] = useState<string | null>(null);
  const [imageSizeInfo, setImageSizeInfo] = useState<string | null>(null);

  // Additional product images state
  const [additionalFiles, setAdditionalFiles] = useState<Array<{
    id: string;
    file: File;
    preview: string;
    sizeInfo?: string;
  }>>([]);
  const [existingAdditionalUrls, setExistingAdditionalUrls] = useState<string[]>(
    initialData?.additionalImages || []
  );
  const [isCompressingAdditional, setIsCompressingAdditional] = useState(false);
  const additionalInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleImageClick = () => {
    imageInputRef.current?.click();
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      const ext = selected.name.split('.').pop()?.toLowerCase() || '';
      const isAllowed = allowed.includes(selected.type.toLowerCase()) || ['jpg', 'jpeg', 'png', 'webp'].includes(ext);

      if (!isAllowed) {
        setUploadError(lang === 'ar' ? 'نوع الملف غير مدعوم. يرجى اختيار صورة JPG أو PNG أو WebP.' : 'Invalid file type. Only JPG, JPEG, PNG, and WebP are allowed.');
        return;
      }

      setUploadError(null);
      setUploadedMainImageUrl(null);

      // Requirement: Do NOT reject images larger than 5 MB.
      // If <= 5 MB: Upload normally without unnecessary compression.
      // If > 5 MB: Automatically compress before uploading.
      if (selected.size > MAX_FINAL_IMAGE_SIZE_BYTES) {
        setIsCompressingMain(true);
        const defaultMsg = lang === 'ar' ? 'جاري تحسين وضغط الصورة قبل الرفع...' : 'Optimizing and compressing image before upload...';
        setCompressionStatus(defaultMsg);

        try {
          // Immediate visual preview while compression completes
          const tempUrl = URL.createObjectURL(selected);
          setImagePreview(tempUrl);

          const result = await autoCompressImage(selected, {
            lang,
            onStatusChange: (status) => setCompressionStatus(status),
          });

          setImageFile(result.file);
          const compressedUrl = URL.createObjectURL(result.file);
          setImagePreview(compressedUrl);
          setImageSizeInfo(
            `${formatFileSize(result.originalSize)} ← ${formatFileSize(result.compressedSize)} (${lang === 'ar' ? 'تم الضغط بنجاح' : 'Optimized'})`
          );
        } catch (compErr) {
          console.error('Compression error:', compErr);
          setImageFile(selected);
        } finally {
          setIsCompressingMain(false);
          setCompressionStatus(null);
        }
      } else {
        setImageFile(selected);
        try {
          const previewUrl = URL.createObjectURL(selected);
          setImagePreview(previewUrl);
          setImageSizeInfo(formatFileSize(selected.size));
        } catch {
          // fallback
        }
      }
    }
  };

  const handleAdditionalImagesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files: File[] = Array.from(e.target.files);
      setIsCompressingAdditional(true);
      const defaultMsg = lang === 'ar' ? 'جاري تحسين وضغط الصورة قبل الرفع...' : 'Optimizing and compressing image before upload...';
      setCompressionStatus(defaultMsg);

      try {
        const newItems: Array<{ id: string; file: File; preview: string; sizeInfo?: string }> = [];

        for (const rawFile of files) {
          const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
          const ext = rawFile.name.split('.').pop()?.toLowerCase() || '';
          const isAllowed = allowed.includes(rawFile.type.toLowerCase()) || ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
          if (!isAllowed) continue;

          const id = Math.random().toString(36).substring(2, 9);

          if (rawFile.size > MAX_FINAL_IMAGE_SIZE_BYTES) {
            const result = await autoCompressImage(rawFile, {
              lang,
              onStatusChange: (status) => setCompressionStatus(status),
            });
            newItems.push({
              id,
              file: result.file,
              preview: URL.createObjectURL(result.file),
              sizeInfo: `${formatFileSize(result.originalSize)} ← ${formatFileSize(result.compressedSize)}`,
            });
          } else {
            newItems.push({
              id,
              file: rawFile,
              preview: URL.createObjectURL(rawFile),
              sizeInfo: formatFileSize(rawFile.size),
            });
          }
        }

        setAdditionalFiles((prev) => [...prev, ...newItems]);
      } catch (err) {
        console.error('Error handling additional images:', err);
      } finally {
        setIsCompressingAdditional(false);
        setCompressionStatus(null);
        if (additionalInputRef.current) {
          additionalInputRef.current.value = '';
        }
      }
    }
  };

  const handleRemoveAdditional = (id: string) => {
    setAdditionalFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleRemoveExistingAdditional = (index: number) => {
    setExistingAdditionalUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !auth.currentUser) {
      setUploadError(
        lang === 'ar'
          ? 'يرجى تسجيل الدخول إلى حسابك في Enerjoo أولاً لتتمكن من إضافة أو تعديل المنتجات.'
          : 'Please sign in to your Enerjoo account first to add or edit products.'
      );
      return;
    }
    
    if (user?.type === 'supplier' && user?.rejected) {
      setUploadError(
        lang === 'ar'
          ? 'تم رفض أو تعليق حساب المورد من قبل إدارة Enerjoo. لا يمكنك إضافة أو نشر منتجات.'
          : 'This supplier account is rejected or suspended by Enerjoo administration.'
      );
      return;
    }

    if (user?.type === 'supplier' && user?.verified !== true) {
      setUploadError(
        lang === 'ar'
          ? 'حسابك قيد المراجعة. يمكنك إضافة منتجاتك بعد اعتماد حسابك من إدارة Enerjoo.'
          : 'Your account is under review. You can add your products after your account is approved by Enerjoo administration.'
      );
      return;
    }

    setUploadError(null);

    // =========================================================================
    // Strict Pre-Flight Numeric Validation (Names the Exact Offending Field)
    // =========================================================================
    const priceCheck = parseAndValidateNumericField(formData.price, 'price', {
      required: true,
      allowZero: true,
      lang,
    });
    if (!priceCheck.valid) {
      setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${priceCheck.errorMessage}`);
      return;
    }

    const powerRequired = formData.category === 'panels';
    const powerCheck = parseAndValidateNumericField(formData.power, 'power_w', {
      required: powerRequired,
      allowZero: false,
      lang,
    });
    if (!powerCheck.valid) {
      setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${powerCheck.errorMessage}`);
      return;
    }

    const isPumpInverter = formData.category === 'inverters' && formData.type === 'Pump Inverter';
    const powerKwRequired = formData.category === 'inverters' && !isPumpInverter;
    const powerKwCheck = parseAndValidateNumericField(formData.powerKw, 'rated_power_kw', {
      required: powerKwRequired,
      allowZero: false,
      lang,
    });
    if (!powerKwCheck.valid) {
      setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${powerKwCheck.errorMessage}`);
      return;
    }

    const hpRequired = formData.category === 'pumps' || isPumpInverter;
    const hpCheck = parseAndValidateNumericField(formData.hp, 'hp', {
      required: hpRequired,
      allowZero: false,
      lang,
    });
    if (!hpCheck.valid) {
      setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${hpCheck.errorMessage}`);
      return;
    }

    const efficiencyCheck = parseAndValidateNumericField(formData.efficiency, 'efficiency', {
      required: false,
      allowZero: false,
      lang,
    });
    if (!efficiencyCheck.valid) {
      setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${efficiencyCheck.errorMessage}`);
      return;
    }

    const warrantyCheck = parseAndValidateNumericField(formData.warranty, 'warranty', {
      required: false,
      allowZero: true,
      lang,
    });
    if (!warrantyCheck.valid) {
      setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${warrantyCheck.errorMessage}`);
      return;
    }

    // Validate voltage when category expects a numeric voltage (panels -> Vmp, batteries -> nominal_voltage_v)
    let vmpNum: number | null = null;
    let vocNum: number | null = null;
    let impNum: number | null = null;
    let iscNum: number | null = null;
    let batteryVoltageNum: number | null = null;
    let acVoltageStr: string | undefined = undefined;

    if (formData.category === 'panels') {
      const vmpCheck = parseAndValidateNumericField(formData.voltage, 'vmp_v', {
        required: false,
        allowZero: false,
        lang,
      });
      if (!vmpCheck.valid) {
        setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${vmpCheck.errorMessage}`);
        return;
      }
      vmpNum = vmpCheck.value;

      const vocCheck = parseAndValidateNumericField(formData.voc, 'voc_v', {
        required: false,
        allowZero: false,
        lang,
      });
      if (!vocCheck.valid) {
        setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${vocCheck.errorMessage}`);
        return;
      }
      vocNum = vocCheck.value;

      const impCheck = parseAndValidateNumericField(formData.current, 'imp_a', {
        required: false,
        allowZero: false,
        lang,
      });
      if (!impCheck.valid) {
        setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${impCheck.errorMessage}`);
        return;
      }
      impNum = impCheck.value;

      const iscCheck = parseAndValidateNumericField(formData.isc, 'isc_a', {
        required: false,
        allowZero: false,
        lang,
      });
      if (!iscCheck.valid) {
        setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${iscCheck.errorMessage}`);
        return;
      }
      iscNum = iscCheck.value;
    } else if (formData.category === 'batteries') {
      const batVoltCheck = parseAndValidateNumericField(formData.voltage, 'nominal_voltage_v', {
        required: false,
        allowZero: false,
        lang,
      });
      if (!batVoltCheck.valid) {
        setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${batVoltCheck.errorMessage}`);
        return;
      }
      batteryVoltageNum = batVoltCheck.value;
    } else if (formData.category === 'inverters') {
      acVoltageStr = formData.voltage?.trim() || undefined;
    }

    // Inverter specific numeric fields: max_pv_open_circuit_voltage_v & number_of_mppt (mppt_count)
    let maxPvVoltageNum: number | null = null;
    let mpptCountNum: number | null = null;
    if (formData.category === 'inverters') {
      const maxPvCheck = parseAndValidateNumericField(
        formData.maxPvVoltage,
        'max_pv_open_circuit_voltage_v',
        {
          required: false,
          allowZero: false,
          lang,
        }
      );
      if (!maxPvCheck.valid) {
        setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${maxPvCheck.errorMessage}`);
        return;
      }
      maxPvVoltageNum = maxPvCheck.value;

      const mpptCountCheck = parseAndValidateNumericField(
        formData.mpptCount,
        'number_of_mppt',
        {
          required: false,
          integerOnly: true,
          allowZero: false,
          lang,
        }
      );
      if (!mpptCountCheck.valid) {
        setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${mpptCountCheck.errorMessage}`);
        return;
      }
      mpptCountNum = mpptCountCheck.value;
    }

    const weightCheck = parseAndValidateNumericField(formData.weight, 'weight_kg', {
      required: false,
      allowZero: false,
      lang,
    });
    if (!weightCheck.valid) {
      setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${weightCheck.errorMessage}`);
      return;
    }

    const capacityCheck = parseAndValidateNumericField(formData.capacity, 'capacity_ah', {
      required: formData.category === 'batteries',
      allowZero: false,
      lang,
    });
    if (!capacityCheck.valid) {
      setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${capacityCheck.errorMessage}`);
      return;
    }

    const dimLengthCheck = parseAndValidateNumericField(formData.dimLength, 'length', {
      required: false,
      allowZero: false,
      lang,
    });
    if (!dimLengthCheck.valid) {
      setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${dimLengthCheck.errorMessage}`);
      return;
    }

    const dimWidthCheck = parseAndValidateNumericField(formData.dimWidth, 'width', {
      required: false,
      allowZero: false,
      lang,
    });
    if (!dimWidthCheck.valid) {
      setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${dimWidthCheck.errorMessage}`);
      return;
    }

    const dimThicknessCheck = parseAndValidateNumericField(formData.dimThickness, 'thickness', {
      required: false,
      allowZero: false,
      lang,
    });
    if (!dimThicknessCheck.valid) {
      setUploadError(`فشل حفظ التغيير في قاعدة البيانات: ${dimThicknessCheck.errorMessage}`);
      return;
    }

    setIsUploading(true);
    
    try {
      let imageUrl = uploadedMainImageUrl || initialData?.image || (initialData as any)?.image_url || '';
      // Preserve existing datasheet if product previously had one, without adding PDF upload UI
      const datasheetUrl = initialData?.datasheetUrl || '';

      // Upload main product image if selected and not already uploaded in a previous attempt
      if (imageFile && !uploadedMainImageUrl) {
        imageUrl = await uploadProductImage(imageFile, (status) => setCompressionStatus(status), lang);
        setUploadedMainImageUrl(imageUrl);
      }

      // Upload any additional product images
      const finalAdditionalUrls = [...existingAdditionalUrls];
      for (const item of additionalFiles) {
        const uploadedUrl = await uploadProductImage(item.file, (status) => setCompressionStatus(status), lang);
        if (uploadedUrl) {
          finalAdditionalUrls.push(uploadedUrl);
        }
      }

      const lengthVal = dimLengthCheck.value !== null ? cleanDecimal(dimLengthCheck.value, 4) : undefined;
      const widthVal = dimWidthCheck.value !== null ? cleanDecimal(dimWidthCheck.value, 4) : undefined;
      const thicknessVal = dimThicknessCheck.value !== null ? cleanDecimal(dimThicknessCheck.value, 4) : undefined;
      const dimensionUnitVal = formData.dimensionUnit;

      const savedAreaFallback = formData.area
        ? cleanDecimal(formData.area, 4)
        : initialData?.area
        ? cleanDecimal(initialData.area, 4)
        : 0;
      const finalArea =
        calculatedAreaInM2 > 0
          ? calculatedAreaInM2
          : savedAreaFallback > 0
          ? savedAreaFallback
          : undefined;

      const cleanHp = hpCheck.value !== null ? hpCheck.value : undefined;
      const cleanPowerKw = powerKwCheck.value !== null ? powerKwCheck.value : undefined;

      let effectivePower: number | undefined = undefined;
      if (formData.category === 'inverters') {
        if (cleanPowerKw !== undefined) {
          effectivePower = Number((cleanPowerKw * 1000).toFixed(2));
        } else if (cleanHp !== undefined) {
          effectivePower = Math.round(cleanHp * 746);
        } else if (powerCheck.value !== null) {
          effectivePower = powerCheck.value;
        } else if (initialData?.power) {
          effectivePower = initialData.power;
        }
      } else if (formData.category === 'pumps') {
        if (cleanHp !== undefined) {
          effectivePower = Math.round(cleanHp * 746);
        } else if (cleanPowerKw !== undefined) {
          effectivePower = Number((cleanPowerKw * 1000).toFixed(2));
        } else if (powerCheck.value !== null) {
          effectivePower = powerCheck.value;
        } else if (initialData?.power) {
          effectivePower = initialData.power;
        }
      } else if (powerCheck.value !== null) {
        effectivePower = powerCheck.value;
      } else if (cleanPowerKw !== undefined) {
        effectivePower = Number((cleanPowerKw * 1000).toFixed(2));
      } else if (initialData?.power) {
        effectivePower = initialData.power;
      }

      const parsedPrice = priceCheck.value ?? (initialData?.price ?? 0);
      const isPriceManuallySet = parsedPrice > 0 && (!initialData || parsedPrice !== initialData.price || Boolean(initialData.specs?.customPrice));

      const cleanEfficiency = efficiencyCheck.value !== null ? efficiencyCheck.value : undefined;
      const cleanWarranty = warrantyCheck.value !== null ? warrantyCheck.value : undefined;
      const cleanWeight = weightCheck.value !== null ? weightCheck.value : undefined;
      const cleanCapacity = capacityCheck.value !== null ? capacityCheck.value : undefined;
      const resolvedRatedPowerKw =
        cleanPowerKw !== undefined
          ? cleanPowerKw
          : effectivePower !== undefined && effectivePower > 0
          ? Number((effectivePower / 1000).toFixed(4))
          : undefined;

      const newProduct: any = {
        ...(initialData || {}),
        id: initialData?.id || draftProductIdRef.current,
        name: formData.name,
        nameAr: formData.name,
        brand: formData.brand,
        category: formData.category as any,
        price: parsedPrice,
        customPrice: isPriceManuallySet ? parsedPrice : undefined,
        power: effectivePower ?? 0,
        hp: cleanHp,
        efficiency: cleanEfficiency ?? 0,
        warranty: cleanWarranty ?? 0,
        image: imageUrl || initialData?.image || 'https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=2944&auto=format&fit=crop',
        image_url: imageUrl || initialData?.image || 'https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=2944&auto=format&fit=crop',
        additionalImages: finalAdditionalUrls,
        datasheetUrl: datasheetUrl || initialData?.datasheetUrl,
        length: lengthVal,
        width: widthVal,
        thickness: thicknessVal,
        dimensionUnit: dimensionUnitVal,
        area: finalArea,
        status: formData.status as any,
        updatedAt: new Date().toISOString().split('T')[0],
        supplierId: user?.type === 'supplier' ? (user.uid || '') : (initialData?.supplierId || user?.uid || ''),
        max_pv_open_circuit_voltage_v: maxPvVoltageNum ?? undefined,
        mppt_count: mpptCountNum ?? undefined,
        vmp_v: vmpNum ?? undefined,
        voc_v: vocNum ?? undefined,
        imp_a: impNum ?? undefined,
        isc_a: iscNum ?? undefined,
        nominal_voltage_v: batteryVoltageNum ?? undefined,
        battery_voltage_v: batteryVoltageNum ?? undefined,
        ac_voltage_v: acVoltageStr,
        weight_kg: cleanWeight,
        capacity_ah: cleanCapacity,
        rated_power_kw: resolvedRatedPowerKw,
        description: formData.description,
        notes: formData.description,
        specs: {
          ...(initialData?.specs || {}),
          customPrice: isPriceManuallySet ? parsedPrice : undefined,
          description: formData.description,
          notes: formData.description,
          power: effectivePower,
          hp: cleanHp,
          horsepower: cleanHp,
          horsePower: cleanHp,
          pumpHorsepower: cleanHp,
          motorPowerRange: cleanHp ? `${cleanHp} HP (${resolvedRatedPowerKw || (cleanHp * 0.746).toFixed(1)} kW)` : (initialData?.specs?.motorPowerRange || undefined),
          efficiency: cleanEfficiency,
          warranty: cleanWarranty,
          type: formData.type || undefined,
          productType: formData.type || undefined,
          technology: formData.type || undefined,
          phase: formData.category === 'inverters' ? formData.phase : undefined,
          batterySupport: formData.category === 'inverters' ? formData.batterySupport : undefined,
          mpptCount: mpptCountNum ?? undefined,
          numberOfMppt: mpptCountNum ?? undefined,
          maxPvVoltage: maxPvVoltageNum ?? undefined,
          maxPvOpenCircuitVoltageV: maxPvVoltageNum ?? undefined,
          voltage:
            formData.category === 'panels'
              ? vmpNum ?? undefined
              : formData.category === 'batteries'
              ? batteryVoltageNum ?? undefined
              : formData.voltage?.trim() || undefined,
          vmpV: vmpNum ?? undefined,
          vocV: vocNum ?? undefined,
          nominalVoltage: batteryVoltageNum ?? undefined,
          acVoltageV: acVoltageStr,
          current:
            formData.category === 'panels'
              ? impNum ?? undefined
              : formData.current?.trim() || undefined,
          impA: impNum ?? undefined,
          iscA: iscNum ?? undefined,
          maxContinuousDischargeCurrentA:
            formData.category === 'batteries' && formData.current
              ? parseFloat(formData.current) || undefined
              : undefined,
          pvMpptVoltageRangeV: formData.mppt?.trim() || undefined,
          mppt: formData.mppt?.trim() || undefined,
          weight: cleanWeight,
          weightKg: cleanWeight,
          capacity: cleanCapacity,
          capacityAh: cleanCapacity,
          powerKw: resolvedRatedPowerKw,
          ratedPowerKw: resolvedRatedPowerKw,
          crossSection: formData.crossSection?.trim() || undefined,
          cableLength: formData.category === 'cables' ? formData.length?.trim() || undefined : undefined,
          length: lengthVal,
          width: widthVal,
          thickness: thicknessVal,
          dimensionUnit: dimensionUnitVal,
          area: finalArea,
          material: formData.material?.trim() || undefined,
          maxWind: formData.maxWind?.trim() || undefined,
          ipRating: formData.ipRating?.trim() || undefined,
          poles: formData.poles?.trim() || undefined,
          quantity: formData.quantity?.trim() || undefined,
          color: formData.color?.trim() || undefined,
        },
        suppliers: (initialData?.suppliers && initialData.suppliers.length > 0)
          ? initialData.suppliers.map(s => ({
              ...s,
              id: user?.type === 'supplier' ? (user.uid || s.id) : s.id,
              price: parsedPrice || s.price || 0,
              lastUpdate: new Date().toISOString().split('T')[0]
            }))
          : [
              {
                id: user?.type === 'supplier' ? (user.uid || '') : (initialData?.supplierId || user?.uid || ''),
                name: (!isRawUidOrId(user?.company) && user?.company) ||
                      (!isRawUidOrId(user?.name) && user?.name) ||
                      'Enerjoo Certified Supplier',
                nameAr: (!isRawUidOrId(user?.companyAr) && user?.companyAr) ||
                        (!isRawUidOrId(user?.company) && user?.company) ||
                        (!isRawUidOrId(user?.nameAr) && user?.nameAr) ||
                        (!isRawUidOrId(user?.name) && user?.name) ||
                        'مورد معتمد',
                price: parsedPrice || 0,
                phone: SUPPLIER_CONTACT_PHONE_DISPLAY,
                location: user?.location || 'Cairo, Egypt',
                verified: user?.verified || false,
                lastUpdate: new Date().toISOString().split('T')[0]
              }
            ]
      };
      
      await onSave(newProduct);
    } catch (error: any) {
      console.error("Save or upload failed:", error);
      let msg = '';
      if (typeof error === 'string') {
        msg = error;
      } else if (error?.message && typeof error.message === 'string' && error.message !== '[object Object]') {
        msg = error.message;
      } else if (error?.error?.message) {
        msg = error.error.message;
      } else if (typeof error?.error === 'string') {
        msg = error.error;
      } else {
        msg = lang === 'ar' 
          ? 'حدث خطأ أثناء حفظ المنتج أو رفع الصورة. يرجى التحقق من البيانات والمحاولة مرة أخرى.' 
          : 'Failed to save product or upload image. Please verify your connection and try again.';
      }
      if (msg === '[object Object]' || !msg.trim()) {
        msg = lang === 'ar' 
          ? 'تعذر إتمام عملية الحفظ. يرجى مراجعة البيانات والمحاولة مرة أخرى.' 
          : 'Unable to save product. Please check the inputs and try again.';
      }
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };
  
  return (
    <form className="space-y-6 text-right" noValidate onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
        <div className="space-y-2 md:col-span-2 text-left">
          <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.productName}</label>
          <input 
            value={formData.name}
            onChange={e => setFormData(p => ({...p, name: e.target.value}))}
            className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
            placeholder={lang === 'ar' ? 'مثال: لوح شمسي جينكو 580 واط' : 'e.g., Jinko Solar 580W'}
            required
          />
        </div>
        <div className="space-y-2 text-left">
          <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.brand}</label>
          <input 
            value={formData.brand}
            onChange={e => setFormData(p => ({...p, brand: e.target.value}))}
            className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
            required
          />
        </div>
        <div className="space-y-2 text-left">
          <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.category}</label>
          <select 
            value={formData.category}
            onChange={e => setFormData(p => ({...p, category: e.target.value}))}
            className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text"
          >
            <option value="panels">{t.panels}</option>
            <option value="inverters">{t.inverters}</option>
            <option value="batteries">{t.batteries}</option>
            <option value="pumps">{t.pumps}</option>
            <option value="mounting">{t.mounting}</option>
            <option value="protection">{t.protection}</option>
            <option value="combiner">{t.combiner}</option>
            <option value="cables">{t.cables}</option>
            <option value="mc4">{t.mc4}</option>
            <option value="sealings">{t.sealings}</option>
            <option value="clamps">{t.clamps}</option>
          </select>
        </div>

        <div className="space-y-2 text-left">
          <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.status}</label>
          <select 
            value={formData.status}
            onChange={e => setFormData(p => ({...p, status: e.target.value as 'available' | 'limited' | 'out_of_stock'}))}
            className={`w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold flex items-center gap-2 ${
              formData.status === 'available' ? 'text-solar-success' : 
              formData.status === 'limited' ? 'text-amber-500' : 'text-red-500'
            }`}
          >
            <option value="available">🟢 {t.available}</option>
            <option value="limited">🟡 {t.limited}</option>
            <option value="out_of_stock">🔴 {t.out_of_stock}</option>
          </select>
        </div>

        {fields.includes('price') && (
          <div className="space-y-1.5 text-left">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-solar-muted uppercase ml-1">{t.price}</label>
              {formData.category === 'panels' && (
                <span className="text-[10px] font-black text-solar-blue bg-solar-blue/10 px-2 py-0.5 rounded-full">
                  {isAr ? 'مرتبط ببورصة الطاقة' : 'Linked to Energy Exchange'}
                </span>
              )}
            </div>
            <input 
              type="text" 
              inputMode="decimal"
              value={formData.price}
              onChange={e => setFormData(p => ({...p, price: e.target.value}))}
              placeholder={isAr ? "مثال: 6500 أو 6500.5" : "e.g. 6500"}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              required
            />
            {formData.category === 'panels' && (
              <p className="text-[10px] text-solar-muted font-bold">
                {isAr ? 'يتم احتساب السعر المباشر تلقائياً: القدرة (وات) × سعر الوات المعتمد للماركة في البورصة.' : 'Calculated automatically: Power (W) × Brand Price Per Watt in the Energy Exchange.'}
              </p>
            )}
          </div>
        )}

        {fields.includes('power') && (
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1">{t.power}</label>
            <input 
              type="text" 
              inputMode="decimal"
              value={formData.power}
              onChange={e => setFormData(p => ({...p, power: e.target.value}))}
              placeholder={isAr ? "مثال: 580 أو 620" : "e.g. 580"}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              required
            />
          </div>
        )}

        {fields.includes('powerKw') && (
          (formData.category === 'inverters' && formData.type === 'Pump Inverter') || formData.category === 'pumps' ? (
            <div className="col-span-full bg-gradient-to-r from-blue-50/90 via-sky-50/70 to-blue-50/90 border-2 border-solar-blue/40 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-solar-blue text-white flex items-center justify-center shadow-xs">
                    <Droplets size={19} />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-black text-solar-text flex items-center gap-2">
                      <span>{isAr ? 'القدرة بالحصان (Horsepower - HP) لإنفرتر المضخة / الماتور' : 'Pump / Motor Horsepower (HP)'}</span>
                      <span className="text-[10px] bg-solar-blue text-white px-2 py-0.5 rounded-full font-bold">
                        {isAr ? 'خاص بالمضخات' : 'Pump Rating'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-solar-muted font-bold mt-0.5">
                      {isAr ? 'إنفرترات ومواتير المضخات تُقاس بالحصان (HP). يتم احتساب الكيلوواط والوات تلقائياً.' : 'Pump inverters and motors are rated in Horsepower (HP). Kilowatts and Watts are synchronized automatically.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                {/* 1. Horsepower Input */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[11px] font-black text-solar-text uppercase flex items-center justify-between">
                    <span>{isAr ? 'القدرة بالحصان (HP) *' : 'Horsepower (HP) *'}</span>
                    {formData.hp && !isNaN(parseFloat(formData.hp)) && (
                      <span className="text-solar-blue font-bold text-[10px]">
                        ≈ {formData.powerKw || (parseFloat(formData.hp) * 0.746).toFixed(1)} kW
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      inputMode="decimal"
                      value={formData.hp}
                      onChange={e => handleHpChange(e.target.value)}
                      className="w-full bg-white border-2 border-solar-blue/60 rounded-xl px-4 py-3 min-h-[48px] text-base font-black text-solar-text outline-none focus:border-solar-blue transition shadow-inner"
                      placeholder={isAr ? "مثال: 7.5 أو 10 أو 15 أو 25" : "e.g. 7.5, 10, 15, 20"}
                      required
                    />
                    <div className={`absolute ${isAr ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-xs font-black text-solar-blue bg-solar-blue/10 px-2 py-1 rounded-lg pointer-events-none`}>
                      {isAr ? 'حصان (HP)' : 'HP'}
                    </div>
                  </div>
                </div>

                {/* 2. Synchronized kW Input */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[11px] font-black text-solar-muted uppercase">
                    <span>{isAr ? 'القدرة المقابلة بالكيلوواط (kW)' : 'Equivalent Power (kW)'}</span>
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      inputMode="decimal"
                      value={formData.powerKw}
                      onChange={e => handlePowerKwChange(e.target.value)}
                      className="w-full bg-white border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base font-bold text-solar-text outline-none focus:border-solar-blue transition" 
                      placeholder="5.5"
                    />
                    <div className={`absolute ${isAr ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-xs font-bold text-solar-muted pointer-events-none`}>
                      kW
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Select Buttons for Standard Agricultural Pump Inverter Sizes */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[10px] font-black text-solar-muted uppercase">
                  {isAr ? 'اختيار سريع للقدرات الشائعة لطلمبات ومواتير الري (حصان):' : 'Quick select common pump/motor ratings (HP):'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STANDARD_PUMP_HP_OPTIONS.map((val) => {
                    const isSelected = String(formData.hp) === String(val);
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleHpChange(String(val))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-solar-blue text-white shadow-xs ring-2 ring-solar-blue/30 scale-105' 
                            : 'bg-white border border-solar-border text-solar-text hover:border-solar-blue hover:text-solar-blue'
                        }`}
                      >
                        {val} {isAr ? 'حصان' : 'HP'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 text-left">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-black text-solar-muted uppercase ml-1">{t.powerKw}</label>
                {formData.category === 'inverters' && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(p => ({
                        ...p,
                        type: 'Pump Inverter'
                      }));
                    }}
                    className="text-[10px] font-bold text-solar-blue hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Droplets size={11} />
                    <span>{isAr ? 'إنفرتر مضخة/ماتور؟ حدد بالحصان (HP)' : 'Pump/motor inverter? Set HP'}</span>
                  </button>
                )}
              </div>
              <input 
                type="text" 
                inputMode="decimal"
                value={formData.powerKw}
                onChange={e => handlePowerKwChange(e.target.value)}
                className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
                placeholder={isAr ? "مثال: 5 أو 5.5" : "e.g. 5 or 5.5"}
                required
              />
            </div>
          )
        )}

        {fields.includes('capacity') && (
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1">
              {t.capacity} (Ah)
            </label>
            <input 
              type="text" 
              inputMode="decimal"
              value={formData.capacity}
              onChange={e => setFormData(p => ({...p, capacity: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder={isAr ? "مثال: 200 أو 100" : "e.g. 200"}
              required
            />
          </div>
        )}

        {fields.includes('efficiency') && (
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1">
              {t.efficiency} (%)
            </label>
            <input 
              type="text" 
              inputMode="decimal"
              value={formData.efficiency}
              onChange={e => setFormData(p => ({...p, efficiency: e.target.value}))}
              placeholder={isAr ? "مثال: 99.8 أو 22.4 (اختياري)" : "e.g. 99.8 or 22.4"}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
            />
          </div>
        )}

        {fields.includes('warranty') && (
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1">{t.warrantyYears}</label>
            <input 
              type="text" 
              inputMode="decimal"
              value={formData.warranty}
              onChange={e => setFormData(p => ({...p, warranty: e.target.value}))}
              placeholder={isAr ? "مثال: 10 أو 25 (اختياري)" : "e.g. 10 or 25"}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
            />
          </div>
        )}

        {fields.includes('type') && (
          formData.category === 'inverters' ? (
            <div className="col-span-full bg-solar-card border border-solar-blue/20 rounded-2xl p-4 space-y-3.5 shadow-xs">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-solar-blue" />
                <span className="text-xs font-black text-solar-text">
                  {isAr ? 'تصنيف الإنفرتر المعتمد (Inverter Classification)' : 'Inverter Classification & Phase'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Main Inverter Type */}
                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-black text-solar-muted uppercase ml-1">
                    {isAr ? 'نوع الإنفرتر الأساسي' : 'Inverter Main Type'}
                  </label>
                  <select
                    value={formData.type || 'On-Grid'}
                    onChange={e => {
                      const newType = e.target.value;
                      setFormData(p => ({
                        ...p,
                        type: newType,
                        batterySupport: newType === 'Hybrid' || newType === 'Off-Grid'
                      }));
                    }}
                    className="w-full bg-solar-bg border border-solar-border rounded-xl px-3 py-2.5 text-xs font-black text-solar-text outline-none focus:border-solar-blue"
                  >
                    <option value="On-Grid">On-Grid (متصل بالشبكة)</option>
                    <option value="Hybrid">Hybrid (هايبرد / هجين)</option>
                    <option value="Off-Grid">Off-Grid (منفصل عن الشبكة)</option>
                    <option value="Pump Inverter">{isAr ? 'Pump Inverter (طلمبات ومضخات ري - بالحصان HP)' : 'Pump Inverter (Solar Pumping - HP)'}</option>
                  </select>
                </div>

                {/* 2. Phase */}
                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-black text-solar-muted uppercase ml-1">
                    {isAr ? 'الطور (Phase)' : 'Phase'}
                  </label>
                  <select
                    value={formData.phase || 'Three Phase'}
                    onChange={e => setFormData(p => ({ ...p, phase: e.target.value }))}
                    className="w-full bg-solar-bg border border-solar-border rounded-xl px-3 py-2.5 text-xs font-black text-solar-text outline-none focus:border-solar-blue"
                  >
                    <option value="Three Phase">Three Phase (3 فاز)</option>
                    <option value="Single Phase">Single Phase (1 فاز)</option>
                  </select>
                </div>

                {/* 3. Battery Support */}
                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-black text-solar-muted uppercase ml-1">
                    {isAr ? 'دعم البطاريات' : 'Battery Storage'}
                  </label>
                  <select
                    value={formData.batterySupport ? 'true' : 'false'}
                    onChange={e => setFormData(p => ({ ...p, batterySupport: e.target.value === 'true' }))}
                    className="w-full bg-solar-bg border border-solar-border rounded-xl px-3 py-2.5 text-xs font-black text-solar-text outline-none focus:border-solar-blue"
                  >
                    <option value="false">{isAr ? 'لا (بدون بطارية - On-Grid)' : 'No (Grid-tied)'}</option>
                    <option value="true">{isAr ? 'نعم (يدعم بنك بطاريات)' : 'Yes (Battery Ready)'}</option>
                  </select>
                </div>

                {formData.type === 'Pump Inverter' && (
                  <div className="col-span-full bg-blue-50/80 border border-blue-200 text-blue-900 rounded-xl p-2.5 text-xs font-bold flex items-center gap-2">
                    <Droplets size={14} className="text-solar-blue shrink-0" />
                    <span>
                      {isAr 
                        ? 'إنفرتر طلمبات ومواتير: تم تفعيل إدخال القدرة بالحصان (HP) في حقل القدرة مع التحويل التلقائي للكيلوواط.' 
                        : 'Pump/Motor Inverter: Horsepower (HP) rating is enabled in the power section with automatic kW synchronization.'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.type}</label>
              <input 
                type="text" 
                value={formData.type}
                onChange={e => setFormData(p => ({...p, type: e.target.value}))}
                className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
                placeholder="Monocrystalline / Hybrid / Gel"
              />
            </div>
          )
        )}

        {fields.includes('mppt') && (
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1 flex items-center gap-1">
              <Zap size={13} className="text-solar-blue" />
              <span>{t.mppt || (isAr ? 'نطاق جهد الـ MPPT (فولت)' : 'MPPT Voltage Range (V)')}</span>
            </label>
            <input 
              type="text" 
              value={formData.mppt}
              onChange={e => setFormData(p => ({...p, mppt: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder={t.mpptPlaceholder || (isAr ? "مثال: 160 - 950 V" : "e.g. 160 - 950 V")}
            />
          </div>
        )}

        {fields.includes('maxPvVoltage') && (
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1 flex items-center gap-1">
              <Zap size={13} className="text-solar-blue" />
              <span>{t.maxPvVoltage || (isAr ? 'أقصى جهد دخل DC (فولت - Voc Max)' : 'Max PV Input Voltage (V)')}</span>
            </label>
            <input 
              type="text" 
              inputMode="decimal"
              value={formData.maxPvVoltage}
              onChange={e => setFormData(p => ({...p, maxPvVoltage: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder={isAr ? "مثال: 1100 أو 1000 أو 600" : "e.g. 1100, 1000, 600"}
            />
          </div>
        )}

        {fields.includes('mpptCount') && (
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1 flex items-center gap-1">
              <Zap size={13} className="text-solar-blue" />
              <span>{t.mpptCount || (isAr ? 'عدد متتبعات MPPT (number_of_mppt)' : 'Number of MPPT Trackers')}</span>
            </label>
            <input 
              type="text" 
              inputMode="numeric"
              value={formData.mpptCount}
              onChange={e => setFormData(p => ({...p, mpptCount: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder={isAr ? "مثال: 2 أو 4 أو 6" : "e.g. 2, 4, 6"}
            />
          </div>
        )}

        {fields.includes('voltage') && (
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1">
              {formData.category === 'inverters' 
                ? (isAr ? 'جهد الخرج المتردد (AC - V)' : 'AC Output Voltage (V)')
                : formData.category === 'panels'
                ? (isAr ? 'جهد التشغيل الأقصى (Vmp - فولت)' : 'Max Power Voltage (Vmp - V)')
                : `${t.voltage} (V)`}
            </label>
            <input 
              type="text" 
              inputMode={formData.category === 'panels' || formData.category === 'batteries' ? 'decimal' : 'text'}
              value={formData.voltage}
              onChange={e => setFormData(p => ({...p, voltage: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder={
                formData.category === 'inverters'
                  ? (isAr ? "مثال: 380/400 أو 220" : "e.g. 380/400 or 220")
                  : formData.category === 'panels'
                  ? (isAr ? "مثال: 41.5 أو 42.4 (اختياري)" : "e.g. 41.5 or 42.4")
                  : (isAr ? "مثال: 48 أو 24 أو 12" : "e.g. 48 / 24 / 12")
              }
            />
          </div>
        )}

        {fields.includes('voc') && (
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1">
              {isAr ? 'جهد الدائرة المفتوحة (Voc - فولت)' : 'Open Circuit Voltage (Voc - V)'}
            </label>
            <input 
              type="text" 
              inputMode="decimal"
              value={formData.voc}
              onChange={e => setFormData(p => ({...p, voc: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder={isAr ? "مثال: 49.8 أو 50.2 (اختياري)" : "e.g. 49.8 or 50.2"}
            />
          </div>
        )}

        {fields.includes('current') && (
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1">
              {formData.category === 'inverters' 
                ? (isAr ? 'أقصى تيار خرج (AC - أمبير)' : 'Max Output Current (AC - A)')
                : formData.category === 'panels'
                ? (isAr ? 'تيار التشغيل الأقصى (Imp - أمبير)' : 'Max Power Current (Imp - A)')
                : `${t.current} (A)`}
            </label>
            <input 
              type="text" 
              inputMode={formData.category === 'panels' ? 'decimal' : 'text'}
              value={formData.current}
              onChange={e => setFormData(p => ({...p, current: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder={
                formData.category === 'inverters'
                  ? (isAr ? "مثال: 8.5 أو 16" : "e.g. 8.5 or 16")
                  : formData.category === 'panels'
                  ? (isAr ? "مثال: 14.94 (اختياري)" : "e.g. 14.94")
                  : (isAr ? "مثال: 10.85 أو 32" : "e.g. 10.85 / 32")
              }
            />
          </div>
        )}

        {fields.includes('isc') && (
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1">
              {isAr ? 'تيار القصر (Isc - أمبير)' : 'Short Circuit Current (Isc - A)'}
            </label>
            <input 
              type="text" 
              inputMode="decimal"
              value={formData.isc}
              onChange={e => setFormData(p => ({...p, isc: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 min-h-[48px] text-base sm:text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder={isAr ? "مثال: 15.8 (اختياري)" : "e.g. 15.8"}
            />
          </div>
        )}

        {fields.includes('crossSection') && (
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.crossSection}</label>
            <input 
              type="text" 
              value={formData.crossSection}
              onChange={e => setFormData(p => ({...p, crossSection: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder="4mm² / 6mm²"
            />
          </div>
        )}

        {fields.includes('length') && (
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.length}</label>
            <input 
              type="text" 
              value={formData.length}
              onChange={e => setFormData(p => ({...p, length: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder="100m"
            />
          </div>
        )}

        {fields.includes('material') && (
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.material}</label>
            <input 
              type="text" 
              value={formData.material}
              onChange={e => setFormData(p => ({...p, material: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder="Aluminum / Copper"
            />
          </div>
        )}

        {fields.includes('color') && (
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.color}</label>
            <input 
              type="text" 
              value={formData.color}
              onChange={e => setFormData(p => ({...p, color: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder="Black / Red"
            />
          </div>
        )}

        {fields.includes('maxWind') && (
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.maxWind}</label>
            <input 
              type="text" 
              value={formData.maxWind}
              onChange={e => setFormData(p => ({...p, maxWind: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder="120km/h"
            />
          </div>
        )}

        {fields.includes('ipRating') && (
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.ipRating}</label>
            <input 
              type="text" 
              value={formData.ipRating}
              onChange={e => setFormData(p => ({...p, ipRating: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder="IP65 / IP67"
            />
          </div>
        )}

        {fields.includes('poles') && (
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.poles}</label>
            <input 
              type="text" 
              value={formData.poles}
              onChange={e => setFormData(p => ({...p, poles: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder="2P / 4P"
            />
          </div>
        )}

        {fields.includes('quantity') && (
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.quantityValue}</label>
            <input 
              type="text" 
              value={formData.quantity}
              onChange={e => setFormData(p => ({...p, quantity: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder="100 pcs"
            />
          </div>
        )}

        {fields.includes('weight') && (
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2">
              {t.weight} (kg)
            </label>
            <input 
              type="text" 
              inputMode="decimal"
              value={formData.weight}
              onChange={e => setFormData(p => ({...p, weight: e.target.value}))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder={isAr ? "مثال: 23 أو 28.5 (اختياري)" : "e.g. 23 or 28.5"}
            />
          </div>
        )}
        {/* Note: standalone manual area is removed in favor of the dedicated dimensions & auto-calculated area section below */}
      </div>

      {/* Product Dimensions & Auto-Calculated Area Section */}
      <div className="bg-solar-card border border-solar-border rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 shadow-2xs text-left">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-solar-border/60 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-solar-blue/10 text-solar-blue flex items-center justify-center shrink-0">
              <Ruler size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-solar-text flex items-center gap-2">
                <span>{isAr ? 'أبعاد ومساحة المنتج' : 'Product Dimensions & Area'}</span>
                <span className="text-[10px] font-bold text-solar-muted bg-solar-bg px-2 py-0.5 rounded-md border border-solar-border">
                  {isAr ? 'اختياري' : 'Optional'}
                </span>
              </h3>
              <p className="text-[11px] text-solar-muted font-bold">
                {isAr 
                  ? 'أدخل الطول والعرض ليتم حساب مساحة المنتج بالمتر المربع (m²) تلقائياً' 
                  : 'Enter length and width to auto-calculate area in square meters (m²)'}
              </p>
            </div>
          </div>

          {/* Unit Selector: mm / cm / m */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[11px] font-black text-solar-muted uppercase">{isAr ? 'وحدة القياس:' : 'Unit:'}</span>
            <div className="flex bg-solar-bg border border-solar-border rounded-xl p-1 shadow-2xs">
              {(['mm', 'cm', 'm'] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, dimensionUnit: unit }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    formData.dimensionUnit === unit 
                      ? 'bg-solar-blue text-white shadow-xs' 
                      : 'text-solar-muted hover:text-solar-text'
                  }`}
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3 Dimensions inputs: Length, Width, Thickness (optional) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Length */}
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1 flex items-center justify-between">
              <span>{isAr ? 'الطول (Length)' : 'Length'}</span>
              <span className="text-solar-blue font-black text-[10px]">{formData.dimensionUnit}</span>
            </label>
            <input 
              type="number" 
              inputMode="decimal"
              step="any"
              min="0"
              value={formData.dimLength}
              onChange={e => setFormData(p => ({ ...p, dimLength: e.target.value }))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-2.5 min-h-[44px] text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder={formData.dimensionUnit === 'mm' ? '2384' : formData.dimensionUnit === 'cm' ? '238.4' : '2.384'}
            />
          </div>

          {/* Width */}
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1 flex items-center justify-between">
              <span>{isAr ? 'العرض (Width)' : 'Width'}</span>
              <span className="text-solar-blue font-black text-[10px]">{formData.dimensionUnit}</span>
            </label>
            <input 
              type="number" 
              inputMode="decimal"
              step="any"
              min="0"
              value={formData.dimWidth}
              onChange={e => setFormData(p => ({ ...p, dimWidth: e.target.value }))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-2.5 min-h-[44px] text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder={formData.dimensionUnit === 'mm' ? '1303' : formData.dimensionUnit === 'cm' ? '130.3' : '1.303'}
            />
          </div>

          {/* Thickness (Optional) */}
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-black text-solar-muted uppercase ml-1 flex items-center justify-between">
              <span>{isAr ? 'السمك (Thickness)' : 'Thickness'}</span>
              <span className="text-solar-muted font-bold text-[10px]">({isAr ? 'اختياري' : 'Optional'})</span>
            </label>
            <input 
              type="number" 
              inputMode="decimal"
              step="any"
              min="0"
              value={formData.dimThickness}
              onChange={e => setFormData(p => ({ ...p, dimThickness: e.target.value }))}
              className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-2.5 min-h-[44px] text-sm outline-none focus:border-solar-blue transition font-bold text-solar-text" 
              placeholder={formData.dimensionUnit === 'mm' ? '35' : formData.dimensionUnit === 'cm' ? '3.5' : '0.035'}
            />
          </div>
        </div>

        {/* Read-Only Auto-Calculated Area */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-solar-bg border border-solar-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black text-solar-muted uppercase">
                {isAr ? 'المساحة المحسوبة (Read-only):' : 'Calculated Area (Read-only):'}
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-solar-card border border-solar-border text-solar-muted">
                m²
              </span>
            </div>
            
            <div className="text-base sm:text-lg font-black text-solar-blue flex items-center gap-2">
              <Calculator size={18} className="text-solar-blue shrink-0" />
              <span>
                {hasDimensions ? (
                  <>
                    {isAr ? 'المساحة المحسوبة:' : 'Calculated Area:'} <span className="underline decoration-solar-blue/40 underline-offset-4">{formatCleanNumber(calculatedAreaInM2, 3)} m²</span>
                  </>
                ) : effectiveArea > 0 ? (
                  <>
                    {isAr ? 'المساحة المسجلة:' : 'Current Saved Area:'} <span>{formatCleanNumber(effectiveArea, 3)} m²</span>
                  </>
                ) : (
                  <span className="text-solar-muted text-xs font-bold">
                    {isAr ? 'أدخل الطول والعرض بالأعلى لحساب المساحة تلقائياً' : 'Enter length and width above to calculate area'}
                  </span>
                )}
              </span>
            </div>

            {hasDimensions && conversionText && (
              <p className="text-[11px] font-bold text-solar-muted pt-1">
                {isAr ? `التحويل بالمتر: ${conversionText}` : `Metric calculation: ${conversionText}`}
              </p>
            )}
            {!hasDimensions && currentSavedAreaNum > 0 && (
              <p className="text-[11px] font-bold text-solar-muted pt-1">
                {isAr ? `هذا المنتج مسجل بمساحة ${formatCleanNumber(currentSavedAreaNum, 3)} م² (يمكنك إدخال الطول والعرض لتحديثها تلقائياً)` : `This product has a saved area of ${formatCleanNumber(currentSavedAreaNum, 3)} m² (enter length & width to update)`}
              </p>
            )}
          </div>

          <div className="shrink-0 self-start sm:self-center">
            {/* Read-only input display */}
            <input 
              type="text" 
              readOnly 
              value={effectiveArea > 0 ? `${formatCleanNumber(effectiveArea, 3)} m²` : ''} 
              placeholder="0.000 m²"
              className="bg-solar-card border border-solar-border/80 text-solar-blue font-black text-sm px-3 py-2 rounded-xl text-center w-28 cursor-not-allowed select-all"
              tabIndex={-1}
              aria-label={isAr ? 'المساحة المحسوبة' : 'Calculated Area'}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2 text-left">
        <label className="text-[10px] font-black text-solar-muted uppercase ml-2">{t.description}</label>
        <textarea 
          value={formData.description}
          onChange={e => setFormData(p => ({...p, description: e.target.value}))}
          className="w-full bg-solar-bg border border-solar-border rounded-xl px-4 py-3 text-sm outline-none focus:border-solar-blue transition font-bold h-24 text-solar-text" 
        />
      </div>

      <div className="w-full space-y-4">
        {/* Main Product Image */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2">
              {lang === 'ar' ? 'صورة المنتج الرئيسية' : 'Main Product Image'}
            </label>
            <span className="text-[10px] font-bold text-solar-blue">
              {lang === 'ar' ? 'الحد الأقصى للملف النهائي 5 ميجابايت' : 'Max final size: 5 MB'}
            </span>
          </div>

          <div 
            onClick={handleImageClick}
            className="border-2 border-dashed border-solar-border rounded-2xl p-5 flex flex-col items-center justify-center gap-3 hover:border-solar-blue transition cursor-pointer bg-solar-bg/30 relative overflow-hidden group"
          >
            <input 
              type="file" 
              ref={imageInputRef} 
              onChange={handleImageChange} 
              accept="image/jpeg,image/jpg,image/png,image/webp" 
              className="hidden" 
            />

            {isCompressingMain ? (
              <div className="flex flex-col items-center justify-center gap-2.5 py-4 text-center">
                <div className="w-10 h-10 rounded-xl bg-solar-blue/10 flex items-center justify-center text-solar-blue">
                  <Loader2 size={22} className="animate-spin" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-black text-solar-blue animate-pulse">
                    {compressionStatus || (lang === 'ar' ? 'جاري تحسين وضغط الصورة قبل الرفع...' : 'Optimizing and compressing image before upload...')}
                  </p>
                  <p className="text-[10px] text-solar-muted font-bold">
                    {lang === 'ar' ? 'يتم تقليل الحجم لأقل من 5 ميجابايت مع الحفاظ على أعلى جودة' : 'Reducing size to <= 5 MB while preserving highest quality'}
                  </p>
                </div>
              </div>
            ) : imagePreview ? (
              <div className="flex items-center gap-3 w-full max-w-md">
                <img 
                  src={imagePreview} 
                  alt="Product preview" 
                  className="w-16 h-16 object-cover rounded-xl border border-solar-border shadow-sm shrink-0" 
                />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-bold text-solar-text truncate">
                    {imageFile ? imageFile.name : (lang === 'ar' ? 'صورة المنتج الحالية' : 'Current Product Image')}
                  </p>
                  {imageSizeInfo && (
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={13} className="shrink-0" />
                      <span>{imageSizeInfo}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-solar-blue font-semibold mt-1 hover:underline">
                    {lang === 'ar' ? 'اضغط لتغيير أو استبدال الصورة' : 'Click to replace image'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-solar-border group-hover:scale-105 transition-transform">
                  <ImageIcon size={24} className="text-solar-blue" />
                </div>
                <span className="text-xs font-bold text-solar-muted text-center max-w-[250px] truncate">
                  {t.dragImage}
                </span>
              </>
            )}

            <div className="text-center">
              <span className="text-[10px] text-solar-muted/80 block">
                {lang === 'ar' 
                  ? 'الصور المدعومة: JPG, PNG, WebP (الصور أكبر من 5MB تُضغط تلقائياً)' 
                  : 'Supported: JPG, PNG, WebP (Images > 5MB are auto-compressed)'}
              </span>
            </div>
          </div>
        </div>

        {/* Additional Product Images (Gallery) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2">
              {lang === 'ar' ? 'صور إضافية للمنتج (اختياري)' : 'Additional Product Images (Optional)'}
            </label>
            <button
              type="button"
              onClick={() => additionalInputRef.current?.click()}
              className="text-[11px] font-bold text-solar-blue hover:text-solar-blue/80 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-solar-blue/5 transition"
            >
              <Plus size={14} />
              <span>{lang === 'ar' ? 'إضافة صورة إضافية' : 'Add Image'}</span>
            </button>
          </div>

          <input 
            type="file" 
            ref={additionalInputRef} 
            onChange={handleAdditionalImagesChange} 
            accept="image/jpeg,image/jpg,image/png,image/webp" 
            multiple
            className="hidden" 
          />

          {isCompressingAdditional && (
            <div className="p-3 mb-2 bg-solar-blue/5 border border-solar-blue/20 rounded-xl flex items-center gap-2 text-xs font-bold text-solar-blue">
              <Loader2 size={16} className="animate-spin shrink-0" />
              <span>{compressionStatus || (lang === 'ar' ? 'جاري تحسين وضغط الصورة قبل الرفع...' : 'Optimizing and compressing image before upload...')}</span>
            </div>
          )}

          {/* Thumbnails of additional images */}
          {(existingAdditionalUrls.length > 0 || additionalFiles.length > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              {existingAdditionalUrls.map((url, idx) => (
                <div key={`existing-${idx}`} className="relative group rounded-xl overflow-hidden border border-solar-border bg-solar-bg/50 aspect-video">
                  <img src={url} alt={`Additional ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveExistingAdditional(idx)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/60 text-white hover:bg-red-600 transition"
                    title={lang === 'ar' ? 'حذف الصورة' : 'Remove image'}
                  >
                    <Trash2 size={12} />
                  </button>
                  <span className="absolute bottom-1 left-1.5 text-[9px] font-bold text-white/90 bg-black/50 px-1.5 py-0.5 rounded">
                    {lang === 'ar' ? 'مرفوعة' : 'Saved'}
                  </span>
                </div>
              ))}

              {additionalFiles.map((item) => (
                <div key={item.id} className="relative group rounded-xl overflow-hidden border border-solar-border bg-solar-bg/50 aspect-video">
                  <img src={item.preview} alt="New additional" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveAdditional(item.id)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/60 text-white hover:bg-red-600 transition"
                    title={lang === 'ar' ? 'حذف الصورة' : 'Remove image'}
                  >
                    <Trash2 size={12} />
                  </button>
                  {item.sizeInfo && (
                    <span className="absolute bottom-1 left-1.5 text-[9px] font-bold text-emerald-300 bg-black/60 px-1.5 py-0.5 rounded truncate max-w-[90%]">
                      {item.sizeInfo}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {uploadError && (
        <div className="p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-start gap-2.5">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">{uploadError}</p>
            <p className="text-[10px] opacity-80 mt-1">
              {lang === 'ar' ? 'يمكنك إعادة المحاولة أو الضغط على حفظ مرة أخرى.' : 'You can try again or click submit once more.'}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-4 pt-4">
        <button 
          type="submit" 
          disabled={isUploading || isCompressingMain || isCompressingAdditional}
          className="flex-1 bg-solar-blue text-white py-4 rounded-2xl font-black shadow-lg shadow-solar-blue/20 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {(isUploading || isCompressingMain || isCompressingAdditional) && <Loader2 size={20} className="animate-spin" />}
          {isCompressingMain || isCompressingAdditional 
            ? (lang === 'ar' ? 'جاري تحسين وضغط الصورة قبل الرفع...' : 'Compressing image...')
            : isUploading 
            ? t.uploading 
            : t.submit}
        </button>
        <button 
          type="button" 
          onClick={onCancel} 
          disabled={isUploading || isCompressingMain || isCompressingAdditional}
          className="flex-1 bg-solar-bg border border-solar-border text-solar-muted py-4 rounded-2xl font-black transition active:scale-95 disabled:opacity-50"
        >
          {t.cancel}
        </button>
      </div>
    </form>
  );
};
