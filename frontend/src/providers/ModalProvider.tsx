import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertTriangle, Info, HelpCircle } from 'lucide-react';

interface ModalContextType {
  showAlert: (title: string, message?: string) => Promise<void>;
  showConfirm: (title: string, message?: string) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

interface ModalState {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  title: string;
  message?: string;
  resolve: (value: boolean | PromiseLike<boolean>) => void;
}

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<ModalState | null>(null);

  const showAlert = (title: string, message?: string): Promise<void> => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        type: 'alert',
        title,
        message,
        resolve: () => resolve(),
      });
    });
  };

  const showConfirm = (title: string, message?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        resolve,
      });
    });
  };

  const handleClose = (value: boolean = false) => {
    if (modalState) {
      modalState.resolve(value);
      setModalState(null);
    }
  };

  const getIconAndColor = () => {
    const title = modalState?.title.toLowerCase() || '';
    if (title.includes('success')) return { Icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
    if (title.includes('error') || title.includes('fail')) return { Icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' };
    if (title.includes('warning') || title.includes('limit')) return { Icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' };
    if (modalState?.type === 'confirm' || title.includes('change') || title.includes('delete') || title.includes('deactivate')) return { Icon: HelpCircle, color: 'text-primary', bg: 'bg-primary/10' };
    return { Icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10' };
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {modalState && modalState.isOpen && (() => {
        const { Icon, color, bg } = getIconAndColor();
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-[360px] overflow-hidden rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white backdrop-blur-xl animate-in zoom-in-95 fade-in duration-200">
              <div className="p-6">
                <div className="flex gap-4 items-start">
                  <div className={`p-2.5 rounded-full shrink-0 ${bg}`}>
                    <Icon className={color} size={22} />
                  </div>
                  <div className="flex-1 pt-0.5">
                    <h3 className="text-base font-semibold tracking-tight">{modalState.title}</h3>
                    {modalState.message && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                        {modalState.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  {modalState.type === 'confirm' && (
                    <Button variant="ghost" size="sm" className="h-9 px-4 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleClose(false)}>
                      Cancel
                    </Button>
                  )}
                  <Button size="sm" className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-900/20" onClick={() => handleClose(true)}>
                    {modalState.type === 'confirm' ? 'Confirm' : 'Got it'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </ModalContext.Provider>
  );
};
