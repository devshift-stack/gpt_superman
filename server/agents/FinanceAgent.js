/**
 * FinanceAgent - Finanz- und Buchhaltungs-Agent
 * ==============================================
 *
 * Features:
 * - Rechnungserstellung (Multi-Währung)
 * - Steuerberechnung (MwSt/PDV)
 * - Buchhaltungs-Auswertungen
 * - Finanzberichte
 * - Balkan-Region Support (BAM, RSD, EUR)
 */

const BaseAgent = require('./BaseAgent');
const {
  LanguageDetector,
  TaskTypeDetector,
  TextAnalyzer,
  IdGenerator,
  CurrencyFormatter,
  SimpleCache
} = require('./AgentUtils');

const TASK_TYPES = Object.freeze({
  INVOICE_CREATE: 'invoice_create',
  TAX_CALCULATE: 'tax_calculate',
  EXPENSE_TRACK: 'expense_track',
  BUDGET_PLAN: 'budget_plan',
  REPORT_FINANCIAL: 'report_financial',
  PAYMENT_REMINDER: 'payment_reminder',
  CASH_FLOW: 'cash_flow'
});

const TAX_RATES = Object.freeze({
  de: { standard: 19, reduced: 7, name: 'MwSt' },
  at: { standard: 20, reduced: 10, name: 'USt' },
  ch: { standard: 7.7, reduced: 2.5, name: 'MWST' },
  ba: { standard: 17, reduced: 0, name: 'PDV' },
  rs: { standard: 20, reduced: 10, name: 'PDV' },
  hr: { standard: 25, reduced: 13, name: 'PDV' }
});

const CURRENCIES = Object.freeze({
  EUR: { symbol: '€', name: 'Euro', countries: ['de', 'at', 'fr', 'es', 'it', 'nl'] },
  BAM: { symbol: 'KM', name: 'Konvertibilna Marka', countries: ['ba'] },
  RSD: { symbol: 'RSD', name: 'Srpski Dinar', countries: ['rs'] },
  HRK: { symbol: 'kn', name: 'Kuna', countries: ['hr'] },
  CHF: { symbol: 'CHF', name: 'Schweizer Franken', countries: ['ch'] },
  USD: { symbol: '$', name: 'US Dollar', countries: ['us'] },
  GBP: { symbol: '£', name: 'Britisches Pfund', countries: ['gb'] }
});

class FinanceAgent extends BaseAgent {
  constructor() {
    super({
      id: 'finance',
      name: 'Finance Agent',
      type: 'finance',
      version: '2.1.0',
      description: 'Erstellt Rechnungen, berechnet Steuern und verwaltet Finanzdaten.',
      primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      fallback: { provider: 'openai', model: 'gpt-4o' },
      capabilities: Object.values(TASK_TYPES),
      keywords: [
        'rechnung', 'invoice', 'faktura', 'steuer', 'tax', 'mwst', 'pdv',
        'buchhaltung', 'accounting', 'budget', 'ausgaben', 'expenses',
        'zahlung', 'payment', 'bilanz', 'balance', 'euro', 'km', 'rsd'
      ],
      costs: { input: 3, output: 15 },
      feedback: { enabled: true, minSamples: 5 }
    });

    this._languageDetector = new LanguageDetector();
    this._taskTypeDetector = new TaskTypeDetector({
      [TASK_TYPES.INVOICE_CREATE]: ['rechnung', 'invoice', 'faktura', 'bill'],
      [TASK_TYPES.TAX_CALCULATE]: ['steuer', 'tax', 'mwst', 'pdv', 'ust'],
      [TASK_TYPES.EXPENSE_TRACK]: ['ausgaben', 'expense', 'kosten', 'cost', 'troškovi'],
      [TASK_TYPES.BUDGET_PLAN]: ['budget', 'plan', 'planung', 'budžet'],
      [TASK_TYPES.REPORT_FINANCIAL]: ['bericht', 'report', 'bilanz', 'izvještaj'],
      [TASK_TYPES.PAYMENT_REMINDER]: ['mahnung', 'reminder', 'zahlungserinnerung', 'podsjetnik'],
      [TASK_TYPES.CASH_FLOW]: ['cashflow', 'cash flow', 'liquidität', 'novčani tok']
    });

    this._cache = new SimpleCache(50, 300000);
  }

  /**
   * Währung erkennen
   */
  _detectCurrency(content) {
    const lower = content.toLowerCase();

    if (lower.includes('km') || lower.includes('marka') || lower.includes('bam') || lower.includes('bosn')) return 'BAM';
    if (lower.includes('rsd') || lower.includes('dinar') || lower.includes('srb') || lower.includes('serb')) return 'RSD';
    if (lower.includes('kn') || lower.includes('kuna') || lower.includes('hrk') || lower.includes('kroat')) return 'HRK';
    if (lower.includes('chf') || lower.includes('franken') || lower.includes('schweiz')) return 'CHF';
    if (lower.includes('$') || lower.includes('dollar') || lower.includes('usd')) return 'USD';
    if (lower.includes('£') || lower.includes('pound') || lower.includes('gbp')) return 'GBP';

    return 'EUR'; // Default
  }

  /**
   * Region/Land erkennen für Steuer
   */
  _detectRegion(content) {
    const lower = content.toLowerCase();

    if (lower.includes('bosn') || lower.includes('sarajevo') || lower.includes('bih') || lower.includes('bosnia')) return 'ba';
    if (lower.includes('serb') || lower.includes('beograd') || lower.includes('srbija')) return 'rs';
    if (lower.includes('kroat') || lower.includes('zagreb') || lower.includes('hrvatska') || lower.includes('croatia')) return 'hr';
    if (lower.includes('österreich') || lower.includes('austria') || lower.includes('wien')) return 'at';
    if (lower.includes('schweiz') || lower.includes('switzerland') || lower.includes('swiss')) return 'ch';

    return 'de'; // Default
  }

  /**
   * Prompt-Builder
   */
  buildPrompt(task) {
    const language = this._languageDetector.detect(task.content);
    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.INVOICE_CREATE);
    const currency = this._detectCurrency(task.content);
    const region = this._detectRegion(task.content);
    const taxInfo = TAX_RATES[region];
    const currencyInfo = CURRENCIES[currency];

    // Beträge aus Text extrahieren
    const amounts = TextAnalyzer.extractNumbers(task.content, [currencyInfo.symbol, currency]);

    const systemPrompt = `Du bist ein erfahrener Finanz- und Buchhaltungsexperte.

SPRACHE: ${language.language.toUpperCase()}
TASK-TYP: ${taskType.type}
WÄHRUNG: ${currencyInfo.name} (${currencyInfo.symbol})
REGION: ${region.toUpperCase()}
STEUERSATZ: ${taxInfo.name} ${taxInfo.standard}% (reduziert: ${taxInfo.reduced}%)
${amounts.length > 0 ? `ERKANNTE BETRÄGE: ${amounts.map(a => CurrencyFormatter.format(a, currency)).join(', ')}` : ''}

AUFGABEN JE NACH TASK-TYP:

1. INVOICE_CREATE:
   - Rechnungsnummer: ${IdGenerator.generateInvoiceNumber()}
   - Alle Pflichtangaben für ${region.toUpperCase()}
   - ${taxInfo.name} korrekt ausweisen
   - Zahlungsziel angeben
   - Formatierung in ${currencyInfo.symbol}

2. TAX_CALCULATE:
   - ${taxInfo.name} Berechnung für ${region.toUpperCase()}
   - Netto/Brutto klar trennen
   - Steuersätze: ${taxInfo.standard}% Standard, ${taxInfo.reduced}% Ermäßigt
   - Bei gemischten Sätzen: Aufschlüsselung

3. EXPENSE_TRACK:
   - Kategorisierung nach Kontenrahmen
   - Steuerlich relevante Hinweise
   - Belegpflichten beachten

4. BUDGET_PLAN:
   - Strukturierte Budgetaufstellung
   - Einnahmen vs. Ausgaben
   - Reserven einplanen
   - Währung: ${currency}

5. REPORT_FINANCIAL:
   - Übersichtliche Struktur
   - Key Performance Indicators
   - Vergleichszeiträume
   - Handlungsempfehlungen

6. PAYMENT_REMINDER:
   - Höflich aber bestimmt
   - Rechtlich korrekte Formulierung
   - Frist setzen
   - Verzugszinsen erwähnen wenn angemessen

REGIONALE BESONDERHEITEN:

${region === 'ba' ? `
Für Bosnien-Herzegowina:
- PDV (Porez na dodatu vrijednost): 17%
- Währung: KM (Konvertibilna Marka)
- Fiskalrechnungen beachten
- Fiskalni račun Hinweis
` : ''}

${region === 'rs' ? `
Für Serbien:
- PDV: 20% Standard, 10% Ermäßigt
- Währung: RSD (Dinar)
- Fiskalrechnungen (fiskalni račun)
- E-Faktura System beachten
` : ''}

${region === 'de' ? `
Für Deutschland:
- MwSt: 19% Standard, 7% Ermäßigt
- GoBD-konforme Rechnungen
- Kleinunternehmerregelung prüfen
- Reverse-Charge bei EU-Geschäften
` : ''}

QUALITÄTSREGELN:
1. Rechtlich korrekte Formulierungen
2. Alle Pflichtangaben enthalten
3. Beträge korrekt formatiert
4. ⚠️ Keine Steuerberatung - Hinweis auf Steuerberater`;

    return { system: systemPrompt, user: task.content };
  }

  /**
   * Execute mit erweiterten Metadaten
   */
  async execute(task) {
    const language = this._languageDetector.detect(task.content);
    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.INVOICE_CREATE);
    const currency = this._detectCurrency(task.content);
    const region = this._detectRegion(task.content);
    const taxInfo = TAX_RATES[region];
    const amounts = TextAnalyzer.extractNumbers(task.content, [CURRENCIES[currency].symbol, currency]);

    const result = await super.execute(task);

    // Steuerberechnung wenn Beträge vorhanden
    let taxCalculations = null;
    if (amounts.length > 0) {
      taxCalculations = amounts.map(amount => ({
        net: amount,
        ...CurrencyFormatter.calculateTax(amount, taxInfo.standard),
        currency
      }));
    }

    result.metadata = {
      language: language.language,
      taskType: taskType.type,
      financial: {
        currency,
        currencyInfo: CURRENCIES[currency],
        region,
        taxInfo,
        amountsDetected: amounts,
        taxCalculations
      },
      generated: {
        invoiceNumber: taskType.type === TASK_TYPES.INVOICE_CREATE ? IdGenerator.generateInvoiceNumber() : null
      }
    };

    return result;
  }
}

FinanceAgent.TASK_TYPES = TASK_TYPES;
FinanceAgent.TAX_RATES = TAX_RATES;
FinanceAgent.CURRENCIES = CURRENCIES;

module.exports = FinanceAgent;
