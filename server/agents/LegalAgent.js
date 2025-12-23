/**
 * LegalAgent - Rechts- und Vertragsassistent
 * ==========================================
 *
 * Features:
 * - Vertragserstellung und -prüfung
 * - AGB und Datenschutz
 * - Rechtliche Hinweise (mit Disclaimer)
 * - Multi-Jurisdiktion (DE, AT, CH, BA, RS, HR)
 */

const BaseAgent = require('./BaseAgent');
const { LanguageDetector, TaskTypeDetector, SimpleCache } = require('./AgentUtils');

const TASK_TYPES = Object.freeze({
  CONTRACT_CREATE: 'contract_create',
  CONTRACT_REVIEW: 'contract_review',
  LEGAL_ADVICE: 'legal_advice',
  TERMS_CREATE: 'terms_create',
  PRIVACY_POLICY: 'privacy_policy',
  GDPR_CHECK: 'gdpr_check',
  DISCLAIMER: 'disclaimer'
});

const JURISDICTIONS = Object.freeze({
  de: {
    name: 'Deutschland',
    laws: ['BGB', 'HGB', 'DSGVO', 'UWG', 'TMG'],
    language: 'Deutsch'
  },
  at: {
    name: 'Österreich',
    laws: ['ABGB', 'UGB', 'DSGVO', 'ECG', 'KSchG'],
    language: 'Deutsch'
  },
  ch: {
    name: 'Schweiz',
    laws: ['OR', 'ZGB', 'DSG', 'UWG'],
    language: 'Deutsch/Französisch'
  },
  ba: {
    name: 'Bosnien-Herzegowina',
    laws: ['ZOO', 'Zakon o obligacionim odnosima', 'Zakon o zaštiti potrošača'],
    language: 'Bosnisch'
  },
  rs: {
    name: 'Serbien',
    laws: ['ZOO', 'Zakon o zaštiti potrošača', 'Zakon o elektronskoj trgovini'],
    language: 'Serbisch'
  },
  hr: {
    name: 'Kroatien',
    laws: ['ZOO', 'Zakon o obveznim odnosima', 'GDPR', 'Zakon o zaštiti potrošača'],
    language: 'Kroatisch'
  }
});

const CONTRACT_TYPES = Object.freeze({
  service: { name: 'Dienstleistungsvertrag', clauses: ['Leistungsbeschreibung', 'Vergütung', 'Haftung', 'Kündigung'] },
  employment: { name: 'Arbeitsvertrag', clauses: ['Tätigkeit', 'Vergütung', 'Arbeitszeit', 'Urlaub', 'Kündigung'] },
  rental: { name: 'Mietvertrag', clauses: ['Mietobjekt', 'Miete', 'Nebenkosten', 'Kaution', 'Kündigung'] },
  sales: { name: 'Kaufvertrag', clauses: ['Kaufgegenstand', 'Preis', 'Lieferung', 'Gewährleistung'] },
  nda: { name: 'Geheimhaltungsvereinbarung', clauses: ['Vertrauliche Informationen', 'Nutzung', 'Dauer', 'Vertragsstrafe'] },
  freelance: { name: 'Freiberufler-Vertrag', clauses: ['Projekt', 'Honorar', 'Urheberrecht', 'Scheinselbständigkeit'] }
});

class LegalAgent extends BaseAgent {
  constructor() {
    super({
      id: 'legal',
      name: 'Legal Agent',
      type: 'legal',
      version: '2.1.0',
      description: 'Erstellt und prüft Verträge, AGB und rechtliche Dokumente.',
      primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      fallback: { provider: 'openai', model: 'gpt-4o' },
      capabilities: Object.values(TASK_TYPES),
      keywords: [
        'vertrag', 'contract', 'ugovor', 'agb', 'terms', 'uvjeti',
        'datenschutz', 'privacy', 'dsgvo', 'gdpr', 'recht', 'legal',
        'klausel', 'clause', 'kündigung', 'haftung', 'liability'
      ],
      costs: { input: 3, output: 15 },
      feedback: { enabled: true, minSamples: 5 }
    });

    this._languageDetector = new LanguageDetector();
    this._taskTypeDetector = new TaskTypeDetector({
      [TASK_TYPES.CONTRACT_CREATE]: ['vertrag erstellen', 'create contract', 'napravi ugovor'],
      [TASK_TYPES.CONTRACT_REVIEW]: ['vertrag prüfen', 'review contract', 'provjeri ugovor'],
      [TASK_TYPES.LEGAL_ADVICE]: ['rechtlich', 'legal advice', 'pravni savjet'],
      [TASK_TYPES.TERMS_CREATE]: ['agb', 'terms', 'uvjeti korištenja', 'nutzungsbedingungen'],
      [TASK_TYPES.PRIVACY_POLICY]: ['datenschutz', 'privacy', 'privatnost', 'dsgvo', 'gdpr'],
      [TASK_TYPES.GDPR_CHECK]: ['dsgvo prüfung', 'gdpr check', 'gdpr compliance'],
      [TASK_TYPES.DISCLAIMER]: ['disclaimer', 'haftungsausschluss', 'izjava o odgovornosti']
    });

    this._cache = new SimpleCache(50, 300000);
  }

  /**
   * Jurisdiktion erkennen
   */
  _detectJurisdiction(content) {
    const lower = content.toLowerCase();

    if (lower.includes('bosn') || lower.includes('bih') || lower.includes('sarajevo') || lower.includes('bosnia')) return 'ba';
    if (lower.includes('serb') || lower.includes('beograd') || lower.includes('srbija')) return 'rs';
    if (lower.includes('kroat') || lower.includes('zagreb') || lower.includes('hrvatska') || lower.includes('croatia')) return 'hr';
    if (lower.includes('österreich') || lower.includes('austria') || lower.includes('wien')) return 'at';
    if (lower.includes('schweiz') || lower.includes('switzerland') || lower.includes('swiss')) return 'ch';

    return 'de'; // Default
  }

  /**
   * Vertragstyp erkennen
   */
  _detectContractType(content) {
    const lower = content.toLowerCase();

    if (lower.includes('dienst') || lower.includes('service') || lower.includes('uslug')) return 'service';
    if (lower.includes('arbeit') || lower.includes('employ') || lower.includes('radn') || lower.includes('zaposlenje')) return 'employment';
    if (lower.includes('miet') || lower.includes('rent') || lower.includes('najam') || lower.includes('zakup')) return 'rental';
    if (lower.includes('kauf') || lower.includes('sale') || lower.includes('prodaj') || lower.includes('kupoprodaj')) return 'sales';
    if (lower.includes('nda') || lower.includes('geheimhaltung') || lower.includes('vertraulich') || lower.includes('tajnost')) return 'nda';
    if (lower.includes('freelance') || lower.includes('freiberuf') || lower.includes('honorar') || lower.includes('slobodn')) return 'freelance';

    return 'service';
  }

  /**
   * Prompt-Builder
   */
  buildPrompt(task) {
    const language = this._languageDetector.detect(task.content);
    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.CONTRACT_CREATE);
    const jurisdiction = this._detectJurisdiction(task.content);
    const contractType = this._detectContractType(task.content);
    const jurisdictionInfo = JURISDICTIONS[jurisdiction];
    const contractInfo = CONTRACT_TYPES[contractType];

    const systemPrompt = `Du bist ein erfahrener Rechtsassistent.

⚠️ WICHTIGER DISCLAIMER:
Dies ist KEINE Rechtsberatung im Sinne des Rechtsdienstleistungsgesetzes.
Für verbindliche rechtliche Auskünfte konsultieren Sie einen Rechtsanwalt.

SPRACHE: ${language.language.toUpperCase()}
TASK-TYP: ${taskType.type}
JURISDIKTION: ${jurisdictionInfo.name}
RELEVANTE GESETZE: ${jurisdictionInfo.laws.join(', ')}
${taskType.type.includes('CONTRACT') ? `VERTRAGSTYP: ${contractInfo.name}` : ''}

AUFGABEN JE NACH TASK-TYP:

1. CONTRACT_CREATE:
   - Vertragstyp: ${contractInfo.name}
   - Wichtige Klauseln: ${contractInfo.clauses.join(', ')}
   - Jurisdiktion: ${jurisdictionInfo.name}
   - Salvatorische Klausel einfügen
   - Gerichtsstand angeben

2. CONTRACT_REVIEW:
   - Kritische Klauseln identifizieren
   - Risiken aufzeigen
   - Fehlende Elemente nennen
   - Verbesserungsvorschläge

3. TERMS_CREATE (AGB):
   - Alle gesetzlichen Pflichtangaben
   - Widerrufsrecht (wenn B2C)
   - Haftungsbeschränkungen
   - DSGVO-konform

4. PRIVACY_POLICY:
   - DSGVO/GDPR-konform
   - Art. 13/14 DSGVO Inhalte
   - Cookies und Tracking
   - Rechte der Betroffenen
   - Kontaktdaten Datenschutzbeauftragter

5. GDPR_CHECK:
   - Rechtsgrundlagen prüfen (Art. 6 DSGVO)
   - Informationspflichten
   - Betroffenenrechte
   - Technische Maßnahmen
   - Auftragsverarbeitung

JURISDIKTIONS-SPEZIFISCHE REGELN:

${jurisdiction === 'ba' ? `
Für Bosnien-Herzegowina:
- Zakon o obligacionim odnosima (ZOO) beachten
- Zweisprachigkeit wenn nötig (BS/HR/SR)
- Besonderheiten der Entitäten (FBiH/RS)
- Registrierungspflichten
` : ''}

${jurisdiction === 'rs' ? `
Für Serbien:
- Zakon o obligacionim odnosima
- Kyrillisch oder Lateinisch
- E-Commerce Regelungen
- Verbraucherschutzgesetz
` : ''}

${jurisdiction === 'de' ? `
Für Deutschland:
- BGB für Verträge
- DSGVO strikt einhalten
- AGB-Recht (§§ 305ff BGB)
- Widerrufsbelehrung bei Fernabsatz
` : ''}

QUALITÄTSREGELN:
1. Rechtlich präzise Formulierungen
2. Alle Pflichtangaben enthalten
3. Verständliche Sprache (keine übermäßige Juristensprache)
4. ⚠️ Disclaimer am Ende einfügen
5. Empfehlung zur Prüfung durch Anwalt`;

    return { system: systemPrompt, user: task.content };
  }

  /**
   * Execute mit erweiterten Metadaten
   */
  async execute(task) {
    const language = this._languageDetector.detect(task.content);
    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.CONTRACT_CREATE);
    const jurisdiction = this._detectJurisdiction(task.content);
    const contractType = this._detectContractType(task.content);

    const result = await super.execute(task);

    result.metadata = {
      language: language.language,
      taskType: taskType.type,
      legal: {
        jurisdiction,
        jurisdictionInfo: JURISDICTIONS[jurisdiction],
        contractType,
        contractInfo: CONTRACT_TYPES[contractType]
      },
      disclaimer: 'Dies ist keine Rechtsberatung. Konsultieren Sie einen Rechtsanwalt für verbindliche Auskünfte.',
      recommendations: [
        'Prüfung durch qualifizierten Rechtsanwalt empfohlen',
        `Lokale Gesetze in ${JURISDICTIONS[jurisdiction].name} beachten`
      ]
    };

    return result;
  }
}

LegalAgent.TASK_TYPES = TASK_TYPES;
LegalAgent.JURISDICTIONS = JURISDICTIONS;
LegalAgent.CONTRACT_TYPES = CONTRACT_TYPES;

module.exports = LegalAgent;
