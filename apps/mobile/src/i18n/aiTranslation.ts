import type { AppLanguage } from './preferences'

type Copy = {
  title: string
  disclosure: string
  confirm: string
  cancel: string
  loading: string
  saving: string
  error: string
  retry: string
  unavailable: string
}
export const aiTranslationCopy: Record<AppLanguage, Copy> = {
  en: {
    title: 'AI chat translation',
    disclosure:
      'Allow Anstoss to send the text of your future chat and direct messages to OpenAI for translation. Translation works only when both sender and reader opt in. Older messages are not sent. OpenAI does not train on API data by default, but may retain it for up to 30 days for abuse monitoring, or longer when required. Translations can be wrong. You can turn this off here at any time; this stops new requests, not requests already sent.',
    confirm: 'Allow translation',
    cancel: 'Not now',
    loading: 'Loading preference…',
    saving: 'Saving…',
    error: 'Could not confirm your preference. Please try again.',
    retry: 'Try again',
    unavailable: 'Translation is temporarily unavailable. You can still turn off your permission.',
  },
  de: {
    title: 'KI-Chatübersetzung',
    disclosure:
      'Erlaube Anstoss, den Text deiner künftigen Chat- und Direktnachrichten zur Übersetzung an OpenAI zu senden. Absender und Leser müssen zustimmen. Ältere Nachrichten werden nicht gesendet. OpenAI trainiert standardmäßig nicht mit API-Daten, kann sie aber zur Missbrauchskontrolle bis zu 30 Tage oder bei Bedarf länger speichern. Übersetzungen können falsch sein. Du kannst dies hier jederzeit ausschalten; das stoppt neue, nicht bereits gesendete Anfragen.',
    confirm: 'Übersetzung erlauben',
    cancel: 'Nicht jetzt',
    loading: 'Einstellung wird geladen…',
    saving: 'Wird gespeichert…',
    error: 'Deine Einstellung konnte nicht bestätigt werden. Bitte erneut versuchen.',
    retry: 'Erneut versuchen',
    unavailable:
      'Übersetzung ist vorübergehend nicht verfügbar. Du kannst deine Erlaubnis trotzdem ausschalten.',
  },
  fr: {
    title: 'Traduction des messages par IA',
    disclosure:
      'Autorise Anstoss à envoyer le texte de tes futurs messages de groupe et privés à OpenAI pour les traduire. Expéditeur et lecteur doivent accepter. Les anciens messages ne sont pas envoyés. Par défaut, OpenAI n’entraîne pas ses modèles sur les données API, mais peut les conserver jusqu’à 30 jours pour prévenir les abus, ou plus si nécessaire. Les traductions peuvent être incorrectes. Tu peux désactiver cette option ici à tout moment ; cela arrête les nouvelles demandes, pas celles déjà envoyées.',
    confirm: 'Autoriser la traduction',
    cancel: 'Pas maintenant',
    loading: 'Chargement du réglage…',
    saving: 'Enregistrement…',
    error: 'Impossible de confirmer ton choix. Réessaie.',
    retry: 'Réessayer',
    unavailable:
      'Traduction temporairement indisponible. Tu peux toujours retirer ton autorisation.',
  },
  it: {
    title: 'Traduzione IA dei messaggi',
    disclosure:
      'Consenti ad Anstoss di inviare il testo dei tuoi futuri messaggi di chat e privati a OpenAI per tradurli. Mittente e lettore devono acconsentire. I vecchi messaggi non vengono inviati. Per impostazione predefinita OpenAI non usa i dati API per addestrare i modelli, ma può conservarli fino a 30 giorni per prevenire abusi, o più a lungo se necessario. Le traduzioni possono essere errate. Puoi disattivare questa opzione qui in qualsiasi momento: fermerai le nuove richieste, non quelle già inviate.',
    confirm: 'Consenti traduzione',
    cancel: 'Non ora',
    loading: 'Caricamento preferenza…',
    saving: 'Salvataggio…',
    error: 'Impossibile confermare la preferenza. Riprova.',
    retry: 'Riprova',
    unavailable: 'Traduzione temporaneamente non disponibile. Puoi comunque revocare il consenso.',
  },
  pt: {
    title: 'Tradução de mensagens por IA',
    disclosure:
      'Permite que o Anstoss envie o texto das tuas futuras mensagens de grupo e privadas à OpenAI para tradução. Remetente e leitor têm de consentir. As mensagens antigas não são enviadas. Por predefinição, a OpenAI não treina com dados da API, mas pode guardá-los até 30 dias para prevenir abusos, ou mais tempo se necessário. As traduções podem estar erradas. Podes desativar aqui a qualquer momento; isso impede novos pedidos, não os já enviados.',
    confirm: 'Permitir tradução',
    cancel: 'Agora não',
    loading: 'A carregar preferência…',
    saving: 'A guardar…',
    error: 'Não foi possível confirmar a preferência. Tenta novamente.',
    retry: 'Tentar novamente',
    unavailable: 'Tradução temporariamente indisponível. Podes retirar a tua permissão na mesma.',
  },
  tr: {
    title: 'Yapay zekâ ile mesaj çevirisi',
    disclosure:
      'Anstoss’un bundan sonra göndereceğin sohbet ve özel mesajların metnini çeviri için OpenAI’a göndermesine izin ver. Gönderen ve okuyan onay vermelidir. Eski mesajlar gönderilmez. OpenAI varsayılan olarak API verileriyle eğitim yapmaz; kötüye kullanımı önlemek için 30 güne kadar, gerektiğinde daha uzun saklayabilir. Çeviriler hatalı olabilir. Buradan istediğin zaman kapatabilirsin; bu, gönderilmiş istekleri değil yeni istekleri durdurur.',
    confirm: 'Çeviriye izin ver',
    cancel: 'Şimdi değil',
    loading: 'Tercih yükleniyor…',
    saving: 'Kaydediliyor…',
    error: 'Tercihin doğrulanamadı. Tekrar dene.',
    retry: 'Tekrar dene',
    unavailable: 'Çeviri geçici olarak kullanılamıyor. İznini yine de kapatabilirsin.',
  },
}
