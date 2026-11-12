import { createContext, Fragment, useCallback, useContext, useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { getLang, loadLanguage, type Lang } from "@/lib/i18n"

/*
 * The interface language. English by default; the choice is saved on the
 * user's account (Settings) and, for the sign-in pages, in this browser.
 * Changing it re-renders the app so every text and date updates.
 */

const STORAGE_KEY = "yugantar.lang"

interface LanguageState {
  lang: Lang
  /** Change the language; saved to the account when signed in. */
  setLanguage: (lang: Lang) => Promise<void>
}

const LanguageContext = createContext<LanguageState>({ lang: "en", setLanguage: async () => {} })

function remember(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* private mode: fine */
  }
}

function storedLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "ne" ? "ne" : "en"
  } catch {
    return "en"
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user, updateProfile } = useAuth()
  const [lang, setLang] = useState<Lang>(getLang())
  const [ready, setReady] = useState(false)

  const apply = useCallback(async (next: Lang) => {
    await loadLanguage(next)
    remember(next)
    setLang(next)
    setReady(true)
  }, [])

  // On start: this browser's last choice; once signed in, the account's choice
  const accountLang = user?.preferred_language
  useEffect(() => {
    const wanted: Lang = accountLang === "ne" ? "ne" : accountLang === "en" ? "en" : storedLang()
    if (ready && wanted === getLang()) return
    let cancelled = false
    loadLanguage(wanted).then(() => {
      if (cancelled) return
      remember(wanted)
      setLang(wanted)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [accountLang, ready])

  const setLanguage = useCallback(
    async (next: Lang) => {
      await apply(next)
      if (user && user.preferred_language !== next) {
        try {
          await updateProfile({ preferred_language: next })
        } catch {
          /* the interface still switches; saving can be retried in Settings */
        }
      }
    },
    [apply, user, updateProfile],
  )

  if (!ready) return null
  // key: re-render everything in the new language
  return (
    <LanguageContext.Provider value={{ lang, setLanguage }}>
      <Fragment key={lang}>{children}</Fragment>
    </LanguageContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useLanguage = () => useContext(LanguageContext)
