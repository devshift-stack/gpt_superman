/**
 * CodingAgent - Specialized in code generation, debugging, and technical tasks
 */

const BaseAgent = require('./BaseAgent');

class CodingAgent extends BaseAgent {
  constructor(config) {
    super(config);
    
    this.supportedLanguages = [
      'javascript', 'typescript', 'python', 'java', 'go', 'rust',
      'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin',
      'html', 'css', 'sql', 'bash', 'powershell',
    ];
    
    this.codePatterns = {
      bug_fix: /bug|fix|error|exception|crash|broken|fehler|reparier/i,
      new_code: /create|write|implement|build|generate|erstell|schreib|programmier/i,
      refactor: /refactor|improve|optimize|clean|verbessere|optimier/i,
      review: /review|check|analyze|audit|prüf|analysier/i,
      test: /test|spec|coverage|unit|integration/i,
      docs: /document|readme|comment|explain|dokumentier|erkläre/i,
    };
  }
  
  buildPrompt(task) {
    const taskType = this.detectTaskType(task.content);
    const language = this.detectLanguage(task.content);
    
    let systemPrompt = `You are an expert software engineer specialized in writing clean, efficient, and well-documented code.

Your capabilities:
- Write production-ready code in multiple languages
- Debug and fix complex issues
- Refactor code for better performance and maintainability
- Write comprehensive tests
- Create clear documentation

Guidelines:
- Always use best practices and design patterns
- Include error handling and edge cases
- Add helpful comments for complex logic
- Follow the language's style guide
- Consider security implications`;

    if (language) {
      systemPrompt += `\n\nThe user is working with ${language}. Use ${language} best practices and idioms.`;
    }
    
    switch (taskType) {
      case 'bug_fix':
        systemPrompt += `\n\nFocus on:
1. Identify the root cause of the bug
2. Explain what's wrong and why
3. Provide the corrected code
4. Suggest ways to prevent similar bugs`;
        break;
        
      case 'new_code':
        systemPrompt += `\n\nFocus on:
1. Understand the requirements fully
2. Plan the solution architecture
3. Write clean, modular code
4. Include necessary imports and dependencies
5. Add usage examples`;
        break;
        
      case 'refactor':
        systemPrompt += `\n\nFocus on:
1. Identify code smells and issues
2. Suggest improvements
3. Provide refactored version
4. Explain the benefits of changes`;
        break;
        
      case 'review':
        systemPrompt += `\n\nFocus on:
1. Check for bugs and potential issues
2. Review code quality and style
3. Assess security vulnerabilities
4. Suggest improvements
5. Rate the code (1-10) with justification`;
        break;
        
      case 'test':
        systemPrompt += `\n\nFocus on:
1. Write comprehensive test cases
2. Cover edge cases and error scenarios
3. Use appropriate testing framework
4. Include setup and teardown
5. Aim for high coverage`;
        break;
        
      case 'docs':
        systemPrompt += `\n\nFocus on:
1. Write clear, concise documentation
2. Include usage examples
3. Document parameters and return values
4. Add installation/setup instructions if needed
5. Use proper formatting (Markdown)`;
        break;
    }
    
    return { system: systemPrompt, user: task.content };
  }
  
  detectTaskType(content) {
    for (const [type, pattern] of Object.entries(this.codePatterns)) {
      if (pattern.test(content)) return type;
    }
    return 'new_code';
  }
  
  detectLanguage(content) {
    const contentLower = content.toLowerCase();
    
    for (const lang of this.supportedLanguages) {
      if (contentLower.includes(lang)) return lang;
    }
    
    if (/\bconst\b|\blet\b|\b=>\b/.test(content)) return 'javascript';
    if (/\bdef\b|\bimport\b.*\bfrom\b/.test(content)) return 'python';
    if (/\bpublic\s+class\b|\bprivate\b/.test(content)) return 'java';
    if (/\bfunc\b|\bpackage\b/.test(content)) return 'go';
    if (/\bfn\b|\blet\s+mut\b/.test(content)) return 'rust';
    
    return null;
  }
  
  canHandle(task) {
    let score = super.canHandle(task);
    const content = (task.content || '').toLowerCase();
    
    if (/```[\s\S]*```/.test(task.content)) {
      score += 0.3;
    }
    
    for (const lang of this.supportedLanguages) {
      if (content.includes(lang)) {
        score += 0.2;
        break;
      }
    }
    
    for (const pattern of Object.values(this.codePatterns)) {
      if (pattern.test(content)) {
        score += 0.1;
        break;
      }
    }
    
    return Math.min(score, 1.0);
  }
}

module.exports = CodingAgent;
