/**
 * The onboarding checklist shown in an empty chat; dismissed with ✕ (remembered by the host) or hidden by
 * `hideOnboarding`.
 */
import { el } from './thread.js';

const STEPS = ['פתחו קובץ ושאלו עליו', 'סמנו קוד ולחצו Alt+K', 'נסו מצב תכנון', 'פתחו שיחה קודמת'];

/**
 * @param {HTMLElement} root
 * @param {{dismiss:()=>void}} actions
 */
export function createOnboarding(root, actions) {
  const box = el('section', 'onboarding');
  const head = el('div', 'onboarding-head');
  head.append(el('strong', '', 'צעדים ראשונים עם Claude'));
  const close = el('button', 'link-button', '✕');
  close.type = 'button';
  close.title = 'הסתרה';
  close.addEventListener('click', () => {
    box.hidden = true;
    actions.dismiss();
  });
  head.append(close);
  const list = el('ul');
  STEPS.forEach(step => list.append(el('li', '', step)));
  box.append(head, list);
  root.append(box);
  box.hidden = true;

  return {
    /** @param {{hideOnboarding?:boolean, onboardingDismissed?:boolean}} settings @param {boolean} threadEmpty */
    update(settings, threadEmpty) {
      box.hidden = Boolean(settings.hideOnboarding || settings.onboardingDismissed || !threadEmpty);
    },
  };
}
