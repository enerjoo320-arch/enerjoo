import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import defaultFirebaseConfig from "./firebase-applet-config.json";
import { GoogleGenAI, Type } from "@google/genai";
import { classifyInverter } from "./src/utils/inverterClassification";
import { 
  parseInverterQuery, 
  matchInverters,
  buildInverterComparisonTable,
  buildAgentInverterRecommendation
} from "./src/utils/inverterMatching";
import { processConversationalChat } from "./src/utils/enerjooConversationalAgent";
import { runEnerjooSolarConsultant } from "./src/utils/enerjooSolarConsultant";
import { 
  INVERTER_MAIN_TYPES, 
  INVERTER_PHASES, 
  INVERTER_APPLICATIONS, 
  INVERTER_POWER_RANGES,
  StructuredInverter,
  InverterQueryCriteria
} from "./src/types/inverter";

import { productsData } from "./src/data/mockData";
import { validateAndNormalizeD1ProductNumericFields } from "./src/utils/productNumericValidation";

dotenv.config();

// Fallback Helper Functions for High-Demand/Network Failures
function fallbackSemanticSearch(query: string, products: any[], isAr: boolean) {
  const normalizedQuery = query.toLowerCase().trim();

  // If searching for inverters, use the dedicated Inverter AI Matching Engine
  const isInverterQuery = 
    normalizedQuery.includes('انفرتر') || 
    normalizedQuery.includes('inverter') || 
    normalizedQuery.includes('محول') ||
    normalizedQuery.includes('on-grid') ||
    normalizedQuery.includes('off-grid') ||
    normalizedQuery.includes('hybrid') ||
    normalizedQuery.includes('هايبرد');

  if (isInverterQuery) {
    const inverterProducts = products.filter(p => (p.category || '').toLowerCase().includes('invert'));
    if (inverterProducts.length > 0) {
      const criteria = parseInverterQuery(normalizedQuery);
      const structuredInverters = inverterProducts.map(classifyInverter);
      const matched = matchInverters(structuredInverters, criteria);
      return matched.map(m => ({
        productId: m.product.id.toString(),
        relevanceScore: parseFloat((m.score / 100).toFixed(2)),
        matchReason: isAr ? m.recommendationReasonAr : m.recommendationReason
      }));
    }
  }

  const results = products.map((p: any) => {
    const name = (isAr ? p.nameAr : p.name) || p.name || "";
    const brand = p.brand || "";
    const category = p.category || "";
    const desc = p.description || "";
    
    let score = 0.1;
    const reasons: string[] = [];
    
    if (normalizedQuery.includes(category.toLowerCase())) {
      score += 0.5;
      reasons.push(isAr ? `منتج ينتمي لفئة ${category}` : `Product belongs to ${category} category`);
    }
    if (name.toLowerCase().includes(normalizedQuery)) {
      score += 0.4;
      reasons.push(isAr ? `تطابق الاسم مع الاستعلام` : `Name matches search query`);
    }
    if (brand.toLowerCase().includes(normalizedQuery)) {
      score += 0.3;
      reasons.push(isAr ? `الماركة متطابقة` : `Brand matches`);
    }
    const matchVal = normalizedQuery.match(/\d+/);
    if (matchVal && name.includes(matchVal[0])) {
      score += 0.4;
      reasons.push(isAr ? `تطابق رقم الموديل أو القدرة بالوات` : `Matches model number or power rating`);
    }
    
    const finalScore = Math.min(score, 0.99);
    
    return {
      productId: p.id.toString(),
      relevanceScore: parseFloat(finalScore.toFixed(2)),
      matchReason: reasons.length > 0 
        ? reasons.join(isAr ? " و " : " & ") 
        : (isAr ? "منتج ذو صلة بأنظمة الطاقة الشمسية" : "Related solar power product")
    };
  });
  
  return results
    .filter(r => r.relevanceScore > 0.15)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function fallbackSolarSizing(stationPower: number, landArea: number, loadDetails: string, products: any[], isAr: boolean) {
  const panels = products.filter((p: any) => p.category === 'panels');
  const inverters = products.filter((p: any) => p.category === 'inverters');
  const batteries = products.filter((p: any) => p.category === 'batteries');

  const selectedPanel = panels.sort((a, b) => (b.power || 0) - (a.power || 0))[0] || null;

  const panelPowerW = selectedPanel?.power || 550;
  const panelsCountNeeded = selectedPanel ? Math.ceil((stationPower * 1000) / panelPowerW) : 0;
  const totalPanelPowerKw = selectedPanel 
    ? parseFloat(((panelsCountNeeded * panelPowerW) / 1000).toFixed(2))
    : stationPower;
  const totalAreaRequiredM2 = selectedPanel 
    ? parseFloat((panelsCountNeeded * (selectedPanel.area || 2.1)).toFixed(2))
    : parseFloat((stationPower * 5.0).toFixed(2));

  const selectedInverter = inverters.sort((a, b) => (a.power || 0) - (b.power || 0)).find((inv: any) => (inv.power || 0) >= stationPower) || inverters[0] || null;

  const selectedBattery = batteries[0] || null;

  const isOffGrid = loadDetails?.toLowerCase().includes("off-grid") || loadDetails?.toLowerCase().includes("طقم") || loadDetails?.toLowerCase().includes("منفصل") || false;
  const isHybrid = loadDetails?.toLowerCase().includes("hybrid") || loadDetails?.toLowerCase().includes("هجين") || false;
  
  let batteryQty = 0;
  if (isOffGrid) {
    batteryQty = Math.max(2, Math.ceil(stationPower * 0.8));
  } else if (isHybrid) {
    batteryQty = Math.max(1, Math.ceil(stationPower * 0.4));
  }

  const recommendedProducts: any[] = [];

  if (selectedPanel) {
    recommendedProducts.push({
      productId: Number(selectedPanel.id),
      quantity: panelsCountNeeded,
      role: 'panels',
      reason: isAr 
        ? `تم اختيار ${panelsCountNeeded} ألواح بقدرة ${panelPowerW} وات لتغطية احتياج المحطة بالكامل.` 
        : `Selected ${panelsCountNeeded} x ${panelPowerW}W solar panels to meet full load demand.`
    });
  }

  if (selectedInverter) {
    recommendedProducts.push({
      productId: Number(selectedInverter.id),
      quantity: 1,
      role: 'inverters',
      reason: isAr 
        ? `انفرتر بقدرة ${selectedInverter.power || stationPower} كيلووات متوافق مع متطلبات النظام.` 
        : `Efficient ${selectedInverter.power || stationPower}kW inverter matching system power.`
    });
  }

  if (batteryQty > 0 && selectedBattery) {
    recommendedProducts.push({
      productId: Number(selectedBattery.id),
      quantity: batteryQty,
      role: 'batteries',
      reason: isAr 
        ? `تم إدراج ${batteryQty} بطاريات لتأمين استقرار الطاقة وتوفير استهلاك آمن ليلاً.` 
        : `Configured ${batteryQty} battery storage units for nightly backup.`
    });
  }

  const totalEstimatedCost = recommendedProducts.reduce((sum, item) => {
    const prod = products.find((p: any) => Number(p.id) === item.productId);
    const price = prod ? (prod.price || 0) : 0;
    return sum + (price * item.quantity);
  }, 0);

  const status = totalAreaRequiredM2 > landArea ? "warning" : "feasible";
  
  const explanation = isAr 
    ? (recommendedProducts.length > 0 
        ? `تم تصميم النظام الشمسي المقترح بناءً على المكونات المتوفرة في الكتالوج الحالي.` 
        : `تم احتساب القدرات والمساحات الهندسية للمحطة المطلوبة. عند توفر منتجات معتمدة في المتجر سيتم إدراج التسعير المباشر فوراً.`)
    : (recommendedProducts.length > 0 
        ? `Your tailored solar system configuration is designed from currently listed verified equipment.` 
        : `Calculated target solar array capacity. Pricing and procurement will update as certified components are listed.`);

  const feasibilityAnalysis = isAr 
    ? `المساحة الكلية المطلوبة للألواح هي ${totalAreaRequiredM2} متر مربع. ${status === 'warning' ? `تنبيه: المساحة المتاحة لديك (${landArea} م²) أصغر من المساحة المطلوبة. يوصى بتركيب شاسيهات مرتفعة أو تقليل عدد الألواح نسبياً.` : `مساحتك المتاحة (${landArea} م²) كافية وممتازة لتركيب المكونات وتجنب التظليل.`}`
    : `Total space needed is ${totalAreaRequiredM2} m². ${status === 'warning' ? `Warning: Your available area of ${landArea} m² is lower than required. Consider dynamic multi-row structures or slight capacity reduction.` : `Your area of ${landArea} m² excels for the solar layout without shading issues.`}`;

  const batterySizingDetails = isAr
    ? (batteryQty > 0 
      ? `بناءً على تفضيلك، تم تخصيص سعة تخزين تبلغ ${batteryQty} وحدات لحساب أحمال الطوارئ والتشغيل الليلي.` 
      : 'هذا النظام مرتبط بالشبكة (On-Grid) ولا يحتاج لتكلفة بطاريات إضافية، مما يجعل فترة استرداد رأس المال أسرع ما يمكن.')
    : (batteryQty > 0 
      ? `Based on daily config, configured ${batteryQty} units of lithium storage for optimal backup discharge.` 
      : 'On-Grid configuration has no extra battery cost, accelerating payback period to minimum.');

  return {
    status,
    explanation,
    totalEstimatedCost,
    feasibilityAnalysis,
    specifications: {
      totalPanelPowerKw,
      totalAreaRequiredM2,
      panelsCountNeeded,
      batterySizingDetails
    },
    recommendedProducts
  };
}

function parseSizingInPrompt(text: string) {
  let normalized = text.toLowerCase();
  const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  arabicDigits.forEach((char, i) => {
    normalized = normalized.replaceAll(char, i.toString());
  });

  let parsedCapacity: number | null = null;
  let parsedArea: number | null = null;
  let parsedBill: number | null = null;
  let parsedKwh: number | null = null;
  let parsedPumpHp: number | null = null;
  let parsedSystemType: string | null = null;
  let parsedCityChoice: string | null = null;

  const kwMatches = normalized.match(/(\d+(?:\.\d+)?)\s*(?:كيلو|kw|ك|كيلوات|كيلوواط)/i);
  if (kwMatches && kwMatches[1]) {
    parsedCapacity = parseFloat(kwMatches[1]);
  }

  const areaMatches = normalized.match(/(?:مساحة|مسطح|المساحة|المسطح)\s*(\d+(?:\.\d+)?)/i) || normalized.match(/(\d+(?:\.\d+)?)\s*(?:متر|م٢|m2|مربع)/i);
  if (areaMatches && areaMatches[1]) {
    parsedArea = parseFloat(areaMatches[1]);
  }

  const billMatches = normalized.match(/(?:فاتورة|فاتوره)\s*(\d+(?:\.\d+)?)/i) || normalized.match(/(\d+(?:\.\d+)?)\s*(?:جنيه|egp|ج.م|ج)/i);
  if (billMatches && billMatches[1]) {
    parsedBill = parseFloat(billMatches[1]);
  }

  const kwhMatches = normalized.match(/(?:استهلاك)\s*(\d+(?:\.\d+)?)/i) || normalized.match(/(\d+(?:\.\d+)?)\s*(?:كيلو\s*وات|kwh)/i);
  if (kwhMatches && kwhMatches[1]) {
    parsedKwh = parseFloat(kwhMatches[1]);
  }

  const hpMatches = normalized.match(/(\d+(?:\.\d+)?)\s*(?:حصان|hp|طلمب|مضخ)/i) || normalized.match(/(?:قدرة|قدره|قوة|قوه)\s*(\d+(?:\.\d+)?)/i);
  if (hpMatches && hpMatches[1]) {
    parsedPumpHp = parseFloat(hpMatches[1]);
  }

  if (normalized.includes("هجين") || normalized.includes("هايبرد") || normalized.includes("hybrid")) {
    parsedSystemType = "hybrid";
  } else if (normalized.includes("متصل") || normalized.includes("اون جرد") || normalized.includes("on-grid")) {
    parsedSystemType = "on-grid";
  } else if (normalized.includes("منفصل") || normalized.includes("اوف جرد") || normalized.includes("off-grid")) {
    parsedSystemType = "off-grid";
  } else if (normalized.includes("طلمب") || normalized.includes("مضخ") || normalized.includes("ري") || normalized.includes("بئر") || normalized.includes("pump")) {
    parsedSystemType = "pump";
  }

  if (normalized.includes("أسوان") || normalized.includes("اسوان") || normalized.includes("aswan")) {
    parsedCityChoice = "أسوان";
  } else if (normalized.includes("إسكندرية") || normalized.includes("اسكندرية") || normalized.includes("إسكندريه") || normalized.includes("اسكندريه") || normalized.includes("alexandria")) {
    parsedCityChoice = "الإسكندرية";
  } else if (normalized.includes("الغردقة") || normalized.includes("غردقة") || normalized.includes("hurghada")) {
    parsedCityChoice = "الغردقة";
  } else if (normalized.includes("القاهرة") || normalized.includes("قاهرة") || normalized.includes("cairo")) {
    parsedCityChoice = "القاهرة";
  }

  return {
    capacity: parsedCapacity,
    area: parsedArea,
    bill: parsedBill,
    kwh: parsedKwh,
    pumpHp: parsedPumpHp,
    systemType: parsedSystemType,
    cityChoice: parsedCityChoice
  };
}

function fallbackSolarChat(messages: any[] = [], isAr: boolean = true, body: any = {}, exchangePrices?: Record<string, number>) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const rawLastMsg = safeMessages.length > 0 
    ? (safeMessages[safeMessages.length - 1]?.text || safeMessages[safeMessages.length - 1]?.content || "") 
    : "";
  const directText = body?.message || body?.chatInput || body?.query || body?.prompt || "";
  const lastMsg = (rawLastMsg || directText || "").toLowerCase();
  const { systemType, consumptionMethod, billAmount, kwhMonthly, pumpHp, systemDetails } = body;

  const parsed = parseSizingInPrompt(lastMsg);
  const hp = pumpHp || parsed.pumpHp;

  if (hp && hp > 0) {
    const suggKw = Math.max(1.5, hp * 1.35);
    const panelPowerW = 550;
    const panelsNeeded = Math.ceil((suggKw * 1000) / panelPowerW);
    const totalArea = parseFloat((panelsNeeded * 2.1).toFixed(1));

    if (isAr) {
      return `مرحباً بك! إليك المواصفات الهندسية المقترحة لتشغيل طلمبة الري بالطاقة الشمسية:
• قدرة مضخة المياه: **${hp} حصان** (~${(hp * 0.746).toFixed(1)} كيلوواط)
• القدرة الإجمالية المقترحة للألواح: **${suggKw.toFixed(1)} كيلوواط (kW)**
• المساحة التقديرية المطلوبة: **${totalArea} متر مربع**
• عدد الألواح المقترح: **${panelsNeeded} لوح (550 وات)**
• مغير السرعة (VFD Inverter): إنفرتر طلمبات شمسية بخاصية MPPT وتشغيل تلقائي مع شروق الشمس.

💡 يمكنك الضغط على طلب تسعير أو التواصل مع الموردين المعتمدين عبر المنصة للحصول على عروض أسعار دقيقة ومطابقة للأجهزة المتوفرة في المتجر!`;
    } else {
      return `Hello! Here is the engineered specification for your solar water pumping system:
• Target Water Pump Power: **${hp} HP** (~${(hp * 0.746).toFixed(1)} kW)
• Suggested Solar Array Capacity: **${suggKw.toFixed(1)} kW**
• Estimated Net Area Required: **${totalArea} m²**

Required components:
1. **Solar Panels**: Approximately **${panelsNeeded} panels (550W)** to power pump continuous daily cycle.
2. **Frequency Driver (VFD) Inverter**: Smart pump controller with dry-run protection and auto sunrise start.

💡 You can submit a direct quote request to receive exact offers from verified registered suppliers on Enerjoo!`;
    }
  }

  if (consumptionMethod || billAmount || kwhMonthly || systemDetails) {
    let targetCapacity = 0;
    if (systemDetails?.panelPowerTotalKw) {
      targetCapacity = systemDetails.panelPowerTotalKw;
    } else if (billAmount) {
      const bill = parseFloat(billAmount);
      targetCapacity = Math.max(2, bill / 450);
    } else if (kwhMonthly) {
      const kwh = parseFloat(kwhMonthly);
      const dailyKwh = kwh / 30;
      targetCapacity = dailyKwh / (5.3 * 0.75);
    } else {
      targetCapacity = 5;
    }

    if (targetCapacity && targetCapacity > 0) {
      targetCapacity = Math.min(100, Math.max(1.5, parseFloat(targetCapacity.toFixed(2))));
      const panelPowerW = 550;
      const panelsNeeded = Math.ceil((targetCapacity * 1000) / panelPowerW);
      const totalArea = parseFloat((panelsNeeded * 2.1).toFixed(1));
      const sysType = systemType || 'hybrid';

      let batteryQty = 0;
      if (sysType === 'off-grid') {
        batteryQty = Math.max(2, Math.ceil(targetCapacity * 0.8));
      } else if (sysType === 'hybrid') {
        batteryQty = Math.max(1, Math.ceil(targetCapacity * 0.4));
      }

      if (isAr) {
        return `مرحباً بك! إليك التحليل الفني والهندسي لمحطتك:

• القدرة الإجمالية المقترحة لمحطتك: **${targetCapacity} كيلوواط (kW)**
• المساحة الصافية التقديرية للألواح: **${totalArea} متر مربع**
• نوع المحطة: **${sysType === 'hybrid' ? 'نظام هجين (Hybrid)' : sysType === 'on-grid' ? 'متصل بالشبكة (On-Grid)' : 'منفصل عن الشبكة بالبطاريات (Off-Grid)'}**
• عدد الألواح التقديري: **${panelsNeeded} لوح**
${batteryQty > 0 ? `• وحدات التخزين المقترحة: **${batteryQty} بطاريات**\n` : ''}

يمكنك اختيار المنتجات المتاحة من الكتالوج أو إرسال طلب عرض أسعار لتصلك عروض من أفضل الشركات المعتمدة!`;
      } else {
        return `Hello! Here is the technical estimation for your solar station:

• Recommended System Capacity: **${targetCapacity} kW**
• Estimated Solar Panel Footprint: **${totalArea} m²**
• System Configuration: **${sysType.toUpperCase()}**
• Estimated Panels Count: **${panelsNeeded} panels**
${batteryQty > 0 ? `• Battery Storage Units: **${batteryQty} batteries**\n` : ''}

Browse listed catalog products or submit an RFQ to receive competitive bids from verified installers!`;
      }
    }
  }

  // Energy exchange rate queries
  if (lastMsg.includes("جينكو") || lastMsg.includes("jinko")) {
    const p = exchangePrices?.['Jinko'] ?? 12.0;
    return isAr 
      ? `ألواح جينكو (Jinko Solar) متوفرة بنماذج Tiger Pro / Neo عالية الكفاءة (N-type). سعر الوات اليوم في بورصة الطاقة: **${p} ج.م / وات**.\nعلى سبيل المثال: اللوح بقدرة 585 وات يسجل تقريباً **${Math.round(585 * p).toLocaleString()} ج.م**.`
      : `Jinko Solar panels are currently priced at **${p} EGP / Watt** on Enerjoo Energy Exchange. A 585W module is approx **${Math.round(585 * p).toLocaleString()} EGP**.`;
  }
  if (lastMsg.includes("لونجي") || lastMsg.includes("لونغي") || lastMsg.includes("longi")) {
    const p = exchangePrices?.['LONGi Solar'] ?? 12.2;
    return isAr 
      ? `ألواح لونجي (LONGi Solar) متوفرة بنماذج Hi-MO 6 وHi-MO X6 الرائدة. سعر الوات اليوم في بورصة الطاقة: **${p} ج.م / وات**.\nعلى سبيل المثال: اللوح بقدرة 620 وات يسجل تقريباً **${Math.round(620 * p).toLocaleString()} ج.م**.`
      : `LONGi Solar Hi-MO panels trade at **${p} EGP / Watt** on Enerjoo Energy Exchange. A 620W module is approx **${Math.round(620 * p).toLocaleString()} EGP**.`;
  }
  if (lastMsg.includes("ترينا") || lastMsg.includes("trina")) {
    const p = exchangePrices?.['Trina Solar'] ?? 11.9;
    return isAr 
      ? `ألواح ترينا سولار (Trina Solar) متوفرة بنماذج Vertex N. سعر الوات اليوم في بورصة الطاقة: **${p} ج.م / وات**.`
      : `Trina Solar Vertex series panels trade at **${p} EGP / Watt** on Enerjoo Energy Exchange.`;
  }
  if (lastMsg.includes("ايكو") || lastMsg.includes("آيكو") || lastMsg.includes("aiko")) {
    const p = exchangePrices?.['AIKO'] ?? 12.5;
    return isAr 
      ? `ألواح آيكو (AIKO) متوفرة بتقنية ABC وتصنف من بين الأعلى كفاءة عالمياً (+23%). سعر الوات اليوم في بورصة الطاقة: **${p} ج.م / وات**.`
      : `AIKO ABC panels trade at **${p} EGP / Watt** on Enerjoo Energy Exchange.`;
  }
  if (lastMsg.includes("بورصة") || lastMsg.includes("سعر الوات") || (lastMsg.includes("سعر") && (lastMsg.includes("لوح") || lastMsg.includes("ألواح")))) {
    if (exchangePrices && Object.keys(exchangePrices).length > 0) {
      const topList = Object.entries(exchangePrices).slice(0, 6).map(([b, rate]) => `• ${b}: **${rate} ج.م / وات**`).join('\n');
      return isAr 
        ? `أسعار بورصة الطاقة اليوم في منصة Enerjoo (سعر الوات للألواح الشمسية):\n${topList}\n\n💡 يمكنك مراجعة شاشة "بورصة الطاقة" في المنصة لمتابعة التحديثات اليومية اللحظية وحساب تكلفة الألواح مباشرة!`
        : `Today's Enerjoo Solar Energy Exchange rates (EGP / Watt):\n${topList}\n\nCheck the Energy Exchange tab for live real-time prices!`;
    }
  }

  if (isAr) {
    if (lastMsg.includes("لوح") || lastMsg.includes("ألواح") || lastMsg.includes("انواع")) {
      return `أهلاً بك! يمكنك تصفح قسم الألواح الشمسية في المتجر لمعرفة الموديلات والقدرات والأسعار المتاحة حالياً من الموردين المعتمدين والمقارنة بينها بكل سهولة.`;
    }
    if (lastMsg.includes("بطار") || lastMsg.includes("تخزين")) {
      return `أهلاً بك! تتوفر في المتجر خيارات متنوعة من بطاريات الليثيوم والجل لتأمين انقطاع التيار الكهربائي وتشغيل الأحمال ليلاً. يمكنك تصفح المتجر لمطابقة السعة الأنسب لاحتياجك.`;
    }
    if (lastMsg.includes("انفرتر") || lastMsg.includes("محول")) {
      return `العاكس الشمسي (الانفرتر) يقوم بتحويل التيار المباشر من الألواح إلى تيار متردد لتشغيل الأجهزة. يمكنك مراجعة قسم الإنفرترات في المنصة للاختيار بين الأنظمة المتصلة أو الهجينة.`;
    }
    if (lastMsg.includes("سعر") || lastMsg.includes("تكلفة") || lastMsg.includes("بكام")) {
      return `تكلفة النظام الشمسي تعتمد على حجم الاستهلاك وقدرة المحطة المطلوبة والمكونات المختارة من الكتالوج. استخدم الحاسبة التفاعلية لحساب التكلفة التقديرية الدقيقة وطلب عروض أسعار فورية!`;
    }
    return `أهلاً بك في منصة Enerjoo! مستشارك الذكي لمساعدتك في حساب وتصميم محطتك وتصفح المكونات المتوفرة في المتجر. كيف يمكنني مساعدتك اليوم؟`;
  } else {
    if (lastMsg.includes("panel") || lastMsg.includes("brand")) {
      return `Hello! For solar panels in Egypt, premium tier-1 brands like Jinko Solar or Trina Solar N-type Monocrystalline models (570W - 585W) are highly recommended. They provide over 22% conversion efficiency, excellent heat tolerance for Egyptian climate, and up to 25 years warranty.`;
    }
    if (lastMsg.includes("batter") || lastMsg.includes("storage")) {
      return `Lithium iron phosphate (LiFePO4) batteries are the absolute gold standard for solar storage today (such as Felicity or Pylontech). They endure over 6,000 cycles, sustain 90% discharge depths, and last for 10-15 years, proving far superior to traditional tubular gel models.`;
    }
    if (lastMsg.includes("price") || lastMsg.includes("cost") || lastMsg.includes("how much")) {
      return `Solar setup investment varies in Egypt according to station power in kW. A typical on-grid 5kW home solar system fits around 130k-160k EGP which eliminates utility consumption from premium bill brackets. Please use the Interactive Solar Calculator below to size and obtain instant tier prices tailored to your property!`;
    }
    return `Welcome to Enerjoo Solar Consultant! Tell us what specific technical solar inquiries you have about panels, batteries, or Egyptian inverters, and we will happily assist!`;
  }
}

async function startServer() {
  const app = express();
  let portFromArgs: number | null = null;
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--port" || arg === "-p") {
      const next = Number(process.argv[i + 1]);
      if (!isNaN(next) && next > 0) portFromArgs = next;
    } else if (arg.startsWith("--port=")) {
      const val = Number(arg.split("=")[1]);
      if (!isNaN(val) && val > 0) portFromArgs = val;
    }
  }
  const PORT = Number(process.env.PORT) || portFromArgs || 3000;

  // Security: Disable X-Powered-By fingerprinting header
  app.disable("x-powered-by");

  // Process safety guards to prevent unexpected container exits
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception in server:", err);
  });
  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled rejection at:", promise, "reason:", reason);
  });

  const ALLOWED_SERVER_ORIGINS = new Set([
    "https://enerjoo.com",
    "https://www.enerjoo.com",
    "https://enerjoo.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
  ]);

  function isServerOriginAllowed(origin: string): boolean {
    if (!origin) return false;
    const lower = origin.toLowerCase().trim();
    if (ALLOWED_SERVER_ORIGINS.has(lower)) return true;
    if (/^https:\/\/[a-z0-9-]+\.enerjoo\.com$/.test(lower)) return true;
    if (/^https:\/\/ais-(?:dev|pre)-[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/.test(lower)) return true;
    return false;
  }

  // Defensive HTTP Security & Whitelisted CORS Headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=(self)");
    const origin = req.header("Origin") || "";
    res.setHeader("Vary", "Origin");
    if (origin && isServerOriginAllowed(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    const reqHeaders = req.header("Access-Control-Request-Headers");
    if (reqHeaders) {
      res.setHeader("Access-Control-Allow-Headers", reqHeaders);
    } else {
      res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,Content-Type,Authorization,X-Firebase-Auth,Cache-Control,cache-control,Accept,Origin,Pragma");
    }
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      if (origin && !isServerOriginAllowed(origin)) {
        return res.sendStatus(403);
      }
      return res.sendStatus(204);
    }
    next();
  });

  // Defensive request body limits to support compressed product images while mitigating DoS
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // API Health Check (accessible on /api/health, /health, and /_health)
  app.get(["/health", "/api/health", "/_health"], (req, res) => {
    res.json({ status: "ok" });
  });

  // Dedicated Product & Asset Image Upload Endpoint (/api/upload)
  app.post("/api/upload", async (req, res) => {
    try {
      const { file, image, dataUrl, name, filename } = req.body || {};
      const rawPayload = file || image || dataUrl;
      if (!rawPayload || typeof rawPayload !== "string") {
        return res.status(400).json({ success: false, error: "Missing image data in request" });
      }

      // Check if data URL format
      const match = rawPayload.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!match) {
        // If it's already a hosted URL, return as-is
        if (rawPayload.startsWith("http://") || rawPayload.startsWith("https://") || rawPayload.startsWith("/")) {
          return res.json({ success: true, image_url: rawPayload, url: rawPayload });
        }
        return res.status(400).json({ success: false, error: "Invalid image format. Expected Base64 Data URL." });
      }

      let subType = match[1].toLowerCase();
      if (subType === "jpeg") subType = "jpg";
      if (!["jpg", "png", "webp"].includes(subType)) {
        subType = "jpg";
      }

      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: "Image file exceeds 10 MB limit" });
      }

      const fs = await import("fs");
      const uploadsDir = path.join(process.cwd(), "public", "uploads", "products");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const rawName = String(name || filename || `img_${Date.now()}`);
      const safeBaseName = rawName.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 30);
      const uniqueFileName = `${Date.now()}_${safeBaseName}.${subType}`;
      const filePath = path.join(uploadsDir, uniqueFileName);

      fs.writeFileSync(filePath, buffer);

      const publicUrl = `/uploads/products/${uniqueFileName}`;
      return res.json({
        success: true,
        image_url: publicUrl,
        url: publicUrl,
        fileName: uniqueFileName
      });
    } catch (err: any) {
      console.error("Error in /api/upload:", err);
      return res.status(500).json({ success: false, error: "Failed to upload image file" });
    }
  });

  // In-memory Rate Limiter Middleware for API & AI Endpoints
  const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetAt) rateLimitStore.delete(key);
    }
  }, 60_000).unref();

  const createRateLimiter = (windowMs: number, maxRequests: number, scope: string) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.method === "OPTIONS") return next();
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "local";
      const key = `${scope}:${ip}`;
      const now = Date.now();
      const record = rateLimitStore.get(key);
      if (!record || now > record.resetAt) {
        rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
        return next();
      }
      record.count += 1;
      if (record.count > maxRequests) {
        const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
        res.setHeader("Retry-After", String(Math.max(1, retryAfterSec)));
        return res.status(429).json({
          success: false,
          error: "Too many requests. Please slow down and try again shortly."
        });
      }
      next();
    };
  };

  app.use("/api", createRateLimiter(60_000, 180, "api-general"));
  app.use(["/chat", "/api/chat", "/api/n8n-chat", "/api/semantic-search", "/api/solar-calculate", "/api/solar-chat"], createRateLimiter(60_000, 35, "ai-endpoints"));

  // Proxy endpoint for Cloudflare D1 API (bypasses browser CORS restrictions in preview/dev environments)
  const CF_WORKER_API = "https://enerjoo-api.enerjoo320.workers.dev";
  const cfProxyRoutes = [
    "/api/customers*",
    "/api/users*",
    "/api/suppliers*",
    "/api/solar-requests*",
    "/api/quotations*",
    "/api/quotation-items*",
    "/api/reviews*",
    "/api/files*",
    "/api/categories*",
    "/api/brands*"
  ];

  // Core Cloudflare D1 Catalog Single Source of Truth
  const D1_CATALOG_PRODUCTS: any[] = [
    {
      product_id: "PROD-1790087530612-MCLQP",
      brand: "Huawei",
      model: "SUN2000-115KTL-M2",
      product_category: "Inverters",
      product_type: "Three-Phase On-Grid String Inverter",
      technology: "Three-Phase On-Grid String Inverter",
      availability: "Available",
      image_url: "https://enerjoo-api.enerjoo320.workers.dev/files/products/1790087530856-b5aswi77.jpg",
      power_w: 115000,
      rated_power_kw: 115,
      price_egp: 269325,
      warranty_years: 5,
      efficiency_percent: 98.8,
      notes: "إنفرتر هواوي ثلاثي الأطوار عالي الكفاءة للمحطات والمصانع والمزارع المتصلة بالشبكة."
    },
    {
      product_id: "PROD-1791474437009-DC27W",
      brand: "Veichi",
      model: "hybrid inverter 8kw",
      product_category: "Inverters",
      product_type: "Hybrid",
      technology: "Hybrid",
      availability: "Available",
      image_url: "https://enerjoo-api.enerjoo320.workers.dev/files/products/1791474437619-nrtfkfhx.jpg",
      power_w: 8200,
      rated_power_kw: 8.2,
      price_egp: 55000,
      warranty_years: 5,
      efficiency_percent: 97.6,
      notes: "إنفرتر هايبرد ذكي بقدرة 8.2 كيلو وات يدعم البطاريات وشبكة الكهرباء مع التحويل الفوري."
    },
    {
      product_id: "PROD-1791474665420-D1JS4",
      brand: "Veichi",
      model: "hybrid inverter 6kw",
      product_category: "Inverters",
      product_type: "Hybrid",
      technology: "Hybrid",
      availability: "Available",
      image_url: "https://enerjoo-api.enerjoo320.workers.dev/files/products/1791474666113-7obpghwu.jpg",
      power_w: 6000,
      rated_power_kw: 6,
      price_egp: 37000,
      warranty_years: 5,
      efficiency_percent: 97.5,
      notes: "إنفرتر هايبرد منزلي وتجاري خفيف بقدرة 6 كيلو وات مع كفاءة تحويل ممتازة."
    },
    {
      product_id: "PROD-1791474189629-69ANC",
      brand: "Viechi",
      model: "hybrid inverter 10 kw",
      product_category: "Inverters",
      product_type: "Hybrid",
      technology: "Hybrid",
      availability: "Out of Stock",
      image_url: "https://enerjoo-api.enerjoo320.workers.dev/files/products/1791474190279-jtwk2hja.jpg",
      power_w: 10000,
      rated_power_kw: 10,
      price_egp: 121000,
      warranty_years: 5,
      efficiency_percent: 98.0,
      notes: "إنفرتر هايبرد 10 كيلو وات للمنشآت الكبيرة والمنازل ذات الأحمال الثقيلة."
    },
    {
      product_id: "PROD-1791793955228-T7V6R",
      brand: "Invt",
      model: "Solar Pump Invt",
      product_category: "Inverters",
      product_type: "Pump Inverter",
      technology: "Pump Inverter",
      availability: "Available",
      image_url: "https://enerjoo-api.enerjoo320.workers.dev/files/products/1791793955618-hnt8gcsl.jpg",
      power_w: 7500,
      rated_power_kw: 7.5,
      price_egp: 5686,
      warranty_years: 3,
      efficiency_percent: 98.0,
      notes: "إنفرتر طلمبات طاقة شمسية مع تحكم VFD لتشغيل مضخات الري والآبار في المزارع."
    },
    {
      product_id: "PROD-1791028978968-FTIXC",
      brand: "Jinko",
      model: "Jinko Solar Tiger Pro 725W",
      product_category: "Solar Panels",
      product_type: "N-type Mono-crystalline",
      technology: "N-type Mono-crystalline",
      availability: "Available",
      image_url: "https://enerjoo-api.enerjoo320.workers.dev/files/products/1791028978582-ye8lbh70.png",
      power_w: 725,
      rated_power_kw: 0.725,
      price_egp: 8700,
      efficiency_percent: 23.3,
      warranty_years: 25,
      notes: "لوح شمسي جينكو تايجر برو بقدرة فائقة 725 وات بتكنولوجيا N-Type عالية الإنتاجية."
    },
    {
      product_id: "PROD-1790196906481-Y1ZLE",
      brand: "Jinko",
      model: "Jinko Solar Tiger Pro 715W",
      product_category: "Solar Panels",
      product_type: "N-type Mono-crystalline",
      technology: "N-type Mono-crystalline",
      availability: "Available",
      image_url: "https://enerjoo-api.enerjoo320.workers.dev/files/products/1790196901213-p07tdsed.png",
      power_w: 715,
      rated_power_kw: 0.715,
      price_egp: 6435,
      efficiency_percent: 23.0,
      warranty_years: 25,
      notes: "لوح جينكو سولار تايجر برو 715 وات بتقنية الخلايا الأحادية نصف المقطوعة."
    },
    {
      product_id: "PROD-1790196358858-3Y2LX",
      brand: "Jinko",
      model: "Jinko Solar Tiger Pro 710W",
      product_category: "Solar Panels",
      product_type: "N-type Mono-crystalline",
      technology: "N-type Mono-crystalline",
      availability: "Available",
      image_url: "https://enerjoo-api.enerjoo320.workers.dev/files/products/1790196353517-pb2u7mew.png",
      power_w: 710,
      rated_power_kw: 0.71,
      price_egp: 6390,
      efficiency_percent: 22.8,
      warranty_years: 25,
      notes: "لوح شمسي عالي الكفاءة بقدرة 710 وات لتحقيق أعلى عائد طاقة لكل متر مربع."
    },
    {
      product_id: "PROD-1790195768679-5D7YF",
      brand: "Jinko",
      model: "Jinko Solar Tiger Pro 700W",
      product_category: "Solar Panels",
      product_type: "N-type Mono-crystalline",
      technology: "N-type Mono-crystalline",
      availability: "Available",
      image_url: "https://enerjoo-api.enerjoo320.workers.dev/files/products/1790195763424-hpeyfwdr.png",
      power_w: 700,
      rated_power_kw: 0.7,
      price_egp: 6300,
      efficiency_percent: 22.5,
      warranty_years: 25,
      notes: "لوح شمسي بقدرة 700 وات مناسب للمحطات السكنية والتجارية والمزارع."
    },
    {
      product_id: "PROD-1791043106438-O02SR",
      brand: "LONGi Solar",
      model: "LONGi Hi-MO X10 640W N-Type Bifacial Solar Panel",
      product_category: "Solar Panels",
      product_type: "N-type Mono-crystalline",
      technology: "N-type Mono-crystalline",
      availability: "Available",
      image_url: "https://enerjoo-api.enerjoo320.workers.dev/files/products/1791043105976-4eukpdun.png",
      power_w: 640,
      rated_power_kw: 0.64,
      price_egp: 5504,
      efficiency_percent: 23.2,
      warranty_years: 25,
      notes: "لوح لونجي ثنائي الوجه Hi-MO X10 بتقنية N-Type لإنتاج طاقة إضافية من انعكاس الأرض."
    },
    {
      product_id: "PROD-1791474964787-SZ0TT",
      brand: "Veichi",
      model: "battery gil 200ah",
      product_category: "Batteries",
      product_type: "Gel",
      technology: "Gel",
      availability: "Available",
      image_url: "https://enerjoo-api.enerjoo320.workers.dev/files/products/1791474965434-xr788udb.jpg",
      capacity_ah: 200,
      nominal_voltage_v: 12,
      price_egp: 16200,
      warranty_years: 3,
      notes: "بطارية ديب سايكل جل 200 أمبير 12 فولت لتخزين الطاقة الشمسية وتفريغ عميق آمن."
    },
    // --- 1. طلمبات ومضخات الري الزراعي (Solar Pumps) ---
    {
      product_id: "PROD-PUMP-SUB-7.5HP",
      brand: "Invt / Shinhoo",
      model: "Solar Submersible Deep Well Pump 7.5HP",
      product_category: "Pumps",
      product_type: "Submersible Pump",
      technology: "Solar Water Pumping",
      availability: "Available",
      image_url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80",
      power_w: 5500,
      rated_power_kw: 5.5,
      price_egp: 48000,
      warranty_years: 2,
      notes: "طلمبة غاطسة ستانلس ستيل 7.5 حصان لأعماق تصل إلى 120 متر، مصممة للمزارع والري بالطاقة الشمسية."
    },
    {
      product_id: "PROD-PUMP-SURF-5.5HP",
      brand: "Leo Solar",
      model: "Surface Centrifugal Solar Pump 5.5HP",
      product_category: "Pumps",
      product_type: "Surface Pump",
      technology: "Solar Water Pumping",
      availability: "Available",
      image_url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80",
      power_w: 4000,
      rated_power_kw: 4.0,
      price_egp: 34500,
      warranty_years: 2,
      notes: "مضخة سطحية طاردة مركزية 5.5 حصان لتطبيقات الري بالرش والتنقيط ونقل المياه."
    },
    // --- 2. هياكل التثبيت (Mounting Structures) ---
    {
      product_id: "PROD-MOUNT-ALUM-ROOF",
      brand: "Enerjoo Structure",
      model: "Alum 6005-T5 Roof Mounting System (4 Panels)",
      product_category: "Mounting Structures",
      product_type: "Rooftop Structure",
      technology: "Anodized Aluminum",
      availability: "Available",
      image_url: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80",
      price_egp: 4800,
      warranty_years: 10,
      notes: "شاسيه ألومنيوم معتمد 6005-T5 مقاوم للأكسدة والرياح حتى 150 كم/ساعة للأسطح المائلة والخرسانية."
    },
    {
      product_id: "PROD-MOUNT-GROUND-FARM",
      brand: "Enerjoo Heavy-Duty",
      model: "Hot-Dip Galvanized Ground Mounting Rack 10kW",
      product_category: "Mounting Structures",
      product_type: "Ground Mount",
      technology: "Hot-Dip Galvanized Steel",
      availability: "Available",
      image_url: "https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=800&q=80",
      price_egp: 18500,
      warranty_years: 15,
      notes: "هيكل تثبيت أرضي حديد مجلفن على الساخن عالي المتانة لمحطات المزارع والمشاريع الكبيرة المقاومة للتآكل."
    },
    // --- 3. الكابلات الشمسية (Solar Cables) ---
    {
      product_id: "PROD-CABLE-DC-6MM",
      brand: "El Sewedy / KBE",
      model: "Solar DC Cable 1x6mm² TÜV Certified (100m Roll)",
      product_category: "Solar Cables",
      product_type: "DC Solar Cable",
      technology: "Tinned Copper Double Insulated",
      availability: "Available",
      image_url: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80",
      price_egp: 7500,
      warranty_years: 25,
      notes: "كابل طاقة شمسية DC نحاس قصديري 6 مم² معتمد TÜV، مقاوم للأشعة فوق البنفسجية ودرجات الحرارة العالية حتى 120°C."
    },
    {
      product_id: "PROD-CABLE-DC-4MM",
      brand: "El Sewedy / KBE",
      model: "Solar DC Cable 1x4mm² TÜV Certified (100m Roll)",
      product_category: "Solar Cables",
      product_type: "DC Solar Cable",
      technology: "Tinned Copper Double Insulated",
      availability: "Available",
      image_url: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80",
      price_egp: 5200,
      warranty_years: 25,
      notes: "كابل طاقة شمسية DC نحاس قصديري 4 مم² معتمد للمحطات السكنية والمنظومات المتوسطة."
    },
    // --- 4. قواطع ولوحات الحماية والتوزيع (Protection & Distribution) ---
    {
      product_id: "PROD-PROT-DC-SPD-1000V",
      brand: "Chint / Suntree",
      model: "DC Protection Box: 32A Breaker + 1000V SPD",
      product_category: "Protection & Distribution",
      product_type: "DC Protection",
      technology: "Surge & Overcurrent Protection",
      availability: "Available",
      image_url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
      price_egp: 2450,
      warranty_years: 3,
      notes: "طقم حماية DC متكامل يشمل قاطع تيار مستمر 32A ومفرغ شحنات صواعق SPD 1000V لحماية الإنفرتر والسلاسل."
    },
    {
      product_id: "PROD-PROT-AC-3PH-DIST",
      brand: "Schneider / ABB",
      model: "Three-Phase AC Distribution Box 63A",
      product_category: "Protection & Distribution",
      product_type: "AC Distribution",
      technology: "3-Phase AC Protection",
      availability: "Available",
      image_url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
      price_egp: 8900,
      warranty_years: 5,
      notes: "لوحة قواطع وحماية AC ثلاثية الأطوار 63A مزودة بحماية تسريب أرضي ومانع صواعق ومفتاح عزل رئيسي."
    },
    // --- 5. صناديق التجميع (Combiner Boxes) ---
    {
      product_id: "PROD-COMB-4IN-1OUT",
      brand: "Suntree Solar",
      model: "PV Combiner Box 4-Strings In / 1-Out 1000V IP65",
      product_category: "Combiner Boxes",
      product_type: "PV Combiner Box",
      technology: "Weatherproof IP65 DC Combiner",
      availability: "Available",
      image_url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
      price_egp: 6800,
      warranty_years: 5,
      notes: "صندوق تجميع 4 سلاسل شمسية مع فيوزات 15A وقاطع عزل 1000V ومانع صواعق SPD مدمج داخل كابينة IP65."
    },
    // --- 6. موصلات MC4 (MC4 Connectors) ---
    {
      product_id: "PROD-MC4-1500V-PAIR",
      brand: "Stäubli / Multi-Contact",
      model: "Original MC4 Connectors 1500V IP68 (Set of 10 Pairs)",
      product_category: "MC4 Connectors",
      product_type: "MC4 Connector",
      technology: "IP68 Waterproof PV Connector",
      availability: "Available",
      image_url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80",
      price_egp: 650,
      warranty_years: 10,
      notes: "موصلات MC4 ذكر وأنثى أصلية 1500V مقاومة للماء والغبار IP68 لتحقيق اتصال موثوق وآمن بدون فقد للطاقة."
    },
    // --- 7. كلبسات التثبيت (Clamps) ---
    {
      product_id: "PROD-CLAMP-MID-END-SET",
      brand: "Enerjoo Clamps",
      model: "Mid & End Clamps with SS304 Bolts (20 Pcs Set)",
      product_category: "Clamps",
      product_type: "Mounting Clamps",
      technology: "Aluminum 6005-T5 & Stainless Steel",
      availability: "Available",
      image_url: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80",
      price_egp: 850,
      warranty_years: 10,
      notes: "طقم كلبسات تثبيت ألومنيوم وسطية وطرفية مع مسامير ستانلس ستيل SS304 لسماكات الألواح 30-35 مم."
    },
    // --- 8. وصلات مانعة للتسرب (Sealings) ---
    {
      product_id: "PROD-SEAL-EPDM-GASKET",
      brand: "Enerjoo WeatherSeal",
      model: "EPDM Waterproof Roof Gaskets & Flashing (50 Pcs Set)",
      product_category: "Sealings",
      product_type: "Waterproof Sealing",
      technology: "UV Resistant EPDM Rubber",
      availability: "Available",
      image_url: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80",
      price_egp: 450,
      warranty_years: 10,
      notes: "عوازل وجوانات EPDM مانعة لتسرب المياه ومقاومة لأشعة الشمس والحرارة مخصصة لتثبيت الهياكل على الأسطح المعدنية."
    }
  ];

  const DELETED_PRODUCTS_FILE = path.join(process.cwd(), "deleted-products.json");
  const deletedProductIds = new Set<string>();

  const loadDeletedProducts = () => {
    try {
      if (fs.existsSync(DELETED_PRODUCTS_FILE)) {
        const saved = JSON.parse(fs.readFileSync(DELETED_PRODUCTS_FILE, "utf-8"));
        if (Array.isArray(saved)) {
          deletedProductIds.clear();
          saved.forEach((id: string) => deletedProductIds.add(String(id)));
        }
      }
    } catch (e) {
      console.warn("Could not load deleted-products.json:", e);
    }
  };
  loadDeletedProducts();

  const saveDeletedProducts = async () => {
    try {
      fs.writeFileSync(DELETED_PRODUCTS_FILE, JSON.stringify(Array.from(deletedProductIds), null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not save deleted-products.json:", e);
    }
  };

  const EDITED_PRODUCTS_FILE = path.join(process.cwd(), "edited-products.json");
  const editedProductsMap = new Map<string, any>();

  try {
    const fs = await import("fs");
    if (fs.existsSync(EDITED_PRODUCTS_FILE)) {
      const saved = JSON.parse(fs.readFileSync(EDITED_PRODUCTS_FILE, "utf-8"));
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        Object.entries(saved).forEach(([id, prod]) => {
          editedProductsMap.set(String(id), prod);
        });
      }
    }
  } catch (e) {
    console.warn("Could not load edited-products.json:", e);
  }

  const saveEditedProducts = async () => {
    try {
      const fs = await import("fs");
      const obj: Record<string, any> = {};
      editedProductsMap.forEach((val, key) => {
        obj[key] = val;
      });
      fs.writeFileSync(EDITED_PRODUCTS_FILE, JSON.stringify(obj, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not save edited-products.json:", e);
    }
  };

  // Starts empty, populated exclusively from live D1 database
  const activeCatalogProducts: any[] = [];

  function normalizeCategoryKey(catStr?: string | null): string {
    if (!catStr) return 'panels';
    const c = String(catStr).toLowerCase();
    if (c.includes('panel') || c.includes('لوح') || c.includes('ألواح') || c.includes('الواح') || c.includes('خلايا شمسية')) return 'panels';
    if (c.includes('invert') || c.includes('محول') || c.includes('إنفرتر') || c.includes('انفرتر')) return 'inverters';
    if (c.includes('batter') || c.includes('بطار')) return 'batteries';
    if (c.includes('pump') || c.includes('مضخ') || c.includes('طلمب') || c.includes('غطاس')) return 'pumps';
    if (c.includes('mount') || c.includes('structur') || c.includes('هيكل') || c.includes('شاسيه') || c.includes('حوامل')) return 'mounting';
    if (c.includes('protect') || c.includes('حماي') || c.includes('قاطع') || c.includes('توزيع')) return 'protection';
    if (c.includes('combin') || c.includes('تجميع') || c.includes('صندوق')) return 'combiner';
    if (c.includes('cable') || c.includes('كابل') || c.includes('سلك') || c.includes('أسلاك')) return 'cables';
    if (c.includes('mc4') || c.includes('كونكتور')) return 'mc4';
    if (c.includes('seal') || c.includes('عازل') || c.includes('عوازل') || c.includes('جوان')) return 'sealings';
    if (c.includes('clamp') || c.includes('كلبس') || c.includes('تثبيت') || c.includes('مشابك')) return 'clamps';
    return c;
  }

  function formatCategoryTitle(catKey: string): string {
    switch (catKey) {
      case 'panels': return 'Solar Panels';
      case 'inverters': return 'Inverters';
      case 'batteries': return 'Batteries';
      case 'pumps': return 'Pumps';
      case 'mounting': return 'Mounting Structures';
      case 'protection': return 'Protection & Distribution';
      case 'combiner': return 'Combiner Boxes';
      case 'cables': return 'Solar Cables';
      case 'mc4': return 'MC4 Connectors';
      case 'sealings': return 'Sealings';
      case 'clamps': return 'Clamps';
      default: return catKey;
    }
  }

  function resolveDefaultProductImage(normCat: string, brand: string, model: string): string {
    const b = (brand || '').toLowerCase();
    const m = (model || '').toLowerCase();
    if (normCat === 'inverters') {
      if (b.includes('huawei') || m.includes('sun2000')) {
        return 'https://enerjoo-api.enerjoo320.workers.dev/files/products/1790087530856-b5aswi77.jpg';
      }
      if (b.includes('invt') || m.includes('pump')) {
        return 'https://enerjoo-api.enerjoo320.workers.dev/files/products/1791793955618-hnt8gcsl.jpg';
      }
      return 'https://enerjoo-api.enerjoo320.workers.dev/files/products/1791474437619-nrtfkfhx.jpg';
    }
    if (normCat === 'panels') {
      if (b.includes('longi') || b.includes('trina')) {
        return 'https://enerjoo-api.enerjoo320.workers.dev/files/products/1791043105976-4eukpdun.png';
      }
      return 'https://enerjoo-api.enerjoo320.workers.dev/files/products/1791028978582-ye8lbh70.png';
    }
    if (normCat === 'batteries') {
      return 'https://enerjoo-api.enerjoo320.workers.dev/files/products/1791474965434-xr788udb.jpg';
    }
    return 'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80';
  }

  function normalizeBrandName(rawBrand?: string | null, model?: string | null): string {
    const b = String(rawBrand || '').trim();
    const bl = b.toLowerCase();
    const ml = String(model || '').toLowerCase();
    if (bl.startsWith('huawei') || ml.includes('sun2000')) return 'Huawei';
    if (bl === 'felicity') return 'Felicity';
    if (bl === 'eastman') return 'Eastman';
    if (bl === 'veichi' || bl === 'viechi') return 'Veichi';
    if (bl.startsWith('jinko')) return 'Jinko';
    if (bl.startsWith('longi')) return 'LONGi Solar';
    if (bl.startsWith('trina')) return 'Trina Solar';
    if (bl === 'invt') return 'Invt';
    return b || 'Enerjoo';
  }

  function normalizeProductRecord(p: any): any {
    const id = String(p.product_id || p.id || '');
    const baseMatch = productsData.find(b => String(b.id) === id);
    const rawCat = p.product_category || p.category || (baseMatch ? baseMatch.category : '');
    const normCat = normalizeCategoryKey(rawCat);
    const titleCat = formatCategoryTitle(normCat);

    let parsedSpecs: Record<string, any> = {};
    if (typeof p.specs === 'string') {
      try {
        parsedSpecs = JSON.parse(p.specs);
      } catch {
        parsedSpecs = {};
      }
    } else if (p.specs && typeof p.specs === 'object' && !Array.isArray(p.specs)) {
      parsedSpecs = p.specs;
    }

    let parsedSuppliers: any = p.suppliers;
    if (typeof parsedSuppliers === 'string') {
      try {
        parsedSuppliers = JSON.parse(parsedSuppliers);
      } catch {
        parsedSuppliers = undefined;
      }
    }

    const rawRatedKw = p.rated_power_kw ?? parsedSpecs.ratedPowerKw;
    const ratedKw = rawRatedKw !== undefined && rawRatedKw !== null && rawRatedKw !== '' && Number.isFinite(Number(rawRatedKw))
      ? Number(rawRatedKw)
      : null;

    const rawPower = p.power_w ?? p.power ?? (baseMatch ? baseMatch.power : null);
    let power: number | null = rawPower !== undefined && rawPower !== null && rawPower !== '' && Number.isFinite(Number(rawPower))
      ? Number(rawPower)
      : null;
    if ((power === null || power === 0) && ratedKw !== null && ratedKw > 0) {
      power = ratedKw <= 200 ? ratedKw * 1000 : ratedKw;
    }

    const isEdited = editedProductsMap.has(id) || Boolean(p._isEdited);
    let price = Number(p.price ?? p.price_egp ?? (baseMatch ? baseMatch.price : 0));
    // Fix D1 shorthand thousands entry ONLY when not explicitly set by user
    if (normCat === 'inverters' && price > 0 && price < 500 && !isEdited && !p.price) {
      price = baseMatch?.price && baseMatch.price >= 1000 ? baseMatch.price : price * 1000;
    }

    const rawEff = p.efficiency_percent !== undefined ? p.efficiency_percent : (p.efficiency !== undefined ? p.efficiency : (baseMatch ? baseMatch.efficiency : null));
    const efficiency: number | null = rawEff !== undefined && rawEff !== null && rawEff !== '' && Number.isFinite(Number(rawEff)) && Number(rawEff) > 0
      ? Number(rawEff)
      : null;

    const rawWar = p.warranty_years !== undefined ? p.warranty_years : (p.warranty !== undefined ? p.warranty : (baseMatch ? baseMatch.warranty : null));
    const warranty: number | null = rawWar !== undefined && rawWar !== null && rawWar !== '' && Number.isFinite(Number(rawWar)) && Number(rawWar) > 0
      ? Number(rawWar)
      : null;

    const brand = normalizeBrandName(p.brand || baseMatch?.brand, p.model || p.name);
    let rawModel = String(p.model || p.name || baseMatch?.name || `Product ${id}`).trim();
    const kwDisplay = ratedKw !== null && ratedKw > 0 ? ratedKw : (power !== null && power >= 1000 ? power / 1000 : 0);

    // Disambiguate generic Felicity / Eastman model strings in D1 using rated power
    if (!isEdited && brand === 'Felicity' && rawModel.toLowerCase() === 'off grid inverter' && kwDisplay > 0) {
      rawModel = `Felicity Off-Grid Inverter ${kwDisplay}kW`;
    } else if (!isEdited && brand === 'Eastman' && /^inverter\b/i.test(rawModel) && kwDisplay > 0) {
      rawModel = `Eastman Off-Grid Inverter ${kwDisplay}kW`;
    }

    const hasExplicitName = Boolean(
      isEdited ||
      (p.name && p.name !== baseMatch?.name) ||
      (p.nameAr && p.nameAr !== baseMatch?.nameAr) ||
      (p.name_ar && p.name_ar !== baseMatch?.nameAr)
    );

    const name = hasExplicitName
      ? (p.name || p.nameAr || p.model || baseMatch?.name || rawModel)
      : (baseMatch?.name || p.name || rawModel);
    let nameAr = hasExplicitName
      ? (p.nameAr || p.name_ar || p.name || baseMatch?.nameAr || '')
      : (p.nameAr || p.name_ar || baseMatch?.nameAr || '');

    if (!nameAr || (!hasExplicitName && (nameAr === rawModel || nameAr === p.model))) {
      if (brand === 'Huawei' && kwDisplay > 0) {
        nameAr = `إنفرتر هواوي ${kwDisplay} كيلو وات On-Grid ثلاثي الأطوار (${rawModel.replace(/^Huawei\s*/i, '')})`;
      } else if (brand === 'Felicity' && kwDisplay > 0) {
        nameAr = `إنفرتر فيليسيتي (فيلسيتي) أوف جريد ${kwDisplay} كيلو وات`;
      } else if (brand === 'Eastman' && kwDisplay > 0) {
        nameAr = `إنفرتر إيستمان أوف جريد ${kwDisplay} كيلو وات`;
      } else if (brand === 'Jinko' && power !== null && power > 0) {
        nameAr = `لوح طاقة شمسية جينكو ${power} وات (${rawModel})`;
      } else if (brand === 'LONGi Solar' && power !== null && power > 0) {
        nameAr = `لوح طاقة شمسية لونجي ثنائي الوجه ${power} وات (${rawModel})`;
      } else if (brand === 'Trina Solar' && power !== null && power > 0) {
        nameAr = `لوح طاقة شمسية ترينا سولار ثنائي الوجه ${power} وات (${rawModel})`;
      } else {
        nameAr = name;
      }
    }

    const image = p.image || p.image_url || baseMatch?.image || resolveDefaultProductImage(normCat, brand, name);
    const availability = p.availability || (p.status === 'out_of_stock' ? 'Out of Stock' : p.status === 'limited' ? 'Limited' : 'Available');
    const status = p.status || (availability.toLowerCase().includes('out') ? 'out_of_stock' : availability.toLowerCase().includes('limit') ? 'limited' : 'available');
    const notes = p.notes || p.description || parsedSpecs.notes || parsedSpecs.description || baseMatch?.notes || nameAr;
    const specs = {
      ...(baseMatch?.specs || {}),
      ...parsedSpecs,
      productType: p.product_type || parsedSpecs.productType || parsedSpecs.type || baseMatch?.specs?.productType || '',
      technology: p.technology || parsedSpecs.technology || baseMatch?.specs?.technology || '',
      ratedPowerKw: ratedKw ?? (normCat === 'inverters' && power !== null && power >= 1000 ? power / 1000 : undefined),
      vmpV: p.vmp_v ?? parsedSpecs.vmpV ?? baseMatch?.specs?.vmpV,
      vocV: p.voc_v ?? parsedSpecs.vocV ?? baseMatch?.specs?.vocV,
      impA: p.imp_a ?? parsedSpecs.impA ?? baseMatch?.specs?.impA,
      iscA: p.isc_a ?? parsedSpecs.iscA ?? baseMatch?.specs?.iscA,
      acVoltageV: p.ac_voltage_v ?? parsedSpecs.acVoltageV ?? baseMatch?.specs?.acVoltageV
    };

    const suppliers = Array.isArray(parsedSuppliers) && parsedSuppliers.length > 0
      ? parsedSuppliers
      : (baseMatch?.suppliers || []);

    const resolvedSupplierId = String(
      p.supplier_id ||
      p.supplierId ||
      p.supplier ||
      (Array.isArray(suppliers) && suppliers[0]?.id ? suppliers[0].id : '') ||
      ''
    ).trim();

    return {
      ...p,
      id,
      product_id: id,
      name,
      model: rawModel,
      nameAr,
      name_ar: nameAr,
      brand,
      category: normCat,
      product_category: titleCat,
      power: power ?? 0,
      power_w: power,
      rated_power_kw: ratedKw,
      price,
      price_egp: price,
      efficiency,
      efficiency_percent: efficiency,
      warranty,
      warranty_years: warranty,
      image,
      image_url: image,
      availability,
      status,
      notes,
      description: notes,
      specs,
      suppliers,
      supplierId: resolvedSupplierId,
      supplier_id: resolvedSupplierId,
      supplier: resolvedSupplierId,
      _isEdited: isEdited,
      source: p._fromD1 ? 'd1' : (baseMatch ? 'catalog' : 'd1')
    };
  }

  function getActiveCatalogProducts(): any[] {
    return activeCatalogProducts.filter(p => !deletedProductIds.has(String(p.product_id || p.id))).map(normalizeProductRecord);
  }

  // Live Cloudflare D1 Full Partition Harvester (bypasses deployed Worker's hardcoded LIMIT 10 per request)
  let liveD1ProductsCache = new Map<string, any>();
  let lastD1CacheTime = 0;
  let d1FetchInFlight: Promise<Map<string, any>> | null = null;
  const D1_CACHE_TTL_MS = 60_000;

  const D1_PARTITIONS = [
    "",
    "PROD-1789",
    "PROD-1790081", "PROD-1790082", "PROD-1790083", "PROD-1790085", "PROD-1790086", "PROD-1790087",
    "PROD-1790193", "PROD-1790194", "PROD-1790195", "PROD-1790196",
    "PROD-179028",
    "PROD-179052",
    "PROD-179092",
    "PROD-17910",
    "PROD-17913",
    "PROD-17914",
    "PROD-17917",
    "PROD-1792",
    "PROD-1793"
  ];

  async function fetchAllLiveD1Products(forceRefresh = false): Promise<Map<string, any>> {
    const now = Date.now();
    if (!forceRefresh && liveD1ProductsCache.size > 0 && now - lastD1CacheTime < D1_CACHE_TTL_MS) {
      return liveD1ProductsCache;
    }
    if (d1FetchInFlight) {
      return d1FetchInFlight;
    }

    d1FetchInFlight = (async () => {
      const discovered = new Map<string, any>();

      async function fetchPartition(q: string, depth = 0): Promise<void> {
        try {
          const url = q ? `${CF_WORKER_API}/products?q=${encodeURIComponent(q)}` : `${CF_WORKER_API}/products`;
          const r = await fetch(url, { signal: AbortSignal.timeout(4500) });
          if (!r.ok) return;
          const d: any = await r.json();
          const prods = Array.isArray(d.products) ? d.products : [];
          for (const item of prods) {
            const id = String(item.product_id || item.id || '');
            if (id && !deletedProductIds.has(id)) {
              const edited = editedProductsMap.get(id);
              discovered.set(id, { ...item, ...(edited || {}), _fromD1: true });
            }
          }
          // If a prefix partition hits the Worker's 10-item cap, subdivide by digits 0-9
          if (q && prods.length >= 10 && depth < 2) {
            const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
            await Promise.all(digits.map(dg => fetchPartition(q + dg, depth + 1)));
          }
        } catch {
          // Ignore single partition network error
        }
      }

      await Promise.all(D1_PARTITIONS.map(q => fetchPartition(q)));

      // Preserve locally created/edited non-deleted products so D1 cache refresh never wipes supplier additions
      for (const [id, editedProd] of editedProductsMap.entries()) {
        if (id && !deletedProductIds.has(id)) {
          const current = discovered.get(id) || {};
          discovered.set(id, { ...current, ...editedProd, _fromD1: true });
        }
      }

      liveD1ProductsCache = discovered;
      lastD1CacheTime = Date.now();
      d1FetchInFlight = null;
      return liveD1ProductsCache;
    })();

    return d1FetchInFlight;
  }

  // Pre-warm live D1 cache after server starts listening (see app.listen callback)

  // Category Arabic names mapping for SEO & OpenGraph snippets
  const CATEGORY_NAMES_AR: Record<string, string> = {
    panels: 'ألواح شمسية',
    inverters: 'محولات طاقة (إنفرتر)',
    batteries: 'بطاريات طاقة شمسية',
    pumps: 'طلمبات شمسية',
    mounting: 'شاسيهات وهياكل تثبيت',
    protection: 'لوحات وقواطع حماية',
    combiner: 'صناديق تجميع (Combiner Box)',
    cables: 'كابلات طاقة شمسية',
    mc4: 'وصلات MC4',
    sealings: 'مواد عزل وتثبيت',
    clamps: 'كلبسات تثبيت',
    all: 'معدات طاقة شمسية'
  };

  // Retrieve all authoritative, published, non-deleted products from Cloudflare D1 + local catalog + local edits
  async function getAuthoritativePublishedProducts(): Promise<any[]> {
    loadDeletedProducts();
    const productsMap = new Map<string, any>();

    // 1. Fetch live D1 products across all partitions
    try {
      const d1Map = await fetchAllLiveD1Products();
      for (const [id, p] of d1Map.entries()) {
        if (deletedProductIds.has(id)) {
          continue;
        }
        const isLocallyEdited = editedProductsMap.has(id);
        const editedData = isLocallyEdited ? editedProductsMap.get(id) : null;
        productsMap.set(id, normalizeProductRecord({ ...p, ...(editedData || {}), _fromD1: true }));
      }
    } catch (cfErr) {
      console.warn("Notice: could not reach remote Cloudflare Worker for authoritative products:", cfErr);
    }

    // 2. Overlay locally created/edited products that are not deleted
    for (const [id, editedProd] of editedProductsMap.entries()) {
      if (!deletedProductIds.has(id)) {
        const current = productsMap.get(id) || {};
        productsMap.set(id, normalizeProductRecord({ ...current, ...editedProd }));
      }
    }

    return Array.from(productsMap.values()).filter(p => {
      const id = String(p.product_id || p.id);
      return id && !deletedProductIds.has(id);
    });
  }

  function escapeXml(unsafe?: string | null): string {
    if (!unsafe) return "";
    return String(unsafe)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#[xX][0-9a-fA-F]+);)/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function formatXmlUrl(rawUrl?: string | null): string {
    if (!rawUrl) return "";
    let url = String(rawUrl).trim();
    if (!url) return "";
    if (!/^https?:\/\//i.test(url)) {
      if (url.startsWith("/")) {
        url = `https://enerjoo.com${url}`;
      } else {
        url = `https://enerjoo.com/${url}`;
      }
    }
    // Encode unescaped whitespace to %20
    url = url.replace(/ /g, "%20");
    // Escape all XML entities idempotently without double-encoding
    return escapeXml(url);
  }

  function escapeHtml(unsafe?: string | null): string {
    if (!unsafe) return "";
    return String(unsafe)
      .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#[xX][0-9a-fA-F]+);)/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function generateSitemapXml(products: any[]): string {
    const baseUrl = "https://enerjoo.com";
    const now = new Date().toISOString().split("T")[0];
    const urls: string[] = [];

    // 1. Core Public Routes
    urls.push(`  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${formatXmlUrl(`${baseUrl}/brand-thumbnail.png`)}</image:loc>
      <image:title>${escapeXml("Enerjoo | عالم الطاقة بين يديك")}</image:title>
      <image:caption>${escapeXml("منصة وبورصة الطاقة الشمسية في مصر")}</image:caption>
    </image:image>
  </url>`);

    urls.push(`  <url>
    <loc>${baseUrl}/products</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`);

    urls.push(`  <url>
    <loc>${baseUrl}/exchange</loc>
    <lastmod>${now}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>`);

    urls.push(`  <url>
    <loc>${baseUrl}/calculator</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);

    urls.push(`  <url>
    <loc>${baseUrl}/compare</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);

    // 2. Individual Published Products
    const seenIds = new Set<string>();

    for (const product of products) {
      const pId = String(product.product_id || product.id || "").trim();
      if (!pId || seenIds.has(pId) || deletedProductIds.has(pId)) continue;
      seenIds.add(pId);

      const productUrl = `${baseUrl}/product/${encodeURIComponent(pId)}`;
      let lastModDate = now;
      if (product.updated_at) {
        try {
          lastModDate = new Date(product.updated_at).toISOString().split("T")[0];
        } catch {
          lastModDate = now;
        }
      } else if (product.created_at) {
        try {
          lastModDate = new Date(product.created_at).toISOString().split("T")[0];
        } catch {
          lastModDate = now;
        }
      }

      const productName = escapeXml((product.nameAr || product.name || `منتج ${pId}`).trim());
      const rawImageUrl = product.image_url || product.image;

      let imageTag = "";
      if (rawImageUrl && typeof rawImageUrl === "string" && rawImageUrl.trim()) {
        const formattedImageUrl = formatXmlUrl(rawImageUrl);
        if (formattedImageUrl) {
          imageTag = `\n    <image:image>\n      <image:loc>${formattedImageUrl}</image:loc>\n      <image:title>${productName}</image:title>\n    </image:image>`;
        }
      }

      urls.push(`  <url>
    <loc>${productUrl}</loc>
    <lastmod>${lastModDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${imageTag}
  </url>`);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>`;
  }

  // =========================================================================
  // PRODUCTS REST API (GET, POST, PUT, DELETE)
  // =========================================================================

  // GET /api/products - List all products with full D1 partition harvesting and filter support
  app.get("/api/products", async (req, res) => {
    try {
      loadDeletedProducts();
      const productsMap = new Map<string, any>();

      // 1. Fetch ALL live products from Cloudflare Worker D1 (across all partitions)
      try {
        const d1Map = await fetchAllLiveD1Products();
        for (const [id, p] of d1Map.entries()) {
          if (deletedProductIds.has(id)) {
            continue;
          }
          const isLocallyEdited = editedProductsMap.has(id);
          const editedData = isLocallyEdited ? editedProductsMap.get(id) : null;
          productsMap.set(id, normalizeProductRecord({ ...p, ...(editedData || {}), _fromD1: true }));
        }
      } catch (cfErr) {
        console.warn("Notice: could not reach remote Cloudflare Worker:", cfErr);
      }

      // 2. Overlay locally created/edited products that are not deleted
      for (const [id, editedProd] of editedProductsMap.entries()) {
        if (!deletedProductIds.has(id)) {
          const current = productsMap.get(id) || {};
          productsMap.set(id, normalizeProductRecord({ ...current, ...editedProd }));
        }
      }

      let mergedProducts = Array.from(productsMap.values());

      // Query Filters (category, brand, search, pagination)
      const queryCat = req.query.category as string | undefined;
      if (queryCat && queryCat !== 'all') {
        const normFilterCat = normalizeCategoryKey(queryCat);
        mergedProducts = mergedProducts.filter(p => p.category === normFilterCat || p.product_category?.toLowerCase() === queryCat.toLowerCase());
      }

      const queryBrand = req.query.brand as string | undefined;
      if (queryBrand && queryBrand !== 'all') {
        mergedProducts = mergedProducts.filter(p => p.brand?.toLowerCase() === queryBrand.toLowerCase());
      }

      const querySearch = req.query.search as string | undefined;
      if (querySearch && querySearch.trim()) {
        const qRaw = querySearch.trim().toLowerCase();
        const normalizeArabic = (s?: string | null) => (s || '')
          .toLowerCase()
          .replace(/[أإآ]/g, 'ا')
          .replace(/ة/g, 'ه')
          .replace(/ى/g, 'ي')
          .replace(/[\u064B-\u065F]/g, '');

        const q = normalizeArabic(qRaw);

        // Check if query is a category intent in Arabic or English
        const isInvQuery = q.includes('محول') || q.includes('انفرتر') || q.includes('inverter');
        const isPanelQuery = q.includes('لوح') || q.includes('الواح') || q.includes('panel');
        const isBatteryQuery = q.includes('بطار') || q.includes('battery');
        const isPumpQuery = q.includes('طلمب') || q.includes('مضخ') || q.includes('pump');

        mergedProducts = mergedProducts.filter(p => {
          if (isInvQuery && p.category === 'inverters') return true;
          if (isPanelQuery && p.category === 'panels') return true;
          if (isBatteryQuery && p.category === 'batteries') return true;
          if (isPumpQuery && p.category === 'pumps') return true;

          const haystack = normalizeArabic([
            p.name,
            p.nameAr,
            p.name_ar,
            p.brand,
            p.model,
            p.notes,
            p.description,
            p.product_category,
            p.category,
            p.product_type
          ].join(' '));

          return haystack.includes(q) || haystack.includes(qRaw);
        });
      }

      const totalCount = mergedProducts.length;
      const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const pageParam = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      if (limitParam && limitParam > 0) {
        const offset = Math.max(0, (pageParam - 1) * limitParam);
        mergedProducts = mergedProducts.slice(offset, offset + limitParam);
      }

      return res.json({
        success: true,
        ok: true,
        count: mergedProducts.length,
        total: totalCount,
        d1_count: liveD1ProductsCache.size,
        deleted_ids: Array.from(deletedProductIds),
        products: mergedProducts
      });
    } catch (err: any) {
      console.warn("Error in GET /api/products:", err);
      return res.json({
        success: true,
        ok: true,
        count: 0,
        total: 0,
        deleted_ids: Array.from(deletedProductIds),
        products: []
      });
    }
  });

  // GET /api/products/:productId - Fetch single product
  app.get("/api/products/:productId", async (req, res) => {
    const { productId } = req.params;
    const pIdStr = String(productId);
    if (deletedProductIds.has(pIdStr)) {
      return res.status(404).json({ success: false, error: `Product deleted: ${productId}` });
    }
    try {
      // 1. Check local edited products first
      if (editedProductsMap.has(pIdStr)) {
        return res.json({
          success: true,
          ok: true,
          product: normalizeProductRecord(editedProductsMap.get(pIdStr))
        });
      }

      // 2. Check live D1 cache + local catalog merged
      const d1Map = await fetchAllLiveD1Products();
      const foundD1 = d1Map.get(pIdStr);
      const foundLocal = activeCatalogProducts.find(p => String(p.product_id) === pIdStr || String(p.id) === pIdStr);
      if (foundD1 || foundLocal) {
        return res.json({
          success: true,
          ok: true,
          product: normalizeProductRecord({ ...(foundLocal || {}), ...(foundD1 || {}) })
        });
      }

      // 3. Fallback: targeted search in remote D1 by product_id query
      try {
        const listRes = await fetch(`${CF_WORKER_API}/products?q=${encodeURIComponent(pIdStr)}`, { signal: AbortSignal.timeout(3500) });
        if (listRes.ok) {
          const listData: any = await listRes.json();
          if (Array.isArray(listData.products)) {
            const foundInList = listData.products.find((p: any) => String(p.product_id) === pIdStr || String(p.id) === pIdStr);
            if (foundInList) {
              liveD1ProductsCache.set(pIdStr, { ...foundInList, _fromD1: true });
              return res.json({ success: true, ok: true, product: normalizeProductRecord({ ...foundInList, _fromD1: true }) });
            }
          }
        }
      } catch {
        // Fallback
      }

      return res.status(404).json({ success: false, error: `Product not found: ${productId}` });
    } catch (err: any) {
      return res.status(404).json({ success: false, error: `Product not found: ${productId}` });
    }
  });

  // Input sanitization helper to prevent Prototype Pollution & Stored XSS in product payloads
  function sanitizeProductPayload(raw: any): Record<string, any> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const URL_KEYS = new Set(["image_url", "image", "datasheet_url", "datasheetUrl"]);
    const JSON_STRUCT_KEYS = new Set(["specs", "suppliers", "additionalImages"]);
    const clean: Record<string, any> = {};

    for (const [key, val] of Object.entries(raw)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      if (typeof val === "string") {
        let str = val.trim().slice(0, 12000);
        // Strip script tags and inline event handlers
        str = str
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/\bon\w+\s*=/gi, "");
        if (URL_KEYS.has(key)) {
          if (/^\s*(?:javascript|vbscript|data:text\/html):/i.test(str)) {
            str = "";
          }
        }
        // Automatically parse JSON-stringified specs / suppliers / additionalImages sent by mapProductToD1Payload
        if (JSON_STRUCT_KEYS.has(key) && (str.startsWith("{") || str.startsWith("["))) {
          try {
            const parsed = JSON.parse(str);
            if (Array.isArray(parsed)) {
              clean[key] = parsed.slice(0, 50);
              continue;
            } else if (parsed && typeof parsed === "object") {
              clean[key] = sanitizeProductPayload(parsed);
              continue;
            }
          } catch {
            // Keep string if not valid JSON
          }
        }
        clean[key] = str.slice(0, 4000);
      } else if (typeof val === "number") {
        clean[key] = Number.isFinite(val) ? val : 0;
      } else if (typeof val === "boolean" || val === null) {
        clean[key] = val;
      } else if (typeof val === "object" && !Array.isArray(val)) {
        clean[key] = sanitizeProductPayload(val);
      } else if (Array.isArray(val)) {
        clean[key] = val.slice(0, 50);
      }
    }
    return clean;
  }

  function isValidProductId(id: unknown): id is string {
    return typeof id === "string" && id.trim().length > 0 && id.length <= 128 && /^[a-zA-Z0-9_\-.]+$/.test(id);
  }

  function extractBearerAuthHeader(req: express.Request): string | null {
    const rawAuth = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
    if (rawAuth && typeof rawAuth === "string") {
      const trimmed = rawAuth.trim();
      if (/^Bearer\s+\S+/i.test(trimmed)) {
        return trimmed;
      }
    }
    const fallbackToken = Array.isArray(req.headers["x-firebase-auth"]) ? req.headers["x-firebase-auth"][0] : req.headers["x-firebase-auth"];
    if (fallbackToken && typeof fallbackToken === "string" && fallbackToken.trim()) {
      const trimmed = fallbackToken.trim();
      return /^Bearer\s+/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`;
    }
    return null;
  }

  function isLikelyValidFirebaseToken(authHeader: string): boolean {
    try {
      const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();
      const parts = rawToken.split(".");
      if (parts.length !== 3 || parts[2].length < 80) return false;
      const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
      const nowSec = Math.floor(Date.now() / 1000);
      return (
        header?.alg === "RS256" &&
        typeof header?.kid === "string" &&
        typeof payload?.iss === "string" &&
        payload.iss.startsWith("https://securetoken.google.com/") &&
        typeof payload?.sub === "string" &&
        payload.sub.length > 0 &&
        typeof payload?.exp === "number" &&
        payload.exp > (nowSec - 120)
      );
    } catch {
      return false;
    }
  }

  let cachedGooglePublicCerts: Record<string, string> | null = null;
  let cachedGooglePublicCertsExp = 0;

  async function getGoogleSecureTokenCerts(): Promise<Record<string, string> | null> {
    const now = Date.now();
    if (cachedGooglePublicCerts && now < cachedGooglePublicCertsExp) {
      return cachedGooglePublicCerts;
    }
    try {
      const certRes = await fetch(
        "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
        { signal: AbortSignal.timeout(4000) }
      );
      if (certRes.ok) {
        const json = (await certRes.json()) as Record<string, string>;
        if (json && typeof json === "object") {
          cachedGooglePublicCerts = json;
          cachedGooglePublicCertsExp = now + 30 * 60 * 1000;
          return json;
        }
      }
    } catch {
      // Fallback to cached if available
    }
    return cachedGooglePublicCerts;
  }

  interface PublisherAuthVerificationResult {
    allowed: boolean;
    status: number;
    code: string;
    message: string;
    uid?: string;
    email?: string;
    role?: "admin" | "supplier";
    verified?: boolean;
    rejected?: boolean;
  }

  const SERVER_ADMIN_EMAILS = ["enerjoo365@gmail.com", "enerjoo320@gmail.com"];
  const SERVER_EXCLUDED_ADMIN_EMAILS = [
    "eng.faressnasser@gmail.com",
    "faressnasser12@gmail.com",
    "siefsameh221@gmail.com"
  ];

  /**
   * Cryptographically verifies the Firebase ID Token and fetches the authoritative
   * user profile (`type`, `verified`, `rejected`) directly from Firestore (`users/{uid}`).
   * Never trusts role or verification flags passed in the client request body.
   */
  async function verifyAuthorizedProductPublisher(
    authHeader: string | null,
    requireAdminOnly = false
  ): Promise<PublisherAuthVerificationResult> {
    if (!authHeader) {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHORIZED",
        message: "سجّل الدخول إلى Enerjoo ثم أعد المحاولة."
      };
    }

    const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const parts = rawToken.split(".");
    if (parts.length !== 3 || parts[2].length < 80) {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHORIZED",
        message: "رمز المصادقة غير صالح. سجّل الدخول إلى Enerjoo ثم أعد المحاولة."
      };
    }

    let header: any;
    let payload: any;
    try {
      header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
      payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    } catch {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHORIZED",
        message: "رمز المصادقة تالف أو غير صالح."
      };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (
      header?.alg !== "RS256" ||
      typeof header?.kid !== "string" ||
      typeof payload?.iss !== "string" ||
      !payload.iss.startsWith("https://securetoken.google.com/") ||
      typeof payload?.sub !== "string" ||
      !payload.sub.trim() ||
      typeof payload?.exp !== "number" ||
      payload.exp <= nowSec - 120
    ) {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHORIZED",
        message: "انتهت صلاحية جلسة تسجيل الدخول أو أن الرمز غير صالح. يرجى تسجيل الدخول مرة أخرى."
      };
    }

    const tokenProjectId = payload.iss.replace("https://securetoken.google.com/", "").trim();
    if (!tokenProjectId || payload.aud !== tokenProjectId) {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHORIZED",
        message: "رمز المصادقة لا يتطابق مع مشروع Firebase المعتمد."
      };
    }

    // Verify RS256 cryptographic signature against Google's official public certificates
    const certs = await getGoogleSecureTokenCerts();
    if (certs) {
      const certPem = certs[header.kid];
      if (!certPem) {
        return {
          allowed: false,
          status: 401,
          code: "UNAUTHORIZED",
          message: "مفتاح توقيع رمز المصادقة غير معتمد."
        };
      }
      try {
        const verifier = crypto.createVerify("RSA-SHA256");
        verifier.update(`${parts[0]}.${parts[1]}`);
        verifier.end();
        const sigValid = verifier.verify(certPem, Buffer.from(parts[2], "base64url"));
        if (!sigValid) {
          return {
            allowed: false,
            status: 401,
            code: "UNAUTHORIZED",
            message: "توقيع رمز المصادقة غير صالح."
          };
        }
      } catch {
        return {
          allowed: false,
          status: 401,
          code: "UNAUTHORIZED",
          message: "فشل التحقق من توقيع رمز المصادقة."
        };
      }
    }

    const uid = payload.sub.trim();
    const tokenEmail = typeof payload.email === "string" ? payload.email.toLowerCase().trim() : "";

    // Fetch authoritative user document from Firestore (`users/{uid}`)
    const configuredProjectId =
      process.env.VITE_FIREBASE_PROJECT_ID ||
      defaultFirebaseConfig.projectId ||
      "gen-lang-client-0409057996";
    const configuredDatabaseId =
      process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      defaultFirebaseConfig.firestoreDatabaseId ||
      "ai-studio-2546f389-38ec-4b43-b0f4-5eede498569d";

    const candidateTargets: Array<{ projectId: string; databaseId: string; sendAuth: boolean }> = [
      {
        projectId: configuredProjectId,
        databaseId: configuredDatabaseId,
        sendAuth: tokenProjectId === configuredProjectId
      }
    ];
    if (tokenProjectId === configuredProjectId) {
      candidateTargets.push({
        projectId: configuredProjectId,
        databaseId: configuredDatabaseId,
        sendAuth: false
      });
    }
    if (tokenProjectId !== configuredProjectId) {
      candidateTargets.push({
        projectId: tokenProjectId,
        databaseId: configuredDatabaseId,
        sendAuth: true
      });
      candidateTargets.push({
        projectId: tokenProjectId,
        databaseId: "(default)",
        sendAuth: true
      });
    } else if (configuredDatabaseId !== "(default)") {
      candidateTargets.push({
        projectId: configuredProjectId,
        databaseId: "(default)",
        sendAuth: true
      });
    }

    let userDocFields: Record<string, any> | null = null;
    for (const collectionName of ["users", "suppliers"]) {
      if (userDocFields) break;
      for (const target of candidateTargets) {
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
          target.projectId
        )}/databases/${encodeURIComponent(target.databaseId)}/documents/${collectionName}/${encodeURIComponent(uid)}`;
        try {
          const headers: Record<string, string> = {};
          if (target.sendAuth) {
            headers["Authorization"] = `Bearer ${rawToken}`;
          }
          const fsRes = await fetch(firestoreUrl, {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(5000)
          });
          if (fsRes.ok) {
            const docJson: any = await fsRes.json();
            if (docJson && docJson.fields) {
              userDocFields = docJson.fields;
              break;
            }
          }
        } catch {
          // Continue to next candidate target if any
        }
      }
    }

    const docEmail = String(
      userDocFields?.email?.stringValue || tokenEmail || ""
    )
      .toLowerCase()
      .trim();
    const docType = String(
      userDocFields?.type?.stringValue ||
      userDocFields?.role?.stringValue ||
      ""
    )
      .toLowerCase()
      .trim();
    const docVerified =
      userDocFields?.verified?.booleanValue === true ||
      userDocFields?.verified?.stringValue === "true" ||
      userDocFields?.verified?.integerValue === "1";
    const docRejected =
      userDocFields?.rejected?.booleanValue === true ||
      userDocFields?.rejected?.stringValue === "true" ||
      userDocFields?.rejected?.integerValue === "1";

    const isExcludedAdmin = SERVER_EXCLUDED_ADMIN_EMAILS.includes(docEmail);
    const isAdmin =
      !isExcludedAdmin &&
      (SERVER_ADMIN_EMAILS.includes(docEmail) || docType === "admin");

    if (isAdmin) {
      return {
        allowed: true,
        status: 200,
        code: "OK",
        message: "Authorized admin",
        uid,
        email: docEmail,
        role: "admin",
        verified: true,
        rejected: false
      };
    }

    if (requireAdminOnly) {
      return {
        allowed: false,
        status: 403,
        code: "ADMIN_REQUIRED",
        message: "هذه العملية مخصصة لمديري منصة Enerjoo فقط."
      };
    }

    if (docType === "supplier") {
      if (docRejected) {
        return {
          allowed: false,
          status: 403,
          code: "SUPPLIER_REJECTED",
          message: "تم رفض أو تعليق حساب المورد من قبل إدارة Enerjoo. لا يمكنك إضافة أو نشر منتجات."
        };
      }
      if (!docVerified) {
        return {
          allowed: false,
          status: 403,
          code: "SUPPLIER_NOT_VERIFIED",
          message: "حسابك قيد المراجعة. يمكنك إضافة منتجاتك بعد اعتماد حسابك من إدارة Enerjoo."
        };
      }
      return {
        allowed: true,
        status: 200,
        code: "OK",
        message: "Authorized verified supplier",
        uid,
        email: docEmail,
        role: "supplier",
        verified: true,
        rejected: false
      };
    }

    return {
      allowed: false,
      status: 403,
      code: "CUSTOMER_FORBIDDEN",
      message: "هذا الحساب مسجل كعميل وليس كمورد. إضافة المنتجات وتعديلها وحذفها متاحة للموردين المعتمدين وإدارة المنصة فقط."
    };
  }

  /**
   * Resolves the authoritative owner (`supplier_id` / `supplierId` / `supplier`) of an existing product.
   */
  function extractProductSupplierOwnerId(product: any): string {
    if (!product || typeof product !== "object") return "";
    const directOwner =
      product.supplier_id ||
      product.supplierId ||
      product.supplier ||
      (Array.isArray(product.suppliers) && product.suppliers[0]?.id ? product.suppliers[0].id : "");
    if (directOwner && typeof directOwner === "string") {
      return directOwner.trim();
    }
    if (typeof product.suppliers === "string" && product.suppliers.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(product.suppliers);
        if (Array.isArray(parsed) && parsed[0]?.id) {
          return String(parsed[0].id).trim();
        }
      } catch {
        // Ignore parse error
      }
    }
    return "";
  }

  function isProductOwnedBySupplier(product: any, supplierUid: string): boolean {
    const cleanUid = String(supplierUid || "").trim();
    if (!cleanUid || !product) return false;
    const ownerId = extractProductSupplierOwnerId(product);
    if (ownerId && ownerId === cleanUid) return true;
    if (Array.isArray(product.suppliers)) {
      return product.suppliers.some((s: any) => String(s?.id || "").trim() === cleanUid);
    }
    return false;
  }

  async function findExistingProductForOwnershipCheck(productId: string): Promise<any | null> {
    const pId = String(productId || "").trim();
    if (!pId || deletedProductIds.has(pId)) return null;

    if (editedProductsMap.has(pId)) {
      return editedProductsMap.get(pId);
    }
    const foundActive = activeCatalogProducts.find(
      p => String(p.product_id) === pId || String(p.id) === pId
    );
    if (foundActive) return foundActive;

    if (liveD1ProductsCache.has(pId)) {
      return liveD1ProductsCache.get(pId);
    }

    try {
      const d1Map = await fetchAllLiveD1Products();
      if (d1Map.has(pId)) {
        return d1Map.get(pId);
      }
    } catch {
      // Ignore network error
    }

    const foundBaseline = productsData.find(p => String(p.id) === pId);
    if (foundBaseline && !deletedProductIds.has(pId)) {
      return foundBaseline;
    }

    return null;
  }

  // POST /api/products - Create a new product (requires verified Supplier or Admin)
  app.post("/api/products", async (req, res) => {
    const authHeader = extractBearerAuthHeader(req);
    const authCheck = await verifyAuthorizedProductPublisher(authHeader, false);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({
        ok: false,
        success: false,
        error: {
          code: authCheck.code,
          message: authCheck.message
        }
      });
    }

    try {
      const sanitizedBody = sanitizeProductPayload(req.body || {});
      const numericValidation = validateAndNormalizeD1ProductNumericFields(sanitizedBody, { isUpdate: false });
      if (!numericValidation.valid) {
        return res.status(400).json({
          ok: false,
          success: false,
          field: numericValidation.field,
          error: {
            code: "INVALID_NUMERIC_VALUE",
            field: numericValidation.field,
            message: numericValidation.errorMessage
          },
          message: numericValidation.errorMessage
        });
      }

      const body = numericValidation.normalizedPayload;
      const rawId = body.product_id ? String(body.product_id).trim() : "";
      const newId = isValidProductId(rawId)
        ? rawId
        : `PROD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();

      // Prevent a Supplier from overwriting an existing product belonging to another supplier via POST
      const existingProduct = await findExistingProductForOwnershipCheck(newId);
      if (existingProduct && authCheck.role === "supplier") {
        if (!isProductOwnedBySupplier(existingProduct, authCheck.uid!)) {
          return res.status(403).json({
            ok: false,
            success: false,
            error: {
              code: "PRODUCT_OWNERSHIP_FORBIDDEN",
              message: "غير مصرح لك بتعديل أو استبدال منتج تابع لمورد آخر."
            }
          });
        }
      }

      // Enforce authoritative supplier_id and verified flag on server side (never trust client-supplied supplier_id for suppliers)
      const authoritativeSupplierId =
        authCheck.role === "supplier"
          ? authCheck.uid!
          : String(body.supplier_id || body.supplierId || body.supplier || authCheck.uid || "").trim();

      const resolvedSuppliersArray = Array.isArray(body.suppliers) && body.suppliers.length > 0
        ? body.suppliers.map((s: any) => ({
            ...s,
            id: authCheck.role === "supplier" ? authoritativeSupplierId : (s?.id || authoritativeSupplierId),
            verified: true
          }))
        : [
            {
              id: authoritativeSupplierId,
              name: body.supplier_name || "Enerjoo Certified Supplier",
              nameAr: body.supplier_name_ar || "مورد معتمد",
              price: body.price_egp ?? body.price ?? 0,
              verified: true,
              lastUpdate: new Date().toISOString().split("T")[0]
            }
          ];

      const newProduct: Record<string, any> = {
        ...body,
        product_id: newId,
        model: body.model || body.name || newId,
        name: body.name || body.model || newId,
        supplier_id: authoritativeSupplierId,
        supplierId: authoritativeSupplierId,
        supplier: authoritativeSupplierId,
        suppliers: resolvedSuppliersArray,
        verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const workerPayload = {
        ...newProduct,
        specs: typeof newProduct.specs === "object" && newProduct.specs !== null
          ? JSON.stringify(newProduct.specs)
          : newProduct.specs,
        suppliers: Array.isArray(newProduct.suppliers)
          ? JSON.stringify(newProduct.suppliers)
          : newProduct.suppliers
      };

      // Forward to Cloudflare Worker with Authorization Bearer header
      try {
        let cfRes = await fetch(`${CF_WORKER_API}/products`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader!,
            "Origin": "https://enerjoo.com"
          },
          body: JSON.stringify(workerPayload),
          signal: AbortSignal.timeout(10000)
        });

        // If retrying a save with the same product_id that already exists in D1 (409 Conflict),
        // update it via PUT so retries never create duplicates or fail.
        if (cfRes.status === 409) {
          cfRes = await fetch(`${CF_WORKER_API}/products/${encodeURIComponent(newId)}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "Authorization": authHeader!,
              "Origin": "https://enerjoo.com"
            },
            body: JSON.stringify(workerPayload),
            signal: AbortSignal.timeout(10000)
          });
        }

        if (cfRes.status === 401 || cfRes.status === 403) {
          const errJson: any = await cfRes.json().catch(() => null);
          if (
            errJson?.error?.code === "SUPPLIER_NOT_VERIFIED" ||
            errJson?.error?.code === "SUPPLIER_REJECTED" ||
            errJson?.error?.code === "PRODUCT_OWNERSHIP_FORBIDDEN" ||
            errJson?.error?.code === "CUSTOMER_FORBIDDEN"
          ) {
            return res.status(403).json(errJson);
          }
        } else if (cfRes.status === 400) {
          const errJson: any = await cfRes.json().catch(() => null);
          if (errJson) {
            return res.status(400).json(errJson);
          }
        }
      } catch (cfErr) {
        console.warn("Could not push new product to Cloudflare Worker:", cfErr);
      }

      // If this ID was previously marked as deleted, unmark it
      if (deletedProductIds.has(newId)) {
        deletedProductIds.delete(newId);
        await saveDeletedProducts();
      }

      const normalizedProduct = normalizeProductRecord({ ...newProduct, _isEdited: true, _fromD1: true });

      // Add/update in local catalog without duplicating
      const existingIdx = activeCatalogProducts.findIndex(
        p => String(p.product_id) === newId || String(p.id) === newId
      );
      if (existingIdx >= 0) {
        activeCatalogProducts[existingIdx] = normalizedProduct;
      } else {
        activeCatalogProducts.unshift(normalizedProduct);
      }

      // Also persist in editedProductsMap & liveD1ProductsCache so GET /api/products immediately reflects it
      editedProductsMap.set(newId, normalizedProduct);
      await saveEditedProducts();
      liveD1ProductsCache.set(newId, { ...normalizedProduct, _fromD1: true });

      res.status(201).json({ success: true, ok: true, product_id: newId, product: normalizedProduct });
    } catch (err: any) {
      console.error("Error in POST /api/products:", err);
      res.status(500).json({ success: false, error: "Failed to create product" });
    }
  });

  // Specialized PUT & PATCH handler for /api/products/:productId (requires verified Supplier owning the product, or Admin)
  const handleUpdateProductRoute = async (req: express.Request, res: express.Response) => {
    const authHeader = extractBearerAuthHeader(req);
    const authCheck = await verifyAuthorizedProductPublisher(authHeader, false);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({
        ok: false,
        success: false,
        error: {
          code: authCheck.code,
          message: authCheck.message
        }
      });
    }

    const { productId } = req.params;
    if (!isValidProductId(productId)) {
      return res.status(400).json({ success: false, error: "Invalid productId format" });
    }

    try {
      const existing = await findExistingProductForOwnershipCheck(productId);
      if (!existing) {
        return res.status(404).json({
          ok: false,
          success: false,
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: `المنتج غير موجود: ${productId}`
          }
        });
      }

      // Strict Supplier Ownership Enforcement: Suppliers can ONLY edit products belonging to their own UID
      if (authCheck.role === "supplier") {
        if (!isProductOwnedBySupplier(existing, authCheck.uid!)) {
          return res.status(403).json({
            ok: false,
            success: false,
            error: {
              code: "PRODUCT_OWNERSHIP_FORBIDDEN",
              message: "غير مصرح لك بتعديل هذا المنتج لأنه تابع لمورد آخر."
            }
          });
        }
      }

      const sanitizedBody = sanitizeProductPayload(req.body || {});
      const numericValidation = validateAndNormalizeD1ProductNumericFields(sanitizedBody, { isUpdate: true });
      if (!numericValidation.valid) {
        return res.status(400).json({
          ok: false,
          success: false,
          field: numericValidation.field,
          error: {
            code: "INVALID_NUMERIC_VALUE",
            field: numericValidation.field,
            message: numericValidation.errorMessage
          },
          message: numericValidation.errorMessage
        });
      }

      const safeBody = numericValidation.normalizedPayload;

      // Never allow a supplier to alter product ownership (supplier_id / supplierId / supplier) during update
      const authoritativeSupplierId =
        authCheck.role === "supplier"
          ? authCheck.uid!
          : String(
              safeBody.supplier_id ||
              safeBody.supplierId ||
              safeBody.supplier ||
              extractProductSupplierOwnerId(existing) ||
              authCheck.uid ||
              ""
            ).trim();

      safeBody.supplier_id = authoritativeSupplierId;
      safeBody.supplierId = authoritativeSupplierId;
      safeBody.supplier = authoritativeSupplierId;
      if (Array.isArray(safeBody.suppliers) && authCheck.role === "supplier") {
        safeBody.suppliers = safeBody.suppliers.map((s: any) => ({
          ...s,
          id: authoritativeSupplierId
        }));
      }

      const workerUpdatePayload = {
        ...safeBody,
        specs: typeof safeBody.specs === "object" && safeBody.specs !== null
          ? JSON.stringify(safeBody.specs)
          : safeBody.specs,
        suppliers: Array.isArray(safeBody.suppliers)
          ? JSON.stringify(safeBody.suppliers)
          : safeBody.suppliers
      };

      // Forward to Cloudflare Worker with Authorization Bearer header
      try {
        const cfRes = await fetch(`${CF_WORKER_API}/products/${encodeURIComponent(productId)}`, {
          method: req.method === "PATCH" ? "PATCH" : "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader!,
            "Origin": "https://enerjoo.com"
          },
          body: JSON.stringify(workerUpdatePayload),
          signal: AbortSignal.timeout(10000)
        });
        if (cfRes.status === 400) {
          const errJson: any = await cfRes.json().catch(() => null);
          if (errJson) {
            return res.status(400).json(errJson);
          }
        }
      } catch {
        // Continue with local update
      }

      if (deletedProductIds.has(productId)) {
        deletedProductIds.delete(productId);
        await saveDeletedProducts();
      }

      const mergedPayload = {
        ...existing,
        ...safeBody,
        product_id: productId,
        id: existing.id || productId,
        supplier_id: authoritativeSupplierId,
        supplierId: authoritativeSupplierId,
        supplier: authoritativeSupplierId,
        specs: {
          ...(existing.specs || {}),
          ...(safeBody.specs || {})
        },
        updated_at: new Date().toISOString()
      };

      const normalized = normalizeProductRecord(mergedPayload);

      // Update local catalog
      const existingIdx = activeCatalogProducts.findIndex(p => String(p.product_id) === productId || String(p.id) === productId);
      if (existingIdx >= 0) {
        activeCatalogProducts[existingIdx] = normalized;
      } else {
        activeCatalogProducts.push(normalized);
      }

      // Persist in editedProductsMap
      editedProductsMap.set(productId, normalized);
      await saveEditedProducts();

      // Ensure live cache also holds the edited record so remote fetch doesn't overwrite it
      liveD1ProductsCache.set(productId, { ...normalized, _fromD1: true });

      res.json({ success: true, ok: true, product: normalized });
    } catch (err: any) {
      console.error(`Error in ${req.method} /api/products/${productId}:`, err);
      res.status(500).json({ success: false, error: "Failed to update product" });
    }
  };

  app.put("/api/products/:productId", handleUpdateProductRoute);
  app.patch("/api/products/:productId", handleUpdateProductRoute);

  // DELETE /api/products or /api/products/all (Purge all products - Admin only)
  app.delete(["/api/products", "/api/products/all"], async (req, res) => {
    const authHeader = extractBearerAuthHeader(req);
    const authCheck = await verifyAuthorizedProductPublisher(authHeader, true);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({
        ok: false,
        success: false,
        error: {
          code: authCheck.code,
          message: authCheck.message
        }
      });
    }

    try {
      try {
        await fetch(`${CF_WORKER_API}/products`, {
          method: "DELETE",
          headers: {
            "Authorization": authHeader!,
            "Origin": "https://enerjoo.com"
          },
          signal: AbortSignal.timeout(10000)
        });
      } catch (cfErr) {
        console.warn("Could not push bulk delete to Cloudflare Worker:", cfErr);
      }

      loadDeletedProducts();
      for (const p of activeCatalogProducts) {
        deletedProductIds.add(String(p.product_id || p.id));
      }
      for (const p of productsData) {
        deletedProductIds.add(String(p.id));
      }
      for (const id of liveD1ProductsCache.keys()) {
        deletedProductIds.add(id);
      }
      await saveDeletedProducts();

      editedProductsMap.clear();
      await saveEditedProducts();

      liveD1ProductsCache.clear();
      activeCatalogProducts.length = 0;

      res.json({
        success: true,
        ok: true,
        message: "تم حذف جميع المنتجات بنجاح (DELETE FROM products;)",
        deleted_count: deletedProductIds.size
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: "Failed to purge products" });
    }
  });

  // DELETE /api/products/:productId (requires verified Supplier owning the product, or Admin)
  app.delete("/api/products/:productId", async (req, res) => {
    const authHeader = extractBearerAuthHeader(req);
    const authCheck = await verifyAuthorizedProductPublisher(authHeader, false);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({
        ok: false,
        success: false,
        error: {
          code: authCheck.code,
          message: authCheck.message
        }
      });
    }

    const { productId } = req.params;
    if (!isValidProductId(productId)) {
      return res.status(400).json({ success: false, error: "Invalid productId format" });
    }
    try {
      const pId = String(productId);
      const existing = await findExistingProductForOwnershipCheck(pId);
      if (!existing) {
        return res.status(404).json({
          ok: false,
          success: false,
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: `المنتج غير موجود: ${pId}`
          }
        });
      }

      // Strict Supplier Ownership Enforcement: Suppliers can ONLY delete products belonging to their own UID
      if (authCheck.role === "supplier") {
        if (!isProductOwnedBySupplier(existing, authCheck.uid!)) {
          return res.status(403).json({
            ok: false,
            success: false,
            error: {
              code: "PRODUCT_OWNERSHIP_FORBIDDEN",
              message: "غير مصرح لك بحذف هذا المنتج لأنه تابع لمورد آخر."
            }
          });
        }
      }

      // Forward to Cloudflare Worker with Authorization Bearer header
      try {
        await fetch(`${CF_WORKER_API}/products/${encodeURIComponent(pId)}`, {
          method: "DELETE",
          headers: {
            "Authorization": authHeader!,
            "Origin": "https://enerjoo.com"
          },
          signal: AbortSignal.timeout(10000)
        });
      } catch {
        // Continue with local deletion
      }

      deletedProductIds.add(pId);
      await saveDeletedProducts();

      if (editedProductsMap.has(pId)) {
        editedProductsMap.delete(pId);
        await saveEditedProducts();
      }

      // Purge from live D1 cache immediately
      liveD1ProductsCache.delete(pId);

      const idx = activeCatalogProducts.findIndex(p => String(p.product_id) === pId || String(p.id) === pId);
      if (idx >= 0) {
        activeCatalogProducts.splice(idx, 1);
      }

      res.json({ success: true, ok: true, product_id: pId });
    } catch (err: any) {
      res.status(500).json({ success: false, error: "Failed to delete product" });
    }
  });

  // =========================================================================
  // ENERJOO INVERTER CLASSIFICATION & AI AGENT (n8n) SINGLE SOURCE OF TRUTH
  // =========================================================================

  /**
   * Helper to fetch and classify all inverters from the primary database
   */
  async function fetchAllStructuredInverters(): Promise<StructuredInverter[]> {
    try {
      const invertersMap = new Map<string, any>();

      // 1. Seed from active catalog
      for (const p of getActiveCatalogProducts()) {
        const cat = (p.category || p.product_category || '').toLowerCase();
        if (cat.includes('invert')) {
          invertersMap.set(String(p.product_id || p.id), p);
        }
      }

      // 2. Overlay ALL live products from Cloudflare Worker D1
      try {
        const d1Map = await fetchAllLiveD1Products();
        for (const [id, p] of d1Map.entries()) {
          if (!deletedProductIds.has(id)) {
            const cat = (p.category || p.product_category || '').toLowerCase();
            if (cat.includes('invert') || !cat) {
              const existing = invertersMap.get(id) || {};
              invertersMap.set(id, normalizeProductRecord({ ...existing, ...p, _fromD1: true }));
            }
          }
        }
      } catch (cfErr) {
        console.warn("Could not fetch remote inverters, using active catalog baseline:", cfErr);
      }

      const rawInverters = Array.from(invertersMap.values()).filter(p => !deletedProductIds.has(String(p.product_id || p.id)));
      return rawInverters.map(classifyInverter);
    } catch (err) {
      console.warn("Failed to fetch raw inverters from Cloudflare D1:", err);
      return getActiveCatalogProducts()
        .filter((p: any) => !deletedProductIds.has(String(p.product_id || p.id)) && (p.category || p.product_category || '').toLowerCase().includes('invert'))
        .map(classifyInverter);
    }
  }

  /**
   * OpenAPI / JSON Schema definition of StructuredInverter and matching tool
   * for n8n HTTP Request Tool Node & LLM Agents
   */
  app.get("/api/v1/inverters/schema", (req, res) => {
    res.json({
      name: "enerjoo_inverter_catalog",
      description: "Structured Inverter Database and AI Sales Recommendation Agent for Enerjoo Egypt. Real catalog Single Source of Truth with strict deterministic filtering, comparison matrix, best match, alternatives, best value, and zero hallucinations.",
      catalog_source: "Enerjoo Cloudflare D1 Catalog",
      inverter_types: INVERTER_MAIN_TYPES,
      phases: INVERTER_PHASES,
      applications: INVERTER_APPLICATIONS,
      power_ranges: INVERTER_POWER_RANGES,
      endpoints: {
        match_and_recommend: {
          method: "POST",
          endpoint: "/api/v1/inverters/match",
          description: "Full AI sales & product recommendation engine. Returns Best Match, Alternative, Best Value, Comparison Table, and Arabic conversational pitch.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Customer natural language request in Arabic or English, e.g. 'عايز انفرتر 100 كيلو 3 فاز On-Grid لمصنع' or 'عايز Hybrid 10 كيلو للبيت مع بطارية'"
              },
              type: {
                type: "string",
                enum: INVERTER_MAIN_TYPES,
                description: "Strict inverter type: 'On-Grid', 'Hybrid', 'Off-Grid', or 'Pump Inverter'. No microinverters."
              },
              rated_power_kw: {
                type: "number",
                description: "Exact nominal AC power in kW (e.g. 100, 50, 15, 10, 5)."
              },
              phase: {
                type: "string",
                enum: INVERTER_PHASES,
                description: "'Single Phase' or 'Three Phase'."
              },
              application: {
                type: "string",
                enum: INVERTER_APPLICATIONS,
                description: "'Residential', 'Commercial', 'Industrial', 'Agricultural', or 'Solar Pumping'."
              },
              battery_required: {
                type: "boolean",
                description: "Whether the system requires energy storage battery support."
              },
              limit: {
                type: "integer",
                default: 5,
                description: "Max number of ranked recommendations to return."
              }
            }
          }
        },
        compare: {
          method: "POST",
          endpoint: "/api/v1/inverters/compare",
          description: "Compare 2 or 3 inverters from catalog side by side on power, phase, efficiency, MPPT, price, and battery support.",
          parameters: {
            type: "object",
            properties: {
              product_ids: {
                type: "array",
                items: { type: "string" },
                description: "List of real Enerjoo product IDs to compare (e.g. ['PROD-1790087344818-P6QHP', 'PROD-1790086478120-XPQMN'])"
              },
              query: {
                type: "string",
                description: "Comparison query in natural language, e.g. 'إيه الفرق بين Huawei 100kW و Huawei 50kW؟'"
              }
            }
          }
        },
        list_all: {
          method: "GET",
          endpoint: "/api/v1/inverters",
          description: "List and filter all structured inverters from Enerjoo catalog."
        }
      }
    });
  });

  /**
   * AI Sales & Matching Endpoint for n8n AI Agent and Enerjoo Solar Advisor
   * Translates customer natural language or structured criteria into verified catalog recommendations
   * Flow: Understand -> Search -> Filter -> Compare -> Differentiate -> Rank -> Recommend -> Explain -> Real IDs
   */
  app.post("/api/v1/inverters/match", async (req, res) => {
    try {
      const { query, limit = 5 } = req.body;
      let criteria: InverterQueryCriteria = {};

      if (query && typeof query === "string" && query.trim()) {
        criteria = parseInverterQuery(query.trim());
      }

      // Explicit parameters override parsed query values
      if (req.body.type && INVERTER_MAIN_TYPES.includes(req.body.type)) {
        criteria.type = req.body.type;
      }
      if (req.body.rated_power_kw && !isNaN(Number(req.body.rated_power_kw))) {
        criteria.rated_power_kw = Number(req.body.rated_power_kw);
      }
      if (req.body.phase && INVERTER_PHASES.includes(req.body.phase)) {
        criteria.phase = req.body.phase;
      }
      if (req.body.application && INVERTER_APPLICATIONS.includes(req.body.application)) {
        criteria.application = req.body.application;
      }
      if (typeof req.body.battery_required === "boolean") {
        criteria.battery_required = req.body.battery_required;
      }

      const allInverters = await fetchAllStructuredInverters();
      const agentRec = buildAgentInverterRecommendation(allInverters, criteria, query);

      const maxLimit = Math.min(Math.max(1, Number(limit) || 5), 25);
      const topMatches = agentRec.all_compatible_matches.slice(0, maxLimit);

      res.json({
        success: true,
        catalog_source: "Enerjoo",
        criteria,
        exact_match_found: agentRec.exact_match_found,
        summary_ar: agentRec.summary_ar,
        summary_en: agentRec.summary_en,
        best_match: agentRec.best_match,
        alternative: agentRec.alternative,
        best_value: agentRec.best_value,
        comparison_table: agentRec.comparison_table,
        comparison_analysis_ar: agentRec.comparison_analysis_ar,
        comparison_analysis_en: agentRec.comparison_analysis_en,
        conversational_response_ar: agentRec.conversational_response_ar,
        conversational_response_en: agentRec.conversational_response_en,
        total_catalog_inverters: allInverters.length,
        compatible_count: agentRec.all_compatible_count,
        results_count: topMatches.length,
        top_matches: topMatches,
        closest_alternatives: agentRec.closest_alternatives
      });
    } catch (err: any) {
      console.error("Error in /api/v1/inverters/match:", err);
      res.status(500).json({ success: false, error: err?.message || "Internal matching error" });
    }
  });

  /**
   * Dedicated Conversational Agent Endpoint for n8n AI Agent and Website
   */
  app.post("/api/v1/agent/recommend", async (req, res) => {
    try {
      const { query, prompt, chatInput } = req.body;
      const userText = (query || prompt || chatInput || "").trim();

      const criteria = parseInverterQuery(userText);
      if (req.body.type && INVERTER_MAIN_TYPES.includes(req.body.type)) {
        criteria.type = req.body.type;
      }
      if (req.body.rated_power_kw && !isNaN(Number(req.body.rated_power_kw))) {
        criteria.rated_power_kw = Number(req.body.rated_power_kw);
      }
      if (req.body.phase && INVERTER_PHASES.includes(req.body.phase)) {
        criteria.phase = req.body.phase;
      }
      if (req.body.application && INVERTER_APPLICATIONS.includes(req.body.application)) {
        criteria.application = req.body.application;
      }
      if (typeof req.body.battery_required === "boolean") {
        criteria.battery_required = req.body.battery_required;
      }

      const allInverters = await fetchAllStructuredInverters();
      const agentRec = buildAgentInverterRecommendation(allInverters, criteria, userText);

      res.json(agentRec);
    } catch (err: any) {
      console.error("Error in /api/v1/agent/recommend:", err);
      res.status(500).json({ success: false, error: err?.message || "Recommendation error" });
    }
  });

  /**
   * Dedicated Inverter Comparison Endpoint
   * Compares 2 or 3 inverters from catalog by product_id or search query
   */
  app.post("/api/v1/inverters/compare", async (req, res) => {
    try {
      const { product_ids, query } = req.body;
      const allInverters = await fetchAllStructuredInverters();
      let selectedInverters: StructuredInverter[] = [];

      if (Array.isArray(product_ids) && product_ids.length > 0) {
        selectedInverters = allInverters.filter(i => product_ids.map(String).includes(String(i.id)));
      } else if (query && typeof query === "string") {
        const q = query.toLowerCase();
        // Match inverters mentioned in query
        selectedInverters = allInverters.filter(i => {
          const matchTerms = [
            i.model.toLowerCase(),
            i.brand.toLowerCase(),
            `${i.rated_power_kw}kw`,
            `${i.rated_power_kw} kw`,
            `${i.rated_power_kw} كيلو`
          ];
          return matchTerms.some(term => q.includes(term));
        }).slice(0, 3);
      }

      if (selectedInverters.length < 2) {
        // Fallback: pick the first 2 or 3 available inverters if insufficient specified
        selectedInverters = allInverters.slice(0, 2);
      }

      const table = buildInverterComparisonTable(
        selectedInverters[0], 
        selectedInverters[1], 
        selectedInverters[2]
      );

      // Generate differentiator explanation
      const diffs: string[] = [];
      const invA = selectedInverters[0];
      const invB = selectedInverters[1];

      if (invA.rated_power_kw !== invB.rated_power_kw) {
        const diffP = invA.rated_power_kw - invB.rated_power_kw;
        diffs.push(`القدرة: ${invA.brand} ${invA.model} (${invA.rated_power_kw} kW) ${diffP > 0 ? 'أعلى' : 'أقل'} من ${invB.brand} ${invB.model} (${invB.rated_power_kw} kW) بفارق ${Math.abs(diffP)} kW.`);
      }
      if (typeof invA.efficiency_percent === 'number' && typeof invB.efficiency_percent === 'number') {
        const diffE = (invA.efficiency_percent - invB.efficiency_percent).toFixed(1);
        diffs.push(`الكفاءة: ${invA.model} بكفاءة (${invA.efficiency_percent}%) مقابل (${invB.efficiency_percent}%) لـ ${invB.model} (فارق ${diffE}%).`);
      }
      if (invA.phase !== invB.phase) {
        diffs.push(`الطور: ${invA.model} يدعم (${invA.phase}) بينما ${invB.model} يدعم (${invB.phase}).`);
      }
      if (invA.price > 0 && invB.price > 0) {
        const diffPrice = invA.price - invB.price;
        diffs.push(`السعر: فارق السعر بينهما حوالي ${Math.abs(diffPrice).toLocaleString('ar-EG')} ج.م (${diffPrice < 0 ? invA.model + ' أوفر' : invB.model + ' أوفر'}).`);
      }

      res.json({
        success: true,
        catalog_source: "Enerjoo",
        products_compared: selectedInverters.map(i => ({
          product_id: i.id,
          brand: i.brand,
          model: i.model,
          rated_power_kw: i.rated_power_kw,
          price: i.price,
          availability: i.availability,
          product_url: `/product/${i.id}`
        })),
        comparison_table: table,
        differentiator_analysis_ar: diffs.join(' • '),
        differentiator_analysis_en: diffs.join(' • ')
      });
    } catch (err: any) {
      console.error("Error in /api/v1/inverters/compare:", err);
      res.status(500).json({ success: false, error: err?.message || "Comparison error" });
    }
  });

  /**
   * Get single structured inverter by ID
   */
  app.get("/api/v1/inverters/:productId", async (req, res) => {
    const { productId } = req.params;
    try {
      const getRes = await fetch(`${CF_WORKER_API}/products/${encodeURIComponent(productId)}`);
      if (!getRes.ok) {
        return res.status(404).json({ success: false, error: "Inverter not found" });
      }
      const data = await getRes.json();
      if (!data || !data.product) {
        return res.status(404).json({ success: false, error: "Inverter not found" });
      }
      const structured = classifyInverter(data.product);
      res.json({ success: true, inverter: structured });
    } catch (err: any) {
      console.error(`Error in /api/v1/inverters/${productId}:`, err);
      res.status(500).json({ success: false, error: err?.message || "Server error" });
    }
  });

  /**
   * List all structured inverters with filtering support
   * Single Source of Truth for Website Filters & External AI
   */
  app.get("/api/v1/inverters", async (req, res) => {
    try {
      const allInverters = await fetchAllStructuredInverters();
      const { 
        type, 
        phase, 
        application, 
        power_range, 
        min_power, 
        max_power, 
        battery_support, 
        brand, 
        search 
      } = req.query;

      let filtered = allInverters;

      if (type && type !== "all") {
        filtered = filtered.filter(i => i.type.toLowerCase() === String(type).toLowerCase());
      }
      if (phase && phase !== "all") {
        filtered = filtered.filter(i => i.phase.toLowerCase() === String(phase).toLowerCase());
      }
      if (application && application !== "all") {
        filtered = filtered.filter(i => i.application.some(a => a.toLowerCase() === String(application).toLowerCase()));
      }
      if (power_range && power_range !== "all") {
        filtered = filtered.filter(i => i.power_range === String(power_range));
      }
      if (min_power && !isNaN(Number(min_power))) {
        filtered = filtered.filter(i => i.rated_power_kw >= Number(min_power));
      }
      if (max_power && !isNaN(Number(max_power))) {
        filtered = filtered.filter(i => i.rated_power_kw <= Number(max_power));
      }
      if (battery_support !== undefined && battery_support !== "all") {
        const boolVal = String(battery_support) === "true";
        filtered = filtered.filter(i => i.battery_support === boolVal);
      }
      if (brand && brand !== "all") {
        filtered = filtered.filter(i => i.brand.toLowerCase().includes(String(brand).toLowerCase()));
      }
      if (search && typeof search === "string" && search.trim()) {
        const s = search.toLowerCase().trim();
        filtered = filtered.filter(i => 
          i.name.toLowerCase().includes(s) ||
          i.model.toLowerCase().includes(s) ||
          i.brand.toLowerCase().includes(s) ||
          (i.notes && i.notes.toLowerCase().includes(s))
        );
      }

      res.json({
        success: true,
        count: filtered.length,
        total_in_catalog: allInverters.length,
        inverters: filtered
      });
    } catch (err: any) {
      console.error("Error in /api/v1/inverters:", err);
      res.status(500).json({ success: false, error: err?.message || "Server error" });
    }
  });

  // Centralized Solar Panel Energy Exchange Endpoints (Cloudflare D1 SSoT + Google AI Studio Preview Fallback)
  const RANGES_PREVIEW_FILE = path.join(process.cwd(), "energy-exchange-ranges.json");

  const APPROVED_EXCHANGE_BRANDS = [
    "Jinko",
    "LONGi Solar",
    "AIKO",
    "Trina Solar",
    "JA Solar",
    "Risen",
    "GCL",
    "Suntech",
    "Astronergy",
    "Gokin",
    "Quantum Solar",
    "Ulica Solar",
    "ZNShine Solar",
    "Jet Solar",
  ] as const;

  function resolveApprovedExchangeBrand(rawBrand?: string): { valid: boolean; brand?: string; error?: string } {
    const trimmed = (rawBrand || "").trim();
    if (!trimmed) {
      return { valid: false, error: "اسم العلامة التجارية مطلوب." };
    }
    if (trimmed.toLowerCase() === "gate solar" || trimmed.toLowerCase() === "gatesolar") {
      return { valid: false, error: "العلامة التجارية غير معتمدة. الاسم الصحيح هو Jet Solar." };
    }
    const canonical = APPROVED_EXCHANGE_BRANDS.find((b) => b.toLowerCase() === trimmed.toLowerCase());
    if (!canonical) {
      return {
        valid: false,
        error: `العلامة التجارية "${trimmed}" غير مدرجة ضمن الماركات الـ 14 المعتمدة في بورصة الطاقة.`,
      };
    }
    return { valid: true, brand: canonical };
  }

  // Determine strictly if current runtime is Google AI Studio Preview environment (never active in production)
  function isGoogleAiStudioPreviewEnvironment(): boolean {
    if (process.env.NODE_ENV === "production" && !process.env.APPLET_ID && !process.env.GOOGLE_RUNTIME) {
      return false;
    }
    return Boolean(
      process.env.APPLET_ID ||
        process.env.GOOGLE_RUNTIME ||
        (process.env.APP_URL && process.env.APP_URL.includes(".run.app")) ||
        process.env.NODE_ENV === "development"
    );
  }

  interface EnergyExchangePreviewRecord {
    price_id: string;
    category: string;
    brand: string;
    product_type?: string;
    price_per_watt: number;
    currency: string;
    min_wattage?: number | null;
    max_wattage?: number | null;
    is_active?: number;
    effective_date?: string;
    updated_at?: string;
    updated_by?: string;
  }

  // Mutex queue to guarantee atomic sequential writes during concurrent preview requests
  let previewFileWriteLock = Promise.resolve();

  function loadPreviewRangesFromFile(): EnergyExchangePreviewRecord[] {
    try {
      if (fs.existsSync(RANGES_PREVIEW_FILE)) {
        const raw = fs.readFileSync(RANGES_PREVIEW_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((r) => r && typeof r.brand === "string" && r.brand.trim().toLowerCase() !== "gate solar")
            .map((r) => ({
              ...r,
              is_active: r.is_active === undefined || r.is_active === null ? 1 : Number(r.is_active) === 0 ? 0 : 1,
            }));
        }
      }
    } catch (e) {
      console.warn("Could not load energy-exchange-ranges.json:", e);
    }
    return [];
  }

  function computePreviewLastUpdatedAt(records: EnergyExchangePreviewRecord[]): string | null {
    let latestMs = 0;
    let latestStr: string | null = null;
    for (const r of records) {
      if (!r?.updated_at) continue;
      const ms = Date.parse(r.updated_at);
      if (!isNaN(ms) && ms > latestMs) {
        latestMs = ms;
        latestStr = r.updated_at;
      }
    }
    return latestStr;
  }

  function getExchangePricesMap(): Record<string, number> {
    if (!isGoogleAiStudioPreviewEnvironment()) return {};
    const records = loadPreviewRangesFromFile();
    const map: Record<string, number> = {};
    for (const r of records) {
      if (r.is_active === 0) continue;
      if (r.brand && typeof r.price_per_watt === "number" && r.price_per_watt > 0 && map[r.brand] === undefined) {
        map[r.brand] = r.price_per_watt;
      }
    }
    return map;
  }

  async function atomicSavePreviewRangesToFile(records: EnergyExchangePreviewRecord[]): Promise<void> {
    previewFileWriteLock = previewFileWriteLock
      .then(() => {
        const tempPath = `${RANGES_PREVIEW_FILE}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const payload = JSON.stringify(records, null, 2);
        fs.writeFileSync(tempPath, payload, "utf-8");
        fs.renameSync(tempPath, RANGES_PREVIEW_FILE);
      })
      .catch((err) => {
        console.error("Atomic write error in energy-exchange-ranges.json:", err);
        throw err;
      });
    return previewFileWriteLock;
  }

  // Authoritative server-side admin check relying purely on cryptographic Firebase token verification
  async function isEnergyExchangeAdminAuthorizedServer(
    req: express.Request
  ): Promise<{ authorized: boolean; status: number; code: string; email?: string; message?: string }> {
    const authHeader = extractBearerAuthHeader(req);
    if (!authHeader) {
      return {
        authorized: false,
        status: 401,
        code: "UNAUTHORIZED",
        message: "رمز المصادقة مطلوب. سجّل الدخول بحساب مسؤول ثم أعد المحاولة.",
      };
    }

    const authRes = await verifyAuthorizedProductPublisher(authHeader, true);
    if (!authRes.allowed || authRes.role !== "admin") {
      return {
        authorized: false,
        status: authRes.status || 403,
        code: authRes.code || "FORBIDDEN",
        message: authRes.message || "عذراً، تعديل بورصة الطاقة مخصص للمسؤولين المعتمدين فقط.",
      };
    }

    return { authorized: true, status: 200, code: "OK", email: authRes.email || "admin" };
  }

  // GET /api/energy-exchange, /api/energy-exchange/prices, /api/energy-exchange/ranges
  app.get(["/api/energy-exchange", "/api/energy-exchange/prices", "/api/energy-exchange/ranges", "/energy-exchange/prices"], async (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    // 1. Attempt reading from remote Cloudflare Worker D1 (Single Source of Truth)
    let isWorker404 = false;
    try {
      const cfRes = await fetch(`${CF_WORKER_API}/energy-exchange/prices`, {
        signal: AbortSignal.timeout(4000),
      });

      if (cfRes.ok) {
        const cfData: any = await cfRes.json();
        return res.json({
          ...cfData,
          source: "cloudflare-d1",
          is_preview: false,
        });
      }

      if (cfRes.status === 404) {
        isWorker404 = true;
      } else {
        const text = await cfRes.text();
        return res.status(cfRes.status).set("Content-Type", cfRes.headers.get("content-type") || "application/json").send(text);
      }
    } catch {
      // Never silently serve local JSON when Worker network request fails
      return res.status(503).json({
        success: false,
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "تعذر الاتصال بخادم بورصة الطاقة السحابي (Cloudflare D1). يرجى المحاولة مرة أخرى.",
        },
      });
    }

    // 2. Local Preview Fallback strictly upon confirmed Worker 404 inside AI Studio Preview
    if (!isWorker404 || !isGoogleAiStudioPreviewEnvironment()) {
      return res.status(503).json({
        success: false,
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "مسار بورصة الطاقة السحابي غير متاح، والـ Local Fallback مخصص لبيئة المعاينة فقط.",
        },
      });
    }

    const localRecords = loadPreviewRangesFromFile();
    const pricesMap: Record<string, number> = {};
    for (const r of localRecords) {
      if (r.is_active === 0) continue;
      if (r.brand && typeof r.price_per_watt === "number" && r.price_per_watt > 0) {
        if (pricesMap[r.brand] === undefined) {
          pricesMap[r.brand] = r.price_per_watt;
        }
      }
    }

    const lastUpdatedAt = computePreviewLastUpdatedAt(localRecords);

    return res.json({
      success: true,
      ok: true,
      count: localRecords.length,
      approved_brands: APPROVED_EXCHANGE_BRANDS,
      prices: pricesMap,
      data: localRecords,
      records: localRecords,
      last_updated_at: lastUpdatedAt,
      source: "preview-local",
      is_preview: true,
    });
  });

  // GET /api/energy-exchange/prices/:id, /api/energy-exchange/ranges/:id
  app.get(["/api/energy-exchange/prices/:id", "/api/energy-exchange/ranges/:id"], async (req, res) => {
    const targetId = req.params.id;
    let isWorker404 = false;
    try {
      const cfRes = await fetch(`${CF_WORKER_API}/energy-exchange/prices/${encodeURIComponent(targetId)}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (cfRes.ok) {
        const cfData: any = await cfRes.json();
        return res.json({ ...cfData, source: "cloudflare-d1", is_preview: false });
      }
      if (cfRes.status === 404) {
        isWorker404 = true;
      } else {
        const text = await cfRes.text();
        return res.status(cfRes.status).set("Content-Type", cfRes.headers.get("content-type") || "application/json").send(text);
      }
    } catch {
      return res.status(503).json({
        success: false,
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "تعذر الاتصال بخادم بورصة الطاقة السحابي." },
      });
    }

    if (!isWorker404 || !isGoogleAiStudioPreviewEnvironment()) {
      return res.status(404).json({ success: false, ok: false, error: { code: "NOT_FOUND", message: "Price record not found" } });
    }

    const localRecords = loadPreviewRangesFromFile();
    const match = localRecords.find((r) => r.price_id === targetId || r.brand.toLowerCase() === decodeURIComponent(targetId).toLowerCase());
    if (!match) {
      return res.status(404).json({ success: false, ok: false, error: { code: "NOT_FOUND", message: "Price record not found" } });
    }
    return res.json({ success: true, ok: true, price: match, data: match, source: "preview-local", is_preview: true });
  });

  // PUT / PATCH /api/energy-exchange/brands/:brand (Atomic Brand Range Sync & Activation Toggle)
  app.all("/api/energy-exchange/brands/:brand", async (req, res) => {
    try {
      const method = req.method.toUpperCase();
      if (method !== "PUT" && method !== "PATCH") {
        return res.status(405).json({ success: false, ok: false, error: `Method ${method} not allowed` });
      }

      const rawBrandParam = decodeURIComponent(req.params.brand || "");
      const authCheck = await isEnergyExchangeAdminAuthorizedServer(req);
      if (!authCheck.authorized) {
        return res.status(authCheck.status).json({
          success: false,
          ok: false,
          error: { code: authCheck.code, message: authCheck.message },
        });
      }

      // 1. Try remote Cloudflare Worker
      let isWorker404 = false;
      const authHeader = extractBearerAuthHeader(req);
      try {
        const cfRes = await fetch(`${CF_WORKER_API}/energy-exchange/brands/${encodeURIComponent(rawBrandParam)}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            Origin: "https://enerjoo.com",
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify(req.body || {}),
          signal: AbortSignal.timeout(5000),
        });

        if (cfRes.status === 404) {
          isWorker404 = true;
        } else {
          const text = await cfRes.text();
          return res.status(cfRes.status).set("Content-Type", cfRes.headers.get("content-type") || "application/json").send(text);
        }
      } catch {
        return res.status(503).json({
          success: false,
          ok: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "تعذر الاتصال بالخادم السحابي (مهلة زمنية أو انقطاع شبكة). لم يتم تنفيذ التحديث لتجنب تعارض البيانات.",
          },
        });
      }

      if (!isWorker404 || !isGoogleAiStudioPreviewEnvironment()) {
        return res.status(503).json({
          success: false,
          ok: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "مسار تحديث العلامة السحابي غير متاح." },
        });
      }

      const brandRes = resolveApprovedExchangeBrand(rawBrandParam);
      if (!brandRes.valid || !brandRes.brand) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: "INVALID_BRAND", message: brandRes.error },
        });
      }
      const canonicalBrand = brandRes.brand;
      const body = req.body || {};

      // Preview Mode 1: Activation Toggle (PATCH without ranges)
      if (method === "PATCH" && !Array.isArray(body.ranges)) {
        if (body.is_active === undefined && body.isActive === undefined) {
          return res.status(400).json({ success: false, ok: false, error: { code: "MISSING_ACTIVE", message: "Missing is_active boolean flag" } });
        }
        const activeFlag = body.is_active === false || body.is_active === 0 || body.isActive === false ? 0 : 1;
        const records = loadPreviewRangesFromFile();
        const matching = records.filter((r) => r.brand.toLowerCase() === canonicalBrand.toLowerCase());
        if (matching.length === 0) {
          return res.status(400).json({
            success: false,
            ok: false,
            error: {
              code: "BRAND_UNCONFIGURED",
              message: `لا يمكن تغيير حالة التفعيل قبل إضافة نطاق قدرة واحد على الأقل لعلامة ${canonicalBrand}.`,
            },
          });
        }
        const nowIso = new Date().toISOString();
        for (const r of matching) {
          r.is_active = activeFlag;
          r.updated_at = nowIso;
          r.updated_by = authCheck.email || "admin";
        }
        await atomicSavePreviewRangesToFile(records);
        return res.json({
          success: true,
          ok: true,
          message: activeFlag === 1 ? `تم تفعيل علامة ${canonicalBrand} (معاينة)` : `تم إيقاف علامة ${canonicalBrand} مؤقتاً (معاينة)`,
          brand: canonicalBrand,
          is_active: activeFlag,
          source: "preview-local",
          is_preview: true,
        });
      }

      // Preview Mode 2: Atomic Range Replacement
      const rawRanges = body.ranges;
      if (!Array.isArray(rawRanges) || rawRanges.length < 1) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: "MIN_RANGE_REQUIRED", message: "يجب تحديد نطاق قدرة واحد على الأقل للعلامة التجارية." },
        });
      }
      if (rawRanges.length > 3) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: "MAX_RANGES_EXCEEDED", message: `الحد الأقصى للنطاقات هو 3 نطاقات لكل علامة تجارية (${canonicalBrand}).` },
        });
      }

      const nowIso = new Date().toISOString();
      const todayDate = nowIso.split("T")[0];
      const activeFlag = body.is_active === false || body.is_active === 0 || body.isActive === false ? 0 : 1;
      const cleanBrand = canonicalBrand.toUpperCase().replace(/[^A-Z0-9]/g, "_");
      const newBrandRecords: EnergyExchangePreviewRecord[] = [];
      const seenIds = new Set<string>();

      for (let i = 0; i < rawRanges.length; i++) {
        const item = rawRanges[i] || {};
        const minW = Number(item.min_wattage ?? item.minWattage);
        const maxW = Number(item.max_wattage ?? item.maxWattage);
        const rawPrice = Number(item.price_per_watt ?? item.pricePerWatt);

        if (!Number.isInteger(minW) || minW <= 0 || !Number.isInteger(maxW) || minW >= maxW) {
          return res.status(400).json({
            success: false,
            ok: false,
            error: {
              code: "INVALID_RANGE",
              message: `النطاق ${i + 1}: يجب أن يكون الحد الأدنى رقماً صحيحاً > 0 وأقل تماماً من الحد الأقصى.`,
            },
          });
        }
        if (!Number.isFinite(rawPrice) || rawPrice <= 0 || rawPrice > 200) {
          return res.status(400).json({
            success: false,
            ok: false,
            error: {
              code: "INVALID_PRICE",
              message: `النطاق ${i + 1}: يرجى إدخال سعر وات صحيح بين 0.1 و 200 ج.م.`,
            },
          });
        }

        let priceId = `RANGE_${cleanBrand}_${minW}_${maxW}`;
        if (seenIds.has(priceId)) priceId = `${priceId}_${i + 1}`;
        seenIds.add(priceId);

        newBrandRecords.push({
          price_id: priceId,
          category: "panels",
          brand: canonicalBrand,
          product_type: "Solar Panel",
          price_per_watt: parseFloat(rawPrice.toFixed(2)),
          currency: "EGP",
          min_wattage: minW,
          max_wattage: maxW,
          is_active: activeFlag,
          effective_date: todayDate,
          updated_at: nowIso,
          updated_by: authCheck.email || "admin",
        });
      }

      for (let i = 0; i < newBrandRecords.length; i++) {
        for (let j = i + 1; j < newBrandRecords.length; j++) {
          const a = newBrandRecords[i];
          const b = newBrandRecords[j];
          if (a.min_wattage! <= b.max_wattage! && a.max_wattage! >= b.min_wattage!) {
            return res.status(409).json({
              success: false,
              ok: false,
              error: {
                code: "RANGE_OVERLAP",
                message: `تعذر الحفظ: نطاق القدرة (${a.min_wattage} - ${a.max_wattage} وات) يتداخل مع النطاق (${b.min_wattage} - ${b.max_wattage} وات) لماركة ${canonicalBrand}.`,
              },
            });
          }
        }
      }

      const existingAll = loadPreviewRangesFromFile();
      const filteredOthers = existingAll.filter((r) => r.brand.toLowerCase() !== canonicalBrand.toLowerCase());
      const updatedAll = [...filteredOthers, ...newBrandRecords];
      await atomicSavePreviewRangesToFile(updatedAll);

      return res.json({
        success: true,
        ok: true,
        message: `تم حفظ نطاقات وأسعار علامة ${canonicalBrand} بنجاح (معاينة)`,
        brand: canonicalBrand,
        is_active: activeFlag,
        count: newBrandRecords.length,
        ranges: newBrandRecords,
        source: "preview-local",
        is_preview: true,
      });
    } catch (err: any) {
      console.error("Error in /api/energy-exchange/brands/:brand:", err);
      res.status(500).json({ success: false, error: "Failed to sync brand ranges" });
    }
  });

  // DELETE /api/energy-exchange/prices/:id, /api/energy-exchange/ranges/:id
  app.delete(["/api/energy-exchange/prices/:id", "/api/energy-exchange/ranges/:id", "/api/energy-exchange/:id"], async (req, res) => {
    try {
      const targetId = req.params.id;

      // Authoritative Admin RBAC check
      const authCheck = await isEnergyExchangeAdminAuthorizedServer(req);
      if (!authCheck.authorized) {
        return res.status(authCheck.status).json({
          success: false,
          ok: false,
          error: { code: authCheck.code, message: authCheck.message },
        });
      }

      // 1. Try remote Cloudflare Worker
      let isWorker404 = false;
      const authHeader = extractBearerAuthHeader(req);
      try {
        const cfRes = await fetch(`${CF_WORKER_API}/energy-exchange/prices/${encodeURIComponent(targetId)}`, {
          method: "DELETE",
          headers: {
            Origin: "https://enerjoo.com",
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          signal: AbortSignal.timeout(5000),
        });

        if (cfRes.status === 404) {
          isWorker404 = true;
        } else {
          const data = await cfRes.text();
          return res.status(cfRes.status).set("Content-Type", cfRes.headers.get("content-type") || "application/json").send(data);
        }
      } catch {
        return res.status(503).json({
          success: false,
          ok: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "تعذر الاتصال بالخادم السحابي (مهلة زمنية أو انقطاع شبكة). لم يتم تنفيذ الحذف لتجنب تعارض البيانات.",
          },
        });
      }

      // 2. Local Preview Fallback strictly upon confirmed Worker 404
      if (!isWorker404 || !isGoogleAiStudioPreviewEnvironment()) {
        return res.status(503).json({
          success: false,
          ok: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "مسار الحذف السحابي غير متاح، والـ Fallback مخصص للمعاينة فقط." },
        });
      }

      const records = loadPreviewRangesFromFile();
      const targetIndex = records.findIndex((r) => r.price_id === targetId);
      if (targetIndex === -1) {
        return res.json({
          success: true,
          ok: true,
          message: "السجل غير موجود أو تم حذفه سابقاً",
          deleted_id: targetId,
          source: "preview-local",
          is_preview: true,
        });
      }

      const targetBrand = records[targetIndex].brand;
      const brandRemainingRanges = records.filter((r) => r.brand.toLowerCase() === targetBrand.toLowerCase());

      if (brandRemainingRanges.length <= 1) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: {
            code: "MIN_RANGE_REQUIRED",
            message: `لا يمكن حذف النطاق الوحيد لماركة ${targetBrand}. النطاق الأول إجباري، ويمكنك تعديله أو إيقاف تفعيل البرند.`,
          },
        });
      }

      records.splice(targetIndex, 1);
      await atomicSavePreviewRangesToFile(records);

      return res.json({
        success: true,
        ok: true,
        message: "تم حذف النطاق بنجاح من بورصة الطاقة (معاينة)",
        deleted_id: targetId,
        brand: targetBrand,
        source: "preview-local",
        is_preview: true,
      });
    } catch (err: any) {
      console.error("Error in DELETE /api/energy-exchange/prices/:id:", err);
      res.status(500).json({ success: false, error: "Failed to delete exchange record" });
    }
  });

  // PUT /api/energy-exchange/prices/:id, /api/energy-exchange/ranges/:id
  app.put(["/api/energy-exchange/prices/:id", "/api/energy-exchange/ranges/:id", "/api/energy-exchange/:id"], async (req, res) => {
    try {
      const targetId = req.params.id;

      // Authoritative Admin RBAC check
      const authCheck = await isEnergyExchangeAdminAuthorizedServer(req);
      if (!authCheck.authorized) {
        return res.status(authCheck.status).json({
          success: false,
          ok: false,
          error: { code: authCheck.code, message: authCheck.message },
        });
      }

      const { price_per_watt, pricePerWatt, min_wattage, max_wattage, brand } = req.body || {};

      // 1. Try remote Cloudflare Worker
      let isWorker404 = false;
      const authHeader = extractBearerAuthHeader(req);
      try {
        const cfRes = await fetch(`${CF_WORKER_API}/energy-exchange/prices/${encodeURIComponent(targetId)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://enerjoo.com",
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(5000),
        });

        if (cfRes.status === 404) {
          isWorker404 = true;
        } else {
          const text = await cfRes.text();
          return res.status(cfRes.status).set("Content-Type", cfRes.headers.get("content-type") || "application/json").send(text);
        }
      } catch {
        return res.status(503).json({
          success: false,
          ok: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "تعذر الاتصال بالخادم السحابي (مهلة زمنية أو انقطاع شبكة). لم يتم تنفيذ التعديل لتجنب تعارض البيانات.",
          },
        });
      }

      // 2. Local Preview Fallback strictly upon confirmed Worker 404
      if (!isWorker404 || !isGoogleAiStudioPreviewEnvironment()) {
        return res.status(503).json({
          success: false,
          ok: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "مسار التعديل السحابي غير متاح، والـ Fallback مخصص للمعاينة فقط." },
        });
      }

      const rawPrice = Number(price_per_watt ?? pricePerWatt);
      if (!Number.isFinite(rawPrice) || rawPrice <= 0 || rawPrice > 200) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: "INVALID_PRICE", message: "يرجى إدخال سعر صحيح بالجنيه بين 0.1 و 200 لكل وات." },
        });
      }
      const roundedPrice = parseFloat(rawPrice.toFixed(2));

      const records = loadPreviewRangesFromFile();
      const existing = records.find(
        (r) => r.price_id === targetId || (brand && r.brand.toLowerCase() === brand.trim().toLowerCase() && r.min_wattage == null)
      );
      if (!existing) {
        return res.status(404).json({
          success: false,
          ok: false,
          error: { code: "NOT_FOUND", message: `سجل السعر غير موجود: ${targetId}` },
        });
      }

      const brandRes = resolveApprovedExchangeBrand(brand || existing.brand);
      if (!brandRes.valid || !brandRes.brand) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: "INVALID_BRAND", message: brandRes.error },
        });
      }
      const effectiveBrand = brandRes.brand;

      const minW = min_wattage !== undefined && min_wattage !== null ? Number(min_wattage) : existing.min_wattage;
      const maxW = max_wattage !== undefined && max_wattage !== null ? Number(max_wattage) : existing.max_wattage;

      if (minW != null || maxW != null) {
        if (minW == null || maxW == null || !Number.isInteger(minW) || !Number.isInteger(maxW) || minW <= 0 || minW >= maxW) {
          return res.status(400).json({
            success: false,
            ok: false,
            error: {
              code: "INVALID_RANGE",
              message: "نطاق قدرة غير صالح: الحد الأدنى يجب أن يكون رقماً صحيحاً > 0 وأقل تماماً من الحد الأقصى.",
            },
          });
        }

        const overlap = records.find(
          (r) =>
            r.price_id !== existing.price_id &&
            r.brand.toLowerCase() === effectiveBrand.toLowerCase() &&
            r.min_wattage != null &&
            r.max_wattage != null &&
            minW <= r.max_wattage &&
            maxW >= r.min_wattage
        );

        if (overlap) {
          return res.status(409).json({
            success: false,
            ok: false,
            error: {
              code: "RANGE_OVERLAP",
              message: `تعذر التعديل: نطاق القدرة (${minW} - ${maxW} وات) يتداخل مع نطاق موجود (${overlap.min_wattage} - ${overlap.max_wattage} وات) لماركة ${effectiveBrand}.`,
            },
          });
        }
      }

      existing.price_per_watt = roundedPrice;
      if (minW != null) existing.min_wattage = minW;
      if (maxW != null) existing.max_wattage = maxW;
      existing.brand = effectiveBrand;
      existing.updated_at = new Date().toISOString();
      existing.updated_by = authCheck.email || "admin";

      await atomicSavePreviewRangesToFile(records);

      return res.json({
        success: true,
        ok: true,
        message: "تم تعديل نطاق السعر بنجاح (معاينة)",
        price_id: existing.price_id,
        brand: existing.brand,
        min_wattage: existing.min_wattage,
        max_wattage: existing.max_wattage,
        price_per_watt: existing.price_per_watt,
        source: "preview-local",
        is_preview: true,
      });
    } catch (err: any) {
      console.error("Error in PUT /api/energy-exchange/prices/:id:", err);
      res.status(500).json({ success: false, error: "Failed to update exchange price" });
    }
  });

  // POST /api/energy-exchange, /api/energy-exchange/prices, /api/energy-exchange/ranges
  app.post(["/api/energy-exchange", "/api/energy-exchange/prices", "/api/energy-exchange/ranges"], async (req, res) => {
    try {
      // Authoritative Admin RBAC check
      const authCheck = await isEnergyExchangeAdminAuthorizedServer(req);
      if (!authCheck.authorized) {
        return res.status(authCheck.status).json({
          success: false,
          ok: false,
          error: { code: authCheck.code, message: authCheck.message },
        });
      }

      // 1. Try remote Cloudflare Worker
      let isWorker404 = false;
      const authHeader = extractBearerAuthHeader(req);
      try {
        const cfRes = await fetch(`${CF_WORKER_API}/energy-exchange/prices`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://enerjoo.com",
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(5000),
        });

        if (cfRes.status === 404) {
          isWorker404 = true;
        } else {
          const text = await cfRes.text();
          return res.status(cfRes.status).set("Content-Type", cfRes.headers.get("content-type") || "application/json").send(text);
        }
      } catch {
        return res.status(503).json({
          success: false,
          ok: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "تعذر الاتصال بالخادم السحابي (مهلة زمنية أو انقطاع شبكة). لم يتم تنفيذ الإضافة لتجنب تعارض البيانات.",
          },
        });
      }

      // 2. Local Preview Fallback strictly upon confirmed Worker 404
      if (!isWorker404 || !isGoogleAiStudioPreviewEnvironment()) {
        return res.status(503).json({
          success: false,
          ok: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "مسار الإضافة السحابي غير متاح، والـ Fallback مخصص للمعاينة فقط." },
        });
      }

      const { brand, min_wattage, max_wattage, price_per_watt, pricePerWatt } = req.body || {};
      const brandRes = resolveApprovedExchangeBrand(brand);
      if (!brandRes.valid || !brandRes.brand) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: "INVALID_BRAND", message: brandRes.error },
        });
      }
      const canonicalBrand = brandRes.brand;

      const rawPrice = Number(price_per_watt ?? pricePerWatt);
      if (!Number.isFinite(rawPrice) || rawPrice <= 0 || rawPrice > 200) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: "INVALID_PRICE", message: "يرجى إدخال سعر صحيح بالجنيه بين 0.1 و 200 لكل وات." },
        });
      }
      const roundedPrice = parseFloat(rawPrice.toFixed(2));

      const minW = min_wattage !== undefined && min_wattage !== null ? Number(min_wattage) : null;
      const maxW = max_wattage !== undefined && max_wattage !== null ? Number(max_wattage) : null;

      if (minW === null || maxW === null || !Number.isInteger(minW) || !Number.isInteger(maxW) || minW <= 0 || minW >= maxW) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: {
            code: "INVALID_RANGE",
            message: "نطاق قدرة غير صالح: الحد الأدنى يجب أن يكون رقماً صحيحاً > 0 وأقل تماماً من الحد الأقصى.",
          },
        });
      }

      const records = loadPreviewRangesFromFile();
      const brandExistingRanges = records.filter(
        (r) => r.brand.toLowerCase() === canonicalBrand.toLowerCase() && r.min_wattage != null && r.max_wattage != null
      );

      if (brandExistingRanges.length >= 3) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: "MAX_RANGES_EXCEEDED", message: `الحد الأقصى للنطاقات هو 3 نطاقات لكل علامة تجارية (${canonicalBrand}).` },
        });
      }

      const overlap = brandExistingRanges.find((r) => minW <= r.max_wattage! && maxW >= r.min_wattage!);
      if (overlap) {
        return res.status(409).json({
          success: false,
          ok: false,
          error: {
            code: "RANGE_OVERLAP",
            message: `تعذر الإضافة: نطاق القدرة (${minW} - ${maxW} وات) يتداخل مع نطاق موجود (${overlap.min_wattage} - ${overlap.max_wattage} وات) لماركة ${canonicalBrand}.`,
          },
        });
      }

      const cleanBrand = canonicalBrand.toUpperCase().replace(/[^A-Z0-9]/g, "_");
      const priceId = req.body.price_id || `RANGE_${cleanBrand}_${minW}_${maxW}`;

      const newRecord: EnergyExchangePreviewRecord = {
        price_id: priceId,
        category: req.body.category || "panels",
        brand: canonicalBrand,
        product_type: req.body.product_type || "Solar Panel",
        price_per_watt: roundedPrice,
        currency: req.body.currency || "EGP",
        min_wattage: minW,
        max_wattage: maxW,
        is_active: 1,
        effective_date: new Date().toISOString().split("T")[0],
        updated_at: new Date().toISOString(),
        updated_by: authCheck.email || "admin",
      };

      records.push(newRecord);
      await atomicSavePreviewRangesToFile(records);

      return res.json({
        success: true,
        ok: true,
        message: "تم إضافة نطاق السعر بنجاح في بورصة الطاقة (معاينة)",
        price_id: priceId,
        brand: canonicalBrand,
        min_wattage: minW,
        max_wattage: maxW,
        price_per_watt: roundedPrice,
        source: "preview-local",
        is_preview: true,
      });
    } catch (err: any) {
      console.error("Error in POST /api/energy-exchange:", err);
      res.status(500).json({ success: false, error: "Failed to update exchange prices" });
    }
  });

  app.all(cfProxyRoutes, async (req, res) => {
    const targetPath = req.originalUrl.replace(/^\/api/, "");
    const targetUrl = `${CF_WORKER_API}${targetPath}`;
    try {
      const proxyHeaders: Record<string, string> = {
        "Origin": "https://enerjoo.com",
      };
      const authHeader = extractBearerAuthHeader(req);
      if (authHeader) {
        proxyHeaders["Authorization"] = authHeader;
      }
      const fetchOptions: RequestInit = {
        method: req.method,
        headers: proxyHeaders,
      };
      if (req.method !== "GET" && req.method !== "HEAD" && req.body && Object.keys(req.body).length > 0) {
        proxyHeaders["Content-Type"] = "application/json";
        fetchOptions.body = JSON.stringify(req.body);
      }
      const apiRes = await fetch(targetUrl, fetchOptions);
      const data = await apiRes.text();
      res
        .status(apiRes.status)
        .set("Content-Type", apiRes.headers.get("content-type") || "application/json")
        .send(data);
    } catch (err: any) {
      console.error(`Error proxying to Cloudflare Worker API (${targetUrl}):`, err);
      res.status(500).json({ success: false, error: err?.message || "Proxy error" });
    }
  });

  // Enerjoo Cloudflare Worker Chat Proxy (/chat, /api/chat, and /api/n8n-chat)
  app.all(["/chat", "/api/chat", "/chat/", "/api/chat/", "/api/n8n-chat"], async (req, res) => {
    const origin = req.header("Origin") || "";
    res.setHeader("Vary", "Origin");
    if (origin && isServerOriginAllowed(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-Auth, X-Requested-With, Accept");

    if (req.method === "OPTIONS") {
      if (origin && !isServerOriginAllowed(origin)) {
        return res.sendStatus(403);
      }
      return res.sendStatus(204);
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        success: false,
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "يرجى استخدام طلب POST للتواصل مع المساعد الذكي."
        }
      });
    }

    const targetUrl = `${CF_WORKER_API}/chat`;
    try {
      const proxyHeaders: Record<string, string> = {
        "Origin": "https://enerjoo.com",
        "Accept": "application/json",
      };
      const authHeader = extractBearerAuthHeader(req);
      if (authHeader) {
        proxyHeaders["Authorization"] = authHeader;
      }
      const fetchOptions: RequestInit = {
        method: "POST",
        headers: proxyHeaders,
        signal: AbortSignal.timeout(35000),
      };
      if (req.body && Object.keys(req.body).length > 0) {
        proxyHeaders["Content-Type"] = "application/json";
        fetchOptions.body = JSON.stringify(req.body);
      }

      const apiRes = await fetch(targetUrl, fetchOptions);
      const data = await apiRes.text();
      res
        .status(apiRes.status)
        .set("Content-Type", apiRes.headers.get("content-type") || "application/json; charset=utf-8")
        .send(data);
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      console.error(`[Chat Proxy] Upstream ${isTimeout ? "timeout" : "network error"}`);
      res.status(isTimeout ? 504 : 502).json({
        ok: false,
        success: false,
        error: {
          code: isTimeout ? "AI_AGENT_TIMEOUT" : "AI_AGENT_UNREACHABLE",
          message: isTimeout
            ? "استغرق المساعد الذكي وقتاً أطول من المعتاد. يرجى إعادة المحاولة."
            : "تعذر الاتصال بالمساعد الذكي حالياً. يرجى المحاولة مرة أخرى بعد لحظات."
        }
      });
    }
  });

  // Server-side Semantic Search proxy
  app.post("/api/semantic-search", async (req, res) => {
    try {
      const { query, isAr } = req.body;
      const products = Array.isArray(req.body.products) ? req.body.products : [];

      if (!query || typeof query !== "string" || query.length > 500) {
        return res.status(400).json({ error: "Invalid query. Must be a string under 500 characters." });
      }
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("GEMINI_API_KEY is not defined or is empty, utilizing smart semantic search fallback.");
        try {
          const fallbackResults = fallbackSemanticSearch(query, products, isAr);
          return res.status(200).json(fallbackResults);
        } catch {
          return res.status(200).json([]);
        }
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const productContext = products.map((p: any) => {
        if ((p.category || '').toLowerCase().includes('invert')) {
          const structured = classifyInverter(p);
          return {
            id: p.id,
            name: isAr ? p.nameAr : p.name,
            brand: p.brand,
            category: 'Inverter',
            inverter_type: structured.type,
            phase: structured.phase,
            rated_power_kw: structured.rated_power_kw,
            application: structured.application,
            battery_support: structured.battery_support,
            efficiency_percent: structured.efficiency_percent,
            price: p.price,
            availability: structured.availability
          };
        }
        return {
          id: p.id,
          name: isAr ? p.nameAr : p.name,
          brand: p.brand,
          category: p.category,
          power: p.power,
          efficiency: p.efficiency,
          price: p.price,
          specs: p.specs || {}
        };
      });

      const systemInstruction = [
        "You are an expert solar energy consultant assistant for 'enerjoo', a solar product comparison platform in Egypt.",
        "Your task is to perform high-precision semantic search on solar products.",
        "",
        "CRITICAL SEARCH CAPABILITIES & INVERTER DISCIPLINE:",
        "1. Inverters: Types are strictly: On-Grid, Hybrid, Off-Grid, Pump Inverter. Phases: Single Phase, Three Phase.",
        "2. STRICT NO-HALLUCINATION RULE: Never invent specs. Never assume battery support if false. Never assume MPPT.",
        "3. Ranking Priority: Correct Type -> Power Proximity -> Phase -> Battery Support -> Application -> Efficiency -> Price.",
        "4. Technical Specs: Understand power (W/kW), efficiency (%), voltage (V), and current (A).",
        "5. Unit Conversions: Understand that '5k' or '5000' refers to 5000W or 5kW.",
        "",
        "EVALUATION CRITERIA:",
        "- High Relevance (0.8-1.0): Product exactly matches spec.",
        "- Medium Relevance (0.4-0.7): Product is related.",
        "- Low Relevance (0.1-0.3): Weak connection.",
        "",
        "Return a JSON array of search results, each containing:",
        "- productId: the ID of the matching product (as string)",
        "- relevanceScore: a number from 0 to 1",
        `- matchReason: a brief explanation in ${isAr ? 'Arabic' : 'English'} explaining WHY it matches.`
      ].join("\n");

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: [
          { parts: [{ text: `Query: ${query}` }] },
          { parts: [{ text: `Products: ${JSON.stringify(productContext)}` }] }
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                productId: { type: Type.STRING },
                relevanceScore: { type: Type.NUMBER },
                matchReason: { type: Type.STRING }
              },
              required: ["productId", "relevanceScore", "matchReason"]
            }
          }
        }
      });

      const results = JSON.parse(response.text || "[]");
      res.json(results);
    } catch (error: any) {
      console.log("Semantic search model status update: utilizing efficient local search fallback.");
      try {
        const { query, products, isAr } = req.body;
        const fallbackResults = fallbackSemanticSearch(query, products, isAr);
        res.json(fallbackResults);
      } catch (innerErr: any) {
        res.status(500).json({ error: innerErr.message || "Failed to search" });
      }
    }
  });

  // Solar Calculator API
  app.post("/api/solar-calculate", async (req, res) => {
    try {
      let stationPower = Number(req.body.stationPower);
      let landArea = Number(req.body.landArea);
      const { loadDetails, lang, monthlyBillEgp, billAmount, kwhMonthly } = req.body;
      const products = Array.isArray(req.body.products) ? req.body.products : [];
      const isAr = lang !== 'en';

      if (!Number.isFinite(stationPower) || stationPower <= 0) {
        const bill = Number(monthlyBillEgp || billAmount);
        if (Number.isFinite(bill) && bill > 0) {
          stationPower = Math.max(1.5, bill / 450);
        } else {
          const kwh = Number(kwhMonthly);
          if (Number.isFinite(kwh) && kwh > 0) {
            stationPower = Math.max(1.5, (kwh / 30) / (5.3 * 0.75));
          } else {
            stationPower = 5;
          }
        }
      }

      if (!Number.isFinite(landArea) || landArea <= 0) {
        landArea = parseFloat((stationPower * 7).toFixed(1));
      }

      stationPower = Math.min(50000, Math.max(0.5, stationPower));
      landArea = Math.min(5000000, Math.max(1, landArea));

      if (loadDetails && (typeof loadDetails !== "string" || loadDetails.length > 2000)) {
        return res.status(400).json({ error: "loadDetails exceeds maximum allowed size" });
      }
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("GEMINI_API_KEY is not defined, utilizing precision mathematical solar sizing fallback.");
        try {
          const fallbackResults = fallbackSolarSizing(stationPower, landArea, loadDetails, products, isAr);
          return res.json(fallbackResults);
        } catch (fbErr: any) {
          return res.status(500).json({ error: fbErr.message || "Failed to calculate sizing" });
        }
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Prepare Catalog Products
      const condensedProducts = products.map((p: any) => ({
        id: p.id,
        name: isAr ? p.nameAr : p.name,
        brand: p.brand,
        category: p.category,
        power: p.power,
        efficiency: p.efficiency,
        price: p.price,
        area: p.area,
        specs: p.specs || {}
      }));

      const systemInstruction = [
        "You are an expert Solar Energy Sizing and Design Consultant for the 'enerjoo' solar enterprise platform in Egypt.",
        "Analyze the client requirements (Required Station Power in kW, Available Land/Roof Area in m2, and Daily Load details)",
        "and design a fully compatible, optimally sized solar system package selected from the provided products catalog.",
        "",
        "DESIGN RULES & SIZING LOGIC:",
        "1. Solar Panels (category: 'panels'):",
        "   - Calculate the number of boards necessary to reach the Target Station Power (kW).",
        "   - Total Panel Power = panel power * quantity.",
        "   - Total Area Footprint = panel area * quantity.",
        "   - Check if Total Area Footprint fits inside the user landArea (m2).",
        "2. Solar Inverter (category: 'inverters'):",
        "   - Recommend an inverter from the catalog whose power capacity handles the panel station size.",
        "3. Batteries (category: 'batteries'):",
        "   - If user has specified any loadDetails or night consumption, recommend battery storage units from the catalog.",
        "4. Calculate totalEstimatedCost in EGP strictly by summing (product price * quantity) for all recommended products.",
        "5. Return a highly professional, detailed feasibilityAnalysis.",
        `6. Return everything as a structured JSON object. Response language must match the request language (${isAr ? 'Arabic' : 'English'}).`
      ].join("\n");

      const prompt = [
        "Client Configuration:",
        `- Target Station Power: ${stationPower} kW`,
        `- Available Land/Roof Area: ${landArea} m2`,
        `- Daily Load / Night Consumption Details: ${loadDetails || "None provided"}`,
        "",
        "Available Egyptian Solar Products Catalog:",
        JSON.stringify(condensedProducts, null, 2)
      ].join("\n");

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING, description: "Must be 'feasible' (if layout fits), 'warning' (e.g. area is small but can work by reducing size), or 'infeasible' (insufficient space/budget)." },
              explanation: { type: Type.STRING, description: "High-level description of client's solar package and system benefits." },
              totalEstimatedCost: { type: Type.NUMBER, description: "Calculated exact cost in EGP of recommended entries." },
              feasibilityAnalysis: { type: Type.STRING, description: "Detailed physical feasibility analysis regarding area, weight, shading, and loads." },
              specifications: {
                type: Type.OBJECT,
                properties: {
                  totalPanelPowerKw: { type: Type.NUMBER, description: "Total power of all recommended solar panels combined in kW." },
                  totalAreaRequiredM2: { type: Type.NUMBER, description: "Total face area size of all recommended panels in m²." },
                  panelsCountNeeded: { type: Type.INTEGER, description: "Exact number of panel items requested." },
                  batterySizingDetails: { type: Type.STRING, description: "Detailed calculations and reasons for battery quantity." }
                },
                required: ["totalPanelPowerKw", "totalAreaRequiredM2", "panelsCountNeeded"]
              },
              recommendedProducts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productId: { type: Type.INTEGER, description: "The product ID matching the catalog" },
                    quantity: { type: Type.INTEGER, description: "How many units of this product to procure" },
                    role: { type: Type.STRING, description: "'panels' or 'inverters' or 'batteries'" },
                    reason: { type: Type.STRING, description: "A detailed bicultural reason explaining why this exact product fits" }
                  },
                  required: ["productId", "quantity", "role", "reason"]
                }
              }
            },
            required: ["status", "explanation", "totalEstimatedCost", "feasibilityAnalysis", "specifications", "recommendedProducts"]
          }
        }
      });

      const responseText = response.text || "{}";
      res.json(JSON.parse(responseText.trim()));

    } catch (err: any) {
      console.log("Solar calculation model status update: utilizing efficient local calculator fallback.");
      try {
        let stationPower = Number(req.body?.stationPower) || 5;
        let landArea = Number(req.body?.landArea) || parseFloat((stationPower * 7).toFixed(1));
        const { loadDetails, lang } = req.body || {};
        const products = Array.isArray(req.body?.products) ? req.body.products : [];
        const isAr = lang !== 'en';
        const fallbackResults = fallbackSolarSizing(stationPower, landArea, loadDetails, products, isAr);
        res.json(fallbackResults);
      } catch (innerErr: any) {
        res.status(500).json({ error: innerErr.message || "Failed to calculate solar solution" });
      }
    }
  });

  // Solar Chat Advisor API
  app.post("/api/solar-chat", async (req, res) => {
    try {
      const { messages, lang, systemType, consumptionMethod, billAmount, kwhMonthly, pumpHp, cityChoice, systemDetails } = req.body || {};
      const isAr = lang !== 'en';

      if (messages && (!Array.isArray(messages) || messages.length > 50)) {
        return res.status(400).json({ error: "Invalid messages format or excessive message count" });
      }

      const safeMessages = Array.isArray(messages) ? messages : [];
      const userText = safeMessages.length > 0 
        ? (safeMessages[safeMessages.length - 1]?.text || safeMessages[safeMessages.length - 1]?.content || "") 
        : (req.body?.message || req.body?.chatInput || req.body?.prompt || "");

      const parsed = parseSizingInPrompt(userText);
      const updatedSizing = {
        bill: parsed.bill,
        kwh: parsed.kwh,
        pumpHp: parsed.pumpHp,
        systemType: parsed.systemType,
        cityChoice: parsed.cityChoice
      };

      // Ground in Enerjoo Conversational Intelligence Engine (Intent Detection, Context, Catalog)
      try {
        const allInverters = await fetchAllStructuredInverters();
        const sId = req.body?.sessionId || `solar-${Date.now()}`;
        const chatResult = await processConversationalChat(
          sId,
          userText || '',
          allInverters,
          isAr ? 'ar' : 'en'
        );
        return res.json({
          reply: chatResult.reply,
          recommendation: chatResult.recommendation || null,
          intent: chatResult.intent,
          updatedSizing
        });
      } catch (convErr) {
        console.error("Inverter recommendation error in solar-chat:", convErr);
      }
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("GEMINI_API_KEY is not defined, utilizing intelligent solar consultant fallback.");
        const reply = fallbackSolarChat(safeMessages, isAr, { ...req.body, message: userText }, getExchangePricesMap());
        return res.json({ 
          reply,
          updatedSizing
        });
      }

      try {
        const ai = new GoogleGenAI({ 
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        const contextParts: string[] = [];
        if (systemType || cityChoice || systemDetails || pumpHp) {
          contextParts.push("System details provided by user:");
          if (systemType) contextParts.push(`- System type: ${systemType}`);
          if (cityChoice) contextParts.push(`- Location/City: ${cityChoice}`);
          if (pumpHp) contextParts.push(`- Water pump power: ${pumpHp} HP`);
          if (billAmount) contextParts.push(`- Monthly electricity bill: ${billAmount} EGP`);
          if (kwhMonthly) contextParts.push(`- Monthly consumption: ${kwhMonthly} kWh`);
          if (systemDetails) {
            contextParts.push(`- System capacity: ${systemDetails.panelPowerTotalKw || 0} kW`);
            contextParts.push(`- Required panels count: ${systemDetails.panelQty || 0}`);
            contextParts.push(`- Storage batteries count: ${systemDetails.batteryQty || 0}`);
          }
        }

        const systemInstruction = [
          'You are an expert, friendly solar energy consultant for the "Enerjoo" solar energy platform in Egypt.',
          'Your goal is to answer client questions with simplified, warm Arabic (or English if prompted) explanations.',
          contextParts.join('\n'),
          'Guidelines:',
          '1. Explain technical terms simply.',
          '2. Guide users to interact with the interactive sizing tools and request certified installation quotes.',
          '3. Focus on verified equipment available on the platform and practical Egyptian solar guidelines.'
        ].filter(Boolean).join('\n\n');

        // Format messages safely for @google/genai SDK
        const contents = safeMessages.map((m: any) => ({
          role: m.sender === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.text || m.content || '' }]
        }));

        if (contents.length === 0) {
          contents.push({
            role: 'user',
            parts: [{ text: userText || (isAr ? 'مرحباً، أود استشارة حول حلول الطاقة الشمسية' : 'Hello, I need solar consultation') }]
          });
        }

        const response = await ai.models.generateContent({
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
          contents,
          config: {
            systemInstruction,
          }
        });

        const reply = response.text || fallbackSolarChat(safeMessages, isAr, { ...req.body, message: userText }, getExchangePricesMap());

        return res.json({ 
          reply,
          updatedSizing
        });
      } catch (geminiErr: any) {
        console.warn("Gemini generation notice, utilizing smart solar advisor fallback:", geminiErr?.message || geminiErr);
        const reply = fallbackSolarChat(safeMessages, isAr, { ...req.body, message: userText }, getExchangePricesMap());
        return res.json({ 
          reply,
          updatedSizing
        });
      }
    } catch (err: any) {
      console.log("Solar chat model status update: utilizing efficient local advisor fallback.");
      try {
        const safeMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
        const isAr = req.body?.lang !== 'en';
        const userText = safeMessages.length > 0 
          ? (safeMessages[safeMessages.length - 1]?.text || safeMessages[safeMessages.length - 1]?.content || "") 
          : (req.body?.message || req.body?.chatInput || req.body?.prompt || "");
        const parsed = parseSizingInPrompt(userText);
        const reply = fallbackSolarChat(safeMessages, isAr, { ...req.body, message: userText }, getExchangePricesMap());
        res.json({ 
          reply,
          updatedSizing: {
            bill: parsed.bill,
            kwh: parsed.kwh,
            pumpHp: parsed.pumpHp,
            systemType: parsed.systemType,
            cityChoice: parsed.cityChoice
          }
        });
      } catch (innerErr: any) {
        res.status(500).json({ error: innerErr.message || "Failed to get response" });
      }
    }
  });

  // Ensure all unhandled /api/* routes return JSON 404 instead of falling through to Vite index.html
  app.all("/api/*", (req, res) => {
    res.status(404).json({
      success: false,
      error: `Endpoint ${req.originalUrl} not found`
    });
  });

  // Ensure all unhandled errors on API routes return JSON instead of HTML
  app.use("/api", (err: any, req: any, res: any, next: any) => {
    console.error("API error:", err);
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        success: false,
        error: err.message || "حدث خطأ أثناء معالجة الطلب."
      });
    }
  });

  // Explicit high-priority handlers for core SEO and brand assets
  app.get("/favicon.ico", (req, res) => {
    res.setHeader("Content-Type", "image/x-icon");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(path.join(process.cwd(), "public", "favicon.ico"));
  });

  app.get("/favicon.png", (req, res) => {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(path.join(process.cwd(), "public", "favicon.png"));
  });

  app.get("/og-image.jpg", (req, res) => {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.sendFile(path.join(process.cwd(), "public", "og-image.jpg"));
  });

  app.get(["/brand-thumbnail.png"], (req, res) => {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.sendFile(path.join(process.cwd(), "public", "brand-thumbnail.png"));
  });

  app.get(["/brand-thumbnail.jpg", "/site-thumbnail.jpg", "/og-image-square.jpg"], (req, res) => {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.sendFile(path.join(process.cwd(), "public", "brand-thumbnail.jpg"));
  });

  // High-priority robots.txt handler with strict header
  app.get("/robots.txt", (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    const robotsPath = path.join(process.cwd(), "public", "robots.txt");
    res.sendFile(robotsPath);
  });

  // Dynamic sitemap.xml endpoint: built directly from live published database & catalog items
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const publishedProducts = await getAuthoritativePublishedProducts();
      const sitemapXml = generateSitemapXml(publishedProducts);

      // Keep public/sitemap.xml and dist/sitemap.xml updated synchronously on disk as well
      try {
        fs.writeFileSync(path.join(process.cwd(), "public", "sitemap.xml"), sitemapXml, "utf-8");
        const distDir = path.join(process.cwd(), "dist");
        if (fs.existsSync(distDir)) {
          fs.writeFileSync(path.join(distDir, "sitemap.xml"), sitemapXml, "utf-8");
        }
      } catch (writeErr) {
        // Silently continue
      }

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
      res.status(200).send(sitemapXml);
    } catch (err: any) {
      console.error("Error generating dynamic sitemap:", err);
      const fallbackPath = path.join(process.cwd(), "public", "sitemap.xml");
      if (fs.existsSync(fallbackPath)) {
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        return res.sendFile(fallbackPath);
      }
      res.status(500).send("Error generating sitemap");
    }
  });

  // High-priority dynamic SSR metadata handler for direct product detail URLs
  app.get(["/product/:productId", "/products/:productId"], async (req, res, next) => {
    const { productId } = req.params;
    const pIdStr = String(productId || "").trim();
    if (!pIdStr) return next();

    // If marked deleted, pass through to 404
    if (deletedProductIds.has(pIdStr)) {
      return next();
    }

    try {
      const allProducts = await getAuthoritativePublishedProducts();
      const product = allProducts.find(p => String(p.product_id || p.id) === pIdStr);
      if (!product) {
        return next();
      }

      const isProd = process.env.NODE_ENV === "production";
      const indexPath = isProd 
        ? path.join(process.cwd(), "dist", "index.html")
        : path.join(process.cwd(), "index.html");

      if (!fs.existsSync(indexPath)) {
        return next();
      }

      let html = fs.readFileSync(indexPath, "utf-8");

      const name = product.nameAr || product.name || `منتج ${pIdStr}`;
      const brand = product.brand ? product.brand.trim() : "";
      const pageTitle = brand ? `${name} - ${brand} | Enerjoo` : `${name} | Enerjoo`;

      const specDetails: string[] = [];
      if (product.power && product.power > 0) {
        if (product.category === 'inverters') {
          specDetails.push(`قدرة ${product.power} ك.و`);
        } else {
          specDetails.push(`قدرة ${product.power} وات`);
        }
      }
      if (product.hp) specDetails.push(`قدرة ${product.hp} حصان`);
      if (product.efficiency && product.efficiency > 0) specDetails.push(`كفاءة ${product.efficiency}%`);
      if (product.warranty && product.warranty > 0) specDetails.push(`ضمان ${product.warranty} سنة`);
      const specsText = specDetails.length > 0 ? ` (${specDetails.join(' • ')})` : '';

      const catNameAr = CATEGORY_NAMES_AR[product.category] || product.category || 'معدات طاقة شمسية';
      const pageDesc = product.description && product.description.trim()
        ? product.description.trim().slice(0, 300)
        : `${name} من ماركة ${brand || 'معتمدة'} ضمن فئة ${catNameAr}${specsText}. متاح للمقارنة والشراء عبر منصة Enerjoo للطاقة الشمسية في مصر.`;

      const canonicalUrl = `https://enerjoo.com/product/${encodeURIComponent(pIdStr)}`;
      const imageUrl = product.image_url || product.image || "https://enerjoo.com/brand-thumbnail.png";

      const ldJson: Record<string, any> = {
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": `${canonicalUrl}#product`,
        "name": name,
        "category": catNameAr,
        "image": imageUrl,
        "description": pageDesc,
        "sku": pIdStr
      };

      if (brand) {
        ldJson.brand = {
          "@type": "Brand",
          "name": brand
        };
      }

      if (typeof product.price === "number" && product.price > 0) {
        ldJson.offers = {
          "@type": "Offer",
          "url": canonicalUrl,
          "priceCurrency": "EGP",
          "price": product.price,
          "itemCondition": "https://schema.org/NewCondition",
          "availability": product.status === "available"
            ? "https://schema.org/InStock"
            : (product.status === "out_of_stock" ? "https://schema.org/OutOfStock" : "https://schema.org/LimitedAvailability")
        };
      }

      // Replace metadata
      html = html
        .replace(/<title>.*?<\/title>/gi, `<title>${escapeHtml(pageTitle)}</title>`)
        .replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/gi, `<meta name="description" content="${escapeHtml(pageDesc)}" />`)
        .replace(/<link\s+rel="canonical"\s+href=".*?"\s*\/?>/gi, `<link rel="canonical" href="${canonicalUrl}" />`)
        .replace(/<meta\s+property="og:title"\s+content=".*?"\s*\/?>/gi, `<meta property="og:title" content="${escapeHtml(pageTitle)}" />`)
        .replace(/<meta\s+property="og:description"\s+content=".*?"\s*\/?>/gi, `<meta property="og:description" content="${escapeHtml(pageDesc)}" />`)
        .replace(/<meta\s+property="og:url"\s+content=".*?"\s*\/?>/gi, `<meta property="og:url" content="${canonicalUrl}" />`)
        .replace(/<meta\s+property="og:image"\s+content=".*?"\s*\/?>/gi, `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`)
        .replace(/<meta\s+property="og:type"\s+content=".*?"\s*\/?>/gi, `<meta property="og:type" content="product" />`)
        .replace(/<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/gi, `<meta name="twitter:title" content="${escapeHtml(pageTitle)}" />`)
        .replace(/<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/gi, `<meta name="twitter:description" content="${escapeHtml(pageDesc)}" />`)
        .replace(/<meta\s+name="twitter:image"\s+content=".*?"\s*\/?>/gi, `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`);

      const scriptTag = `\n  <script type="application/ld+json" id="enerjoo-product-schema">\n${JSON.stringify(ldJson, null, 2)}\n  </script>\n</head>`;
      html = html.replace("</head>", scriptTag);

      if (!isProd) {
        const vite = viteInstance || (await vitePromise);
        if (vite) {
          html = await vite.transformIndexHtml(req.originalUrl, html);
        }
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(html);
    } catch (ssrErr) {
      console.warn("Product SSR HTML enrichment notice:", ssrErr);
      next();
    }
  });

  // Static assets from public directory
  app.use(express.static(path.join(process.cwd(), "public")));

  // Vite middleware for development or static serving for production
  let viteInstance: any = null;
  let viteMiddleware: any = null;
  const vitePromise = process.env.NODE_ENV !== "production"
    ? createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: "spa",
      })
        .then((vite) => {
          viteInstance = vite;
          viteMiddleware = vite.middlewares;
          console.log("Vite development middleware ready");
          return vite;
        })
        .catch((err) => {
          console.error("Error creating Vite server:", err);
          return null;
        })
    : Promise.resolve(null);

  if (process.env.NODE_ENV !== "production") {
    app.use(async (req, res, next) => {
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      try {
        const vite = await vitePromise;
        if (vite && vite.middlewares) {
          return vite.middlewares(req, res, next);
        }
      } catch (err) {
        return next(err);
      }
      next();
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    fetchAllLiveD1Products().catch(() => {});
  });
}

startServer();
