import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import bn from './locales/bn.json';
import mr from './locales/mr.json';
import ta from './locales/ta.json';

export type SupportedLanguage = 'en' | 'hi' | 'bn' | 'mr' | 'ta';

export const SUPPORTED_LANGUAGES: Array<{
  code: SupportedLanguage;
  nativeName: string;
  englishName: string;
}> = [
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali' },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi' },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil' },
];

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  bn: { translation: bn },
  mr: { translation: mr },
  ta: { translation: ta },
} as const;

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });
}

export default i18n;
