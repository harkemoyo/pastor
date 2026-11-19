/**
 * Pastors LMS — Client Application Scripts
 */
(function () {
  'use strict';
  if (window.__PASTORS_LMS_APP_INITED__) return;
  window.__PASTORS_LMS_APP_INITED__ = true;

document.addEventListener('DOMContentLoaded', () => {
  const regJsonEl = document.getElementById('registeredPastorsJson');
  if (regJsonEl && !window.PASTORS_REGISTERED_USERS) {
    try {
      const rawJson = regJsonEl.getAttribute('data-json') || regJsonEl.textContent;
      window.PASTORS_REGISTERED_USERS = JSON.parse(rawJson);
    } catch (e) {}
  }

  initClock();
  initCourseFilterTabs();
  initModuleAccordions();
  initTopicCheckboxes();
  initDemoLoginButtons();
  initLoginPortal();
  initMobileMenu();
  initAdminMenu();
  initConfirmForms();
  initProgressBars();
  initAdminLiveSearch();
  initPasswordToggles();
  initOfflinePwa();
});

// Universal Password Show/Hide Toggle (works on Login, Register, Admin forms)
function initPasswordToggles() {
  document.querySelectorAll('.btn-pw-toggle').forEach(btn => {
    // Avoid binding twice if called multiple times
    if (btn.__pwToggleBound) return;
    btn.__pwToggleBound = true;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = btn.getAttribute('data-toggle-target');
      let input = targetId ? document.getElementById(targetId) : null;
      if (!input) {
        const wrap = btn.closest('.password-input-wrap, .input-wrapper, .form-group, .form-field-group');
        if (wrap) input = wrap.querySelector('input[type="password"], input[type="text"]');
      }
      if (!input) return;

      const isCurrentlyPass = input.type === 'password' || input.getAttribute('type') === 'password';
      const nextType = isCurrentlyPass ? 'text' : 'password';
      input.type = nextType;
      input.setAttribute('type', nextType);

      const textEl = btn.querySelector('.pw-toggle-text, #pwToggleText');
      const iconEl = btn.querySelector('.pw-toggle-icon, #pwToggleIcon');
      if (textEl) textEl.textContent = isCurrentlyPass ? 'Hide' : 'Show';
      if (iconEl) iconEl.textContent = isCurrentlyPass ? '🙈' : '👁️';
      btn.setAttribute('aria-label', isCurrentlyPass ? 'Hide password' : 'Show password');
    });
  });
}

// Accessible Login Portal Enhancements
function initLoginPortal() {
  const loginForm = document.getElementById('directLoginForm');
  const idInput = document.getElementById('loginIdentifier');
  const passInput = document.getElementById('loginPassword');
  const rememberBox = document.getElementById('rememberedUserBox');
  const rememberCheck = document.getElementById('rememberMeCheck');

  if (!idInput) return;

  // 2. Remembered Account from LocalStorage
  try {
    const saved = localStorage.getItem('pastors_remembered_account');
    if (saved && rememberBox) {
      const user = JSON.parse(saved);
      if (user && user.name && user.identifier) {
        const nameEl = document.getElementById('rememberedName');
        const shortEl = document.getElementById('rememberedShortName');
        const avatarEl = document.getElementById('rememberedAvatar');
        const useBtn = document.getElementById('btnUseRemembered');
        const clearBtn = document.getElementById('btnClearRemembered');

        if (nameEl) nameEl.textContent = user.name;
        if (shortEl) shortEl.textContent = user.name.split(' ')[0] || 'Pastor';
        if (avatarEl) {
          const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
          avatarEl.textContent = initials || 'P';
        }

        rememberBox.style.display = 'flex';

        if (useBtn) {
          useBtn.addEventListener('click', () => {
            idInput.value = String(user.identifier).trim().replace(/^@+/, '');
            passInput.focus();
            idInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        }

        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            localStorage.removeItem('pastors_remembered_account');
            rememberBox.style.display = 'none';
          });
        }
      }
    }
  } catch (err) {
    console.warn('LocalStorage error:', err);
  }

  // 3. Registered Pastor Quick Pills
  const pastorPills = document.querySelectorAll('.pastor-pill-btn');
  pastorPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const identifier = pill.getAttribute('data-identifier');
      const name = pill.getAttribute('data-name');
      const isDemo = pill.getAttribute('data-isdemo') === 'true';

      if (identifier) {
        idInput.value = identifier;
        idInput.style.borderColor = '#670C21';
        setTimeout(() => {
          idInput.style.borderColor = '';
        }, 1500);

        if (isDemo && passInput) {
          passInput.value = 'demo1234';
        }

        if (passInput) {
          passInput.focus();
        }

        // Store selected name for friendly display
        if (name && rememberCheck && rememberCheck.checked) {
          try {
            localStorage.setItem('pastors_remembered_account', JSON.stringify({
              name: name,
              identifier: identifier
            }));
          } catch (e) {}
        }
      }
    });
  });

  // 4. Instant Demo 1-Click
  const demoInstantBtn = document.getElementById('btnDemoInstant');
  if (demoInstantBtn && loginForm) {
    demoInstantBtn.addEventListener('click', () => {
      idInput.value = 'p1001234';
      passInput.value = 'demo1234';
      loginForm.submit();
    });
  }

  // 5. Save on Successful Submit
  if (loginForm) {
    loginForm.addEventListener('submit', () => {
      if (rememberCheck && rememberCheck.checked && idInput.value) {
        try {
          const currentSaved = localStorage.getItem('pastors_remembered_account');
          let nameToSave = 'Pastor';
          if (currentSaved) {
            const parsed = JSON.parse(currentSaved);
            if (parsed.identifier === idInput.value) {
              nameToSave = parsed.name;
            }
          }
          localStorage.setItem('pastors_remembered_account', JSON.stringify({
            name: nameToSave,
            identifier: idInput.value.trim().replace(/^@+/, '')
          }));
        } catch (e) {}
      }
    });
  }
}

// 1-Click Demo Login Fill (Legacy / Fallback support)
function initDemoLoginButtons() {
  const demoButtons = document.querySelectorAll('.btn-demo-pill');
  const idInput = document.getElementById('loginIdentifier') || document.getElementById('loginEmail') || document.getElementById('loginUsername');
  const passInput = document.getElementById('loginPassword') || document.getElementById('loginPass');
  const loginForm = document.getElementById('directLoginForm') || document.getElementById('loginForm');

  if (!demoButtons.length || !idInput || !passInput || !loginForm) return;

  demoButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.getAttribute('data-email');
      const pass = btn.getAttribute('data-pass');
      if (email && pass) {
        idInput.value = email;
        passInput.value = pass;
        loginForm.submit();
      }
    });
  });
}
// Country detection from the browser's timezone (no network or permission needed)
const TIMEZONE_COUNTRIES = {
  'Africa/Kampala': 'UG',
  'Africa/Nairobi': 'KE',
  'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Kigali': 'RW',
  'Africa/Bujumbura': 'BI',
  'Africa/Juba': 'SS',
  'Africa/Addis_Ababa': 'ET',
  'Africa/Mogadishu': 'SO',
  'Africa/Lusaka': 'ZM',
  'Africa/Harare': 'ZW',
  'Africa/Johannesburg': 'ZA',
  'Africa/Lagos': 'NG',
  'Africa/Accra': 'GH',
  'Africa/Kinshasa': 'CD',
  'Africa/Lubumbashi': 'CD',
  'Africa/Maputo': 'MZ',
  'Africa/Blantyre': 'MW',
  'Africa/Cairo': 'EG',
  'Europe/London': 'GB',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US'
};
const EAST_AFRICA_ZONES = ['Africa/Kampala', 'Africa/Nairobi', 'Africa/Dar_es_Salaam', 'Africa/Kigali', 'Africa/Bujumbura', 'Africa/Juba', 'Africa/Addis_Ababa', 'Africa/Mogadishu'];

const COUNTRY_TO_ZONE = {
  KE: 'Africa/Nairobi',
  UG: 'Africa/Kampala',
  TZ: 'Africa/Dar_es_Salaam',
  RW: 'Africa/Kigali',
  BI: 'Africa/Bujumbura',
  SS: 'Africa/Juba',
  ET: 'Africa/Addis_Ababa',
  SO: 'Africa/Mogadishu',
  CD: 'Africa/Kinshasa',
  NG: 'Africa/Lagos',
  GH: 'Africa/Accra',
  ZA: 'Africa/Johannesburg',
  ZM: 'Africa/Lusaka',
  ZW: 'Africa/Harare',
  MW: 'Africa/Blantyre',
  MZ: 'Africa/Maputo',
  EG: 'Africa/Cairo',
  GB: 'Europe/London',
  US: 'America/New_York'
};

const NAME_TO_COUNTRY_CODE = {
  kenya: 'KE',
  uganda: 'UG',
  tanzania: 'TZ',
  rwanda: 'RW',
  burundi: 'BI',
  'south sudan': 'SS',
  'dr congo': 'CD',
  ethiopia: 'ET',
  somalia: 'SO',
  nigeria: 'NG',
  ghana: 'GH',
  'south africa': 'ZA',
  zambia: 'ZM',
  zimbabwe: 'ZW',
  malawi: 'MW',
  mozambique: 'MZ'
};

function buildFlagElement(code, className) {
  const upper = (code || 'KE').toUpperCase();
  const lower = upper.toLowerCase();
  const img = document.createElement('img');
  img.src = `https://flagcdn.com/w40/${lower}.png`;
  img.srcset = `https://flagcdn.com/w80/${lower}.png 2x`;
  img.alt = `${upper} flag`;
  if (className) img.className = className;
  return img;
}

function inferCountryFromInput(value) {
  if (!value) return null;
  const clean = String(value).trim();
  const lower = clean.toLowerCase();
  if (NAME_TO_COUNTRY_CODE[lower]) return NAME_TO_COUNTRY_CODE[lower];

  if (Array.isArray(window.PASTORS_REGISTERED_USERS)) {
    const digitsInput = clean.replace(/\D/g, '');
    const normInput = (digitsInput.startsWith('254') && digitsInput.length === 12) ? '0' + digitsInput.slice(3) : digitsInput;
    const matched = window.PASTORS_REGISTERED_USERS.find(u => {
      if (u.username && u.username.toLowerCase() === lower) return true;
      if (u.email && u.email.toLowerCase() === lower) return true;
      if (normInput && u.phone) {
        const uDigits = String(u.phone).replace(/\D/g, '');
        const uNorm = (uDigits.startsWith('254') && uDigits.length === 12) ? '0' + uDigits.slice(3) : uDigits;
        if (uNorm === normInput) return true;
      }
      return false;
    });
    if (matched && matched.country_code) return matched.country_code.toUpperCase();
  }

  const digits = clean.replace(/\D/g, '');
  if (clean.startsWith('+') || digits.length >= 11) {
    const prefixes = [
      ['254', 'KE'], ['256', 'UG'], ['255', 'TZ'], ['250', 'RW'],
      ['257', 'BI'], ['211', 'SS'], ['251', 'ET'], ['243', 'CD'],
      ['252', 'SO'], ['234', 'NG'], ['233', 'GH'], ['260', 'ZM'],
      ['263', 'ZW'], ['265', 'MW'], ['258', 'MZ'], ['27', 'ZA']
    ];
    for (const [pref, c] of prefixes) {
      if (digits.startsWith(pref)) return c;
    }
  }
  return null;
}

function detectCountry() {
  const wrapEl = document.getElementById('navClock');
  const serverUserCountry = wrapEl ? (wrapEl.getAttribute('data-user-country') || '').trim().toUpperCase() : '';

  if (serverUserCountry && /^[A-Z]{2}$/.test(serverUserCountry)) {
    try {
      localStorage.setItem('pastors_registered_country', serverUserCountry);
    } catch (e) {}
    return {
      code: serverUserCountry,
      zone: COUNTRY_TO_ZONE[serverUserCountry] || 'Africa/Nairobi'
    };
  }

  try {
    const savedCountry = (localStorage.getItem('pastors_registered_country') || '').trim().toUpperCase();
    if (savedCountry && /^[A-Z]{2}$/.test(savedCountry)) {
      return {
        code: savedCountry,
        zone: COUNTRY_TO_ZONE[savedCountry] || 'Africa/Nairobi'
      };
    }
  } catch (e) {}

  let zone = 'Africa/Nairobi';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || zone;
  } catch (e) {}

  let code = TIMEZONE_COUNTRIES[zone];
  if (!code) {
    const region = (navigator.language || '').split('-')[1];
    if (region && /^[A-Za-z]{2}$/.test(region)) code = region.toUpperCase();
  }
  return { zone, code: code || 'KE' };
}

function applyCountryFlagUI(code, zoneOverride) {
  const upper = (code || 'KE').toUpperCase();
  const zone = zoneOverride || COUNTRY_TO_ZONE[upper] || 'Africa/Nairobi';
  const flagEl = document.getElementById('navFlag');
  const wrapEl = document.getElementById('navClock');

  let countryName = upper;
  try {
    countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(upper) || upper;
  } catch (e) {}

  if (flagEl) {
    flagEl.innerHTML = '';
    flagEl.appendChild(buildFlagElement(upper));
    flagEl.setAttribute('aria-label', countryName);
    if (wrapEl) wrapEl.setAttribute('title', `${countryName} (${zone.replace('_', ' ')})`);
  }

  const cohortBadge = document.getElementById('cohortBadge');
  if (cohortBadge) {
    let regionName = countryName || 'East Africa';
    if (upper === 'UG') regionName = 'Uganda';
    else if (upper === 'KE') regionName = 'Kenya';
    else if (upper === 'TZ') regionName = 'Tanzania';
    else if (upper === 'RW') regionName = 'Rwanda';
    cohortBadge.innerHTML = '';
    cohortBadge.appendChild(buildFlagElement(upper, 'cohort-flag-icon'));
    cohortBadge.appendChild(document.createTextNode(`${regionName} Pastoral Cohort • AY2027`));
  }
}

function initClock() {
  const clockEl = document.getElementById('liveClock');
  if (!clockEl) return;

  let current = detectCountry();
  applyCountryFlagUI(current.code, current.zone);

  // Update flag live when selecting country or typing phone on /register or /login
  const regCountrySelect = document.getElementById('registerCountry');
  if (regCountrySelect) {
    const updateFromSelect = () => {
      const c = inferCountryFromInput(regCountrySelect.value);
      if (c) {
        current = { code: c, zone: COUNTRY_TO_ZONE[c] || current.zone };
        try { localStorage.setItem('pastors_registered_country', c); } catch (e) {}
        applyCountryFlagUI(current.code, current.zone);
      }
    };
    regCountrySelect.addEventListener('change', updateFromSelect);
  }

  const phoneOrLoginInputs = [
    document.getElementById('phone'),
    document.getElementById('loginIdentifier')
  ].filter(Boolean);

  phoneOrLoginInputs.forEach(inp => {
    inp.addEventListener('input', () => {
      const c = inferCountryFromInput(inp.value);
      if (c) {
        current = { code: c, zone: COUNTRY_TO_ZONE[c] || current.zone };
        try { localStorage.setItem('pastors_registered_country', c); } catch (e) {}
        applyCountryFlagUI(current.code, current.zone);
      }
    });
  });

  function update() {
    const zone = current.zone || 'Africa/Nairobi';
    const label = EAST_AFRICA_ZONES.includes(zone) ? 'EAT' : '';
    try {
      const timeStr = new Date().toLocaleTimeString('en-US', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      clockEl.textContent = label ? `${timeStr} ${label}` : timeStr;
    } catch (e) {
      clockEl.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) + ' EAT';
    }
  }

  update();
  setInterval(update, 1000);
}

// Live client-side instant search for Admin Student table
function initAdminLiveSearch() {
  const input = document.getElementById('adminStudentSearch');
  const table = document.getElementById('adminStudentsTable');
  if (!input || !table) return;

  input.addEventListener('input', () => {
    const term = input.value.trim().toLowerCase();
    const rows = table.querySelectorAll('tbody tr.student-row');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = (!term || text.includes(term)) ? '' : 'none';
    });
  });
}

// Ask before submitting any form marked with data-confirm (e.g. removing a library item)
function initConfirmForms() {
  document.querySelectorAll('form[data-confirm]').forEach(form => {
    form.addEventListener('submit', e => {
      if (!window.confirm(form.getAttribute('data-confirm'))) {
        e.preventDefault();
      }
    });
  });
}

// Progress bars render their width from data-percent (keeps styles out of the markup)
function initProgressBars() {
  document.querySelectorAll('.progress-bar[data-percent]').forEach(bar => {
    bar.style.width = `${bar.getAttribute('data-percent')}%`;
  });
}

// Course Filter Tabs on Dashboard
function initCourseFilterTabs() {
  const tabButtons = document.querySelectorAll('.course-tab-btn');
  const courseCards = document.querySelectorAll('.course-card');

  if (!tabButtons.length || !courseCards.length) return;

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');

      courseCards.forEach(card => {
        const status = card.getAttribute('data-status');
        if (filter === 'all' || status === filter) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

// Module Accordion Toggle
function initModuleAccordions() {
  const headers = document.querySelectorAll('.module-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.module-card');
      const topics = card.querySelector('.module-topics');
      if (!topics) return;

      const isExpanded = card.classList.contains('expanded');
      if (isExpanded) {
        card.classList.remove('expanded');
        topics.style.display = 'none';
      } else {
        card.classList.add('expanded');
        topics.style.display = 'block';
      }
    });
  });
}

// Interactive Topic Completion
function initTopicCheckboxes() {
  const checkButtons = document.querySelectorAll('.btn-topic-check');

  checkButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const topicItem = btn.closest('.topic-item');
      const card = btn.closest('.module-card');
      const courseId = btn.getAttribute('data-course-id');
      const moduleId = btn.getAttribute('data-module-id');

      const isCompleted = topicItem.classList.contains('completed');
      const direction = isCompleted ? 'dec' : 'inc';

      try {
        const response = await fetch(`/courses/${courseId}/modules/${moduleId}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction })
        });

        const res = await response.json();
        if (res.success) {
          if (isCompleted) {
            topicItem.classList.remove('completed');
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg> Mark Complete`;
          } else {
            topicItem.classList.add('completed');
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Completed`;
          }

          // Update module progress text & bar
          const modProgressText = card.querySelector('.module-progress-text');
          if (modProgressText) {
            modProgressText.innerHTML = `<strong>${res.completedTopics}</strong> of ${res.totalTopics} topics (${res.modulePercent}%)`;
          }
          const modBar = card.querySelector('.progress-bar');
          if (modBar) {
            modBar.style.width = `${res.modulePercent}%`;
          }

          // Update course-wide stats header if on course detail page
          const overallPctVal = document.getElementById('courseOverallPct');
          if (overallPctVal) {
            overallPctVal.textContent = `${res.coursePercent}%`;
          }
          const overallBar = document.getElementById('courseOverallBar');
          if (overallBar) {
            overallBar.style.width = `${res.coursePercent}%`;
          }
          const completedTopicsVal = document.getElementById('courseCompletedTopicsVal');
          if (completedTopicsVal) {
            completedTopicsVal.textContent = `${res.courseCompletedTopics} / ${res.courseTotalTopics}`;
          }
        }
      } catch (err) {
        console.error('Failed to toggle topic progress:', err);
      }
    });
  });
}


// Mobile Menu Toggle
function initMobileMenu() {
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const navLinks = document.getElementById('navLinks');

  if (!mobileToggle || !navLinks) return;

  mobileToggle.addEventListener('click', () => {
    const isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
    mobileToggle.setAttribute('aria-expanded', !isExpanded);
    navLinks.classList.toggle('active');
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!mobileToggle.contains(e.target) && !navLinks.contains(e.target)) {
      mobileToggle.setAttribute('aria-expanded', 'false');
      navLinks.classList.remove('active');
    }
  });

  // Close menu on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      mobileToggle.setAttribute('aria-expanded', 'false');
      navLinks.classList.remove('active');
    }
  });
}

// Admin Menu Dropdown
function initAdminMenu() {
  const adminToggle = document.getElementById('adminMenuToggle');
  const adminDropdown = document.getElementById('adminDropdown');

  if (!adminToggle || !adminDropdown) return;

  adminToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = adminToggle.getAttribute('aria-expanded') === 'true';
    adminToggle.setAttribute('aria-expanded', !isExpanded);
    adminDropdown.classList.toggle('active');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!adminToggle.contains(e.target) && !adminDropdown.contains(e.target)) {
      adminToggle.setAttribute('aria-expanded', 'false');
      adminDropdown.classList.remove('active');
    }
  });

  // Close dropdown on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      adminToggle.setAttribute('aria-expanded', 'false');
      adminDropdown.classList.remove('active');
    }
  });
}

// PWA Service Worker, Offline Status Banner & Logout Cache Clearing (shared-phone safety)
function initOfflinePwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  const banner = document.getElementById('offlineNoticeBanner');
  function syncOnlineState() {
    if (!banner) return;
    banner.hidden = navigator.onLine;
  }
  window.addEventListener('online', syncOnlineState);
  window.addEventListener('offline', syncOnlineState);
  syncOnlineState();

  // Clear cached lesson pages when logging out so shared phones never leak another pastor's data
  document.querySelectorAll('a[href="/logout"]').forEach(link => {
    link.addEventListener('click', () => {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHES' });
      }
      if ('caches' in window) {
        caches.delete('pastors-lms-lessons-v1').catch(() => {});
      }
    });
  });
}
})();
