/**
 * InfluencerAgent v2.1 - Autonomer Social Media Agent
 *
 * Features:
 * - Profil-Analyse (Instagram & Facebook)
 * - Content-Style Learning
 * - KI-gestützte Content-Generierung
 * - Automatisches Posting
 * - Hashtag-Optimierung
 * - Analytics
 */

const BaseAgent = require('./BaseAgent');

class InfluencerAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: 'influencer',
      name: 'Influencer Agent',
      type: 'influencer',
      description: 'Social Media Content-Generierung, Profil-Analyse und Auto-Posting',
      capabilities: [
        'profile_analysis',
        'content_generation',
        'hashtag_optimization',
        'auto_posting',
        'scheduling',
        'style_learning'
      ],
      ...config
    });

    // Influencer-spezifische Konfiguration
    this.metaAccessToken = process.env.META_ACCESS_TOKEN || '';
    this.instagramAccountId = process.env.INSTAGRAM_ACCOUNT_ID || '';
    this.facebookPageId = process.env.FACEBOOK_PAGE_ID || '';

    // Cache für Profil-Analysen
    this.profileCache = new Map();

    // Themes für Content-Generierung
    this.themeKeywords = {
      fitness: ['workout', 'training', 'gym', 'fitness', 'sport', 'healthy'],
      food: ['food', 'essen', 'rezept', 'kochen', 'lecker', 'restaurant'],
      travel: ['travel', 'reise', 'urlaub', 'adventure', 'explore'],
      fashion: ['fashion', 'style', 'outfit', 'mode', 'look'],
      beauty: ['beauty', 'makeup', 'skincare', 'pflege'],
      lifestyle: ['lifestyle', 'life', 'leben', 'alltag', 'daily'],
      business: ['business', 'work', 'erfolg', 'karriere', 'entrepreneur'],
      motivation: ['motivation', 'inspire', 'mindset', 'erfolg', 'ziele'],
      tech: ['tech', 'digital', 'app', 'software', 'innovation']
    };

    // Hashtag-Sets für verschiedene Themen
    this.hashtagSets = {
      fitness: ['fitness', 'workout', 'fitnessmotivation', 'gym', 'healthy', 'fitfam', 'training'],
      food: ['foodie', 'foodporn', 'instafood', 'yummy', 'delicious', 'foodlover', 'homemade'],
      travel: ['travel', 'wanderlust', 'travelgram', 'adventure', 'explore', 'travelphotography'],
      fashion: ['fashion', 'style', 'ootd', 'fashionblogger', 'instafashion', 'outfitoftheday'],
      beauty: ['beauty', 'makeup', 'skincare', 'beautyblogger', 'glam', 'selfcare'],
      lifestyle: ['lifestyle', 'lifestyleblogger', 'dailylife', 'instagood', 'photooftheday'],
      business: ['business', 'entrepreneur', 'success', 'motivation', 'hustle', 'mindset'],
      motivation: ['motivation', 'inspiration', 'mindset', 'success', 'goals', 'positivevibes'],
      general: ['instagood', 'photooftheday', 'instagram', 'love', 'follow', 'instadaily']
    };
  }

  /**
   * Verarbeitet Influencer-Tasks
   */
  async processTask(task) {
    const { content, action, options = {} } = task;

    // Bestimme Aktion
    const detectedAction = action || this.detectAction(content);

    switch (detectedAction) {
      case 'analyze_profile':
        return await this.analyzeProfile(content, options);
      case 'generate_content':
        return await this.generateContent(content, options);
      case 'generate_caption':
        return await this.generateCaption(content, options);
      case 'generate_hashtags':
        return await this.generateHashtags(content, options);
      case 'post_content':
        return await this.postContent(content, options);
      case 'schedule_post':
        return await this.schedulePost(content, options);
      default:
        return await this.handleGenericRequest(content, options);
    }
  }

  /**
   * Erkennt die gewünschte Aktion aus dem Content
   */
  detectAction(content) {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('analysiere') || lowerContent.includes('analyze') || lowerContent.includes('profil')) {
      return 'analyze_profile';
    }
    if (lowerContent.includes('generiere') || lowerContent.includes('erstelle') || lowerContent.includes('content')) {
      return 'generate_content';
    }
    if (lowerContent.includes('caption') || lowerContent.includes('text')) {
      return 'generate_caption';
    }
    if (lowerContent.includes('hashtag')) {
      return 'generate_hashtags';
    }
    if (lowerContent.includes('poste') || lowerContent.includes('veröffentliche') || lowerContent.includes('publish')) {
      return 'post_content';
    }
    if (lowerContent.includes('plane') || lowerContent.includes('schedule')) {
      return 'schedule_post';
    }

    return 'generate_content';
  }

  /**
   * Analysiert ein Social Media Profil
   */
  async analyzeProfile(content, options = {}) {
    const username = this.extractUsername(content);
    const platform = options.platform || this.detectPlatform(content);

    // Check Cache
    const cacheKey = `${platform}:${username}`;
    if (this.profileCache.has(cacheKey)) {
      const cached = this.profileCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 3600000) { // 1 Stunde Cache
        return {
          ...cached.data,
          fromCache: true
        };
      }
    }

    const prompt = `Analysiere das ${platform} Profil "@${username}" und erstelle eine detaillierte Analyse.

Bitte analysiere folgende Aspekte (auch wenn du keinen direkten Zugriff hast, erstelle eine plausible Analyse basierend auf typischen Influencer-Mustern):

1. **Profil-Übersicht**
   - Geschätzte Follower-Anzahl
   - Geschätzte Engagement-Rate
   - Content-Frequenz

2. **Content-Stil**
   - Typische Caption-Länge
   - Emoji-Nutzung
   - Ton (formell/casual/humorvoll)

3. **Top-Themen**
   - Hauptthemen des Contents
   - Nischen-Fokus

4. **Hashtag-Strategie**
   - Typische Hashtag-Anzahl
   - Hashtag-Kategorien

5. **Beste Posting-Zeiten**
   - Empfohlene Uhrzeiten
   - Empfohlene Wochentage

6. **Empfehlungen**
   - Was macht das Profil erfolgreich?
   - Was kann man lernen?

Antworte strukturiert im JSON-Format.`;

    try {
      const response = await this.callAI(prompt);

      // Parse response
      let analysis;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { rawAnalysis: response };
      } catch {
        analysis = { rawAnalysis: response };
      }

      const result = {
        username,
        platform,
        analysis,
        analyzedAt: new Date().toISOString(),
        recommendations: this.generateRecommendations(analysis)
      };

      // Cache speichern
      this.profileCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      console.error('[InfluencerAgent] Profil-Analyse Fehler:', error);
      throw error;
    }
  }

  /**
   * Generiert Social Media Content
   */
  async generateContent(content, options = {}) {
    const themes = options.themes || this.detectThemes(content);
    const platform = options.platform || 'both';
    const count = options.count || 1;
    const language = options.language || 'de';

    const prompt = `Du bist ein erfolgreicher Social Media Influencer und Content Creator.

Erstelle ${count} ${platform === 'both' ? 'Instagram/Facebook' : platform} Post(s).

**Themen:** ${themes.join(', ')}
**Sprache:** ${language === 'de' ? 'Deutsch' : 'English'}
**Anfrage:** ${content}

Für jeden Post erstelle:
1. **Caption** (100-250 Zeichen, authentisch, mit Emojis, endet mit einer Frage)
2. **Hashtags** (15 relevante Hashtags)
3. **Bild-Beschreibung** (für DALL-E: professionelles, ästhetisches Foto)
4. **Beste Posting-Zeit** (Uhrzeit)

Antworte im JSON-Format:
{
  "posts": [
    {
      "caption": "...",
      "hashtags": ["tag1", "tag2", ...],
      "imagePrompt": "...",
      "bestTime": "..."
    }
  ]
}`;

    try {
      const response = await this.callAI(prompt);

      let posts;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        posts = parsed?.posts || [{ caption: response, hashtags: this.generateDefaultHashtags(themes) }];
      } catch {
        posts = [{
          caption: response,
          hashtags: this.generateDefaultHashtags(themes),
          imagePrompt: `Professional lifestyle photography about ${themes.join(', ')}, Instagram aesthetic`,
          bestTime: '19:00'
        }];
      }

      return {
        posts,
        themes,
        platform,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('[InfluencerAgent] Content-Generierung Fehler:', error);
      throw error;
    }
  }

  /**
   * Generiert nur eine Caption
   */
  async generateCaption(content, options = {}) {
    const themes = options.themes || this.detectThemes(content);
    const style = options.style || 'casual';
    const language = options.language || 'de';

    const prompt = `Erstelle eine ${style === 'casual' ? 'lockere, persönliche' : 'professionelle'} Instagram/Facebook Caption.

**Thema/Kontext:** ${content}
**Stil:** ${style}
**Sprache:** ${language === 'de' ? 'Deutsch' : 'English'}

Regeln:
- 100-250 Zeichen
- Authentisch und persönlich
- Passende Emojis (nicht übertrieben)
- Ende mit einer Frage für Engagement
- KEINE Hashtags (die kommen separat)

Schreibe NUR die Caption:`;

    try {
      const response = await this.callAI(prompt);

      return {
        caption: response.trim(),
        themes,
        style,
        suggestedHashtags: this.generateDefaultHashtags(themes)
      };

    } catch (error) {
      console.error('[InfluencerAgent] Caption-Generierung Fehler:', error);
      throw error;
    }
  }

  /**
   * Generiert optimierte Hashtags
   */
  async generateHashtags(content, options = {}) {
    const themes = options.themes || this.detectThemes(content);
    const count = options.count || 15;

    const prompt = `Generiere ${count} optimale Instagram/Facebook Hashtags.

**Thema:** ${content}
**Erkannte Themen:** ${themes.join(', ')}

Regeln:
- Mix aus populären (1M+ Posts) und Nischen-Hashtags
- Relevant zum Thema
- Deutsche UND englische Hashtags mischen
- Keine zu generischen (#love, #instagood nur wenn passend)

Antworte im JSON-Format:
{
  "hashtags": ["tag1", "tag2", ...],
  "categories": {
    "popular": [...],
    "niche": [...],
    "branded": [...]
  }
}`;

    try {
      const response = await this.callAI(prompt);

      let result;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        result = null;
      }

      if (!result) {
        // Fallback: Extrahiere Hashtags aus Text
        const tags = response.match(/#?(\w+)/g) || [];
        result = {
          hashtags: tags.map(t => t.replace('#', '')).slice(0, count)
        };
      }

      // Ergänze mit Theme-Hashtags falls nötig
      const allHashtags = new Set(result.hashtags || []);
      for (const theme of themes) {
        if (this.hashtagSets[theme]) {
          this.hashtagSets[theme].forEach(tag => allHashtags.add(tag));
        }
      }

      return {
        hashtags: Array.from(allHashtags).slice(0, count),
        themes,
        formatted: Array.from(allHashtags).slice(0, count).map(t => `#${t}`).join(' ')
      };

    } catch (error) {
      console.error('[InfluencerAgent] Hashtag-Generierung Fehler:', error);
      return {
        hashtags: this.generateDefaultHashtags(themes),
        themes,
        formatted: this.generateDefaultHashtags(themes).map(t => `#${t}`).join(' ')
      };
    }
  }

  /**
   * Postet Content auf Instagram/Facebook
   */
  async postContent(content, options = {}) {
    const platform = options.platform || 'both';
    const caption = options.caption || content;
    const hashtags = options.hashtags || [];
    const imageUrl = options.imageUrl;

    if (!this.metaAccessToken) {
      return {
        success: false,
        error: 'Meta Access Token nicht konfiguriert',
        help: 'Setze META_ACCESS_TOKEN in der .env Datei'
      };
    }

    const results = {
      instagram: null,
      facebook: null
    };

    const fullCaption = `${caption}\n\n${hashtags.map(t => `#${t}`).join(' ')}`;

    // Instagram posten
    if ((platform === 'instagram' || platform === 'both') && this.instagramAccountId) {
      try {
        results.instagram = await this.postToInstagram(fullCaption, imageUrl);
      } catch (error) {
        results.instagram = { success: false, error: error.message };
      }
    }

    // Facebook posten
    if ((platform === 'facebook' || platform === 'both') && this.facebookPageId) {
      try {
        results.facebook = await this.postToFacebook(fullCaption, imageUrl);
      } catch (error) {
        results.facebook = { success: false, error: error.message };
      }
    }

    return {
      success: Object.values(results).some(r => r?.success),
      results,
      caption: fullCaption,
      postedAt: new Date().toISOString()
    };
  }

  /**
   * Postet auf Instagram via Meta Graph API
   */
  async postToInstagram(caption, imageUrl) {
    if (!imageUrl) {
      return { success: false, error: 'Bild-URL erforderlich für Instagram' };
    }

    const axios = require('axios');

    // Step 1: Container erstellen
    const containerResponse = await axios.post(
      `https://graph.facebook.com/v18.0/${this.instagramAccountId}/media`,
      {
        image_url: imageUrl,
        caption: caption,
        access_token: this.metaAccessToken
      }
    );

    const containerId = containerResponse.data.id;

    // Step 2: Veröffentlichen
    const publishResponse = await axios.post(
      `https://graph.facebook.com/v18.0/${this.instagramAccountId}/media_publish`,
      {
        creation_id: containerId,
        access_token: this.metaAccessToken
      }
    );

    return {
      success: true,
      postId: publishResponse.data.id,
      platform: 'instagram'
    };
  }

  /**
   * Postet auf Facebook via Meta Graph API
   */
  async postToFacebook(caption, imageUrl) {
    const axios = require('axios');

    let url, data;

    if (imageUrl) {
      url = `https://graph.facebook.com/v18.0/${this.facebookPageId}/photos`;
      data = {
        url: imageUrl,
        message: caption,
        access_token: this.metaAccessToken
      };
    } else {
      url = `https://graph.facebook.com/v18.0/${this.facebookPageId}/feed`;
      data = {
        message: caption,
        access_token: this.metaAccessToken
      };
    }

    const response = await axios.post(url, data);

    return {
      success: true,
      postId: response.data.id || response.data.post_id,
      platform: 'facebook'
    };
  }

  /**
   * Plant einen Post für später
   */
  async schedulePost(content, options = {}) {
    const scheduledTime = options.scheduledTime || this.getNextOptimalTime();

    // Generiere Content
    const generated = await this.generateContent(content, options);

    return {
      scheduled: true,
      scheduledTime,
      content: generated,
      message: `Post geplant für ${scheduledTime}`,
      note: 'Scheduling erfordert einen Scheduler-Service (z.B. Cron)'
    };
  }

  /**
   * Generische Anfrage-Verarbeitung
   */
  async handleGenericRequest(content, options = {}) {
    const prompt = `Du bist ein Social Media Experte und Influencer-Coach.

Beantworte folgende Frage/Anfrage zum Thema Social Media, Content Creation oder Influencer Marketing:

${content}

Gib praktische, umsetzbare Tipps. Antworte auf ${options.language === 'en' ? 'Englisch' : 'Deutsch'}.`;

    const response = await this.callAI(prompt);

    return {
      response,
      type: 'advice',
      topics: this.detectThemes(content)
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  extractUsername(content) {
    // Extrahiere Username aus URL oder @mention
    const urlMatch = content.match(/(?:instagram\.com|facebook\.com)\/([^\/\s\?]+)/i);
    if (urlMatch) return urlMatch[1];

    const mentionMatch = content.match(/@(\w+)/);
    if (mentionMatch) return mentionMatch[1];

    // Fallback: Nimm erstes Wort das wie ein Username aussieht
    const words = content.split(/\s+/);
    for (const word of words) {
      if (/^[a-z0-9_\.]+$/i.test(word) && word.length > 2) {
        return word;
      }
    }

    return 'unknown';
  }

  detectPlatform(content) {
    const lower = content.toLowerCase();
    if (lower.includes('instagram') || lower.includes('insta') || lower.includes('ig')) {
      return 'instagram';
    }
    if (lower.includes('facebook') || lower.includes('fb')) {
      return 'facebook';
    }
    return 'instagram'; // Default
  }

  detectThemes(content) {
    const lower = content.toLowerCase();
    const detected = [];

    for (const [theme, keywords] of Object.entries(this.themeKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        detected.push(theme);
      }
    }

    return detected.length > 0 ? detected : ['lifestyle'];
  }

  generateDefaultHashtags(themes, count = 15) {
    const hashtags = new Set();

    // Theme-spezifische Hashtags
    for (const theme of themes) {
      if (this.hashtagSets[theme]) {
        this.hashtagSets[theme].forEach(tag => hashtags.add(tag));
      }
    }

    // Allgemeine Hashtags
    this.hashtagSets.general.forEach(tag => hashtags.add(tag));

    return Array.from(hashtags).slice(0, count);
  }

  generateRecommendations(analysis) {
    return [
      'Poste regelmäßig zu den identifizierten besten Zeiten',
      'Nutze eine Mischung aus populären und Nischen-Hashtags',
      'Interagiere mit deiner Community durch Fragen in Captions',
      'Halte einen konsistenten visuellen Stil',
      'Teste verschiedene Content-Formate (Reels, Stories, Posts)'
    ];
  }

  getNextOptimalTime() {
    const now = new Date();
    const optimalHours = [9, 12, 17, 19, 21];

    for (const hour of optimalHours) {
      const candidate = new Date(now);
      candidate.setHours(hour, 0, 0, 0);
      if (candidate > now) {
        return candidate.toISOString();
      }
    }

    // Nächster Tag
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(optimalHours[0], 0, 0, 0);
    return tomorrow.toISOString();
  }
}

module.exports = InfluencerAgent;
