/**
 * Pure visual lifecycle guard for the non-economic C8/C12 QA cockpit.
 * An accepted server terminal is immutable: focus/visibility/resize events
 * (including Android share sheets) cannot undo the terminal/audit UI.
 * Identity changes and all pre-terminal interruptions remain fail-closed.
 */
const PRESENTATION_EVENTS=Object.freeze(['hidden','blur','resize']);

export function ignoreQaLifecycleAfterTerminal({reason,terminal}={}){
  return terminal===true&&PRESENTATION_EVENTS.includes(reason);
}
