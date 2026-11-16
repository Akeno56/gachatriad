'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { LocaleView } from './i18n';
import { useSession } from './session';
const Context = createContext<(message: string) => void>(() => {});
export const useActionNotice = () => useContext(Context);
export function ActionNoticeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useSession();
  const [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setNotice('');
  }, []);
  const notify = useCallback((message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setNotice(message);
    timer.current = setTimeout(() => {
      setNotice('');
      timer.current = null;
    }, 4500);
  }, []);
  useEffect(() => {
    clear();
    return clear;
  }, [profile?.id, clear]);
  return (
    <Context.Provider value={notify}>
      {children}
      <LocaleView>
        <div
          className={`action-notice ${notice ? 'is-visible' : ''}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {notice && (
            <>
              <span aria-hidden="true">✓</span>
              <span>{notice}</span>
              <button type="button" aria-label="Dismiss notification" onClick={clear}>
                ×
              </button>
            </>
          )}
        </div>
      </LocaleView>
    </Context.Provider>
  );
}
