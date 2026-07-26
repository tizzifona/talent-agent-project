import { GenerativeChatAgent } from '$static/lib/ts/GenerativeChatAgent.ts';
import { response } from '$static/lib/ts/Responses.ts';
import { runMatching } from './matcher.ts';
import { normalizeRecord } from './normalize.ts';

// deno-lint-ignore no-explicit-any
let matchingResults: any = null;

const systemPrompt = `You are a data deduplication expert. Help users analyze matching results and improve data quality.

You can help with:
- Explaining how records were matched
- Suggesting ways to improve data quality
- Answering questions about the deduplication process
- Providing insights about the data`;

const agent = new GenerativeChatAgent({
  targetScope: 'chat useTools read_memory write_memory',
  defaultSystemPrompt: systemPrompt,
  defaultTemperature: 0.3,
  maxToolRounds: 4,
});

Deno.serve({ port: 0 }, async (request) => {
  const url = new URL(request.url);
  
  // Handle custom routes for matching
  if (url.pathname.endsWith('/run-matching') && request.method === 'POST') {
    try {
      const body = await request.json();
      
      if (!body.files || body.files.length === 0) {
        return response({ error: 'No files provided' });
      }

      // deno-lint-ignore no-explicit-any
      const filesData = {
        // deno-lint-ignore no-explicit-any
        databases: body.files.map((file: any) => ({
          name: file.name,
          rowCount: file.rowCount,
          // deno-lint-ignore no-explicit-any
          records: file.records.map((record: any, index: number) => ({
            ...normalizeRecord(record),
            sourceDb: file.name,
            rowIndex: index
          }))
        })),
        // deno-lint-ignore no-explicit-any
        totalRecords: body.files.reduce((sum: number, f: any) => sum + f.rowCount, 0),
        loadedAt: new Date().toISOString()
      };

      matchingResults = runMatching(filesData, body.settings);

      return response({ ok: matchingResults });
    } catch (error) {
      console.error('Matching error:', error);
      return response({ error: `Failed to run matching: ${error.message}` });
    }
  }

  // All other requests go to the chat agent (including lifecycle)
  return agent.handler(request);
});
