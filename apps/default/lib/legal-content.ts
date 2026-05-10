/* ─── Legal content for Privacy Center ─── */

export interface LegalSection {
  heading?: string;
  body: string;
}

/* ═══════════════════════════════════════════════════
   AGB – Allgemeine Geschäftsbedingungen
   ═══════════════════════════════════════════════════ */
export const AGB_SECTIONS: LegalSection[] = [
  {
    heading: "§ 1 Anbieter, Geltungsbereich und Vertragssprache",
    body: [
      "(1) Diese Allgemeinen Geschäftsbedingungen („AGB“) gelten für die Nutzung der mobilen Anwendung „Z“ / „Z Social“ (nachfolgend „App“) sowie aller darüber bereitgestellten Funktionen.",
      "(2) Anbieter ist CONTENTHÜTTE, Leif Dunkelmann, Werderstraße 135, 19055 Schwerin, Deutschland, E-Mail: leif@z-social.com (nachfolgend „Anbieter“).",
      "(3) Die App richtet sich vorrangig an Nutzer mit Bezug zu Mecklenburg-Vorpommern. Ein Anspruch auf Nutzung außerhalb der vom Anbieter vorgesehenen Zielgruppe besteht nicht.",
      "(4) Abweichende Bedingungen der Nutzer finden keine Anwendung, es sei denn, der Anbieter stimmt ihrer Geltung ausdrücklich zu.",
      "(5) Vertragssprache ist Deutsch. Maßgeblich ist die jeweils aktuelle Fassung dieser AGB, die in der App und unter https://www.z-movement.de/agb abrufbar ist.",
    ].join("\n\n"),
  },
  {
    heading: "§ 2 Leistungsbeschreibung der App",
    body: [
      "(1) Z ist eine regionale Social-Media- und Community-App für Mecklenburg-Vorpommern. Die App ermöglicht insbesondere:",
      "• Erstellung und Verwaltung eines Nutzerprofils\n• Veröffentlichung von Foto- und Videobeiträgen\n• Kommentare, Likes, gespeicherte Beiträge und Teilen innerhalb der App\n• Freundschaftsanfragen, Blockierungen und soziale Vernetzung\n• Direktnachrichten mit Text, Bildern, Videos, Sprachnachrichten und geteilten Beiträgen\n• Audio- und Videoanrufe\n• Live-Streams mit Kommentaren und Beitrittsanfragen\n• Gruppen, Gruppenmitgliedschaften und gruppenbezogene Kommunikation\n• Umfragen\n• regionale Events, Eventgruppen, Tickets, QR-Code-Check-in und Einlasshelfer\n• Partnerbereich mit Unternehmensprofilen und externen Links\n• Meldung von Inhalten, Nutzern, Gruppen und Partnerprofilen\n• Push-Benachrichtigungen und Systemmitteilungen",
      "(2) Der Anbieter stellt die technische Plattform bereit. Der Anbieter ist nicht verpflichtet, bestimmte Funktionen dauerhaft bereitzustellen oder eine jederzeitige Verfügbarkeit zu gewährleisten.",
      "(3) Die App enthält nutzergenerierte Inhalte. Der Anbieter macht sich diese Inhalte nicht zu eigen, soweit sie nicht ausdrücklich als eigene Inhalte des Anbieters gekennzeichnet sind.",
    ].join("\n\n"),
  },
  {
    heading: "§ 3 Registrierung, Nutzerkonto und Zugangsdaten",
    body: [
      "(1) Für die Nutzung wesentlicher Funktionen ist ein Nutzerkonto erforderlich. Die Registrierung kann über E-Mail/Passwort, Google-Login oder andere vom Anbieter bereitgestellte Anmeldeverfahren erfolgen.",
      "(2) Nutzer müssen bei der Registrierung richtige und vollständige Angaben machen und diese aktuell halten. Fake-Profile, Scheinidentitäten, Mehrfachkonten, automatisierte Konten und die Nutzung fremder Daten sind untersagt.",
      "(3) Zugangsdaten sind vertraulich zu behandeln. Der Nutzer ist verpflichtet, den Anbieter unverzüglich zu informieren, wenn Anhaltspunkte für einen Missbrauch des Kontos bestehen.",
      "(4) Das Nutzerkonto ist persönlich und nicht übertragbar. Eine gewerbliche oder automatisierte Nutzung ist nur mit vorheriger Zustimmung des Anbieters zulässig.",
      "(5) Der Anbieter kann Registrierungen ablehnen, Konten vorübergehend sperren oder löschen, wenn gegen diese AGB, gesetzliche Vorschriften oder berechtigte Sicherheitsinteressen verstoßen wird.",
    ].join("\n\n"),
  },
  {
    heading: "§ 4 Mindestalter und Jugendschutz",
    body: [
      "(1) Die Nutzung der App ist ausschließlich Personen ab 16 Jahren gestattet.",
      "(2) Der Anbieter führt grundsätzlich keine anlasslose amtliche Altersprüfung durch. Der Anbieter ist jedoch berechtigt, bei Zweifeln geeignete Nachweise zu verlangen oder ein Konto zu sperren bzw. zu löschen.",
      "(3) Inhalte, die pornografisch, gewaltverherrlichend, extremistisch, jugendgefährdend oder sonst für Minderjährige ungeeignet sind, sind verboten.",
      "(4) Stellt der Anbieter fest, dass ein Nutzer unter 16 Jahren ist oder ein begründeter Verdacht besteht, kann das Konto ohne vorherige Ankündigung gesperrt oder gelöscht werden.",
    ].join("\n\n"),
  },
  {
    heading: "§ 5 Kostenpflichtige Leistungen, Abonnements und Zahlungen",
    body: [
      "(1) Die App kann kostenlose und kostenpflichtige Funktionen enthalten. Bestimmte Funktionen können ein aktives Abonnement, einen Ticketkauf oder eine sonstige entgeltliche Freischaltung voraussetzen.",
      "(2) Preise, Laufzeiten, Leistungsumfang und Zahlungsbedingungen werden vor Abschluss einer kostenpflichtigen Leistung angezeigt.",
      "(3) Zahlungen werden über den Zahlungsdienstleister Stripe abgewickelt. Kreditkarten-, Bank- oder sonstige Zahlungsdaten werden durch Stripe verarbeitet; der Anbieter speichert keine vollständigen Zahlungsdaten.",
      "(4) Abonnements verlängern sich automatisch um den jeweils vereinbarten Abrechnungszeitraum, sofern sie nicht rechtzeitig vor Ablauf gekündigt werden. Die Kündigung ist über die bereitgestellten Verwaltungsfunktionen oder, soweit angeboten, über Stripe möglich.",
      "(5) Nach Kündigung bleibt der Zugang bis zum Ende des bereits bezahlten Zeitraums bestehen, sofern keine Sperrung aus wichtigem Grund erfolgt.",
      "(6) Preisänderungen für zukünftige Abrechnungszeiträume werden rechtzeitig mitgeteilt. Bereits bezahlte Zeiträume bleiben unberührt.",
    ].join("\n\n"),
  },
  {
    heading: "§ 6 Widerrufsrecht für Verbraucher",
    body: [
      "(1) Verbraucher haben bei Abschluss eines entgeltlichen Vertrags grundsätzlich das gesetzliche Recht, den Vertrag binnen 14 Tagen ohne Angabe von Gründen zu widerrufen.",
      "(2) Die Widerrufsfrist beträgt 14 Tage ab dem Tag des Vertragsschlusses. Zur Ausübung des Widerrufs genügt eine eindeutige Erklärung per E-Mail an leif@z-social.com oder über eine vom Anbieter bereitgestellte Widerrufsfunktion.",
      "(3) Im Falle eines wirksamen Widerrufs erstattet der Anbieter erhaltene Zahlungen unverzüglich, spätestens binnen 14 Tagen nach Eingang des Widerrufs.",
      "(4) Hat der Nutzer ausdrücklich verlangt, dass die Leistung bereits während der Widerrufsfrist beginnt, kann der Anbieter Wertersatz für bereits erbrachte Leistungen verlangen, soweit dies gesetzlich zulässig ist.",
      "(5) Soweit gesetzlich künftig eine besondere elektronische Widerrufsfunktion verpflichtend ist, wird der Anbieter diese rechtzeitig bereitstellen.",
    ].join("\n\n"),
  },
  {
    heading: "§ 7 Community-Regeln und verbotene Nutzung",
    body: [
      "(1) Nutzer verpflichten sich zu einem respektvollen, rechtmäßigen und sicheren Umgang mit anderen Nutzern.",
      "(2) Verboten sind insbesondere:",
      "• rechtswidrige, beleidigende, diskriminierende, rassistische, antisemitische, sexistische, extremistische, gewaltverherrlichende, pornografische oder jugendgefährdende Inhalte\n• Belästigung, Bedrohung, Stalking, Mobbing, Doxxing oder Einschüchterung anderer Nutzer\n• Spam, Kettennachrichten, Betrug, Phishing, irreführende Angebote oder unaufgeforderte Werbung\n• Veröffentlichung fremder personenbezogener Daten ohne Berechtigung\n• Verletzung von Urheber-, Marken-, Persönlichkeits-, Datenschutz- oder sonstigen Rechten Dritter\n• Hochladen von Schadsoftware oder Manipulation der technischen Infrastruktur\n• Bots, Scraping, automatisierte Massenabfragen oder Umgehung technischer Schutzmaßnahmen\n• Inhalte oder Veranstaltungen, die Minderjährige gefährden\n• Nutzung der App für strafbare, sittenwidrige oder rechtsmissbräuchliche Zwecke",
      "(3) Nutzer sind für alle Inhalte und Handlungen verantwortlich, die über ihr Konto vorgenommen werden.",
    ].join("\n\n"),
  },
  {
    heading: "§ 8 Nutzerinhalte, Rechte und Lizenz",
    body: [
      "(1) Nutzer behalten grundsätzlich alle Rechte an den von ihnen erstellten und hochgeladenen Inhalten.",
      "(2) Mit dem Einstellen von Inhalten räumt der Nutzer dem Anbieter ein einfaches, nicht ausschließliches, räumlich auf den Betrieb der App und ihrer technischen Infrastruktur beschränktes Nutzungsrecht ein, soweit dies erforderlich ist, um die Inhalte zu speichern, technisch zu verarbeiten, zu vervielfältigen, zu übertragen, darzustellen, zu moderieren und anderen berechtigten Nutzern innerhalb der App zugänglich zu machen.",
      "(3) Das Nutzungsrecht besteht grundsätzlich nur für die Dauer der Veröffentlichung des jeweiligen Inhalts in der App. Es endet mit der Löschung des Inhalts oder des Nutzerkontos, soweit keine gesetzlichen Aufbewahrungspflichten, berechtigten Nachweisinteressen, Sicherheitsgründe oder Rechte anderer Nutzer entgegenstehen.",
      "(4) Der Nutzer versichert, dass er über alle erforderlichen Rechte an seinen Inhalten verfügt und durch die Veröffentlichung keine Rechte Dritter verletzt.",
      "(5) Der Anbieter darf Inhalte technisch anpassen, komprimieren, transkodieren, Vorschaubilder erstellen oder Formate ändern, soweit dies für Darstellung, Sicherheit, Performance oder Kompatibilität erforderlich ist.",
    ].join("\n\n"),
  },
  {
    heading: "§ 9 Öffentliche Sichtbarkeit von Profilen und Beiträgen",
    body: [
      "(1) Z ist eine Social-Media-App. Profilangaben, Beiträge, Fotos, Videos, Kommentare, Likes, Gruppenaktivitäten, Eventteilnahmen oder Live-Stream-Interaktionen können je nach Funktion für andere Nutzer sichtbar sein.",
      "(2) Öffentlich innerhalb der App veröffentlichte Inhalte können von anderen Nutzern wahrgenommen, gemeldet, gespeichert, abfotografiert, geteilt oder außerhalb der App weiterverbreitet werden, soweit dies technisch oder tatsächlich möglich ist.",
      "(3) Nutzer sollten keine Inhalte veröffentlichen, die sie nicht anderen Nutzern zugänglich machen möchten.",
      "(4) Der Anbieter kann nicht verhindern, dass andere Nutzer sichtbare Inhalte außerhalb der App sichern oder weitergeben. Rechtswidrige Weiterverbreitungen können gemeldet werden.",
    ].join("\n\n"),
  },
  {
    heading: "§ 10 Nachrichten, Anrufe und Live-Streams",
    body: [
      "(1) Nutzer können Direktnachrichten senden, Gruppenkommunikation nutzen sowie Audio- und Videoanrufe oder Live-Streams starten, soweit die jeweilige Funktion verfügbar ist.",
      "(2) Gesendete Direktnachrichten können vom Absender grundsätzlich nicht nachträglich vollständig aus dem Konto des Empfängers gelöscht werden. Sie bleiben im jeweiligen Kommunikationsverlauf sichtbar, soweit keine Löschung aus rechtlichen, sicherheitsrelevanten oder moderativen Gründen erfolgt.",
      "(3) Bei Kontolöschung werden Profil- und Kontodaten des Nutzers gelöscht; bereits versendete Nachrichten können in Kommunikationsverläufen anderer Nutzer erhalten bleiben, soweit dies zur Aufrechterhaltung des Gesprächsverlaufs und berechtigter Interessen der Gesprächspartner erforderlich ist.",
      "(4) Audio- und Videoanrufe sowie Live-Streams werden über WebRTC realisiert. Medienströme laufen nach Möglichkeit direkt zwischen den Endgeräten. Ist dies nicht möglich, können TURN-/STUN-Server des Dienstleisters Metered eingesetzt werden.",
      "(5) Live-Streams sind für die jeweils berechtigte Nutzergruppe sichtbar. Der streamende Nutzer ist für alle übertragenen Inhalte verantwortlich. Der Anbieter kann Live-Streams beenden, einschränken oder nachträglich Maßnahmen ergreifen, wenn Verstöße gegen Recht oder diese AGB vorliegen.",
      "(6) Das unbefugte Aufzeichnen, Mitschneiden oder Weiterverbreiten von Anrufen oder Live-Streams ist untersagt, sofern keine wirksame Einwilligung aller betroffenen Personen oder eine gesetzliche Erlaubnis vorliegt.",
    ].join("\n\n"),
  },
  {
    heading: "§ 11 Gruppen, Umfragen, Freundschaften und Blockierungen",
    body: [
      "(1) Nutzer können Gruppen erstellen, Gruppen beitreten, Einladungen erhalten, Umfragen erstellen oder daran teilnehmen und Freundschaftsanfragen senden, soweit die Funktionen verfügbar sind.",
      "(2) Gruppenersteller und Gruppenadministratoren sind für die von ihnen verwalteten Gruppeninhalte mitverantwortlich und müssen rechtswidrige oder gemeldete Inhalte angemessen behandeln.",
      "(3) Der Anbieter kann Gruppen, Umfragen, Mitgliedschaften oder Inhalte entfernen, einschränken oder deaktivieren, wenn Verstöße gegen diese AGB, Rechte Dritter oder gesetzliche Vorschriften vorliegen.",
      "(4) Nutzer können andere Nutzer blockieren. Eine Blockierung verhindert grundsätzlich künftige Interaktionen im vorgesehenen Funktionsumfang, beseitigt aber nicht zwingend bereits vorhandene Inhalte, Nachrichten oder Interaktionen.",
    ].join("\n\n"),
  },
  {
    heading: "§ 12 Events, Tickets und Offline-Treffen",
    body: [
      "(1) Über die App können regionale Events erstellt, beworben, verwaltet und – soweit angeboten – Tickets erworben oder QR-Codes für den Einlass genutzt werden.",
      "(2) Bei nutzerorganisierten Events ist der jeweilige Veranstalter allein verantwortlich für Organisation, Durchführung, Sicherheit, korrekte Angaben, behördliche Genehmigungen, Jugendschutz, Steuerpflichten, Rückerstattungen und Einhaltung aller gesetzlichen Vorschriften.",
      "(3) Der Anbieter stellt bei nutzerorganisierten Events grundsätzlich nur die technische Plattform bereit und wird nicht Vertragspartei zwischen Teilnehmern, Käufern und Veranstaltern, soweit nicht ausdrücklich etwas anderes angegeben ist.",
      "(4) Eventangaben müssen vollständig, wahrheitsgemäß und transparent sein. Irreführende, rechtswidrige, gefährliche oder missbräuchliche Events sind untersagt.",
      "(5) Bei Veranstaltungen können Foto- und Videoaufnahmen entstehen. Wer Aufnahmen erstellt oder veröffentlicht, ist selbst für die Einhaltung des Rechts am eigenen Bild, der DSGVO und sonstiger gesetzlicher Vorgaben verantwortlich. Für Aufnahmen einzelner erkennbarer Personen im Vordergrund ist regelmäßig eine Einwilligung erforderlich.",
      "(6) Persönliche Treffen und Offline-Interaktionen zwischen Nutzern erfolgen auf eigene Verantwortung der Beteiligten. Der Anbieter überprüft Identität, Zuverlässigkeit oder Eignung anderer Nutzer nicht anlasslos und übernimmt keine Verantwortung für das Verhalten von Nutzern außerhalb der App.",
    ].join("\n\n"),
  },
  {
    heading: "§ 13 Partnerbereich, bezahlte Einträge und externe Links",
    body: [
      "(1) In der App können Partnerunternehmen, Angebote, Unternehmensprofile oder externe Links angezeigt werden. Die Darstellung kann gegen Vergütung erfolgen.",
      "(2) Bezahlte oder hervorgehobene Partnerdarstellungen stellen keine Empfehlung, Prüfung, Garantie oder Haftungsübernahme des Anbieters für Produkte, Dienstleistungen oder Unternehmen dar.",
      "(3) Beim Anklicken externer Links verlassen Nutzer die App. Für Inhalte, Datenschutz, Preise, Verfügbarkeit und Leistungen externer Websites ist ausschließlich der jeweilige Anbieter verantwortlich.",
      "(4) Partner dürfen keine irreführenden, rechtswidrigen oder unlauteren Angaben machen. Der Anbieter kann Partnerprofile entfernen oder deaktivieren, wenn Verstöße vorliegen oder zu befürchten sind.",
    ].join("\n\n"),
  },
  {
    heading: "§ 14 Meldungen, Moderation und DSA-Kontakt",
    body: [
      "(1) Nutzer können Inhalte, Nutzerkonten, Gruppen oder Partnerprofile über die Meldefunktion oder per E-Mail an leif@z-social.com melden.",
      "(2) Meldungen sollten den betroffenen Inhalt, den Grund der Meldung und eine nachvollziehbare Begründung enthalten, damit der Anbieter den Sachverhalt prüfen kann.",
      "(3) Der Anbieter kann gemeldete oder anderweitig auffällige Inhalte prüfen und – soweit erforderlich – Inhalte löschen, sperren, herabstufen, die Sichtbarkeit einschränken, Verwarnungen aussprechen, Funktionen beschränken oder Konten vorübergehend bzw. dauerhaft deaktivieren.",
      "(4) Betroffene Nutzer können gegen Moderationsentscheidungen per E-Mail an leif@z-social.com Beschwerde einlegen. Die Entscheidung wird erneut geprüft.",
      "(5) Für behördliche Anfragen und Mitteilungen nach dem Digital Services Act (DSA) ist die zentrale Kontaktstelle leif@z-social.com eingerichtet. Kommunikation ist auf Deutsch und Englisch möglich.",
      "(6) Der Anbieter ist berechtigt, rechtswidrige Inhalte und relevante Informationen an zuständige Behörden weiterzugeben, soweit hierzu eine gesetzliche Verpflichtung besteht oder dies zur Rechtsdurchsetzung erforderlich ist.",
    ].join("\n\n"),
  },
  {
    heading: "§ 15 Kündigung, Kontolöschung und Folgen der Löschung",
    body: [
      "(1) Nutzer können ihr Konto jederzeit über die Funktion „Account löschen“ in den Profileinstellungen oder per E-Mail an leif@z-social.com löschen lassen.",
      "(2) Bei Kontolöschung werden insbesondere Profildaten, Profilbilder, Banner, veröffentlichte Beiträge, Medien, Kommentare, Likes, gespeicherte Beiträge, Freundschaftsanfragen, Gruppenmitgliedschaften, Benachrichtigungen, Tickets und hochgeladene Mediendateien gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten, Sicherheitsinteressen oder berechtigten Nachweisinteressen entgegenstehen.",
      "(3) Bereits versendete Direktnachrichten bleiben im Gesprächsverlauf der jeweiligen Gesprächspartner erhalten. Die dazugehörigen Profil- und Kontodaten des gelöschten Nutzers werden entfernt, soweit dies technisch und rechtlich vorgesehen ist.",
      "(4) Ein aktives Abonnement wird im Zusammenhang mit der Kontolöschung für zukünftige Abrechnungszeiträume beendet oder zur Beendigung vorgemerkt, soweit dies technisch über den Zahlungsdienstleister möglich ist. Gesetzliche Rechte bleiben unberührt.",
      "(5) Der Anbieter kann das Nutzungsverhältnis aus wichtigem Grund fristlos kündigen, insbesondere bei schweren oder wiederholten Verstößen gegen diese AGB, Rechtsverstößen, Missbrauch oder Sicherheitsrisiken.",
      "(6) Gesetzliche Aufbewahrungspflichten, insbesondere für Zahlungs-, Steuer- und Buchhaltungsdaten, bleiben von der Kontolöschung unberührt.",
    ].join("\n\n"),
  },
  {
    heading: "§ 16 Verfügbarkeit, Sicherheit und Weiterentwicklung",
    body: [
      "(1) Der Anbieter bemüht sich um einen stabilen Betrieb der App, schuldet jedoch keine ununterbrochene, fehlerfreie oder dauerhaft vollständige Verfügbarkeit.",
      "(2) Wartung, Sicherheitsmaßnahmen, technische Störungen, höhere Gewalt, Ausfälle von Dienstleistern oder notwendige Weiterentwicklungen können zu Einschränkungen führen.",
      "(3) Der Anbieter darf Funktionen ändern, erweitern, einschränken oder einstellen, soweit dies für Nutzer zumutbar ist oder aus technischen, wirtschaftlichen, rechtlichen oder sicherheitsrelevanten Gründen erforderlich ist.",
      "(4) Nutzer dürfen keine Sicherheitslücken ausnutzen, veröffentlichen oder missbrauchen. Sicherheitsrelevante Hinweise sind an leif@z-social.com zu melden.",
    ].join("\n\n"),
  },
  {
    heading: "§ 17 Datenschutz",
    body: [
      "(1) Die Verarbeitung personenbezogener Daten erfolgt nach Maßgabe der Datenschutzerklärung von Z.",
      "(2) Die Datenschutzerklärung ist in der App im Privacy Center sowie öffentlich unter https://www.z-movement.de/datenschutz abrufbar.",
      "(3) Der Anbieter setzt keine externen Werbe-Tracking-Dienste wie Google Analytics, Facebook Pixel oder vergleichbare Werbenetzwerk-Tracker ein, soweit dies nicht ausdrücklich in der Datenschutzerklärung anders angegeben wird.",
    ].join("\n\n"),
  },
  {
    heading: "§ 18 Freistellung",
    body: [
      "(1) Nutzer stellen den Anbieter von berechtigten Ansprüchen Dritter frei, die daraus entstehen, dass der Nutzer rechtswidrige Inhalte einstellt, Rechte Dritter verletzt, Veranstaltungen rechtswidrig organisiert oder die App vertragswidrig nutzt.",
      "(2) Die Freistellung umfasst angemessene Kosten der Rechtsverteidigung, soweit der Nutzer die Rechtsverletzung zu vertreten hat.",
      "(3) Gesetzliche Rechte des Nutzers bleiben unberührt.",
    ].join("\n\n"),
  },
  {
    heading: "§ 19 Haftung",
    body: [
      "(1) Der Anbieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie bei Vorsatz und grober Fahrlässigkeit.",
      "(2) Bei einfacher Fahrlässigkeit haftet der Anbieter nur bei Verletzung wesentlicher Vertragspflichten. In diesem Fall ist die Haftung auf den vorhersehbaren, vertragstypischen Schaden begrenzt.",
      "(3) Der Anbieter haftet nicht für die Richtigkeit, Vollständigkeit, Rechtmäßigkeit oder Qualität nutzergenerierter Inhalte, Nutzerprofile, Eventangaben, Partnerangaben oder externer Links, soweit keine gesetzliche Verantwortlichkeit besteht.",
      "(4) Der Anbieter haftet nicht für Schäden aus Offline-Treffen, Veranstaltungen, Kontakten zwischen Nutzern oder Handlungen Dritter, soweit der Anbieter diese nicht zu vertreten hat.",
      "(5) Die Haftungsbeschränkungen gelten nicht bei Übernahme einer Garantie, arglistigem Verschweigen eines Mangels oder soweit zwingende gesetzliche Haftungsvorschriften entgegenstehen.",
      "(6) Die vorstehenden Regelungen gelten auch zugunsten der gesetzlichen Vertreter, Mitarbeiter und Erfüllungsgehilfen des Anbieters.",
    ].join("\n\n"),
  },
  {
    heading: "§ 20 Änderungen dieser AGB",
    body: [
      "(1) Der Anbieter kann diese AGB mit Wirkung für die Zukunft ändern, wenn dies wegen neuer Funktionen, geänderter Rechtslage, technischer Entwicklungen, Sicherheitsanforderungen oder wirtschaftlicher Anpassungen erforderlich ist.",
      "(2) Wesentliche Änderungen, die das vertragliche Gleichgewicht zulasten des Nutzers verändern, werden nur mit ausdrücklicher Zustimmung des Nutzers wirksam.",
      "(3) Nutzer werden über wesentliche Änderungen per E-Mail oder In-App-Hinweis informiert.",
      "(4) Lehnt ein Nutzer eine zustimmungspflichtige Änderung ab, kann der Anbieter das Nutzungsverhältnis ordentlich zum Ende des laufenden Abrechnungszeitraums kündigen, wenn eine Fortführung zu den bisherigen Bedingungen nicht zumutbar ist.",
    ].join("\n\n"),
  },
  {
    heading: "§ 21 Schlussbestimmungen und Streitbeilegung",
    body: [
      "(1) Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Gegenüber Verbrauchern gilt diese Rechtswahl nur, soweit dadurch keine zwingenden Verbraucherschutzvorschriften ihres gewöhnlichen Aufenthaltsstaates entzogen werden.",
      "(2) Ist der Nutzer Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen, ist Gerichtsstand Schwerin, soweit gesetzlich zulässig.",
      "(3) Sollte eine Bestimmung dieser AGB unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. Anstelle der unwirksamen Bestimmung gelten die gesetzlichen Vorschriften.",
      "(4) Der Anbieter ist zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle weder verpflichtet noch bereit.",
      "Stand: Mai 2026",
    ].join("\n\n"),
  },
];
