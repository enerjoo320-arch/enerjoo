/**
 * Enerjoo Official Contact Numbers
 * - خدمة عملاء Enerjoo: 01033253870 (+20 10 3325 3870)
 * - رقم التواصل مع المورد / استفسارات المنتجات: +20 15 51509776 (01551509776)
 */

// 1. خدمة عملاء Enerjoo والدعم الفني العام (Customer Service)
export const CUSTOMER_SERVICE_PHONE_DISPLAY = '01033253870';
export const CUSTOMER_SERVICE_PHONE_INTL = '+20 10 3325 3870';
export const CUSTOMER_SERVICE_WHATSAPP_NUMBER = '201033253870';

export function getCustomerServiceWhatsAppUrl(message?: string): string {
  if (message) {
    return `https://wa.me/${CUSTOMER_SERVICE_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${CUSTOMER_SERVICE_WHATSAPP_NUMBER}`;
}

// 2. التواصل مع المورد والمنتجات (Supplier & Product Inquiries)
export const SUPPLIER_CONTACT_PHONE_DISPLAY = '01551509776';
export const SUPPLIER_CONTACT_PHONE_INTL = '+20 15 51509776';
export const SUPPLIER_CONTACT_WHATSAPP_NUMBER = '201551509776';

export function getSupplierWhatsAppUrl(message?: string): string {
  if (message) {
    return `https://wa.me/${SUPPLIER_CONTACT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${SUPPLIER_CONTACT_WHATSAPP_NUMBER}`;
}

// Aliases for unified & backwards compatibility
export const UNIFIED_PHONE_DISPLAY = CUSTOMER_SERVICE_PHONE_DISPLAY;
export const UNIFIED_PHONE_INTL = CUSTOMER_SERVICE_PHONE_INTL;
export const UNIFIED_WHATSAPP_NUMBER = CUSTOMER_SERVICE_WHATSAPP_NUMBER;
export const getUnifiedWhatsAppUrl = getCustomerServiceWhatsAppUrl;

