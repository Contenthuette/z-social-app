import type { LegalSection } from "./legal-content";
import { LEGAL_URLS } from "./legal-links";

/* ═══════════════════════════════════════════════════
   Datenschutzerklärung – DSGVO
   ═══════════════════════════════════════════════════ */
export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "1. Verantwortlicher",
    body: [
      "Verantwortlich für die Datenverarbeitung im Zusammenhang mit der App „Z“ / „Z Social“ ist:",
      "CONTENTHÜTTE\nLeif Dunkelmann\nWerderstraße 135\n19055 Schwerin\nDeutschland",
      "E-Mail: leif@z-social.com\nTelefon: 01734506873",
      `Diese Datenschutzerklärung ist jederzeit in der App im Privacy Center sowie unter ${LEGAL_URLS.privacy} abrufbar.`,
    ].join("\n\n"),
  },
  {
    heading: "2. Überblick",
    body: [
      "Wir verarbeiten personenbezogene Daten nur, soweit dies für Betrieb, Sicherheit, Kommunikation, Community-Funktionen, Moderation, Zahlungsabwicklung, Push-Benachrichtigungen, Support und Weiterentwicklung der App erforderlich ist oder eine Einwilligung vorliegt.",
      "Z ist eine Social-Media-App. Profilangaben, Beiträge, Fotos, Videos, Kommentare, Gruppenaktivitäten, Eventteilnahmen, Live-Stream-Interaktionen und andere vom Nutzer veröffentlichte Inhalte können je nach Funktion für andere Nutzer sichtbar sein.",
      "Es werden keine externen Werbe-Tracking-Dienste wie Google Analytics, Facebook Pixel oder vergleichbare Werbenetzwerk-Tracker eingesetzt. Personenbezogene Daten werden nicht an Werbenetzwerke verkauft.",
    ].join("\n\n"),
  },
  {
    heading: "3. Rechtsgrundlagen der Verarbeitung",
    body: [
      "Je nach Verarbeitung stützen wir uns auf folgende Rechtsgrundlagen:",
      "• Art. 6 Abs. 1 lit. a DSGVO – Einwilligung, insbesondere bei freiwilligen Profildaten, Push-Benachrichtigungen, Geräteberechtigungen und optionalen Funktionen.\n• Art. 6 Abs. 1 lit. b DSGVO – Vertragserfüllung, insbesondere für Registrierung, Nutzerkonto, App-Funktionen, Nachrichten, Anrufe, Gruppen, Events, Tickets, Abonnements und Support.\n• Art. 6 Abs. 1 lit. c DSGVO – rechtliche Verpflichtungen, insbesondere steuer-, handels-, auskunfts- und behördliche Pflichten.\n• Art. 6 Abs. 1 lit. f DSGVO – berechtigte Interessen, insbesondere Betriebssicherheit, Missbrauchsvermeidung, Moderation, Fehleranalyse, Plattformstatistiken, Rechtsdurchsetzung und Weiterentwicklung der App.",
      "Soweit eine Verarbeitung auf Einwilligung beruht, kann diese jederzeit mit Wirkung für die Zukunft widerrufen werden.",
    ].join("\n\n"),
  },
  {
    heading: "4. Kategorien personenbezogener Daten",
    body: [
      "Je nach Nutzung der App verarbeiten wir insbesondere folgende Daten:",
      "4.1 Kontodaten\n• E-Mail-Adresse\n• Name / Anzeigename\n• Passwort in gehashter Form\n• Login-Verfahren, Sitzungen und Authentifizierungsdaten\n• Google-Konto-Informationen, sofern Google-Login genutzt wird\n• Kontostatus, Rolle, Onboarding-Status und Erstellungszeitpunkt",
      "4.2 Profildaten\n• Profilbild und Bannerbild\n• Biografie\n• Landkreis, Stadt oder sonstige regionale Angaben\n• Geschlecht, Geburtsdatum und Interessen, soweit freiwillig angegeben\n• Suchtext und öffentlich sichtbare Profilinformationen",
      "4.3 Inhalte und Interaktionen\n• Beiträge, Fotos, Videos, Bildunterschriften und Vorschaubilder\n• Kommentare, Likes, gespeicherte Beiträge und geteilte Beiträge\n• Gruppen, Gruppenmitgliedschaften, Gruppenrollen und Beitrittsanfragen\n• Umfragen und Abstimmungen\n• Freundschaftsanfragen, Freundschaftsstatus und Blockierungen",
      "4.4 Kommunikationsdaten\n• Direktnachrichten mit Text, Bildern, Videos, Sprachnachrichten und geteilten Beiträgen\n• Absender, Empfänger, Konversation, Zeitpunkte und Lesestatus\n• Gesprächseinstellungen wie angepinnte oder ausgeblendete Konversationen",
      "4.5 Anruf- und Live-Stream-Daten\n• Anrufart, Status, Teilnehmer, Start-, Annahme- und Endzeitpunkte\n• Signalisierungsdaten für WebRTC-Verbindungen (z. B. Verbindungsangebote und ICE-Kandidaten)\n• Live-Stream-Titel, Host, Co-Host, Zuschauer, Teilnehmerzahlen, Kommentare und Beitrittsanfragen",
      "4.6 Event- und Ticketdaten\n• Eventname, Beschreibung, Ort, Stadt, Landkreis, Datum, Uhrzeit, Dauer, Preis und Status\n• Teilnehmerdaten, Ticketstatus, QR-Code, Check-in-Status und Einlasszeitpunkte\n• Einlasshelfer, Eventadministratoren und zugehörige Berechtigungen",
      "4.7 Zahlungs- und Vertragsdaten\n• Stripe-Kunden-ID, Abonnementstatus, Abonnementplan und Laufzeit\n• Zahlungsstatus, Transaktions- und Rechnungsinformationen, soweit für Verwaltung und Nachweis erforderlich\n• Vollständige Kreditkarten- oder Bankdaten werden nicht auf unseren Servern gespeichert, sondern durch Stripe verarbeitet.",
      "4.8 Meldungen, Moderation und Sicherheit\n• Meldender Nutzer, gemeldeter Inhalt oder Nutzer, Meldegrund, Status und Bearbeitungszeitpunkt\n• Moderationsentscheidungen, Sperren, Löschungen und sicherheitsrelevante Hinweise\n• technische Logdaten zur Missbrauchs- und Fehleranalyse",
      "4.9 Geräte-, Nutzungs- und technische Daten\n• IP-Adresse, App-Version, Betriebssystem, Gerätetyp und technische Logdaten\n• Push-Token, Plattformbezug und Benachrichtigungseinstellungen\n• Zeitpunkte der Aktivität, Nutzungsereignisse und aggregierte Kennzahlen\n• lokal gespeicherte Sitzungsdaten und Authentifizierungstoken",
    ].join("\n\n"),
  },
  {
    heading: "5. Öffentliche Inhalte und Sichtbarkeit",
    body: [
      "Profilangaben und vom Nutzer veröffentlichte Inhalte können je nach Funktion für andere Nutzer sichtbar sein. Dazu gehören insbesondere Beiträge, Fotos, Videos, Kommentare, Likes, Gruppenaktivitäten, Umfragen, Events und Live-Stream-Interaktionen.",
      "Andere Nutzer können sichtbare Inhalte wahrnehmen, melden, speichern, abfotografieren oder außerhalb der App weiterverbreiten. Wir können eine solche Weiterverbreitung technisch nicht vollständig verhindern.",
      "Nutzer sollten daher keine Informationen veröffentlichen, die sie nicht anderen zugänglich machen möchten.",
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit die Veröffentlichung Teil der genutzten App-Funktion ist, sowie Art. 6 Abs. 1 lit. f DSGVO für den sicheren und geordneten Betrieb der Plattform.",
    ].join("\n\n"),
  },
  {
    heading: "6. Registrierung, Login und Authentifizierung",
    body: [
      "Für die Registrierung und Anmeldung verarbeiten wir die für das jeweilige Login-Verfahren erforderlichen Daten. Dazu gehören insbesondere E-Mail-Adresse, Name, Passwort in gehashter Form, Sitzungsdaten und technische Authentifizierungsinformationen.",
      "Bei Nutzung des Google-Logins verarbeitet Google zusätzlich Daten nach eigener Datenschutzerklärung. Wir erhalten nur die für den Login erforderlichen Informationen, insbesondere Identifikationsdaten, Name und E-Mail-Adresse.",
      "Die Authentifizierung wird technisch über Better Auth innerhalb unserer App-Infrastruktur umgesetzt. Die damit verbundenen Daten werden für Kontoerstellung, Login, Sitzungsverwaltung, Passwortzurücksetzung und Sicherheit verarbeitet.",
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO sowie Art. 6 Abs. 1 lit. f DSGVO für die Sicherheit des Nutzerkontos.",
    ].join("\n\n"),
  },
  {
    heading: "7. Regionale Angaben und Standort",
    body: [
      "Nutzer können freiwillig Landkreis, Stadt oder andere regionale Angaben hinterlegen, damit regionale Inhalte, Gruppen, Events und Community-Bezüge angezeigt werden können.",
      "Derzeit wird kein präziser GPS-Standort im Hintergrund erhoben. Eine ungefähre technische Zuordnung kann sich aus der IP-Adresse ergeben und dient ausschließlich Sicherheit, Stabilität, Missbrauchsvermeidung und technischer Bereitstellung.",
      "Sollte künftig eine Funktion präzise Standortdaten benötigen, wird dies in der App gesondert angezeigt und nur nach entsprechender Gerätefreigabe bzw. Einwilligung verarbeitet.",
      "Rechtsgrundlage für freiwillige regionale Angaben ist Art. 6 Abs. 1 lit. a DSGVO. Rechtsgrundlage für technische IP-Verarbeitung ist Art. 6 Abs. 1 lit. f DSGVO.",
    ].join("\n\n"),
  },
  {
    heading: "8. Beiträge, Medien, Kommentare und Gruppen",
    body: [
      "Wenn Nutzer Beiträge, Fotos, Videos, Kommentare, Gruppen, Gruppennachrichten, Interessen oder Umfragen erstellen, verarbeiten wir die eingegebenen Inhalte, Medien, Zeitpunkte, Autorenzuordnung und technische Metadaten zur Bereitstellung der jeweiligen Funktion.",
      "Medien können in verschiedene technische Formate umgewandelt, komprimiert oder mit Vorschaubildern versehen werden, um Darstellung, Sicherheit und Performance der App zu gewährleisten.",
      "Nutzer können eigene Beiträge, Fotos und Videos löschen, soweit die Funktion dies vorsieht. Kommentare, Likes und andere Interaktionen werden im Rahmen der Kontolöschung oder Moderation gelöscht, soweit keine gesetzlichen oder berechtigten Gründe entgegenstehen.",
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO sowie Art. 6 Abs. 1 lit. f DSGVO für Sicherheit, Moderation und Missbrauchsvermeidung.",
    ].join("\n\n"),
  },
  {
    heading: "9. Direktnachrichten und Kommunikationsverläufe",
    body: [
      "Für Direktnachrichten verarbeiten wir Absender, Empfänger, Konversation, Inhalt, Medien, Zeitpunkte, Lesestatus und technische Zustellinformationen.",
      "Gesendete Nachrichten bleiben grundsätzlich im Gesprächsverlauf des Empfängers erhalten. Bei Kontolöschung werden Profil- und Kontodaten des gelöschten Nutzers entfernt; bereits versendete Nachrichten können im Verlauf anderer Nutzer weiter sichtbar bleiben, um Kommunikationszusammenhänge zu erhalten und berechtigte Interessen der Gesprächspartner zu wahren.",
      "Nachrichten können aus rechtlichen, sicherheitsrelevanten oder moderativen Gründen entfernt oder gesperrt werden.",
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO für die Nachrichtenfunktion sowie Art. 6 Abs. 1 lit. f DSGVO für Integrität von Kommunikationsverläufen, Missbrauchsabwehr und Rechtsdurchsetzung.",
    ].join("\n\n"),
  },
  {
    heading: "10. Audio-/Videoanrufe und Live-Streams",
    body: [
      "Audio- und Videoanrufe sowie Live-Streams werden über WebRTC realisiert. Dabei werden technische Signalisierungsdaten verarbeitet, damit Verbindungen zwischen Endgeräten aufgebaut werden können.",
      "Medienströme laufen nach Möglichkeit direkt zwischen den Geräten der Teilnehmer. Wenn eine direkte Verbindung nicht möglich ist, können TURN-/STUN-Relayserver von Metered eingesetzt werden. Dabei können IP-Adressen und verschlüsselte Medienströme über Server des Dienstleisters geleitet werden.",
      "Der Inhalt laufender Anrufe wird vom Anbieter grundsätzlich nicht aufgezeichnet. Live-Stream-Metadaten, Kommentare, Teilnehmer- und Zuschauerinformationen können verarbeitet werden, um den Live-Stream bereitzustellen, zu moderieren und Missbrauch zu verhindern.",
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO sowie Art. 6 Abs. 1 lit. f DSGVO für technische Sicherheit, Stabilität und Moderation.",
    ].join("\n\n"),
  },
  {
    heading: "11. Events, Tickets und QR-Code-Check-in",
    body: [
      "Für Events verarbeiten wir Eventangaben, Veranstalterdaten, Teilnehmerdaten, Ticketdaten, QR-Codes, Check-in-Status, Einlasszeitpunkte und Eventadministratoren, soweit dies für Erstellung, Verwaltung, Teilnahme, Ticketkauf und Einlass erforderlich ist.",
      "Bei Ticketkäufen und kostenpflichtigen Leistungen werden Zahlungsinformationen über Stripe verarbeitet. Wir speichern nur die für Vertragsverwaltung, Nachweis, Abonnementstatus und Support erforderlichen Zahlungsreferenzen.",
      "Wenn Veranstalter oder Nutzer bei Events Fotos oder Videos erstellen und veröffentlichen, sind sie selbst für die Einhaltung des Rechts am eigenen Bild und der datenschutzrechtlichen Vorgaben verantwortlich. Betroffene Personen können entsprechende Inhalte melden.",
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, Art. 6 Abs. 1 lit. c DSGVO für gesetzliche Aufbewahrungspflichten sowie Art. 6 Abs. 1 lit. f DSGVO für Sicherheit, Nachweis und Missbrauchsvermeidung.",
    ].join("\n\n"),
  },
  {
    heading: "12. Zahlungen und Stripe",
    body: [
      "Zahlungen für Abonnements, Tickets oder andere kostenpflichtige Leistungen werden über Stripe abgewickelt. Stripe verarbeitet Zahlungsdaten in eigener Verantwortung bzw. als Dienstleister, soweit dies für die Zahlungsabwicklung erforderlich ist.",
      "Wir verarbeiten insbesondere Stripe-Kunden-ID, Abonnementstatus, Laufzeit, Zahlungsstatus und abrechnungsrelevante Informationen. Vollständige Kreditkarten- oder Bankdaten werden nicht auf unseren Servern gespeichert.",
      "Weitere Informationen zum Datenschutz bei Stripe finden sich unter: https://stripe.com/de/privacy",
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO für Zahlungs- und Vertragsabwicklung sowie Art. 6 Abs. 1 lit. c DSGVO für gesetzliche Aufbewahrungspflichten.",
    ].join("\n\n"),
  },
  {
    heading: "13. Push-Benachrichtigungen",
    body: [
      "Die App kann Push-Benachrichtigungen für Nachrichten, Anrufe, Gruppenaktivitäten, Event-Erinnerungen, Freundschaftsanfragen, Moderationshinweise, Systeminformationen und Ankündigungen senden.",
      "Hierfür werden insbesondere Push-Token, Plattform-/Gerätebezug, Benachrichtigungseinstellungen und Zustellinformationen verarbeitet. Push-Benachrichtigungen setzen eine Freigabe über das Betriebssystem voraus.",
      "Push-Benachrichtigungen können jederzeit in den Geräte- oder App-Einstellungen deaktiviert werden. Danach können bestimmte Hinweise nicht mehr oder nur eingeschränkt zugestellt werden.",
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO für die Gerätefreigabe sowie Art. 6 Abs. 1 lit. b oder lit. f DSGVO für funktionale und sicherheitsrelevante Benachrichtigungen.",
    ].join("\n\n"),
  },
  {
    heading: "14. Lokale Speicherung, Cookies und ähnliche Technologien",
    body: [
      "Die App nutzt lokale Speichertechnologien, Authentifizierungstoken und technisch erforderliche Informationen, um Login, Sitzungen, Sicherheit, App-Funktionen und Einstellungen bereitzustellen.",
      "Soweit solche Technologien für die Bereitstellung der App technisch erforderlich sind, erfolgt der Zugriff auf Grundlage von § 25 Abs. 2 TDDDG. Soweit eine Einwilligung erforderlich ist, erfolgt der Zugriff auf Grundlage von § 25 Abs. 1 TDDDG und Art. 6 Abs. 1 lit. a DSGVO.",
      "Nicht erforderliche Werbe- oder Marketing-Cookies werden derzeit nicht eingesetzt.",
    ].join("\n\n"),
  },
  {
    heading: "15. Geräteberechtigungen",
    body: [
      "Je nach genutzter Funktion kann die App um Geräteberechtigungen bitten:",
      "• Kamera: für Profilbilder, Beiträge, Videoanrufe und Live-Streams\n• Mikrofon: für Sprachnachrichten, Audio-/Videoanrufe und Live-Streams\n• Foto-/Mediathek: zum Auswählen von Bildern und Videos\n• Push-Benachrichtigungen: für Benachrichtigungen und Hinweise\n• Standort: derzeit nicht für präzise GPS-Erhebung erforderlich; regionale Angaben erfolgen manuell",
      "Berechtigungen können jederzeit in den Geräteeinstellungen widerrufen werden. Ohne Berechtigung stehen betroffene Funktionen nicht oder nur eingeschränkt zur Verfügung.",
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO bzw. Art. 6 Abs. 1 lit. b DSGVO, soweit die Verarbeitung zur vom Nutzer angeforderten Funktion erforderlich ist.",
    ].join("\n\n"),
  },
  {
    heading: "16. Plattformstatistiken und interne Analysen",
    body: [
      "Wir erstellen interne Plattformstatistiken, um Betrieb, Sicherheit, Produktqualität und Weiterentwicklung der App zu verbessern. Dazu zählen insbesondere Gesamtzahlen zu Nutzern, aktiven Nutzern, Neuregistrierungen, Abonnements, Beiträgen, Nachrichten, Gruppen, Events, Fotos, Videos und Umsätzen.",
      "Diese Auswertungen erfolgen grundsätzlich aggregiert oder pseudonymisiert und dienen nicht dazu, einzelne Nutzer werblich zu profilieren. Es werden keine externen Analyse- oder Werbetrackingdienste eingesetzt.",
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse liegt in Betriebsüberwachung, Fehlererkennung, Sicherheitskontrolle und Verbesserung der App.",
    ].join("\n\n"),
  },
  {
    heading: "17. Meldungen, Moderation, Blockierungen und Rechtsdurchsetzung",
    body: [
      "Wenn Inhalte, Nutzer, Gruppen oder Partnerprofile gemeldet werden, verarbeiten wir die zur Prüfung erforderlichen Daten: meldender Nutzer, gemeldeter Gegenstand, Grund, Begründung, Zeitpunkt, Bearbeitungsstatus und ggf. Moderationsentscheidung.",
      "Wir können Inhalte prüfen, entfernen, sperren, einschränken, Konten verwarnen oder deaktivieren und relevante Informationen an Behörden weitergeben, soweit dies gesetzlich vorgeschrieben oder zur Rechtsdurchsetzung erforderlich ist.",
      "Blockierungen werden verarbeitet, um unerwünschte Kontakte und Interaktionen zu verhindern.",
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO sowie Art. 6 Abs. 1 lit. c DSGVO, soweit gesetzliche Pflichten bestehen.",
    ].join("\n\n"),
  },
  {
    heading: "18. E-Mail-Kommunikation und Direktwerbung",
    body: [
      "Wir senden transaktionale und sicherheitsrelevante E-Mails, z. B. Passwort-Zurücksetzungen, Sicherheitsbenachrichtigungen, Kontohinweise, Zahlungsinformationen oder wesentliche Änderungen der AGB bzw. Datenschutzerklärung.",
      "Werbliche E-Mails versenden wir nur, wenn eine ausdrückliche Einwilligung vorliegt oder die gesetzlichen Voraussetzungen der Bestandskundenwerbung nach § 7 Abs. 3 UWG vollständig erfüllt sind. Ohne Einwilligung oder gesetzliche Erlaubnis erfolgt keine werbliche E-Mail-Kommunikation.",
      "Nutzer können der Nutzung ihrer E-Mail-Adresse zu Werbezwecken jederzeit widersprechen, z. B. per E-Mail an leif@z-social.com oder über einen Abmeldelink in der jeweiligen E-Mail.",
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, Art. 6 Abs. 1 lit. f DSGVO, Art. 6 Abs. 1 lit. a DSGVO und § 7 UWG.",
    ].join("\n\n"),
  },
  {
    heading: "19. Empfänger und technische Dienstleister",
    body: [
      "Zur Bereitstellung der App setzen wir technische Dienstleister ein. Eine Weitergabe erfolgt nur, soweit dies für Betrieb, Vertragserfüllung, Sicherheit, Zahlungsabwicklung, Support, gesetzliche Pflichten oder Rechtsdurchsetzung erforderlich ist.",
      "19.1 Convex Labs LLC (USA)\nZweck: Backend, Datenbank, Dateispeicherung, Echtzeit-Synchronisation, Serverfunktionen und Hosting der App-Daten.\nVerarbeitete Daten: App- und Nutzerdaten, Inhalte, Medien, technische Daten und Funktionsdaten.\nDrittlandtransfer: Soweit kein Angemessenheitsbeschluss oder keine Zertifizierung nach dem EU-US Data Privacy Framework vorliegt, erfolgt die Übermittlung auf Grundlage geeigneter Garantien, insbesondere EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.",
      "19.2 Stripe Payments Europe Ltd. / Stripe, Inc.\nZweck: Zahlungsabwicklung, Abonnements, Ticketzahlungen, Rechnungs- und Zahlungsstatus.\nVerarbeitete Daten: zahlungs- und vertragsbezogene Informationen. Vollständige Zahlungsdaten werden durch Stripe verarbeitet.\nDatenschutzhinweise: https://stripe.com/de/privacy",
      "19.3 Expo / Push-Benachrichtigungsinfrastruktur\nZweck: Zustellung von Push-Benachrichtigungen an mobile Endgeräte.\nVerarbeitete Daten: Push-Token, Plattform- und Zustellinformationen.\nDrittlandtransfer: Soweit erforderlich, auf Grundlage geeigneter Garantien gemäß Art. 46 DSGVO oder einschlägiger Angemessenheitsmechanismen.",
      "19.4 Next Path Software Consulting Inc. (Metered), Kanada\nZweck: STUN-/TURN-Relayserver für WebRTC-Verbindungen bei Audio-/Videoanrufen und Live-Streams.\nVerarbeitete Daten: IP-Adressen, technische Verbindungsdaten und verschlüsselte Medienströme, soweit eine Relay-Verbindung erforderlich ist.\nDrittlandtransfer: Für Kanada besteht ein Angemessenheitsbeschluss der EU-Kommission, soweit der Empfänger dem kanadischen Datenschutzrecht unterfällt; im Übrigen geeignete Garantien wie EU-Standardvertragsklauseln.",
      "19.5 Plus Five Five, Inc. (Resend), USA\nZweck: Versand transaktionaler E-Mails, Passwort-Zurücksetzungen, Sicherheits- und Systembenachrichtigungen.\nVerarbeitete Daten: E-Mail-Adresse, Name soweit angegeben, E-Mail-Inhalt und Zustelldaten.\nDatenschutzhinweise: https://resend.com/legal/privacy-policy",
      "19.6 Google Ireland Ltd. / Google LLC\nZweck: Google-Login, soweit der Nutzer diesen verwendet.\nVerarbeitete Daten: Google-Konto-ID, Name, E-Mail-Adresse und technische Login-Informationen.\nDatenschutzhinweise: https://policies.google.com/privacy",
      "Eine kommerzielle Weitergabe oder ein Verkauf personenbezogener Daten an Dritte findet nicht statt.",
    ].join("\n\n"),
  },
  {
    heading: "20. Drittlandübermittlungen",
    body: [
      "Personenbezogene Daten können durch eingesetzte Dienstleister in Drittländern, insbesondere den USA und Kanada, verarbeitet werden.",
      "Soweit ein Angemessenheitsbeschluss der EU-Kommission besteht oder der jeweilige Empfänger nach dem EU-US Data Privacy Framework zertifiziert ist, stützen wir die Übermittlung hierauf. Andernfalls erfolgt die Übermittlung auf Grundlage geeigneter Garantien, insbesondere EU-Standardvertragsklauseln gemäß Art. 46 DSGVO und ergänzender Schutzmaßnahmen, soweit erforderlich.",
      "Wir weisen darauf hin, dass in Drittländern ein Zugriff durch Behörden nicht vollständig ausgeschlossen werden kann.",
    ].join("\n\n"),
  },
  {
    heading: "21. Speicherdauer und Löschung",
    body: [
      "Wir speichern personenbezogene Daten nur so lange, wie dies für die jeweiligen Zwecke erforderlich ist oder gesetzliche Aufbewahrungspflichten bestehen.",
      "• Kontodaten und Profildaten: für die Dauer des Nutzerkontos; bei Kontolöschung Löschung, soweit keine Aufbewahrungspflichten oder berechtigten Gründe entgegenstehen.\n• Beiträge, Fotos, Videos, Kommentare, Likes und gespeicherte Beiträge: bis zur Löschung durch den Nutzer, im Rahmen der Kontolöschung oder durch Moderation.\n• Direktnachrichten: bleiben im Gesprächsverlauf der Gesprächspartner erhalten, auch wenn das Konto des Absenders gelöscht wird; Profil- und Kontodaten des gelöschten Nutzers werden entfernt.\n• Gruppenmitgliedschaften, Freundschaftsanfragen, Benachrichtigungen und Tickets: grundsätzlich bis zur Kontolöschung oder Zweckerreichung.\n• Anruf- und Live-Stream-Metadaten: solange dies für Bereitstellung, Sicherheit, Fehleranalyse oder Moderation erforderlich ist.\n• Zahlungs- und Rechnungsdaten: nach gesetzlichen Aufbewahrungspflichten, regelmäßig bis zu 10 Jahre.\n• Meldungen und Moderationsdaten: bis zur abschließenden Bearbeitung und darüber hinaus, soweit dies für Rechtsdurchsetzung, Missbrauchsvermeidung oder Nachweispflichten erforderlich ist.\n• Sicherheits- und Logdaten: nur solange erforderlich, regelmäßig begrenzt und zweckgebunden.\n• Backups: werden nach technischen Lösch- und Überschreibzyklen entfernt.",
      "Soweit Daten auf Einwilligung beruhen, werden sie nach Widerruf gelöscht, sofern keine andere Rechtsgrundlage oder gesetzliche Pflicht entgegensteht.",
    ].join("\n\n"),
  },
  {
    heading: "22. Rechte betroffener Personen",
    body: [
      "Betroffene Personen haben nach Maßgabe der DSGVO folgende Rechte:",
      "• Auskunft (Art. 15 DSGVO)\n• Berichtigung (Art. 16 DSGVO)\n• Löschung (Art. 17 DSGVO)\n• Einschränkung der Verarbeitung (Art. 18 DSGVO)\n• Unterrichtung über Berichtigung, Löschung oder Einschränkung (Art. 19 DSGVO)\n• Datenübertragbarkeit (Art. 20 DSGVO)\n• Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21 DSGVO)\n• Widerruf einer Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO)",
      "Anfragen können an leif@z-social.com gerichtet werden. Wir beantworten Anfragen grundsätzlich innerhalb eines Monats.",
      "Das Recht auf Löschung kann eingeschränkt sein, soweit gesetzliche Aufbewahrungspflichten, berechtigte Nachweisinteressen, Rechte anderer Nutzer oder die Integrität von Kommunikationsverläufen entgegenstehen.",
    ].join("\n\n"),
  },
  {
    heading: "23. Widerspruchsrecht nach Art. 21 DSGVO",
    body: [
      "Wenn wir personenbezogene Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO verarbeiten, können Nutzer aus Gründen, die sich aus ihrer besonderen Situation ergeben, jederzeit Widerspruch gegen die Verarbeitung einlegen.",
      "Wir verarbeiten die betroffenen Daten dann nicht mehr, es sei denn, wir können zwingende schutzwürdige Gründe nachweisen, die die Interessen, Rechte und Freiheiten der betroffenen Person überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen.",
      "Gegen Direktwerbung kann jederzeit ohne Angabe von Gründen widersprochen werden.",
    ].join("\n\n"),
  },
  {
    heading: "24. Beschwerderecht bei einer Aufsichtsbehörde",
    body: [
      "Nutzer haben das Recht, sich bei einer Datenschutzaufsichtsbehörde zu beschweren, insbesondere in dem Mitgliedstaat ihres Aufenthaltsorts, ihres Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes.",
      "Für Mecklenburg-Vorpommern ist zuständig:",
      "Der Landesbeauftragte für Datenschutz und Informationsfreiheit Mecklenburg-Vorpommern\nSchloss Schwerin\nLennéstraße 1\n19053 Schwerin\nDeutschland",
      "Telefon: +49 385 59494 0\nE-Mail: datenschutz@datenschutz-mv.de\nWebsite: https://www.datenschutz-mv.de",
    ].join("\n\n"),
  },
  {
    heading: "25. Datensicherheit",
    body: [
      "Wir setzen technische und organisatorische Maßnahmen ein, um personenbezogene Daten gegen Verlust, Missbrauch, unbefugten Zugriff, Veränderung und unbefugte Weitergabe zu schützen.",
      "Dazu gehören insbesondere verschlüsselte Übertragung (TLS), Passwort-Hashing, Zugriffsbeschränkungen, rollenbasierte Berechtigungen, technische Protokollierung, Missbrauchsprävention, regelmäßige Sicherheitsprüfungen und verschlüsselte Medienübertragung bei WebRTC nach Stand der Technik.",
      "Trotz aller Maßnahmen kann keine absolute Sicherheit garantiert werden. Nutzer sollten sichere Passwörter verwenden und Zugangsdaten nicht weitergeben.",
    ].join("\n\n"),
  },
  {
    heading: "26. Minderjährige",
    body: [
      "Die App ist für Personen ab 16 Jahren bestimmt. Personen unter 16 Jahren dürfen kein Konto erstellen.",
      "Sollten wir Kenntnis davon erlangen, dass ein Kind unter 16 Jahren ein Konto erstellt hat, werden wir das Konto sperren oder löschen und die zugehörigen Daten entfernen, soweit keine gesetzlichen Gründe entgegenstehen.",
    ].join("\n\n"),
  },
  {
    heading: "27. Keine automatisierten Einzelentscheidungen",
    body: "Es findet keine ausschließlich automatisierte Entscheidung im Sinne von Art. 22 DSGVO statt, die gegenüber Nutzern rechtliche Wirkung entfaltet oder sie in ähnlicher Weise erheblich beeinträchtigt.",
  },
  {
    heading: "28. Änderungen dieser Datenschutzerklärung",
    body: [
      "Wir können diese Datenschutzerklärung anpassen, wenn sich Rechtslage, App-Funktionen, technische Abläufe oder eingesetzte Dienstleister ändern.",
      `Die aktuelle Fassung ist jederzeit in der App im Privacy Center sowie unter ${LEGAL_URLS.privacy} abrufbar. Bei wesentlichen Änderungen informieren wir Nutzer in angemessener Weise, z. B. per E-Mail oder In-App-Hinweis.`,
      "Stand: Mai 2026",
    ].join("\n\n"),
  },
];

/* ═══════════════════════════════════════════════════
   Impressum
   ═══════════════════════════════════════════════════ */
export const IMPRESSUM_SECTIONS: LegalSection[] = [
  {
    heading: "Angaben gemäß § 5 DDG",
    body: [
      "CONTENTHÜTTE",
      "Leif Dunkelmann",
      "Werderstraße 135",
      "19055 Schwerin",
      "Deutschland",
    ].join("\n"),
  },
  {
    heading: "Kontakt",
    body: "E-Mail: leif@z-social.com\nTelefon: 01734506873",
  },
  {
    heading: "Verantwortlich i.S.d. § 18 Abs. 2 MStV",
    body: "Leif Dunkelmann\nWerderstraße 135\n19055 Schwerin\nDeutschland",
  },
  {
    heading: "Zentrale Kontaktstelle nach dem Digital Services Act (DSA)",
    body: "Für behördliche Anordnungen, Hinweise auf rechtswidrige Inhalte, Beschwerden und Anfragen nach dem Digital Services Act ist folgende zentrale Kontaktstelle eingerichtet:\n\nleif@z-social.com\n\nKommunikation ist auf Deutsch und Englisch möglich.",
  },
  {
    heading: "Jugendschutz und Meldungen",
    body: "Hinweise auf jugendgefährdende, rechtswidrige oder sonst unzulässige Inhalte können über die Meldefunktion der App oder per E-Mail an leif@z-social.com gemeldet werden.",
  },
  {
    heading: "Zuständige Aufsichtsbehörde für audiovisuelle Medienangebote",
    body: "Medienanstalt Mecklenburg-Vorpommern (MMV)\nBleicherufer 1\n19053 Schwerin\nDeutschland",
  },
  {
    heading: "Verbraucherstreitbeilegung",
    body: "Der Anbieter ist zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle weder verpflichtet noch bereit.",
  },
  {
    heading: "Haftung für Inhalte und Links",
    body: [
      "Als Diensteanbieter ist der Anbieter nach den allgemeinen Gesetzen für eigene Inhalte verantwortlich. Für nutzergenerierte Inhalte und fremde Informationen besteht keine allgemeine Pflicht zur anlasslosen Überwachung.",
      "Sofern die App Links zu externen Websites enthält, hat der Anbieter auf deren Inhalte keinen Einfluss. Für Inhalte, Angebote und Datenschutzpraktiken externer Seiten ist ausschließlich der jeweilige Anbieter verantwortlich.",
    ].join("\n\n"),
  },
  {
    heading: "Urheberrecht",
    body: "Die vom Anbieter erstellten Inhalte und Werke unterliegen dem deutschen Urheberrecht. Nutzergenerierte Inhalte verbleiben grundsätzlich bei den jeweiligen Nutzern. Jede Nutzung außerhalb der gesetzlichen Grenzen oder der in den AGB eingeräumten Rechte bedarf der jeweiligen Berechtigung.",
  },
  {
    heading: "Stand",
    body: "Mai 2026",
  },
];
