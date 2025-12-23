/**
 * DataAgent - Datenanalyse und SQL-Generierung
 * =============================================
 *
 * Features:
 * - SQL-Generierung für verschiedene Datenbanken
 * - Datenanalyse und Statistik
 * - Chart/Visualisierung-Empfehlungen
 * - Export-Formatierung (CSV, JSON, Excel)
 */

const BaseAgent = require('./BaseAgent');
const { LanguageDetector, TaskTypeDetector, TextAnalyzer, SimpleCache } = require('./AgentUtils');

const TASK_TYPES = Object.freeze({
  SQL_GENERATE: 'sql_generate',
  DATA_ANALYZE: 'data_analyze',
  REPORT_CREATE: 'report_create',
  CHART_RECOMMEND: 'chart_recommend',
  DATA_CLEAN: 'data_clean',
  STATISTICS: 'statistics',
  EXPORT_FORMAT: 'export_format'
});

const DATABASE_TYPES = Object.freeze({
  mysql: { name: 'MySQL', syntax: 'mysql' },
  postgresql: { name: 'PostgreSQL', syntax: 'postgresql' },
  sqlite: { name: 'SQLite', syntax: 'sqlite' },
  mssql: { name: 'SQL Server', syntax: 'tsql' },
  oracle: { name: 'Oracle', syntax: 'plsql' }
});

const CHART_TYPES = Object.freeze({
  bar: { name: 'Balkendiagramm', useCase: 'Vergleiche zwischen Kategorien' },
  line: { name: 'Liniendiagramm', useCase: 'Trends über Zeit' },
  pie: { name: 'Kreisdiagramm', useCase: 'Anteile am Ganzen' },
  scatter: { name: 'Streudiagramm', useCase: 'Korrelationen' },
  heatmap: { name: 'Heatmap', useCase: 'Dichte/Intensität' },
  table: { name: 'Tabelle', useCase: 'Detaillierte Daten' }
});

class DataAgent extends BaseAgent {
  constructor() {
    super({
      id: 'data',
      name: 'Data Agent',
      type: 'data',
      version: '2.1.0',
      description: 'Analysiert Daten, generiert SQL und erstellt Berichte.',
      primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      fallback: { provider: 'openai', model: 'gpt-4o' },
      capabilities: Object.values(TASK_TYPES),
      keywords: [
        'sql', 'daten', 'data', 'analyse', 'analysis', 'statistik', 'statistics',
        'tabelle', 'table', 'abfrage', 'query', 'report', 'bericht', 'chart',
        'diagramm', 'export', 'csv', 'excel', 'database', 'datenbank'
      ],
      costs: { input: 3, output: 15 },
      feedback: { enabled: true, minSamples: 5 }
    });

    this._languageDetector = new LanguageDetector();
    this._taskTypeDetector = new TaskTypeDetector({
      [TASK_TYPES.SQL_GENERATE]: ['sql', 'query', 'abfrage', 'select', 'insert', 'update', 'delete'],
      [TASK_TYPES.DATA_ANALYZE]: ['analysiere', 'analyze', 'auswerten', 'untersuchen'],
      [TASK_TYPES.REPORT_CREATE]: ['report', 'bericht', 'zusammenfassung', 'overview'],
      [TASK_TYPES.CHART_RECOMMEND]: ['chart', 'diagramm', 'visualisierung', 'graph'],
      [TASK_TYPES.DATA_CLEAN]: ['bereinigen', 'clean', 'säubern', 'formatieren'],
      [TASK_TYPES.STATISTICS]: ['statistik', 'statistics', 'mittelwert', 'average', 'median'],
      [TASK_TYPES.EXPORT_FORMAT]: ['export', 'csv', 'json', 'excel', 'formatieren']
    });

    this._cache = new SimpleCache(100, 300000);
  }

  /**
   * Datenbanktyp erkennen
   */
  _detectDatabaseType(content) {
    const lower = content.toLowerCase();

    if (lower.includes('mysql') || lower.includes('mariadb')) return 'mysql';
    if (lower.includes('postgres') || lower.includes('postgresql')) return 'postgresql';
    if (lower.includes('sqlite')) return 'sqlite';
    if (lower.includes('sql server') || lower.includes('mssql') || lower.includes('microsoft sql')) return 'mssql';
    if (lower.includes('oracle')) return 'oracle';

    return 'mysql'; // Default
  }

  /**
   * Chart-Typ empfehlen basierend auf Daten
   */
  _recommendChartType(content) {
    const lower = content.toLowerCase();

    if (lower.includes('trend') || lower.includes('zeit') || lower.includes('time') || lower.includes('verlauf')) {
      return 'line';
    }
    if (lower.includes('vergleich') || lower.includes('compare') || lower.includes('kategorien')) {
      return 'bar';
    }
    if (lower.includes('anteil') || lower.includes('prozent') || lower.includes('percent') || lower.includes('verteilung')) {
      return 'pie';
    }
    if (lower.includes('korrelation') || lower.includes('beziehung') || lower.includes('relation')) {
      return 'scatter';
    }
    if (lower.includes('dichte') || lower.includes('heat') || lower.includes('intensität')) {
      return 'heatmap';
    }

    return 'table';
  }

  /**
   * Prompt-Builder
   */
  buildPrompt(task) {
    const language = this._languageDetector.detect(task.content);
    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.SQL_GENERATE);
    const dbType = this._detectDatabaseType(task.content);
    const chartType = this._recommendChartType(task.content);
    const dbConfig = DATABASE_TYPES[dbType];

    // Tabellennamen extrahieren
    const tables = TextAnalyzer.extractTableNames(task.content);

    const systemPrompt = `Du bist ein erfahrener Datenanalyst und SQL-Experte.

SPRACHE: ${language.language.toUpperCase()}
TASK-TYP: ${taskType.type}
DATENBANK: ${dbConfig.name} (${dbConfig.syntax})
${tables.length > 0 ? `ERKANNTE TABELLEN: ${tables.join(', ')}` : ''}

AUFGABEN JE NACH TASK-TYP:

1. SQL_GENERATE:
   - Syntax für ${dbConfig.name} verwenden
   - SQL-Injection-sichere Queries
   - Kommentare für komplexe Queries
   - Performance-Hinweise bei großen Datenmengen

2. DATA_ANALYZE:
   - Strukturierte Analyse
   - Key Findings hervorheben
   - Statistische Kennzahlen
   - Muster und Anomalien identifizieren

3. REPORT_CREATE:
   - Executive Summary
   - Detaillierte Ergebnisse
   - Handlungsempfehlungen
   - Visualisierungsvorschläge

4. CHART_RECOMMEND:
   - Empfohlener Chart-Typ: ${CHART_TYPES[chartType].name}
   - Begründung: ${CHART_TYPES[chartType].useCase}
   - Achsen-Labels und Titel
   - Farb-Schema Vorschläge

5. STATISTICS:
   - Mittelwert, Median, Modus
   - Standardabweichung
   - Konfidenzintervalle
   - Signifikanztests wenn relevant

6. EXPORT_FORMAT:
   - Passendes Format empfehlen
   - Formatierungs-Beispiel zeigen
   - Encoding-Hinweise (UTF-8)

QUALITÄTSREGELN:
1. Präzise, ausführbare Queries
2. Keine sensiblen Daten in Beispielen
3. Performance-optimiert
4. Gut dokumentiert`;

    return { system: systemPrompt, user: task.content };
  }

  /**
   * Execute mit erweiterten Metadaten
   */
  async execute(task) {
    const language = this._languageDetector.detect(task.content);
    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.SQL_GENERATE);
    const dbType = this._detectDatabaseType(task.content);
    const chartType = this._recommendChartType(task.content);
    const tables = TextAnalyzer.extractTableNames(task.content);

    const result = await super.execute(task);

    result.metadata = {
      language: language.language,
      taskType: taskType.type,
      database: {
        type: dbType,
        name: DATABASE_TYPES[dbType].name
      },
      visualization: {
        recommendedChart: chartType,
        chartInfo: CHART_TYPES[chartType]
      },
      analysis: {
        tablesDetected: tables,
        numbersExtracted: TextAnalyzer.extractNumbers(task.content)
      }
    };

    return result;
  }
}

DataAgent.TASK_TYPES = TASK_TYPES;
DataAgent.DATABASE_TYPES = DATABASE_TYPES;
DataAgent.CHART_TYPES = CHART_TYPES;

module.exports = DataAgent;
