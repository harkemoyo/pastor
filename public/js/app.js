/**
 * Pastors LMS — Client Application Scripts
 */

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initCourseFilterTabs();
  initModuleAccordions();
  initTopicCheckboxes();
  initDemoLoginButtons();
});

// Live Nairobi / EAT Clock
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

// 1-Click Demo Login Fill
function initDemoLoginButtons() {
  const demoButtons = document.querySelectorAll('.btn-demo-pill');
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPass');
  const loginForm = document.getElementById('loginForm');

  if (!demoButtons.length || !emailInput || !passInput || !loginForm) return;

  demoButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.getAttribute('data-email');
      const pass = btn.getAttribute('data-pass');
      emailInput.value = email;
      passInput.value = pass;
      loginForm.submit();
    });
  });
}
