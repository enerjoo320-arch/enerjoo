import React, { useState, useEffect } from 'react';
import { Shield, Check, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SecurityCaptchaProps {
  lang: 'ar' | 'en';
  onVerify: (verified: boolean) => void;
}

export const SecurityCaptcha: React.FC<SecurityCaptchaProps> = ({ lang, onVerify }) => {
  const isAr = lang === 'ar';
  
  const [isChecked, setIsChecked] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [error, setError] = useState('');

  const generateChallenge = () => {
    setNum1(Math.floor(Math.random() * 9) + 1);
    setNum2(Math.floor(Math.random() * 9) + 1);
    setUserAnswer('');
    setError('');
  };

  useEffect(() => {
    generateChallenge();
  }, []);

  const handleCheckboxClick = () => {
    if (isChecked) {
      setIsChecked(false);
      onVerify(false);
      return;
    }
    generateChallenge();
    setShowChallenge(true);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const correct = num1 + num2;
    if (parseInt(userAnswer) === correct) {
      setIsChecked(true);
      setShowChallenge(false);
      onVerify(true);
      setError('');
    } else {
      setError(isAr ? 'إجابة غير صحيحة، يرجى المحاولة مجدداً' : 'Incorrect answer, please try again');
      generateChallenge();
      onVerify(false);
    }
  };

  return (
    <div className="space-y-3 font-sans">
      {/* reCAPTCHA Core box */}
      <div className="flex items-center justify-between p-4 bg-solar-bg border border-solar-border rounded-2xl shadow-inner relative overflow-hidden select-none">
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input 
              type="checkbox" 
              checked={isChecked} 
              onChange={handleCheckboxClick}
              className="sr-only"
            />
            <div className={`w-6 h-6 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${
              isChecked 
                ? 'bg-solar-success border-solar-success text-white' 
                : 'border-solar-muted hover:border-solar-blue bg-white'
            }`}>
              {isChecked && <Check size={14} className="stroke-[3]" />}
            </div>
          </div>
          <span className="text-xs font-black text-solar-text">
            {isAr ? 'أنا لست برنامج روبوت' : "I'm not a robot"}
          </span>
        </label>

        <div className="flex flex-col items-center gap-1 opacity-80">
          <Shield className={`w-6 h-6 ${isChecked ? 'text-solar-success' : 'text-solar-blue'}`} />
          <span className="text-[7px] text-solar-muted font-bold tracking-tight">reCAPTCHA</span>
        </div>
      </div>

      {/* Challenge Drawer */}
      <AnimatePresence>
        {showChallenge && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-white/80 border border-solar-blue/20 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-solar-blue">
                  {isAr ? 'التحقق الأمني' : 'Security Verification'}
                </span>
                <button 
                  type="button" 
                  onClick={generateChallenge}
                  className="p-1 hover:bg-solar-light text-solar-muted hover:text-solar-blue rounded-lg transition"
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              <div className="flex items-center gap-3 justify-center py-2 bg-solar-light rounded-xl border border-solar-border/40">
                <span className="text-lg font-black text-solar-text font-mono tracking-widest">{num1} + {num2} = </span>
                <input 
                  type="number"
                  placeholder="?"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  className="w-16 bg-white border border-solar-border rounded-lg py-1.5 px-3 outline-none focus:border-solar-blue font-black text-center text-solar-text text-sm"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-[10px] text-solar-danger font-bold text-center">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleVerify}
                className="w-full bg-solar-blue text-white py-2 rounded-xl text-xs font-black hover:bg-opacity-90 transition active:scale-95"
              >
                {isAr ? 'تأكيد التحقق' : 'Confirm Verification'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
