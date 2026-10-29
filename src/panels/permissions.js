// Permissions: turns a permission-card answer from the webview into the `can_use_tool` control response.

const INTERRUPTED = 'Interrupted by the user';

/**
 * @typedef {{tool_name: string, input: object, permission_suggestions?: object[], tool_use_id?: string}} CanUseToolRequest
 * @typedef {{behavior: 'allow'|'deny', scope?: 'always', message?: string, answers?: Record<string, string>}} CardAnswer
 */

/**
 * @param {CanUseToolRequest} request
 * @param {CardAnswer} answer
 * @returns {object}
 */
function permissionResponse(request, answer) {
  if (answer.behavior === 'allow') {
    const response = {
      behavior: 'allow',
      updatedInput: answer.answers ? { ...request.input, answers: answer.answers } : request.input,
    };
    if (answer.scope === 'always' && Array.isArray(request.permission_suggestions) && request.permission_suggestions.length) {
      response.updatedPermissions = request.permission_suggestions;
    }
    return response;
  }
  const reason = (answer.message || '').trim();
  if (request.tool_name === 'ExitPlanMode') {
    return { behavior: 'deny', message: reason ? `המשתמש רוצה להמשיך לתכנן: ${reason}` : 'המשתמש רוצה להמשיך לתכנן.' };
  }
  return { behavior: 'deny', message: reason ? `המשתמש דחה את הבקשה: ${reason}` : 'המשתמש דחה את הבקשה.' };
}

/** @returns {object} */
function interruptedResponse() {
  return { behavior: 'deny', message: INTERRUPTED, interrupt: true };
}

module.exports = { permissionResponse, interruptedResponse, INTERRUPTED };
