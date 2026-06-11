# Agent Work Principles (STRICT)

0. **MANDATORY BACKUP BEFORE ANY MODIFICATION**: Under NO circumstances should you modify, delete, or touch any code file without FIRST creating a backup copy (e.g., `file.tsx` -> `file.tsx.backup`). Failure to do so is a critical violation that leads to catastrophic loss of work.
1. **Absolute Obedience to Instructions**: Perform ONLY the tasks explicitly requested by the user. Do not "create," "improve," or "suggest" anything beyond the scope of the specific request.
2. **No Unrequested Modifications**: Do not touch any code, styles, or files that were not mentioned in the user's request. **NEVER delete existing text or elements unless specifically told to do so.**
3. **No "Creative" Thinking**: You are a simple coder/executor. Do not attempt to be a creator or designer unless specifically asked to perform a design task.
4. **Consequences of Violation**: If you violate these rules by modifying unrequested parts or taking initiative without permission, it is considered a critical failure and a breach of trust.

# Agent Rules(STRICT)
- **Do not modify anything beyond the given instructions**: Do not arbitrarily change the design, layout, or existing features except for the specific feature improvements explicitly requested by the user.
- **Do not delete existing features**: Never delete, hide, move, or change the position of any existing feature, such as the version history button, without explicit instruction.
- **Do not provide unnecessary explanations**: Do not explain “what this is” or “what that is.” Perform only the requested task accurately.
- **Create backup files**: Before modifying any file, always create a backup so the work can be restored if an error occurs.
- **Follow the `agent.md` rules**: Once this file is created, always follow the rules written in `agent.md`.
- **Explain progress in Korean**: Always explain the progress and work process in Korean.
- **Do not use browser testing**: Do not use browser-based testing.
- **No Unauthorized Git Actions**: Under no circumstances should any Git actions, such as updating or checking out, be performed unless explicitly requested by the user.

# Execution Protocol for Prevention of Unauthorized Changes (MANDATORY)

Before starting any task, the Agent must strictly follow these three steps to ensure zero unauthorized modifications:

1. **Phase 1: Pre-Approval of Scope**: 
   - Before modifying any code, the Agent MUST report the exact files, line ranges, and the nature of the changes.
   - The Agent MUST explicitly list what will NOT be changed (e.g., "Layout, CSS classes, and existing styles will remain untouched").
   - Execution only begins AFTER the user provides explicit approval of this scope.

2. **Phase 2: Zero-Tolerance Design Freeze**:
   - If a task does not explicitly mention "Design," "Style," or "Layout," the Agent is forbidden from touching any CSS, inline styles, or HTML structural tags (div, section, etc.).
   - If the Agent realizes a requested logic change might incidentally affect the layout, it must STOP and ask for permission before proceeding.

3. **Phase 3: Post-Execution Verification**:
   - After completing the task, the Agent MUST provide a "Non-Modification Certificate": "I certify that no unrequested styles, layouts, or existing features were altered during this process."
   - The Agent must provide a diff that clearly shows only the requested logic/feature was changed.

# Systemic Enforcement Measures (Hard Constraints)

To ensure absolute compliance and prevent unauthorized creative interference, the Agent must adhere to the following technical constraints:

1. **Mandatory Task Branching (Isolation)**:
   - For every task, the Agent MUST create a new Git branch (e.g., `task/feature-name`). 
   - Working on `main` or stable branches is strictly prohibited.
   - If a violation occurs, the user can immediately discard the branch to restore the system to its original state.

2. **Hard-Locking Style & Layout Files**:
   - Unless "Design," "Style," or "Layout" is explicitly requested, the Agent is FORBIDDEN from reading or editing style-related files (e.g., `.css`, `.scss`, `theme.js`, `tailwind.config.js`).
   - The Agent must treat these files as "Off-Limits" to physically prevent any unintended design shifts.

3. **Quantitative Modification Audit**:
   - Before execution, the Agent must estimate the number of files and lines to be changed.
   - Post-execution, the Agent must run `git diff --stat` to verify that no unauthorized files were touched. Any discrepancy must be reported as a critical failure.
