/* Complete visible-string translations for the illustrative website app views.
 * Columns: German source | English | French | Spanish | Portuguese (PT) | Turkish | Arabic.
 * Player/club names and formation numbers are deliberately preserved.
 */
const locales = ['de', 'en', 'fr', 'es', 'pt', 'tr', 'ar']
const rows = `
Trainer · SV Spreewiese|Coach · SV Spreewiese|Coach · SV Spreewiese|Entrenador · SV Spreewiese|Treinador · SV Spreewiese|Antrenör · SV Spreewiese|المدرب · SV Spreewiese
1. Herren|First team|Équipe première|Primer equipo|Equipa principal|A takım|الفريق الأول
Ligaspiel · Heim|League match · Home|Championnat · Domicile|Liga · Local|Campeonato · Casa|Lig maçı · Ev sahibi|مباراة دوري · على أرضنا
in 2 Tagen|in 2 days|dans 2 jours|en 2 días|daqui a 2 dias|2 gün sonra|بعد يومين
So 14:00|Sun 14:00|Dim. 14:00|Dom. 14:00|Dom. 14:00|Paz 14:00|الأحد 14:00
gegen Rot-Weiß Köpenick III|vs. Rot-Weiß Köpenick III|contre Rot-Weiß Köpenick III|vs. Rot-Weiß Köpenick III|vs. Rot-Weiß Köpenick III|Rakip: Rot-Weiß Köpenick III|ضد Rot-Weiß Köpenick III
dabei|going|présents|asisten|confirmados|katılıyor|حاضر
vielleicht|maybe|peut-être|quizás|talvez|belki|ربما
offen|pending|en attente|sin respuesta|por responder|bekleniyor|بانتظار الرد
Vor dem Spiel|Before the match|Avant le match|Antes del partido|Antes do jogo|Maç öncesi|قبل المباراة
5 haben noch nicht geantwortet|5 players haven’t replied|5 joueurs n’ont pas répondu|5 jugadores sin responder|5 jogadores sem resposta|5 oyuncu henüz yanıtlamadı|5 لاعبين لم يردوا بعد
Erinnern|Remind|Relancer|Recordar|Lembrar|Hatırlat|تذكير
Aufstellung festlegen|Set the lineup|Préparer la composition|Preparar alineación|Definir a formação|Dizilişi belirle|تحديد التشكيلة
Entwurf 4-2-3-1 · 9 von 11|Draft 4-2-3-1 · 9 of 11|Brouillon 4-2-3-1 · 9 sur 11|Borrador 4-2-3-1 · 9 de 11|Rascunho 4-2-3-1 · 9 de 11|Taslak 4-2-3-1 · 9/11|مسودة 4-2-3-1 · 9 من 11
Treffpunkt ankündigen|Share the meeting point|Annoncer le rendez-vous|Anunciar el punto de encuentro|Partilhar o ponto de encontro|Buluşma yerini duyur|إعلان مكان اللقاء
Angeheftet im Team-Chat|Pinned in team chat|Épinglé dans le chat d’équipe|Fijado en el chat del equipo|Fixado no chat da equipa|Takım sohbetine sabitlendi|مثبّت في دردشة الفريق
Danach|Coming up|À suivre|Después|A seguir|Sıradaki|بعد ذلك
Training Di 18:30 · 16 dabei|Training Tue 18:30 · 16 going|Entraînement mar. 18:30 · 16 présents|Entreno mar. 18:30 · 16 asisten|Treino ter. 18:30 · 16 confirmados|Antrenman Sal 18:30 · 16 kişi|تدريب الثلاثاء 18:30 · 16 حاضراً
Alle Termine|All events|Tout voir|Ver eventos|Ver eventos|Tüm etkinlikler|كل المواعيد
Start|Home|Accueil|Inicio|Início|Ana sayfa|الرئيسية
Termine|Calendar|Calendrier|Calendario|Calendário|Takvim|المواعيد
Chat|Chat|Chat|Chat|Chat|Sohbet|الدردشة
Kader|Squad|Effectif|Plantilla|Plantel|Kadro|اللاعبون
Mehr|More|Plus|Más|Mais|Diğer|المزيد
Aufstellung|Lineup|Composition|Alineación|Formação|Diziliş|التشكيلة
So 15.11. · vs. RW Köpenick III|Sun 15 Nov · vs. RW Köpenick III|Dim. 15 nov. · RW Köpenick III|Dom. 15 nov. · RW Köpenick III|Dom. 15 nov. · RW Köpenick III|Paz 15 Kas · RW Köpenick III|الأحد 15 نوفمبر · RW Köpenick III
Ans Team|Share|Partager|Compartir|Partilhar|Paylaş|مشاركة
Offen|Open|En attente|Pendiente|Pendente|Bekliyor|معلّق
Bank · 5|Bench · 5|Banc · 5|Suplentes · 5|Banco · 5|Yedekler · 5|البدلاء · 5
Halten und aufs Feld ziehen|Hold and drag onto the pitch|Maintenir et glisser sur le terrain|Mantén y arrastra al campo|Mantém e arrasta para o campo|Basılı tut ve sahaya sürükle|اضغط واسحب إلى الملعب
SV Spreewiese · 1. Herren|SV Spreewiese · First team|SV Spreewiese · Équipe première|SV Spreewiese · Primer equipo|SV Spreewiese · Equipa principal|SV Spreewiese · A takım|SV Spreewiese · الفريق الأول
Hi Kofi|Hi Kofi|Salut Kofi|Hola Kofi|Olá Kofi|Merhaba Kofi|مرحباً Kofi
Als Nächstes · Ligaspiel|Up next · League match|À venir · Championnat|Próximo · Partido de liga|A seguir · Campeonato|Sıradaki · Lig maçı|القادم · مباراة دوري
vs. Rot-Weiß Köpenick III|vs. Rot-Weiß Köpenick III|contre Rot-Weiß Köpenick III|vs. Rot-Weiß Köpenick III|vs. Rot-Weiß Köpenick III|Rakip: Rot-Weiß Köpenick III|ضد Rot-Weiß Köpenick III
Treffpunkt 13:00 · Sportplatz Dammweg|Meet 13:00 · Dammweg pitch|RDV 13:00 · Terrain Dammweg|Encuentro 13:00 · Campo Dammweg|Encontro 13:00 · Campo Dammweg|Buluşma 13:00 · Dammweg sahası|اللقاء 13:00 · ملعب Dammweg
Dabei|Going|Présent|Asisto|Vou|Katılıyorum|حاضر
Vielleicht|Maybe|Peut-être|Quizás|Talvez|Belki|ربما
Absage|Not going|Absent|No asisto|Não vou|Katılmıyorum|معتذر
Zugesagt. Du bist einer von 15.|You’re in. 15 players confirmed.|Confirmé. 15 joueurs présents.|Confirmado. Sois 15 jugadores.|Confirmado. Já são 15 jogadores.|Katılım onaylandı. 15 kişi oldunuz.|تم التأكيد. أنت ضمن 15 لاعباً.
Termine warten auf dich|events need your reply|événements attendent ta réponse|eventos esperan tu respuesta|eventos aguardam resposta|etkinlik yanıtını bekliyor|مواعيد بانتظار ردك
Training Do · Auswärts So 22.11.|Training Thu · Away Sun 22 Nov|Entraîn. jeu. · Extérieur dim. 22 nov.|Entreno jue. · Visitante dom. 22 nov.|Treino qui. · Fora dom. 22 nov.|Antrenman Per · Deplasman Paz 22 Kas|تدريب الخميس · خارج أرضنا الأحد 22 نوفمبر
Deine Saison|Your season|Ta saison|Tu temporada|A tua época|Sezonun|موسمك
9 Einsätze · 6 Tore · 7 von 8 Trainings|9 appearances · 6 goals · 7/8 training|9 matchs · 6 buts · 7/8 entraînements|9 partidos · 6 goles · 7/8 entrenos|9 jogos · 6 golos · 7/8 treinos|9 maç · 6 gol · 7/8 antrenman|9 مباريات · 6 أهداف · 7 من 8 تدريبات
Beitrag Dezember|December dues|Cotisation de décembre|Cuota de diciembre|Quota de dezembro|Aralık aidatı|اشتراك ديسمبر
25 € · fällig 15.12.|€25 · due 15 Dec|25 € · avant le 15 déc.|25 € · vence el 15 dic.|25 € · até 15 dez.|25 € · son gün 15 Ara|25 € · الاستحقاق 15 ديسمبر
Schritt 1 von 2|Step 1 of 2|Étape 1 sur 2|Paso 1 de 2|Passo 1 de 2|Adım 1/2|الخطوة 1 من 2
Zu deinem Verein|Join your club|Rejoins ton club|Únete a tu club|Junta-te ao teu clube|Kulübüne katıl|انضم إلى ناديك
Gib den Code deines Trainers ein oder such deinen Verein.|Enter your coach’s invite code or search for your club.|Saisis le code de ton coach ou cherche ton club.|Introduce el código de tu entrenador o busca tu club.|Introduz o código do teu treinador ou procura o teu clube.|Antrenörünün davet kodunu gir veya kulübünü ara.|أدخل رمز الدعوة من مدربك أو ابحث عن ناديك.
Einladungscode|Invite code|Code d’invitation|Código de invitación|Código de convite|Davet kodu|رمز الدعوة
1. Herren · Kreisliga C|First team · Kreisliga C|Équipe première · Kreisliga C|Primer equipo · Kreisliga C|Equipa principal · Kreisliga C|A takım · Kreisliga C|الفريق الأول · Kreisliga C
Ich bin Kofi Osei, Nr. 9|I’m Kofi Osei, no. 9|Je suis Kofi Osei, n° 9|Soy Kofi Osei, n.º 9|Sou Kofi Osei, n.º 9|Ben Kofi Osei, 9 numara|أنا Kofi Osei، رقم 9
Dein Kapitän hat dich schon eingetragen|Your captain has already added you|Ton capitaine t’a déjà ajouté|Tu capitán ya te ha añadido|O teu capitão já te adicionou|Kaptanın seni zaten ekledi|أضافك قائد الفريق بالفعل
oder|or|ou|o|ou|veya|أو
Verein suchen|Search for a club|Chercher un club|Buscar un club|Procurar um clube|Kulüp ara|ابحث عن نادٍ
Vereinsname, Ort oder Vereinsnummer|Club name, town or club ID|Nom du club, ville ou numéro|Nombre, ciudad o número de club|Nome, localidade ou número do clube|Kulüp adı, şehir veya kulüp numarası|اسم النادي أو المدينة أو رقم النادي
Weiter|Continue|Continuer|Continuar|Continuar|Devam|متابعة
Beiträge|Dues|Cotisations|Cuotas|Quotas|Aidatlar|الاشتراكات
November|November|Novembre|Noviembre|Novembro|Kasım|نوفمبر
Eingegangen|Received|Reçu|Recibido|Recebido|Alınan|المستلم
450 €|€450|450 €|450 €|450 €|450 €|450 €
100 €|€100|100 €|100 €|100 €|100 €|100 €
25 €|€25|25 €|25 €|25 €|25 €|25 €
45 €|€45|45 €|45 €|45 €|45 €|45 €
18 von 22 · 25 € im Monat|18 of 22 · €25 per month|18 sur 22 · 25 € par mois|18 de 22 · 25 € al mes|18 de 22 · 25 € por mês|22 kişiden 18’i · aylık 25 €|18 من 22 · 25 € شهرياً
4 erinnern|Remind 4|Relancer 4|Recordar a 4|Lembrar 4|4 kişiye hatırlat|تذكير 4
Offen · 4|Open · 4|À payer · 4|Pendientes · 4|Pendentes · 4|Bekleyen · 4|معلّق · 4
Bezahlt · 18|Paid · 18|Payées · 18|Pagadas · 18|Pagas · 18|Ödenen · 18|مدفوع · 18
Alle|All|Tous|Todos|Todos|Tümü|الكل
Seit 12.11. fällig|Due since 12 Nov|Échéance : 12 nov.|Venció el 12 nov.|Venceu a 12 nov.|Son tarih: 12 Kas|مستحق منذ 12 نوفمبر
Überfällig|Overdue|En retard|Vencida|Em atraso|Gecikmiş|متأخر
Bezahlt|Paid|Payé|Pagada|Pago|Ödendi|مدفوع
Meldet: überwiesen am 12.11.|Reports: transferred 12 Nov|Virement déclaré le 12 nov.|Declara: transferencia el 12 nov.|Indica: transferência a 12 nov.|Beyan: 12 Kas’ta havale edildi|أبلغ بتحويل المبلغ في 12 نوفمبر
Gemeldet|Reported|Déclaré|Declarada|Declarado|Bildirildi|تم الإبلاغ
Bestätigen|Confirm|Confirmer|Confirmar|Confirmar|Onayla|تأكيد
Trikotumlage|Kit contribution|Participation maillot|Aportación equipación|Contribuição para o equipamento|Forma katkı payı|مساهمة الزي
Fällig 15.11.|Due 15 Nov|Échéance : 15 nov.|Vence el 15 nov.|Até 15 nov.|Son gün 15 Kas|الاستحقاق 15 نوفمبر
Kontoauszug abgleichen|Reconcile bank statement|Rapprocher le relevé|Conciliar extracto bancario|Conciliar extrato bancário|Banka ekstresini eşleştir|مطابقة كشف الحساب
CSV oder CAMT aus dem Online-Banking|CSV or CAMT from online banking|CSV ou CAMT de la banque en ligne|CSV o CAMT de la banca online|CSV ou CAMT do banco online|İnternet bankacılığından CSV veya CAMT|ملف CSV أو CAMT من البنك الإلكتروني
Anstoss zieht kein Geld ein. Mitglieder überweisen direkt aufs Vereinskonto, du siehst hier nur den Stand.|Anstoss does not collect money. Members pay the club directly. You track the status here.|Anstoss ne prélève pas d’argent. Les membres paient le club directement. Tu suis ici les paiements.|Anstoss no cobra dinero. Los socios pagan directamente al club. Aquí ves el estado.|A Anstoss não cobra dinheiro. Os membros pagam diretamente ao clube. Aqui acompanhas o estado.|Anstoss para tahsil etmez. Üyeler doğrudan kulübe ödeme yapar. Buradan durumu takip edersin.|لا يجمع Anstoss الأموال. يدفع الأعضاء للنادي مباشرة، وتتابع الحالة هنا.
Fr|Fri|Ven.|Vie.|Sex.|Cum|الجمعة
Sa|Sat|Sam.|Sáb.|Sáb.|Cmt|السبت
So|Sun|Dim.|Dom.|Dom.|Paz|الأحد
Mo|Mon|Lun.|Lun.|Seg.|Pzt|الاثنين
Di|Tue|Mar.|Mar.|Ter.|Sal|الثلاثاء
Mi|Wed|Mer.|Mié.|Qua.|Çar|الأربعاء
Do|Thu|Jeu.|Jue.|Qui.|Per|الخميس
Training|Training|Entraînement|Entrenamiento|Treino|Antrenman|تدريب
Spiele|Matches|Matchs|Partidos|Jogos|Maçlar|مباريات
14:00 · Sportplatz Dammweg|14:00 · Dammweg pitch|14:00 · Terrain Dammweg|14:00 · Campo Dammweg|14:00 · Campo Dammweg|14:00 · Dammweg sahası|14:00 · ملعب Dammweg
Abschluss und Standards|Finishing and set pieces|Finition et coups de pied arrêtés|Remates y balón parado|Finalização e bolas paradas|Bitiricilik ve duran toplar|التسديد والكرات الثابتة
18:30 · Platz 2|18:30 · Pitch 2|18:30 · Terrain 2|18:30 · Campo 2|18:30 · Campo 2|18:30 · Saha 2|18:30 · الملعب 2
Pressing im 4-2-3-1|Pressing in a 4-2-3-1|Pressing en 4-2-3-1|Presión en 4-2-3-1|Pressão em 4-2-3-1|4-2-3-1’de pres|الضغط بخطة 4-2-3-1
Ligaspiel · Auswärts|League match · Away|Championnat · Extérieur|Liga · Visitante|Campeonato · Fora|Lig maçı · Deplasman|مباراة دوري · خارج أرضنا
bei BSC Rehberge II|at BSC Rehberge II|chez BSC Rehberge II|en BSC Rehberge II|em BSC Rehberge II|Rakip: BSC Rehberge II|على ملعب BSC Rehberge II
12:00 · Abfahrt 10:45|12:00 · Depart 10:45|12:00 · Départ 10:45|12:00 · Salida 10:45|12:00 · Partida 10:45|12:00 · Hareket 10:45|12:00 · الانطلاق 10:45
Team|Team|Équipe|Equipo|Equipa|Takım|الفريق
Trainer|Coaches|Coachs|Técnicos|Treinadores|Antrenörler|المدربون
Infos|News|Infos|Avisos|Avisos|Duyurular|الأخبار
Direkt|Direct|Privé|Privado|Privado|Özel|خاص
Angeheftet · Trainer|Pinned · Coach|Épinglé · Coach|Fijado · Entrenador|Fixado · Treinador|Sabitlendi · Antrenör|مثبّت · المدرب
Sonntag 13:00 in Kabine 3. Beide Trikots mitbringen.|Sunday 13:00, changing room 3. Bring both kits.|Dimanche à 13:00, vestiaire 3. Apportez les deux maillots.|Domingo a las 13:00, vestuario 3. Traed ambas camisetas.|Domingo às 13:00, balneário 3. Tragam as duas camisolas.|Pazar 13:00, soyunma odası 3. İki formayı da getirin.|الأحد 13:00 في غرفة الملابس 3. أحضروا القميصين.
Wer nimmt die Bälle mit? Ich bin erst 13:15 da.|Who’s bringing the balls? I won’t be there until 13:15.|Qui prend les ballons ? Je n’arrive qu’à 13:15.|¿Quién lleva los balones? Yo no llego hasta las 13:15.|Quem leva as bolas? Só chego às 13:15.|Topları kim getiriyor? Ben ancak 13:15’te oradayım.|من سيحضر الكرات؟ لن أصل قبل 13:15.
Umfrage|Poll|Sondage|Encuesta|Sondagem|Anket|استطلاع
12 Stimmen|12 votes|12 votes|12 votos|12 votos|12 oy|12 صوتاً
Mannschaftsabend nach dem Spiel?|Team night after the match?|Soirée d’équipe après le match ?|¿Quedamos después del partido?|Convívio depois do jogo?|Maçtan sonra takım buluşması?|لقاء للفريق بعد المباراة؟
Ja, Vereinsheim|Yes, at the clubhouse|Oui, au club-house|Sí, en el club|Sim, na sede do clube|Evet, kulüp binasında|نعم، في مقر النادي
Nächste Woche|Next week|La semaine prochaine|La próxima semana|Na próxima semana|Gelecek hafta|الأسبوع القادم
Aufstellung Sonntag|Sunday’s lineup|Composition de dimanche|Alineación del domingo|Formação de domingo|Pazar gününün dizilişi|تشكيلة الأحد
4-2-3-1 · antippen zum Ansehen|4-2-3-1 · tap to view|4-2-3-1 · toucher pour voir|4-2-3-1 · toca para ver|4-2-3-1 · toca para ver|4-2-3-1 · görmek için dokun|4-2-3-1 · اضغط للعرض
Gelesen von 14|Read by 14|Lu par 14|Leído por 14|Lido por 14|14 kişi okudu|قرأها 14
Nachricht|Message|Message|Mensaje|Mensagem|Mesaj|رسالة
Nachricht an 1. Herren|Message the first team|Message à l’équipe première|Mensaje al primer equipo|Mensagem à equipa principal|A takıma mesaj|رسالة إلى الفريق الأول
` .trim().split('\n').map(line => line.split('|'))
const dictionaries = Object.fromEntries(locales.map(locale => [locale, {}]))
for (const row of rows) {
  if (row.length !== locales.length) throw new Error(`Missing preview translation: ${row[0]}`)
  locales.forEach((locale, index) => { dictionaries[locale][row[0]] = row[index] })
}
module.exports = { locales, dictionaries }
