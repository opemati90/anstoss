import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { StudioBrandKit, StudioElements, StudioTemplate } from '@anstoss/shared'
import { getAppLanguage, getAppLocale } from '../i18n'
import { buildGraphicData, type StudioGraphicData, type StudioGraphicOptions, type StudioMatchInput } from './buildGraphicData'

export const ALL_ELEMENTS: StudioElements = { sponsor: true, handle: true, competition: true }

/** Binds the pure builder to the app language. */
export function useGraphicBuilder(match: StudioMatchInput, kit: StudioBrandKit | null) {
  const { t, i18n } = useTranslation()
  const locale = getAppLocale(getAppLanguage())
  const rtl = i18n.dir?.() === 'rtl'
  const build = useCallback(
    (template: StudioTemplate, extra?: Partial<Omit<StudioGraphicOptions, 'template' | 't' | 'locale'>>): StudioGraphicData =>
      buildGraphicData(match, kit, {
        elements: ALL_ELEMENTS,
        ...extra,
        template,
        t: t as never,
        locale,
        rtl,
      }),
    [match, kit, t, locale, rtl],
  )
  return useMemo(() => ({ build, t, locale }), [build, t, locale])
}
