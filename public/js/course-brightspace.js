/**
 * Pastors LMS — Brightspace / UoPeople Course Interactive Engine
 * Handles split-screen syllabus navigation, dynamic lesson loading,
 * search filtering, self-quizzes, assignment submissions, and progress tracking.
 */

document.addEventListener('DOMContentLoaded', () => {
  initBrightspaceTabs();
  initBrightspaceTree();
  initBrightspaceSearch();
  initBrightspaceToolbar();
  initBrightspaceTopicFooter();
  initBrightspaceInteractiveForms();
});

// State
let currentModuleIndex = 1;
let currentTopicIndex = 0;
let currentModuleId = null;
let currentTopicId = null;

/**
 * 1. Secondary Navigation Tabs (Home vs Content)
 */
function initBrightspaceTabs() {
  const tabHome = document.getElementById('tabNavHome');
  const tabContent = document.getElementById('tabNavContent');
  const viewHome = document.getElementById('viewHome');
  const viewContent = document.getElementById('viewContent');
  const btnGoContent = document.getElementById('btnGoToContentFromHome');

  if (!tabHome || !tabContent) return;

  function showTab(tabName) {
    if (tabName === 'home') {
      tabHome.classList.add('active');
      tabContent.classList.remove('active');
      if (viewHome) viewHome.style.display = 'block';
      if (viewContent) viewContent.style.display = 'none';
    } else {
      tabContent.classList.add('active');
      tabHome.classList.remove('active');
      if (viewContent) viewContent.style.display = 'flex';
      if (viewHome) viewHome.style.display = 'none';
    }
  }

  tabHome.addEventListener('click', () => showTab('home'));
  tabContent.addEventListener('click', () => showTab('content'));
  if (btnGoContent) {
    btnGoContent.addEventListener('click', () => showTab('content'));
  }
}

/**
 * 2. Tree Navigation & Topic Selection
 */
function initBrightspaceTree() {
  const unitNodes = document.querySelectorAll('.bp-unit-node');
  const topicItems = document.querySelectorAll('.bp-topic-item');

  // Accordion Unit Headers
  unitNodes.forEach(node => {
    const header = node.querySelector('.bp-unit-header');
    const sublist = node.querySelector('.bp-topic-sublist');

    if (header && sublist) {
      header.addEventListener('click', (e) => {
        // Toggle this node
        const isExpanded = node.classList.contains('expanded');
        if (isExpanded) {
          node.classList.remove('expanded');
          sublist.style.display = 'none';
        } else {
          node.classList.add('expanded');
          sublist.style.display = 'flex';
        }
      });
    }
  });

  // Topic Item Click
  topicItems.forEach(item => {
    item.addEventListener('click', () => {
      const topicId = item.getAttribute('data-topic-id');
      const moduleId = item.getAttribute('data-module-id');
      loadTopic(moduleId, topicId, item);
    });
  });

  // Load first selected topic if available
  const initialSelected = document.querySelector('.bp-topic-item.selected');
  if (initialSelected) {
    const topicId = initialSelected.getAttribute('data-topic-id');
    const moduleId = initialSelected.getAttribute('data-module-id');
    loadTopic(moduleId, topicId, initialSelected);
  }
}

/**
 * Load and display topic content in the right pane
 */
function loadTopic(moduleId, topicId, topicElement) {
  currentModuleId = moduleId;
  currentTopicId = topicId;

  // 1. Highlight in sidebar
  document.querySelectorAll('.bp-topic-item').forEach(el => el.classList.remove('selected'));
  if (topicElement) {
    topicElement.classList.add('selected');
    const parentUnit = topicElement.closest('.bp-unit-node');
    if (parentUnit) {
      document.querySelectorAll('.bp-unit-node').forEach(u => u.classList.remove('active-unit'));
      parentUnit.classList.add('active-unit');
    }
  }

  // 2. Fetch data from embedded course object
  const course = window.PASTORS_LMS_COURSE;
  if (!course || !course.modulesWithTopics) return;

  const targetMod = course.modulesWithTopics.find(m => String(m.id) === String(moduleId));
  if (!targetMod) return;

  const targetTopic = (targetMod.topics || []).find(t => String(t.id) === String(topicId));
  if (!targetTopic) return;

  // 3. Update Breadcrumb
  const unitBreadcrumb = document.getElementById('toolbarUnitTitle');
  const topicBreadcrumb = document.getElementById('toolbarTopicTitle');
  if (unitBreadcrumb) unitBreadcrumb.textContent = targetMod.title;
  if (topicBreadcrumb) topicBreadcrumb.textContent = targetTopic.title;

  // 4. Update Amber Banner Badge
  const bannerBadge = document.getElementById('bannerBadgeTitle');
  if (bannerBadge) {
    bannerBadge.textContent = targetTopic.bannerTitle || targetTopic.title;
  }

  // 5. Update Lesson Body Content
  const bodyContainer = document.getElementById('topicBodyContent');
  if (bodyContainer) {
    bodyContainer.innerHTML = targetTopic.contentHtml;
    // Re-attach listeners for interactive quizzes and submission forms
    initBrightspaceInteractiveForms();
  }

  // 6. Update "Mark Complete" Button Status
  const isComplete = topicElement ? topicElement.classList.contains('completed') : false;
  updateMarkCompleteBtnState(isComplete);

  // Scroll to top of lesson body smoothly
  const mainPane = document.querySelector('.bp-main-pane');
  if (mainPane) {
    mainPane.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/**
 * 3. Search Titles & Descriptions Filter
 */
function initBrightspaceSearch() {
  const searchInput = document.getElementById('unitSearchInput');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const unitNodes = document.querySelectorAll('.bp-unit-node');

    unitNodes.forEach(unit => {
      const unitTitle = (unit.querySelector('.bp-unit-title')?.textContent || '').toLowerCase();
      const topicItems = unit.querySelectorAll('.bp-topic-item');
      let unitHasMatch = unitTitle.includes(q);

      topicItems.forEach(topic => {
        const topicTitle = (topic.querySelector('.bp-topic-label')?.textContent || '').toLowerCase();
        if (topicTitle.includes(q) || unitHasMatch || q === '') {
          topic.style.display = 'flex';
          unitHasMatch = true;
        } else {
          topic.style.display = 'none';
        }
      });

      if (unitHasMatch || q === '') {
        unit.style.display = 'block';
        if (q !== '') {
          unit.classList.add('expanded');
          const sublist = unit.querySelector('.bp-topic-sublist');
          if (sublist) sublist.style.display = 'flex';
        }
      } else {
        unit.style.display = 'none';
      }
    });
  });
}

/**
 * 4. Top Toolbar (Prev/Next, Download, Fullscreen, Popout)
 */
function initBrightspaceToolbar() {
  const btnPrev = document.getElementById('btnPrevTopic');
  const btnNext = document.getElementById('btnNextTopic');
  const btnDownload = document.getElementById('btnDownloadTopic');
  const btnPopout = document.getElementById('btnPopoutTopic');
  const btnFullscreen = document.getElementById('btnFullscreenTopic');

  function navigateTopic(direction) {
    const allTopics = Array.from(document.querySelectorAll('.bp-topic-item:not([style*="display: none"])'));
    if (!allTopics.length) return;

    const currentIndex = allTopics.findIndex(t => t.classList.contains('selected'));
    let targetIndex = currentIndex + direction;

    if (targetIndex >= 0 && targetIndex < allTopics.length) {
      const targetEl = allTopics[targetIndex];
      const targetModId = targetEl.getAttribute('data-module-id');
      const targetTopicId = targetEl.getAttribute('data-topic-id');
      loadTopic(targetModId, targetTopicId, targetEl);
    }
  }

  if (btnPrev) btnPrev.addEventListener('click', () => navigateTopic(-1));
  if (btnNext) btnNext.addEventListener('click', () => navigateTopic(1));

  // Download printable study notes
  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      const bannerTitle = document.getElementById('bannerBadgeTitle')?.textContent || 'Lesson';
      alert(`Downloading Pastoral Study Guide & Scriptures for: "${bannerTitle}" (Offline PDF format)`);
    });
  }

  // Popout reading view
  if (btnPopout) {
    btnPopout.addEventListener('click', () => {
      window.open(window.location.href, '_blank', 'width=1000,height=700');
    });
  }

  // Fullscreen reading mode
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.log(err));
      } else {
        document.exitFullscreen().catch(err => console.log(err));
      }
    });
  }
}

/**
 * 5. Topic Footer Navigation & Interactive Mark Complete
 */
function initBrightspaceTopicFooter() {
  const footerBtnPrev = document.getElementById('footerBtnPrev');
  const footerBtnNext = document.getElementById('footerBtnNext');
  const btnComplete = document.getElementById('btnMarkTopicComplete');

  if (footerBtnPrev) {
    footerBtnPrev.addEventListener('click', () => {
      const btnPrev = document.getElementById('btnPrevTopic');
      if (btnPrev) btnPrev.click();
    });
  }

  if (footerBtnNext) {
    footerBtnNext.addEventListener('click', () => {
      const btnNext = document.getElementById('btnNextTopic');
      if (btnNext) btnNext.click();
    });
  }

  if (btnComplete) {
    btnComplete.addEventListener('click', async () => {
      const selectedItem = document.querySelector('.bp-topic-item.selected');
      if (!selectedItem || !currentModuleId) return;

      const isCompleted = selectedItem.classList.contains('completed');
      const direction = isCompleted ? 'dec' : 'inc';
      const courseId = btnComplete.getAttribute('data-course-id') || '1';

      // Toggle UI State
      if (isCompleted) {
        selectedItem.classList.remove('completed');
        const checkIcon = selectedItem.querySelector('.bp-done-check');
        if (checkIcon) checkIcon.remove();
        updateMarkCompleteBtnState(false);
      } else {
        selectedItem.classList.add('completed');
        if (!selectedItem.querySelector('.bp-done-check')) {
          const checkSpan = document.createElement('span');
          checkSpan.className = 'bp-done-check';
          checkSpan.title = 'Completed';
          checkSpan.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          `;
          selectedItem.appendChild(checkSpan);
        }
        updateMarkCompleteBtnState(true);
      }

      // Update Unit Completed count
      const parentUnit = selectedItem.closest('.bp-unit-node');
      if (parentUnit) {
        const completedCount = parentUnit.querySelectorAll('.bp-topic-item.completed').length;
        const totalCount = parentUnit.querySelectorAll('.bp-topic-item').length;
        const progressEl = parentUnit.querySelector('.bp-unit-progress-text');
        if (progressEl) {
          progressEl.textContent = `${completedCount}/${totalCount} Completed`;
        }
      }

      // Sync to Server
      try {
        await fetch(`/courses/${courseId}/modules/${currentModuleId}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction })
        });
      } catch (err) {
        console.warn('Could not sync completion to server:', err);
      }
    });
  }
}

function updateMarkCompleteBtnState(isCompleted) {
  const btn = document.getElementById('btnMarkTopicComplete');
  const label = document.getElementById('markCompleteBtnLabel');
  if (!btn || !label) return;

  if (isCompleted) {
    btn.classList.add('is-completed');
    btn.classList.remove('btn-gold');
    label.textContent = 'Completed ✓';
  } else {
    btn.classList.remove('is-completed');
    btn.classList.add('btn-gold');
    label.textContent = 'Mark as Completed';
  }
}

/**
 * 6. Interactive Quizzes & Assignment Submissions inside Content Body
 */
function initBrightspaceInteractiveForms() {
  // Assignment Submission
  const submitAssignmentBtn = document.getElementById('btnSubmitAssignment');
  if (submitAssignmentBtn) {
    submitAssignmentBtn.addEventListener('click', () => {
      const textarea = document.getElementById('assignmentInput');
      const successMsg = document.getElementById('assignmentSuccessMsg');
      if (textarea && textarea.value.trim().length < 10) {
        alert('Please write your pastoral reflection before submitting.');
        textarea.focus();
        return;
      }

      if (successMsg) {
        successMsg.style.display = 'block';
        submitAssignmentBtn.textContent = 'Submitted ✓';
        submitAssignmentBtn.disabled = true;

        // Auto mark topic completed
        const completeBtn = document.getElementById('btnMarkTopicComplete');
        if (completeBtn && !completeBtn.classList.contains('is-completed')) {
          completeBtn.click();
        }
      }
    });
  }

  // Unit Self-Quiz Checking
  const submitQuizBtn = document.getElementById('btnSubmitQuiz');
  if (submitQuizBtn) {
    submitQuizBtn.addEventListener('click', () => {
      const questionCards = document.querySelectorAll('.quiz-question-card');
      let score = 0;
      let total = questionCards.length;

      questionCards.forEach(card => {
        const qNum = card.getAttribute('data-q');
        const correctVal = card.getAttribute('data-correct');
        const selectedRadio = card.querySelector(`input[name="q${qNum}"]:checked`);
        const feedbackEl = document.getElementById(`feedback-q${qNum}`);

        if (!selectedRadio) {
          if (feedbackEl) {
            feedbackEl.className = 'quiz-feedback incorrect';
            feedbackEl.textContent = '⚠️ Please select an answer.';
          }
          return;
        }

        if (selectedRadio.value === correctVal) {
          score++;
          if (feedbackEl) {
            feedbackEl.className = 'quiz-feedback correct';
            feedbackEl.textContent = '✓ Correct! Sound theological answer.';
          }
        } else {
          if (feedbackEl) {
            feedbackEl.className = 'quiz-feedback incorrect';
            feedbackEl.textContent = `✗ Not quite. The correct answer was (${correctVal.toUpperCase()}).`;
          }
        }
      });

      const scoreDisplay = document.getElementById('quizScoreDisplay');
      if (scoreDisplay) {
        scoreDisplay.style.display = 'inline-block';
        const percent = Math.round((score / total) * 100);
        scoreDisplay.textContent = `Your Score: ${score}/${total} (${percent}%)`;
      }

      // Auto mark topic complete if passed
      if (score >= 3) {
        const completeBtn = document.getElementById('btnMarkTopicComplete');
        if (completeBtn && !completeBtn.classList.contains('is-completed')) {
          completeBtn.click();
        }
      }
    });
  }
}

/**
 * Filter topics by type (invoked from top activities submenu)
 */
function selectTopicByType(type) {
  const firstMatch = document.querySelector(`.bp-topic-item[data-topic-type="${type}"]`);
  if (firstMatch) {
    const topicId = firstMatch.getAttribute('data-topic-id');
    const moduleId = firstMatch.getAttribute('data-module-id');
    loadTopic(moduleId, topicId, firstMatch);
    
    // Switch to content tab if on home
    const tabContent = document.getElementById('tabNavContent');
    if (tabContent) tabContent.click();
  } else {
    alert(`No ${type} activities found in this current unit.`);
  }
}
