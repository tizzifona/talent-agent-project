export const LANGUAGE_LEVELS = [
  { value: 'A1', label: 'A1 · Beginner' },
  { value: 'A2', label: 'A2 · Elementary' },
  { value: 'B1', label: 'B1 · Intermediate' },
  { value: 'B2', label: 'B2 · Upper-intermediate' },
  { value: 'C1', label: 'C1 · Advanced' },
  { value: 'C2', label: 'C2 · Proficiency' },
  { value: 'Native', label: 'Native' },
];

export const GENDER_OPTIONS = [
  { value: 'Woman', label: 'Woman' },
  { value: 'Man', label: 'Man' },
  { value: 'Non-binary', label: 'Non-binary' },
  { value: 'Prefer not to say', label: 'Prefer not to say' },
];

export const CONTACT_METHODS = [
  { value: 'Email', label: 'Email' },
  { value: 'Phone', label: 'Phone' },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'LinkedIn', label: 'LinkedIn' },
];

export const YES_NO_OPTIONS = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
  { value: 'Prefer not to answer', label: 'Prefer not to answer' },
];

export const EXPERIENCE_YEARS = [
  { value: '0-1', label: '0–1 year' },
  { value: '1-3', label: '1–3 years' },
  { value: '3-5', label: '3–5 years' },
  { value: '5+', label: '5+ years' },
  { value: '10+', label: '10+ years' },
  { value: '15+', label: '15+ years' },
];

export const EMPLOYMENT_OPTIONS = [
  { value: 'Unemployed, looking for work', label: 'No job, looking for work' },
  { value: 'Unemployed, not looking', label: 'No job, not looking right now' },
  { value: 'Freelance', label: 'Freelance / contract' },
  { value: 'Employed, open to offers', label: 'Permanent job, open to offers' },
  { value: 'Employed, not looking', label: 'Permanent job, not interested in new offers' },
];

export const AGE_OPTIONS = Array.from({ length: 60 }, (_, index) => {
  const age = String(16 + index);
  return { value: age, label: age };
});

export const COUNTRIES = [
  { name: 'Ukraine', dial: '+380', iso: 'UA' },
  { name: 'Poland', dial: '+48', iso: 'PL' },
  { name: 'Germany', dial: '+49', iso: 'DE' },
  { name: 'Czechia', dial: '+420', iso: 'CZ' },
  { name: 'Slovakia', dial: '+421', iso: 'SK' },
  { name: 'Romania', dial: '+40', iso: 'RO' },
  { name: 'Hungary', dial: '+36', iso: 'HU' },
  { name: 'Moldova', dial: '+373', iso: 'MD' },
  { name: 'Lithuania', dial: '+370', iso: 'LT' },
  { name: 'Latvia', dial: '+371', iso: 'LV' },
  { name: 'Estonia', dial: '+372', iso: 'EE' },
  { name: 'Georgia', dial: '+995', iso: 'GE' },
  { name: 'Armenia', dial: '+374', iso: 'AM' },
  { name: 'Azerbaijan', dial: '+994', iso: 'AZ' },
  { name: 'Turkey', dial: '+90', iso: 'TR' },
  { name: 'Spain', dial: '+34', iso: 'ES' },
  { name: 'Portugal', dial: '+351', iso: 'PT' },
  { name: 'Italy', dial: '+39', iso: 'IT' },
  { name: 'France', dial: '+33', iso: 'FR' },
  { name: 'Netherlands', dial: '+31', iso: 'NL' },
  { name: 'Belgium', dial: '+32', iso: 'BE' },
  { name: 'Austria', dial: '+43', iso: 'AT' },
  { name: 'Switzerland', dial: '+41', iso: 'CH' },
  { name: 'United Kingdom', dial: '+44', iso: 'GB' },
  { name: 'Ireland', dial: '+353', iso: 'IE' },
  { name: 'Sweden', dial: '+46', iso: 'SE' },
  { name: 'Norway', dial: '+47', iso: 'NO' },
  { name: 'Denmark', dial: '+45', iso: 'DK' },
  { name: 'Finland', dial: '+358', iso: 'FI' },
  { name: 'Greece', dial: '+30', iso: 'GR' },
  { name: 'Bulgaria', dial: '+359', iso: 'BG' },
  { name: 'Croatia', dial: '+385', iso: 'HR' },
  { name: 'Serbia', dial: '+381', iso: 'RS' },
  { name: 'Slovenia', dial: '+386', iso: 'SI' },
  { name: 'Bosnia and Herzegovina', dial: '+387', iso: 'BA' },
  { name: 'North Macedonia', dial: '+389', iso: 'MK' },
  { name: 'Albania', dial: '+355', iso: 'AL' },
  { name: 'Montenegro', dial: '+382', iso: 'ME' },
  { name: 'Cyprus', dial: '+357', iso: 'CY' },
  { name: 'Malta', dial: '+356', iso: 'MT' },
  { name: 'United States', dial: '+1', iso: 'US' },
  { name: 'Canada', dial: '+1', iso: 'CA' },
  { name: 'Mexico', dial: '+52', iso: 'MX' },
  { name: 'Brazil', dial: '+55', iso: 'BR' },
  { name: 'Argentina', dial: '+54', iso: 'AR' },
  { name: 'Colombia', dial: '+57', iso: 'CO' },
  { name: 'Chile', dial: '+56', iso: 'CL' },
  { name: 'Israel', dial: '+972', iso: 'IL' },
  { name: 'United Arab Emirates', dial: '+971', iso: 'AE' },
  { name: 'India', dial: '+91', iso: 'IN' },
  { name: 'Pakistan', dial: '+92', iso: 'PK' },
  { name: 'Bangladesh', dial: '+880', iso: 'BD' },
  { name: 'China', dial: '+86', iso: 'CN' },
  { name: 'Japan', dial: '+81', iso: 'JP' },
  { name: 'South Korea', dial: '+82', iso: 'KR' },
  { name: 'Vietnam', dial: '+84', iso: 'VN' },
  { name: 'Thailand', dial: '+66', iso: 'TH' },
  { name: 'Indonesia', dial: '+62', iso: 'ID' },
  { name: 'Philippines', dial: '+63', iso: 'PH' },
  { name: 'Malaysia', dial: '+60', iso: 'MY' },
  { name: 'Singapore', dial: '+65', iso: 'SG' },
  { name: 'Australia', dial: '+61', iso: 'AU' },
  { name: 'New Zealand', dial: '+64', iso: 'NZ' },
  { name: 'South Africa', dial: '+27', iso: 'ZA' },
  { name: 'Nigeria', dial: '+234', iso: 'NG' },
  { name: 'Kenya', dial: '+254', iso: 'KE' },
  { name: 'Egypt', dial: '+20', iso: 'EG' },
  { name: 'Morocco', dial: '+212', iso: 'MA' },
  { name: 'Tunisia', dial: '+216', iso: 'TN' },
  { name: 'Kazakhstan', dial: '+7', iso: 'KZ' },
  { name: 'Uzbekistan', dial: '+998', iso: 'UZ' },
  { name: 'Kyrgyzstan', dial: '+996', iso: 'KG' },
  { name: 'Tajikistan', dial: '+992', iso: 'TJ' },
  { name: 'Belarus', dial: '+375', iso: 'BY' },
];

const SKILL_STACKS = {
  frontend: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'Next.js', 'Svelte', 'Tailwind'],
  backend: ['Node.js', 'Express', 'Python', 'Django', 'FastAPI', 'Java', 'Spring', 'C#', '.NET', 'Go', 'PHP', 'Laravel', 'Ruby', 'Rails'],
  data: ['SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Pandas', 'Power BI', 'Tableau', 'Excel'],
  devops: ['Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Linux', 'Git', 'CI/CD', 'Terraform'],
  mobile: ['React Native', 'Flutter', 'Swift', 'Kotlin', 'Android', 'iOS'],
  design: ['Figma', 'UX', 'UI', 'Adobe XD', 'Product Design'],
  product: ['Product Management', 'Agile', 'Scrum', 'Jira', 'User Research'],
  qa: ['QA', 'Cypress', 'Playwright', 'Selenium', 'Jest', 'Manual testing'],
  ai: ['Machine Learning', 'PyTorch', 'TensorFlow', 'NLP', 'LLM'],
  business: ['Project Management', 'Customer Support', 'Sales', 'Recruiting', 'HR', 'Teaching', 'Marketing', 'Copywriting'],
};

const STARTER_SKILLS = [
  'JavaScript', 'Python', 'SQL', 'Excel', 'Figma', 'Java', 'Project Management',
  'Customer Support', 'PHP', 'Sales', 'QA', 'Teaching', 'React', 'AWS',
];

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
  [/support|sales|recruit|hr|teach|market/i, 'business'],
];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function flagEmoji(iso) {
  const code = String(iso || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return [...code].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join('');
}

function allSkills() {
  return [...new Set(Object.values(SKILL_STACKS).flat())];
}

function stackFromSkills(selected) {
  const scores = Object.entries(SKILL_STACKS).map(([key, skills]) => ([
    key,
    selected.filter((item) => skills.some((skill) => skill.toLowerCase() === item.toLowerCase())).length,
  ]));
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0]?.[1] ? scores[0][0] : '';
}

export function suggestSkills(jobTitle = '', query = '', selected = []) {
  const taken = new Set(selected.map((item) => item.toLowerCase()));
  const titleKey = TITLE_STACK.find(([pattern]) => pattern.test(jobTitle))?.[1];
  const chosenKey = stackFromSkills(selected);
  const q = query.trim().toLowerCase();
  const preferredKey = chosenKey || titleKey;
  const preferred = preferredKey ? SKILL_STACKS[preferredKey] : STARTER_SKILLS;
  const pool = selected.length || titleKey ? [...preferred, ...allSkills()] : [...STARTER_SKILLS, ...allSkills()];
  return [...new Set(pool)]
    .filter((skill) => !taken.has(skill.toLowerCase()))
    .filter((skill) => !q || skill.toLowerCase().includes(q))
    .slice(0, 10);
}

export function filterCountries(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return COUNTRIES.slice(0, 12);
  return COUNTRIES.filter((row) => row.name.toLowerCase().includes(q) || row.dial.includes(q)).slice(0, 12);
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

function withCurrentOption(options, value) {
  const current = String(value || '').trim();
  if (!current) return options;
  if (options.some((row) => String(row.value).toLowerCase() === current.toLowerCase())) return options;
  return [{ value: current, label: current }, ...options];
}

function selectField(id, value, options, placeholder) {
  const current = String(value || '').trim();
  const rows = withCurrentOption(options, current);
  const html = [`<option value="">${escapeHtml(placeholder)}</option>`].concat(rows.map((row) => {
    const selected = String(row.value).toLowerCase() === current.toLowerCase() ? ' selected' : '';
    return `<option value="${escapeHtml(row.value)}"${selected}>${escapeHtml(row.label)}</option>`;
  }));
  return `<select id="${id}">${html.join('')}</select>`;
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
  const current = COUNTRIES.find((row) => row.dial === parts.dial) || COUNTRIES[0];
  const options = COUNTRIES.map((row) => {
    const flag = flagEmoji(row.iso);
    return `<button type="button" data-dial="${escapeHtml(row.dial)}" data-iso="${escapeHtml(row.iso)}">${flag} ${escapeHtml(row.name)} ${escapeHtml(row.dial)}</button>`;
  }).join('');
  return `
    <div class="phone-row">
      <div class="combo dial-combo">
        <button type="button" class="dial-toggle" id="${id}-dial-toggle">${flagEmoji(current.iso)} ${escapeHtml(current.dial)}</button>
        <input type="hidden" id="${id}-dial" value="${escapeHtml(current.dial)}">
        <div class="combo-list" hidden>
          <input type="search" class="dial-search" placeholder="Search country" autocomplete="off">
          ${options}
        </div>
      </div>
      <input id="${id}" type="tel" inputmode="tel" value="${escapeHtml(parts.national)}" placeholder="Phone number">
    </div>
  `;
}

function skillField(id, value) {
  return `
    <div class="skill-field">
      <input id="${id}" type="text" value="${escapeHtml(value || '')}" placeholder="Choose or type a skill" autocomplete="off">
      <div class="skill-chips" data-for="${id}"></div>
    </div>
  `;
}

export function enhancedControl(field, id, value) {
  if (field === 'country_of_origin' || field === 'country_of_residence') return countryField(id, value);
  if (field === 'phone_number') return phoneField(id, value);
  if (field === 'english_level') return selectField(id, value, LANGUAGE_LEVELS, 'Select a level');
  if (field === 'gender') return selectField(id, value, GENDER_OPTIONS, 'Select gender');
  if (field === 'age') return selectField(id, value, AGE_OPTIONS, 'Select age');
  if (field === 'preferred_contact_method') return selectField(id, value, CONTACT_METHODS, 'Select a contact method');
  if (field === 'legal_status' || field === 'refugee_status' || field === 'work_permission') {
    return selectField(id, value, YES_NO_OPTIONS, 'Select an option');
  }
  if (field === 'years_of_experience' || field === 'years_of_tech_experience') {
    return selectField(id, value, EXPERIENCE_YEARS, 'Select years');
  }
  if (field === 'employment_status') return selectField(id, value, EMPLOYMENT_OPTIONS, 'Select employment status');
  if (field === 'technical_skills' || field === 'key_skills') return skillField(id, value);
  return `<input id="${id}" type="text" value="${escapeHtml(value || '')}">`;
}

export function bindEnhancedFields(root, getJobTitle) {
  if (!root) return;

  root.querySelectorAll('[data-field-kind="country"]').forEach((input) => {
    const list = input.parentElement.querySelector('.combo-list');
    const render = () => {
      const rows = filterCountries(input.value);
      list.innerHTML = rows.map((row) => {
        const flag = flagEmoji(row.iso);
        return `<button type="button" data-country="${escapeHtml(row.name)}">${flag} ${escapeHtml(row.name)}</button>`;
      }).join('');
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

  root.querySelectorAll('.dial-combo').forEach((combo) => {
    const toggle = combo.querySelector('.dial-toggle');
    const hidden = combo.querySelector('input[type="hidden"]');
    const list = combo.querySelector('.combo-list');
    const search = combo.querySelector('.dial-search');
    const filterOptions = () => {
      const query = String(search?.value || '').trim().toLowerCase();
      list.querySelectorAll('[data-dial]').forEach((button) => {
        button.hidden = Boolean(query) && !button.textContent.toLowerCase().includes(query);
      });
    };
    toggle.addEventListener('click', () => {
      list.hidden = !list.hidden;
      if (!list.hidden) {
        if (search) {
          search.value = '';
          filterOptions();
          search.focus();
        }
      }
    });
    search?.addEventListener('input', filterOptions);
    list.addEventListener('mousedown', (event) => {
      if (event.target.closest('.dial-search')) return;
      const button = event.target.closest('[data-dial]');
      if (!button) return;
      hidden.value = button.dataset.dial;
      toggle.textContent = `${flagEmoji(button.dataset.iso)} ${button.dataset.dial}`;
      list.hidden = true;
    });
    document.addEventListener('mousedown', (event) => {
      if (!combo.contains(event.target)) list.hidden = true;
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
