import {
  BrowserApp,
  createDefaultBrowserChatTools,
  GenerativeChatClient,
} from 'https://webdaemon.online/latest/static/lib/index.js';

class TalentAgentApp {
  constructor() {
    this.app = null;
    this.chatClient = null;
    this.currentChatId = null;
    this.loadedData = null;
    this.matchingResults = null;
  }

  async init() {
    try {
      // Initialize BrowserApp
      this.app = await BrowserApp.getInstance('TalentAgent');

      if (this.app.isOrphan()) {
        this.showError('Please launch this app from your Web Daemon shell!');
        document.getElementById('connection-status').textContent = 'Not Connected';
        document.getElementById('connection-status').classList.add('error');
        return;
      }

      // Update connection status
      const party = this.app.getParty();
      document.getElementById('daemon-party').textContent = party;
      document.getElementById('connection-status').textContent = 'Connected';
      document.getElementById('connection-status').classList.add('connected');

      // Initialize GenerativeChatClient
      const clientTools = createDefaultBrowserChatTools(this.app);
      this.chatClient = new GenerativeChatClient({
        app: this.app,
        agentTab: 'agent',
        clientTools,
      });

      await this.chatClient.init();

      // Enable chat
      document.getElementById('chat-input').disabled = false;
      document.getElementById('send-chat-btn').disabled = false;

      // Setup event listeners
      this.setupEventListeners();

      console.log('✅ Talent Agent initialized successfully');
      this.addChatMessage(
        'assistant',
        "Hello! I'm your data deduplication assistant. Load the data sources to begin.",
      );
    } catch (error) {
      console.error('Initialization error:', error);
      this.showError(`Failed to initialize: ${error.message}`);
    }
  }

  setupEventListeners() {
    document.getElementById('load-data-btn').addEventListener('click', () => this.loadData());
    document.getElementById('run-matching-btn').addEventListener('click', () => this.runMatching());
    document.getElementById('send-chat-btn').addEventListener(
      'click',
      () => this.sendChatMessage(),
    );
    document.getElementById('export-btn')?.addEventListener('click', () => this.exportResults());

    document.getElementById('chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendChatMessage();
    });
  }

  async loadData() {
    const btn = document.getElementById('load-data-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Loading...';

    try {
      const url = await this.app.getAgentUrl('agent');
      const response = await fetch(`${url}/load-data`, {
        method: 'POST',
        headers: {
          'X-Tabserver-Token': this.app.getTokenBase64(),
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (result.ok) {
        this.loadedData = result.ok;

        // Update UI
        document.querySelectorAll('.db-item').forEach((item, index) => {
          item.classList.add('loaded');
          const count = this.loadedData.databases[index]?.rowCount || 0;
          item.querySelector('.db-count').textContent = `${count} rows`;
          item.querySelector('.db-status').textContent = 'Loaded';
        });

        document.getElementById('run-matching-btn').disabled = false;
        btn.textContent = '✓ Data Loaded';
        btn.classList.add('success');

        this.addChatMessage(
          'assistant',
          `Successfully loaded ${this.loadedData.totalRecords} records from ${this.loadedData.databases.length} databases.`,
        );
      } else {
        throw new Error(result.error || 'Failed to load data');
      }
    } catch (error) {
      console.error('Load data error:', error);
      this.showError(`Failed to load data: ${error.message}`);
      btn.textContent = 'Load All Data Sources';
      btn.disabled = false;
    }
  }

  async runMatching() {
    const btn = document.getElementById('run-matching-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Processing...';

    try {
      // Get settings
      const settings = {
        emailPriority: parseInt(document.getElementById('email-priority').value),
        phonePriority: parseInt(document.getElementById('phone-priority').value),
        fuzzyThreshold: parseInt(document.getElementById('fuzzy-threshold').value),
        autoMerge: document.getElementById('auto-merge').value,
      };

      const url = await this.app.getAgentUrl('agent');
      const response = await fetch(`${url}/run-matching`, {
        method: 'POST',
        headers: {
          'X-Tabserver-Token': this.app.getTokenBase64(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings }),
      });

      const result = await response.json();

      if (result.ok) {
        this.matchingResults = result.ok;
        this.displayResults();
        btn.textContent = '✓ Matching Complete';

        this.addChatMessage(
          'assistant',
          `Deduplication complete! Found ${this.matchingResults.uniquePersons} unique persons from ${this.matchingResults.totalRecords} records.`,
        );
      } else {
        throw new Error(result.error || 'Failed to run matching');
      }
    } catch (error) {
      console.error('Matching error:', error);
      this.showError(`Failed to run matching: ${error.message}`);
      btn.textContent = '🚀 Run Matching & Deduplication';
      btn.disabled = false;
    }
  }

  displayResults() {
    const results = this.matchingResults;

    // Show results section
    document.getElementById('results-section').style.display = 'block';

    // Update metrics
    document.getElementById('total-records').textContent = results.totalRecords;
    document.getElementById('unique-persons').textContent = results.uniquePersons;
    document.getElementById('email-matches').textContent = results.emailMatches;
    document.getElementById('phone-matches').textContent = results.phoneMatches;
    document.getElementById('fuzzy-matches').textContent = results.fuzzyMatches;
    document.getElementById('manual-review').textContent = results.manualReview;
    document.getElementById('held-out').textContent = results.heldOut;

    // Show review section if there are items
    if (results.manualReview > 0) {
      document.getElementById('review-section').style.display = 'block';
    }

    // Scroll to results
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
  }

  async sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    input.value = '';
    input.disabled = true;
    document.getElementById('send-chat-btn').disabled = true;

    this.addChatMessage('user', message);

    try {
      if (!this.currentChatId) {
        const session = await this.chatClient.createSession({
          targetParty: this.app.getParty(),
        });
        this.currentChatId = session.chatId;
      }

      await this.chatClient.sendMessage({
        targetParty: this.app.getParty(),
        chatId: this.currentChatId,
        message,
        onEvent: (event) => {
          if (event.role === 'assistant') {
            this.addChatMessage('assistant', event.content);
          }
        },
      });
    } catch (error) {
      console.error('Chat error:', error);
      this.addChatMessage('assistant', `Error: ${error.message}`);
    } finally {
      input.disabled = false;
      document.getElementById('send-chat-btn').disabled = false;
      input.focus();
    }
  }

  addChatMessage(role, content) {
    const container = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    messageDiv.textContent = content;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
  }

  async exportResults() {
    try {
      const url = await this.app.getAgentUrl('agent');
      const response = await fetch(`${url}/export`, {
        method: 'POST',
        headers: {
          'X-Tabserver-Token': this.app.getTokenBase64(),
        },
      });

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `deduplication-results-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      this.addChatMessage('assistant', 'Results exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      this.showError(`Failed to export: ${error.message}`);
    }
  }

  showError(message) {
    const container = document.getElementById('chat-messages');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'chat-message assistant';
    errorDiv.style.borderLeft = '4px solid var(--danger-color)';
    errorDiv.textContent = `❌ ${message}`;
    container.appendChild(errorDiv);
    container.scrollTop = container.scrollHeight;
  }
}

// Initialize app
const app = new TalentAgentApp();
app.init();
