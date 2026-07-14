import { Lifecycle } from '$static/lib/ts/Lifecycle.ts';
import { GenerativeChatAgent } from 'webdaemon';
import { Token } from '$static/lib/js/Token.js';
import { response } from '$static/lib/ts/Responses.ts';
import { loadAllDatabases } from './data-loader.ts';
import { runMatching } from './matcher.ts';
import { exportResults } from './exporter.ts';

const lifecycle = new Lifecycle();
let chatAgent: GenerativeChatAgent | null = null;
// deno-lint-ignore no-explicit-any
let loadedData: any = null;
// deno-lint-ignore no-explicit-any
let matchingResults: any = null;

// Initialize GenerativeChatAgent
// deno-lint-ignore no-explicit-any
lifecycle.addEventListener('config', (event: any) => {
  const config = event.detail;
  console.log('Agent started for party:', config.system.party);
  
  const systemPrompt = config.user?.systemPrompt || 
    'You are a data deduplication expert. Help users analyze matching results and improve data quality.';

  chatAgent = new GenerativeChatAgent({
    targetScope: 'chat useTools read_memory write_memory',
    defaultSystemPrompt: systemPrompt,
    defaultTemperature: 0.2,
    maxToolRounds: 4,
  });
});

Deno.serve({ port: 0 }, async (request) => {
  // Handle lifecycle requests
  if (Lifecycle.shouldHandle(request)) {
    return lifecycle.handler(request);
  }

  // Handle chat agent requests
  if (chatAgent && request.url.includes('/rpc')) {
    return chatAgent.handler(request);
  }

  const url = new URL(request.url);
  const token = Token.from(request);
  
  if (!token) {
    return response({ error: 'Token required' });
  }

  const source = Lifecycle.getConfig().system.source;
  
  // Route handling
  if (url.pathname.endsWith('/load-data') && request.method === 'POST') {
    if (!token.hasCapability(source, 'process_data')) {
      return response({ error: 'Missing capability: process_data' });
    }

    try {
      loadedData = loadAllDatabases();
      return response({ ok: loadedData });
    } catch (error) {
      console.error('Load data error:', error);
      return response({ error: `Failed to load data: ${error.message}` });
    }
  }

  if (url.pathname.endsWith('/run-matching') && request.method === 'POST') {
    if (!token.hasCapability(source, 'process_data')) {
      return response({ error: 'Missing capability: process_data' });
    }

    if (!loadedData) {
      return response({ error: 'No data loaded. Please load data first.' });
    }

    try {
      const body = await request.json();
      matchingResults = runMatching(loadedData, body.settings);
      
      // Store results in semantic memory if available
      if (token.hasCapability(source, 'write_memory') && chatAgent) {
        // TODO: Store in semantic memory
      }

      return response({ ok: matchingResults });
    } catch (error) {
      console.error('Matching error:', error);
      return response({ error: `Failed to run matching: ${error.message}` });
    }
  }

  if (url.pathname.endsWith('/export') && request.method === 'POST') {
    if (!matchingResults) {
      return response({ error: 'No results to export' });
    }

    try {
      const csv = exportResults(matchingResults);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="results.csv"'
        }
      });
    } catch (error) {
      console.error('Export error:', error);
      return response({ error: `Failed to export: ${error.message}` });
    }
  }

  // Default route - delegate to chat agent if available
  if (chatAgent) {
    return chatAgent.handler(request);
  }

  return response({ 
    ok: { 
      status: 'running',
      party: Lifecycle.getConfig().system.party,
      dataLoaded: loadedData !== null,
      matchingComplete: matchingResults !== null
    } 
  });
});
