export type Locale = 'en' | 'de' | 'fr' | 'it' | 'pt' | 'tr'

export const DEFAULT_LOCALE: Locale = 'en'

export const SUPPORTED_LOCALES: Locale[] = ['en', 'de', 'fr', 'it', 'pt', 'tr']

/** BCP-47 tag per locale for Intl date/number formatting (24h everywhere). */
export const INTL_LOCALE_TAG: Record<Locale, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fr: 'fr-FR',
  it: 'it-IT',
  pt: 'pt-PT',
  tr: 'tr-TR',
}

/**
 * Resolve an ISO-639-1 language (e.g. User.preferredLanguage) to a supported
 * locale. Anstoss is a German-market product, so unknown / missing languages
 * fall back to German rather than English. Shared by email + push localization.
 */
export function resolveLocale(language?: string | null, fallback: Locale = 'de'): Locale {
  // "tr", "tr-TR", "tr_TR", "pt-BR" → base language
  const base = (language || '').trim().toLowerCase().split(/[-_]/)[0]
  return (SUPPORTED_LOCALES as string[]).includes(base) ? (base as Locale) : fallback
}

const translations: Record<Locale, Record<string, string>> = {
  en: {
    'error.not_found': 'Not found',
    'error.unauthorized': 'Please sign in to continue',
    'error.forbidden': 'You do not have permission to perform this action',
    'error.bad_request': 'Invalid request',
    'error.rate_limited': 'Too many requests. Please try again later',
    'error.tenant_scope': 'Select a club to do this',
    'error.age_gate': 'You must be at least 16 years old to use this app',
    'error.internal': 'Something went wrong. Please try again',
    'error.conflict': 'This already exists',
    'error.validation': 'Please check your input',
    'invite.expired': 'This invite has expired',
    'invite.already_used': 'This invite has already been used',
    'club.name_taken': 'This club name is already taken',
    'event.past_date': 'The date must be in the future',
    'member.already_joined': 'You are already a member of this club',
  },
  de: {
    'error.not_found': 'Nicht gefunden',
    'error.unauthorized': 'Bitte melde dich an',
    'error.forbidden': 'Dafür hast du keine Berechtigung',
    'error.bad_request': 'Ungültige Anfrage',
    'error.rate_limited': 'Zu viele Anfragen. Bitte versuch es später noch einmal',
    'error.tenant_scope': 'Für diese Aktion muss ein Verein ausgewählt sein',
    'error.age_gate': 'Du musst mindestens 16 Jahre alt sein, um diese App zu nutzen',
    'error.internal': 'Etwas ist schiefgelaufen. Bitte versuch es noch einmal',
    'error.conflict': 'Das gibt es bereits',
    'error.validation': 'Bitte überprüfe deine Eingaben',
    'invite.expired': 'Diese Einladung ist abgelaufen',
    'invite.already_used': 'Diese Einladung wurde bereits verwendet',
    'club.name_taken': 'Dieser Vereinsname ist bereits vergeben',
    'event.past_date': 'Der Termin muss in der Zukunft liegen',
    'member.already_joined': 'Du bist bereits Mitglied in diesem Verein',
  },
  fr: {
    'error.not_found': 'Introuvable',
    'error.unauthorized': 'Connecte-toi pour continuer',
    'error.forbidden': 'Tu n’as pas l’autorisation d’effectuer cette action',
    'error.bad_request': 'Requête invalide',
    'error.rate_limited': 'Trop de requêtes. Réessaie plus tard',
    'error.tenant_scope': 'Sélectionne un club pour effectuer cette action',
    'error.age_gate': 'Tu dois avoir au moins 16 ans pour utiliser cette application',
    'error.internal': 'Un problème est survenu. Réessaie',
    'error.conflict': 'Cet élément existe déjà',
    'error.validation': 'Vérifie les informations saisies',
    'invite.expired': 'Cette invitation a expiré',
    'invite.already_used': 'Cette invitation a déjà été utilisée',
    'club.name_taken': 'Ce nom de club est déjà pris',
    'event.past_date': 'La date doit être dans le futur',
    'member.already_joined': 'Tu es déjà membre de ce club',
  },
  it: {
    'error.not_found': 'Non trovato',
    'error.unauthorized': 'Accedi per continuare',
    'error.forbidden': 'Non hai il permesso di eseguire questa azione',
    'error.bad_request': 'Richiesta non valida',
    'error.rate_limited': 'Troppe richieste. Riprova più tardi',
    'error.tenant_scope': 'Seleziona un club per eseguire questa azione',
    'error.age_gate': 'Devi avere almeno 16 anni per usare questa app',
    'error.internal': 'Qualcosa è andato storto. Riprova',
    'error.conflict': 'Esiste già',
    'error.validation': 'Controlla i dati inseriti',
    'invite.expired': 'Questo invito è scaduto',
    'invite.already_used': 'Questo invito è già stato usato',
    'club.name_taken': 'Questo nome del club è già in uso',
    'event.past_date': 'La data deve essere nel futuro',
    'member.already_joined': 'Sei già membro di questo club',
  },
  pt: {
    'error.not_found': 'Não encontrado',
    'error.unauthorized': 'Inicia sessão para continuar',
    'error.forbidden': 'Não tens permissão para realizar esta ação',
    'error.bad_request': 'Pedido inválido',
    'error.rate_limited': 'Demasiados pedidos. Tenta novamente mais tarde',
    'error.tenant_scope': 'Seleciona um clube para realizar esta ação',
    'error.age_gate': 'Tens de ter pelo menos 16 anos para usar esta aplicação',
    'error.internal': 'Algo correu mal. Tenta novamente',
    'error.conflict': 'Já existe',
    'error.validation': 'Verifica os dados introduzidos',
    'invite.expired': 'Este convite expirou',
    'invite.already_used': 'Este convite já foi utilizado',
    'club.name_taken': 'Este nome de clube já está a ser utilizado',
    'event.past_date': 'A data tem de ser no futuro',
    'member.already_joined': 'Já és membro deste clube',
  },
  tr: {
    'error.not_found': 'Bulunamadı',
    'error.unauthorized': 'Devam etmek için giriş yap',
    'error.forbidden': 'Bu işlem için yetkin yok',
    'error.bad_request': 'Geçersiz istek',
    'error.rate_limited': 'Çok fazla istek gönderildi. Lütfen biraz sonra tekrar dene',
    'error.tenant_scope': 'Bu işlem için bir kulüp seçmelisin',
    'error.age_gate': 'Bu uygulamayı kullanmak için en az 16 yaşında olmalısın',
    'error.internal': 'Bir şeyler ters gitti. Lütfen tekrar dene',
    'error.conflict': 'Bu kayıt zaten var',
    'error.validation': 'Lütfen girdiğin bilgileri kontrol et',
    'invite.expired': 'Bu davetin süresi doldu',
    'invite.already_used': 'Bu davet zaten kullanıldı',
    'club.name_taken': 'Bu kulüp adı zaten kullanılıyor',
    'event.past_date': 'Tarih ileri bir tarih olmalı',
    'member.already_joined': 'Bu kulübün zaten üyesisin',
  },
}

export default translations
