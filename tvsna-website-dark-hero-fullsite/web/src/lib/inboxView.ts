/*
  Shared triage list for helpRequests and contactMessages.

  Both collections previously had no reader at all — the only way to see a
  welfare request was to open the Firebase console. This gives them a queue
  with an open/handled state, so nothing sits unnoticed.
*/
import { readableError } from './adminApi';

export interface InboxConfig {
  collection: 'helpRequests' | 'contactMessages';
  mount: HTMLElement;
  statusBox: HTMLElement;
  /** Field order for the detail block; anything else is appended. */
  primary: string[];
  /** Fields never shown in the collapsed summary. */
  titleField: string;
  subtitleFields: string[];
  emptyMessage: string;
}

const HIDDEN = new Set(['submittedAt', 'status', 'assignedTo', 'notes', 'acknowledgedAt', 'adminNotified', 'notifiedAt']);

function label(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export function mountInbox(config: InboxConfig) {
  const { mount, statusBox } = config;
  let showHandled = false;

  function say(tone: 'success' | 'error' | 'info', message: string) {
    statusBox.hidden = false;
    statusBox.dataset.tone = tone;
    statusBox.textContent = message;
  }

  function entry(id: string, data: Record<string, any>) {
    const handled = data.status === 'handled';
    const el = document.createElement('details');
    el.className = `item${handled ? ' item--handled' : ''}`;
    el.dataset.id = id;

    const summary = document.createElement('summary');

    const title = document.createElement('span');
    title.className = 'item__title';
    title.textContent = String(data[config.titleField] ?? '(untitled)');
    summary.append(title);

    const sub = document.createElement('span');
    sub.className = 'item__sub';
    sub.textContent = config.subtitleFields
      .map((f) => data[f])
      .filter(Boolean)
      .map(String)
      .join(' · ');
    summary.append(sub);

    if (data.submittedAt?.toDate) {
      const when = document.createElement('time');
      when.className = 'item__when';
      when.textContent = data.submittedAt.toDate().toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      summary.append(when);
    }

    const state = document.createElement('span');
    state.className = `badge ${handled ? 'badge--ok' : 'badge--open'}`;
    state.textContent = handled ? 'Handled' : 'Open';
    summary.append(state);

    el.append(summary);

    const dl = document.createElement('dl');
    dl.className = 'item__facts';
    const keys = [...config.primary, ...Object.keys(data).filter((k) => !config.primary.includes(k))];
    for (const key of keys) {
      if (HIDDEN.has(key) || data[key] === undefined || data[key] === '') continue;
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = label(key);
      const dd = document.createElement('dd');
      dd.textContent = String(data[key]);
      wrap.append(dt, dd);
      dl.append(wrap);
    }
    el.append(dl);

    const actions = document.createElement('div');
    actions.className = 'item__actions';

    if (data.email) {
      const reply = document.createElement('a');
      reply.className = 'btn btn--ghost btn--sm';
      reply.href = `mailto:${data.email}?subject=${encodeURIComponent('Re: your message to VMSNA')}`;
      reply.textContent = 'Reply by email';
      actions.append(reply);
    }

    const toggle = document.createElement('button');
    toggle.className = 'btn btn--ghost btn--sm';
    toggle.textContent = handled ? 'Reopen' : 'Mark handled';
    toggle.addEventListener('click', () => setHandled(id, !handled));
    actions.append(toggle);

    el.append(actions);
    return el;
  }

  async function setHandled(id: string, handled: boolean) {
    try {
      const [{ db }, fs] = await Promise.all([import('./firebase'), import('firebase/firestore')]);
      const { auth } = await import('./firebase');
      await fs.updateDoc(fs.doc(db(), config.collection, id), {
        status: handled ? 'handled' : 'pending',
        assignedTo: handled ? auth().currentUser?.email ?? null : null,
        acknowledgedAt: handled ? fs.serverTimestamp() : null,
      });
      await load();
    } catch (error) {
      say('error', readableError(error));
    }
  }

  async function load() {
    say('info', 'Loading…');
    try {
      const [{ db }, fs] = await Promise.all([import('./firebase'), import('firebase/firestore')]);
      const snap = await fs.getDocs(
        fs.query(fs.collection(db(), config.collection), fs.orderBy('submittedAt', 'desc')),
      );

      const all = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, any> }));
      const open = all.filter((d) => d.data.status !== 'handled');
      const visible = showHandled ? all : open;

      mount.replaceChildren();
      if (visible.length === 0) {
        const p = document.createElement('p');
        p.className = 'inbox__empty';
        p.textContent = showHandled ? config.emptyMessage : 'Nothing open. Everything has been handled.';
        mount.append(p);
      } else {
        for (const d of visible) mount.append(entry(d.id, d.data));
      }

      statusBox.hidden = true;
      document.dispatchEvent(
        new CustomEvent('inbox:counts', { detail: { open: open.length, total: all.length } }),
      );
    } catch (error) {
      say('error', readableError(error));
    }
  }

  document.querySelector('[data-show-handled]')?.addEventListener('change', (event) => {
    showHandled = (event.target as HTMLInputElement).checked;
    load();
  });

  return { load };
}
