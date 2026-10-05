export const LANGUAGE_LEVELS = [
  { value: 'A1', label: 'A1 · Beginner' },
  { value: 'A2', label: 'A2 · Elementary' },
  { value: 'B1', label: 'B1 · Intermediate' },
  { value: 'B2', label: 'B2 · Upper-intermediate' },
  { value: 'C1', label: 'C1 · Advanced' },
  { value: 'C2', label: 'C2 · Proficiency' },
  { value: 'Native', label: 'Native' },
];

export const COUNTRIES = [
  { name: 'Ukraine', dial: '+380' },
  { name: 'Poland', dial: '+48' },
  { name: 'Germany', dial: '+49' },
  { name: 'Czechia', dial: '+420' },
  { name: 'Slovakia', dial: '+421' },
  { name: 'Romania', dial: '+40' },
  { name: 'Hungary', dial: '+36' },
  { name: 'Moldova', dial: '+373' },
  { name: 'Lithuania', dial: '+370' },
  { name: 'Latvia', dial: '+371' },
  { name: 'Estonia', dial: '+372' },
  { name: 'Georgia', dial: '+995' },
  { name: 'Armenia', dial: '+374' },
  { name: 'Azerbaijan', dial: '+994' },
  { name: 'Turkey', dial: '+90' },
  { name: 'Spain', dial: '+34' },
  { name: 'Portugal', dial: '+351' },
  { name: 'Italy', dial: '+39' },
  { name: 'France', dial: '+33' },
  { name: 'Netherlands', dial: '+31' },
  { name: 'Belgium', dial: '+32' },
  { name: 'Austria', dial: '+43' },
  { name: 'Switzerland', dial: '+41' },
  { name: 'United Kingdom', dial: '+44' },
  { name: 'Ireland', dial: '+353' },
  { name: 'Sweden', dial: '+46' },
  { name: 'Norway', dial: '+47' },
  { name: 'Denmark', dial: '+45' },
  { name: 'Finland', dial: '+358' },
  { name: 'Greece', dial: '+30' },
  { name: 'Bulgaria', dial: '+359' },
  { name: 'Croatia', dial: '+385' },
  { name: 'Serbia', dial: '+381' },
  { name: 'Slovenia', dial: '+386' },
  { name: 'Bosnia and Herzegovina', dial: '+387' },
  { name: 'North Macedonia', dial: '+389' },
  { name: 'Albania', dial: '+355' },
  { name: 'Montenegro', dial: '+382' },
  { name: 'Cyprus', dial: '+357' },
  { name: 'Malta', dial: '+356' },
  { name: 'United States', dial: '+1' },
  { name: 'Canada', dial: '+1' },
  { name: 'Mexico', dial: '+52' },
  { name: 'Brazil', dial: '+55' },
  { name: 'Argentina', dial: '+54' },
  { name: 'Colombia', dial: '+57' },
  { name: 'Chile', dial: '+56' },
  { name: 'Israel', dial: '+972' },
  { name: 'United Arab Emirates', dial: '+971' },
  { name: 'India', dial: '+91' },
  { name: 'Pakistan', dial: '+92' },
  { name: 'Bangladesh', dial: '+880' },
  { name: 'China', dial: '+86' },
  { name: 'Japan', dial: '+81' },
  { name: 'South Korea', dial: '+82' },
  { name: 'Vietnam', dial: '+84' },
  { name: 'Thailand', dial: '+66' },
  { name: 'Indonesia', dial: '+62' },
  { name: 'Philippines', dial: '+63' },
  { name: 'Malaysia', dial: '+60' },
  { name: 'Singapore', dial: '+65' },
  { name: 'Australia', dial: '+61' },
  { name: 'New Zealand', dial: '+64' },
  { name: 'South Africa', dial: '+27' },
  { name: 'Nigeria', dial: '+234' },
  { name: 'Kenya', dial: '+254' },
  { name: 'Egypt', dial: '+20' },
  { name: 'Morocco', dial: '+212' },
  { name: 'Tunisia', dial: '+216' },
  { name: 'Kazakhstan', dial: '+7' },
  { name: 'Uzbekistan', dial: '+998' },
  { name: 'Kyrgyzstan', dial: '+996' },
  { name: 'Tajikistan', dial: '+992' },
  { name: 'Belarus', dial: '+375' },
];

const SKILL_STACKS = {
  frontend: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'Next.js', 'Svelte', 'Tailwind'],
  backend: ['Node.js', 'Express', 'Python', 'Django', 'FastAPI', 'Java', 'Spring', 'C#', '.NET', 'Go', 'PHP', 'Laravel', 'Ruby', 'Rails'],
  data: ['SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Pandas', 'NumPy', 'Power BI', 'Tableau', 'Excel'],
  devops: ['Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Linux', 'Git', 'CI/CD', 'Terraform'],
  mobile: ['React Native', 'Flutter', 'Swift', 'Kotlin', 'Android', 'iOS'],
  design: ['Figma', 'UX', 'UI', 'Adobe XD', 'Product Design'],
  product: ['Product Management', 'Agile', 'Scrum', 'Jira', 'User Research'],
  qa: ['QA', 'Cypress', 'Playwright', 'Selenium', 'Jest', 'Testing'],
  ai: ['Python', 'Machine Learning', 'PyTorch', 'TensorFlow', 'NLP', 'LLM'],
};

const TITLE_STACK = [
  [/front|react|vue|angular|ui engineer/i, 'frontend'],
  [/back|node|java|python|php|\.net|golang/i, 'backend'],
  [/full.?stack/i, 'frontend'],
  [/data|analy|bi |sql|scientist/i, 'data'],
  [/devops|sre|cloud|infra/i, 'devops'],
  [/mobile|android|ios|flutter/i, 'mobile'],
  [/design|ux|ui designer/i, 'design'],
  [/product|pm\b|owner/i, 'product'],
  [/qa|test|sdet/i, 'qa'],
  [/ml|ai |machine learning|nlp/i, 'ai'],
];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function allSkills() {
  return [...new Set(Object.values(SKILL_STACKS).flat())];
}

export function suggestSkills(jobTitle = '', query = '', selected = []) {
  const taken = new Set(selected.map((item) => item.toLowerCase()));
  const titleKey = TITLE_STACK.find(([pattern]) => pattern.test(jobTitle))?.[1];
  const q = query.trim().toLowerCase();
  const preferred = titleKey ? SKILL_STACKS[titleKey] : [];
  const pool = [...preferred, ...allSkills()];
  return [...new Set(pool)]
    .filter((skill) => !taken.has(skill.toLowerCase()))
    .filter((skill) => !q || skill.toLowerCase().includes(q))
    .slice(0, 8);
}

export function matchCountry(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  return COUNTRIES.find((row) => row.name.toLowerCase() === text)
    || COUNTRIES.find((row) => row.name.toLowerCase().startsWith(text))
    || COUNTRIES.find((row) => row.name.toLowerCase().includes(text))
    || null;
}

export function filterCountries(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return COUNTRIES.slice(0, 12);
  return COUNTRIES.filter((row) => row.name.toLowerCase().includes(q)).slice(0, 12);
}

export function splitPhone(value) {
  const raw = String(value || '').replace(/[^\d+]/g, '');
  const match = COUNTRIES
    .slice()
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((row) => raw.startsWith(row.dial));
  if (!match) return { dial: '+380', national: raw.replace(/^\+/, '') };
  return { dial: match.dial, national: raw.slice(match.dial.length) };
}

export function joinPhone(dial, national) {
  const digits = String(national || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  return `${dial}${digits}`;
}

function countryField(id, value) {
  const current = escapeHtml(value || '');
  return `
    <div class="combo">
      <input id="${id}" type="text" data-field-kind="country" value="${current}" placeholder="Start typing a country" autocomplete="off">
      <div class="combo-list" hidden></div>
    </div>
  `;
}

function phoneField(id, value) {
  const parts = splitPhone(value);
  const options = COUNTRIES.map((row) => {
    const selected = row.dial === parts.dial ? ' selected' : '';
    return `<option value="${escapeHtml(row.dial)}"${selected}>${escapeHtml(row.name)} ${escapeHtml(row.dial)}</option>`;
  }).join('');
  return `
    <div class="phone-row">
      <select id="${id}-dial" aria-label="Country code">${options}</select>
      <input id="${id}" type="tel" inputmode="tel" value="${escapeHtml(parts.national)}" placeholder="Phone number">
    </div>
  `;
}

function levelField(id, value) {
  const current = String(value || '').trim();
  const options = ['<option value="">Select a level</option>'].concat(
    LANGUAGE_LEVELS.map((row) => {
      const selected = row.value.toLowerCase() === current.toLowerCase() ? ' selected' : '';
      return `<option value="${escapeHtml(row.value)}"${selected}>${escapeHtml(row.label)}</option>`;
    }),
  ).join('');
  return `<select id="${id}">${options}</select>`;
}

function skillField(id, value) {
  return `
    <div class="skill-field">
      <input id="${id}" type="text" value="${escapeHtml(value || '')}" placeholder="Type a skill, then pick a suggestion" autocomplete="off">
      <div class="skill-chips" data-for="${id}"></div>
    </div>
  `;
}

export function enhancedControl(field, id, value) {
  if (field === 'country_of_origin' || field === 'country_of_residence') return countryField(id, value);
  if (field === 'phone_number') return phoneField(id, value);
  if (field === 'english_level') return levelField(id, value);
  if (field === 'technical_skills' || field === 'key_skills') return skillField(id, value);
  return `<input id="${id}" type="text" value="${escapeHtml(value || '')}">`;
}

export function bindEnhancedFields(root, getJobTitle) {
  if (!root) return;

  root.querySelectorAll('[data-field-kind="country"]').forEach((input) => {
    const list = input.parentElement.querySelector('.combo-list');
    const render = () => {
      const rows = filterCountries(input.value);
      list.innerHTML = rows.map((row) => `<button type="button" data-country="${escapeHtml(row.name)}">${escapeHtml(row.name)}</button>`).join('');
      list.hidden = !rows.length;
    };
    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
    list.addEventListener('mousedown', (event) => {
      const button = event.target.closest('[data-country]');
      if (!button) return;
      input.value = button.dataset.country;
      list.hidden = true;
    });
  });

  const refreshSkills = (input) => {
    const chips = root.querySelector(`.skill-chips[data-for="${input.id}"]`);
    if (!chips) return;
    const selected = String(input.value || '').split(',').map((item) => item.trim()).filter(Boolean);
    const query = selected[selected.length - 1] && !input.value.trim().endsWith(',')
      ? selected[selected.length - 1]
      : '';
    const base = input.value.trim().endsWith(',') ? selected : selected.slice(0, -1);
    const suggestions = suggestSkills(getJobTitle?.() || '', query, base);
    chips.innerHTML = suggestions.map((skill) => `<button type="button" class="skill-chip" data-skill="${escapeHtml(skill)}">${escapeHtml(skill)}</button>`).join('');
  };

  root.querySelectorAll('.skill-field input').forEach((input) => {
    refreshSkills(input);
    input.addEventListener('input', () => refreshSkills(input));
    input.addEventListener('focus', () => refreshSkills(input));
  });

  root.addEventListener('click', (event) => {
    const chip = event.target.closest('.skill-chip');
    if (!chip) return;
    const input = document.getElementById(chip.closest('.skill-chips').dataset.for);
    if (!input) return;
    const parts = String(input.value || '').split(',').map((item) => item.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    const adding = chip.dataset.skill;
    if (last && adding.toLowerCase().startsWith(last.toLowerCase())) parts.pop();
    if (!parts.some((item) => item.toLowerCase() === adding.toLowerCase())) parts.push(adding);
    input.value = `${parts.join(', ')}, `;
    input.focus();
    refreshSkills(input);
  });
}

export function readEnhancedValue(field, prefix) {
  const id = `${prefix}-${field}`;
  if (field === 'phone_number') {
    const input = document.getElementById(id);
    const dial = document.getElementById(`${id}-dial`);
    if (!input) return '';
    return dial ? joinPhone(dial.value, input.value) : input.value.trim();
  }
  const input = document.getElementById(id);
  return input ? String(input.value || '').trim() : '';
}
