/*
  Submission handling for the two unauthenticated public forms.

  Improvements on the previous implementation:
  - The request type comes from a data attribute, not the form's index in the
    DOM. Reordering the forms used to silently mislabel every submission.
  - Errors and successes are shown inline instead of in an alert() box.
  - The submit button is disabled while in flight, so a slow connection cannot
    produce duplicate records.
  - Firebase is imported dynamically, so it is only fetched when a visitor
    actually submits something.
*/

type Status = 'idle' | 'sending' | 'sent' | 'error';

function setStatus(form: HTMLFormElement, status: Status, message = '') {
  const box = form.querySelector<HTMLElement>('[data-form-status]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  if (button) {
    button.disabled = status === 'sending' || status === 'sent';
    if (status === 'sending') button.dataset.label ??= button.textContent ?? '';
    if (status === 'sending') button.textContent = 'Sending…';
    else if (button.dataset.label) button.textContent = button.dataset.label;
  }

  if (!box) return;
  box.hidden = status === 'idle';
  box.dataset.tone = status === 'error' ? 'error' : 'success';
  box.textContent = message;
}

async function submit(collectionName: string, payload: Record<string, unknown>) {
  const [{ db }, { collection, addDoc, serverTimestamp }] = await Promise.all([
    import('./firebase'),
    import('firebase/firestore'),
  ]);
  await addDoc(collection(db(), collectionName), {
    ...payload,
    submittedAt: serverTimestamp(),
  });
}

export function wireHelpForms() {
  document.querySelectorAll<HTMLFormElement>('form[data-request-type]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const data = Object.fromEntries(new FormData(form).entries());
      setStatus(form, 'sending');

      try {
        await submit('helpRequests', {
          ...data,
          requestType: form.dataset.requestType,
          status: 'pending',
        });
        setStatus(
          form,
          'sent',
          'Thank you. Your request has been received and a member of the committee will be in touch.',
        );
        form.reset();
      } catch (error) {
        console.error('Help request failed', error);
        setStatus(
          form,
          'error',
          'Sorry — that did not send. Please try again, or email info@vmsna.org directly.',
        );
      }
    });
  });
}

export function wireContactForm() {
  const form = document.querySelector<HTMLFormElement>('form[data-contact-form]');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = Object.fromEntries(new FormData(form).entries());
    setStatus(form, 'sending');

    try {
      await submit('contactMessages', { ...data, status: 'unread' });
      setStatus(form, 'sent', 'Thank you. We usually reply within 24 to 48 hours.');
      form.reset();
    } catch (error) {
      console.error('Contact message failed', error);
      setStatus(
        form,
        'error',
        'Sorry — that did not send. Please try again, or email info@vmsna.org directly.',
      );
    }
  });
}
