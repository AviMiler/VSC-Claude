/**
 * Turns a failed CLI process into the Hebrew error the conversation shows.
 */

/**
 * @param {{code:number|null, stderr:string, spawnError:Error|null}} info from ClaudeProcess `exit`
 * @returns {string}
 * @example describeFailure({ code: 1, stderr: 'error: unknown option', spawnError: null })
 */
function describeFailure({ code, stderr, spawnError }) {
  if (spawnError) return `לא ניתן להפעיל את Claude (${spawnError.message}). בדוק את ההגדרה claudeLocal.claudePath.`;
  if (/unknown option|error: option/i.test(stderr)) return `גרסת Claude Code לא מכירה אחד הדגלים שהתוסף שלח.\n${stderr}`;
  return `Claude נסגר עם קוד ${code}.${stderr ? `\n${stderr}` : ''}`;
}

module.exports = { describeFailure };
