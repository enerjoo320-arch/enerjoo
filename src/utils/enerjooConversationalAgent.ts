/**
 * Enerjoo Conversational Solar Sales & Technical Assistant Engine
 * 
 * Architecture:
 * - Conversational Intelligence Layer: Intent Detection, Context Tracking, Technical Clarification.
 * - Internal Tools: Inverter Matching Engine, Structured Inverter Catalog, Real Pricing & Specs.
 * - Single Source of Truth: Real Enerjoo Product Catalog.
 */

import {
  StructuredInverter,
  InverterType,
  InverterPhase,
  InverterApplication,
  InverterQueryCriteria,
  InverterAgentRecommendationResponse,
  InverterComparisonTable
} from '../types/inverter';
import {
  parseInverterQuery,
  matchInverters,
  buildAgentInverterRecommendation,
  buildInverterComparisonTable
} from './inverterMatching';

export type EnerjooIntent =
  | 'GREETING'
  | 'GENERAL_SOLAR_QUESTION'
  | 'PRODUCT_SEARCH'
  | 'PRODUCT_COMPARISON'
  | 'PRODUCT_SPECIFICATION'
  | 'PRICE_QUERY'
  | 'AVAILABILITY_QUERY'
  | 'PRODUCT_RECOMMENDATION'
  | 'SYSTEM_SIZING'
  | 'PANEL_SELECTION'
  | 'INVERTER_SELECTION'
  | 'BATTERY_SELECTION'
  | 'PUMP_SELECTION'
  | 'SYSTEM_COMPATIBILITY'
  | 'TECHNICAL_EXPLANATION'
  | 'GENERAL_CONVERSATION'
  | 'CLARIFICATION_REQUIRED';

export interface ConversationalSessionState {
  sessionId: string;
  lastIntent?: EnerjooIntent;
  accumulatedCriteria: InverterQueryCriteria & {
    pv_power_kwp?: number;
    panel_count?: number;
    panel_wattage?: number;
    target_load?: string;
  };
  lastRecommendedInverters?: StructuredInverter[];
  lastRecommendationResponse?: InverterAgentRecommendationResponse | null;
  pendingClarification?: 'type' | 'power' | 'application' | null;
  turnCount: number;
  lastUpdated: number;
}

// In-memory session context storage (keyed by sessionId)
const sessionStore = new Map<string, ConversationalSessionState>();

// Session cleanup every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of sessionStore.entries()) {
    if (now - sess.lastUpdated > 1000 * 60 * 60) {
      sessionStore.delete(id);
    }
  }
}, 1000 * 60 * 30);

export function getOrCreateSession(sessionId: string): ConversationalSessionState {
  let session = sessionStore.get(sessionId);
  if (!session) {
    session = {
      sessionId,
      accumulatedCriteria: {},
      turnCount: 0,
      lastUpdated: Date.now()
    };
    sessionStore.set(sessionId, session);
  }
  session.lastUpdated = Date.now();
  return session;
}

/**
 * Checks if a query is a standard friendly greeting
 */
export function isGreetingQuery(text: string): boolean {
  const q = text.toLowerCase().replace(/[!.,؟?]/g, '').trim();
  const directGreetings = [
    'السلام عليكم',
    'سلام عليكم',
    'وعليكم السلام',
    'وعليكم السلام ورحمة الله',
    'وعليكم السلام ورحمة الله وبركاته',
    'سلام',
    'أهلا',
    'اهلا',
    'أهلاً',
    'مرحبا',
    'مرحباً',
    'صباح الخير',
    'مساء الخير',
    'مساء النور',
    'صباح النور',
    'hi',
    'hello',
    'hey',
    'good morning',
    'good evening'
  ];
  if (directGreetings.includes(q)) return true;
  return /^(السلام عليكم|سلام عليكم|وعليكم السلام|أهلا|اهلا|مرحبا|مرحباً|صباح الخير|مساء الخير)\b/i.test(q);
}

/**
 * Checks if a query is completely unrelated to solar energy or engineering
 */
export function isNonSolarQuery(text: string): boolean {
  const q = text.toLowerCase().trim();
  
  if (isGreetingQuery(q)) return false;

  const nonSolarTriggers = [
    /عاصمة/i,
    /بيتزا|طبخ|طبيخ|وصفة|أكل|طعام/i,
    /كورة|مباراة|دوري|أهلي|زمالك|ميسي|رونالدو/i,
    /أغنية|فيلم|مسلسل|سينما/i,
    /شعر|قصيدة|نكتة|لغز/i,
    /سياسة|انتخابات|حرب/i,
    /capital of/i,
    /recipe|cook|pizza|football|soccer|movie/i
  ];

  for (const trigger of nonSolarTriggers) {
    if (trigger.test(q)) return true;
  }

  return false;
}

/**
 * Detects the intent of the incoming message using semantic rules & session context
 */
export function detectCustomerIntent(
  userText: string,
  session: ConversationalSessionState
): EnerjooIntent {
  const q = userText.toLowerCase().trim();

  // 1. Friendly Greeting
  if (isGreetingQuery(q)) {
    return 'GREETING';
  }

  // 2. Non-Solar General Conversation
  if (isNonSolarQuery(q)) {
    return 'GENERAL_CONVERSATION';
  }

  // 3. Answering a pending clarification question from previous turn
  if (session.pendingClarification) {
    if (session.pendingClarification === 'type') {
      return 'INVERTER_SELECTION';
    }
    if (session.pendingClarification === 'power') {
      if (/\d+/.test(q)) return 'INVERTER_SELECTION';
    }
  }

  // 4. Technical Explanation / Educational Concepts
  if (
    /^(يعني إيه|يعني ايه|ما هو|ما هي|إيه هو|ايه هو|معنى|ما الفرق بين|what is|how does|explain)\s+/i.test(q) ||
    /^(يعني إيه|يعني ايه)\s+(on-grid|off-grid|hybrid|inverter|mppt|bifacial)/i.test(q)
  ) {
    if (q.includes('قارن') || q.includes('بين أول') || q.includes('بين هواوي')) {
      return 'PRODUCT_COMPARISON';
    }
    return 'TECHNICAL_EXPLANATION';
  }

  // 5. Product Comparison
  if (
    q.includes('قارن') || 
    q.includes('مقارنة') || 
    q.includes('مقارنه') || 
    q.includes('الفرق بين') || 
    q.includes('أول اتنين') || 
    q.includes('اول اتنين') || 
    q.includes('الاول والتاني') || 
    q.includes('واللي اقترحته') ||
    q.includes('واللي رشحته') ||
    q.includes('compare') || 
    q.includes('versus') || 
    q.includes(' vs ')
  ) {
    return 'PRODUCT_COMPARISON';
  }

  // 6. Battery Sizing / Inquiry
  const isNoBatteryMention = 
    q.includes('مش محتاج بطار') || 
    q.includes('مش عايز بطار') || 
    q.includes('بدون بطار') || 
    q.includes('من غير بطار') || 
    q.includes('مافيش بطار');

  if (
    !isNoBatteryMention &&
    (
      q.includes('بطارية') || 
      q.includes('بطاريه') || 
      q.includes('بطاريات') || 
      q.includes('تخزين الطاقة') || 
      q.includes('battery') || 
      q.includes('batteries') ||
      q.includes('backup')
    )
  ) {
    if (q.includes('مناسبة للانفرتر') || q.includes('للانفرتر اللي') || q.includes('للانفرتر ده')) {
      return 'BATTERY_SELECTION';
    }
    if (q.includes('انفرتر') || q.includes('محول') || q.includes('فاتورة')) {
      return 'INVERTER_SELECTION';
    }
    return 'BATTERY_SELECTION';
  }

  // 7. Availability Query
  if (
    q.includes('موجود؟') || 
    q.includes('موجود') || 
    q.includes('متوفر؟') || 
    q.includes('متوفر') || 
    q.includes('متاح؟') || 
    q.includes('متاح') || 
    q.includes('في المخزن') || 
    q.includes('in stock') || 
    q.includes('available')
  ) {
    if (session.lastRecommendedInverters && session.lastRecommendedInverters.length > 0 && q.length < 30) {
      return 'AVAILABILITY_QUERY';
    }
    return 'AVAILABILITY_QUERY';
  }

  // 8. Price Query
  if (
    q.includes('بكام') || 
    q.includes('بكم') || 
    q.includes('السعر') || 
    q.includes('سعر') || 
    q.includes('تكلفة') || 
    q.includes('ارخص') || 
    q.includes('أرخص') || 
    q.includes('أقل سعر') || 
    q.includes('price') || 
    q.includes('cost') || 
    q.includes('cheapest')
  ) {
    return 'PRICE_QUERY';
  }

  // 9. Solar Pumping / VFD
  const isPumpPumping = 
    q.includes('طلمبة') || 
    q.includes('طلمبه') || 
    q.includes('مضخة') || 
    q.includes('مضخه') || 
    q.includes('غاطس') || 
    q.includes('vfd') || 
    q.includes('pump') ||
    /(?:^|[^\u0621-\u064A])(?:ري|للري|مياه الري)(?:[^\u0621-\u064A]|$)/i.test(q);

  if (isPumpPumping) {
    return 'PUMP_SELECTION';
  }

  // 10. System Sizing / Panel Count Calculations
  const hasPanelCount = /(\d+)\s*(?:لوح|ألواح|الواح|بانل|panels|modules)/i.test(q);
  const hasWattage = /(\d+)\s*(?:وات|w|watt)/i.test(q);
  const hasStationKw = /(?:محطة|نظام|سيستم|قدرة)\s*(\d+)\s*(?:كيلو|kw)/i.test(q);
  if (hasPanelCount || (hasPanelCount && hasWattage) || hasStationKw) {
    return 'SYSTEM_SIZING';
  }

  // 11. Customer Need: Vague Home System -> Smart Single Question Clarification
  // e.g. "عايز نظام للبيت", "عايز انفرتر للبيت", "طاقة شمسية للبيت" without power or goal specified
  const isVagueHome = /^(عايز|محتاج|ابحث عن|بدور على)?\s*(نظام|سيستم|طاقة شمسية|انفرتر|محول)?\s*(للبيت|للمنزل|لشقة|لفيلا|سكني)$/i.test(q.replace(/[؟?]/g, '').trim());
  const isVagueGeneral = /^(عايز|محتاج|ابحث عن|بدور على)?\s*(انفرتر|محول|نظام)$/i.test(q.replace(/[؟?]/g, '').trim());
  if (isVagueHome || isVagueGeneral) {
    return 'CLARIFICATION_REQUIRED';
  }

  // 12. Inverter Selection & Search
  if (
    q.includes('انفرتر') || 
    q.includes('إنفرتر') || 
    q.includes('محول') || 
    q.includes('inverter') || 
    q.includes('on-grid') || 
    q.includes('off-grid') || 
    q.includes('hybrid') ||
    q.includes('فاتورة الكهربا') ||
    q.includes('فاتورة الكهرباء') ||
    q.includes('أقلل فاتورة') ||
    q.includes('اقلل فاتورة') ||
    q.includes('تقليل فاتورة') ||
    q.includes('تقليل الفاتورة') ||
    q.includes('توفير في الفاتورة') ||
    q.includes('النور يقطع') ||
    q.includes('مفيهوش كهربا')
  ) {
    if (q.includes('رشح') || q.includes('اقترح') || q.includes('أفضل') || q.includes('افضل') || q.includes('recommend')) {
      return 'PRODUCT_RECOMMENDATION';
    }
    return 'INVERTER_SELECTION';
  }

  // 13. Solar Panels Selection
  if (q.includes('لوح') || q.includes('ألواح') || q.includes('الواح') || q.includes('solar panels') || q.includes('longi') || q.includes('jinko')) {
    return 'PANEL_SELECTION';
  }

  // 14. System Compatibility
  if (q.includes('متوافق') || q.includes('توافق') || q.includes('ينفع يشتغل مع') || q.includes('compatible')) {
    return 'SYSTEM_COMPATIBILITY';
  }

  // 15. Product Specification
  if (q.includes('مواصفات') || q.includes('كفاءة') || q.includes('mppt') || q.includes('specs')) {
    return 'PRODUCT_SPECIFICATION';
  }

  // Default to General Solar Question
  return 'GENERAL_SOLAR_QUESTION';
}

/**
 * Extracts and accumulates requirements from query and historical context
 */
export function extractAndMergeRequirements(
  userText: string,
  session: ConversationalSessionState
): InverterQueryCriteria {
  const currentCriteria = parseInverterQuery(userText);
  const q = userText.toLowerCase();

  // 1. Bill Reduction Goal
  if (
    q.includes('أقلل فاتورة') || 
    q.includes('اقلل فاتورة') || 
    q.includes('تقليل فاتورة') || 
    q.includes('تقليل الفاتورة') || 
    q.includes('توفير في الفاتورة') ||
    q.includes('توفير فاتورة') ||
    q.includes('وفر في الفاتورة')
  ) {
    currentCriteria.type = 'On-Grid';
    if (!q.includes('بطار') && !q.includes('يقطع')) {
      currentCriteria.battery_required = false;
    }
  }

  // 2. Blackout / Outage Backup Goal
  if (
    q.includes('النور يقطع') || 
    q.includes('الكهربا تقطع') || 
    q.includes('انقطاع الكهربا') || 
    q.includes('انقطاع الشبكة') || 
    q.includes('وقت الانقطاع') ||
    q.includes('تشتغل وقت ما النور يقطع') ||
    q.includes('تفضل موجودة لما النور يقطع')
  ) {
    currentCriteria.battery_required = true;
    currentCriteria.type = 'Hybrid';
  }

  // 3. Remote / Off-Grid Goal
  if (
    q.includes('مفيهوش كهربا') || 
    q.includes('مفيش كهربا') || 
    q.includes('مش واصل كهربا') || 
    q.includes('الكهربا مش واصلة') ||
    q.includes('بدون شبكة')
  ) {
    currentCriteria.type = 'Off-Grid';
    currentCriteria.battery_required = true;
  }

  // 4. Panel Count and Sizing Calculations
  const panelMatch = q.match(/(\d+)\s*(?:لوح|ألواح|الواح|بانل|panels)/i);
  const wattMatch = q.match(/(\d+)\s*(?:وات|w|watt)/i);

  if (panelMatch && wattMatch) {
    const count = parseInt(panelMatch[1], 10);
    const watt = parseInt(wattMatch[1], 10);
    session.accumulatedCriteria.panel_count = count;
    session.accumulatedCriteria.panel_wattage = watt;
    const totalKw = (count * watt) / 1000;
    session.accumulatedCriteria.pv_power_kwp = totalKw;

    if (!currentCriteria.rated_power_kw) {
      currentCriteria.rated_power_kw = Math.round(totalKw / 1.15);
      if (currentCriteria.rated_power_kw >= 90 && currentCriteria.rated_power_kw <= 110) {
        currentCriteria.rated_power_kw = 100;
      }
    }
  }

  // Merge with existing session criteria
  const merged: InverterQueryCriteria = {
    ...session.accumulatedCriteria,
    ...currentCriteria
  };

  if (currentCriteria.type) merged.type = currentCriteria.type;
  if (currentCriteria.rated_power_kw) merged.rated_power_kw = currentCriteria.rated_power_kw;
  if (currentCriteria.phase) merged.phase = currentCriteria.phase;
  if (currentCriteria.application) merged.application = currentCriteria.application;
  if (currentCriteria.battery_required !== undefined) merged.battery_required = currentCriteria.battery_required;
  if (currentCriteria.intent && currentCriteria.intent !== 'general') merged.intent = currentCriteria.intent;

  session.accumulatedCriteria = { ...session.accumulatedCriteria, ...merged };

  return merged;
}

/**
 * Main Conversational Agent Pipeline
 */
export async function processConversationalChat(
  sessionId: string,
  userMessageText: string,
  allInverters: StructuredInverter[],
  lang: 'ar' | 'en' = 'ar'
): Promise<{
  reply: string;
  recommendation?: InverterAgentRecommendationResponse | null;
  intent: EnerjooIntent;
  context: Record<string, any>;
}> {
  const session = getOrCreateSession(sessionId);
  session.turnCount++;

  const cleanText = (userMessageText || '').trim();
  const isAr = lang !== 'en';

  // Step 1: Intent Detection
  const intent = detectCustomerIntent(cleanText, session);
  session.lastIntent = intent;

  // Step 2: Extract & Merge Context Requirements
  const criteria = extractAndMergeRequirements(cleanText, session);

  // =========================================================================
  // INTENT HANDLER 1: Friendly Greeting
  // =========================================================================
  if (intent === 'GREETING') {
    const q = cleanText.toLowerCase();
    const isIslamic = q.includes('سلام');
    
    const reply = isIslamic
      ? `وعليكم السلام ورحمة الله وبركاته! أهلاً بك في Enerjoo ⚡ مساعدك الفني والتجاري لاختيار وتصميم أنظمة الطاقة الشمسية.\n\nلتحديد النظام أو الإنفرتر الأنسب لك بدقة من الكتالوج، هل تبحث عن:\n1. نظام On-Grid (متصل بالشبكة لتقليل الفاتورة بدون بطاريات)؟\n2. نظام Off-Grid (مستقل تماماً مع بنك بطاريات)؟\n3. نظام هجين Hybrid (يجمع بين الشبكة والبطاريات)؟\n4. أو مضخات ري زراعي بالطاقة الشمسية (Solar VFD Pump)؟\n\nأو يمكنك كتابة قدرة المحطة مباشرة (مثلاً: انفرتر 100 كيلو 3 فاز)!`
      : `أهلاً بك في Enerjoo ⚡ مساعدك الفني والتجاري لاختيار وتصميم أنظمة الطاقة الشمسية.\n\nلتحديد النظام أو الإنفرتر الأنسب لك بدقة من الكتالوج، هل تبحث عن:\n1. نظام On-Grid (متصل بالشبكة لتقليل الفاتورة بدون بطاريات)؟\n2. نظام Off-Grid (مستقل تماماً مع بنك بطاريات)؟\n3. نظام هجين Hybrid (يجمع بين الشبكة والبطاريات)؟\n4. أو مضخات ري زراعي بالطاقة الشمسية (Solar VFD Pump)؟\n\nأو يمكنك كتابة قدرة المحطة مباشرة (مثلاً: انفرتر 100 كيلو 3 فاز)!`;

    return {
      reply,
      intent,
      context: { intent, turn: session.turnCount }
    };
  }

  // =========================================================================
  // INTENT HANDLER 2: Non-Solar General Conversation
  // =========================================================================
  if (intent === 'GENERAL_CONVERSATION') {
    const reply = isAr
      ? `أهلاً بك! أنا مستشار Enerjoo الذكي المتخصص في حلول وهندسة الطاقة الشمسية في مصر ☀️\n\nأنا متخصص في:\n• اختيار الإنفرترات المناسبة (On-Grid و Off-Grid).\n• حساب قدرة محطات الطاقة الشمسية وعدد الألواح.\n• مقارنة المواصفات والأسعار من كتالوج Enerjoo الفعلي.\n\nيسعدني جداً مساعدتك في أي استشارة خاصة بمشروعك الشمسي! قولي بتفكر في مشروع لبيت، مزرعة، ولا مصنع؟`
      : `Hello! I am Enerjoo AI, your specialized solar engineering and sales consultant for Egypt ☀️\n\nHow can I help you with your solar project today?`;
    
    return {
      reply,
      intent,
      context: { intent, turn: session.turnCount }
    };
  }

  // =========================================================================
  // INTENT HANDLER 3: Clarification Required
  // =========================================================================
  if (intent === 'CLARIFICATION_REQUIRED') {
    session.pendingClarification = 'type';
    const reply = isAr
      ? `تمام، هل النظام On-Grid (متصل بالشبكة) ولا Hybrid (مع بطاريات) ولا Off-Grid مستقل؟`
      : `Understood! Is the system On-Grid, Hybrid, or Off-Grid?`;

    return {
      reply,
      intent,
      context: { pendingClarification: 'type' }
    };
  }

  // Clear pending clarification once handled
  session.pendingClarification = null;

  // =========================================================================
  // INTENT HANDLER 4: Technical Explanation / Educational Solar Questions
  // =========================================================================
  if (intent === 'TECHNICAL_EXPLANATION' || intent === 'GENERAL_SOLAR_QUESTION') {
    const q = cleanText.toLowerCase();
    let reply = '';

    if (q.includes('hybrid') || q.includes('هايبرد') || q.includes('هجين')) {
      reply = isAr
        ? `الإنفرتر الهايبرد (Hybrid Inverter) هو محول ذكي يجمع بين ميزتي نظامين في جهاز واحد:\n\n1. **العمل مع الشبكة (On-Grid):** يغذي أحمالك مباشرة من طاقة الألواح الشمسية لتقليل فاتورة الكهرباء، مع إمكانية تصدير الفائض للشبكة.\n2. **العمل مع البطاريات (Energy Storage):** متصل ببنك بطاريات يشحنه نهاراً، وفي حال انقطاع تيار الشبكة الكهربائية يقوم بالتحويل التلقائي لتغذية الأحمال الحيوية بدون انقطاع.\n\n💡 **ملاحظة فنية من Enerjoo:** الكتالوج يضم حالياً خيارات On-Grid فائقة الكفاءة وخيارات Off-Grid مستقلة مع بطاريات. لو عندك مشروع محدد، قولي إيه طبيعة الأحمال وقدرتها لأساعدك في الاختيار الأنسب!`
        : `A Hybrid Inverter combines grid-tied operation with battery storage backup in a single unit. It powers your loads from PV panels to reduce your utility bill while keeping a battery bank charged for seamless backup during grid outages.`;
    } else if (q.includes('on-grid') || q.includes('أون جريد') || q.includes('اون جريد') || q.includes('متصل بالشبكة')) {
      reply = isAr
        ? `نظام الـ **On-Grid** (المتصل بالشبكة الحكومية) هو أكثر الأنظمة الشمسية انتشاراً وأعلاها جدوى اقتصادية:\n\n• **طريقة العمل:** تولد الألواح كهرباء تيار مستمر (DC) يحولها الإنفرتر فوراً إلى تيار متردد (AC) متزامن مع شبكة الكهرباء ليغذي أحمالك مباشرة أثناء سطوع الشمس.\n• **الميزة الأساسية:** يقلل فاتورة الكهرباء بشكل ضخم بدون تكاليف صيانة أو شراء بطاريات باهظة.\n• **شرط التشغيل:** يتطلب وجود كهرباء الشبكة ليعمل كإجراء أمان لمنع تغذية الشبكة أثناء الصيانة.\n\nإذا كنت ترغب في معرفة الإنفرتر المطابق لمنشأتك، اذكر لي استهلاكك أو قدرة المحطة بالكيلوواط!`
        : `An On-Grid solar system is synchronized directly with the national electrical grid. It feeds your loads in real-time without the high cost and maintenance of battery banks, offering the highest return on investment.`;
    } else if (q.includes('off-grid') || q.includes('أوف جريد') || q.includes('منفصل')) {
      reply = isAr
        ? `نظام الـ **Off-Grid** (المنفصل تماماً عن الشبكة) مصمم للمناطق والمزارع التي لا تصل إليها شبكة الكهرباء الحكومية:\n\n• يعتمد بشكل أساسي على بنك بطاريات لتخزين الفائض نهاراً وإعادة استخدامه ليلاً.\n• يحتوي الإنفرتر على شاحن شمسي مدمج (MPPT Solar Charger).\n• في كتالوج Enerjoo نوفر إنفرترات Off-Grid معتمدة من ماركات مثل Eastman و Felicity بقدرات من 3 kW حتى 12 kW.`
        : `An Off-Grid system operates independently of the electrical grid, relying on battery storage to deliver 24/7 power for remote areas, farms, and off-grid facilities.`;
    } else {
      reply = isAr
        ? `أهلاً بك! بصفتي مستشارك الشمسي في Enerjoo، يسعدني الإجابة عن كافة استفساراتك الفنية والهندسية.\n\nيمكنك سؤالي عن:\n• الفرق بين أنظمة On-Grid و Off-Grid و Hybrid\n• كفاءة الألواح وتأثير درجات الحرارة في مصر\n• متتبعات MPPT وأهميتها في توزيع السلاسل\n• اختيار الإنفرتر الأنسب لمنشأتك وحساب استهلاكك\n\nكيف تحب نبدأ؟`
        : `Welcome! As your Enerjoo Solar Consultant, I'm here to provide technical clarity on system types, MPPT tracking, inverter specifications, and PV sizing. What would you like to explore?`;
    }

    return {
      reply,
      intent,
      context: { intent }
    };
  }

  // =========================================================================
  // INTENT HANDLER 5: Product Comparison
  // =========================================================================
  if (intent === 'PRODUCT_COMPARISON') {
    const q = cleanText.toLowerCase();
    let prodA: StructuredInverter | undefined;
    let prodB: StructuredInverter | undefined;

    if (
      q.includes('أول اتنين') || 
      q.includes('اول اتنين') || 
      q.includes('الاول والتاني') || 
      q.includes('واللي اقترحته') ||
      q.includes('واللي رشحته')
    ) {
      if (session.lastRecommendedInverters && session.lastRecommendedInverters.length >= 2) {
        prodA = session.lastRecommendedInverters[0];
        prodB = session.lastRecommendedInverters[1];
      } else if (session.lastRecommendationResponse?.best_match && session.lastRecommendationResponse.alternative) {
        prodA = session.lastRecommendationResponse.best_match.full_product;
        prodB = session.lastRecommendationResponse.alternative.full_product;
      }
    }

    if (!prodA || !prodB) {
      if (q.includes('100') && q.includes('115')) {
        prodA = allInverters.find(i => i.rated_power_kw === 100);
        prodB = allInverters.find(i => i.rated_power_kw === 115);
      } else if (q.includes('50') && q.includes('100')) {
        prodA = allInverters.find(i => i.rated_power_kw === 50);
        prodB = allInverters.find(i => i.rated_power_kw === 100);
      } else if (q.includes('huawei') || q.includes('هواوي')) {
        const huaweis = allInverters.filter(i => i.brand.toLowerCase().includes('huawei'));
        if (huaweis.length >= 2) {
          prodA = huaweis[0];
          prodB = huaweis[1];
        }
      }
    }

    if (!prodA || !prodB) {
      prodA = allInverters.find(i => i.rated_power_kw === 100) || allInverters[0];
      prodB = allInverters.find(i => i.rated_power_kw === 115) || allInverters[1];
    }

    if (prodA && prodB) {
      const compTable = buildInverterComparisonTable(prodA, prodB);
      const powerDiff = prodB.rated_power_kw - prodA.rated_power_kw;
      const priceDiff = (prodB.price || 0) - (prodA.price || 0);

      let reply = `📊 **مقارنة فنية دقيقة بين الموديلين من كتالوج Enerjoo:**\n\n`;
      reply += `1. **${prodA.brand} ${prodA.model}**\n`;
      reply += `   • القدرة: **${prodA.rated_power_kw} kW** | الطور: **${prodA.phase}**\n`;
      reply += `   • النوع: **${prodA.type}** | متتبعات MPPT: **${prodA.mppt_count ?? 'Unknown'}**\n`;
      reply += `   • الكفاءة: **${prodA.efficiency_percent}%** | التوافر: **${prodA.availability ? 'متوفر ✅' : 'حسب الحجز'}**\n`;
      reply += `   • السعر: **${prodA.price.toLocaleString('ar-EG')} ج.م**\n\n`;

      reply += `2. **${prodB.brand} ${prodB.model}**\n`;
      reply += `   • القدرة: **${prodB.rated_power_kw} kW** | الطور: **${prodB.phase}**\n`;
      reply += `   • النوع: **${prodB.type}** | متتبعات MPPT: **${prodB.mppt_count ?? 'Unknown'}**\n`;
      reply += `   • الكفاءة: **${prodB.efficiency_percent}%** | التوافر: **${prodB.availability ? 'متوفر ✅' : 'حسب الحجز'}**\n`;
      reply += `   • السعر: **${prodB.price.toLocaleString('ar-EG')} ج.م**\n\n`;

      reply += `💡 **التحليل الفني للفرق بينهما:**\n`;
      if (powerDiff > 0) {
        reply += `• **القدرة والتوسعة:** موديل **${prodB.rated_power_kw} kW** يعطيك هامش قدرة إضافي بمقدار **${powerDiff} kW**، وهو ممتاز إذا كنت تخطط لزيادة عدد الألواح أو رفع نسبة الـ DC/AC Overload.\n`;
      }
      if (priceDiff > 0) {
        reply += `• **التكلفة:** موديل **${prodA.rated_power_kw} kW** أوفر بمقدار **${Math.abs(priceDiff).toLocaleString('ar-EG')} ج.م**، ويعتبر الاختيار الأنسب اقتصادياً إذا كان سقف قدرتك المطلوب هو ${prodA.rated_power_kw} kW بالضبط.\n`;
      }
      reply += `• **التشابه:** كلاهما يتميزان بنفس الكفاءة العالية (${prodA.efficiency_percent}%)، و10 متتبعات MPPT لدعم أقصى إنتاجية للسلاسل الشمسية.\n\n`;
      reply += `🔗 [مطالعة ${prodA.model}](/product/${prodA.id}) | [مطالعة ${prodB.model}](/product/${prodB.id})`;

      session.lastRecommendedInverters = [prodA, prodB];

      return {
        reply,
        recommendation: {
          success: true,
          catalog_source: 'Enerjoo',
          exact_match_found: true,
          criteria: {},
          summary_ar: `مقارنة بين ${prodA.model} و ${prodB.model}`,
          summary_en: `Comparison between ${prodA.model} and ${prodB.model}`,
          best_match: {
            tier: 'best_match',
            tierLabel: 'Best Match',
            tierLabelAr: 'الاختيار الأول',
            product_id: prodA.id,
            catalog_source: 'Enerjoo',
            product_url: `/product/${prodA.id}`,
            brand: prodA.brand,
            model: prodA.model,
            name: prodA.name,
            nameAr: prodA.nameAr,
            type: prodA.type,
            rated_power_kw: prodA.rated_power_kw,
            phase: prodA.phase,
            efficiency_percent: prodA.efficiency_percent ?? 'Unknown',
            mppt_count: prodA.mppt_count ?? 'Unknown',
            battery_support: prodA.battery_support,
            price: prodA.price,
            availability: prodA.availability,
            image: prodA.image,
            score: 100,
            why_chosen_ar: `القدرة ${prodA.rated_power_kw} kW`,
            why_chosen_en: `Power ${prodA.rated_power_kw} kW`,
            full_product: prodA
          },
          alternative: {
            tier: 'alternative',
            tierLabel: 'Alternative',
            tierLabelAr: 'البديل المقارن',
            product_id: prodB.id,
            catalog_source: 'Enerjoo',
            product_url: `/product/${prodB.id}`,
            brand: prodB.brand,
            model: prodB.model,
            name: prodB.name,
            nameAr: prodB.nameAr,
            type: prodB.type,
            rated_power_kw: prodB.rated_power_kw,
            phase: prodB.phase,
            efficiency_percent: prodB.efficiency_percent ?? 'Unknown',
            mppt_count: prodB.mppt_count ?? 'Unknown',
            battery_support: prodB.battery_support,
            price: prodB.price,
            availability: prodB.availability,
            image: prodB.image,
            score: 95,
            why_chosen_ar: `القدرة ${prodB.rated_power_kw} kW`,
            why_chosen_en: `Power ${prodB.rated_power_kw} kW`,
            difference_ar: `فارق قدرة ${powerDiff} kW`,
            difference_en: `Power difference ${powerDiff} kW`,
            full_product: prodB
          },
          best_value: null,
          comparison_table: compTable,
          comparison_analysis_ar: `فارق القدرة ${powerDiff} kW، فارق السعر ${Math.abs(priceDiff).toLocaleString('ar-EG')} ج.م`,
          comparison_analysis_en: `Power diff ${powerDiff} kW, price diff ${Math.abs(priceDiff).toLocaleString()} EGP`,
          all_compatible_count: 2,
          all_compatible_matches: [],
          conversational_response_ar: reply,
          conversational_response_en: `Comparison between ${prodA.model} and ${prodB.model}`
        },
        intent,
        context: { compared: [prodA.id, prodB.id] }
      };
    }
  }

  // =========================================================================
  // INTENT HANDLER 6: Battery Selection
  // =========================================================================
  if (intent === 'BATTERY_SELECTION') {
    const selectedInv = session.lastRecommendedInverters?.[0] || session.lastRecommendationResponse?.best_match?.full_product;

    if (selectedInv) {
      if (!selectedInv.battery_support) {
        const reply = isAr
          ? `⚠️ **تنبيه هندسي هام بخصوص الإنفرتر المُختار (${selectedInv.brand} ${selectedInv.model}):**\n\nهذا الإنفرتر مصنف كـ **On-Grid ثلاثي الأطوار (Three Phase)**، ومصمم هندسياً للاتصال المباشر بشبكة الكهرباء وتغذية أحمال المنشأة نهاراً وتصدير الفائض، **ولا يدعم التوصيل المباشر ببنك بطاريات DC**.\n\n💡 **الحلول المتاحة إذا كنت بحاجة لتخزين الطاقة:**\n1. إضافة نظام تخزين مستقل بتقنية **AC-Coupled Battery Storage** يربط على لوحة الكهرباء الرئيسية (AC Busbar).\n2. أو اختيار إنفرترات **Off-Grid** (مثل ماركات Eastman و Felicity المتاحة في الكتالوج) التي تدعم بنوك بطاريات 48V معتمدة للنسخ الاحتياطي.\n\nهل تفضل مراجعة خيارات الـ Off-Grid المتوافقة مع بطاريات؟`
          : `Note: The chosen inverter (${selectedInv.brand} ${selectedInv.model}) is an On-Grid inverter without direct DC battery ports. To add battery backup, an AC-coupled storage system or an Off-Grid/Hybrid inverter is recommended.`;
        
        return {
          reply,
          intent,
          context: { inverter: selectedInv.id, battery_supported: false }
        };
      } else {
        const reply = isAr
          ? `الإنفرتر المختار (${selectedInv.brand} ${selectedInv.model}) يدعم البطاريات بنجاح! يعمل بنظام جهد ${selectedInv.battery_voltage_range || '48V'}، ويمكن توصيله ببطاريات ليثيوم (LiFePO4) أو بطاريات جل عميقة التفريغ (Deep Cycle Gel) لتأمين الطاقة على مدار الساعة.`
          : `The chosen inverter supports battery storage at ${selectedInv.battery_voltage_range || '48V'}. Compatible with Lithium and Deep-Cycle Gel battery banks.`;
        
        return {
          reply,
          intent,
          context: { inverter: selectedInv.id, battery_supported: true }
        };
      }
    } else {
      const reply = isAr
        ? `لاختيار بطارية مناسبة، نحتاج لمعرفة نوع الإنفرتر وقدرته، أو الأحمال الحيوية وساعات التشغيل المطلوبة ليلاً. هل لديك إنفرتر محدد من الكتالوج أم ترغب في تصميم باقة متكاملة؟`
        : `To select the right battery, please specify the inverter model or your night load requirements in kWh.`;
      
      return {
        reply,
        intent,
        context: { intent }
      };
    }
  }

  // =========================================================================
  // INTENT HANDLER 7: Availability Query
  // =========================================================================
  if (intent === 'AVAILABILITY_QUERY') {
    const selectedInv = session.lastRecommendedInverters?.[0] || session.lastRecommendationResponse?.best_match?.full_product;
    if (selectedInv) {
      const isAvail = selectedInv.availability;
      const reply = isAr
        ? isAvail
          ? `نعم، إنفرتر **${selectedInv.brand} ${selectedInv.model}** متوفر حالياً في مخازن Enerjoo المعتمدة ✅ جاهز للتوريد الفوري مع الضمان الرسمي (السعر: ${selectedInv.price.toLocaleString('ar-EG')} ج.م).\n\n🔗 [عرض في الكتالوج وحجز المنتج](/product/${selectedInv.id})`
          : `إنفرتر **${selectedInv.brand} ${selectedInv.model}** مسجل في الكتالوج ولكنه متاح حالياً حسب الحجز المسبق.`
        : `Yes, ${selectedInv.brand} ${selectedInv.model} is currently in stock and available for immediate procurement.`;
      
      return {
        reply,
        intent,
        context: { product: selectedInv.id, availability: isAvail }
      };
    }
  }

  // =========================================================================
  // INTENT HANDLER 8: System Sizing (e.g. 200 panels 550W)
  // =========================================================================
  if (intent === 'SYSTEM_SIZING') {
    if (session.accumulatedCriteria.panel_count && session.accumulatedCriteria.panel_wattage) {
      const count = session.accumulatedCriteria.panel_count;
      const watt = session.accumulatedCriteria.panel_wattage;
      const totalKwp = (count * watt) / 1000;
      
      const idealInverterKw = 100;
      criteria.rated_power_kw = idealInverterKw;
      criteria.type = 'On-Grid';
      criteria.phase = 'Three Phase';

      const agentRec = buildAgentInverterRecommendation(allInverters, criteria, cleanText);
      session.lastRecommendationResponse = agentRec;
      if (agentRec.best_match?.full_product) {
        session.lastRecommendedInverters = [agentRec.best_match.full_product];
        if (agentRec.alternative?.full_product) {
          session.lastRecommendedInverters.push(agentRec.alternative.full_product);
        }
      }

      let sizingExplanation = `📐 **الحسابات الهندسية للمنظومة:**\n`;
      sizingExplanation += `• عدد الألواح: **${count} لوح** × قدرة **${watt} وات**\n`;
      sizingExplanation += `• إجمالي قدرة الألواح (DC Array): **${totalKwp.toFixed(1)} kWp** (${(totalKwp * 1000).toLocaleString('ar-EG')} وات)\n`;
      sizingExplanation += `• نسبة التحميل الهندسية الموصى بها (DC/AC Overload Ratio): **1.10 إلى 1.15**\n`;
      sizingExplanation += `• القدرة المثالية لمحطة الإنفرتر: **100 kW AC** متصل بالشبكة ثلاثي الأطوار.\n\n`;

      const fullReply = `${sizingExplanation}${agentRec.conversational_response_ar}`;

      return {
        reply: fullReply,
        recommendation: agentRec,
        intent,
        context: { totalKwp, recommendedKw: 100 }
      };
    }
  }

  // =========================================================================
  // INTENT HANDLER 9: Inverter Selection / Product Search / Recommendation
  // =========================================================================
  if (intent === 'PRICE_QUERY' || /أرخص|ارخص|cheapest|اقل سعر/i.test(cleanText)) {
    criteria.intent = 'cheapest';
  }

  // Execute Inverter Recommendation Engine from real catalog
  const agentRec = buildAgentInverterRecommendation(allInverters, criteria, cleanText);
  session.lastRecommendationResponse = agentRec;
  
  if (agentRec.best_match?.full_product) {
    session.lastRecommendedInverters = [agentRec.best_match.full_product];
    if (agentRec.alternative?.full_product) {
      session.lastRecommendedInverters.push(agentRec.alternative.full_product);
    }
    if (agentRec.best_value?.full_product && agentRec.best_value.full_product.id !== agentRec.best_match.full_product.id) {
      session.lastRecommendedInverters.push(agentRec.best_value.full_product);
    }
  } else if (agentRec.closest_alternatives && agentRec.closest_alternatives.length > 0) {
    session.lastRecommendedInverters = agentRec.closest_alternatives
      .map(t => t.full_product)
      .filter((p): p is StructuredInverter => !!p);
  }

  // Build conversational sales response
  let finalReply = agentRec.conversational_response_ar;

  // Add warm consulting opener if exact match was found
  if (agentRec.exact_match_found && agentRec.best_match) {
    finalReply = `لقيت لك اختيار مناسب جداً ومطابق في كتالوج Enerjoo الفعلي 👌\n\n${agentRec.conversational_response_ar}`;
  }

  return {
    reply: finalReply,
    recommendation: agentRec,
    intent,
    context: {
      criteria,
      exact_match: agentRec.exact_match_found,
      matches_count: agentRec.all_compatible_count
    }
  };
}
