# 🎯 Talent Agent - Data Deduplication System

Multi-database deduplication and matching system with AI assistance, built on [Web Daemon](https://webdaemon.online) platform.

## 🌟 Features

- **Multi-Database Support**: Process 7 different database formats simultaneously
- **Smart Matching**: 
  - Exact email matching
  - Exact phone matching
  - Fuzzy name matching (Levenshtein distance)
  - Manual review queue for ambiguous cases
- **AI Assistant**: Powered by GenerativeChatAgent with Claude API
- **Provenance Tracking**: Full audit trail of record sources
- **Export Results**: CSV export with detailed matching information

## 📊 Test Data

The project includes 7 mock CSV databases with different structures:
1. LinkedIn Database (id, first_name, last_name, email, phone...)
2. Recruiting System (candidate_id, full_name, email_address...)
3. HR System (employee_number, surname, given_name...)
4. Conference Attendees (registration_id, attendee_name...)
5. Newsletter Subscribers (subscriber_id, email, name...)
6. Contact Database (contact_uuid, first, last, email_primary...)
7. Event Participants (event_id, participant_email...)

**Total Test Records**: 53 records
**Expected Unique Persons**: ~10-12 (after deduplication)

## 🚀 Quick Start

### Prerequisites

- Deno installed (`curl -fsSL https://deno.land/install.sh | sh`)
- Web Daemon account at daemon: `3ba317.magicid.cloud`

### Local Development

```bash
# Check TypeScript
deno task check

# Format code
deno task fmt

# Lint code
deno task lint

# Test agent locally
deno task dev

# Serve frontend locally
deno task serve
```

### Deploy to GitHub Pages

1. Push all files in `public/` directory to GitHub
2. Enable GitHub Pages in repository settings
3. Set source to `main` branch, `/public` folder
4. Access at: `https://tizzifona.github.io/talent-agent-project/`

### Install in Web Daemon

1. Open your Web Daemon shell at `https://3ba317.magicid.cloud`
2. Click "Install App"
3. Enter URL: `https://tizzifona.github.io/talent-agent-project/index.html`
4. Grant permissions
5. Launch the app!

## 📁 Project Structure

```
talent-agent-project/
├── public/                    # GitHub Pages root
│   ├── index.html            # Main app page
│   ├── app.yml               # Web Daemon configuration
│   ├── app.css               # Styles
│   ├── app.js                # Frontend logic
│   ├── importmap.json        # Deno import map
│   └── agent/                # Agent-side code (Deno)
│       ├── main.ts           # Main server
│       ├── data-loader.ts    # CSV loading
│       ├── matcher.ts        # Matching algorithm
│       └── exporter.ts       # Results export
├── test-data/                # Test CSV files
│   ├── database1_linkedin.csv
│   ├── database2_recruiting.csv
│   ├── database3_hr_system.csv
│   ├── database4_conference.csv
│   ├── database5_newsletter.csv
│   ├── database6_contacts.csv
│   └── database7_events.csv
├── deno.json                 # Deno configuration
└── README.md                 # This file
```

## 🔧 How It Works

### Matching Algorithm (Section 3 - Priority Order)

1. **Exact Email Match** (Priority 1)
   - Normalize emails (lowercase, trim)
   - Group records by exact email match
   - Confidence: 100%

2. **Exact Phone Match** (Priority 2)
   - Normalize phones (remove formatting)
   - Group records by phone number
   - Confidence: 95%

3. **Fuzzy Name Match** (Priority 3)
   - Use Levenshtein distance algorithm
   - Configurable threshold (default: 85%)
   - Confidence: 70-90% based on similarity

4. **Manual Review Queue**
   - Ambiguous matches below auto-merge threshold
   - Requires human verification

5. **Held Out**
   - Records with no matches
   - Single-record persons

### Output (Section 8 - Provenance)

Each unified person record includes:
- Unique Person ID
- Primary email, phone, name
- Match type and confidence score
- Record count
- **Provenance**: List of source databases and row numbers
- All associated emails and phones

## 🤖 AI Assistant

The built-in GenerativeChatAgent can:
- Analyze matching results
- Suggest threshold adjustments
- Identify potential false positives/negatives
- Provide data quality insights
- Generate detailed reports

Ask questions like:
- "Why did these records match?"
- "Should I increase the fuzzy name threshold?"
- "Show me low-confidence matches"
- "What's the data quality issue here?"

## 📈 Expected Results (Test Data)

With default settings (85% fuzzy threshold):

- **Total Records**: 53
- **Unique Persons**: ~10-12
- **Email Matches**: ~8-10
- **Phone Matches**: ~5-7
- **Fuzzy Matches**: ~3-5
- **Manual Review**: ~2-4
- **Held Out**: ~1-2

## 🛠️ Configuration

Edit matching settings in the UI:
- Email Match Priority (1-3)
- Phone Match Priority (1-3)
- Fuzzy Name Threshold (50-100%)
- Auto-merge Confidence Level

## 📤 Export

Export results as CSV with columns:
- Person ID
- Primary Name/Email/Phone
- Match Type
- Confidence
- Record Count
- Provenance (Sources)
- All Emails
- All Phones

## 🔐 Security

- All processing happens in your daemon (agent-side)
- Data never leaves your Web Daemon instance
- Token-based authentication
- Scoped permissions (chat, process_data, memory access)

## 📝 License

MIT

## 🤝 Contributing

Issues and PRs welcome!

---

**Built with**: [Web Daemon](https://webdaemon.online) • [Deno](https://deno.land) • [Claude AI](https://anthropic.com)
