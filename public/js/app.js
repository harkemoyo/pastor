/**
 * Pastors LMS — Client Application Scripts
 */

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initCourseFilterTabs();
  initModuleAccordions();
  initTopicCheckboxes();
  initDemoLoginButtons();
  initLoginPortal();
  initMobileMenu();
  initAdminMenu();
});

// Accessible Login Portal Enhancements
function initLoginPortal() {
  const loginForm = document.getElementById('directLoginForm');
  const idInput = document.getElementById('loginIdentifier');
  const passInput = document.getElementById('loginPassword');
  const toggleBtn = document.getElementById('btnTogglePassword');
  const toggleIcon = document.getElementById('pwToggleIcon');
  const toggleText = document.getElementById('pwToggleText');
  const rememberBox = document.getElementById('rememberedUserBox');
  const rememberCheck = document.getElementById('rememberMeCheck');

  if (!idInput) return;

  // 1. Show/Hide Password Toggle
  if (toggleBtn && passInput) {
    toggleBtn.addEventListener('click', () => {
      const isPass = passInput.getAttribute('type') === 'password';
      passInput.setAttribute('type', isPass ? 'text' : 'password');
      if (toggleText) toggleText.textContent = isPass ? 'Hide' : 'Show';
      if (toggleIcon) toggleIcon.textContent = isPass ? '🙈' : '👁️';
    });
  }

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
            idInput.value = user.identifier;
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
        idInput.style.borderColor = '#C69214';
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
            identifier: idInput.value.trim()
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
function initClock() {
  const clockEl = document.getElementById('liveClock');
  if (!clockEl) return;

  function update() {
    const now = new Date();
    // Nairobi is UTC+3 (East Africa Time)
    const options = {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };
    const timeStr = now.toLocaleTimeString('en-US', options);
    clockEl.textContent = `${timeStr} EAT`;
  }

  update();
  setInterval(update, 1000);
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
