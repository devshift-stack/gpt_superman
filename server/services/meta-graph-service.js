/**
 * Meta Graph API Service für MUCI-SUPERMAN
 * ==========================================
 *
 * Integration mit Facebook und Instagram über die Meta Graph API.
 *
 * Features:
 * - Instagram Content Publishing (Bilder, Carousels, Reels, Stories)
 * - Facebook Page Posts
 * - Kommentare verwalten
 * - Insights & Analytics
 * - Messaging (DMs)
 * - Webhook-Verarbeitung
 * - Rate-Limiting & Caching
 *
 * @module meta-graph-service
 * @version 2.0.0
 */

'use strict';

const axios = require('axios');
const { logError, logInfo } = require('./error-logger');
const { RetryHandler, CircuitBreaker, SimpleCache, InputValidator } = require('./utils/service-helpers');

const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Rate Limits (Requests pro Stunde)
const RATE_LIMITS = {
  app: 200,
  user: 200,
  page: 4800,
  instagram: 200
};

class MetaGraphService {
  constructor(config = {}) {
    // Credentials
    this.accessToken = config.accessToken || process.env.META_ACCESS_TOKEN;
    this.appId = config.appId || process.env.META_APP_ID;
    this.appSecret = config.appSecret || process.env.META_APP_SECRET;

    // Cached IDs
    this.pageId = config.pageId || null;
    this.instagramAccountId = config.instagramAccountId || null;
    this.pageAccessToken = null;

    // Sprache
    this.language = config.language || 'de';

    // Circuit Breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      name: 'meta-graph'
    });

    // Cache
    this.cache = new SimpleCache({ ttl: 300000 }); // 5 Minuten

    // Rate Limiting Tracker
    this.rateLimitTracker = new Map();

    // Axios Instance
    this.httpClient = axios.create({
      baseURL: GRAPH_API_BASE,
      timeout: 60000
    });

    // Lokalisierte Nachrichten
    this.messages = {
      de: {
        post_success: 'Beitrag erfolgreich veröffentlicht',
        post_failed: 'Veröffentlichung fehlgeschlagen',
        post_scheduled: 'Beitrag geplant',
        comment_success: 'Kommentar erfolgreich gepostet',
        comment_deleted: 'Kommentar gelöscht',
        token_missing: 'Access Token fehlt',
        token_invalid: 'Access Token ungültig oder abgelaufen',
        page_not_found: 'Facebook Page nicht gefunden',
        instagram_not_found: 'Instagram Account nicht gefunden',
        rate_limited: 'Rate-Limit erreicht',
        media_processing: 'Medien werden verarbeitet...',
        media_ready: 'Medien bereit zur Veröffentlichung',
        invalid_url: 'Ungültige Medien-URL'
      },
      bs: {
        post_success: 'Objava uspješno objavljena',
        post_failed: 'Objava nije uspjela',
        post_scheduled: 'Objava zakazana',
        comment_success: 'Komentar uspješno objavljen',
        comment_deleted: 'Komentar obrisan',
        token_missing: 'Nedostaje Access Token',
        token_invalid: 'Access Token nevažeći ili istekao',
        page_not_found: 'Facebook stranica nije pronađena',
        instagram_not_found: 'Instagram nalog nije pronađen',
        rate_limited: 'Dostignut limit zahtjeva',
        media_processing: 'Mediji se obrađuju...',
        media_ready: 'Mediji spremni za objavljivanje',
        invalid_url: 'Nevažeći URL medija'
      },
      sr: {
        post_success: 'Објава успешно објављена',
        post_failed: 'Објава није успела',
        post_scheduled: 'Објава заказана',
        comment_success: 'Коментар успешно објављен',
        comment_deleted: 'Коментар обрисан',
        token_missing: 'Недостаје Access Token',
        token_invalid: 'Access Token неважећи или истекао',
        page_not_found: 'Facebook страница није пронађена',
        instagram_not_found: 'Instagram налог није пронађен',
        rate_limited: 'Достигнут лимит захтева',
        media_processing: 'Медији се обрађују...',
        media_ready: 'Медији спремни за објављивање',
        invalid_url: 'Неважећи URL медија'
      },
      en: {
        post_success: 'Post published successfully',
        post_failed: 'Publishing failed',
        post_scheduled: 'Post scheduled',
        comment_success: 'Comment posted successfully',
        comment_deleted: 'Comment deleted',
        token_missing: 'Access Token missing',
        token_invalid: 'Access Token invalid or expired',
        page_not_found: 'Facebook Page not found',
        instagram_not_found: 'Instagram Account not found',
        rate_limited: 'Rate limit reached',
        media_processing: 'Media is being processed...',
        media_ready: 'Media ready for publishing',
        invalid_url: 'Invalid media URL'
      }
    };
  }

  updateConfig(config) {
    if (config.accessToken) this.accessToken = config.accessToken;
    if (config.appId) this.appId = config.appId;
    if (config.appSecret) this.appSecret = config.appSecret;
    if (config.pageId) this.pageId = config.pageId;
    if (config.instagramAccountId) this.instagramAccountId = config.instagramAccountId;
    if (config.language) this.language = config.language;
    this.cache.clear();
    this.pageAccessToken = null;
  }

  getMessage(key) {
    return this.messages[this.language]?.[key] || this.messages.en?.[key] || key;
  }

  // ============================================
  // API REQUEST HANDLING
  // ============================================

  async request(method, endpoint, data = null, params = {}) {
    if (!this.accessToken) {
      throw new Error(this.getMessage('token_missing'));
    }

    if (!this.circuitBreaker.canRequest()) {
      throw new Error('Meta API: ' + this.getMessage('rate_limited'));
    }

    const requestFn = async () => {
      try {
        const url = endpoint.startsWith('http') ? endpoint : endpoint;
        const response = await this.httpClient({
          method,
          url,
          params: {
            access_token: params.usePageToken && this.pageAccessToken
              ? this.pageAccessToken
              : this.accessToken,
            ...params
          },
          data,
        });

        this.circuitBreaker.recordSuccess();
        this._trackRateLimit(response.headers);
        return response.data;
      } catch (error) {
        this.circuitBreaker.recordFailure();
        throw this._handleError(error, endpoint, method);
      }
    };

    return RetryHandler.execute(requestFn, {
      maxRetries: 3,
      retryCondition: (error) => {
        const code = error.response?.data?.error?.code;
        // Retry bei temporären Fehlern
        return code === 1 || code === 2 || code === 4 || code === 17;
      }
    });
  }

  _handleError(error, endpoint, method) {
    const errorData = error.response?.data?.error || {};

    logError(error, {
      source: 'meta_graph',
      provider: 'meta',
      details: {
        endpoint,
        method,
        errorCode: errorData.code,
        errorSubcode: errorData.error_subcode,
        errorType: errorData.type,
        errorMessage: errorData.message
      }
    });

    // Spezifische Fehlerbehandlung
    if (errorData.code === 190) {
      return new Error(this.getMessage('token_invalid'));
    }
    if (errorData.code === 4 || errorData.code === 17) {
      return new Error(this.getMessage('rate_limited'));
    }
    if (errorData.code === 100 && errorData.error_subcode === 33) {
      return new Error(this.getMessage('page_not_found'));
    }

    return new Error(errorData.message || error.message);
  }

  _trackRateLimit(headers) {
    const usage = headers['x-app-usage'] || headers['x-business-use-case-usage'];
    if (usage) {
      try {
        const parsed = JSON.parse(usage);
        this.rateLimitTracker.set('last_usage', {
          data: parsed,
          timestamp: Date.now()
        });
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }

  // ============================================
  // ACCOUNT MANAGEMENT
  // ============================================

  async validateToken() {
    const cacheKey = 'token_validation';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.request('GET', '/me', null, {
      fields: 'id,name,accounts{name,id,access_token,instagram_business_account}'
    });

    const validation = {
      valid: true,
      userId: result.id,
      userName: result.name,
      pages: (result.accounts?.data || []).map(p => ({
        id: p.id,
        name: p.name,
        hasInstagram: !!p.instagram_business_account
      })),
      pageCount: result.accounts?.data?.length || 0
    };

    this.cache.set(cacheKey, validation, 60000); // 1 Minute Cache
    return validation;
  }

  async getPages() {
    const result = await this.request('GET', '/me/accounts', null, {
      fields: 'id,name,access_token,category,fan_count,instagram_business_account{id,username,followers_count}'
    });

    const pages = result.data.map(page => ({
      id: page.id,
      name: page.name,
      category: page.category,
      fanCount: page.fan_count,
      accessToken: page.access_token,
      instagram: page.instagram_business_account ? {
        id: page.instagram_business_account.id,
        username: page.instagram_business_account.username,
        followersCount: page.instagram_business_account.followers_count
      } : null
    }));

    // Erste Page als Default setzen wenn noch nicht gesetzt
    if (!this.pageId && pages.length > 0) {
      this.pageId = pages[0].id;
      this.pageAccessToken = pages[0].accessToken;
      if (pages[0].instagram) {
        this.instagramAccountId = pages[0].instagram.id;
      }
    }

    return pages;
  }

  async setActivePage(pageId) {
    const pages = await this.getPages();
    const page = pages.find(p => p.id === pageId);

    if (!page) {
      throw new Error(this.getMessage('page_not_found'));
    }

    this.pageId = page.id;
    this.pageAccessToken = page.accessToken;
    if (page.instagram) {
      this.instagramAccountId = page.instagram.id;
    }

    return {
      success: true,
      pageId: this.pageId,
      pageName: page.name,
      instagramAccountId: this.instagramAccountId
    };
  }

  async getInstagramAccount(pageId = null) {
    const targetPageId = pageId || this.pageId;
    if (!targetPageId) {
      throw new Error(this.getMessage('page_not_found'));
    }

    const cacheKey = `instagram_${targetPageId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.request('GET', `/${targetPageId}`, null, {
      fields: 'instagram_business_account{id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website}'
    });

    if (!result.instagram_business_account) {
      throw new Error(this.getMessage('instagram_not_found'));
    }

    this.instagramAccountId = result.instagram_business_account.id;
    this.cache.set(cacheKey, result.instagram_business_account);
    return result.instagram_business_account;
  }

  // ============================================
  // FACEBOOK POSTING
  // ============================================

  async createFacebookPost(content, options = {}) {
    const targetPageId = options.pageId || this.pageId;
    if (!targetPageId) {
      throw new Error(this.getMessage('page_not_found'));
    }

    const postData = { message: content };

    if (options.link) {
      const urlValidation = InputValidator.url(options.link, true);
      if (!urlValidation.valid) {
        throw new Error(this.getMessage('invalid_url'));
      }
      postData.link = options.link;
    }

    // Geplanter Post
    if (options.scheduledTime) {
      const scheduledTimestamp = Math.floor(new Date(options.scheduledTime).getTime() / 1000);
      const minScheduleTime = Math.floor(Date.now() / 1000) + 600; // Min 10 Minuten

      if (scheduledTimestamp < minScheduleTime) {
        throw new Error('Geplante Zeit muss mindestens 10 Minuten in der Zukunft liegen');
      }

      postData.published = false;
      postData.scheduled_publish_time = scheduledTimestamp;
    }

    const result = await this.request('POST', `/${targetPageId}/feed`, postData, {
      usePageToken: true
    });

    logInfo(`Facebook Post created: ${result.id}`, { source: 'meta_graph' });

    return {
      success: true,
      message: options.scheduledTime ? this.getMessage('post_scheduled') : this.getMessage('post_success'),
      postId: result.id,
      scheduled: !!options.scheduledTime
    };
  }

  async createFacebookPhotoPost(content, imageUrl, options = {}) {
    const targetPageId = options.pageId || this.pageId;
    if (!targetPageId) {
      throw new Error(this.getMessage('page_not_found'));
    }

    const result = await this.request('POST', `/${targetPageId}/photos`, {
      caption: content,
      url: imageUrl
    }, { usePageToken: true });

    return {
      success: true,
      message: this.getMessage('post_success'),
      postId: result.post_id,
      photoId: result.id
    };
  }

  // ============================================
  // INSTAGRAM POSTING
  // ============================================

  async createInstagramMediaContainer(imageUrl, caption, options = {}) {
    const targetAccountId = options.instagramAccountId || this.instagramAccountId;
    if (!targetAccountId) {
      throw new Error(this.getMessage('instagram_not_found'));
    }

    // URL validieren
    const urlValidation = InputValidator.url(imageUrl, true);
    if (!urlValidation.valid) {
      throw new Error(this.getMessage('invalid_url'));
    }

    const containerData = {
      image_url: imageUrl,
      caption: this._buildCaption(caption, options.hashtags)
    };

    // Location hinzufügen
    if (options.locationId) {
      containerData.location_id = options.locationId;
    }

    // User Tags
    if (options.userTags && Array.isArray(options.userTags)) {
      containerData.user_tags = JSON.stringify(options.userTags);
    }

    const result = await this.request('POST', `/${targetAccountId}/media`, containerData);

    return {
      containerId: result.id,
      status: 'PENDING'
    };
  }

  async createInstagramCarouselContainer(mediaItems, caption, options = {}) {
    const targetAccountId = options.instagramAccountId || this.instagramAccountId;
    if (!targetAccountId) {
      throw new Error(this.getMessage('instagram_not_found'));
    }

    if (!Array.isArray(mediaItems) || mediaItems.length < 2 || mediaItems.length > 10) {
      throw new Error('Carousel benötigt 2-10 Medien-Items');
    }

    // Erst alle Child-Container erstellen
    const childContainerIds = [];
    for (const item of mediaItems) {
      const childData = {
        is_carousel_item: true
      };

      if (item.type === 'VIDEO') {
        childData.media_type = 'VIDEO';
        childData.video_url = item.url;
      } else {
        childData.image_url = item.url;
      }

      const childResult = await this.request('POST', `/${targetAccountId}/media`, childData);
      childContainerIds.push(childResult.id);
    }

    // Carousel Container erstellen
    const carouselData = {
      media_type: 'CAROUSEL',
      caption: this._buildCaption(caption, options.hashtags),
      children: childContainerIds.join(',')
    };

    const result = await this.request('POST', `/${targetAccountId}/media`, carouselData);

    return {
      containerId: result.id,
      childContainerIds,
      status: 'PENDING'
    };
  }

  async getContainerStatus(containerId) {
    const result = await this.request('GET', `/${containerId}`, null, {
      fields: 'status_code,status'
    });

    return {
      containerId,
      statusCode: result.status_code,
      status: result.status || 'UNKNOWN'
    };
  }

  async waitForContainerReady(containerId, maxWaitMs = 60000) {
    const startTime = Date.now();
    const pollInterval = 3000;

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getContainerStatus(containerId);

      if (status.statusCode === 'FINISHED') {
        return { ready: true, status };
      }

      if (status.statusCode === 'ERROR') {
        throw new Error(`Container-Fehler: ${status.status}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return { ready: false, timeout: true };
  }

  async publishInstagramContainer(containerId, options = {}) {
    const targetAccountId = options.instagramAccountId || this.instagramAccountId;
    if (!targetAccountId) {
      throw new Error(this.getMessage('instagram_not_found'));
    }

    // Optional: Warten bis Container bereit ist
    if (options.waitForReady !== false) {
      const readyStatus = await this.waitForContainerReady(containerId);
      if (!readyStatus.ready) {
        throw new Error(this.getMessage('media_processing'));
      }
    }

    const result = await this.request('POST', `/${targetAccountId}/media_publish`, {
      creation_id: containerId
    });

    logInfo(`Instagram Post published: ${result.id}`, { source: 'meta_graph' });

    return {
      success: true,
      message: this.getMessage('post_success'),
      mediaId: result.id
    };
  }

  async postToInstagram(imageUrl, caption, options = {}) {
    // Convenience-Methode: Container erstellen + veröffentlichen
    const container = await this.createInstagramMediaContainer(imageUrl, caption, options);
    return await this.publishInstagramContainer(container.containerId, options);
  }

  async postInstagramStory(mediaUrl, options = {}) {
    const targetAccountId = options.instagramAccountId || this.instagramAccountId;
    if (!targetAccountId) {
      throw new Error(this.getMessage('instagram_not_found'));
    }

    const containerData = {
      media_type: options.isVideo ? 'STORIES' : 'STORIES'
    };

    if (options.isVideo) {
      containerData.video_url = mediaUrl;
    } else {
      containerData.image_url = mediaUrl;
    }

    const container = await this.request('POST', `/${targetAccountId}/media`, containerData);
    return await this.publishInstagramContainer(container.id, options);
  }

  _buildCaption(caption, hashtags) {
    let fullCaption = caption || '';

    if (hashtags && Array.isArray(hashtags) && hashtags.length > 0) {
      const hashtagString = hashtags
        .map(h => h.startsWith('#') ? h : `#${h}`)
        .join(' ');
      fullCaption += '\n\n' + hashtagString;
    }

    // Instagram Limit: 2200 Zeichen
    return fullCaption.substring(0, 2200);
  }

  // ============================================
  // COMMENTS
  // ============================================

  async createComment(mediaId, message) {
    const result = await this.request('POST', `/${mediaId}/comments`, { message });

    return {
      success: true,
      message: this.getMessage('comment_success'),
      commentId: result.id
    };
  }

  async replyToComment(commentId, message) {
    const result = await this.request('POST', `/${commentId}/replies`, { message });

    return {
      success: true,
      message: this.getMessage('comment_success'),
      replyId: result.id
    };
  }

  async deleteComment(commentId) {
    await this.request('DELETE', `/${commentId}`);

    return {
      success: true,
      message: this.getMessage('comment_deleted'),
      commentId
    };
  }

  async getComments(mediaId, options = {}) {
    const result = await this.request('GET', `/${mediaId}/comments`, null, {
      fields: 'id,text,username,timestamp,like_count,replies{id,text,username,timestamp}',
      limit: Math.min(options.limit || 50, 100)
    });

    return {
      comments: result.data || [],
      paging: result.paging
    };
  }

  // ============================================
  // INSIGHTS & ANALYTICS
  // ============================================

  async getInstagramInsights(options = {}) {
    const targetAccountId = options.instagramAccountId || this.instagramAccountId;
    if (!targetAccountId) {
      throw new Error(this.getMessage('instagram_not_found'));
    }

    const metrics = options.metrics || [
      'impressions',
      'reach',
      'profile_views',
      'follower_count'
    ];

    const period = options.period || 'day';

    const result = await this.request('GET', `/${targetAccountId}/insights`, null, {
      metric: metrics.join(','),
      period
    });

    const insights = {};
    (result.data || []).forEach(item => {
      insights[item.name] = {
        title: item.title,
        description: item.description,
        values: item.values
      };
    });

    return insights;
  }

  async getMediaInsights(mediaId) {
    const result = await this.request('GET', `/${mediaId}/insights`, null, {
      metric: 'impressions,reach,engagement,saved,likes,comments,shares,plays,video_views'
    });

    const insights = {};
    (result.data || []).forEach(item => {
      insights[item.name] = item.values[0]?.value || 0;
    });

    return insights;
  }

  async getRecentMediaWithInsights(options = {}) {
    const targetAccountId = options.instagramAccountId || this.instagramAccountId;
    if (!targetAccountId) {
      throw new Error(this.getMessage('instagram_not_found'));
    }

    const result = await this.request('GET', `/${targetAccountId}/media`, null, {
      fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink,children{media_url,media_type}',
      limit: Math.min(options.limit || 25, 100)
    });

    return {
      media: result.data || [],
      paging: result.paging
    };
  }

  // ============================================
  // STATUS & HEALTH
  // ============================================

  getStatus() {
    return {
      configured: !!this.accessToken,
      pageId: this.pageId,
      instagramAccountId: this.instagramAccountId,
      language: this.language,
      circuitBreaker: this.circuitBreaker.getState(),
      cacheSize: this.cache.size(),
      rateLimitUsage: this.rateLimitTracker.get('last_usage')
    };
  }

  async healthCheck() {
    const status = this.getStatus();

    if (!status.configured) {
      return { healthy: false, reason: 'not_configured', status };
    }

    try {
      const validation = await this.validateToken();
      return {
        healthy: validation.valid,
        reason: validation.valid ? null : 'token_invalid',
        status,
        validation
      };
    } catch (error) {
      return {
        healthy: false,
        reason: 'connection_error',
        error: error.message,
        status
      };
    }
  }
}

// Express Router
function createMetaGraphRouter(metaService) {
  const express = require('express');
  const router = express.Router();

  router.get('/validate', async (req, res) => {
    try {
      const result = await metaService.validateToken();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/health', async (req, res) => {
    try {
      const health = await metaService.healthCheck();
      res.status(health.healthy ? 200 : 503).json(health);
    } catch (error) {
      res.status(500).json({ healthy: false, error: error.message });
    }
  });

  router.get('/pages', async (req, res) => {
    try {
      const pages = await metaService.getPages();
      res.json({ pages, count: pages.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/pages/:pageId/activate', async (req, res) => {
    try {
      const result = await metaService.setActivePage(req.params.pageId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/instagram', async (req, res) => {
    try {
      const account = await metaService.getInstagramAccount();
      res.json(account);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/facebook/post', async (req, res) => {
    try {
      const { content, link, scheduledTime, pageId } = req.body;
      if (!content) return res.status(400).json({ error: 'Content fehlt' });
      const result = await metaService.createFacebookPost(content, { link, scheduledTime, pageId });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/instagram/post', async (req, res) => {
    try {
      const { imageUrl, caption, hashtags } = req.body;
      if (!imageUrl) return res.status(400).json({ error: 'imageUrl fehlt' });
      const result = await metaService.postToInstagram(imageUrl, caption, { hashtags });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/instagram/carousel', async (req, res) => {
    try {
      const { mediaItems, caption, hashtags } = req.body;
      if (!mediaItems) return res.status(400).json({ error: 'mediaItems fehlt' });
      const container = await metaService.createInstagramCarouselContainer(mediaItems, caption, { hashtags });
      const result = await metaService.publishInstagramContainer(container.containerId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/instagram/story', async (req, res) => {
    try {
      const { mediaUrl, isVideo } = req.body;
      if (!mediaUrl) return res.status(400).json({ error: 'mediaUrl fehlt' });
      const result = await metaService.postInstagramStory(mediaUrl, { isVideo });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/comment', async (req, res) => {
    try {
      const { mediaId, message } = req.body;
      if (!mediaId || !message) return res.status(400).json({ error: 'mediaId und message erforderlich' });
      const result = await metaService.createComment(mediaId, message);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/comments/:mediaId', async (req, res) => {
    try {
      const { limit } = req.query;
      const result = await metaService.getComments(req.params.mediaId, { limit: parseInt(limit) });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/instagram/insights', async (req, res) => {
    try {
      const { metrics, period } = req.query;
      const insights = await metaService.getInstagramInsights({
        metrics: metrics ? metrics.split(',') : undefined,
        period
      });
      res.json(insights);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/instagram/media', async (req, res) => {
    try {
      const { limit } = req.query;
      const result = await metaService.getRecentMediaWithInsights({ limit: parseInt(limit) || 25 });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/media/:mediaId/insights', async (req, res) => {
    try {
      const insights = await metaService.getMediaInsights(req.params.mediaId);
      res.json(insights);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/status', (req, res) => {
    res.json(metaService.getStatus());
  });

  return router;
}

const metaGraphService = new MetaGraphService();

module.exports = {
  MetaGraphService,
  metaGraphService,
  createMetaGraphRouter
};
