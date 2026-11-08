import React from 'react';
import { ArrowRight, Package } from 'lucide-react';
import { translations } from '../translations';
import { ProductForm } from './ProductForm';
import { motion } from 'motion/react';
import { Product } from '../types';

interface AddProductViewProps {
  lang: 'ar' | 'en';
  onBack: () => void;
  onAdd: (product: Omit<Product, 'id'>) => void | Promise<void>;
  editingProduct?: Product | null;
}

export const AddProductView: React.FC<AddProductViewProps> = ({ lang, onBack, onAdd, editingProduct }) => {
  const t = translations[lang];
  const isAr = lang === 'ar';

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-2xl mx-auto pb-20 md:pb-0"
    >
      <button onClick={onBack} className="flex items-center gap-2 text-solar-muted hover:text-solar-text mb-6 transition font-bold group">
        <div className="p-2 rounded-xl bg-solar-white group-hover:bg-solar-blue/10">
          <ArrowRight size={18} className={isAr ? '' : 'rotate-180'} />
        </div>
        {isAr ? 'العودة للرئيسية' : 'Back to Home'}
      </button>
      
      <div className="bg-solar-card rounded-[40px] p-8 md:p-12 border border-solar-border shadow-sm text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-solar-bg border-2 border-dashed border-solar-border flex items-center justify-center">
          <Package size={32} className="text-solar-muted" />
        </div>
        <h2 className="text-3xl font-black text-solar-text mb-3">{editingProduct ? (isAr ? 'تعديل المنتج' : 'Edit Product') : t.addNewProduct}</h2>
        <p className="text-solar-muted text-sm mb-10 max-w-sm mx-auto leading-relaxed">{t.addNewProductDesc}</p>
        
        <ProductForm 
          key={editingProduct?.id ? `edit-${editingProduct.id}` : 'new-product'}
          lang={lang} 
          onSave={async (p) => { await onAdd(p); }} 
          onCancel={onBack} 
          initialData={editingProduct} 
        />
      </div>
    </motion.div>
  );
};
