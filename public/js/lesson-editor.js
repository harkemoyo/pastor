(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const typeSelect = document.getElementById('lessonType');
    const settingsRow = document.getElementById('assessmentSettingsRow');
    const quizBox = document.getElementById('quizBuilderBox');
    const questionsContainer = document.getElementById('quizQuestionsContainer');
    const addBtn = document.getElementById('btnAddQuizQuestion');
    const hiddenInput = document.getElementById('quizQuestionsJson');
    const form = document.getElementById('newLessonForm');

    if (!typeSelect || !form) return;

    function toggleSections() {
      const t = typeSelect.value;
      const isGraded = ['assignment', 'journal', 'quiz', 'exam'].includes(t);
      const isQuiz = ['quiz', 'exam'].includes(t);
      if (settingsRow) settingsRow.hidden = !isGraded;
      if (quizBox) quizBox.hidden = !isQuiz;
      if (isQuiz && questionsContainer && questionsContainer.children.length === 0) {
        addQuestionRow();
      }
    }

    function addQuestionRow() {
      if (!questionsContainer) return;
      const idx = questionsContainer.children.length + 1;
      const card = document.createElement('div');
      card.className = 'quiz-builder-item';
      card.innerHTML = `
        <div class="quiz-builder-item-head">
          <strong>Question ${idx}</strong>
          <button type="button" class="btn btn-sm btn-danger btn-remove-q">Remove</button>
        </div>
        <div class="form-group">
          <label class="form-label">Question Prompt</label>
          <input type="text" class="form-input q-prompt" placeholder="Enter your biblical or pastoral question...">
        </div>
        <div class="quiz-options-grid">
          <input type="text" class="form-input q-opt-a" placeholder="Option A">
          <input type="text" class="form-input q-opt-b" placeholder="Option B">
          <input type="text" class="form-input q-opt-c" placeholder="Option C (optional)">
          <input type="text" class="form-input q-opt-d" placeholder="Option D (optional)">
        </div>
        <div class="form-group" style="margin-top: 0.75rem;">
          <label class="form-label">Correct Answer</label>
          <select class="form-input q-correct">
            <option value="a">Option A</option>
            <option value="b">Option B</option>
            <option value="c">Option C</option>
            <option value="d">Option D</option>
          </select>
        </div>
      `;
      card.querySelector('.btn-remove-q').addEventListener('click', () => card.remove());
      questionsContainer.appendChild(card);
    }

    typeSelect.addEventListener('change', toggleSections);
    if (addBtn) addBtn.addEventListener('click', addQuestionRow);

    form.addEventListener('submit', () => {
      if (!hiddenInput || !questionsContainer) return;
      const items = Array.from(questionsContainer.querySelectorAll('.quiz-builder-item')).map(card => ({
        prompt: (card.querySelector('.q-prompt')?.value || '').trim(),
        options: {
          a: (card.querySelector('.q-opt-a')?.value || '').trim(),
          b: (card.querySelector('.q-opt-b')?.value || '').trim(),
          c: (card.querySelector('.q-opt-c')?.value || '').trim(),
          d: (card.querySelector('.q-opt-d')?.value || '').trim()
        },
        correct: card.querySelector('.q-correct')?.value || 'a'
      })).filter(q => q.prompt && (q.options.a || q.options.b));
      hiddenInput.value = JSON.stringify(items);
    });

    toggleSections();
  });
})();
