import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  HelpCircle, 
  ArrowLeft, 
  Zap, 
  PhoneCall,
  User,
  Calculator,
  MapPin,
  TrendingUp,
  FileText,
  BadgePercent,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Plus,
  Minus,
  MessageSquare,
  Send,
  RefreshCw,
  Copy,
  Check,
  Building,
  Settings,
  Battery,
  Shield,
  Layers,
  Wrench,
  X,
  Droplet,
  Mail
} from 'lucide-react';
import { translations } from '../translations';
import { Product } from '../types';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { CUSTOMER_SERVICE_PHONE_DISPLAY, CUSTOMER_SERVICE_WHATSAPP_NUMBER, SUPPLIER_CONTACT_WHATSAPP_NUMBER } from '../constants/contact';
import { useAuth } from '../context/AuthContext';
import { createSolarRequest, createQuotation, generateSolarRequestId } from '../services/firestoreService';
import { normalizeEgyptianPhone, isValidEgyptianPhone, formatEgyptianPhoneDisplay } from '../utils/phoneUtils';

interface SolarCalculatorProps {
  lang: 'ar' | 'en';
  products: Product[];
  onBack: () => void;
  onProductClick: (product: Product) => void;
}

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: Date;
  type?: 'text' | 'selection' | 'appliance_calculator' | 'location_input';
  meta?: any;
}

interface ApplianceInput {
  id: string;
  nameAr: string;
  nameEn: string;
  watts: number;
  qty: number;
  hours: number;
  category: 'lights' | 'screens' | 'cooling' | 'power' | 'general';
}

export const SolarCalculator: React.FC<SolarCalculatorProps> = ({ 
  lang, 
  products, 
  onBack, 
  onProductClick 
}) => {
  const t = translations[lang];
  const isAr = lang === 'ar';

  const [step, setStep] = useState<'system_type' | 'consumption_method' | 'bill_input' | 'appliance_calculator' | 'pump_hp_input' | 'location' | 'phone_input' | 'calculating' | 'results'>('system_type');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [systemType, setSystemType] = useState<'on-grid' | 'off-grid' | 'hybrid' | 'pump' | null>(null);
  const [consumptionMethod, setConsumptionMethod] = useState<'bill' | 'appliances' | null>(null);
  const [billAmount, setBillAmount] = useState<number | ''>('');
  const [kwhMonthly, setKwhMonthly] = useState<number | ''>('');
  const [pumpHp, setPumpHp] = useState<number | ''>('');
  const [locationStr, setLocationStr] = useState<string>('');
  const [cityChoice, setCityChoice] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [inputMessage, setInputMessage] = useState<string>('');
  
  const { user } = useAuth();

  // Custom design tier selection
  const [currentTier, setCurrentTier] = useState<'budget' | 'recommended' | 'premium'>('recommended');
  
  // Lead submission state
  const [leadForm, setLeadForm] = useState({
    name: '',
    phone: '',
    notes: '',
    submitted: false,
    loading: false,
    error: null as string | null,
    lastRequestId: ''
  });

  // Autofill user credentials if logged in
  useEffect(() => {
    if (user) {
      setLeadForm(prev => ({
        ...prev,
        name: prev.name || user.name || '',
        phone: prev.phone || user.phone || ''
      }));
    }
  }, [user]);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Appliances standard listing
  const [appliancesList, setAppliancesList] = useState<ApplianceInput[]>([
    { id: '1', nameAr: 'إضاءة ليد (LED)', nameEn: 'LED Lights', watts: 15, qty: 8, hours: 6, category: 'lights' },
    { id: '2', nameAr: 'شاشة تلفزيون (TV)', nameEn: 'TV screen', watts: 100, qty: 1, hours: 5, category: 'screens' },
    { id: '3', nameAr: 'ثلاجة كهربائية', nameEn: 'Refrigerator', watts: 200, qty: 1, hours: 24, category: 'general' },
    { id: '4', nameAr: 'ديب فريزر (Deep Freezer)', nameEn: 'Deep Freezer', watts: 250, qty: 0, hours: 24, category: 'general' },
    { id: '5', nameAr: 'تكييف هوائي (1.5 حصان)', nameEn: 'Air Conditioner 1.5 HP', watts: 1400, qty: 1, hours: 6, category: 'cooling' },
    { id: '6', nameAr: 'تكييف هوائي (2.25 حصان)', nameEn: 'Air Conditioner 2.25 HP', watts: 2100, qty: 0, hours: 6, category: 'cooling' },
    { id: '7', nameAr: 'تكييف هوائي (3 حصان)', nameEn: 'Air Conditioner 3 HP', watts: 2800, qty: 0, hours: 6, category: 'cooling' },
    { id: '8', nameAr: 'مروحة سقف/مكتب', nameEn: 'Ceiling/Desk Fan', watts: 75, qty: 3, hours: 10, category: 'cooling' },
    { id: '9', nameAr: 'مضخة مياه (1 حصان)', nameEn: 'Water Pump 1 HP', watts: 750, qty: 0, hours: 2, category: 'power' },
    { id: '10', nameAr: 'غلاية مياه كهربائية (Kettle)', nameEn: 'Electric Kettle', watts: 1800, qty: 0, hours: 0.5, category: 'general' },
    { id: '11', nameAr: 'مايكروويف (Microwave)', nameEn: 'Microwave Oven', watts: 1200, qty: 0, hours: 0.5, category: 'general' },
    { id: '12', nameAr: 'كمبيوتر / لابتوب', nameEn: 'Computer/Laptop', watts: 150, qty: 1, hours: 4, category: 'general' },
    { id: '13', nameAr: 'غسالة ملابس', nameEn: 'Washing Machine', watts: 500, qty: 1, hours: 1.5, category: 'general' },
    { id: '14', nameAr: 'غسالة أطباق (Dishwasher)', nameEn: 'Dishwasher', watts: 1200, qty: 0, hours: 1.5, category: 'general' },
    { id: '15', nameAr: 'فرن كهربائي', nameEn: 'Electric Oven', watts: 2000, qty: 0, hours: 1, category: 'general' },
    { id: '16', nameAr: 'سخان مياه كهربائي', nameEn: 'Electric Water Heater', watts: 2000, qty: 0, hours: 2, category: 'general' },
    { id: '17', nameAr: 'مكواة ملابس', nameEn: 'Electric Iron', watts: 1000, qty: 0, hours: 1, category: 'general' },
    { id: '18', nameAr: 'خلاط ومحضر طعام', nameEn: 'Kitchen Blender/Mixer', watts: 400, qty: 0, hours: 0.5, category: 'general' },
    { id: '19', nameAr: 'مكنسة كهربائية', nameEn: 'Vacuum Cleaner', watts: 1400, qty: 0, hours: 0.5, category: 'general' },
    { id: '20', nameAr: 'راوتر وكاميرات مراقبة (CCTV)', nameEn: 'Router & Security Cameras', watts: 40, qty: 0, hours: 24, category: 'general' }
  ]);

  // Handle auto scroll
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading, step]);

  // Initial greeting
  useEffect(() => {
    const greetingText = isAr 
      ? 'أهلاً بك! أنا مهندس استشارات وتصميم الطاقة الشمسية الذكي لموقع Enerjoo. سأقوم بتصميم محطة طاقة شمسية متكاملة لبيتك أو منشأتك واختيار أفضل الأجهزة المتاحة في مصر وحساب تكاليفها والجدوى المالية خطوة بخطوة بكل سهولة ودون تعقيد مهني.' 
      : 'Welcome! I am Enerjoo\'s smart AI solar design engineer and sales consultant. I am here to help you design a complete solar power system customized for your home or business, recommend the best catalog products, and provide detailed financial return analyses step-by-step in simple language.';
    
    const firstQuestion = isAr
      ? 'الخطوة 1: لنبدأ بتحديد نوع النظام الذي ترغب في استخدامه لتأمين احتياجك من الكهرباء. ما هو هدفك الأساسي؟'
      : 'Step 1: Let\'s pick the type of solar system that best meets your needs. What is your primary energy goal?';

    setMessages([
      { id: 'g1', sender: 'ai', text: greetingText, timestamp: new Date() },
      { id: 'g2', sender: 'ai', text: firstQuestion, timestamp: new Date() }
    ]);
  }, [lang]);

  // Handle user options selections
  const selectSystemType = (type: 'on-grid' | 'off-grid' | 'hybrid' | 'pump') => {
    setSystemType(type);
    
    // Create text representations
    const choiceArStr = type === 'on-grid' 
      ? 'متصل بالشبكة (On-Grid) - لتوفير وتقليل فاتورة الكهرباء بدون بطاريات'
      : type === 'off-grid'
      ? 'منفصل تماماً عن الشبكة (Off-Grid) - لتوليد الطاقة بشكل مستقل للأماكن النائية والمزارع بالاعتماد على البطاريات'
      : type === 'hybrid'
      ? 'نظام هجين (Hybrid) - تخفيض الفاتورة مع توفير بطاريات احتياطية عند انقطاع الكهرباء وتخفيف الأحمال'
      : 'نظام طلمبات ومضخات مياه الري (Solar Pump System) - لتشغيل طلمبات ومضخات مياه الآبار والري مباشرة بالطاقة الشمسية بدون بطاريات';

    const choiceEnStr = type === 'on-grid'
      ? 'On-Grid: Feed directly to grid, no batteries, maximizes bill savings'
      : type === 'off-grid'
      ? 'Off-Grid: 100% independent power with batteries for remote zones & farms'
      : type === 'hybrid'
      ? 'Hybrid: Big grid savings combined with instant emergency battery backup'
      : 'Solar Pump System: Operates water pumps directly without batteries during day hours';

    // Add user message
    setMessages(prev => [
      ...prev,
      { id: 'u-' + Date.now(), sender: 'user', text: isAr ? choiceArStr : choiceEnStr, timestamp: new Date() }
    ]);

    setChatLoading(true);

    setTimeout(() => {
      if (type === 'pump') {
        const aiReplyAr = `اختيار رائع وموفر جداً للوقود والديزل! نظام طلمبات ومضخات مياه الري بالطاقة الشمسية هو الحل الذكي والاقتصادي للمزارع والآبار في مصر.

الخطوة 2: لتصميم محطة الألواح ومغير السرعة (الإنفرتر/VFD) المناسب لتشغيل طلمبة أو غاطس المياه الخاص بك، يرجى اختيار أو إدخال قدرة المضخة بالحصان (HP) بالأسفل:`;
        
        const aiReplyEn = `Excellent choice! Solar water pump solutions are the most cost-effective and clean replacement for high-overhead diesel generators on Egyptian farms.

Step 2: To size the exact solar array and VFD pump inverter, please select or enter your water pump capacity in Horsepower (HP) below:`;

        setMessages(prev => [
          ...prev,
          { id: 'ai-resp-' + Date.now(), sender: 'ai', text: isAr ? aiReplyAr : aiReplyEn, timestamp: new Date() }
        ]);
        setChatLoading(false);
        setStep('pump_hp_input');
      } else {
        const aiReplyAr = `اختيار ممتاز! نظام ${isAr ? (type === 'on-grid' ? 'المتصل بالشبكة' : type === 'off-grid' ? 'المنفصل تماماً' : type === 'hybrid' ? 'الهجين' : 'طلمبات ومضخات مياه الري') : type} يوفر حلاً رائعاً ومستداماً لعمليات التشغيل.

الخطوة 2: الآن لنقم بالتعرف على معدل استهلاك الطاقة اليومي الخاص بك لحساب قدرة المحطة المناسبة بدقة هندسية.
كيف تفضل إدخال بيانات الاستهلاك؟`;
        
        const aiReplyEn = `Excellent choice! A ${type} architecture is highly effective.

Step 2: Let\'s gather your consumption details to size the station matching your load.
How would you prefer to enter your consumption specs?`;

        setMessages(prev => [
          ...prev,
          { id: 'ai-resp-' + Date.now(), sender: 'ai', text: isAr ? aiReplyAr : aiReplyEn, timestamp: new Date() }
        ]);
        setChatLoading(false);
        setStep('consumption_method');
      }
    }, 700);
  };

  const selectPumpHp = (hpValue: number) => {
    setPumpHp(hpValue);
    
    const userText = isAr 
      ? `قدرة المضخة المطلوبة: ${hpValue} حصان (HP)` 
      : `Desired pump power capacity: ${hpValue} HP`;

    setMessages(prev => [
      ...prev,
      { id: 'u-' + Date.now(), sender: 'user', text: userText, timestamp: new Date() }
    ]);

    setChatLoading(true);

    setTimeout(() => {
      const aiReplyAr = `تم تسجيل طلمبة بقدرة ${hpValue} حصان بنجاح وتحديد معايير التشغيل بالكامل!

الخطوة 3: لتحديد شدة الإشعاع الشمسي ومعدلات السطوع المقدرة لمنطقتك بمصر لتشغيل المضخة بأقوى كفاءة، يرجى تزويدنا بالموقع أو المدينة التي تود تركيب المحطة الشمسية فيها لتشغيل البئر أو الري.`;
      
      const aiReplyEn = `Registered a water pump of ${hpValue} HP capacity successfully!

Step 3: To figure out your regional peak solar irradiance metrics and hours in Egypt to maximize discharge flow, what is the country/city where this pump operates?`;

      setMessages(prev => [
        ...prev,
        { id: 'ai-resp-' + Date.now(), sender: 'ai', text: isAr ? aiReplyAr : aiReplyEn, timestamp: new Date() }
      ]);
      setChatLoading(false);
      setStep('location');
    }, 850);
  };

  const selectConsumptionMethod = (method: 'bill' | 'appliances') => {
    setConsumptionMethod(method);

    const userText = method === 'bill' 
      ? (isAr ? 'أعرف استهلاكي (قيمة الفاتورة أو الاستهلاك الشهري)' : 'I know my consumption (enter Monthly Bill or kWh)')
      : (isAr ? 'لا أعرف استهلاكي بالدقة (حاسبة الأجهزة التفاعلية)' : 'I don\'t know my exact consumption (appliance-based estimator)');

    setMessages(prev => [
      ...prev,
      { id: 'u-' + Date.now(), sender: 'user', text: userText, timestamp: new Date() }
    ]);

    setChatLoading(true);

    setTimeout(() => {
      let aiText = '';
      if (method === 'bill') {
        aiText = isAr 
          ? 'تسهيلاً لحساب أحمالك، من فضلك قم بإدخال قيمة فاتورة الكهرباء الشهرية التقريبية بالجنيه المصري (EGP)، أو اكتب إجمالي استهلاكك الشهري بالكيلوواط/ساعة (kWh) مباشرة لتسهيل المعادلة الهندسية.'
          : 'To approximate your load, please enter either your average monthly electricity bill in Egyptian Pounds (EGP) or your direct monthly consumption capacity in kilowatt-hours (kWh).';
        setStep('bill_input');
      } else {
        aiText = isAr
          ? 'لا تقلق على الإطلاق، فنحن نعيش هذا السلوك اليومي! من فضلك حدد الأجهزة الكهربائية المنزلية التي تعمل في منزلك ومدة تشغيلها اليومية باستخدام اللوحة التفاعلية بالأسفل، وسيتم حساب الأحمال أوتوماتيكياً.'
          : 'No worries! Just list your daily appliances, quantities, and operational hours in the active visual panel below, and I will continuously total your kWh requirements and surging peaks.';
        setStep('appliance_calculator');
      }

      setMessages(prev => [
        ...prev,
        { id: 'ai-resp-' + Date.now(), sender: 'ai', text: aiText, timestamp: new Date() }
      ]);
      setChatLoading(false);
    }, 600);
  };

  // Submit Bill Inputs
  const handleBillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billAmount && !kwhMonthly) {
      return;
    }

    const userInputTextAr = billAmount 
      ? `قيمة الفاتورة الشهرية الكهربية: ${billAmount} جنيه مصري`
      : `معدل الاستهلاك الشهري المباشر: ${kwhMonthly} كيلو واط ساعة`;

    const userInputTextEn = billAmount
      ? `Monthly electricity bill is roughly ${billAmount} EGP`
      : `Direct monthly consumption is ${kwhMonthly} kWh`;

    setMessages(prev => [
      ...prev,
      { id: 'u-' + Date.now(), sender: 'user', text: isAr ? userInputTextAr : userInputTextEn, timestamp: new Date() }
    ]);

    setChatLoading(true);

    setTimeout(() => {
      const aiReplyAr = `عمل رائع! قمنا بتسجيل معدلات الاستهلاك والكهرباء الواردة.

الخطوة 3: لتحديد شدة الإشعاع الشمسي وحساب عدد ساعات سطوع الشمس المفيدة (Peak Sun Hours) المقدرة لمنطقتك، يرجى تزويدنا بالموقع أو المدينة التي تود المبادرة بتركيب الألواح فيها بمصر.`;
      
      const aiReplyEn = `Great job! Recorded your monthly reference standards.

Step 3: To figure out your local solar irradiance rates and effective Peak Sun Hours (PSH), what is the country and city where this station is planned to be mounted?`;

      setMessages(prev => [
        ...prev,
        { id: 'ai-resp-' + Date.now(), sender: 'ai', text: isAr ? aiReplyAr : aiReplyEn, timestamp: new Date() }
      ]);
      setChatLoading(false);
      setStep('location');
    }, 850);
  };

  // Appliance Adjustments
  const adjustApplianceQty = (id: string, change: number) => {
    setAppliancesList(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.qty + change);
        return { ...item, qty: newQty };
      }
      return item;
    }));
  };

  const adjustApplianceHours = (id: string, hours: number) => {
    setAppliancesList(prev => prev.map(item => {
      if (item.id === id) {
        const validatedHours = Math.min(24, Math.max(0.5, hours));
        return { ...item, hours: validatedHours };
      }
      return item;
    }));
  };

  const adjustApplianceWatts = (id: string, watts: number) => {
    setAppliancesList(prev => prev.map(item => {
      if (item.id === id) {
        const validatedWatts = Math.max(1, watts);
        return { ...item, watts: validatedWatts };
      }
      return item;
    }));
  };

  // Running calculations of currently selected load metrics
  const calculateLiveConsumption = () => {
    let totalWh = 0;
    let peakWatts = 0;
    appliancesList.forEach(item => {
      totalWh += item.watts * item.qty * item.hours;
      peakWatts += item.watts * item.qty;
    });
    return {
      dailyKwh: totalWh / 1000,
      peakKw: (peakWatts * 0.8) / 1000 // applying 80% diversity factor
    };
  };

  const confirmAppliancesEstimate = () => {
    const liveStats = calculateLiveConsumption();
    if (liveStats.dailyKwh <= 0) {
      alert(isAr ? 'برجاء تفعيل وإضافة الكمية لجهاز واحد على الأقل للبدء بالحساب' : 'Please increase the quantity for at least one active appliance.');
      return;
    }

    const outputAr = `حسناً، قمت بمراجعة الأجهزة وحسابها. الإجمالي المحتسب بناءً على أجهزتي هو:
- إجمالي الطاقة اليومية المستهلكة: ${liveStats.dailyKwh.toFixed(2)} كيلوواط ساعة/يوم.
- أقصى حمل متزامن مقدر (Peak Load): ${(liveStats.peakKw * 1000).toFixed(0)} وات.`;

    const outputEn = `Calculated custom consumption totals based on appliances:
- Estimated daily power needed: ${liveStats.dailyKwh.toFixed(2)} kWh/day.
- Calculated concurrent peak load: ${(liveStats.peakKw * 1000).toFixed(0)} Watts.`;

    setMessages(prev => [
      ...prev,
      { id: 'u-' + Date.now(), sender: 'user', text: isAr ? outputAr : outputEn, timestamp: new Date() }
    ]);

    setChatLoading(true);

    setTimeout(() => {
      const aiReplyAr = `ممتاز جداً! لقد قمت بتحليل قائمة أجهزتك وخرجنا بتقدير قوي وموثوق للأحمال اليومية المصممة ليكون نظامك آمن تماماً ضد انقطاع التيار الكهربائي.

الخطوة 3: لنقم باحتساب شدة الإشعاع الشمسي ومعدلات ذروة سطوع الشمس في منطقتك، يرجى كتابة اسم الموقع أو المدينة الخاصة بك في مصر.`;
      
      const aiReplyEn = `Excellent details! Analyzed the appliance matrix completely and derived structural loads ready to sustain continuous solar dispatching.

Step 3: To figure out your regional peak solar irradiance metrics, please write your specific location or select code cities in Egypt.`;

      setMessages(prev => [
        ...prev,
        { id: 'ai-resp-' + Date.now(), sender: 'ai', text: isAr ? aiReplyAr : aiReplyEn, timestamp: new Date() }
      ]);
      setChatLoading(false);
      setStep('location');
    }, 800);
  };

  // Submit Location Choices
  const selectCity = (city: string) => {
    setCityChoice(city);
    setLocationStr(city);

    const userText = isAr ? `أنا مهتم بالتركيب في مدينة/محافظة: ${city}` : `Installation target city: ${city}`;
    
    setMessages(prev => [
      ...prev,
      { id: 'u-' + Date.now(), sender: 'user', text: userText, timestamp: new Date() }
    ]);

    setChatLoading(true);

    setTimeout(() => {
      const aiReplyAr = `ممتاز جداً! الإشعاع الشمسي في ${city} كافٍ ومثالي لتحقيق أعلى إنتاجية وتوفير في فاتورة الكهرباء.

الخطوة 4: لربط مقايسة وتصميم النظام بحسابك وتوثيق عرض السعر الهندسي وتسهيل تواصل مهندس الاستشارات الفنية معك للمعاينة، يرجى تزويدنا برقم هاتفك المحمول (رقم مصري):`;
      
      const aiReplyEn = `Great! Peak sun values for ${city} are exceptional, yielding prime solar savings.

Step 4: To link this quotation with your account and enable our engineering advisor to review feasibility, please provide your Egyptian mobile phone number:`;

      setMessages(prev => [
        ...prev,
        { id: 'ai-resp-' + Date.now(), sender: 'ai', text: isAr ? aiReplyAr : aiReplyEn, timestamp: new Date() }
      ]);
      
      setStep('phone_input');
      setChatLoading(false);
    }, 700);
  };

  // Dedicated handler for phone verification and instant quotation persistence
  const handlePhoneSubmit = async (phoneToValidate?: string) => {
    const rawPhone = phoneToValidate || leadForm.phone;
    if (!rawPhone || !rawPhone.trim()) {
      setLeadForm(prev => ({
        ...prev,
        error: isAr ? 'يرجى إدخال رقم الهاتف المحمول أولاً' : 'Please enter your mobile phone number first'
      }));
      return;
    }

    if (!isValidEgyptianPhone(rawPhone)) {
      setLeadForm(prev => ({
        ...prev,
        error: isAr 
          ? 'يرجى إدخال رقم هاتف مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015 ويتكون من 11 رقماً.' 
          : 'Please enter a valid Egyptian mobile phone number starting with 010, 011, 012, or 015.'
      }));
      return;
    }

    const normalized = normalizeEgyptianPhone(rawPhone);
    setLeadForm(prev => ({
      ...prev,
      phone: normalized,
      error: null
    }));

    const userText = isAr 
      ? `رقم الهاتف للتواصل: ${formatEgyptianPhoneDisplay(normalized)}` 
      : `Contact Phone: ${formatEgyptianPhoneDisplay(normalized)}`;

    setMessages(prev => [
      ...prev,
      { id: 'u-' + Date.now(), sender: 'user', text: userText, timestamp: new Date() }
    ]);

    setChatLoading(true);

    const assignedRequestId = generateSolarRequestId();
    const currentCalc = runSolarCalculations();
    const selectedTierData = currentCalc.tiers['recommended'];

    try {
      // 1. Save to solarRequests collection
      await createSolarRequest({
        requestId: assignedRequestId,
        customerId: user?.uid || null,
        customerName: leadForm.name || user?.name || 'عميل إينرجو',
        customerPhone: normalized,
        governorate: cityChoice || user?.governorate || 'القاهرة',
        location: locationStr || cityChoice || 'مصر',
        systemType: systemType || 'hybrid',
        tier: 'recommended',
        inputs: {
          monthlyBill: typeof billAmount === 'number' ? billAmount : undefined,
          consumptionKwh: typeof kwhMonthly === 'number' ? kwhMonthly : undefined,
          sunHours: currentCalc.loads.sunHours || 5.5,
          cityChoice,
          locationStr,
          pumpHp: typeof pumpHp === 'number' ? pumpHp : undefined,
          appliances: appliancesList.filter(a => a.qty > 0).map(a => ({
            name: isAr ? a.nameAr : a.nameEn,
            power: a.watts,
            count: a.qty,
            hours: a.hours
          }))
        },
        calculatedOutputs: {
          systemSizeKw: selectedTierData?.panelPowerTotalKw || 0,
          estimatedCost: selectedTierData?.cost,
          panelQty: selectedTierData?.panelQty || 0,
          panelModel: selectedTierData?.panel ? (isAr ? selectedTierData.panel.nameAr : selectedTierData.panel.name) : undefined,
          panelWatt: selectedTierData?.panel?.power || 585,
          panelCost: selectedTierData?.panel ? selectedTierData.panel.price * selectedTierData.panelQty : undefined,
          inverterQty: selectedTierData?.inverterQty || 0,
          inverterModel: selectedTierData?.inverter ? (isAr ? selectedTierData.inverter.nameAr : selectedTierData.inverter.name) : undefined,
          inverterKw: selectedTierData?.inverter?.power || selectedTierData?.panelPowerTotalKw,
          inverterCost: selectedTierData?.inverter ? selectedTierData.inverter.price * selectedTierData.inverterQty : undefined,
          batteryQty: selectedTierData?.batteryQty || 0,
          batteryModel: selectedTierData?.battery ? (isAr ? selectedTierData.battery.nameAr : selectedTierData.battery.name) : undefined,
          batteryKwh: selectedTierData?.battery?.power || undefined,
          batteryCost: selectedTierData?.battery ? selectedTierData.battery.price * selectedTierData.batteryQty : undefined,
          annualProductionKwh: selectedTierData?.financials?.annualYield || 0,
          annualSavingsEgp: selectedTierData?.financials?.annualSavings || 0,
          paybackYears: selectedTierData?.financials?.payback || 0,
          dcProtectionCost: selectedTierData?.protection ? Math.round(selectedTierData.protection * 0.5) : 0,
          acProtectionCost: selectedTierData?.protection ? Math.round(selectedTierData.protection * 0.5) : 0,
          dcCableCost: selectedTierData?.cables ? Math.round(selectedTierData.cables * 0.55) : 0,
          acCableCost: selectedTierData?.cables ? Math.round(selectedTierData.cables * 0.45) : 0,
          structureCost: selectedTierData?.mounting || 0,
          installationCost: 0,
          warrantyYears: 10
        },
        notes: leadForm.notes || '',
        status: 'pending'
      });

      // 2. Save to quotations collection with all explicit quotation fields
      await createQuotation({
        requestId: assignedRequestId,
        customerId: user?.uid || null,
        userId: user?.uid || null,
        customerName: leadForm.name || user?.name || 'عميل إينرجو',
        customerEmail: user?.email || '',
        phone: normalized,
        systemType: systemType || 'hybrid',
        location: locationStr || cityChoice || 'مصر',
        usage: (typeof kwhMonthly === 'number' ? kwhMonthly : 0) || (systemType === 'pump' ? (typeof pumpHp === 'number' ? pumpHp : 0) : 0),
        monthlyBill: typeof billAmount === 'number' ? billAmount : 0,
        batteryRequired: systemType === 'off-grid' || systemType === 'hybrid',
        systemSpecs: `RECOMMENDED: Panels=${selectedTierData?.panelQty || 0}pcs, Inverter=${selectedTierData?.inverterQty || 0}pcs, Battery=${selectedTierData?.batteryQty || 0}pcs`,
        targetTier: 'recommended',
        priceEstimate: selectedTierData?.cost || 0,
        status: 'pending',
        notes: leadForm.notes || ''
      });

      setLeadForm(prev => ({
        ...prev,
        lastRequestId: assignedRequestId
      }));
    } catch (err) {
      console.error('Error auto-saving quotation:', err);
    }

    setTimeout(() => {
      const aiReplyAr = `تم توثيق رقم الهاتف بنجاح: ${formatEgyptianPhoneDisplay(normalized)} ✅
مرحباً بك يا ${leadForm.name || user?.name || 'عميلنا العزيز'}! تم ربط المقايسة بحسابك وحفظ كود الطلب الرسمي (${assignedRequestId}).
جاري الآن إجراء الحسابات الهندسية الدقيقة ومطابقة الكتالوج لإعداد 3 باقات متكاملة لك...`;
      
      const aiReplyEn = `Phone number recorded successfully: ${formatEgyptianPhoneDisplay(normalized)} ✅
Welcome ${leadForm.name || user?.name || 'valued customer'}! Your quotation is registered under ID: ${assignedRequestId}.
Now computing high-precision sizing and product matching across 3 tailored tiers...`;

      setMessages(prev => [
        ...prev,
        { id: 'ai-resp-' + Date.now(), sender: 'ai', text: isAr ? aiReplyAr : aiReplyEn, timestamp: new Date() }
      ]);

      setChatLoading(false);
      setStep('calculating');
      
      setTimeout(() => {
        setStep('results');
      }, 1500);
    }, 750);
  };

  // Human Custom Chat Entry Box
  const sendCustomQuery = async () => {
    if (!inputMessage.trim()) return;
    const userText = inputMessage;
    setInputMessage('');

    // Check if user is entering phone directly in chat
    const digitsOnly = userText.replace(/[^\d+]/g, '');
    if ((step === 'phone_input' || isValidEgyptianPhone(digitsOnly)) && digitsOnly.length >= 10) {
      if (isValidEgyptianPhone(digitsOnly)) {
        await handlePhoneSubmit(digitsOnly);
        return;
      }
    }

    setMessages(prev => [
      ...prev,
      { id: 'u-' + Date.now(), sender: 'user', text: userText, timestamp: new Date() }
    ]);

    setChatLoading(true);

    let systemDetails = null;
    try {
      const calcResult = runSolarCalculations();
      if (calcResult) {
        systemDetails = {
          dailyKwh: calcResult.loads.dailyKwh,
          peakW: calcResult.loads.peakW,
          sunHours: calcResult.loads.sunHours,
          costBudget: calcResult.tiers.budget.cost,
          costRecommended: calcResult.tiers.recommended.cost,
          costPremium: calcResult.tiers.premium.cost,
          panelQty: calcResult.tiers.recommended.panelQty,
          panelPowerTotalKw: calcResult.tiers.recommended.panelPowerTotalKw,
          batteryQty: calcResult.tiers.recommended.batteryQty,
        };
      }
    } catch (e) {
      // Ignored
    }

    try {
      const response = await fetch('/api/solar-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { id: 'usr-new', sender: 'user', text: userText, timestamp: new Date() }],
          lang,
          systemType,
          consumptionMethod,
          billAmount,
          kwhMonthly,
          pumpHp,
          cityChoice,
          systemDetails
        })
      });

      if (!response.ok) {
        throw new Error('Chat reply API failed');
      }

      const data: any = await response.json();
      setMessages(prev => [
        ...prev,
        { id: 'ai-' + Date.now(), sender: 'ai', text: data.reply, timestamp: new Date() }
      ]);

      if (data.updatedSizing) {
        const { bill, kwh, pumpHp: parsedHp, systemType: parsedType, cityChoice: parsedCity } = data.updatedSizing;
        let didUpdate = false;
        if (bill !== null && bill !== undefined) {
          setBillAmount(bill);
          setConsumptionMethod('bill');
          didUpdate = true;
        }
        if (kwh !== null && kwh !== undefined) {
          setKwhMonthly(kwh);
          setConsumptionMethod('bill');
          didUpdate = true;
        }
        if (parsedHp !== null && parsedHp !== undefined) {
          setPumpHp(parsedHp);
          setSystemType('pump');
          didUpdate = true;
        }
        if (parsedType !== null && parsedType !== undefined) {
          setSystemType(parsedType);
          didUpdate = true;
        }
        if (parsedCity !== null && parsedCity !== undefined) {
          setCityChoice(parsedCity);
          didUpdate = true;
        }

        if (didUpdate) {
          setStep('results');
        }
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [
        ...prev,
        { 
          id: 'ai-err-' + Date.now(), 
          sender: 'ai', 
          text: isAr 
            ? 'عذراً، حدث خطأ أثناء محاولة الاتصال بـ الـ AI الخاص بي لتوليد إجابة فورية، الرجاء استخدام أزرار ومسار التصميم التفاعلي لتوليد محطتك بنجاح.' 
            : 'Sorry, I couldn\'t reach the dynamic solar consultant engine. Please proceed with the built-in step-by-step sizing buttons.' 
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // --- MATHEMATICAL SIZING ENGINE ---
  const runSolarCalculations = () => {
    // 1. Determine daily kWh targets
    let dailyKwh = 0;
    let peakW = 0;

    if (systemType === 'pump') {
      const hp = pumpHp ? Number(pumpHp) : 10; // Default to 10 HP if not set
      // For water pumps, they run when sun shines, normally average 6 hours daily
      dailyKwh = (hp * 746 * 6) / 1000;
      peakW = hp * 746;
    } else if (consumptionMethod === 'appliances') {
      const live = calculateLiveConsumption();
      dailyKwh = live.dailyKwh;
      peakW = live.peakKw * 1000;
    } else {
      // Default rates
      if (kwhMonthly) {
        dailyKwh = kwhMonthly / 30;
      } else if (billAmount) {
        // Average residential tariff EGP/kWh ~ 1.50 EGP
        dailyKwh = (billAmount / 1.5) / 30;
      } else {
        // Fallback standard residential load
        dailyKwh = 15; // 15 kWh per day
      }
      peakW = Math.max(3000, (dailyKwh / 5.3) * 1.8 * 1000);
    }

    if (dailyKwh <= 0) dailyKwh = 10;
    if (peakW <= 0) peakW = 3000;

    // 2. Solar irradiance estimation
    let psh = 5.3; // Cairo default
    if (cityChoice === 'أسوان') psh = 6.2;
    else if (cityChoice === 'الإسكندرية') psh = 5.1;
    else if (cityChoice === 'الغردقة') psh = 5.8;

    // 3. System loss factor
    const systemLosses = 0.75; // 25% losses

    // 4. Solar Target Panel Capacity in kW
    const solarCapacityKw = dailyKwh / (psh * systemLosses);

    // Filter strictly available products from the store database
    const realPanels = (products || []).filter(p => p.category === 'panels');
    const realInverters = (products || []).filter(p => p.category === 'inverters');
    const realBatteries = (products || []).filter(p => p.category === 'batteries');

    // Option A: Budget Sizing
    const budgetPanel = realPanels.find(p => p.power <= 410) || realPanels[0] || null;
    const budgetInverter = realInverters[0] || null;
    const budgetPanelPower = budgetPanel ? budgetPanel.power : 550;
    const budgetPanelArea = budgetPanel ? (budgetPanel.area || 2.1) : 2.1;
    const budgetQtyPanels = Math.max(2, Math.ceil((solarCapacityKw * 1000) / budgetPanelPower));
    const budgetRealKw = (budgetQtyPanels * budgetPanelPower) / 1000;
    const budgetInverterQty = Math.ceil(budgetRealKw / 5);
    
    // Option B: Recommended Option Sizing
    const recPanel = realPanels.find(p => p.brand?.toLowerCase() === 'longi') || (realPanels.length > 1 ? realPanels[1] : realPanels[0]) || null;
    const recInverter = realInverters.find(p => p.brand?.toLowerCase() === 'growatt') || (realInverters.length > 1 ? realInverters[1] : realInverters[0]) || null;
    const recPanelPower = recPanel ? recPanel.power : 550;
    const recPanelArea = recPanel ? (recPanel.area || 2.1) : 2.1;
    const recQtyPanels = Math.max(2, Math.ceil((solarCapacityKw * 1000) / recPanelPower));
    const recRealKw = (recQtyPanels * recPanelPower) / 1000;
    const recInverterQty = Math.ceil(recRealKw / 5);

    // Option C: Premium Option Sizing
    const premiumPanel = realPanels.find(p => p.brand?.toLowerCase() === 'jinko') || (realPanels.length > 2 ? realPanels[2] : realPanels[0]) || null;
    const premiumInverter = (realInverters.length > 2 ? realInverters[2] : realInverters[0]) || null;
    const premiumPanelPower = premiumPanel ? premiumPanel.power : 550;
    const premiumPanelArea = premiumPanel ? (premiumPanel.area || 2.1) : 2.1;
    const premiumQtyPanels = Math.max(2, Math.ceil((solarCapacityKw * 1150) / premiumPanelPower));
    const premiumRealKw = (premiumQtyPanels * premiumPanelPower) / 1000;
    const premiumInverterQty = Math.ceil(premiumRealKw / 5);

    // 5. Battery sizing (None for On-Grid, off-grid consumes full nightly storage, hybrid consumes ~40% backup storage)
    const activeBattery = realBatteries[0] || null;
    const batteryUnitKwh = activeBattery?.power ? activeBattery.power / 1000 : 2.4;

    let budgetQtyBattery = 0;
    let recQtyBattery = 0;
    let premiumQtyBattery = 0;

    if (systemType === 'off-grid') {
      budgetQtyBattery = Math.max(1, Math.ceil(dailyKwh * 1.0 / batteryUnitKwh));
      recQtyBattery = Math.max(2, Math.ceil(dailyKwh * 1.2 / batteryUnitKwh));
      premiumQtyBattery = Math.max(4, Math.ceil(dailyKwh * 1.5 / batteryUnitKwh));
    } else if (systemType === 'hybrid') {
      budgetQtyBattery = Math.max(1, Math.ceil(dailyKwh * 0.4 / batteryUnitKwh));
      recQtyBattery = Math.max(2, Math.ceil(dailyKwh * 0.5 / batteryUnitKwh));
      premiumQtyBattery = Math.max(3, Math.ceil(dailyKwh * 0.8 / batteryUnitKwh));
    }

    // Protection Devices & Mounting brackets pricing models
    const budgetProtection = 8500;
    const recProtection = 14500;
    const premiumProtection = 22000;

    const budgetCables = Math.round(1500 + budgetRealKw * 1300);
    const recCables = Math.round(2500 + recRealKw * 1600);
    const premiumCables = Math.round(4000 + premiumRealKw * 2200);

    const budgetMounting = budgetQtyPanels * 1200;
    const recMounting = recQtyPanels * 1500;
    const premiumMounting = premiumQtyPanels * 1900;

    const hasRealBudgetProducts = Boolean(budgetPanel && budgetInverter);
    const hasRealRecProducts = Boolean(recPanel && recInverter);
    const hasRealPremiumProducts = Boolean(premiumPanel && premiumInverter);

    // Summing pricing in EGP if real products exist in store
    const costBudget = hasRealBudgetProducts
      ? (budgetQtyPanels * (budgetPanel?.price || 0)) + 
        (budgetInverterQty * (budgetInverter?.price || 0)) + 
        (budgetQtyBattery * (activeBattery?.price || 0)) + 
        budgetProtection + budgetCables + budgetMounting
      : 0;

    const costRec = hasRealRecProducts
      ? (recQtyPanels * (recPanel?.price || 0)) + 
        (recInverterQty * (recInverter?.price || 0)) + 
        (recQtyBattery * (activeBattery?.price || 0)) + 
        recProtection + recCables + recMounting
      : 0;

    const costPremium = hasRealPremiumProducts
      ? (premiumQtyPanels * (premiumPanel?.price || 0)) + 
        (premiumInverterQty * (premiumInverter?.price || 0)) + 
        (premiumQtyBattery * (activeBattery?.price || 0)) + 
        premiumProtection + premiumCables + premiumMounting
      : 0;

    // Financial calculations: Annual yield (kWh), savings (EGP), Payback (Years), ROI (%)
    const valuePerKwh = 2.25; 
    const annualKwhYieldBase = dailyKwh * 365 * 0.95;

    let annualSavingsBudget = annualKwhYieldBase * valuePerKwh;
    if (systemType === 'pump') {
      const activeHp = pumpHp ? Number(pumpHp) : 10;
      annualSavingsBudget = activeHp * 6 * 230 * 6.0;
    }
    const paybackBudget = costBudget > 0 ? (costBudget / annualSavingsBudget) : 0;
    const roiBudget = costBudget > 0 ? ((annualSavingsBudget / costBudget) * 100) : 0;

    let annualSavingsRec = annualKwhYieldBase * 1.05 * valuePerKwh;
    if (systemType === 'pump') {
      const activeHp = pumpHp ? Number(pumpHp) : 10;
      annualSavingsRec = activeHp * 6 * 230 * 7.5;
    }
    const paybackRec = costRec > 0 ? (costRec / annualSavingsRec) : 0;
    const roiRec = costRec > 0 ? ((annualSavingsRec / costRec) * 100) : 0;

    let annualSavingsPremium = annualKwhYieldBase * 1.10 * valuePerKwh;
    if (systemType === 'pump') {
      const activeHp = pumpHp ? Number(pumpHp) : 10;
      annualSavingsPremium = activeHp * 6 * 230 * 9.0;
    }
    const paybackPremium = costPremium > 0 ? (costPremium / annualSavingsPremium) : 0;
    const roiPremium = costPremium > 0 ? ((annualSavingsPremium / costPremium) * 100) : 0;

    return {
      loads: {
        dailyKwh,
        peakW,
        sunHours: psh
      },
      tiers: {
        budget: {
          titleAr: 'الخيار الاقتصادي (أقل تكلفة بمنتجات قياسية متميزة)',
          titleEn: 'Budget Option (Standard stable entry setup)',
          cost: costBudget,
          hasRealProducts: hasRealBudgetProducts,
          panel: budgetPanel,
          panelQty: budgetQtyPanels,
          panelPowerTotalKw: budgetRealKw,
          panelArea: budgetQtyPanels * budgetPanelArea,
          inverter: budgetInverter,
          inverterQty: budgetInverterQty,
          battery: activeBattery,
          batteryQty: budgetQtyBattery,
          batteryPowerTotalKwh: budgetQtyBattery * batteryUnitKwh,
          cables: budgetCables,
          protection: budgetProtection,
          mounting: budgetMounting,
          financials: {
            annualSavings: annualSavingsBudget,
            payback: paybackBudget,
            roi: roiBudget,
            annualYield: annualKwhYieldBase
          }
        },
        recommended: {
          titleAr: 'الخيار الموصى به (أفضل قيمة وسعر مقابل الفاعلية والأطول عمراً)',
          titleEn: 'Recommended Option (Optimal payback and elite lifespan)',
          cost: costRec,
          hasRealProducts: hasRealRecProducts,
          panel: recPanel,
          panelQty: recQtyPanels,
          panelPowerTotalKw: recRealKw,
          panelArea: recQtyPanels * recPanelArea,
          inverter: recInverter,
          inverterQty: recInverterQty,
          battery: activeBattery,
          batteryQty: recQtyBattery,
          batteryPowerTotalKwh: recQtyBattery * batteryUnitKwh,
          cables: recCables,
          protection: recProtection,
          mounting: recMounting,
          financials: {
            annualSavings: annualSavingsRec,
            payback: paybackRec,
            roi: roiRec,
            annualYield: annualKwhYieldBase * 1.05
          }
        },
        premium: {
          titleAr: 'الخيار الفاخر (أقصى قدرة للتشغيل، أعلى كفاءة وضمانات ممتدة)',
          titleEn: 'Premium Option (Ultimate performance, maximum backup and elite protection)',
          cost: costPremium,
          hasRealProducts: hasRealPremiumProducts,
          panel: premiumPanel,
          panelQty: premiumQtyPanels,
          panelPowerTotalKw: premiumRealKw,
          panelArea: premiumQtyPanels * premiumPanelArea,
          inverter: premiumInverter,
          inverterQty: premiumInverterQty,
          battery: activeBattery,
          batteryQty: premiumQtyBattery,
          batteryPowerTotalKwh: premiumQtyBattery * batteryUnitKwh,
          cables: premiumCables,
          protection: premiumProtection,
          mounting: premiumMounting,
          financials: {
            annualSavings: annualSavingsPremium,
            payback: paybackPremium,
            roi: roiPremium,
            annualYield: annualKwhYieldBase * 1.10
          }
        }
      }
    };
  };

  // Helper to build fully dynamic WhatsApp message with complete customer, system and package specifications directly from the package object.
  const buildDynamicWhatsAppMessage = (
    tier: 'budget' | 'recommended' | 'premium',
    currentCalc: any,
    assignedRequestId?: string
  ) => {
    const selectedTierData = currentCalc.tiers[tier];
    if (!selectedTierData) return '';

    const sysLabel = isAr
      ? (systemType === 'on-grid' ? 'متصل بالشبكة (On-Grid)' : systemType === 'off-grid' ? 'منفصل عن الشبكة (Off-Grid)' : systemType === 'hybrid' ? 'هجين (Hybrid)' : 'طلمبة ري (Solar Pump)')
      : (systemType === 'on-grid' ? 'On-Grid' : systemType === 'off-grid' ? 'Off-Grid' : systemType === 'hybrid' ? 'Hybrid' : 'Water Pump');

    const tierName = isAr
      ? (tier === 'budget' ? 'الباقة الاقتصادية' : tier === 'premium' ? 'الباقة الفاخرة' : 'الباقة الموصى بها')
      : (tier === 'budget' ? 'Budget' : tier === 'premium' ? 'Premium' : 'Recommended');

    const annualYield = selectedTierData.financials?.annualYield || 0;
    const annualSavings = selectedTierData.financials?.annualSavings || 0;

    // Dynamic extraction of details from selectedTierData and user inputs
    const customerName = leadForm.name || (isAr ? 'غير محدد' : 'Not Specified');
    const customerPhone = leadForm.phone || (isAr ? 'غير محدد' : 'Not Specified');
    const governorate = locationStr || cityChoice || (isAr ? 'غير محدد' : 'Not Specified');
    const additionalNotes = leadForm.notes || (isAr ? 'لا يوجد' : 'None');

    const panelQty = selectedTierData.panelQty || 0;
    const panelBrand = selectedTierData.panel?.brand || (isAr ? 'غير محدد' : 'Not Specified');
    const panelModel = selectedTierData.panel?.nameAr || selectedTierData.panel?.name || (isAr ? 'غير محدد' : 'Not Specified');
    const panelPower = selectedTierData.panel?.power ? `${selectedTierData.panel.power} W` : (isAr ? 'غير محدد' : 'Not Specified');

    const inverterBrand = selectedTierData.inverter?.brand || (isAr ? 'غير محدد' : 'Not Specified');
    const inverterModel = selectedTierData.inverter?.nameAr || selectedTierData.inverter?.name || (isAr ? 'غير محدد' : 'Not Specified');

    const batteryQty = selectedTierData.batteryQty || 0;
    const batteryBrand = batteryQty > 0 ? (selectedTierData.battery?.brand || (isAr ? 'غير محدد' : 'Not Specified')) : (isAr ? 'لا يوجد (بدون بطاريات)' : 'None (No Batteries)');
    const batteryCapacity = batteryQty > 0 ? `${selectedTierData.batteryPowerTotalKwh?.toFixed(1)} kWh` : (isAr ? 'لا يوجد' : 'None');

    const mountingStructureCost = selectedTierData.mounting ? `${selectedTierData.mounting.toLocaleString()} ${isAr ? 'ج.م' : 'EGP'}` : (isAr ? 'غير محدد' : 'Not Specified');
    const dcProtectionCost = selectedTierData.protection ? `${Math.round(selectedTierData.protection * 0.5).toLocaleString()} ${isAr ? 'ج.م' : 'EGP'}` : (isAr ? 'غير محدد' : 'Not Specified');
    const acProtectionCost = selectedTierData.protection ? `${Math.round(selectedTierData.protection * 0.5).toLocaleString()} ${isAr ? 'ج.م' : 'EGP'}` : (isAr ? 'غير محدد' : 'Not Specified');
    const dcCableCost = selectedTierData.cables ? `${Math.round(selectedTierData.cables * 0.55).toLocaleString()} ${isAr ? 'ج.م' : 'EGP'}` : (isAr ? 'غير محدد' : 'Not Specified');
    const acCableCost = selectedTierData.cables ? `${Math.round(selectedTierData.cables * 0.45).toLocaleString()} ${isAr ? 'ج.م' : 'EGP'}` : (isAr ? 'غير محدد' : 'Not Specified');

    const annualProductionStr = `${Math.round(annualYield).toLocaleString()} ${isAr ? 'كيلو واط ساعة / سنة' : 'kWh/year'}`;
    const annualSavingsStr = `${Math.round(annualSavings).toLocaleString()} ${isAr ? 'ج.م / سنة' : 'EGP/year'}`;
    const totalCostStr = `${selectedTierData.cost?.toLocaleString()} ${isAr ? 'ج.م' : 'EGP'}`;
    const warrantyStr = isAr 
      ? `ضمان الألواح حتى 12-25 سنة / الإنفرتر 5 سنوات (طبقاً لشروط المورد المعتمد)` 
      : `Panels warranty up to 12-25 years / Inverter 5 years (under supplier terms)`;

    const reqIdTag = assignedRequestId ? `🆔 *كود الطلب الرسمي:* ${assignedRequestId}\n\n` : '';
    const reqIdTagEn = assignedRequestId ? `🆔 *Official Request ID:* ${assignedRequestId}\n\n` : '';

    if (isAr) {
      return `مرحباً، أود الحصول على عرض سعر وتفاصيل لهذه الباقة عبر Enerjoo:\n\n` +
             reqIdTag +
             `👤 *بيانات العميل:*\n` +
             `- الاسم بالكامل: ${customerName}\n` +
             `- رقم الهاتف: ${customerPhone}\n` +
             `- المحافظة/الموقع: ${governorate}\n` +
             `- ملاحظات إضافية: ${additionalNotes}\n\n` +
             `⚡ *مواصفات النظام الشمسى (System Details):*\n` +
             `- نوع النظام: ${sysLabel}\n` +
             `- الاستهلاك الشهري: ${kwhMonthly ? `${kwhMonthly} كيلو واط ساعة` : 'غير متاح (طلمبة ري)'}\n` +
             `- الاستهلاك اليومي: ${currentCalc.loads.dailyKwh.toFixed(1)} كيلو واط ساعة / يوم\n` +
             `- قدرة المحطة المطلوبة: ${selectedTierData.panelPowerTotalKw.toFixed(2)} كيلو واط\n\n` +
             `📦 *تفاصيل الباقة المختارة (${tierName}):*\n` +
             `- اسم الباقة: ${tierName}\n` +
             `- عدد الألواح: ${panelQty} لوح\n` +
             `- براند الألواح: ${panelBrand}\n` +
             `- موديل الألواح: ${panelModel}\n` +
             `- قدرة اللوح الواحد: ${panelPower}\n` +
             `- براند الإنفرتر: ${inverterBrand}\n` +
             `- موديل الإنفرتر: ${inverterModel}\n` +
             `- براند البطاريات: ${batteryBrand}\n` +
             `- سعة البطارية الإجمالية: ${batteryCapacity}\n` +
             `- عدد البطاريات: ${batteryQty}\n` +
             `- هيكل وتثبيت الألواح: هيكل ألومنيوم معتمد مقاوم للرياح (${mountingStructureCost})\n` +
             `- أجهزة لوحة الحماية DC: شامل مجمع قواطع ومصاهر حماية التيار المستمر (${dcProtectionCost})\n` +
             `- أجهزة لوحة الحماية AC: شامل قواطع وموانع صواعق وتأريض حماية التيار المتردد (${acProtectionCost})\n` +
             `- كابلات التيار المستمر DC: كابلات نحاسية معتمدة مقاومة للحرارة والشمس (${dcCableCost})\n` +
             `- كابلات التيار المتردد AC: كابلات ربط معتمدة شاملة (${acCableCost})\n` +
             `- إنتاجية الطاقة السنوية المتوقعة: ${annualProductionStr}\n` +
             `- الوفر المالي السنوي المتوقع: ${annualSavingsStr}\n` +
             `- التكلفة الإجمالية الاسترشادية للباقة: ${totalCostStr}\n` +
             `- فترة الضمان: ${warrantyStr}`;
    } else {
      return `Hello, I'd like to get a custom quote for this package via Enerjoo:\n\n` +
             reqIdTagEn +
             `👤 *Customer Information:*\n` +
             `- Full Name: ${customerName}\n` +
             `- Phone Number: ${customerPhone}\n` +
             `- Governorate/Location: ${governorate}\n` +
             `- Additional Notes: ${additionalNotes}\n\n` +
             `⚡ *System Details:*\n` +
             `- System Type: ${sysLabel}\n` +
             `- Monthly Consumption: ${kwhMonthly ? `${kwhMonthly} kWh` : 'Not Specified'}\n` +
             `- Daily Consumption: ${currentCalc.loads.dailyKwh.toFixed(1)} kWh/day\n` +
             `- Required System Size: ${selectedTierData.panelPowerTotalKw.toFixed(2)} kW\n\n` +
             `📦 *Selected Package Details (${tierName}):*\n` +
             `- Package Name: ${tierName}\n` +
             `- Number of Panels: ${panelQty} panels\n` +
             `- Panel Brand: ${panelBrand}\n` +
             `- Panel Model: ${panelModel}\n` +
             `- Panel Power: ${panelPower}\n` +
             `- Inverter Brand: ${inverterBrand}\n` +
             `- Inverter Model: ${inverterModel}\n` +
             `- Battery Brand: ${batteryBrand}\n` +
             `- Battery Capacity: ${batteryCapacity}\n` +
             `- Number of Batteries: ${batteryQty}\n` +
             `- Mounting Structure: Aluminum structural frame (${mountingStructureCost})\n` +
             `- DC Protection: DC circuit breakers & fuses protection box (${dcProtectionCost})\n` +
             `- AC Protection: AC breakers, surge protection devices & grounding system (${acProtectionCost})\n` +
             `- DC Cable: Thermal resistant solar copper cables (${dcCableCost})\n` +
             `- AC Cable: Standard connection AC cables set (${acCableCost})\n` +
             `- Estimated Annual Production: ${annualProductionStr}\n` +
             `- Estimated Annual Saving: ${annualSavingsStr}\n` +
             `- Total Estimated Cost: ${totalCostStr}\n` +
             `- Warranty: ${warrantyStr}`;
    }
  };

  // Dynamic WhatsApp package booking with automatic Firestore lead submission
  const handleRequestPackage = async (tier: 'budget' | 'recommended' | 'premium') => {
    if (!leadForm.name || !leadForm.phone) {
      setLeadForm(prev => ({ 
        ...prev, 
        error: isAr 
          ? 'يرجى كتابة الاسم بالكامل ورقم الهاتف أولاً في قسم "سجل بياناتك" بالأسفل لتضمينها في الطلب.' 
          : 'Please fill in your Full Name and Phone Number in the section below first to include them in the request.' 
      }));
      const element = document.getElementById('lead-form-section');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    if (!isValidEgyptianPhone(leadForm.phone)) {
      setLeadForm(prev => ({
        ...prev,
        error: isAr 
          ? 'يرجى إدخال رقم هاتف مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015 ويتكون من 11 رقماً.' 
          : 'Please enter a valid Egyptian mobile phone number.'
      }));
      return;
    }

    const normalizedPhone = normalizeEgyptianPhone(leadForm.phone);
    setLeadForm(prev => ({ ...prev, phone: normalizedPhone, loading: true, error: null }));

    const currentCalc = runSolarCalculations();
    const selectedTierData = currentCalc.tiers[tier];
    if (!selectedTierData) {
      setLeadForm(prev => ({ ...prev, loading: false }));
      return;
    }

    const assignedRequestId = leadForm.lastRequestId || generateSolarRequestId();
    const msg = buildDynamicWhatsAppMessage(tier, currentCalc, assignedRequestId);

    try {
      // 1. Save to comprehensive solarRequests collection
      await createSolarRequest({
        requestId: assignedRequestId,
        customerId: user?.uid || null,
        customerName: leadForm.name,
        customerPhone: normalizedPhone,
        governorate: cityChoice || user?.governorate || 'القاهرة',
        location: locationStr || cityChoice || 'مصر',
        systemType: systemType || 'hybrid',
        tier,
        inputs: {
          monthlyBill: typeof billAmount === 'number' ? billAmount : undefined,
          consumptionKwh: typeof kwhMonthly === 'number' ? kwhMonthly : undefined,
          sunHours: currentCalc.loads.sunHours || 5.5,
          cityChoice,
          locationStr,
          pumpHp: typeof pumpHp === 'number' ? pumpHp : undefined,
          appliances: appliancesList.filter(a => a.qty > 0).map(a => ({
            name: isAr ? a.nameAr : a.nameEn,
            power: a.watts,
            count: a.qty,
            hours: a.hours
          }))
        },
        calculatedOutputs: {
          systemSizeKw: selectedTierData.panelPowerTotalKw || 0,
          estimatedCost: selectedTierData.cost,
          panelQty: selectedTierData.panelQty,
          panelModel: selectedTierData.panel ? (isAr ? selectedTierData.panel.nameAr : selectedTierData.panel.name) : undefined,
          panelWatt: selectedTierData.panel?.power || 585,
          panelCost: selectedTierData.panel ? selectedTierData.panel.price * selectedTierData.panelQty : undefined,
          inverterQty: selectedTierData.inverterQty,
          inverterModel: selectedTierData.inverter ? (isAr ? selectedTierData.inverter.nameAr : selectedTierData.inverter.name) : undefined,
          inverterKw: selectedTierData.inverter?.power || selectedTierData.panelPowerTotalKw,
          inverterCost: selectedTierData.inverter ? selectedTierData.inverter.price * selectedTierData.inverterQty : undefined,
          batteryQty: selectedTierData.batteryQty,
          batteryModel: selectedTierData.battery ? (isAr ? selectedTierData.battery.nameAr : selectedTierData.battery.name) : undefined,
          batteryKwh: selectedTierData.battery?.power || undefined,
          batteryCost: selectedTierData.battery ? selectedTierData.battery.price * selectedTierData.batteryQty : undefined,
          annualProductionKwh: selectedTierData.financials?.annualYield || 0,
          annualSavingsEgp: selectedTierData.financials?.annualSavings || 0,
          paybackYears: selectedTierData.financials?.payback || 0,
          dcProtectionCost: selectedTierData.protection ? Math.round(selectedTierData.protection * 0.5) : 0,
          acProtectionCost: selectedTierData.protection ? Math.round(selectedTierData.protection * 0.5) : 0,
          dcCableCost: selectedTierData.cables ? Math.round(selectedTierData.cables * 0.55) : 0,
          acCableCost: selectedTierData.cables ? Math.round(selectedTierData.cables * 0.45) : 0,
          structureCost: selectedTierData.mounting || 0,
          installationCost: 0,
          warrantyYears: 10
        },
        notes: leadForm.notes || '',
        status: 'pending'
      });

      // 2. Also save to quotations collection with all explicit quotation fields
      await createQuotation({
        requestId: assignedRequestId,
        customerId: user?.uid || null,
        userId: user?.uid || null,
        customerName: leadForm.name || user?.name || 'عميل إينرجو',
        customerEmail: user?.email || '',
        phone: normalizedPhone,
        systemType: systemType || 'hybrid',
        location: locationStr || cityChoice || 'مصر',
        usage: (typeof kwhMonthly === 'number' ? kwhMonthly : 0) || (systemType === 'pump' ? (typeof pumpHp === 'number' ? pumpHp : 0) : 0),
        monthlyBill: typeof billAmount === 'number' ? billAmount : 0,
        batteryRequired: systemType === 'off-grid' || systemType === 'hybrid',
        systemSpecs: `${tier.toUpperCase()}: Panels=${selectedTierData.panelQty}pcs, Inverter=${selectedTierData.inverterQty}pcs, Battery=${selectedTierData.batteryQty}pcs`,
        targetTier: tier,
        priceEstimate: selectedTierData.cost,
        status: 'pending',
        notes: leadForm.notes || ''
      });
      setLeadForm(prev => ({ 
        ...prev, 
        submitted: true, 
        loading: false,
        lastRequestId: assignedRequestId 
      }));
    } catch (err: any) {
      console.error(err);
      setLeadForm(prev => ({ 
        ...prev, 
        submitted: true, 
        loading: false,
        lastRequestId: assignedRequestId 
      }));
    }

    window.open(`https://wa.me/${CUSTOMER_SERVICE_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Dynamic WhatsApp contact for a specific supplier with automatic Firestore lead submission
  const handleRequestSupplierDirect = async (sup: any) => {
    if (!leadForm.name || !leadForm.phone) {
      setLeadForm(prev => ({ 
        ...prev, 
        error: isAr 
          ? 'يرجى كتابة الاسم بالكامل ورقم الهاتف أولاً في قسم "سجل بياناتك" بالأسفل لتضمينها في الطلب.' 
          : 'Please fill in your Full Name and Phone Number in the section below first to include them in the request.' 
      }));
      const element = document.getElementById('lead-form-section');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    if (!isValidEgyptianPhone(leadForm.phone)) {
      setLeadForm(prev => ({
        ...prev,
        error: isAr 
          ? 'يرجى إدخال رقم هاتف مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015 ويتكون من 11 رقماً.' 
          : 'Please enter a valid Egyptian mobile phone number.'
      }));
      return;
    }

    const normalizedPhone = normalizeEgyptianPhone(leadForm.phone);
    setLeadForm(prev => ({ ...prev, phone: normalizedPhone, loading: true, error: null }));

    const currentCalc = runSolarCalculations();
    const selectedTierData = currentCalc.tiers[currentTier];
    if (!selectedTierData) {
      setLeadForm(prev => ({ ...prev, loading: false }));
      return;
    }

    const assignedRequestId = leadForm.lastRequestId || generateSolarRequestId();
    const msg = buildDynamicWhatsAppMessage(currentTier, currentCalc, assignedRequestId);

    try {
      // 1. Save to solarRequests collection
      await createSolarRequest({
        requestId: assignedRequestId,
        customerId: user?.uid || null,
        customerName: leadForm.name,
        customerPhone: normalizedPhone,
        governorate: cityChoice || user?.governorate || 'القاهرة',
        location: locationStr || cityChoice || 'مصر',
        systemType: systemType || 'hybrid',
        tier: currentTier,
        inputs: {
          monthlyBill: typeof billAmount === 'number' ? billAmount : undefined,
          consumptionKwh: typeof kwhMonthly === 'number' ? kwhMonthly : undefined,
          sunHours: currentCalc.loads.sunHours || 5.5,
          cityChoice,
          locationStr,
          pumpHp: typeof pumpHp === 'number' ? pumpHp : undefined,
        },
        calculatedOutputs: {
          systemSizeKw: selectedTierData.panelPowerTotalKw || 0,
          estimatedCost: selectedTierData.cost,
          panelQty: selectedTierData.panelQty,
          panelModel: selectedTierData.panel ? (isAr ? selectedTierData.panel.nameAr : selectedTierData.panel.name) : undefined,
          panelWatt: selectedTierData.panel?.power || 585,
          panelCost: selectedTierData.panel ? selectedTierData.panel.price * selectedTierData.panelQty : undefined,
          inverterQty: selectedTierData.inverterQty,
          inverterModel: selectedTierData.inverter ? (isAr ? selectedTierData.inverter.nameAr : selectedTierData.inverter.name) : undefined,
          inverterKw: selectedTierData.inverter?.power || selectedTierData.panelPowerTotalKw,
          inverterCost: selectedTierData.inverter ? selectedTierData.inverter.price * selectedTierData.inverterQty : undefined,
          batteryQty: selectedTierData.batteryQty,
          batteryModel: selectedTierData.battery ? (isAr ? selectedTierData.battery.nameAr : selectedTierData.battery.name) : undefined,
          batteryKwh: selectedTierData.battery?.power || undefined,
          batteryCost: selectedTierData.battery ? selectedTierData.battery.price * selectedTierData.batteryQty : undefined,
          annualProductionKwh: selectedTierData.financials?.annualYield || 0,
          annualSavingsEgp: selectedTierData.financials?.annualSavings || 0,
          paybackYears: selectedTierData.financials?.payback || 0,
          dcProtectionCost: selectedTierData.protection ? Math.round(selectedTierData.protection * 0.5) : 0,
          acProtectionCost: selectedTierData.protection ? Math.round(selectedTierData.protection * 0.5) : 0,
          dcCableCost: selectedTierData.cables ? Math.round(selectedTierData.cables * 0.55) : 0,
          acCableCost: selectedTierData.cables ? Math.round(selectedTierData.cables * 0.45) : 0,
          structureCost: selectedTierData.mounting || 0,
          installationCost: 0,
          warrantyYears: 10
        },
        notes: leadForm.notes || '',
        status: 'pending',
        supplierContacted: sup.name
      });

      // 2. Save to quotations collection with all explicit quotation fields
      await createQuotation({
        requestId: assignedRequestId,
        customerId: user?.uid || null,
        userId: user?.uid || null,
        customerName: leadForm.name || user?.name || 'عميل إينرجو',
        customerEmail: user?.email || '',
        phone: normalizedPhone,
        systemType: systemType || 'hybrid',
        location: locationStr || cityChoice || 'مصر',
        usage: (typeof kwhMonthly === 'number' ? kwhMonthly : 0) || (systemType === 'pump' ? (typeof pumpHp === 'number' ? pumpHp : 0) : 0),
        monthlyBill: typeof billAmount === 'number' ? billAmount : 0,
        batteryRequired: systemType === 'off-grid' || systemType === 'hybrid',
        systemSpecs: `${currentTier.toUpperCase()}: Panels=${selectedTierData.panelQty}pcs, Inverter=${selectedTierData.inverterQty}pcs, Battery=${selectedTierData.batteryQty}pcs`,
        targetTier: currentTier,
        priceEstimate: selectedTierData.cost,
        status: 'pending',
        notes: leadForm.notes || '',
        supplierContacted: sup.name
      });
      setLeadForm(prev => ({ 
        ...prev, 
        submitted: true, 
        loading: false,
        lastRequestId: assignedRequestId
      }));
    } catch (err: any) {
      console.error(err);
      setLeadForm(prev => ({ 
        ...prev, 
        submitted: true, 
        loading: false,
        lastRequestId: assignedRequestId
      }));
    }

    const targetSupplierWhatsApp = sup?.phone ? normalizeEgyptianPhone(sup.phone) : SUPPLIER_CONTACT_WHATSAPP_NUMBER;
    const cleanWaNum = targetSupplierWhatsApp.startsWith('0') ? `2${targetSupplierWhatsApp}` : targetSupplierWhatsApp.startsWith('+2') ? targetSupplierWhatsApp.replace('+', '') : targetSupplierWhatsApp;
    window.open(`https://wa.me/${cleanWaNum}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Submit Lead Inquirer Form
  const handleSubmitLeadForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadForm.name || !leadForm.phone) {
      setLeadForm(prev => ({
        ...prev,
        error: isAr ? 'يرجى كتابة الاسم ورقم الهاتف بالكامل.' : 'Please enter your Full Name and Phone Number.'
      }));
      return;
    }

    if (!isValidEgyptianPhone(leadForm.phone)) {
      setLeadForm(prev => ({
        ...prev,
        error: isAr 
          ? 'يرجى إدخال رقم هاتف مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015 ويتكون من 11 رقماً.' 
          : 'Please enter a valid Egyptian mobile phone number starting with 010, 011, 012, or 015.'
      }));
      return;
    }

    const normalizedPhone = normalizeEgyptianPhone(leadForm.phone);
    setLeadForm(prev => ({ ...prev, phone: normalizedPhone, loading: true, error: null }));

    const currentCalc = runSolarCalculations();
    const selectedTierData = currentCalc.tiers[currentTier];
    const assignedRequestId = leadForm.lastRequestId || generateSolarRequestId();

    try {
      // 1. Save to solarRequests collection
      await createSolarRequest({
        requestId: assignedRequestId,
        customerId: user?.uid || null,
        customerName: leadForm.name,
        customerPhone: normalizedPhone,
        governorate: cityChoice || user?.governorate || 'القاهرة',
        location: locationStr || cityChoice || 'مصر',
        systemType: systemType || 'hybrid',
        tier: currentTier,
        inputs: {
          monthlyBill: typeof billAmount === 'number' ? billAmount : undefined,
          consumptionKwh: typeof kwhMonthly === 'number' ? kwhMonthly : undefined,
          sunHours: currentCalc.loads.sunHours || 5.5,
          cityChoice,
          locationStr,
          pumpHp: typeof pumpHp === 'number' ? pumpHp : undefined,
          appliances: appliancesList.filter(a => a.qty > 0).map(a => ({
            name: isAr ? a.nameAr : a.nameEn,
            power: a.watts,
            count: a.qty,
            hours: a.hours
          }))
        },
        calculatedOutputs: {
          systemSizeKw: selectedTierData?.panelPowerTotalKw || 0,
          estimatedCost: selectedTierData?.cost,
          panelQty: selectedTierData?.panelQty || 0,
          panelModel: selectedTierData?.panel ? (isAr ? selectedTierData.panel.nameAr : selectedTierData.panel.name) : undefined,
          panelWatt: selectedTierData?.panel?.power || 585,
          panelCost: selectedTierData?.panel ? selectedTierData.panel.price * selectedTierData.panelQty : undefined,
          inverterQty: selectedTierData?.inverterQty || 0,
          inverterModel: selectedTierData?.inverter ? (isAr ? selectedTierData.inverter.nameAr : selectedTierData.inverter.name) : undefined,
          inverterKw: selectedTierData?.inverter?.power || selectedTierData?.panelPowerTotalKw,
          inverterCost: selectedTierData?.inverter ? selectedTierData.inverter.price * selectedTierData.inverterQty : undefined,
          batteryQty: selectedTierData?.batteryQty || 0,
          batteryModel: selectedTierData?.battery ? (isAr ? selectedTierData.battery.nameAr : selectedTierData.battery.name) : undefined,
          batteryKwh: selectedTierData?.battery?.power || undefined,
          batteryCost: selectedTierData?.battery ? selectedTierData.battery.price * selectedTierData.batteryQty : undefined,
          annualProductionKwh: selectedTierData?.financials?.annualYield || 0,
          annualSavingsEgp: selectedTierData?.financials?.annualSavings || 0,
          paybackYears: selectedTierData?.financials?.payback || 0,
          dcProtectionCost: selectedTierData?.protection ? Math.round(selectedTierData.protection * 0.5) : 0,
          acProtectionCost: selectedTierData?.protection ? Math.round(selectedTierData.protection * 0.5) : 0,
          dcCableCost: selectedTierData?.cables ? Math.round(selectedTierData.cables * 0.55) : 0,
          acCableCost: selectedTierData?.cables ? Math.round(selectedTierData.cables * 0.45) : 0,
          structureCost: selectedTierData?.mounting || 0,
          installationCost: 0,
          warrantyYears: 10
        },
        notes: leadForm.notes || '',
        status: 'pending'
      });

      // 2. Save to quotations collection with all explicit quotation fields
      await createQuotation({
        requestId: assignedRequestId,
        customerId: user?.uid || null,
        userId: user?.uid || null,
        customerName: leadForm.name || user?.name || 'عميل إينرجو',
        customerEmail: user?.email || '',
        phone: normalizedPhone,
        systemType: systemType || 'hybrid',
        location: locationStr || cityChoice || 'مصر',
        usage: (typeof kwhMonthly === 'number' ? kwhMonthly : 0) || (systemType === 'pump' ? (typeof pumpHp === 'number' ? pumpHp : 0) : 0),
        monthlyBill: typeof billAmount === 'number' ? billAmount : 0,
        batteryRequired: systemType === 'off-grid' || systemType === 'hybrid',
        systemSpecs: `${currentTier.toUpperCase()}: Panels=${selectedTierData?.panelQty || 0}pcs, Inverter=${selectedTierData?.inverterQty || 0}pcs, Battery=${selectedTierData?.batteryQty || 0}pcs`,
        targetTier: currentTier,
        priceEstimate: selectedTierData?.cost || 0,
        status: 'pending',
        notes: leadForm.notes || ''
      });

      setLeadForm(prev => ({
        ...prev,
        submitted: true,
        loading: false,
        lastRequestId: assignedRequestId
      }));
    } catch (err: any) {
      console.error(err);
      setLeadForm(prev => ({
        ...prev,
        submitted: true,
        loading: false,
        lastRequestId: assignedRequestId
      }));
    }
  };

  const currentSelection = step === 'results' ? runSolarCalculations() : null;
  const currentTierData = currentSelection ? currentSelection.tiers[currentTier] : null;

  return (
    <div className="max-w-4xl mx-auto py-3 sm:py-6 px-3 sm:px-4 pb-28 sm:pb-16">
      {/* Sizing Header Banner */}
      <div className="mb-4 sm:mb-6 flex justify-between items-center bg-white border border-solar-border p-3 sm:p-4.5 rounded-2xl sm:rounded-3xl shadow-2xs">
        <button 
          onClick={onBack}
          className="flex items-center gap-1.5 sm:gap-2 text-solar-muted hover:text-solar-blue transition-all font-black text-xs sm:text-sm cursor-pointer p-1"
        >
          <ArrowLeft size={16} className={isAr ? "rotate-0" : "rotate-180"} />
          <span>{isAr ? 'الرجوع للمتجر' : 'Go back to store'}</span>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 bg-solar-blue/10 text-solar-blue px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-tight">
          <Sparkles size={13} className="animate-pulse" />
          <span>{isAr ? 'مستشار المبيعات الذكي' : 'Expert Engineering AI'}</span>
        </div>
      </div>

      {/* Main Conversational Layout */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6">
        
        {/* The Chat/State Module */}
        <div className="bg-white border border-solar-border rounded-2xl sm:rounded-[36px] shadow-lg overflow-hidden flex flex-col h-[calc(100dvh-180px)] min-h-[500px] max-h-[720px] sm:h-[650px]">
          
          {/* Active AI Doctor Card Top Info */}
          <div className="bg-gradient-to-r from-solar-blue to-indigo-700/80 p-3.5 sm:p-5 text-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="relative shrink-0">
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full"></span>
                <div className="p-2 sm:p-3 bg-white/10 rounded-xl sm:rounded-2xl">
                  <Calculator size={18} className="text-white sm:w-[22px] sm:h-[22px]" />
                </div>
              </div>
              <div className="min-w-0">
                <h2 className="font-display font-black text-xs sm:text-base tracking-tight leading-tight truncate">
                  {isAr ? 'الاستشاري الهندسي الذكي' : 'Smart Solar Consultant'}
                </h2>
                <p className="text-[9px] sm:text-[10px] text-white/75 font-bold truncate">
                  {isAr ? 'تصميم فوري ومطابقة حية وفقاً للكودات والكتالوج' : 'Egyptian engineering codes & real-time product matching'}
                </p>
              </div>
            </div>
            
            {/* Quick Refresh buttons during chat */}
            <button 
              onClick={() => {
                setStep('system_type');
                setSystemType(null);
                setConsumptionMethod(null);
                setKwhMonthly('');
                setBillAmount('');
                setPumpHp('');
                setCityChoice('');
                setLeadForm({ name: '', phone: '', notes: '', submitted: false, loading: false, error: null });
                const greetingText = isAr 
                  ? 'أهلاً بك مجدداً! يسعدني إعطاؤك استشارات جديدة بدقة هندسية تامة. ما هي طبيعة نظام المحطة الشمسية التي تود التخطيط لها الآن؟'
                  : 'Welcome back! Let\'s model a brand new solar system. What is your primary energy goal for this design?';
                setMessages([
                  { id: 'g-' + Date.now(), sender: 'ai', text: greetingText, timestamp: new Date() }
                ]);
              }}
              className="p-2 hover:bg-white/15 rounded-xl transition text-white cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title={isAr ? 'إعادة التصميم والبدء من جديد' : 'Reset & Start Over'}
            >
              <RefreshCw size={14} />
              <span className="hidden md:inline">{isAr ? 'بدء جديد' : 'Reset'}</span>
            </button>
          </div>

          {/* Sizing Stream Body Chat */}
          <div className="p-4 md:p-6 flex-1 overflow-y-auto space-y-4 bg-slate-50/50 bg-[radial-gradient(#e2e8f0_1.2px,transparent_1.2px)] [background-size:16px_16px]">
            {messages.map((m) => (
              <motion.div 
                key={m.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 max-w-[85%] ${m.sender === 'user' ? (isAr ? 'mr-auto flex-row-reverse' : 'ml-auto') : (isAr ? 'ml-auto' : 'mr-auto')}`}
              >
                {/* Icons */}
                <div className={`p-2.5 rounded-xl h-fit inline-block flex-shrink-0 ${m.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                  {m.sender === 'user' ? <User size={16} /> : <Sparkles size={16} className="text-amber-600" />}
                </div>

                {/* Dialog container */}
                <div className={`p-4 rounded-3xl ${m.sender === 'user' ? 'bg-indigo-600 text-white text-sm font-bold rounded-tr-none' : 'bg-white border border-solar-border/80 text-solar-text shadow-sm text-sm font-medium rounded-tl-none leading-relaxed'}`}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>
              </motion.div>
            ))}

            {/* Simulated Chat Response loading indicator */}
            {chatLoading && (
              <div className="flex gap-3 max-w-[80%] mr-auto">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl h-fit">
                  <Sparkles size={16} className="animate-spin text-amber-600" />
                </div>
                <div className="p-4 rounded-3xl bg-white border border-solar-border/80 text-solar-muted text-xs font-bold">
                  <span>{isAr ? 'جاري الصياغة الفنية للمستشار...' : 'Consultant is writing...'}</span>
                </div>
              </div>
            )}

            {/* STEP 1 WIDGET: System type choices */}
            {step === 'system_type' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-solar-border p-6 rounded-[32px] shadow-sm space-y-6 mt-2 text-right"
              >
                <div className="flex flex-col items-center justify-center text-center space-y-1.5 border-b border-solar-border/65 pb-4">
                  <span className="bg-solar-blue/10 text-solar-blue px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    {isAr ? 'الخطوة الأولى: اختيار فئة النظام الشمسي' : 'Step 1: Select Solar System Class'}
                  </span>
                  <p className="text-xs text-solar-muted font-bold">
                    {isAr ? 'اضغط على فئة النظام المناسبة لطبيعة استهلاكك واحتياجك لتصميم المحطة مباشرة' : 'Select the power system class matching your operational and economic goals'}
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  
                  {/* ON-GRID CARD */}
                  <motion.div 
                    whileHover={{ scale: 1.015, y: -3 }}
                    whileTap={{ scale: 0.995 }}
                    onClick={() => selectSystemType('on-grid')}
                    className="p-5 border-2 border-emerald-100 hover:border-emerald-400 bg-emerald-50/10 hover:bg-emerald-50/25 rounded-[24px] transition-all cursor-pointer flex flex-col justify-between h-full relative overflow-hidden group shadow-sm hover:shadow-md"
                  >
                    <div className="absolute top-0 left-0 bg-emerald-500 text-white font-extrabold text-[9px] px-3 py-1 rounded-br-2xl uppercase tracking-wider">
                      {isAr ? 'الأعلى توفيراً للفاتورة' : 'Max Bill Savings'}
                    </div>

                    <div className="pt-4">
                      <div className="flex items-center gap-3 justify-end mb-3">
                        <div className="text-right">
                          <h4 className="font-black text-solar-text text-sm group-hover:text-emerald-700 transition-colors">
                            {isAr ? 'متصل بالشبكة (On-Grid)' : 'On-Grid System'}
                          </h4>
                          <span className="text-[10px] text-emerald-600 font-extrabold block">
                            {isAr ? 'لا يتطلب بطاريات / تبادل مع الدولة' : 'Utility Grid-Tied / Battery-Free'}
                          </span>
                        </div>
                        <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
                          <Zap size={22} className="text-emerald-600 animate-pulse" />
                        </div>
                      </div>

                      {/* Organized Bullet List */}
                      <ul className="text-xs text-solar-muted font-bold space-y-2 mb-4 leading-relaxed pr-1">
                        <li className="flex items-center justify-end gap-2 text-right">
                          <span>{isAr ? 'توفير فوري يصل حتى 100% من فاتورة الكهرباء' : 'Immediate offset up to 100% of electricity bills'}</span>
                          <Check size={14} className="text-emerald-600 shrink-0" />
                        </li>
                        <li className="flex items-center justify-end gap-2 text-right">
                          <span>{isAr ? 'أقل الأنظمة الشائعة في تكلفة التجهيز والتأسيس' : 'Lowest upfront setup budget of all architectures'}</span>
                          <Check size={14} className="text-emerald-600 shrink-0" />
                        </li>
                        <li className="flex items-center justify-end gap-2 text-right">
                          <span>{isAr ? 'تبادل وضخ يدعم العدادات الثنائية بالدولة' : 'Full net-metering allowance support'}</span>
                          <Check size={14} className="text-emerald-600 shrink-0" />
                        </li>
                        <li className="flex items-center justify-end gap-2 text-right text-[10px] text-amber-600">
                          <span>{isAr ? 'شعبة الأمان: يتوقف أثناء انقطاع الشبكة العمومية' : 'Shuts down during utility load-shedding for safety'}</span>
                          <Info size={12} className="text-amber-500 shrink-0" />
                        </li>
                      </ul>
                    </div>

                    <div className="border-t border-emerald-100/55 pt-3 flex justify-between items-center mt-2">
                      <span className="text-[10px] text-emerald-600 font-black group-hover:translate-x-[-4px] transition-transform">
                        {isAr ? '← اختر وابدأ التخمين الفني' : '← Select translation & Sizing'}
                      </span>
                      <span className="text-[10px] text-solar-muted font-black uppercase">Enerjoo GridSizer</span>
                    </div>
                  </motion.div>

                  {/* OFF-GRID CARD */}
                  <motion.div 
                    whileHover={{ scale: 1.015, y: -3 }}
                    whileTap={{ scale: 0.995 }}
                    onClick={() => selectSystemType('off-grid')}
                    className="p-5 border-2 border-indigo-100 hover:border-indigo-400 bg-indigo-50/10 hover:bg-indigo-50/25 rounded-[24px] transition-all cursor-pointer flex flex-col justify-between h-full relative overflow-hidden group shadow-sm hover:shadow-md"
                  >
                    <div className="absolute top-0 left-0 bg-indigo-600 text-white font-extrabold text-[9px] px-3 py-1 rounded-br-2xl uppercase tracking-wider">
                      {isAr ? 'استقلال كامل عازل للشبكة' : '100% Island OffGrid'}
                    </div>

                    <div className="pt-4">
                      <div className="flex items-center gap-3 justify-end mb-3">
                        <div className="text-right">
                          <h4 className="font-black text-solar-text text-sm group-hover:text-indigo-700 transition-colors">
                            {isAr ? 'منفصل تماماً (Off-Grid)' : 'Off-Grid System'}
                          </h4>
                          <span className="text-[10px] text-indigo-600 font-extrabold block">
                            {isAr ? 'مثالي للصحراء والمزارع والبيوت المعزولة' : 'Complete Energy Autonomy with Batteries'}
                          </span>
                        </div>
                        <div className="p-3 bg-indigo-100 text-indigo-800 rounded-2xl">
                          <Battery size={22} className="text-indigo-600" />
                        </div>
                      </div>

                      {/* Organized Bullet List */}
                      <ul className="text-xs text-solar-muted font-bold space-y-2 mb-4 leading-relaxed pr-1">
                        <li className="flex items-center justify-end gap-2 text-right">
                          <span>{isAr ? 'كهرباء آمنة وموثوقة بعيداً عن كابلات الدولة' : 'Total utility grid disconnection freedom'}</span>
                          <Check size={14} className="text-indigo-600 shrink-0" />
                        </li>
                        <li className="flex items-center justify-end gap-2 text-right">
                          <span>{isAr ? 'مخصص للأماكن الصحراوية والبعيدة والمزارع بمصر' : 'Perfect for deep desert, Egyptian farms & remote areas'}</span>
                          <Check size={14} className="text-indigo-600 shrink-0" />
                        </li>
                        <li className="flex items-center justify-end gap-2 text-right">
                          <span>{isAr ? 'يعتمد بالكامل على تخزين البطاريات للوضع الليلي' : 'Full reliance on energy storage for night cycles'}</span>
                          <Check size={14} className="text-indigo-600 shrink-0" />
                        </li>
                        <li className="flex items-center justify-end gap-2 text-right text-[10px] text-indigo-500">
                          <span>{isAr ? 'يلتزم ببطاريات ذات مواصفات وميزانية تأسيسية أعلى' : 'Higher initial costs due to heavy storage investment'}</span>
                          <Info size={12} className="text-indigo-500 shrink-0" />
                        </li>
                      </ul>
                    </div>

                    <div className="border-t border-indigo-100/55 pt-3 flex justify-between items-center mt-2">
                      <span className="text-[10px] text-indigo-600 font-black group-hover:translate-x-[-4px] transition-transform">
                        {isAr ? '← اختر وابدأ التخمين الفني' : '← Select translation & Sizing'}
                      </span>
                      <span className="text-[10px] text-solar-muted font-black uppercase">Enerjoo Standalone</span>
                    </div>
                  </motion.div>

                  {/* HYBRID CARD */}
                  <motion.div 
                    whileHover={{ scale: 1.015, y: -3 }}
                    whileTap={{ scale: 0.995 }}
                    onClick={() => selectSystemType('hybrid')}
                    className="p-5 border-2 border-amber-100 hover:border-amber-400 bg-amber-50/10 hover:bg-amber-50/25 rounded-[24px] transition-all cursor-pointer flex flex-col justify-between h-full relative overflow-hidden group shadow-sm hover:shadow-md"
                  >
                    <div className="absolute top-0 left-0 bg-amber-500 text-white font-extrabold text-[9px] px-3 py-1 rounded-br-2xl uppercase tracking-wider">
                      {isAr ? 'الأكثر طلباً لتأمين الانقطاع' : 'Smart Load-Shedding Shield'}
                    </div>

                    <div className="pt-4">
                      <div className="flex items-center gap-3 justify-end mb-3">
                        <div className="text-right">
                          <h4 className="font-black text-solar-text text-sm group-hover:text-amber-700 transition-colors">
                            {isAr ? 'النظام الهجين (Hybrid)' : 'Hybrid System'}
                          </h4>
                          <span className="text-[10px] text-amber-600 font-extrabold block">
                            {isAr ? 'توفير فواتير + بطاريات طوارئ للإنقطاع' : 'Power Insurance + Smart Grid Savings'}
                          </span>
                        </div>
                        <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl">
                          <Shield size={22} className="text-amber-600" />
                        </div>
                      </div>

                      {/* Organized Bullet List */}
                      <ul className="text-xs text-solar-muted font-bold space-y-2 mb-4 leading-relaxed pr-1">
                        <li className="flex items-center justify-end gap-2 text-right">
                          <span>{isAr ? 'الخيار الأذكى: فواتير منخفضة مع طاقة احتياطية' : 'Dual benefits: utility savings + uninterrupted power'}</span>
                          <Check size={14} className="text-amber-600 shrink-0" />
                        </li>
                        <li className="flex items-center justify-end gap-2 text-right">
                          <span>{isAr ? 'تشغيل منزلك تلقائياً في أجزاء من الثانية فور الانقطاع' : 'Seamless instant transfer during load shedding'}</span>
                          <Check size={14} className="text-amber-600 shrink-0" />
                        </li>
                        <li className="flex items-center justify-end gap-2 text-right">
                          <span>{isAr ? 'شحن فائق ونقاء كهرباء يحمي الأجهزة الحساسة' : 'Integrated clean wave filters protect costly appliances'}</span>
                          <Check size={14} className="text-amber-600 shrink-0" />
                        </li>
                        <li className="flex items-center justify-end gap-2 text-right text-[10px] text-amber-600">
                          <span>{isAr ? 'يعتمد على بطاريات ليثيوم LiFePO4 الذكية الأمنة' : 'Combines easily with modern safe LiFePO4 storage'}</span>
                          <Info size={12} className="text-amber-500 shrink-0" />
                        </li>
                      </ul>
                    </div>

                    <div className="border-t border-amber-100/55 pt-3 flex justify-between items-center mt-2">
                      <span className="text-[10px] text-amber-600 font-black group-hover:translate-x-[-4px] transition-transform">
                        {isAr ? '← اختر وابدأ التخمين الفني' : '← Select translation & Sizing'}
                      </span>
                      <span className="text-[10px] text-solar-muted font-black uppercase">Enerjoo Smart Backup</span>
                    </div>
                  </motion.div>

                  {/* PUMP CARD */}
                  <motion.div 
                    whileHover={{ scale: 1.015, y: -3 }}
                    whileTap={{ scale: 0.995 }}
                    onClick={() => selectSystemType('pump')}
                    className="p-5 border-2 border-cyan-100 hover:border-cyan-400 bg-cyan-50/10 hover:bg-cyan-50/25 rounded-[24px] transition-all cursor-pointer flex flex-col justify-between h-full relative overflow-hidden group shadow-sm hover:shadow-md"
                  >
                    <div className="absolute top-0 left-0 bg-cyan-500 text-white font-extrabold text-[9px] px-3 py-1 rounded-br-2xl uppercase tracking-wider">
                      {isAr ? 'بديل الديزل والمولدات للمزارع' : 'Diesel Replacement'}
                    </div>

                    <div className="pt-4">
                      <div className="flex items-center gap-3 justify-end mb-3">
                        <div className="text-right">
                          <h4 className="font-black text-solar-text text-sm group-hover:text-cyan-700 transition-colors">
                            {isAr ? 'طلمبات ومضخات مياه الري (Solar Pump)' : 'Solar Water Pump'}
                          </h4>
                          <span className="text-[10px] text-cyan-600 font-extrabold block">
                            {isAr ? 'تشغيل آبار الري مباشرة بدون بطاريات بالنهار' : 'Direct Agricultural Water Pumps'}
                          </span>
                        </div>
                        <div className="p-3 bg-cyan-100 text-cyan-800 rounded-2xl">
                          <Droplet size={22} className="text-cyan-600" />
                        </div>
                      </div>

                      {/* Organized Bullet List */}
                      <ul className="text-xs text-solar-muted font-bold space-y-2 mb-4 leading-relaxed pr-1">
                        <li className="flex items-center justify-end gap-2 text-right">
                          <span>{isAr ? 'تشغيل طلمبات وغواطس المزارع مباشرة بالنهار' : 'Power heavy wells & discharge pumps directly in the sun'}</span>
                          <Check size={14} className="text-cyan-600 shrink-0" />
                        </li>
                        <li className="flex items-center justify-end gap-2 text-right">
                          <span>{isAr ? 'توفير 50% من ميزانية النظام لعدم وجود بطاريات' : 'No batteries needed - saving 50% on system expense'}</span>
                          <Check size={14} className="text-cyan-600 shrink-0" />
                        </li>
                        <li className="flex items-center justify-end gap-2 text-right">
                          <span>{isAr ? 'إنفرتر مغير سرعة ذكي (VFD) يحمي طلمبتك بالكامل' : 'Smart heavy VFD inverter soft-start protection'}</span>
                          <Check size={14} className="text-cyan-600 shrink-0" />
                        </li>
                        <li className="flex items-center justify-end gap-2 text-right text-[10px] text-cyan-500">
                          <span>{isAr ? 'حذف فوري لتكاليف وقود المولدات وصيانتها الصعبة' : 'Stops unpredictable fuel prices & generator wear completely'}</span>
                          <Info size={12} className="text-cyan-500 shrink-0" />
                        </li>
                      </ul>
                    </div>

                    <div className="border-t border-cyan-100/55 pt-3 flex justify-between items-center mt-2">
                      <span className="text-[10px] text-cyan-600 font-black group-hover:translate-x-[-4px] transition-transform">
                        {isAr ? '← اختر وابدأ التخمين الفني' : '← Select translation & Sizing'}
                      </span>
                      <span className="text-[10px] text-solar-muted font-black uppercase">Enerjoo PumpSizer</span>
                    </div>
                  </motion.div>

                </div>
              </motion.div>
            )}

            {/* STEP 2 WIDGET FOR PUMP: Select pump Horsepower capacity */}
            {step === 'pump_hp_input' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-solar-border p-6 rounded-[32px] shadow-sm space-y-6 mt-2 text-right"
              >
                <div className="flex flex-col items-center justify-center text-center space-y-1 pb-2 border-b border-solar-border/60">
                  <span className="bg-cyan-100 text-cyan-800 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    {isAr ? 'الخطوةالثانية: تحديد قدرة طلمبة المياه بالحصان (HP)' : 'Step 2: Define Water Pump Horsepower Capacity'}
                  </span>
                  <p className="text-xs text-solar-muted font-bold">
                    {isAr ? 'اختر القدرة المطابقة لماتور الغاطس الخاص بك بالحصان لتحديد مقاسات الألواح وإنفرتر VFD المناسب' : 'Pick your pump rating in HP to size the required panels & VFD inverter'}
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Category 1: Light Capacity */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg inline-block">
                      🌱 {isAr ? 'سطحية وأبار ضحلة (1 - 5 حصان)' : 'Shallow Wells / Small Drip (1 - 5 HP)'}
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[1, 2, 3, 5].map((hp) => (
                        <button 
                          key={hp}
                          onClick={() => selectPumpHp(hp)}
                          className="p-3 border border-solar-border hover:border-emerald-400 bg-solar-light/35 hover:bg-emerald-50/10 text-center rounded-xl transition cursor-pointer flex flex-col items-center justify-center gap-1 hover:shadow-xs group"
                        >
                          <span className="text-sm font-black text-solar-text group-hover:text-emerald-700">{hp} {isAr ? 'حصان' : 'HP'}</span>
                          <span className="text-[10px] text-solar-muted font-bold">~{(hp * 0.746).toFixed(2)} kW</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category 2: Medium Capacity */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-solar-blue bg-solar-blue/5 border border-solar-blue/10 px-2.5 py-1 rounded-lg inline-block">
                      💧 {isAr ? 'مزارع متوسطة وغواطس أعماق (7.5 - 20 حصان)' : 'Standard Farms & Borewells (7.5 - 20 HP)'}
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[7.5, 10, 15, 20].map((hp) => (
                        <button 
                          key={hp}
                          onClick={() => selectPumpHp(hp)}
                          className="p-3 border border-solar-border hover:border-solar-blue bg-solar-light/35 hover:bg-solar-blue/5 text-center rounded-xl transition cursor-pointer flex flex-col items-center justify-center gap-1 hover:shadow-xs group"
                        >
                          <span className="text-sm font-black text-solar-text group-hover:text-solar-blue">{hp} {isAr ? 'حصان' : 'HP'}</span>
                          <span className="text-[10px] text-solar-muted font-bold">~{(hp * 0.746).toFixed(2)} kW</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category 3: Heavy Duty */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-purple-700 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-lg inline-block">
                      🚀 {isAr ? 'تصرفات كبرى وآبار عميقة (25 - 50 حصان)' : 'Heavy Duty / Deep Aquifers (25 - 50 HP)'}
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[25, 30, 40, 50].map((hp) => (
                        <button 
                          key={hp}
                          onClick={() => selectPumpHp(hp)}
                          className="p-3 border border-solar-border hover:border-purple-400 bg-solar-light/35 hover:bg-purple-50/10 text-center rounded-xl transition cursor-pointer flex flex-col items-center justify-center gap-1 hover:shadow-xs group"
                        >
                          <span className="text-sm font-black text-solar-text group-hover:text-purple-700">{hp} {isAr ? 'حصان' : 'HP'}</span>
                          <span className="text-[10px] text-solar-muted font-bold">~{(hp * 0.746).toFixed(2)} kW</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-solar-border pt-4 text-center">
                  <p className="text-[11px] text-solar-muted font-extrabold mb-2 text-right">
                    ✏️ {isAr ? 'أو أدخل القدرة بالحصان يدوياً إذا كانت لديك قيمة مخصصة:' : 'Or enter custom Horsepower value manually:'}
                  </p>
                  <div className="flex gap-2 max-w-sm ml-auto">
                    <input 
                      type="number"
                      placeholder={isAr ? 'مثال: 12.5' : 'e.g. 12.5'}
                      value={pumpHp}
                      onChange={(e) => setPumpHp(e.target.value ? parseFloat(e.target.value) : '')}
                      className="flex-1 bg-solar-light px-4 py-2.5 rounded-xl border border-solar-border outline-none font-black text-center text-xs"
                    />
                    <button 
                      onClick={() => {
                        if (pumpHp && Number(pumpHp) > 0) {
                          selectPumpHp(Number(pumpHp));
                        }
                      }}
                      disabled={!pumpHp || Number(pumpHp) <= 0}
                      className="bg-solar-blue hover:bg-solar-blue/95 disabled:bg-solar-blue/40 text-white font-black text-xs px-5 rounded-xl cursor-pointer transition shrink-0"
                    >
                      {isAr ? 'متابعة' : 'Continue'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 2 WIDGET: Select load entry mechanism */}
            {step === 'consumption_method' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white border border-solar-border p-5 rounded-[28px] shadow-sm space-y-3 mt-2"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button 
                    onClick={() => selectConsumptionMethod('bill')}
                    className="p-5 border border-solar-border hover:border-solar-blue bg-solar-light/30 hover:bg-white rounded-2xl transition text-right cursor-pointer flex items-center gap-4"
                  >
                    <div className="p-3 bg-solar-blue/10 text-solar-blue rounded-xl flex-shrink-0">
                      <Calculator size={20} />
                    </div>
                    <div>
                      <h4 className="font-black text-solar-text text-sm">{isAr ? 'أعرف استهلاكي (الأرقام مباشرة)' : 'Enter figures directly'}</h4>
                      <p className="text-xs text-solar-muted mt-0.5 font-semibold">{isAr ? 'إدخال قيمة الفاتورة أو الاستهلاك الشهري بالكيلوواط' : 'Insert direct monthly bills or values.'}</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => selectConsumptionMethod('appliances')}
                    className="p-5 border border-solar-border hover:border-solar-blue bg-solar-light/30 hover:bg-white rounded-2xl transition text-right cursor-pointer flex items-center gap-4"
                  >
                    <div className="p-3 bg-solar-blue/10 text-solar-blue rounded-xl flex-shrink-0">
                      <Layers size={12} className="hidden" />
                      <Wrench size={20} className="text-amber-600" />
                    </div>
                    <div>
                      <h4 className="font-black text-solar-text text-sm">{isAr ? 'لا أعرف استهلاكي (أحتاج لحساب الأجهزة)' : 'Appliance consumption-based sizing'}</h4>
                      <p className="text-xs text-solar-muted mt-0.5 font-semibold">{isAr ? 'استخدام حاسبة تفاعلية واختيار الأجهزة وتوقيت تشغيلها' : 'Interactive wizard listing typical devices.'}</p>
                    </div>
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2 WIDGET B: Direct Input fields for monthly references */}
            {step === 'bill_input' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-solar-border p-5 rounded-[28px] shadow-sm mt-2"
              >
                <form onSubmit={handleBillSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-solar-text block">{isAr ? 'قيمة فاتورة الكهرباء الشهرية (جنيه مصري)' : 'Average Monthly Bill (EGP)'}</label>
                      <input 
                        type="number"
                        placeholder="مثال: 1500"
                        value={billAmount}
                        onChange={(e) => {
                          setBillAmount(e.target.value ? parseInt(e.target.value) : '');
                          setKwhMonthly('');
                        }}
                        className="w-full bg-solar-light text-solar-text font-bold px-4 py-3 rounded-xl border border-solar-border outline-none focus:border-solar-blue focus:bg-white text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-solar-text block">{isAr ? 'أو أدخل الاستهلاك الإجمالي المباشر (كيلوواط/ساعة - kWh)' : 'Or insert Monthly Consumption (kWh)'}</label>
                      <input 
                        type="number"
                        placeholder="مثال: 450"
                        value={kwhMonthly}
                        onChange={(e) => {
                          setKwhMonthly(e.target.value ? parseInt(e.target.value) : '');
                          setBillAmount('');
                        }}
                        className="w-full bg-solar-light text-solar-text font-bold px-4 py-3 rounded-xl border border-solar-border outline-none focus:border-solar-blue focus:bg-white text-sm"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={!billAmount && !kwhMonthly}
                    className="w-full bg-solar-blue hover:bg-solar-blue/95 disabled:bg-solar-blue/40 text-white font-black text-xs py-3.5 px-6 rounded-xl transition cursor-pointer"
                  >
                    {isAr ? 'تأكيد الحجم للاستهلاك ومتابعة ⚡' : 'Confirm Consumption & Continue ⚡'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* STEP 2 WIDGET C: Interactive appliances wizard list */}
            {step === 'appliance_calculator' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white border border-solar-border p-4.5 rounded-[32px] shadow-sm mt-2 space-y-4"
              >
                <div className="flex justify-between items-center border-b border-solar-border/75 pb-2.5">
                  <h3 className="text-xs font-black text-solar-text flex items-center gap-1.5">
                    <Calculator size={14} className="text-solar-blue" />
                    <span>{isAr ? 'حاسبة الأجهزة السريعة' : 'Interactive Load Sizing Panel'}</span>
                  </h3>
                  <div className="text-[10px] bg-solar-blue/10 text-solar-blue font-black px-2.5 py-1 rounded-full">
                    {isAr ? `التقدير الكلي: ${calculateLiveConsumption().dailyKwh.toFixed(1)} كيلوواط ساعة/يوم` : `Live Total: ${calculateLiveConsumption().dailyKwh.toFixed(1)} kWh/day`}
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1 text-right">
                  {appliancesList.map((item) => (
                    <div 
                      key={item.id}
                      className="border border-solar-border/60 hover:border-solar-border p-3.5 rounded-2xl flex items-center justify-between gap-5 transition"
                    >
                      <div className="w-1/2 flex flex-col gap-1.5">
                        <h4 className="text-xs font-black text-solar-text leading-tight">{isAr ? item.nameAr : item.nameEn}</h4>
                        <div className="flex items-center gap-1.5 focus-within:text-solar-blue transition-colors">
                          <span className="text-[10px] text-solar-muted font-bold whitespace-nowrap">
                            {isAr ? 'القدرة (وات):' : 'Power (W):'}
                          </span>
                          <input
                            type="number"
                            min="1"
                            max="15000"
                            value={item.watts || ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              adjustApplianceWatts(item.id, val);
                            }}
                            className="w-16 px-1.5 py-0.5 text-[10px] font-black text-solar-text text-center border border-solar-border/75 rounded-lg focus:border-solar-blue focus:ring-1 focus:ring-solar-blue/20 bg-solar-light/35 focus:bg-white outline-none transition"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        {/* Qty count control */}
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            onClick={() => adjustApplianceQty(item.id, -1)}
                            className="w-7 h-7 bg-solar-light hover:bg-solar-border text-solar-text font-black rounded-lg transition-all cursor-pointer flex items-center justify-center text-sm"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="text-xs font-black text-solar-text w-6 text-center">{item.qty}</span>
                          <button 
                            type="button"
                            onClick={() => adjustApplianceQty(item.id, 1)}
                            className="w-7 h-7 bg-solar-light hover:bg-solar-border text-solar-text font-black rounded-lg transition-all cursor-pointer flex items-center justify-center text-sm"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        {/* Hours control slider */}
                        {item.qty > 0 && (
                          <div className="w-24 text-center">
                            <span className="text-[9px] text-solar-muted font-black block">
                              {isAr ? `تشغيل: ${item.hours} ساعة` : `Daily: ${item.hours} hrs`}
                            </span>
                            <input 
                              type="range"
                              min="1"
                              max="24"
                              step="0.5"
                              value={item.hours}
                              onChange={(e) => adjustApplianceHours(item.id, parseFloat(e.target.value))}
                              className="w-full accent-solar-blue opacity-85 mt-1"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={confirmAppliancesEstimate}
                  className="w-full bg-solar-blue hover:bg-solar-blue/95 text-white font-black text-xs py-3.5 px-6 rounded-2xl transition cursor-pointer shadow-md shadow-solar-blue/15"
                >
                  {isAr ? 'تأكيد أجهزة الاستهلاك واحتساب الأحمال ⚡' : 'Confirm Loads & Size System ⚡'}
                </button>
              </motion.div>
            )}

            {/* STEP 3 WIDGET: Local Egypt location choices */}
            {step === 'location' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-solar-border p-5 rounded-[28px] shadow-sm mt-2 space-y-4"
              >
                <div className="text-xs font-black text-solar-muted text-center uppercase tracking-wider">
                  📍 {isAr ? 'اختر أقرب محافظة لموقعك بمصر للحصول على أفضل دقة إشعاع' : 'Select nearest city in Egypt'}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {['القاهرة', 'الجيزة', 'الإسكندرية', 'أسوان', 'الغردقة', 'فارس كور', 'المنوفية', 'الدقهلية'].map((city) => (
                    <button 
                      key={city}
                      onClick={() => selectCity(city)}
                      className="p-3 border border-solar-border hover:border-solar-blue bg-solar-light/35 hover:bg-white text-center font-black text-xs rounded-xl transition cursor-pointer"
                    >
                      {city}
                    </button>
                  ))}
                </div>

                <div className="border-t border-solar-border pt-4 text-center">
                  <p className="text-[10px] text-solar-muted font-bold mb-2">
                    {isAr ? 'أو أدخل موقعك يدوياً إذا كنت من محافظة أخرى:' : 'Or enter custom location details manually:'}
                  </p>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder={isAr ? 'مثال: أسيوط، مصر' : 'e.g. Asyut, Egypt'}
                      value={locationStr}
                      onChange={(e) => setLocationStr(e.target.value)}
                      className="flex-1 bg-solar-light px-4 py-2.5 rounded-xl border border-solar-border outline-none font-bold text-xs"
                    />
                    <button 
                      onClick={() => selectCity(locationStr || 'القاهرة')}
                      className="bg-solar-blue text-white font-black text-xs px-4 rounded-xl cursor-pointer"
                    >
                      {isAr ? 'اعتمد' : 'Ok'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 4 WIDGET: Egyptian Mobile Phone Collection Step */}
            {step === 'phone_input' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-solar-border p-5 rounded-[28px] shadow-sm mt-2 space-y-4 text-right"
              >
                <div className="flex items-center justify-between border-b border-solar-border/70 pb-3">
                  <div className="text-xs font-black text-solar-text flex items-center gap-1.5">
                    <PhoneCall size={14} className="text-solar-blue" />
                    <span>{isAr ? 'رقم الهاتف للتواصل وعرض السعر' : 'Contact Phone for Quotation'}</span>
                  </div>
                  {user?.email && (
                    <div className="text-[11px] bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-full flex items-center gap-1 border border-emerald-100">
                      <Mail size={12} className="text-emerald-600" />
                      <span className="truncate max-w-[140px]">{user.email}</span>
                    </div>
                  )}
                </div>

                <div className="bg-solar-light/50 p-3 rounded-2xl border border-solar-border/40 text-[11px] text-solar-muted font-bold leading-relaxed">
                  {isAr 
                    ? `مرحباً ${leadForm.name || user?.name || 'بك'}! سيتم ربط عرض السعر بحسابك على منصة Enerjoo وحفظ مواصفات محطتك الشمسية لتتمكن من مراجعتها وتلقي عروض الموردين.` 
                    : `Welcome ${leadForm.name || user?.name || 'Customer'}! Your solar quotation will be registered and linked with your Enerjoo profile.`}
                </div>

                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handlePhoneSubmit();
                  }}
                  className="space-y-3.5"
                >
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-solar-text block">
                      {isAr ? 'رقم الهاتف المحمول (مصر)' : 'Mobile Phone Number (Egypt)'}
                    </label>
                    <div className="relative flex items-center">
                      <input 
                        type="tel"
                        required
                        placeholder={isAr ? 'مثال: 01012345678 أو 011...' : 'e.g. 01012345678'}
                        value={leadForm.phone}
                        onChange={(e) => {
                          setLeadForm(prev => ({ ...prev, phone: e.target.value, error: null }));
                        }}
                        className="w-full bg-solar-light px-4 py-3 rounded-xl border border-solar-border outline-none focus:border-solar-blue focus:bg-white font-mono font-bold text-sm text-left dir-ltr"
                        dir="ltr"
                      />
                      <span className="absolute right-3 text-xs font-black text-solar-muted pointer-events-none flex items-center gap-1">
                        <span>🇪🇬</span>
                        <span>+20</span>
                      </span>
                    </div>
                  </div>

                  {leadForm.error && (
                    <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-100 flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0 text-red-500" />
                      <span>{leadForm.error}</span>
                    </div>
                  )}

                  <button 
                    type="submit"
                    disabled={!leadForm.phone.trim() || chatLoading}
                    className="w-full bg-solar-blue hover:bg-solar-blue/95 disabled:bg-solar-blue/40 text-white font-black text-xs py-3.5 px-6 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                  >
                    <span>{isAr ? 'تأكيد رقم الهاتف وحساب المقايسة الهندسية ⚡' : 'Confirm Phone & Calculate Quotation ⚡'}</span>
                  </button>
                </form>
              </motion.div>
            )}

            {/* STEP 4: Beautiful Calculations Loader */}
            {step === 'calculating' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white border border-solar-border p-10 rounded-[36px] shadow-md flex flex-col items-center justify-center text-center space-y-6 progress-calc-loop mt-4"
              >
                <div className="relative flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-16 w-16 rounded-full bg-solar-blue/20"></span>
                  <div className="p-6 bg-solar-blue/10 text-solar-blue rounded-full relative">
                    <Calculator size={36} className="animate-spin text-solar-blue" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-display font-black text-lg text-solar-text">
                    {isAr ? 'جاري طحن الأرقام وتصميم المحطة الذكية...' : 'AI Sizing Engine actively optimizing...'}
                  </h3>
                  <p className="text-xs text-solar-muted font-black max-w-sm animate-pulse">
                    {isAr ? 'نقوم بحساب السعة للألواح والبطاريات ومطابقة المنتجات الحالية من الموردين...' : 'Matching localized code criteria and calculating system components...'}
                  </p>
                </div>
              </motion.div>
            )}

            {/* STEP 5: Big calculations dashboard output */}
            {step === 'results' && currentSelection && currentTierData && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 text-right"
              >
                <div className="bg-emerald-50 text-emerald-800 border-2 border-emerald-100 p-4 rounded-2xl flex items-center gap-3.5">
                  <CheckCircle2 className="text-emerald-600 shrink-0" size={24} />
                  <div>
                    <h4 className="font-black text-sm">{isAr ? 'تم تصميم النظام بنجاح!' : 'System sizing complete'}</h4>
                    <p className="text-xs text-emerald-700 font-bold mt-0.5">
                      {isAr 
                        ? 'قمنا باحتساب المتطلبات الفنية الفضلى، ويمكنك الآن المقارنة واختيار ما يناسب ميزانيتك.' 
                        : 'Review matched product listings and dynamic financial return rates.'}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Sizing Stream Chat Prompt Input Footer */}
          <div className="border-t border-solar-border/85 p-3.5 bg-white flex items-center gap-2">
            <input 
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={isAr ? 'اسألني أي سؤال إضافي (مثال: هل الشاسيهات تأتي بضمان؟)...' : 'Type custom question or consult AI...'}
              className="flex-1 bg-solar-light text-solar-text font-bold text-xs py-3.5 px-4 rounded-xl border border-solar-border outline-none focus:border-solar-blue focus:bg-white placeholder:text-solar-muted/40 text-right"
              dir={isAr ? "rtl" : "ltr"}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendCustomQuery();
              }}
            />
            <button 
              onClick={sendCustomQuery}
              disabled={!inputMessage.trim() || chatLoading}
              className="p-3.5 bg-solar-blue hover:bg-solar-blue/90 disabled:bg-solar-blue/40 text-white rounded-xl transition cursor-pointer flex items-center justify-center"
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* RESULTS OUTCOME VIEW: When calculations complete, render comparative reports */}
        {step === 'results' && currentSelection && currentTierData && (
          <div className="space-y-8 mt-4">
            
            {/* Sizing Option segments slider selector */}
            <div className="bg-solar-light/60 p-1.5 border border-solar-border rounded-[28px] max-w-md mx-auto grid grid-cols-3 gap-1 shadow-inner">
              {(['budget', 'recommended', 'premium'] as const).map((tier) => (
                <button 
                  key={tier}
                  onClick={() => setCurrentTier(tier)}
                  className={`py-2.5 text-xs font-black rounded-2xl cursor-pointer transition-all ${currentTier === tier ? 'bg-solar-blue text-white shadow-md' : 'text-solar-muted hover:text-solar-text'}`}
                >
                  {tier === 'budget' ? (isAr ? 'اقتصادي' : 'Budget') : tier === 'recommended' ? (isAr ? 'الموصى به' : 'Recommended') : (isAr ? 'فاخر (الممتاز)' : 'Premium')}
                </button>
              ))}
            </div>

            {/* Active Sizing Option detail module */}
            <div className="bg-white border border-solar-border rounded-[40px] p-6 md:p-10 shadow-xl space-y-8 animate-fade-in relative z-10 transition-all">
              
              {/* Cost summary banner block */}
              <div className="md:flex md:items-center md:justify-between border-b border-solar-border/75 pb-6 gap-6 text-right">
                <div className="space-y-1 md:w-3/5">
                  <div className="inline-flex items-center gap-1.5 bg-solar-blue/10 text-solar-blue px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight">
                    <Sparkles size={12} />
                    <span>{currentTier === 'budget' ? (isAr ? 'أقل تكلفة استثمارية' : 'Lowest Sizing Price') : currentTier === 'recommended' ? (isAr ? 'القيمة والمطابقة الهندسية المثلى' : 'Best Return Sizing') : (isAr ? 'التقنية والمعدات الأكثر كفاءة وموثوقية' : 'Supreme Durability Sizing')}</span>
                  </div>
                  <h3 className="text-xl md:text-2xl font-display font-black text-solar-text">
                    {isAr ? currentSelection.tiers[currentTier].titleAr : currentSelection.tiers[currentTier].titleEn}
                  </h3>
                  <p className="text-xs text-solar-muted font-bold leading-relaxed">
                    {isAr 
                      ? 'محاسبة فنية تم توظيفها بموافقة الكودات المصرية لتبدأ فترات الاسترداد المالي فور التركيب المباشر.' 
                      : 'High-precision solar layout matching Egyptian environmental temperatures for supreme power yield.'}
                  </p>
                </div>

                <div className="mt-4 md:mt-0 md:text-left flex-shrink-0">
                  <div className="text-[10px] text-solar-muted font-bold uppercase tracking-widest">{isAr ? 'التكلفة الإجمالية' : 'TOTAL ESTIMATION'}</div>
                  {currentTierData.hasRealProducts ? (
                    <div className="text-3xl md:text-4xl font-display font-black text-solar-text tracking-tighter flex items-baseline gap-1 bg-solar-light/60 px-5 py-2.5 rounded-2xl border border-solar-border/10">
                      {currentSelection.tiers[currentTier].cost.toLocaleString()}
                      <span className="text-sm font-bold text-solar-muted">{isAr ? 'ج.م' : 'EGP'}</span>
                    </div>
                  ) : (
                    <div className="bg-solar-light/60 px-4 py-2.5 rounded-2xl border border-solar-border/20 text-center mt-1">
                      <span className="text-xs font-black text-solar-blue">
                        {isAr ? 'تحدد حسب عروض الموردين المباشرة' : 'Subject to Direct RFQ Quote'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* PRODUCT RECOMMENDATIONS CATALOG DIRECT LINKS */}
              <div className="space-y-4">
                <h4 className="text-sm font-black text-solar-text flex items-center justify-end gap-1.5 text-right">
                  <Layers size={16} className="text-solar-blue" />
                  <span>{isAr ? 'المعدات والمنتجات المقترحة من متجر Enerjoo' : 'Recommended Marketplace Products Lineup'}</span>
                </h4>

                {(!currentTierData.panel && !currentTierData.inverter) ? (
                  <div className="bg-solar-light/20 border border-dashed border-solar-border/80 p-6 rounded-[28px] text-center space-y-3">
                    <div className="w-12 h-12 bg-solar-blue/10 text-solar-blue rounded-2xl flex items-center justify-center mx-auto text-xl font-black">
                      <Layers size={22} className="text-solar-blue" />
                    </div>
                    <h5 className="text-sm font-black text-solar-text">
                      {isAr ? 'لا توجد منتجات مضافة في المتجر حالياً لهذه الباقة' : 'No Store Products Currently Listed for this Tier'}
                    </h5>
                    <p className="text-xs text-solar-muted font-bold max-w-lg mx-auto leading-relaxed">
                      {isAr 
                        ? `تم حساب وتحديد القدرة الهندسية لمحطتك بدقة (${currentTierData.panelPowerTotalKw.toFixed(2)} كيلو واط). يمكنك إرسال المواصفات لتلقي عروض أسعار وتوريد معتمدة مباشرة من الموردين.`
                        : `Your required target capacity has been precisely sized to (${currentTierData.panelPowerTotalKw.toFixed(2)} kW). You can submit a direct quote request to receive proposals from certified suppliers.`}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Solar Panel Card */}
                    {currentTierData && currentTierData.panel && (
                      <div className="border border-solar-border rounded-[24px] overflow-hidden hover:shadow-lg transition-all flex flex-col justify-between h-fit bg-solar-light/10 text-right">
                        <div className="p-4 flex items-start gap-4">
                          <img 
                            src={currentTierData.panel.image} 
                            alt={currentTierData.panel.name} 
                            className="w-20 h-20 rounded-xl object-cover shrink-0 border border-solar-border/50"
                            referrerPolicy="no-referrer"
                          />
                          <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-solar-muted bg-white border border-solar-border/30 px-2.5 py-0.5 rounded-md">
                              {isAr ? 'فئة الألواح الشمسية' : 'Solar Board'}
                            </span>
                            <h5 
                              onClick={() => onProductClick(currentTierData.panel)}
                              className="text-xs font-black text-solar-text hover:text-solar-blue transition-colors cursor-pointer"
                            >
                              {isAr ? currentTierData.panel.nameAr : currentTierData.panel.name}
                            </h5>
                            <p className="text-[10px] text-solar-muted font-bold">
                              {isAr 
                                ? `العلامة: ${currentTierData.panel.brand} | الكفاءة: ${currentTierData.panel.efficiency}%`
                                : `Brand: ${currentTierData.panel.brand} | Efficiency: ${currentTierData.panel.efficiency}%`}
                            </p>
                          </div>
                        </div>

                        <div className="bg-solar-light/70 p-3 flex justify-between items-center border-t border-solar-border/50">
                          <div className="text-[11px] font-black text-solar-blue">
                            {isAr ? `الكمية الموصى بها: ${currentTierData.panelQty}` : `Qty needed: ${currentTierData.panelQty}`}
                          </div>
                          <div className="text-[11px] text-solar-text font-black">
                            {(currentTierData.panel.price * currentTierData.panelQty).toLocaleString()} {t.egp}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Solar Inverter Card */}
                    {currentTierData && currentTierData.inverter && (
                      <div className="border border-solar-border rounded-[24px] overflow-hidden hover:shadow-lg transition-all flex flex-col justify-between h-fit bg-solar-light/10 text-right">
                        <div className="p-4 flex items-start gap-4">
                          <img 
                            src={currentTierData.inverter.image} 
                            alt={currentTierData.inverter.name} 
                            className="w-20 h-20 rounded-xl object-cover shrink-0 border border-solar-border/50"
                            referrerPolicy="no-referrer"
                          />
                          <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-solar-muted bg-white border border-solar-border/30 px-2.5 py-0.5 rounded-md">
                              {systemType === 'pump'
                                ? (isAr ? 'مغير السرعة والإنفرتر (VFD/Drive)' : 'Pump Inverter (VFD)')
                                : (isAr ? 'فئة العواكس / الإنفرتر' : 'Solar Inverter')}
                            </span>
                            <h5 
                              onClick={() => onProductClick(currentTierData.inverter)}
                              className="text-xs font-black text-solar-text hover:text-solar-blue transition-colors cursor-pointer"
                            >
                              {isAr ? currentTierData.inverter.nameAr : currentTierData.inverter.name}
                            </h5>
                            <p className="text-[10px] text-solar-muted font-bold">
                              {isAr 
                                ? `القدرة التشغيلية: ${currentTierData.inverter.power} وات`
                                : `Rated Output: ${currentTierData.inverter.power}W`}
                            </p>
                          </div>
                        </div>

                        <div className="bg-solar-light/70 p-3 flex justify-between items-center border-t border-solar-border/50">
                          <div className="text-[11px] font-black text-solar-blue">
                            {isAr ? `الكمية الموصى بها: ${currentTierData.inverterQty}` : `Qty needed: ${currentTierData.inverterQty}`}
                          </div>
                          <div className="text-[11px] text-solar-text font-black">
                            {(currentTierData.inverter.price * currentTierData.inverterQty).toLocaleString()} {t.egp}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Battery Storage Pack Card */}
                    {currentTierData && currentTierData.batteryQty > 0 && currentTierData.battery && (
                      <div className="border border-solar-border rounded-[24px] overflow-hidden hover:shadow-lg transition-all flex flex-col justify-between h-fit bg-solar-light/10 text-right">
                        <div className="p-4 flex items-start gap-4">
                          <img 
                            src={currentTierData.battery.image} 
                            alt={currentTierData.battery.name} 
                            className="w-20 h-20 rounded-xl object-cover shrink-0 border border-solar-border/50"
                            referrerPolicy="no-referrer"
                          />
                          <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-solar-muted bg-white border border-solar-border/30 px-2.5 py-0.5 rounded-md">
                              {isAr ? 'تخزين الطاقة والبطاريات' : 'Battery Energy Storage'}
                            </span>
                            <h5 
                              onClick={() => onProductClick(currentTierData.battery)}
                              className="text-xs font-black text-solar-text hover:text-solar-blue transition-colors cursor-pointer"
                            >
                              {isAr ? currentTierData.battery.nameAr : currentTierData.battery.name}
                            </h5>
                            <p className="text-[10px] text-solar-muted font-bold">
                              {isAr 
                                ? `سعة التخزين: ${currentTierData.batteryPowerTotalKwh.toFixed(1)} kWh`
                                : `Total storage: ${currentTierData.batteryPowerTotalKwh.toFixed(1)} kWh`}
                            </p>
                          </div>
                        </div>

                        <div className="bg-solar-light/70 p-3 flex justify-between items-center border-t border-solar-border/50">
                          <div className="text-[11px] font-black text-solar-blue">
                            {isAr ? `الكمية الموصى بها: ${currentTierData.batteryQty}` : `Qty needed: ${currentTierData.batteryQty}`}
                          </div>
                          <div className="text-[11px] text-solar-text font-black">
                            {(currentTierData.battery.price * currentTierData.batteryQty).toLocaleString()} {t.egp}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Standard Premium Cables & Accessories Sizing (Real values calculated in EGP) */}
                    <div className="border border-solar-border rounded-[24px] p-4 bg-solar-light/10 flex flex-col justify-between text-right h-full text-right">
                      <div className="space-y-2">
                        <span className="text-[9px] font-black uppercase text-solar-muted bg-white border border-solar-border/30 px-2.5 py-0.5 rounded-md">
                          {isAr ? 'الإكسسوارات وهندسة التركيب' : 'Mounting, Cables & Surge Protection'}
                        </span>
                        <h5 className="text-xs font-black text-solar-text">{isAr ? 'قائمة الإكسسوارات ومجمعات الحماية الشاملة' : 'Integrated Electrical Protections List'}</h5>
                        
                        <ul className="text-[10px] text-solar-muted font-bold space-y-1 list-disc list-inside">
                          <li>{isAr ? `كابلات نحاسية معتمدة: ${currentTierData.cables.toLocaleString()} ج.م` : `Approved cables: ${currentTierData.cables.toLocaleString()} EGP`}</li>
                          <li>{isAr ? `هيكل تثبيت ألومنيوم مقاوم للرياح: ${currentTierData.mounting.toLocaleString()} ج.م` : `Aluminum structural frame: ${currentTierData.mounting.toLocaleString()} EGP`}</li>
                          <li>{isAr ? `أجهزة حماية AC/DC وقواطع مفاتيح: ${currentTierData.protection.toLocaleString()} ج.م` : `DC breakers & SPD sets: ${currentTierData.protection.toLocaleString()} EGP`}</li>
                        </ul>
                      </div>

                      <div className="bg-solar-light/70 p-3 flex justify-between items-center border-t border-solar-border/50 -mx-4 -mb-4 mt-4">
                        <div className="text-[10px] font-black text-solar-blue">{isAr ? 'جاهز للتركيب الشامل' : 'Turnkey configured'}</div>
                        <div className="text-[11px] text-solar-text font-black">
                          {((currentTierData.cables + currentTierData.mounting + currentTierData.protection)).toLocaleString()} {t.egp}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* TECHNICAL DESIGN REPORT SUMMARY */}
              <div className="bg-solar-light/35 border border-solar-border/60 rounded-[32px] p-6 text-right">
                <h4 className="text-sm font-black text-solar-text flex items-center justify-end gap-1.5 mb-4 border-b border-solar-border/50 pb-2.5">
                  <FileText className="text-solar-blue" size={16} />
                  <span>{isAr ? 'ملخص التقرير الفني وحجم التوليد' : 'Engineering Sizing Specs'}</span>
                </h4>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <div className="text-[10px] text-solar-muted font-bold uppercase">{isAr ? 'إجمالي قدرة الألواح' : 'PANEL GENERATION CAPACITY'}</div>
                    <div className="text-lg font-black text-solar-text mt-0.5">{currentTierData.panelPowerTotalKw.toFixed(2)} {isAr ? 'كيلو واط' : 'kW'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-solar-muted font-bold uppercase">{isAr ? 'إجمالي مساحتها المطلوبة' : 'TOTAL FOOTPRINT REQUIRED'}</div>
                    <div className="text-lg font-black text-solar-text mt-0.5">{currentTierData.panelArea.toFixed(1)} {isAr ? 'متر مربع' : 'm²'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-solar-muted font-bold uppercase">{isAr ? 'الأحمال اليومية المحسوبة' : 'DAILY ESTIMATED DEMAND'}</div>
                    <div className="text-lg font-black text-solar-text mt-0.5">{currentSelection.loads.dailyKwh.toFixed(1)} {isAr ? 'كيلو واط ساعة / يوم' : 'kWh/day'}</div>
                  </div>
                  <div>
                    {systemType === 'pump' ? (
                      <>
                        <div className="text-[10px] text-solar-muted font-bold uppercase">{isAr ? 'قدرة المضخة بالطاقة' : 'TARGET PUMP MOTOR POWER'}</div>
                        <div className="text-lg font-black text-solar-text mt-0.5">{pumpHp || 10} {isAr ? 'حصان (HP)' : 'HP'}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-[10px] text-solar-muted font-bold uppercase">{isAr ? 'ذروة حمل التشغيل' : 'PEAK DEMAND RATIO'}</div>
                        <div className="text-lg font-black text-solar-text mt-0.5">{(currentSelection.loads.peakW / 1000).toFixed(1)} {isAr ? 'كيلو واط' : 'kW'}</div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* FINANCIAL ANALYSIS PANEL */}
              <div className="border border-solar-border rounded-[36px] p-6 bg-gradient-to-br from-solar-blue/5 to-white/10 text-right space-y-4">
                <h4 className="text-sm font-black text-solar-text flex items-center justify-end gap-1.5 border-b border-solar-border/50 pb-2.5">
                  <TrendingUp className="text-solar-blue animate-pulse" size={16} />
                  <span>{isAr ? 'الجدوى والوفر المالي والاقتصادي' : 'Financial Payback & Sizing Feasibility'}</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white/80 p-4 rounded-2xl border border-solar-border/50 text-right">
                    <span className="text-[10px] text-solar-muted font-extrabold block uppercase leading-none">{isAr ? 'متوسط ساعات الشمس للموقع' : 'AVERAGE SUN SHINE'}</span>
                    <span className="text-xl font-black text-solar-text mt-1.5 block">{currentSelection.loads.sunHours} {isAr ? 'ساعات ذروة/يوم' : 'PSH'}</span>
                  </div>

                  <div className="bg-white/80 p-4 rounded-2xl border border-solar-border/50 text-right">
                    <span className="text-[10px] text-solar-muted font-extrabold block uppercase leading-none">
                      {systemType === 'pump' 
                        ? (isAr ? 'وفر وقود السولار السنوي' : 'ANNUAL DIESEL SAVINGS') 
                        : (isAr ? 'الوفر المالي السنوي المتوقع' : 'ESTIMATED SAVINGS/YEAR')}
                    </span>
                    <span className="text-xl font-black text-emerald-600 mt-1.5 block">+{Math.round(currentTierData.financials.annualSavings).toLocaleString()} {isAr ? 'ج.م / سنة' : 'EGP/year'}</span>
                  </div>

                  <div className="bg-white/80 p-4 rounded-2xl border border-solar-border/50 text-right">
                    <span className="text-[10px] text-solar-muted font-extrabold block uppercase leading-none">{isAr ? 'فترة استرداد رأس المال' : 'PAYBACK PERIOD'}</span>
                    <span className="text-xl font-black text-solar-blue mt-1.5 block">
                      {currentTierData.financials.payback > 0 
                        ? `${currentTierData.financials.payback.toFixed(1)} ${isAr ? 'سنوات' : 'Years'}` 
                        : (isAr ? 'حسب عرض السعر' : 'RFQ Based')}
                    </span>
                  </div>

                  <div className="bg-white/80 p-4 rounded-2xl border border-solar-border/50 text-right">
                    <span className="text-[10px] text-solar-muted font-extrabold block uppercase leading-none">{isAr ? 'معدل العائد الاستثماري (ROI)' : 'RETURN ON INVESTMENT'}</span>
                    <span className="text-xl font-black text-indigo-700 mt-1.5 block">
                      {currentTierData.financials.roi > 0 
                        ? `${currentTierData.financials.roi.toFixed(1)} %` 
                        : (isAr ? 'حسب عرض السعر' : 'RFQ Based')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Package Action Button */}
              <div className="pt-4 border-t border-solar-border/70 flex flex-col items-center">
                <button
                  onClick={() => handleRequestPackage(currentTier)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black text-xs sm:text-sm py-4 px-6 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 transition duration-200 shadow-lg shadow-emerald-600/15"
                >
                  <PhoneCall size={18} />
                  <span>
                    {isAr 
                      ? `اطلب ${currentTier === 'budget' ? 'الباقة الاقتصادية' : currentTier === 'premium' ? 'الباقة الفاخرة' : 'الباقة الموصى بها'} الآن (تواصل عبر WhatsApp) 💬` 
                      : `Order ${currentTier === 'budget' ? 'Budget' : currentTier === 'premium' ? 'Premium' : 'Recommended'} Package Now (WhatsApp) 💬`}
                  </span>
                </button>
                <p className="text-[10px] text-solar-muted font-bold mt-2 text-center">
                  {isAr 
                    ? '* يرجى التأكد من ملء الاسم ورقم الهاتف في قسم "طلب عرض سعر" بالأسفل لتضمينها في الطلب.' 
                    : '* Please ensure Name and Phone are entered in the registration section below to link your quote.'}
                </p>
              </div>

              {/* FIRST-CLASS CALL-TO-ACTION FOR PROMOTIONS: WhatsApp & Quote Firestore Registration Form */}
              <div className="bg-solar-light/50 border border-solar-blue/20 rounded-[36px] p-6 md:p-8 space-y-6">
                
                <div className="text-center space-y-2">
                  <span className="p-3 bg-solar-blue/10 rounded-2xl text-solar-blue inline-block">
                    <PhoneCall size={26} className="text-solar-blue" />
                  </span>
                  <h4 className="font-display font-black text-lg text-solar-text">{isAr ? 'مهتم بالعرض؟ اطلب عرض أسعار معتمد بالكامل من الموردين!' : 'Interested? Complete Quotation Request Now'}</h4>
                  <p className="text-xs text-solar-muted font-bold max-w-lg mx-auto leading-relaxed">
                    {isAr 
                      ? 'بإمكانك إدخال بياناتك بالأسفل للتواصل المباشر مع الموردين وتلقي عروض فنية حقيقية على هاتفك والاتفاق على المعاينة بدون أي رسوم، أو تصفح المنتجات بمكالمة واتساب حية.'
                      : 'Submit your contact query to register your custom solar design instantly. Authorized suppliers on Enerjoo will reach out with authentic commercial proposals.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  
                  {/* Lead Registration Form */}
                  <div id="lead-form-section" className="bg-white border border-solar-border p-5 rounded-[28px] shadow-sm text-right space-y-4">
                    <h5 className="text-xs font-black text-solar-text border-b border-solar-border/70 pb-2 flex items-center justify-end gap-1.5">
                      <Calculator size={14} className="text-solar-blue" />
                      <span>{isAr ? 'سجل بياناتك كطلب عرض سعر' : 'Quotation Inquirer Form'}</span>
                    </h5>

                    {leadForm.submitted ? (
                      <div className="p-5 text-center space-y-3">
                        <div className="p-3 bg-emerald-100 text-emerald-800 rounded-full w-fit mx-auto animate-bounce">
                          <CheckCircle2 size={32} className="text-emerald-600" />
                        </div>
                        <h6 className="font-black text-emerald-700 text-sm">{isAr ? 'تم تسجيل طلبك بنجاح!' : 'Request Registered successfully!'}</h6>
                        {leadForm.lastRequestId && (
                          <div className="bg-solar-light border border-solar-border rounded-xl p-2.5 flex items-center justify-between gap-2 max-w-xs mx-auto text-xs font-mono font-bold text-solar-text">
                            <span className="text-[11px] text-solar-muted font-sans font-bold">{isAr ? 'رقم الطلب:' : 'Request ID:'}</span>
                            <span className="text-solar-blue font-black">{leadForm.lastRequestId}</span>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard?.writeText(leadForm.lastRequestId)}
                              className="p-1 hover:bg-white rounded text-solar-muted hover:text-solar-blue transition-colors"
                              title={isAr ? 'نسخ رقم الطلب' : 'Copy Request ID'}
                            >
                              <Copy size={13} />
                            </button>
                          </div>
                        )}
                        <p className="text-[11px] text-solar-muted font-bold leading-normal">
                          {isAr 
                            ? 'لقد قمنا بحفظ مواصفات تصميمك وإرسالها للموردين المعتمدين وسيقوم مهندس مختص بالتواصل معك هاتفياً ومراجعة تفاصيل المعاينة خلال 24 ساعة.'
                            : 'An engineering specialist from the corresponding suppliers will contact you shortly to review structural measurements.'}
                        </p>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmitLeadForm} className="space-y-3.5">
                        <div className="space-y-1">
                          <label className="text-[11px] font-black text-solar-muted block">{isAr ? 'الاسم بالكامل' : 'Full Name'}</label>
                          <input 
                            type="text"
                            required
                            placeholder="مثال: أحمد محمد علي"
                            value={leadForm.name}
                            onChange={(e) => setLeadForm(prev => ({ ...prev, name: e.target.value, error: null }))}
                            className="w-full bg-solar-light px-4 py-2.5 rounded-xl border border-solar-border outline-none font-bold text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-black text-solar-muted block">{isAr ? 'رقم الهاتف / الواتساب (مصر)' : 'Phone / Whatsapp number (Egypt)'}</label>
                          <input 
                            type="tel"
                            required
                            placeholder="مثال: 01012345678"
                            value={leadForm.phone}
                            onChange={(e) => setLeadForm(prev => ({ ...prev, phone: e.target.value, error: null }))}
                            className="w-full bg-solar-light px-4 py-2.5 rounded-xl border border-solar-border outline-none font-bold text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-black text-solar-muted block">{isAr ? 'ملاحظات إضافية (اختياري)' : 'Additional Notes (Optional)'}</label>
                          <textarea 
                            rows={2}
                            placeholder="مثال: تركيب على سطح خرساني مكشوف لا يوجد تظليل..."
                            value={leadForm.notes}
                            onChange={(e) => setLeadForm(prev => ({ ...prev, notes: e.target.value }))}
                            className="w-full bg-solar-light px-4 py-2.5 rounded-xl border border-solar-border outline-none font-medium text-xs resize-none"
                          />
                        </div>

                        {leadForm.error && (
                          <div className="p-3 bg-red-50 text-red-700 text-[11px] font-bold rounded-lg border border-red-100 flex items-center gap-1.5">
                            <AlertCircle size={14} className="shrink-0 text-red-500" />
                            <span>{leadForm.error}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={leadForm.loading}
                          className="w-full bg-solar-blue hover:bg-solar-blue/90 disabled:bg-solar-blue/40 text-white font-black text-xs py-3 px-4 rounded-xl cursor-pointer transition flex items-center justify-center gap-2 shadow-sm"
                        >
                          {leadForm.loading ? (
                            <span>{isAr ? 'جاري تسجيل وتوثيق المقايسة...' : 'Registering quotation...'}</span>
                          ) : (
                            <span>{isAr ? 'سجل بياناتك كطلب عرض سعر 📋' : 'Submit Quotation Request 📋'}</span>
                          )}
                        </button>
                      </form>
                    )}
                  </div>

                  {/* WhatsApp Quick Direct Sizing Contact info & Suppliers verification cards */}
                  <div className="space-y-4">
                    <div className="bg-white border border-solar-border p-5 rounded-[28px] shadow-sm text-right space-y-3.5">
                      <h5 className="text-xs font-black text-solar-text border-b border-solar-border/70 pb-2 flex items-center justify-end gap-1.5">
                        <Building size={14} className="text-solar-blue" />
                        <span>{isAr ? 'موردو أنظمة Enerjoo المشمولين بالتسعير' : 'Authorized suppliers billing catalog'}</span>
                      </h5>

                      <div className="space-y-2.5">
                        {currentTierData.panel && currentTierData.panel.suppliers && currentTierData.panel.suppliers.length > 0 ? (
                          currentTierData.panel.suppliers.map((sup) => (
                            <div key={sup.id} className="p-3 border border-solar-border/40 hover:border-solar-border bg-solar-light/30 rounded-2xl flex justify-between items-center text-right transition">
                              <button 
                                onClick={() => handleRequestSupplierDirect(sup)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 px-3 rounded-xl text-[10px] font-black cursor-pointer flex items-center gap-1.5 transition shrink-0"
                              >
                                WhatsApp
                              </button>
                              
                              <div>
                                <h6 className="text-[11px] font-black text-solar-text flex items-center justify-end gap-1">
                                  {isAr ? sup.nameAr : sup.name}
                                  {sup.verified && <span className="w-1.5 h-1.5 bg-solar-blue rounded-full" title="Verified" />}
                                </h6>
                                <span className="text-[9px] text-solar-muted font-bold mt-0.5 block">{sup.location}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-4 bg-solar-light/20 rounded-2xl border border-solar-border/40 text-center">
                            <p className="text-[11px] text-solar-muted font-bold leading-relaxed">
                              {isAr 
                                ? 'سيتم ربط طلبك فوراً بشبكة الموردين والشركات المعتمدة في منطقتك لتزويدك بأفضل الأسعار.' 
                                : 'Your request will be routed directly to certified regional solar installers upon registration.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-amber-50/40 text-amber-900 border border-amber-200/50 p-4 rounded-[24px] text-[11px] leading-relaxed text-right font-medium">
                      ⚠️ <strong>{isAr ? 'ملاحظة فنية:' : 'Technical Advisor Remark:'}</strong> {isAr ? 'الحسابات والتكاليف الواردة مبنية على أسعار المنتجات الفعلية وتعديلاتها الأخيرة في السوق المصري من الموردين المعتمدين والموثقين، وقد تختلف تكاليف المعاينة الفعلية حسب الارتفاع والمظلات.' : 'Calculations are sourced from active Egyptian solar catalog specifications. Setup variants like high rise scaffold mountings may induce marginal local additions.'}
                    </div>
                  </div>
                </div>

              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};
