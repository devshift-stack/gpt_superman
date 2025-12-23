/**
 * Voice Service für MUCI-SUPERMAN
 * =================================
 *
 * Kombiniert Speech-to-Text und Text-to-Speech mit mehreren Providern.
 *
 * STT Provider: OpenAI Whisper, Azure Speech Services
 * TTS Provider: OpenAI TTS, ElevenLabs, Azure Speech Services
 *
 * Features:
 * - Multi-Provider mit automatischem Fallback
 * - Streaming-Support für TTS
 * - Audio-Format-Konvertierung
 * - Caching für wiederholte TTS-Anfragen
 * - Rate-Limiting
 *
 * @module voice-service
 * @version 2.0.0
 */

'use strict';

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const crypto = require('crypto');
const { logError, logInfo } = require('./error-logger');
const { RetryHandler, CircuitBreaker, SimpleCache } = require('./utils/service-helpers');

/**
 * @typedef {Object} VoiceConfig
 * @property {string} [openaiApiKey] - OpenAI API Key
 * @property {string} [elevenLabsApiKey] - ElevenLabs API Key
 * @property {string} [azureSpeechKey] - Azure Speech Key
 * @property {string} [azureSpeechRegion='westeurope'] - Azure Region
 * @property {string} [sttProvider='openai'] - Standard STT Provider
 * @property {string} [ttsProvider='openai'] - Standard TTS Provider
 * @property {string} [language='de'] - Standardsprache
 */

class VoiceService {
  constructor(config = {}) {
    // API Keys
    this.openaiApiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    this.elevenLabsApiKey = config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
    this.azureSpeechKey = config.azureSpeechKey || process.env.AZURE_SPEECH_KEY;
    this.azureSpeechRegion = config.azureSpeechRegion || process.env.AZURE_SPEECH_REGION || 'westeurope';

    // Default Provider
    this.sttProvider = config.sttProvider || 'openai';
    this.ttsProvider = config.ttsProvider || 'openai';
    this.language = config.language || 'de';

    // Circuit Breakers für jeden Provider
    this.circuitBreakers = {
      openai: new CircuitBreaker({ name: 'openai-voice', failureThreshold: 3 }),
      elevenlabs: new CircuitBreaker({ name: 'elevenlabs', failureThreshold: 3 }),
      azure: new CircuitBreaker({ name: 'azure-voice', failureThreshold: 3 })
    };

    // TTS Cache (für wiederholte Texte)
    this.ttsCache = new SimpleCache({ ttl: 3600000, maxSize: 100 }); // 1 Stunde

    // Stimmen-Mappings
    this.voices = {
      openai: {
        de: { male: 'onyx', female: 'nova' },
        bs: { male: 'onyx', female: 'nova' },
        sr: { male: 'onyx', female: 'nova' },
        en: { male: 'onyx', female: 'nova' }
      },
      elevenlabs: {
        de: { male: 'pNInz6obpgDQGcFmaJgB', female: '21m00Tcm4TlvDq8ikWAM' }, // Adam, Rachel
        bs: { male: 'pNInz6obpgDQGcFmaJgB', female: '21m00Tcm4TlvDq8ikWAM' },
        sr: { male: 'pNInz6obpgDQGcFmaJgB', female: '21m00Tcm4TlvDq8ikWAM' },
        en: { male: 'pNInz6obpgDQGcFmaJgB', female: '21m00Tcm4TlvDq8ikWAM' }
      },
      azure: {
        de: { male: 'de-DE-ConradNeural', female: 'de-DE-KatjaNeural' },
        bs: { male: 'bs-BA-GoranNeural', female: 'bs-BA-VesnaNeural' },
        sr: { male: 'sr-RS-NicholasNeural', female: 'sr-RS-SophieNeural' },
        en: { male: 'en-US-GuyNeural', female: 'en-US-JennyNeural' }
      }
    };

    // Lokalisierte Nachrichten
    this.messages = {
      de: {
        stt_success: 'Sprache erfolgreich erkannt',
        stt_failed: 'Spracherkennung fehlgeschlagen',
        tts_success: 'Audio erfolgreich generiert',
        tts_failed: 'Audio-Generierung fehlgeschlagen',
        no_audio: 'Keine Audio-Datei gefunden',
        no_api_key: 'API-Key fehlt für Provider',
        provider_unavailable: 'Provider nicht verfügbar'
      },
      bs: {
        stt_success: 'Govor uspješno prepoznat',
        stt_failed: 'Prepoznavanje govora nije uspjelo',
        tts_success: 'Audio uspješno generiran',
        tts_failed: 'Generiranje audia nije uspjelo',
        no_audio: 'Audio datoteka nije pronađena',
        no_api_key: 'Nedostaje API ključ za providera',
        provider_unavailable: 'Provider nije dostupan'
      },
      sr: {
        stt_success: 'Говор успешно препознат',
        stt_failed: 'Препознавање говора није успело',
        tts_success: 'Аудио успешно генерисан',
        tts_failed: 'Генерисање аудиа није успело',
        no_audio: 'Аудио датотека није пронађена',
        no_api_key: 'Недостаје API кључ за провајдера',
        provider_unavailable: 'Провајдер није доступан'
      },
      en: {
        stt_success: 'Speech successfully recognized',
        stt_failed: 'Speech recognition failed',
        tts_success: 'Audio successfully generated',
        tts_failed: 'Audio generation failed',
        no_audio: 'No audio file found',
        no_api_key: 'API key missing for provider',
        provider_unavailable: 'Provider unavailable'
      }
    };
  }

  updateConfig(config) {
    if (config.openaiApiKey) this.openaiApiKey = config.openaiApiKey;
    if (config.elevenLabsApiKey) this.elevenLabsApiKey = config.elevenLabsApiKey;
    if (config.azureSpeechKey) this.azureSpeechKey = config.azureSpeechKey;
    if (config.azureSpeechRegion) this.azureSpeechRegion = config.azureSpeechRegion;
    if (config.sttProvider) this.sttProvider = config.sttProvider;
    if (config.ttsProvider) this.ttsProvider = config.ttsProvider;
    if (config.language) this.language = config.language;
    this.ttsCache.clear();
  }

  getMessage(key) {
    return this.messages[this.language]?.[key] || this.messages.en?.[key] || key;
  }

  // ============================================
  // SPEECH-TO-TEXT (STT)
  // ============================================

  async speechToText(audio, options = {}) {
    const provider = options.provider || this.sttProvider;
    const language = options.language || this.language;
    const fallbackProviders = this._getFallbackProviders('stt', provider);

    for (const currentProvider of [provider, ...fallbackProviders]) {
      const cb = this.circuitBreakers[currentProvider];
      if (cb && !cb.canRequest()) continue;

      try {
        let result;
        switch (currentProvider) {
          case 'openai':
            result = await this._whisperTranscribe(audio, language, options);
            break;
          case 'azure':
            result = await this._azureTranscribe(audio, language, options);
            break;
          default:
            continue;
        }

        if (cb) cb.recordSuccess();
        logInfo(`STT successful with ${currentProvider}`, { source: 'voice' });
        return result;
      } catch (error) {
        if (cb) cb.recordFailure();
        logError(error, {
          source: 'voice_stt',
          provider: currentProvider,
          details: { language }
        });

        if (currentProvider === fallbackProviders[fallbackProviders.length - 1]) {
          throw error;
        }
      }
    }

    throw new Error(this.getMessage('stt_failed'));
  }

  async _whisperTranscribe(audio, language, options = {}) {
    if (!this.openaiApiKey) {
      throw new Error(`${this.getMessage('no_api_key')}: OpenAI`);
    }

    const form = new FormData();
    const audioBuffer = this._getAudioBuffer(audio);

    form.append('file', audioBuffer, {
      filename: options.filename || 'audio.mp3',
      contentType: options.contentType || 'audio/mpeg'
    });
    form.append('model', 'whisper-1');
    form.append('language', this._getWhisperLanguageCode(language));

    if (options.prompt) form.append('prompt', options.prompt);
    if (options.responseFormat) form.append('response_format', options.responseFormat);

    const response = await RetryHandler.execute(async () => {
      return axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        form,
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            ...form.getHeaders()
          },
          timeout: 60000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );
    }, { maxRetries: 2 });

    return {
      success: true,
      text: response.data.text,
      provider: 'openai',
      language,
      duration: options.duration || null
    };
  }

  async _azureTranscribe(audio, language, options = {}) {
    if (!this.azureSpeechKey) {
      throw new Error(`${this.getMessage('no_api_key')}: Azure`);
    }

    const audioBuffer = this._getAudioBuffer(audio);
    const languageCode = this._getAzureLanguageCode(language);

    const response = await RetryHandler.execute(async () => {
      return axios.post(
        `https://${this.azureSpeechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${languageCode}`,
        audioBuffer,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.azureSpeechKey,
            'Content-Type': options.contentType || 'audio/wav',
            'Accept': 'application/json'
          },
          timeout: 60000
        }
      );
    }, { maxRetries: 2 });

    return {
      success: true,
      text: response.data.DisplayText || response.data.RecognitionStatus,
      provider: 'azure',
      language,
      confidence: response.data.NBest?.[0]?.Confidence,
      recognitionStatus: response.data.RecognitionStatus
    };
  }

  // ============================================
  // TEXT-TO-SPEECH (TTS)
  // ============================================

  async textToSpeech(text, options = {}) {
    if (!text?.trim()) {
      throw new Error('Text darf nicht leer sein');
    }

    const provider = options.provider || this.ttsProvider;
    const language = options.language || this.language;
    const gender = options.gender || 'female';

    // Cache-Check
    const cacheKey = this._getTTSCacheKey(text, provider, language, gender, options);
    if (!options.skipCache) {
      const cached = this.ttsCache.get(cacheKey);
      if (cached) {
        logInfo('TTS cache hit', { source: 'voice' });
        return { ...cached, fromCache: true };
      }
    }

    const fallbackProviders = this._getFallbackProviders('tts', provider);

    for (const currentProvider of [provider, ...fallbackProviders]) {
      const cb = this.circuitBreakers[currentProvider];
      if (cb && !cb.canRequest()) continue;

      try {
        let result;
        switch (currentProvider) {
          case 'openai':
            result = await this._openaiTTS(text, language, gender, options);
            break;
          case 'elevenlabs':
            result = await this._elevenLabsTTS(text, language, options);
            break;
          case 'azure':
            result = await this._azureTTS(text, language, gender, options);
            break;
          default:
            continue;
        }

        if (cb) cb.recordSuccess();

        // Cache speichern
        if (!options.skipCache && result.audio) {
          this.ttsCache.set(cacheKey, result);
        }

        logInfo(`TTS successful with ${currentProvider}`, {
          source: 'voice',
          details: { textLength: text.length, language }
        });

        return result;
      } catch (error) {
        if (cb) cb.recordFailure();
        logError(error, {
          source: 'voice_tts',
          provider: currentProvider,
          details: { language, textLength: text.length }
        });

        if (currentProvider === fallbackProviders[fallbackProviders.length - 1]) {
          throw error;
        }
      }
    }

    throw new Error(this.getMessage('tts_failed'));
  }

  async _openaiTTS(text, language, gender, options = {}) {
    if (!this.openaiApiKey) {
      throw new Error(`${this.getMessage('no_api_key')}: OpenAI`);
    }

    const voice = options.voice || this.voices.openai[language]?.[gender] || 'nova';
    const model = options.model || 'tts-1';
    const speed = Math.max(0.25, Math.min(4.0, options.speed || 1.0));

    const response = await RetryHandler.execute(async () => {
      return axios.post(
        'https://api.openai.com/v1/audio/speech',
        {
          model,
          input: text,
          voice,
          response_format: options.format || 'mp3',
          speed
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer',
          timeout: 60000
        }
      );
    }, { maxRetries: 2 });

    return {
      success: true,
      audio: Buffer.from(response.data),
      contentType: 'audio/mpeg',
      provider: 'openai',
      voice,
      language,
      model
    };
  }

  async _elevenLabsTTS(text, language, options = {}) {
    if (!this.elevenLabsApiKey) {
      throw new Error(`${this.getMessage('no_api_key')}: ElevenLabs`);
    }

    const gender = options.gender || 'female';
    const voiceId = options.voiceId || this.voices.elevenlabs[language]?.[gender] || '21m00Tcm4TlvDq8ikWAM';
    const modelId = options.modelId || 'eleven_multilingual_v2';

    const response = await RetryHandler.execute(async () => {
      return axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text,
          model_id: modelId,
          voice_settings: {
            stability: options.stability ?? 0.5,
            similarity_boost: options.similarityBoost ?? 0.75,
            style: options.style ?? 0,
            use_speaker_boost: options.speakerBoost ?? true
          }
        },
        {
          headers: {
            'xi-api-key': this.elevenLabsApiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          responseType: 'arraybuffer',
          timeout: 60000
        }
      );
    }, { maxRetries: 2 });

    return {
      success: true,
      audio: Buffer.from(response.data),
      contentType: 'audio/mpeg',
      provider: 'elevenlabs',
      voiceId,
      language,
      modelId
    };
  }

  async _azureTTS(text, language, gender, options = {}) {
    if (!this.azureSpeechKey) {
      throw new Error(`${this.getMessage('no_api_key')}: Azure`);
    }

    const voiceName = options.voice || this.voices.azure[language]?.[gender] || 'de-DE-KatjaNeural';
    const languageCode = this._getAzureLanguageCode(language);

    // SSML mit optionalen Prosody-Einstellungen
    const rate = options.rate || '0%';
    const pitch = options.pitch || '0%';
    const volume = options.volume || 'default';

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${languageCode}">
      <voice name="${voiceName}">
        <prosody rate="${rate}" pitch="${pitch}" volume="${volume}">
          ${this._escapeXml(text)}
        </prosody>
      </voice>
    </speak>`;

    const response = await RetryHandler.execute(async () => {
      return axios.post(
        `https://${this.azureSpeechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
        ssml,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.azureSpeechKey,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': options.outputFormat || 'audio-16khz-128kbitrate-mono-mp3'
          },
          responseType: 'arraybuffer',
          timeout: 60000
        }
      );
    }, { maxRetries: 2 });

    return {
      success: true,
      audio: Buffer.from(response.data),
      contentType: 'audio/mpeg',
      provider: 'azure',
      voice: voiceName,
      language
    };
  }

  // ============================================
  // HILFSFUNKTIONEN
  // ============================================

  _getAudioBuffer(audio) {
    if (Buffer.isBuffer(audio)) return audio;
    if (typeof audio === 'string') return fs.readFileSync(audio);
    throw new Error(this.getMessage('no_audio'));
  }

  _getFallbackProviders(type, primary) {
    const allProviders = type === 'stt'
      ? ['openai', 'azure']
      : ['openai', 'elevenlabs', 'azure'];

    return allProviders.filter(p => p !== primary && this._hasProviderKey(p));
  }

  _hasProviderKey(provider) {
    switch (provider) {
      case 'openai': return !!this.openaiApiKey;
      case 'elevenlabs': return !!this.elevenLabsApiKey;
      case 'azure': return !!this.azureSpeechKey;
      default: return false;
    }
  }

  _getTTSCacheKey(text, provider, language, gender, options) {
    const data = JSON.stringify({ text, provider, language, gender, voice: options.voice, voiceId: options.voiceId });
    return crypto.createHash('md5').update(data).digest('hex');
  }

  _escapeXml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  _getWhisperLanguageCode(language) {
    const mapping = { de: 'de', bs: 'bs', sr: 'sr', en: 'en', hr: 'hr' };
    return mapping[language] || 'de';
  }

  _getAzureLanguageCode(language) {
    const mapping = { de: 'de-DE', bs: 'bs-BA', sr: 'sr-RS', en: 'en-US', hr: 'hr-HR' };
    return mapping[language] || 'de-DE';
  }

  async getAvailableVoices(provider = null) {
    const targetProvider = provider || this.ttsProvider;

    switch (targetProvider) {
      case 'openai':
        return {
          provider: 'openai',
          voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
          models: ['tts-1', 'tts-1-hd']
        };

      case 'elevenlabs':
        if (!this.elevenLabsApiKey) {
          return { provider: 'elevenlabs', voices: [], error: this.getMessage('no_api_key') };
        }
        try {
          const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
            headers: { 'xi-api-key': this.elevenLabsApiKey },
            timeout: 10000
          });
          return {
            provider: 'elevenlabs',
            voices: response.data.voices.map(v => ({
              id: v.voice_id,
              name: v.name,
              labels: v.labels,
              preview_url: v.preview_url
            }))
          };
        } catch (error) {
          return { provider: 'elevenlabs', voices: [], error: error.message };
        }

      case 'azure':
        return { provider: 'azure', voices: this.voices.azure };

      default:
        return { provider: targetProvider, voices: [] };
    }
  }

  getStatus() {
    return {
      sttProvider: this.sttProvider,
      ttsProvider: this.ttsProvider,
      language: this.language,
      providers: {
        openai: { available: !!this.openaiApiKey, circuit: this.circuitBreakers.openai.getState() },
        elevenlabs: { available: !!this.elevenLabsApiKey, circuit: this.circuitBreakers.elevenlabs.getState() },
        azure: { available: !!this.azureSpeechKey, circuit: this.circuitBreakers.azure.getState() }
      },
      cacheSize: this.ttsCache.size()
    };
  }

  clearCache() {
    this.ttsCache.clear();
    return { cleared: true };
  }
}

// Express Router
function createVoiceRouter(voiceService) {
  const express = require('express');
  const multer = require('multer');
  const router = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }
  });

  router.post('/stt', upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Keine Audio-Datei' });
      }
      const { provider, language, prompt } = req.body;
      const result = await voiceService.speechToText(req.file.buffer, {
        provider, language, prompt,
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/tts', async (req, res) => {
    try {
      const { text, provider, language, gender, voice, voiceId, format, speed } = req.body;
      if (!text) return res.status(400).json({ error: 'Text fehlt' });

      const result = await voiceService.textToSpeech(text, {
        provider, language, gender, voice, voiceId, format, speed
      });

      res.set({
        'Content-Type': result.contentType,
        'Content-Disposition': 'attachment; filename="speech.mp3"',
        'X-Provider': result.provider,
        'X-From-Cache': result.fromCache ? 'true' : 'false'
      });
      res.send(result.audio);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/tts/json', async (req, res) => {
    try {
      const { text, provider, language, gender, voice, voiceId } = req.body;
      if (!text) return res.status(400).json({ error: 'Text fehlt' });

      const result = await voiceService.textToSpeech(text, {
        provider, language, gender, voice, voiceId
      });

      res.json({
        success: true,
        audio: result.audio.toString('base64'),
        contentType: result.contentType,
        provider: result.provider,
        voice: result.voice || result.voiceId,
        language: result.language,
        fromCache: result.fromCache || false
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/voices', async (req, res) => {
    try {
      const { provider } = req.query;
      const voices = await voiceService.getAvailableVoices(provider);
      res.json(voices);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/status', (req, res) => {
    res.json(voiceService.getStatus());
  });

  router.post('/cache/clear', (req, res) => {
    res.json(voiceService.clearCache());
  });

  return router;
}

const voiceService = new VoiceService();

module.exports = {
  VoiceService,
  voiceService,
  createVoiceRouter
};
