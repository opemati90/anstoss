const copy = {
  en: {
    link: 'You already have an Anstoss account with this email. Enter the code to connect your sign-in and keep your existing teams and profile.',
    unavailable: 'Please sign in with your email for now.',
    failed: 'Sign-in could not be completed. Please try again or use your email.',
  },
  de: {
    link: 'Du hast bereits ein Anstoss-Konto mit dieser E-Mail. Gib den Code ein, um die Anmeldung zu verknüpfen und deine Teams und dein Profil zu behalten.',
    unavailable: 'Bitte melde dich vorerst mit deiner E-Mail an.',
    failed:
      'Die Anmeldung konnte nicht abgeschlossen werden. Versuche es erneut oder nutze deine E-Mail.',
  },
  fr: {
    link: 'Tu as déjà un compte Anstoss avec cet e-mail. Saisis le code pour associer cette connexion et conserver tes équipes et ton profil.',
    unavailable: 'Connecte-toi avec ton e-mail pour le moment.',
    failed: 'La connexion a échoué. Réessaie ou utilise ton e-mail.',
  },
  it: {
    link: 'Hai già un account Anstoss con questa email. Inserisci il codice per collegare questo accesso e mantenere le tue squadre e il tuo profilo.',
    unavailable: 'Per ora accedi con la tua email.',
    failed: 'Accesso non completato. Riprova oppure usa la tua email.',
  },
  pt: {
    link: 'Já tens uma conta Anstoss com este email. Introduz o código para associar este início de sessão e manter as tuas equipas e o teu perfil.',
    unavailable: 'Por agora, inicia sessão com o teu email.',
    failed: 'Não foi possível iniciar sessão. Tenta novamente ou usa o teu email.',
  },
  tr: {
    link: 'Bu e-posta ile zaten bir Anstoss hesabın var. Giriş yöntemini bağlamak, takımlarını ve profilini korumak için kodu gir.',
    unavailable: 'Şimdilik e-postanla giriş yap.',
    failed: 'Giriş tamamlanamadı. Tekrar dene veya e-postanı kullan.',
  },
}
const recovery = {
  en: {
    restartTitle: 'Start sign-in again',
    restartBody:
      'This sign-in attempt has expired or is no longer valid. Choose a sign-in method to continue.',
    restartCta: 'Choose sign-in method',
  },
  de: {
    restartTitle: 'Anmeldung neu starten',
    restartBody:
      'Dieser Anmeldeversuch ist abgelaufen oder nicht mehr gültig. Wähle eine Anmeldemethode, um fortzufahren.',
    restartCta: 'Anmeldemethode wählen',
  },
  fr: {
    restartTitle: 'Recommencer la connexion',
    restartBody:
      'Cette tentative de connexion a expiré ou n’est plus valide. Choisis une méthode de connexion pour continuer.',
    restartCta: 'Choisir une méthode',
  },
  it: {
    restartTitle: 'Ricomincia l’accesso',
    restartBody:
      'Questo tentativo di accesso è scaduto o non è più valido. Scegli un metodo di accesso per continuare.',
    restartCta: 'Scegli come accedere',
  },
  pt: {
    restartTitle: 'Reiniciar o início de sessão',
    restartBody:
      'Esta tentativa de início de sessão expirou ou já não é válida. Escolhe um método para continuar.',
    restartCta: 'Escolher como entrar',
  },
  tr: {
    restartTitle: 'Girişi yeniden başlat',
    restartBody:
      'Bu giriş denemesinin süresi doldu veya artık geçerli değil. Devam etmek için bir giriş yöntemi seç.',
    restartCta: 'Giriş yöntemi seç',
  },
}
export function socialLoginCopy(language: string) {
  const locale = language?.split('-')[0] as keyof typeof copy
  return { ...(copy[locale] ?? copy.en), ...(recovery[locale] ?? recovery.en) }
}
