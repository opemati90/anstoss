/* Anstoss website localisation.
   Copy: docs/redesign/handoff/website-copy.json (+ pricing strings from the
   WebDesktop/WebMobile boards). Translations other than de/en still need
   native-speaker review before launch (ar and tr first).

   Locale order:
     1. ?lang= URL param
     2. localStorage anstoss.lang (explicit choice)
     3. navigator.languages
     4. fallback: de

   Pages opt in with <body data-site="home">. Other pages (signup, legal...)
   keep their German text; the binding legal text is German. */
;(() => {
  const LANGS = ['de', 'en', 'tr', 'es', 'fr', 'pt', 'ar']
  const STORE_KEY = 'anstoss.lang'
  const OG_LOCALE = {
    de: 'de_DE',
    en: 'en_GB',
    tr: 'tr_TR',
    es: 'es_ES',
    fr: 'fr_FR',
    pt: 'pt_PT',
    ar: 'ar_AR',
  }
  const COPY = {
    de: {
      name: 'Deutsch',
      nav_features: 'Funktionen',
      nav_clubs: 'Für Vereine',
      nav_faq: 'FAQ',
      nav_cta: 'App laden',
      eyebrow: 'Für Amateurvereine',
      h1: 'Dein Verein.\nEin Anpfiff.',
      lede: 'Termine, Zusagen, Aufstellung, Live-Ticker, Chat und Beiträge in einer App. In euren Vereinsfarben, ohne WhatsApp-Chaos.',
      club: 'Verein anlegen',
      trust: [
        'Hosting in der EU',
        'Sichtbarkeit selbst bestimmen',
        'Kein Geld über die App',
        '6 App-Sprachen',
      ],
      roles_h2: 'Jede Rolle sieht, was sie braucht.',
      roles_sub:
        'Eine Person kann Spieler, Kapitän, Trainer und Vorstand zugleich sein. Anstoss zeigt alles in einer Ansicht.',
      roles: [
        [
          'Trainer',
          'Den Spieltag im Griff',
          [
            'Termine in Sekunden anlegen, auch wöchentlich',
            'Sehen, wer kommt, und Offene mit einem Tap erinnern',
            'Aufstellung bauen und direkt ans Team schicken',
          ],
        ],
        [
          'Spieler',
          'Ein Tap zur Zusage',
          [
            'Dabei, vielleicht oder Absage direkt auf dem Startbildschirm',
            'Treffpunkt, Ort und Trikot immer aktuell',
            'Eigene Einsätze, Tore und Trainings im Blick',
          ],
        ],
        [
          'Vereinslos',
          'Dein nächstes Team finden',
          [
            'Als Spieler oder Trainer ein Suchprofil anlegen',
            'Sichtbarkeit selbst einschalten oder pausieren',
            'Gesuche ansehen und Probetrainings anfragen',
          ],
        ],
        [
          'Vorstand',
          'Der ganze Verein auf einen Blick',
          [
            'Alle Teams, Rollen und Beitrittsanfragen',
            'Beitragsstand ohne Excel',
            'Kurz als Trainer einspringen, sauber protokolliert',
          ],
        ],
      ],
      brand_h2: 'Euer Verein ist die Marke.',
      brand_sub: 'Wappen und Vereinsfarben prägen die ganze App. Probier es aus.',
      brand_pick: 'Vereinsfarbe wählen',
      flow_h2: 'Vom Termin bis zum Abpfiff.',
      flow: [
        ['Termin anlegen', 'Training oder Spiel, mit Treffpunkt und Erinnerung.'],
        ['Zusagen sammeln', 'Das Team antwortet mit einem Tap. Du siehst sofort, wer fehlt.'],
        ['Aufstellung teilen', 'Formation wählen, Spieler einsetzen, ans Team senden.'],
        ['Live begleiten', 'Tore und Wechsel erfassen, alle sind dabei.'],
      ],
      dues_h2: 'Beiträge im Blick. Das Geld bleibt beim Verein.',
      dues_b:
        'Mitglieder überweisen direkt aufs Vereinskonto, per GiroCode in der Banking-App. Anstoss zeigt nur, wer bezahlt hat.',
      dues_p: [
        'GiroCode mit allen Angaben vorausgefüllt',
        'Kontoauszug in Sekunden abgleichen',
        'Offene mit einem Tap erinnern',
      ],
      lang_h2: 'Jeder liest in seiner Sprache.',
      lang_b:
        'Die App bietet Deutsch, Englisch, Französisch, Italienisch, Portugiesisch und Türkisch. Die Website ist in sieben Sprachen verfügbar.',
      lang_from: 'Original',
      faq_h2: 'Häufige Fragen',
      faq: [
        [
          'Brauchen wir externe Spielplandaten?',
          'Nein. Lege Training und Spiele direkt an. Ein automatischer Import von FUSSBALL.DE ist im MVP nicht verfügbar.',
        ],
        [
          'Wer sieht welche Daten?',
          'Spieler sehen ihr Team, Trainer ihren Kader und berechtigte Vereinsadmins ihren Verein. Suchprofile werden nur bei aktivierter Suche und passender Sichtbarkeit angezeigt.',
        ],
        [
          'Zieht Anstoss Beiträge ein?',
          'Nein. Mitglieder zahlen direkt an den Verein. Anstoss zeigt nur den Stand.',
        ],
        [
          'Können Kinder unter 16 Anstoss nutzen?',
          'Zum Start ist Anstoss ab 16 Jahren verfügbar. Familien- und Kinderkonten sind noch nicht freigeschaltet.',
        ],
        ['Auf welchen Geräten läuft Anstoss?', 'Auf iPhone und Android.'],
      ],
      cta_h2: 'Bereit für den Anpfiff?',
      cta_b: 'Verein in zwei Minuten anlegen, Code teilen, fertig.',
      foot: ['Impressum', 'Datenschutz', 'Konto löschen'],
      m_next: 'Als Nächstes',
      m_kick: 'So 14:00',
      m_vs: 'vs. Rot-Weiß Köpenick III',
      m_yes: 'Dabei',
      m_maybe: 'Vielleicht',
      m_no: 'Absage',
      m_count: '14 dabei · 3 vielleicht · 5 offen',
      m_remind: 'Erinnern',
      m_open5: '5 haben nicht geantwortet',
      m_in: 'Eingegangen',
      m_out: 'Offen',
      m_car: 'Fahrgemeinschaft',
      m_msg: 'Wer nimmt die Bälle mit?',
      dir: 'ltr',
      nav_pricing: 'Preise',
      pr_h2: 'Ein fairer Preis für den ganzen Verein.',
      pr_sub: 'Starte kostenlos mit einem Team. Upgrade, wenn der Verein mitzieht.',
      pr_month: 'Monatlich',
      pr_year: 'Jährlich',
      pr_save: '2 Monate gratis',
      free_name: 'Kostenlos',
      free_price: '0 €',
      free_per: 'für immer',
      free_for: 'Für ein Team zum Start',
      free_feats: [
        '1 Team, bis 30 Spieler',
        'Termine und Zusagen',
        'Team-Chat',
        'Kader und Aufstellung',
      ],
      free_cta: 'Kostenlos starten',
      club_name: 'Verein',
      club_perm: 'pro Monat',
      club_pery: 'pro Jahr',
      club_for: 'Für den ganzen Verein',
      club_feats: [
        'Bis zu 5 Teams und 150 Spieler',
        'Vereinsfarben und Wappen',
        'Live-Ticker und Aufstellung teilen',
        'Automatische Erinnerungen',
        'Beiträge im Blick mit GiroCode',
        'Vorschau und Vertretung für den Vorstand',
      ],
      club_cta: '30 Tage kostenlos testen',
      rec: 'Empfohlen',
      pr_note: 'Pro Verein, nicht pro Kopf. Bei 22 Spielern keine 50 Cent pro Spieler im Monat.',
      pr_fine:
        'Preise inkl. MwSt. Monatliche oder jährliche Abrechnung; kündbar zum Ende des bezahlten Zeitraums.',
      pr_big: 'Mehr als 5 Teams? Schreib uns.',
    },
    en: {
      name: 'English',
      nav_features: 'Features',
      nav_clubs: 'For clubs',
      nav_faq: 'FAQ',
      nav_cta: 'Get the app',
      eyebrow: 'For grassroots clubs',
      h1: 'Your club.\nOne kickoff.',
      lede: 'Fixtures, availability, lineups, live updates, chat and dues in one app. In your club colours, without the group-chat chaos.',
      club: 'Set up a club',
      trust: [
        'Hosted in the EU',
        'You control visibility',
        'No money through the app',
        '6 app languages',
      ],
      roles_h2: 'Every role sees what it needs.',
      roles_sub:
        'One person can be player, captain, coach and board member at once. Anstoss shows it all in one view.',
      roles: [
        [
          'Coach',
          'Matchday under control',
          [
            'Create sessions in seconds, weekly too',
            'See who is coming and nudge the rest in one tap',
            'Build the lineup and send it to the team',
          ],
        ],
        [
          'Player',
          'One tap to say you are in',
          [
            'In, maybe or out right on the home screen',
            'Meeting time, venue and kit always up to date',
            'Your appearances, goals and training at a glance',
          ],
        ],
        [
          'Free agent',
          'Find your next team',
          [
            'Create a recruitment profile as a player or coach',
            'Switch discovery on or pause it yourself',
            'Browse vacancies and request trials',
          ],
        ],
        [
          'Board',
          'The whole club at a glance',
          [
            'All teams, roles and join requests',
            'Dues status without spreadsheets',
            'Step in as coach briefly, fully logged',
          ],
        ],
      ],
      brand_h2: 'Your club is the brand.',
      brand_sub: 'Your crest and colours shape the whole app. Try it.',
      brand_pick: 'Pick a club colour',
      flow_h2: 'From fixture to final whistle.',
      flow: [
        ['Create the event', 'Training or match, with meeting time and reminder.'],
        ['Collect answers', 'The team replies in one tap. You see who is missing straight away.'],
        ['Share the lineup', 'Pick a formation, place players, send it to the team.'],
        ['Follow it live', 'Log goals and subs so everyone is in the loop.'],
      ],
      dues_h2: 'Dues at a glance. The money stays with the club.',
      dues_b:
        'Members pay the club account directly with a payment QR code in their banking app. Anstoss only shows who has paid.',
      dues_p: [
        'Payment QR with every detail prefilled',
        'Match bank statements in seconds',
        'Remind open payments in one tap',
      ],
      lang_h2: 'Everyone reads in their own language.',
      lang_b:
        'The app supports German, English, French, Italian, Portuguese and Turkish. The website is available in seven languages.',
      lang_from: 'Translated from German',
      faq_h2: 'Questions',
      faq: [
        [
          'Do we need external fixture data?',
          'No. Create training sessions and matches directly. Automatic FUSSBALL.DE imports are not available in the MVP.',
        ],
        [
          'Who sees which data?',
          'Players see their team, coaches their squad and authorised club admins their club. Recruitment profiles appear only when discovery and visibility allow it.',
        ],
        [
          'Does Anstoss collect dues?',
          'No. Members pay the club directly. Anstoss only shows the status.',
        ],
        [
          'Can children under 16 use Anstoss?',
          'At launch Anstoss is available from age 16. Family and child accounts are not enabled yet.',
        ],
        ['Which devices are supported?', 'iPhone and Android.'],
      ],
      cta_h2: 'Ready for kickoff?',
      cta_b: 'Set up your club in two minutes, share the code, done.',
      foot: ['Imprint', 'Privacy', 'Delete account'],
      m_next: 'Next up',
      m_kick: 'Sun 14:00',
      m_vs: 'vs. Rot-Weiß Köpenick III',
      m_yes: 'In',
      m_maybe: 'Maybe',
      m_no: 'Out',
      m_count: '14 in · 3 maybe · 5 open',
      m_remind: 'Remind',
      m_open5: '5 have not replied',
      m_in: 'Received',
      m_out: 'Open',
      m_car: 'Carpool',
      m_msg: "Who's bringing the balls?",
      dir: 'ltr',
      nav_pricing: 'Pricing',
      pr_h2: 'One fair price for the whole club.',
      pr_sub: 'Start free with one team. Upgrade when the club joins in.',
      pr_month: 'Monthly',
      pr_year: 'Yearly',
      pr_save: '2 months free',
      free_name: 'Free',
      free_price: '€0',
      free_per: 'forever',
      free_for: 'For one team to get started',
      free_feats: [
        '1 team, up to 30 players',
        'Events and availability',
        'Team chat',
        'Squad and lineup',
      ],
      free_cta: 'Start free',
      club_name: 'Club',
      club_perm: 'per month',
      club_pery: 'per year',
      club_for: 'For the whole club',
      club_feats: [
        'Up to 5 teams and 150 players',
        'Club colours and crest',
        'Live updates and lineup sharing',
        'Automatic reminders',
        'Dues tracking with payment QR',
        'Preview and cover for the board',
      ],
      club_cta: 'Try free for 30 days',
      rec: 'Recommended',
      pr_note: 'Per club, not per head. With 22 players that is under 50 cents each per month.',
      pr_fine:
        'Prices include VAT. Monthly or yearly billing; cancel at the end of the paid period.',
      pr_big: 'More than 5 teams? Get in touch.',
    },
    tr: {
      name: 'Türkçe',
      nav_features: 'Özellikler',
      nav_clubs: 'Kulüpler için',
      nav_faq: 'SSS',
      nav_cta: 'Uygulamayı indir',
      eyebrow: 'Amatör kulüpler için',
      h1: 'Kulübün.\nTek düdük.',
      lede: 'Maç takvimi, katılım, kadro, canlı skor, sohbet ve aidatlar tek uygulamada. Kulüp renklerinde, WhatsApp karmaşası olmadan.',
      club: 'Kulüp oluştur',
      trust: [
        "AB'de barındırma",
        'Görünürlüğü siz belirlersiniz',
        'Uygulama üzerinden para yok',
        'Uygulamada 6 dil',
      ],
      roles_h2: 'Her rol ihtiyacını görür.',
      roles_sub:
        'Bir kişi aynı anda oyuncu, kaptan, antrenör ve yönetici olabilir. Anstoss hepsini tek ekranda gösterir.',
      roles: [
        [
          'Antrenör',
          'Maç günü kontrolünde',
          [
            'Antrenmanları saniyeler içinde oluştur, haftalık da',
            'Kimin geldiğini gör, diğerlerine tek dokunuşla hatırlat',
            'Kadroyu kur ve takıma gönder',
          ],
        ],
        [
          'Oyuncu',
          'Tek dokunuşla katıl',
          [
            'Varım, belki veya yokum, doğrudan ana ekranda',
            'Buluşma saati, saha ve forma hep güncel',
            'Maçların, gollerin ve antrenmanların bir bakışta',
          ],
        ],
        [
          'Serbest aday',
          'Bir sonraki takımını bul',
          [
            'Oyuncu veya antrenör olarak profil oluştur',
            'Görünürlüğünü aç veya duraklat',
            'İlanlara göz at ve deneme talep et',
          ],
        ],
        [
          'Yönetim',
          'Tüm kulüp bir bakışta',
          [
            'Tüm takımlar, roller ve katılım talepleri',
            "Excel'siz aidat durumu",
            'Kısa süreliğine antrenörlüğü devral, kayıt altında',
          ],
        ],
      ],
      brand_h2: 'Marka senin kulübün.',
      brand_sub: 'Arma ve kulüp renkleri tüm uygulamaya yansır. Dene.',
      brand_pick: 'Kulüp rengini seç',
      flow_h2: 'Takvimden son düdüğe.',
      flow: [
        ['Etkinlik oluştur', 'Antrenman veya maç, buluşma saati ve hatırlatmayla.'],
        [
          'Yanıtları topla',
          'Takım tek dokunuşla yanıt verir. Kimin eksik olduğunu hemen görürsün.',
        ],
        ['Kadroyu paylaş', 'Diziliş seç, oyuncuları yerleştir, takıma gönder.'],
        ['Canlı takip et', 'Golleri ve değişiklikleri gir, herkes haberdar olsun.'],
      ],
      dues_h2: 'Aidatlar göz önünde. Para kulüpte kalır.',
      dues_b:
        'Üyeler banka uygulamasındaki ödeme QR koduyla doğrudan kulüp hesabına öder. Anstoss yalnızca kimin ödediğini gösterir.',
      dues_p: [
        'Tüm bilgileri hazır ödeme QR kodu',
        'Hesap dökümünü saniyeler içinde eşleştir',
        'Ödemeyenlere tek dokunuşla hatırlat',
      ],
      lang_h2: 'Herkes kendi dilinde okur.',
      lang_b:
        'Uygulama Almanca, İngilizce, Fransızca, İtalyanca, Portekizce ve Türkçe sunar. Web sitesi yedi dilde kullanılabilir.',
      lang_from: 'Almancadan çevrildi',
      faq_h2: 'Sık sorulanlar',
      faq: [
        [
          'Harici fikstür verisine ihtiyacımız var mı?',
          'Hayır. Antrenman ve maçları doğrudan oluşturun. MVP sürümünde otomatik FUSSBALL.DE aktarımı yoktur.',
        ],
        [
          'Kim hangi verileri görür?',
          'Oyuncular takımlarını, antrenörler kadrolarını, yetkili yöneticiler kulüplerini görür. Aday profilleri yalnızca arama ve görünürlük açıkken listelenir.',
        ],
        [
          'Anstoss aidat tahsil ediyor mu?',
          'Hayır. Üyeler doğrudan kulübe öder. Anstoss yalnızca durumu gösterir.',
        ],
        [
          "16 yaş altı çocuklar Anstoss'u kullanabilir mi?",
          'Başlangıçta Anstoss 16 yaş ve üzeri içindir. Aile ve çocuk hesapları henüz açık değildir.',
        ],
        ['Hangi cihazlarda çalışır?', 'iPhone ve Android.'],
      ],
      cta_h2: 'Başlama düdüğüne hazır mısın?',
      cta_b: 'Kulübünü iki dakikada oluştur, kodu paylaş, bitti.',
      foot: ['Künye', 'Gizlilik', 'Hesabı sil'],
      m_next: 'Sıradaki',
      m_kick: 'Paz 14:00',
      m_vs: 'vs. Rot-Weiß Köpenick III',
      m_yes: 'Varım',
      m_maybe: 'Belki',
      m_no: 'Yokum',
      m_count: '14 var · 3 belki · 5 açık',
      m_remind: 'Hatırlat',
      m_open5: '5 kişi yanıt vermedi',
      m_in: 'Gelen',
      m_out: 'Açık',
      m_car: 'Ortak araç',
      m_msg: 'Topları kim getiriyor?',
      dir: 'ltr',
      nav_pricing: 'Fiyatlar',
      pr_h2: 'Tüm kulüp için tek, adil fiyat.',
      pr_sub: 'Tek takımla ücretsiz başla. Kulüp de katılınca yükselt.',
      pr_month: 'Aylık',
      pr_year: 'Yıllık',
      pr_save: '2 ay ücretsiz',
      free_name: 'Ücretsiz',
      free_price: '0 €',
      free_per: 'süresiz',
      free_for: 'Başlamak için tek takım',
      free_feats: [
        '1 takım, en fazla 30 oyuncu',
        'Etkinlikler ve katılım',
        'Takım sohbeti',
        'Kadro ve diziliş',
      ],
      free_cta: 'Ücretsiz başla',
      club_name: 'Kulüp',
      club_perm: 'aylık',
      club_pery: 'yıllık',
      club_for: 'Tüm kulüp için',
      club_feats: [
        'En fazla 5 takım ve 150 oyuncu',
        'Kulüp renkleri ve arma',
        'Canlı skor ve diziliş paylaşımı',
        'Otomatik hatırlatmalar',
        'Ödeme QR koduyla aidat takibi',
        'Yönetim için önizleme ve vekalet',
      ],
      club_cta: '30 gün ücretsiz dene',
      rec: 'Önerilen',
      pr_note: 'Kişi başı değil, kulüp başı. 22 oyuncuyla kişi başı ayda 50 sentten az.',
      pr_fine:
        'Fiyatlara KDV dahildir. Aylık veya yıllık ödeme; ödenen dönem sonunda iptal edilebilir.',
      pr_big: "5'ten fazla takım mı? Bize yaz.",
    },
    es: {
      name: 'Español',
      nav_features: 'Funciones',
      nav_clubs: 'Para clubes',
      nav_faq: 'Preguntas',
      nav_cta: 'Descargar la app',
      eyebrow: 'Para clubes amateurs',
      h1: 'Tu club.\nUn solo pitido.',
      lede: 'Partidos, asistencia, alineaciones, directo, chat y cuotas en una sola app. Con los colores de tu club, sin el caos de los grupos de WhatsApp.',
      club: 'Crear un club',
      trust: [
        'Alojado en la UE',
        'Tú controlas la visibilidad',
        'Sin dinero a través de la app',
        '6 idiomas en la app',
      ],
      roles_h2: 'Cada rol ve lo que necesita.',
      roles_sub:
        'Una persona puede ser jugador, capitán, entrenador y directiva a la vez. Anstoss lo muestra todo en una sola vista.',
      roles: [
        [
          'Entrenador',
          'El día de partido bajo control',
          [
            'Crea entrenamientos en segundos, también semanales',
            'Mira quién viene y avisa al resto con un toque',
            'Arma la alineación y envíala al equipo',
          ],
        ],
        [
          'Jugador',
          'Confirma con un toque',
          [
            'Voy, quizá o no voy, en la pantalla de inicio',
            'Hora, campo y equipación siempre al día',
            'Tus partidos, goles y entrenamientos de un vistazo',
          ],
        ],
        [
          'Agente libre',
          'Encuentra tu próximo equipo',
          [
            'Crea un perfil como jugador o entrenador',
            'Activa o pausa tu visibilidad',
            'Explora vacantes y solicita pruebas',
          ],
        ],
        [
          'Directiva',
          'Todo el club de un vistazo',
          [
            'Todos los equipos, roles y solicitudes',
            'Estado de cuotas sin hojas de cálculo',
            'Sustituye al entrenador un rato, todo queda registrado',
          ],
        ],
      ],
      brand_h2: 'Tu club es la marca.',
      brand_sub: 'El escudo y los colores del club dan forma a toda la app. Pruébalo.',
      brand_pick: 'Elige el color del club',
      flow_h2: 'Del calendario al pitido final.',
      flow: [
        ['Crea el evento', 'Entrenamiento o partido, con hora de encuentro y recordatorio.'],
        ['Recoge respuestas', 'El equipo responde con un toque. Ves al instante quién falta.'],
        ['Comparte la alineación', 'Elige formación, coloca a los jugadores y envíala al equipo.'],
        ['Síguelo en directo', 'Registra goles y cambios para que todos estén al tanto.'],
      ],
      dues_h2: 'Las cuotas a la vista. El dinero se queda en el club.',
      dues_b:
        'Los socios pagan directamente a la cuenta del club con un código QR de pago en su app bancaria. Anstoss solo muestra quién ha pagado.',
      dues_p: [
        'QR de pago con todos los datos',
        'Concilia el extracto bancario en segundos',
        'Recuerda los pagos pendientes con un toque',
      ],
      lang_h2: 'Cada uno lee en su idioma.',
      lang_b:
        'La app ofrece alemán, inglés, francés, italiano, portugués y turco. La web está disponible en siete idiomas.',
      lang_from: 'Traducido del alemán',
      faq_h2: 'Preguntas frecuentes',
      faq: [
        [
          '¿Necesitamos datos externos de calendario?',
          'No. Crea entrenamientos y partidos directamente. El MVP no incluye importación automática de FUSSBALL.DE.',
        ],
        [
          '¿Quién ve qué datos?',
          'Los jugadores ven su equipo, los entrenadores su plantilla y los administradores autorizados su club. Los perfiles aparecen solo con la búsqueda y visibilidad activadas.',
        ],
        [
          '¿Anstoss cobra las cuotas?',
          'No. Los socios pagan directamente al club. Anstoss solo muestra el estado.',
        ],
        [
          '¿Pueden usar Anstoss los menores de 16 años?',
          'En el lanzamiento, Anstoss está disponible a partir de los 16 años. Las cuentas familiares e infantiles aún no están habilitadas.',
        ],
        ['¿En qué dispositivos funciona?', 'iPhone y Android.'],
      ],
      cta_h2: '¿Listos para el saque inicial?',
      cta_b: 'Crea tu club en dos minutos, comparte el código y listo.',
      foot: ['Aviso legal', 'Privacidad', 'Eliminar cuenta'],
      m_next: 'A continuación',
      m_kick: 'Dom 14:00',
      m_vs: 'vs. Rot-Weiß Köpenick III',
      m_yes: 'Voy',
      m_maybe: 'Quizá',
      m_no: 'No voy',
      m_count: '14 van · 3 quizá · 5 pendientes',
      m_remind: 'Recordar',
      m_open5: '5 no han respondido',
      m_in: 'Recibido',
      m_out: 'Pendiente',
      m_car: 'Coche compartido',
      m_msg: '¿Quién trae los balones?',
      dir: 'ltr',
      nav_pricing: 'Precios',
      pr_h2: 'Un precio justo para todo el club.',
      pr_sub: 'Empieza gratis con un equipo. Mejora cuando el club se sume.',
      pr_month: 'Mensual',
      pr_year: 'Anual',
      pr_save: '2 meses gratis',
      free_name: 'Gratis',
      free_price: '0 €',
      free_per: 'para siempre',
      free_for: 'Para empezar con un equipo',
      free_feats: [
        '1 equipo, hasta 30 jugadores',
        'Eventos y asistencia',
        'Chat del equipo',
        'Plantilla y alineación',
      ],
      free_cta: 'Empieza gratis',
      club_name: 'Club',
      club_perm: 'al mes',
      club_pery: 'al año',
      club_for: 'Para todo el club',
      club_feats: [
        'Hasta 5 equipos y 150 jugadores',
        'Colores y escudo del club',
        'Directo y alineaciones compartidas',
        'Recordatorios automáticos',
        'Cuotas con QR de pago',
        'Vista previa y sustitución para la directiva',
      ],
      club_cta: 'Prueba gratis 30 días',
      rec: 'Recomendado',
      pr_note:
        'Por club, no por persona. Con 22 jugadores, menos de 50 céntimos por cabeza al mes.',
      pr_fine:
        'IVA incluido. Facturación mensual o anual; cancelación al final del periodo pagado.',
      pr_big: '¿Más de 5 equipos? Escríbenos.',
    },
    fr: {
      name: 'Français',
      nav_features: 'Fonctionnalités',
      nav_clubs: 'Pour les clubs',
      nav_faq: 'FAQ',
      nav_cta: "Télécharger l'app",
      eyebrow: 'Pour les clubs amateurs',
      h1: "Ton club.\nUn coup d'envoi.",
      lede: 'Matchs, présences, compos, live, chat et cotisations dans une seule app. Aux couleurs de ton club, sans le chaos des groupes WhatsApp.',
      club: 'Créer un club',
      trust: [
        "Hébergé dans l'UE",
        'Vous contrôlez la visibilité',
        "Aucun paiement via l'app",
        '6 langues dans l’app',
      ],
      roles_h2: 'Chaque rôle voit ce dont il a besoin.',
      roles_sub:
        'Une même personne peut être joueur, capitaine, entraîneur et membre du bureau. Anstoss réunit tout dans une seule vue.',
      roles: [
        [
          'Entraîneur',
          'Le jour de match sous contrôle',
          [
            'Créer des séances en quelques secondes, chaque semaine aussi',
            "Voir qui vient et relancer les autres d'un geste",
            "Composer l'équipe et l'envoyer au groupe",
          ],
        ],
        [
          'Joueur',
          'Un geste pour répondre',
          [
            "Présent, peut-être ou absent dès l'écran d'accueil",
            'Rendez-vous, terrain et maillot toujours à jour',
            "Tes matchs, buts et entraînements en un coup d'œil",
          ],
        ],
        [
          'Sans club',
          'Trouve ta prochaine équipe',
          [
            'Crée un profil de joueur ou d’entraîneur',
            'Active ou suspends ta visibilité',
            'Consulte les annonces et demande un essai',
          ],
        ],
        [
          'Bureau',
          "Tout le club en un coup d'œil",
          [
            "Toutes les équipes, rôles et demandes d'adhésion",
            'Suivi des cotisations sans tableur',
            'Remplacer un entraîneur un moment, avec traçabilité',
          ],
        ],
      ],
      brand_h2: 'Ton club est la marque.',
      brand_sub: "Le blason et les couleurs du club habillent toute l'app. Essaie.",
      brand_pick: 'Choisir la couleur du club',
      flow_h2: 'Du calendrier au coup de sifflet final.',
      flow: [
        ["Créer l'événement", 'Entraînement ou match, avec heure de rendez-vous et rappel.'],
        [
          'Recueillir les réponses',
          "L'équipe répond d'un geste. Tu vois tout de suite qui manque.",
        ],
        ['Partager la compo', "Choisis le système, place les joueurs, envoie à l'équipe."],
        ['Suivre en direct', 'Saisis buts et changements, tout le monde suit.'],
      ],
      dues_h2: "Les cotisations en un coup d'œil. L'argent reste au club.",
      dues_b:
        'Les membres paient directement sur le compte du club grâce à un QR code de paiement dans leur app bancaire. Anstoss montre seulement qui a payé.',
      dues_p: [
        'QR code de paiement prérempli',
        'Rapprocher le relevé bancaire en quelques secondes',
        "Relancer les impayés d'un geste",
      ],
      lang_h2: 'Chacun lit dans sa langue.',
      lang_b:
        'L’app propose l’allemand, l’anglais, le français, l’italien, le portugais et le turc. Le site est disponible en sept langues.',
      lang_from: "Traduit de l'allemand",
      faq_h2: 'Questions fréquentes',
      faq: [
        [
          'Faut-il des données de calendrier externes ?',
          'Non. Créez directement les entraînements et les matchs. L’import automatique FUSSBALL.DE n’est pas disponible dans le MVP.',
        ],
        [
          'Qui voit quelles données ?',
          'Les joueurs voient leur équipe, les entraîneurs leur effectif et les administrateurs autorisés leur club. Les profils apparaissent uniquement si la recherche et la visibilité le permettent.',
        ],
        [
          'Anstoss encaisse-t-il les cotisations ?',
          'Non. Les membres paient directement le club. Anstoss affiche seulement le suivi.',
        ],
        [
          'Les moins de 16 ans peuvent-ils utiliser Anstoss ?',
          'Au lancement, Anstoss est accessible dès 16 ans. Les comptes famille et enfant ne sont pas encore activés.',
        ],
        ['Sur quels appareils ?', 'iPhone et Android.'],
      ],
      cta_h2: "Prêts pour le coup d'envoi ?",
      cta_b: "Crée ton club en deux minutes, partage le code, c'est fait.",
      foot: ['Mentions légales', 'Confidentialité', 'Supprimer le compte'],
      m_next: 'À suivre',
      m_kick: 'Dim 14:00',
      m_vs: 'vs. Rot-Weiß Köpenick III',
      m_yes: 'Présent',
      m_maybe: 'Peut-être',
      m_no: 'Absent',
      m_count: '14 présents · 3 peut-être · 5 en attente',
      m_remind: 'Relancer',
      m_open5: "5 n'ont pas répondu",
      m_in: 'Reçu',
      m_out: 'En attente',
      m_car: 'Covoiturage',
      m_msg: 'Qui apporte les ballons ?',
      dir: 'ltr',
      nav_pricing: 'Tarifs',
      pr_h2: 'Un prix juste pour tout le club.',
      pr_sub: 'Commence gratuitement avec une équipe. Passe à la suite quand le club suit.',
      pr_month: 'Mensuel',
      pr_year: 'Annuel',
      pr_save: '2 mois offerts',
      free_name: 'Gratuit',
      free_price: '0 €',
      free_per: 'pour toujours',
      free_for: 'Pour démarrer avec une équipe',
      free_feats: [
        "1 équipe, jusqu'à 30 joueurs",
        'Événements et présences',
        "Chat d'équipe",
        'Effectif et compo',
      ],
      free_cta: 'Commencer gratuitement',
      club_name: 'Club',
      club_perm: 'par mois',
      club_pery: 'par an',
      club_for: 'Pour tout le club',
      club_feats: [
        "Jusqu'à 5 équipes et 150 joueurs",
        'Couleurs et blason du club',
        'Live et partage de compo',
        'Rappels automatiques',
        'Cotisations avec QR code de paiement',
        'Aperçu et remplacement pour le bureau',
      ],
      club_cta: 'Essai gratuit de 30 jours',
      rec: 'Recommandé',
      pr_note:
        'Par club, pas par personne. Avec 22 joueurs, moins de 50 centimes par tête et par mois.',
      pr_fine:
        'Prix TTC. Facturation mensuelle ou annuelle ; résiliation à la fin de la période payée.',
      pr_big: 'Plus de 5 équipes ? Écris-nous.',
    },
    pt: {
      name: 'Português',
      nav_features: 'Funcionalidades',
      nav_clubs: 'Para clubes',
      nav_faq: 'Perguntas',
      nav_cta: 'Descarregar a app',
      eyebrow: 'Para clubes amadores',
      h1: 'O teu clube.\nUm só apito.',
      lede: 'Jogos, presenças, convocatórias, resultados ao vivo, chat e quotas numa só app. Com as cores do teu clube, sem o caos dos grupos de WhatsApp.',
      club: 'Criar um clube',
      trust: [
        'Alojado na UE',
        'Tu controlas a visibilidade',
        'Sem dinheiro através da app',
        '6 idiomas na app',
      ],
      roles_h2: 'Cada função vê o que precisa.',
      roles_sub:
        'Uma pessoa pode ser jogador, capitão, treinador e direção ao mesmo tempo. A Anstoss mostra tudo numa só vista.',
      roles: [
        [
          'Treinador',
          'O dia de jogo sob controlo',
          [
            'Cria treinos em segundos, também semanais',
            'Vê quem vem e lembra os restantes com um toque',
            'Monta a equipa e envia-a ao grupo',
          ],
        ],
        [
          'Jogador',
          'Um toque para confirmar',
          [
            'Vou, talvez ou não vou, logo no ecrã inicial',
            'Hora de encontro, campo e equipamento sempre atualizados',
            'Os teus jogos, golos e treinos num relance',
          ],
        ],
        [
          'Sem clube',
          'Encontra a tua próxima equipa',
          [
            'Cria um perfil como jogador ou treinador',
            'Ativa ou pausa a tua visibilidade',
            'Consulta vagas e pede treinos à experiência',
          ],
        ],
        [
          'Direção',
          'O clube inteiro num relance',
          [
            'Todas as equipas, funções e pedidos de adesão',
            'Estado das quotas sem folhas de cálculo',
            'Substitui um treinador por momentos, com registo',
          ],
        ],
      ],
      brand_h2: 'O teu clube é a marca.',
      brand_sub: 'O emblema e as cores do clube marcam toda a app. Experimenta.',
      brand_pick: 'Escolhe a cor do clube',
      flow_h2: 'Do calendário ao apito final.',
      flow: [
        ['Cria o evento', 'Treino ou jogo, com hora de encontro e lembrete.'],
        ['Recolhe respostas', 'A equipa responde com um toque. Vês logo quem falta.'],
        ['Partilha a convocatória', 'Escolhe o sistema, coloca os jogadores, envia à equipa.'],
        ['Acompanha ao vivo', 'Regista golos e substituições para todos acompanharem.'],
      ],
      dues_h2: 'Quotas à vista. O dinheiro fica no clube.',
      dues_b:
        'Os sócios pagam diretamente para a conta do clube com um código QR de pagamento na app do banco. A Anstoss mostra apenas quem pagou.',
      dues_p: [
        'QR de pagamento com todos os dados',
        'Concilia o extrato bancário em segundos',
        'Lembra pagamentos em falta com um toque',
      ],
      lang_h2: 'Cada um lê na sua língua.',
      lang_b:
        'A app oferece alemão, inglês, francês, italiano, português e turco. O site está disponível em sete idiomas.',
      lang_from: 'Traduzido do alemão',
      faq_h2: 'Perguntas frequentes',
      faq: [
        [
          'Precisamos de dados de calendário externos?',
          'Não. Cria treinos e jogos diretamente. O MVP não inclui importação automática do FUSSBALL.DE.',
        ],
        [
          'Quem vê que dados?',
          'Os jogadores veem a sua equipa, os treinadores o plantel e os administradores autorizados o clube. Os perfis só aparecem quando a pesquisa e a visibilidade o permitem.',
        ],
        [
          'A Anstoss cobra quotas?',
          'Não. Os sócios pagam diretamente ao clube. A Anstoss só mostra o estado.',
        ],
        [
          'Crianças com menos de 16 anos podem usar a Anstoss?',
          'No lançamento, o Anstoss está disponível a partir dos 16 anos. As contas familiares e infantis ainda não estão ativadas.',
        ],
        ['Em que dispositivos funciona?', 'iPhone e Android.'],
      ],
      cta_h2: 'Prontos para o apito inicial?',
      cta_b: 'Cria o teu clube em dois minutos, partilha o código e já está.',
      foot: ['Informação legal', 'Privacidade', 'Eliminar conta'],
      m_next: 'A seguir',
      m_kick: 'Dom 14:00',
      m_vs: 'vs. Rot-Weiß Köpenick III',
      m_yes: 'Vou',
      m_maybe: 'Talvez',
      m_no: 'Não vou',
      m_count: '14 vão · 3 talvez · 5 em aberto',
      m_remind: 'Lembrar',
      m_open5: '5 não responderam',
      m_in: 'Recebido',
      m_out: 'Em aberto',
      m_car: 'Boleia',
      m_msg: 'Quem leva as bolas?',
      dir: 'ltr',
      nav_pricing: 'Preços',
      pr_h2: 'Um preço justo para o clube inteiro.',
      pr_sub: 'Começa grátis com uma equipa. Faz upgrade quando o clube aderir.',
      pr_month: 'Mensal',
      pr_year: 'Anual',
      pr_save: '2 meses grátis',
      free_name: 'Grátis',
      free_price: '0 €',
      free_per: 'para sempre',
      free_for: 'Para começar com uma equipa',
      free_feats: [
        '1 equipa, até 30 jogadores',
        'Eventos e presenças',
        'Chat da equipa',
        'Plantel e convocatória',
      ],
      free_cta: 'Começar grátis',
      club_name: 'Clube',
      club_perm: 'por mês',
      club_pery: 'por ano',
      club_for: 'Para o clube inteiro',
      club_feats: [
        'Até 5 equipas e 150 jogadores',
        'Cores e emblema do clube',
        'Ao vivo e partilha da convocatória',
        'Lembretes automáticos',
        'Quotas com QR de pagamento',
        'Pré-visualização e substituição para a direção',
      ],
      club_cta: 'Experimenta 30 dias grátis',
      rec: 'Recomendado',
      pr_note:
        'Por clube, não por pessoa. Com 22 jogadores, menos de 50 cêntimos por cabeça por mês.',
      pr_fine:
        'Preços com IVA incluído. Pagamento mensal ou anual; cancelamento no final do período pago.',
      pr_big: 'Mais de 5 equipas? Fala connosco.',
    },
    ar: {
      name: 'العربية',
      nav_features: 'المزايا',
      nav_clubs: 'للأندية',
      nav_faq: 'الأسئلة الشائعة',
      nav_cta: 'حمّل التطبيق',
      eyebrow: 'للأندية الهاوية',
      h1: 'ناديك.\nصافرة واحدة.',
      lede: 'المباريات والحضور والتشكيلة والنتائج المباشرة والدردشة والاشتراكات في تطبيق واحد. بألوان ناديك، ودون فوضى مجموعات واتساب.',
      club: 'أنشئ ناديًا',
      trust: [
        'استضافة داخل الاتحاد الأوروبي',
        'أنت تتحكم في الظهور',
        'لا أموال عبر التطبيق',
        '6 لغات في التطبيق',
      ],
      roles_h2: 'كل دور يرى ما يحتاجه.',
      roles_sub:
        'يمكن لشخص واحد أن يكون لاعبًا وقائدًا ومدربًا وعضوًا في الإدارة معًا. يعرض Anstoss كل ذلك في واجهة واحدة.',
      roles: [
        [
          'المدرب',
          'يوم المباراة تحت السيطرة',
          [
            'أنشئ التمارين في ثوانٍ، وأسبوعيًا أيضًا',
            'اعرف من سيحضر وذكّر الباقين بلمسة',
            'جهّز التشكيلة وأرسلها إلى الفريق',
          ],
        ],
        [
          'اللاعب',
          'لمسة واحدة للتأكيد',
          [
            'حاضر أو ربما أو معتذر من الشاشة الرئيسية مباشرة',
            'موعد التجمع والملعب والزي محدّثة دائمًا',
            'مبارياتك وأهدافك وتمارينك بنظرة واحدة',
          ],
        ],
        [
          'بدون نادٍ',
          'اعثر على فريقك القادم',
          [
            'أنشئ ملفًا كلاعب أو مدرب',
            'فعّل ظهور ملفك أو أوقفه بنفسك',
            'تصفح الفرص واطلب تجربة تدريب',
          ],
        ],
        [
          'الإدارة',
          'النادي كله بنظرة واحدة',
          [
            'كل الفرق والأدوار وطلبات الانضمام',
            'حالة الاشتراكات دون جداول بيانات',
            'تولَّ دور المدرب مؤقتًا مع تسجيل كامل',
          ],
        ],
      ],
      brand_h2: 'ناديك هو العلامة.',
      brand_sub: 'شعار النادي وألوانه تطبع التطبيق كله. جرّب بنفسك.',
      brand_pick: 'اختر لون النادي',
      flow_h2: 'من الموعد حتى صافرة النهاية.',
      flow: [
        ['أنشئ الموعد', 'تمرين أو مباراة، مع موعد التجمع وتذكير.'],
        ['اجمع الردود', 'يرد الفريق بلمسة واحدة، وترى فورًا من الغائب.'],
        ['شارك التشكيلة', 'اختر الخطة، ضع اللاعبين، وأرسلها إلى الفريق.'],
        ['تابع مباشرة', 'سجّل الأهداف والتبديلات ليبقى الجميع على اطلاع.'],
      ],
      dues_h2: 'الاشتراكات تحت نظرك. والمال يبقى للنادي.',
      dues_b:
        'يدفع الأعضاء مباشرة إلى حساب النادي عبر رمز QR للدفع في تطبيق البنك. يعرض Anstoss فقط من دفع.',
      dues_p: [
        'رمز QR للدفع بكل البيانات جاهزة',
        'طابِق كشف الحساب في ثوانٍ',
        'ذكّر المتأخرين بلمسة واحدة',
      ],
      lang_h2: 'كلٌّ يقرأ بلغته.',
      lang_b:
        'يدعم التطبيق الألمانية والإنجليزية والفرنسية والإيطالية والبرتغالية والتركية. الموقع متاح بسبع لغات.',
      lang_from: 'مترجمة من الألمانية',
      faq_h2: 'الأسئلة الشائعة',
      faq: [
        [
          'هل نحتاج إلى بيانات جدول مباريات خارجية؟',
          'لا. أنشئ التدريبات والمباريات مباشرة. الاستيراد التلقائي من FUSSBALL.DE غير متاح في الإصدار الأول.',
        ],
        [
          'من يرى أي بيانات؟',
          'يرى اللاعبون فريقهم والمدربون قائمتهم والمديرون المخولون ناديهم. تظهر ملفات المرشحين فقط عند تفعيل البحث والسماح بالظهور.',
        ],
        [
          'هل يحصّل Anstoss الاشتراكات؟',
          'لا. يدفع الأعضاء مباشرة إلى النادي، ويعرض Anstoss الحالة فقط.',
        ],
        [
          'هل يمكن للأطفال دون 16 عامًا استخدام Anstoss؟',
          'عند الإطلاق يتاح Anstoss لمن بلغوا 16 عامًا. حسابات الأسرة والأطفال غير مفعّلة بعد.',
        ],
        ['على أي أجهزة يعمل؟', 'على iPhone وAndroid.'],
      ],
      cta_h2: 'جاهزون لصافرة البداية؟',
      cta_b: 'أنشئ ناديك في دقيقتين، شارك الرمز، وانتهى الأمر.',
      foot: ['البيانات القانونية', 'الخصوصية', 'حذف الحساب'],
      m_next: 'التالي',
      m_kick: 'الأحد 14:00',
      m_vs: 'ضد Rot-Weiß Köpenick III',
      m_yes: 'حاضر',
      m_maybe: 'ربما',
      m_no: 'معتذر',
      m_count: '14 حاضر · 3 ربما · 5 لم يردوا',
      m_remind: 'تذكير',
      m_open5: '5 لم يردوا بعد',
      m_in: 'المستلم',
      m_out: 'المتبقي',
      m_car: 'مشاركة السيارة',
      m_msg: 'من سيحضر الكرات؟',
      dir: 'rtl',
      nav_pricing: 'الأسعار',
      pr_h2: 'سعر عادل للنادي كله.',
      pr_sub: 'ابدأ مجانًا بفريق واحد، ورقِّ اشتراكك عندما ينضم النادي.',
      pr_month: 'شهريًا',
      pr_year: 'سنويًا',
      pr_save: 'شهران مجانًا',
      free_name: 'مجاني',
      free_price: '0 €',
      free_per: 'للأبد',
      free_for: 'لفريق واحد للبداية',
      free_feats: [
        'فريق واحد حتى 30 لاعبًا',
        'المواعيد والحضور',
        'دردشة الفريق',
        'القائمة والتشكيلة',
      ],
      free_cta: 'ابدأ مجانًا',
      club_name: 'النادي',
      club_perm: 'شهريًا',
      club_pery: 'سنويًا',
      club_for: 'للنادي كله',
      club_feats: [
        'حتى 5 فرق و150 لاعبًا',
        'ألوان النادي وشعاره',
        'النتائج المباشرة ومشاركة التشكيلة',
        'تذكيرات تلقائية',
        'متابعة الاشتراكات برمز QR للدفع',
        'المعاينة والإنابة للإدارة',
      ],
      club_cta: 'جرّب مجانًا لمدة 30 يومًا',
      rec: 'موصى به',
      pr_note: 'السعر لكل نادٍ لا لكل لاعب. مع 22 لاعبًا يكون أقل من 50 سنتًا للفرد شهريًا.',
      pr_fine: 'الأسعار تشمل الضريبة. دفع شهري أو سنوي؛ الإلغاء في نهاية الفترة المدفوعة.',
      pr_big: 'أكثر من 5 فرق؟ تواصل معنا.',
    },
  }
  const SIGNUP = {
    de: {
      title: 'Dein Verein startet in der App.',
      body: 'Verein und Team anlegen, E-Mail bestätigen — Spieler kannst du später hinzufügen.',
      email: 'Deine persönliche E-Mail-Adresse reicht aus. Eine Vereinsadresse ist nicht nötig.',
      skip: 'Kader und Einladungen kannst du überspringen und später ergänzen.',
      existing:
        'Ist dein Team bereits registriert? Bitte den Verein um seinen Einladungscode. Bei einer falschen Registrierung kontaktiere den Support.',
      open: 'In Anstoss öffnen',
      download: 'App herunterladen',
      support: 'Support kontaktieren',
      back: 'Startseite',
    },
    en: {
      title: 'Start your club in the app.',
      body: 'Create your club and team, confirm your email — add players whenever you’re ready.',
      email: 'Your personal email address is enough. You don’t need a club email.',
      skip: 'Skip the squad and invitations for now and add them later.',
      existing:
        'Team already registered? Ask the club for its invitation code. Contact support if the registration is incorrect.',
      open: 'Open Anstoss',
      download: 'Download the app',
      support: 'Contact support',
      back: 'Home',
    },
    fr: {
      title: 'Crée ton club dans l’app.',
      body: 'Crée ton club et ton équipe, confirme ton e-mail — ajoute les joueurs plus tard.',
      email: 'Ton adresse e-mail personnelle suffit. Pas besoin d’une adresse du club.',
      skip: 'Tu peux passer l’effectif et les invitations et les compléter plus tard.',
      existing:
        'Équipe déjà inscrite ? Demande son code d’invitation au club. Contacte l’assistance si l’inscription est incorrecte.',
      open: 'Ouvrir Anstoss',
      download: 'Télécharger l’app',
      support: 'Contacter l’assistance',
      back: 'Accueil',
    },
    pt: {
      title: 'Começa o teu clube na app.',
      body: 'Cria o clube e a equipa, confirma o e-mail — adiciona jogadores quando quiseres.',
      email: 'O teu e-mail pessoal é suficiente. Não precisas de um e-mail do clube.',
      skip: 'Podes saltar o plantel e os convites e completá-los mais tarde.',
      existing:
        'A equipa já está registada? Pede o código de convite ao clube. Contacta o suporte se o registo estiver incorreto.',
      open: 'Abrir Anstoss',
      download: 'Descarregar a app',
      support: 'Contactar o suporte',
      back: 'Início',
    },
    tr: {
      title: 'Kulübünü uygulamada kur.',
      body: 'Kulübünü ve takımını oluştur, e-postanı doğrula — oyuncuları daha sonra ekleyebilirsin.',
      email: 'Kişisel e-posta adresin yeterli. Kulüp e-postasına ihtiyacın yok.',
      skip: 'Kadroyu ve davetleri şimdilik atlayıp daha sonra tamamlayabilirsin.',
      existing:
        'Takım zaten kayıtlı mı? Kulüpten davet kodunu iste. Kayıt yanlışsa destekle iletişime geç.',
      open: 'Anstoss’u aç',
      download: 'Uygulamayı indir',
      support: 'Destekle iletişime geç',
      back: 'Ana sayfa',
    },
    es: {
      title: 'Crea tu club en la app.',
      body: 'Crea tu club y equipo, confirma tu correo y añade jugadores cuando quieras.',
      email: 'Tu correo personal es suficiente. No necesitas uno del club.',
      skip: 'Puedes omitir la plantilla y las invitaciones y completarlas después.',
      existing:
        '¿El equipo ya está registrado? Pide al club su código de invitación. Contacta con soporte si el registro es incorrecto.',
      open: 'Abrir Anstoss',
      download: 'Descargar la app',
      support: 'Contactar con soporte',
      back: 'Inicio',
    },
    ar: {
      title: 'ابدأ ناديك في التطبيق.',
      body: 'أنشئ النادي والفريق وأكّد بريدك الإلكتروني — يمكنك إضافة اللاعبين لاحقاً.',
      email: 'يكفي بريدك الإلكتروني الشخصي. لا تحتاج إلى بريد خاص بالنادي.',
      skip: 'يمكنك تخطي قائمة اللاعبين والدعوات الآن وإكمالها لاحقاً.',
      existing:
        'هل الفريق مسجّل بالفعل؟ اطلب رمز الدعوة من النادي. تواصل مع الدعم إذا كان التسجيل غير صحيح.',
      open: 'فتح Anstoss',
      download: 'تنزيل التطبيق',
      support: 'التواصل مع الدعم',
      back: 'الرئيسية',
    },
  }

  const UI = {
    de: {
      skip: 'Zum Inhalt',
      a_nav: 'Hauptnavigation',
      a_lang: 'Sprache',
      preview: 'App-Vorschau',
      a_roles: 'Rollen',
      a_crest: 'Wappen',
      a_billing: 'Abrechnung',
      a_legal: 'Rechtliches',
      a_cookies: 'Cookie-Einstellungen',
    },
    en: {
      skip: 'Skip to content',
      a_nav: 'Main navigation',
      a_lang: 'Language',
      preview: 'App preview',
      a_roles: 'Roles',
      a_crest: 'Crest',
      a_billing: 'Billing period',
      a_legal: 'Legal',
      a_cookies: 'Cookie settings',
    },
    tr: {
      skip: 'İçeriğe geç',
      a_nav: 'Ana menü',
      a_lang: 'Dil',
      preview: 'Uygulama önizlemesi',
      a_roles: 'Roller',
      a_crest: 'Arma',
      a_billing: 'Ödeme dönemi',
      a_legal: 'Yasal',
      a_cookies: 'Çerez ayarları',
    },
    es: {
      skip: 'Ir al contenido',
      a_nav: 'Navegación principal',
      a_lang: 'Idioma',
      preview: 'Vista previa de la app',
      a_roles: 'Roles',
      a_crest: 'Escudo',
      a_billing: 'Facturación',
      a_legal: 'Legal',
      a_cookies: 'Ajustes de cookies',
    },
    fr: {
      skip: 'Aller au contenu',
      a_nav: 'Navigation principale',
      a_lang: 'Langue',
      preview: "Aperçu de l'app",
      a_roles: 'Rôles',
      a_crest: 'Blason',
      a_billing: 'Facturation',
      a_legal: 'Mentions légales',
      a_cookies: 'Paramètres des cookies',
    },
    pt: {
      skip: 'Saltar para o conteúdo',
      a_nav: 'Navegação principal',
      a_lang: 'Idioma',
      preview: 'Pré-visualização da app',
      a_roles: 'Funções',
      a_crest: 'Emblema',
      a_billing: 'Faturação',
      a_legal: 'Informação legal',
      a_cookies: 'Definições de cookies',
    },
    ar: {
      skip: 'انتقل إلى المحتوى',
      a_nav: 'التنقل الرئيسي',
      a_lang: 'اللغة',
      preview: 'معاينة التطبيق',
      a_roles: 'الأدوار',
      a_crest: 'الشعار',
      a_billing: 'دورة الفوترة',
      a_legal: 'معلومات قانونية',
      a_cookies: 'إعدادات ملفات تعريف الارتباط',
    },
  }

  const packageCopy = {
    de: { labels: ['Team · 1 Team', 'Club · bis zu 3 Teams', 'Club Unlimited · alle Vereinsteams'], note: 'Jährlich sparst du mindestens zwei Monatsbeiträge. Club Unlimited gilt für einen Verein, nicht für mehrere Vereine. KI-Credits sind separat.', contact: 'Fragen zu den Teampaketen? Schreib uns.', unavailable: 'Automatische Chat-Übersetzung ist derzeit nicht verfügbar.' },
    en: { labels: ['Team · 1 team', 'Club · up to 3 teams', 'Club Unlimited · all club teams'], note: 'Annual billing saves at least two monthly payments. Club Unlimited covers one club, not multiple clubs. AI generation credits are separate.', contact: 'Questions about team packages? Contact us.', unavailable: 'Automatic chat translation is currently unavailable.' },
    tr: { labels: ['Team · 1 takım', 'Club · en fazla 3 takım', 'Club Unlimited · tüm kulüp takımları'], note: 'Yıllık ödeme en az iki aylık ücret tasarrufu sağlar. Club Unlimited yalnızca bir kulübü kapsar. Yapay zekâ kredileri ayrıdır.', contact: 'Takım paketleri hakkında soruların mı var? Bize yaz.', unavailable: 'Otomatik sohbet çevirisi şu anda kullanılamıyor.' },
    es: { labels: ['Team · 1 equipo', 'Club · hasta 3 equipos', 'Club Unlimited · todos los equipos'], note: 'El pago anual ahorra al menos dos mensualidades. Club Unlimited cubre un solo club, no varios clubes. Los créditos de IA son independientes.', contact: '¿Preguntas sobre los paquetes? Escríbenos.', unavailable: 'La traducción automática del chat no está disponible actualmente.' },
    fr: { labels: ['Team · 1 équipe', 'Club · jusqu’à 3 équipes', 'Club Unlimited · toutes les équipes'], note: 'Le paiement annuel économise au moins deux mensualités. Club Unlimited couvre un seul club, pas plusieurs clubs. Les crédits IA sont séparés.', contact: 'Des questions sur les forfaits ? Contacte-nous.', unavailable: 'La traduction automatique du chat est actuellement indisponible.' },
    pt: { labels: ['Team · 1 equipa', 'Club · até 3 equipas', 'Club Unlimited · todas as equipas'], note: 'O pagamento anual poupa pelo menos duas mensalidades. Club Unlimited cobre um único clube, não vários clubes. Os créditos de IA são separados.', contact: 'Dúvidas sobre os pacotes? Contacta-nos.', unavailable: 'A tradução automática do chat está indisponível de momento.' },
    ar: { labels: ['Team · فريق واحد', 'Club · حتى 3 فرق', 'Club Unlimited · جميع فرق النادي'], note: 'يوفر الدفع السنوي ما لا يقل عن قسطين شهريين. تغطي باقة Club Unlimited نادياً واحداً وليس عدة أندية. أرصدة الذكاء الاصطناعي منفصلة.', contact: 'هل لديك أسئلة عن الباقات؟ تواصل معنا.', unavailable: 'الترجمة التلقائية للدردشة غير متاحة حالياً.' },
  }
  for (const lang of LANGS) {
    const copy = COPY[lang]
    const details = packageCopy[lang]
    const format = (cents) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', numberingSystem: 'latn' }).format(cents / 100)
    copy.club_name = details.labels[0]
    copy.club_for = details.labels.join(' · ')
    copy.club_pm = format(window.AnstossPlanPackages[0].monthly)
    copy.club_py = format(window.AnstossPlanPackages[0].yearly)
    copy.club_feats = [details.labels[0] + ' · 30', ...copy.club_feats.slice(1, -1)]
    copy.package_labels = details.labels
    copy.pr_note = details.note
    copy.pr_big = details.contact
    copy.lang_b += ' ' + details.unavailable
  }

  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    )

  const TICK = (lime, size) =>
    `<span class="tick${lime ? ' lime' : ''}"><svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg></span>`
  const PLUS =
    '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>'
  const bullets = (items, lime, size = 14) =>
    items.map((x) => `<li>${TICK(lime, size)}<span>${esc(x)}</span></li>`).join('')

  function storageGet() {
    try {
      return window.localStorage.getItem(STORE_KEY)
    } catch {
      return null
    }
  }
  function storageSet(v) {
    try {
      window.localStorage.setItem(STORE_KEY, v)
    } catch {
      /* storage blocked: choice lasts for this page view only */
    }
  }

  const valid = (l) => (l && LANGS.includes(l) ? l : null)

  function pickInitialLang() {
    const fromUrl = valid(
      (new URLSearchParams(window.location.search).get('lang') || '').toLowerCase(),
    )
    if (fromUrl) {
      storageSet(fromUrl)
      return fromUrl
    }
    const stored = valid(storageGet())
    if (stored) return stored
    const prefs =
      navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language || '']
    for (const p of prefs) {
      const l = valid(String(p).slice(0, 2).toLowerCase())
      if (l) return l
    }
    return 'de'
  }

  function lookup(t, key) {
    return key.split('.').reduce((o, k) => (o == null ? o : o[k]), t)
  }

  function setMeta(selector, value) {
    const el = document.head.querySelector(selector)
    if (el) el.setAttribute('content', value)
  }

  let current = 'de'

  function apply(lang) {
    const l = valid(lang) || 'de'
    const t = { ...COPY[l], ...UI[l], signup: SIGNUP[l] }
    current = l
    const root = document.documentElement
    root.setAttribute('lang', l)
    root.setAttribute('dir', t.dir || 'ltr')

    const title =
      document.body.dataset.site === 'signup'
        ? `Anstoss – ${t.signup.title}`
        : `Anstoss – ${t.h1.replace(/\n/g, ' ')}`
    document.title = title
    setMeta('meta[name="description"]', t.lede)
    setMeta('meta[property="og:title"]', title)
    setMeta('meta[property="og:description"]', t.lede)
    setMeta('meta[property="og:locale"]', OG_LOCALE[l])

    document.querySelectorAll('[data-t]').forEach((el) => {
      const v = lookup(t, el.getAttribute('data-t'))
      if (typeof v === 'string') el.textContent = v
    })
    document.querySelectorAll('[data-t-aria]').forEach((el) => {
      const v = lookup(t, el.getAttribute('data-t-aria'))
      if (typeof v === 'string') el.setAttribute('aria-label', v)
    })

    const list = (name, html) => {
      const el = document.querySelector(`[data-list="${name}"]`)
      if (el) el.innerHTML = html
    }
    list('trust', bullets(t.trust, false, 16))
    list(
      'flow',
      t.flow
        .map(
          ([a, b], i) =>
            `<li><span class="num fnum">0${i + 1}</span><h3 class="h3s">${esc(a)}</h3><p class="mut">${esc(b)}</p></li>`,
        )
        .join(''),
    )
    list('dues_p', bullets(t.dues_p, true))
    list('free_feats', bullets(t.free_feats, false))
    list('club_feats', bullets(t.club_feats, true))
    document.querySelectorAll('[data-role-tab]').forEach((btn) => {
      btn.textContent = t.roles[Number(btn.getAttribute('data-role-tab'))][0]
    })

    const faq = document.querySelector('[data-list="faq"]')
    if (faq) {
      const openIdx = Array.from(faq.querySelectorAll('details')).findIndex((d) => d.open)
      faq.innerHTML = t.faq
        .map(
          ([q, a], i) =>
            `<details class="qa" name="faq"${i === openIdx ? ' open' : ''}><summary><span>${esc(q)}</span>${PLUS}</summary><p>${esc(a)}</p></details>`,
        )
        .join('')
    }

    const sel = document.getElementById('lang')
    if (sel) sel.value = l
    document.querySelectorAll('[data-lang-pill]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang-pill') === l))
    })
    const tr = document.querySelector('[data-translated]')
    if (tr) tr.hidden = true

    document.dispatchEvent(new CustomEvent('anstoss:lang', { detail: { lang: l, t } }))
  }

  function choose(lang) {
    const l = valid(lang)
    if (!l) return
    storageSet(l)
    const url = new URL(window.location.href)
    if (url.searchParams.has('lang')) {
      url.searchParams.set('lang', l)
      window.history.replaceState(null, '', url)
    }
    apply(l)
  }

  window.AnstossI18n = {
    langs: LANGS,
    choose,
    get lang() {
      return current
    },
    t: () => ({ ...COPY[current], ...UI[current], signup: SIGNUP[current] }),
  }

  function init() {
    if (!document.body || !document.body.hasAttribute('data-site')) return
    const l = pickInitialLang()
    // German is pre-rendered in the HTML; only re-render for other languages.
    apply(l)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
