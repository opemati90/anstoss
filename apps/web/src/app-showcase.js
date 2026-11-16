/* Deliberately separate from pricing/localisation work in the app release checkout. */
;(() => {
  const copy = {
    de: {
      heroCaption: 'Zusagen im Blick. Aufstellung bereit.', explore: 'So organisiert ihr euer Team',
      sample: 'Illustrative App-Ansichten mit Beispieldaten.', clubCaption: 'Ein Teamgefühl. Bis in die App.',
      eyebrow: 'Euer nächster Spieltag', title: 'Weniger Nachfragen. Mehr Fußball.',
      intro: 'Ein Termin. Ein klares Team. Von der ersten Zusage bis zur Nachricht vor dem Anpfiff.',
      cta: 'Euer Team organisieren', outcomeLabel: 'Für die ganze Mannschaft', enlarge: 'Ansicht vergrößern', close: 'Schließen',
      screenNames: ['Spieltag im Überblick', 'Aufstellung', 'Meine Zusage', 'Verein beitreten', 'Beitragsübersicht', 'Termine', 'Teamchat', 'Kader'],
      steps: [
        ['Termin teilen', 'Training oder Spiel, Treffpunkt und Uhrzeit an einem Ort.', 'Alle wissen, wann und wo.'],
        ['Zusagen sehen', 'Dabei, vielleicht oder Absage. Du siehst, mit wem du planen kannst.', 'Wer kommt? Du weißt es.'],
        ['Aufstellung festlegen', 'Formation wählen, Positionen besetzen und mit dem Team teilen.', 'Aus Zusagen wird eine Elf.'],
        ['Team informieren', 'Treffpunkt, Umfrage und letzte Absprachen bleiben im Teamchat.', 'Ein Team. Ein Gespräch.'],
      ],
    },
    en: {
      heroCaption: 'Know who’s coming. Get your lineup ready.', explore: 'See how your team comes together',
      sample: 'Illustrative app views with sample data.', clubCaption: 'Your team’s identity, inside the app.',
      eyebrow: 'Your next matchday', title: 'Less chasing. More football.',
      intro: 'One event. One organised team. From the first RSVP to the message before kick-off.',
      cta: 'Organise your team', outcomeLabel: 'For the whole team', enlarge: 'View screen details', close: 'Close',
      screenNames: ['Matchday overview', 'Lineup', 'My RSVP', 'Join a club', 'Dues overview', 'Calendar', 'Team chat', 'Squad'],
      steps: [
        ['Share the event', 'Training or match, meeting point and kick-off in one place.', 'Everyone knows when and where.'],
        ['See who’s coming', 'Yes, maybe or no. Know which players you can plan with.', 'Know who you can count on.'],
        ['Set the lineup', 'Choose a formation, fill the positions and share it with the team.', 'Turn your RSVPs into a starting XI.'],
        ['Keep everyone informed', 'Meeting points, polls and last-minute updates stay in team chat.', 'One team. One conversation.'],
      ],
    },
    fr: {
      heroCaption: 'Les réponses en vue. La composition prête.', explore: 'Découvrez comment organiser votre équipe',
      sample: 'Vues illustratives avec des données fictives.', clubCaption: 'L’identité du club, jusque dans l’app.',
      eyebrow: 'Votre prochain match', title: 'Moins de relances. Plus de football.',
      intro: 'Un événement. Une équipe organisée. De la première réponse au dernier message avant le coup d’envoi.',
      cta: 'Organiser votre équipe', outcomeLabel: 'Pour toute l’équipe', enlarge: 'Agrandir l’écran', close: 'Fermer',
      screenNames: ['Vue du match', 'Composition', 'Ma réponse', 'Rejoindre un club', 'Cotisations', 'Calendrier', 'Discussion d’équipe', 'Effectif'],
      steps: [
        ['Partager le rendez-vous', 'Entraînement ou match, lieu et horaire réunis au même endroit.', 'Chacun sait où et quand venir.'],
        ['Voir les réponses', 'Présent, peut-être ou absent. Sachez sur qui compter.', 'Les disponibilités sont claires.'],
        ['Préparer la composition', 'Choisissez la formation, attribuez les postes et partagez-la.', 'Des réponses au onze de départ.'],
        ['Informer l’équipe', 'Rendez-vous, sondages et dernières consignes dans la discussion d’équipe.', 'Une équipe. Une conversation.'],
      ],
    },
    es: {
      heroCaption: 'Confirmaciones claras. Alineación lista.', explore: 'Descubre cómo organizar tu equipo',
      sample: 'Vistas ilustrativas con datos de ejemplo.', clubCaption: 'La identidad de tu club, también en la app.',
      eyebrow: 'Tu próximo partido', title: 'Menos preguntas. Más fútbol.',
      intro: 'Un evento. Un equipo organizado. Desde la primera confirmación hasta el mensaje antes del partido.',
      cta: 'Organiza tu equipo', outcomeLabel: 'Para todo el equipo', enlarge: 'Ampliar pantalla', close: 'Cerrar',
      screenNames: ['Resumen del partido', 'Alineación', 'Mi respuesta', 'Unirse a un club', 'Cuotas', 'Calendario', 'Chat del equipo', 'Plantilla'],
      steps: [
        ['Comparte el evento', 'Entrenamiento o partido, punto de encuentro y hora en un solo lugar.', 'Todos saben cuándo y dónde.'],
        ['Consulta las respuestas', 'Sí, quizás o no. Sabrás con qué jugadores puedes contar.', 'Sabrás quién viene.'],
        ['Prepara la alineación', 'Elige la formación, asigna posiciones y compártela con el equipo.', 'De las respuestas al once inicial.'],
        ['Informa al equipo', 'Puntos de encuentro, encuestas y avisos en el chat del equipo.', 'Un equipo. Una conversación.'],
      ],
    },
    pt: {
      heroCaption: 'Presenças confirmadas. Equipa preparada.', explore: 'Vê como organizar a tua equipa',
      sample: 'Vistas ilustrativas com dados de exemplo.', clubCaption: 'A identidade do clube, também na app.',
      eyebrow: 'O vosso próximo jogo', title: 'Menos perguntas. Mais futebol.',
      intro: 'Um evento. Uma equipa organizada. Da primeira confirmação à última mensagem antes do apito inicial.',
      cta: 'Organizar a tua equipa', outcomeLabel: 'Para toda a equipa', enlarge: 'Ampliar o ecrã', close: 'Fechar',
      screenNames: ['Resumo do jogo', 'Formação', 'A minha resposta', 'Entrar num clube', 'Quotas', 'Calendário', 'Chat da equipa', 'Plantel'],
      steps: [
        ['Partilhar o evento', 'Treino ou jogo, ponto de encontro e hora no mesmo lugar.', 'Todos sabem quando e onde.'],
        ['Ver as respostas', 'Sim, talvez ou não. Sabe com que jogadores podes contar.', 'Sabe quem vai estar presente.'],
        ['Preparar a formação', 'Escolhe a formação, preenche as posições e partilha com a equipa.', 'Das respostas ao onze inicial.'],
        ['Informar a equipa', 'Pontos de encontro, sondagens e avisos no chat da equipa.', 'Uma equipa. Uma conversa.'],
      ],
    },
    tr: {
      heroCaption: 'Katılım net. Kadro hazır.', explore: 'Takımını nasıl organize edeceğini gör',
      sample: 'Örnek verilerle hazırlanmış uygulama görselleri.', clubCaption: 'Kulübünün kimliği uygulamada da seninle.',
      eyebrow: 'Bir sonraki maçınız', title: 'Daha az soru. Daha çok futbol.',
      intro: 'Tek etkinlik. Organize bir takım. İlk katılım yanıtından maç öncesi son mesaja kadar.',
      cta: 'Takımını organize et', outcomeLabel: 'Tüm takım için', enlarge: 'Ekranı büyüt', close: 'Kapat',
      screenNames: ['Maç özeti', 'Diziliş', 'Katılım yanıtım', 'Kulübe katıl', 'Aidatlar', 'Takvim', 'Takım sohbeti', 'Kadro'],
      steps: [
        ['Etkinliği paylaş', 'Antrenman veya maç, buluşma yeri ve saat tek yerde.', 'Herkes ne zaman, nerede olacağını bilir.'],
        ['Katılımı gör', 'Evet, belki veya hayır. Hangi oyuncularla plan yapacağını bil.', 'Kimin geleceği belli.'],
        ['Dizilişi hazırla', 'Formasyonu seç, oyuncuları yerleştir ve takımla paylaş.', 'Katılım yanıtlarından ilk on bire.'],
        ['Takımı bilgilendir', 'Buluşma noktaları, anketler ve son bilgiler takım sohbetinde.', 'Tek takım. Tek sohbet.'],
      ],
    },
    ar: {
      heroCaption: 'الحضور واضح. والتشكيلة جاهزة.', explore: 'اكتشف كيف تنظم فريقك',
      sample: 'صور توضيحية للتطبيق ببيانات تجريبية.', clubCaption: 'هوية ناديك، داخل التطبيق أيضاً.',
      eyebrow: 'مباراتكم القادمة', title: 'أسئلة أقل. كرة قدم أكثر.',
      intro: 'موعد واحد وفريق منظم. من أول تأكيد للحضور إلى آخر رسالة قبل صافرة البداية.',
      cta: 'نظّم فريقك', outcomeLabel: 'للفريق بأكمله', enlarge: 'تكبير الشاشة', close: 'إغلاق',
      screenNames: ['ملخص المباراة', 'التشكيلة', 'ردّي على الدعوة', 'الانضمام إلى نادٍ', 'الاشتراكات', 'المواعيد', 'دردشة الفريق', 'اللاعبون'],
      steps: [
        ['شارك الموعد', 'تدريب أو مباراة، مكان اللقاء والتوقيت في مكان واحد.', 'الجميع يعرف متى وأين.'],
        ['تابع الردود', 'حاضر أو ربما أو معتذر. اعرف من يمكنك الاعتماد عليه.', 'تعرف من سيحضر.'],
        ['جهّز التشكيلة', 'اختر الخطة ووزّع المراكز وشاركها مع الفريق.', 'من تأكيد الحضور إلى التشكيلة الأساسية.'],
        ['أبلغ الفريق', 'مكان اللقاء والاستطلاعات وآخر التعليمات في دردشة الفريق.', 'فريق واحد. محادثة واحدة.'],
      ],
    },
  }
  const screenKeys = ['home', 'lineup', 'player', 'join', 'fees', 'calendar', 'chat', 'squad']
  const tourScreens = ['calendar', 'home', 'lineup', 'chat']
  const roleScreens = ['home', 'player', 'join', 'fees']
  const tabs = [...document.querySelectorAll('[data-tour-tab]')]
  const dialog = document.querySelector('.preview-dialog')
  const rolePreview = document.querySelector('[data-role-preview]')
  const tourPreview = document.querySelector('[data-tour-preview]')
  let selected = 0
  let scrollLock = ''
  const compact = window.matchMedia('(max-width: 759px)')
  function setOrientation() {
    document.querySelector('.tour-tabs').setAttribute('aria-orientation', compact.matches ? 'horizontal' : 'vertical')
  }
  compact.addEventListener('change', setOrientation)
  setOrientation()
  const language = () => copy[window.AnstossI18n.lang] || copy.de
  const screenName = key => language().screenNames[screenKeys.indexOf(key)]
  const locale = () => copy[window.AnstossI18n.lang] ? window.AnstossI18n.lang : 'de'
  const file = key => `./assets/app-previews/${locale()}/${key === 'player' ? 'player-0e3b2b' : key}.webp`

  function describe(button) {
    const name = screenName(button.dataset.screenName)
    button.setAttribute('aria-label', `${name}. ${language().enlarge}`)
    button.querySelector('img').alt = `${name}. ${language().sample}`
  }
  function setScreen(button, key) {
    button.dataset.screenName = key
    const img = button.querySelector('img')
    img.srcset = `${file(key).replace('.webp', '-520.webp')} 520w, ${file(key)} 780w`
    img.src = file(key)
    describe(button)
  }
  function renderTour() {
    const t = language()
    tabs.forEach((tab, index) => {
      tab.setAttribute('aria-selected', String(selected === index))
      tab.tabIndex = selected === index ? 0 : -1
      tab.querySelector('.tour-tab-title').textContent = t.steps[index][0]
      tab.querySelector('.tour-tab-desc').textContent = t.steps[index][1]
    })
    document.getElementById('tour-panel').setAttribute('aria-labelledby', `tour-tab-${selected}`)
    document.querySelector('[data-tour-outcome]').textContent = t.steps[selected][2]
    document.querySelector('.tour-tabs').setAttribute('aria-label', t.eyebrow)
    setScreen(tourPreview, tourScreens[selected])
  }
  function renderRole() {
    const index = Number(document.querySelector('[data-role-tab][aria-selected=true]')?.dataset.roleTab || 0)
    setScreen(rolePreview, roleScreens[index])
    document.querySelector('[data-role-caption]').textContent = screenName(roleScreens[index])
  }
  function render() {
    const t = language()
    document.querySelectorAll('[data-showcase]').forEach(element => { element.textContent = t[element.dataset.showcase] })
    document.querySelectorAll('[data-preview]').forEach(button => setScreen(button, button.dataset.screenName))
    renderTour()
    renderRole()
    renderClub()
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => { selected = index; renderTour() })
    tab.addEventListener('keydown', event => {
      const rtl = document.documentElement.dir === 'rtl'
      const direction = { ArrowDown: 1, ArrowUp: -1, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key]
      if (!direction && !['Home', 'End'].includes(event.key)) return
      event.preventDefault()
      selected = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + direction + tabs.length) % tabs.length
      renderTour(); tabs[selected].focus()
    })
  })
  // site.js owns the role and swatch selection. Observe its state after activation,
  // including arrow-key navigation, without duplicating its event handlers.
  const selectionObserver = new MutationObserver(renderRole)
  document.querySelectorAll('[data-role-tab]').forEach(tab => selectionObserver.observe(tab, { attributes: true, attributeFilter: ['aria-selected'] }))
  function renderClub() {
    const color = document.querySelector('[data-swatch][aria-checked=true]').dataset.swatch.slice(1).toLowerCase()
    const img = document.querySelector('[data-club-preview] img')
    img.srcset = `./assets/app-previews/${locale()}/player-${color}-520.webp 520w, ./assets/app-previews/${locale()}/player-${color}.webp 780w`
    img.src = `./assets/app-previews/${locale()}/player-${color}.webp`
  }
  const swatchObserver = new MutationObserver(renderClub)
  document.querySelectorAll('[data-swatch]').forEach(swatch => swatchObserver.observe(swatch, { attributes: true, attributeFilter: ['aria-checked'] }))
  document.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', () => {
    const original = button.querySelector('img')
    dialog.querySelector('img').src = original.src
    dialog.querySelector('img').alt = original.alt
    document.getElementById('preview-dialog-title').textContent = screenName(button.dataset.screenName)
    scrollLock = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
  }))
  document.querySelector('[data-enlarge-tour]').addEventListener('click', () => tourPreview.click())
  document.querySelector('[data-close-preview]').addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', () => { document.body.style.overflow = scrollLock })
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close() } })
  document.addEventListener('anstoss:lang', render)
  render()
})()
